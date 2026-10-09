import { lifecycleStatement } from './c9.lifecycle-presentation';
import type { C9Object } from './c9.contract';

function fact(): C9Object {
  return {
    kind: 'POLICY_SIGNAL',
    current: true,
    available: true,
    qualification: 'VERIFIED',
    completeness: 'PARTIAL',
    asOf: '2035-05-09T00:00:00.000Z',
    rule: { key: 'c8.dormancy/cadence', version: 1, parameters: parameters() },
    values: [{ key: 'cadence', value: false }],
  };
}
function parameters(): C9Object {
  return {
    elapsed: { unit: 'day', count: 30 },
    comparison: 'gte',
    evidence: 'proven_attendance',
    minimumCoverage: 'PARTIAL',
    serviceScope: { restricted: false, count: 0 },
    timezone: 'Europe/Moscow',
  };
}
describe('finite Lifecycle rule explanation from exact C8 projection', () => {
  it('explains the threshold and inclusive boundary without turning a false signal into an active client or a forecast', () => {
    const text = lifecycleStatement(fact());
    expect(text).toContain('30 дней');
    expect(text).toContain('последнего подтверждённого посещения');
    expect(text).toContain('включительно');
    expect(text).toContain('не выполнено');
    expect(text).toContain('Исходные данные неполные');
    expect(text).not.toMatch(/активен|вернётся|вероятность|скидк|c8\.dormancy/);
  });

  it('does not invent or borrow parameters when an older result has only rule identity', () => {
    const current = fact();
    current.rule = { key: 'c8.dormancy/cadence', version: 1 };
    const text = lifecycleStatement(current);
    expect(text).toContain(
      'Параметры этого правила в доступной проекции не подтверждены',
    );
    expect(text).not.toContain('30 дней');
    expect(text).toContain('не выполнено');
  });

  it.each([
    { elapsed: { unit: 'week', count: 30 } },
    { elapsed: { unit: ['day'], count: 30 } },
    { elapsed: { unit: [['day']], count: 30 } },
    { elapsed: { unit: 'day', count: -1 } },
    { comparison: 'lt' },
    { comparison: ['gt'] },
    { comparison: [['gt']] },
    { minimumCoverage: ['COMPLETE'] },
    { minimumCoverage: [['COMPLETE']] },
    { evidence: 'unconfirmed_booking' },
    { serviceScope: { restricted: false, count: 2 } },
    { timezone: 'PRIVATE_INVALID_TIMEZONE' },
    { note: 'PRIVATE_CLIENT_LABEL' },
  ])(
    'withholds malformed or unapproved rule parameters without echoing extra content: %j',
    (change) => {
      const current = fact();
      current.rule = {
        key: 'c8.dormancy/cadence',
        version: 1,
        parameters: { ...parameters(), ...change },
      };
      const text = lifecycleStatement(current);
      expect(text).toContain(
        'Параметры этого правила в доступной проекции не подтверждены',
      );
      expect(text).not.toMatch(/30 дней|PRIVATE_/);
    },
  );

  it('does not interpret a future rule version with the current algorithm', () => {
    const current = fact();
    current.rule = {
      key: 'c8.dormancy/cadence',
      version: 2,
      parameters: parameters(),
    };
    expect(lifecycleStatement(current)).not.toContain('30 дней');
  });

  it.each(['current', 'available'])(
    'never exposes rule parameters when %s is false',
    (key) => {
      const current = fact();
      current[key] = false;
      const text = lifecycleStatement(current);
      expect(text).toContain('недоступна');
      expect(text).not.toMatch(/30 дней|выполнено/);
    },
  );
});
