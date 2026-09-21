import type { HealthResponse } from '@bouquet-one/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  getHealth(input: {
    service: string;
    version: string;
    requestId?: string;
  }): HealthResponse {
    return {
      status: 'ok',
      service: input.service,
      version: input.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requestId: input.requestId,
      checks: {
        application: { status: 'ok' },
        // Future: database, erp, storage, outbox
      },
    };
  }
}
