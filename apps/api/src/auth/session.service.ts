import { Injectable } from '@nestjs/common';
import { permissionsForRole } from '@bouquet-one/contracts';
import { AppConfigService } from '../config/app-config.service';
import {
  generateSessionToken,
  hashIp,
  hashSessionToken,
} from './crypto.util';
import type { AuthenticatedAdmin } from './current-admin.decorator';
import { SessionsRepository } from './sessions.repository';

@Injectable()
export class SessionService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly appConfig: AppConfigService,
  ) {}

  async createSession(input: {
    adminUserId: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ rawToken: string; sessionId: string; expiresAt: Date; absoluteExpiresAt: Date }> {
    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.appConfig.sessionAbsoluteTtlSeconds * 1000,
    );
    const idleExpiresAt = new Date(now.getTime() + this.appConfig.sessionIdleTtlSeconds * 1000);
    const expiresAt =
      absoluteExpiresAt < idleExpiresAt ? absoluteExpiresAt : idleExpiresAt;

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const session = await this.sessions.create({
      adminUserId: input.adminUserId,
      tokenHash,
      expiresAt: absoluteExpiresAt,
      lastUsedAt: now,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      ipHash: hashIp(input.ip, this.appConfig.sessionHmacSecret),
    });

    return {
      rawToken,
      sessionId: session.id,
      expiresAt,
      absoluteExpiresAt,
    };
  }

  async resolveSession(
    rawToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<AuthenticatedAdmin | null> {
    const tokenHash = hashSessionToken(rawToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    if (!session || session.revokedAt) {
      return null;
    }

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      return null;
    }

    const idleDeadline =
      session.lastUsedAt.getTime() + this.appConfig.sessionIdleTtlSeconds * 1000;
    if (idleDeadline <= now) {
      await this.sessions.revoke(session.id, new Date());
      return null;
    }

    if (session.adminUser.status !== 'ACTIVE') {
      await this.sessions.revoke(session.id, new Date());
      return null;
    }

    const throttleMs = this.appConfig.sessionLastUsedThrottleSeconds * 1000;
    if (now - session.lastUsedAt.getTime() >= throttleMs) {
      await this.sessions.touchLastUsed(session.id, new Date());
    }

    void meta;

    return {
      id: session.adminUser.id,
      email: session.adminUser.email,
      displayName: session.adminUser.displayName,
      role: session.adminUser.role,
      permissions: permissionsForRole(session.adminUser.role),
      sessionId: session.id,
      sessionExpiresAt: new Date(
        Math.min(
          session.expiresAt.getTime(),
          session.lastUsedAt.getTime() + this.appConfig.sessionIdleTtlSeconds * 1000,
        ),
      ),
      sessionAbsoluteExpiresAt: session.expiresAt,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, new Date());
  }

  async revokeAllForUser(adminUserId: string): Promise<number> {
    return this.sessions.revokeAllForUser(adminUserId, new Date());
  }
}
