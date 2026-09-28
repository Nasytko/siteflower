import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isIntegrationMode,
  type IntegrationMode,
} from '@bouquet-one/contracts';
import { hostname } from 'node:os';
import type { AppEnv } from '../config/env.validation';

export type IntegrationPublicConfig = {
  mode: IntegrationMode;
  enabled: boolean;
  configurationReady: boolean;
  configurationIssues: string[];
  endpointConfigured: boolean;
  keyIdConfigured: boolean;
  /** Never expose the secret — only whether it is set. */
  secretConfigured: boolean;
  timeoutMs: number;
  maxAttempts: number;
  leaseSeconds: number;
  workerId: string;
  concurrency: number;
};

@Injectable()
export class IntegrationConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  get mode(): IntegrationMode {
    const raw = this.config.get('INTEGRATION_MODE', { infer: true }) ?? 'DISABLED';
    return isIntegrationMode(raw) ? raw : 'DISABLED';
  }

  /**
   * Hard enable from env. Default false in production; elsewhere still false unless set.
   */
  get enabled(): boolean {
    const configured = this.config.get('INTEGRATION_ENABLED', { infer: true });
    if (configured !== undefined) return configured;
    return false;
  }

  get keyId(): string | undefined {
    const v = this.config.get('INTEGRATION_KEY_ID', { infer: true });
    return v?.trim() || undefined;
  }

  /** Raw secret — never return via API. */
  get hmacSecret(): string | undefined {
    const v = this.config.get('INTEGRATION_HMAC_SECRET', { infer: true });
    return v?.trim() || undefined;
  }

  get endpoint(): string | undefined {
    const v = this.config.get('INTEGRATION_ENDPOINT', { infer: true });
    return v?.trim() || undefined;
  }

  get timeoutMs(): number {
    return this.config.get('INTEGRATION_TIMEOUT_MS', { infer: true }) ?? 8000;
  }

  get maxAttempts(): number {
    return this.config.get('INTEGRATION_MAX_ATTEMPTS', { infer: true }) ?? 12;
  }

  get leaseSeconds(): number {
    return this.config.get('INTEGRATION_LEASE_SECONDS', { infer: true }) ?? 60;
  }

  get workerId(): string {
    const configured = this.config.get('INTEGRATION_WORKER_ID', { infer: true });
    if (configured?.trim()) return configured.trim();
    return `worker-${hostname()}-${process.pid}`;
  }

  get concurrency(): number {
    return this.config.get('INTEGRATION_CONCURRENCY', { infer: true }) ?? 2;
  }

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get secretConfigured(): boolean {
    return Boolean(this.hmacSecret && this.hmacSecret.length > 0);
  }

  /** Pathname used when signing simulator deliveries (in-process). */
  get simulatorOrdersPath(): string {
    return '/api/v1/integration/simulator/orders';
  }

  get simulatorHealthPath(): string {
    return '/api/v1/integration/simulator/health';
  }

  configurationIssues(): string[] {
    const issues: string[] = [];
    if (this.mode === 'DISABLED') {
      return issues;
    }
    if (!this.keyId) {
      issues.push('INTEGRATION_KEY_ID is required');
    }
    if (!this.hmacSecret) {
      issues.push('INTEGRATION_HMAC_SECRET is required');
    } else if (this.mode === 'ERP' && this.hmacSecret.length < 32) {
      issues.push('INTEGRATION_HMAC_SECRET must be at least 32 characters in ERP mode');
    }
    if (this.mode === 'ERP') {
      if (!this.endpoint) {
        issues.push('INTEGRATION_ENDPOINT is required in ERP mode');
      } else {
        issues.push(...this.endpointIssues(this.endpoint));
      }
    }
    return issues;
  }

  private endpointIssues(endpoint: string): string[] {
    const issues: string[] = [];
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return ['INTEGRATION_ENDPOINT is not a valid URL'];
    }
    const host = url.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (url.protocol !== 'https:' && !isLocal) {
      issues.push('INTEGRATION_ENDPOINT must use HTTPS unless host is localhost/127.0.0.1');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      issues.push('INTEGRATION_ENDPOINT must be http or https');
    }
    return issues;
  }

  /** Safe snapshot for admin status — never includes the secret. */
  toPublicConfig(): IntegrationPublicConfig {
    const issues = this.configurationIssues();
    return {
      mode: this.mode,
      enabled: this.enabled,
      configurationReady: issues.length === 0 && this.mode !== 'DISABLED',
      configurationIssues: issues,
      endpointConfigured: Boolean(this.endpoint),
      keyIdConfigured: Boolean(this.keyId),
      secretConfigured: this.secretConfigured,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      leaseSeconds: this.leaseSeconds,
      workerId: this.workerId,
      concurrency: this.concurrency,
    };
  }

  /** True when worker may claim/deliver (env gate only; runtime pause checked separately). */
  isDeliveryActive(): boolean {
    return this.enabled && this.mode !== 'DISABLED' && this.configurationIssues().length === 0;
  }
}
