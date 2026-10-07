import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3Command,
} from './package5-wave3.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PACKAGE5_WAVE3_REGISTRATIONS } from '../action-engine';

function fixture() {
  const context = new TenantContextService();
  const membership = {
    id: 'member-a',
    role: 'tenant_owner',
    status: 'active',
    user: { status: 'active' },
  };
  const branch = { id: 'branch-a' };
  const db = {
    membership: { findUnique: jest.fn().mockResolvedValue(membership) },
    branch: { findFirst: jest.fn().mockResolvedValue(branch) },
    crmIntegration: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    actionExecution: {
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
    },
    actionTargetMutation: { findFirst: jest.fn().mockResolvedValue(null) },
    actionAttempt: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  const kernel = { readTrustedNormalizedInput: jest.fn() };
  const planner = new Package5Wave3ShadowService(
    {} as never,
    db as never,
    context,
    kernel as never,
    {} as never,
  );
  const command: Package5Wave3Command = {
    operation: 'install_crm_credentials',
    sourceIntentRef: 'binding-install-a',
    provider: 'yclients',
    encryptedApiToken: 'synthetic-encrypted',
    credentialFingerprint: 'a'.repeat(64),
    settingsJson: {
      companyId: 42,
      branchBinding: {
        contract: 'maya.crm-branch-binding/1',
        companyId: 42,
        branchId: 'branch-a',
      },
    },
  };
  const run = <T>(fn: () => Promise<T>) =>
    context.runAsSystemTenant('tenant-a', fn);
  return { context, db, kernel, planner, command, run };
}
it('rechecks branch ownership inside the local commit transaction before any mutation', async () => {
  const f = fixture();
  const prepared = await f.run(() =>
    f.planner.build('tenant-a', { userId: 'owner-a' }, f.command, 'execute'),
  );
  f.kernel.readTrustedNormalizedInput.mockResolvedValue(prepared.request.input);
  const row = PACKAGE5_WAVE3_REGISTRATIONS.find(
    (r) => r.operation === 'install_crm_credentials',
  )!;
  const execution = {
    id: 'execution-a',
    tenantId: 'tenant-a',
    actorUserId: 'owner-a',
    state: 'READY',
    policyDecision: 'ALLOW',
    dryRun: false,
    actionClass: row.actionClass,
    capability: row.executableCapability,
  };
  const tx = {
    ...f.db,
    branch: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  tx.actionExecution.findUniqueOrThrow.mockResolvedValue(execution);
  f.db.$transaction.mockImplementation(
    (fn: (db: unknown) => Promise<unknown>) => fn(tx),
  );
  const executor = new Package5Wave3ExecutableService(
    f.db as never,
    { createExecution: jest.fn().mockResolvedValue(execution) } as never,
    f.kernel as never,
    {} as never,
    f.planner,
    {} as never,
  );
  await expect(f.run(() => executor.execute(prepared))).rejects.toThrow(
    'binding target not found',
  );
  expect(tx.branch.findFirst).toHaveBeenCalledWith({
    where: { id: 'branch-a', tenantId: 'tenant-a' },
    select: { id: true },
  });
  expect(tx.actionAttempt.create).not.toHaveBeenCalled();
  expect(tx.crmIntegration.upsert).not.toHaveBeenCalled();
});
it('permits correction with unchanged credential but rejects identical pending material', async () => {
  const f = fixture();
  f.db.crmIntegration.findUnique.mockResolvedValue({
    id: 'crm-a',
    provider: 'yclients',
    status: 'pending_activation',
    baseUrl: null,
    settingsJson: {
      companyId: 42,
      branchBinding: null,
      canonicalCredentialFingerprint: 'a'.repeat(64),
    },
  });
  await expect(
    f.run(() =>
      f.planner.build('tenant-a', { userId: 'owner-a' }, f.command, 'execute'),
    ),
  ).resolves.toMatchObject({
    command: { settingsJson: { branchBinding: { branchId: 'branch-a' } } },
  });
  f.db.crmIntegration.findUnique.mockResolvedValue({
    id: 'crm-a',
    provider: 'yclients',
    status: 'pending_activation',
    baseUrl: null,
    settingsJson: {
      ...f.command.settingsJson,
      canonicalCredentialFingerprint: 'a'.repeat(64),
    },
  });
  await expect(
    f.run(() =>
      f.planner.build('tenant-a', { userId: 'owner-a' }, f.command, 'execute'),
    ),
  ).rejects.toThrow('Credential version already installed');
});
it.each(['foreign', 'revoked'])(
  'refuses %s branch/membership while planning',
  async (kind) => {
    const f = fixture();
    if (kind === 'foreign') f.db.branch.findFirst.mockResolvedValue(null);
    else f.db.membership.findUnique.mockResolvedValue({ status: 'revoked' });
    await expect(
      f.run(() =>
        f.planner.build(
          'tenant-a',
          { userId: 'owner-a' },
          f.command,
          'execute',
        ),
      ),
    ).rejects.toThrow();
    expect(f.db.crmIntegration.upsert).not.toHaveBeenCalled();
  },
);

it('existing A17 executor stores the exact pair pending activation once and restores its completed receipt', async () => {
  const f = fixture();
  const prepared = await f.run(() =>
    f.planner.build('tenant-a', { userId: 'owner-a' }, f.command, 'execute'),
  );
  f.kernel.readTrustedNormalizedInput.mockResolvedValue(prepared.request.input);
  const registration = PACKAGE5_WAVE3_REGISTRATIONS.find(
    (r) => r.operation === 'install_crm_credentials',
  )!;
  const execution: Record<string, unknown> = {
    id: 'execution-a',
    tenantId: 'tenant-a',
    actorUserId: 'owner-a',
    state: 'READY',
    policyDecision: 'ALLOW',
    dryRun: false,
    actionClass: registration.actionClass,
    capability: registration.executableCapability,
    executionAttemptCount: 0,
  };
  const tx = {
    ...f.db,
    actionExecution: {
      ...f.db.actionExecution,
      update: jest.fn((input: { data: Record<string, unknown> }) => {
        Object.assign(execution, input.data);
        return Promise.resolve(execution);
      }),
    },
    actionAttempt: { ...f.db.actionAttempt, update: jest.fn() },
    actionTargetMutation: { ...f.db.actionTargetMutation, create: jest.fn() },
  };
  tx.actionExecution.findUniqueOrThrow.mockResolvedValue(execution);
  f.db.$transaction.mockImplementation(
    (work: (db: unknown) => Promise<unknown>) => work(tx),
  );
  const create = () =>
    new Package5Wave3ExecutableService(
      f.db as never,
      { createExecution: jest.fn().mockResolvedValue(execution) } as never,
      f.kernel as never,
      {} as never,
      f.planner,
      {} as never,
    );
  const first = await f.run(() => create().execute(prepared));
  expect(first).toMatchObject({
    providerWrites: 0,
    businessMutations: 1,
    actionExecutionId: 'execution-a',
  });
  expect(tx.crmIntegration.upsert).toHaveBeenCalledTimes(1);
  const calls = tx.crmIntegration.upsert.mock.calls as unknown[][];
  const write = calls[0][0] as {
    create: { status: string; settingsJson: unknown };
    update: { status: string; settingsJson: unknown };
  };
  for (const value of [write.create, write.update]) {
    expect(value.status).toBe('pending_activation');
    expect(value.settingsJson).toEqual({
      ...f.command.settingsJson,
      canonicalCredentialFingerprint: f.command.credentialFingerprint,
    });
  }
  await expect(f.run(() => create().execute(prepared))).resolves.toEqual(first);
  expect(tx.actionAttempt.create).toHaveBeenCalledTimes(1);
  expect(tx.crmIntegration.upsert).toHaveBeenCalledTimes(1);
  expect(tx.actionTargetMutation.create).toHaveBeenCalledTimes(1);
});
