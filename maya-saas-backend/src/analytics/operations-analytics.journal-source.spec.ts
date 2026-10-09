import { OperationsAnalyticsService } from './operations-analytics.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AttendanceFactsService } from '../business-facts/attendance-facts.service';
import type { CrmService, StaffScheduleSource } from '../crm/crm.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Journal = Awaited<ReturnType<CrmService['getJournal']>>;

function fixture() {
  const context = new TenantContextService();
  const current: StaffScheduleSource = {
    provider: 'yclients',
    staffId: 'staff-a',
    branchId: 'branch-a',
    externalStaffId: '7',
    timezone: 'America/Los_Angeles',
    sourceHash: 'a'.repeat(64),
  };
  const source = { ...current };
  const tenant = {
    defaultTimezone: 'Europe/Moscow',
    calendarSource: 'external',
  };
  const db = {
    tenant: { findUnique: jest.fn(() => Promise.resolve({ ...tenant })) },
    appointment: {
      groupBy: jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    reconciliationRun: { findFirst: jest.fn().mockResolvedValue(null) },
    staffProviderLink: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { externalId: '7', staffId: 'wrong-provider-local-id' },
        ]),
    },
  };
  const journal: Journal = {
    calendar_source: 'external',
    completeness: 'complete',
    timezone: current.timezone,
    provider_id: '7',
    range: { from: '', to: '' },
    count: 1,
    appointments: [
      {
        id: 'synthetic-row',
        client: { id: 'synthetic-client', name: 'Synthetic' },
        provider: { id: '7', name: 'Synthetic staff' },
        branch: null,
        service_ids: [],
        services: [],
        start_at: '2026-10-09T07:00:00.000Z',
        end_at: '2026-10-09T07:30:00.000Z',
        status: 'confirmed',
        attendance: null,
        notes: null,
        total_price: null,
        currency: 'RUB',
      },
    ],
  };
  const getJournal = jest
    .fn<Promise<Journal>, Parameters<CrmService['getJournal']>>()
    .mockResolvedValue(journal);
  const resolve = jest
    .fn<
      Promise<StaffScheduleSource>,
      Parameters<CrmService['resolveStaffScheduleSource']>
    >()
    .mockImplementation((tenantId, externalId, expected = {}) => {
      if (
        tenantId !== 'tenant-a' ||
        externalId !== '7' ||
        Object.entries(expected).some(
          ([key, value]) => value !== current[key as keyof StaffScheduleSource],
        )
      )
        return Promise.reject(new Error('staff_schedule_source_unavailable'));
      return Promise.resolve({ ...current });
    });
  const crm = {
    getJournal,
    resolveStaffScheduleSource: resolve,
  } as unknown as CrmService;
  const attendance = new AttendanceFactsService(db as never, context);
  const attendanceRead = jest.spyOn(attendance, 'periodAttendance');
  const analytics = new OperationsAnalyticsService(
    db as never,
    context,
    {} as never,
    crm,
    {} as never,
    new AppointmentPeriodReader(crm),
    attendance,
  );
  return {
    source,
    current,
    tenant,
    db,
    journal,
    getJournal,
    resolve,
    analytics,
    attendanceRead,
    run: <T>(fn: () => Promise<T>) => context.runAsSystemTenant('tenant-a', fn),
    read: () =>
      context.runAsSystemTenant('tenant-a', () =>
        analytics.getDayOperations('tenant-a', {
          date: '2026-10-09',
          staffExternalId: '7',
          source,
        }),
      ),
  };
}

