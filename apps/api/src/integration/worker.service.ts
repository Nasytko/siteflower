import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'node:os';
import type { OutboxEvent } from '@bouquet-one/database';
import { shouldMarkFailed } from './backoff';
import { IntegrationConfigService } from './config';
import { DeliveryClient } from './delivery.client';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class IntegrationWorkerService {
  private readonly logger = new Logger(IntegrationWorkerService.name);
  private stopping = false;

  constructor(
    private readonly config: IntegrationConfigService,
    private readonly outbox: OutboxRepository,
    private readonly delivery: DeliveryClient,
  ) {}

  requestStop(): void {
    this.stopping = true;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  async tick(): Promise<{ claimed: number; delivered: number; failed: number }> {
    const now = new Date();
    await this.outbox.upsertHeartbeat(this.config.workerId, hostname(), now);

    if (!this.config.isDeliveryActive()) {
      return { claimed: 0, delivered: 0, failed: 0 };
    }

    const paused = await this.outbox.isPaused();
    if (paused) {
      return { claimed: 0, delivered: 0, failed: 0 };
    }

    await this.outbox.releaseExpiredLeases(now);

    const batch = await this.outbox.claimBatch(
      this.config.concurrency,
      this.config.workerId,
      now,
      this.config.leaseSeconds,
    );

    let delivered = 0;
    let failed = 0;
    for (const event of batch) {
      if (this.stopping) break;
      const outcome = await this.processOne(event);
      if (outcome === 'delivered') delivered += 1;
      if (outcome === 'failed') failed += 1;
    }

    return { claimed: batch.length, delivered, failed };
  }

  private async processOne(event: OutboxEvent): Promise<'delivered' | 'retry' | 'failed'> {
    const workerId = this.config.workerId;
    const result = await this.delivery.deliver(event);
    if (result.ok) {
      const applied = await this.outbox.markDelivered(event.id, workerId, result.remoteReference);
      if (!applied) {
        this.logger.warn(`Stale lease — skipped markDelivered for outbox ${event.id}`);
        return 'retry';
      }
      this.logger.log(`Delivered outbox ${event.id} → ${result.remoteReference}`);
      return 'delivered';
    }

    if (shouldMarkFailed(result.category, event.attemptCount, this.config.maxAttempts)) {
      const applied = await this.outbox.markFailed(event.id, workerId, result.category, result.message);
      if (!applied) {
        this.logger.warn(`Stale lease — skipped markFailed for outbox ${event.id}`);
        return 'retry';
      }
      this.logger.warn(
        `Failed outbox ${event.id} [${result.category}] after ${event.attemptCount} attempts: ${result.message}`,
      );
      return 'failed';
    }

    const applied = await this.outbox.scheduleRetryFromAttempt(
      event.id,
      workerId,
      result.category,
      result.message,
      event.attemptCount,
    );
    if (!applied) {
      this.logger.warn(`Stale lease — skipped markRetry for outbox ${event.id}`);
      return 'retry';
    }
    this.logger.warn(
      `Retry outbox ${event.id} [${result.category}] attempt=${event.attemptCount}: ${result.message}`,
    );
    return 'retry';
  }

  async runLoop(options?: { idleSleepMs?: number; busySleepMs?: number }): Promise<void> {
    const idleSleepMs = options?.idleSleepMs ?? 2000;
    const busySleepMs = options?.busySleepMs ?? 200;
    this.logger.log(
      `Integration worker starting id=${this.config.workerId} mode=${this.config.mode} enabled=${this.config.enabled}`,
    );

    while (!this.stopping) {
      try {
        const result = await this.tick();
        const sleep = result.claimed > 0 ? busySleepMs : idleSleepMs;
        await this.sleep(sleep);
      } catch (err) {
        this.logger.error(
          `Worker tick error: ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.sleep(idleSleepMs);
      }
    }

    this.logger.log('Integration worker stopped gracefully');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
