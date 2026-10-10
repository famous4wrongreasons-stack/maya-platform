// Unit seams only: the real bootstrap callback runs against finite mock writes.
// Callback rejection propagation is checked; this is not an actual PG rollback proof.
import { ConflictException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import {
  TrialActivationBootstrapService,
  type TrialActivationBootstrapCommand,
} from './trial-activation-bootstrap.service';

const now = new Date('2026-10-10T12:00:00.000Z');
const command: TrialActivationBootstrapCommand = {
  activationTokenHash: 'a'.repeat(64),
  tenant: {
    name: 'Synthetic business',
    slug: 'synthetic-business',
    defaultTimezone: 'Europe/Moscow',
    defaultLocale: 'ru-RU',
    defaultCurrency: 'RUB',
    trialEndsAt: new Date('2026-10-20T12:00:00.000Z'),
    calendarSource: 'internal',
  },
  owner: {
    email: 'synthetic@example.invalid',
    passwordHash: 'synthetic-not-a-real-password-hash',
  },
  branch: { name: 'Synthetic branch', timezone: 'Europe/Moscow' },
};
const unique = (meta?: Record<string, unknown>, code = 'P2002') =>
  new Prisma.PrismaClientKnownRequestError(
    'Synthetic private constraint detail',
    {
      code,
      clientVersion: '7.8.0',
      meta,
    },
  );
const adapterFields = (fields: unknown) => ({
  driverAdapterError: {
    cause: { originalCode: '23505', constraint: { fields } },
  },
});

function fixture() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'synthetic-activation' }]),
    trialActivation: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'synthetic-activation',
        status: 'pending',
        tenantId: null,
        expiresAt: new Date('2026-10-11T12:00:00.000Z'),
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    aiOnboardingDraft: { findUnique: jest.fn().mockResolvedValue(null) },
    tenant: { create: jest.fn().mockResolvedValue({}) },
    brandingSettings: { create: jest.fn().mockResolvedValue({}) },
    branch: { create: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({}) },
    internalProvider: { create: jest.fn().mockResolvedValue({}) },
  };
  const transaction = { committed: 0, rejected: [] as unknown[] };
  const $transaction = jest.fn(
    async (work: (client: Prisma.TransactionClient) => Promise<unknown>) => {
      try {
        const result = await work(tx as unknown as Prisma.TransactionClient);
        transaction.committed++;
        return result;
      } catch (error) {
        transaction.rejected.push(error);
        throw error;
      }
    },
  );
  const service = new TrialActivationBootstrapService(
    { $transaction } as unknown as PrismaClient,
    () => now,
  );
  const downstream = [
    tx.brandingSettings.create,
    tx.branch.create,
    tx.user.create,
    tx.internalProvider.create,
    tx.trialActivation.update,
  ];
  return { service, tx, transaction, $transaction, downstream };
}

