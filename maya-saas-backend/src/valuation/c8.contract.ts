import { createHash } from 'node:crypto';
import { stableActionJson } from '../action-engine/action-engine.identity';

export const C8_RETENTION_MS = 365 * 86_400_000;
export const C8_LEASE_MS = 60_000;
export const C8_TARGETS = [
  'attended_return',
  'appointment_no_show',
  'client_expected_value',
  'business_revenue',
  'staff_earnings_conditional',
  'observed_booking_demand',
  'scheduled_utilization',
  'statistical_deviation',
] as const;
export type C8Target = (typeof C8_TARGETS)[number];
export const C8_KINDS = [
  'OBSERVED_VALUE',
  'POLICY_SIGNAL',
  'PREDICTION',
  'SCENARIO',
  'RANKING',
] as const;
export type C8Kind = (typeof C8_KINDS)[number];
export const C8_BASES = [
  'confirmed_cash',
  'confirmed_refunds',
  'confirmed_cash_net_linked_refunds',
  'booked_value',
  'provider_reported_gross',
  'observed_attended_count',
] as const;
export type C8Basis = (typeof C8_BASES)[number];
export const C8_SOURCE_OWNERS = [
  'Client',
  'Appointment',
  'Staff',
  'Branch',
  'CrmClientLink',
  'DomainEvent',
  'MeasurementRevision',
  'TenantBusinessConfigurationRevision',
  'C8ResultRevision',
  'C8ModelVersion',
  'C8EvaluationRevision',
] as const;
export type C8SourceOwner = (typeof C8_SOURCE_OWNERS)[number];
export type C8Json =
  null | string | number | boolean | C8Json[] | { [key: string]: C8Json };
export type C8Object = { [key: string]: C8Json };
export type C8Ref = {
  owner: C8SourceOwner;
  tenantId: string;
  id: string;
  revisionOrStateHash: string;
  observedAt: string;
  asOf: string;
  qualification: 'VERIFIED' | 'SOURCE_LABELLED' | 'UNQUALIFIED';
  coverage: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_MEASURED';
  expiresAt?: string;
};
export type C8Feature = {
  key: string;
  value: string | null;
  unit: string;
  basis: string;
  currency: string | null;
  sourceRefs: C8Ref[];
};
export const C8_FEATURE_KEYS = [
  ...C8_BASES,
  'last_proven_visit_at',
  'observed_frequency',
  'observed_cancellations',
  'observed_no_shows',
  'scheduled_start_at',
  'scheduled_end_at',
  'source_history_coverage',
  'confirmed_staff_salary_accrued',
  'observed_booking_created_count',
  'occupied_minutes',
  'available_minutes',
] as const;
export function c8Object(
  value: unknown,
  keys: readonly string[],
  required: readonly string[] = keys,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    required.some((k) => !Object.prototype.hasOwnProperty.call(value, k))
  )
    throw new Error('c8_closed_contract_required');
  return value as Record<string, unknown>;
}
export function c8Id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_:./-]{1,240}$/.test(value))
    throw new Error('c8_canonical_identity_required');
  return value;
}
export function c8Digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error('c8_digest_required');
  return value;
}
export function c8Instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('c8_canonical_utc_required');
  return value;
}
export function c8Normalize(value: unknown): C8Json {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new Error('c8_bounded_array_required');
    return value.map(c8Normalize);
  }
  if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const result: C8Object = {};
    for (const key of Object.keys(value).sort()) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('c8_invalid_key');
      const normalizedKey = key.normalize('NFC');
      if (Object.prototype.hasOwnProperty.call(result, normalizedKey))
        throw new Error('c8_normalized_key_collision');
      result[normalizedKey] = c8Normalize(
        (value as Record<string, unknown>)[key],
      );
    }
    return result;
  }
  throw new Error('c8_canonical_json_required');
}
export const c8Hash = (value: unknown) =>
  createHash('sha256')
    .update(stableActionJson(c8Normalize(value)))
    .digest('hex');
