import { sourceInstantText } from './source-instant-text';

describe('source date presentation', () => {
  it('preserves the visible precision of a sub-minute period', () => {
    expect(sourceInstantText('2035-05-10T09:00:59.900Z')).toBe(
      '10.05.2035, 09:00:59,900',
    );
    expect(sourceInstantText('2035-05-10T09:01:00.000Z')).toBe(
      '10.05.2035, 09:01',
    );
  });
  it('distinguishes identical local times on opposite sides of a DST fold', () => {
    const first = sourceInstantText(
      '2026-11-01T05:30:00.000Z',
      'America/New_York',
    );
    const second = sourceInstantText(
      '2026-11-01T06:30:00.000Z',
      'America/New_York',
    );
    expect(first).toBe('01.11.2026, 01:30 GMT-4');
    expect(second).toBe('01.11.2026, 01:30 GMT-5');
  });
  it('preserves local seconds when an older timezone offset includes seconds', () => {
    expect(sourceInstantText('1900-01-01T00:00:00.000Z', 'Europe/Paris')).toBe(
      '01.01.1900, 00:09:21 GMT+0:09:21',
    );
  });
});
