import { randomUUID } from 'node:crypto';

import {
  AgentTaskLifecycleStatus,
  OpportunityAgentDomain,
  OpportunityLifecycleStatus,
  OpportunityOutcome,
  Prisma,
  type AgentTask,
  type Opportunity,
  type PrismaClient,
} from '@prisma/client';

import {
  type AgentDomain,
  type AgentTaskV1,
  type OpportunityEvidenceV1,
  type OpportunityProjectionV1,
  type OpportunityType,
  type OpportunityV1,
} from './opportunity.contract';
import {
  assertCanonicalAgentTask,
  assertCanonicalOpportunity,
  canonicalFingerprint,
  stableCanonicalJson,
} from './opportunity.engine';

const EVIDENCE_REFS_CONTRACT = 'maya.opportunity-evidence-refs/1';
const LIMITATIONS_CONTRACT = 'maya.opportunity-limitations/1';
const MAX_TRANSACTION_ATTEMPTS = 5;

export type OpportunityPersistenceDisposition =
  | 'created'
  | 'revalidated'
  | 'superseded'
  | 'terminal_duplicate_collapsed'
  | 'expired_input_rejected';

export interface PersistedOpportunityResult {
  disposition: OpportunityPersistenceDisposition;
  opportunityId: string | null;
  taskId: string | null;
  revision: number | null;
  duplicateCollapsed: boolean;
}

export interface OpportunityResolutionProofV1 {
  evidenceFingerprint: string;
  evidence: OpportunityEvidenceV1[];
  observedAt: string;
  reasonCode: string;
}

export type CurrentStateScanCompleteness =
  'complete' | 'partial' | 'unknown' | 'provider_failure';

export interface OpportunityCurrentStateResolutionV1 {
  semanticKey: string;
  proof: OpportunityResolutionProofV1;
}

export interface OpportunityCurrentStateReconcileResult {
  persistence: PersistedOpportunityResult[];
  resolved: number;
  expired: number;
  staleTasksInvalidated: number;
  duplicateAttemptsCollapsed: number;
}

export function resolutionEvidenceFingerprint(
  evidence: OpportunityEvidenceV1[],
): string {
  return canonicalFingerprint('resolution-evidence', [
    [...evidence].sort((left, right) =>
      stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)),
    ),
  ]);
}

export interface OpportunityLifecycleSnapshot {
  opportunities: {
    total: number;
    active: number;
    resolved: number;
    expired: number;
    superseded: number;
  };
  agentTasks: {
    total: number;
    current: number;
    invalidated: number;
  };
}

export interface CurrentAgentTaskRecord {
  task: AgentTask;
  opportunity: Opportunity;
}

/**
 * Binds a privacy-preserving shadow projection to the authenticated internal
 * tenant FK. The expected source ref prevents a projection from being rebound
 * across tenants, while its canonical evidence identity remains unchanged.
 */
export function bindProjectionToTrustedTenant(input: {
  projection: OpportunityProjectionV1;
  sourceTenantRef: string;
  trustedTenantId: string;
}): OpportunityProjectionV1 {
  if (!input.sourceTenantRef || !input.trustedTenantId) {
    throw new Error('Source and trusted tenant identity are required.');
  }

  const sourceTenantRefs = [
    ...input.projection.opportunities.flatMap((opportunity) => [
      opportunity.tenantId,
      ...(opportunity.proposedActionIntent
        ? [opportunity.proposedActionIntent.tenantId]
        : []),
    ]),
    ...input.projection.agentTasks.map((task) => task.tenantId),
    ...input.projection.actionIntents.map((intent) => intent.tenantId),
  ];
  if (
    sourceTenantRefs.some((tenantRef) => tenantRef !== input.sourceTenantRef)
  ) {
    throw new Error('Shadow projection does not belong to the trusted tenant.');
  }

  return {
    ...input.projection,
    opportunities: input.projection.opportunities.map((opportunity) => ({
      ...opportunity,
      tenantId: input.trustedTenantId,
      ...(opportunity.proposedActionIntent
        ? {
            proposedActionIntent: {
              ...opportunity.proposedActionIntent,
              tenantId: input.trustedTenantId,
            },
          }
        : {}),
    })),
    agentTasks: input.projection.agentTasks.map((task) => ({
      ...task,
      tenantId: input.trustedTenantId,
    })),
    actionIntents: input.projection.actionIntents.map((intent) => ({
      ...intent,
      tenantId: input.trustedTenantId,
    })),
  };
}

