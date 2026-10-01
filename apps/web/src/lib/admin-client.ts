/**
 * Browser-side admin requests. Cookie session auth + Origin/SameSite CSRF pattern:
 * always `credentials: 'include'`, never a bearer token in JS.
 */

import type { ApiErrorIssue, PublishValidationIssue } from '@bouquet-one/contracts';

export type AdminErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'unknown';

export type AdminFieldError = {
  field: string;
  message: string;
  code?: string;
};

export class AdminRequestError extends Error {
  readonly kind: AdminErrorKind;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly fieldErrors: AdminFieldError[];
  readonly retryable: boolean;
  readonly issues: PublishValidationIssue[];

  constructor(
    message: string,
    readonly status: number,
    options: {
      kind?: AdminErrorKind;
      code?: string;
      requestId?: string;
      issues?: PublishValidationIssue[];
      fieldErrors?: AdminFieldError[];
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'AdminRequestError';
    this.kind = options.kind ?? kindFromStatus(status);
    this.code = options.code;
    this.requestId = options.requestId;
    this.issues = options.issues ?? [];
    this.fieldErrors =
      options.fieldErrors ??
      this.issues
        .filter((issue): issue is PublishValidationIssue & { field: string } => Boolean(issue.field))
        .map((issue) => ({ field: issue.field, message: issue.message, code: issue.code }));
    this.retryable = options.retryable ?? (this.kind === 'server' || this.kind === 'network');
  }
}

export function kindFromStatus(status: number): AdminErrorKind {
  if (status === 0) return 'network';
  if (status === 400 || status === 413 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

const OCC_MESSAGE =
  'Данные изменены другим пользователем. Обновите страницу и сохраните снова.';

export function defaultMessageForKind(kind: AdminErrorKind, status: number): string {
  switch (kind) {
    case 'validation':
      return 'Проверьте данные.';
    case 'unauthorized':
      return 'Сессия завершилась. Войдите снова.';
    case 'forbidden':
      return 'У вас нет прав для выполнения этого действия.';
    case 'not_found':
      return 'Объект больше не существует.';
    case 'conflict':
      return OCC_MESSAGE;
    case 'rate_limit':
      return 'Слишком много запросов. Подождите немного и попробуйте снова.';
    case 'server':
      return 'Не удалось сохранить изменения. Произошла внутренняя ошибка сервера.';
    case 'network':
      return 'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.';
    default:
      return `Не удалось выполнить запрос (${status})`;
  }
}

function readIssues(body: unknown): PublishValidationIssue[] {
  if (body && typeof body === 'object' && Array.isArray((body as { issues?: unknown }).issues)) {
    return (body as { issues: PublishValidationIssue[] }).issues;
  }
  return [];
}

function readRequestId(body: unknown, response?: Response | null): string | undefined {
  if (body && typeof body === 'object' && typeof (body as { requestId?: unknown }).requestId === 'string') {
    return (body as { requestId: string }).requestId;
  }
  return response?.headers.get('x-request-id') ?? undefined;
}

function readCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string') {
    return (body as { code: string }).code;
  }
  return undefined;
}

function readBodyMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join(', ');
  }
  return undefined;
}

export function buildAdminRequestError(
  status: number,
  body: unknown,
  response?: Response | null,
  networkError = false,
): AdminRequestError {
  if (networkError || status === 0) {
    return new AdminRequestError(defaultMessageForKind('network', 0), 0, {
      kind: 'network',
      retryable: true,
    });
  }

  const kind = kindFromStatus(status);
  const issues = readIssues(body);
  const code = readCode(body) ?? issues[0]?.code;
  const requestId = readRequestId(body, response);
  const bodyMessage = readBodyMessage(body);

  let message = defaultMessageForKind(kind, status);
  if (kind === 'conflict') {
    // Prefer API reason for non-OCC conflicts (slug/unique/business); OCC responses
    // already send OCC_CONFLICT_MESSAGE which matches OCC_MESSAGE.
    message = bodyMessage ?? OCC_MESSAGE;
  } else if (kind === 'validation' && issues.length > 0) {
    message = `${defaultMessageForKind('validation', status)} ${issues.map((i) => i.message).join('; ')}`;
  } else if (bodyMessage && kind !== 'server') {
    // Prefer API message for validation/business 4xx; keep generic for 5xx.
    message = issues.length
      ? `${bodyMessage}: ${issues.map((i) => i.message).join('; ')}`
      : bodyMessage;
  } else if (kind === 'server' && requestId) {
    message = `${defaultMessageForKind('server', status)} Код запроса: ${requestId}`;
  }

  return new AdminRequestError(message, status, {
    kind,
    code,
    requestId,
    issues,
    retryable: kind === 'server' || kind === 'network' || kind === 'rate_limit',
  });
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: 'no-store',
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        origin: window.location.origin,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw buildAdminRequestError(0, null, null, true);
  }

  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw buildAdminRequestError(response.status, body, response);
  }

  return body as T;
}

export function adminGet<T>(path: string): Promise<T> {
  return adminRequest<T>(path);
}

export function adminPost<T>(path: string, body?: unknown): Promise<T> {
  return adminRequest<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function adminPatch<T>(path: string, body: unknown): Promise<T> {
  return adminRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function adminPut<T>(path: string, body: unknown): Promise<T> {
  return adminRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function adminDelete<T>(path: string, body?: unknown): Promise<T> {
  return adminRequest<T>(path, {
    method: 'DELETE',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function adminUpload<T>(path: string, form: FormData): Promise<T> {
  return adminRequest<T>(path, { method: 'POST', body: form });
}

export function errorMessage(error: unknown, fallback = 'Ошибка'): string {
  if (error instanceof AdminRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function fieldErrorMap(error: unknown): Record<string, string> {
  if (!(error instanceof AdminRequestError)) return {};
  const map: Record<string, string> = {};
  for (const issue of error.fieldErrors) {
    if (!map[issue.field]) map[issue.field] = issue.message;
  }
  return map;
}

/** Map API media `code` to a short Russian reason for per-file UI. */
export function mediaErrorUserText(error: unknown, fallback = 'Не удалось загрузить файл'): string {
  if (!(error instanceof AdminRequestError)) return errorMessage(error, fallback);
  switch (error.code) {
    case 'MEDIA_TOO_LARGE':
      return 'Файл слишком большой. Максимальный размер исходного изображения — 25 МБ.';
    case 'MEDIA_UNSUPPORTED':
      return 'Формат не поддерживается. Используйте JPG, PNG, WebP или AVIF.';
    case 'IMAGE_DECODE_FAILED':
      return 'Не удалось прочитать изображение. Возможно, файл повреждён.';
    case 'IMAGE_DIMENSIONS_TOO_LARGE':
      return 'Изображение имеет слишком большое разрешение.';
    case 'IMAGE_PROCESSING_FAILED':
      return 'Не удалось обработать изображение.';
    case 'STORAGE_FAILED':
      return 'Не удалось сохранить изображение. Попробуйте ещё раз.';
    default:
      return error.message || fallback;
  }
}

export type { ApiErrorIssue };
