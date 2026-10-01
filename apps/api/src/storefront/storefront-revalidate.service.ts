import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

/**
 * Fail-soft on-demand revalidation of the Next.js storefront cache.
 * No-ops when REVALIDATE_URL / REVALIDATE_SECRET are unset.
 */
@Injectable()
export class StorefrontRevalidateService {
  private readonly logger = new Logger(StorefrontRevalidateService.name);

  constructor(private readonly appConfig: AppConfigService) {}

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
        this.logger.warn(`Storefront revalidate failed: HTTP ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Storefront revalidate error: ${message}`);
    }
  }
}
