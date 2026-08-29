import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionApprovalDecision,
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  AgentTaskLifecycleStatus,
  ExternalDispatchState,
  MembershipStatus,
  OpportunityAgentDomain,
  OpportunityLifecycleStatus,
  OpportunityOutcome,
  PrismaClient,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineError,
  ActionEngineKernel,
  ActionIdentityService,
  type ExecutionClaimV1,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';

const IDENTITY_SECRET =
  'cycle-06-proof-identity-secret-is-never-used-outside-proof-databases';
const PAYLOAD_SECRET =
  'cycle-06-proof-payload-secret-is-never-used-outside-proof-databases';
const LEASE_MS = 1_000;
let currentProofStage = 'bootstrap';

function stage(name: string): void {
  currentProofStage = name;
}

interface ProofReport {
  database: string;
  matrix: Record<string, boolean>;
  metrics: Awaited<ReturnType<ActionEngineKernel['metrics']>>;
  duplicateAttemptsCollapsed: number;
  externalSideEffects: 0;
  productionExecutorsImported: false;
}

function requireProofDatabaseUrl(): {
  connectionString: string;
  database: string;
} {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !database.startsWith('maya_c06_') &&
    process.env.ACTION_ENGINE_PROOF_ALLOW_DATABASE !== '1'
  ) {
    throw new Error(
      'Action Engine proof refuses non-proof databases. Use maya_c06_*.',
    );
  }
  return { connectionString, database };
}

function opaque(label: string): string {
  return `${label}_${randomUUID().replaceAll('-', '')}`;
}

function request(input: {
  tenantId: string;
  scope: string;
  capability?: string;
  payload?: Record<string, unknown>;
  actorUserId?: string;
  intentExpiresAt?: Date;
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability ?? 'kernel.test.safe-retry',
    source: {
      type: 'synthetic_shadow',
      occurrenceScope: `occurrence/${input.scope}`,
      sourceRef: `source/${input.scope}`,
      actorUserId: input.actorUserId,
    },
    targetRef: `target/${input.scope}`,
    input: input.payload ?? { valueRef: `value/${input.scope}` },
    evidenceRefs: [`evidence/${input.scope}`],
    intentExpiresAt: input.intentExpiresAt,
  };
}

async function expectReject(
  matrix: Record<string, boolean>,
  name: string,
  operation: () => Promise<unknown>,
  expectedCode?: string,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = true;
    if (expectedCode) {
      assert(
        error instanceof ActionEngineError,
        `${name} did not return an Action Engine error`,
      );
      assert.equal(error.code, expectedCode, name);
    }
  }
  assert.equal(rejected, true, `Forbidden operation succeeded: ${name}`);
  matrix[name] = true;
}

async function createTenant(
  prisma: PrismaClient,
  cleanupTenantIds: string[],
  label: string,
): Promise<string> {
  const id = opaque(`tenant_${label}`);
  await prisma.tenant.create({
    data: {
      id,
      name: `Cycle 06 proof ${label}`,
      slug: `${label}-${randomUUID()}`.toLowerCase(),
    },
  });
  cleanupTenantIds.push(id);
  return id;
}

