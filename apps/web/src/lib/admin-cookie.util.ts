import { ADMIN_SESSION_COOKIE } from '@bouquet-one/contracts';

/** Forward only the admin session cookie to Nest — never the full browser cookie jar. */
export function buildAdminCookieHeader(
  entries: Array<{ name: string; value: string }>,
): string | undefined {
  const session = entries.find((entry) => entry.name === ADMIN_SESSION_COOKIE);
  if (!session?.value) return undefined;
  return `${ADMIN_SESSION_COOKIE}=${session.value}`;
}
