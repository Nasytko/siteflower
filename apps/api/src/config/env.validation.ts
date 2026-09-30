import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('bouquet-one'),
    APP_VERSION: z.string().min(1).default('0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    BUSINESS_TIMEZONE: z.string().min(1).default('Europe/Minsk'),
    DATABASE_URL: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: booleanFromString.default(false),
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    LOGIN_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    LOGIN_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),
    /** Explicit opt-in; development forces on in AppConfigService. */
    SWAGGER_ENABLED: booleanFromString.optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(43_200),
    SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(1_800),
    SESSION_LAST_USED_THROTTLE_SECONDS: z.coerce.number().int().positive().default(60),
    SESSION_HMAC_SECRET: z.string().min(16).optional(),
    /** Base64-encoded 32-byte AES-256-GCM key for checkout idempotency recovery. */
    ORDER_RECOVERY_ENCRYPTION_KEY: z.string().optional(),
    /** Hours to retain encrypted checkout recovery (default 48). */
    ORDER_RECOVERY_TTL_HOURS: z.coerce.number().int().positive().default(48),
    MEDIA_STORAGE: z.enum(['local', 's3']).default('local'),
    MEDIA_LOCAL_ROOT: z.string().default('./storage/media'),
    MEDIA_PUBLIC_BASE_URL: z.string().default('http://localhost:3001/api/v1/media'),
    MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(8_000_000),
    /** Explicit opt-in for temporary/emergency local media in production. Prefer S3. */
    ALLOW_PRODUCTION_LOCAL_MEDIA: booleanFromString.default(false),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().optional(),
    /** HostFly / MinIO-style endpoints usually need path-style (default true). */
    S3_FORCE_PATH_STYLE: booleanFromString.default(true),
    /** DISABLED | SIMULATOR | ERP — default DISABLED. */
    INTEGRATION_MODE: z.enum(['DISABLED', 'SIMULATOR', 'ERP']).default('DISABLED'),
    /** Hard enable; default false (including production). */
    INTEGRATION_ENABLED: booleanFromString.optional(),
    INTEGRATION_KEY_ID: z.string().optional(),
    INTEGRATION_HMAC_SECRET: z.string().optional(),
    INTEGRATION_ENDPOINT: z.string().optional(),
    INTEGRATION_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    INTEGRATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(12),
    INTEGRATION_LEASE_SECONDS: z.coerce.number().int().positive().default(60),
    INTEGRATION_WORKER_ID: z.string().optional(),
    INTEGRATION_CONCURRENCY: z.coerce.number().int().positive().default(2),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production',
      });
    }
    if (env.NODE_ENV === 'production') {
      const hmac = env.SESSION_HMAC_SECRET ?? '';
      if (!hmac || hmac.length < 32 || hmac.includes('dev-only') || hmac.includes('change-me')) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_HMAC_SECRET'],
          message:
            'SESSION_HMAC_SECRET must be a strong non-placeholder secret in production (≥32 chars)',
        });
      }
      if (!env.ORDER_RECOVERY_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['ORDER_RECOVERY_ENCRYPTION_KEY'],
          message: 'ORDER_RECOVERY_ENCRYPTION_KEY is required in production',
        });
      } else {
        try {
          const key = Buffer.from(env.ORDER_RECOVERY_ENCRYPTION_KEY.trim(), 'base64');
          if (key.length !== 32) {
            ctx.addIssue({
              code: 'custom',
              path: ['ORDER_RECOVERY_ENCRYPTION_KEY'],
              message: 'ORDER_RECOVERY_ENCRYPTION_KEY must be base64 for exactly 32 bytes',
            });
          }
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['ORDER_RECOVERY_ENCRYPTION_KEY'],
            message: 'ORDER_RECOVERY_ENCRYPTION_KEY must be valid base64',
          });
        }
      }
      if (env.CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Wildcard CORS is not allowed in production',
        });
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.MEDIA_STORAGE === 'local' && !env.ALLOW_PRODUCTION_LOCAL_MEDIA) {
        ctx.addIssue({
          code: 'custom',
          path: ['MEDIA_STORAGE'],
          message:
            'MEDIA_STORAGE=local is not allowed in production unless ALLOW_PRODUCTION_LOCAL_MEDIA=true (prefer S3)',
        });
      }
    }
    if (env.MEDIA_STORAGE === 's3') {
      if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['S3_BUCKET'],
          message:
            'S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required when MEDIA_STORAGE=s3',
        });
      }
      if (!env.S3_PUBLIC_BASE_URL && !env.MEDIA_PUBLIC_BASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['S3_PUBLIC_BASE_URL'],
          message:
            'S3_PUBLIC_BASE_URL (or MEDIA_PUBLIC_BASE_URL) is required when MEDIA_STORAGE=s3',
        });
      }
    }
    if (env.INTEGRATION_MODE === 'ERP' && env.INTEGRATION_ENABLED === true) {
      const secret = env.INTEGRATION_HMAC_SECRET ?? '';
      if (secret.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['INTEGRATION_HMAC_SECRET'],
          message: 'INTEGRATION_HMAC_SECRET must be at least 32 characters when ERP mode is enabled',
        });
      }
      if (!env.INTEGRATION_KEY_ID?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['INTEGRATION_KEY_ID'],
          message: 'INTEGRATION_KEY_ID is required when ERP mode is enabled',
        });
      }
      if (!env.INTEGRATION_ENDPOINT?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['INTEGRATION_ENDPOINT'],
          message: 'INTEGRATION_ENDPOINT is required when ERP mode is enabled',
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
