import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  CalendarSource,
  MembershipStatus,
  Prisma,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  EXPENSE_CREATE_POLICY_PROFILE,
  EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
  P4_07_EXECUTABLE_CAPABILITIES,
  createStandaloneCanonicalActionEngine,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import { p407Hash } from '../src/expenses/expense-canonical-shadow.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const NOW = new Date('2026-09-02T18:00:00.000Z');
const IDENTITY_SECRET = 'p4-07-epoch-schema-proof-identity-secret-'.repeat(2);
const PAYLOAD_SECRET = 'p4-07-epoch-schema-proof-payload-secret-'.repeat(2);
const PERIOD_FROM = '2026-08-01';
const PERIOD_TO = '2026-08-31';

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const database = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!database.startsWith('maya_c06_p407_epoch_')) {
    throw new Error(
      'P4-07 epoch proof refuses non-disposable databases; expected maya_c06_p407_epoch_*',
    );
  }
  return value;
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

async function createTenant(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_epoch_${label}_${suffix}`;
  const ownerId = `owner_epoch_${label}_${suffix}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-07 epoch proof ${label}`,
      slug: `p4-07-epoch-${label}-${randomUUID()}`,
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
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { userId_tenantId: { userId: ownerId, tenantId } },
  });
  return { tenantId, ownerId, membershipId: membership.id };
}

function request(input: {
  tenantId: string;
  actorUserId: string;
  capability: string;
  targetRef: string;
  logicalKey: string;
  normalized: Record<string, unknown>;
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: 'authenticated_request',
      occurrenceScope: `p4-07-epoch:${input.logicalKey}`,
      sourceRef: `proof:${input.logicalKey}`,
      actorUserId: input.actorUserId,
    },
    targetRef: input.targetRef,
    input: input.normalized,
    evidenceRefs: [`proof:${input.logicalKey}`],
    callerIdempotency: {
      scope: `p4-07.epoch.${input.capability}`,
      key: input.logicalKey,
    },
  };
}

function declarationRequest(
  scope: Awaited<ReturnType<typeof createTenant>>,
  epoch: number,
) {
  const ledgerSnapshotHash = p407Hash([
    'p4-07.epoch-proof.snapshot.v1',
    scope.tenantId,
    PERIOD_FROM,
    PERIOD_TO,
  ]);
  const declarationIdentityHash = p407Hash([
    'p4-07.declare-expense-period-complete.v2',
    scope.tenantId,
    PERIOD_FROM,
    PERIOD_TO,
    ledgerSnapshotHash,
    String(epoch),
  ]);
  return request({
    tenantId: scope.tenantId,
    actorUserId: scope.ownerId,
    capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
    targetRef: `expense-period:${PERIOD_FROM}:${PERIOD_TO}`,
    logicalKey: `declare:${PERIOD_FROM}:${PERIOD_TO}:epoch:${epoch}`,
    normalized: {
      periodFromDay: PERIOD_FROM,
      periodToDay: PERIOD_TO,
      ledgerSnapshotHash,
      declarationIdentityHash,
      actorMembershipId: scope.membershipId,
      actorRole: 'tenant_owner',
      policyProfile: EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
      policySnapshotHash: p407Hash([
        EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
        scope.tenantId,
        scope.membershipId,
        declarationIdentityHash,
      ]),
      approvalRequirement: 'NONE_EXPLICIT_OWNER_ASSERTION',
      branchScope: 'whole_tenant',
      intendedMutation: 'insert_current_period_declaration',
      declarationWritePerformed: false,
    },
  });
}

function invalidatorRequest(
  scope: Awaited<ReturnType<typeof createTenant>>,
  label: string,
) {
  const identity = p407Hash([
    'p4-07.epoch-proof.invalidator.v1',
    scope.tenantId,
    label,
  ]);
  return request({
    tenantId: scope.tenantId,
    actorUserId: scope.ownerId,
    capability: P4_07_EXECUTABLE_CAPABILITIES.create,
    targetRef: `expense-intent:${identity}`,
    logicalKey: `invalidate:${label}`,
    normalized: {
      intentIdentityHash: identity,
      branchId: null,
      category: 'other',
      amountKopecks: 1,
      currency: 'RUB',
      occurredDay: '2026-08-15',
      occurredAt: '2026-08-15T12:00:00.000Z',
      sourceNamespace: 'p4-07-epoch-proof',
      externalRefHash: null,
      encryptedNote: null,
      actorMembershipId: scope.membershipId,
      actorRole: 'tenant_owner',
      policyProfile: EXPENSE_CREATE_POLICY_PROFILE,
      policySnapshotHash: p407Hash([
        EXPENSE_CREATE_POLICY_PROFILE,
        scope.tenantId,
        scope.membershipId,
        identity,
      ]),
      approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
      intendedMutation:
        'insert_expense_and_invalidate_overlapping_declarations',
      expenseWritePerformed: false,
      declarationInvalidationPerformed: false,
    },
  });
}

async function createSucceededExecution(
  prisma: PrismaClient,
  engine: ReturnType<typeof createStandaloneCanonicalActionEngine>,
  actionRequest: TrustedActionExecutionRequestV1,
  approverUserId: string,
) {
  let execution = await engine.ingress.createExecution(actionRequest);
  if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
    await engine.kernel.decideApproval({
      tenantId: actionRequest.tenantId,
      executionId: execution.id,
      approverUserId,
      decision: 'APPROVED',
    });
    execution = await prisma.actionExecution.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: execution.id,
          tenantId: actionRequest.tenantId,
        },
      },
    });
  }
  if (execution.state === ActionExecutionState.SUCCEEDED) {
    return execution;
  }
  assert.equal(execution.state, ActionExecutionState.READY);
  const claim = await engine.kernel.claimExecution({
    tenantId: actionRequest.tenantId,
    executionId: execution.id,
    workerId: 'p4-07-epoch-schema-proof',
  });
  await engine.kernel.finalizeSuccess({
    tenantId: actionRequest.tenantId,
    executionId: execution.id,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
    outcomeCode: 'proof_execution_succeeded',
    safeResult: { schemaProof: true },
  });
  return prisma.actionExecution.findUniqueOrThrow({
    where: {
      id_tenantId: {
        id: execution.id,
        tenantId: actionRequest.tenantId,
      },
    },
  });
}

async function createDeclaration(
  prisma: PrismaClient,
  scope: Awaited<ReturnType<typeof createTenant>>,
  executionId: string,
  epoch: number,
) {
  return prisma.expensePeriodDeclaration.create({
    data: {
      tenantId: scope.tenantId,
      actionExecutionId: executionId,
      declaredById: scope.ownerId,
      periodFromDay: PERIOD_FROM,
      periodToDay: PERIOD_TO,
      declarationEpoch: epoch,
      idempotencyKey: `epoch:${epoch}`,
    },
  });
}

async function invalidate(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  tenantId: string;
  declaration: {
    id: string;
    actionExecutionId: string | null;
    declarationEpoch: number | null;
  };
  invalidationExecutionId: string;
  invalidationId?: string;
}) {
  assert.notEqual(input.declaration.actionExecutionId, null);
  assert.notEqual(input.declaration.declarationEpoch, null);
  const previous = input.declaration.declarationEpoch as number;
  await input.prisma.expensePeriodDeclarationInvalidation.create({
    data: {
      id: input.invalidationId ?? randomUUID(),
      tenantId: input.tenantId,
      periodFromDay: PERIOD_FROM,
      periodToDay: PERIOD_TO,
      invalidatedDeclarationId: input.declaration.id,
      invalidatedDeclarationActionExecutionId: input.declaration
        .actionExecutionId as string,
      invalidationActionExecutionId: input.invalidationExecutionId,
      previousDeclarationEpoch: previous,
      nextDeclarationEpoch: previous + 1,
      reasonCode: 'expense_ledger_changed:create',
    },
  });
  await input.prisma.expensePeriodDeclaration.delete({
    where: { id: input.declaration.id },
  });
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  const engine = createStandaloneCanonicalActionEngine(
    prisma as unknown as PrismaService,
    proofEntitlements(),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
      now: () => NOW,
    },
  );

  try {
    const primary = await createTenant(prisma, 'primary');
    const other = await createTenant(prisma, 'other');

    const historical = await prisma.expensePeriodDeclaration.create({
      data: {
        tenantId: primary.tenantId,
        declaredById: primary.ownerId,
        periodFromDay: '2026-07-01',
        periodToDay: '2026-07-31',
        idempotencyKey: 'historical-null-epoch',
      },
    });
    assert.equal(historical.declarationEpoch, null);

    const declare0 = await createSucceededExecution(
      prisma,
      engine,
      declarationRequest(primary, 0),
      primary.ownerId,
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclaration.create({
        data: {
          tenantId: primary.tenantId,
          actionExecutionId: declare0.id,
          declaredById: primary.ownerId,
          periodFromDay: PERIOD_FROM,
          periodToDay: PERIOD_TO,
          idempotencyKey: 'canonical-without-epoch',
        },
      }),
    );
    const initialDeclarationRace = await Promise.allSettled([
      createDeclaration(prisma, primary, declare0.id, 0),
      createDeclaration(prisma, primary, declare0.id, 0),
    ]);
    assert.equal(
      initialDeclarationRace.filter((result) => result.status === 'fulfilled')
        .length,
      1,
    );
    assert.equal(
      initialDeclarationRace.filter((result) => result.status === 'rejected')
        .length,
      1,
    );
    const declaration0 = await prisma.expensePeriodDeclaration.findFirstOrThrow(
      {
        where: {
          tenantId: primary.tenantId,
          periodFromDay: PERIOD_FROM,
          periodToDay: PERIOD_TO,
        },
      },
    );
    assert.equal(declaration0.declarationEpoch, 0);
    assert.equal(
      (
        await createSucceededExecution(
          prisma,
          engine,
          declarationRequest(primary, 0),
          primary.ownerId,
        )
      ).id,
      declare0.id,
      'retry before invalidation must converge on the same execution',
    );

    await assert.rejects(() =>
      prisma.expensePeriodDeclaration.update({
        where: { id: declaration0.id },
        data: { declarationEpoch: 1 },
      }),
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclaration.update({
        where: { id: declaration0.id },
        data: { declarationEpoch: null },
      }),
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclaration.update({
        where: { id: declaration0.id },
        data: { actionExecutionId: randomUUID() },
      }),
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclaration.delete({
        where: { id: declaration0.id },
      }),
    );

    const invalidator0 = await createSucceededExecution(
      prisma,
      engine,
      invalidatorRequest(primary, 'epoch-0'),
      primary.ownerId,
    );
    await assert.rejects(() =>
      prisma.$transaction(async (tx) => {
        await tx.expensePeriodDeclarationInvalidation.create({
          data: {
            tenantId: primary.tenantId,
            periodFromDay: PERIOD_FROM,
            periodToDay: PERIOD_TO,
            invalidatedDeclarationId: declaration0.id,
            invalidatedDeclarationActionExecutionId: declare0.id,
            invalidationActionExecutionId: invalidator0.id,
            previousDeclarationEpoch: 0,
            nextDeclarationEpoch: 1,
            reasonCode: 'expense_ledger_changed:create',
          },
        });
      }),
    );
    assert.equal(await prisma.expensePeriodDeclarationInvalidation.count(), 0);

    const otherInvalidator = await createSucceededExecution(
      prisma,
      engine,
      invalidatorRequest(other, 'cross-tenant'),
      other.ownerId,
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclarationInvalidation.create({
        data: {
          tenantId: other.tenantId,
          periodFromDay: PERIOD_FROM,
          periodToDay: PERIOD_TO,
          invalidatedDeclarationId: declaration0.id,
          invalidatedDeclarationActionExecutionId: declare0.id,
          invalidationActionExecutionId: otherInvalidator.id,
          previousDeclarationEpoch: 0,
          nextDeclarationEpoch: 1,
          reasonCode: 'expense_ledger_changed:create',
        },
      }),
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclarationInvalidation.create({
        data: {
          tenantId: primary.tenantId,
          periodFromDay: '2026-08-02',
          periodToDay: PERIOD_TO,
          invalidatedDeclarationId: declaration0.id,
          invalidatedDeclarationActionExecutionId: declare0.id,
          invalidationActionExecutionId: invalidator0.id,
          previousDeclarationEpoch: 0,
          nextDeclarationEpoch: 1,
          reasonCode: 'expense_ledger_changed:create',
        },
      }),
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclarationInvalidation.create({
        data: {
          tenantId: primary.tenantId,
          periodFromDay: PERIOD_FROM,
          periodToDay: PERIOD_TO,
          invalidatedDeclarationId: declaration0.id,
          invalidatedDeclarationActionExecutionId: declare0.id,
          invalidationActionExecutionId: declare0.id,
          previousDeclarationEpoch: 0,
          nextDeclarationEpoch: 1,
          reasonCode: 'expense_ledger_changed:create',
        },
      }),
    );

    await prisma.$transaction((tx) =>
      invalidate({
        prisma: tx,
        tenantId: primary.tenantId,
        declaration: declaration0,
        invalidationExecutionId: invalidator0.id,
      }),
    );
    const event0 =
      await prisma.expensePeriodDeclarationInvalidation.findFirstOrThrow({
        where: { invalidatedDeclarationId: declaration0.id },
      });
    assert.deepEqual(
      [event0.previousDeclarationEpoch, event0.nextDeclarationEpoch],
      [0, 1],
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclarationInvalidation.update({
        where: { id: event0.id },
        data: { reasonCode: 'expense_ledger_changed:delete' },
      }),
    );
    await assert.rejects(() =>
      prisma.expensePeriodDeclarationInvalidation.delete({
        where: { id: event0.id },
      }),
    );

    const declare1 = await createSucceededExecution(
      prisma,
      engine,
      declarationRequest(primary, 1),
      primary.ownerId,
    );
    assert.notEqual(declare1.id, declare0.id);
    const declaration1 = await createDeclaration(
      prisma,
      primary,
      declare1.id,
      1,
    );
    assert.equal(
      (
        await createSucceededExecution(
          prisma,
          engine,
          declarationRequest(primary, 1),
          primary.ownerId,
        )
      ).id,
      declare1.id,
    );
    await assert.rejects(() =>
      createDeclaration(prisma, primary, declare0.id, 1),
    );
    await assert.rejects(() =>
      createDeclaration(prisma, primary, declare1.id, 2),
    );

    const invalidator1 = await createSucceededExecution(
      prisma,
      engine,
      invalidatorRequest(primary, 'epoch-1'),
      primary.ownerId,
    );
    await prisma.$transaction((tx) =>
      invalidate({
        prisma: tx,
        tenantId: primary.tenantId,
        declaration: declaration1,
        invalidationExecutionId: invalidator1.id,
      }),
    );

    const declare2 = await createSucceededExecution(
      prisma,
      engine,
      declarationRequest(primary, 2),
      primary.ownerId,
    );
    const declaration2 = await createDeclaration(
      prisma,
      primary,
      declare2.id,
      2,
    );
    const concurrentInvalidatorA = await createSucceededExecution(
      prisma,
      engine,
      invalidatorRequest(primary, 'epoch-2-a'),
      primary.ownerId,
    );
    const concurrentInvalidatorB = await createSucceededExecution(
      prisma,
      engine,
      invalidatorRequest(primary, 'epoch-2-b'),
      primary.ownerId,
    );
    const invalidationRace = await Promise.allSettled([
      prisma.$transaction((tx) =>
        invalidate({
          prisma: tx,
          tenantId: primary.tenantId,
          declaration: declaration2,
          invalidationExecutionId: concurrentInvalidatorA.id,
          invalidationId: randomUUID(),
        }),
      ),
      prisma.$transaction((tx) =>
        invalidate({
          prisma: tx,
          tenantId: primary.tenantId,
          declaration: declaration2,
          invalidationExecutionId: concurrentInvalidatorB.id,
          invalidationId: randomUUID(),
        }),
      ),
    ]);
    assert.equal(
      invalidationRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      invalidationRace.filter((result) => result.status === 'rejected').length,
      1,
    );

    const events = await prisma.expensePeriodDeclarationInvalidation.findMany({
      where: {
        tenantId: primary.tenantId,
        periodFromDay: PERIOD_FROM,
        periodToDay: PERIOD_TO,
      },
      orderBy: { nextDeclarationEpoch: 'asc' },
    });
    assert.deepEqual(
      events.map((event) => [
        event.previousDeclarationEpoch,
        event.nextDeclarationEpoch,
      ]),
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    );

    const declare3 = await createSucceededExecution(
      prisma,
      engine,
      declarationRequest(primary, 3),
      primary.ownerId,
    );
    const declaration3 = await createDeclaration(
      prisma,
      primary,
      declare3.id,
      3,
    );
    assert.equal(declaration3.declarationEpoch, 3);
    assert.equal(
      await prisma.expensePeriodDeclaration.count({
        where: {
          tenantId: primary.tenantId,
          periodFromDay: PERIOD_FROM,
          periodToDay: PERIOD_TO,
        },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.expensePeriodDeclaration.findUniqueOrThrow({
          where: { id: historical.id },
        })
      ).declarationEpoch,
      null,
    );
    assert.equal(await prisma.expense.count(), 0);

    console.log(
      JSON.stringify({
        status: 'PASS',
        initialDeclarationEpoch: 0,
        contiguousReassertionEpochs: [1, 2, 3],
        invalidations: events.length,
        concurrentInvalidationWinners: 1,
        oldSucceededExecutionCanMaskNewDeclaration: false,
        forgedEpochPossible: false,
        historicalNullEpochCompatible: true,
        fakeHistoricalBackfill: 0,
        expenseMutations: 0,
        providerWrites: 0,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'P4-07 declaration epoch proof failed',
  );
  process.exitCode = 1;
});
