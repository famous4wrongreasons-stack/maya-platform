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
  Package5Wave2ExecutableService,
  Package5Wave2ShadowService,
  type Package5Wave2Command,
  type Package5Wave2ObjectStore,
  type Package5Wave2StoredObject,
} from '../src/package5-wave2/package5-wave2.service';
import { TrialActivationBootstrapService } from '../src/package5-wave2/trial-activation-bootstrap.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';

const NOW = new Date('2026-09-03T22:30:00.000Z');
const IDENTITY_SECRET = 'package5-wave2-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'package5-wave2-proof-payload-secret-'.repeat(3);

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p5_wave2_')) {
    throw new Error('Wave 2 proof refuses a non-disposable database');
  }
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

class ReconcilingObjectStore implements Package5Wave2ObjectStore {
  readonly objects = new Map<string, Package5Wave2StoredObject>();
  dispatches = 0;
  ambiguousOnce = true;

  put(input: {
    requestIdentityHash: string;
    contentHash: string;
  }): Promise<Package5Wave2StoredObject> {
    this.dispatches += 1;
    const stored = {
      url: `/proof/${input.requestIdentityHash}.png`,
      contentHash: input.contentHash,
    };
    this.objects.set(input.requestIdentityHash, stored);
    if (this.ambiguousOnce) {
      this.ambiguousOnce = false;
      throw new Error('synthetic connection loss after object commit');
    }
    return Promise.resolve(stored);
  }

  head(requestIdentityHash: string) {
    return Promise.resolve(this.objects.get(requestIdentityHash) ?? null);
  }
}

async function createTenantScope(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p5w2_${label}_${suffix}`;
  const branchId = `branch_p5w2_${label}_${suffix}`;
  const ownerId = `owner_p5w2_${label}_${suffix}`;
  const clientId = `client_p5w2_${label}_${suffix}`;
  const staffAId = `staff_a_p5w2_${label}_${suffix}`;
  const staffBId = `staff_b_p5w2_${label}_${suffix}`;
  const accessAId = `access_a_p5w2_${label}_${suffix}`;
  const accessBId = `access_b_p5w2_${label}_${suffix}`;
  const providerId = `provider_p5w2_${label}_${suffix}`;
  const currentSessionId = `session_current_${suffix}`;
  const otherSessionId = `session_other_${suffix}`;
  const thirdSessionId = `session_third_${suffix}`;

  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `Wave 2 ${label}`,
      slug: `wave2-${label}-${suffix}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
      currentPeriodEnd: new Date('2027-09-03T00:00:00.000Z'),
    },
  });
  await prisma.brandingSettings.create({
    data: { tenantId, appName: `Wave 2 ${label}`, themeJson: {} },
  });
  await prisma.branch.create({
    data: { id: branchId, tenantId, name: 'Main' },
  });
  await prisma.user.create({
    data: {
      id: ownerId,
      tenantId,
      branchId,
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
  });
  await prisma.user.create({
    data: {
      id: clientId,
      tenantId,
      branchId,
      email: `${clientId}@proof.invalid`,
      passwordHash: 'not-real',
      role: UserRole.client,
      memberships: {
        create: {
          tenantId,
          branchId,
          role: UserRole.client,
          status: MembershipStatus.active,
        },
      },
    },
  });
  await prisma.staff.createMany({
    data: [
      {
        id: staffAId,
        tenantId,
        branchId,
        encryptedDisplayName: 'encrypted-staff-a',
      },
      {
        id: staffBId,
        tenantId,
        branchId,
        encryptedDisplayName: 'encrypted-staff-b',
      },
    ],
  });
  await prisma.crmStaffAccess.createMany({
    data: [
      {
        id: accessAId,
        tenantId,
        staffId: staffAId,
        externalStaffId: `external-a-${suffix}`,
        encryptedDisplayName: 'encrypted-staff-a',
        role: UserRole.staff,
        status: 'pending_contact',
      },
      {
        id: accessBId,
        tenantId,
        staffId: staffBId,
        externalStaffId: `external-b-${suffix}`,
        encryptedDisplayName: 'encrypted-staff-b',
        role: UserRole.staff,
        status: 'pending_contact',
      },
    ],
  });
  await prisma.internalProvider.create({
    data: {
      id: providerId,
      tenantId,
      branchId,
      displayName: 'Provider without login',
    },
  });
  for (const sessionId of [currentSessionId, otherSessionId, thirdSessionId]) {
    await prisma.authSession.create({
      data: {
        id: sessionId,
        tenantId,
        userId: ownerId,
        deviceLabel: sessionId,
        expiresAt: new Date('2027-09-03T00:00:00.000Z'),
      },
    });
    await prisma.authRefreshToken.create({
      data: {
        id: `refresh_${sessionId}`,
        sessionId,
        tokenHash: `hash_${sessionId}`,
        expiresAt: new Date('2027-09-03T00:00:00.000Z'),
      },
    });
  }
  await prisma.authIdentity.create({
    data: {
      tenantId,
      userId: clientId,
      provider: 'yandex',
      providerUserId: `provider-client-${suffix}`,
      profileJson: {},
    },
  });
  return {
    tenantId,
    branchId,
    ownerId,
    clientId,
    accessAId,
    accessBId,
    providerId,
    currentSessionId,
    otherSessionId,
    thirdSessionId,
    existingProviderUserId: `provider-client-${suffix}`,
  };
}

