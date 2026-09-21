import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminRole, AdminUserPublic } from '@bouquet-one/contracts';
import { isAdminRole } from '@bouquet-one/contracts';
import type { Prisma } from '@bouquet-one/database';
import { hashIp, hashPassword, normalizeEmail } from '../auth/crypto.util';
import { SessionsRepository } from '../auth/sessions.repository';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { toAdminUserPublic } from './admin-user.mapper';
import { AdminUsersRepository } from './admin-users.repository';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: AdminUsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  async list(page: number, pageSize: number): Promise<{
    items: AdminUserPublic[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const skip = (page - 1) * pageSize;
    const { items, total } = await this.users.list({ skip, take: pageSize });
    return {
      items: items.map((user) => toAdminUserPublic(user)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string): Promise<AdminUserPublic> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }
    return toAdminUserPublic(user);
  }

  async create(input: {
    email: string;
    displayName: string;
    password: string;
    role: string;
    actorId: string;
    requestId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AdminUserPublic> {
    if (!isAdminRole(input.role)) {
      throw new BadRequestException('Invalid role');
    }
    const email = normalizeEmail(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          email,
          displayName: input.displayName.trim(),
          passwordHash,
          role: input.role as AdminRole,
        },
      });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'ADMIN_USER_CREATED',
          entityType: 'AdminUser',
          entityId: created.id,
          metadata: { role: created.role, email: created.email },
          requestId: input.requestId,
          ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
          userAgent: input.userAgent,
        },
        tx,
      );
      return created;
    });

    return toAdminUserPublic(user);
  }

  async update(input: {
    id: string;
    displayName?: string;
    role?: string;
    actorId: string;
    requestId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AdminUserPublic> {
    const user = await this.users.findById(input.id);
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    if (input.role !== undefined && !isAdminRole(input.role)) {
      throw new BadRequestException('Invalid role');
    }

    const nextRole = (input.role as AdminRole | undefined) ?? user.role;
    const demotingLastSuper =
      user.role === 'SUPER_ADMIN' &&
      user.status === 'ACTIVE' &&
      nextRole !== 'SUPER_ADMIN';

    const updated = await this.prisma.client.$transaction(async (tx) => {
      if (demotingLastSuper) {
        const locked = await this.users.lockActiveSuperAdmins(tx);
        if (locked.length <= 1 && locked.some((row) => row.id === user.id)) {
          throw new ConflictException('Cannot demote the last active SUPER_ADMIN');
        }
      }

      const data: Prisma.AdminUserUpdateInput = {
        ...(input.displayName !== undefined
          ? { displayName: input.displayName.trim() }
          : {}),
        ...(input.role !== undefined ? { role: input.role as AdminRole } : {}),
      };

      const result = await tx.adminUser.update({ where: { id: user.id }, data });
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'ADMIN_USER_UPDATED',
          entityType: 'AdminUser',
          entityId: user.id,
          metadata: {
            displayName: input.displayName,
            role: input.role,
          },
          requestId: input.requestId,
          ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
          userAgent: input.userAgent,
        },
        tx,
      );
      return result;
    });

    return toAdminUserPublic(updated);
  }

  async setStatus(input: {
    id: string;
    status: 'ACTIVE' | 'DISABLED';
    actorId: string;
    requestId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AdminUserPublic> {
    const user = await this.users.findById(input.id);
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      if (input.status === 'DISABLED' && user.role === 'SUPER_ADMIN' && user.status === 'ACTIVE') {
        const locked = await this.users.lockActiveSuperAdmins(tx);
        if (locked.length <= 1 && locked.some((row) => row.id === user.id)) {
          throw new ConflictException('Cannot disable the last active SUPER_ADMIN');
        }
      }

      const result = await tx.adminUser.update({
        where: { id: user.id },
        data: { status: input.status },
      });

      if (input.status === 'DISABLED') {
        await this.sessions.revokeAllForUser(user.id, new Date(), tx);
      }

      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: input.status === 'DISABLED' ? 'ADMIN_USER_DISABLED' : 'ADMIN_USER_ENABLED',
          entityType: 'AdminUser',
          entityId: user.id,
          requestId: input.requestId,
          ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
          userAgent: input.userAgent,
        },
        tx,
      );

      return result;
    });

    return toAdminUserPublic(updated);
  }

  async resetPassword(input: {
    id: string;
    newPassword: string;
    actorId: string;
    requestId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    const user = await this.users.findById(input.id);
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await this.sessions.revokeAllForUser(user.id, new Date(), tx);
      await this.audit.record(
        {
          actorAdminUserId: input.actorId,
          action: 'ADMIN_PASSWORD_RESET',
          entityType: 'AdminUser',
          entityId: user.id,
          requestId: input.requestId,
          ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
          userAgent: input.userAgent,
        },
        tx,
      );
    });
  }
}
