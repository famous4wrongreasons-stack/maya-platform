import { ConfigService } from '@nestjs/config';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthRateLimitException } from './auth-rate-limit.exception';
import {
  AuthRateLimitRepository,
  AuthRateLimitRuleInput,
} from './auth-rate-limit.repository';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const createService = () => {
    const consumeMock: jest.MockedFunction<
      (
        rules: AuthRateLimitRuleInput[],
        now: Date,
      ) => Promise<{
        allowed: boolean;
        retryAfterSeconds: number;
        violatedPolicyKeys: string[];
      }>
    > = jest.fn().mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      violatedPolicyKeys: [],
    });
    const tenantContext = new TenantContextService();
    const service = new AuthRateLimitService(
      {
        get: jest.fn((key: string) =>
          key === 'AUTH_RATE_LIMIT_SECRET'
            ? 'rate-limit-test-secret'
            : undefined,
        ),
      } as unknown as ConfigService,
      tenantContext,
      { consume: consumeMock } as unknown as AuthRateLimitRepository,
    );

    return { consumeMock, service, tenantContext };
  };

  it('hashes preflight IP and identity without persisting raw values', async () => {
    const { consumeMock, service } = createService();

    await service.assertPreflight('password_login', {
      clientIp: '::ffff:203.0.113.40',
      identity: 'demo-salon:client@example.test',
    });

    const rules = consumeMock.mock.calls[0]?.[0] ?? [];
    expect(rules).toHaveLength(2);
    expect(rules.map((rule) => rule.scope).sort()).toEqual(['identity', 'ip']);
    expect(rules.every((rule) => /^[0-9a-f]{64}$/.test(rule.subjectHash))).toBe(
      true,
    );
    expect(JSON.stringify(rules)).not.toContain('203.0.113.40');
    expect(JSON.stringify(rules)).not.toContain('client@example.test');
    expect(rules.every((rule) => rule.tenantId === null)).toBe(true);
  });

  it('builds tenant and identity budgets only inside the resolved tenant', async () => {
    const { consumeMock, service, tenantContext } = createService();

    await tenantContext.runAsPublicTenant('tenant-a', () =>
      service.assertTenant('registration', {
        tenantId: 'tenant-a',
        identity: 'client@example.test',
      }),
    );

    const rules = consumeMock.mock.calls[0]?.[0] ?? [];
    expect(rules).toHaveLength(2);
    expect(rules.map((rule) => rule.scope).sort()).toEqual([
      'identity',
      'tenant',
    ]);
    expect(rules.every((rule) => rule.tenantId === 'tenant-a')).toBe(true);

    expect(() =>
      tenantContext.runAsPublicTenant('tenant-a', () =>
        service.assertTenant('registration', {
          tenantId: 'tenant-b',
          identity: 'client@example.test',
        }),
      ),
    ).toThrow('Cross-tenant access is not allowed');
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });

  it('enforces both the 60-second SMS cooldown and longer phone budget', async () => {
    const { consumeMock, service, tenantContext } = createService();

    await tenantContext.runAsPublicTenant('tenant-a', () =>
      service.assertTenant('phone_start', {
        tenantId: 'tenant-a',
        identity: '+79990000000',
      }),
    );

    const rules = consumeMock.mock.calls[0]?.[0] ?? [];
    expect(rules).toHaveLength(3);
    expect(
      rules
        .filter((rule) => rule.scope === 'identity')
        .map((rule) => [rule.maxAttempts, rule.windowSeconds])
        .sort((left, right) => left[1] - right[1]),
    ).toEqual([
      [1, 60],
      [5, 600],
    ]);
  });

  it('binds refresh session budgets to the authenticated principal', async () => {
    const { consumeMock, service, tenantContext } = createService();

    await tenantContext.runAsAuthPrincipal(
      {
        userId: 'platform-owner',
        tenantId: null,
        role: 'platform_owner',
      },
      () =>
        service.assertSession('refresh', {
          userId: 'platform-owner',
          tenantId: null,
          identity: 'session-a',
        }),
    );

    const rules = consumeMock.mock.calls[0]?.[0] ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      action: 'refresh',
      scope: 'identity',
      tenantId: null,
    });
  });

  it('returns one stable 429 contract with the longest retry window', async () => {
    const { consumeMock, service } = createService();
    consumeMock.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 47.2,
      violatedPolicyKeys: ['auth.password_login.preflight.identity.15m'],
    });

    await expect(
      service.assertPreflight('password_login', {
        identity: 'demo-salon:client@example.test',
      }),
    ).rejects.toMatchObject<AuthRateLimitException>({
      retryAfterSeconds: 48,
      response: {
        error: {
          code: 'auth_rate_limited',
          retry_after_seconds: 48,
        },
      },
      status: 429,
    });
  });
});
