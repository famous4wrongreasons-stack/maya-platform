import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CrmService } from '../crm/crm.service';
import { UserRole } from '../common/domain.enums';
import { CustomersService } from '../customers/customers.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AiToolHandlerService } from './ai-tool-handler.service';

describe('AiToolHandlerService output minimization', () => {
  const principal = {
    tenantId: 'tenant-a',
    userId: 'customer-a',
    role: UserRole.CUSTOMER,
    surface: 'web' as const,
  };

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
    expect(result).toMatchObject({
      appointments: [
        {
          id: 'appointment-a',
          branch: { id: 'branch-a', name: 'Филиал' },
          staff: { id: 'staff-a', name: 'Анна' },
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
        totals: { RUB: 100_000 },
        truncated: false,
      }),
    } as unknown as ExpensesService;
    const service = createService({ expensesService });
    const result = await service.execute(
      'expenses.read',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      },
      'execution-b',
    );

    expect(JSON.stringify(result)).not.toContain('private note');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
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
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      },
      'execution-d',
    );

    expect(JSON.stringify(result)).not.toContain('provider-secret-id');
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(result).toMatchObject({
      staff_summary: [
        {
          appointments: 2,
          revenue: [{ currency: 'RUB', amount_kopecks: 300_000 }],
        },
      ],
    });
  });

  function createService(overrides: {
    appointmentsService?: AppointmentsService;
    expensesService?: ExpensesService;
    loyaltyService?: LoyaltyService;
    analyticsService?: OperationsAnalyticsService;
  }) {
    return new AiToolHandlerService(
      {} as CrmService,
      overrides.appointmentsService ?? ({} as AppointmentsService),
      overrides.loyaltyService ?? ({} as LoyaltyService),
      overrides.analyticsService ?? ({} as OperationsAnalyticsService),
      overrides.expensesService ?? ({} as ExpensesService),
      {} as CustomersService,
    );
  }
});
