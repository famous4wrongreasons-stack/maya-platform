import { CanonicalTrialOnboardingService } from '../src/onboarding/canonical-trial-onboarding.service';
import { TenantsService } from '../src/tenants/tenants.service';
import { AdminService } from '../src/admin/admin.service';
import type { AuthenticatedUser } from '../src/common/authenticated-user.interface';
import assert from 'node:assert/strict';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../src/common/domain.enums';
import { EncryptionService } from '../src/encryption/encryption.service';
import { AiConfirmationReceiptService } from '../src/onboarding/ai-confirmation-receipt.service';
import { AiConfirmationCoordinatorService } from '../src/onboarding/ai-confirmation-coordinator.service';
import {
  TrialActivationBootstrapService,
  type TrialActivationBootstrapCommand,
  type TrialActivationBootstrapResult,
} from '../src/package5-wave2/trial-activation-bootstrap.service';
import { Package5Wave2CanonicalCutoverService } from '../src/package5-wave2/package5-wave2-canonical-cutover.service';
import {
  Package5Wave2ShadowService,
  Package5Wave2ExecutableService,
} from '../src/package5-wave2/package5-wave2.service';
import {
  Package5Wave3ShadowService,
  Package5Wave3ExecutableService,
  type Package5Wave3Command,
} from '../src/package5-wave3/package5-wave3.service';
import { Package5Wave3ProductionGatewayService } from '../src/package5-wave3/package5-wave3-production-gateway.service';
import { CrmService, type CrmImportPreview } from '../src/crm/crm.service';
import type { CrmAdapterFactory } from '../src/crm/crm-adapter.factory';
import type { ClientIdentityService } from '../src/crm/client-identity.service';
import type { InternalCalendarService } from '../src/internal-calendar/internal-calendar.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import type { AiOnboardingBlueprint } from '../src/onboarding/ai-onboarding.types';
import type { ConfirmAiOnboardingDraftDto } from '../src/onboarding/dto/ai-onboarding.dto';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_ai_confirm_v1_')
)
  throw new Error('Owned isolated AI runtime proof DB required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const prisma = db as unknown as PrismaService;
const context = new TenantContextService();
const encryption = new EncryptionService(
  new ConfigService({ CRM_ENCRYPTION_KEY: 'synthetic-ai-runtime-encryption' }),
);
const receipts = new AiConfirmationReceiptService(db, encryption);
const bootstrap = new TrialActivationBootstrapService(db);
const engine = createStandaloneCanonicalActionEngine(
  prisma,
  {
    resolveFeatureRequirements: (
      tenantId,
      features,
      evaluatedAt = new Date(),
    ) =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: features.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt,
        validUntil: null,
      }),
  },
  {
    identitySecret: 'synthetic-ai-runtime-identity'.repeat(3),
    payloadEncryptionSecret: 'synthetic-ai-runtime-payload'.repeat(3),
    policyAttestationSecret: 'synthetic-ai-runtime-policy'.repeat(3),
  },
);
const planner = new Package5Wave2ShadowService(
  engine.runtime,
  prisma,
  context,
  engine.kernel,
);
const executor = new Package5Wave2ExecutableService(
  db,
  engine.ingress,
  engine.kernel,
  engine.runtime,
  planner,
);
const canonical = new Package5Wave2CanonicalCutoverService(
  planner,
  executor,
  context,
);
const coordinator = () =>
  new AiConfirmationCoordinatorService(
    prisma,
    encryption,
    receipts,
    bootstrap,
    canonical,
    engine.kernel,
    context,
  );
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const results: string[] = [];
async function rejects(label: string, fn: () => Promise<unknown>) {
  await assert.rejects(fn);
  results.push(label);
}

