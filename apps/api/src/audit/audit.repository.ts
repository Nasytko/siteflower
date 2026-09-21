import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  create(
    data: {
      actorAdminUserId?: string | null;
      action: AuditAction;
      entityType: string;
      entityId?: string | null;
      metadata?: Prisma.InputJsonValue;
      requestId?: string | null;
      ipHash?: string | null;
      userAgent?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.auditLog.create({ data });
  }

  async list(params: {
    skip: number;
    take: number;
    actorAdminUserId?: string;
    action?: AuditAction;
    entityType?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.actorAdminUserId ? { actorAdminUserId: params.actorAdminUserId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        include: {
          actor: { select: { email: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
