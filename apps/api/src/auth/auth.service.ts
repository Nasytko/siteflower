import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { AdminUserPublic } from '@bouquet-one/contracts';
import { toAdminUserPublic } from '../admin-users/admin-user.mapper';
import { AdminUsersRepository } from '../admin-users/admin-users.repository';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import {
  hashIp,
  normalizeEmail,
  verifyPassword,
  verifyPasswordDummy,
} from './crypto.util';
import { SessionService } from './session.service';

const GENERIC_AUTH_ERROR = 'Invalid email or password.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: AdminUsersRepository,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  async login(input: {
    email: string;
    password: string;
    userAgent?: string;
    ip?: string;
    requestId?: string;
  }): Promise<{
    user: AdminUserPublic;
    rawToken: string;
    sessionId: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
  }> {
    const email = normalizeEmail(input.email);
    const ipHash = hashIp(input.ip, this.appConfig.sessionHmacSecret);
    const user = await this.users.findByEmail(email);

    if (!user || user.status !== 'ACTIVE') {
      await verifyPasswordDummy(input.password);
      await this.audit.record({
        action: 'LOGIN_FAILURE',
        entityType: 'AdminUser',
        entityId: user?.id ?? null,
        metadata: { reason: user ? 'disabled_or_inactive' : 'unknown_email' },
        requestId: input.requestId,
        ipHash,
        userAgent: input.userAgent,
      });
      this.logger.warn({ email, requestId: input.requestId }, 'Admin login failed');
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      await this.audit.record({
        actorAdminUserId: user.id,
        action: 'LOGIN_FAILURE',
        entityType: 'AdminUser',
        entityId: user.id,
        metadata: { reason: 'bad_password' },
        requestId: input.requestId,
        ipHash,
        userAgent: input.userAgent,
      });
      this.logger.warn(
        { adminUserId: user.id, requestId: input.requestId },
        'Admin login failed',
      );
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const session = await this.sessions.createSession({
      adminUserId: user.id,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    await this.users.update(user.id, { lastLoginAt: new Date() });
    await this.audit.record({
      actorAdminUserId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'AdminUser',
      entityId: user.id,
      requestId: input.requestId,
      ipHash,
      userAgent: input.userAgent,
    });

    return {
      user: toAdminUserPublic(user),
      rawToken: session.rawToken,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
  }

  async logout(input: {
    adminUserId: string;
    sessionId: string;
    requestId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    await this.sessions.revokeSession(input.sessionId);
    await this.audit.record({
      actorAdminUserId: input.adminUserId,
      action: 'LOGOUT',
      entityType: 'AdminSession',
      entityId: input.sessionId,
      requestId: input.requestId,
      ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
      userAgent: input.userAgent,
    });
  }

  async logoutAll(input: {
    adminUserId: string;
    requestId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    const count = await this.sessions.revokeAllForUser(input.adminUserId);
    await this.audit.record({
      actorAdminUserId: input.adminUserId,
      action: 'LOGOUT_ALL',
      entityType: 'AdminUser',
      entityId: input.adminUserId,
      metadata: { revokedSessions: count },
      requestId: input.requestId,
      ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
      userAgent: input.userAgent,
    });
  }

  async getMe(adminId: string): Promise<AdminUserPublic> {
    const user = await this.users.findById(adminId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication required');
    }
    return toAdminUserPublic(user);
  }
}
