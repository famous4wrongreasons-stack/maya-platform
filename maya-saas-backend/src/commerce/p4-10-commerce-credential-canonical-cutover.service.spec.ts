import { ConfigService } from '@nestjs/config';

import type { TrustedActionExecutionRequestV1 } from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { P410CommerceCredentialCanonicalCutoverService } from './p4-10-commerce-credential-canonical-cutover.service';
import type {
  P410CommerceCredentialExecutableService,
  P410ExecutionValue,
} from './p4-10-commerce-credential-executable.service';
import type { P410CommerceCredentialShadowService } from './p4-10-commerce-credential-shadow.service';

describe('P410CommerceCredentialCanonicalCutoverService', () => {
  function setup(options: { integration?: boolean; existing?: boolean } = {}) {
    const encryption = new EncryptionService(
      new ConfigService({
        CRM_ENCRYPTION_KEY: 'p4-10-cutover-test-encryption-key'.repeat(3),
      }),
    );
    const integration = options.integration
      ? {
          id: 'integration-a',
          tenantId: 'tenant-a',
          provider: 'yookassa',
          encryptedShopId: encryption.encrypt('shop-old'),
          encryptedSecretKey: encryption.encrypt('secret-old'),
          status: 'active',
          verifiedAt: new Date('2026-09-03T12:00:00.000Z'),
          lastCheckedAt: new Date('2026-09-03T12:00:00.000Z'),
          lastErrorCode: null,
          lastErrorAt: null,
        }
      : null;
    const findExecution = jest
      .fn()
      .mockResolvedValue(
        options.existing ? { id: 'execution-a', actorUserId: 'owner-a' } : null,
      );
    const findIntegration = jest.fn().mockResolvedValue(integration);
    const prisma = {
      actionExecution: { findFirst: findExecution },
      commerceIntegration: { findUnique: findIntegration },
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'active',
          role: 'tenant_owner',
        }),
      },
    } as unknown as PrismaService;
    const buildRequest = jest
      .fn()
      .mockImplementation(
        (_tenantId, _actorUserId, mutation: { operation: string }) =>
          Promise.resolve({
            request: {
              capability: `commerce-credentials.${mutation.operation}.execute.v1`,
            } as TrustedActionExecutionRequestV1,
            material:
              mutation.operation === 'connect' ||
              mutation.operation === 'replace'
                ? { shopId: 'shop-new', secretKey: 'secret-new' }
                : null,
          }),
      );
    const fingerprints = (shopId: string, secretKey: string) => ({
      shop: encryption.opaqueReference('p4-10.yookassa-shop-id', shopId),
      set: encryption.opaqueReference(
        'p4-10.yookassa-credential-set',
        `${shopId}\u0000${secretKey}`,
      ),
    });
    const planner = {
      buildRequest,
      credentialFingerprints: jest.fn(fingerprints),
    } as unknown as P410CommerceCredentialShadowService;
    const value = {
      actionClass: 'connect_commerce_payment_credentials',
      actionExecutionId: 'execution-a',
      integrationId: 'integration-a',
      connectionState: 'active',
      verificationOutcome: 'ACCEPTED',
      verificationErrorCode: null,
      credentialMutations: 1,
      providerReads: 1,
      providerWrites: 0,
      paymentMutations: 0,
      customerValueMutations: 0,
      unknownApplicable: false,
    } satisfies P410ExecutionValue;
    const execute = jest.fn().mockResolvedValue(value);
    const resume = jest.fn().mockResolvedValue(value);
    const executor = {
      execute,
      resume,
    } as unknown as P410CommerceCredentialExecutableService;
    const tenantContext = new TenantContextService();
    const service = new P410CommerceCredentialCanonicalCutoverService(
      prisma,
      tenantContext,
      encryption,
      planner,
      executor,
    );
    const run = <T>(requestId: string, work: () => T): T =>
      tenantContext.run(requestId, () =>
        tenantContext.runAsSystemTenant('tenant-a', work),
      );
    return {
      buildRequest,
      execute,
      findExecution,
      findIntegration,
      resume,
      run,
      service,
      tenantContext,
    };
  }

  it.each([
    [false, 'connect'],
    [true, 'replace'],
  ] as const)(
    'classifies the server-owned %s transition and invokes the executor',
    async (integration, operation) => {
      const current = setup({ integration });
      await current.run('http-request-a', () =>
        current.service.setCredentials(
          'tenant-a',
          'owner-a',
          { shopId: 'shop-new', secretKey: 'secret-new' },
          'stable-write-a',
        ),
      );
      expect(current.buildRequest).toHaveBeenCalledWith(
        'tenant-a',
        'owner-a',
        expect.objectContaining({
          operation,
          sourceIntentRef: 'stable-write-a',
        }),
        'execute',
      );
      expect(current.execute).toHaveBeenCalledTimes(1);
    },
  );

  it('resumes the existing logical PUT before reclassifying database state', async () => {
    const current = setup({ integration: true, existing: true });
    await current.run('http-request-b', () =>
      current.service.setCredentials(
        'tenant-a',
        'owner-a',
        { shopId: 'shop-new', secretKey: 'secret-new' },
        'stable-write-b',
      ),
    );
    expect(current.resume).toHaveBeenCalledWith('tenant-a', 'execution-a', {
      shopId: 'shop-new',
      secretKey: 'secret-new',
    });
    expect(current.findIntegration).not.toHaveBeenCalled();
    expect(current.buildRequest).not.toHaveBeenCalled();
  });

  it('turns an already-current credential presentation into a no-op', async () => {
    const current = setup({ integration: true });
    await expect(
      current.run('http-request-c', () =>
        current.service.setCredentials(
          'tenant-a',
          'owner-a',
          { shopId: 'shop-old', secretKey: 'secret-old' },
          'stable-write-c',
        ),
      ),
    ).resolves.toBeNull();
    expect(current.buildRequest).not.toHaveBeenCalled();
    expect(current.execute).not.toHaveBeenCalled();
  });

  it('routes recheck and disconnect through their exact canonical capabilities', async () => {
    const current = setup({ integration: true });
    await current.run('http-request-d', () =>
      current.service.recheck('tenant-a', 'owner-a', 'stable-recheck-a'),
    );
    await current.run('http-request-e', () =>
      current.service.disconnect('tenant-a', 'owner-a', 'stable-disconnect-a'),
    );
    expect(current.buildRequest).toHaveBeenNthCalledWith(
      1,
      'tenant-a',
      'owner-a',
      { sourceIntentRef: 'stable-recheck-a', operation: 'recheck' },
      'execute',
    );
    expect(current.buildRequest).toHaveBeenNthCalledWith(
      2,
      'tenant-a',
      'owner-a',
      { sourceIntentRef: 'stable-disconnect-a', operation: 'disconnect' },
      'execute',
    );
  });

  it('rejects reuse of an idempotency identity by another actor', async () => {
    const current = setup({ existing: true });
    await expect(
      current.run('http-request-f', () =>
        current.service.recheck(
          'tenant-a',
          'different-owner',
          'stable-recheck-b',
        ),
      ),
    ).rejects.toThrow('belongs to another actor');
    expect(current.resume).not.toHaveBeenCalled();
  });

  it('uses the server request identity when an old UI omits the header', async () => {
    const current = setup();
    await current.run('stable-request-id-a', () =>
      current.service.setCredentials('tenant-a', 'owner-a', {
        shopId: 'shop-new',
        secretKey: 'secret-new',
      }),
    );
    expect(current.buildRequest).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      expect.objectContaining({ sourceIntentRef: 'stable-request-id-a' }),
      'execute',
    );
  });
});
