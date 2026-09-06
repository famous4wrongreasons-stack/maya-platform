import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN,
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3Actor,
  type Package5Wave3Command,
  type Package5Wave3ProviderGateway,
  type StaffDaySlot,
  wave3Hash,
} from '../src/package5-wave3/package5-wave3.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';
import type { ConsentChannelBinding } from '../src/crm/client-consent-authority';

const NOW = new Date('2026-09-03T22:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const IDENTITY_SECRET = 'package5-wave3-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'package5-wave3-proof-payload-secret-'.repeat(3);

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL required');
  const name = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!name.startsWith('maya_c06_p5_wave3_'))
    throw new Error('Wave 3 proof refuses a non-disposable database');
  return value;
}

function entitlements(): Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> {
  return {
    resolveFeatureRequirements: (
      tenantId,
      requiredFeatures,
      evaluatedAt = NOW,
    ): Promise<FeatureRequirementDecision> =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: requiredFeatures.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt,
        validUntil: null,
      }),
  };
}

class ProofProvider implements Package5Wave3ProviderGateway {
  dispatches = 0;
  ambiguousOnce = true;
  tooManyChildren = false;
  readonly days = new Map<string, { revision: string; stateHash: string }>();
  private key(input: {
    tenantId: string;
    externalStaffId: string;
    localDate: string;
  }) {
    return `${input.tenantId}:${input.externalStaffId}:${input.localDate}`;
  }
  seed(input: {
    tenantId: string;
    externalStaffId: string;
    localDate: string;
    revision: string;
    stateHash: string;
  }) {
    this.days.set(this.key(input), {
      revision: input.revision,
      stateHash: input.stateHash,
    });
  }
  readStaffDay(input: {
    tenantId: string;
    provider: string;
    externalStaffId: string;
    localDate: string;
  }) {
    const row = this.days.get(this.key(input));
    if (!row) throw new Error('staff day missing');
    return Promise.resolve(row);
  }
  replaceStaffDay(input: {
    tenantId: string;
    provider: string;
    externalStaffId: string;
    localDate: string;
    slots: StaffDaySlot[];
    requestIdentityHash: string;
  }) {
    this.dispatches += 1;
    const scope = scopes.get(input.tenantId)!;
    const stateHash = wave3Hash({
      staffId: scope.staffId,
      branchId: scope.branchId,
      localDate: input.localDate,
      slots: input.slots,
    });
    this.days.set(this.key(input), {
      revision: wave3Hash({ previous: input.requestIdentityHash }),
      stateHash,
    });
    if (this.ambiguousOnce) {
      this.ambiguousOnce = false;
      throw new Error('synthetic connection loss after provider commit');
    }
    return Promise.resolve({ stateHash });
  }
  reconcileStaffDay(input: {
    tenantId: string;
    provider: string;
    externalStaffId: string;
    localDate: string;
    desiredStateHash: string;
    requestIdentityHash: string;
  }) {
    return Promise.resolve(
      this.days.get(this.key(input))?.stateHash === input.desiredStateHash
        ? ('PROVEN_SUCCEEDED' as const)
        : ('PROVEN_NOT_EXECUTED' as const),
    );
  }
  verifyCrm(input: { tenantId: string; provider: string }) {
    return Promise.resolve({
      snapshotHash: wave3Hash({ contract: 'crm-verification/1', ...input }),
    });
  }
  readCrmImport(input: { tenantId: string; provider: string }) {
    const count = this.tooManyChildren
      ? PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN + 1
      : 3;
    return Promise.resolve({
      snapshotHash: wave3Hash({ contract: 'crm-import/1', ...input }),
      teamChildHashes: Array.from({ length: count }, (_, index) =>
        wave3Hash({ ...input, index }),
      ),
    });
  }
  fingerprintEncryptedValue(input: {
    namespace: string;
    encryptedValue: string;
  }) {
    return wave3Hash(input);
  }
}

interface Scope {
  tenantId: string;
  branchId: string;
  ownerId: string;
  clientUserId: string;
  clientId: string;
  staffId: string;
  externalStaffId: string;
  consentChannel: ConsentChannelBinding;
}
const scopes = new Map<string, Scope>();

