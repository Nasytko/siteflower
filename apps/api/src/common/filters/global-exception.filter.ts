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
import { Prisma } from '@bouquet-one/database';
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
      } else if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string' || Array.isArray(record.message)) {
          message = record.message as string | string[];
        }
        if (typeof record.error === 'string') {
          errorName = record.error;
        }
        if (record.issues !== undefined) {
          issues = record.issues;
        }
        if (typeof record.code === 'string') {
          code = record.code;
        }
      }
    } else if (
      exception &&
      typeof exception === 'object' &&
      'code' in exception &&
      (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      status = HttpStatus.BAD_REQUEST;
      errorName = 'Bad Request';
      message = 'Файл слишком большой';
      code = 'MEDIA_TOO_LARGE';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
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

function mapPrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): {
  status: number;
  error: string;
  message: string;
  issues?: unknown;
  code?: string;
} {
  const meta = exception.meta as { constraint?: string; field_name?: string; target?: string[] } | undefined;
  const constraint = String(meta?.constraint ?? meta?.field_name ?? meta?.target?.join(',') ?? '');

  if (
    (exception.code === 'P2004' || exception.code === 'P2010') &&
    (constraint.includes('product_promotions_type_fields') ||
      constraint.includes('product_promotions_percent_off_range') ||
      constraint.includes('percent_off'))
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
