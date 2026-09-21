import type { AuthMeResponse, ApiErrorBody } from '@bouquet-one/contracts';
import { cookies, headers } from 'next/headers';

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

function getApiBase(): string {
  // Prefer same-origin rewrite when running in the browser or via middleware origin.
  if (typeof window !== 'undefined') {
    return '';
  }
  return process.env.API_URL ?? 'http://127.0.0.1:3001';
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      origin: headerStore.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    const message =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `Request failed (${response.status})`;
    throw new AdminApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchAdminMe(): Promise<AuthMeResponse | null> {
  try {
    return await adminFetch<AuthMeResponse>('/api/v1/admin/auth/me');
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}
