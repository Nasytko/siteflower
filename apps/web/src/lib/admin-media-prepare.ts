/**
 * Client-side image preparation before multipart upload.
 * UX/performance only — API Sharp pipeline remains the security boundary.
 */

import {
  ADMIN_MEDIA_ACCEPT,
  ADMIN_MEDIA_MAX_DIMENSION,
  ADMIN_MEDIA_MAX_INPUT_BYTES,
  ADMIN_MEDIA_PREPARE_JPEG_QUALITY,
  ADMIN_MEDIA_PREPARE_TARGET_BYTES,
  formatMediaBytes,
} from './admin-media-preflight';

export type AdminMediaPrepareResult = {
  ok: boolean;
  /** File to upload (prepared or original fallback). */
  file: File;
  name: string;
  originalSizeBytes: number;
  preparedSizeBytes: number;
  originalWidth: number | null;
  originalHeight: number | null;
  preparedWidth: number | null;
  preparedHeight: number | null;
  prepared: boolean;
  summary: string | null;
  error: string | null;
};

function fitInside(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    // Prefer EXIF-aware decode so portrait phone photos keep correct orientation.
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      return await createImageBitmap(file);
    }
  } catch {
    return null;
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * Downscale (never upscale) and/or re-encode oversized photos so Multer/Sharp
 * receive a safe working file. On failure returns the original file (ok:true)
 * so the API can validate — except when the hard byte limit is exceeded.
 */
export async function prepareAdminMediaFile(file: File): Promise<AdminMediaPrepareResult> {
  const name = file.name || 'файл';
  const originalSizeBytes = file.size;

  if (!ADMIN_MEDIA_ACCEPT.includes(file.type as (typeof ADMIN_MEDIA_ACCEPT)[number])) {
    return {
      ok: false,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth: null,
      originalHeight: null,
      preparedWidth: null,
      preparedHeight: null,
      prepared: false,
      summary: null,
      error: `Неподдерживаемый тип (${file.type || 'unknown'}). Нужны JPG, PNG, WebP или AVIF.`,
    };
  }

  if (originalSizeBytes <= 0) {
    return {
      ok: false,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth: null,
      originalHeight: null,
      preparedWidth: null,
      preparedHeight: null,
      prepared: false,
      summary: null,
      error: 'Пустой файл.',
    };
  }

  if (originalSizeBytes > ADMIN_MEDIA_MAX_INPUT_BYTES) {
    return {
      ok: false,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth: null,
      originalHeight: null,
      preparedWidth: null,
      preparedHeight: null,
      prepared: false,
      summary: null,
      error: `Файл слишком большой. Максимальный размер исходного изображения — ${formatMediaBytes(ADMIN_MEDIA_MAX_INPUT_BYTES)}.`,
    };
  }

  const bitmap = await loadBitmap(file);
  if (!bitmap) {
    // Browser cannot decode — send original; server decides.
    return {
      ok: true,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth: null,
      originalHeight: null,
      preparedWidth: null,
      preparedHeight: null,
      prepared: false,
      summary: null,
      error: null,
    };
  }

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const needsResize =
    originalWidth > ADMIN_MEDIA_MAX_DIMENSION || originalHeight > ADMIN_MEDIA_MAX_DIMENSION;
  const needsCompress = originalSizeBytes > ADMIN_MEDIA_PREPARE_TARGET_BYTES;

  if (!needsResize && !needsCompress) {
    bitmap.close();
    return {
      ok: true,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth,
      originalHeight,
      preparedWidth: originalWidth,
      preparedHeight: originalHeight,
      prepared: false,
      summary: null,
      error: null,
    };
  }

  const target = fitInside(originalWidth, originalHeight, ADMIN_MEDIA_MAX_DIMENSION);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return {
      ok: true,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth,
      originalHeight,
      preparedWidth: originalWidth,
      preparedHeight: originalHeight,
      prepared: false,
      summary: null,
      error: null,
    };
  }

  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();

  let quality = ADMIN_MEDIA_PREPARE_JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);
  // Soft second pass if still huge (phone photos with lots of detail).
  if (blob && blob.size > ADMIN_MEDIA_PREPARE_TARGET_BYTES && quality > 0.72) {
    quality = 0.78;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  // Release canvas backing store where possible.
  canvas.width = 0;
  canvas.height = 0;

  if (!blob || blob.size <= 0) {
    return {
      ok: true,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth,
      originalHeight,
      preparedWidth: originalWidth,
      preparedHeight: originalHeight,
      prepared: false,
      summary: null,
      error: null,
    };
  }

  // Prefer original when preparation did not shrink bytes and no resize was required.
  if (!needsResize && blob.size >= originalSizeBytes) {
    return {
      ok: true,
      file,
      name,
      originalSizeBytes,
      preparedSizeBytes: originalSizeBytes,
      originalWidth,
      originalHeight,
      preparedWidth: originalWidth,
      preparedHeight: originalHeight,
      prepared: false,
      summary: null,
      error: null,
    };
  }

  const baseName = name.replace(/\.[^.]+$/, '') || 'photo';
  const preparedFile = new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  const summary = [
    `${formatMediaBytes(originalSizeBytes)} → ${formatMediaBytes(preparedFile.size)}`,
    `${originalWidth}×${originalHeight} → ${target.width}×${target.height}`,
  ].join(' · ');

  return {
    ok: true,
    file: preparedFile,
    name,
    originalSizeBytes,
    preparedSizeBytes: preparedFile.size,
    originalWidth,
    originalHeight,
    preparedWidth: target.width,
    preparedHeight: target.height,
    prepared: true,
    summary,
    error: null,
  };
}

/** Pure helper exported for unit tests (no DOM). */
export function fitAdminMediaDimensions(
  width: number,
  height: number,
  maxEdge: number = ADMIN_MEDIA_MAX_DIMENSION,
): { width: number; height: number } {
  return fitInside(width, height, maxEdge);
}
