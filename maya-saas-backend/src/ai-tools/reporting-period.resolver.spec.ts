import { ReportingPeriodResolver } from './reporting-period.resolver';
import { REPORTING_PERIOD_CORPUS } from './reporting-period.corpus';

const NOW = new Date('2026-08-07T09:00:00.000Z');

describe('ReportingPeriodResolver', () => {
  describe('корпус владельца', () => {
    it.each(REPORTING_PERIOD_CORPUS)(
      '$id → $expect.period',
      ({ text, previous, expect: expected }) => {
        const resolved = ReportingPeriodResolver.resolve(
          text,
          previous ?? '',
          NOW,
        );
        expect(resolved.args).toEqual(expected);
      },
    );
  });

  it('день важнее месяца: «7 августа» не становится августом', () => {
    const resolved = ReportingPeriodResolver.resolve(
      'Дай отчет за 7 августа',
      '',
      NOW,
    );
    expect(resolved.args.period).toBe('named_day');
    expect(resolved.args).not.toHaveProperty('month');
    expect(resolved.label_ru).toBe('7 августа 2026');
  });

  it('harden перебивает неправильный period модели', () => {
    const hardened = ReportingPeriodResolver.hardenToolArguments(
      'analytics.business.query',
      {
        period: 'named_month',
        month: '2026-08',
        comparison: 'none',
      },
      'Дай отчет за 7 августа',
      '',
      NOW,
    );
    expect(hardened).toEqual({
      period: 'named_day',
      day: '2026-08-07',
      comparison: 'none',
    });
    expect(hardened).not.toHaveProperty('month');
  });

  it('label для усечённого месяца', () => {
    expect(
      ReportingPeriodResolver.labelRu(
        { period: 'named_month', month: '2026-08' },
        { truncatedToToday: true },
      ),
    ).toBe('август 2026 по сегодня');
  });
});
