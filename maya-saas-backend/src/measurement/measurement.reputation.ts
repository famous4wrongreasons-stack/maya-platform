import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import {
  measurementHash,
  measurementId,
  MeasurementMetric,
  MeasurementResult,
  NormalizedMeasurementIntent,
} from './measurement.contract';

export const REPUTATION_SCALE = 'stored_rating_1_5';
const MAX_SOURCES = 16;
type Period = 'current' | 'previous';
export type ReputationBucket = {
  source: string;
  period: Period;
  count: string;
  sum: string;
};
/** Bounded query result only: no review content, author data or individual IDs. */
export type ReputationObservation = {
  observedAt: Date;
  reviewUpdatedAt: Date | null;
  nativeUpdatedAt: Date | null;
  nativeVersionTotal: string;
  withdrawn: string;
  expired: string;
  invalidNative: string;
  invalidReview: string;
  buckets: ReputationBucket[];
};

function localParts(date: Date, timezone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
}
function monthStart(year: number, month: number, timezone: string): Date {
  const date = new Date(Date.UTC(year, month - 1, 1));
  const iso = date.toISOString().slice(0, 10);
  const result = localDateMinuteToUtc(iso, 0, timezone);
  const p = localParts(result, timezone);
  // A timezone transition which removes local midnight is not silently shifted.
  if (p.day !== 1 || p.hour !== 0 || p.minute !== 0 || p.second !== 0)
    throw new Error('measurement_reputation_month_boundary_unsupported');
  return result;
}

export function reputationPeriod(i: NormalizedMeasurementIntent): {
  previousFrom: Date;
  source: string | null;
  nativeOnly: boolean;
} {
  if (i.kind !== 'reputation_period')
    throw new Error('measurement_rule_not_enabled');
  const source = i.scope.dimensions.source ?? null;
  if (
    Object.keys(i.scope.dimensions).some(
      (k) => !['source', 'scale'].includes(k),
    ) ||
    Object.keys(i.scope.sourceQuery).length ||
    (i.scope.dimensions.scale &&
      i.scope.dimensions.scale !== REPUTATION_SCALE) ||
    (source !== null &&
      source !== 'native_feedback' &&
      !/^business_review\/[a-z][a-z0-9_.-]{0,39}$/.test(source)) ||
    i.configurationUserId ||
    ((i.clientId || i.appointmentId || i.staffId) &&
      source !== 'native_feedback')
  )
    throw new Error('measurement_scope_not_supported_by_rule');
  if (
    i.branchId &&
    i.scope.branchIds.length &&
    !i.scope.branchIds.includes(i.branchId)
  )
    throw new Error('measurement_branch_scope_conflict');
  const p = localParts(i.periodFrom, i.timezone);
  if (
    i.periodFrom.getTime() !==
      monthStart(p.year, p.month, i.timezone).getTime() ||
    i.periodTo.getTime() !==
      monthStart(p.year, p.month + 1, i.timezone).getTime() ||
    i.asOf < i.periodFrom
  )
    throw new Error('measurement_reputation_calendar_month_required');
  return {
    previousFrom: monthStart(p.year, p.month - 1, i.timezone),
    source,
    nativeOnly: source === 'native_feedback',
  };
}

