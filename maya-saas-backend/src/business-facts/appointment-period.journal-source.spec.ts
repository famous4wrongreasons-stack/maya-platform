import { AppointmentPeriodReader } from './appointment-period.reader';
import type { CrmService, StaffScheduleSource } from '../crm/crm.service';

type Journal = Awaited<ReturnType<CrmService['getJournal']>>;
type Record = Journal['appointments'][number];
const source: StaffScheduleSource = {
  provider: 'yclients',
  staffId: 'staff-a',
  branchId: 'branch-a',
  externalStaffId: '7',
  timezone: 'America/Los_Angeles',
  sourceHash: 'a'.repeat(64),
};
const period = {
  from: '2026-10-09T07:00:00.000Z',
  to: '2026-10-10T06:59:59.999Z',
  timezone: source.timezone,
};
const row = (
  id: string,
  staffId = '7',
  startAt = '2026-10-09T12:00:00.000Z',
): Record => ({
  id,
  client: { id: 'synthetic-client', name: 'Synthetic' },
  provider: { id: staffId, name: 'Synthetic staff' },
  branch: null,
  service_ids: [],
  services: [],
  start_at: startAt,
  end_at: new Date(Date.parse(startAt) + 1800000).toISOString(),
  status: 'confirmed',
  attendance: null,
  notes: null,
  total_price: null,
  currency: 'RUB',
});
function fixture() {
  const journal: Journal = {
    calendar_source: 'external',
    completeness: 'complete',
    timezone: source.timezone,
    provider_id: '7',
    range: { ...period },
    count: 1,
    appointments: [row('r1')],
  };
  const getJournal = jest.fn(() => Promise.resolve(journal));
  const reader = new AppointmentPeriodReader({
    getJournal,
  } as unknown as CrmService);
  const read = () =>
    reader.readProviderJournal('tenant-a', period, { providerId: '7', source });
  return { journal, getJournal, reader, read };
}

describe('canonical journal period source binding', () => {
  it('forwards the copied witness and cancellation inclusion without an extra reader', async () => {
    const f = fixture();
    const actual = await f.read();
    expect(actual.items).toEqual(f.journal.appointments);
    expect(f.getJournal.mock.calls).toEqual([
      [
        'tenant-a',
        { from: period.from, to: period.to, providerId: '7' },
        { includeCanceled: true, source },
      ],
    ]);
  });

  it.each(['timezone', 'provider', 'missing-provider', 'invalid-period'])(
    'refuses %s mismatch before CRM I/O',
    async (kind) => {
      const f = fixture();
      await expect(
        f.reader.readProviderJournal(
          'tenant-a',
          {
            ...period,
            ...(kind === 'timezone' ? { timezone: 'UTC' } : {}),
            ...(kind === 'invalid-period' ? { to: period.from } : {}),
          },
          {
            source,
            providerId:
              kind === 'provider'
                ? '8'
                : kind === 'missing-provider'
                  ? undefined
                  : '7',
          },
        ),
      ).rejects.toThrow();
      expect(f.getJournal).not.toHaveBeenCalled();
    },
  );

  it.each([
    'foreign-staff',
    'out-of-period-foreign-staff',
    'missing-staff',
    'timezone',
    'provider',
    'missing-completeness',
  ])(
    'refuses %s response rather than advertising filtered completeness',
    async (kind) => {
      const f = fixture();
      if (kind === 'foreign-staff') f.journal.appointments.push(row('r2', '8'));
      if (kind === 'out-of-period-foreign-staff')
        f.journal.appointments.push(row('r2', '8', '2026-10-01T12:00:00Z'));
      if (kind === 'missing-staff') f.journal.appointments[0].provider.id = '';
      if (kind === 'timezone') f.journal.timezone = 'UTC';
      if (kind === 'provider') f.journal.provider_id = null;
      if (kind === 'missing-completeness')
        Reflect.deleteProperty(f.journal, 'completeness');
      await expect(f.read()).rejects.toThrow();
      expect(f.getJournal).toHaveBeenCalledTimes(1);
    },
  );

  it('retains canonical out-of-period counters and provider truncation', async () => {
    const f = fixture();
    f.journal.appointments.push(row('before', '7', '2026-10-09T06:59:59.999Z'));
    f.journal.completeness = 'truncated';
    const actual = await f.read();
    expect(actual.items.map((item) => item.id)).toEqual(['r1']);
    expect(actual).toMatchObject({
      completeness: 'truncated',
      fetched: 2,
      outOfPeriodDiscarded: 1,
      truncatedWindows: 1,
    });
  });

  it('preserves legacy unscoped behavior', async () => {
    const f = fixture();
    f.journal.provider_id = null;
    f.journal.appointments.push(row('r2', '8'));
    const actual = await f.reader.readProviderJournal('tenant-a', period);
    expect(actual.items).toHaveLength(2);
    expect(f.getJournal.mock.calls).toEqual([
      [
        'tenant-a',
        { from: period.from, to: period.to },
        { includeCanceled: true },
      ],
    ]);
  });
});
