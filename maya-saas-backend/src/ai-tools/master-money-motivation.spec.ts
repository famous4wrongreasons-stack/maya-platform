import {
  computePeriodMoneyMotivation,
  type MotivationVisit,
} from './master-money-motivation';

function visit(
  partial: Partial<MotivationVisit> & {
    grossRub: number;
    startAt: string;
  },
): MotivationVisit {
  return {
    clientId: partial.clientId ?? 'c1',
    startAt: new Date(partial.startAt),
    status: partial.status ?? 'confirmed',
    grossRub: partial.grossRub,
    services: partial.services ?? [
      { title: 'Мужская стрижка', priceRub: partial.grossRub },
    ],
  };
}

describe('computePeriodMoneyMotivation', () => {
  it('uses top-40% historical checks like legacy _today_earn_from_records', () => {
    const history = [
      visit({ startAt: '2026-06-01T10:00:00Z', grossRub: 3000 }),
      visit({ startAt: '2026-06-02T10:00:00Z', grossRub: 2800 }),
      visit({ startAt: '2026-06-03T10:00:00Z', grossRub: 2000 }),
      visit({ startAt: '2026-06-04T10:00:00Z', grossRub: 1800 }),
      visit({ startAt: '2026-06-05T10:00:00Z', grossRub: 1500 }),
    ];
    // top 40% of 5 = 2 → (3000+2800)/2 = 2900
    const result = computePeriodMoneyMotivation({
      periodVisits: [
        visit({ startAt: '2026-07-01T10:00:00Z', grossRub: 2000 }),
        visit({ startAt: '2026-07-01T12:00:00Z', grossRub: 2000 }),
      ],
      historyVisits: history,
      earnedRub: 2000, // 50% of 4000 booked
    });
    expect(result.target_check_rub).toBe(2900);
    expect(result.visits).toBe(2);
    expect(result.potential_rub).toBe(Math.round(2 * 2900 * 0.5));
    expect(result.upside_rub).toBe(result.potential_rub - 2000);
    expect(result.method).toBe('historical_top_check');
  });

  it('never puts potential below earned', () => {
    const result = computePeriodMoneyMotivation({
      periodVisits: [
        visit({ startAt: '2026-07-01T10:00:00Z', grossRub: 5000 }),
      ],
      historyVisits: [
        visit({ startAt: '2026-06-01T10:00:00Z', grossRub: 1000 }),
      ],
      earnedRub: 4000,
    });
    expect(result.potential_rub).toBeGreaterThanOrEqual(4000);
  });
});
