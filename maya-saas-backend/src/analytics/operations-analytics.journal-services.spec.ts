import { ForbiddenException } from '@nestjs/common';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OperationsAnalyticsService } from './operations-analytics.service';

type AppointmentRead = {
  where: { tenantId: string };
  select: Record<string, boolean>;
};
type CatalogueRead = {
  where: { tenantId?: string; id: { in: string[] } };
  select: Record<string, boolean>;
};

function fixture() {
  const context = new TenantContextService();
  const tenant = {
    calendarSource: 'internal',
    defaultTimezone: 'Europe/Moscow',
  };
  const rows: Record<string, unknown>[] = [
    {
      id: 'visit-a',
      tenantId: 'tenant-a',
      source: 'internal',
      clientId: null,
      branchId: null,
      staffExternalId: 'provider-a',
      serviceIds: ['service-b', 'service-a'],
      startAt: new Date('2026-10-14T07:00:00Z'),
      endAt: new Date('2026-10-14T08:00:00Z'),
      status: 'confirmed',
      totalPriceKopecks: 12345,
      currency: 'RUB',
      notes: 'PRIVATE-SYNTHETIC-NOTE',
    },
  ];
  const catalogue = [
    {
      id: 'service-a',
      tenantId: 'tenant-a',
      name: 'Учебная стрижка',
      active: true,
      price: 9000,
      currency: 'USD',
    },
    {
      id: 'service-b',
      tenantId: 'tenant-a',
      name: 'Архивная услуга',
      active: false,
      price: 8000,
      currency: 'EUR',
    },
    {
      id: 'foreign-service',
      tenantId: 'tenant-b',
      name: 'FOREIGN-SERVICE-NOT-FOR-RENDER',
      active: true,
      price: 7000,
      currency: 'USD',
    },
  ];
  const db = {
    tenant: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(tenant)),
    },
    appointment: {
      findMany: jest
        .fn<Promise<Record<string, unknown>[]>, [AppointmentRead]>()
        .mockImplementation(({ where, select }) =>
          Promise.resolve(
            rows
              .filter((row) => row.tenantId === where.tenantId)
              .map((row) =>
                Object.fromEntries(
                  Object.keys(select).map((key) => [key, row[key]]),
                ),
              ),
          ),
        ),
    },
    internalService: {
      findMany: jest
        .fn<Promise<Record<string, unknown>[]>, [CatalogueRead]>()
        .mockImplementation(({ where, select }) =>
          Promise.resolve(
            catalogue
              .filter(
                (service) =>
                  (!where.tenantId || service.tenantId === where.tenantId) &&
                  where.id.in.includes(service.id),
              )
              .map((service) =>
                Object.fromEntries(
                  Object.keys(select).map((key) => [
                    key,
                    service[key as keyof typeof service],
                  ]),
                ),
              ),
          ),
        ),
    },
    internalProvider: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'provider-a', displayName: 'Учебный мастер' },
        ]),
    },
    staffProviderLink: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const attendance = { periodAttendance: jest.fn().mockResolvedValue(null) };
  const crm = {
    getJournal: jest.fn().mockResolvedValue({
      completeness: 'complete',
      appointments: [
        {
          id: 'external-visit',
          client: { id: 'synthetic-crm-client' },
          provider: { id: 'provider-a', name: 'CRM master' },
          branch: null,
          services: [
            {
              id: 'external-service',
              name: 'CRM service',
              price: 456,
              currency: 'RUB',
            },
          ],
          start_at: '2026-10-14T07:00:00Z',
          end_at: '2026-10-14T08:00:00Z',
          status: 'confirmed',
          total_price: 456,
          currency: 'RUB',
        },
      ],
    }),
  };
  const service = new OperationsAnalyticsService(
    db as never,
    context,
    {} as never,
    crm as never,
    {} as never,
    new AppointmentPeriodReader(crm as never),
    attendance as never,
  );
  const read = (tenantId = 'tenant-a') =>
    context.runAsSystemTenant('tenant-a', () =>
      service.getDayOperations(tenantId, { date: '2026-10-14' }),
    );
  return { tenant, rows, catalogue, db, attendance, crm, read };
}

