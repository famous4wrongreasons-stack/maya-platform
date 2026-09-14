import {
  DEFAULT_SALON_TIMEZONE,
  isUsableTimezone,
  resolveSalonTimezone,
} from './salon-timezone';

describe('resolveSalonTimezone', () => {
  it('prefers an explicit branch timezone', () => {
    // У сети салонов филиалы законно живут в разных поясах, и синхронизация с
    // одной компанией CRM не должна их перетирать.
    expect(
      resolveSalonTimezone({
        branchTimezone: 'Asia/Yekaterinburg',
        tenantTimezone: 'Europe/Moscow',
      }),
    ).toBe('Asia/Yekaterinburg');
  });

  it('falls back to the tenant timezone the CRM keeps in sync', () => {
    // 🔴 Главный случай: филиал заведён без явного пояса, CRM сообщила
    // настоящий. Раньше здесь молча возвращался московский, и настенное время
    // брони уезжало в CRM неверным.
    expect(
      resolveSalonTimezone({
        branchTimezone: null,
        tenantTimezone: 'Asia/Novosibirsk',
      }),
    ).toBe('Asia/Novosibirsk');
  });

  it('falls back to Moscow only when nothing is known', () => {
    expect(
      resolveSalonTimezone({ branchTimezone: null, tenantTimezone: null }),
    ).toBe(DEFAULT_SALON_TIMEZONE);
  });

  it('ignores a branch timezone that does not exist', () => {
    // Непригодное значение уступает следующему в очереди, а не превращает
    // каждый экран с датой в ошибку.
    expect(
      resolveSalonTimezone({
        branchTimezone: 'Mars/Olympus',
        tenantTimezone: 'Asia/Novosibirsk',
      }),
    ).toBe('Asia/Novosibirsk');
  });

  it('ignores blank values on both levels', () => {
    expect(
      resolveSalonTimezone({ branchTimezone: '   ', tenantTimezone: '' }),
    ).toBe(DEFAULT_SALON_TIMEZONE);
  });

  it('trims a padded but valid zone', () => {
    expect(resolveSalonTimezone({ branchTimezone: ' Asia/Omsk ' })).toBe(
      'Asia/Omsk',
    );
  });
});

describe('isUsableTimezone', () => {
  it('accepts real IANA zones', () => {
    expect(isUsableTimezone('Europe/Kaliningrad')).toBe(true);
    expect(isUsableTimezone('Asia/Vladivostok')).toBe(true);
  });

  it('rejects nonsense, blanks and non-strings', () => {
    expect(isUsableTimezone('Mars/Olympus')).toBe(false);
    expect(isUsableTimezone('')).toBe(false);
    expect(isUsableTimezone('   ')).toBe(false);
    expect(isUsableTimezone(null)).toBe(false);
    expect(isUsableTimezone(undefined)).toBe(false);
    expect(isUsableTimezone(42)).toBe(false);
  });
});