/**
 * Durable Chapter 5 lifecycle owner.
 *
 * Tenant identity is supplied separately by the authenticated caller. The
 * projection tenant is checked but never treated as authority. The repository
 * owns no timer, queue, model, CRM client, messenger, or execution primitive.
 */
export class OpportunityLifecycleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async persistProjection(input: {
    tenantId: string;
    projection: OpportunityProjectionV1;
    validatedAt: Date;
  }): Promise<PersistedOpportunityResult[]> {
    if (input.projection.metrics.executed !== 0) {
      throw new Error('Chapter 5 projection must execute zero actions.');
    }

    const tasksByIdentity = new Map<string, AgentTaskV1>();
    for (const task of input.projection.agentTasks) {
      assertCanonicalAgentTask(task);
      if (task.tenantId !== input.tenantId) {
        throw new Error(
          'AgentTask tenant does not match trusted tenant context.',
        );
      }
      const identity = task.opportunityRefs[0];
      if (!identity || tasksByIdentity.has(identity)) {
        throw new Error(
          'Projection must contain at most one task per Opportunity.',
        );
      }
      tasksByIdentity.set(identity, task);
    }

    const results: PersistedOpportunityResult[] = [];
    for (const opportunity of input.projection.opportunities) {
      results.push(
        await this.persistOpportunity({
          tenantId: input.tenantId,
          opportunity,
          task: tasksByIdentity.get(opportunity.identityFingerprint) ?? null,
          validatedAt: input.validatedAt,
        }),
      );
    }
    return results;
  }

  async persistOpportunity(input: {
    tenantId: string;
    opportunity: OpportunityV1;
    task: AgentTaskV1 | null;
    validatedAt: Date;
  }): Promise<PersistedOpportunityResult> {
    validateTrustedPersistenceInput(input);
    return this.withSerializableRetry((tx) =>
      persistOpportunityInTransaction(tx, input),
    );
  }

  /**
   * Atomically persists a fully validated current projection and reconciles
   * only explicitly proven negative states. Partial or failed scans may add or
   * revalidate observed Opportunities, but can never resolve an absent one.
   */
  async reconcileCurrentProjection(input: {
    tenantId: string;
    projection: OpportunityProjectionV1;
    validatedAt: Date;
    currentState: {
      completeness: CurrentStateScanCompleteness;
      opportunityTypes: OpportunityType[];
      resolutions: OpportunityCurrentStateResolutionV1[];
    };
  }): Promise<OpportunityCurrentStateReconcileResult> {
    const tasksByIdentity = validateProjectionForTenant(input);
    const opportunityTypes = [...new Set(input.currentState.opportunityTypes)];
    if (opportunityTypes.length === 0) {
      throw new Error('Current-state reconciliation requires a family scope.');
    }
    if (
      input.projection.opportunities.some(
        (opportunity) => !opportunityTypes.includes(opportunity.type),
      )
    ) {
      throw new Error(
        'Projection contains an Opportunity outside its family scope.',
      );
    }
    const resolutions = new Map<string, OpportunityResolutionProofV1>();
    for (const resolution of input.currentState.resolutions) {
      assertOpaqueFingerprint(resolution.semanticKey, 'resolution semanticKey');
      validateResolutionProof(resolution.proof);
      if (
        new Date(resolution.proof.observedAt).getTime() >
        input.validatedAt.getTime()
      ) {
        throw new Error(
          'Current-state proof cannot follow reconciliation time.',
        );
      }
      if (resolutions.has(resolution.semanticKey)) {
        throw new Error('Current-state resolution semanticKey must be unique.');
      }
      resolutions.set(resolution.semanticKey, resolution.proof);
    }
    if (
      input.currentState.completeness !== 'complete' &&
      resolutions.size > 0
    ) {
      throw new Error('Incomplete current-state scans cannot resolve absence.');
    }

    return this.withSerializableRetry(async (tx) => {
      const persistence: PersistedOpportunityResult[] = [];
      for (const opportunity of input.projection.opportunities) {
        persistence.push(
          await persistOpportunityInTransaction(tx, {
            tenantId: input.tenantId,
            opportunity,
            task: tasksByIdentity.get(opportunity.identityFingerprint) ?? null,
            validatedAt: input.validatedAt,
          }),
        );
      }

      const due = await lockDueOpportunities(
        tx,
        input.tenantId,
        input.validatedAt,
      );
      for (const opportunity of due) {
        await expireOpportunity(tx, opportunity, input.validatedAt);
      }

      let resolved = 0;
      if (input.currentState.completeness === 'complete') {
        const active = await tx.opportunity.findMany({
          where: {
            tenantId: input.tenantId,
            status: OpportunityLifecycleStatus.active,
            type: { in: opportunityTypes },
          },
          orderBy: [{ semanticKey: 'asc' }, { revision: 'asc' }],
        });
        const present = new Set(
          input.projection.opportunities.map((row) => row.semanticKey),
        );
        for (const candidate of active) {
          if (present.has(candidate.semanticKey)) continue;
          const proof = resolutions.get(candidate.semanticKey);
          if (!proof) continue;
          const current = await lockCurrentOpportunity(
            tx,
            input.tenantId,
            candidate.semanticKey,
          );
          if (!current) continue;
          await resolveOpportunityInTransaction(tx, {
            opportunity: current,
            proof,
            resolvedAt: input.validatedAt,
          });
          resolved += 1;
        }
      }

      const staleTasksInvalidated = await invalidateStaleCurrentTasks(
        tx,
        input.tenantId,
        input.validatedAt,
      );
      return {
        persistence,
        resolved,
        expired: due.length,
        staleTasksInvalidated,
        duplicateAttemptsCollapsed: persistence.filter(
          (row) => row.duplicateCollapsed,
        ).length,
      };
    });
  }

  async resolveCurrent(input: {
    tenantId: string;
    semanticKey: string;
    proof: OpportunityResolutionProofV1;
    resolvedAt: Date;
  }): Promise<Opportunity | null> {
    validateResolutionProof(input.proof);
    if (!Number.isFinite(input.resolvedAt.getTime())) {
      throw new Error('resolvedAt must be a valid instant.');
    }
    const proofObservedAt = new Date(input.proof.observedAt);
    if (input.resolvedAt.getTime() < proofObservedAt.getTime()) {
      throw new Error('Resolution cannot precede its current-state proof.');
    }
    return this.withSerializableRetry(async (tx) => {
      const active = await lockCurrentOpportunity(
        tx,
        input.tenantId,
        input.semanticKey,
      );
      if (!active) return null;
      return resolveOpportunityInTransaction(tx, {
        opportunity: active,
        proof: input.proof,
        resolvedAt: input.resolvedAt,
      });
    });
  }

  async expireDue(input: { tenantId: string; asOf: Date }): Promise<number> {
    if (!Number.isFinite(input.asOf.getTime())) {
      throw new Error('Expiry asOf must be a valid instant.');
    }
    return this.withSerializableRetry(async (tx) => {
      const due = await lockDueOpportunities(tx, input.tenantId, input.asOf);
      for (const opportunity of due) {
        await expireOpportunity(tx, opportunity, input.asOf);
      }
      return due.length;
    });
  }

  async readCurrentTasks(input: {
    tenantId: string;
    asOf: Date;
    isPolicyAllowed: (policyKey: string, policyVersion: number) => boolean;
  }): Promise<CurrentAgentTaskRecord[]> {
    const rows = await this.prisma.agentTask.findMany({
      where: {
        tenantId: input.tenantId,
        status: AgentTaskLifecycleStatus.current,
        expiresAt: { gt: input.asOf },
        opportunity: {
          status: OpportunityLifecycleStatus.active,
          expiresAt: { gt: input.asOf },
        },
      },
      include: { opportunity: true },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    });

    return rows
      .filter((row) =>
        input.isPolicyAllowed(
          row.opportunity.policyKey,
          row.opportunity.policyVersion,
        ),
      )
      .map((row) => ({ task: row, opportunity: row.opportunity }));
  }

  async countStaleCurrentTasks(input: {
    tenantId: string;
    asOf: Date;
  }): Promise<number> {
    if (!Number.isFinite(input.asOf.getTime())) {
      throw new Error('Stale task asOf must be a valid instant.');
    }
    return this.prisma.agentTask.count({
      where: {
        tenantId: input.tenantId,
        status: AgentTaskLifecycleStatus.current,
        OR: [
          { expiresAt: { lte: input.asOf } },
          {
            opportunity: {
              OR: [
                {
                  status: {
                    in: [
                      OpportunityLifecycleStatus.resolved,
                      OpportunityLifecycleStatus.expired,
                      OpportunityLifecycleStatus.superseded,
                    ],
                  },
                },
                { expiresAt: { lte: input.asOf } },
              ],
            },
          },
        ],
      },
    });
  }

  async snapshot(tenantId: string): Promise<OpportunityLifecycleSnapshot> {
    const [opportunities, tasks] = await Promise.all([
      this.prisma.opportunity.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.agentTask.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    const opportunityCount = new Map(
      opportunities.map((row) => [row.status, row._count._all]),
    );
    const taskCount = new Map(
      tasks.map((row) => [row.status, row._count._all]),
    );

    return {
      opportunities: {
        total: opportunities.reduce((sum, row) => sum + row._count._all, 0),
        active: opportunityCount.get(OpportunityLifecycleStatus.active) ?? 0,
        resolved:
          opportunityCount.get(OpportunityLifecycleStatus.resolved) ?? 0,
        expired: opportunityCount.get(OpportunityLifecycleStatus.expired) ?? 0,
        superseded:
          opportunityCount.get(OpportunityLifecycleStatus.superseded) ?? 0,
      },
      agentTasks: {
        total: tasks.reduce((sum, row) => sum + row._count._all, 0),
        current: taskCount.get(AgentTaskLifecycleStatus.current) ?? 0,
        invalidated: taskCount.get(AgentTaskLifecycleStatus.invalidated) ?? 0,
      },
    };
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let attempt = 0;
    while (attempt < MAX_TRANSACTION_ATTEMPTS) {
      attempt += 1;
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (attempt >= MAX_TRANSACTION_ATTEMPTS || !isRetryableRace(error)) {
          throw error;
        }
      }
    }
    throw new Error('Unreachable Opportunity lifecycle retry state.');
  }
}

