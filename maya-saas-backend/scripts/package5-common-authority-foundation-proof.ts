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
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

const NOW = new Date('2026-09-03T12:00:00.000Z');

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const name = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!name.startsWith('maya_c06_p5_foundation_')) {
    throw new Error(
      'Package 5 foundation proof refuses non-disposable databases',
    );
  }
  return value;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function expectRejected(run: () => Promise<unknown>, label: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${label} must be rejected`);
}

async function createScope(prisma: PrismaClient, label: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const tenantId = `tenant_p5_foundation_${label}_${suffix}`;
  const ownerId = `owner_p5_foundation_${label}_${suffix}`;
  const workerId = `worker_p5_foundation_${label}_${suffix}`;

  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `Package 5 foundation ${label}`,
      slug: `p5-foundation-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
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
                role: UserRole.tenant_owner,
                status: MembershipStatus.active,
              },
            },
          },
          {
            id: workerId,
            email: `${workerId}@proof.invalid`,
            passwordHash: 'not-real',
            role: UserRole.employee,
            memberships: {
              create: {
                tenantId,
                role: UserRole.employee,
                status: MembershipStatus.active,
              },
            },
          },
        ],
      },
    },
  });
  const client = await prisma.client.create({ data: { tenantId } });
  return { tenantId, ownerId, workerId, clientId: client.id };
}

async function createExecution(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    actorUserId: string;
    label: string;
    targetKind: string;
    targetRef: string;
    approved?: boolean;
    dryRun?: boolean;
  },
) {
  const approved = input.approved ?? true;
  const identity = `${input.tenantId}:${input.label}`;
  return prisma.actionExecution.create({
    data: {
      tenantId: input.tenantId,
      identityVersion: 1,
      identityFingerprint: hash(`identity:${identity}`),
      idempotencyScope: 'package5.foundation.proof.v1',
      requestIdempotencyKeyHash: hash(`idempotency:${identity}`),
      sourceType: 'authenticated_request',
      sourceRef: `proof:${input.label}`,
      actorUserId: input.actorUserId,
      actionClass: `package5_${input.label}`,
      capability: `package5.${input.label}.execute.v1`,
      capabilityVersion: 1,
      targetKind: input.targetKind,
      targetRef: input.targetRef,
      normalizedInputContract: 'maya.package5-foundation-proof/1',
      normalizedInputHash: hash(`input:${identity}`),
      evidenceRefsJson: [`proof:${hash(identity)}`],
      dryRun: input.dryRun ?? false,
      riskProfileVersion: 1,
      riskFacetsJson: ['single_target', 'local_postgres'],
      policyKey: 'package5.foundation.proof.v1',
      policyVersion: 1,
      policyDecision: approved
        ? ActionPolicyDecision.ALLOW
        : ActionPolicyDecision.DENY,
      autonomyLevel: 'L2_OWNER_APPROVED',
      policyDecidedBy: 'package5-foundation-proof',
      policyContextContract: 'maya.action-policy-context/1',
      policyContextHash: hash(`policy:${identity}`),
      policyEvidenceJson: {
        exactTenant: input.tenantId,
        singleTarget: true,
        localPostgres: true,
      },
      policyEvaluatedAt: NOW,
      policyValidUntil: new Date(NOW.getTime() + 60 * 60 * 1000),
      approvalRequirement: approved ? 'REQUIRED' : 'NONE',
      approvalDecision: approved
        ? ActionApprovalDecision.APPROVED
        : ActionApprovalDecision.NOT_REQUIRED,
      approvalInputHash: approved ? hash(`input:${identity}`) : null,
      approvalBindingHash: hash(`approval-or-policy:${identity}`),
      approvalRequestedAt: approved ? NOW : null,
      approvalExpiresAt: approved
        ? new Date(NOW.getTime() + 30 * 60 * 1000)
        : null,
      approvalDecidedAt: approved ? NOW : null,
      approvalDecidedByUserId: approved ? input.actorUserId : null,
      state: approved
        ? ActionExecutionState.SUCCEEDED
        : ActionExecutionState.NOT_EXECUTED,
      notExecutedReasonCode: approved ? null : 'policy_denied',
      retryPolicyKey: 'local-postgres-no-blind-retry.v1',
      retryPolicyVersion: 1,
      maxExecutionAttempts: 1,
      executionAttemptCount: approved ? 1 : 0,
      reconciliationPolicyKey: 'local-postgres-commit-truth.v1',
      reconciliationPolicyVersion: 1,
      reconciliationState: ActionReconciliationState.NOT_REQUIRED,
      transportIdentityVersion: 1,
      transportIdempotencyKey: `p5:${hash(identity)}`,
      finalOutcomeCode: approved ? 'proof_succeeded' : 'policy_denied',
      firstAttemptedAt: approved ? NOW : null,
      finalizedAt: NOW,
    },
  });
}

