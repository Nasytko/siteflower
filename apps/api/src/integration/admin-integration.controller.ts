import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  IntegrationStatusDto,
  IntegrationTestConnectionResult,
} from '@bouquet-one/contracts';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { RequirePermissions } from '../auth/decorators';
import { CurrentAdmin, type AuthenticatedAdmin } from '../auth/current-admin.decorator';
import { AuditService } from '../audit/audit.service';
import { getRequestId } from '../common/middleware/request-id.middleware';
import { PrismaService } from '../database/prisma.service';
import { IntegrationConfigService } from './config';
import { DeliveryClient } from './delivery.client';
import { AdminOutboxListQueryDto, PatchIntegrationEnabledDto } from './integration.dto';
import { buildStorefrontOrderCreatedV1 } from './payload';
import { OutboxRepository } from './outbox.repository';

const WORKER_STALE_MS = 90_000;

@ApiTags('admin-integrations')
@Controller('admin/integrations/erp')
export class AdminIntegrationController {
  constructor(
    private readonly config: IntegrationConfigService,
    private readonly outbox: OutboxRepository,
    private readonly delivery: DeliveryClient,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions('INTEGRATION_READ')
  @Get('status')
  async status(): Promise<IntegrationStatusDto> {
    const publicConfig = this.config.toPublicConfig();
    const runtime = await this.outbox.ensureRuntimeSettings();
    const stats = await this.outbox.stats();
    const heartbeat = await this.outbox.latestHeartbeat();
    const now = Date.now();

    let workerState: IntegrationStatusDto['worker']['state'] = 'UNKNOWN';
    if (!publicConfig.enabled || publicConfig.mode === 'DISABLED' || runtime.paused) {
      workerState = 'DISABLED';
    } else if (heartbeat) {
      const age = now - heartbeat.lastSeenAt.getTime();
      workerState = age <= WORKER_STALE_MS ? 'RUNNING' : 'STALE';
    }

    const alerts: string[] = [];
    if (runtime.paused) alerts.push('Delivery paused by admin');
    if (!publicConfig.enabled) alerts.push('INTEGRATION_ENABLED is false');
    if (publicConfig.mode === 'DISABLED') alerts.push('INTEGRATION_MODE is DISABLED');
    for (const issue of publicConfig.configurationIssues) alerts.push(issue);
    if (stats.failed > 0) alerts.push(`${stats.failed} failed outbox event(s)`);
    if (workerState === 'STALE') alerts.push('Worker heartbeat is stale');

    return {
      mode: publicConfig.mode,
      enabled: publicConfig.enabled && !runtime.paused,
      configurationReady: publicConfig.configurationReady,
      configurationIssues: publicConfig.configurationIssues,
      endpointConfigured: publicConfig.endpointConfigured,
      keyIdConfigured: publicConfig.keyIdConfigured,
      secretConfigured: publicConfig.secretConfigured,
      worker: {
        state: workerState,
        lastSeenAt: heartbeat?.lastSeenAt.toISOString() ?? null,
        instanceId: heartbeat?.id ?? null,
      },
      queue: {
        pending: stats.pending,
        processing: stats.processing,
        retry: stats.retry,
        failed: stats.failed,
        deliveredLast24h: stats.deliveredLast24h,
        oldestPendingAgeSeconds: stats.oldestPendingAgeSeconds,
      },
      lastSuccessAt: stats.lastSuccessAt,
      lastFailureAt: stats.lastFailureAt,
      alerts,
    };
  }

  @RequirePermissions('INTEGRATION_READ')
  @Get('events')
  listEvents(@Query() query: AdminOutboxListQueryDto) {
    return this.outbox.listAdmin(query);
  }

  @RequirePermissions('INTEGRATION_READ')
  @Get('events/:id')
  async getEvent(@Param('id', ParseUUIDPipe) id: string) {
    const detail = await this.outbox.getAdminDetail(id);
    if (!detail) throw new NotFoundException('Outbox event not found');
    return detail;
  }

  @RequirePermissions('INTEGRATION_OPERATE')
  @Post('events/:id/retry')
  async retryEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const event = await this.outbox.manualRetry(id);
    if (!event) throw new NotFoundException('Outbox event not found');
    if (event.status === 'DELIVERED') {
      throw new BadRequestException('Already delivered');
    }
    if (event.status === 'PROCESSING') {
      throw new BadRequestException('Event is currently processing');
    }
    await this.audit.record({
      actorAdminUserId: admin.id,
      action: 'INTEGRATION_EVENT_MANUAL_RETRY',
      entityType: 'OutboxEvent',
      entityId: id,
      requestId: getRequestId(req),
    });
    return { ok: true, id, status: event.status };
  }

