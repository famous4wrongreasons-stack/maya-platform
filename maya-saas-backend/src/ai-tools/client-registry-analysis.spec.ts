import type { CrmClientRegistrySnapshot } from '../crm/crm-adapter.interface';
import { analyzeClientRegistry } from './client-registry-analysis';

describe('analyzeClientRegistry', () => {
  it('calculates exact cumulative inactivity and loyalty cohorts for the full CRM registry', () => {
    const snapshot: CrmClientRegistrySnapshot = {
      provider: 'yclients',
      generated_at: '2026-08-12T09:00:00.000Z',
      complete: true,
      clients: [
        client('never-visited', 0, 0, null),
        client('new', 1, 1_800, '2026-08-01'),
        client('one-month', 2, 3_600, '2026-07-11'),
        client('two-months', 3, 5_400, '2026-06-11'),
        client('five-months', 6, 12_000, '2026-03-11'),
        client('one-year', 12, 30_000, '2025-08-11'),
        client('unknown-last-visit', 4, 8_000, null),
      ],
    };

    const result = analyzeClientRegistry(snapshot, '2026-08-12');

    expect(result).toEqual({
      source: 'external_crm',
      provider: 'yclients',
      generated_at: '2026-08-12T09:00:00.000Z',
      as_of: '2026-08-12',
      complete: true,
      contains_personal_data: false,
      total_clients: 7,
      clients_with_visits: 6,
      clients_without_visits: 1,
      clients_with_unknown_last_visit: 1,
      loyal_clients_with_unknown_last_visit: 1,
      repeat_clients: 5,
      loyal_clients: 4,
      total_recorded_visits: 28,
      lifetime_sold_amount: 60_800,
      inactivity: {
        over_1_month: 4,
        over_2_months: 3,
        over_3_months: 2,
        over_4_months: 2,
        over_5_months: 2,
        over_6_months: 1,
        over_1_year: 1,
      },
      loyal_inactivity: {
        over_1_month: 3,
        over_2_months: 3,
        over_3_months: 2,
        over_4_months: 2,
        over_5_months: 2,
        over_6_months: 1,
        over_1_year: 1,
      },
      loyal_reactivation_cohorts: {
        from_1_to_2_months: 0,
        from_2_to_3_months: 1,
        from_3_to_6_months: 1,
        from_6_to_12_months: 0,
        over_1_year: 1,
      },
      definitions: {
        loyal_client: 'Не менее 3 визитов по карточке CRM.',
        inactivity:
          'Накопительные группы: дата последнего визита раньше календарного порога; клиенты без визитов сюда не входят.',
        without_visits:
          'Отдельные CRM-карточки с нулевым числом визитов; их возраст по одной дате последнего визита определить нельзя.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('never-visited');
    expect(JSON.stringify(result)).not.toContain('one-year');
  });

  it('uses calendar-month boundaries and excludes the boundary day itself', () => {
    const snapshot: CrmClientRegistrySnapshot = {
      provider: 'yclients',
      generated_at: '2024-03-31T09:00:00.000Z',
      complete: true,
      clients: [
        client('boundary', 1, 100, '2024-02-29'),
        client('older', 1, 100, '2024-02-28'),
      ],
    };

    expect(analyzeClientRegistry(snapshot, '2024-03-31').inactivity).toEqual({
      over_1_month: 1,
      over_2_months: 0,
      over_3_months: 0,
      over_4_months: 0,
      over_5_months: 0,
      over_6_months: 0,
      over_1_year: 0,
    });
  });
});

function client(
  external_id: string,
  visits_count: number,
  sold_amount: number,
  last_visit_date: string | null,
): CrmClientRegistrySnapshot['clients'][number] {
  return { external_id, visits_count, sold_amount, last_visit_date };
}