function validateProjectionForTenant(input: {
  tenantId: string;
  projection: OpportunityProjectionV1;
  validatedAt: Date;
}): Map<string, AgentTaskV1> {
  if (!Number.isFinite(input.validatedAt.getTime())) {
    throw new Error('validatedAt must be a valid instant.');
  }
  if (input.projection.metrics.executed !== 0) {
    throw new Error('Chapter 5 projection must execute zero actions.');
  }
  if (
    input.projection.actionIntents.some(
      (intent) => intent.tenantId !== input.tenantId || !intent.dryRun,
    )
  ) {
    throw new Error(
      'Chapter 5 ActionIntents must remain trusted dry-run output.',
    );
  }

  const tasksByIdentity = new Map<string, AgentTaskV1>();
  for (const task of input.projection.agentTasks) {
    assertCanonicalAgentTask(task);
    if (task.tenantId !== input.tenantId) {
      throw new Error(
        'AgentTask tenant does not match trusted tenant context.',
      );
    }
    const identity = task.opportunityRefs[0];
    if (!identity || tasksByIdentity.has(identity)) {
      throw new Error(
        'Projection must contain at most one task per Opportunity.',
      );
    }
    tasksByIdentity.set(identity, task);
  }
  for (const opportunity of input.projection.opportunities) {
    validateTrustedPersistenceInput({
      tenantId: input.tenantId,
      opportunity,
      task: tasksByIdentity.get(opportunity.identityFingerprint) ?? null,
      validatedAt: input.validatedAt,
    });
  }
  return tasksByIdentity;
}

