import { sourceInstantText } from '../common/source-instant-text';
import {
  validateMeasurementResult,
  type MeasurementResult,
} from '../measurement/measurement.contract';
import {
  comparePresentedMeasurements,
  measurementMoney,
  measurementTextParts,
  type MeasurementPresentation,
} from '../measurement/measurement.presentation';

export type FinancePeriodReply = {
  reply: string;
  /** Qualified projection, not an assertion that cash is measured or complete. */
  status: 'verified' | 'blocked';
};
const blocked = (): FinancePeriodReply => ({
  reply:
    'Не удалось подтвердить источник и точный период выручки. Неизвестную сумму не считаю нулём.',
  status: 'blocked',
});
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
function instant(value: unknown): number | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z')
    ? date.getTime()
    : null;
}
function parse(value: unknown, stale: boolean) {
  const result = record(value),
    view = record(result?.measurement),
    period = record(view?.period),
    resolved = record(result?.resolved_period),
    rule = record(view?.rule),
    subject = record(view?.subject);
  if (
    stale ||
    result?.stale === true ||
    view?.stale === true ||
    !view ||
    !period ||
    !resolved ||
    !rule ||
    !subject ||
    view.contract !== 'c7.measurement.read/1' ||
    view.mode !== 'live' ||
    view.kind !== 'business_period' ||
    rule.key !== 'c7.business-period' ||
    rule.version !== 1 ||
    ['revisionId', 'snapshotHash', 'revision', 'expiresAt'].some(
      (key) => view[key] !== null,
    ) ||
    ['clientId', 'appointmentId', 'staffId', 'branchId'].some(
      (key) => subject[key] !== null,
    ) ||
    Object.keys(subject).length !== 4 ||
    view.attribution !== 'NOT_APPLICABLE' ||
    !Array.isArray(view.metrics) ||
    view.metrics.length > 256 ||
    !Array.isArray(view.limitations) ||
    typeof period.timezone !== 'string' ||
    period.timezone.length > 100 ||
    !period.timezone ||
    typeof resolved.label_ru !== 'string' ||
    resolved.label_ru.length > 140 ||
    !resolved.label_ru.trim() ||
    !/^[\p{L}\p{N} .,():–—/-]+$/u.test(resolved.label_ru)
  )
    return null;
  const from = instant(period.from),
    to = instant(period.toExclusive),
    asOf = instant(view.asOf),
    resolvedFrom = instant(resolved.from),
    resolvedTo = instant(resolved.to);
  if (
    from === null ||
    to === null ||
    asOf === null ||
    resolvedFrom !== from ||
    resolvedTo === null ||
    resolvedTo + 1 !== to ||
    from >= to ||
    asOf < from ||
    // Reporting endpoints are inclusive; C7 adds exactly one millisecond.
    // A later window cannot be fully observed at this source cutoff.
    to > asOf + 1
  )
    return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: period.timezone });
    // The READ projection has deliberately stripped source references. Validate
    // its remaining canonical metric contract; this is not source authorization.
    const metrics = view.metrics.map((raw) => {
      const m = record(raw);
      if (!m) throw new Error('invalid_metric');
      return { ...m, sourceRefs: [] };
    });
    const canonical = {
      sources: [],
      dependencies: [],
      metrics,
      reasons: view.limitations,
      completeness: view.completeness,
      qualification: view.qualification,
      attributionStatus: view.attribution,
      creditedExecutionId: null,
      creditedAttemptId: null,
    } as unknown as MeasurementResult;
    // The canonical validator accepts its declared contract, not unknown. This
    // cast only crosses that boundary; no fields are consumed before it passes.
    validateMeasurementResult(canonical, 'presentation');
    const cash = canonical.metrics.filter((m) => m.key === 'confirmed_cash');
    if (
      cash.length > 8 ||
      cash.some(
        (m) =>
          Object.keys(m.dimensions).length !== 0 ||
          m.basis !== 'confirmed_cash' ||
          !(
            m.unit === 'money_minor' ||
            (m.unit === 'status' &&
              m.currency === null &&
              m.value === null &&
              ['NOT_MEASURED', 'UNAVAILABLE'].includes(m.state))
          ),
      )
    )
      return null;
    if (new Set(cash.map((m) => m.currency)).size !== cash.length) return null;
    const presentation = view as unknown as MeasurementPresentation;
    const cashView: MeasurementPresentation = {
      ...presentation,
      metrics: cash.map((m) => ({
        key: m.key,
        dimensions: m.dimensions,
        unit: m.unit,
        basis: m.basis,
        currency: m.currency,
        state: m.state,
        value: m.value,
      })),
    };
    if (
      cash.some(
        (m) =>
          m.value !== null &&
          (m.state === 'NOT_MEASURED' || m.state === 'UNAVAILABLE'),
      ) ||
      cash.some(
        (m) =>
          m.value !== null &&
          measurementMoney({ ...cashView, metrics: [m] }, 'confirmed_cash')
            .length !== 1,
      )
    )
      return null;
    const coverage = [
      'observed_period_from',
      'observed_period_to_exclusive',
    ].map((key) => canonical.metrics.filter((m) => m.key === key));
    if (coverage.some((rows) => rows.length > 1)) return null;
    const coverageExact = coverage.every(
      (rows, index) =>
        rows.length === 1 &&
        rows[0].unit === 'instant' &&
        rows[0].basis === 'canonical_half_open_window' &&
        rows[0].state === 'COMPLETE' &&
        instant(rows[0].value) === (index === 0 ? from : to),
    );
    return { view: cashView, label: resolved.label_ru, coverageExact };
  } catch {
    return null;
  }
}
function describe(parsed: NonNullable<ReturnType<typeof parse>>): string {
  const { view, label, coverageExact } = parsed;
  const measured =
    view.qualification === 'VERIFIED'
      ? measurementMoney(view, 'confirmed_cash')
      : [];
  const amounts = measured.length
    ? measurementTextParts({
        ...view,
        metrics: view.metrics.filter((m) => m.value !== null),
      }).metrics
    : [
        'Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём.',
      ];
  const incomplete =
    view.completeness !== 'COMPLETE' ||
    view.metrics.length === 0 ||
    view.metrics.some((m) => m.state !== 'COMPLETE') ||
    !coverageExact ||
    view.qualification !== 'VERIFIED';
  return [
    `Фактический период источника: ${label}. Текущие измерения по всему бизнесу.`,
    `${sourceInstantText(view.period.from, view.period.timezone)} — ${sourceInstantText(view.period.toExclusive, view.period.timezone)} (конец не включён; ${view.period.timezone}).`,
    ...amounts,
    ...(measured.length && measured.length !== view.metrics.length
      ? ['Часть денежных показателей не измерена; их не считаю нулём.']
      : []),
    ...(incomplete
      ? [
          'Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части.',
        ]
      : []),
    `Данные на ${sourceInstantText(view.asOf)} (UTC).`,
  ].join(' ');
}