async function createScope(
  prisma: PrismaClient,
  label: string,
): Promise<Scope> {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p5w3_${label}_${suffix}`;
  const branchId = `branch_p5w3_${label}_${suffix}`;
  const ownerId = `owner_p5w3_${label}_${suffix}`;
  const clientUserId = `client_user_p5w3_${label}_${suffix}`;
  const clientId = `client_p5w3_${label}_${suffix}`;
  const staffId = `staff_p5w3_${label}_${suffix}`;
  const externalStaffId = `external_staff_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `Wave 3 ${label}`,
      slug: `p5w3-${label}-${suffix}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.external,
      defaultCurrency: 'RUB',
      branches: { create: { id: branchId, name: 'Main' } },
      users: {
        create: [
          {
            id: ownerId,
            email: `${ownerId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.tenant_owner,
            memberships: {
              create: {
                tenantId,
                branchId,
                role: UserRole.tenant_owner,
                status: MembershipStatus.active,
              },
            },
          },
          {
            id: clientUserId,
            email: `${clientUserId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.client,
            memberships: {
              create: {
                tenantId,
                role: UserRole.client,
                status: MembershipStatus.active,
              },
            },
          },
        ],
      },
    },
  });
  await prisma.client.create({
    data: { id: clientId, tenantId, userId: clientUserId },
  });
  // Synthetic seed evidence; production creates this through the verified link
  // protocol. Consent no longer accepts the historical bare User fixture.
  const subjectHash = wave3Hash({ tenantId, clientUserId });
  const verificationIdentityHash = wave3Hash({ tenantId, clientId, label });
  const verificationEvidenceJson = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'synthetic-wave3-proof',
    channelControlProofHash: subjectHash,
    clientAuthorityProofHash: verificationIdentityHash,
    verificationIdentityHash,
    tenantId,
    provider: 'maya_user',
    providerSubjectHash: subjectHash,
    clientId,
  };
  const link = await prisma.clientChannelLink.create({
    data: {
      tenantId,
      clientId,
      provider: 'maya_user',
      providerSubjectHash: subjectHash,
      verificationMethod: 'proven_user_client_link',
      verificationIdentityHash,
      verificationEvidenceJson,
      verificationEvidenceHash: wave3Hash(verificationEvidenceJson),
    },
  });
  const consentChannel: ConsentChannelBinding = {
    linkId: link.id,
    provider: 'maya_user',
    providerSubjectHash: subjectHash,
    verificationEvidenceHash: link.verificationEvidenceHash,
  };
  await prisma.staff.create({
    data: {
      id: staffId,
      tenantId,
      branchId,
      encryptedDisplayName: 'encrypted-staff',
      active: true,
      providerLinks: {
        create: { provider: 'yclients', externalId: externalStaffId },
      },
    },
  });
  const scope = {
    tenantId,
    branchId,
    ownerId,
    clientUserId,
    clientId,
    staffId,
    externalStaffId,
    consentChannel,
  };
  scopes.set(tenantId, scope);
  return scope;
}

async function rejects(run: () => Promise<unknown>, label: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, label);
}

function commands(scope: Scope): Package5Wave3Command[] {
  return [
    {
      operation: 'update_staff_schedule_day',
      sourceIntentRef: 'schedule-one',
      staffId: scope.staffId,
      localDate: '2026-09-04',
      expectedProviderRevision: HASH_A,
      slots: [{ from: '09:00', to: '13:00' }],
    },
    {
      operation: 'install_crm_credentials',
      sourceIntentRef: 'crm-install-one',
      provider: 'yclients',
      encryptedApiToken: 'encrypted-secret-marker-wave3',
      credentialFingerprint: wave3Hash('credential-one'),
      settingsJson: { companyId: 'safe-company-ref' },
    },
    {
      operation: 'activate_crm_integration',
      sourceIntentRef: 'crm-activate-one',
    },
    { operation: 'confirm_crm_import', sourceIntentRef: 'crm-import-one' },
    {
      operation: 'disconnect_crm_integration',
      sourceIntentRef: 'crm-disconnect-one',
    },
    {
      operation: 'update_client_profile',
      sourceIntentRef: 'profile-one',
      clientId: scope.clientId,
      preferredLocale: 'ru-RU',
    },
    {
      operation: 'record_client_consent',
      sourceIntentRef: 'consent-one',
      clientId: scope.clientId,
      kind: 'marketing',
      decision: 'grant',
      occurredAt: NOW,
      effectiveAt: NOW,
      sourceIdentityHash: wave3Hash('consent-source-one'),
    },
    {
      operation: 'update_client_notes',
      sourceIntentRef: 'notes-one',
      clientId: scope.clientId,
      encryptedNotes: 'encrypted-notes-marker-wave3',
      notesFingerprint: wave3Hash('notes-marker-wave3'),
    },
  ];
}

function actorFor(
  scope: Scope,
  command: Package5Wave3Command,
): Package5Wave3Actor {
  if (command.operation === 'record_client_consent')
    return { userId: null, consentChannel: scope.consentChannel };
  return {
    userId:
      command.operation === 'update_client_profile'
        ? scope.clientUserId
        : scope.ownerId,
  };
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const primary = await createScope(prisma, 'primary');
    const activationShadow = await createScope(prisma, 'activation');
    const foreign = await createScope(prisma, 'foreign');
    const provider = new ProofProvider();
    for (const scope of [primary, activationShadow, foreign])
      provider.seed({
        tenantId: scope.tenantId,
        externalStaffId: scope.externalStaffId,
        localDate: '2026-09-04',
        revision: HASH_A,
        stateHash: wave3Hash({ initial: scope.staffId }),
      });
    const engine = createStandaloneCanonicalActionEngine(
      prisma as unknown as PrismaService,
      entitlements(),
      {
        identitySecret: IDENTITY_SECRET,
        payloadEncryptionSecret: PAYLOAD_SECRET,
        policyAttestationSecret: IDENTITY_SECRET,
        now: () => NOW,
      },
    );
    const tenantContext = {
      assertTenantId: (tenantId: string) => tenantId,
    } as TenantContextService;
    const planner = new Package5Wave3ShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
      engine.kernel,
      provider,
    );
    const executor = new Package5Wave3ExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      engine.runtime,
      planner,
      provider,
      () => NOW,
    );

    await prisma.crmIntegration.create({
      data: {
        tenantId: primary.tenantId,
        provider: 'yclients',
        encryptedApiToken: 'preexisting-encrypted',
        status: 'active',
        verifiedAt: NOW,
        lastCheckedAt: NOW,
      },
    });
    await prisma.crmIntegration.create({
      data: {
        tenantId: activationShadow.tenantId,
        provider: 'yclients',
        encryptedApiToken: 'preexisting-encrypted-activation',
        status: 'pending_activation',
      },
    });
    const shadowCommands = commands(primary).filter(
      (row) => row.operation !== 'activate_crm_integration',
    );
    const shadows = [];
    const consentCommand = commands(primary).find(
      (row) => row.operation === 'record_client_consent',
    )!;
    await rejects(
      () =>
        planner.plan(
          primary.tenantId,
          { userId: primary.clientUserId },
          consentCommand,
        ),
      'bare User is not verified Client consent authority',
    );
    for (const command of shadowCommands) {
      const actor = actorFor(primary, command);
      shadows.push(await planner.plan(primary.tenantId, actor, command));
    }
    shadows.push(
      await planner.plan(
        activationShadow.tenantId,
        { userId: activationShadow.ownerId },
        {
          operation: 'activate_crm_integration',
          sourceIntentRef: 'shadow-activate',
        },
      ),
    );
    assert.equal(new Set(shadows.map((row) => row.actionClass)).size, 8);
    assert.equal(
      shadows.every(
        (row) =>
          row.businessMutations === 0 &&
          row.providerWrites === 0 &&
          row.shadowDivergences === 0,
      ),
      true,
    );
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: {
          tenantId: { in: [primary.tenantId, activationShadow.tenantId] },
        },
      }),
      0,
    );
    assert.equal(
      await prisma.customerProfile.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
    );
    assert.equal(
      await prisma.clientConsentFact.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
    );
    assert.equal(provider.dispatches, 0);

    await prisma.crmIntegration.delete({
      where: { tenantId: primary.tenantId },
    });
    const results = [];
    for (const command of commands(primary)) {
      const actor = actorFor(primary, command);
      const prepared = await planner.build(
        primary.tenantId,
        actor,
        command,
        'execute',
      );
      const first = await executor.execute(prepared);
      const retry = await executor.execute(prepared);
      const rebuilt = await planner.build(
        primary.tenantId,
        actor,
        command,
        'execute',
      );
      const restart = await executor.resume(rebuilt);
      assert.equal(first.actionExecutionId, retry.actionExecutionId);
      assert.equal(first.actionExecutionId, restart.actionExecutionId);
      results.push(first);
    }
    assert.equal(new Set(results.map((row) => row.actionClass)).size, 8);
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId },
      }),
      8,
    );
    assert.equal(
      provider.dispatches,
      1,
      'UNKNOWN reconciles without blind redispatch',
    );
    const scheduleDuplicate = await planner.build(
      primary.tenantId,
      { userId: primary.ownerId },
      {
        ...(commands(primary)[0] as Extract<
          Package5Wave3Command,
          { operation: 'update_staff_schedule_day' }
        >),
        sourceIntentRef: 'independent-duplicate-schedule-initiator',
      },
      'execute',
    );
    const scheduleDuplicateResult = await executor.execute(scheduleDuplicate);
    assert.equal(
      scheduleDuplicateResult.actionExecutionId,
      results[0].actionExecutionId,
    );
    assert.equal(provider.dispatches, 1);
    assert.equal(
      await prisma.crmIntegration.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
    );
    assert.equal(
      await prisma.clientConsentFact.count({
        where: { tenantId: primary.tenantId },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.customerProfile.findUniqueOrThrow({
          where: {
            tenantId_clientId: {
              tenantId: primary.tenantId,
              clientId: primary.clientId,
            },
          },
        })
      ).userId,
      primary.clientUserId,
    );
    const scheduleExecution = await prisma.actionExecution.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        actionClass: 'update_external_staff_schedule_day',
        dryRun: false,
      },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    assert.equal(scheduleExecution.state, 'SUCCEEDED');
    assert.deepEqual(
      scheduleExecution.attempts.map((row) => [row.kind, row.state]),
      [
        ['EXECUTION', 'UNKNOWN'],
        ['RECONCILIATION', 'SUCCEEDED'],
      ],
    );

    const profileRace: Package5Wave3Command = {
      operation: 'update_client_profile',
      sourceIntentRef: 'profile-race',
      clientId: primary.clientId,
      preferredLocale: 'en-US',
    };
    const racePrepared = await planner.build(
      primary.tenantId,
      { userId: primary.clientUserId },
      profileRace,
      'execute',
    );
    const race = await Promise.all([
      executor.execute(racePrepared),
      executor.execute(racePrepared),
    ]);
    assert.equal(race[0].actionExecutionId, race[1].actionExecutionId);
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: {
          tenantId: primary.tenantId,
          targetKind: 'client_profile',
          targetRef: primary.clientId,
        },
      }),
      2,
    );
    await rejects(
      () =>
        planner.build(
          primary.tenantId,
          { userId: primary.clientUserId },
          { ...profileRace, sourceIntentRef: 'profile-race-noop-duplicate' },
          'execute',
        ),
      'sequential no-op profile mutation rejected',
    );

    await rejects(
      () =>
        planner.build(
          primary.tenantId,
          { userId: foreign.ownerId },
          {
            operation: 'update_client_notes',
            sourceIntentRef: 'forged-tenant',
            clientId: primary.clientId,
            encryptedNotes: 'x',
            notesFingerprint: wave3Hash('x'),
          },
          'execute',
        ),
      'cross-tenant actor rejected',
    );
    const heldClientId = `held_${randomUUID().replaceAll('-', '')}`;
    await prisma.client.create({
      data: {
        id: heldClientId,
        tenantId: foreign.tenantId,
        userId: foreign.clientUserId,
        crmLinks: {
          create: { provider: 'yclients', externalId: 'collision-one' },
        },
      },
    });
    await prisma.unresolvedClientIdentityHold.create({
      data: {
        tenantId: foreign.tenantId,
        provider: 'yclients',
        externalId: 'collision-one',
        reasonCode: 'loyalty_identity_unresolved',
        sourceNamespace: 'proof',
        sourceEvidenceHash: HASH_A,
        unresolvedPrincipalCount: 2,
      },
    });
    await rejects(
      () =>
        planner.build(
          foreign.tenantId,
          { userId: foreign.clientUserId },
          {
            operation: 'update_client_profile',
            sourceIntentRef: 'held',
            clientId: heldClientId,
            preferredLocale: 'ru-RU',
          },
          'execute',
        ),
      'P02/P03 hold rejected',
    );

    await prisma.crmIntegration.create({
      data: {
        tenantId: foreign.tenantId,
        provider: 'yclients',
        encryptedApiToken: 'encrypted',
        status: 'active',
      },
    });
    provider.tooManyChildren = true;
    await rejects(
      () =>
        planner.build(
          foreign.tenantId,
          { userId: foreign.ownerId },
          { operation: 'confirm_crm_import', sourceIntentRef: 'too-large' },
          'execute',
        ),
      'unbounded CRM import rejected',
    );
    provider.tooManyChildren = false;

    const consent = await prisma.clientConsentFact.findFirstOrThrow({
      where: { tenantId: primary.tenantId },
    });
    await rejects(
      () =>
        prisma.clientConsentFact.update({
          where: {
            id_tenantId: { id: consent.id, tenantId: primary.tenantId },
          },
          data: { decision: 'revoke' },
        }),
      'consent fact append-only',
    );
    const serialized = JSON.stringify(
      await prisma.actionExecution.findMany({
        where: { tenantId: primary.tenantId },
        select: {
          evidenceRefsJson: true,
          normalizedInputEncrypted: true,
          safeResultSummaryJson: true,
        },
      }),
    );
    assert.equal(serialized.includes('encrypted-secret-marker-wave3'), false);
    assert.equal(serialized.includes('encrypted-notes-marker-wave3'), false);

    process.stdout.write(
      JSON.stringify(
        {
          contract: 'package5.wave3.all8-executable-proof/1',
          actionClasses: results.length,
          shadows: shadows.length,
          shadowDivergences: 0,
          mutationFacts: await prisma.actionTargetMutation.count({
            where: { tenantId: primary.tenantId },
          }),
          providerDispatches: provider.dispatches,
          providerReconciliation: true,
          duplicateBusinessMutationPossible: false,
          tenantIsolation: true,
          p02p03Hold: true,
          rawCredentialOrNotesInActionEvidence: false,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