async function persistOpportunityInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    opportunity: OpportunityV1;
    task: AgentTaskV1 | null;
    validatedAt: Date;
  },
): Promise<PersistedOpportunityResult> {
  validateTrustedPersistenceInput(input);
  const expiredAtWrite =
    new Date(input.opportunity.expiresAt).getTime() <=
    input.validatedAt.getTime();

  const exact = await tx.opportunity.findUnique({
    where: {
      tenantId_identityFingerprint: {
        tenantId: input.tenantId,
        identityFingerprint: input.opportunity.identityFingerprint,
      },
    },
  });
  if (exact) {
    if (exact.status !== OpportunityLifecycleStatus.active) {
      return resultFor('terminal_duplicate_collapsed', exact, null, true);
    }
    if (
      expiredAtWrite ||
      exact.expiresAt.getTime() <= input.validatedAt.getTime()
    ) {
      await expireOpportunity(tx, exact, input.validatedAt);
      return resultFor('expired_input_rejected', exact, null, true);
    }

    const lastValidatedAt = laterOf(exact.lastValidatedAt, input.validatedAt);
    if (lastValidatedAt.getTime() !== exact.lastValidatedAt.getTime()) {
      await tx.opportunity.update({
        where: { id: exact.id },
        data: { lastValidatedAt },
      });
    }
    const task = await ensureCurrentTask(
      tx,
      exact,
      input.task,
      input.validatedAt,
    );
    return resultFor('revalidated', exact, task, true);
  }

  const active = await lockCurrentOpportunity(
    tx,
    input.tenantId,
    input.opportunity.semanticKey,
  );
  if (expiredAtWrite) {
    if (active) await expireOpportunity(tx, active, input.validatedAt);
    return {
      disposition: 'expired_input_rejected',
      opportunityId: active?.id ?? null,
      taskId: null,
      revision: active?.revision ?? null,
      duplicateCollapsed: true,
    };
  }

  let revision: number;
  let supersedesOpportunityId: string | null = null;
  let disposition: OpportunityPersistenceDisposition = 'created';
  if (active) {
    await invalidateCurrentTasks(
      tx,
      active,
      input.validatedAt,
      'opportunity_superseded',
    );
    await tx.opportunity.update({
      where: { id: active.id },
      data: {
        status: OpportunityLifecycleStatus.superseded,
        lastValidatedAt: laterOf(active.lastValidatedAt, input.validatedAt),
        terminalAt: input.validatedAt,
        terminalReasonCode: 'evidence_superseded',
      },
    });
    revision = active.revision + 1;
    supersedesOpportunityId = active.id;
    disposition = 'superseded';
  } else {
    const latest = await tx.opportunity.aggregate({
      where: {
        tenantId: input.tenantId,
        semanticKey: input.opportunity.semanticKey,
      },
      _max: { revision: true },
    });
    revision = (latest._max.revision ?? 0) + 1;
  }

  const created = await tx.opportunity.create({
    data: opportunityCreateData({
      trustedTenantId: input.tenantId,
      opportunity: input.opportunity,
      revision,
      supersedesOpportunityId,
      validatedAt: input.validatedAt,
    }),
  });
  const task = await ensureCurrentTask(
    tx,
    created,
    input.task,
    input.validatedAt,
  );
  return resultFor(disposition, created, task, false);
}

