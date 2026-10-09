import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { financialPeriodRequests } from './finance-period-binding';
import { ReportingPeriodResolver } from './reporting-period.resolver';

const now = new Date('2026-10-09T12:00:00.000Z');
function plan(
  intent = 'finance.revenue',
  entities: Record<string, unknown> = { period: 'previous_year' },
) {
  return new ConversationIntelligenceService().validatePlan(
    {
      tasks: [{ intent, entities, confidence: 1 }],
    },
    UserRole.TENANT_OWNER,
    ['analytics.business.query'],
  );
}
describe('finite current and previous financial period binding', () => {
  it('retains the full previous calendar year through a short follow-up', () => {
    expect(
      financialPeriodRequests(plan(), 'А прошлый?', 'Europe/Moscow', now),
    ).toEqual([
      {
        period: 'named_range',
        from_day: '2025-01-01',
        to_day: '2025-12-31',
        comparison: 'none',
      },
    ]);
  });
  it('uses the canonical local calendar owner at year rollover', () => {
    const instant = new Date('2026-12-31T22:00:00Z');
    expect(
      ReportingPeriodResolver.semanticPeriod(
        'previous_year',
        instant,
        'Europe/Moscow',
      ),
    ).toMatchObject({ from_day: '2026-01-01' });
    expect(
      ReportingPeriodResolver.semanticPeriod('previous_year', instant, 'UTC'),
    ).toMatchObject({ from_day: '2025-01-01' });
  });
  it('keeps a fresh explicit day above an inherited model month', () => {
    expect(
      financialPeriodRequests(
        plan('finance.revenue', { period: '2026-08' }),
        'Выручка за 7 августа',
        'UTC',
        now,
      ),
    ).toEqual([{ period: 'named_day', day: '2026-08-07', comparison: 'none' }]);
  });
  it.each([
    ['year_to_date', 'previous_year'],
    ['week_to_date', 'last_week'],
  ])(
    'binds %s and %s as exactly two explicit READs with no guessed previous equal window',
    (period, comparison_period) => {
      const result = financialPeriodRequests(
        plan('finance.compare_periods', {
          period,
          comparison_period,
          metric: 'revenue',
        }),
        'Сравни эти два периода',
        'Europe/Moscow',
        now,
      );
      expect(result).toHaveLength(2);
      expect(result?.[0]).toEqual({ period, comparison: 'none' });
      expect(result?.[1]).toEqual({
        ...ReportingPeriodResolver.semanticPeriod(
          comparison_period,
          now,
          'Europe/Moscow',
        ),
        comparison: 'none',
      });
    },
  );
  it('rejects a fresh explicit period conflicting with the inherited pair', () => {
    expect(
      financialPeriodRequests(
        plan('finance.compare_periods', {
          period: 'year_to_date',
          comparison_period: 'previous_year',
          metric: 'revenue',
        }),
        'Сравни выручку за 7 августа',
        'UTC',
        now,
      ),
    ).toBeNull();
  });
  it.each([
    { period: ['last_week'] },
    { period: 'invented' },
    { period: '2026-02-30' },
    { period: '2026-13' },
    { period: 'today', branch: 'private-branch' },
    { period: 'today', metric: 'profit' },
  ])(
    'does not coerce unsupported scope to the default month: %j',
    (entities) => {
      expect(
        financialPeriodRequests(
          plan('finance.revenue', entities),
          'А прошлый?',
          'UTC',
          now,
        ),
      ).toBeNull();
    },
  );
  it('does not broaden denied, unresolved, compound or same-period requests', () => {
    const value = plan();
    if (!value) throw new Error('plan unavailable');
    value.tasks[0].permission.status = 'denied';
    expect(financialPeriodRequests(value, '', 'UTC', now)).toBeNull();
    value.tasks[0].permission.status = 'allowed';
    value.context.unresolved_references = ['branch'];
    expect(financialPeriodRequests(value, '', 'UTC', now)).toBeNull();
    value.context.unresolved_references = [];
    value.tasks.push({ ...value.tasks[0], id: 'second' });
    expect(financialPeriodRequests(value, '', 'UTC', now)).toBeNull();
    expect(
      financialPeriodRequests(
        plan('finance.compare_periods', {
          period: 'today',
          comparison_period: 'today',
        }),
        '',
        'UTC',
        now,
      ),
    ).toBeNull();
    expect(financialPeriodRequests(null, '', 'UTC', now)).toBeNull();
  });
});
