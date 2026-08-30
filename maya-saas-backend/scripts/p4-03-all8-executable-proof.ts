import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  CalendarSource,
  MembershipStatus,
  Prisma,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionContractError,
  P4_03_BULK_ENVELOPE_CAPABILITIES,
  P4_03_BULK_POLICY_PROFILES,
  P4_03_EXECUTABLE_CAPABILITIES,
  createStandaloneCanonicalActionEngine,
  legacyLoyaltyBackfillShadowNormalizer,
  legacyLoyaltyExpireShadowNormalizer,
  legacyLoyaltyImportShadowNormalizer,
  p403BulkAudienceHash,
  p403BulkChildMutationHash,
  type P403BulkActionClass,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import type { EncryptionService } from '../src/encryption/encryption.service';
import { P403LegacyLoyaltyExecutableService } from '../src/loyalty/p4-03-legacy-loyalty-executable.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const IDENTITY_SECRET =
  'cycle-06-p4-03-all8-proof-identity-secret-disposable-database-only';
const PAYLOAD_SECRET =
  'cycle-06-p4-03-all8-proof-payload-secret-disposable-database-only';
const CODE_SECRET =
  'cycle-06-p4-03-all8-proof-code-secret-disposable-database-only';

type CanonicalEngine = ReturnType<typeof createStandaloneCanonicalActionEngine>;

interface ProofClient {
  userId: string;
  clientId: string;
  accountId: string;
}

function proofDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database.startsWith('maya_c06_p403_all8_')) {
    throw new Error(
      'P4-03 proof refuses non-disposable databases; expected maya_c06_p403_all8_*',
    );
  }
  return connectionString;
}

function opaque(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function hashScalar(part: unknown): string {
  if (part === null || part === undefined) return '';
  if (typeof part === 'string') return part;
  if (
    typeof part === 'number' ||
    typeof part === 'boolean' ||
    typeof part === 'bigint'
  ) {
    return part.toString();
  }
  throw new Error('Proof hash identity parts must be scalar');
}

function sha(parts: readonly unknown[]): string {
  return createHash('sha256')
    .update(parts.map(hashScalar).join('\u001f'))
    .digest('hex');
}

function proofEntitlements(): Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> {
  return {
    resolveFeatureRequirements: (
      tenantId,
      requiredFeatures,
      evaluatedAt = new Date(),
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

function proofEncryption(): EncryptionService {
  return {
    encrypt: (value: string) =>
      `proof:${Buffer.from(value, 'utf8').toString('base64url')}`,
    decrypt: (value: string) =>
      Buffer.from(value.replace(/^proof:/, ''), 'base64url').toString('utf8'),
  } as unknown as EncryptionService;
}

function request(input: {
  tenantId: string;
  capability: string;
  targetRef: string;
  normalizedInput: unknown;
  logicalKey: string;
  actorUserId?: string;
  sourceType?:
    'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge';
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: input.sourceType ?? 'legacy_bridge',
      occurrenceScope: `p4-03:${input.logicalKey}`,
      sourceRef: `p4-03-proof:${input.capability}`,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    },
    targetRef: input.targetRef,
    input: input.normalizedInput,
    evidenceRefs: [`proof:${input.logicalKey}`],
    callerIdempotency: {
      scope: `p4-03.${input.capability}`,
      key: input.logicalKey,
    },
  };
}

async function createTenant(prisma: PrismaClient, label: string) {
  const tenantId = opaque(`tenant_${label}`);
  const ownerId = opaque(`owner_${label}`);
  const staffId = opaque(`staff_${label}`);
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-03 disposable proof ${label}`,
      slug: `p4-03-proof-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      users: {
        create: [
          {
            id: ownerId,
            email: `${ownerId}@proof.invalid`,
            passwordHash: 'not-a-real-password-hash',
            role: UserRole.tenant_owner,
            memberships: {
              create: {
                tenantId,
                role: UserRole.tenant_owner,
                status: MembershipStatus.active,
              },
            },
          },
          {
            id: staffId,
            email: `${staffId}@proof.invalid`,
            passwordHash: 'not-a-real-password-hash',
            role: UserRole.staff,
            memberships: {
              create: {
                tenantId,
                role: UserRole.staff,
                status: MembershipStatus.active,
              },
            },
          },
        ],
      },
    },
  });
  return { tenantId, ownerId, staffId };
}

