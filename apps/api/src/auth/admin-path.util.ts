/**
 * Admin API namespace prefix after Nest global prefix `api/v1`.
 * Prefer exact prefix matching over substring `includes('/admin')`.
 */
export const ADMIN_API_PATH_PREFIX = '/api/v1/admin';

export function isAdminApiPath(path: string): boolean {
  const normalized = path.split('?')[0] ?? path;
  return (
    normalized === ADMIN_API_PATH_PREFIX ||
    normalized.startsWith(`${ADMIN_API_PATH_PREFIX}/`)
  );
}
