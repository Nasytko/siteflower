import { Injectable } from '@nestjs/common';
import type { AdminRole, AdminUserStatus, Prisma } from '@bouquet-one/database';
import { PrismaService } from '../database/prisma.service';

export type AdminUserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  status: AdminUserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findByEmail(email: string): Promise<AdminUserRecord | null> {
    return this.db.adminUser.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<AdminUserRecord | null> {
    return this.db.adminUser.findUnique({ where: { id } });
  }

  async list(params: {
    skip: number;
    take: number;
  }): Promise<{ items: AdminUserRecord[]; total: number }> {
    const [items, total] = await Promise.all([
      this.db.adminUser.findMany({
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.db.adminUser.count(),
    ]);
    return { items, total };
  }

  async create(data: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: AdminRole;
  }): Promise<AdminUserRecord> {
    return this.db.adminUser.create({ data });
  }

  async update(
    id: string,
    data: Prisma.AdminUserUpdateInput,
  ): Promise<AdminUserRecord> {
    return this.db.adminUser.update({ where: { id }, data });
  }

  async countActiveSuperAdmins(tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.db;
    return client.adminUser.count({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
  }

  /**
   * Locks active SUPER_ADMIN rows for the duration of the transaction
   * so concurrent disable/demote cannot remove the last one.
   */
  async lockActiveSuperAdmins(
    tx: Prisma.TransactionClient,
  ): Promise<Array<{ id: string }>> {
    return tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM admin_users
      WHERE role = CAST('SUPER_ADMIN' AS "AdminRole")
        AND status = CAST('ACTIVE' AS "AdminUserStatus")
      FOR UPDATE
    `;
  }
}
