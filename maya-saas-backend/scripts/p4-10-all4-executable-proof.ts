import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  P4_10_REGISTRATIONS,
  createStandaloneCanonicalActionEngine,
} from '../src/action-engine';
import {
  P410CommerceCredentialExecutableService,
  type P410ExecutionValue,
} from '../src/commerce/p4-10-commerce-credential-executable.service';
import { P410CommerceCredentialShadowService } from '../src/commerce/p4-10-commerce-credential-shadow.service';
import type {
  P410CredentialVerification,
  P410CredentialVerifier,
} from '../src/commerce/p4-10-yookassa-credential-verifier';
import { EncryptionService } from '../src/encryption/encryption.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { TenantContextService } from '../src/tenancy/tenant-context.service';

const NOW = new Date('2026-09-03T18:00:00.000Z');
const IDENTITY_SECRET = 'p4-10-all4-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'p4-10-all4-proof-payload-secret-'.repeat(3);
const ENCRYPTION_SECRET = 'p4-10-all4-proof-encryption-secret-'.repeat(3);

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required for the P4-10 proof');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p410_all4_')) {
    throw new Error(
      'P4-10 proof refuses non-disposable databases; expected maya_c06_p410_all4_*',
    );
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

async function scope(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p410_${label}_${suffix}`;
  const ownerId = `owner_p410_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-10 proof ${label}`,
      slug: `p4-10-all4-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
      users: {
        create: {
          id: ownerId,
          email: `${ownerId}@proof.invalid`,
          passwordHash: 'not-real',
          role: UserRole.tenant_owner,
          memberships: {
            create: {
              tenantId,
              role: UserRole.tenant_owner,
              status: MembershipStatus.active,
            },
          },
        },
      },
    },
  });
  return { tenantId, ownerId };
}

class ProofVerifier implements P410CredentialVerifier {
  reads = 0;
  writes = 0;
  result: P410CredentialVerification = {
    outcome: 'ACCEPTED',
    errorCode: null,
    httpStatus: 200,
    providerWrites: 0,
  };

  verify(): Promise<P410CredentialVerification> {
    this.reads += 1;
    return Promise.resolve(this.result);
  }
}

