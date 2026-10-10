import { ActionConflictError } from '../action-engine/action-engine.errors';
/* eslint-disable @typescript-eslint/require-await -- Synthetic async ports deliberately resolve without real I/O. */
import { CrmProvider } from '../common/domain.enums';
import { ForbiddenException } from '@nestjs/common';
import { PACKAGE5_WAVE3_REGISTRATIONS } from '../action-engine';
import {
  crmConfigurationVersion,
  crmExpectedVersion,
  crmOperationRequestId,
} from '../crm/crm-configuration-version';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave3CanonicalCutoverService } from './package5-wave3-canonical-cutover.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3Command,
  wave3Hash,
} from './package5-wave3.service';

// Synthetic transaction/transport contract proof. No PostgreSQL, CRM or secrets.
const TENANT = 'tenant-a';
const OWNER = 'owner-a';
const REQUEST = 'a0101010-1010-4010-8010-101010101010';
const integration = () => ({
  id: 'crm-a',
  tenantId: TENANT,
  provider: 'yclients',
  encryptedApiToken: 'synthetic-cipher-a',
  baseUrl: null as string | null,
  status: 'active',
  settingsJson: { companyId: 42, branchBinding: null } as Record<
    string,
    unknown
  >,
  verifiedAt: null,
  lastCheckedAt: null,
});
function fixture() {
  let current = integration();
  let stored: Record<string, unknown> | null = null;
  let input: Record<string, unknown> = {};
  let inTransaction = false;
  const operations: string[] = [];
  const context = new TenantContextService();
  const membership = {
    id: 'member-a',
    role: 'tenant_owner',
    status: 'active',
    user: { status: 'active' },
  };
  const transaction = jest.fn<
    Promise<unknown>,
    [(tx: unknown) => Promise<unknown>]
  >();
  const db = {
    membership: { findUnique: jest.fn(async () => membership) },
    branch: { findFirst: jest.fn(async () => ({ id: 'branch-a' })) },
    staffProviderLink: {
      findFirst: jest.fn(async (): Promise<{ id: string } | null> => null),
    },
    crmStaffAccess: {
      findFirst: jest.fn(async (): Promise<{ id: string } | null> => null),
    },
    crmClientLink: {
      findFirst: jest.fn(async (): Promise<{ id: string } | null> => null),
    },
    crmIntegration: {
      findUnique: jest.fn(async () => current),
      findUniqueOrThrow: jest.fn(async () => current),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        operations.push('integration');
        current = { ...current, ...args.data };
        return current;
      }),
      upsert: jest.fn(async (args: { update: Record<string, unknown> }) => {
        current = { ...current, ...args.update };
        return current;
      }),
    },
    actionExecution: {
      findMany: jest.fn(
        async (args: { where: { tenantId: string; sourceRef: string } }) =>
          stored &&
          stored.tenantId === args.where.tenantId &&
          stored.sourceRef === args.where.sourceRef
            ? [stored]
            : [],
      ),
      findUniqueOrThrow: jest.fn(async () => stored),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        operations.push(String(args.data.state));
        stored = { ...stored, ...args.data };
        return stored;
      }),
    },
    actionTargetMutation: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => {
        operations.push('mutation');
      }),
    },
    actionAttempt: {
      create: jest.fn(async () => {
        operations.push('attempt');
      }),
      update: jest.fn(async () => undefined),
    },
    $executeRaw: jest.fn(async () => 1),
    $transaction: transaction,
  };
  transaction.mockImplementation(async (work) => {
    const oldCurrent = structuredClone(current),
      oldStored = structuredClone(stored);
    inTransaction = true;
    try {
      return await work(db);
    } catch (error) {
      current = oldCurrent;
      stored = oldStored;
      throw error;
    } finally {
      inTransaction = false;
    }
  });

  const project = jest.fn(async (tx: unknown) => {
    expect(tx).toBe(db);
    expect(inTransaction).toBe(true);
    operations.push('projection');
  });
  const provider = {
    readCrmImport: jest.fn(async () => ({
      snapshotHash: 'c'.repeat(64),
      teamChildHashes: [],
      project,
    })),
    verifyCrm: jest.fn(async () => ({ snapshotHash: 'd'.repeat(64) })),
  };
  const kernel = { readTrustedNormalizedInput: jest.fn(async () => input) };
  const planner = new Package5Wave3ShadowService(
    {} as never,
    db as never,
    context,
    kernel as never,
    provider as never,
  );
  const ingress = {
    createExecution: jest.fn(
      async (request: {
        input: unknown;
        capability: string;
        source: { sourceRef?: string };
      }) => {
        if (stored) {
          if (wave3Hash(input) !== wave3Hash(request.input))
            throw new ActionConflictError(
              'synthetic ingress normalized action differs',
            );
          return stored;
        }
        if (
          !request.input ||
          typeof request.input !== 'object' ||
          Array.isArray(request.input)
        )
          throw new Error('Synthetic ingress expected normalized record');
        input = request.input as Record<string, unknown>;
        stored = {
          id: 'execution-a',
          tenantId: TENANT,
          actorUserId: OWNER,
          state: 'READY',
          dryRun: false,
          policyDecision: 'ALLOW',
          actionClass: PACKAGE5_WAVE3_REGISTRATIONS.find(
            (r) => r.executableCapability === request.capability,
          )!.actionClass,
          capability: request.capability,
          sourceRef: request.source.sourceRef,
          targetRef: `crm:${TENANT}`,
          executionAttemptCount: 0,
          payloadRetentionUntil: new Date(Date.now() + 86400000),
        };
        return stored;
      },
    ),
  };
  const executor = new Package5Wave3ExecutableService(
    db as never,
    ingress as never,
    kernel as never,
    {} as never,
    planner,
    provider as never,
  );
  const crm = {
    previewCredentials: jest.fn(),
    getIntegrationStatus: jest.fn(async () => ({
      connection: {
        id: current.id,
        configVersion: crmConfigurationVersion(current),
      },
    })),
  };
  const canonical = new Package5Wave3CanonicalCutoverService(
    planner,
    executor,
    context,
    db as never,
    {
      encrypt: (value: string) => `synthetic:${value}`,
      opaqueReference: (namespace: string, value: string) =>
        wave3Hash({ namespace, value }),
    } as never,
    crm as never,
    {} as never,
  );
  const run = <T>(fn: () => Promise<T>) =>
    context.runAsSystemTenant(TENANT, fn);
  const command = (): Package5Wave3Command => ({
    operation: 'confirm_crm_import',
    sourceIntentRef: `${REQUEST}:confirm`,
    expectedVersion: crmConfigurationVersion(current)!,
  });
  const prepare = () =>
    run(() => planner.build(TENANT, { userId: OWNER }, command(), 'execute'));
  return {
    context,
    db,
    provider,
    project,
    kernel,
    planner,
    executor,
    canonical,
    ingress,
    crm,
    operations,
    run,
    prepare,
    command,
    get current() {
      return current;
    },
    set current(v) {
      current = v;
    },
    get stored() {
      return stored;
    },
    set stored(v) {
      stored = v;
    },
    get input() {
      return input;
    },
    set input(v) {
      input = v;
    },
  };
}

