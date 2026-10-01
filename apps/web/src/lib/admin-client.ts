/**
 * Browser-side admin requests. Cookie session auth + Origin/SameSite CSRF pattern:
 * always `credentials: 'include'`, never a bearer token in JS.
 */

import type { PublishValidationIssue } from '@bouquet-one/contracts';

export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: PublishValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

function readMessage(body: unknown, status: number): string {
  if (status === 409) {
    return 'Данные изменены другим пользователем. Обновите страницу и сохраните снова.';
  }
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  if (status === 403) return 'Недостаточно прав для этого действия.';
  return `Не удалось выполнить запрос (${status})`;
}

function readIssues(body: unknown): PublishValidationIssue[] {
  if (body && typeof body === 'object' && Array.isArray((body as { issues?: unknown }).issues)) {
    return (body as { issues: PublishValidationIssue[] }).issues;
  }
  return [];
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      origin: window.location.origin,
      ...(init.headers ?? {}),
    },
  });

  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const issues = readIssues(body);
    const base = readMessage(body, response.status);
    const message = issues.length
      ? `${base}: ${issues.map((issue) => issue.message).join('; ')}`
      : base;
    throw new AdminRequestError(message, response.status, issues);
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
