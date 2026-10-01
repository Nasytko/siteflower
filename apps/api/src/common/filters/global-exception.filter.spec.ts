import { ArgumentsHost, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import type { AppConfigService } from '../../config/app-config.service';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = {
    url: '/api/v1/admin/catalog/products/x/media',
    requestId: 'req-test-1',
    header: () => undefined,
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter media multer mapping', () => {
  const filter = new GlobalExceptionFilter({
    isProduction: true,
  } as AppConfigService);

  it('maps Nest PayloadTooLargeException("File too large") to MEDIA_TOO_LARGE', () => {
    const { host, status, json } = mockHost();
    filter.catch(new PayloadTooLargeException('File too large'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'MEDIA_TOO_LARGE',
        message: 'Файл слишком большой',
        requestId: 'req-test-1',
      }),
    );
  });

  it('maps raw Multer LIMIT_FILE_SIZE to MEDIA_TOO_LARGE', () => {
    const { host, status, json } = mockHost();
    filter.catch({ code: 'LIMIT_FILE_SIZE', message: 'File too large' }, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MEDIA_TOO_LARGE' }),
    );
  });

  it('maps Multer 2.x LIMIT_UNEXPECTED_FILE to FILE_REQUIRED instead of 500', () => {
    const { host, status, json } = mockHost();
    filter.catch(
      { code: 'LIMIT_UNEXPECTED_FILE', message: 'Unexpected file field', field: 'photo' },
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FILE_REQUIRED' }),
    );
  });

  it('treats null/undefined throws as opaque 500 without TS/runtime crashes', () => {
    for (const value of [null, undefined] as const) {
      const { host, status, json } = mockHost();
      expect(() => filter.catch(value, host)).not.toThrow();
      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }),
      );
      const body = json.mock.calls[0]?.[0] as { code?: string };
      expect(body.code).toBeUndefined();
    }
  });

  it('does not treat non-object or wrong-code values as Multer limit errors', () => {
    const { host, status, json } = mockHost();
    filter.catch('LIMIT_FILE_SIZE', host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ code: 'MEDIA_TOO_LARGE' }),
    );

    const again = mockHost();
    filter.catch({ code: 123 }, again.host);
    expect(again.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('maps duck-typed Prisma unique conflicts without Prisma namespace runtime access', () => {
    const { host, status, json } = mockHost();
    const err = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['slug'] },
    });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNIQUE_CONFLICT' }),
    );
  });
});