async function lockDueOpportunities(
  tx: Prisma.TransactionClient,
  tenantId: string,
  asOf: Date,
): Promise<Opportunity[]> {
  return tx.$queryRaw<Opportunity[]>`
    SELECT *
    FROM "Opportunity"
    WHERE "tenantId" = ${tenantId}
      AND "status" = 'active'::"OpportunityLifecycleStatus"
      AND "expiresAt" <= ${asOf}
    ORDER BY "semanticKey", "revision"
    FOR UPDATE
  `;
}

async function resolveOpportunityInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    opportunity: Opportunity;
    proof: OpportunityResolutionProofV1;
    resolvedAt: Date;
  },
): Promise<Opportunity> {
  const proofObservedAt = new Date(input.proof.observedAt);
  if (proofObservedAt.getTime() < input.opportunity.firstDetectedAt.getTime()) {
    throw new Error(
      'Resolution proof cannot precede the active Opportunity revision.',
    );
  }
  await invalidateCurrentTasks(
    tx,
    input.opportunity,
    input.resolvedAt,
    'opportunity_resolved',
  );
  return tx.opportunity.update({
    where: { id: input.opportunity.id },
    data: {
      status: OpportunityLifecycleStatus.resolved,
      lastValidatedAt: laterOf(
        input.opportunity.lastValidatedAt,
        input.resolvedAt,
      ),
      terminalAt: input.resolvedAt,
      terminalReasonCode: input.proof.reasonCode,
      terminalEvidenceFingerprint: input.proof.evidenceFingerprint,
      terminalEvidenceRefsJson: evidenceRefsJson(input.proof.evidence),
    },
  });
}