describe('day journal source ownership', () => {
  it.each([
    ['2026-10-09', '2026-10-09T07:00:00.000Z', '2026-10-10T06:59:59.999Z'],
    ['2026-11-01', '2026-11-01T07:00:00.000Z', '2026-11-02T07:59:59.999Z'],
  ])(
    'uses source-local bounds including DST for %s and scopes canonical attendance',
    async (date, from, to) => {
      const f = fixture();
      f.journal.appointments[0].start_at = from;
      f.journal.appointments[0].end_at = new Date(
        Date.parse(from) + 1800000,
      ).toISOString();
      const result = await f.run(() =>
        f.analytics.getDayOperations('tenant-a', {
          date,
          staffExternalId: '7',
          source: f.source,
        }),
      );
      expect(f.getJournal.mock.calls).toEqual([
        [
          'tenant-a',
          { from, to, providerId: '7' },
          { includeCanceled: true, source: f.source },
        ],
      ]);
      expect(f.attendanceRead.mock.calls).toEqual([
        [
          'tenant-a',
          { from, to, timezone: f.source.timezone },
          {
            branchId: 'branch-a',
            staffExternalId: '7',
            attendanceSupported: true,
          },
        ],
      ]);
      expect(f.db.appointment.groupBy.mock.calls[0][0]).toMatchObject({
        where: {
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          staffExternalId: '7',
        },
      });
      expect(result.timezone).toBe('America/Los_Angeles');
      expect(result.records).toHaveLength(1);
      expect(result.staff[0].staff_id).toBe('staff-a');
      expect(f.db.staffProviderLink.findMany).not.toHaveBeenCalled();
      expect(f.resolve).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['staff', 'missing-staff', 'internal', 'source-changed'])(
    'refuses %s mismatch before journal or attendance reads',
    async (kind) => {
      const f = fixture();
      if (kind === 'internal') f.tenant.calendarSource = 'internal';
      if (kind === 'source-changed') f.current.sourceHash = 'b'.repeat(64);
      await expect(
        f.run(() =>
          f.analytics.getDayOperations('tenant-a', {
            date: '2026-10-09',
            source: f.source,
            staffExternalId:
              kind === 'staff'
                ? '8'
                : kind === 'missing-staff'
                  ? undefined
                  : '7',
          }),
        ),
      ).rejects.toThrow();
      expect(f.getJournal).not.toHaveBeenCalled();
      expect(f.attendanceRead).not.toHaveBeenCalled();
    },
  );

  it('refuses metadata drift across the independent attendance await', async () => {
    const f = fixture();
    f.db.appointment.groupBy.mockImplementationOnce(() => {
      f.current.sourceHash = 'b'.repeat(64);
      return Promise.resolve([]);
    });
    await expect(f.read()).rejects.toThrow('staff_schedule_source_unavailable');
    expect(f.getJournal).toHaveBeenCalledTimes(1);
  });

  it('preserves truncation and the raw attendance count with its incomplete observation', async () => {
    const f = fixture();
    f.journal.completeness = 'truncated';
    const result = await f.read();
    expect(result.completeness.appointments.status).toBe('incomplete');
    const attendance = result.attendance;
    if (!attendance)
      throw new Error('Expected canonical attendance observation');
    expect(attendance.state).toBe('measured_incomplete');
    // Analytics retains the counted value plus its observation; the existing
    // journal handler masks non-measured attendance in its public projection.
    expect(attendance.arrived).toBe(0);
    expect(result.completeness.attendance).toMatchObject({
      status: 'incomplete',
      reason: 'period_is_outside_the_observed_range',
      observed_through: null,
    });
  });

  it('rejects a provider row belonging to a different employee in the period reader', async () => {
    const f = fixture();
    f.journal.appointments[0].provider.id = '8';
    await expect(f.read()).rejects.toThrow();
  });

  it('preserves legacy unscoped tenant-local bounds and attendance scope', async () => {
    const f = fixture();
    await f.run(() =>
      f.analytics.getDayOperations('tenant-a', { date: '2026-10-09' }),
    );
    expect(f.getJournal.mock.calls).toEqual([
      [
        'tenant-a',
        { from: '2026-10-08T21:00:00.000Z', to: '2026-10-09T20:59:59.999Z' },
        { includeCanceled: true },
      ],
    ]);
    expect(f.attendanceRead.mock.calls[0][2]).toEqual({
      branchId: null,
      staffExternalId: null,
      attendanceSupported: true,
    });
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.db.staffProviderLink.findMany).toHaveBeenCalledTimes(1);
  });
});
