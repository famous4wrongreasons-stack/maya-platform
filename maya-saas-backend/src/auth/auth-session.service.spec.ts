import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { MembershipsService } from '../tenancy/memberships.service';
import { Package5Wave2CanonicalCutoverService } from '../package5-wave2/package5-wave2-canonical-cutover.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionRepository } from './auth-session.repository';
import { AuthSessionService } from './auth-session.service';
import { AuthSessionSystemGateway } from './auth-session-system.gateway';

describe('AuthSessionService', () => {
  type Principal = {
    userId: string;
    tenantId: string | null;
    role: string;
  };

  type CreateSessionParams = {
    deviceLabel: string;
    expiresAt: Date;
    id: string;
    ipHash: string | null;
    refreshCredential: {
      id: string;
      tokenHash: string;
      expiresAt: Date;
    };
  };

  const refreshSecret = 'test-refresh-secret';
  const tenantUser = {
    id: 'user-a',
    tenantId: 'tenant-a',
    role: UserRole.CLIENT,
    status: 'active',
  };

  const createService = () => {
    const config: Record<string, string> = {
      JWT_SECRET: 'jwt-secret',
      JWT_ACCESS_TTL_SECONDS: '900',
      AUTH_REFRESH_TOKEN_TTL_DAYS: '30',
      AUTH_REFRESH_TOKEN_SECRET: refreshSecret,
      AUTH_SESSION_METADATA_SECRET: 'metadata-secret',
    };
    const signAsyncMock: jest.MockedFunction<
      (
        payload: Record<string, string | null>,
        options: { expiresIn: number },
      ) => Promise<string>
    > = jest.fn().mockResolvedValue('signed-access-token');
    const getActiveMembershipMock = jest.fn().mockResolvedValue({
      id: 'membership-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
      status: 'active',
    });
    const createSessionMock: jest.MockedFunction<
      (
        principal: Principal,
        params: CreateSessionParams,
      ) => Promise<{
        id: string;
        deviceLabel: string;
        createdAt: Date;
        lastUsedAt: Date;
        expiresAt: Date;
        revokedAt: null;
        revokeReason: null;
      }>
    > = jest
      .fn()
      .mockImplementation(
        (_principal: Principal, params: CreateSessionParams) =>
          Promise.resolve({
            id: params.id,
            deviceLabel: params.deviceLabel,
            createdAt: new Date(),
            lastUsedAt: new Date(),
            expiresAt: params.expiresAt,
            revokedAt: null,
            revokeReason: null,
          }),
      );
    const rotateRefreshTokenMock = jest.fn().mockResolvedValue('rotated');
    const listSessionsMock = jest.fn().mockResolvedValue([]);
    const revokeSessionMock = jest.fn().mockResolvedValue(1);
    const revokeAllSessionsMock = jest.fn().mockResolvedValue(2);
    const findRefreshCredentialMock = jest.fn().mockResolvedValue(null);
    const findAccessSessionMock = jest.fn().mockResolvedValue(null);
    const rateLimitPreflightMock = jest.fn().mockResolvedValue(undefined);
    const rateLimitSessionMock = jest.fn().mockResolvedValue(undefined);
    const assertCrmStaffAccessMock = jest.fn().mockResolvedValue(undefined);
    const auditTryLogMock = jest.fn().mockResolvedValue(undefined);
    const auditTryLogPlatformMock = jest.fn().mockResolvedValue(undefined);
    const canonicalExecuteMock = jest.fn().mockResolvedValue({});
    const tenantContext = new TenantContextService();
    const service = new AuthSessionService(
      {
        get: jest.fn((key: string) => config[key]),
      } as unknown as ConfigService,
      { signAsync: signAsyncMock } as unknown as JwtService,
      {
        getActiveMembership: getActiveMembershipMock,
      } as unknown as MembershipsService,
      tenantContext,
      {
        assertPreflight: rateLimitPreflightMock,
        assertSession: rateLimitSessionMock,
      } as unknown as AuthRateLimitService,
      {
        createSession: createSessionMock,
        rotateRefreshToken: rotateRefreshTokenMock,
        listSessions: listSessionsMock,
        revokeSession: revokeSessionMock,
        revokeAllSessions: revokeAllSessionsMock,
      } as unknown as AuthSessionRepository,
      {
        findRefreshCredentialById: findRefreshCredentialMock,
        findAccessSessionById: findAccessSessionMock,
      } as unknown as AuthSessionSystemGateway,
      {
        assertCrmStaffAccessActive: assertCrmStaffAccessMock,
      } as unknown as CrmService,
      {
        tryLog: auditTryLogMock,
        tryLogPlatformAction: auditTryLogPlatformMock,
      } as unknown as AuditLogService,
      {
        execute: canonicalExecuteMock,
      } as unknown as Package5Wave2CanonicalCutoverService,
    );

    return {
      service,
      tenantContext,
      mocks: {
        auditTryLogMock,
        auditTryLogPlatformMock,
        createSessionMock,
        assertCrmStaffAccessMock,
        findAccessSessionMock,
        findRefreshCredentialMock,
        getActiveMembershipMock,
        listSessionsMock,
        rateLimitPreflightMock,
        rateLimitSessionMock,
        revokeAllSessionsMock,
        revokeSessionMock,
        rotateRefreshTokenMock,
        signAsyncMock,
        canonicalExecuteMock,
      },
    };
  };

  const buildRefreshFixture = () => {
    const tokenId = '11111111-1111-4111-8111-111111111111';
    const token = `maya_rt_${tokenId}.${'a'.repeat(43)}`;
    const tokenHash = createHmac('sha256', refreshSecret)
      .update(token)
      .digest('hex');
    const now = Date.now();

    return {
      token,
      tokenId,
      record: {
        id: tokenId,
        sessionId: 'session-a',
        tokenHash,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        consumedAt: null,
        revokedAt: null,
        createdAt: new Date(now - 60 * 1000),
        session: {
          id: 'session-a',
          tenantId: 'tenant-a',
          userId: 'user-a',
          deviceLabel: 'Safari on iPhone',
          ipHash: 'ip-hash',
          expiresAt: new Date(now + 24 * 60 * 60 * 1000),
          lastUsedAt: new Date(now - 60 * 1000),
          revokedAt: null,
          revokeReason: null,
          createdAt: new Date(now - 60 * 1000),
          updatedAt: new Date(now - 60 * 1000),
          user: tenantUser,
        },
      },
    };
  };

  it('issues a short access token and persists only a refresh-token hash', async () => {
    const { service, mocks } = createService();

    const result = await service.issueSession(
      tenantUser,
      {
        clientIp: '203.0.113.10',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1',
      },
      'tenant-a',
    );

    expect(result.access_token).toBe('signed-access-token');
    expect(result.refresh_token).toMatch(
      /^maya_rt_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(result.expires_in).toBe(900);
    const createArgs = mocks.createSessionMock.mock.calls[0];

    expect(createArgs?.[0]).toEqual({
      userId: 'user-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
    });
    expect(mocks.assertCrmStaffAccessMock).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
    const createParams = createArgs?.[1];
    expect(createParams?.deviceLabel).toBe('Safari on iPhone');
    expect(createParams?.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createParams?.refreshCredential.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(createParams)).not.toContain(result.refresh_token);
    const signArgs = mocks.signAsyncMock.mock.calls[0];
    expect(signArgs?.[0]).toMatchObject({
      user_id: 'user-a',
      tenant_id: 'tenant-a',
      role: UserRole.CLIENT,
    });
    expect(typeof signArgs?.[0].session_id).toBe('string');
    expect(signArgs?.[1]).toEqual({ expiresIn: 900 });
  });

  it('does not infer a tenant session from legacy User.tenantId', async () => {
    const { service, mocks } = createService();

    await expect(service.issueSession(tenantUser)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it('does not issue a session when CRM staff access was disabled', async () => {
    const { service, mocks } = createService();
    mocks.assertCrmStaffAccessMock.mockRejectedValueOnce(
      new UnauthorizedException({
        error: { code: 'crm_staff_access_disabled' },
      }),
    );

    await expect(
      service.issueSession(tenantUser, {}, 'tenant-a'),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_staff_access_disabled' } },
    });
    expect(mocks.getActiveMembershipMock).not.toHaveBeenCalled();
    expect(mocks.createSessionMock).not.toHaveBeenCalled();
    expect(mocks.signAsyncMock).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token and returns a new credential', async () => {
    const { service, mocks } = createService();
    const fixture = buildRefreshFixture();
    mocks.findRefreshCredentialMock.mockResolvedValue(fixture.record);

    const result = await service.refresh(fixture.token);

    expect(result.refresh_token).not.toBe(fixture.token);
    expect(mocks.rotateRefreshTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a', tenantId: 'tenant-a' }),
      expect.objectContaining({
        currentTokenId: fixture.tokenId,
        currentTokenHash: fixture.record.tokenHash,
        sessionId: 'session-a',
      }),
    );
    expect(mocks.rateLimitPreflightMock).toHaveBeenCalledWith('refresh', {
      clientIp: undefined,
      identity: fixture.token,
    });
    expect(mocks.rateLimitSessionMock).toHaveBeenCalledWith('refresh', {
      tenantId: 'tenant-a',
      userId: 'user-a',
      identity: 'session-a',
    });
    expect(mocks.assertCrmStaffAccessMock).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
    expect(result.session).toMatchObject({
      id: 'session-a',
      is_current: true,
      status: 'active',
    });
  });

  it('revokes the session response path when a token is reused', async () => {
    const { service, mocks } = createService();
    const fixture = buildRefreshFixture();
    mocks.findRefreshCredentialMock.mockResolvedValue(fixture.record);
    mocks.rotateRefreshTokenMock.mockResolvedValue('reused');

    await expect(service.refresh(fixture.token)).rejects.toMatchObject({
      response: {
        error: { code: 'refresh_token_reused' },
      },
    });
    expect(mocks.signAsyncMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed token before any database lookup', async () => {
    const { service, mocks } = createService();

    await expect(service.refresh('not-a-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.findRefreshCredentialMock).not.toHaveBeenCalled();
  });

  it('rejects a revoked access session', async () => {
    const { service, mocks } = createService();
    mocks.findAccessSessionMock.mockResolvedValue({
      id: 'session-a',
      userId: 'user-a',
      tenantId: 'tenant-a',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(
      service.assertAccessSession('session-a', 'user-a', 'tenant-a'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues a platform session without a tenant membership lookup', async () => {
    const { service, mocks } = createService();

    const result = await service.issueSession({
      id: 'platform-owner',
      tenantId: null,
      role: UserRole.PLATFORM_OWNER,
      status: 'active',
    });

    expect(result.access_token).toBe('signed-access-token');
    expect(mocks.getActiveMembershipMock).not.toHaveBeenCalled();
    expect(mocks.createSessionMock.mock.calls[0]?.[0]).toEqual({
      userId: 'platform-owner',
      tenantId: null,
      role: UserRole.PLATFORM_OWNER,
    });
  });

  it('lists sessions and marks the access-token session as current', async () => {
    const { service, mocks } = createService();
    mocks.listSessionsMock.mockResolvedValue([
      {
        id: 'session-a',
        deviceLabel: 'Chrome on Windows',
        createdAt: new Date('2026-07-11T12:00:00.000Z'),
        lastUsedAt: new Date('2026-07-11T12:05:00.000Z'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        revokeReason: null,
      },
    ]);

    const result = await service.listSessions({
      userId: 'user-a',
      sessionId: 'session-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
      email: 'client@example.test',
      branchId: null,
      membershipId: 'membership-a',
      membershipStatus: 'active',
    });

    expect(result.sessions[0]).toMatchObject({
      id: 'session-a',
      is_current: true,
      status: 'active',
    });
  });

  it('leaves an audit trail when a session ends', async () => {
    // Раньше выход не оставлял ни строки: менялся только revokeReason самой
    // сессии, а ретенция её удаляла. Доказать факт входа и его источник спустя
    // две недели было нечем.
    const { service, mocks } = createService();

    await service.logout({
      userId: 'user-a',
      sessionId: 'session-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
      email: 'client@example.test',
      branchId: null,
      membershipId: 'membership-a',
      membershipStatus: 'active',
    });

    expect(mocks.auditTryLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        action: 'auth.logout',
        entityType: 'auth_session',
        entityId: 'session-a',
      }),
    );
    expect(mocks.auditTryLogPlatformMock).not.toHaveBeenCalled();
  });

  it('records the platform owner without inventing a tenant', async () => {
    // У владельца платформы арендатора нет. Служебный арендатор положил бы его
    // вход в историю чужого салона, поэтому запись обязана быть платформенной.
    const { service, mocks } = createService();

    await service.logout({
      userId: 'platform-owner-1',
      sessionId: 'session-p',
      tenantId: null,
      role: UserRole.PLATFORM_OWNER,
      email: 'owner@maya.local',
      branchId: null,
      membershipId: null,
      membershipStatus: null,
    });

    expect(mocks.auditTryLogPlatformMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'platform-owner-1',
        action: 'auth.logout',
        entityId: 'session-p',
      }),
    );
    expect(mocks.auditTryLogMock).not.toHaveBeenCalled();
  });

  it('revokes every session owned by the authenticated principal', async () => {
    const { service, mocks } = createService();
    mocks.listSessionsMock.mockResolvedValueOnce([
      { id: 'session-a', revokedAt: null },
      { id: 'session-b', revokedAt: null },
    ]);
    const result = await service.revokeAllSessions({
      userId: 'user-a',
      sessionId: 'session-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
      email: 'client@example.test',
      branchId: null,
      membershipId: 'membership-a',
      membershipStatus: 'active',
    });

    expect(result).toEqual({ ok: true, revoked_sessions: 2 });
    expect(mocks.canonicalExecuteMock).toHaveBeenCalledWith(
      'tenant-a',
      { userId: 'user-a' },
      { operation: 'revoke_all_sessions', currentSessionId: 'session-a' },
    );
    expect(mocks.revokeAllSessionsMock).not.toHaveBeenCalled();
  });
});