async function invalidateStaleCurrentTasks(
  tx: Prisma.TransactionClient,
  tenantId: string,
  asOf: Date,
): Promise<number> {
  const stale = await tx.agentTask.findMany({
    where: {
      tenantId,
      status: AgentTaskLifecycleStatus.current,
      OR: [
        { expiresAt: { lte: asOf } },
        {
          opportunity: {
            OR: [
              { status: { not: OpportunityLifecycleStatus.active } },
              { expiresAt: { lte: asOf } },
            ],
          },
        },
      ],
    },
    select: { id: true, opportunityId: true },
  });
  if (stale.length === 0) return 0;
  await tx.agentTask.updateMany({
    where: { tenantId, id: { in: stale.map((row) => row.id) } },
    data: {
      status: AgentTaskLifecycleStatus.invalidated,
      invalidatedAt: asOf,
      invalidationReasonCode: 'opportunity_not_current',
    },
  });
  return stale.length;
}

async function lockCurrentOpportunity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  semanticKey: string,
): Promise<Opportunity | null> {
  const rows = await tx.$queryRaw<Opportunity[]>`
    SELECT *
    FROM "Opportunity"
    WHERE "tenantId" = ${tenantId}
      AND "semanticKey" = ${semanticKey}
      AND "status" = 'active'::"OpportunityLifecycleStatus"
    FOR UPDATE
  `;
  if (rows.length > 1) {
    throw new Error('Database violated one-active Opportunity invariant.');
  }
  return rows[0] ?? null;
}

async function ensureCurrentTask(
  tx: Prisma.TransactionClient,
  opportunity: Opportunity,
  task: AgentTaskV1 | null,
  asOf: Date,
): Promise<AgentTask | null> {
  if (
    opportunity.status !== OpportunityLifecycleStatus.active ||
    opportunity.expiresAt.getTime() <= asOf.getTime()
  ) {
    throw new Error('Terminal or expired Opportunity cannot create AgentTask.');
  }
  if (opportunity.outcome === OpportunityOutcome.inform_only) {
    if (task)
      throw new Error('Inform-only Opportunity cannot persist AgentTask.');
    return null;
  }
  if (!task) {
    throw new Error('Actionable Opportunity requires one canonical AgentTask.');
  }
  if (
    task.tenantId !== opportunity.tenantId ||
    task.semanticKey !== opportunity.semanticKey ||
    task.opportunityRefs[0] !== opportunity.identityFingerprint ||
    domainEnum(task.agentDomain) !== opportunity.recommendedAgentDomain
  ) {
    throw new Error('AgentTask does not match its canonical Opportunity.');
  }
  if (new Date(task.expiresAt).getTime() > opportunity.expiresAt.getTime()) {
    throw new Error('AgentTask cannot outlive its Opportunity.');
  }

  const existing = await tx.agentTask.findUnique({
    where: {
      tenantId_opportunityId_agentDomain: {
        tenantId: opportunity.tenantId,
        opportunityId: opportunity.id,
        agentDomain: domainEnum(task.agentDomain),
      },
    },
  });
  if (existing) {
    if (existing.status !== AgentTaskLifecycleStatus.current) {
      throw new Error('Invalidated AgentTask cannot be reopened.');
    }
    if (existing.expiresAt.getTime() <= asOf.getTime()) {
      await tx.agentTask.update({
        where: { id: existing.id },
        data: {
          status: AgentTaskLifecycleStatus.invalidated,
          invalidatedAt: asOf,
          invalidationReasonCode: 'task_expired',
        },
      });
      return null;
    }
    return existing;
  }

  return tx.agentTask.create({
    data: {
      id: randomUUID(),
      tenantId: opportunity.tenantId,
      opportunityId: opportunity.id,
      semanticKey: opportunity.semanticKey,
      taskFingerprint: task.taskFingerprint,
      agentDomain: domainEnum(task.agentDomain),
      objectiveKey: task.objectiveKey,
      allowedReadCapabilities: codeListJson(task.allowedReadCapabilities),
      allowedActionClasses: codeListJson(task.allowedActionClasses),
      autonomyLevel: 'L2_5_SHADOW',
      status: AgentTaskLifecycleStatus.current,
      requestedAt: new Date(task.requestedAt),
      expiresAt: new Date(task.expiresAt),
    },
  });
}