async function createApprover(
  prisma: PrismaClient,
  tenantId: string,
): Promise<string> {
  const id = opaque('approver');
  await prisma.user.create({
    data: {
      id,
      tenantId,
      email: `${id}@proof.invalid`,
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
  });
  return id;
}

async function createShadowSource(input: {
  prisma: PrismaClient;
  tenantId: string;
  now: Date;
}): Promise<{ taskId: string; taskFingerprint: string }> {
  const semanticKey = opaque('semantic');
  const opportunity = await input.prisma.opportunity.create({
    data: {
      tenantId: input.tenantId,
      type: 'client_recency_attention',
      identityVersion: 1,
      semanticKey,
      identityFingerprint: opaque('opportunity_identity'),
      revision: 1,
      affectedEntityKind: 'client',
      affectedEntityRef: opaque('client_ref'),
      evidenceFingerprint: opaque('evidence_fingerprint'),
      evidenceRefsJson: [opaque('fact_ref')],
      evidenceObservedAt: input.now,
      limitationsJson: [],
      policyKey: 'client_recency_attention.v1',
      policyVersion: 1,
      recommendedAgentDomain: OpportunityAgentDomain.client_lifecycle,
      outcome: OpportunityOutcome.action_candidate,
      status: OpportunityLifecycleStatus.active,
      firstDetectedAt: input.now,
      lastValidatedAt: input.now,
      expiresAt: new Date(input.now.getTime() + 60_000),
    },
  });
  const task = await input.prisma.agentTask.create({
    data: {
      tenantId: input.tenantId,
      opportunityId: opportunity.id,
      semanticKey,
      taskFingerprint: opaque('task_fingerprint'),
      agentDomain: OpportunityAgentDomain.client_lifecycle,
      objectiveKey: 'evaluate_reactivation_opportunity',
      allowedReadCapabilities: ['read.client_recency'],
      allowedActionClasses: ['prepare_reactivation_review'],
      autonomyLevel: 'L2_5_SHADOW',
      status: AgentTaskLifecycleStatus.current,
      requestedAt: input.now,
      expiresAt: new Date(input.now.getTime() + 60_000),
    },
  });
  return { taskId: task.id, taskFingerprint: task.taskFingerprint };
}

function claimInput(claim: ExecutionClaimV1) {
  return {
    tenantId: claim.execution.tenantId,
    executionId: claim.execution.id,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
  };
}

async function makeUnknown(input: {
  kernel: ActionEngineKernel;
  tenantId: string;
  scope: string;
  capability?: string;
}): Promise<string> {
  const execution = await input.kernel.createExecutionForControlledFixture(
    request({
      tenantId: input.tenantId,
      scope: input.scope,
      capability: input.capability ?? 'kernel.test.reconcile-before-retry',
    }),
  );
  const claim = await input.kernel.claimExecution({
    tenantId: input.tenantId,
    executionId: execution.id,
    workerId: `worker.${input.scope}`,
  });
  await input.kernel.markDispatchMayHaveCrossed(claimInput(claim));
  const result = await input.kernel.finalizeUnknown({
    ...claimInput(claim),
    outcomeCode: 'transport_timeout',
    errorClass: 'synthetic_transport_timeout',
  });
  assert.equal(result.state, ActionExecutionState.UNKNOWN);
  return execution.id;
}

async function reconcile(input: {
  kernel: ActionEngineKernel;
  tenantId: string;
  executionId: string;
  outcome:
    | 'PROVEN_SUCCEEDED'
    | 'PROVEN_FAILED'
    | 'PROVEN_NOT_EXECUTED'
    | 'STILL_UNKNOWN';
  worker: string;
}) {
  const claim = await input.kernel.claimReconciliation({
    tenantId: input.tenantId,
    executionId: input.executionId,
    workerId: input.worker,
  });
  return input.kernel.finalizeReconciliation({
    ...claimInput(claim),
    outcome: input.outcome,
  });
}

async function main(): Promise<void> {
  const { connectionString, database } = requireProofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const cleanupTenantIds: string[] = [];
  const matrix: Record<string, boolean> = {};
  let duplicateAttemptsCollapsed = 0;
  let now = new Date();
  const kernel = new ActionEngineKernel(prisma, {
    identitySecret: IDENTITY_SECRET,
    payloadEncryptionSecret: PAYLOAD_SECRET,
    now: () => new Date(now),
    executionLeaseMs: LEASE_MS,
    reconciliationLeaseMs: LEASE_MS,
    controlledFixtureMode: true,
  });

  try {
    stage('tenant_setup');
    const tenantA = await createTenant(prisma, cleanupTenantIds, 'a');
    const tenantB = await createTenant(prisma, cleanupTenantIds, 'b');

    stage('logical_identity_dedup');
    const duplicateRequest = request({
      tenantId: tenantA,
      scope: opaque('dedup'),
    });
    const duplicateRows = await Promise.all(
      Array.from({ length: 4 }, () =>
        new ActionEngineKernel(prisma, {
          identitySecret: IDENTITY_SECRET,
          payloadEncryptionSecret: PAYLOAD_SECRET,
          controlledFixtureMode: true,
        }).createExecutionForControlledFixture(duplicateRequest),
      ),
    );
    assert.equal(new Set(duplicateRows.map((row) => row.id)).size, 1);
    assert.equal(
      await prisma.actionExecution.count({
        where: {
          tenantId: tenantA,
          identityFingerprint: duplicateRows[0]?.identityFingerprint,
        },
      }),
      1,
    );
    duplicateAttemptsCollapsed += duplicateRows.length - 1;
    matrix.duplicate_logical_action_collapsed = true;
    matrix.restart_identity_stable = true;

    stage('cross_tenant_identity');
    const sameScope = opaque('cross_tenant_identity');
    const crossA = await kernel.createExecutionForControlledFixture(
      request({ tenantId: tenantA, scope: sameScope }),
    );
    const crossB = await kernel.createExecutionForControlledFixture(
      request({ tenantId: tenantB, scope: sameScope }),
    );
    assert.notEqual(crossA.id, crossB.id);
    assert.notEqual(crossA.identityFingerprint, crossB.identityFingerprint);
    matrix.same_identity_another_tenant_allowed = true;

    stage('single_execution_claim');
    const raceExecution = await kernel.createExecutionForControlledFixture(
      request({ tenantId: tenantA, scope: opaque('worker_race') }),
    );
    const race = await Promise.allSettled([
      kernel.claimExecution({
        tenantId: tenantA,
        executionId: raceExecution.id,
        workerId: 'worker.race.a',
      }),
      kernel.claimExecution({
        tenantId: tenantA,
        executionId: raceExecution.id,
        workerId: 'worker.race.b',
      }),
    ]);
    const raceClaims = race.filter(
      (entry): entry is PromiseFulfilledResult<ExecutionClaimV1> =>
        entry.status === 'fulfilled',
    );
    assert.equal(raceClaims.length, 1);
    assert.equal(
      await prisma.actionAttempt.count({
        where: {
          tenantId: tenantA,
          actionExecutionId: raceExecution.id,
          state: ActionAttemptState.STARTED,
        },
      }),
      1,
    );
    matrix.two_workers_one_execution_owner = true;
    const raceClaim = raceClaims[0]?.value;
    assert(raceClaim);
    await kernel.finalizeSuccess({
      ...claimInput(raceClaim),
      outcomeCode: 'synthetic_success',
    });
    await expectReject(
      matrix,
      'terminal_execution_cannot_execute_twice',
      () =>
        kernel.claimExecution({
          tenantId: tenantA,
          executionId: raceExecution.id,
          workerId: 'worker.after-terminal',
        }),
      'EXECUTION_TERMINAL',
    );

    stage('approval_lifecycle');
    const approverId = await createApprover(prisma, tenantA);
    const rejected = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: opaque('rejected'),
        capability: 'kernel.test.approval',
      }),
    );
    assert.equal(rejected.state, ActionExecutionState.PENDING_APPROVAL);
    const rejection = await kernel.decideApproval({
      tenantId: tenantA,
      executionId: rejected.id,
      approverUserId: approverId,
      decision: ActionApprovalDecision.REJECTED,
    });
    assert.equal(rejection.state, ActionExecutionState.NOT_EXECUTED);
    await expectReject(
      matrix,
      'rejected_approval_cannot_execute',
      () =>
        kernel.claimExecution({
          tenantId: tenantA,
          executionId: rejected.id,
          workerId: 'worker.rejected',
        }),
      'EXECUTION_TERMINAL',
    );

    const approved = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: opaque('approved'),
        capability: 'kernel.test.approval',
      }),
    );
    const approvedReady = await kernel.decideApproval({
      tenantId: tenantA,
      executionId: approved.id,
      approverUserId: approverId,
      decision: ActionApprovalDecision.APPROVED,
    });
    assert.equal(approvedReady.state, ActionExecutionState.READY);
    const approvedClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: approved.id,
      workerId: 'worker.approved',
    });
    await kernel.finalizeSuccess({
      ...claimInput(approvedClaim),
      outcomeCode: 'approved_success',
    });
    matrix.approved_path_executes = true;

    stage('policy_denied');
    const denied = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: opaque('denied'),
        capability: 'kernel.test.denied',
      }),
    );
    assert.equal(denied.policyDecision, ActionPolicyDecision.DENY);
    assert.equal(denied.state, ActionExecutionState.NOT_EXECUTED);
    matrix.policy_denied_not_executed = true;

    stage('trusted_normalization');
    const injectionScope = opaque('prompt_injection');
    const injection = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: injectionScope,
        payload: {
          valueRef: `value/${injectionScope}`,
          actionClass: 'send_campaign',
          executor: 'production.crm.write',
          tenantId: tenantB,
          approval: 'bypass',
        },
      }),
    );
    assert.equal(injection.actionClass, 'kernel_safe_retry');
    assert.equal(injection.capability, 'kernel.test.safe-retry');
    const decrypted = new ActionIdentityService(
      IDENTITY_SECRET,
      PAYLOAD_SECRET,
    ).decryptNormalizedPayload(injection.normalizedInputEncrypted ?? '');
    assert.deepEqual(JSON.parse(decrypted), {
      valueRef: `value/${injectionScope}`,
    });
    matrix.untrusted_text_cannot_alter_action_class = true;

    stage('retry_policy');
    const safeRetry = await kernel.createExecutionForControlledFixture(
      request({ tenantId: tenantA, scope: opaque('safe_retry') }),
    );
    const safeClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: safeRetry.id,
      workerId: 'worker.safe-retry.one',
    });
    const retryReady = await kernel.finalizeDefinitiveFailure({
      ...claimInput(safeClaim),
      outcomeCode: 'temporary_pre_dispatch_failure',
      errorClass: 'synthetic_transient_predispatch',
    });
    assert.equal(retryReady.state, ActionExecutionState.READY);
    const retryClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: safeRetry.id,
      workerId: 'worker.safe-retry.two',
    });
    await kernel.finalizeSuccess({
      ...claimInput(retryClaim),
      outcomeCode: 'retry_succeeded',
    });
    matrix.safe_retry_class = true;

    const noRetry = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: opaque('no_retry'),
        capability: 'kernel.test.no-retry',
      }),
    );
    const noRetryClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: noRetry.id,
      workerId: 'worker.no-retry',
    });
    const failed = await kernel.finalizeDefinitiveFailure({
      ...claimInput(noRetryClaim),
      outcomeCode: 'definitive_failure',
      errorClass: 'synthetic_transient_predispatch',
    });
    assert.equal(failed.state, ActionExecutionState.FAILED);
    matrix.no_retry_class = true;

    stage('unknown_and_reconciliation');
    stage('unknown_transport_timeout');
    const timeoutUnknown = await makeUnknown({
      kernel,
      tenantId: tenantA,
      scope: opaque('timeout_unknown'),
    });
    stage('unknown_blind_retry_block');
    await expectReject(
      matrix,
      'unknown_cannot_blind_retry',
      () =>
        kernel.claimExecution({
          tenantId: tenantA,
          executionId: timeoutUnknown,
          workerId: 'worker.blind-retry',
        }),
      'EXECUTION_NOT_READY',
    );
    const unknownRow = await prisma.actionExecution.findUniqueOrThrow({
      where: { id: timeoutUnknown },
    });
    assert.equal(
      unknownRow.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    matrix.timeout_after_dispatch_is_unknown = true;

    stage('reconciliation_proven_success');
    const reconciledSuccess = await reconcile({
      kernel,
      tenantId: tenantA,
      executionId: timeoutUnknown,
      outcome: 'PROVEN_SUCCEEDED',
      worker: 'reconciler.success',
    });
    assert.equal(reconciledSuccess.state, ActionExecutionState.SUCCEEDED);
    matrix.reconciliation_proves_success = true;

    stage('reconciliation_proven_failure_setup');
    const reconcileFailedId = await makeUnknown({
      kernel,
      tenantId: tenantA,
      scope: opaque('reconcile_failed'),
    });
    stage('reconciliation_proven_failure');
    const reconciledFailed = await reconcile({
      kernel,
      tenantId: tenantA,
      executionId: reconcileFailedId,
      outcome: 'PROVEN_FAILED',
      worker: 'reconciler.failed',
    });
    assert.equal(reconciledFailed.state, ActionExecutionState.FAILED);
    matrix.reconciliation_proves_failure = true;

    stage('reconciliation_not_applied_setup');
    const reconcileNotAppliedId = await makeUnknown({
      kernel,
      tenantId: tenantA,
      scope: opaque('reconcile_not_applied'),
      capability: 'kernel.test.no-retry',
    });
    stage('reconciliation_not_applied');
    const notApplied = await reconcile({
      kernel,
      tenantId: tenantA,
      executionId: reconcileNotAppliedId,
      outcome: 'PROVEN_NOT_EXECUTED',
      worker: 'reconciler.not-applied',
    });
    assert.equal(notApplied.state, ActionExecutionState.NOT_EXECUTED);
    matrix.reconciliation_proves_not_applied = true;

    stage('reconciliation_safe_retry_setup');
    const reconcileRetryId = await makeUnknown({
      kernel,
      tenantId: tenantA,
      scope: opaque('reconcile_retry'),
    });
    stage('reconciliation_safe_retry_decision');
    const retryAfterProof = await reconcile({
      kernel,
      tenantId: tenantA,
      executionId: reconcileRetryId,
      outcome: 'PROVEN_NOT_EXECUTED',
      worker: 'reconciler.retry-safe',
    });
    assert.equal(retryAfterProof.state, ActionExecutionState.READY);
    stage('reconciliation_safe_retry_execution');
    const postReconcileClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: reconcileRetryId,
      workerId: 'worker.after-reconciliation',
    });
    await kernel.finalizeSuccess({
      ...claimInput(postReconcileClaim),
      outcomeCode: 'safe_retry_after_reconciliation',
    });
    matrix.reconciliation_gates_safe_retry = true;

    stage('reconciliation_still_unknown_setup');
    const stillUnknownId = await makeUnknown({
      kernel,
      tenantId: tenantA,
      scope: opaque('still_unknown'),
    });
    stage('reconciliation_still_unknown_first');
    const stillUnknown = await reconcile({
      kernel,
      tenantId: tenantA,
      executionId: stillUnknownId,
      outcome: 'STILL_UNKNOWN',
      worker: 'reconciler.inconclusive.one',
    });
    assert.equal(stillUnknown.state, ActionExecutionState.UNKNOWN);
    let stillUnknownRow = await prisma.actionExecution.findUniqueOrThrow({
      where: { id: stillUnknownId },
    });
    assert.equal(
      stillUnknownRow.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    stage('reconciliation_still_unknown_second');
    await reconcile({
      kernel,
      tenantId: tenantA,
      executionId: stillUnknownId,
      outcome: 'STILL_UNKNOWN',
      worker: 'reconciler.inconclusive.two',
    });
    stillUnknownRow = await prisma.actionExecution.findUniqueOrThrow({
      where: { id: stillUnknownId },
    });
    assert.equal(
      stillUnknownRow.reconciliationState,
      ActionReconciliationState.MANUAL_REQUIRED,
    );
    matrix.reconciliation_still_unknown_requires_manual_review = true;

    stage('crash_recovery');
    const crashExecution = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: opaque('crash_after_dispatch'),
        capability: 'kernel.test.reconcile-before-retry',
      }),
    );
    const crashClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: crashExecution.id,
      workerId: 'worker.crash',
    });
    await kernel.markDispatchMayHaveCrossed(claimInput(crashClaim));
    now = new Date(now.getTime() + LEASE_MS + 1);
    const recoveredCrash = await kernel.recoverExpiredClaim({
      tenantId: tenantA,
      executionId: crashExecution.id,
      asOf: now,
    });
    assert.equal(recoveredCrash.state, ActionExecutionState.UNKNOWN);
    assert.equal(
      recoveredCrash.reconciliationState,
      ActionReconciliationState.REQUIRED,
    );
    assert.equal(
      await prisma.actionAttempt.count({
        where: { actionExecutionId: crashExecution.id },
      }),
      1,
    );
    matrix.crash_after_dispatch_requires_reconciliation = true;

    stage('shadow_execution');
    const shadowSource = await createShadowSource({
      prisma,
      tenantId: tenantA,
      now,
    });
    const shadow = await kernel.createExecutionForControlledFixture({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: tenantA,
      capability: 'client-lifecycle.reactivation-review.prepare',
      source: {
        type: 'agent_task',
        occurrenceScope: shadowSource.taskFingerprint,
        sourceRef: shadowSource.taskId,
        agentTaskId: shadowSource.taskId,
      },
      targetRef: opaque('shadow_target'),
      input: { clientRef: opaque('shadow_client') },
      evidenceRefs: [opaque('shadow_evidence')],
    });
    assert.equal(shadow.dryRun, true);
    assert.equal(shadow.state, ActionExecutionState.NOT_EXECUTED);
    assert.equal(shadow.notExecutedReasonCode, 'shadow_only');
    assert.equal(
      await prisma.actionAttempt.count({
        where: { actionExecutionId: shadow.id },
      }),
      0,
    );
    matrix.shadow_creates_no_attempt = true;

    stage('database_invariants');
    await expectReject(matrix, 'attempt_cannot_cross_tenant', () =>
      prisma.actionAttempt.create({
        data: {
          tenantId: tenantB,
          actionExecutionId: crashExecution.id,
          attemptNumber: 99,
          kind: ActionAttemptKind.EXECUTION,
          state: ActionAttemptState.STARTED,
          executorKey: 'synthetic.cross-tenant',
          executorVersion: 1,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        },
      }),
    );

    await expectReject(matrix, 'execution_cannot_cross_tenant_task', () =>
      prisma.actionExecution.create({
        data: {
          id: randomUUID(),
          tenantId: tenantB,
          identityVersion: 1,
          identityFingerprint: opaque('cross_task_identity'),
          sourceType: 'agent_task',
          sourceRef: shadowSource.taskId,
          agentTaskId: shadowSource.taskId,
          actionClass: 'prepare_reactivation_review',
          capability: 'client-lifecycle.reactivation-review.prepare',
          capabilityVersion: 1,
          targetKind: 'client',
          targetRef: opaque('cross_task_target'),
          normalizedInputContract: 'maya.prepare_reactivation_review-input/1',
          normalizedInputHash: opaque('cross_task_input_hash'),
          evidenceRefsJson: [],
          dryRun: true,
          riskProfileVersion: 1,
          riskFacetsJson: [],
          policyKey: 'chapter5.l2_5-shadow',
          policyVersion: 1,
          policyDecision: ActionPolicyDecision.SHADOW_ONLY,
          autonomyLevel: 'L2_5_SHADOW',
          policyDecidedBy: 'trusted_capability_registry',
          approvalRequirement: 'NONE',
          approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
          state: ActionExecutionState.NOT_EXECUTED,
          notExecutedReasonCode: 'shadow_only',
          retryPolicyKey: 'shadow.no-execution',
          retryPolicyVersion: 1,
          maxExecutionAttempts: 1,
          reconciliationPolicyKey: 'shadow.not-required',
          reconciliationPolicyVersion: 1,
          reconciliationState: ActionReconciliationState.NOT_REQUIRED,
          transportIdentityVersion: 1,
          transportIdempotencyKey: opaque('cross_task_transport'),
        },
      }),
    );

    const openAttemptExecution =
      await kernel.createExecutionForControlledFixture(
        request({
          tenantId: tenantA,
          scope: opaque('single_open_attempt'),
        }),
      );
    const openAttemptClaim = await kernel.claimExecution({
      tenantId: tenantA,
      executionId: openAttemptExecution.id,
      workerId: 'worker.single-open-attempt',
    });
    await expectReject(matrix, 'second_open_attempt_rejected_by_database', () =>
      prisma.actionAttempt.create({
        data: {
          tenantId: tenantA,
          actionExecutionId: openAttemptExecution.id,
          attemptNumber: openAttemptClaim.attempt.attemptNumber + 1,
          kind: ActionAttemptKind.EXECUTION,
          state: ActionAttemptState.STARTED,
          executorKey: 'synthetic.second-open',
          executorVersion: 1,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        },
      }),
    );
    await kernel.finalizeSuccess({
      ...claimInput(openAttemptClaim),
      outcomeCode: 'single_open_attempt_proven',
    });

    stage('expiry');
    const expiredExecution = await kernel.createExecutionForControlledFixture(
      request({
        tenantId: tenantA,
        scope: opaque('expired_intent'),
        intentExpiresAt: new Date(now.getTime() - 1),
      }),
    );
    assert.equal(expiredExecution.state, ActionExecutionState.NOT_EXECUTED);
    await expectReject(
      matrix,
      'expired_intent_cannot_execute',
      () =>
        kernel.claimExecution({
          tenantId: tenantA,
          executionId: expiredExecution.id,
          workerId: 'worker.expired',
        }),
      'EXECUTION_TERMINAL',
    );

    stage('architecture_barrier');
    const architectureModules = [
      'action-engine.kernel',
      'action-engine.registry',
      'action-engine.contract',
    ];
    const architectureFiles = architectureModules.flatMap((moduleName) => {
      const candidates = [
        `src/action-engine/${moduleName}.ts`,
        `dist/src/action-engine/${moduleName}.js`,
      ].filter((file) => existsSync(file));
      assert.ok(
        candidates.length > 0,
        `Architecture barrier cannot inspect ${moduleName}.`,
      );
      return candidates;
    });
    const actionEngineSource = architectureFiles
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const prohibitedImports = [
      '/crm/',
      '/marketing/',
      '/billing/',
      '/appointments/',
      '/communications/',
      'MarketingDeliveryAttempt',
      'BookingExecutor',
      'CampaignExecutor',
    ];
    for (const prohibited of prohibitedImports) {
      assert.equal(actionEngineSource.includes(prohibited), false, prohibited);
    }
    matrix.no_production_executor_imported = true;

    stage('audit_and_metrics');
    const audit = await kernel.getAudit(tenantA, timeoutUnknown);
    assert.equal(audit.execution.tenantId, tenantA);
    assert.equal(audit.execution.state, ActionExecutionState.SUCCEEDED);
    assert.equal(audit.attempts.length, 2);
    assert.equal(audit.attempts[0]?.kind, ActionAttemptKind.EXECUTION);
    assert.equal(audit.attempts[1]?.kind, ActionAttemptKind.RECONCILIATION);
    matrix.audit_reconstructs_execution = true;

    const metrics = await kernel.metrics(tenantA);
    assert.equal(metrics.externalSideEffects, 0);
    const report: ProofReport = {
      database,
      matrix: Object.fromEntries(
        Object.entries(matrix).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      metrics,
      duplicateAttemptsCollapsed,
      externalSideEffects: 0,
      productionExecutorsImported: false,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (cleanupTenantIds.length > 0) {
      await prisma.tenant.deleteMany({
        where: { id: { in: cleanupTenantIds } },
      });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `Action Engine kernel proof failed at ${currentProofStage}: ${message}\n`,
  );
  process.exitCode = 1;
});
