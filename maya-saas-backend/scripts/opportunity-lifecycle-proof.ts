import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  AgentTaskLifecycleStatus,
  OpportunityAgentDomain,
  OpportunityLifecycleStatus,
  OpportunityOutcome,
  Prisma,
  PrismaClient,
  type AgentTask,
  type Opportunity,
} from '@prisma/client';

import {
  CanonicalOpportunityEngine,
  stableCanonicalJson,
} from '../src/opportunities/opportunity.engine';
import { OPPORTUNITY_TYPE } from '../src/opportunities/opportunity.contract';
import {
  OpportunityLifecycleRepository,
  resolutionEvidenceFingerprint,
  type OpportunityLifecycleSnapshot,
} from '../src/opportunities/opportunity.lifecycle';
import { OPPORTUNITY_POLICY_CONTRACT } from '../src/opportunities/opportunity.policy';
import {
  incomingCustomerRequestSignal,
  type ClientRecencySignalV1,
} from '../src/opportunities/opportunity.signal';
import {
  projectAppointmentRemovalShadow,
  type OpportunityShadowEventRowV1,
} from '../src/opportunities/opportunity.shadow';

const BASE = new Date('2035-05-10T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1_000;
const engine = new CanonicalOpportunityEngine();

interface ProofResult {
  database: string;
  lifecycle: {
    restartStable: boolean;
    concurrentDedupStable: boolean;
    resolutionStable: boolean;
    supersessionStable: boolean;
    expiryStable: boolean;
    cutoverStable: boolean;
    currentStateReconciliationStable: boolean;
    incompleteReadStable: boolean;
    providerFailureStable: boolean;
    occupancyCapacityStable: boolean;
    staleTaskStable: boolean;
  };
  databaseInvariants: Record<string, boolean>;
  privacy: {
    rawPayloadPersisted: false;
    fullBusinessStatePersisted: false;
  };
  totals: OpportunityLifecycleSnapshot;
  duplicateAttemptsCollapsed: number;
  actionIntentsExecuted: 0;
  sideEffectsExecuted: 0;
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
    !database.startsWith('maya_c05_') &&
    process.env.OPPORTUNITY_PROOF_ALLOW_DATABASE !== '1'
  ) {
    throw new Error(
      'Lifecycle proof refuses non-proof databases. Use a maya_c05_* database.',
    );
  }
  return { connectionString, database };
}

function instant(offsetMs: number): Date {
  return new Date(BASE.getTime() + offsetMs);
}

function opaque(label: string): string {
  return `${label}_${randomUUID().replaceAll('-', '')}`;
}

function recencySignal(input: {
  tenantId: string;
  clientRef: string;
  factRef: string;
  observedAt: Date;
  expiresAt: Date;
  days?: number;
  evidenceLifecycle?: ClientRecencySignalV1['evidenceLifecycle'];
}): ClientRecencySignalV1 {
  return {
    kind: 'client_recency',
    tenantId: input.tenantId,
    clientRef: input.clientRef,
    factRef: input.factRef,
    asOf: input.observedAt.toISOString(),
    distance: {
      days: input.days ?? 90,
      state: 'measured',
      reason: null,
    },
    attendanceProven: true,
    basis: 'provider_visit_history_canonical_attendance',
    observedAt: input.observedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    evidenceLifecycle: input.evidenceLifecycle ?? 'active',
  };
}

function policies(tenantId: string) {
  return [
    {
      contract: OPPORTUNITY_POLICY_CONTRACT,
      tenantId,
      reactivation: {
        enabled: true,
        policyRef: 'proof.reactivation_policy',
        version: 1,
        minimumDays: 30,
        evidenceBasis: 'attendance_proven' as const,
      },
      businessMetricAttention: [],
      criticalBusinessInputs: [],
    },
  ];
}

function projectRecency(signal: ClientRecencySignalV1) {
  return engine.project({
    signals: [signal],
    policies: policies(signal.tenantId),
    asOf: signal.observedAt,
  });
}