async function main() {
  const url = databaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    const initialCounts = await Promise.all([
      prisma.actionTargetMutation.count(),
      prisma.operationalWorkItem.count(),
      prisma.clientConsentFact.count(),
      prisma.maintenanceRun.count(),
      prisma.maintenanceItemClaim.count(),
    ]);
    assert.deepEqual(initialCounts, [0, 0, 0, 0, 0]);

    const primary = await createScope(prisma, 'primary');
    const other = await createScope(prisma, 'other');

    // D2-A: historical User ownership remains readable while canonical guest
    // profiles bind an exact Client and never infer ownership from phone/email.
    await prisma.customerProfile.create({
      data: { tenantId: primary.tenantId, userId: primary.ownerId },
    });
    const clientProfile = await prisma.customerProfile.create({
      data: { tenantId: primary.tenantId, clientId: primary.clientId },
    });
    await expectRejected(
      () =>
        prisma.customerProfile.create({ data: { tenantId: primary.tenantId } }),
      'ownerless profile',
    );
    await expectRejected(
      () =>
        prisma.customerProfile.update({
          where: { id: clientProfile.id },
          data: { clientId: other.clientId },
        }),
      'cross-tenant or rebound Client profile',
    );

    const consentExecution = await createExecution(prisma, {
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      label: 'grant_consent',
      targetKind: 'client_consent',
      targetRef: `client:${primary.clientId}`,
    });
    const consent = await prisma.clientConsentFact.create({
      data: {
        tenantId: primary.tenantId,
        clientId: primary.clientId,
        kind: 'privacy',
        decision: 'grant',
        occurredAt: NOW,
        effectiveAt: NOW,
        sourceType: 'authenticated_client_command',
        sourceIdentityHash: hash('consent:primary:privacy:grant'),
        actorUserId: primary.ownerId,
        actionExecutionId: consentExecution.id,
      },
    });
    await prisma.clientConsentFact.create({
      data: {
        tenantId: primary.tenantId,
        clientId: primary.clientId,
        kind: 'marketing',
        decision: 'revoke',
        occurredAt: NOW,
        effectiveAt: NOW,
        sourceType: 'crm_observation',
        sourceIdentityHash: hash('consent:primary:marketing:source-fact'),
      },
    });
    await expectRejected(
      () =>
        prisma.clientConsentFact.update({
          where: { id: consent.id },
          data: { decision: 'revoke' },
        }),
      'consent rewrite',
    );
    await expectRejected(
      () => prisma.clientConsentFact.delete({ where: { id: consent.id } }),
      'consent delete',
    );
    await expectRejected(
      () =>
        prisma.clientConsentFact.create({
          data: {
            tenantId: other.tenantId,
            clientId: other.clientId,
            kind: 'privacy',
            decision: 'grant',
            occurredAt: NOW,
            effectiveAt: NOW,
            sourceType: 'authenticated_client_command',
            sourceIdentityHash: hash('consent:cross-tenant-execution'),
            actionExecutionId: consentExecution.id,
          },
        }),
      'cross-tenant consent execution',
    );

    // The mutation fact validates governed execution and serializes the next
    // exact-target generation. Two contenders can never claim generation 1.
    const targetRef = `dashboard:${primary.ownerId}:overview`;
    const mutation0 = await createExecution(prisma, {
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      label: 'dashboard_generation_0',
      targetKind: 'dashboard_preference',
      targetRef,
    });
    await prisma.actionTargetMutation.create({
      data: {
        tenantId: primary.tenantId,
        actionExecutionId: mutation0.id,
        mutationKey: 'dashboard-overview',
        targetKind: 'dashboard_preference',
        targetRef,
        mutationKind: 'replace',
        targetGeneration: 0,
        beforeStateHash: hash('dashboard:before:0'),
        afterStateHash: hash('dashboard:after:0'),
      },
    });
    const raceExecutions = await Promise.all(
      ['a', 'b'].map((label) =>
        createExecution(prisma, {
          tenantId: primary.tenantId,
          actorUserId: primary.ownerId,
          label: `dashboard_generation_1_${label}`,
          targetKind: 'dashboard_preference',
          targetRef,
        }),
      ),
    );
    const generationRace = await Promise.allSettled(
      raceExecutions.map((execution, index) =>
        prisma.actionTargetMutation.create({
          data: {
            tenantId: primary.tenantId,
            actionExecutionId: execution.id,
            mutationKey: 'dashboard-overview',
            targetKind: 'dashboard_preference',
            targetRef,
            mutationKind: 'replace',
            targetGeneration: 1,
            beforeStateHash: hash('dashboard:after:0'),
            afterStateHash: hash(`dashboard:after:1:${index}`),
          },
        }),
      ),
    );
    assert.equal(
      generationRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const deniedExecution = await createExecution(prisma, {
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      label: 'denied_mutation',
      targetKind: 'dashboard_preference',
      targetRef: `${targetRef}:denied`,
      approved: false,
    });
    await expectRejected(
      () =>
        prisma.actionTargetMutation.create({
          data: {
            tenantId: primary.tenantId,
            actionExecutionId: deniedExecution.id,
            mutationKey: 'denied',
            targetKind: 'dashboard_preference',
            targetRef: `${targetRef}:denied`,
            mutationKind: 'replace',
            targetGeneration: 0,
            afterStateHash: hash('denied'),
          },
        }),
      'policy-denied mutation',
    );

    // A23 business state is not owned by inbox delivery. Creation and the
    // single terminal transition each require their exact execution.
    const createWork = await createExecution(prisma, {
      tenantId: primary.tenantId,
      actorUserId: primary.ownerId,
      label: 'create_work_item',
      targetKind: 'operational_work_item',
      targetRef: 'new',
    });
    const workItem = await prisma.operationalWorkItem.create({
      data: {
        tenantId: primary.tenantId,
        kind: 'task',
        assigneeUserId: primary.workerId,
        createdByUserId: primary.ownerId,
        title: 'Verify daily close',
        bodyText: 'Review the canonical close checklist.',
        createActionExecutionId: createWork.id,
      },
    });
    await prisma.inboxItem.create({
      data: {
        tenantId: primary.tenantId,
        userId: primary.workerId,
        operationalWorkItemId: workItem.id,
        type: 'owner_alert',
        sourceEventId: `proof:${workItem.id}`,
        title: 'New task',
        bodyText: 'Open the work item.',
      },
    });
    const completionExecutions = await Promise.all(
      ['a', 'b'].map((label) =>
        createExecution(prisma, {
          tenantId: primary.tenantId,
          actorUserId: primary.workerId,
          label: `complete_work_item_${label}`,
          targetKind: 'operational_work_item',
          targetRef: workItem.id,
        }),
      ),
    );
    const completionRace = await Promise.allSettled(
      completionExecutions.map((execution) =>
        prisma.operationalWorkItem.update({
          where: { id: workItem.id },
          data: {
            status: 'COMPLETED',
            completeActionExecutionId: execution.id,
            completedAt: NOW,
          },
        }),
      ),
    );
    assert.equal(
      completionRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    await expectRejected(
      () => prisma.operationalWorkItem.delete({ where: { id: workItem.id } }),
      'work item delete',
    );

    // D7-A: central policy identity and limits are frozen in a durable run;
    // item identities are non-PII hashes and one terminal outcome wins.
    const run = await prisma.maintenanceRun.create({
      data: {
        scope: 'platform',
        runIdentityVersion: 1,
        runIdentityFingerprint: hash('retention:auth-session:v1:2026-09-03'),
        maintenanceKind: 'retention_delete',
        subjectClass: 'expired_auth_session',
        policyKey: 'central.retention.expired-auth-session',
        policyVersion: 1,
        cutoffAt: NOW,
        maxItems: 1_000,
        batchSize: 100,
        authorityType: 'SYSTEM_POLICY',
      },
    });
    await expectRejected(
      () =>
        prisma.maintenanceRun.create({
          data: {
            scope: 'platform',
            runIdentityVersion: 1,
            runIdentityFingerprint: hash('retention:unbounded'),
            maintenanceKind: 'retention_delete',
            subjectClass: 'expired_auth_session',
            policyKey: 'central.retention.expired-auth-session',
            policyVersion: 1,
            cutoffAt: NOW,
            maxItems: 10_001,
            batchSize: 100,
            authorityType: 'SYSTEM_POLICY',
          },
        }),
      'unbounded maintenance run',
    );
    const claimRace = await Promise.allSettled(
      ['a', 'b'].map(() =>
        prisma.maintenanceItemClaim.create({
          data: {
            maintenanceRunId: run.id,
            itemKind: 'auth_session',
            itemRefHash: hash('opaque-session-reference'),
          },
        }),
      ),
    );
    assert.equal(
      claimRace.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const claim = await prisma.maintenanceItemClaim.findFirstOrThrow({
      where: { maintenanceRunId: run.id },
    });
    await prisma.maintenanceItemClaim.update({
      where: { id: claim.id },
      data: { claimGeneration: 1 },
    });
    await prisma.maintenanceItemClaim.update({
      where: { id: claim.id },
      data: { state: 'SUCCEEDED', outcomeCode: 'deleted', finishedAt: NOW },
    });
    await expectRejected(
      () =>
        prisma.maintenanceItemClaim.update({
          where: { id: claim.id },
          data: { state: 'FAILED', outcomeCode: 'rewritten' },
        }),
      'terminal maintenance claim rewrite',
    );
    await prisma.maintenanceRun.update({
      where: { id: run.id },
      data: { state: 'RUNNING', startedAt: NOW, leaseOwner: 'proof-worker' },
    });
    await prisma.maintenanceRun.update({
      where: { id: run.id },
      data: {
        state: 'SUCCEEDED',
        attemptedCount: 1,
        succeededCount: 1,
        finishedAt: NOW,
      },
    });
    await expectRejected(
      () =>
        prisma.maintenanceRun.update({
          where: { id: run.id },
          data: { policyVersion: 2 },
        }),
      'maintenance policy rewrite',
    );

    console.log(
      JSON.stringify(
        {
          fakeHistoricalBackfill: initialCounts.reduce(
            (total, count) => total + count,
            0,
          ),
          clientOwnedProfile: true,
          historicalUserProfileCompatible: true,
          consentFactsAppendOnly: true,
          concurrentTargetGenerationWinners: generationRace.filter(
            (result) => result.status === 'fulfilled',
          ).length,
          operationalWorkItemTerminalWinners: completionRace.filter(
            (result) => result.status === 'fulfilled',
          ).length,
          maintenanceItemClaimWinners: claimRace.filter(
            (result) => result.status === 'fulfilled',
          ).length,
          maintenanceCap: 10_000,
          productionMutations: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
