import { ConfigService } from '@nestjs/config';

import type {
  ActionEngineRuntimeService,
  TrustedActionExecutionRequestV1,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { P410CommerceCredentialShadowService } from './p4-10-commerce-credential-shadow.service';

describe('P410CommerceCredentialShadowService', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');

  function setup(hasIntegration: boolean) {
    const encryption = new EncryptionService(
      new ConfigService({
        CRM_ENCRYPTION_KEY: 'p4-10-shadow-test-key-material'.repeat(3),
      }),
    );
    const integration = hasIntegration
      ? {
          id: 'commerce_a',
          tenantId: 'tenant_a',
          provider: 'yookassa',
          encryptedShopId: encryption.encrypt('shop-old'),
          encryptedSecretKey: encryption.encrypt('secret-old'),
          status: 'active',
          verifiedAt: now,
          lastCheckedAt: now,
          lastErrorCode: null,
          lastErrorAt: null,
        }
      : null;
    const plannedRequests: TrustedActionExecutionRequestV1[] = [];
    const planShadow = jest.fn((request: TrustedActionExecutionRequestV1) => {
      plannedRequests.push(request);
      return Promise.resolve({ id: 'shadow_execution_1' });
    });
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership_a',
          role: 'tenant_owner',
          status: 'active',
        }),
      },
      commerceIntegration: {
        findUnique: jest.fn().mockResolvedValue(integration),
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new P410CommerceCredentialShadowService(
      { planShadow } as unknown as ActionEngineRuntimeService,
      prisma,
      tenantContext,
      encryption,
    );
    return { service, planShadow, plannedRequests, prisma, tenantContext };
  }

  it.each([
    ['connect', false, { shopId: 'shop-new', secretKey: 'secret-new' }],
    ['replace', true, { shopId: 'shop-new', secretKey: 'secret-new' }],
    ['recheck', true, {}],
    ['disconnect', true, {}],
  ] as const)(
    'plans %s without credential, provider, payment, or value side effects',
    async (operation, hasIntegration, credentials) => {
      const current = setup(hasIntegration);
      const result = await current.tenantContext.runAsSystemTenant(
        'tenant_a',
        () =>
          current.service.plan('tenant_a', 'user_a', {
            sourceIntentRef: `intent-${operation}`,
            operation,
            ...credentials,
          }),
      );
      expect(result).toMatchObject({
        outcome: 'planned',
        shadowDivergences: 0,
        credentialMutations: 0,
        providerWrites: 0,
        paymentMutations: 0,
        customerValueMutations: 0,
      });
      const request = current.plannedRequests[0];
      const serialized = JSON.stringify(request);
      expect(serialized).not.toContain('shop-new');
      expect(serialized).not.toContain('secret-new');
      expect(serialized).not.toContain('secret-old');
      expect(request.input).toMatchObject({
        provider: 'yookassa',
        oneTenantCount: 1,
        oneProviderCount: 1,
        bulkMutation: false,
        credentialWritePerformed: false,
        providerWrites: 0,
      });
    },
  );

  it('derives stable retry/restart identity from the same exact facts', async () => {
    const first = setup(false);
    const second = setup(false);
    await first.tenantContext.runAsSystemTenant('tenant_a', () =>
      first.service.plan('tenant_a', 'user_a', {
        sourceIntentRef: 'same-intent',
        operation: 'connect',
        shopId: 'shop-new',
        secretKey: 'secret-new',
      }),
    );
    await second.tenantContext.runAsSystemTenant('tenant_a', () =>
      second.service.plan('tenant_a', 'user_a', {
        sourceIntentRef: 'same-intent',
        operation: 'connect',
        shopId: 'shop-new',
        secretKey: 'secret-new',
      }),
    );
    expect(first.plannedRequests[0]).toEqual(second.plannedRequests[0]);
  });

  it('fails closed across tenant and transition boundaries', async () => {
    const current = setup(false);
    await expect(
      current.tenantContext.runAsSystemTenant('tenant_a', () =>
        current.service.plan('tenant_a', 'user_a', {
          sourceIntentRef: 'wrong-state',
          operation: 'recheck',
        }),
      ),
    ).rejects.toThrow('not configured');
    const crossTenant = setup(false);
    await expect(
      crossTenant.tenantContext.runAsSystemTenant('tenant_b', () =>
        crossTenant.service.plan('tenant_a', 'user_a', {
          sourceIntentRef: 'cross-tenant',
          operation: 'connect',
          shopId: 'shop-new',
          secretKey: 'secret-new',
        }),
      ),
    ).rejects.toThrow();
  });

  it('ignores forged actor/policy fields and rejects raw material on read/delete actions', async () => {
    const current = setup(true);
    const mutation = {
      sourceIntentRef: 'forged-authority',
      operation: 'recheck' as const,
      actorRole: 'platform_owner',
      approved: true,
    };
    const result = await current.tenantContext.runAsSystemTenant(
      'tenant_a',
      () => current.service.plan('tenant_a', 'user_a', mutation as never),
    );
    expect(result.outcome).toBe('planned');
    const input = current.plannedRequests[0].input as Record<string, unknown>;
    expect(input.actorRole).toBe('tenant_owner');
    expect(input).not.toHaveProperty('approved');

    await expect(
      current.tenantContext.runAsSystemTenant('tenant_a', () =>
        current.service.plan('tenant_a', 'user_a', {
          sourceIntentRef: 'raw-on-disconnect',
          operation: 'disconnect',
          shopId: 'forged',
        }),
      ),
    ).rejects.toThrow('Raw credentials are not accepted');
  });
});