function opportunityCreateData(
  source: Opportunity,
  overrides: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
): Prisma.OpportunityUncheckedCreateInput {
  return {
    id: opaque('opportunity'),
    tenantId: source.tenantId,
    type: source.type,
    identityVersion: source.identityVersion,
    semanticKey: source.semanticKey,
    identityFingerprint: opaque('identity'),
    revision: source.revision + 1,
    affectedEntityKind: source.affectedEntityKind,
    affectedEntityRef: source.affectedEntityRef,
    evidenceFingerprint: opaque('evidence'),
    evidenceRefsJson: source.evidenceRefsJson as Prisma.InputJsonValue,
    evidenceObservedAt: source.evidenceObservedAt,
    limitationsJson: source.limitationsJson as Prisma.InputJsonValue,
    policyKey: source.policyKey,
    policyVersion: source.policyVersion,
    recommendedAgentDomain: source.recommendedAgentDomain,
    outcome: source.outcome,
    status: OpportunityLifecycleStatus.active,
    firstDetectedAt: source.firstDetectedAt,
    lastValidatedAt: source.lastValidatedAt,
    expiresAt: source.expiresAt,
    ...overrides,
  };
}

function taskCreateData(
  source: AgentTask,
  overrides: Partial<Prisma.AgentTaskUncheckedCreateInput> = {},
): Prisma.AgentTaskUncheckedCreateInput {
  return {
    id: opaque('task'),
    tenantId: source.tenantId,
    opportunityId: source.opportunityId,
    semanticKey: source.semanticKey,
    taskFingerprint: opaque('task_fingerprint'),
    agentDomain: source.agentDomain,
    objectiveKey: source.objectiveKey,
    allowedReadCapabilities:
      source.allowedReadCapabilities as Prisma.InputJsonValue,
    allowedActionClasses: source.allowedActionClasses as Prisma.InputJsonValue,
    autonomyLevel: 'L2_5_SHADOW',
    status: AgentTaskLifecycleStatus.current,
    requestedAt: source.requestedAt,
    expiresAt: source.expiresAt,
    ...overrides,
  };
}

async function expectDatabaseReject(
  matrix: Record<string, boolean>,
  name: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assert.equal(
    rejected,
    true,
    `Database accepted forbidden invariant: ${name}`,
  );
  matrix[name] = true;
}

async function createProofTenant(
  prisma: PrismaClient,
  tenantIds: string[],
  label: string,
  forcedId?: string,
): Promise<string> {
  const id = forcedId ?? opaque(`tenant_${label}`);
  await prisma.tenant.create({
    data: {
      id,
      name: `Cycle 05 proof ${label}`,
      slug: `${label}-${randomUUID()}`.toLowerCase(),
    },
  });
  tenantIds.push(id);
  return id;
}

async function persistSingleRecency(input: {
  repository: OpportunityLifecycleRepository;
  tenantId: string;
  clientRef: string;
  factRef: string;
  observedAt: Date;
  expiresAt: Date;
}) {
  const projection = projectRecency(
    recencySignal({
      tenantId: input.tenantId,
      clientRef: input.clientRef,
      factRef: input.factRef,
      observedAt: input.observedAt,
      expiresAt: input.expiresAt,
    }),
  );
  assert.equal(projection.opportunities.length, 1);
  assert.equal(projection.agentTasks.length, 1);
  assert.equal(projection.metrics.executed, 0);
  const [result] = await input.repository.persistProjection({
    tenantId: input.tenantId,
    projection,
    validatedAt: input.observedAt,
  });
  assert(result);
  return { projection, result };
}

