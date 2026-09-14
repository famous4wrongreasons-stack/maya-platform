import {
  measurementHash,
  MeasurementMetric,
  MeasurementResult,
  MeasurementSource,
  NormalizedMeasurementIntent,
  Qualification,
  selectMeasurementAttribution,
} from './measurement.contract';
import {
  opportunityShadowAppointmentRef,
  opportunityShadowIntervalRef,
} from '../opportunities/opportunity.shadow';

export const OUTCOME_READ_LIMIT = 1000;
export class OutcomeSourceBoundError extends Error {
  constructor() {
    super('measurement_outcomes_source_bound_exceeded');
  }
}
export function outcomeBound<T>(rows: T[]): T[] {
  if (rows.length > OUTCOME_READ_LIMIT) throw new OutcomeSourceBoundError();
  return rows;
}
export function outcomeUnavailable(reason: string): MeasurementResult {
  return {
    sources: [],
    dependencies: [],
    metrics: [],
    reasons: [reason],
    completeness: 'UNAVAILABLE',
    qualification: 'UNQUALIFIED',
    attributionStatus: 'UNATTRIBUTED',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
}
export function outcomeSource(
  tenantId: string,
  owner: string,
  kind: string,
  query: unknown,
  rows: unknown,
  observedAt: Date,
  qualification: Qualification = 'VERIFIED',
  coverage = 'current_stored_facts_observed_for_bound_cohort',
): MeasurementSource {
  return {
    owner,
    kind,
    tenantId,
    id: measurementHash(['c7.outcome-query/1', tenantId, owner, kind, query]),
    stateHash: measurementHash([query, rows]),
    observedAt: observedAt.toISOString(),
    qualification,
    coverage,
  };
}
export function outcomeMetric(
  key: string,
  value: MeasurementMetric['value'],
  sourceRefs: number[],
  basis: string,
  state: MeasurementMetric['state'] = 'COMPLETE',
  unit = 'count',
  dimensions: Record<string, string> = {},
  currency: string | null = null,
): MeasurementMetric {
  return { key, value, sourceRefs, basis, state, unit, dimensions, currency };
}
export function outcomeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type OutcomeAppointment = {
  id: string;
  tenantId: string;
  mayaClientId: string | null;
  source: string;
  crmProvider: string | null;
  crmExternalId: string | null;
  status: string;
  attendance: string | null;
  branchId: string | null;
  staffId: string | null;
  staffExternalId: string;
  startAt: Date;
  endAt: Date;
  blockedStartAt: Date | null;
  blockedEndAt: Date | null;
  totalPriceKopecks: number | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};
export type OutcomeExecution = {
  id: string;
  tenantId: string;
  capability: string;
  sourceType: string;
  agentTaskId: string | null;
  dryRun: boolean;
  policyDecision: string;
  approvalDecision: string;
  state: string;
  bookingIntentContract: string | null;
  bookingIntentHash: string | null;
  normalizedInputHash: string;
  normalizedInputContract: string;
  hasInput: boolean;
  createdAt: Date;
  finalizedAt: Date | null;
  updatedAt: Date;
};
export type OutcomeAttempt = {
  id: string;
  tenantId: string;
  actionExecutionId: string;
  kind: string;
  state: string;
  externalDispatchState: string;
  startedAt: Date;
  finishedAt: Date | null;
  safeResultJson: unknown;
};
export type OutcomeBinding = {
  tenantId: string;
  clientId: string;
  actionExecutionId: string;
  idempotencyScope: string;
  requestIdempotencyKeyHash: string;
  createdAt: Date;
};
export function outcomeAttemptHashFact(a: OutcomeAttempt) {
  const { safeResultJson, ...rest } = a;
  // The owner receipt may contain decimal prices. Hash its existing JSON;
  // retain no receipt body or alternate normalization/decryption contract.
  return {
    ...rest,
    receiptHash: measurementHash(JSON.stringify(safeResultJson)),
  };
}

/** Credit means an exact successful effect, never inferred causal uplift.
 * The internal B31 target embeds the execution identity. External numeric IDs
 * lack a frozen provider namespace in this reader's approved input interface.
 */
export function exactOutcomeAttribution(input: {
  appointment: OutcomeAppointment;
  executions: OutcomeExecution[];
  attempts: OutcomeAttempt[];
  bindings: OutcomeBinding[];
  trustedInputs: ReadonlyMap<string, Record<string, unknown>>;
  asOf: Date;
}) {
  const { appointment: a, asOf } = input;
  const candidates: Parameters<typeof selectMeasurementAttribution>[0] = [];
  for (const e of input.executions) {
    const n = input.trustedInputs.get(e.id);
    const bindings = input.bindings.filter((b) => b.actionExecutionId === e.id);
    if (
      a.source !== 'internal' ||
      a.id !== `appointment-action:${e.id}` ||
      e.tenantId !== a.tenantId ||
      e.capability !== 'crm.appointment.create.v1' ||
      e.sourceType !== 'authenticated_request' ||
      e.dryRun ||
      e.policyDecision !== 'ALLOW' ||
      !['APPROVED', 'NOT_REQUIRED'].includes(e.approvalDecision) ||
      e.state !== 'SUCCEEDED' ||
      !e.finalizedAt ||
      e.finalizedAt > asOf ||
      e.bookingIntentContract !== 'maya.client-appointment-create-intent/1' ||
      !e.bookingIntentHash ||
      !n ||
      n.clientId !== a.mayaClientId ||
      n.creationMode !== 'client' ||
      n.allowBusy !== false ||
      n.notifyBySmsHours !== 0 ||
      !bindings.length ||
      bindings.some(
        (b) =>
          b.tenantId !== a.tenantId ||
          b.clientId !== a.mayaClientId ||
          b.idempotencyScope !== 'appointments.client.create.v1',
      )
    )
      continue;
    for (const attempt of input.attempts) {
      const receipt = outcomeRecord(attempt.safeResultJson);
      if (
        attempt.tenantId === a.tenantId &&
        attempt.actionExecutionId === e.id &&
        attempt.kind === 'EXECUTION' &&
        attempt.state === 'SUCCEEDED' &&
        ['NOT_APPLICABLE', 'ACKNOWLEDGED'].includes(
          attempt.externalDispatchState,
        ) &&
        attempt.finishedAt &&
        attempt.finishedAt <= asOf &&
        receipt.externalId === a.id &&
        receipt.status === 'confirmed'
      )
        candidates.push({
          executionId: e.id,
          attemptId: attempt.id,
          lineage: 'exact_receipt',
          confirmed: true,
        });
    }
  }
  return selectMeasurementAttribution(candidates);
}

export type CapacityOpportunity = {
  id: string;
  tenantId: string;
  type: string;
  affectedEntityKind: string | null;
  affectedEntityRef: string | null;
  evidenceRefsJson: unknown;
  evidenceObservedAt: Date;
};
/** Frozen Opportunity refs prove the original interval, never a filledWindow flag. */
export function exactCapacityOutcome(input: {
  outcome: OutcomeAppointment;
  opportunity: CapacityOpportunity | null;
  originals: OutcomeAppointment[];
}): {
  filled: boolean | null;
  attended: boolean | null;
  originalId: string | null;
  reason: string;
} {
  const absent = {
    filled: null,
    attended: null,
    originalId: null,
    reason: 'original_capacity_evidence_unavailable',
  };
  const { outcome, opportunity: o } = input;
  if (
    !o ||
    o.tenantId !== outcome.tenantId ||
    o.type !== 'appointment_cancellation_recovery' ||
    o.affectedEntityKind !== 'appointment'
  )
    return absent;
  const wrapper = outcomeRecord(o.evidenceRefsJson);
  if (
    wrapper.contract !== 'maya.opportunity-evidence-refs/1' ||
    !Array.isArray(wrapper.items)
  )
    return absent;
  const items = wrapper.items.map(outcomeRecord);
  const capacity = items.filter(
    (e) =>
      e.owner === 'occupancy_capacity' &&
      e.capability === 'occupancy.capacity.read' &&
      e.completeness === 'complete',
  );
  const schedule = items.filter(
    (e) =>
      e.owner === 'occupancy_capacity' &&
      e.capability === 'occupancy.schedule.read' &&
      e.completeness === 'complete' &&
      typeof e.ref === 'string',
  );
  const event = items.filter(
    (e) =>
      e.owner === 'watch_domain_event' &&
      e.capability === 'watch.domain-event.read' &&
      e.completeness === 'complete' &&
      typeof e.ref === 'string',
  );
  if (capacity.length !== 1 || schedule.length !== 1 || event.length !== 1)
    return absent;
  const originals = input.originals.filter(
    (a) =>
      a.id !== outcome.id &&
      a.tenantId === outcome.tenantId &&
      a.blockedStartAt &&
      a.blockedEndAt &&
      opportunityShadowAppointmentRef(a.tenantId, a.id) ===
        o.affectedEntityRef &&
      opportunityShadowIntervalRef({
        tenantId: a.tenantId,
        appointmentId: a.id,
        blockedStartAt: a.blockedStartAt.toISOString(),
        blockedEndAt: a.blockedEndAt.toISOString(),
      }) === capacity[0].ref,
  );
  if (originals.length !== 1) return absent;
  const a = originals[0];
  if (
    a.staffId === null ||
    a.staffId !== outcome.staffId ||
    a.branchId !== outcome.branchId ||
    a.blockedStartAt! > outcome.startAt ||
    a.blockedEndAt! < outcome.endAt ||
    o.evidenceObservedAt > outcome.createdAt
  )
    return absent;
  if (!outcome.blockedStartAt || !outcome.blockedEndAt) return absent;
  const filled =
    outcome.status === 'confirmed' &&
    a.blockedStartAt!.getTime() === outcome.blockedStartAt.getTime() &&
    a.blockedEndAt!.getTime() === outcome.blockedEndAt.getTime();
  return {
    filled,
    attended:
      outcome.attendance === null
        ? null
        : filled && outcome.attendance === 'arrived',
    originalId: a.id,
    reason: 'exact_original_capacity_and_current_outcome',
  };
}

export function outcomeBaseMetrics(a: OutcomeAppointment): MeasurementMetric[] {
  return [
    outcomeMetric(
      'appointment_status',
      a.status,
      [0],
      'canonical_appointment',
      'COMPLETE',
      'status',
    ),
    outcomeMetric(
      'attendance',
      a.attendance,
      [0],
      'attendance_fact',
      a.attendance === null ? 'NOT_MEASURED' : 'COMPLETE',
      'status',
    ),
    outcomeMetric(
      'booked_value',
      a.totalPriceKopecks === null ? null : String(a.totalPriceKopecks),
      [0],
      'appointment_booked_value',
      a.totalPriceKopecks === null ? 'NOT_MEASURED' : 'COMPLETE',
      'money_minor',
      {},
      a.currency,
    ),
    outcomeMetric(
      'confirmed_cash',
      null,
      [0],
      'confirmed_cash',
      'NOT_MEASURED',
      'money_minor',
      {},
      a.currency,
    ),
    outcomeMetric(
      'confirmed_refunds',
      null,
      [0],
      'confirmed_refund',
      'NOT_MEASURED',
      'money_minor',
      {},
      a.currency,
    ),
  ];
}

export function outcomeQuery(i: NormalizedMeasurementIntent) {
  return {
    kind: i.kind,
    clientId: i.clientId,
    appointmentId: i.appointmentId,
    branchId: i.branchId,
    staffId: i.staffId,
    branchIds: i.scope.branchIds,
    periodFrom: i.periodFrom,
    periodTo: i.periodTo,
    asOf: i.asOf,
    timezone: i.timezone,
  };
}
