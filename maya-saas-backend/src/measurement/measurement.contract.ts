import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const MEASUREMENT_KINDS = [
  'appointment_outcome',
  'client_history',
  'business_period',
  'staff_goal',
  'reputation_period',
  'execution_funnel',
  'value_discrepancy',
] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];
export type Completeness =
  'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_MEASURED';
export type Qualification = 'VERIFIED' | 'SOURCE_LABELLED' | 'UNQUALIFIED';
export const MEASUREMENT_RETENTION_MS = 365 * 86_400_000;
export const MEASUREMENT_LEASE_MS = 60_000;
export type MeasurementScope = {
  version: 1;
  capabilityKey: string;
  branchIds: string[];
  dimensions: Record<string, string>;
  sourceQuery: Record<string, string>;
};
export type MeasurementIntent = {
  kind: MeasurementKind;
  clientId?: string | null;
  appointmentId?: string | null;
  staffId?: string | null;
  branchId?: string | null;
  configurationUserId?: string | null;
  periodFrom: Date;
  periodTo: Date;
  timezone: string;
  asOf: Date;
  scope: MeasurementScope;
};
export type NormalizedMeasurementIntent = Omit<
  MeasurementIntent,
  'clientId' | 'appointmentId' | 'staffId' | 'branchId' | 'configurationUserId'
> & {
  clientId: string | null;
  appointmentId: string | null;
  staffId: string | null;
  branchId: string | null;
  configurationUserId: string | null;
};
export const MEASUREMENT_SOURCE_KINDS: ReadonlyMap<string, readonly string[]> =
  new Map([
    [
      'Appointment',
      [
        'canonical_appointment',
        'canonical_history_query',
        'canonical_booked_period_query',
      ],
    ],
    ['CrmIntegration', ['financial_query_binding', 'value_query_binding']],
    ['CrmFinancialSummary', ['canonical_financial_query']],
    ['ClientLoyaltySnapshot', ['canonical_value_card_query']],
    ['Expense', ['canonical_expense_query']],
    ['ExpensePeriodDeclaration', ['canonical_declaration_query']],
    ['LoyaltyAccount', ['canonical_value_account']],
    ['LoyaltyTransaction', ['canonical_value_ledger_query']],
    ['CrmClientLink', ['canonical_value_binding']],
    ['BusinessReview', ['reputation_review_query']],
    ['NativeFeedbackRequest', ['reputation_native_query']],
  ]);