export function c8Ref(value: unknown, tenantId: string, t0: Date): C8Ref {
  const r = c8Object(
    value,
    [
      'owner',
      'tenantId',
      'id',
      'revisionOrStateHash',
      'observedAt',
      'asOf',
      'qualification',
      'coverage',
      'expiresAt',
    ],
    [
      'owner',
      'tenantId',
      'id',
      'revisionOrStateHash',
      'observedAt',
      'asOf',
      'qualification',
      'coverage',
    ],
  );
  if (
    !C8_SOURCE_OWNERS.includes(r.owner as C8SourceOwner) ||
    r.tenantId !== tenantId
  )
    throw new Error('c8_reference_scope_mismatch');
  c8Id(r.id);
  c8Digest(r.revisionOrStateHash);
  for (const k of ['observedAt', 'asOf'])
    if (Date.parse(c8Instant(r[k])) > t0.getTime())
      throw new Error('c8_future_input_forbidden');
  if (
    r.expiresAt !== undefined &&
    Date.parse(c8Instant(r.expiresAt)) <= t0.getTime()
  )
    throw new Error('c8_source_expired');
  if (
    !['VERIFIED', 'SOURCE_LABELLED', 'UNQUALIFIED'].includes(
      String(r.qualification),
    ) ||
    !['COMPLETE', 'PARTIAL', 'UNAVAILABLE', 'NOT_MEASURED'].includes(
      String(r.coverage),
    )
  )
    throw new Error('c8_reference_qualification_required');
  return c8Normalize(r) as unknown as C8Ref;
}
export function c8Features(
  value: unknown,
  tenantId: string,
  t0: Date,
): C8Feature[] {
  if (!Array.isArray(value) || value.length > 256)
    throw new Error('c8_feature_limit');
  const seen = new Set<string>();
  return value
    .map((item) => {
      const f = c8Object(item, [
        'key',
        'value',
        'unit',
        'basis',
        'currency',
        'sourceRefs',
      ]);
      if (
        !C8_FEATURE_KEYS.includes(f.key as (typeof C8_FEATURE_KEYS)[number]) ||
        seen.has(String(f.key))
      )
        throw new Error('c8_feature_not_allowlisted');
      seen.add(String(f.key));
      if (f.value !== null) {
        if (
          f.key === 'last_proven_visit_at' ||
          f.key === 'scheduled_start_at' ||
          f.key === 'scheduled_end_at'
        ) {
          c8Instant(f.value);
          if (
            f.key === 'last_proven_visit_at' &&
            Date.parse(c8Instant(f.value)) > t0.getTime()
          )
            throw new Error('c8_future_visit_feature');
        } else if (
          typeof f.value !== 'string' ||
          !/^(-?(0|[1-9]\d*)(\.\d*[1-9])?)$/.test(f.value) ||
          f.value === '-0'
        )
          throw new Error('c8_decimal_string_required');
      }
      if (!Array.isArray(f.sourceRefs) || f.sourceRefs.length > 5000)
        throw new Error('c8_feature_sources_required');
      const refs = f.sourceRefs.map((r) => c8Ref(r, tenantId, t0));
      if (f.value !== null && !refs.length)
        throw new Error('c8_value_without_evidence');
      if (
        ![
          'money_minor',
          'count',
          'minutes',
          'instant',
          'ratio',
          'status',
        ].includes(String(f.unit))
      )
        throw new Error('c8_feature_unit');
      if (
        f.currency !== null &&
        (typeof f.currency !== 'string' || !/^[A-Z]{3}$/.test(f.currency))
      )
        throw new Error('c8_currency_required');
      if (f.unit === 'money_minor' && f.currency === null)
        throw new Error('c8_money_currency_required');
      return { ...f, sourceRefs: refs } as C8Feature;
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
