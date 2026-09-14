import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionExecutionState,
  CalendarSource as PrismaCalendarSource,
  MembershipStatus,
  Prisma,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionContractError,
  type ActionRuntimeHandlers,
  type TrustedActionExecutionRequestV1,
  createStandaloneCanonicalActionEngineRuntime,
} from '../src/action-engine';
import { CalendarSource } from '../src/common/domain.enums';
import type { CrmService } from '../src/crm/crm.service';
import type { EncryptionService } from '../src/encryption/encryption.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import { LoyaltyService } from '../src/loyalty/loyalty.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import type { UsersService } from '../src/users/users.service';
import type { AuditLogService } from '../src/audit-log/audit-log.service';

const IDENTITY_SECRET =
  'cycle-06-p4-02-loyalty-proof-identity-secret-only-for-disposable-databases';
const PAYLOAD_SECRET =
  'cycle-06-p4-02-loyalty-proof-payload-secret-only-for-disposable-databases';

function requireProofDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database.startsWith('maya_c06_loyalty_')) {
    throw new Error(
      'Loyalty proof refuses non-proof databases. Use maya_c06_loyalty_*.',
    );
  }
  return connectionString;
}

function opaque(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
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

function postCommitCrashPrisma(prisma: PrismaClient): {
  service: PrismaService;
  crashCount: () => number;
} {
  type TransactionRunner = (
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<unknown>;
  const runTransaction = prisma.$transaction.bind(
    prisma,
  ) as unknown as TransactionRunner;
  let remainingCrashes = 1;
  let crashes = 0;
  const proxy = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return async (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
        ) => {
          const result = await runTransaction(callback, options);
          if (remainingCrashes > 0) {
            remainingCrashes -= 1;
            crashes += 1;
            throw new Error('synthetic crash after loyalty ledger commit');
          }
          return result;
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return value;
    },
  });
  return {
    service: proxy as unknown as PrismaService,
    crashCount: () => crashes,
  };
}

function loyaltyService(input: {
  prisma: PrismaService;
  runtime: ReturnType<typeof createStandaloneCanonicalActionEngineRuntime>;
  tenantContext: TenantContextService;
}): LoyaltyService {
  const users = {
    getTenantUserOrThrow: async (userId: string, tenantId: string) => {
      const membership = await input.prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
      });
      if (!membership || membership.status !== MembershipStatus.active) {
        throw new Error('proof user is not an active tenant member');
      }
      return { id: userId, phone: null };
    },
  } as unknown as UsersService;
  const crm = {
    getCalendarSource: () => Promise.resolve(CalendarSource.INTERNAL),
  } as unknown as CrmService;
  const encryption = {
    encrypt: (value: string) =>
      `proof:${Buffer.from(value).toString('base64')}`,
    decrypt: (value: string) =>
      Buffer.from(value.replace(/^proof:/, ''), 'base64').toString('utf8'),
  } as unknown as EncryptionService;
  const audit = {
    log: () => Promise.resolve(undefined),
  } as unknown as AuditLogService;
  return new LoyaltyService(
    input.prisma,
    input.tenantContext,
    users,
    crm,
    encryption,
    audit,
    input.runtime,
  );
}

