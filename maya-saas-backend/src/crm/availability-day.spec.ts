import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityCalendarService } from './availability-calendar.service';
import {
  canonicalAppointmentInstant,
  nextAppointmentDay,
} from './appointment-time.utils';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { presentBookingSelector } from '../widgets/booking/booking-selector.presenter';

const cases = [
  ['UTC', '2026-10-01T23:59:59Z', '2026-10-02'],
  ['Europe/Moscow', '2026-10-01T21:30:00Z', '2026-10-03'],
  ['America/Los_Angeles', '2026-01-01T02:00:00Z', '2026-01-01'],
  ['Pacific/Kiritimati', '2026-12-31T12:00:00Z', '2027-01-02'],
  ['Asia/Kathmandu', '2026-01-31T20:00:00Z', '2026-02-02'],
  ['UTC', '2028-02-28T12:00:00Z', '2028-02-29'],
  ['UTC', '2028-02-29T12:00:00Z', '2028-03-01'],
  // Adding 24 elapsed hours would skip a day (spring) or repeat it (autumn).
  ['America/New_York', '2026-03-08T04:30:00Z', '2026-03-08'],
  ['America/New_York', '2026-11-01T04:30:00Z', '2026-11-02'],
  ['Europe/Berlin', '2026-10-24T22:30:00Z', '2026-10-26'],
] as const;

describe('L5/L24 canonical one-day availability', () => {
  it.each(cases)(
    'L5-CALENDAR %s at %s selects local calendar %s',
    (timezone, now, date) => {
      expect(nextAppointmentDay(new Date(now), timezone)).toBe(date);
    },
  );

  it.each(cases)(
    'L24-PROJECTION preserves the exact instant in %s at %s',
    (timezone, now, date) => {
      const instant = canonicalAppointmentInstant(`${date}T10:00:00`, timezone);
      const end = new Date(Date.parse(instant) + 1800000).toISOString();
      const result = presentBookingSelector({
        tenantId: 'tenant',
        kind: 'TIME_SLOT_SELECTOR',
        source: {
          timezone,
          local_date: nextAppointmentDay(new Date(now), timezone),
          slots: [{ start: instant, end }],
        },
        inherited: { staff: 'staff-handle', service: 'service-handle' },
        mint: () => 'slot-handle',
      });
      expect(result?.body).toMatchObject({
        timezone,
        more_intent: null,
        widen_window_intent: null,
        groups: [
          {
            slots: [
              {
                slot_ref: 'slot-handle',
                start: {
                  value: instant,
                  formatted: expect.stringContaining(
                    `10:00 (${timezone})`,
                  ) as unknown,
                },
              },
            ],
          },
        ],
      });
    },
  );

  it.each(['Europe/Moscow', null])(
    'L5-OWNER resolves selected branch first, tenant fallback (%s)',
    async (branchTimezone) => {
      const context = new TenantContextService();
      const prisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultTimezone: 'America/Los_Angeles',
            calendarSource: 'internal',
          }),
        },
        internalProvider: {
          findFirst: jest.fn().mockResolvedValue({
            branch: { id: 'branch', timezone: branchTimezone },
          }),
        },
      };
      const owner = new AvailabilityCalendarService(
        prisma as unknown as PrismaService,
        context,
      );
      const result = await context.runAsAuthPrincipal(
        { tenantId: 'tenant', userId: 'user', role: 'client' },
        () =>
          owner.nextAvailabilityDay(
            'tenant',
            'staff',
            new Date('2026-01-01T02:00:00Z'),
          ),
      );
      expect(result).toEqual({
        date: branchTimezone ? '2026-01-02' : '2026-01-01',
        timezone: branchTimezone ?? 'America/Los_Angeles',
        branchId: 'branch',
      });
      expect(prisma.internalProvider.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant', id: 'staff', active: true },
        select: { branch: { select: { id: true, timezone: true } } },
      });
      await expect(
        context.runAsAuthPrincipal(
          { tenantId: 'other', userId: 'user', role: 'client' },
          () => owner.nextAvailabilityDay('tenant', 'staff', new Date()),
        ),
      ).rejects.toThrow();
    },
  );

  it.each([{}, { timezone: 'not/a-timezone' }])(
    'L24-UNKNOWN refuses missing/invalid canonical timezone',
    (metadata) => {
      expect(
        presentBookingSelector({
          tenantId: 't',
          kind: 'TIME_SLOT_SELECTOR',
          source: {
            ...metadata,
            slots: [
              { start: '2026-10-03T10:00:00Z', end: '2026-10-03T11:00:00Z' },
            ],
          },
          inherited: { staff: 'staff' },
          mint: () => 'slot',
        }),
      ).toBeNull();
    },
  );
});
