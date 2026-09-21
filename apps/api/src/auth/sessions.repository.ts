import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  create(
    data: {
      adminUserId: string;
      tokenHash: string;
      expiresAt: Date;
      lastUsedAt: Date;
      userAgent?: string | null;
      ipHash?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.adminSession.create({ data });
  }

  findByTokenHash(tokenHash: string) {
    return this.db.adminSession.findUnique({
      where: { tokenHash },
      include: { adminUser: true },
    });
  }

  async touchLastUsed(id: string, lastUsedAt: Date): Promise<void> {
    await this.db.adminSession.update({
      where: { id },
      data: { lastUsedAt },
    });
  }

  async revoke(id: string, revokedAt: Date, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.db;
    await client.adminSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeAllForUser(
    adminUserId: string,
    revokedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.db;
    const result = await client.adminSession.updateMany({
      where: { adminUserId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }
}