describe('internal day journal service labels', () => {
  it('resolves only stored IDs in this tenant, in appointment order, including inactive services', async () => {
    const f = fixture();
    const result = await f.read();
    expect(result.records[0].services).toEqual([
      { id: 'service-b', name: 'Архивная услуга' },
      { id: 'service-a', name: 'Учебная стрижка' },
    ]);
    expect(f.db.internalService.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.internalService.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['service-b', 'service-a'] } },
      select: { id: true, name: true },
    });
    expect(result.records[0]).not.toHaveProperty('serviceIds');
    expect(result.records[0]).not.toHaveProperty('source');
    expect(result.records[0]).not.toHaveProperty('notes');
  });

  it('does not turn current catalogue prices into historical service or appointment money', async () => {
    const f = fixture();
    const withNames = await f.read();
    f.catalogue.splice(0);
    const withoutNames = await f.read();
    const { records: namedRecords, ...namedFacts } = withNames;
    const { records: unnamedRecords, ...unnamedFacts } = withoutNames;
    expect(namedFacts).toEqual(unnamedFacts);
    expect(namedRecords[0].totalPriceKopecks).toBe(12345);
    expect(namedRecords[0].currency).toBe('RUB');
    expect(namedRecords[0].services).toHaveLength(2);
    expect(unnamedRecords[0].services).toEqual([]);
    expect(withNames.services).toEqual([]);
    expect(withNames.booked_value).toEqual([
      { currency: 'RUB', amount_kopecks: 12345 },
    ]);
  });

  it('never resolves foreign or missing catalogue IDs, even when they are stored on the appointment', async () => {
    const f = fixture();
    f.rows[0].serviceIds = ['foreign-service', 'deleted-service', 'service-a'];
    const result = await f.read();
    expect(result.records[0].services).toEqual([
      { id: 'service-a', name: 'Учебная стрижка' },
    ]);
    expect(JSON.stringify(result)).not.toContain(
      'FOREIGN-SERVICE-NOT-FOR-RENDER',
    );
  });

  it('does not relabel retained external records from the internal catalogue', async () => {
    const f = fixture();
    f.rows.push({ ...f.rows[0], id: 'retained-external', source: 'external' });
    const result = await f.read();
    expect(result.records).toHaveLength(2);
    expect(result.records[0].services).toHaveLength(2);
    expect(result.records[1].services).toEqual([]);
    expect(result.records[1].totalPriceKopecks).toBe(12345);
  });

  it.each([null, {}, 'service-a', [], [null, 7, false, '', {}]])(
    'leaves malformed/empty stored IDs unnamed without reading the catalogue: %p',
    async (serviceIds) => {
      const f = fixture();
      f.rows[0].serviceIds = serviceIds;
      expect((await f.read()).records[0].services).toEqual([]);
      expect(f.db.internalService.findMany).not.toHaveBeenCalled();
    },
  );

  it('keeps stored multiplicity/order but batches duplicate lookups across records', async () => {
    const f = fixture();
    f.rows[0].serviceIds = ['service-a', 7, 'service-a'];
    f.rows.push({
      ...f.rows[0],
      id: 'visit-b',
      status: 'canceled',
      totalPriceKopecks: null,
    });
    const result = await f.read();
    expect(
      result.records.map((row) => row.services.map((service) => service.name)),
    ).toEqual([
      ['Учебная стрижка', 'Учебная стрижка'],
      ['Учебная стрижка', 'Учебная стрижка'],
    ]);
    expect(result.records[1].status).toBe('canceled');
    expect(result.records[1].totalPriceKopecks).toBeNull();
    expect(f.db.internalService.findMany.mock.calls[0][0].where.id.in).toEqual([
      'service-a',
    ]);
    expect(f.db.internalService.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not read the catalogue on an empty day', async () => {
    const f = fixture();
    f.rows.splice(0);
    expect((await f.read()).records).toEqual([]);
    expect(f.db.internalService.findMany).not.toHaveBeenCalled();
  });

  it('refuses a different tenant before any source read', async () => {
    const f = fixture();
    await expect(f.read('tenant-b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.tenant.findUnique).not.toHaveBeenCalled();
    expect(f.db.appointment.findMany).not.toHaveBeenCalled();
    expect(f.db.internalService.findMany).not.toHaveBeenCalled();
  });

  it('propagates a catalogue read failure instead of presenting it as an empty catalogue', async () => {
    const f = fixture();
    f.db.internalService.findMany.mockRejectedValueOnce(
      new Error('synthetic catalogue unavailable'),
    );
    await expect(f.read()).rejects.toThrow('synthetic catalogue unavailable');
  });

  it('preserves provider journal names and amounts without touching the internal catalogue', async () => {
    const f = fixture();
    f.tenant.calendarSource = 'external';
    const result = await f.read();
    expect(result.records[0].services).toEqual([
      {
        id: 'external-service',
        name: 'CRM service',
        amountKopecks: 45600,
        currency: 'RUB',
      },
    ]);
    expect(f.db.internalService.findMany).not.toHaveBeenCalled();
    expect(f.db.appointment.findMany).not.toHaveBeenCalled();
  });
});
