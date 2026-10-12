import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../action-engine';
import { Package5Wave1ExecutableService } from './package5-wave1.service';
import type { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TENANT_CONFIGURATION_NAMESPACES } from './governed-settings.contract';
import { GovernedSettingsReadService } from './governed-settings.read';

describe('H-2 ordinary full-trial own-history authority', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const valid = {
    status: 'trial',
    trialFullAccess: true,
    trialEndsAt: new Date(now.getTime() + 60000),
  };
  const read = new GovernedSettingsReadService(
    {} as PrismaService,
    new TenantContextService(),
    {} as EncryptionService,
    new ConfigService(),
  );
  const member = (
    tenant: unknown = valid,
    extra: Record<string, unknown> = {},
  ) => ({
    id: 'membership-a',
    role: 'tenant_owner',
    status: 'active',
    user: { status: 'active' },
    tenant,
    ...extra,
  });
  const tx = (actor: unknown) =>
    ({
      membership: { findUnique: jest.fn().mockResolvedValue(actor) },
    }) as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());

  it('allows only history for a full unexpired trial and binds the exact lookup', async () => {
    const findUnique = jest.fn().mockResolvedValue(member());
    const db = {
      membership: { findUnique },
    } as unknown as Prisma.TransactionClient;
    await expect(
      read.actor(db, 'tenant-a', 'user-a', 'client_capabilities'),
    ).resolves.toMatchObject({ id: 'membership-a' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_tenantId: { tenantId: 'tenant-a', userId: 'user-a' } },
      include: {
        user: { select: { status: true } },
        tenant: {
          select: { status: true, trialFullAccess: true, trialEndsAt: true },
        },
      },
    });
  });
  it.each(
    TENANT_CONFIGURATION_NAMESPACES.filter((n) => n !== 'client_capabilities'),
  )('does not widen trial namespace %s', async (namespace) => {
    await expect(
      read.actor(tx(member()), 'tenant-a', 'user-a', namespace),
    ).rejects.toThrow('Exact active staff membership required');
  });
  it('does not widen personal preference authority', async () => {
    await expect(
      read.actor(tx(member()), 'tenant-a', 'user-a'),
    ).rejects.toThrow();
  });
  it.each([
    ['setup-only', { ...valid, trialFullAccess: false }],
    ['missing full flag', { ...valid, trialFullAccess: undefined }],
    ['missing expiry', { ...valid, trialEndsAt: null }],
    ['invalid expiry', { ...valid, trialEndsAt: new Date(NaN) }],
    [
      'caller-like string expiry',
      { ...valid, trialEndsAt: valid.trialEndsAt.toISOString() },
    ],
    ['exact expiry', { ...valid, trialEndsAt: now }],
    ['expired', { ...valid, trialEndsAt: new Date(now.getTime() - 1) }],
    ['suspended', { ...valid, status: 'suspended' }],
    ['disabled', { ...valid, status: 'disabled' }],
  ])('refuses %s lifecycle', async (_name, tenant) => {
    await expect(
      read.actor(
        tx(member(tenant)),
        'tenant-a',
        'user-a',
        'client_capabilities',
      ),
    ).rejects.toThrow();
  });
  it.each([
    null,
    member(valid, { status: 'suspended' }),
    member(valid, { user: { status: 'disabled' } }),
    member(valid, { role: 'client' }),
    member(valid, { role: 'platform_owner' }),
  ])(
    'preserves missing/inactive membership, user and role refusal %#',
    async (actor) => {
      await expect(
        read.actor(tx(actor), 'tenant-a', 'user-a', 'client_capabilities'),
      ).rejects.toThrow();
    },
  );
  it('rereads lifecycle after admission instead of caching trial authority', async () => {
    const db = tx(member());
    await read.actor(db, 'tenant-a', 'user-a', 'client_capabilities');
    jest.setSystemTime(valid.trialEndsAt);
    await expect(
      read.actor(db, 'tenant-a', 'user-a', 'client_capabilities'),
    ).rejects.toThrow();
  });
  it.each(TENANT_CONFIGURATION_NAMESPACES)(
    'retains active-tenant namespace %s',
    async (namespace) => {
      await expect(
        read.actor(
          tx(member({ ...valid, status: 'active', trialEndsAt: null })),
          'tenant-a',
          'user-a',
          namespace,
        ),
      ).resolves.toBeDefined();
    },
  );

  it.each(['SUCCEEDED', 'READY'])(
    'rechecks current authority before returning a %s receipt, including the locked winner',
    async (state) => {
      const currentMember = member();
      const dbTx = {
        membership: { findUnique: jest.fn().mockResolvedValue(currentMember) },
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn(),
        actionExecution: {
          findUniqueOrThrow: jest.fn(() =>
            Promise.resolve({
              ...execution,
              state: 'SUCCEEDED',
            }),
          ),
        },
      };
      const execution = {
        id: 'execution-a',
        tenantId: 'tenant-a',
        actorUserId: 'user-a',
        state,
        capability: 'package5.settings.tenant-business.execute.v1',
        safeResultSummaryJson: { noOp: false },
      };
      const input = {
        callerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorMembershipId: 'membership-a',
        actorRole: 'tenant_owner',
        targetKind: 'setting',
        targetRef: 'tenant-config:client_capabilities',
        operation: 'tenant_business_configuration',
        semanticCommand: {
          confirmed: true,
          namespace: 'client_capabilities',
          expectedRevision: 0,
          previousRevisionId: null,
          content: { client_self_visit_history: true },
        },
        configJson: {
          namespace: 'client_capabilities',
          revision: 1,
          previousRevisionId: null,
          content: { client_self_visit_history: true },
        },
      };
      const database = {
        actionExecution: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(execution),
        },
        $transaction: jest.fn((work: (tx: unknown) => unknown) =>
          Promise.resolve(work(dbTx)),
        ),
      };
      const kernel = {
        readTrustedNormalizedInput: jest.fn().mockResolvedValue(input),
      };
      const executor = new Package5Wave1ExecutableService(
        database as unknown as PrismaClient,
        {} as CanonicalActionIngressService,
        kernel as unknown as ActionEngineKernel,
        undefined,
        read,
      );
      await expect(executor.resume('tenant-a', 'execution-a')).resolves.toEqual(
        { noOp: false },
      );
      jest.setSystemTime(valid.trialEndsAt);
      await expect(
        executor.resume('tenant-a', 'execution-a'),
      ).rejects.toThrow();
      jest.setSystemTime(now);
      currentMember.id = 'replacement-membership';
      await expect(
        executor.resume('tenant-a', 'execution-a'),
      ).rejects.toThrow();
    },
  );
});