export type MeasurementSource = {
  owner: string;
  kind: string;
  tenantId: string;
  id: string;
  stateHash: string;
  observedAt: string;
  qualification: Qualification;
  coverage: string;
};
export type MeasurementMetric = {
  key: string;
  dimensions: Record<string, string>;
  unit: string;
  basis: string;
  currency: string | null;
  state: Completeness;
  value: string | boolean | null;
  sourceRefs: number[];
};
export type MeasurementResult = {
  sources: MeasurementSource[];
  dependencies: Array<{
    id: string;
    identityHash: string;
    snapshotHash: string;
    asOf: string;
    expiresAt: string;
  }>;
  metrics: MeasurementMetric[];
  reasons: string[];
  completeness: Completeness;
  qualification: Qualification;
  attributionStatus:
    'NOT_APPLICABLE' | 'UNATTRIBUTED' | 'AMBIGUOUS' | 'ATTRIBUTED';
  creditedExecutionId: string | null;
  creditedAttemptId: string | null;
};
export function measurementHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}
function canonical(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonical(v)]),
    );
  throw new Error('measurement_value_invalid');
}
const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
export function measurementId(value: unknown): string {
  if (typeof value !== 'string' || !OPAQUE.test(value))
    throw new Error('measurement_identity_invalid');
  return value;
}
function keys(value: object, allowed: string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    throw new Error('measurement_unapproved_field');
}
function map(value: unknown, allowed: string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('measurement_scope_invalid');
  keys(value, allowed);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, measurementId(v)]),
  );
}
export function normalizeMeasurement(
  input: MeasurementIntent,
): NormalizedMeasurementIntent {
  keys(input, [
    'kind',
    'clientId',
    'appointmentId',
    'staffId',
    'branchId',
    'configurationUserId',
    'periodFrom',
    'periodTo',
    'timezone',
    'asOf',
    'scope',
  ]);
  if (!MEASUREMENT_KINDS.includes(input.kind))
    throw new Error('measurement_kind_invalid');
  for (const d of [input.periodFrom, input.periodTo, input.asOf])
    if (!(d instanceof Date) || !Number.isFinite(d.getTime()))
      throw new Error('measurement_time_invalid');
  if (input.periodFrom >= input.periodTo)
    throw new Error('measurement_period_invalid');
  const timezone = new Intl.DateTimeFormat('en', {
    timeZone: input.timezone,
  }).resolvedOptions().timeZone;
  const ids = Object.fromEntries(
    [
      'clientId',
      'appointmentId',
      'staffId',
      'branchId',
      'configurationUserId',
    ].map((k) => {
      const v = input[k as keyof MeasurementIntent];
      return [k, v == null ? null : measurementId(v)];
    }),
  ) as Pick<
    NormalizedMeasurementIntent,
    | 'clientId'
    | 'appointmentId'
    | 'staffId'
    | 'branchId'
    | 'configurationUserId'
  >;
  if (
    (ids.appointmentId && !ids.clientId) ||
    (input.kind === 'appointment_outcome' &&
      (!ids.appointmentId || !ids.clientId)) ||
    (input.kind === 'client_history' && !ids.clientId) ||
    (input.kind === 'staff_goal' && (!ids.staffId || !ids.configurationUserId))
  )
    throw new Error('measurement_subject_required');
  const scope = input.scope;
  if (!scope || scope.version !== 1 || !Array.isArray(scope.branchIds))
    throw new Error('measurement_scope_invalid');
  keys(scope, [
    'version',
    'capabilityKey',
    'branchIds',
    'dimensions',
    'sourceQuery',
  ]);
  if (scope.branchIds.length > 100)
    throw new Error('measurement_scope_too_large');
  const normalized: MeasurementScope = {
    version: 1,
    capabilityKey: measurementId(scope.capabilityKey),
    branchIds: [...new Set(scope.branchIds.map(measurementId))].sort(),
    dimensions: map(scope.dimensions, [
      'serviceId',
      'source',
      'accountId',
      'currency',
      'scale',
    ]),
    sourceQuery: map(scope.sourceQuery, [
      'provider',
      'integrationId',
      'queryContract',
      'coverage',
    ]),
  };
  if (Buffer.byteLength(JSON.stringify(normalized)) > 16384)
    throw new Error('measurement_scope_too_large');
  return { ...input, ...ids, timezone, scope: normalized };
}
/** PostgreSQL canonical typed tuple, shared with the admission trigger.
 * This is NOT hashing caller JSON: all inputs have passed the closed normalizer. */
