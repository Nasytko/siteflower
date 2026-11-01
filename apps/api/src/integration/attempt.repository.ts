import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';
import { sanitizeErrorMessage } from './backoff';

@Injectable()
export class IntegrationAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    channel: 'ERP' | 'TELEGRAM';
    orderId: string;
    outboxEventId: string | null;
    attemptNumber: number;
    outcome: 'SUCCESS' | 'FAILURE' | 'SKIPPED';
    remoteReference?: string | null;
    errorCode?: string | null;
    errorSanitized?: string | null;
    nextAttemptAt?: Date | null;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.prisma.client.integrationDeliveryAttempt.create({
      data: {
        channel: input.channel,
        orderId: input.orderId,
        outboxEventId: input.outboxEventId,
        attemptNumber: input.attemptNumber,
        outcome: input.outcome,
        remoteReference: input.remoteReference?.slice(0, 200) ?? null,
        errorCode: input.errorCode?.slice(0, 64) ?? null,
        errorSanitized: input.errorSanitized
          ? sanitizeErrorMessage(input.errorSanitized)
          : null,
        nextAttemptAt: input.nextAttemptAt ?? null,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