async function createProofTenant(prisma: PrismaClient): Promise<{
  tenantId: string;
  ownerId: string;
  customerId: string;
}> {
  const tenantId = opaque('tenant');
  const ownerId = opaque('owner');
  const customerId = opaque('customer');
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'P4-02 disposable loyalty proof',
      slug: `p4-02-proof-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: PrismaCalendarSource.internal,
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
            id: customerId,
            email: `${customerId}@proof.invalid`,
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
        ],
      },
    },
  });
  return { tenantId, ownerId, customerId };
}

function adjustment(input: {
  service: LoyaltyService;
  tenantContext: TenantContextService;
  tenantId: string;
  ownerId: string;
  customerId: string;
  idempotencyKey: string;
  delta: number;
  sourceRef: 'http.admin-loyalty.adjust' | 'ai-tool.loyalty.internal.adjust';
}) {
  return input.tenantContext.runAsSystemTenant(input.tenantId, () =>
    input.service.adjustInternalBalance({
      tenantId: input.tenantId,
      targetUserId: input.customerId,
      actorUserId: input.ownerId,
      sourceRef: input.sourceRef,
      dto: {
        delta: input.delta,
        reason: 'P4-02 isolated executable proof',
        idempotencyKey: input.idempotencyKey,
      },
    }),
  );
}

async function expectContractReject(operation: () => Promise<unknown>) {
  let rejected: unknown;
  try {
    await operation();
  } catch (error) {
    rejected = error;
  }
  assert(rejected instanceof ActionContractError);
}

async function main(): Promise<void> {
  const connectionString = requireProofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const tenantContext = new TenantContextService();
  const runtime = createStandaloneCanonicalActionEngineRuntime(
    prisma as unknown as PrismaService,
    proofEntitlements(),
    {
      identitySecret: IDENTITY_SECRET,
      payloadEncryptionSecret: PAYLOAD_SECRET,
    },
  );
  const service = loyaltyService({
    prisma: prisma as unknown as PrismaService,
    runtime,
    tenantContext,
  });
  const matrix: Record<string, boolean> = {};
  let tenantId = '';

  try {
    const proof = await createProofTenant(prisma);
    tenantId = proof.tenantId;

    const convergenceKey = randomUUID();
    const first = await adjustment({
      service,
      tenantContext,
      ...proof,
      idempotencyKey: convergenceKey,
      delta: 25,
      sourceRef: 'http.admin-loyalty.adjust',
    });
    const replay = await adjustment({
      service,
      tenantContext,
      ...proof,
      idempotencyKey: convergenceKey,
      delta: 25,
      sourceRef: 'ai-tool.loyalty.internal.adjust',
    });
    assert.equal(replay.transaction_id, first.transaction_id);
    assert.equal(
      await prisma.actionExecution.count({
        where: {
          tenantId: proof.tenantId,
          capability: 'loyalty.internal-adjust.execute.v1',
          idempotencyScope: 'loyalty.internal-adjust',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: { tenantId: proof.tenantId, idempotencyKey: convergenceKey },
      }),
      1,
    );
    matrix.httpAiOneLogicalExecution = true;
    matrix.replayDoesNotChangeBalanceTwice = true;

    const concurrentKey = randomUUID();
    const concurrentResults = await Promise.all([
      adjustment({
        service,
        tenantContext,
        ...proof,
        idempotencyKey: concurrentKey,
        delta: 50,
        sourceRef: 'http.admin-loyalty.adjust',
      }),
      adjustment({
        service,
        tenantContext,
        ...proof,
        idempotencyKey: concurrentKey,
        delta: 50,
        sourceRef: 'ai-tool.loyalty.internal.adjust',
      }),
    ]);
    assert.equal(
      concurrentResults[0].transaction_id,
      concurrentResults[1].transaction_id,
    );
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: { tenantId: proof.tenantId, idempotencyKey: concurrentKey },
      }),
      1,
    );
    matrix.concurrentDuplicateRejected = true;

    await prisma.$executeRawUnsafe(
      'CREATE SEQUENCE p4_02_fail_once_seq START 1',
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION p4_02_fail_once() RETURNS trigger AS $$
      BEGIN
        IF NEW."idempotencyKey" = 'p4-02-crash-before-ledger' AND
           nextval('p4_02_fail_once_seq') = 1 THEN
          RAISE EXCEPTION 'synthetic crash before loyalty ledger commit';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER p4_02_fail_once_trigger
      BEFORE INSERT ON "LoyaltyTransaction"
      FOR EACH ROW EXECUTE FUNCTION p4_02_fail_once()
    `);
    const beforeRollback = await prisma.loyaltyAccount.findUnique({
      where: {
        userId_tenantId: {
          tenantId: proof.tenantId,
          userId: proof.customerId,
        },
      },
    });
    await adjustment({
      service,
      tenantContext,
      ...proof,
      idempotencyKey: 'p4-02-crash-before-ledger',
      delta: 10,
      sourceRef: 'http.admin-loyalty.adjust',
    });
    const afterRollbackRecovery = await prisma.loyaltyAccount.findUniqueOrThrow(
      {
        where: {
          userId_tenantId: {
            tenantId: proof.tenantId,
            userId: proof.customerId,
          },
        },
      },
    );
    assert.equal(
      afterRollbackRecovery.balance,
      (beforeRollback?.balance ?? 0) + 10,
    );
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: {
          tenantId: proof.tenantId,
          idempotencyKey: 'p4-02-crash-before-ledger',
        },
      }),
      1,
    );
    const rollbackExecution = await prisma.actionExecution.findFirstOrThrow({
      where: {
        tenantId: proof.tenantId,
        idempotencyScope: 'loyalty.internal-adjust',
        targetRef: proof.customerId,
        attempts: { some: { outcomeCode: 'PROVEN_NOT_EXECUTED' } },
      },
      include: { attempts: true },
    });
    assert.equal(rollbackExecution.state, ActionExecutionState.SUCCEEDED);
    assert.equal(
      rollbackExecution.attempts.filter(
        (attempt) => attempt.externalDispatchState !== 'NOT_APPLICABLE',
      ).length >= 2,
      true,
    );
    matrix.crashBeforeLedgerCommitRollsBackAtomically = true;

    const crashing = postCommitCrashPrisma(prisma);
    const postCommitService = loyaltyService({
      prisma: crashing.service,
      runtime,
      tenantContext,
    });
    const postCommitKey = randomUUID();
    const beforePostCommit = afterRollbackRecovery.balance;
    await adjustment({
      service: postCommitService,
      tenantContext,
      ...proof,
      idempotencyKey: postCommitKey,
      delta: 15,
      sourceRef: 'http.admin-loyalty.adjust',
    });
    assert.equal(crashing.crashCount(), 1);
    const postCommitTransaction =
      await prisma.loyaltyTransaction.findUniqueOrThrow({
        where: {
          tenantId_idempotencyKey: {
            tenantId: proof.tenantId,
            idempotencyKey: postCommitKey,
          },
        },
      });
    assert.notEqual(postCommitTransaction.actionExecutionId, null);
    assert.equal(postCommitTransaction.balanceAfter, beforePostCommit + 15);
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: { tenantId: proof.tenantId, idempotencyKey: postCommitKey },
      }),
      1,
    );
    matrix.postCommitCrashReconcilesWithoutRedispatch = true;
    matrix.ledgerBindingAndBalanceAreAtomic = true;
    matrix.unknownNeverBlindRetries = true;

    let forgedDispatches = 0;
    const forgedHandlers: ActionRuntimeHandlers<{ ok: boolean }> = {
      dispatch: () => {
        forgedDispatches += 1;
        return Promise.resolve({
          value: { ok: true },
          safeResult: { ok: true },
        });
      },
      reconcile: () => Promise.resolve({ outcome: 'PROVEN_NOT_EXECUTED' }),
      restore: () => ({ ok: true }),
      classifyError: () => ({
        kind: 'definitive',
        outcomeCode: 'proof_failure',
        errorClass: 'proof_failure',
      }),
    };
    for (const forged of [
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      await expectContractReject(() =>
        runtime.execute(
          {
            contract: ACTION_EXECUTION_REQUEST_CONTRACT,
            tenantId: proof.tenantId,
            capability: 'loyalty.internal-adjust.execute.v1',
            source: {
              type: 'authenticated_request',
              occurrenceScope: `forged/${Object.keys(forged)[0]}`,
              sourceRef: 'http.admin-loyalty.adjust',
              actorUserId: proof.ownerId,
            },
            targetRef: proof.customerId,
            input: {
              delta: 1,
              reason: 'Forged caller authority',
              ...forged,
            },
            evidenceRefs: [],
          },
          forgedHandlers,
        ),
      );
    }
    assert.equal(forgedDispatches, 0);
    matrix.forgedAuthorityRejectedServerSide = true;

    const ledgerRowsBeforeShadow = await prisma.loyaltyTransaction.count({
      where: { tenantId: proof.tenantId },
    });
    const shadowRequest: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: proof.tenantId,
      capability: 'loyalty.internal-adjust.shadow.v1',
      source: {
        type: 'authenticated_request',
        occurrenceScope: 'p4-02/l2.5-shadow',
        sourceRef: 'ai-tool.loyalty.internal.adjust',
        actorUserId: proof.ownerId,
      },
      targetRef: proof.customerId,
      input: { delta: 1, reason: 'L2.5 must not execute' },
      evidenceRefs: [],
      callerIdempotency: {
        scope: 'loyalty.internal-adjust.shadow-proof',
        key: randomUUID(),
      },
    };
    const shadow = await runtime.planShadow(shadowRequest);
    assert.equal(shadow.state, ActionExecutionState.NOT_EXECUTED);
    assert.equal(shadow.dryRun, true);
    assert.equal(
      await prisma.loyaltyTransaction.count({
        where: { tenantId: proof.tenantId },
      }),
      ledgerRowsBeforeShadow,
    );
    matrix.l25CannotExecuteExternally = true;

    const bindingIndex = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'LoyaltyTransaction'
        AND indexdef LIKE '%"tenantId"%"actionExecutionId"%'
    `;
    assert.equal(bindingIndex.length, 1);
    assert.equal(bindingIndex[0].indexdef.includes('UNIQUE'), false);
    matrix.executionToLedgerSemanticsRemainOneToMany = true;

    const finalAccount = await prisma.loyaltyAccount.findUniqueOrThrow({
      where: {
        userId_tenantId: {
          tenantId: proof.tenantId,
          userId: proof.customerId,
        },
      },
    });
    assert.equal(finalAccount.balance, 100);

    process.stdout.write(
      `${JSON.stringify(
        {
          contract: 'maya.p4-02-loyalty-executable-proof/1',
          matrix,
          actionExecutions: await prisma.actionExecution.count({
            where: { tenantId: proof.tenantId },
          }),
          loyaltyTransactions: await prisma.loyaltyTransaction.count({
            where: { tenantId: proof.tenantId },
          }),
          finalBalance: finalAccount.balance,
          productionValueMutations: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `P4-02 loyalty executable proof failed: ${
      error instanceof Error ? error.stack : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
