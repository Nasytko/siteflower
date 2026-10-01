import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { REQUEST_ID_HEADER, getRequestId } from '../middleware/request-id.middleware';
import { sanitizeSensitiveUrl } from '../sanitize-sensitive-url.util';

type ErrorBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  issues?: unknown;
  code?: string;
  requestId?: string;
  path: string;
  timestamp: string;
};

/** Duck-typed Prisma known-request error — avoids runtime `Prisma.*` (CJS bridge has no value export). */
type PrismaKnownRequestErrorLike = Error & {
  code: string;
  meta?: { constraint?: string; field_name?: string; target?: string[] };
};

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly appConfig: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = getRequestId(request) ?? request.header(REQUEST_ID_HEADER) ?? undefined;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorName = HttpStatus[status] ?? 'Error';
    let issues: unknown;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorName = HttpStatus[status] ?? 'Error';
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (isPlainObject(payload)) {
        if (typeof payload.message === 'string' || Array.isArray(payload.message)) {
          message = payload.message as string | string[];
        }
        if (typeof payload.error === 'string') {
          errorName = payload.error;
        }
        if (payload.issues !== undefined) {
          issues = payload.issues;
        }
        if (typeof payload.code === 'string') {
          code = payload.code;
        }
      }
      // Nest converts Multer LIMIT_FILE_SIZE → PayloadTooLargeException("File too large")
      // before this filter sees the raw MulterError; normalize to the media contract.
      if (
        !code &&
        (status === HttpStatus.PAYLOAD_TOO_LARGE ||
          message === 'File too large' ||
          (Array.isArray(message) && message.includes('File too large')))
      ) {
        status = HttpStatus.BAD_REQUEST;
        errorName = 'Bad Request';
        message = 'Файл слишком большой';
        code = 'MEDIA_TOO_LARGE';
      }
    } else if (isMulterLimitError(exception, 'LIMIT_FILE_SIZE')) {
      status = HttpStatus.BAD_REQUEST;
      errorName = 'Bad Request';
      message = 'Файл слишком большой';
      code = 'MEDIA_TOO_LARGE';
    } else if (isMulterLimitError(exception, 'LIMIT_UNEXPECTED_FILE')) {
      // Multer 2.x message is "Unexpected file field"; Nest still matches the old
      // "Unexpected field" string, so this can arrive as a raw MulterError.
      status = HttpStatus.BAD_REQUEST;
      errorName = 'Bad Request';
      message = 'Файл не передан. Выберите изображение и попробуйте снова.';
      code = 'FILE_REQUIRED';
    } else if (isPrismaKnownRequestError(exception)) {
      const mapped = mapPrismaKnownError(exception);
      status = mapped.status;
      errorName = mapped.error;
      message = mapped.message;
      issues = mapped.issues;
      code = mapped.code;
    } else if (!this.appConfig.isProduction && exception instanceof Error) {
      message = exception.message;
    }

    const safePath = sanitizeSensitiveUrl(request.url) ?? request.url;

    const body: ErrorBody = {
      statusCode: status,
      error: errorName,
      message,
      ...(issues !== undefined ? { issues } : {}),
      ...(code !== undefined ? { code } : {}),
      requestId,
      path: safePath,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(
      {
        err: exception instanceof Error ? exception : undefined,
        requestId,
        statusCode: status,
        path: safePath,
        ...(code ? { code } : {}),
      },
      'Request failed',
    );

    response.status(status).json(body);
  }
}

/**
 * Narrow unknown thrown values before property access.
 * Note: `typeof null === 'object'`, so null must be excluded before `in` / field reads
 * (strict TS: TS18047 on `'code' in exception` when null is still possible).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMulterLimitError(exception: unknown, expectedCode: string): boolean {
  if (!isPlainObject(exception)) {
    return false;
  }
  return typeof exception.code === 'string' && exception.code === expectedCode;
}

function isPrismaKnownRequestError(exception: unknown): exception is PrismaKnownRequestErrorLike {
  if (!(exception instanceof Error) || !isPlainObject(exception)) {
    return false;
  }
  return typeof exception.code === 'string' && /^P\d{4}$/.test(exception.code);
}

function mapPrismaKnownError(exception: PrismaKnownRequestErrorLike): {
  status: number;
  error: string;
  message: string;
  issues?: unknown;
  code?: string;
} {
  const meta = exception.meta;
  const constraint = String(meta?.constraint ?? meta?.field_name ?? meta?.target?.join(',') ?? '');

  if (
    (exception.code === 'P2004' || exception.code === 'P2010') &&
    (constraint.includes('product_promotions_type_fields') ||
      constraint.includes('product_promotions_percent_off_range'))
  ) {
    return {
      status: HttpStatus.BAD_REQUEST,
      error: 'PromotionValidationError',
      message: 'Акцию нельзя сохранить: проверьте параметры',
      issues: [
        {
          code: 'INVALID_PERCENT',
          message: 'Процент скидки должен быть от 1 до 99',
          field: 'percentOff',
        },
      ],
      code: 'PROMOTION_INVALID',
    };
  }

  if (exception.code === 'P2002') {
    return {
      status: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'Конфликт уникальности данных. Обновите страницу и попробуйте снова.',
      code: 'UNIQUE_CONFLICT',
    };
  }

  // Unknown Prisma errors stay as opaque 500 in production (caller logs full err).
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  };
}
