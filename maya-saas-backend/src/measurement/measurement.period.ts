import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import type { Completeness } from './measurement.contract';

/** All C7 windows are half-open. Provider inclusive day labels are adapters only. */
export function measurementLocalDay(at: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function measurementReadWindow(input: {
  periodFrom: Date;
  periodTo: Date;
  asOf: Date;
  timezone: string;
}) {
  const from = new Date(input.periodFrom);
  const to = new Date(Math.min(input.periodTo.getTime(), input.asOf.getTime()));
  const nonempty = from < to;
  const fromDay = measurementLocalDay(from, input.timezone);
  const toDay = measurementLocalDay(new Date(to.getTime() - 1), input.timezone);
  const wholeLocalDays =
    nonempty &&
    localDateMinuteToUtc(fromDay, 0, input.timezone).getTime() ===
      from.getTime() &&
    localDateMinuteToUtc(
      measurementLocalDay(to, input.timezone),
      0,
      input.timezone,
    ).getTime() === to.getTime();
  return {
    from,
    to,
    fromDay,
    toDay,
    nonempty,
    wholeLocalDays,
    open: input.asOf < input.periodTo,
  };
}

export type ComparablePeriodFact = {
  from: Date;
  to: Date;
  asOf: Date;
  timezone: string;
  basis: string;
  currency: string | null;
  unit: string;
  completeness: Completeness;
  coverageFrom: Date;
  coverageTo: Date;
  value: string | null;
};

/** Complete calendar months may differ in duration; elapsed windows may not.
 * Caller intent is not proof: coverage must equal each exact measured window.
 */
export function compareMeasurementPeriods(
  current: ComparablePeriodFact,
  previous: ComparablePeriodFact,
  mode: 'equal_elapsed' | 'complete_months' = 'equal_elapsed',
) {
  const reasons: string[] = [];
  if (mode !== 'equal_elapsed' && mode !== 'complete_months')
    reasons.push('comparison_mode_invalid');
  if (current.basis !== previous.basis)
    reasons.push('comparison_basis_mismatch');
  if (current.currency !== previous.currency)
    reasons.push('comparison_currency_mismatch');
  if (current.timezone !== previous.timezone)
    reasons.push('comparison_timezone_mismatch');
  if (current.unit !== previous.unit) reasons.push('comparison_unit_mismatch');
  for (const fact of [current, previous]) {
    if (
      [fact.from, fact.to, fact.asOf, fact.coverageFrom, fact.coverageTo].some(
        (d) => !Number.isFinite(d.getTime()),
      )
    )
      reasons.push('comparison_time_invalid');
    if (
      !fact.basis ||
      fact.basis === 'unavailable' ||
      (fact.unit === 'money_minor' &&
        (!fact.currency || !/^[A-Z]{3}$/.test(fact.currency)))
    )
      reasons.push('comparison_money_basis_unavailable');
    try {
      new Intl.DateTimeFormat('en', { timeZone: fact.timezone });
    } catch {
      reasons.push('comparison_timezone_invalid');
    }
    if (
      fact.completeness !== 'COMPLETE' ||
      fact.from >= fact.to ||
      fact.coverageFrom.getTime() !== fact.from.getTime() ||
      fact.coverageTo.getTime() !== fact.to.getTime() ||
      fact.asOf < fact.to
    )
      reasons.push('comparison_incomplete_window');
    if (fact.value === null || !/^-?(0|[1-9][0-9]*)$/.test(fact.value))
      reasons.push('comparison_value_unavailable');
  }
  if (previous.to > current.from) reasons.push('comparison_windows_overlap');
  if (mode === 'equal_elapsed') {
    if (
      current.to.getTime() - current.from.getTime() !==
      previous.to.getTime() - previous.from.getTime()
    )
      reasons.push('comparison_elapsed_interval_mismatch');
  } else if (
    reasons.length === 0 &&
    ![current, previous].every(isCompleteCalendarMonth)
  ) {
    reasons.push('comparison_not_complete_calendar_months');
  }
  if (reasons.length)
    return {
      comparable: false,
      delta: null,
      percent: null,
      numerator: null,
      denominator: null,
      rounding: 'half_away_from_zero_2dp',
      reasons: [...new Set(reasons)].sort(),
    };
  const baseline = BigInt(previous.value!);
  const delta = BigInt(current.value!) - baseline;
  if (baseline <= 0n)
    return {
      comparable: true,
      delta: String(delta),
      percent: null,
      numerator: String(delta),
      denominator: String(baseline),
      rounding: 'half_away_from_zero_2dp',
      reasons: ['comparison_nonpositive_baseline'],
    };
  const magnitude = (abs(delta) * 10000n + baseline / 2n) / baseline;
  return {
    comparable: true,
    delta: String(delta),
    percent: `${delta < 0n && magnitude ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`,
    numerator: String(delta),
    denominator: String(baseline),
    rounding: 'half_away_from_zero_2dp',
    reasons: [],
  };
}
const abs = (n: bigint) => (n < 0n ? -n : n);
function isCompleteCalendarMonth(fact: ComparablePeriodFact): boolean {
  const day = measurementLocalDay(fact.from, fact.timezone);
  if (
    !day.endsWith('-01') ||
    localDateMinuteToUtc(day, 0, fact.timezone).getTime() !==
      fact.from.getTime()
  )
    return false;
  const [year, month] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return (
    localDateMinuteToUtc(next, 0, fact.timezone).getTime() === fact.to.getTime()
  );
}

/** Equivalent elapsed MTD bounds, clipped only by refusing an overlong prior month. */
export function previousMeasurementMonthElapsed(input: {
  periodFrom: Date;
  periodTo: Date;
  asOf: Date;
  timezone: string;
}): { from: Date; to: Date } | null {
  const window = measurementReadWindow(input);
  if (
    !window.nonempty ||
    !window.fromDay.endsWith('-01') ||
    localDateMinuteToUtc(window.fromDay, 0, input.timezone).getTime() !==
      window.from.getTime()
  )
    return null;
  const [year, month] = window.fromDay.split('-').map(Number);
  const priorDay = new Date(Date.UTC(year, month - 2, 1))
    .toISOString()
    .slice(0, 10);
  const from = localDateMinuteToUtc(priorDay, 0, input.timezone);
  const to = new Date(
    from.getTime() + window.to.getTime() - window.from.getTime(),
  );
  return to <= window.from ? { from, to } : null;
}