/** Only a current, already-authorized analytics.business.query result. No requested scope is accepted. */
export function financePeriodReply(
  value: unknown,
  stale = false,
): FinancePeriodReply {
  const parsed = parse(value, stale);
  return parsed ? { reply: describe(parsed), status: 'verified' } : blocked();
}

/** Two exact READ results; all arithmetic and comparability remain owned by C7. */
export function financeComparisonReply(
  currentValue: unknown,
  previousValue: unknown,
): FinancePeriodReply {
  const current = parse(currentValue, false),
    previous = parse(previousValue, false);
  const parts = [
    `Текущий период: ${current ? describe(current) : blocked().reply}`,
    `Предыдущий период: ${previous ? describe(previous) : blocked().reply}`,
  ];
  const refuse = (): FinancePeriodReply => ({
    reply: [
      ...parts,
      'Количественное сравнение не подтверждено: окна, валюты или полнота измерений несопоставимы. Причина изменения выручки не установлена.',
    ].join('\n'),
    status: 'blocked',
  });
  if (
    !current ||
    !previous ||
    !current.coverageExact ||
    !previous.coverageExact ||
    [current, previous].some(
      (p) =>
        p.view.completeness !== 'COMPLETE' ||
        p.view.qualification !== 'VERIFIED',
    ) ||
    current.view.metrics.length !== 1 ||
    previous.view.metrics.length !== 1
  )
    return refuse();
  const compared = comparePresentedMeasurements(current.view, previous.view);
  if (
    compared.length !== 1 ||
    !compared[0].comparable ||
    compared[0].delta === null
  )
    return refuse();
  // Display the comparator's exact minor units. Never independently calculate or
  // reinterpret them as booked revenue, rubles, profit, uplift or causal effect.
  const comparison = compared[0];
  return {
    reply: [
      ...parts,
      `Разница подтверждённых поступлений: ${comparison.delta} минимальных денежных единиц валюты ${comparison.currency}.`,
      comparison.percent === null
        ? 'Процентное изменение не определено при неположительной базе.'
        : `Изменение: ${comparison.percent}%.`,
      'Причина изменения выручки не установлена.',
    ].join('\n'),
    status: 'verified',
  };
}