describe('TrialActivation bootstrap: qualified tenant short-name collision', () => {
  for (const field of ['slug', 'subdomain']) {
    for (const [shape, meta] of [
      ['target', { target: [field] }],
      ['target-model', { modelName: 'Tenant', target: [field] }],
      ['driver', adapterFields([field])],
      ['driver-model', { modelName: 'Tenant', ...adapterFields([field]) }],
      [
        'both-agree',
        { modelName: 'Tenant', target: [field], ...adapterFields([field]) },
      ],
    ] as const) {
      it(`maps ${shape}/${field} inside the callback and rejects the transaction without downstream writes`, async () => {
        const f = fixture();
        f.tx.tenant.create.mockRejectedValue(unique(meta));
        const error: unknown = await f.service
          .activate(command)
          .catch((value: unknown) => value);
        expect(error).toBeInstanceOf(ConflictException);
        if (!(error instanceof ConflictException))
          throw new Error('Expected qualified refusal');
        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toEqual({
          message: 'Business short name is already in use',
          error: { code: 'trial_signup_slug_taken' },
        });
        expect(f.tx.tenant.create).toHaveBeenCalledTimes(1);
        expect(f.$transaction).toHaveBeenCalledTimes(1);
        expect(f.$transaction).toHaveBeenCalledWith(expect.any(Function), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        for (const write of f.downstream) expect(write).not.toHaveBeenCalled();
        expect(f.transaction.committed).toBe(0);
        expect(f.transaction.rejected).toEqual([error]);
        expect(JSON.stringify(error.getResponse())).not.toContain(
          'private constraint',
        );
      });
    }
  }

  const unrelated: Array<[string, unknown]> = [
    ['missing metadata', unique()],
    ['missing constraint', unique({ modelName: 'Tenant' })],
    ['primary key', unique({ target: ['id'] })],
    ['other field', unique({ target: ['email'] })],
    ['empty fields', unique({ target: [] })],
    ['mixed fields', unique({ target: ['slug', 'id'] })],
    ['two allowed fields', unique({ target: ['slug', 'subdomain'] })],
    ['duplicate fields', unique({ target: ['slug', 'slug'] })],
    ['constraint name string', unique({ target: 'Tenant_slug_key' })],
    ['field string', unique({ target: 'slug' })],
    ['other model', unique({ modelName: 'User', target: ['slug'] })],
    ['null model', unique({ modelName: null, target: ['slug'] })],
    [
      'driver other model',
      unique({ modelName: 'Branch', ...adapterFields(['subdomain']) }),
    ],
    ['driver primary key', unique(adapterFields(['id']))],
    ['driver mixed fields', unique(adapterFields(['subdomain', 'id']))],
    ['driver field string', unique(adapterFields('slug'))],
    [
      'unknown driver structure',
      unique({
        driverAdapterError: { cause: { constraint: 'Tenant_slug_key' } },
      }),
    ],
    [
      'unknown target with qualified driver',
      unique({ target: ['id'], ...adapterFields(['slug']) }),
    ],
    [
      'qualified target with unknown driver fields',
      unique({ target: ['slug'], ...adapterFields(['id']) }),
    ],
    [
      'contradictory allowed fields',
      unique({ target: ['slug'], ...adapterFields(['subdomain']) }),
    ],
    ['wrong Prisma code', unique({ target: ['slug'] }, 'P2003')],
    [
      'plain object imitation',
      { code: 'P2002', meta: { modelName: 'Tenant', target: ['slug'] } },
    ],
    [
      'unclassified error',
      new Error('Synthetic unique constraint: Tenant_slug_key'),
    ],
  ];
  it.each(unrelated)('propagates %s unchanged', async (_name, error) => {
    const f = fixture();
    f.tx.tenant.create.mockRejectedValue(error);
    await expect(f.service.activate(command)).rejects.toBe(error);
    expect(f.$transaction).toHaveBeenCalledTimes(1);
    expect(f.transaction.committed).toBe(0);
    expect(f.transaction.rejected).toEqual([error]);
    for (const write of f.downstream) expect(write).not.toHaveBeenCalled();
  });

  it.each(['branding', 'branch', 'user', 'provider', 'activation'] as const)(
    'does not classify an otherwise qualified-looking error from later %s writes',
    async (stage) => {
      const f = fixture(),
        error = unique({ modelName: 'Tenant', target: ['slug'] });
      const writes = {
        branding: f.tx.brandingSettings.create,
        branch: f.tx.branch.create,
        user: f.tx.user.create,
        provider: f.tx.internalProvider.create,
        activation: f.tx.trialActivation.update,
      };
      writes[stage].mockRejectedValue(error);
      await expect(f.service.activate(command)).rejects.toBe(error);
      expect(f.tx.tenant.create).toHaveBeenCalledTimes(1);
      expect(f.transaction.committed).toBe(0);
      expect(f.transaction.rejected).toEqual([error]);
      expect(f.$transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('does not classify an outer transaction failure before its callback', async () => {
    const f = fixture(),
      error = unique({ modelName: 'Tenant', target: ['slug'] });
    f.$transaction.mockRejectedValue(error);
    await expect(f.service.activate(command)).rejects.toBe(error);
    expect(f.tx.tenant.create).not.toHaveBeenCalled();
  });

  it('does not classify a transaction-result failure after the callback returned', async () => {
    const f = fixture(),
      error = unique({ modelName: 'Tenant', target: ['slug'] });
    f.$transaction.mockImplementation(async (work) => {
      await work(f.tx as unknown as Prisma.TransactionClient);
      throw error;
    });
    await expect(f.service.activate(command)).rejects.toBe(error);
    for (const write of f.downstream) expect(write).toHaveBeenCalledTimes(1);
    expect(f.$transaction).toHaveBeenCalledTimes(1);
  });

  it('leaves ordinary successful bootstrap and activation completion unchanged', async () => {
    const f = fixture();
    const result = await f.service.activate(command);
    expect(result).toMatchObject({
      activationId: 'synthetic-activation',
      resumed: false,
    });
    expect(f.transaction.committed).toBe(1);
    expect(f.transaction.rejected).toEqual([]);
    for (const write of f.downstream) expect(write).toHaveBeenCalledTimes(1);
    expect(f.tx.trialActivation.update).toHaveBeenCalledWith({
      where: { id: 'synthetic-activation' },
      data: {
        status: 'completed',
        tenantId: result.tenantId,
        completedAt: now,
      },
    });
  });
});