async function invalidateCurrentTasks(
  tx: Prisma.TransactionClient,
  opportunity: Opportunity,
  invalidatedAt: Date,
  reasonCode: string,
): Promise<void> {
  assertCode(reasonCode, 'task invalidation reason');
  await tx.agentTask.updateMany({
    where: {
      tenantId: opportunity.tenantId,
      opportunityId: opportunity.id,
      status: AgentTaskLifecycleStatus.current,
    },
    data: {
      status: AgentTaskLifecycleStatus.invalidated,
      invalidatedAt,
      invalidationReasonCode: reasonCode,
    },
  });
}

async function expireOpportunity(
  tx: Prisma.TransactionClient,
  opportunity: Opportunity,
  asOf: Date,
): Promise<void> {
  if (opportunity.status !== OpportunityLifecycleStatus.active) return;
  if (opportunity.expiresAt.getTime() > asOf.getTime()) return;
  await invalidateCurrentTasks(tx, opportunity, asOf, 'opportunity_expired');
  await tx.opportunity.update({
    where: { id: opportunity.id },
    data: {
      status: OpportunityLifecycleStatus.expired,
      lastValidatedAt: laterOf(opportunity.lastValidatedAt, asOf),
      terminalAt: asOf,
      terminalReasonCode: 'family_expiry_reached',
    },
  });
}

function opportunityCreateData(input: {
  trustedTenantId: string;
  opportunity: OpportunityV1;
  revision: number;
  supersedesOpportunityId: string | null;
  validatedAt: Date;
}): Prisma.OpportunityUncheckedCreateInput {
  const observedAt = new Date(input.opportunity.observedAt);
  return {
    id: randomUUID(),
    tenantId: input.trustedTenantId,
    type: input.opportunity.type,
    identityVersion: input.opportunity.identityVersion,
    semanticKey: input.opportunity.semanticKey,
    identityFingerprint: input.opportunity.identityFingerprint,
    revision: input.revision,
    affectedEntityKind: input.opportunity.affectedEntity?.kind ?? null,
    affectedEntityRef: input.opportunity.affectedEntity?.ref ?? null,
    evidenceFingerprint: input.opportunity.evidenceFingerprint,
    evidenceRefsJson: evidenceRefsJson(input.opportunity.evidence),
    evidenceObservedAt: observedAt,
    limitationsJson: limitationsJson(input.opportunity.limitations),
    policyKey: input.opportunity.policyKey,
    policyVersion: input.opportunity.policyVersion,
    recommendedAgentDomain: domainEnum(
      input.opportunity.recommendedAgentDomain,
    ),
    outcome: outcomeEnum(input.opportunity.outcome),
    status: OpportunityLifecycleStatus.active,
    firstDetectedAt: input.validatedAt,
    lastValidatedAt: input.validatedAt,
    expiresAt: new Date(input.opportunity.expiresAt),
    supersedesOpportunityId: input.supersedesOpportunityId,
  };
}

function evidenceRefsJson(
  evidence: OpportunityEvidenceV1[],
): Prisma.InputJsonObject {
  const items = [...evidence]
    .map((item) => ({
      owner: item.owner,
      ...(item.factRef ? { ref: item.factRef } : {}),
      version: item.version,
      observedAt: item.observedAt,
      ...(item.asOf ? { asOf: item.asOf } : {}),
      completeness: item.completeness,
      capability: item.capability,
    }))
    .sort((left, right) =>
      stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)),
    );
  return { contract: EVIDENCE_REFS_CONTRACT, items };
}

function limitationsJson(codes: string[]): Prisma.InputJsonObject {
  const normalized = [...new Set(codes)].sort();
  normalized.forEach((code) => assertCode(code, 'limitation code'));
  return { contract: LIMITATIONS_CONTRACT, codes: normalized };
}

function codeListJson(codes: string[]): Prisma.InputJsonArray {
  const normalized = [...new Set(codes)].sort();
  normalized.forEach((code) => assertCapabilityCode(code));
  return normalized;
}

