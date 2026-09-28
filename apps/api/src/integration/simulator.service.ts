import {
  Injectable,
} from '@nestjs/common';
import {
  INTEGRATION_TIMESTAMP_SKEW_SECONDS,
  type IntegrationAcceptResponseV1,
  type IntegrationFailureCategory,
  type IntegrationHealthPingResponseV1,
  type StorefrontOrderCreatedV1,
} from '@bouquet-one/contracts';
import { PrismaService } from '../database/prisma.service';
import { IntegrationConfigService } from './config';
import {
  computeExpectedSignature,
  sha256Hex,
  verifySignature,
} from './hmac';

export class SimulatorDeliveryError extends Error {
  constructor(
    message: string,
    readonly category: IntegrationFailureCategory,
    readonly simulatorFault?: string,
  ) {
    super(message);
    this.name = 'SimulatorDeliveryError';
  }
}

@Injectable()
export class SimulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntegrationConfigService,
  ) {}

  async health(): Promise<IntegrationHealthPingResponseV1> {
    return {
      status: 'OK',
      service: 'siteflower-integration-simulator',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify HMAC + skew + nonce replay, parse payload, upsert receipt (idempotent on eventId).
   */
  async acceptOrder(input: {
    bodyUtf8: string;
    headers: {
      keyId: string;
      timestamp: string;
      nonce: string;
      signature: string;
    };
    method: string;
    path: string;
    fault?: string | null;
  }): Promise<IntegrationAcceptResponseV1> {
    if (input.fault && this.config.nodeEnv !== 'production') {
      this.applyFault(input.fault);
    }

    const secret = this.config.hmacSecret;
    if (!secret) {
      throw new SimulatorDeliveryError(
        'Simulator secret not configured',
        'CONFIGURATION_ERROR',
      );
    }

    if (input.headers.keyId !== this.config.keyId) {
      throw new SimulatorDeliveryError('Unknown integration key', 'AUTH_FAILED');
    }

    const ts = Number(input.headers.timestamp);
    if (!Number.isFinite(ts)) {
      throw new SimulatorDeliveryError('Invalid timestamp', 'AUTH_FAILED');
    }
    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skew > INTEGRATION_TIMESTAMP_SKEW_SECONDS) {
      throw new SimulatorDeliveryError('Timestamp outside skew window', 'AUTH_FAILED');
    }

    const bodyHashHex = sha256Hex(input.bodyUtf8);
    const expected = computeExpectedSignature({
      secret,
      keyId: input.headers.keyId,
      timestamp: input.headers.timestamp,
      nonce: input.headers.nonce,
      method: input.method,
      path: input.path,
      bodyHashHex,
    });
    if (!verifySignature(expected, input.headers.signature)) {
      throw new SimulatorDeliveryError('Invalid signature', 'AUTH_FAILED');
    }

    await this.consumeNonce(input.headers.keyId, input.headers.nonce, ts);

    let payload: StorefrontOrderCreatedV1;
    try {
      payload = JSON.parse(input.bodyUtf8) as StorefrontOrderCreatedV1;
    } catch {
      throw new SimulatorDeliveryError('Body is not JSON', 'INVALID_RESPONSE');
    }

    if (
      !payload?.eventId ||
      payload.eventType !== 'ORDER_CREATED' ||
      payload.schemaVersion !== 1 ||
      !payload.order?.externalOrderId
    ) {
      throw new SimulatorDeliveryError('Invalid StorefrontOrderCreatedV1', 'INVALID_RESPONSE');
    }

    const existing = await this.prisma.client.integrationSimulatorReceipt.findUnique({
      where: { eventId: payload.eventId },
    });
    if (existing) {
      return {
        status: 'ACCEPTED',
        eventId: payload.eventId,
        externalOrderId: payload.order.externalOrderId,
        remoteReference: existing.remoteReference,
        receivedAt: existing.acceptedAt.toISOString(),
      };
    }

    const remoteReference = `sim-${payload.eventId}`;
    const created = await this.prisma.client.integrationSimulatorReceipt.create({
      data: {
        eventId: payload.eventId,
        externalOrderId: payload.order.externalOrderId,
        eventType: payload.eventType,
        schemaVersion: payload.schemaVersion,
        remoteReference,
      },
    });

    return {
      status: 'ACCEPTED',
      eventId: payload.eventId,
      externalOrderId: payload.order.externalOrderId,
      remoteReference: created.remoteReference,
      receivedAt: created.acceptedAt.toISOString(),
    };
  }

  private applyFault(fault: string): void {
    const normalized = fault.trim().toLowerCase();
    if (normalized === 'timeout') {
      throw new SimulatorDeliveryError('Injected timeout', 'TIMEOUT', 'timeout');
    }
    if (normalized === '401') {
      throw new SimulatorDeliveryError('Injected 401', 'AUTH_FAILED', '401');
    }
    if (normalized === '400') {
      throw new SimulatorDeliveryError('Injected 400', 'REMOTE_4XX', '400');
    }
    if (normalized === '500' || normalized === '503') {
      throw new SimulatorDeliveryError(`Injected ${normalized}`, 'REMOTE_5XX', normalized);
    }
  }

  private async consumeNonce(keyId: string, nonce: string, timestampSec: number): Promise<void> {
    const expiresAt = new Date((timestampSec + INTEGRATION_TIMESTAMP_SKEW_SECONDS + 60) * 1000);
    try {
      await this.prisma.client.integrationReplayNonce.create({
        data: {
          keyId,
          nonce,
          expiresAt,
        },
      });
    } catch {
      throw new SimulatorDeliveryError('Nonce replay detected', 'AUTH_FAILED');
    }

    // Opportunistic cleanup of expired nonces
    await this.prisma.client.integrationReplayNonce.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