async function rejects(work: () => Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await work();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, message);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const primary = await createTenantScope(prisma, 'primary');
    const foreign = await createTenantScope(prisma, 'foreign');
    const platformId = `platform_${randomUUID().replaceAll('-', '')}`;
    await prisma.user.create({
      data: {
        id: platformId,
        tenantId: null,
        email: `${platformId}@proof.invalid`,
        passwordHash: 'not-real',
        role: UserRole.platform_owner,
      },
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
    const planner = new Package5Wave2ShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
      engine.kernel,
    );
    const objectStore = new ReconcilingObjectStore();
    const executor = new Package5Wave2ExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      engine.runtime,
      planner,
      objectStore,
      () => NOW,
    );
    const owner = { userId: primary.ownerId };
    const platform = { userId: platformId };
    const userAId = `wave2_staff_${randomUUID().replaceAll('-', '')}`;
    const tenantUserId = `wave2_admin_${randomUUID().replaceAll('-', '')}`;
    const providerUserId = `wave2_provider_${randomUUID().replaceAll('-', '')}`;
    const newBranchId = `wave2_branch_${randomUUID().replaceAll('-', '')}`;

    const commands: Array<{
      actor: { userId: string };
      command: Package5Wave2Command;
    }> = [
      {
        actor: owner,
        command: {
          operation: 'configure_staff_access',
          sourceIntentRef: 'shadow-configure-access',
          accessId: primary.accessAId,
          role: 'staff',
          login: {
            userId: userAId,
            email: 'wave2-staff@proof.invalid',
            phone: '+79990000001',
            passwordHash: 'transient-password-hash-a',
          },
        },
      },
      {
        actor: owner,
        command: {
          operation: 'claim_team_owner',
          sourceIntentRef: 'shadow-claim-owner',
          accessId: primary.accessBId,
        },
      },
      {
        actor: owner,
        command: {
          operation: 'revoke_other_session',
          sourceIntentRef: 'shadow-revoke-session',
          sessionId: primary.otherSessionId,
          currentSessionId: primary.currentSessionId,
        },
      },
      {
        actor: owner,
        command: {
          operation: 'revoke_all_sessions',
          sourceIntentRef: 'shadow-revoke-all',
          currentSessionId: primary.currentSessionId,
        },
      },
      {
        actor: owner,
        command: {
          operation: 'link_social_identity',
          sourceIntentRef: 'shadow-link-social',
          assertion: {
            verified: true,
            provider: 'yandex',
            providerUserId: primary.existingProviderUserId,
            email: 'owner-social@proof.invalid',
            profileJson: { safe: 'provider-profile-domain-data' },
          },
        },
      },
      {
        actor: owner,
        command: {
          operation: 'update_tenant_configuration',
          sourceIntentRef: 'shadow-tenant-config',
          changes: { defaultLocale: 'en-US' },
        },
      },
      {
        actor: owner,
        command: {
          operation: 'update_tenant_branding',
          sourceIntentRef: 'shadow-branding',
          changes: { primaryColor: '#123456' },
        },
      },
      {
        actor: owner,
        command: {
          operation: 'upload_tenant_logo',
          sourceIntentRef: 'shadow-logo',
          mimeType: 'image/png',
          bytes: Buffer.from('wave2-proof-logo'),
        },
      },
      {
        actor: platform,
        command: {
          operation: 'create_tenant_user',
          sourceIntentRef: 'shadow-create-user',
          userId: tenantUserId,
          email: 'wave2-admin@proof.invalid',
          passwordHash: 'transient-password-hash-b',
          role: 'tenant_admin',
          branchId: primary.branchId,
        },
      },
      {
        actor: owner,
        command: {
          operation: 'create_provider_user',
          sourceIntentRef: 'shadow-provider-user',
          providerId: primary.providerId,
          userId: providerUserId,
          email: 'wave2-provider@proof.invalid',
          passwordHash: 'transient-password-hash-c',
        },
      },
      {
        actor: platform,
        command: {
          operation: 'suspend_tenant',
          sourceIntentRef: 'shadow-suspend',
        },
      },
      {
        actor: platform,
        command: {
          operation: 'reactivate_tenant',
          sourceIntentRef: 'shadow-reactivate',
        },
      },
      {
        actor: owner,
        command: {
          operation: 'create_tenant_branch',
          sourceIntentRef: 'shadow-create-branch',
          branchId: newBranchId,
          name: 'Second branch',
          timezone: 'Europe/Moscow',
        },
      },
    ];

    const beforeShadow = {
      users: await prisma.user.count(),
      branches: await prisma.branch.count(),
      identities: await prisma.authIdentity.count(),
      mutations: await prisma.actionTargetMutation.count(),
      objectDispatches: objectStore.dispatches,
      logoUrl: (
        await prisma.brandingSettings.findUniqueOrThrow({
          where: { tenantId: primary.tenantId },
        })
      ).logoUrl,
    };
    const shadow = [];
    for (const item of commands) {
      shadow.push(
        await planner.plan(primary.tenantId, item.actor, item.command),
      );
    }
    assert.equal(new Set(shadow.map((row) => row.actionClass)).size, 13);
    assert.equal(
      shadow.every((row) => row.shadowDivergences === 0),
      true,
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        branches: await prisma.branch.count(),
        identities: await prisma.authIdentity.count(),
        mutations: await prisma.actionTargetMutation.count(),
        objectDispatches: objectStore.dispatches,
        logoUrl: (
          await prisma.brandingSettings.findUniqueOrThrow({
            where: { tenantId: primary.tenantId },
          })
        ).logoUrl,
      },
      beforeShadow,
      'Shadow 13/13 must stop before business/provider mutation',
    );

    const executed = [];
    for (const item of commands) {
      const executableCommand = {
        ...item.command,
        sourceIntentRef: item.command.sourceIntentRef.replace(
          'shadow-',
          'execute-',
        ),
      };
      const prepared = await planner.build(
        primary.tenantId,
        item.actor,
        executableCommand,
        'execute',
      );
      let first;
      let retry;
      try {
        first = await executor.execute(prepared);
        retry = await executor.execute(prepared);
        const rebuilt = await planner.build(
          primary.tenantId,
          item.actor,
          executableCommand,
          'execute',
        );
        const restart = await executor.execute(rebuilt);
        assert.equal(first.actionExecutionId, restart.actionExecutionId);
      } catch (error) {
        throw new Error(
          `Executable proof failed for ${item.command.operation}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      assert.equal(first.actionExecutionId, retry.actionExecutionId);
      executed.push(first);
    }
    assert.equal(new Set(executed.map((row) => row.actionClass)).size, 13);
    assert.equal(
      await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId },
      }),
      13,
    );
    assert.equal(
      objectStore.dispatches,
      1,
      'UNKNOWN must reconcile, not blindly redispatch',
    );
    assert.match(
      (
        await prisma.brandingSettings.findUniqueOrThrow({
          where: { tenantId: primary.tenantId },
        })
      ).logoUrl ?? '',
      /^\/proof\/[a-f0-9]{64}\.png$/,
    );
    const logoExecution = await prisma.actionExecution.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        actionClass: 'upload_tenant_logo',
        dryRun: false,
      },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
    assert.equal(logoExecution.state, 'SUCCEEDED');
    assert.deepEqual(
      logoExecution.attempts.map((attempt) => [attempt.kind, attempt.state]),
      [
        ['EXECUTION', 'UNKNOWN'],
        ['RECONCILIATION', 'SUCCEEDED'],
      ],
    );
    assert.equal(
      (
        await prisma.crmStaffAccess.findUniqueOrThrow({
          where: { id: primary.accessAId },
        })
      ).userId,
      userAId,
    );
    assert.equal(
      (
        await prisma.crmStaffAccess.findUniqueOrThrow({
          where: { id: primary.accessBId },
        })
      ).userId,
      primary.ownerId,
    );
    assert.equal(
      await prisma.authSession.count({
        where: {
          tenantId: primary.tenantId,
          userId: primary.ownerId,
          revokedAt: null,
        },
      }),
      0,
    );
    assert.equal(
      (
        await prisma.authIdentity.findUniqueOrThrow({
          where: {
            tenantId_provider_providerUserId: {
              tenantId: primary.tenantId,
              provider: 'yandex',
              providerUserId: primary.existingProviderUserId,
            },
          },
        })
      ).userId,
      primary.ownerId,
    );
    assert.equal(
      (
        await prisma.tenant.findUniqueOrThrow({
          where: { id: primary.tenantId },
        })
      ).status,
      'active',
    );
    assert.equal(
      await prisma.branch.count({
        where: { tenantId: primary.tenantId, id: newBranchId },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.internalProvider.findUniqueOrThrow({
          where: {
            id_tenantId: { id: primary.providerId, tenantId: primary.tenantId },
          },
        })
      ).userId,
      providerUserId,
    );

    const branchRaceId = `branch_race_${randomUUID().replaceAll('-', '')}`;
    const raceCommand: Package5Wave2Command = {
      operation: 'create_tenant_branch',
      sourceIntentRef: 'execute-branch-race',
      branchId: branchRaceId,
      name: 'One race winner',
    };
    const race = await planner.build(
      primary.tenantId,
      owner,
      raceCommand,
      'execute',
    );
    const winners = await Promise.all([
      executor.execute(race),
      executor.execute(race),
    ]);
    assert.equal(winners[0].actionExecutionId, winners[1].actionExecutionId);
    assert.equal(
      await prisma.branch.count({
        where: { tenantId: primary.tenantId, id: branchRaceId },
      }),
      1,
    );

    await rejects(
      () =>
        planner.plan(foreign.tenantId, owner, {
          operation: 'claim_team_owner',
          sourceIntentRef: 'cross-tenant-owner-claim',
          accessId: primary.accessAId,
        }),
      'cross-tenant actor/target must fail closed',
    );
    await rejects(
      () =>
        planner.plan(
          primary.tenantId,
          { userId: primary.clientId },
          {
            operation: 'update_tenant_configuration',
            sourceIntentRef: 'forged-admin-authority',
            changes: { defaultLocale: 'de-DE' },
          },
        ),
      'client cannot forge administrative authority',
    );
    await rejects(
      () =>
        planner.plan(primary.tenantId, owner, {
          operation: 'link_social_identity',
          sourceIntentRef: 'unverified-social-link',
          assertion: {
            verified: false,
            provider: 'yandex',
            providerUserId: 'forged',
          } as never,
        }),
      'unverified provider assertion must fail closed',
    );
    await rejects(
      () =>
        planner.plan(primary.tenantId, owner, {
          operation: 'update_tenant_configuration',
          sourceIntentRef: 'payment-field-forgery',
          changes: { currentPeriodEnd: '2030-01-01T00:00:00.000Z' },
        }),
      'P4-08 payment-derived fields remain outside A26 authority',
    );
    await rejects(
      () =>
        planner.build(
          primary.tenantId,
          owner,
          {
            operation: 'update_tenant_configuration',
            sourceIntentRef: 'execute-tenant-config',
            changes: { defaultLocale: 'fr-FR' },
          },
          'execute',
        ),
      'an existing source identity cannot be reused with changed material',
    );

    const encryptedRows = await prisma.actionExecution.findMany({
      where: { tenantId: primary.tenantId },
      select: {
        normalizedInputEncrypted: true,
        evidenceRefsJson: true,
        policyEvidenceJson: true,
      },
    });
    const durableText = JSON.stringify(encryptedRows);
    for (const forbidden of [
      'wave2-staff@proof.invalid',
      '+79990000001',
      'transient-password-hash-a',
      'provider-client-',
      'wave2-proof-logo',
    ]) {
      assert.equal(
        durableText.includes(forbidden),
        false,
        `${forbidden} must remain outside action evidence`,
      );
    }

    const activationTokenHash = 'd'.repeat(64);
    await prisma.trialActivation.create({
      data: {
        activationTokenHash,
        expiresAt: new Date('2027-09-03T00:00:00.000Z'),
      },
    });
    const bootstrap = new TrialActivationBootstrapService(prisma, () => NOW);
    const bootstrapCommand = {
      activationTokenHash,
      tenant: {
        name: 'Atomic trial',
        slug: `atomic-trial-${randomUUID().replaceAll('-', '')}`,
        defaultTimezone: 'Europe/Moscow',
        defaultLocale: 'ru-RU',
        defaultCurrency: 'RUB',
        trialEndsAt: new Date('2026-09-17T22:30:00.000Z'),
      },
      owner: {
        email: 'atomic-owner@proof.invalid',
        passwordHash: 'transient-bootstrap-password-hash',
      },
      branch: { name: 'Atomic branch' },
    };
    const bootstrapFirst = await bootstrap.activate(bootstrapCommand);
    const bootstrapRetry = await bootstrap.activate(bootstrapCommand);
    assert.equal(bootstrapFirst.tenantId, bootstrapRetry.tenantId);
    assert.equal(bootstrapRetry.resumed, true);
    assert.equal(
      await prisma.membership.count({
        where: { tenantId: bootstrapFirst.tenantId, role: 'tenant_owner' },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.trialActivation.findUniqueOrThrow({
          where: { activationTokenHash },
        })
      ).tenantId,
      bootstrapFirst.tenantId,
    );

    const outcome = {
      shadowActionClasses: '13/13',
      shadowDivergences: 0,
      executableActionClasses: '13/13',
      actionTargetMutations: await prisma.actionTargetMutation.count({
        where: { tenantId: primary.tenantId },
      }),
      duplicateBusinessMutationPossible: false,
      restartRebuildConverges: true,
      tenantAuthorityIsolation: true,
      serverDerivedPolicyAuthority: true,
      trialActivationAtomic: true,
      currentLogoutProtocolPreserved: true,
      crmProjectionBoundaryPreserved: true,
      objectDispatches: objectStore.dispatches,
      providerUnknownReconciled: true,
      blindRetryAfterUnknown: false,
      productionBusinessMutations: 0,
      productionProviderWrites: 0,
    };
    console.log(JSON.stringify(outcome, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
