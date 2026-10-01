import { HttpStatus } from '@nestjs/common';
import { MEDIA_ERROR_CODES, mediaHttpException, mediaMessageForCode } from './media-errors';

describe('media-errors', () => {
  it('builds BadRequest with code and Russian message', () => {
    const err = mediaHttpException(MEDIA_ERROR_CODES.IMAGE_DECODE_FAILED);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    const body = err.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('IMAGE_DECODE_FAILED');
    expect(body.message).toMatch(/повреждён|прочитать/i);
  });

  it('builds 503 for storage failures', () => {
    const err = mediaHttpException(MEDIA_ERROR_CODES.STORAGE_FAILED, HttpStatus.SERVICE_UNAVAILABLE);
    expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    const body = err.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('STORAGE_FAILED');
  });

  it('maps known codes to messages', () => {
    expect(mediaMessageForCode('MEDIA_TOO_LARGE', 'x')).toMatch(/большой/i);
    expect(mediaMessageForCode('UNKNOWN', 'fallback')).toBe('fallback');
  });
});
