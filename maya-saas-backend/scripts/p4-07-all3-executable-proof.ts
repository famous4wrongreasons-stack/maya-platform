import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

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
  ACTION_EXECUTION_REQUEST_CONTRACT,
  EXPENSE_CREATE_POLICY_PROFILE,
  EXPENSE_DELETE_POLICY_PROFILE,
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
import {
  expenseLedgerSnapshotHash,
  expensePeriodDeclarationIdentityHash,
  p407Hash,
} from '../src/expenses/expense-canonical-shadow.service';
import { P407ExpenseExecutableService } from '../src/expenses/p4-07-expense-executable.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const NOW = new Date('2026-09-02T12:00:00.000Z');
const IDENTITY_SECRET = 'p4-07-disposable-proof-identity-secret-'.repeat(2);
const PAYLOAD_SECRET = 'p4-07-disposable-proof-payload-secret-'.repeat(2);

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const name = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!name.startsWith('maya_c06_p407_all3_'))
    throw new Error('P4-07 proof refuses non-disposable databases');
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

async function tenant(prisma: PrismaClient, label: string) {
  const tenantId = `tenant_${label}_${randomUUID().replaceAll('-', '')}`;
  const ownerId = `owner_${label}_${randomUUID().replaceAll('-', '')}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-07 proof ${label}`,
      slug: `p4-07-proof-${label}-${randomUUID()}`,
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
  const branch = await prisma.branch.create({
    data: { tenantId, name: `Branch ${label}` },
  });
  return {
    tenantId,
    ownerId,
    membershipId: membership.id,
    branchId: branch.id,
  };
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
      occurrenceScope: `p4-07:${input.logicalKey}`,
      sourceRef: `proof:${input.logicalKey}`,
      actorUserId: input.actorUserId,
    },
    targetRef: input.targetRef,
    input: input.normalized,
    evidenceRefs: [`proof:${input.logicalKey}`],
    callerIdempotency: {
      scope: `p4-07.${input.capability}`,
      key: input.logicalKey,
    },
  };
}

function createInput(
  scope: Awaited<ReturnType<typeof tenant>>,
  logical: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const intentIdentityHash = p407Hash([
    'p4-07.create-expense.v1',
    scope.tenantId,
    'proof',
    logical,
    'rent',
    '125000',
    'RUB',
    '2026-08-10',
    scope.branchId,
  ]);
  return {
    intentIdentityHash,
    branchId: scope.branchId,
    category: 'rent',
    amountKopecks: 125_000,
    currency: 'RUB',
    occurredDay: '2026-08-10',
    occurredAt: '2026-08-10T10:00:00.000Z',
    sourceNamespace: 'proof',
    externalRefHash: null,
    encryptedNote: null,
    actorMembershipId: scope.membershipId,
    actorRole: 'tenant_owner',
    policyProfile: EXPENSE_CREATE_POLICY_PROFILE,
    policySnapshotHash: p407Hash([
      EXPENSE_CREATE_POLICY_PROFILE,
      scope.tenantId,
      scope.membershipId,
      intentIdentityHash,
    ]),
    approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
    intendedMutation: 'insert_expense_and_invalidate_overlapping_declarations',
    expenseWritePerformed: false,
    declarationInvalidationPerformed: false,
    ...overrides,
  };
}

function deleteInput(
  scope: Awaited<ReturnType<typeof tenant>>,
  expense: {
    id: string;
    actionExecutionId: string | null;
    branchId: string | null;
    category: string;
    amountKopecks: number;
    currency: string;
    occurredAt: Date;
    source: string;
    externalId: string | null;
  },
) {
  const creationIdentityHash =
    expense.actionExecutionId ?? p407Hash(['legacy', expense.id]);
  const deletionIdentityHash = p407Hash([
    'p4-07.delete-expense.v1',
    scope.tenantId,
    expense.id,
    creationIdentityHash,
  ]);
  return {
    expenseId: expense.id,
    creationIdentityHash,
    deletionIdentityHash,
    branchId: expense.branchId,
    category: expense.category,
    amountKopecks: expense.amountKopecks,
    currency: expense.currency,
    occurredDay: expense.occurredAt.toISOString().slice(0, 10),
    occurredAt: expense.occurredAt.toISOString(),
    sourceNamespace: expense.source,
    externalRefHash: null,
    actorMembershipId: scope.membershipId,
    actorRole: 'tenant_owner',
    policyProfile: EXPENSE_DELETE_POLICY_PROFILE,
    policySnapshotHash: p407Hash([
      EXPENSE_DELETE_POLICY_PROFILE,
      scope.tenantId,
      scope.membershipId,
      deletionIdentityHash,
    ]),
    reasonCode: 'actor_requested_delete',
    approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
    intendedMutation:
      'delete_exact_expense_and_invalidate_overlapping_declarations',
    expenseDeletePerformed: false,
    declarationInvalidationPerformed: false,
  };
}