  @RequirePermissions('INTEGRATION_OPERATE')
  @Post('test-connection')
  async testConnection(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ): Promise<IntegrationTestConnectionResult> {
    const checkedAt = new Date().toISOString();
    const result = await this.delivery.testConnection();
    await this.audit.record({
      actorAdminUserId: admin.id,
      action: 'INTEGRATION_TEST_CONNECTION',
      entityType: 'Integration',
      entityId: 'erp',
      metadata: { ok: result.ok, message: result.message },
      requestId: getRequestId(req),
    });
    return {
      ok: result.ok,
      latencyMs: result.latencyMs,
      checkedAt,
      message: result.message,
      failureCategory: result.failureCategory,
    };
  }

  @RequirePermissions('INTEGRATION_OPERATE')
  @Post('test-event')
  async testEvent(@CurrentAdmin() admin: AuthenticatedAdmin, @Req() req: Request) {
    if (this.config.mode !== 'SIMULATOR') {
      throw new BadRequestException('test-event is only available in SIMULATOR mode');
    }
    if (!this.config.isDeliveryActive()) {
      throw new BadRequestException('Integration is not active (check mode/enabled/config)');
    }

    const eventId = randomUUID();
    const now = new Date();
    const payload = buildStorefrontOrderCreatedV1({
      eventId,
      order: {
        id: randomUUID(),
        orderNumber: `TEST-${now.getTime()}`,
        createdAt: now,
        status: 'RECEIVED',
        fulfillmentType: 'PICKUP',
        fulfillmentDate: now.toISOString().slice(0, 10),
        timeWindowId: 'test-window',
        timeWindowLabel: 'Test',
        timeWindowStartMinutes: 600,
        timeWindowEndMinutes: 720,
        purchaserName: 'Test Purchaser',
        purchaserPhoneE164: '+375291112233',
        recipientName: null,
        recipientPhoneE164: null,
        surprise: false,
        addressKnown: false,
        deliveryAddress: null,
        addressDetails: null,
        cardMessage: null,
        anonymousCard: false,
        customerComment: 'simulator test-event',
        currency: 'BYN',
        subtotalMinor: 1000,
        deliveryFeeMinor: 0,
        totalMinor: 1000,
      },
      items: [
        {
          productId: randomUUID(),
          variantId: randomUUID(),
          productName: 'Test Bouquet',
          productSlug: 'test-bouquet',
          variantName: 'Standard',
          quantity: 1,
          unitPriceMinor: 1000,
          originalUnitPriceMinor: null,
          promotionType: null,
          lineTotalMinor: 1000,
          currency: 'BYN',
        },
      ],
    });

    await this.prisma.client.outboxEvent.create({
      data: {
        id: eventId,
        eventType: 'ORDER_CREATED',
        aggregateType: 'Order',
        aggregateId: payload.order.externalOrderId,
        schemaVersion: 1,
        payload,
        status: 'PENDING',
        availableAt: now,
      },
    });

    await this.audit.record({
      actorAdminUserId: admin.id,
      action: 'INTEGRATION_TEST_EVENT_SENT',
      entityType: 'OutboxEvent',
      entityId: eventId,
      requestId: getRequestId(req),
    });

    return { ok: true, eventId, status: 'PENDING' };
  }

  @RequirePermissions('INTEGRATION_CONFIGURE')
  @Patch('enabled')
  async setEnabled(
    @Body() body: PatchIntegrationEnabledDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    // enabled=true → pause=false; enabled=false → pause=true
    const paused = !body.enabled;
    const runtime = await this.outbox.setPaused(paused);
    await this.audit.record({
      actorAdminUserId: admin.id,
      action: body.enabled ? 'INTEGRATION_ENABLED' : 'INTEGRATION_DISABLED',
      entityType: 'IntegrationRuntimeSettings',
      entityId: '1',
      metadata: { paused: runtime.paused },
      requestId: getRequestId(req),
    });
    return {
      enabled: !runtime.paused,
      paused: runtime.paused,
      updatedAt: runtime.updatedAt.toISOString(),
      note: 'Admin pause only; INTEGRATION_ENABLED env still required for delivery',
    };
  }
}
