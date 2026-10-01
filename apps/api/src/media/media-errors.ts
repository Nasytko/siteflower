import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export const MEDIA_ERROR_CODES = {
  MEDIA_TOO_LARGE: 'MEDIA_TOO_LARGE',
  MEDIA_UNSUPPORTED: 'MEDIA_UNSUPPORTED',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  IMAGE_DIMENSIONS_TOO_LARGE: 'IMAGE_DIMENSIONS_TOO_LARGE',
  IMAGE_PROCESSING_FAILED: 'IMAGE_PROCESSING_FAILED',
  STORAGE_FAILED: 'STORAGE_FAILED',
  FILE_REQUIRED: 'FILE_REQUIRED',
} as const;

export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[keyof typeof MEDIA_ERROR_CODES];

const MEDIA_MESSAGES: Record<MediaErrorCode, string> = {
  MEDIA_TOO_LARGE: 'Файл слишком большой',
  MEDIA_UNSUPPORTED: 'Поддерживаются JPG, PNG, WebP и AVIF',
  IMAGE_DECODE_FAILED: 'Не удалось прочитать изображение. Возможно, файл повреждён.',
  IMAGE_DIMENSIONS_TOO_LARGE: 'Изображение имеет слишком большое разрешение',
  IMAGE_PROCESSING_FAILED: 'Не удалось обработать изображение',
  STORAGE_FAILED: 'Не удалось сохранить изображение. Попробуйте ещё раз.',
  FILE_REQUIRED: 'Файл не передан. Выберите изображение и попробуйте снова.',
};

export function mediaHttpException(
  code: MediaErrorCode,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
  messageOverride?: string,
): HttpException {
  const message = messageOverride ?? MEDIA_MESSAGES[code];
  const body = {
    statusCode: status,
    error: status === HttpStatus.BAD_REQUEST ? 'Bad Request' : HttpStatus[status] ?? 'Error',
    message,
    code,
  };
  if (status === HttpStatus.BAD_REQUEST) {
    return new BadRequestException(body);
  }
  return new HttpException(body, status);
}

export function mediaMessageForCode(code: string | undefined, fallback: string): string {
  if (code && code in MEDIA_MESSAGES) {
    return MEDIA_MESSAGES[code as MediaErrorCode];
  }
  return fallback;
}
