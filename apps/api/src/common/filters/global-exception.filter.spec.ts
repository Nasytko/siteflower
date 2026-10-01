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
});
