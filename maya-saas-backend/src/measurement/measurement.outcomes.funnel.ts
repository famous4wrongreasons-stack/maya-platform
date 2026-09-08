import { Prisma } from '@prisma/client';
import {
  MeasurementResult,
  NormalizedMeasurementIntent,
} from './measurement.contract';
import { measurementReadWindow } from './measurement.period';
import {
  outcomeBound,
  outcomeMetric,
  outcomeQuery,
  outcomeSource,
  OutcomeSourceBoundError,
  OUTCOME_READ_LIMIT,
} from './measurement.outcomes.facts';

/** Each cohort is admitted on its own owner's clock. State is current at read,
 * not a reconstruction of the owner's state at that admission timestamp. */
export async function readOutcomeFunnel(
  db: Prisma.TransactionClient,
  tenantId: string,
  i: NormalizedMeasurementIntent,
  observedAt: Date,
): Promise<MeasurementResult> {
  const w = measurementReadWindow(i);
  if (!w.nonempty)
    return {
      sources: [],
      dependencies: [],
      metrics: [],
      reasons: ['measurement_period_not_started'],
      completeness: 'NOT_MEASURED',
      qualification: 'UNQUALIFIED',
      attributionStatus: 'NOT_APPLICABLE',
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
  const between = { gte: w.from, lt: w.to };
  const bounded = {
    take: OUTCOME_READ_LIMIT + 1,
    orderBy: { id: 'asc' as const },
  };
  const opportunities = outcomeBound(
    await db.opportunity.findMany({
      where: { tenantId, firstDetectedAt: between },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        semanticKey: true,
        revision: true,
        type: true,
        status: true,
        outcome: true,
        firstDetectedAt: true,
        lastValidatedAt: true,
        updatedAt: true,
      },
    }),
  );
  const tasks = outcomeBound(
    await db.agentTask.findMany({
      where: { tenantId, requestedAt: between },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        opportunityId: true,
        status: true,
        requestedAt: true,
        agentDomain: true,
        invalidatedAt: true,
        updatedAt: true,
      },
    }),
  );
  const executions = outcomeBound(
    await db.actionExecution.findMany({
      where: { tenantId, createdAt: between },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        agentTaskId: true,
        capability: true,
        state: true,
        policyDecision: true,
        approvalDecision: true,
        dryRun: true,
        createdAt: true,
        reconciliationState: true,
        finalizedAt: true,
        updatedAt: true,
      },
    }),
  );
  // Attempts belong to the admitted execution cohort, regardless of retry date.
  const attempts = outcomeBound(
    await db.actionAttempt.findMany({
      where: {
        tenantId,
        actionExecutionId: { in: executions.map((e) => e.id) },
      },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        actionExecutionId: true,
        kind: true,
        state: true,
        externalDispatchState: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
  );
  const campaigns = outcomeBound(
    await db.marketingCampaign.findMany({
      where: { tenantId, parentRecipientId: null, createdAt: between },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        lifecycleVersion: true,
        scope: true,
        actionExecutionId: true,
        aggregateState: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
  const canonical = campaigns.filter(
    (c) => [1, 2].includes(c.lifecycleVersion) && c.actionExecutionId !== null,
  );
  const rootRecipients = outcomeBound(
    await db.marketingCampaignRecipient.findMany({
      where: { tenantId, campaignId: { in: canonical.map((c) => c.id) } },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        campaignId: true,
        lifecycleVersion: true,
        clientId: true,
        deliveryState: true,
        aggregateState: true,
        updatedAt: true,
      },
    }),
  );
  const slots = outcomeBound(
    await db.marketingCampaign.findMany({
      where: {
        tenantId,
        parentRecipientId: { in: rootRecipients.map((r) => r.id) },
      },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        parentRecipientId: true,
        bulkSlotKey: true,
        lifecycleVersion: true,
        aggregateState: true,
        updatedAt: true,
      },
    }),
  );
  const transportRecipients = outcomeBound(
    await db.marketingCampaignRecipient.findMany({
      where: { tenantId, campaignId: { in: slots.map((c) => c.id) } },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        campaignId: true,
        lifecycleVersion: true,
        deliveryState: true,
        updatedAt: true,
      },
    }),
  );
  const deliveryAttempts = outcomeBound(
    await db.marketingDeliveryAttempt.findMany({
      where: {
        tenantId,
        campaignId: { in: [...canonical, ...slots].map((c) => c.id) },
      },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        campaignId: true,
        recipientId: true,
        lifecycleVersion: true,
        kind: true,
        state: true,
        externalDispatchState: true,
        startedAt: true,
        completedAt: true,
      },
    }),
  );
  const recovery = outcomeBound(
    await db.recoveryConversion.findMany({
      where: { tenantId, bookedAt: between },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        touchpointId: true,
        bookedAt: true,
        status: true,
        filledWindow: true,
        updatedAt: true,
      },
    }),
  );
  const touchpoints = outcomeBound(
    await db.recoveryTouchpoint.findMany({
      where: { tenantId, id: { in: recovery.map((r) => r.touchpointId) } },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        occurredAt: true,
        attributionWindowDays: true,
        kind: true,
        channel: true,
        status: true,
      },
    }),
  );
  const corrections = outcomeBound(
    await db.actionTargetMutation.findMany({
      where: {
        tenantId,
        targetKind: 'recovery_attribution',
        targetRef: { in: recovery.map((r) => r.id) },
      },
      ...bounded,
      select: {
        id: true,
        tenantId: true,
        actionExecutionId: true,
        targetKind: true,
        targetRef: true,
        mutationKind: true,
        targetGeneration: true,
        beforeStateHash: true,
        afterStateHash: true,
        createdAt: true,
      },
    }),
  );
  const source = (
    owner: string,
    kind: string,
    rows: unknown,
    labelled = false,
  ) =>
    outcomeSource(
      tenantId,
      owner,
      kind,
      outcomeQuery(i),
      rows,
      observedAt,
      labelled ? 'SOURCE_LABELLED' : 'VERIFIED',
    );
  const sources = [
    source('Opportunity', 'canonical_opportunity_query', opportunities),
    source('AgentTask', 'canonical_task_query', tasks),
    source('ActionExecution', 'canonical_execution_query', executions),
    source('ActionAttempt', 'canonical_attempt_query', attempts),
    source('MarketingCampaign', 'canonical_campaign_query', {
      roots: campaigns,
      slots,
    }),
    source('MarketingCampaignRecipient', 'canonical_recipient_query', {
      rootRecipients,
      transportRecipients,
    }),
    source(
      'MarketingDeliveryAttempt',
      'canonical_delivery_attempt_query',
      deliveryAttempts,
    ),
    source(
      'RecoveryConversion',
      'canonical_recovery_assignment_query',
      recovery,
      true,
    ),
    source(
      'RecoveryTouchpoint',
      'canonical_recovery_touchpoint',
      touchpoints,
      true,
    ),
    source('ActionTargetMutation', 'canonical_target_mutation', corrections),
  ];
  const metrics: MeasurementResult['metrics'] = [];
  const count = (key: string, n: number, refs: number[], basis: string) =>
    metrics.push(outcomeMetric(key, String(n), refs, basis));
  const stages = (
    key: string,
    rows: Array<Record<string, unknown>>,
    field: string,
    states: readonly string[],
    refs: number[],
    basis: string,
  ) => {
    for (const state of states)
      count(
        `${key}_${state.toLowerCase()}_count`,
        rows.filter((r) => r[field] === state).length,
        refs,
        basis,
      );
  };
  count(
    'opportunity_revision_count',
    opportunities.length,
    [0],
    'opportunity_first_detected_cohort',
  );
  count(
    'opportunity_logical_count',
    new Set(opportunities.map((o) => o.semanticKey)).size,
    [0],
    'distinct_semantic_key_in_revision_cohort',
  );
  stages(
    'opportunity',
    opportunities,
    'status',
    ['active', 'resolved', 'expired', 'superseded'],
    [0],
    'current_opportunity_revision_state',
  );
  count(
    'task_assignment_count',
    tasks.length,
    [1],
    'agent_task_requested_cohort',
  );
  stages(
    'task',
    tasks,
    'status',
    ['current', 'invalidated'],
    [1],
    'current_assignment_state',
  );
  count(
    'action_admitted_count',
    executions.length,
    [2],
    'action_execution_created_cohort',
  );
  count(
    'action_dry_run_count',
    executions.filter((e) => e.dryRun).length,
    [2],
    'admitted_actions',
  );
  count(
    'action_task_linked_count',
    executions.filter((e) => e.agentTaskId !== null).length,
    [2],
    'admitted_actions_with_exact_task_fk',
  );
  stages(
    'action_policy',
    executions,
    'policyDecision',
    ['ALLOW', 'DENY', 'SHADOW_ONLY'],
    [2],
    'admitted_actions',
  );
  stages(
    'action_approval',
    executions,
    'approvalDecision',
    ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'],
    [2],
    'admitted_actions',
  );
  stages(
    'action',
    executions,
    'state',
    [
      'PENDING_APPROVAL',
      'READY',
      'EXECUTING',
      'UNKNOWN',
      'SUCCEEDED',
      'FAILED',
      'NOT_EXECUTED',
    ],
    [2],
    'current_admitted_action_state',
  );
  count(
    'action_real_success_count',
    executions.filter(
      (e) =>
        e.state === 'SUCCEEDED' &&
        !e.dryRun &&
        e.policyDecision === 'ALLOW' &&
        ['APPROVED', 'NOT_REQUIRED'].includes(e.approvalDecision),
    ).length,
    [2],
    'current_nondryrun_approved_action_state',
  );
  count(
    'execution_attempt_count',
    attempts.filter((a) => a.kind === 'EXECUTION').length,
    [2, 3],
    'attempts_of_admitted_execution_cohort',
  );
  count(
    'reconciliation_attempt_count',
    attempts.filter((a) => a.kind === 'RECONCILIATION').length,
    [2, 3],
    'attempts_of_admitted_execution_cohort',
  );
  stages(
    'attempt',
    attempts,
    'state',
    ['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN'],
    [2, 3],
    'all_attempts_of_admitted_execution_cohort',
  );
  metrics.push(
    outcomeMetric(
      'proposal_count',
      null,
      [0, 1, 2],
      'ephemeral_proposals_have_no_durable_admission_denominator',
      'NOT_MEASURED',
    ),
  );
  count(
    'campaign_root_count',
    canonical.length,
    [4],
    'canonical_campaign_root_created_cohort',
  );
  count(
    'campaign_legacy_unqualified_count',
    campaigns.length - canonical.length,
    [4],
    'legacy_campaign_cohort_without_canonical_lifecycle',
  );
  count(
    'transport_slot_count',
    slots.length,
    [4],
    'transport_children_of_root_recipient_cohort',
  );
  count(
    'root_recipient_count',
    rootRecipients.length,
    [4, 5],
    'distinct_root_recipients_of_campaign_cohort',
  );
  count(
    'canonical_client_recipient_count',
    rootRecipients.filter(
      (r) => r.lifecycleVersion === 2 && r.clientId !== null,
    ).length,
    [4, 5],
    'canonical_bulk_client_root_recipients',
  );
  const transport = [
    ...rootRecipients.filter((r) => r.lifecycleVersion === 1),
    ...transportRecipients,
  ];
  count(
    'transport_recipient_count',
    transport.length,
    [4, 5],
    'single_delivery_recipients_and_bulk_transport_children',
  );
  stages(
    'transport_delivery',
    transport,
    'deliveryState',
    ['NOT_SENT', 'ACCEPTED', 'DELIVERED', 'FAILED', 'UNKNOWN', 'SKIPPED'],
    [4, 5],
    'transport_recipient_denominator',
  );
  const logical = rootRecipients.map((r) => {
    if (r.lifecycleVersion !== 2) return [r.deliveryState];
    const ids = new Set(
      slots.filter((c) => c.parentRecipientId === r.id).map((c) => c.id),
    );
    return transportRecipients
      .filter((child) => ids.has(child.campaignId))
      .map((child) => child.deliveryState);
  });
  const accepted = logical.filter((states) =>
    states.some((s) => s === 'ACCEPTED' || s === 'DELIVERED'),
  ).length;
  const delivered = logical.filter((states) =>
    states.includes('DELIVERED'),
  ).length;
  count(
    'root_recipient_accepted_or_delivered_count',
    accepted,
    [4, 5],
    'distinct_root_with_at_least_one_transport_receipt',
  );
  count(
    'root_recipient_delivered_count',
    delivered,
    [4, 5],
    'distinct_root_with_delivered_receipt',
  );
  count(
    'delivery_execution_attempt_count',
    deliveryAttempts.filter(
      (a) => a.lifecycleVersion === 1 && a.kind === 'EXECUTION',
    ).length,
    [4, 6],
    'delivery_attempts_of_campaign_cohort',
  );
  count(
    'delivery_reconciliation_attempt_count',
    deliveryAttempts.filter(
      (a) => a.lifecycleVersion === 1 && a.kind === 'RECONCILIATION',
    ).length,
    [4, 6],
    'delivery_attempts_of_campaign_cohort',
  );
  for (const [key, numerator] of [
    ['recipient_acceptance_rate', accepted],
    ['recipient_delivery_rate', delivered],
  ] as const) {
    count(
      `${key}_numerator`,
      numerator,
      [4, 5],
      'distinct_root_recipient_denominator',
    );
    count(
      `${key}_denominator`,
      rootRecipients.length,
      [4, 5],
      'distinct_root_recipient_denominator',
    );
    metrics.push(
      outcomeMetric(
        key,
        rootRecipients.length
          ? String(Math.floor((numerator * 1_000_000) / rootRecipients.length))
          : null,
        [4, 5],
        'floor_parts_per_million_distinct_root_recipients',
        rootRecipients.length ? 'COMPLETE' : 'NOT_MEASURED',
        'ratio_ppm',
      ),
    );
  }
  metrics.push(
    outcomeMetric(
      'recipient_read_count',
      null,
      [4, 5, 6],
      'canonical_delivery_has_no_read_receipt',
      'NOT_MEASURED',
    ),
  );
  metrics.push(
    outcomeMetric(
      'recipient_read_rate',
      null,
      [4, 5, 6],
      'canonical_delivery_has_no_read_receipt',
      'NOT_MEASURED',
      'ratio_ppm',
    ),
  );
  count(
    'a29_assignment_count',
    recovery.length,
    [7, 8],
    'source_labelled_frozen_assignment_booked_cohort',
  );
  count(
    'a29_governed_correction_count',
    corrections.length,
    [7, 8, 9],
    'immutable_owner_corrections_not_outcome_credit',
  );
  stages(
    'a29_current',
    recovery,
    'status',
    ['booked', 'canceled'],
    [7, 8],
    'source_labelled_current_assignment_state',
  );
  count(
    'a29_filled_window_flag_count',
    recovery.filter((r) => r.filledWindow).length,
    [7],
    'source_labelled_flag_not_capacity_proof',
  );
  const windows = new Set(touchpoints.map((t) => t.attributionWindowDays));
  if (
    [...windows].some(
      (days) => !Number.isInteger(days) || days < 1 || days > 90,
    )
  )
    throw new OutcomeSourceBoundError();
  for (const days of [...windows].sort((a, b) => a - b)) {
    const ids = new Set(
      touchpoints
        .filter((t) => t.attributionWindowDays === days)
        .map((t) => t.id),
    );
    metrics.push(
      outcomeMetric(
        'a29_frozen_window_assignment_count',
        String(recovery.filter((r) => ids.has(r.touchpointId)).length),
        [7, 8],
        'source_labelled_owner_assignment_frozen_window_days',
        'COMPLETE',
        'count',
        { source: `window_days_${days}` },
      ),
    );
  }
  const reasons = [
    'owner_cohorts_use_distinct_admission_clocks',
    'states_observed_at_read_not_reconstructed_as_of',
    'proposal_admission_denominator_unavailable',
    'delivery_acceptance_is_not_delivery',
    'read_receipt_not_supported',
    'a29_assignment_is_not_verified_client_credit',
    'filled_window_flag_is_not_capacity_proof',
    'incremental_revenue_not_measured',
  ];
  if (w.open) reasons.push('partial_period');
  if (
    [
      ...opportunities,
      ...tasks,
      ...executions,
      ...campaigns,
      ...rootRecipients,
      ...slots,
      ...transportRecipients,
      ...recovery,
    ].some((r) => r.updatedAt > i.asOf) ||
    attempts.some((a) => a.finishedAt && a.finishedAt > i.asOf) ||
    deliveryAttempts.some((a) => a.completedAt && a.completedAt > i.asOf)
  )
    reasons.push('source_observed_after_business_cutoff');
  return {
    sources,
    dependencies: [],
    metrics,
    reasons,
    completeness: 'PARTIAL',
    qualification: 'SOURCE_LABELLED',
    attributionStatus: 'NOT_APPLICABLE',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
}