async function createClient(
  prisma: PrismaClient,
  tenantId: string,
  label: string,
  balance: number,
): Promise<ProofClient> {
  const userId = opaque(`user_${label}`);
  const clientId = opaque(`client_${label}`);
  const user = await prisma.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${userId}@proof.invalid`,
      passwordHash: 'not-a-real-password-hash',
      role: UserRole.customer,
      memberships: {
        create: {
          tenantId,
          role: UserRole.customer,
          status: MembershipStatus.active,
        },
      },
    },
  });
  await prisma.client.create({
    data: { id: clientId, tenantId, userId: user.id },
  });
  const account = await prisma.loyaltyAccount.create({
    data: {
      tenantId,
      userId: user.id,
      source: CalendarSource.internal,
      balance,
    },
  });
  return { userId, clientId, accountId: account.id };
}

async function createSucceededFixtureExecution(
  prisma: PrismaClient,
  tenantId: string,
  actionClass: string,
  targetRef: string,
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await prisma.actionExecution.create({
    data: {
      id,
      tenantId,
      identityVersion: 1,
      identityFingerprint: sha([tenantId, id, 'identity']),
      sourceType: 'synthetic_shadow',
      sourceRef: `p4-03-fixture:${actionClass}`,
      actionClass,
      capability: `p4-03.fixture.${actionClass}`,
      capabilityVersion: 1,
      targetKind: 'proof_fixture',
      targetRef,
      normalizedInputContract: 'maya.p4-03-proof-fixture/1',
      normalizedInputHash: sha([tenantId, id, 'input']),
      evidenceRefsJson: [],
      dryRun: false,
      riskProfileVersion: 1,
      riskFacetsJson: [],
      policyKey: 'p4-03.proof-fixture',
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'PROOF_FIXTURE',
      policyDecidedBy: 'disposable_postgresql_proof',
      approvalRequirement: 'NONE',
      approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
      state: ActionExecutionState.SUCCEEDED,
      executionAttemptCount: 1,
      firstAttemptedAt: now,
      retryPolicyKey: 'proof.none',
      retryPolicyVersion: 1,
      maxExecutionAttempts: 1,
      reconciliationPolicyKey: 'proof.none',
      reconciliationPolicyVersion: 1,
      reconciliationState: ActionReconciliationState.NOT_REQUIRED,
      transportIdentityVersion: 1,
      transportIdempotencyKey: sha([tenantId, id, 'transport']),
      finalOutcomeCode: 'proof_fixture_succeeded',
      finalizedAt: now,
    },
  });
  return id;
}

async function approveAndRunBatch(input: {
  engine: CanonicalEngine;
  executor: P403LegacyLoyaltyExecutableService;
  tenantId: string;
  ownerId: string;
  actionClass: P403BulkActionClass;
  policyWindowRef: string;
  childPlans: Record<string, unknown>[];
  aggregateAbsolutePoints: number;
}): Promise<{
  executionId: string;
  audienceHash: string;
  childMutationHashes: string[];
}> {
  const profile = P4_03_BULK_POLICY_PROFILES[input.actionClass];
  const childMutationHashes = input.childPlans.map((plan) =>
    p403BulkChildMutationHash(input.actionClass, plan),
  );
  const audienceHash = p403BulkAudienceHash({
    actionClass: input.actionClass,
    policyVersion: profile.policyVersion,
    policyWindowRef: input.policyWindowRef,
    childMutationHashes,
  });
  const capability =
    input.actionClass === 'expire_legacy_loyalty'
      ? P4_03_BULK_ENVELOPE_CAPABILITIES.expire
      : input.actionClass === 'backfill_legacy_loyalty'
        ? P4_03_BULK_ENVELOPE_CAPABILITIES.backfill
        : P4_03_BULK_ENVELOPE_CAPABILITIES.import;
  const batchRequest = request({
    tenantId: input.tenantId,
    capability,
    targetRef: `loyalty-batch:${audienceHash}`,
    logicalKey: `batch:${audienceHash}`,
    actorUserId: input.ownerId,
    sourceType: 'authenticated_request',
    normalizedInput: {
      policyVersion: profile.policyVersion,
      policyWindowRef: input.policyWindowRef,
      recipientCount: childMutationHashes.length,
      aggregateAbsolutePoints: input.aggregateAbsolutePoints,
      childMutationHashes,
      audienceHash,
    },
  });
  const pending = await input.engine.ingress.createExecution(batchRequest);
  assert.equal(pending.state, ActionExecutionState.PENDING_APPROVAL);
  assert.equal(pending.approvalDecision, ActionApprovalDecision.PENDING);
  await input.engine.kernel.decideApproval({
    tenantId: input.tenantId,
    executionId: pending.id,
    approverUserId: input.ownerId,
    decision: ActionApprovalDecision.APPROVED,
  });
  const receipt = await input.executor.execute(batchRequest);
  assert.equal(receipt.execution.state, ActionExecutionState.SUCCEEDED);
  assert.equal(receipt.value.providerWrites, 0);
  return { executionId: pending.id, audienceHash, childMutationHashes };
}

function batchChildInput(input: {
  plan: Record<string, unknown>;
  batchExecutionId: string;
  audienceHash: string;
  childMutationHash: string;
  policyWindowRef: string;
  actionClass: P403BulkActionClass;
}): Record<string, unknown> {
  return {
    plan: input.plan,
    batch: {
      batchExecutionId: input.batchExecutionId,
      audienceHash: input.audienceHash,
      childMutationHash: input.childMutationHash,
      policyWindowRef: input.policyWindowRef,
      policyVersion:
        P4_03_BULK_POLICY_PROFILES[input.actionClass].policyVersion,
    },
  };
}

function postCommitCrashPrisma(prisma: PrismaClient): {
  prisma: PrismaClient;
  crashes: () => number;
} {
  type TransactionRunner = (
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<unknown>;
  const run = prisma.$transaction.bind(prisma) as unknown as TransactionRunner;
  let remaining = 1;
  let crashCount = 0;
  return {
    prisma: new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === '$transaction') {
          return async (
            callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
          ) => {
            const result = await run(callback, options);
            if (remaining > 0) {
              remaining -= 1;
              crashCount += 1;
              throw new Error('synthetic crash after P4-03 domain commit');
            }
            return result;
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    }),
    crashes: () => crashCount,
  };
}

async function rejected(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

async function main(): Promise<void> {
  const connectionString = proofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const engine = createStandaloneCanonicalActionEngine(
    prisma as unknown as PrismaService,
    proofEntitlements(),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    },
  );
  const executor = new P403LegacyLoyaltyExecutableService(
    prisma,
    engine.runtime,
    proofEncryption(),
    { redemptionCodeSecret: CODE_SECRET },
  );
  const matrix: Record<string, boolean> = {};

  try {
    const tenant = await createTenant(prisma, 'primary');
    const otherTenant = await createTenant(prisma, 'other');

    const earnClient = await createClient(prisma, tenant.tenantId, 'earn', 100);
    const earnInput = {
      provider: 'yclients',
      canonicalClientId: earnClient.clientId,
      providerVisitIdentityHash: sha(['visit', 'earn-1']),
      visitOccurredOn: '2026-08-29',
      visitAmountRubles: 2000,
      intendedDeltaPoints: 100,
      legacyClaimedPoints: 100,
      calculationPolicy: 'legacy-cashback-5pct-half-even.v1',
      divergenceCode: 'none',
    };
    const earnRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.earn,
      targetRef: earnClient.clientId,
      normalizedInput: earnInput,
      logicalKey: 'earn:visit-1',
      sourceType: 'scheduler',
    });
    const earnFirst = await executor.execute(earnRequest);
    const earnReplay = await executor.execute(earnRequest);
    assert.deepEqual(
      earnReplay.value.transactionIds,
      earnFirst.value.transactionIds,
    );
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: {
          tenantId: tenant.tenantId,
          actionExecutionId: earnFirst.value.actionExecutionId,
        },
      }),
      1,
    );
    matrix.earnIdempotent = true;

    const concurrentClient = await createClient(
      prisma,
      tenant.tenantId,
      'concurrent',
      0,
    );
    const concurrentRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.earn,
      targetRef: concurrentClient.clientId,
      logicalKey: 'earn:concurrent',
      sourceType: 'scheduler',
      normalizedInput: {
        ...earnInput,
        canonicalClientId: concurrentClient.clientId,
        providerVisitIdentityHash: sha(['visit', 'concurrent']),
      },
    });
    await Promise.allSettled([
      executor.execute(concurrentRequest),
      executor.execute(concurrentRequest),
    ]);
    const concurrentReplay = await executor.execute(concurrentRequest);
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: {
          tenantId: tenant.tenantId,
          actionExecutionId: concurrentReplay.value.actionExecutionId,
        },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.loyaltyAccount.findUniqueOrThrow({
          where: {
            userId_tenantId: {
              tenantId: tenant.tenantId,
              userId: concurrentClient.userId,
            },
          },
        })
      ).balance,
      100,
    );
    matrix.concurrentLogicalActionMutatesOnce = true;

    const crashBeforeClient = await createClient(
      prisma,
      tenant.tenantId,
      'crash_before',
      0,
    );
    await prisma.$executeRawUnsafe(
      'CREATE SEQUENCE p4_03_fail_once_seq START 1',
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION p4_03_fail_once() RETURNS trigger AS $$
      BEGIN
        IF NEW."externalRef" LIKE 'p4-03:earn_legacy_loyalty:%'
           AND nextval('p4_03_fail_once_seq') = 1 THEN
          RAISE EXCEPTION 'synthetic P4-03 crash before ledger commit';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER p4_03_fail_once_trigger
      BEFORE INSERT ON "LoyaltyTransaction"
      FOR EACH ROW EXECUTE FUNCTION p4_03_fail_once()
    `);
    const crashBeforeRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.earn,
      targetRef: crashBeforeClient.clientId,
      logicalKey: 'earn:crash-before',
      sourceType: 'scheduler',
      normalizedInput: {
        ...earnInput,
        canonicalClientId: crashBeforeClient.clientId,
        providerVisitIdentityHash: sha(['visit', 'crash-before']),
      },
    });
    const crashBefore = await executor.execute(crashBeforeRequest);
    assert.equal(crashBefore.value.balanceAfter, 100);
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: {
          tenantId: tenant.tenantId,
          actionExecutionId: crashBefore.value.actionExecutionId,
        },
      }),
      1,
    );
    const crashAudit = await prisma.actionExecution.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: crashBefore.value.actionExecutionId,
          tenantId: tenant.tenantId,
        },
      },
      include: { attempts: true },
    });
    assert(
      crashAudit.attempts.some(
        (attempt) => attempt.outcomeCode === 'PROVEN_NOT_EXECUTED',
      ),
    );
    matrix.crashBeforeCommitRollsBackAndReconciles = true;
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER p4_03_fail_once_trigger ON "LoyaltyTransaction"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION p4_03_fail_once()');
    await prisma.$executeRawUnsafe('DROP SEQUENCE p4_03_fail_once_seq');

    const crashAfterClient = await createClient(
      prisma,
      tenant.tenantId,
      'crash_after',
      0,
    );
    const crashing = postCommitCrashPrisma(prisma);
    const crashAfterExecutor = new P403LegacyLoyaltyExecutableService(
      crashing.prisma,
      engine.runtime,
      proofEncryption(),
      { redemptionCodeSecret: CODE_SECRET },
    );
    const crashAfterRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.earn,
      targetRef: crashAfterClient.clientId,
      logicalKey: 'earn:crash-after',
      sourceType: 'scheduler',
      normalizedInput: {
        ...earnInput,
        canonicalClientId: crashAfterClient.clientId,
        providerVisitIdentityHash: sha(['visit', 'crash-after']),
      },
    });
    const crashAfter = await crashAfterExecutor.execute(crashAfterRequest);
    assert.equal(crashing.crashes(), 1);
    assert.equal(crashAfter.value.balanceAfter, 100);
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: {
          tenantId: tenant.tenantId,
          actionExecutionId: crashAfter.value.actionExecutionId,
        },
      }),
      1,
    );
    matrix.postCommitCrashReconcilesWithoutRedispatch = true;
    matrix.blindRetryAfterUnknownIsImpossible = true;

    const expiryClient = await createClient(
      prisma,
      tenant.tenantId,
      'expiry',
      400,
    );
    const expiryPlanRaw = {
      provider: 'yclients',
      canonicalClientId: expiryClient.clientId,
      evaluationWindowStart: '2025-08-30',
      evaluationWindowEnd: '2026-08-30',
      policyEffectiveOn: '2025-01-01',
      canonicalBalancePoints: 400,
      legacyClaimedBalancePoints: 400,
      canonicalRecentAttendedOn: null,
      intendedDeltaPoints: -400,
      eligibilityDecision: 'expire',
      expiryPolicy: 'legacy-inactivity-360d-full-balance.v1',
      perClientCapPoints: 5000,
      perRunCapPoints: 25000,
      capDecision: 'within_cap',
      evidenceCoverage: 'complete',
      divergenceCodes: [],
    };
    const expiryPlan = legacyLoyaltyExpireShadowNormalizer(expiryPlanRaw);
    const expiryBatch = await approveAndRunBatch({
      engine,
      executor,
      tenantId: tenant.tenantId,
      ownerId: tenant.ownerId,
      actionClass: 'expire_legacy_loyalty',
      policyWindowRef: 'utc-day:2026-08-30',
      childPlans: [expiryPlan],
      aggregateAbsolutePoints: 400,
    });
    const expiryRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.expire,
      targetRef: expiryClient.clientId,
      logicalKey: 'expire:2026-08-30',
      sourceType: 'scheduler',
      normalizedInput: batchChildInput({
        plan: expiryPlanRaw,
        batchExecutionId: expiryBatch.executionId,
        audienceHash: expiryBatch.audienceHash,
        childMutationHash: expiryBatch.childMutationHashes[0],
        policyWindowRef: 'utc-day:2026-08-30',
        actionClass: 'expire_legacy_loyalty',
      }),
    });
    const expiryFirst = await executor.execute(expiryRequest);
    const expiryReplay = await executor.execute(expiryRequest);
    assert.deepEqual(
      expiryReplay.value.transactionIds,
      expiryFirst.value.transactionIds,
    );
    assert.equal(expiryFirst.value.balanceAfter, 0);
    matrix.expiryRepeatableWithoutDoubleDebit = true;

    const redeemClient = await createClient(
      prisma,
      tenant.tenantId,
      'redeem_refund',
      2000,
    );
    const appointmentExecutionId = await createSucceededFixtureExecution(
      prisma,
      tenant.tenantId,
      'create_appointment',
      'appointment:proof-1',
    );
    const redeemRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.redeem,
      targetRef: 'redemption:proof-1',
      logicalKey: 'redeem:proof-1',
      sourceType: 'legacy_bridge',
      normalizedInput: {
        provider: 'yclients',
        canonicalClientId: redeemClient.clientId,
        canonicalAppointmentId: 'appointment-proof-1',
        appointmentActionExecutionId: appointmentExecutionId,
        providerRecordIdentityHash: sha(['record', 'proof-1']),
        providerServiceId: 'service-300',
        redemptionRequestIdentityHash: sha(['redemption', 'proof-1']),
        canonicalBalancePoints: 2000,
        serverDerivedPoints: 300,
        legacyClaimedPoints: 300,
        intendedDeltaPoints: -300,
        resultingBalancePoints: 1700,
        eligibilityDecision: 'redeem',
        redemptionPolicy: 'legacy-booking-one-care-service.v1',
        perActionCapPoints: 1000,
        capDecision: 'within_cap',
        appointmentEvidence: 'canonical_create_succeeded',
        providerProjectionDecision: 'deferred_attempt',
        divergenceCodes: [],
      },
    });
    const redeem = await executor.execute(redeemRequest);
    assert.equal(redeem.value.balanceAfter, 1700);
    const refundRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.refund,
      targetRef: 'redemption:proof-1',
      logicalKey: 'refund:proof-1',
      sourceType: 'webhook',
      normalizedInput: {
        provider: 'yclients',
        canonicalClientId: redeemClient.clientId,
        canonicalAppointmentId: 'appointment-proof-1',
        originalRedemptionActionExecutionId: redeem.value.actionExecutionId,
        providerRecordIdentityHash: sha(['record', 'proof-1']),
        cancellationFactHash: sha(['cancel', 'proof-1']),
        originalDebitRowCount: 1,
        originalDebitPoints: 300,
        legacyClaimedRefundPoints: 300,
        intendedDeltaPoints: 300,
        refundDecision: 'refund',
        refundPolicy: 'legacy-cancel-exact-ledger-compensation.v1',
        perActionCapPoints: 1000,
        capDecision: 'within_cap',
        existingRefundDecision: 'none',
        cancellationEvidence: 'proven_removed',
        divergenceCodes: [],
      },
    });
    const refund = await executor.execute(refundRequest);
    assert.equal(refund.value.balanceAfter, 2000);
    assert.deepEqual(
      (await executor.execute(refundRequest)).value.transactionIds,
      refund.value.transactionIds,
    );
    matrix.redeemAndRefundCompensateExactlyOnce = true;

    const importClient = await createClient(
      prisma,
      tenant.tenantId,
      'import',
      100,
    );
    const importPlanRaw = {
      provider: 'yclients',
      canonicalClientId: importClient.clientId,
      loyaltyAccountIdentityHash: sha([
        tenant.tenantId,
        importClient.accountId,
      ]),
      providerCardIdentityHash: sha(['card', 'import-1']),
      providerBalancePoints: 500,
      canonicalCurrentBalancePoints: 100,
      legacyClaimedProviderBalancePoints: 500,
      legacyClaimedCurrentBalancePoints: 100,
      legacyClaimedDeltaPoints: 400,
      intendedDeltaPoints: 400,
      importDecision: 'import',
      importPolicy: 'legacy-one-time-provider-card-alignment.v1',
      perActionCapPoints: 5000,
      capDecision: 'within_cap',
      existingImportDecision: 'none',
      providerEvidence: 'exact_card_snapshot',
      divergenceCodes: [],
    };
    const importPlan = legacyLoyaltyImportShadowNormalizer(importPlanRaw);
    const importBatch = await approveAndRunBatch({
      engine,
      executor,
      tenantId: tenant.tenantId,
      ownerId: tenant.ownerId,
      actionClass: 'import_legacy_loyalty_balance',
      policyWindowRef: 'snapshot:2026-08-30T10:00Z',
      childPlans: [importPlan],
      aggregateAbsolutePoints: 400,
    });
    const importRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.import,
      targetRef: importClient.accountId,
      logicalKey: 'import:card-1:v1',
      actorUserId: tenant.ownerId,
      sourceType: 'authenticated_request',
      normalizedInput: batchChildInput({
        plan: importPlanRaw,
        batchExecutionId: importBatch.executionId,
        audienceHash: importBatch.audienceHash,
        childMutationHash: importBatch.childMutationHashes[0],
        policyWindowRef: 'snapshot:2026-08-30T10:00Z',
        actionClass: 'import_legacy_loyalty_balance',
      }),
    });
    const imported = await executor.execute(importRequest);
    assert.equal(imported.value.balanceAfter, 500);
    assert.deepEqual(
      (await executor.execute(importRequest)).value.transactionIds,
      imported.value.transactionIds,
    );
    matrix.importAlignsStateRatherThanRepeatingDelta = true;

    const backfillA = await createClient(
      prisma,
      tenant.tenantId,
      'backfill_a',
      0,
    );
    const backfillB = await createClient(
      prisma,
      tenant.tenantId,
      'backfill_b',
      0,
    );
    const backfillRaw = (client: ProofClient, suffix: string) => ({
      provider: 'yclients',
      canonicalClientId: client.clientId,
      loyaltyAccountIdentityHash: sha([tenant.tenantId, client.accountId]),
      providerClientIdentityHash: sha(['provider-client', suffix]),
      providerSoldAmountRubles: 10000,
      legacyClaimedSoldAmountRubles: 10000,
      legacyClaimedPoints: 500,
      calculatedUncappedPoints: 500,
      intendedDeltaPoints: 500,
      backfillDecision: 'grant',
      backfillPolicy: 'legacy-welcome-ltv-5pct-cap.v1',
      programVersion: 'legacy-welcome-launch.v1',
      perClientCapPoints: 1000,
      perRunCapPoints: 10000,
      clientCapDecision: 'within_cap',
      runCapDecision: 'within_cap',
      existingSourceDecision: 'none',
      providerEvidence: 'exact_client_ltv_snapshot',
      divergenceCodes: [],
    });
    const backfillRawA = backfillRaw(backfillA, 'a');
    const backfillRawB = backfillRaw(backfillB, 'b');
    const backfillPlans = [
      legacyLoyaltyBackfillShadowNormalizer(backfillRawA),
      legacyLoyaltyBackfillShadowNormalizer(backfillRawB),
    ];
    const backfillBatch = await approveAndRunBatch({
      engine,
      executor,
      tenantId: tenant.tenantId,
      ownerId: tenant.ownerId,
      actionClass: 'backfill_legacy_loyalty',
      policyWindowRef: 'program:legacy-welcome-launch.v1',
      childPlans: backfillPlans,
      aggregateAbsolutePoints: 1000,
    });
    const backfillRequests = [backfillRawA, backfillRawB].map((plan, index) =>
      request({
        tenantId: tenant.tenantId,
        capability: P4_03_EXECUTABLE_CAPABILITIES.backfill,
        targetRef: [backfillA, backfillB][index].clientId,
        logicalKey: `backfill:${index}:v1`,
        sourceType: 'scheduler',
        normalizedInput: batchChildInput({
          plan,
          batchExecutionId: backfillBatch.executionId,
          audienceHash: backfillBatch.audienceHash,
          childMutationHash: backfillBatch.childMutationHashes[index],
          policyWindowRef: 'program:legacy-welcome-launch.v1',
          actionClass: 'backfill_legacy_loyalty',
        }),
      }),
    );
    const backfills = await Promise.all(
      backfillRequests.map((item) => executor.execute(item)),
    );
    assert.notEqual(
      backfills[0].value.actionExecutionId,
      backfills[1].value.actionExecutionId,
    );
    assert.deepEqual(
      (await executor.execute(backfillRequests[0])).value.transactionIds,
      backfills[0].value.transactionIds,
    );
    matrix.bulkFanOutUsesIndependentPerClientExecutions = true;
    matrix.backfillRepeatableWithoutDoubleGrant = true;

    const grantClient = await createClient(
      prisma,
      tenant.tenantId,
      'grant',
      1500,
    );
    const issueInput = {
      provider: 'yclients',
      canonicalClientId: grantClient.clientId,
      requestIdentityHash: sha(['grant-request', 'one']),
      loyaltyAccountIdentityHash: sha([tenant.tenantId, grantClient.accountId]),
      serviceRef: 'yclients:service-spa',
      serviceIdentityHash: sha([tenant.tenantId, 'yclients:service-spa']),
      serviceTitleIdentityHash: sha(['service-title', 'spa']),
      legacyClaimedServiceTitleIdentityHash: sha(['service-title', 'spa']),
      servicePoints: 300,
      legacyClaimedPoints: 300,
      availableBalancePoints: 1500,
      grantDecision: 'issue',
      grantPolicy: 'legacy-one-time-service-grant.v1',
      catalogPolicyVersion: 'server-redeemable-service-allowlist.v1',
      ttlDays: 30,
      perGrantCapPoints: 1000,
      serviceEligibility: 'allowed',
      balanceDecision: 'sufficient',
      capDecision: 'within_cap',
      existingGrantDecision: 'none',
      authorizationEvidence: 'server_resolved_eligible_requester',
      divergenceCodes: [],
    };
    const issueRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.issueGrant,
      targetRef: `grant-request:${issueInput.requestIdentityHash}`,
      logicalKey: 'issue-grant:one',
      actorUserId: grantClient.userId,
      sourceType: 'authenticated_request',
      normalizedInput: issueInput,
    });
    const issue = await executor.execute(issueRequest);
    const issueReplay = await executor.execute(issueRequest);
    assert.equal(issueReplay.value.grantId, issue.value.grantId);
    const grant = await prisma.loyaltyRedemptionGrant.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: issue.value.grantId!,
          tenantId: tenant.tenantId,
        },
      },
    });
    assert.equal(grant.codeHash.length, 64);
    assert(!JSON.stringify(grant).includes('rawCode'));
    matrix.grantIssueIsOneToOneAndStoresHashOnly = true;

    const staffMembership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_tenantId: {
          userId: tenant.staffId,
          tenantId: tenant.tenantId,
        },
      },
    });
    const consumeInput = {
      provider: 'yclients',
      canonicalGrantId: grant.id,
      grantIdentityHash: sha([
        tenant.tenantId,
        grant.id,
        grant.clientId,
        grant.serviceRef,
        String(grant.points),
        grant.issuedAt.toISOString(),
        grant.expiresAt.toISOString(),
        grant.codeHash,
      ]),
      issueExecutionIdentityHash: sha([
        tenant.tenantId,
        grant.issueExecutionId,
      ]),
      canonicalClientId: grant.clientId,
      requesterIdentityHash: sha([
        tenant.tenantId,
        tenant.staffId,
        staffMembership.id,
        'staff',
      ]),
      requesterRole: 'staff',
      requesterAuthority: 'administrative_role',
      loyaltyAccountIdentityHash: sha([tenant.tenantId, grantClient.accountId]),
      serviceRef: grant.serviceRef,
      serviceIdentityHash: sha([tenant.tenantId, grant.serviceRef]),
      grantPoints: grant.points,
      availableBalancePoints: 1500,
      consumeDecision: 'consume',
      consumePolicy: 'legacy-one-time-grant-consume.v1',
      codeHashContract: 'hmac-sha256-normalized-bearer.v1',
      perRedemptionCapPoints: 1000,
      expiryDecision: 'unexpired',
      balanceDecision: 'sufficient',
      capDecision: 'within_cap',
      existingRedemptionDecision: 'none',
      providerProjectionDecision: 'local_only_no_provider_write',
      authorizationEvidence: 'server_resolved_cashier_or_admin',
      legacyClaimedPoints: grant.points,
      legacyClaimedBalancePoints: 1500,
      legacyClaimedUsedDecision: 'none',
      legacyClaimedExpiredDecision: 'unexpired',
      divergenceCodes: [],
    };
    const consumeInputFor = (
      subjectGrant: typeof grant,
      subjectClient: ProofClient,
      balance: number,
    ) => ({
      ...consumeInput,
      canonicalGrantId: subjectGrant.id,
      grantIdentityHash: sha([
        tenant.tenantId,
        subjectGrant.id,
        subjectGrant.clientId,
        subjectGrant.serviceRef,
        String(subjectGrant.points),
        subjectGrant.issuedAt.toISOString(),
        subjectGrant.expiresAt.toISOString(),
        subjectGrant.codeHash,
      ]),
      issueExecutionIdentityHash: sha([
        tenant.tenantId,
        subjectGrant.issueExecutionId,
      ]),
      canonicalClientId: subjectGrant.clientId,
      loyaltyAccountIdentityHash: sha([
        tenant.tenantId,
        subjectClient.accountId,
      ]),
      serviceRef: subjectGrant.serviceRef,
      serviceIdentityHash: sha([tenant.tenantId, subjectGrant.serviceRef]),
      grantPoints: subjectGrant.points,
      availableBalancePoints: balance,
      legacyClaimedPoints: subjectGrant.points,
      legacyClaimedBalancePoints: balance,
    });
    const consumeRequest = request({
      tenantId: tenant.tenantId,
      capability: P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
      targetRef: `loyalty-redemption-grant:${consumeInput.grantIdentityHash}`,
      logicalKey: `consume:${grant.id}`,
      actorUserId: tenant.staffId,
      sourceType: 'authenticated_request',
      normalizedInput: consumeInput,
    });
    const consume = await executor.execute(consumeRequest);
    assert.equal(consume.value.balanceAfter, 1200);
    assert.equal(
      (await executor.execute(consumeRequest)).value.redemptionId,
      consume.value.redemptionId,
    );
    const secondConsume = request({
      ...{
        tenantId: tenant.tenantId,
        capability: P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
        targetRef: `loyalty-redemption-grant:${consumeInput.grantIdentityHash}`,
        logicalKey: `consume:${grant.id}:different-execution`,
        actorUserId: tenant.staffId,
        sourceType: 'authenticated_request' as const,
        normalizedInput: consumeInput,
      },
    });
    await rejected(() => executor.execute(secondConsume));
    assert.equal(
      await prisma.loyaltyRedemption.count({
        where: { tenantId: tenant.tenantId, grantId: grant.id },
      }),
      1,
    );
    matrix.oneTimeConsumeEnforced = true;
    matrix.consumeLocalOnlyProviderWritesZero = true;

    const revokedClient = await createClient(
      prisma,
      tenant.tenantId,
      'revoked',
      1000,
    );
    const revokedIssueInput = {
      ...issueInput,
      canonicalClientId: revokedClient.clientId,
      requestIdentityHash: sha(['grant-request', 'revoked']),
      loyaltyAccountIdentityHash: sha([
        tenant.tenantId,
        revokedClient.accountId,
      ]),
      availableBalancePoints: 1000,
    };
    const revokedIssue = await executor.execute(
      request({
        tenantId: tenant.tenantId,
        capability: P4_03_EXECUTABLE_CAPABILITIES.issueGrant,
        targetRef: `grant-request:${revokedIssueInput.requestIdentityHash}`,
        logicalKey: 'issue-grant:revoked',
        actorUserId: revokedClient.userId,
        sourceType: 'authenticated_request',
        normalizedInput: revokedIssueInput,
      }),
    );
    const revokedGrant = await prisma.loyaltyRedemptionGrant.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: revokedIssue.value.grantId!,
          tenantId: tenant.tenantId,
        },
      },
    });
    const revokeExecutionId = await createSucceededFixtureExecution(
      prisma,
      tenant.tenantId,
      'revoke_loyalty_redemption_grant',
      revokedGrant.id,
    );
    await prisma.loyaltyRedemptionGrantRevocation.create({
      data: {
        tenantId: tenant.tenantId,
        grantId: revokedGrant.id,
        actionExecutionId: revokeExecutionId,
        reasonCode: 'owner_or_admin_request',
        revokedAt: new Date(),
      },
    });
    const revokedConsumeInput = {
      ...consumeInput,
      canonicalGrantId: revokedGrant.id,
      canonicalClientId: revokedGrant.clientId,
      grantIdentityHash: sha([
        tenant.tenantId,
        revokedGrant.id,
        revokedGrant.clientId,
        revokedGrant.serviceRef,
        String(revokedGrant.points),
        revokedGrant.issuedAt.toISOString(),
        revokedGrant.expiresAt.toISOString(),
        revokedGrant.codeHash,
      ]),
      issueExecutionIdentityHash: sha([
        tenant.tenantId,
        revokedGrant.issueExecutionId,
      ]),
      loyaltyAccountIdentityHash: sha([
        tenant.tenantId,
        revokedClient.accountId,
      ]),
      availableBalancePoints: 1000,
      legacyClaimedBalancePoints: 1000,
    };
    await rejected(() =>
      executor.execute(
        request({
          tenantId: tenant.tenantId,
          capability: P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
          targetRef: `loyalty-redemption-grant:${revokedConsumeInput.grantIdentityHash}`,
          logicalKey: `consume:${revokedGrant.id}`,
          actorUserId: tenant.staffId,
          sourceType: 'authenticated_request',
          normalizedInput: revokedConsumeInput,
        }),
      ),
    );
    assert.equal(
      await prisma.loyaltyRedemption.count({
        where: { tenantId: tenant.tenantId, grantId: revokedGrant.id },
      }),
      0,
    );
    matrix.revokedGrantFailsClosed = true;

    const expiredClient = await createClient(
      prisma,
      tenant.tenantId,
      'expired',
      1000,
    );
    const expiredIssueExecutionId = await createSucceededFixtureExecution(
      prisma,
      tenant.tenantId,
      'issue_loyalty_redemption_grant',
      expiredClient.clientId,
    );
    const expiredGrant = await prisma.loyaltyRedemptionGrant.create({
      data: {
        tenantId: tenant.tenantId,
        issueExecutionId: expiredIssueExecutionId,
        clientId: expiredClient.clientId,
        codeHash: sha(['expired-code']),
        serviceRef: 'yclients:service-spa',
        points: 200,
        issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        legacySourceRef: sha(['expired-grant']),
      },
    });
    const expiredConsumeInput = consumeInputFor(
      expiredGrant,
      expiredClient,
      1000,
    );
    await rejected(() =>
      executor.execute(
        request({
          tenantId: tenant.tenantId,
          capability: P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
          targetRef: `loyalty-redemption-grant:${expiredConsumeInput.grantIdentityHash}`,
          logicalKey: `consume:${expiredGrant.id}`,
          actorUserId: tenant.staffId,
          sourceType: 'authenticated_request',
          normalizedInput: expiredConsumeInput,
        }),
      ),
    );
    assert.equal(
      await prisma.loyaltyRedemption.count({
        where: { tenantId: tenant.tenantId, grantId: expiredGrant.id },
      }),
      0,
    );
    matrix.expiredGrantFailsClosed = true;

    const racingClient = await createClient(
      prisma,
      tenant.tenantId,
      'consume_race',
      1000,
    );
    const racingIssueInput = {
      ...issueInput,
      canonicalClientId: racingClient.clientId,
      requestIdentityHash: sha(['grant-request', 'consume-race']),
      loyaltyAccountIdentityHash: sha([
        tenant.tenantId,
        racingClient.accountId,
      ]),
      servicePoints: 200,
      legacyClaimedPoints: 200,
      availableBalancePoints: 1000,
    };
    const racingIssue = await executor.execute(
      request({
        tenantId: tenant.tenantId,
        capability: P4_03_EXECUTABLE_CAPABILITIES.issueGrant,
        targetRef: `grant-request:${racingIssueInput.requestIdentityHash}`,
        logicalKey: 'issue-grant:consume-race',
        actorUserId: racingClient.userId,
        sourceType: 'authenticated_request',
        normalizedInput: racingIssueInput,
      }),
    );
    const racingGrant = await prisma.loyaltyRedemptionGrant.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: racingIssue.value.grantId!,
          tenantId: tenant.tenantId,
        },
      },
    });
    const racingConsumeInput = consumeInputFor(racingGrant, racingClient, 1000);
    const racingRequests = ['a', 'b'].map((suffix) =>
      request({
        tenantId: tenant.tenantId,
        capability: P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
        targetRef: `loyalty-redemption-grant:${racingConsumeInput.grantIdentityHash}`,
        logicalKey: `consume:${racingGrant.id}:${suffix}`,
        actorUserId: tenant.staffId,
        sourceType: 'authenticated_request',
        normalizedInput: racingConsumeInput,
      }),
    );
    const racingResults = await Promise.allSettled(
      racingRequests.map((candidate) => executor.execute(candidate)),
    );
    assert.equal(
      racingResults.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await prisma.loyaltyRedemption.count({
        where: { tenantId: tenant.tenantId, grantId: racingGrant.id },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.loyaltyAccount.findUniqueOrThrow({
          where: {
            userId_tenantId: {
              tenantId: tenant.tenantId,
              userId: racingClient.userId,
            },
          },
        })
      ).balance,
      800,
    );
    matrix.concurrentConsumeHasOneTerminalWinner = true;

    const wrongTenantInput = {
      ...earnInput,
      canonicalClientId: earnClient.clientId,
      providerVisitIdentityHash: sha(['visit', 'wrong-tenant']),
    };
    await rejected(() =>
      executor.execute(
        request({
          tenantId: otherTenant.tenantId,
          capability: P4_03_EXECUTABLE_CAPABILITIES.earn,
          targetRef: earnClient.clientId,
          logicalKey: 'earn:wrong-tenant',
          sourceType: 'scheduler',
          normalizedInput: wrongTenantInput,
        }),
      ),
    );
    matrix.crossTenantMutationRejected = true;

    const forged = {
      ...earnRequest,
      approved: true,
      autonomy: 'L5',
      entitled: true,
    } as TrustedActionExecutionRequestV1;
    const forgedError = await rejected(() => executor.execute(forged));
    assert(forgedError instanceof ActionContractError);
    matrix.forgedCallerAuthorityRejected = true;

    const ledgerBeforeShadow = await prisma.loyaltyTransaction.count({
      where: { tenantId: tenant.tenantId },
    });
    const shadow = await engine.runtime.planShadow(
      request({
        tenantId: tenant.tenantId,
        capability: 'loyalty.legacy-earn.shadow.v1',
        targetRef: earnClient.clientId,
        logicalKey: 'l2.5-shadow',
        sourceType: 'legacy_bridge',
        normalizedInput: {
          ...earnInput,
          providerVisitIdentityHash: sha(['visit', 'shadow']),
        },
      }),
    );
    assert.equal(shadow.state, ActionExecutionState.NOT_EXECUTED);
    assert.equal(shadow.dryRun, true);
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: { tenantId: tenant.tenantId },
      }),
      ledgerBeforeShadow,
    );
    matrix.l25CannotExecute = true;

    await rejected(() =>
      engine.runtime.preview(
        request({
          tenantId: tenant.tenantId,
          capability: P4_03_BULK_ENVELOPE_CAPABILITIES.import,
          targetRef: 'loyalty-batch:forged',
          logicalKey: 'batch:over-cap',
          actorUserId: tenant.ownerId,
          sourceType: 'authenticated_request',
          normalizedInput: {
            policyVersion: 'legacy-loyalty-import.v1',
            policyWindowRef: 'snapshot:over-cap',
            recipientCount: 1,
            aggregateAbsolutePoints: 20001,
            childMutationHashes: [sha(['child', 'over-cap'])],
            audienceHash: sha(['forged-audience']),
          },
        }),
      ),
    );
    matrix.bulkCapsFailClosed = true;

    const restartExecutor = new P403LegacyLoyaltyExecutableService(
      prisma,
      createStandaloneCanonicalActionEngine(
        prisma as unknown as PrismaService,
        proofEntitlements(),
        {
          identitySecret: IDENTITY_SECRET,
          payloadEncryptionSecret: PAYLOAD_SECRET,
        },
      ).runtime,
      proofEncryption(),
      { redemptionCodeSecret: CODE_SECRET },
    );
    assert.deepEqual(
      (await restartExecutor.execute(earnRequest)).value.transactionIds,
      earnFirst.value.transactionIds,
    );
    matrix.restartPreservesLogicalIdentity = true;

    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: { tenantId: tenant.tenantId, actionExecutionId: { not: null } },
      }),
      await prisma.loyaltyTransaction.count({
        where: { tenantId: tenant.tenantId },
      }),
    );
    matrix.ledgerExecutionBindingComplete = true;
    matrix.ledgerBalanceBindingAtomic = true;

    process.stdout.write(
      `${JSON.stringify(
        {
          contract: 'maya.p4-03-all8-executable-proof/1',
          matrix,
          actionClassesProven: 8,
          productionValueMutations: 0,
          providerWrites: 0,
          productionCutover: false,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `P4-03 all-8 executable proof failed: ${
      error instanceof Error ? error.stack : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