describe('qualified CRM configuration and atomic confirmation', () => {
  it('pins ciphertext, identity, provider, base URL and settings, but not activation/confirmation state', () => {
    const a = integration(),
      version = crmConfigurationVersion(a);
    expect(version).toMatch(/^[a-f0-9]{64}$/);
    const changedState = {
      ...a,
      status: 'pending_activation',
      settingsJson: {
        ...a.settingsJson,
        acceptedImportSnapshotHash: 'e'.repeat(64),
      },
    };
    expect(crmConfigurationVersion(changedState)).toBe(version);
    for (const patch of [
      { id: 'other' },
      { tenantId: 'other' },
      { provider: 'altegio' },
      { encryptedApiToken: 'other-cipher' },
      { baseUrl: 'https://synthetic.invalid' },
      { settingsJson: { companyId: 43 } },
    ])
      expect(crmConfigurationVersion({ ...a, ...patch })).not.toBe(version);
    expect(crmExpectedVersion(null, true)).toBeNull();
    expect(() => crmExpectedVersion(undefined, true)).toThrow();
    expect(() => crmExpectedVersion(null)).toThrow();
    expect(() => crmOperationRequestId('old-non-uuid-key')).toThrow();
  });
  it('checks the version after awaited provider observation before admission', async () => {
    const f = fixture();
    f.provider.readCrmImport.mockImplementation(async () => {
      f.current = { ...f.current, encryptedApiToken: 'changed' };
      return {
        snapshotHash: 'c'.repeat(64),
        teamChildHashes: [],
        project: f.project,
      };
    });
    await expect(f.prepare()).rejects.toMatchObject({
      response: { error: { code: 'crm_config_version_changed' } },
    });
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
  it('rejects a replacement under the actual target lock, before attempt/projection', async () => {
    const f = fixture(),
      prepared = await f.prepare();
    f.db.$executeRaw.mockImplementation(async () => {
      f.current = { ...f.current, encryptedApiToken: 'changed-under-lock' };
      return 1;
    });
    await expect(
      f.run(() => f.executor.execute(prepared)),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_config_version_changed' } },
    });
    expect(f.db.actionAttempt.create).not.toHaveBeenCalled();
    expect(f.project).not.toHaveBeenCalled();
  });
  it.each(['before-provider', 'under-lock'] as const)(
    'refuses missing/foreign bound branch %s',
    async (stage) => {
      const f = fixture();
      f.current = {
        ...f.current,
        settingsJson: {
          companyId: 42,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: 42,
            branchId: 'branch-a',
          },
        },
      };
      if (stage === 'before-provider') {
        f.db.branch.findFirst.mockResolvedValue(null as never);
        await expect(f.prepare()).rejects.toMatchObject({
          response: { error: { code: 'crm_branch_binding_unavailable' } },
        });
        expect(f.provider.readCrmImport).not.toHaveBeenCalled();
      } else {
        const prepared = await f.prepare();
        f.db.$executeRaw.mockImplementation(async () => {
          f.db.branch.findFirst.mockResolvedValue(null as never);
          return 1;
        });
        await expect(
          f.run(() => f.executor.execute(prepared)),
        ).rejects.toMatchObject({
          response: { error: { code: 'crm_branch_binding_unavailable' } },
        });
      }
      expect(f.db.actionAttempt.create).not.toHaveBeenCalled();
      expect(f.project).not.toHaveBeenCalled();
    },
  );
  it('projects in the same transaction before recording a qualified SUCCEEDED receipt', async () => {
    const f = fixture(),
      prepared = await f.prepare(),
      originalVersion = crmConfigurationVersion(f.current);
    const result = await f.run(() => f.executor.execute(prepared));
    expect(result.crmCommit).toEqual({
      contract: 'maya.crm-config-commit/1',
      configVersion: originalVersion,
      phase: 'import_confirmed',
      atomicProjection: true,
    });
    expect(f.operations).toEqual([
      'attempt',
      'EXECUTING',
      'integration',
      'projection',
      'mutation',
      'SUCCEEDED',
    ]);
    expect(JSON.stringify(prepared.request)).not.toContain(
      'synthetic-cipher-a',
    );
    expect(JSON.stringify(prepared.request)).not.toContain('project');
  });
  it('rolls back if projection changes the pinned configuration before commit receipt', async () => {
    const f = fixture(),
      prepared = await f.prepare(),
      before = structuredClone(f.current);
    f.project.mockImplementation(async () => {
      f.current = {
        ...f.current,
        encryptedApiToken: 'unexpected-projection-change',
      };
    });
    await expect(
      f.run(() => f.executor.execute(prepared)),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_config_version_changed' } },
    });
    expect(f.current).toEqual(before);
    expect(f.stored?.state).toBe('READY');
    expect(f.operations).not.toContain('SUCCEEDED');
  });
  it('projection failure rolls back both import state and successful action receipt', async () => {
    const f = fixture(),
      prepared = await f.prepare(),
      before = structuredClone(f.current);
    f.project.mockRejectedValue(new Error('synthetic projection failure'));
    await expect(f.run(() => f.executor.execute(prepared))).rejects.toThrow(
      'projection failure',
    );
    expect(f.current).toEqual(before);
    expect(f.stored?.state).toBe('READY');
    expect(f.operations).not.toContain('SUCCEEDED');
    expect(f.db.actionTargetMutation.create).not.toHaveBeenCalled();
  });
  it.each(['staffProviderLink', 'crmClientLink', 'crmStaffAccess'] as const)(
    'refuses disconnected surviving %s before credential verification/admission',
    async (table) => {
      const f = fixture();
      f.db.crmIntegration.findUnique.mockResolvedValue(null as never);
      f.db[table].findFirst.mockResolvedValue({
        id: 'historical-disabled-or-unlinked',
      });
      await expect(
        f.run(() =>
          f.planner.build(
            TENANT,
            { userId: OWNER },
            {
              operation: 'install_crm_credentials',
              sourceIntentRef: REQUEST,
              expectedVersion: null,
              provider: 'yclients',
              encryptedApiToken: 'new-cipher',
              credentialFingerprint: 'f'.repeat(64),
              settingsJson: { companyId: 43 },
            },
            'execute',
          ),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'crm_import_scope_migration_unsupported' } },
      });
      expect(f.ingress.createExecution).not.toHaveBeenCalled();
      expect(f.db.crmIntegration.upsert).not.toHaveBeenCalled();
    },
  );
  it('refuses confirmation when historical disabled identity could be reactivated', async () => {
    const f = fixture();
    f.db.crmStaffAccess.findFirst.mockResolvedValue({
      id: 'disabled-access-retaining-user',
    });
    await expect(f.prepare()).rejects.toMatchObject({
      response: { error: { code: 'crm_import_scope_migration_unsupported' } },
    });
    expect(f.provider.readCrmImport).not.toHaveBeenCalled();
    expect(f.project).not.toHaveBeenCalled();
  });
  it('refuses custom endpoint to default migration with surviving identities', async () => {
    const f = fixture();
    f.current = { ...f.current, baseUrl: 'https://old.synthetic.invalid' };
    f.db.staffProviderLink.findFirst.mockResolvedValue({
      id: 'existing-import-link',
    });
    await expect(
      f.run(() =>
        f.planner.build(
          TENANT,
          { userId: OWNER },
          {
            operation: 'install_crm_credentials',
            sourceIntentRef: REQUEST,
            expectedVersion: crmConfigurationVersion(f.current),
            provider: 'yclients',
            baseUrl: null,
            encryptedApiToken: 'new-cipher',
            credentialFingerprint: 'f'.repeat(64),
            settingsJson: { companyId: 42, branchBinding: null },
          },
          'execute',
        ),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_import_scope_migration_unsupported' } },
    });
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
  it('migration cannot erase identity ownership even after accepted snapshot metadata was removed', async () => {
    const f = fixture();
    f.db.staffProviderLink.findFirst.mockResolvedValue({
      id: 'existing-import-link',
    });
    await expect(
      f.run(() =>
        f.planner.build(
          TENANT,
          { userId: OWNER },
          {
            operation: 'install_crm_credentials',
            sourceIntentRef: REQUEST,
            expectedVersion: crmConfigurationVersion(f.current),
            provider: 'yclients',
            encryptedApiToken: 'new-cipher',
            credentialFingerprint: 'f'.repeat(64),
            settingsJson: { companyId: 43 },
          },
          'execute',
        ),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_import_scope_migration_unsupported' } },
    });
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
});

describe('exact durable CRM operation READ', () => {
  async function success() {
    const f = fixture();
    const p = await f.prepare();
    await f.run(() => f.executor.execute(p));
    f.provider.readCrmImport.mockClear();
    f.provider.verifyCrm.mockClear();
    f.ingress.createExecution.mockClear();
    return f;
  }
  it('recovers committed version A after replacement B, with no provider read or admission', async () => {
    const f = await success(),
      a = crmConfigurationVersion(f.current);
    f.current = { ...f.current, encryptedApiToken: 'version-B' };
    const result = await f.run(() =>
      f.canonical.crmOperationStatus(
        TENANT,
        { userId: OWNER },
        'activate',
        REQUEST,
      ),
    );
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      phase: 'confirm',
      receipt: {
        phase: 'import_confirmed',
        configVersion: a,
        atomicProjection: true,
      },
      current: {
        configVersion: crmConfigurationVersion(f.current),
        matchesCurrentVersion: false,
      },
    });
    expect(f.provider.readCrmImport).not.toHaveBeenCalled();
    expect(f.provider.verifyCrm).not.toHaveBeenCalled();
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
  it('completed activation POST replays version A after B without provider read or admission', async () => {
    const f = await success(),
      version = crmConfigurationVersion(f.current)!;
    f.current = { ...f.current, encryptedApiToken: 'later-version-B' };
    const result = await f.run(() =>
      f.canonical.activateQualifiedCrmIntegration(
        TENANT,
        { userId: OWNER },
        version,
        REQUEST,
      ),
    );
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      receipt: { configVersion: version },
      current: {
        configVersion: crmConfigurationVersion(f.current),
        matchesCurrentVersion: false,
      },
    });
    expect(f.provider.readCrmImport).not.toHaveBeenCalled();
    expect(f.provider.verifyCrm).not.toHaveBeenCalled();
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
  it('keeps pre-admission provider failure NOT_OBSERVED without claiming it was terminalized', async () => {
    const f = fixture();
    f.crm.previewCredentials.mockRejectedValue(
      new Error('synthetic provider rejection'),
    );
    await expect(
      f.run(() =>
        f.canonical.installQualifiedCrmCredentials(
          TENANT,
          { userId: OWNER },
          {
            provider: CrmProvider.YCLIENTS,
            apiToken: 'synthetic-token',
            settingsJson: { companyId: 42, branchBinding: null },
            expectedVersion: crmConfigurationVersion(f.current),
          },
          REQUEST,
        ),
      ),
    ).rejects.toThrow('provider rejection');
    const result = await f.run(() =>
      f.canonical.crmOperationStatus(
        TENANT,
        { userId: OWNER },
        'install',
        REQUEST,
      ),
    );
    expect(result).toMatchObject({
      status: 'NOT_OBSERVED',
      receipt: null,
      phase: null,
    });
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
  it.each(['cleaned', 'expired', 'historic', 'executing'])(
    'refuses %s evidence instead of recreating an action',
    async (kind) => {
      const f = await success();
      if (kind === 'cleaned')
        f.kernel.readTrustedNormalizedInput.mockRejectedValue(
          new Error('payload erased'),
        );
      if (kind === 'expired')
        f.stored = { ...f.stored, payloadRetentionUntil: new Date(0) };
      if (kind === 'historic')
        f.stored = {
          ...f.stored,
          safeResultSummaryJson: { actionExecutionId: 'execution-a' },
        };
      if (kind === 'executing') f.stored = { ...f.stored, state: 'EXECUTING' };
      const result = await f.run(() =>
        f.canonical.crmOperationStatus(
          TENANT,
          { userId: OWNER },
          'activate',
          REQUEST,
        ),
      );
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.receipt).toBeNull();
      expect(f.ingress.createExecution).not.toHaveBeenCalled();
      expect(f.provider.readCrmImport).not.toHaveBeenCalled();
    },
  );
  it('rejects another current owner and a revoked member', async () => {
    const f = await success();
    await expect(
      f.run(() =>
        f.canonical.crmOperationStatus(
          TENANT,
          { userId: 'other-owner' },
          'activate',
          REQUEST,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    f.db.membership.findUnique.mockResolvedValue({
      id: 'member-a',
      role: 'tenant_owner',
      status: 'revoked',
      user: { status: 'active' },
    });
    await expect(
      f.run(() =>
        f.canonical.crmOperationStatus(
          TENANT,
          { userId: OWNER },
          'activate',
          REQUEST,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('returns NOT_OBSERVED for another exact UUID without build/read effects', async () => {
    const f = await success();
    const result = await f.run(() =>
      f.canonical.crmOperationStatus(
        TENANT,
        { userId: OWNER },
        'activate',
        'b0101010-1010-4010-8010-101010101010',
      ),
    );
    expect(result).toMatchObject({
      status: 'NOT_OBSERVED',
      phase: null,
      receipt: null,
    });
    expect(f.provider.readCrmImport).not.toHaveBeenCalled();
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
  });
  it('reports activation alone as READY, not completed import', async () => {
    const f = await success(),
      version = crmConfigurationVersion(f.current)!;
    f.stored = {
      ...f.stored,
      sourceRef: `p5w3:${wave3Hash({ sourceIntentRef: `${REQUEST}:activate` })}`,
      safeResultSummaryJson: {
        actionExecutionId: 'execution-a',
        crmCommit: {
          contract: 'maya.crm-config-commit/1',
          configVersion: version,
          phase: 'activated',
          atomicProjection: false,
        },
      },
    };
    f.input = { ...f.input, operation: 'activate_crm_integration' };
    const result = await f.run(() =>
      f.canonical.crmOperationStatus(
        TENANT,
        { userId: OWNER },
        'activate',
        REQUEST,
      ),
    );
    expect(result).toMatchObject({
      status: 'READY',
      phase: 'activate',
      receipt: { phase: 'activated', atomicProjection: false },
      reason: 'crm_import_confirmation_pending',
    });
  });
  it.each(['install', 'activate'] as const)(
    'refuses %s POST if membership is revoked during the final status read, preserving committed receipt',
    async (operation) => {
      const f = operation === 'activate' ? await success() : fixture();
      const version = crmConfigurationVersion(f.current)!;
      f.crm.getIntegrationStatus.mockImplementation(async () => {
        f.db.membership.findUnique.mockResolvedValue({
          id: 'member-a',
          role: 'tenant_owner',
          status: 'revoked',
          user: { status: 'active' },
        });
        return {
          connection: {
            id: f.current.id,
            configVersion: crmConfigurationVersion(f.current),
          },
        };
      });
      await expect(
        f.run(() =>
          operation === 'activate'
            ? f.canonical.activateQualifiedCrmIntegration(
                TENANT,
                { userId: OWNER },
                version,
                REQUEST,
              )
            : f.canonical.installQualifiedCrmCredentials(
                TENANT,
                { userId: OWNER },
                {
                  provider: CrmProvider.YCLIENTS,
                  apiToken: 'synthetic-token',
                  settingsJson: { companyId: 42, branchBinding: null },
                  expectedVersion: version,
                },
                REQUEST,
              ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.stored?.state).toBe('SUCCEEDED');
    },
  );
  it('does not accept current revocation during receipt decryption', async () => {
    const f = await success(),
      original = f.input;
    f.kernel.readTrustedNormalizedInput.mockImplementation(async () => {
      f.db.membership.findUnique.mockResolvedValue({
        id: 'member-a',
        role: 'tenant_owner',
        status: 'revoked',
        user: { status: 'active' },
      });
      return original;
    });
    await expect(
      f.run(() =>
        f.canonical.crmOperationStatus(
          TENANT,
          { userId: OWNER },
          'activate',
          REQUEST,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function installInput(f: ReturnType<typeof fixture>) {
  return {
    provider: CrmProvider.YCLIENTS,
    apiToken: 'synthetic-install-token',
    settingsJson: { companyId: 42, branchBinding: null },
    expectedVersion: crmConfigurationVersion(f.current),
  };
}
function installCommand(
  dto: ReturnType<typeof installInput>,
): Package5Wave3Command {
  return {
    operation: 'install_crm_credentials',
    sourceIntentRef: REQUEST,
    expectedVersion: dto.expectedVersion,
    provider: dto.provider,
    encryptedApiToken: `synthetic:${dto.apiToken}`,
    credentialFingerprint: wave3Hash({
      namespace: 'package5.wave3.crm-credential',
      value: `${dto.provider}\0${dto.apiToken}`,
    }),
    baseUrl: null,
    settingsJson: dto.settingsJson,
  };
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('qualified install explicit same-key recovery', () => {
  it('allows first explicit re-entry after pre-preview failure without fabricating an earlier receipt', async () => {
    const f = fixture(),
      dto = installInput(f);
    f.crm.previewCredentials.mockRejectedValueOnce(
      new Error('preview lost before admission'),
    );
    await expect(
      f.run(() =>
        f.canonical.installQualifiedCrmCredentials(
          TENANT,
          { userId: OWNER },
          dto,
          REQUEST,
        ),
      ),
    ).rejects.toThrow('preview lost');
    expect(f.stored).toBeNull();
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
    expect(
      await f.run(() =>
        f.canonical.crmOperationStatus(
          TENANT,
          { userId: OWNER },
          'install',
          REQUEST,
        ),
      ),
    ).toMatchObject({ status: 'NOT_OBSERVED' });
    const result = await f.run(() =>
      f.canonical.installQualifiedCrmCredentials(
        TENANT,
        { userId: OWNER },
        dto,
        REQUEST,
      ),
    );
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      receipt: { phase: 'installed' },
    });
    expect(f.db.actionTargetMutation.create).toHaveBeenCalledTimes(1);
  });
  it.each(['same', 'different'] as const)(
    'held original preview plus explicit same UUID %s material: first admitted material wins',
    async (kind) => {
      const f = fixture(),
        dto = installInput(f),
        held = deferred(),
        entered = deferred();
      f.crm.previewCredentials.mockImplementationOnce(async () => {
        entered.release();
        await held.promise;
      });
      const original = f
        .run(() =>
          f.canonical.installQualifiedCrmCredentials(
            TENANT,
            { userId: OWNER },
            dto,
            REQUEST,
          ),
        )
        .then(
          (value) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error }),
        );
      await entered.promise;
      expect(
        await f.run(() =>
          f.canonical.crmOperationStatus(
            TENANT,
            { userId: OWNER },
            'install',
            REQUEST,
          ),
        ),
      ).toMatchObject({ status: 'NOT_OBSERVED' });
      const retried = {
        ...dto,
        apiToken: kind === 'same' ? dto.apiToken : 'different-explicit-token',
      };
      const winner = await f.run(() =>
        f.canonical.installQualifiedCrmCredentials(
          TENANT,
          { userId: OWNER },
          retried,
          REQUEST,
        ),
      );
      expect(winner.status).toBe('SUCCEEDED');
      held.release();
      const result = await original;
      if (kind === 'same') {
        expect(result.error).toBeNull();
        expect(result.value?.receipt).toEqual(winner.receipt);
      } else
        expect(result.error).toMatchObject({
          response: { error: { code: 'crm_operation_material_changed' } },
        });
      expect(f.db.actionTargetMutation.create).toHaveBeenCalledTimes(1);
      expect(f.db.actionAttempt.create).toHaveBeenCalledTimes(1);
    },
  );
  it('rebinds a same-material stale target generation to the single existing trusted READY input once', async () => {
    const f = fixture(),
      dto = installInput(f),
      cmd = installCommand(dto);
    const stale = await f.run(() =>
      f.planner.build(TENANT, { userId: OWNER }, cmd, 'execute'),
    );
    f.db.actionTargetMutation.findFirst.mockResolvedValue({
      targetGeneration: 0,
    } as never);
    const winner = await f.run(() =>
      f.planner.build(TENANT, { userId: OWNER }, cmd, 'execute'),
    );
    await f.ingress.createExecution(winner.request);
    const result = await f.run(() => f.executor.execute(stale));
    expect(result.targetGeneration).toBe(1);
    expect(f.db.actionTargetMutation.create).toHaveBeenCalledTimes(1);
    expect(f.ingress.createExecution).toHaveBeenCalledTimes(3);
  });
  it('changed material in a stale prepared request never inherits the winning READY input', async () => {
    const f = fixture(),
      dto = installInput(f),
      cmd = installCommand(dto);
    const loser = await f.run(() =>
      f.planner.build(
        TENANT,
        { userId: OWNER },
        {
          ...cmd,
          credentialFingerprint: 'a'.repeat(64),
        } as Package5Wave3Command,
        'execute',
      ),
    );
    const winner = await f.run(() =>
      f.planner.build(TENANT, { userId: OWNER }, cmd, 'execute'),
    );
    await f.ingress.createExecution(winner.request);
    await expect(f.run(() => f.executor.execute(loser))).rejects.toMatchObject({
      response: { error: { code: 'crm_operation_material_changed' } },
    });
    expect(f.db.actionTargetMutation.create).not.toHaveBeenCalled();
    expect(f.ingress.createExecution).toHaveBeenCalledTimes(2);
  });
  it('never retries an unclassified ingress failure', async () => {
    const f = fixture(),
      p = await f.run(() =>
        f.planner.build(
          TENANT,
          { userId: OWNER },
          installCommand(installInput(f)),
          'execute',
        ),
      );
    f.ingress.createExecution.mockRejectedValue(
      new Error('unknown ingress failure'),
    );
    await expect(f.run(() => f.executor.execute(p))).rejects.toThrow(
      'unknown ingress failure',
    );
    expect(f.ingress.createExecution).toHaveBeenCalledTimes(1);
    expect(f.stored).toBeNull();
  });
  it('does not retry an ingress conflict without an existing owner occurrence', async () => {
    const f = fixture(),
      p = await f.run(() =>
        f.planner.build(
          TENANT,
          { userId: OWNER },
          installCommand(installInput(f)),
          'execute',
        ),
      );
    f.ingress.createExecution.mockRejectedValue(
      new ActionConflictError('synthetic unmatched identity'),
    );
    await expect(f.run(() => f.executor.execute(p))).rejects.toThrow(
      'unmatched identity',
    );
    expect(f.ingress.createExecution).toHaveBeenCalledTimes(1);
    expect(f.stored).toBeNull();
  });
  it('never loops when the one existing-owner ingress retry also conflicts', async () => {
    const f = fixture(),
      p = await f.run(() =>
        f.planner.build(
          TENANT,
          { userId: OWNER },
          installCommand(installInput(f)),
          'execute',
        ),
      );
    await f.ingress.createExecution(p.request);
    f.ingress.createExecution.mockRejectedValue(
      new ActionConflictError('synthetic conflict retained'),
    );
    await expect(f.run(() => f.executor.execute(p))).rejects.toThrow(
      'conflict retained',
    );
    expect(f.ingress.createExecution).toHaveBeenCalledTimes(3);
    expect(f.db.actionTargetMutation.create).not.toHaveBeenCalled();
  });
  it('refuses a retained READY payload that expires while preview is awaited', async () => {
    const f = fixture(),
      dto = installInput(f),
      p = await f.run(() =>
        f.planner.build(
          TENANT,
          { userId: OWNER },
          installCommand(dto),
          'execute',
        ),
      );
    await f.ingress.createExecution(p.request);
    f.crm.previewCredentials.mockImplementationOnce(async () => {
      f.stored = { ...f.stored, payloadRetentionUntil: new Date(0) };
    });
    await expect(
      f.run(() =>
        f.canonical.installQualifiedCrmCredentials(
          TENANT,
          { userId: OWNER },
          dto,
          REQUEST,
        ),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_operation_evidence_unavailable' } },
    });
    expect(f.db.actionAttempt.create).not.toHaveBeenCalled();
    expect(f.db.actionTargetMutation.create).not.toHaveBeenCalled();
  });
  it('retains durable READY after a pre-mutation failure and finishes only on explicit same-key re-entry', async () => {
    const f = fixture(),
      dto = installInput(f);
    f.db.$executeRaw.mockRejectedValueOnce(
      new Error('local interruption after AE admission'),
    );
    await expect(
      f.run(() =>
        f.canonical.installQualifiedCrmCredentials(
          TENANT,
          { userId: OWNER },
          dto,
          REQUEST,
        ),
      ),
    ).rejects.toThrow('local interruption');
    expect(f.stored?.state).toBe('READY');
    expect(f.db.actionTargetMutation.create).not.toHaveBeenCalled();
    f.crm.previewCredentials.mockClear();
    const read = await f.run(() =>
      f.canonical.crmOperationStatus(
        TENANT,
        { userId: OWNER },
        'install',
        REQUEST,
      ),
    );
    expect(read.status).toBe('READY');
    expect(f.crm.previewCredentials).not.toHaveBeenCalled();
    const restoredPlanner = new Package5Wave3ShadowService(
      {} as never,
      f.db as never,
      f.context,
      f.kernel as never,
      f.provider as never,
    );
    const restoredExecutor = new Package5Wave3ExecutableService(
      f.db as never,
      f.ingress as never,
      f.kernel as never,
      {} as never,
      restoredPlanner,
      f.provider as never,
    );
    const restoredOwner = new Package5Wave3CanonicalCutoverService(
      restoredPlanner,
      restoredExecutor,
      f.context,
      f.db as never,
      {
        encrypt: (value: string) => `synthetic:${value}`,
        opaqueReference: (namespace: string, value: string) =>
          wave3Hash({ namespace, value }),
      } as never,
      f.crm as never,
      {} as never,
    );
    const result = await f.run(() =>
      restoredOwner.installQualifiedCrmCredentials(
        TENANT,
        { userId: OWNER },
        dto,
        REQUEST,
      ),
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(f.db.actionTargetMutation.create).toHaveBeenCalledTimes(1);
  });
  it.each(['expired', 'revoked', 'changed'] as const)(
    'refuses %s READY re-entry before provider/mutation',
    async (kind) => {
      const f = fixture(),
        dto = installInput(f),
        p = await f.run(() =>
          f.planner.build(
            TENANT,
            { userId: OWNER },
            installCommand(dto),
            'execute',
          ),
        );
      await f.ingress.createExecution(p.request);
      if (kind === 'expired')
        f.stored = { ...f.stored, payloadRetentionUntil: new Date(0) };
      if (kind === 'revoked')
        f.db.membership.findUnique.mockResolvedValue({
          id: 'member-a',
          role: 'tenant_owner',
          status: 'revoked',
          user: { status: 'active' },
        });
      await expect(
        f.run(() =>
          f.canonical.installQualifiedCrmCredentials(
            TENANT,
            { userId: OWNER },
            {
              ...dto,
              apiToken: kind === 'changed' ? 'other-token' : dto.apiToken,
            },
            REQUEST,
          ),
        ),
      ).rejects.toThrow();
      expect(f.crm.previewCredentials).not.toHaveBeenCalled();
      expect(f.db.actionTargetMutation.create).not.toHaveBeenCalled();
      expect(f.ingress.createExecution).toHaveBeenCalledTimes(1);
    },
  );
});
