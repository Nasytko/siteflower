/**
 * Client-side media preflight before multipart upload.
 * Server Sharp pipeline remains the source of truth.
 *
 * Hard input limit mirrors API MEDIA_MAX_BYTES / MEDIA_UPLOAD_MAX_INPUT_BYTES (25 MB).
 * Oversized dimensions are prepared client-side — not rejected here.
 */

/** Absolute max original file size (bytes). Keep in sync with API MEDIA_MAX_BYTES default. */
export const ADMIN_MEDIA_MAX_INPUT_BYTES = 25_000_000;

/** @deprecated Use ADMIN_MEDIA_MAX_INPUT_BYTES */
export const ADMIN_MEDIA_MAX_BYTES = ADMIN_MEDIA_MAX_INPUT_BYTES;

export const ADMIN_MEDIA_MAX_PER_PRODUCT = 12;

/** Mirrors server MEDIA_MAX_DIMENSION working max (client prepare target). */
export const ADMIN_MEDIA_MAX_DIMENSION = 6000;

/** Soft target after client prepare — prefer smaller uploads when safe. */
export const ADMIN_MEDIA_PREPARE_TARGET_BYTES = 8_000_000;

export const ADMIN_MEDIA_PREPARE_JPEG_QUALITY = 0.86;

export const ADMIN_MEDIA_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export type MediaPreflightStatus =
  | 'selected'
  | 'preparing'
  | 'prepared'
  | 'uploading'
  | 'uploaded'
  | 'error'
  /** @deprecated kept for transitional UI */
  | 'checking'
  | 'ready'
  | 'processing'
  | 'optimizing'
  | 'done';

export type MediaPreflightResult = {
  file: File;
  name: string;
  sizeBytes: number;
  ok: boolean;
  error: string | null;
};

export function formatMediaBytes(bytes: number): string {
  // Decimal MB/KB for manager-facing copy (25_000_000 → «25 МБ»).
  const mb = bytes / 1_000_000;
  if (mb < 1) {
    return `${Math.max(1, Math.round(bytes / 1000))} КБ`;
  }
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} МБ`;
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
  if (sizeBytes > ADMIN_MEDIA_MAX_INPUT_BYTES) {
    return {
      file,
      name,
      sizeBytes,
      ok: false,
      error: `Файл слишком большой. Максимальный размер исходного изображения — ${formatMediaBytes(ADMIN_MEDIA_MAX_INPUT_BYTES)}.`,
    };
  }
  // Dimensions are handled by prepareAdminMediaFile — do not reject here.
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
    case 'selected':
      return 'Выбрано';
    case 'preparing':
      return 'Подготавливаем…';
    case 'prepared':
      return 'Подготовлено';
    case 'uploading':
      return 'Загружаем…';
    case 'uploaded':
    case 'done':
      return 'Фото добавлено ✓';
    case 'checking':
      return 'Проверка…';
    case 'ready':
      return 'Готово к загрузке';
    case 'processing':
      return 'Обработка…';
    case 'optimizing':
      return 'Оптимизация…';
    case 'error':
      return 'Ошибка';
    default:
      return status;
  }
}
