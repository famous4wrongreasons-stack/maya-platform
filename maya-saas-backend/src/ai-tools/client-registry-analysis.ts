import type { CrmClientRegistrySnapshot } from '../crm/crm-adapter.interface';
export interface ClientInactivityBreakdown {
  over_1_month: number;
  over_2_months: number;
  over_3_months: number;
  over_4_months: number;
  over_5_months: number;
  over_6_months: number;
  over_1_year: number;
}
export type ClientRegistryAnalysis = ReturnType<typeof analyzeClientRegistry>;
/** Source-labelled CRM aggregates only. Calendar reporting buckets never become a C8 dormancy or value rule. */
export function analyzeClientRegistry(
  snapshot: CrmClientRegistrySnapshot,
  asOf: string,
) {
  assertDateKey(asOf, 'asOf');
  const inactivity = emptyInactivityBreakdown();
  let visited = 0,
    without = 0,
    unknownVisits = 0,
    unknownDate = 0,
    repeat = 0,
    total = 0;
  for (const c of snapshot.clients) {
    const v =
      typeof c.visits_count === 'number' &&
      Number.isInteger(c.visits_count) &&
      c.visits_count >= 0
        ? c.visits_count
        : null;
    if (v === null) {
      unknownVisits++;
      continue;
    }
    total += v;
    if (v === 0) {
      without++;
      continue;
    }
    visited++;
    if (v >= 2) repeat++;
    if (!c.last_visit_date) {
      unknownDate++;
      continue;
    }
    assertDateKey(c.last_visit_date, 'last_visit_date');
    for (const months of [1, 2, 3, 4, 5, 6, 12])
      if (c.last_visit_date < subtractCalendarMonths(asOf, months))
        inactivity[
          (months === 12
            ? 'over_1_year'
            : 'over_' +
              months +
              '_month' +
              (months === 1 ? '' : 's')) as keyof ClientInactivityBreakdown
        ]++;
  }
  return {
    source: 'external_crm' as const,
    provider: snapshot.provider,
    generated_at: snapshot.generated_at,
    as_of: asOf,
    complete: snapshot.complete,
    contains_personal_data: false as const,
    total_clients: snapshot.clients.length,
    clients_with_visits: visited,
    clients_without_visits: without,
    clients_with_unknown_visit_count: unknownVisits,
    clients_with_unknown_last_visit: unknownDate,
    repeat_clients: repeat,
    total_recorded_visits: unknownVisits ? null : total,
    observed_recorded_visits: total,
    // Registry gives no qualified currency/basis for an aggregate value. Never manufacture CLV or add currencies.
    lifetime_sold_amount: null,
    loyal_clients: null,
    loyal_clients_with_unknown_last_visit: null,
    loyal_inactivity: null,
    loyal_reactivation_cohorts: null,
    inactivity,
    definitions: {
      loyal_client: 'Unavailable: canonical C8 policy/result required.',
      inactivity:
        'Provider-card calendar-date reporting buckets; not proven attendance or dormancy policy.',
      without_visits: 'Explicit zero visit counts only; unknown is separate.',
      money:
        'No qualified aggregate currency/basis; individual provider-labelled facts remain in permitted dossier.',
    },
  };
}
function emptyInactivityBreakdown(): ClientInactivityBreakdown {
  return {
    over_1_month: 0,
    over_2_months: 0,
    over_3_months: 0,
    over_4_months: 0,
    over_5_months: 0,
    over_6_months: 0,
    over_1_year: 0,
  };
}

function subtractCalendarMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const monthIndex = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const daysInMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0),
  ).getUTCDate();
  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(Math.min(day, daysInMonth)).padStart(2, '0'),
  ].join('-');
}

function assertDateKey(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`CRM client registry ${label} is invalid`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`CRM client registry ${label} is invalid`);
  }
}
