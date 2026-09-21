/**
 * Login throttle limits for `@Throttle` (decorators cannot inject ConfigService).
 * Values mirror AppConfigService / env.validation defaults and are read at module load.
 */
export const LOGIN_THROTTLE = {
  limit: Number(process.env.LOGIN_THROTTLE_LIMIT ?? 5),
  ttl: Number(process.env.LOGIN_THROTTLE_TTL_MS ?? 60_000),
} as const;