async function expectRejected(
  run: () => Promise<unknown>,
  reason: string,
): Promise<void> {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, reason);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  try {
    const primary = await scope(prisma, 'primary');
    const shadowExisting = await scope(prisma, 'shadow-existing');
    const foreign = await scope(prisma, 'foreign');
    const unavailable = await scope(prisma, 'unavailable-read');
    const encryption = new EncryptionService(
      new ConfigService({ CRM_ENCRYPTION_KEY: ENCRYPTION_SECRET }),
    );
    await prisma.commerceIntegration.create({
      data: {
        tenantId: shadowExisting.tenantId,
        provider: 'yookassa',
        encryptedShopId: encryption.encrypt('shadow-shop'),
        encryptedSecretKey: encryption.encrypt('shadow-secret'),
        status: 'active',
        verifiedAt: NOW,
        lastCheckedAt: NOW,
      },
    });
    await prisma.commerceIntegration.create({
      data: {
        tenantId: foreign.tenantId,
        provider: 'yookassa',
        encryptedShopId: encryption.encrypt('foreign-shop'),
        encryptedSecretKey: encryption.encrypt('foreign-secret'),
        status: 'active',
        verifiedAt: NOW,
        lastCheckedAt: NOW,
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
    const planner = new P410CommerceCredentialShadowService(
      engine.runtime,
      prisma as unknown as PrismaService,
      tenantContext,
      encryption,
    );
    const verifier = new ProofVerifier();
    const executor = new P410CommerceCredentialExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      encryption,
      verifier,
      () => NOW,
    );

    const beforeShadowIntegrations = await prisma.commerceIntegration.count();
    const shadowResults = [
      await planner.plan(primary.tenantId, primary.ownerId, {
        sourceIntentRef: 'shadow-connect',
        operation: 'connect',
        shopId: 'shadow-new-shop',
        secretKey: 'shadow-new-secret',
      }),
      await planner.plan(shadowExisting.tenantId, shadowExisting.ownerId, {
        sourceIntentRef: 'shadow-replace',
        operation: 'replace',
        shopId: 'shadow-replacement-shop',
        secretKey: 'shadow-replacement-secret',
      }),
      await planner.plan(shadowExisting.tenantId, shadowExisting.ownerId, {
        sourceIntentRef: 'shadow-recheck',
        operation: 'recheck',
      }),
      await planner.plan(shadowExisting.tenantId, shadowExisting.ownerId, {
        sourceIntentRef: 'shadow-disconnect',
        operation: 'disconnect',
      }),
    ];
    assert.equal(
      await prisma.commerceIntegration.count(),
      beforeShadowIntegrations,
    );
    assert.equal(
      shadowResults.every(
        (result) =>
          result.shadowDivergences === 0 &&
          result.credentialMutations === 0 &&
          result.providerWrites === 0 &&
          result.paymentMutations === 0 &&
          result.customerValueMutations === 0,
      ),
      true,
    );
    assert.deepEqual(
      [...new Set(shadowResults.map((result) => result.actionClass))].sort(),
      P4_10_REGISTRATIONS.map((item) => item.actionClass).sort(),
    );

    const connect = await planner.buildRequest(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-connect',
        operation: 'connect',
        shopId: 'primary-shop',
        secretKey: 'primary-secret',
      },
      'execute',
    );
    const [connectA, connectB] = await Promise.all([
      executor.execute(connect.request, connect.material),
      executor.execute(connect.request, connect.material),
    ]);
    assert.equal(connectA.actionExecutionId, connectB.actionExecutionId);
    assert.equal(
      await prisma.commerceIntegration.count({
        where: { tenantId: primary.tenantId },
      }),
      1,
    );
    const connected = await prisma.commerceIntegration.findUniqueOrThrow({
      where: { tenantId: primary.tenantId },
    });
    assert.equal(encryption.decrypt(connected.encryptedShopId), 'primary-shop');
    const immutableIntegrationId = connected.id;

    const competingA = await planner.buildRequest(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'competing-replace-a',
        operation: 'replace',
        shopId: 'replacement-a',
        secretKey: 'replacement-secret-a',
      },
      'execute',
    );
    const competingB = await planner.buildRequest(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'competing-replace-b',
        operation: 'replace',
        shopId: 'replacement-b',
        secretKey: 'replacement-secret-b',
      },
      'execute',
    );
    const competingResults = await Promise.allSettled([
      executor.execute(competingA.request, competingA.material),
      executor.execute(competingB.request, competingB.material),
    ]);
    assert.equal(
      competingResults.filter((result) => result.status === 'fulfilled').length,
      1,
      'concurrent replacement must have one winner',
    );
    assert.equal(
      competingResults.filter((result) => result.status === 'rejected').length,
      1,
      'stale replacement must fail closed',
    );
    const afterReplacement = await prisma.commerceIntegration.findUniqueOrThrow(
      {
        where: { tenantId: primary.tenantId },
      },
    );
    assert.equal(afterReplacement.id, immutableIntegrationId);
    assert.equal(
      ['replacement-a', 'replacement-b'].includes(
        encryption.decrypt(afterReplacement.encryptedShopId),
      ),
      true,
    );

    const winningReplacement = competingResults.find(
      (result): result is PromiseFulfilledResult<P410ExecutionValue> =>
        result.status === 'fulfilled',
    );
    assert.ok(winningReplacement);
    const restartedExecutor = new P410CommerceCredentialExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      encryption,
      verifier,
      () => NOW,
    );
    const winningRequest =
      winningReplacement.value.actionExecutionId ===
      (await engine.ingress.createExecution(competingA.request)).id
        ? competingA
        : competingB;
    const readsBeforeRestart = verifier.reads;
    const restored = await restartedExecutor.execute(
      winningRequest.request,
      winningRequest.material,
    );
    assert.equal(
      restored.actionExecutionId,
      winningReplacement.value.actionExecutionId,
    );
    assert.equal(
      verifier.reads,
      readsBeforeRestart,
      'restart restore must not repeat provider read',
    );

    const recheck = await planner.buildRequest(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-recheck',
        operation: 'recheck',
      },
      'execute',
    );
    const rechecked = await executor.execute(recheck.request, null);
    assert.equal(rechecked.verificationOutcome, 'ACCEPTED');
    assert.equal(rechecked.providerReads, 1);

    verifier.result = {
      outcome: 'UNAVAILABLE',
      errorCode: 'commerce_provider_unavailable',
      httpStatus: null,
      providerWrites: 0,
    };
    const unavailableRecheck = await planner.buildRequest(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-recheck-unavailable',
        operation: 'recheck',
      },
      'execute',
    );
    const unavailableRecheckResult = await executor.execute(
      unavailableRecheck.request,
      null,
    );
    assert.equal(unavailableRecheckResult.verificationOutcome, 'UNAVAILABLE');
    assert.equal(unavailableRecheckResult.connectionState, 'error');
    const erroredIntegration =
      await prisma.commerceIntegration.findUniqueOrThrow({
        where: { tenantId: primary.tenantId },
      });
    assert.equal(erroredIntegration.status, 'error');
    assert.equal(
      erroredIntegration.lastErrorCode,
      'commerce_provider_unavailable',
    );

    const disconnect = await planner.buildRequest(
      primary.tenantId,
      primary.ownerId,
      {
        sourceIntentRef: 'execute-disconnect',
        operation: 'disconnect',
      },
      'execute',
    );
    const [disconnectA, disconnectB] = await Promise.all([
      executor.execute(disconnect.request, null),
      executor.execute(disconnect.request, null),
    ]);
    assert.equal(disconnectA.actionExecutionId, disconnectB.actionExecutionId);
    assert.equal(disconnectA.verificationOutcome, 'NOT_APPLICABLE');
    assert.equal(
      await prisma.commerceIntegration.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
    );

    await expectRejected(
      () =>
        planner.buildRequest(
          foreign.tenantId,
          primary.ownerId,
          {
            sourceIntentRef: 'cross-tenant',
            operation: 'recheck',
          },
          'execute',
        ),
      'cross-tenant actor must fail closed',
    );

    const unavailableConnect = await planner.buildRequest(
      unavailable.tenantId,
      unavailable.ownerId,
      {
        sourceIntentRef: 'unavailable-read-connect',
        operation: 'connect',
        shopId: 'unavailable-shop',
        secretKey: 'unavailable-secret',
      },
      'execute',
    );
    await expectRejected(
      () =>
        executor.execute(
          unavailableConnect.request,
          unavailableConnect.material,
        ),
      'unavailable read must not mutate credential authority',
    );
    assert.equal(
      await prisma.commerceIntegration.count({
        where: { tenantId: unavailable.tenantId },
      }),
      0,
    );
    const unavailableExecution = await prisma.actionExecution.findFirstOrThrow({
      where: { tenantId: unavailable.tenantId },
      include: { attempts: true },
    });
    assert.equal(unavailableExecution.state, ActionExecutionState.FAILED);
    assert.equal(unavailableExecution.reconciliationState, 'NOT_REQUIRED');
    assert.equal(unavailableExecution.attempts.length, 1);
    assert.equal(
      unavailableExecution.attempts[0].externalDispatchState,
      'MAY_HAVE_CROSSED',
    );
    assert.equal(
      unavailableExecution.attempts[0].reconciliationRequired,
      false,
    );

    const succeededActions = await prisma.actionExecution.findMany({
      where: {
        tenantId: primary.tenantId,
        actionClass: {
          in: [...P4_10_REGISTRATIONS.map((item) => item.actionClass)],
        },
        state: ActionExecutionState.SUCCEEDED,
      },
      select: { actionClass: true },
    });
    assert.deepEqual(
      [...new Set(succeededActions.map((row) => row.actionClass))].sort(),
      P4_10_REGISTRATIONS.map((item) => item.actionClass).sort(),
    );
    assert.equal(
      await prisma.actionExecution.count({
        where: {
          tenantId: primary.tenantId,
          state: ActionExecutionState.UNKNOWN,
        },
      }),
      0,
    );
    assert.equal(
      await prisma.actionAttempt.count({
        where: { tenantId: primary.tenantId, reconciliationRequired: true },
      }),
      0,
    );
    assert.equal(await prisma.billingPayment.count(), 0);
    assert.equal(await prisma.customerSubscription.count(), 0);
    assert.equal(await prisma.giftCertificate.count(), 0);
    assert.equal(await prisma.loyaltyTransaction.count(), 0);
    assert.equal(verifier.writes, 0);

    const sensitive = [
      'primary-shop',
      'primary-secret',
      'replacement-a',
      'replacement-secret-a',
      'replacement-b',
      'replacement-secret-b',
    ];
    const actions = await prisma.actionExecution.findMany({
      where: { tenantId: primary.tenantId },
    });
    const attempts = await prisma.actionAttempt.findMany({
      where: { tenantId: primary.tenantId },
    });
    const audits = await prisma.auditLog.findMany({
      where: { tenantId: primary.tenantId },
    });
    const durableActionSurface = JSON.stringify({ actions, attempts, audits });
    for (const raw of sensitive) {
      assert.equal(
        durableActionSurface.includes(raw),
        false,
        'raw credential material must never reach action evidence',
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          p410All4ExecutableProof: 'PASS',
          actionClassesProven: '4/4',
          shadowActionClasses: '4/4',
          shadowDivergences: 0,
          connectOneTime: true,
          replacementImmutableIntegrationIdentity: true,
          concurrentReplacementWinners: 1,
          recheckUsesStoredAuthority: true,
          disconnectOneTime: true,
          rawCredentialsInActionEvidence: false,
          tenantIsolation: true,
          duplicateCredentialMutationPossible: false,
          paymentValueMutations: 0,
          pendingApplicable: false,
          unknownRequired: false,
          providerReconciliationRequired: false,
          unavailableReadCreatesUnknown: false,
          providerReads: verifier.reads,
          providerWrites: verifier.writes,
          productionValueMutations: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
