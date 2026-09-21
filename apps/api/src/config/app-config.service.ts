import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from './env.validation';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get appName(): string {
    return this.config.get('APP_NAME', { infer: true });
  }

  get appVersion(): string {
    return this.config.get('APP_VERSION', { infer: true });
  }

  get port(): number {
    return this.config.get('API_PORT', { infer: true });
  }

  get businessTimezone(): string {
    return this.config.get('BUSINESS_TIMEZONE', { infer: true });
  }

  get databaseUrl(): string | undefined {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get corsOrigins(): string[] {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get trustProxy(): boolean {
    return this.config.get('TRUST_PROXY', { infer: true });
  }

  get throttleTtlMs(): number {
    return this.config.get('THROTTLE_TTL_MS', { infer: true });
  }

  get throttleLimit(): number {
    return this.config.get('THROTTLE_LIMIT', { infer: true });
  }

  get loginThrottleTtlMs(): number {
    return this.config.get('LOGIN_THROTTLE_TTL_MS', { infer: true });
  }

  get loginThrottleLimit(): number {
    return this.config.get('LOGIN_THROTTLE_LIMIT', { infer: true });
  }

  get swaggerEnabled(): boolean {
    const configured = this.config.get('SWAGGER_ENABLED', { infer: true });
    if (this.nodeEnv === 'development') {
      return true;
    }
    return configured;
  }

  get logLevel(): AppEnv['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get sessionAbsoluteTtlSeconds(): number {
    return this.config.get('SESSION_ABSOLUTE_TTL_SECONDS', { infer: true });
  }

  get sessionIdleTtlSeconds(): number {
    return this.config.get('SESSION_IDLE_TTL_SECONDS', { infer: true });
  }

  get sessionLastUsedThrottleSeconds(): number {
    return this.config.get('SESSION_LAST_USED_THROTTLE_SECONDS', { infer: true });
  }

  get sessionHmacSecret(): string {
    return (
      this.config.get('SESSION_HMAC_SECRET', { infer: true }) ??
      'dev-only-session-hmac-secret'
    );
  }

  get mediaStorageDriver(): 'local' | 's3' {
    return this.config.get('MEDIA_STORAGE', { infer: true });
  }

  get mediaLocalRoot(): string {
    return this.config.get('MEDIA_LOCAL_ROOT', { infer: true });
  }

  get mediaPublicBaseUrl(): string {
    return this.config.get('MEDIA_PUBLIC_BASE_URL', { infer: true });
  }

  get mediaMaxBytes(): number {
    return this.config.get('MEDIA_MAX_BYTES', { infer: true });
  }

  get s3Endpoint(): string | undefined {
    return this.config.get('S3_ENDPOINT', { infer: true });
  }

  get s3Region(): string {
    return this.config.get('S3_REGION', { infer: true });
  }

  get s3Bucket(): string | undefined {
    return this.config.get('S3_BUCKET', { infer: true });
  }

  get s3AccessKeyId(): string | undefined {
    return this.config.get('S3_ACCESS_KEY_ID', { infer: true });
  }

  get s3SecretAccessKey(): string | undefined {
    return this.config.get('S3_SECRET_ACCESS_KEY', { infer: true });
  }

  get s3PublicBaseUrl(): string | undefined {
    return this.config.get('S3_PUBLIC_BASE_URL', { infer: true });
  }
}