async function fixture() {
  const token = randomBytes(32).toString('base64url'),
    draftToken = randomBytes(32).toString('base64url');
  const activation = await db.trialActivation.create({
    data: {
      activationTokenHash: hash(token),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const blueprint: AiOnboardingBlueprint = {
    templateId: 'barbershop',
    categoryId: 'business_barbershop',
    workMode: 'business',
    businessName: 'Synthetic receipt business',
    summary: 'Synthetic',
    industryPresetId: 'barbershop',
    calendarSource: CalendarSource.EXTERNAL,
    providerCount: 2,
    providerTitle: 'Staff',
    services: [],
    weeklyRules: [],
    scheduleAssumed: false,
    crmImported: true,
    crmProvider: 'yclients',
    crmCompanyId: '900001',
    crmStaffIdentityHashes: ['owner', 'staff'].map((id) =>
      hash(`yclients:900001:${id}`),
    ),
  };
  const draft = await db.aiOnboardingDraft.create({
    data: {
      draftTokenHash: hash(draftToken),
      templateId: blueprint.templateId,
      blueprintJson: JSON.parse(
        JSON.stringify(blueprint),
      ) as Prisma.InputJsonValue,
      missingFieldsJson: [],
      trialActivationId: activation.id,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const dto: ConfirmAiOnboardingDraftDto = {
    expectedDraftRevision: 0,
    draftToken,
    trialActivationToken: token,
    ownerName: 'Synthetic owner',
    ownerEmail: `${randomUUID()}@example.invalid`,
    ownerPhone: '+79990001001',
    password: 'synthetic-proof-password',
    ownerExternalStaffId: 'owner',
    teamMembers: [
      {
        externalStaffId: 'staff',
        displayName: 'Synthetic staff',
        role: UserRole.STAFF,
        email: `${randomUUID()}@example.invalid`,
      },
    ],
  };
  return {
    draftId: draft.id,
    dto,
    blueprint,
    slug: `ai-proof-${randomUUID()}`,
    ...receipts.reservedIds(hash(token)),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function confirm(f: Fixture) {
  return coordinator().confirm(f.draftId, f.dto, f.blueprint, f.slug);
}
function restart(f: Fixture) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        'node_modules/ts-node/dist/bin.js',
        '--project',
        'tsconfig.scripts.json',
        '--transpile-only',
        __filename,
        '--resume',
      ],
      {
        input: JSON.stringify({
          draftId: f.draftId,
          tenantId: f.tenantId,
          ownerUserId: f.ownerUserId,
        }),
        encoding: 'utf8',
        env: process.env,
        timeout: 30000,
      },
    ),
  ) as Awaited<ReturnType<AiConfirmationCoordinatorService['resume']>>;
}

// Only provider reads are synthetic. Canonical A17 transactions and the actual
// AC5 projection are used; the proof never creates staff/access/link rows itself.
const crm = new CrmService(
  prisma,
  encryption,
  {} as CrmAdapterFactory,
  context,
  {} as InternalCalendarService,
  {} as ClientIdentityService,
  engine.runtime,
);
const preview: CrmImportPreview = {
  provider: CrmProvider.YCLIENTS,
  company_id: '900001',
  company: null,
  services: { count: 0, items: [] },
  staff: { count: 0, items: [] },
  team: {
    count: 2,
    items: ['owner', 'staff'].map((id) => ({
      id,
      name: `Synthetic ${id}`,
      bookable: true,
      suggested_role: 'staff' as const,
    })),
  },
  warnings: [],
};
crm.readImportPreviewReadOnly = async (tenantId: string) => {
  const integration = await db.crmIntegration.findUniqueOrThrow({
    where: { tenantId },
  });
  return {
    connection: {
      ...integration,
      settingsJson: integration.settingsJson,
    } as unknown as Awaited<
      ReturnType<CrmService['readImportPreviewReadOnly']>
    >['connection'],
    preview,
    next_action: null,
  };
};
const gateway = new Package5Wave3ProductionGatewayService(crm, encryption);
const p3 = new Package5Wave3ShadowService(
  engine.runtime,
  prisma,
  context,
  engine.kernel,
  gateway,
);
const e3 = new Package5Wave3ExecutableService(
  db,
  engine.ingress,
  engine.kernel,
  engine.runtime,
  p3,
  gateway,
);
async function connect(f: Fixture, companyId = '900001') {
  return context.runAsSystemTenant(f.tenantId, async () => {
    const commands: Package5Wave3Command[] = [
      {
        operation: 'install_crm_credentials',
        sourceIntentRef: `proof-connect:${f.draftId}:install:${companyId}`,
        provider: 'yclients',
        encryptedApiToken: encryption.encrypt('synthetic-provider-token'),
        credentialFingerprint: encryption.opaqueReference(
          'package5.wave3.crm-credential',
          'yclients\0synthetic-provider-token',
        ),
        settingsJson: { companyId },
      },
      {
        operation: 'activate_crm_integration',
        sourceIntentRef: `proof-connect:${f.draftId}:activate:${companyId}`,
      },
      {
        operation: 'confirm_crm_import',
        sourceIntentRef: `proof-connect:${f.draftId}:import:${companyId}`,
      },
    ];
    for (const command of commands)
      await e3.execute(
        await p3.build(
          f.tenantId,
          { userId: f.ownerUserId },
          command,
          'execute',
        ),
      );
    await gateway.projectConfirmedImport(
      f.tenantId,
      gateway.importEvidence(preview).snapshotHash,
    );
  });
}

async function internalTrialProof() {
  async function fixtureCommand(): Promise<TrialActivationBootstrapCommand> {
    const tokenHash = hash(randomBytes(32).toString('base64url'));
    await db.trialActivation.create({
      data: {
        activationTokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return {
      activationTokenHash: tokenHash,
      tenant: {
        name: 'Internal proof',
        slug: `internal-${randomUUID()}`,
        defaultTimezone: 'Europe/Moscow',
        defaultLocale: 'ru-RU',
        defaultCurrency: 'RUB',
        trialEndsAt: new Date(Date.now() + 86400000),
        calendarSource: 'internal',
      },
      owner: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic-proof-hash',
        displayName: 'Synthetic owner',
      },
      branch: { name: 'First branch' },
    };
  }
  const child = (command: TrialActivationBootstrapCommand, model?: string) =>
    execFileSync(
      process.execPath,
      [
        'node_modules/ts-node/dist/bin.js',
        '--project',
        'tsconfig.scripts.json',
        '--transpile-only',
        __filename,
        '--internal-worker',
        ...(model ? [model] : []),
      ],
      {
        input: JSON.stringify(command),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  for (const model of ['Tenant', 'User', 'InternalProvider']) {
    const command = await fixtureCommand();
    const ids = receipts.reservedIds(command.activationTokenHash);
    assert.throws(
      () => child(command, model),
      (error: unknown) => (error as { status: number }).status === 86,
    );
    assert.equal(await db.tenant.count({ where: { id: ids.tenantId } }), 0);
    assert.equal(await db.user.count({ where: { id: ids.ownerUserId } }), 0);
    assert.equal(
      await db.internalProvider.count({ where: { tenantId: ids.tenantId } }),
      0,
    );
    assert.equal(
      (
        await db.trialActivation.findUniqueOrThrow({
          where: { activationTokenHash: command.activationTokenHash },
        })
      ).status,
      'pending',
    );
    results.push(
      `process crash after ${model} creation leaves activation pending and no partial commit`,
    );
    const resumed = JSON.parse(
      child(command),
    ) as TrialActivationBootstrapResult;
    assert.equal(resumed.tenantId, ids.tenantId);
    const providers = await db.internalProvider.findMany({
      where: { tenantId: ids.tenantId },
    });
    assert.equal(providers.length, 1);
    assert.equal(providers[0].userId, ids.ownerUserId);
    assert.equal(providers[0].branchId, resumed.branchId);
    const before = JSON.stringify(providers);
    assert.equal(
      (JSON.parse(child(command)) as TrialActivationBootstrapResult).tenantId,
      ids.tenantId,
    );
    assert.equal(
      JSON.stringify(
        await db.internalProvider.findMany({
          where: { tenantId: ids.tenantId },
        }),
      ),
      before,
    );
    results.push(
      `fresh-process retry after ${model} crash converges to the same owner/provider outcome`,
    );
  }
  const command = await fixtureCommand();
  const attempts = await Promise.allSettled(
    Array.from({ length: 4 }, () => bootstrap.activate(command)),
  );
  assert(attempts.some((x) => x.status === 'fulfilled'));
  const created = await bootstrap.activate(command);
  for (const result of attempts)
    if (result.status === 'fulfilled')
      assert.equal(result.value.tenantId, created.tenantId);
  assert.equal(
    await db.internalProvider.count({ where: { tenantId: created.tenantId } }),
    1,
  );
  assert.equal(
    await db.user.count({ where: { tenantId: created.tenantId } }),
    1,
  );
  assert.equal(
    await db.membership.count({ where: { tenantId: created.tenantId } }),
    1,
  );
  assert.equal(
    await db.branch.count({ where: { tenantId: created.tenantId } }),
    1,
  );
  results.push(
    'concurrent internal activation has one tenant owner membership branch and provider',
  );
  const where = { tenantId: created.tenantId };
  assert.deepEqual(
    await Promise.all([
      db.internalService.count({ where }),
      db.internalAvailabilityRule.count({ where }),
      db.internalAvailabilityException.count({ where }),
      db.staffProviderLink.count({ where }),
      db.crmIntegration.count({ where }),
    ]),
    [0, 0, 0, 0, 0],
  );
  results.push(
    'minimal bootstrap manufactures no schedules services prices CRM identities or staff links',
  );
  for (const [key, value] of [
    ['userId', created.ownerUserId],
    ['providerId', 'forged'],
    ['tenantId', created.tenantId],
  ])
    await rejects(
      `consumer ${key} cannot override server bootstrap identities`,
      () =>
        bootstrap.activate({
          ...command,
          owner: { ...command.owner, [key]: value },
        }),
    );
  await rejects('cross-tenant branch binding rejected', () =>
    bootstrap.activate({
      ...command,
      branch: { ...command.branch, tenantId: created.tenantId },
    } as TrialActivationBootstrapCommand),
  );
  const foreign = await fixtureCommand();
  const other = await bootstrap.activate(foreign);
  await rejects('database rejects cross-tenant provider owner binding', () =>
    db.internalProvider.update({
      where: {
        tenantId_userId: {
          tenantId: other.tenantId,
          userId: other.ownerUserId,
        },
      },
      data: { userId: created.ownerUserId },
    }),
  );
  await db.tenant.update({
    where: { id: created.tenantId },
    data: { status: 'suspended' },
  });
  await bootstrap.activate(command);
  assert.equal(
    (await db.tenant.findUniqueOrThrow({ where: { id: created.tenantId } }))
      .status,
    'suspended',
  );
  assert.equal(
    await db.internalProvider.count({ where: { tenantId: created.tenantId } }),
    1,
  );
  results.push(
    'suspended internal tenant retains its owner/provider; activation retry does not reactivate or delete it',
  );
  const ai = await fixture();
  await confirm(ai);
  await rejects(
    'AI receipt activation cannot be repurposed for internal bootstrap',
    () =>
      bootstrap.activate({
        ...command,
        activationTokenHash: hash(ai.dto.trialActivationToken!),
      }),
  );
  assert.equal(
    await db.internalProvider.count({ where: { tenantId: ai.tenantId } }),
    0,
  );
}

async function trialProof() {
  const tenantReader = Object.assign(
    Object.create(TenantsService.prototype) as TenantsService,
    {
      getTenantByIdOrThrow: (id: string) =>
        db.tenant.findUniqueOrThrow({ where: { id } }),
      serializeTenant: (tenant: { id: string }) => ({ id: tenant.id }),
    },
  ) as unknown as TenantsService;
  const makeTrial = (actions = canonical) =>
    new CanonicalTrialOnboardingService(
      prisma,
      bootstrap,
      encryption,
      tenantReader,
      {} as never,
      {} as never,
      context,
      actions,
    );
  async function input() {
    const token = randomBytes(32).toString('base64url');
    await db.trialActivation.create({
      data: {
        activationTokenHash: hash(token),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return {
      trialActivationToken: token,
      name: 'Synthetic trial',
      slug: `trial-proof-${randomUUID()}`,
      ownerEmail: `${randomUUID()}@example.invalid`,
      ownerName: 'Synthetic owner',
      ownerPhone: '+79990001001',
      industryPresetId: 'barbershop',
    };
  }
  const dto = await input();
  const trials = await Promise.allSettled([
    makeTrial().activate(dto),
    makeTrial().activate(dto),
  ]);
  assert(trials.some((x) => x.status === 'fulfilled'));
  const first = await makeTrial().activate(dto);
  assert.equal(await db.tenant.count({ where: { id: first.tenantId } }), 1);
  assert.equal(
    await db.branch.count({ where: { tenantId: first.tenantId } }),
    1,
  );
  assert.equal(await db.user.count({ where: { tenantId: first.tenantId } }), 1);
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: first.tenantId } }),
    1,
  );
  results.push(
    'trial concurrent retry creates one logical tenant owner branch and configuration',
  );
  const failed = {
    ...(await input()),
    calendarSource: CalendarSource.INTERNAL,
  };
  const fault = new Package5Wave2CanonicalCutoverService(
    planner,
    executor,
    context,
  );
  fault.execute = () => {
    throw new Error('Synthetic post-bootstrap loss');
  };
  await rejects(
    'post-tenant trial failure does not compensate by deletion',
    () => makeTrial(fault).activate(failed),
  );
  const reserved = receipts.reservedIds(hash(failed.trialActivationToken));
  assert.equal(await db.tenant.count({ where: { id: reserved.tenantId } }), 1);
  assert.equal(
    (
      await db.trialActivation.findUniqueOrThrow({
        where: { activationTokenHash: hash(failed.trialActivationToken) },
      })
    ).status,
    'completed',
  );
  assert.equal(
    (await makeTrial().activate(failed)).tenantId,
    reserved.tenantId,
  );
  assert.equal(
    await db.internalProvider.count({
      where: { tenantId: reserved.tenantId, userId: reserved.ownerUserId },
    }),
    1,
  );
  results.push(
    'trial restart converges from durable activation outcome and preserves the internal provider',
  );
  await db.tenant.update({
    where: { id: reserved.tenantId },
    data: { status: 'suspended' },
  });
  await Promise.allSettled([makeTrial().activate(failed)]);
  results.push('trial retry cannot reactivate a suspended durable outcome');
  assert.equal(
    (await db.tenant.findUniqueOrThrow({ where: { id: reserved.tenantId } }))
      .status,
    'suspended',
  );
  const bound = await fixture();
  await rejects(
    'plain trial endpoint cannot consume draft-bound activation',
    () =>
      makeTrial().activate({
        ...dto,
        trialActivationToken: bound.dto.trialActivationToken,
      }),
  );
  await rejects('trial refuses missing activation identity', () =>
    makeTrial().activate({ ...dto, trialActivationToken: undefined }),
  );
  await rejects('reserved platform host remains forbidden', () =>
    makeTrial().activate({ ...dto, slug: 'app' }),
  );
  const admin = new AdminService(
    tenantReader,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    context,
    {} as never,
    canonical,
    encryption,
    {} as never,
    makeTrial(),
  );
  const adminDto = {
    ...(await input()),
    calendarSource: CalendarSource.INTERNAL,
  };
  const actor = {
    userId: 'synthetic-platform-actor',
    role: UserRole.PLATFORM_OWNER,
  } as AuthenticatedUser;
  const created = await admin.createTenant(adminDto, actor);
  const again = await admin.createTenant(adminDto, actor);
  assert.equal(created.id, again.id);
  assert.equal(
    await db.internalProvider.count({ where: { tenantId: created.id } }),
    1,
  );
  assert.equal(
    created.id,
    receipts.reservedIds(hash(adminDto.trialActivationToken)).tenantId,
  );
  assert.equal(await db.user.count({ where: { tenantId: created.id } }), 1);
  assert.equal(
    await db.authSession.count({ where: { tenantId: created.id } }),
    0,
  );
  results.push(
    'admin is an authorized initiator of the same TrialActivation; no owner impersonation session',
  );
  await rejects('tenant admin cannot create another tenant', () =>
    admin.createTenant(adminDto, { ...actor, role: UserRole.TENANT_ADMIN }),
  );
}

async function run() {
  if (process.argv.includes('--internal-worker')) {
    const command = JSON.parse(
      readFileSync(0, 'utf8'),
    ) as TrialActivationBootstrapCommand;
    command.tenant.trialEndsAt = new Date(command.tenant.trialEndsAt);
    const crashModel =
      process.argv[process.argv.indexOf('--internal-worker') + 1];
    const workerDb = db.$extends({
      query: {
        $allModels: {
          $allOperations: async ({ model, operation, args, query }) => {
            const result = await query(args);
            if (operation === 'create' && model === crashModel)
              process.exit(86);
            return result;
          },
        },
      },
    });
    console.log(
      JSON.stringify(
        await new TrialActivationBootstrapService(
          workerDb as unknown as PrismaClient,
        ).activate(command),
      ),
    );
    return;
  }
  if (process.argv.includes('--resume')) {
    const f = JSON.parse(readFileSync(0, 'utf8')) as {
      draftId: string;
      tenantId: string;
      ownerUserId: string;
    };
    console.log(
      JSON.stringify(
        await coordinator().resume(f.draftId, f.tenantId, f.ownerUserId),
      ),
    );
    return;
  }
  for (const crashAt of [1, 2]) {
    const crashed = await fixture();
    const fault = new Package5Wave2CanonicalCutoverService(
      planner,
      executor,
      context,
    );
    let calls = 0;
    fault.execute = (
      ...args: Parameters<Package5Wave2CanonicalCutoverService['execute']>
    ) => {
      if (++calls === crashAt)
        throw new Error('Synthetic process loss before child dispatch');
      return canonical.execute(...args);
    };
    const worker = new AiConfirmationCoordinatorService(
      prisma,
      encryption,
      receipts,
      bootstrap,
      fault,
      engine.kernel,
      context,
    );
    await rejects(`crash before child ${crashAt} preserves durable plan`, () =>
      worker.confirm(
        crashed.draftId,
        crashed.dto,
        crashed.blueprint,
        crashed.slug,
      ),
    );
    const before = await db.actionExecution.findMany({
      where: { tenantId: crashed.tenantId },
    });
    assert.equal(before.length, crashAt - 1);
    const same = restart(crashed);
    assert.equal(same.ai_onboarding.status, 'waiting_for_crm');
    for (const outcome of before)
      assert.deepEqual(
        await db.actionExecution.findUnique({ where: { id: outcome.id } }),
        outcome,
      );
    assert.equal(await db.tenant.count({ where: { id: crashed.tenantId } }), 1);
    results.push(
      `fresh process resumes crash before child ${crashAt} without replaying successful children`,
    );
  }
  const denied = await fixture();
  const blocked = new Package5Wave2CanonicalCutoverService(
    planner,
    executor,
    context,
  );
  let dispatched = 0;
  blocked.execute = async (
    ...args: Parameters<Package5Wave2CanonicalCutoverService['execute']>
  ) => {
    if (++dispatched === 2)
      await db.membership.update({
        where: {
          userId_tenantId: {
            userId: denied.ownerUserId,
            tenantId: denied.tenantId,
          },
        },
        data: { status: 'suspended' },
      });
    return canonical.execute(...args);
  };
  await rejects(
    'canonical child authority failure preserves earlier success',
    () =>
      new AiConfirmationCoordinatorService(
        prisma,
        encryption,
        receipts,
        bootstrap,
        blocked,
        engine.kernel,
        context,
      ).confirm(denied.draftId, denied.dto, denied.blueprint, denied.slug),
  );
  const earlier = await db.actionExecution.findMany({
    where: { tenantId: denied.tenantId, state: 'SUCCEEDED' },
  });
  assert.equal(earlier.length, 1);
  assert.equal(await db.tenant.count({ where: { id: denied.tenantId } }), 1);
  await rejects('suspended owner cannot resume receipt', () =>
    coordinator().resume(denied.draftId, denied.tenantId, denied.ownerUserId),
  );
  await db.membership.update({
    where: {
      userId_tenantId: {
        userId: denied.ownerUserId,
        tenantId: denied.tenantId,
      },
    },
    data: { status: 'active' },
  });
  restart(denied);
  assert.deepEqual(
    await db.actionExecution.findUnique({ where: { id: earlier[0].id } }),
    earlier[0],
  );
  results.push('authorized recovery preserves the same successful child');
  const mock = await fixture();
  await rejects('mock CRM provider cannot enter approved confirmation', () =>
    confirm({ ...mock, blueprint: { ...mock.blueprint, crmProvider: 'mock' } }),
  );
  assert.equal(await db.tenant.count({ where: { id: mock.tenantId } }), 0);
  await trialProof();
  await internalTrialProof();
  const f = await fixture();
  await rejects('stale confirmation rejected', () =>
    confirm({ ...f, dto: { ...f.dto, expectedDraftRevision: 1 } }),
  );
  const waiting = await confirm(f);
  assert.equal(waiting.ai_onboarding.status, 'waiting_for_crm');
  assert.equal(await db.tenant.count({ where: { id: f.tenantId } }), 1);
  assert.equal(
    await db.staffProviderLink.count({ where: { tenantId: f.tenantId } }),
    0,
  );
  assert.equal(
    await db.crmIntegration.count({ where: { tenantId: f.tenantId } }),
    0,
  );
  results.push(
    'CRM unavailable preserves tenant and successful children without mock links',
  );
  const frozen = await db.aiOnboardingDraft.findUniqueOrThrow({
    where: { id: f.draftId },
  });
  const partial = await db.actionExecution.findMany({
    where: { tenantId: f.tenantId },
  });
  assert.equal(partial.length, 2);
  assert.equal(
    (await confirm(f)).ai_onboarding.confirmation_id,
    waiting.ai_onboarding.confirmation_id,
  );
  assert.deepEqual(
    await db.actionExecution.findMany({ where: { tenantId: f.tenantId } }),
    partial,
  );
  results.push('duplicate confirmation skips successful children');
  await rejects('changed draft cannot reuse frozen receipt', () =>
    confirm({ ...f, blueprint: { ...f.blueprint, businessName: 'Altered' } }),
  );
  await rejects('changed owner intent cannot reuse receipt', () =>
    confirm({ ...f, dto: { ...f.dto, ownerEmail: 'other@example.invalid' } }),
  );
  await rejects('wrong owner resume rejected', () =>
    coordinator().resume(f.draftId, f.tenantId, 'wrong'),
  );
  await rejects('wrong tenant resume rejected', () =>
    coordinator().resume(f.draftId, 'wrong', f.ownerUserId),
  );
  const resumed = restart(f);
  assert.equal(
    resumed.ai_onboarding.confirmation_id,
    waiting.ai_onboarding.confirmation_id,
  );
  assert.deepEqual(
    await db.actionExecution.findMany({ where: { tenantId: f.tenantId } }),
    partial,
  );
  results.push(
    'fresh process restores waiting receipt and preserves successful children',
  );
  await connect(f);
  assert.equal(
    await db.staffProviderLink.count({
      where: { tenantId: f.tenantId, provider: 'yclients' },
    }),
    2,
  );
  results.push(
    'actual A17 canonical import and AC5 projection create local staff links',
  );
  const concurrent = await Promise.allSettled([
    coordinator().resume(f.draftId, f.tenantId, f.ownerUserId),
    coordinator().resume(f.draftId, f.tenantId, f.ownerUserId),
  ]);
  assert(concurrent.some((x) => x.status === 'fulfilled'));
  const done = restart(f);
  assert.equal(done.ai_onboarding.status, 'completed');
  assert.equal(
    done.ai_onboarding.confirmation_id,
    waiting.ai_onboarding.confirmation_id,
  );
  const after = await db.aiOnboardingDraft.findUniqueOrThrow({
    where: { id: f.draftId },
  });
  assert.deepEqual(
    after.confirmationReceiptJson,
    frozen.confirmationReceiptJson,
  );
  assert.equal(
    after.confirmationMaterialEncrypted,
    frozen.confirmationMaterialEncrypted,
  );
  assert.deepEqual(after.blueprintJson, frozen.blueprintJson);
  assert.equal(
    await db.actionExecution.count({
      where: {
        tenantId: f.tenantId,
        capability: { startsWith: 'package5.wave2.' },
      },
    }),
    4,
  );
  assert.equal(await db.user.count({ where: { tenantId: f.tenantId } }), 2);
  results.push(
    'later real CRM resumes same immutable receipt; concurrent workers produce one logical outcome',
  );
  const count = await db.actionTargetMutation.count({
    where: { tenantId: f.tenantId },
  });
  await confirm(f);
  restart(f);
  assert.equal(
    await db.actionTargetMutation.count({ where: { tenantId: f.tenantId } }),
    count,
  );
  results.push(
    'completed confirmation retry creates no duplicate business effects',
  );
  await rejects('tenant physical delete forbidden', () =>
    db.tenant.delete({ where: { id: f.tenantId } }),
  );
  const wrong = await fixture();
  await confirm(wrong);
  await connect(wrong, '900002');
  await rejects('different CRM company cannot resume approved staff plan', () =>
    coordinator().resume(wrong.draftId, wrong.tenantId, wrong.ownerUserId),
  );
  const c = await fixture();
  const competing = await Promise.allSettled([confirm(c), confirm(c)]);
  assert(competing.some((x) => x.status === 'fulfilled'));
  await confirm(c);
  assert.equal(await db.tenant.count({ where: { id: c.tenantId } }), 1);
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: c.tenantId } }),
    2,
  );
  results.push(
    'concurrent initial confirmations converge to one tenant and receipt',
  );
  assert.equal(
    await db.internalProvider.count({
      where: { tenantId: { in: [f.tenantId, c.tenantId, wrong.tenantId] } },
    }),
    0,
  );
  results.push(
    'production CRM-only AI orchestration creates no A28/internal calendar rows',
  );
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      cases: results.length,
      results,
      providerWrites: 0,
      realProductionMutations: 0,
    }),
  );
}
run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
