import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { EmailAuthDeliveryService } from './email-auth-delivery.service';
import { EmailAuthService } from './email-auth.service';
import { TenantAuthRepository } from './tenant-auth.repository';

describe('EmailAuthService', () => {
  type UpsertEmailChallenge = (args: {
    codeHash: string;
    email: string;
    expiresAt: Date;
  }) => Promise<void>;

  const tenant = {
    id: 'tenant-1',
    slug: 'artem-studio',
    status: 'trial',
    trialFullAccess: true,
    trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1_000),
  };
  const owner = {
    id: 'user-1',
    tenantId: tenant.id,
    email: 'owner@example.test',
    role: UserRole.TENANT_ADMIN,
    status: 'active',
  };
  const emailCodeHash = () =>
    createHmac('sha256', 'email-secret')
      .update([tenant.id, owner.email, '123456'].join('\0'))
      .digest('hex');

  const createService = () => {
    const config: Record<string, string> = {
      NODE_ENV: 'test',
      EMAIL_LOGIN_ENABLED: 'true',
      EMAIL_AUTH_FIXED_CODE: '123456',
      EMAIL_AUTH_SECRET: 'email-secret',
      EMAIL_AUTH_CODE_TTL: '300',
      EMAIL_AUTH_RESEND_COOLDOWN_SECONDS: '60',
      EMAIL_AUTH_MAX_ATTEMPTS: '5',
    };
    const tenantContext = new TenantContextService();
    const upsertEmailChallenge: jest.MockedFunction<UpsertEmailChallenge> = jest
      .fn()
      .mockResolvedValue(undefined);
    const findEmailChallenge = jest.fn().mockResolvedValue(null);
    const recordInvalidEmailAttempt = jest.fn().mockResolvedValue(1);
    const claimEmailChallenge = jest.fn().mockResolvedValue(true);
    const findTenantUserByEmail = jest.fn().mockResolvedValue(owner);
    const serializeUser = jest.fn((user: unknown) => user);
    const issueSession = jest.fn().mockResolvedValue({
      access_token: 'jwt-token',
      refresh_token: 'refresh-token',
    });
    const assertPreflight = jest.fn().mockResolvedValue(undefined);
    const assertTenant = jest.fn().mockResolvedValue(undefined);
    const deliverCode = jest.fn().mockResolvedValue({
      delivery: 'debug',
      debug_code: '123456',
    });
    const getDeliveryType = jest.fn().mockReturnValue('debug');
    const getTenantBySlugOrThrow = jest.fn().mockResolvedValue(tenant);
    const service = new EmailAuthService(
      {
        get: jest.fn((key: string) => config[key]),
      } as unknown as ConfigService,
      {
        findTenantUserByEmail,
        serializeUser,
      } as unknown as UsersService,
      { getTenantBySlugOrThrow } as unknown as TenantsService,
      { deliverCode, getDeliveryType } as unknown as EmailAuthDeliveryService,
      tenantContext,
      {
        upsertEmailChallenge,
        findEmailChallenge,
        recordInvalidEmailAttempt,
        claimEmailChallenge,
      } as unknown as TenantAuthRepository,
      { assertPreflight, assertTenant } as unknown as AuthRateLimitService,
      { issueSession } as unknown as AuthSessionService,
    );

    return {
      config,
      service,
      tenantContext,
      mocks: {
        assertPreflight,
        assertTenant,
        claimEmailChallenge,
        deliverCode,
        findEmailChallenge,
        findTenantUserByEmail,
        getTenantBySlugOrThrow,
        getDeliveryType,
        issueSession,
        recordInvalidEmailAttempt,
        serializeUser,
        upsertEmailChallenge,
      },
    };
  };

  it('starts a tenant-scoped code challenge without exposing user existence', async () => {
    const { service, tenantContext, mocks } = createService();

    const result = await service.start(
      { tenantSlug: tenant.slug, email: ' Owner@Example.Test ' },
      { clientIp: '203.0.113.10' },
    );
    const expectedHash = emailCodeHash();

    expect(result).toMatchObject({
      ok: true,
      tenant_slug: tenant.slug,
      email: owner.email,
      delivery: 'debug',
      debug_code: '123456',
      retry_after_seconds: 60,
      next_step: 'verify_email_code',
    });
    expect(result).not.toHaveProperty('user_exists');
    const challenge = mocks.upsertEmailChallenge.mock.calls[0]?.[0];
    expect(challenge).toMatchObject({
      email: owner.email,
      codeHash: expectedHash,
    });
    expect(challenge.expiresAt).toBeInstanceOf(Date);
    expect(mocks.deliverCode).toHaveBeenCalledWith({
      email: owner.email,
      code: '123456',
      expiresInMinutes: 5,
    });
    expect(mocks.assertPreflight).toHaveBeenCalledWith('email_start', {
      clientIp: '203.0.113.10',
      identity: JSON.stringify([tenant.slug, owner.email]),
    });
    expect(mocks.assertTenant).toHaveBeenCalledWith('email_start', {
      tenantId: tenant.id,
      identity: owner.email,
    });
    expect(tenantContext.get()).toBeUndefined();
  });

  it('verifies an owner code in trial and issues a normal session', async () => {
    const { service, mocks } = createService();
    const codeHash = emailCodeHash();
    mocks.findEmailChallenge.mockResolvedValue({
      id: 'email-challenge-1',
      tenantId: tenant.id,
      email: owner.email,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
    });

    const result = await service.verify({
      tenantSlug: tenant.slug,
      email: owner.email,
      code: '123456',
    });

    expect(mocks.claimEmailChallenge).toHaveBeenCalledWith(
      'email-challenge-1',
      codeHash,
      expect.any(Date),
    );
    expect(mocks.issueSession).toHaveBeenCalledWith(owner, {});
    expect(mocks.serializeUser).toHaveBeenCalledWith(owner);
    expect(result).toMatchObject({ access_token: 'jwt-token', user: owner });
  });

  it('atomically counts an invalid code and never issues a session', async () => {
    const { service, mocks } = createService();
    const codeHash = emailCodeHash();
    mocks.findEmailChallenge.mockResolvedValue({
      id: 'email-challenge-1',
      codeHash,
      attempts: 1,
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
    });
    mocks.recordInvalidEmailAttempt.mockResolvedValue(2);

    await expect(
      service.verify({
        tenantSlug: tenant.slug,
        email: owner.email,
        code: '000000',
      }),
    ).rejects.toMatchObject<BadRequestException>({
      response: {
        error: {
          code: 'email_code_invalid',
          remaining_attempts: 3,
        },
      },
    });
    expect(mocks.recordInvalidEmailAttempt).toHaveBeenCalledWith(
      'email-challenge-1',
      codeHash,
      expect.any(Date),
      5,
    );
    expect(mocks.claimEmailChallenge).not.toHaveBeenCalled();
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it('rejects client email login after an unpaid trial expires', async () => {
    const { service, mocks } = createService();
    const codeHash = emailCodeHash();
    mocks.getTenantBySlugOrThrow.mockResolvedValue({
      ...tenant,
      status: 'past_due',
      trialFullAccess: false,
      trialEndsAt: new Date(Date.now() - 60_000),
      currentPeriodEnd: null,
    });
    mocks.findTenantUserByEmail.mockResolvedValue({
      ...owner,
      role: UserRole.CLIENT,
    });
    mocks.findEmailChallenge.mockResolvedValue({
      id: 'email-challenge-1',
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
    });

    await expect(
      service.verify({
        tenantSlug: tenant.slug,
        email: owner.email,
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it('fails closed while email login is disabled', async () => {
    const { config, service, mocks } = createService();
    config.EMAIL_LOGIN_ENABLED = 'false';

    await expect(
      service.start({ tenantSlug: tenant.slug, email: owner.email }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.upsertEmailChallenge).not.toHaveBeenCalled();
  });
});
