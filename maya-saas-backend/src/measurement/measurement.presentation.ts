import { compareMeasurementPeriods } from './measurement.period';
import type { MeasurementRevision } from '@prisma/client';
import {
  MeasurementIntent,
  MeasurementResult,
  MeasurementMetric,
  normalizeMeasurementResult,
} from './measurement.contract';

/** Same normalized facts for HTTP, report and AI; formatting never computes money or credit. */
export function presentMeasurement(
  tenantId: string,
  intent: MeasurementIntent,
  raw: MeasurementResult,
  receipt: Pick<
    MeasurementRevision,
    'id' | 'snapshotHash' | 'revision' | 'expiresAt'
  > | null = null,
) {
  const result = normalizeMeasurementResult(raw, tenantId);
  return {
    contract: 'c7.measurement.read/1' as const,
    mode: receipt ? ('as_reported' as const) : ('live' as const),
    revisionId: receipt?.id ?? null,
    snapshotHash: receipt?.snapshotHash ?? null,
    revision: receipt?.revision ?? null,
    expiresAt: receipt?.expiresAt.toISOString() ?? null,
    kind: intent.kind,
    subject: {
      clientId: intent.clientId ?? null,
      appointmentId: intent.appointmentId ?? null,
      staffId: intent.staffId ?? null,
      branchId: intent.branchId ?? null,
    },
    rule: { key: `c7.${intent.kind.replaceAll('_', '-')}`, version: 1 },
    asOf: intent.asOf.toISOString(),
    period: {
      from: intent.periodFrom.toISOString(),
      toExclusive: intent.periodTo.toISOString(),
      timezone: intent.timezone,
    },
    completeness: result.completeness,
    qualification: result.qualification,
    attribution: result.attributionStatus,
    metrics: result.metrics.map(
      ({ key, dimensions, unit, basis, currency, state, value }) => ({
        key,
        dimensions: { ...dimensions },
        unit,
        basis,
        currency,
        state,
        value,
      }),
    ),
    limitations: [...result.reasons],
  };
}
export type MeasurementPresentation = ReturnType<typeof presentMeasurement>;

/** No evidence, source IDs, contacts, arbitrary labels or execution input enter a prompt. */
export function measurementForAi(
  value: MeasurementPresentation,
): MeasurementPresentation {
  const groups = new Map<string, string>();
  const sourceLabel = (source: string) => {
    if (source === 'native_feedback') return source;
    if (!groups.has(source))
      groups.set(source, `source_group_${groups.size + 1}`);
    return groups.get(source)!;
  };
  return {
    ...value,
    subject: {
      clientId: null,
      appointmentId: null,
      staffId: null,
      branchId: null,
    },
    metrics: value.metrics
      .filter((metric) => metric.unit !== 'label')
      .map((metric) => ({
        ...metric,
        dimensions: Object.fromEntries(
          Object.entries(metric.dimensions).flatMap(([key, dimension]) => {
            if (key === 'source') return [[key, sourceLabel(dimension)]];
            if (key === 'scale' && dimension === 'stored_rating_1_5')
              return [[key, dimension]];
            if (key === 'period' && ['current', 'previous'].includes(dimension))
              return [[key, dimension]];
            return [];
          }),
        ),
      })),
  };
}

/** Conversion for existing numeric displays only; never default missing/currency to zero/RUB. */
export function measurementMoney(value: MeasurementPresentation, key: string) {
  return value.metrics
    .filter(
      (m) =>
        m.key === key &&
        m.unit === 'money_minor' &&
        m.value !== null &&
        m.state !== 'NOT_MEASURED' &&
        m.state !== 'UNAVAILABLE',
    )
    .flatMap((m) => {
      const amount = Number(m.value);
      return typeof m.value === 'string' &&
        /^-?(0|[1-9][0-9]*)$/.test(m.value) &&
        Number.isSafeInteger(amount) &&
        m.currency &&
        /^[A-Z]{3}$/.test(m.currency)
        ? [{ currency: m.currency, amount_kopecks: amount }]
        : [];
    });
}

