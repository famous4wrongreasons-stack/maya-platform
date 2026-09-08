import {
  compareMeasurementPeriods,
  ComparablePeriodFact,
  measurementReadWindow,
  previousMeasurementMonthElapsed,
} from './measurement.period';

const fact = (
  from: string,
  to: string,
  value: string,
): ComparablePeriodFact => ({
  from: new Date(from),
  to: new Date(to),
  asOf: new Date('2026-10-01Z'),
  timezone: 'UTC',
  basis: 'confirmed_cash',
  currency: 'RUB',
  unit: 'money_minor',
  completeness: 'COMPLETE',
  coverageFrom: new Date(from),
  coverageTo: new Date(to),
  value,
});
describe('C7 P02 exact period comparability', () => {
  const current = () => fact('2026-09-01Z', '2026-09-09Z', '15000');
  const previous = () => fact('2026-08-01Z', '2026-08-09Z', '10000');
  it('compares complete equivalent elapsed windows with exact integer ratio evidence', () => {
    expect(compareMeasurementPeriods(current(), previous())).toMatchObject({
      comparable: true,
      delta: '5000',
      percent: '50.00',
      numerator: '5000',
      denominator: '10000',
    });
  });
  it.each([
    ['basis', { basis: 'booked_prices' }, 'comparison_basis_mismatch'],
    ['currency', { currency: 'EUR' }, 'comparison_currency_mismatch'],
    ['zone', { timezone: 'Europe/Moscow' }, 'comparison_timezone_mismatch'],
    ['unit', { unit: 'points' }, 'comparison_unit_mismatch'],
    ['partial', { completeness: 'PARTIAL' }, 'comparison_incomplete_window'],
    ['unknown', { value: null }, 'comparison_value_unavailable'],
    [
      'coverage',
      { coverageFrom: new Date('2026-09-02Z') },
      'comparison_incomplete_window',
    ],
    ['open', { asOf: new Date('2026-09-07Z') }, 'comparison_incomplete_window'],
  ])('refuses %s mismatch', (_name, change, reason) => {
    const result = compareMeasurementPeriods(
      { ...current(), ...change } as ComparablePeriodFact,
      previous(),
    );
    expect(result.comparable).toBe(false);
    expect(result.percent).toBeNull();
    expect(result.reasons).toContain(reason);
  });
  it('never compares current MTD to a full preceding month', () => {
    expect(
      compareMeasurementPeriods(
        current(),
        fact('2026-08-01Z', '2026-09-01Z', '100000'),
      ).comparable,
    ).toBe(false);
  });
  it('accepts two complete calendar months only under that explicit mode', () => {
    const a = fact('2026-09-01Z', '2026-10-01Z', '15000');
    const b = fact('2026-08-01Z', '2026-09-01Z', '10000');
    expect(compareMeasurementPeriods(a, b).comparable).toBe(false);
    expect(compareMeasurementPeriods(a, b, 'complete_months').percent).toBe(
      '50.00',
    );
  });
  it('keeps zero/negative baseline percent unknown and uses deterministic symmetric rounding', () => {
    expect(
      compareMeasurementPeriods(current(), { ...previous(), value: '0' }),
    ).toMatchObject({ comparable: true, percent: null });
    expect(
      compareMeasurementPeriods(
        { ...current(), value: '2' },
        { ...previous(), value: '3' },
      ).percent,
    ).toBe('-33.33');
    expect(
      compareMeasurementPeriods(
        { ...current(), value: '3' },
        { ...previous(), value: '2' },
      ).percent,
    ).toBe('50.00');
  });
  it('cannot compare malformed timestamps or money with missing currency', () => {
    expect(
      compareMeasurementPeriods(
        { ...current(), from: new Date('invalid') },
        previous(),
      ).comparable,
    ).toBe(false);
    expect(
      compareMeasurementPeriods(
        { ...current(), currency: null },
        { ...previous(), currency: null },
      ).comparable,
    ).toBe(false);
  });
  it('builds tenant-local half-open dates at UTC month boundary and refuses intraday finance windows', () => {
    const input = {
      periodFrom: new Date('2026-08-31T21:00Z'),
      periodTo: new Date('2026-09-30T21:00Z'),
      asOf: new Date('2026-09-08T12:30Z'),
      timezone: 'Europe/Moscow',
    };
    expect(measurementReadWindow(input)).toMatchObject({
      fromDay: '2026-09-01',
      toDay: '2026-09-08',
      wholeLocalDays: false,
      open: true,
    });
    expect(previousMeasurementMonthElapsed(input)).toEqual({
      from: new Date('2026-07-31T21:00Z'),
      to: new Date('2026-08-08T12:30Z'),
    });
    expect(
      measurementReadWindow({ ...input, asOf: new Date('2026-09-08T21:00Z') })
        .wholeLocalDays,
    ).toBe(true);
  });
  it('recognizes DST local days without assuming 24 elapsed hours', () => {
    const value = measurementReadWindow({
      periodFrom: new Date('2026-03-28T23:00Z'),
      periodTo: new Date('2026-03-29T22:00Z'),
      asOf: new Date('2026-04-01Z'),
      timezone: 'Europe/Berlin',
    });
    expect(value.wholeLocalDays).toBe(true);
    expect(value.fromDay).toBe('2026-03-29');
    expect(value.toDay).toBe('2026-03-29');
  });
});
