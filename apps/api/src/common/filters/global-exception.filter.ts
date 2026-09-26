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
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let errorName = HttpStatus[status] ?? 'Error';
    let issues: unknown;

    if (isHttp) {
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
      }
    } else if (!this.appConfig.isProduction && exception instanceof Error) {
      message = exception.message;
    }

    const safePath = sanitizeSensitiveUrl(request.url) ?? request.url;

    const body: ErrorBody = {
      statusCode: status,
      error: errorName,
      message,
      ...(issues !== undefined ? { issues } : {}),
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
      },
      'Request failed',
    );

    response.status(status).json(body);
  }
}