export function measurementIdentitySql(
  tenantId: string,
  i: NormalizedMeasurementIntent,
): Prisma.Sql {
  return Prisma.sql`SELECT encode(sha256(convert_to(jsonb_build_array('c7.measurement.identity/1',${tenantId}::text,${i.kind}::text,
    CASE WHEN ${i.kind}::text='appointment_outcome' THEN jsonb_build_array(${i.appointmentId}::text)
    ELSE jsonb_build_array(${i.clientId}::text,${i.staffId}::text,${i.configurationUserId}::text,${i.branchId}::text,
      ${BigInt(i.periodFrom.getTime())}::bigint,${BigInt(i.periodTo.getTime())}::bigint,${i.timezone}::text,${JSON.stringify(i.scope)}::jsonb) END)::text,'UTF8')),'hex') AS hash`;
}
export function measurementIntentHash(
  tenantId: string,
  i: NormalizedMeasurementIntent,
  requestKeyHash: string,
) {
  return measurementHash([
    'c7.measurement.intent/1',
    tenantId,
    i,
    requestKeyHash,
    1,
  ]);
}
export function validateMeasurementResult(
  result: MeasurementResult,
  tenantId: string,
): void {
  keys(result, [
    'sources',
    'dependencies',
    'metrics',
    'reasons',
    'completeness',
    'qualification',
    'attributionStatus',
    'creditedExecutionId',
    'creditedAttemptId',
  ]);
  if (
    !['NOT_APPLICABLE', 'UNATTRIBUTED', 'AMBIGUOUS', 'ATTRIBUTED'].includes(
      result.attributionStatus,
    )
  )
    throw new Error('measurement_attribution_invalid');
  const states: Completeness[] = [
    'COMPLETE',
    'PARTIAL',
    'UNAVAILABLE',
    'NOT_MEASURED',
  ];
  if (
    !states.includes(result.completeness) ||
    !['VERIFIED', 'SOURCE_LABELLED', 'UNQUALIFIED'].includes(
      result.qualification,
    )
  )
    throw new Error('measurement_result_invalid');
  if (
    result.sources.length + result.dependencies.length > 1000 ||
    result.metrics.length > 256 ||
    Buffer.byteLength(JSON.stringify(result)) > 262144
  )
    throw new Error('measurement_result_too_large');
  for (const s of result.sources) {
    keys(s, [
      'owner',
      'kind',
      'tenantId',
      'id',
      'stateHash',
      'observedAt',
      'qualification',
      'coverage',
    ]);
    if (
      !MEASUREMENT_SOURCE_KINDS.get(s.owner)?.includes(s.kind) ||
      !['VERIFIED', 'SOURCE_LABELLED', 'UNQUALIFIED'].includes(s.qualification)
    )
      throw new Error('measurement_source_contract_invalid');
    measurementId(s.coverage);
    if (
      s.tenantId !== tenantId ||
      !/^[a-f0-9]{64}$/.test(s.stateHash) ||
      !Number.isFinite(Date.parse(s.observedAt))
    )
      throw new Error('measurement_evidence_invalid');
    measurementId(s.id);
  }
  if (
    result.qualification === 'VERIFIED' &&
    result.sources.some((source) => source.qualification !== 'VERIFIED')
  )
    throw new Error('measurement_qualification_overstated');
  if (
    result.completeness === 'COMPLETE' &&
    result.metrics.some((metric) => metric.state !== 'COMPLETE')
  )
    throw new Error('measurement_completeness_overstated');
  for (const d of result.dependencies) {
    keys(d, ['id', 'identityHash', 'snapshotHash', 'asOf', 'expiresAt']);
    measurementId(d.id);
    if (
      !/^[a-f0-9]{64}$/.test(d.snapshotHash) ||
      !/^[a-f0-9]{64}$/.test(d.identityHash) ||
      !Number.isFinite(Date.parse(d.asOf)) ||
      !Number.isFinite(Date.parse(d.expiresAt))
    )
      throw new Error('measurement_dependency_invalid');
  }
  for (const reason of result.reasons) {
    if (!/^[a-z][a-z0-9_]{0,119}$/.test(reason))
      throw new Error('measurement_reason_invalid');
  }
  for (const m of result.metrics) {
    keys(m, [
      'key',
      'dimensions',
      'unit',
      'basis',
      'currency',
      'state',
      'value',
      'sourceRefs',
    ]);
    measurementId(m.key);
    measurementId(m.unit);
    measurementId(m.basis);
    if (
      m.value !== null &&
      typeof m.value !== 'string' &&
      typeof m.value !== 'boolean'
    )
      throw new Error('measurement_value_invalid');
    if (typeof m.value === 'string' && m.value.length > 240)
      throw new Error('measurement_value_too_large');
    map(m.dimensions, [
      'serviceId',
      'source',
      'accountId',
      'currency',
      'scale',
    ]);
    if (
      !states.includes(m.state) ||
      (['UNAVAILABLE', 'NOT_MEASURED'].includes(m.state) && m.value !== null)
    )
      throw new Error('measurement_unknown_is_not_zero');
    if (
      m.unit === 'money_minor' &&
      (m.currency === null ||
        !/^[A-Z]{3}$/.test(m.currency) ||
        (m.value !== null &&
          (typeof m.value !== 'string' ||
            !/^-?(0|[1-9][0-9]*)$/.test(m.value))))
    )
      throw new Error('measurement_money_invalid');
    if (
      m.sourceRefs.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= result.sources.length,
      )
    )
      throw new Error('measurement_metric_evidence_invalid');
  }
  if (
    (result.creditedExecutionId !== null ||
      result.creditedAttemptId !== null) &&
    (result.attributionStatus !== 'ATTRIBUTED' ||
      result.qualification !== 'VERIFIED' ||
      !result.creditedExecutionId ||
      !result.creditedAttemptId)
  )
    throw new Error('measurement_credit_invalid');
  if (
    result.attributionStatus === 'ATTRIBUTED' &&
    (!result.creditedExecutionId || !result.creditedAttemptId)
  )
    throw new Error('measurement_credit_evidence_required');
}