async function declarationInput(
  prisma: PrismaClient,
  scope: Awaited<ReturnType<typeof tenant>>,
  from = '2026-08-01',
  to = '2026-08-31',
) {
  const rows = await prisma.expense.findMany({
    where: {
      tenantId: scope.tenantId,
      occurredAt: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T23:59:59.999Z`),
      },
    },
    orderBy: { id: 'asc' },
  });
  const ledgerSnapshotHash = expenseLedgerSnapshotHash(
    scope.tenantId,
    from,
    to,
    rows,
  );
  const latestInvalidation =
    await prisma.expensePeriodDeclarationInvalidation.findFirst({
      where: {
        tenantId: scope.tenantId,
        periodFromDay: from,
        periodToDay: to,
      },
      orderBy: { nextDeclarationEpoch: 'desc' },
      select: { nextDeclarationEpoch: true },
    });
  const declarationEpoch = latestInvalidation?.nextDeclarationEpoch ?? 0;
  const declarationIdentityHash = expensePeriodDeclarationIdentityHash(
    scope.tenantId,
    from,
    to,
    declarationEpoch,
    ledgerSnapshotHash,
  );
  return {
    periodFromDay: from,
    periodToDay: to,
    declarationEpoch,
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
  };
}

async function approveIfRequired(
  engine: ReturnType<typeof createStandaloneCanonicalActionEngine>,
  req: TrustedActionExecutionRequestV1,
  approver: string,
) {
  const execution = await engine.ingress.createExecution(req);
  if (execution.state === ActionExecutionState.PENDING_APPROVAL)
    await engine.kernel.decideApproval({
      tenantId: req.tenantId,
      executionId: execution.id,
      approverUserId: approver,
      decision: 'APPROVED',
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
  const executable = new P407ExpenseExecutableService(
    prisma,
    engine.ingress,
    engine.kernel,
    () => NOW,
  );
  try {
    const primary = await tenant(prisma, 'primary');
    const other = await tenant(prisma, 'other');

    const firstInput = createInput(primary, 'first');
    const firstRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.create,
      targetRef: `expense-intent:${firstInput.intentIdentityHash}`,
      logicalKey: String(firstInput.intentIdentityHash),
      normalized: firstInput,
    });
    await approveIfRequired(engine, firstRequest, primary.ownerId);
    const concurrentCreate = await Promise.all([
      executable.execute(firstRequest),
      executable.execute(firstRequest),
    ]);
    assert.equal(concurrentCreate[0].expenseId, concurrentCreate[1].expenseId);
    assert.equal(
      await prisma.expense.count({ where: { tenantId: primary.tenantId } }),
      1,
    );
    const restarted = new P407ExpenseExecutableService(
      prisma,
      engine.ingress,
      engine.kernel,
      () => NOW,
    );
    assert.equal(
      (await restarted.execute(firstRequest)).expenseId,
      concurrentCreate[0].expenseId,
    );

    const declaration = await declarationInput(prisma, primary);
    const declarationRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
      targetRef: 'expense-period:2026-08-01:2026-08-31',
      logicalKey: String(declaration.declarationIdentityHash),
      normalized: declaration,
    });
    const concurrentDeclaration = await Promise.all([
      executable.execute(declarationRequest),
      executable.execute(declarationRequest),
    ]);
    assert.equal(
      concurrentDeclaration[0].declarationId,
      concurrentDeclaration[1].declarationId,
    );
    assert.equal(
      await prisma.expensePeriodDeclaration.count({
        where: { tenantId: primary.tenantId },
      }),
      1,
    );
    assert.equal(concurrentDeclaration[0].declarationEpoch, 0);

    const secondInput = createInput(primary, 'second', {
      amountKopecks: 225_000,
      intentIdentityHash: p407Hash(['second-expense', primary.tenantId]),
    });
    const secondRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.create,
      targetRef: `expense-intent:${secondInput.intentIdentityHash}`,
      logicalKey: String(secondInput.intentIdentityHash),
      normalized: secondInput,
    });
    await approveIfRequired(engine, secondRequest, primary.ownerId);
    await executable.execute(secondRequest);
    assert.equal(
      await prisma.expensePeriodDeclaration.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
      'create must atomically invalidate the declaration',
    );

    const second = await prisma.expense.findFirstOrThrow({
      where: {
        tenantId: primary.tenantId,
        actionExecutionId: (await engine.ingress.createExecution(secondRequest))
          .id,
      },
    });
    const deleteFacts = deleteInput(primary, second);
    const deleteRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.delete,
      targetRef: `expense:${second.id}`,
      logicalKey: deleteFacts.deletionIdentityHash,
      normalized: deleteFacts,
    });
    await approveIfRequired(engine, deleteRequest, primary.ownerId);
    const deletion = await executable.execute(deleteRequest);
    assert.equal(deletion.expenseDeletes, 1);
    assert.equal((await restarted.execute(deleteRequest)).expenseDeletes, 1);
    assert.equal(await prisma.expense.count({ where: { id: second.id } }), 0);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId: primary.tenantId,
          entityId: second.id,
          action: 'expense.deleted.canonical',
        },
      }),
      1,
    );

    const reopenedDeclaration = await declarationInput(prisma, primary);
    assert.notEqual(
      reopenedDeclaration.declarationIdentityHash,
      declaration.declarationIdentityHash,
      'durable epoch must distinguish a restored ledger snapshot',
    );
    assert.equal(
      reopenedDeclaration.ledgerSnapshotHash,
      declaration.ledgerSnapshotHash,
    );
    assert.equal(reopenedDeclaration.declarationEpoch, 1);
    const reopenedRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
      targetRef: 'expense-period:2026-08-01:2026-08-31',
      logicalKey: String(reopenedDeclaration.declarationIdentityHash),
      normalized: reopenedDeclaration,
    });
    const reopened = await executable.execute(reopenedRequest);
    assert.equal(reopened.declarationEpoch, 1);
    assert.equal(
      (await restarted.execute(reopenedRequest)).declarationId,
      reopened.declarationId,
    );
    assert.equal(
      await prisma.expensePeriodDeclaration.count({
        where: { tenantId: primary.tenantId },
      }),
      1,
    );

    const staleDeclaration = await declarationInput(prisma, primary);
    const staleRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
      targetRef: 'expense-period:2026-08-01:2026-08-31',
      logicalKey: String(staleDeclaration.declarationIdentityHash),
      normalized: staleDeclaration,
    });
    const racingInput = createInput(primary, 'race', {
      amountKopecks: 325_000,
      intentIdentityHash: p407Hash(['race-expense', primary.tenantId]),
    });
    const racingRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.create,
      targetRef: `expense-intent:${racingInput.intentIdentityHash}`,
      logicalKey: String(racingInput.intentIdentityHash),
      normalized: racingInput,
    });
    await approveIfRequired(engine, racingRequest, primary.ownerId);
    const race = await Promise.allSettled([
      executable.execute(staleRequest),
      executable.execute(racingRequest),
    ]);
    assert.equal(race[1].status, 'fulfilled');
    assert.equal(
      await prisma.expensePeriodDeclaration.count({
        where: { tenantId: primary.tenantId },
      }),
      0,
      'race must not leave a stale declaration',
    );

    const finalDeclaration = await declarationInput(prisma, primary);
    assert.equal(finalDeclaration.declarationEpoch, 2);
    const finalDeclarationRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
      targetRef: 'expense-period:2026-08-01:2026-08-31',
      logicalKey: String(finalDeclaration.declarationIdentityHash),
      normalized: finalDeclaration,
    });
    const finalDeclarationResult = await executable.execute(
      finalDeclarationRequest,
    );
    assert.equal(finalDeclarationResult.declarationEpoch, 2);
    assert.equal(
      (await restarted.execute(finalDeclarationRequest)).declarationId,
      finalDeclarationResult.declarationId,
    );
    assert.equal(
      await prisma.expensePeriodDeclaration.count({
        where: { tenantId: primary.tenantId },
      }),
      1,
      'a second re-declare without invalidation must remain in epoch 2',
    );

    const forgedEpoch = {
      ...finalDeclaration,
      declarationEpoch: 99,
      declarationIdentityHash: expensePeriodDeclarationIdentityHash(
        primary.tenantId,
        finalDeclaration.periodFromDay,
        finalDeclaration.periodToDay,
        99,
        finalDeclaration.ledgerSnapshotHash,
      ),
    };
    const forgedEpochRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.declare,
      targetRef: 'expense-period:2026-08-01:2026-08-31',
      logicalKey: String(forgedEpoch.declarationIdentityHash),
      normalized: forgedEpoch,
    });
    await assert.rejects(() => executable.execute(forgedEpochRequest));

    const crossTenantInput = createInput(primary, 'cross-tenant', {
      branchId: other.branchId,
      intentIdentityHash: p407Hash(['cross-tenant', primary.tenantId]),
    });
    const crossTenantRequest = request({
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      capability: P4_07_EXECUTABLE_CAPABILITIES.create,
      targetRef: `expense-intent:${crossTenantInput.intentIdentityHash}`,
      logicalKey: String(crossTenantInput.intentIdentityHash),
      normalized: crossTenantInput,
    });
    await approveIfRequired(engine, crossTenantRequest, primary.ownerId);
    await assert.rejects(() => executable.execute(crossTenantRequest));
    assert.equal(
      await prisma.expense.count({ where: { tenantId: other.tenantId } }),
      0,
    );

    const forged = {
      ...createInput(primary, 'forged'),
      amountKopecks: 1_000_000_001,
    };
    await assert.rejects(() =>
      engine.ingress.createExecution(
        request({
          tenantId: primary.tenantId,
          actorUserId: primary.ownerId,
          capability: P4_07_EXECUTABLE_CAPABILITIES.create,
          targetRef: 'expense-intent:forged',
          logicalKey: 'forged',
          normalized: forged,
        }),
      ),
    );

    const counts = await Promise.all([
      prisma.actionExecution.count({
        where: {
          tenantId: primary.tenantId,
          actionClass: {
            in: [
              'create_expense',
              'delete_expense',
              'declare_expense_period_complete',
            ],
          },
          state: ActionExecutionState.UNKNOWN,
        },
      }),
      prisma.actionAttempt.count({
        where: {
          tenantId: primary.tenantId,
          externalDispatchState: { not: 'NOT_CROSSED' },
        },
      }),
      prisma.expense.count({ where: { tenantId: primary.tenantId } }),
    ]);
    assert.deepEqual(counts.slice(0, 2), [0, 0]);
    assert.equal(counts[2], 2);
    const succeededExecutions = await prisma.actionExecution.count({
      where: {
        tenantId: primary.tenantId,
        state: ActionExecutionState.SUCCEEDED,
        actionClass: {
          in: [
            'create_expense',
            'delete_expense',
            'declare_expense_period_complete',
          ],
        },
      },
    });
    assert.ok(succeededExecutions >= 5);
    const invalidations =
      await prisma.expensePeriodDeclarationInvalidation.findMany({
        where: {
          tenantId: primary.tenantId,
          periodFromDay: '2026-08-01',
          periodToDay: '2026-08-31',
        },
        orderBy: { nextDeclarationEpoch: 'asc' },
        select: {
          previousDeclarationEpoch: true,
          nextDeclarationEpoch: true,
        },
      });
    assert.deepEqual(invalidations, [
      { previousDeclarationEpoch: 0, nextDeclarationEpoch: 1 },
      { previousDeclarationEpoch: 1, nextDeclarationEpoch: 2 },
    ]);

    console.log(
      JSON.stringify({
        status: 'PASS',
        actionClassesExercised: '3/3',
        actionClassesProven: '3/3',
        createOneTime: true,
        deleteAuditSafe: true,
        declarationRaceSafe: true,
        declarationReestablishmentAfterInvalidation: true,
        declarationEpochs: [0, 1, 2],
        oldSucceededExecutionCanMaskRedeclaration: false,
        forgedEpochPossible: false,
        blocker: null,
        unknownRequired: false,
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
      : 'P4-07 proof failed',
  );
  process.exitCode = 1;
});