function validateTrustedPersistenceInput(input: {
  tenantId: string;
  opportunity: OpportunityV1;
  task: AgentTaskV1 | null;
  validatedAt: Date;
}): void {
  assertCanonicalOpportunity(input.opportunity);
  if (input.task) assertCanonicalAgentTask(input.task);
  if (input.opportunity.tenantId !== input.tenantId) {
    throw new Error(
      'Opportunity tenant does not match trusted tenant context.',
    );
  }
  if (!Number.isFinite(input.validatedAt.getTime())) {
    throw new Error('validatedAt must be a valid instant.');
  }
  if (
    input.validatedAt.getTime() <
    new Date(input.opportunity.observedAt).getTime()
  ) {
    throw new Error('Validation cannot precede canonical evidence.');
  }
  input.opportunity.limitations.forEach((code) =>
    assertCode(code, 'limitation code'),
  );
  input.opportunity.evidence.forEach((item) => {
    assertCapabilityCode(item.capability);
    assertCode(item.owner, 'evidence owner');
    assertCode(item.completeness, 'evidence completeness');
  });
}

function validateResolutionProof(proof: OpportunityResolutionProofV1): void {
  assertOpaqueFingerprint(proof.evidenceFingerprint, 'resolution fingerprint');
  assertCode(proof.reasonCode, 'resolution reason');
  if (proof.evidence.length === 0) {
    throw new Error('Resolution requires canonical current-state evidence.');
  }
  const observedAt = new Date(proof.observedAt);
  if (!Number.isFinite(observedAt.getTime())) {
    throw new Error('Resolution observedAt must be a valid instant.');
  }
  proof.evidence.forEach((item) => {
    assertCapabilityCode(item.capability);
    assertCode(item.owner, 'resolution evidence owner');
    assertCode(item.completeness, 'resolution evidence completeness');
    if (item.completeness !== 'complete') {
      throw new Error('Resolution requires complete canonical evidence.');
    }
    assertCode(item.basis, 'resolution evidence basis');
    if (!Number.isInteger(item.version) || item.version <= 0) {
      throw new Error(
        'Resolution evidence version must be a positive integer.',
      );
    }
    const evidenceObservedAt = new Date(item.observedAt);
    if (!Number.isFinite(evidenceObservedAt.getTime())) {
      throw new Error('Resolution evidence observedAt must be valid.');
    }
    if (evidenceObservedAt.getTime() > observedAt.getTime()) {
      throw new Error('Resolution proof cannot precede its evidence.');
    }
    if (item.asOf) {
      const evidenceAsOf = new Date(item.asOf);
      if (!Number.isFinite(evidenceAsOf.getTime())) {
        throw new Error('Resolution evidence asOf must be valid.');
      }
      if (evidenceAsOf.getTime() > observedAt.getTime()) {
        throw new Error('Resolution proof cannot precede evidence asOf.');
      }
    }
    if (item.factRef) assertOpaqueFingerprint(item.factRef, 'evidence ref');
  });
  if (
    proof.evidenceFingerprint !== resolutionEvidenceFingerprint(proof.evidence)
  ) {
    throw new Error('Resolution evidence fingerprint is not canonical.');
  }
}

function assertCapabilityCode(value: string): void {
  if (!/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid capability code: ${value}`);
  }
}

function assertCode(value: string, label: string): void {
  if (!/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new Error(`${label} must be a finite code.`);
  }
}

function assertOpaqueFingerprint(value: string, label: string): void {
  if (!value || /\s|@/.test(value) || value.startsWith('+')) {
    throw new Error(`${label} must be an opaque reference.`);
  }
}

function domainEnum(domain: AgentDomain): OpportunityAgentDomain {
  return OpportunityAgentDomain[domain];
}

function outcomeEnum(outcome: OpportunityV1['outcome']): OpportunityOutcome {
  return OpportunityOutcome[outcome];
}

function laterOf(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function resultFor(
  disposition: OpportunityPersistenceDisposition,
  opportunity: Opportunity,
  task: AgentTask | null,
  duplicateCollapsed: boolean,
): PersistedOpportunityResult {
  return {
    disposition,
    opportunityId: opportunity.id,
    taskId: task?.id ?? null,
    revision: opportunity.revision,
    duplicateCollapsed,
  };
}

function isRetryableRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}