/** Canonicalize evidence sets while preserving each metric's exact reference relationships. */
export function normalizeMeasurementResult(
  result: MeasurementResult,
  tenantId: string,
): MeasurementResult {
  validateMeasurementResult(result, tenantId);
  const sources = result.sources
    .map((source, original) => ({
      source,
      original,
      hash: measurementHash(source),
    }))
    .sort((a, b) =>
      a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.original - b.original,
    );
  const indexes = new Map(
    sources.map((entry, index) => [entry.original, index]),
  );
  return {
    ...result,
    sources: sources.map((entry) => entry.source),
    dependencies: [...result.dependencies].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    metrics: result.metrics.map((metric) => ({
      ...metric,
      sourceRefs: [
        ...new Set(metric.sourceRefs.map((index) => indexes.get(index)!)),
      ].sort((a, b) => a - b),
    })),
    reasons: [...new Set(result.reasons)].sort(),
  };
}

/** Inputs are qualified by source readers; this selector never infers a link.
 * A caller-supplied phone/time association is explicitly ineligible. */
export function selectMeasurementAttribution(
  candidates: Array<{
    executionId: string;
    attemptId: string;
    lineage: 'exact_receipt' | 'time_only' | 'phone_only' | 'legacy_bridge';
    confirmed: boolean;
  }>,
): Pick<
  MeasurementResult,
  'attributionStatus' | 'creditedExecutionId' | 'creditedAttemptId'
> {
  const exact = new Map(
    candidates
      .filter((c) => c.lineage === 'exact_receipt' && c.confirmed)
      .map((c) => [`${c.executionId}/${c.attemptId}`, c]),
  );
  if (exact.size !== 1)
    return {
      attributionStatus: exact.size ? 'AMBIGUOUS' : 'UNATTRIBUTED',
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
  const [one] = exact.values();
  return {
    attributionStatus: 'ATTRIBUTED',
    creditedExecutionId: one.executionId,
    creditedAttemptId: one.attemptId,
  };
}
/** Historical revisions are snapshots, never separate credit ledger entries. */
export function currentMeasurementOutcomes<
  T extends { tenantId: string; identityHash: string; revision: number },
>(rows: T[]): T[] {
  const current = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.tenantId}/${row.identityHash}`;
    const prior = current.get(key);
    if (!prior || row.revision > prior.revision) current.set(key, row);
  }
  return [...current.values()].sort((a, b) =>
    `${a.tenantId}/${a.identityHash}`.localeCompare(
      `${b.tenantId}/${b.identityHash}`,
    ),
  );
}
