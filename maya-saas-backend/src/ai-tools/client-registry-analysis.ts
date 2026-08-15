import type { CrmClientRegistrySnapshot } from '../crm/crm-adapter.interface';

const LOYAL_VISIT_THRESHOLD = 3;

export interface ClientInactivityBreakdown {
  over_1_month: number;
  over_2_months: number;
  over_3_months: number;
  over_4_months: number;
  over_5_months: number;
  over_6_months: number;
  over_1_year: number;
}

export interface ClientRegistryAnalysis {
  source: 'external_crm';
  provider: string;
  generated_at: string;
  as_of: string;
  complete: true;
  contains_personal_data: false;
  total_clients: number;
  clients_with_visits: number;
  clients_without_visits: number;
  clients_with_unknown_last_visit: number;
  loyal_clients_with_unknown_last_visit: number;
  repeat_clients: number;
  loyal_clients: number;
  total_recorded_visits: number;
  lifetime_sold_amount: number;
  inactivity: ClientInactivityBreakdown;
  loyal_inactivity: ClientInactivityBreakdown;
  loyal_reactivation_cohorts: {
    from_1_to_2_months: number;
    from_2_to_3_months: number;
    from_3_to_6_months: number;
    from_6_to_12_months: number;
    over_1_year: number;
  };
  definitions: {
    loyal_client: string;
    inactivity: string;
    without_visits: string;
  };
}

/**
 * Серверный расчёт по полному CRM-реестру.
 *
 * Пороги отсутствия накопительные: клиент, не бывший 7 месяцев,
 * входит в счётчики >1, >2, ... >6. Так один и тот же вопрос всегда даёт
 * одинаковый ответ независимо от модели.
 */
export function analyzeClientRegistry(
  snapshot: CrmClientRegistrySnapshot,
  asOf: string,
): ClientRegistryAnalysis {
  assertDateKey(asOf, 'asOf');
  const thresholds = {
    over_1_month: subtractCalendarMonths(asOf, 1),
    over_2_months: subtractCalendarMonths(asOf, 2),
    over_3_months: subtractCalendarMonths(asOf, 3),
    over_4_months: subtractCalendarMonths(asOf, 4),
    over_5_months: subtractCalendarMonths(asOf, 5),
    over_6_months: subtractCalendarMonths(asOf, 6),
    over_1_year: subtractCalendarMonths(asOf, 12),
  };
  const inactivity = emptyInactivityBreakdown();
  const loyalInactivity = emptyInactivityBreakdown();
  let clientsWithVisits = 0;
  let clientsWithoutVisits = 0;
  let clientsWithUnknownLastVisit = 0;
  let loyalClientsWithUnknownLastVisit = 0;
  let repeatClients = 0;
  let loyalClients = 0;
  let totalRecordedVisits = 0;
  let lifetimeSoldAmount = 0;

  for (const client of snapshot.clients) {
    const visits = nonNegativeInteger(client.visits_count);
    const isLoyal = visits >= LOYAL_VISIT_THRESHOLD;
    totalRecordedVisits += visits;
    lifetimeSoldAmount += nonNegativeNumber(client.sold_amount);
    if (visits === 0) {
      clientsWithoutVisits += 1;
    } else {
      clientsWithVisits += 1;
    }
    if (visits >= 2) {
      repeatClients += 1;
    }
    if (isLoyal) {
      loyalClients += 1;
    }

    if (!client.last_visit_date) {
      if (visits > 0) {
        clientsWithUnknownLastVisit += 1;
        if (isLoyal) {
          loyalClientsWithUnknownLastVisit += 1;
        }
      }
      continue;
    }
    assertDateKey(client.last_visit_date, 'last_visit_date');
    for (const [key, threshold] of Object.entries(thresholds)) {
      if (client.last_visit_date < threshold) {
        inactivity[key as keyof typeof inactivity] += 1;
        if (isLoyal) {
          loyalInactivity[key as keyof typeof loyalInactivity] += 1;
        }
      }
    }
  }

  const loyalReactivationCohorts = {
    from_1_to_2_months: cohortDelta(
      loyalInactivity.over_1_month,
      loyalInactivity.over_2_months,
    ),
    from_2_to_3_months: cohortDelta(
      loyalInactivity.over_2_months,
      loyalInactivity.over_3_months,
    ),
    from_3_to_6_months: cohortDelta(
      loyalInactivity.over_3_months,
      loyalInactivity.over_6_months,
    ),
    from_6_to_12_months: cohortDelta(
      loyalInactivity.over_6_months,
      loyalInactivity.over_1_year,
    ),
    over_1_year: loyalInactivity.over_1_year,
  };

  return {
    source: 'external_crm',
    provider: snapshot.provider,
    generated_at: snapshot.generated_at,
    as_of: asOf,
    complete: true,
    contains_personal_data: false,
    total_clients: snapshot.clients.length,
    clients_with_visits: clientsWithVisits,
    clients_without_visits: clientsWithoutVisits,
    clients_with_unknown_last_visit: clientsWithUnknownLastVisit,
    loyal_clients_with_unknown_last_visit: loyalClientsWithUnknownLastVisit,
    repeat_clients: repeatClients,
    loyal_clients: loyalClients,
    total_recorded_visits: totalRecordedVisits,
    lifetime_sold_amount: roundMoney(lifetimeSoldAmount),
    inactivity,
    loyal_inactivity: loyalInactivity,
    loyal_reactivation_cohorts: loyalReactivationCohorts,
    definitions: {
      loyal_client: `Не менее ${LOYAL_VISIT_THRESHOLD} визитов по карточке CRM.`,
      inactivity:
        'Накопительные группы: дата последнего визита раньше календарного порога; клиенты без визитов сюда не входят.',
      without_visits:
        'Отдельные CRM-карточки с нулевым числом визитов; их возраст по одной дате последнего визита определить нельзя.',
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

function cohortDelta(olderThanStart: number, olderThanEnd: number): number {
  return Math.max(0, olderThanStart - olderThanEnd);
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

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