async function main(): Promise<void> {
  const { connectionString, database } = requireProofDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const tenantIds: string[] = [];
  const matrix: Record<string, boolean> = {};
  let duplicateAttemptsCollapsed = 0;

  try {
    const tenantA = await createProofTenant(prisma, tenantIds, 'a');
    const tenantB = await createProofTenant(prisma, tenantIds, 'b');
    let repository = new OpportunityLifecycleRepository(prisma);

    // Restart proof: a new repository process sees the same durable rows.
    const restartClientRef = opaque('client_ref');
    const restartFactRef = opaque('fact_ref');
    const restart = await persistSingleRecency({
      repository,
      tenantId: tenantA,
      clientRef: restartClientRef,
      factRef: restartFactRef,
      observedAt: instant(0),
      expiresAt: instant(DAY),
    });
    matrix.detect_active = true;
    const beforeRestart = await repository.snapshot(tenantA);
    repository = new OpportunityLifecycleRepository(prisma);
    const [afterRestartResult] = await repository.persistProjection({
      tenantId: tenantA,
      projection: restart.projection,
      validatedAt: instant(60_000),
    });
    assert(afterRestartResult);
    duplicateAttemptsCollapsed += Number(afterRestartResult.duplicateCollapsed);
    const afterRestart = await repository.snapshot(tenantA);
    assert.deepEqual(afterRestart, beforeRestart);
    assert.equal(afterRestartResult.disposition, 'revalidated');
    matrix.same_evidence_restart_no_duplicate = true;

    // Adversarial concurrent restart proof.
    const concurrentSignal = recencySignal({
      tenantId: tenantA,
      clientRef: opaque('concurrent_client'),
      factRef: opaque('concurrent_fact'),
      observedAt: instant(2 * 60_000),
      expiresAt: instant(DAY),
    });
    const concurrentProjection = projectRecency(concurrentSignal);
    const concurrentResults = await Promise.all(
      Array.from({ length: 4 }, () =>
        new OpportunityLifecycleRepository(prisma).persistProjection({
          tenantId: tenantA,
          projection: concurrentProjection,
          validatedAt: instant(3 * 60_000),
        }),
      ),
    );
    duplicateAttemptsCollapsed += concurrentResults
      .flat()
      .filter((row) => row.duplicateCollapsed).length;
    const concurrentIdentity =
      concurrentProjection.opportunities[0]?.identityFingerprint;
    assert(concurrentIdentity);
    assert.equal(
      await prisma.opportunity.count({
        where: { tenantId: tenantA, identityFingerprint: concurrentIdentity },
      }),
      1,
    );
    assert.equal(
      await prisma.agentTask.count({
        where: {
          tenantId: tenantA,
          semanticKey: concurrentProjection.opportunities[0]?.semanticKey,
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      1,
    );
    matrix.same_evidence_concurrent_no_duplicate = true;

    const baseOpportunity = await prisma.opportunity.findUniqueOrThrow({
      where: { id: restart.result.opportunityId ?? '' },
    });
    const baseTask = await prisma.agentTask.findUniqueOrThrow({
      where: { id: restart.result.taskId ?? '' },
    });

    await expectDatabaseReject(matrix, 'same_identity_same_tenant', () =>
      prisma.opportunity.create({
        data: opportunityCreateData(baseOpportunity, {
          identityFingerprint: baseOpportunity.identityFingerprint,
          semanticKey: opaque('other_semantic'),
          revision: 1,
        }),
      }),
    );

    const crossTenantAccepted = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: opportunityCreateData(baseOpportunity, {
          tenantId: tenantB,
          identityFingerprint: baseOpportunity.identityFingerprint,
          semanticKey: baseOpportunity.semanticKey,
          revision: 1,
        }),
      });
      await tx.opportunity.delete({ where: { id: created.id } });
      return true;
    });
    assert.equal(crossTenantAccepted, true);
    matrix.same_identity_another_tenant = true;

    await expectDatabaseReject(matrix, 'cross_tenant_supersession', () =>
      prisma.opportunity.create({
        data: opportunityCreateData(baseOpportunity, {
          tenantId: tenantB,
          semanticKey: baseOpportunity.semanticKey,
          revision: baseOpportunity.revision + 1,
          supersedesOpportunityId: baseOpportunity.id,
        }),
      }),
    );
    await expectDatabaseReject(matrix, 'cross_tenant_agent_task', () =>
      prisma.agentTask.create({
        data: taskCreateData(baseTask, { tenantId: tenantB }),
      }),
    );
    await expectDatabaseReject(matrix, 'one_active_opportunity', () =>
      prisma.opportunity.create({
        data: opportunityCreateData(baseOpportunity),
      }),
    );
    await expectDatabaseReject(matrix, 'one_current_agent_task', () =>
      prisma.agentTask.create({ data: taskCreateData(baseTask) }),
    );
    await expectDatabaseReject(matrix, 'agent_domain_matches_route', () =>
      prisma.agentTask.create({
        data: taskCreateData(baseTask, {
          agentDomain: OpportunityAgentDomain.admin,
        }),
      }),
    );
    await expectDatabaseReject(matrix, 'entity_kind_ref_pair', () =>
      prisma.opportunity.create({
        data: opportunityCreateData(baseOpportunity, {
          semanticKey: opaque('entity_semantic'),
          revision: 1,
          affectedEntityKind: 'client',
          affectedEntityRef: null,
        }),
      }),
    );
    await expectDatabaseReject(matrix, 'opportunity_expiry_clock', () =>
      prisma.opportunity.create({
        data: opportunityCreateData(baseOpportunity, {
          semanticKey: opaque('expiry_semantic'),
          revision: 1,
          expiresAt: baseOpportunity.firstDetectedAt,
        }),
      }),
    );
    await expectDatabaseReject(matrix, 'positive_versions', () =>
      prisma.opportunity.create({
        data: opportunityCreateData(baseOpportunity, {
          semanticKey: opaque('version_semantic'),
          revision: 0,
        }),
      }),
    );
    await expectDatabaseReject(
      matrix,
      'terminal_cannot_keep_current_task',
      () =>
        prisma.opportunity.update({
          where: { id: baseOpportunity.id },
          data: {
            status: OpportunityLifecycleStatus.resolved,
            terminalAt: instant(5 * 60_000),
            terminalReasonCode: 'proof_resolution',
            terminalEvidenceFingerprint: opaque('resolution_evidence'),
            terminalEvidenceRefsJson: { contract: 'proof', items: [] },
          },
        }),
    );

    // Resolution proof uses a fresh canonical fact, invalidates work, and never reopens.
    const resolutionClientRef = opaque('resolution_client');
    const resolutionFactRef = opaque('resolution_fact');
    const resolution = await persistSingleRecency({
      repository,
      tenantId: tenantA,
      clientRef: resolutionClientRef,
      factRef: resolutionFactRef,
      observedAt: instant(10 * 60_000),
      expiresAt: instant(DAY),
    });
    const resolutionEvidence = [
      {
        owner: 'business_state_fact' as const,
        capability: 'client-recency-facts.read',
        factRef: opaque('current_fact'),
        version: 2,
        observedAt: instant(20 * 60_000).toISOString(),
        asOf: instant(20 * 60_000).toISOString(),
        completeness: 'complete' as const,
        basis: 'provider_visit_history_canonical_attendance',
      },
    ];
    const resolvedProjection = engine.project({
      signals: [],
      policies: policies(tenantA),
      asOf: instant(20 * 60_000).toISOString(),
    });
    assert.equal(resolvedProjection.opportunities.length, 0);
    const resolutionReconcile = await repository.reconcileCurrentProjection({
      tenantId: tenantA,
      projection: resolvedProjection,
      validatedAt: instant(21 * 60_000),
      currentState: {
        completeness: 'complete',
        opportunityTypes: [OPPORTUNITY_TYPE.clientReactivationCandidate],
        resolutions: [
          {
            semanticKey:
              resolution.projection.opportunities[0]?.semanticKey ?? '',
            proof: {
              evidenceFingerprint:
                resolutionEvidenceFingerprint(resolutionEvidence),
              evidence: resolutionEvidence,
              observedAt: instant(20 * 60_000).toISOString(),
              reasonCode: 'condition_no_longer_true',
            },
          },
        ],
      },
    });
    assert.equal(resolutionReconcile.resolved, 1);
    const resolved = await prisma.opportunity.findUniqueOrThrow({
      where: { id: resolution.result.opportunityId ?? '' },
    });
    assert.equal(resolved.status, OpportunityLifecycleStatus.resolved);
    matrix.condition_disappears_resolved = true;
    const [terminalReplay] = await repository.persistProjection({
      tenantId: tenantA,
      projection: resolution.projection,
      validatedAt: instant(22 * 60_000),
    });
    assert.equal(terminalReplay?.disposition, 'terminal_duplicate_collapsed');
    duplicateAttemptsCollapsed += Number(terminalReplay?.duplicateCollapsed);
    assert.equal(
      await prisma.opportunity.count({
        where: {
          tenantId: tenantA,
          semanticKey: resolution.projection.opportunities[0]?.semanticKey,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.agentTask.count({
        where: {
          tenantId: tenantA,
          semanticKey: resolution.projection.opportunities[0]?.semanticKey,
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      0,
    );
    matrix.resolved_no_current_task = true;
    const invalidatedResolutionTask = await prisma.agentTask.findUniqueOrThrow({
      where: { id: resolution.result.taskId ?? '' },
    });
    await expectDatabaseReject(
      matrix,
      'terminal_opportunity_never_reopens',
      () =>
        prisma.opportunity.update({
          where: { id: resolved.id },
          data: {
            status: OpportunityLifecycleStatus.active,
            terminalAt: null,
            terminalReasonCode: null,
            terminalEvidenceFingerprint: null,
            terminalEvidenceRefsJson: Prisma.JsonNull,
          },
        }),
    );
    await expectDatabaseReject(matrix, 'invalidated_task_never_reopens', () =>
      prisma.agentTask.update({
        where: { id: invalidatedResolutionTask.id },
        data: {
          status: AgentTaskLifecycleStatus.current,
          invalidatedAt: null,
          invalidationReasonCode: null,
        },
      }),
    );
    const resolvedRestartProjection = engine.project({
      signals: [],
      policies: policies(tenantA),
      asOf: instant(23 * 60_000).toISOString(),
    });
    const resolvedRestart = await repository.reconcileCurrentProjection({
      tenantId: tenantA,
      projection: resolvedRestartProjection,
      validatedAt: instant(23 * 60_000),
      currentState: {
        completeness: 'complete',
        opportunityTypes: [OPPORTUNITY_TYPE.clientReactivationCandidate],
        resolutions: [],
      },
    });
    assert.equal(resolvedRestart.resolved, 0);
    assert.equal(
      (
        await prisma.opportunity.findUniqueOrThrow({
          where: { id: resolved.id },
        })
      ).status,
      OpportunityLifecycleStatus.resolved,
    );
    assert.equal(
      await prisma.agentTask.count({
        where: {
          opportunityId: resolved.id,
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      0,
    );
    matrix.resolved_restart_stable = true;

    // Incomplete and failed reads never prove disappearance.
    const incomplete = await persistSingleRecency({
      repository,
      tenantId: tenantA,
      clientRef: opaque('incomplete_client'),
      factRef: opaque('incomplete_fact'),
      observedAt: instant(24 * 60_000),
      expiresAt: instant(DAY),
    });
    const incompleteProjection = engine.project({
      signals: [],
      policies: policies(tenantA),
      asOf: instant(25 * 60_000).toISOString(),
    });
    const incompleteReconcile = await repository.reconcileCurrentProjection({
      tenantId: tenantA,
      projection: incompleteProjection,
      validatedAt: instant(25 * 60_000),
      currentState: {
        completeness: 'partial',
        opportunityTypes: [OPPORTUNITY_TYPE.clientReactivationCandidate],
        resolutions: [],
      },
    });
    assert.equal(incompleteReconcile.resolved, 0);
    assert.equal(
      (
        await prisma.opportunity.findUniqueOrThrow({
          where: { id: incomplete.result.opportunityId ?? '' },
        })
      ).status,
      OpportunityLifecycleStatus.active,
    );
    assert.equal(
      await prisma.agentTask.count({
        where: {
          opportunityId: incomplete.result.opportunityId ?? '',
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      1,
    );
    matrix.incomplete_read_no_false_resolution = true;

    const providerFailure = await persistSingleRecency({
      repository,
      tenantId: tenantA,
      clientRef: opaque('provider_failure_client'),
      factRef: opaque('provider_failure_fact'),
      observedAt: instant(26 * 60_000),
      expiresAt: instant(DAY),
    });
    const providerFailureProjection = engine.project({
      signals: [],
      policies: policies(tenantA),
      asOf: instant(27 * 60_000).toISOString(),
    });
    const providerFailureReconcile =
      await repository.reconcileCurrentProjection({
        tenantId: tenantA,
        projection: providerFailureProjection,
        validatedAt: instant(27 * 60_000),
        currentState: {
          completeness: 'provider_failure',
          opportunityTypes: [OPPORTUNITY_TYPE.clientReactivationCandidate],
          resolutions: [],
        },
      });
    assert.equal(providerFailureReconcile.resolved, 0);
    assert.equal(
      (
        await prisma.opportunity.findUniqueOrThrow({
          where: { id: providerFailure.result.opportunityId ?? '' },
        })
      ).status,
      OpportunityLifecycleStatus.active,
    );
    assert.equal(
      await prisma.agentTask.count({
        where: {
          opportunityId: providerFailure.result.opportunityId ?? '',
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      1,
    );
    matrix.provider_failure_no_false_resolution = true;

    // Supersession proof: same condition, newer canonical evidence, one new revision.
    const evolvingClientRef = opaque('evolving_client');
    const evolvingV1 = await persistSingleRecency({
      repository,
      tenantId: tenantA,
      clientRef: evolvingClientRef,
      factRef: opaque('evolving_fact_v1'),
      observedAt: instant(30 * 60_000),
      expiresAt: instant(DAY),
    });
    const evolvingV2Projection = projectRecency(
      recencySignal({
        tenantId: tenantA,
        clientRef: evolvingClientRef,
        factRef: opaque('evolving_fact_v2'),
        observedAt: instant(40 * 60_000),
        expiresAt: instant(2 * DAY),
        days: 91,
      }),
    );
    const [evolvingV2] = await repository.persistProjection({
      tenantId: tenantA,
      projection: evolvingV2Projection,
      validatedAt: instant(40 * 60_000),
    });
    assert.equal(evolvingV2?.disposition, 'superseded');
    const evolvingRows = await prisma.opportunity.findMany({
      where: {
        tenantId: tenantA,
        semanticKey: evolvingV1.projection.opportunities[0]?.semanticKey,
      },
      orderBy: { revision: 'asc' },
    });
    assert.deepEqual(
      evolvingRows.map((row) => [row.revision, row.status]),
      [
        [1, OpportunityLifecycleStatus.superseded],
        [2, OpportunityLifecycleStatus.active],
      ],
    );
    assert.equal(evolvingRows[1]?.supersedesOpportunityId, evolvingRows[0]?.id);
    assert.equal(
      await prisma.agentTask.count({
        where: {
          opportunityId: evolvingRows[0]?.id,
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      0,
    );
    matrix.superseded_old_task_not_current = true;
    matrix.evolving_evidence_supersession = true;
    const [evolvingRestart] = await new OpportunityLifecycleRepository(
      prisma,
    ).persistProjection({
      tenantId: tenantA,
      projection: evolvingV2Projection,
      validatedAt: instant(41 * 60_000),
    });
    assert.equal(evolvingRestart?.disposition, 'revalidated');
    duplicateAttemptsCollapsed += Number(evolvingRestart?.duplicateCollapsed);
    assert.equal(
      await prisma.agentTask.count({
        where: {
          tenantId: tenantA,
          semanticKey: evolvingRows[1]?.semanticKey,
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      1,
    );
    await expectDatabaseReject(
      matrix,
      'superseded_requires_successor',
      async () => {
        await prisma.$transaction(async (tx) => {
          await tx.agentTask.updateMany({
            where: {
              tenantId: tenantA,
              opportunityId: evolvingRows[1]?.id,
              status: AgentTaskLifecycleStatus.current,
            },
            data: {
              status: AgentTaskLifecycleStatus.invalidated,
              invalidatedAt: instant(50 * 60_000),
              invalidationReasonCode: 'proof_only',
            },
          });
          await tx.opportunity.update({
            where: { id: evolvingRows[1]?.id ?? '' },
            data: {
              status: OpportunityLifecycleStatus.superseded,
              terminalAt: instant(50 * 60_000),
              terminalReasonCode: 'proof_only',
            },
          });
        });
      },
    );

    // Family expiry proof: no global TTL and stale evidence cannot recreate work.
    const expiryObservedAt = instant(60 * 60_000);
    const expiryProjection = engine.project({
      signals: [
        incomingCustomerRequestSignal({
          tenantId: tenantA,
          requestRef: opaque('request_ref'),
          untrustedText: 'Private Person +79990000000 private@example.com',
          observedAt: expiryObservedAt.toISOString(),
          expiresAt: instant(61 * 60_000).toISOString(),
        }),
      ],
      policies: [],
      asOf: expiryObservedAt.toISOString(),
    });
    const [expiryCreated] = await repository.persistProjection({
      tenantId: tenantA,
      projection: expiryProjection,
      validatedAt: expiryObservedAt,
    });
    assert(expiryCreated);
    assert.notEqual(
      expiryProjection.opportunities[0]?.expiresAt,
      restart.projection.opportunities[0]?.expiresAt,
    );
    assert.equal(
      await repository.expireDue({
        tenantId: tenantA,
        asOf: instant(62 * 60_000),
      }),
      1,
    );
    const beforeExpiredReplay = await repository.snapshot(tenantA);
    const [expiredReplay] = await new OpportunityLifecycleRepository(
      prisma,
    ).persistProjection({
      tenantId: tenantA,
      projection: expiryProjection,
      validatedAt: instant(63 * 60_000),
    });
    assert.equal(expiredReplay?.disposition, 'terminal_duplicate_collapsed');
    duplicateAttemptsCollapsed += Number(expiredReplay?.duplicateCollapsed);
    assert.deepEqual(await repository.snapshot(tenantA), beforeExpiredReplay);
    assert.equal(
      await prisma.agentTask.count({
        where: {
          id: expiryCreated.taskId ?? '',
          status: AgentTaskLifecycleStatus.current,
        },
      }),
      0,
    );
    matrix.expired_no_current_task = true;
    const privacyRow = await prisma.opportunity.findUniqueOrThrow({
      where: { id: expiryCreated.opportunityId ?? '' },
    });
    const privacyTask = await prisma.agentTask.findUniqueOrThrow({
      where: { id: expiryCreated.taskId ?? '' },
    });
    const persistedPrivacySurface = stableCanonicalJson({
      evidence: privacyRow.evidenceRefsJson,
      limitations: privacyRow.limitationsJson,
      reads: privacyTask.allowedReadCapabilities,
      actions: privacyTask.allowedActionClasses,
    });
    assert.equal(persistedPrivacySurface.includes('+79990000000'), false);
    assert.equal(
      persistedPrivacySurface.includes('private@example.com'),
      false,
    );
    assert.equal(persistedPrivacySurface.includes('Private Person'), false);

    // AgentTask expiry and outcome barriers at the database boundary.
    const barrierOpportunity = await prisma.opportunity.findUniqueOrThrow({
      where: { id: evolvingV2?.opportunityId ?? '' },
    });
    const barrierTask = await prisma.agentTask.findUniqueOrThrow({
      where: { id: evolvingV2?.taskId ?? '' },
    });
    await expectDatabaseReject(matrix, 'task_cannot_outlive_opportunity', () =>
      prisma.agentTask.create({
        data: taskCreateData(barrierTask, {
          opportunityId: barrierOpportunity.id,
          semanticKey: opaque('unmatched_semantic'),
          expiresAt: new Date(barrierOpportunity.expiresAt.getTime() + 1),
        }),
      }),
    );
    await expectDatabaseReject(matrix, 'inform_only_has_no_task', async () => {
      await prisma.$transaction(async (tx) => {
        const inform = await tx.opportunity.create({
          data: opportunityCreateData(baseOpportunity, {
            semanticKey: opaque('inform_semantic'),
            identityFingerprint: opaque('inform_identity'),
            revision: 1,
            outcome: OpportunityOutcome.inform_only,
            recommendedAgentDomain:
              OpportunityAgentDomain.business_intelligence,
          }),
        });
        await tx.agentTask.create({
          data: taskCreateData(baseTask, {
            opportunityId: inform.id,
            semanticKey: inform.semanticKey,
            agentDomain: OpportunityAgentDomain.business_intelligence,
          }),
        });
      });
    });

    // Cutover proof: bootstrap and historical rows cannot create durable work.
    const cutoverAt = instant(70 * 60_000);
    const shadowAsOf = instant(80 * 60_000);
    const shadowBase: OpportunityShadowEventRowV1 = {
      tenantId: opaque('source_tenant'),
      eventId: opaque('event'),
      entityType: 'appointment',
      entityId: opaque('appointment'),
      eventType: 'appointment.removed',
      occurredAt: instant(75 * 60_000).toISOString(),
      receivedAt: instant(76 * 60_000).toISOString(),
      ingestionMethod: 'webhook',
      observationOrigin: 'after_watch_started',
      watchStartedAt: cutoverAt.toISOString(),
      appointment: null,
    };
    shadowBase.appointment = {
      id: shadowBase.entityId,
      tenantId: shadowBase.tenantId,
      status: 'canceled',
      blockedStartAt: instant(90 * 60_000).toISOString(),
      blockedEndAt: instant(91 * 60_000).toISOString(),
      currentCapacity: {
        availability: 'available',
        completeness: 'complete',
        scheduleRef: opaque('schedule'),
        basis: 'canonical_provider_schedule_and_availability',
      },
    };
    const bootstrap = projectAppointmentRemovalShadow({
      rows: [{ ...shadowBase, ingestionMethod: 'bootstrap' }],
      cutoverAt: cutoverAt.toISOString(),
      asOf: shadowAsOf.toISOString(),
    });
    const historical = projectAppointmentRemovalShadow({
      rows: [
        {
          ...shadowBase,
          occurredAt: instant(69 * 60_000).toISOString(),
          receivedAt: instant(71 * 60_000).toISOString(),
        },
      ],
      cutoverAt: cutoverAt.toISOString(),
      asOf: shadowAsOf.toISOString(),
    });
    assert.equal(bootstrap.projection.opportunities.length, 0);
    assert.equal(historical.projection.opportunities.length, 0);
    assert.equal(bootstrap.source.rejectedByReason.bootstrap, 1);
    assert.equal(historical.source.rejectedByReason.before_cutover, 1);
    matrix.historical_event_rejected = true;

    const canonicalAppointment = shadowBase.appointment;
    assert(canonicalAppointment);
    const noCapacityShadow = projectAppointmentRemovalShadow({
      rows: [
        {
          ...shadowBase,
          appointment: {
            ...canonicalAppointment,
            currentCapacity: null,
          },
        },
      ],
      cutoverAt: cutoverAt.toISOString(),
      asOf: shadowAsOf.toISOString(),
    });
    assert.equal(noCapacityShadow.projection.opportunities.length, 0);
    assert.equal(noCapacityShadow.projection.agentTasks.length, 0);
    matrix.occupancy_without_capacity_rejected = true;

    const currentShadow = projectAppointmentRemovalShadow({
      rows: [shadowBase],
      cutoverAt: cutoverAt.toISOString(),
      asOf: shadowAsOf.toISOString(),
    });
    assert.equal(currentShadow.source.accepted, 1);
    assert.equal(currentShadow.projection.opportunities.length, 1);
    assert.equal(currentShadow.projection.agentTasks.length, 1);
    matrix.occupancy_with_capacity_detected = true;
    const shadowTenantId = currentShadow.projection.opportunities[0]?.tenantId;
    assert(shadowTenantId);
    await createProofTenant(prisma, tenantIds, 'shadow', shadowTenantId);
    const shadowRepository = new OpportunityLifecycleRepository(prisma);
    await shadowRepository.persistProjection({
      tenantId: shadowTenantId,
      projection: currentShadow.projection,
      validatedAt: shadowAsOf,
    });
    const shadowBeforeRestart = await shadowRepository.snapshot(shadowTenantId);
    const shadowRestart = await new OpportunityLifecycleRepository(
      prisma,
    ).persistProjection({
      tenantId: shadowTenantId,
      projection: currentShadow.projection,
      validatedAt: instant(81 * 60_000),
    });
    duplicateAttemptsCollapsed += shadowRestart.filter(
      (row) => row.duplicateCollapsed,
    ).length;
    assert.deepEqual(
      await shadowRepository.snapshot(shadowTenantId),
      shadowBeforeRestart,
    );

    const actionIntentTable = await prisma.$queryRaw<
      Array<{ relation: string | null }>
    >`SELECT to_regclass('"ActionIntent"')::text AS relation`;
    assert.equal(actionIntentTable[0]?.relation, null);
    matrix.no_action_intent_table = true;

    const currentPolicyDenied = await repository.readCurrentTasks({
      tenantId: tenantA,
      asOf: instant(82 * 60_000),
      isPolicyAllowed: () => false,
    });
    assert.equal(currentPolicyDenied.length, 0);
    matrix.revoked_policy_cannot_resume_task = true;

    assert.equal(
      await repository.countStaleCurrentTasks({
        tenantId: tenantA,
        asOf: instant(82 * 60_000),
      }),
      0,
    );
    matrix.stale_task_not_resurrected = true;
    matrix.action_intents_executed_zero = true;

    const totals = await repository.snapshot(tenantA);
    const result: ProofResult = {
      database,
      lifecycle: {
        restartStable: true,
        concurrentDedupStable: true,
        resolutionStable: true,
        supersessionStable: true,
        expiryStable: true,
        cutoverStable: true,
        currentStateReconciliationStable: true,
        incompleteReadStable: true,
        providerFailureStable: true,
        occupancyCapacityStable: true,
        staleTaskStable: true,
      },
      databaseInvariants: Object.fromEntries(
        Object.entries(matrix).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      privacy: {
        rawPayloadPersisted: false,
        fullBusinessStatePersisted: false,
      },
      totals,
      duplicateAttemptsCollapsed,
      actionIntentsExecuted: 0,
      sideEffectsExecuted: 0,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Opportunity lifecycle proof failed: ${message}\n`);
  process.exitCode = 1;
});