export function resultFromRevision(
  row: MeasurementRevision,
): MeasurementResult {
  const refs = row.evidenceRefsJson as unknown as {
    sources: MeasurementResult['sources'];
    dependencies: MeasurementResult['dependencies'];
  };
  const values = row.valuesJson as unknown as { metrics: MeasurementMetric[] };
  const limitations = row.limitationsJson as unknown as { reasons: string[] };
  return normalizeMeasurementResult(
    {
      sources: refs.sources,
      dependencies: refs.dependencies,
      metrics: values.metrics,
      reasons: limitations.reasons,
      completeness: row.completeness as MeasurementResult['completeness'],
      qualification: row.qualification as MeasurementResult['qualification'],
      attributionStatus:
        row.attributionStatus as MeasurementResult['attributionStatus'],
      creditedExecutionId: row.creditedExecutionId,
      creditedAttemptId: row.creditedAttemptId,
    },
    row.tenantId,
  );
}

/** Compare the typed facts, never a consumer's scalar/label without currency or coverage. */
export function comparePresentedMeasurements(
  current: MeasurementPresentation,
  previous: MeasurementPresentation,
) {
  const facts = (
    view: MeasurementPresentation,
    metric: MeasurementPresentation['metrics'][number],
  ) => ({
    from: new Date(view.period.from),
    to: new Date(view.period.toExclusive),
    asOf: new Date(view.asOf),
    coverageFrom: new Date(view.period.from),
    coverageTo: new Date(view.period.toExclusive),
    timezone: view.period.timezone,
    basis: metric.basis,
    currency: metric.currency,
    unit: metric.unit,
    completeness: metric.state,
    value: typeof metric.value === 'string' ? metric.value : null,
  });
  return current.metrics.flatMap((metric) => {
    const prior = previous.metrics.filter(
      (m) =>
        m.key === metric.key &&
        JSON.stringify(Object.entries(m.dimensions).sort()) ===
          JSON.stringify(Object.entries(metric.dimensions).sort()),
    );
    if (prior.length !== 1) return [];
    const a = facts(current, metric),
      b = facts(previous, prior[0]);
    const elapsed = compareMeasurementPeriods(a, b);
    const comparison =
      elapsed.reasons.length === 1 &&
      elapsed.reasons[0] === 'comparison_elapsed_interval_mismatch'
        ? compareMeasurementPeriods(a, b, 'complete_months')
        : elapsed;
    return [
      {
        key: metric.key,
        dimensions: metric.dimensions,
        currency: metric.currency,
        basis: metric.basis,
        ...comparison,
      },
    ];
  });
}

/** Display-only fallback when the language model is unavailable; no new calculation. */
export function measurementText(view: MeasurementPresentation): string {
  const labels: Record<string, string> = {
    observed_booked_value: 'Стоимость записанных услуг',
    provider_reported_gross:
      'Оборот операций по данным CRM (не подтверждённая касса)',
    confirmed_cash: 'Подтверждённые поступления',
    confirmed_refunds: 'Подтверждённые возвраты',
    confirmed_salary_accrued: 'Подтверждённые начисления зарплаты',
    observed_expenses: 'Учтённые расходы',
    net_profit: 'Чистая прибыль',
  };
  const lines: string[] = [];
  for (const metric of view.metrics) {
    const label = labels[metric.key];
    if (!label) continue;
    const amount = measurementMoney(
      { ...view, metrics: [metric] },
      metric.key,
    )[0];
    lines.push(
      `${label}: ${amount ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: amount.currency }).format(amount.amount_kopecks / 100) : 'не измерено'}.`,
    );
  }
  if (!lines.length)
    lines.push('Денежные показатели за этот период не измерены.');
  if (!measurementMoney(view, 'net_profit').length)
    lines.push(
      'Чистую прибыль не подтверждаю: нужны подтверждённые поступления, возвраты и полная сопоставимая база расходов. Неизвестное не принимается за ноль.',
    );
  if (view.completeness !== 'COMPLETE')
    lines.push(
      'Данные неполные: доступные значения сохраняют своё основание и не заменяют недостающие факты.',
    );
  lines.push(`Состояние данных: ${view.asOf}.`);
  return lines.join(' ');
}
