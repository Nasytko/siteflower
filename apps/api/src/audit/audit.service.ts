import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@bouquet-one/database';
import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async record(
    input: {
      actorAdminUserId?: string | null;
      action: AuditAction;
      entityType: string;
      entityId?: string | null;
      metadata?: Record<string, unknown>;
      requestId?: string | null;
      ipHash?: string | null;
      userAgent?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.auditRepository.create(
      {
        actorAdminUserId: input.actorAdminUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        requestId: input.requestId ?? null,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
      tx,
    );
  }

  list(params: Parameters<AuditRepository['list']>[0]) {
    return this.auditRepository.list(params);
  }
}
