import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CrmService } from '../crm/crm.service';
import { UserRole } from '../common/domain.enums';
import { CustomersService } from '../customers/customers.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { AiToolHandlerService } from './ai-tool-handler.service';

describe('AiToolHandlerService output minimization', () => {
  const principal = {
    tenantId: 'tenant-a',
    userId: 'customer-a',
    role: UserRole.CUSTOMER,
    surface: 'web' as const,
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('removes provider payload and customer PII from appointments', async () => {
    const appointmentsService = {
      listClientAppointments: jest.fn().mockResolvedValue([
        {
          id: 'appointment-a',
          status: 'confirmed',
          start_at: '2026-07-20T10:00:00.000Z',
          branch: { id: 'branch-a', name: 'Филиал', secret: 'hidden' },
          staff: { id: 'staff-a', name: 'Анна', phone: '+70000000000' },
          services: [
            {
              id: 'service-a',
              name: 'Стрижка',
              price: 1800,
              provider_payload: { token: 'hidden' },
            },
          ],
          client_phone: '+70000000000',
          client_email: 'private@example.com',
          provider_payload: { raw: 'hidden' },
          notes: 'private',
        },
      ]),
    } as unknown as AppointmentsService;
    const service = createService({ appointmentsService });
    const result = await service.execute(
      'appointments.own.list',
      principal,
      {},
      'execution-a',
    );

    expect(JSON.stringify(result)).not.toContain('+70000000000');
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(JSON.stringify(result)).not.toContain('provider_payload');
    expect(JSON.stringify(result)).not.toContain('staff-a');
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(result).toMatchObject({
      appointments: [
        {
          id: 'appointment-a',
          branch: { id: 'branch-a', name: 'Филиал' },
          staff: { title: null, specialization: null },
        },
      ],
    });
  });

  it('does not expose encrypted expense notes', async () => {
    const expensesService = {
      list: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'expense-a',
            branch_id: 'branch-a',
            category: 'rent',
            amount_kopecks: 100_000,
            currency: 'RUB',
            occurred_at: '2026-07-01T00:00:00.000Z',
            notes: 'private note',
            encrypted_note: 'ciphertext',
          },
        ],
        totals: [{ currency: 'RUB', amount_kopecks: 100_000 }],
        truncated: false,
      }),
    } as unknown as ExpensesService;
    const service = createService({ expensesService });
    const result = await service.execute(
      'expenses.read',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      },
      'execution-b',
    );

    expect(JSON.stringify(result)).not.toContain('private note');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
    expect(result).toMatchObject({
      items: [
        {
          amount_kopecks: 100_000,
          amount_major_units: 1_000,
          currency: 'RUB',
        },
      ],
      totals: [
        {
          amount_kopecks: 100_000,
          amount_major_units: 1_000,
          currency: 'RUB',
        },
      ],
    });
  });

  it('returns only the authoritative loyalty summary', async () => {
    const loyaltyService = {
      getForUser: jest.fn().mockResolvedValue({
        balance: 2133,
        currency: 'RUB',
        source: 'yclients',
        authoritative: true,
        sync_status: 'fresh',
        stale: false,
        synced_at: '2026-07-15T00:00:00.000Z',
        phone: '+79180000000',
        provider_payload: { cards: [] },
      }),
    } as unknown as LoyaltyService;
    const service = createService({ loyaltyService });
    const result = await service.execute(
      'loyalty.own.read',
      principal,
      {},
      'execution-c',
    );

    expect(result).toEqual({
      balance: 2133,
      currency: 'RUB',
      source: 'yclients',
      authoritative: true,
      sync_status: 'fresh',
      stale: false,
      synced_at: '2026-07-15T00:00:00.000Z',
    });
  });

  it('removes employee names and provider identifiers from analytics', async () => {
    const analyticsService = {
      getEmployeeOverview: jest.fn().mockResolvedValue({
        period: { from: '2026-07-01', to: '2026-07-15', timezone: 'UTC' },
        appointments: { total: 2, active: 2, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 300_000 }],
        expenses: [],
        net: [{ currency: 'RUB', amount_kopecks: 300_000 }],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 150_000 }],
        daily: [],
        staff: [
          {
            staff_external_id: 'provider-secret-id',
            appointments: 2,
            revenue: [{ currency: 'RUB', amount_kopecks: 300_000 }],
          },
        ],
        employee: { provider_id: 'provider-secret-id', name: 'Анна' },
        data_quality: { revenue_coverage: 1 },
      }),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });
    const result = await service.execute(
      'analytics.employee.read',
      { ...principal, role: UserRole.EMPLOYEE },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      },
      'execution-d',
    );

    expect(JSON.stringify(result)).not.toContain('provider-secret-id');
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(result).toMatchObject({
      revenue: [
        {
          amount_kopecks: 300_000,
          amount_major_units: 3_000,
          currency: 'RUB',
        },
      ],
      staff_summary: [
        {
          appointments: 2,
          revenue: [
            {
              currency: 'RUB',
              amount_kopecks: 300_000,
              amount_major_units: 3_000,
            },
          ],
        },
      ],
    });
  });

  it('resolves month-to-date on the server in the tenant timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T01:00:00.000Z'));
    const getBusinessOverview = jest.fn().mockResolvedValue({
      period: {},
      appointments: {},
    });
    const analyticsService = {
      getBusinessOverview,
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    await service.execute(
      'analytics.business.read',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'month_to_date' },
      'execution-period',
    );

    expect(getBusinessOverview).toHaveBeenCalledWith('tenant-a', {
      from: '2026-06-30T21:00:00.000Z',
      to: '2026-07-17T01:00:00.000Z',
    });
  });

  it('replaces staff names with deterministic booking labels', async () => {
    const staffService = {
      listStaff: jest.fn().mockResolvedValue([
        {
          id: 'staff-external-1',
          name: 'Анна',
          title: 'Барбер',
          specialization: 'Стрижки',
          avatar_url: 'https://private.example/avatar.jpg',
        },
      ]),
    } as unknown as StaffService;
    const service = createService({ staffService });

    const result = await service.execute(
      'catalog.staff.read',
      principal,
      {},
      'execution-e',
    );

    expect(result).toEqual({
      staff: [
        {
          id: 'staff-external-1',
          label: 'specialist_1',
          title: 'Барбер',
          specialization: 'Стрижки',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(JSON.stringify(result)).not.toContain('avatar.jpg');
  });

  it('removes booking identity and notes from appointment previews', async () => {
    const appointmentsService = {
      previewForClient: jest.fn().mockResolvedValue({
        ok: true,
        preview: true,
        mode: 'preview',
        branch_id: 'branch-a',
        branch_timezone: 'Europe/Moscow',
        client_name: 'Иван',
        client_phone: '+79180000000',
        staff_id: 'staff-a',
        service_ids: ['service-a'],
        requested_start: '2026-07-20T10:00:00.000Z',
        matched_slot_start: '2026-07-20T10:00:00.000Z',
        slot: {
          start: '2026-07-20T10:00:00.000Z',
          end: '2026-07-20T11:00:00.000Z',
          staff_id: 'staff-a',
          branch_id: 'branch-a',
        },
        total_price: 1_800,
        duration_minutes: 60,
        currency: 'RUB',
        notes: 'private note',
        warnings: [],
      }),
    } as unknown as AppointmentsService;
    const service = createService({ appointmentsService });
    const result = await service.execute(
      'appointments.own.preview',
      principal,
      {
        staff_id: 'staff-a',
        service_ids: ['service-a'],
        start: '2026-07-20T10:00:00.000Z',
      },
      'execution-f',
    );

    expect(JSON.stringify(result)).not.toContain('Иван');
    expect(JSON.stringify(result)).not.toContain('+79180000000');
    expect(JSON.stringify(result)).not.toContain('private note');
    expect(result).toMatchObject({
      preview: true,
      staff_id: 'staff-a',
      service_ids: ['service-a'],
    });
  });

  function createService(overrides: {
    appointmentsService?: AppointmentsService;
    expensesService?: ExpensesService;
    loyaltyService?: LoyaltyService;
    analyticsService?: OperationsAnalyticsService;
    staffService?: StaffService;
    prisma?: PrismaService;
  }) {
    return new AiToolHandlerService(
      {} as CrmService,
      overrides.appointmentsService ?? ({} as AppointmentsService),
      overrides.loyaltyService ?? ({} as LoyaltyService),
      overrides.analyticsService ?? ({} as OperationsAnalyticsService),
      overrides.expensesService ?? ({} as ExpensesService),
      {} as CustomersService,
      overrides.staffService ?? ({} as StaffService),
      overrides.prisma ??
        ({
          tenant: { findUnique: jest.fn() },
          branch: { findFirst: jest.fn() },
        } as unknown as PrismaService),
    );
  }
});
