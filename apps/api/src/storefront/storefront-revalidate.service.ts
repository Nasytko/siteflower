import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

/**
 * Fail-soft on-demand revalidation of the Next.js storefront cache.
 * No-ops when REVALIDATE_URL or REVALIDATE_SECRET are unset.
 * Production Compose defaults REVALIDATE_URL to http://web:3000/api/revalidate
 * (Docker DNS on shopbuket1_internal); set REVALIDATE_SECRET in the shared env file.
 */
@Injectable()
export class StorefrontRevalidateService implements OnModuleInit {
  private readonly logger = new Logger(StorefrontRevalidateService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  onModuleInit(): void {
    const url = this.appConfig.revalidateUrl;
    const secret = this.appConfig.revalidateSecret;
    if (secret && !url) {
      this.logger.warn(
        'REVALIDATE_SECRET is set but REVALIDATE_URL is missing; storefront revalidation is disabled',
      );
    }
  }

  async ping(options?: { tags?: string[]; paths?: string[] }): Promise<void> {
    const url = this.appConfig.revalidateUrl;
    const secret = this.appConfig.revalidateSecret;
    if (!url || !secret) return;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify({
          tags: options?.tags ?? ['catalog', 'storefront'],
          paths: options?.paths ?? ['/', '/bukety'],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        // Never log response bodies (may echo request context); status only.
        this.logger.warn(`Storefront revalidate failed: HTTP ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Fetch/timeout errors must never include the secret (header is not in Error.message).
      this.logger.warn(`Storefront revalidate error: ${message}`);
    }
  }
}
