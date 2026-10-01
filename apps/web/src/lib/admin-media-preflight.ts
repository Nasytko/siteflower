/**
 * Client-side media preflight before multipart upload.
 * Server Sharp pipeline remains the source of truth.
 */

export const ADMIN_MEDIA_MAX_BYTES = 8_000_000;
export const ADMIN_MEDIA_MAX_PER_PRODUCT = 12;
/** Mirrors server MEDIA_MAX_DIMENSION (input reject gate, not master size). */
export const ADMIN_MEDIA_MAX_DIMENSION = 6000;
export const ADMIN_MEDIA_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export type MediaPreflightStatus =
  | 'checking'
  | 'ready'
  | 'uploading'
  | 'processing'
  | 'optimizing'
  | 'done'
  | 'error';

export type MediaPreflightResult = {
  file: File;
  name: string;
  sizeBytes: number;
  ok: boolean;
  error: string | null;
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function probeDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    }
  } catch {
    // Browser decode failed — server will validate.
  }
  return null;
}

export async function preflightMediaFile(file: File): Promise<MediaPreflightResult> {
  const name = file.name || 'файл';
  const sizeBytes = file.size;
  if (!ADMIN_MEDIA_ACCEPT.includes(file.type as (typeof ADMIN_MEDIA_ACCEPT)[number])) {
    return {
      file,
      name,
      sizeBytes,
      ok: false,
      error: `Неподдерживаемый тип (${file.type || 'unknown'}). Нужны JPG, PNG, WebP или AVIF.`,
    };
  }
  if (sizeBytes <= 0) {
    return { file, name, sizeBytes, ok: false, error: 'Пустой файл.' };
  }
  if (sizeBytes > ADMIN_MEDIA_MAX_BYTES) {
    return {
      file,
      name,
      sizeBytes,
      ok: false,
      error: `Размер ${formatMb(sizeBytes)} превышает лимит 8 MB.`,
    };
  }

  const dims = await probeDimensions(file);
  if (
    dims &&
    (dims.width > ADMIN_MEDIA_MAX_DIMENSION || dims.height > ADMIN_MEDIA_MAX_DIMENSION)
  ) {
    return {
      file,
      name,
      sizeBytes,
      ok: false,
      error: `Разрешение ${dims.width}×${dims.height} слишком большое (макс. ${ADMIN_MEDIA_MAX_DIMENSION} px по стороне).`,
    };
  }

  return { file, name, sizeBytes, ok: true, error: null };
}

export async function preflightMediaBatch(
  files: FileList | File[],
  currentGalleryCount: number,
): Promise<{
  accepted: MediaPreflightResult[];
  rejected: MediaPreflightResult[];
  capacityError: string | null;
}> {
  const list = Array.from(files);
  const remaining = Math.max(0, ADMIN_MEDIA_MAX_PER_PRODUCT - currentGalleryCount);
  if (remaining <= 0) {
    return {
      accepted: [],
      rejected: list.map((file) => ({
        file,
        name: file.name,
        sizeBytes: file.size,
        ok: false,
        error: 'Галерея уже заполнена (максимум 12 фото).',
      })),
      capacityError: 'Галерея уже заполнена (максимум 12 фото).',
    };
  }

  const checked = await Promise.all(list.map((file) => preflightMediaFile(file)));
  const valid = checked.filter((row) => row.ok);
  const rejected = checked.filter((row) => !row.ok);

  let capacityError: string | null = null;
  const accepted = valid.slice(0, remaining);
  if (valid.length > remaining) {
    capacityError = `Можно добавить ещё ${remaining} фото. Лишние файлы пропущены.`;
    for (const row of valid.slice(remaining)) {
      rejected.push({
        ...row,
        ok: false,
        error: `Превышен лимит галереи (осталось слотов: ${remaining}).`,
      });
    }
  }

  return { accepted, rejected, capacityError };
}

export function mediaPreflightStatusLabel(status: MediaPreflightStatus): string {
  switch (status) {
    case 'checking':
      return 'Проверка…';
    case 'ready':
      return 'Готово к загрузке';
    case 'uploading':
      return 'Загрузка…';
    case 'processing':
      return 'Обработка…';
    case 'optimizing':
      return 'Оптимизация…';
    case 'done':
      return 'Готово ✓';
    case 'error':
      return 'Ошибка';
    default:
      return status;
  }
}