/** Six decimal places, half away from zero; exact integer arithmetic throughout. */
function ratio(numerator: bigint, denominator: bigint): string | null {
  if (!denominator) return null;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scaled = (absolute * 1_000_000n + denominator / 2n) / denominator;
  const whole = scaled / 1_000_000n;
  const fraction = String(scaled % 1_000_000n)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${negative && scaled ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function reputationResult(
  tenantId: string,
  i: NormalizedMeasurementIntent,
  observation: ReputationObservation,
): MeasurementResult {
  const period = reputationPeriod(i);
  if (i.asOf > observation.observedAt)
    throw new Error('measurement_as_of_in_future');
  const nativeEnabled = !period.source || period.nativeOnly;
  const reviewEnabled = !period.nativeOnly;
  const names = new Set(observation.buckets.map((b) => b.source));
  if (nativeEnabled) names.add('native_feedback');
  if (period.source) names.add(period.source);
  if (names.size > MAX_SOURCES)
    throw new Error('measurement_reputation_source_bound_exceeded');
  const sources: MeasurementResult['sources'] = [];
  const sourceRefs = new Map<string, number>();
  if (reviewEnabled) {
    sourceRefs.set('review', sources.length);
    sources.push({
      owner: 'BusinessReview',
      kind: 'reputation_review_query',
      tenantId,
      id: measurementHash([
        'c7.reputation-review-query/1',
        tenantId,
        i,
        period.previousFrom,
      ]),
      stateHash: measurementHash({
        buckets: observation.buckets.filter(
          (b) => b.source !== 'native_feedback',
        ),
        updatedAt: observation.reviewUpdatedAt,
        invalid: observation.invalidReview,
      }),
      observedAt: observation.observedAt.toISOString(),
      qualification: 'SOURCE_LABELLED',
      coverage: 'stored_review_source_scale_1_5_no_author_link_v1',
    });
  }
  if (nativeEnabled) {
    sourceRefs.set('native', sources.length);
    sources.push({
      owner: 'NativeFeedbackRequest',
      kind: 'reputation_native_query',
      tenantId,
      id: measurementHash([
        'c7.reputation-native-query/1',
        tenantId,
        i,
        period.previousFrom,
      ]),
      stateHash: measurementHash({
        buckets: observation.buckets.filter(
          (b) => b.source === 'native_feedback',
        ),
        updatedAt: observation.nativeUpdatedAt,
        versionTotal: observation.nativeVersionTotal,
        withdrawn: observation.withdrawn,
        expired: observation.expired,
        invalid: observation.invalidNative,
      }),
      observedAt: observation.observedAt.toISOString(),
      qualification: 'VERIFIED',
      coverage: 'r08_latest_revision_exact_client_appointment_v1',
    });
  }
  const reasons = [
    'known_source_coverage_not_proven_complete',
    'observed_delta_is_not_causal_or_reputation_score',
  ];
  if (reviewEnabled)
    reasons.push(
      'legacy_reviews_have_no_verified_client_or_appointment_authority',
    );
  if (
    reviewEnabled &&
    !observation.buckets.some((b) => b.source !== 'native_feedback')
  )
    reasons.push('no_observed_business_review_sources');
  if (i.asOf < i.periodTo)
    reasons.push('partial_calendar_month_comparison_not_measured');
  if (
    (observation.reviewUpdatedAt && observation.reviewUpdatedAt > i.asOf) ||
    (observation.nativeUpdatedAt && observation.nativeUpdatedAt > i.asOf)
  )
    reasons.push('source_observed_after_business_cutoff');
  if (BigInt(observation.withdrawn))
    reasons.push('native_withdrawn_responses_excluded');
  if (BigInt(observation.expired))
    reasons.push('native_expired_or_erased_responses_excluded');
  if (BigInt(observation.invalidNative))
    reasons.push('native_unproved_current_revision_excluded');
  if (BigInt(observation.invalidReview))
    reasons.push('review_source_or_scale_unqualified_excluded');
  const metrics: MeasurementMetric[] = [];
  for (const source of [...names].sort()) {
    const native = source === 'native_feedback';
    if (
      (native && !nativeEnabled) ||
      (!native && !reviewEnabled) ||
      (period.source && source !== period.source)
    )
      throw new Error('measurement_reputation_query_scope_mismatch');
    if (!native && !/^business_review\/[a-z][a-z0-9_.-]{0,39}$/.test(source))
      throw new Error('measurement_reputation_source_invalid');
    const bucket = (name: Period) => {
      const rows = observation.buckets.filter(
        (b) => b.source === source && b.period === name,
      );
      if (rows.length > 1)
        throw new Error('measurement_reputation_duplicate_bucket');
      const count = BigInt(rows[0]?.count ?? '0'),
        sum = BigInt(rows[0]?.sum ?? '0');
      if (count < 0n || sum < count || sum > count * 5n)
        throw new Error('measurement_reputation_rating_invalid');
      return { count, sum };
    };
    const current = bucket('current'),
      previous = bucket('previous');
    const metric = (key: string, value: string | null, unit = 'count') =>
      metrics.push({
        key,
        value,
        unit,
        currency: null,
        dimensions: { source, scale: REPUTATION_SCALE },
        basis: native
          ? 'r08_current_rating_first_response_month'
          : 'stored_review_occurred_at_source_label',
        state: value === null ? 'NOT_MEASURED' : 'PARTIAL',
        sourceRefs: [sourceRefs.get(native ? 'native' : 'review')!],
      });
    for (const [prefix, value] of [
      ['', current],
      ['previous_', previous],
    ] as const) {
      metric(`${prefix}observed_review_count`, String(value.count));
      metric(`${prefix}rating_denominator`, String(value.count));
      metric(`${prefix}rating_sum`, String(value.sum), 'rating_points');
      metric(
        `${prefix}average_rating`,
        ratio(value.sum, value.count),
        'rating_points',
      );
    }
    const comparable = i.asOf >= i.periodTo;
    metric(
      'observed_count_delta',
      comparable ? String(current.count - previous.count) : null,
    );
    metric(
      'observed_average_delta',
      comparable && current.count && previous.count
        ? ratio(
            current.sum * previous.count - previous.sum * current.count,
            current.count * previous.count,
          )
        : null,
      'rating_points',
    );
    const hasDelta = comparable && current.count > 0n && previous.count > 0n;
    metric(
      'observed_average_delta_numerator',
      hasDelta
        ? String(current.sum * previous.count - previous.sum * current.count)
        : null,
      'rating_points',
    );
    metric(
      'observed_average_delta_denominator',
      hasDelta ? String(current.count * previous.count) : null,
    );
    metric('average_rounding', 'half_away_from_zero_6dp', 'rule');
    metric(
      'verified_client_author_count',
      native ? String(current.count) : null,
    );
    metric('verified_appointment_count', native ? String(current.count) : null);
  }
  return {
    sources,
    dependencies: [],
    metrics,
    reasons,
    completeness: 'PARTIAL',
    qualification: reviewEnabled ? 'SOURCE_LABELLED' : 'VERIFIED',
    attributionStatus: 'NOT_APPLICABLE',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
}

/** Pure read adapter. Existing AC4/R08 facts and their retention remain authoritative. */
@Injectable()
export class MeasurementReputationReader {
  async authorize(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    measurementId(tenantId);
    reputationPeriod(i);
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, defaultTimezone: true },
    });
    if (tenant?.status !== 'active')
      throw new Error('measurement_tenant_inactive');
    if (
      new Intl.DateTimeFormat('en', {
        timeZone: tenant.defaultTimezone,
      }).resolvedOptions().timeZone !== i.timezone
    )
      throw new Error('measurement_reputation_tenant_timezone_required');
    const branches = [
      ...new Set([...i.scope.branchIds, ...(i.branchId ? [i.branchId] : [])]),
    ];
    if (
      branches.length &&
      (await tx.branch.count({ where: { tenantId, id: { in: branches } } })) !==
        branches.length
    )
      throw new Error('measurement_branch_mismatch');
    if (i.clientId) {
      const client = await tx.client.findUnique({
        where: { id_tenantId: { id: i.clientId, tenantId } },
        select: { mergedIntoClientId: true },
      });
      if (!client || client.mergedIntoClientId)
        throw new Error('measurement_client_not_canonical');
    }
    if (
      i.staffId &&
      !(await tx.staff.findFirst({
        where: {
          id: i.staffId,
          tenantId,
          active: true,
          ...(i.branchId
            ? { branchId: i.branchId }
            : i.scope.branchIds.length
              ? { branchId: { in: i.scope.branchIds } }
              : {}),
        },
        select: { id: true },
      }))
    )
      throw new Error('measurement_staff_mismatch');
    if (
      i.appointmentId &&
      !(await tx.appointment.findFirst({
        where: {
          // Receipt scope survives a later canonical Client correction. Initial
          // admission checks the Client in MeasurementSources; publication fences
          // changed subjects before this reader can supply facts.
          id: i.appointmentId,
          tenantId,
          ...(i.branchId ? { branchId: i.branchId } : {}),
          ...(i.scope.branchIds.length
            ? { AND: [{ branchId: { in: i.scope.branchIds } }] }
            : {}),
          ...(i.staffId ? { staffId: i.staffId } : {}),
        },
        select: { id: true },
      }))
    )
      throw new Error('measurement_appointment_scope_mismatch');
  }

  async read(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    tx: Prisma.TransactionClient,
  ): Promise<MeasurementResult> {
    await this.authorize(tenantId, i, tx);
    const period = reputationPeriod(i);
    const [observation] = await tx.$queryRaw<
      ReputationObservation[]
    >(Prisma.sql`
      WITH observed AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) AS at),
      reviews AS MATERIALIZED (
        SELECT 'business_review/' || r.source AS source,
          CASE WHEN (r."occurredAt" AT TIME ZONE 'UTC')>=${i.periodFrom} THEN 'current' ELSE 'previous' END AS period,
          r.rating, (r."updatedAt" AT TIME ZONE 'UTC') AS "updatedAt",
          (r.source ~ '^[a-z][a-z0-9_.-]{0,39}$' AND r.rating BETWEEN 1 AND 5) AS valid
        FROM "BusinessReview" r WHERE r."tenantId"=${tenantId}
          AND ${!period.nativeOnly}::boolean
          AND (r."occurredAt" AT TIME ZONE 'UTC')>=${period.previousFrom}
          AND (r."occurredAt" AT TIME ZONE 'UTC')<${i.periodTo} AND (r."occurredAt" AT TIME ZONE 'UTC')<=${i.asOf}
          ${period.source && !period.nativeOnly ? Prisma.sql`AND r.source=${period.source.slice('business_review/'.length)}` : Prisma.empty}
          ${i.branchId ? Prisma.sql`AND r."branchId"=${i.branchId}` : Prisma.empty}
          ${i.scope.branchIds.length ? Prisma.sql`AND r."branchId" IN (${Prisma.join(i.scope.branchIds)})` : Prisma.empty}
      ), native AS MATERIALIZED (
        SELECT CASE WHEN first."createdAt">=${i.periodFrom} THEN 'current' ELSE 'previous' END AS period,
          latest.rating, q.state, q."latestResponseVersion" AS version,
          greatest(latest."createdAt", q."closedAt", q."payloadErasedAt", latest."payloadErasedAt") AS "updatedAt",
          (q."retentionUntil"<=observed.at OR q."payloadErasedAt" IS NOT NULL OR latest."payloadErasedAt" IS NOT NULL) AS expired,
          (latest.id IS NOT NULL AND first.kind='response' AND latest.kind='response' AND latest.rating BETWEEN 1 AND 5
            AND q.state='RESPONDED' AND a.id IS NOT NULL AND c.id IS NOT NULL AND c."mergedIntoClientId" IS NULL) AS valid
        FROM "NativeFeedbackRequest" q CROSS JOIN observed
        JOIN "NativeFeedbackRevision" first ON first."tenantId"=q."tenantId" AND first."requestId"=q.id AND first."clientId"=q."clientId" AND first.version=1
        LEFT JOIN "NativeFeedbackRevision" latest ON latest."tenantId"=q."tenantId" AND latest."requestId"=q.id
          AND latest."clientId"=q."clientId" AND latest.version=q."latestResponseVersion"
        LEFT JOIN "Appointment" a ON a.id=q."appointmentId" AND a."tenantId"=q."tenantId" AND a."mayaClientId"=q."clientId"
        LEFT JOIN "Client" c ON c.id=q."clientId" AND c."tenantId"=q."tenantId"
        WHERE q."tenantId"=${tenantId} AND ${!period.source || period.nativeOnly}::boolean
          AND first."createdAt">=${period.previousFrom} AND first."createdAt"<${i.periodTo} AND first."createdAt"<=${i.asOf}
          ${i.clientId ? Prisma.sql`AND q."clientId"=${i.clientId}` : Prisma.empty}
          ${i.appointmentId ? Prisma.sql`AND q."appointmentId"=${i.appointmentId}` : Prisma.empty}
          ${i.staffId ? Prisma.sql`AND a."staffId"=${i.staffId}` : Prisma.empty}
          ${i.branchId ? Prisma.sql`AND a."branchId"=${i.branchId}` : Prisma.empty}
          ${i.scope.branchIds.length ? Prisma.sql`AND a."branchId" IN (${Prisma.join(i.scope.branchIds)})` : Prisma.empty}
      ), buckets AS (
        SELECT source, period, count(*)::text AS count, sum(rating)::text AS sum FROM reviews WHERE valid GROUP BY source, period
        UNION ALL
        SELECT 'native_feedback', period, count(*)::text, sum(rating)::text FROM native WHERE valid AND NOT expired GROUP BY period
      ), bounded AS (SELECT * FROM buckets ORDER BY source, period LIMIT 34)
      SELECT observed.at AS "observedAt",
        (SELECT max("updatedAt") FROM reviews) AS "reviewUpdatedAt",
        (SELECT max("updatedAt") FROM native) AS "nativeUpdatedAt",
        (SELECT coalesce(sum(version),0)::text FROM native) AS "nativeVersionTotal",
        (SELECT count(*)::text FROM native WHERE state='WITHDRAWN') AS withdrawn,
        (SELECT count(*)::text FROM native WHERE expired) AS expired,
        (SELECT count(*)::text FROM native WHERE NOT coalesce(valid,false) AND state<>'WITHDRAWN' AND NOT expired) AS "invalidNative",
        (SELECT count(*)::text FROM reviews WHERE NOT valid) AS "invalidReview",
        coalesce((SELECT jsonb_agg(to_jsonb(bounded) ORDER BY source, period) FROM bounded),'[]'::jsonb) AS buckets
      FROM observed`);
    try {
      return reputationResult(tenantId, i, observation);
    } catch (error) {
      // A deterministic representational limit must close the admitted receipt.
      // Source/authority failures still propagate; no truncated result is usable.
      if (
        !(error instanceof Error) ||
        error.message !== 'measurement_reputation_source_bound_exceeded'
      )
        throw error;
      return {
        sources: [],
        dependencies: [],
        metrics: [],
        reasons: ['reputation_source_bound_exceeded'],
        completeness: 'UNAVAILABLE',
        qualification: 'UNQUALIFIED',
        attributionStatus: 'NOT_APPLICABLE',
        creditedExecutionId: null,
        creditedAttemptId: null,
      };
    }
  }
}
