import { BadRequestException } from '@nestjs/common';

import {
  appointmentInstantForProvider,
  canonicalAppointmentInstant,
} from './appointment-time.utils';

describe('appointment time contract', () => {
  it('treats a naive value as salon wall-clock time', () => {
    expect(
      canonicalAppointmentInstant('2026-08-23T12:00:00', 'Europe/Moscow'),
    ).toBe('2026-08-23T09:00:00.000Z');
  });

  it('preserves an already canonical instant', () => {
    expect(
      canonicalAppointmentInstant('2026-08-23T09:00:00.000Z', 'Europe/Moscow'),
    ).toBe('2026-08-23T09:00:00.000Z');
  });

  it('converts a canonical instant to the provider wall-clock format', () => {
    expect(
      appointmentInstantForProvider(
        '2026-08-23T09:00:00.000Z',
        'Europe/Moscow',
      ),
    ).toBe('2026-08-23T12:00:00');
  });

  it('uses the tenant timezone instead of a fixed UTC offset', () => {
    expect(
      canonicalAppointmentInstant('2026-07-05T12:00:00', 'Europe/Berlin'),
    ).toBe('2026-07-05T10:00:00.000Z');
  });

  it('rejects a wall-clock value in a DST gap', () => {
    expect(() =>
      canonicalAppointmentInstant('2026-03-29T02:30:00', 'Europe/Berlin'),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid timezones and datetimes', () => {
    expect(() =>
      canonicalAppointmentInstant('2026-08-23T12:00:00', 'Mars/Olympus'),
    ).toThrow(BadRequestException);
    expect(() =>
      canonicalAppointmentInstant('2026-02-30T12:00:00', 'Europe/Moscow'),
    ).toThrow(BadRequestException);
  });
});
