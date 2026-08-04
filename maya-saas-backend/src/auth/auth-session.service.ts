import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

import { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { MembershipsService } from '../tenancy/memberships.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthClientMetadata } from './auth-client-metadata';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionRepository } from './auth-session.repository';
import { AuthSessionSystemGateway } from './auth-session-system.gateway';

type SessionPrincipal = {
  role: string;
  tenantId: string | null;
  userId: string;
};

type SessionUser = {
  id: string;
  role: string;
  status: string;
};

type SessionErrorCode =
  | 'refresh_token_invalid'
  | 'refresh_token_reused'
  | 'session_expired'
  | 'session_revoked';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly membershipsService: MembershipsService,
    private readonly tenantContext: TenantContextService,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly repository: AuthSessionRepository,
    private readonly systemGateway: AuthSessionSystemGateway,
    private readonly crmService: CrmService,
  ) {}

  async issueSession(
    user: SessionUser,
    metadata: Partial<AuthClientMetadata> = {},
    tenantId?: string | null,
  ) {
    const requestedTenantId =
      tenantId !== undefined
        ? tenantId
        : (this.tenantContext.get()?.tenantId ?? null);
    await this.assertCurrentCrmStaffAccess(user.id, requestedTenantId);
    const principal = await this.resolveCurrentPrincipal(
      user,
      requestedTenantId,
    );
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.getRefreshTtlDays() * 24 * 60 * 60 * 1000,
    );
    const sessionId = randomUUID();
    const refresh = this.createRefreshCredential(expiresAt);
    const session = await this.tenantContext.runAsAuthPrincipal(principal, () =>
      this.repository.createSession(principal, {
        id: sessionId,
        deviceLabel: this.resolveDeviceLabel(metadata.userAgent),
        ipHash: this.hashClientIp(metadata.clientIp),
        expiresAt,
        refreshCredential: refresh.credential,
      }),
    );

    return this.buildSessionTokens(
      principal,
      session.id,
      refresh.token,
      session.expiresAt,
      this.serializeSession(session, session.id),
    );
  }

  async refresh(
    refreshToken: string,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    await this.rateLimitService.assertPreflight('refresh', {
      clientIp: metadata.clientIp,
      identity: refreshToken,
    });
    const parsed = this.parseRefreshToken(refreshToken);

    if (!parsed) {
      throw this.unauthorized(
        'refresh_token_invalid',
        'Refresh token is invalid.',
      );
    }

    const credential = await this.systemGateway.findRefreshCredentialById(
      parsed.id,
    );
    const tokenHash = this.hashRefreshToken(refreshToken);

    if (!credential || !this.safeEqual(tokenHash, credential.tokenHash)) {
      throw this.unauthorized(
        'refresh_token_invalid',
        'Refresh token is invalid.',
      );
    }

    const now = new Date();
    const session = credential.session;

    if (session.revokedAt || credential.revokedAt) {
      throw this.unauthorized('session_revoked', 'Session has been revoked.');
    }

    if (
      session.expiresAt.getTime() <= now.getTime() ||
      credential.expiresAt.getTime() <= now.getTime()
    ) {
      throw this.unauthorized('session_expired', 'Session has expired.');
    }

    if (session.user.id !== session.userId) {
      throw this.unauthorized(
        'refresh_token_invalid',
        'Refresh token is invalid.',
      );
    }

    await this.assertCurrentCrmStaffAccess(session.user.id, session.tenantId);
    const principal = await this.resolveCurrentPrincipal(
      session.user,
      session.tenantId,
    );
    const next = this.createRefreshCredential(session.expiresAt);
    const outcome = await this.tenantContext.runAsAuthPrincipal(
      principal,
      async () => {
        await this.rateLimitService.assertSession('refresh', {
          tenantId: principal.tenantId,
          userId: principal.userId,
          identity: session.id,
        });

        return this.repository.rotateRefreshToken(principal, {
          currentTokenId: credential.id,
          currentTokenHash: tokenHash,
          nextCredential: next.credential,
          now,
          sessionId: session.id,
        });
      },
    );

    if (outcome === 'reused') {
      throw this.unauthorized(
        'refresh_token_reused',
        'Refresh token was already used. The session has been revoked.',
      );
    }

    if (outcome !== 'rotated') {
      throw this.unauthorized(
        'refresh_token_invalid',
        'Refresh token is invalid.',
      );
    }

    return this.buildSessionTokens(
      principal,
      session.id,
      next.token,
      session.expiresAt,
      this.serializeSession({ ...session, lastUsedAt: now }, session.id),
    );
  }

  async assertAccessSession(
    sessionId: string,
    userId: string,
    tenantId: string | null,
  ) {
    const session = await this.systemGateway.findAccessSessionById(sessionId);
    const now = Date.now();

    if (
      !session ||
      session.userId !== userId ||
      session.tenantId !== tenantId ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now
    ) {
      throw new UnauthorizedException('Session is not active');
    }

    return session;
  }

  async listSessions(user: AuthenticatedUser) {
    const principal = this.fromAuthenticatedUser(user);
    const sessions = await this.tenantContext.runAsAuthPrincipal(
      principal,
      () => this.repository.listSessions(principal),
    );

    return {
      sessions: sessions.map((session) =>
        this.serializeSession(session, user.sessionId),
      ),
    };
  }

  async logout(user: AuthenticatedUser) {
    const principal = this.fromAuthenticatedUser(user);
    const revoked = await this.tenantContext.runAsAuthPrincipal(principal, () =>
      this.repository.revokeSession(
        principal,
        user.sessionId,
        new Date(),
        'logout',
      ),
    );

    return { ok: true, revoked: revoked === 1 };
  }

  async revokeSession(user: AuthenticatedUser, sessionId: string) {
    const principal = this.fromAuthenticatedUser(user);
    const revoked = await this.tenantContext.runAsAuthPrincipal(principal, () =>
      this.repository.revokeSession(
        principal,
        sessionId,
        new Date(),
        'user_revoked',
      ),
    );

    if (revoked !== 1) {
      throw new NotFoundException('Session not found');
    }

    return { ok: true, revoked_session_id: sessionId };
  }

  async revokeAllSessions(user: AuthenticatedUser) {
    const principal = this.fromAuthenticatedUser(user);
    const revoked = await this.tenantContext.runAsAuthPrincipal(principal, () =>
      this.repository.revokeAllSessions(
        principal,
        new Date(),
        'user_revoked_all',
      ),
    );

    return { ok: true, revoked_sessions: revoked };
  }

  private async buildSessionTokens(
    principal: SessionPrincipal,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
    session: ReturnType<AuthSessionService['serializeSession']>,
  ) {
    const expiresIn = this.getAccessTtlSeconds();
    const accessToken = await this.jwtService.signAsync(
      {
        user_id: principal.userId,
        tenant_id: principal.tenantId,
        role: principal.role,
        session_id: sessionId,
      },
      { expiresIn },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_expires_at: refreshExpiresAt,
      session,
    };
  }

  private async resolveCurrentPrincipal(
    user: SessionUser,
    tenantId: string | null,
  ): Promise<SessionPrincipal> {
    if (user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    if (tenantId) {
      const membership = await this.membershipsService.getActiveMembership(
        user.id,
        tenantId,
      );

      return {
        userId: user.id,
        tenantId: membership.tenantId,
        role: membership.role,
      };
    }

    if (user.role !== 'platform_owner') {
      throw new UnauthorizedException('Platform session is not allowed');
    }

    return {
      userId: user.id,
      tenantId: null,
      role: UserRole.PLATFORM_OWNER,
    };
  }

  private async assertCurrentCrmStaffAccess(
    userId: string,
    tenantId: string | null,
  ): Promise<void> {
    if (!tenantId) return;

    await this.tenantContext.runAsSystemTenant(tenantId, () =>
      this.crmService.assertCrmStaffAccessActive(tenantId, userId),
    );
  }

  private fromAuthenticatedUser(user: AuthenticatedUser): SessionPrincipal {
    return {
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
    };
  }

  private createRefreshCredential(expiresAt: Date) {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const token = `maya_rt_${id}.${secret}`;

    return {
      token,
      credential: {
        id,
        tokenHash: this.hashRefreshToken(token),
        expiresAt,
      },
    };
  }

  private parseRefreshToken(token: string): { id: string } | null {
    const match =
      /^maya_rt_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(
        token,
      );

    return match ? { id: match[1] } : null;
  }

  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.getRefreshSecret())
      .update(token)
      .digest('hex');
  }

  private hashClientIp(ip?: string | null): string | null {
    if (!ip) {
      return null;
    }

    return createHmac('sha256', this.getMetadataSecret())
      .update(ip)
      .digest('hex');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private resolveDeviceLabel(userAgent?: string | null): string {
    const agent = String(userAgent || '');
    const device = /iPhone/i.test(agent)
      ? 'iPhone'
      : /iPad/i.test(agent)
        ? 'iPad'
        : /Android/i.test(agent)
          ? 'Android'
          : /Macintosh|Mac OS X/i.test(agent)
            ? 'Mac'
            : /Windows/i.test(agent)
              ? 'Windows'
              : /Linux/i.test(agent)
                ? 'Linux'
                : 'Unknown device';
    const browser = /Edg\//i.test(agent)
      ? 'Edge'
      : /Chrome\//i.test(agent)
        ? 'Chrome'
        : /Firefox\//i.test(agent)
          ? 'Firefox'
          : /Safari\//i.test(agent)
            ? 'Safari'
            : null;

    return browser ? `${browser} on ${device}` : device;
  }

  private serializeSession(
    session: {
      createdAt: Date;
      deviceLabel: string;
      expiresAt: Date;
      id: string;
      lastUsedAt: Date;
      revokeReason?: string | null;
      revokedAt?: Date | null;
    },
    currentSessionId: string,
  ) {
    const status = session.revokedAt
      ? 'revoked'
      : session.expiresAt.getTime() <= Date.now()
        ? 'expired'
        : 'active';

    return {
      id: session.id,
      device_name: session.deviceLabel,
      status,
      is_current: session.id === currentSessionId,
      created_at: session.createdAt,
      last_used_at: session.lastUsedAt,
      expires_at: session.expiresAt,
      revoked_at: session.revokedAt ?? null,
      revoke_reason: session.revokeReason ?? null,
    };
  }

  private getAccessTtlSeconds(): number {
    const raw = Number(
      this.configService.get<string>('JWT_ACCESS_TTL_SECONDS'),
    );

    return Number.isFinite(raw) && raw >= 300 && raw <= 3600 ? raw : 900;
  }

  private getRefreshTtlDays(): number {
    const raw = Number(
      this.configService.get<string>('AUTH_REFRESH_TOKEN_TTL_DAYS'),
    );

    return Number.isFinite(raw) && raw >= 1 && raw <= 90 ? raw : 30;
  }

  private getRefreshSecret(): string {
    return (
      this.configService.get<string>('AUTH_REFRESH_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-refresh-token-secret'
    );
  }

  private getMetadataSecret(): string {
    return (
      this.configService.get<string>('AUTH_SESSION_METADATA_SECRET') ||
      this.getRefreshSecret()
    );
  }

  private unauthorized(code: SessionErrorCode, message: string) {
    return new UnauthorizedException({
      message,
      error: { code, message },
    });
  }
}
