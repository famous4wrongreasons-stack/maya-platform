import {
  effectiveReminderSchedule as schedule,
  reminderChannelAllowed,
} from './appointment-reminder-policy';
import { normalizeReminderPlan } from '../communication-delivery/appointment-reminder.contract';
describe('B25 approved schedule V1', () => {
  it.each([
    undefined,
    {},
    { version: 1, overrides: {} },
    { version: 1, overrides: { reminder_hours: null } },
  ])('NULL/absent inherits both tenant occurrences (%j)', (p) =>
    expect(schedule(true, [1440, 120], p)).toEqual([1440, 120]),
  );
  it('explicit 6h replaces the full list', () =>
    expect(
      schedule(true, [1440, 120], { overrides: { reminder_hours: 6 } }),
    ).toEqual([360]));
  it.each([0, 49, -1, '6', 1.5])('invalid override %s is fail closed', (v) =>
    expect(
      schedule(true, [1440, 120], { overrides: { reminder_hours: v } }),
    ).toEqual([]),
  );
  it('client or tenant disabled cannot be enabled by hours', () => {
    expect(
      schedule(true, [1440, 120], { overrides: { reminder: false } }),
    ).toEqual([]);
    expect(
      schedule(false, [1440, 120], { overrides: { reminder_hours: 6 } }),
    ).toEqual([]);
  });
  it('at most four distinct tenant policy occurrences', () => {
    expect(schedule(true, [1440, 120, 60, 30], {})).toHaveLength(4);
    expect(schedule(true, [1440, 120, 90, 60, 30], {})).toEqual([]);
    expect(schedule(true, [120, 120], {})).toEqual([]);
  });
  it('quiet hours restrict delivery after identity', () => {
    expect(
      reminderChannelAllowed(
        { overrides: { quiet_from: 22, quiet_to: 8 } },
        'UTC',
        new Date('2026-09-06T23:00Z'),
      ),
    ).toBe(false);
  });
  it('metadata cannot override channel, Client or device snapshot', () => {
    const p = {
      version: 1,
      appointmentId: 'a',
      clientId: 'c',
      occurrence: 'o',
      scheduleHash: 's',
      leadMinutes: 120,
      linkId: null,
      endpointIds: ['e'],
      apnsDevices: [],
      issuedAt: '2026-09-06T10:00Z',
      expiresAt: '2026-09-06T12:00Z',
    };
    const n = {
      sourceEventId: 'appointment-reminder:o',
      channel: 'web_push',
      messageType: 'appointment_reminder',
      clientId: 'c',
      endpointIds: ['e'],
      expiresAt: p.expiresAt,
      reminderPlan: p,
    };
    expect(normalizeReminderPlan(n)).toEqual(p);
    for (const patch of [
      { clientId: 'other' },
      { endpointIds: ['other'] },
      { reminderPlan: { ...p, leadMinutes: 0 } },
      {
        reminderPlan: {
          ...p,
          endpointIds: Array.from({ length: 6 }, (_, i) => String(i)),
        },
      },
      { reminderPlan: { ...p, forged: true } },
    ])
      expect(() => normalizeReminderPlan({ ...n, ...patch })).toThrow();
  });
});
