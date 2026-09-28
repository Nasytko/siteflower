import { Injectable, Logger } from '@nestjs/common';
import type {
  IntegrationAcceptResponseV1,
  IntegrationFailureCategory,
  IntegrationHealthPingResponseV1,
} from '@bouquet-one/contracts';
import type { OutboxEvent } from '@bouquet-one/database';
import { IntegrationConfigService } from './config';
import { generateNonce, signRequest } from './hmac';
import { SimulatorService } from './simulator.service';

export type DeliveryResult =
  | { ok: true; remoteReference: string; latencyMs: number }
  | {
      ok: false;
      category: IntegrationFailureCategory;
      message: string;
      latencyMs: number | null;
    };

@Injectable()
export class DeliveryClient {
  private readonly logger = new Logger(DeliveryClient.name);

  constructor(
    private readonly config: IntegrationConfigService,
    private readonly simulator: SimulatorService,
  ) {}

  /** Stable single stringify — same bytes signed and posted. */
  serializePayload(payload: unknown): string {
    return JSON.stringify(payload);
  }

  async deliver(event: OutboxEvent): Promise<DeliveryResult> {
    if (this.config.mode === 'DISABLED') {
      return {
        ok: false,
        category: 'CONFIGURATION_ERROR',
        message: 'Integration mode is DISABLED',
        latencyMs: null,
      };
    }

    const secret = this.config.hmacSecret;
    const keyId = this.config.keyId;
    if (!secret || !keyId) {
      return {
        ok: false,
        category: 'CONFIGURATION_ERROR',
        message: 'Missing INTEGRATION_KEY_ID or INTEGRATION_HMAC_SECRET',
        latencyMs: null,
      };
    }

    const bodyUtf8 = this.serializePayload(event.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = generateNonce();

    if (this.config.mode === 'SIMULATOR') {
      return this.deliverSimulator({ bodyUtf8, keyId, secret, timestamp, nonce });
    }

    return this.deliverErp({ bodyUtf8, keyId, secret, timestamp, nonce });
  }

  async testConnection(): Promise<{
    ok: boolean;
    latencyMs: number | null;
    message: string;
    failureCategory: IntegrationFailureCategory | null;
  }> {
    const started = Date.now();
    if (this.config.mode === 'DISABLED') {
      return {
        ok: false,
        latencyMs: null,
        message: 'Integration mode is DISABLED',
        failureCategory: 'CONFIGURATION_ERROR',
      };
    }
    const issues = this.config.configurationIssues();
    if (issues.length > 0) {
      return {
        ok: false,
        latencyMs: null,
        message: issues.join('; '),
        failureCategory: 'CONFIGURATION_ERROR',
      };
    }

    try {
      if (this.config.mode === 'SIMULATOR') {
        const health = await this.simulator.health();
        return {
          ok: health.status === 'OK',
          latencyMs: Date.now() - started,
          message: `Simulator ${health.service} OK`,
          failureCategory: null,
        };
      }

      const endpoint = this.config.endpoint;
      if (!endpoint) {
        return {
          ok: false,
          latencyMs: null,
          message: 'INTEGRATION_ENDPOINT not configured',
          failureCategory: 'CONFIGURATION_ERROR',
        };
      }

      const healthUrl = this.resolveHealthUrl(endpoint);
      const secret = this.config.hmacSecret!;
      const keyId = this.config.keyId!;
      const path = new URL(healthUrl).pathname;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = generateNonce();
      const signed = signRequest({
        secret,
        keyId,
        timestamp,
        nonce,
        method: 'GET',
        path,
        bodyUtf8: '',
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const res = await fetch(healthUrl, {
          method: 'GET',
          headers: signed.headers,
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          return {
            ok: false,
            latencyMs,
            message: `Health check HTTP ${res.status}`,
            failureCategory: this.categoryFromStatus(res.status),
          };
        }
        const body = (await res.json()) as IntegrationHealthPingResponseV1;
        if (body.status !== 'OK') {
          return {
            ok: false,
            latencyMs,
            message: 'Remote health status not OK',
            failureCategory: 'INVALID_RESPONSE',
          };
        }
        return {
          ok: true,
          latencyMs,
          message: `Connected to ${body.service}`,
          failureCategory: null,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const mapped = this.mapFetchError(err, Date.now() - started);
      return {
        ok: false,
        latencyMs: mapped.latencyMs,
        message: mapped.message,
        failureCategory: mapped.category,
      };
    }
  }

  private async deliverSimulator(input: {
    bodyUtf8: string;
    keyId: string;
    secret: string;
    timestamp: string;
    nonce: string;
  }): Promise<DeliveryResult> {
    const path = this.config.simulatorOrdersPath;
    const signed = signRequest({
      ...input,
      method: 'POST',
      path,
    });
    const started = Date.now();
    try {
      const accept = await this.simulator.acceptOrder({
        bodyUtf8: input.bodyUtf8,
        headers: {
          keyId: input.keyId,
          timestamp: input.timestamp,
          nonce: input.nonce,
          signature: signed.signatureHex,
        },
        method: 'POST',
        path,
      });
      return {
        ok: true,
        remoteReference: accept.remoteReference,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return this.mapSimulatorError(err, Date.now() - started);
    }
  }

  private async deliverErp(input: {
    bodyUtf8: string;
    keyId: string;
    secret: string;
    timestamp: string;
    nonce: string;
  }): Promise<DeliveryResult> {
    const endpoint = this.config.endpoint;
    if (!endpoint) {
      return {
        ok: false,
        category: 'CONFIGURATION_ERROR',
        message: 'INTEGRATION_ENDPOINT not configured',
        latencyMs: null,
      };
    }

    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return {
        ok: false,
        category: 'CONFIGURATION_ERROR',
        message: 'INTEGRATION_ENDPOINT is not a valid URL',
        latencyMs: null,
      };
    }

    const signed = signRequest({
      ...input,
      method: 'POST',
      path: url.pathname,
    });

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: signed.headers,
        body: input.bodyUtf8,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          ok: false,
          category: this.categoryFromStatus(res.status),
          message: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
          latencyMs,
        };
      }
      let parsed: IntegrationAcceptResponseV1;
      try {
        parsed = (await res.json()) as IntegrationAcceptResponseV1;
      } catch {
        return {
          ok: false,
          category: 'INVALID_RESPONSE',
          message: 'Response is not JSON',
          latencyMs,
        };
      }
      if (parsed.status !== 'ACCEPTED' || !parsed.remoteReference) {
        return {
          ok: false,
          category: 'INVALID_RESPONSE',
          message: 'Missing ACCEPTED / remoteReference',
          latencyMs,
        };
      }
      return {
        ok: true,
        remoteReference: parsed.remoteReference,
        latencyMs,
      };
    } catch (err) {
      return this.mapFetchError(err, Date.now() - started);
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveHealthUrl(endpoint: string): string {
    const url = new URL(endpoint);
    if (url.pathname.endsWith('/health')) return url.toString();
    const base = url.pathname.replace(/\/$/, '');
    url.pathname = `${base}/health`;
    return url.toString();
  }

  private categoryFromStatus(status: number): IntegrationFailureCategory {
    if (status === 401 || status === 403) return 'AUTH_FAILED';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'REMOTE_5XX';
    if (status >= 400) return 'REMOTE_4XX';
    return 'INVALID_RESPONSE';
  }

  private mapFetchError(
    err: unknown,
    latencyMs: number,
  ): {
    ok: false;
    category: IntegrationFailureCategory;
    message: string;
    latencyMs: number;
  } {
    const message = err instanceof Error ? err.message : String(err);
    if (
      err instanceof Error &&
      (err.name === 'AbortError' || message.toLowerCase().includes('abort'))
    ) {
      return { ok: false, category: 'TIMEOUT', message: 'Request timed out', latencyMs };
    }
    this.logger.warn(`ERP delivery network error: ${message}`);
    return { ok: false, category: 'NETWORK_ERROR', message, latencyMs };
  }

  private mapSimulatorError(
    err: unknown,
    latencyMs: number,
  ): DeliveryResult {
    if (err && typeof err === 'object' && 'simulatorFault' in err) {
      const fault = String((err as { simulatorFault: string }).simulatorFault);
      if (fault === 'timeout') {
        return { ok: false, category: 'TIMEOUT', message: 'Simulator injected timeout', latencyMs };
      }
      if (fault === '401') {
        return { ok: false, category: 'AUTH_FAILED', message: 'Simulator injected 401', latencyMs };
      }
      if (fault === '400') {
        return { ok: false, category: 'REMOTE_4XX', message: 'Simulator injected 400', latencyMs };
      }
      if (fault === '500' || fault === '503') {
        return {
          ok: false,
          category: 'REMOTE_5XX',
          message: `Simulator injected ${fault}`,
          latencyMs,
        };
      }
    }
    if (err && typeof err === 'object' && 'category' in err) {
      return {
        ok: false,
        category: (err as { category: IntegrationFailureCategory }).category,
        message: err instanceof Error ? err.message : String(err),
        latencyMs,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, category: 'INVALID_RESPONSE', message, latencyMs };
  }
}
