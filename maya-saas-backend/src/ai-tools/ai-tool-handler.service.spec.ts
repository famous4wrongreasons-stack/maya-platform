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
  const stringContaining = (value: string): unknown =>
    expect.stringContaining(value) as unknown;

  const principal = {
    tenantId: 'tenant-a',
    userId: 'customer-a',
    role: UserRole.CUSTOMER,
    surface: 'web' as const,
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the authoritative all-time CRM customer count', async () => {
    const getClientBaseCount = jest.fn().mockResolvedValue(1_847);
    const countCustomers = jest.fn();
    const service = createService({
      crmService: { getClientBaseCount } as unknown as CrmService,
      customersService: { countCustomers } as unknown as CustomersService,
    });

    const result = await service.execute(
      'customers.count',
      { ...principal, role: UserRole.TENANT_OWNER },
      {},
      'execution-customer-count-crm',
    );

    expect(getClientBaseCount).toHaveBeenCalledWith('tenant-a');
    expect(countCustomers).not.toHaveBeenCalled();
    expect(result).toEqual({
      customer_count: 1_847,
      scope: 'all_time',
      scope_label_ru: 'за всё время',
      source: 'crm',
    });
  });

  it('counts active customer accounts for the internal MAYA calendar', async () => {
    const getClientBaseCount = jest.fn();
    const countCustomers = jest.fn().mockResolvedValue({ customer_count: 42 });
    const service = createService({
      crmService: { getClientBaseCount } as unknown as CrmService,
      customersService: { countCustomers } as unknown as CustomersService,
      prisma: {
        tenant: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ calendarSource: 'internal' }),
        },
      } as unknown as PrismaService,
    });

    const result = await service.execute(
      'customers.count',
      { ...principal, role: UserRole.TENANT_OWNER },
      {},
      'execution-customer-count-maya',
    );

    expect(countCustomers).toHaveBeenCalledWith('tenant-a');
    expect(getClientBaseCount).not.toHaveBeenCalled();
    expect(result).toEqual({
      customer_count: 42,
      scope: 'all_time',
      scope_label_ru: 'за всё время',
      source: 'maya',
    });
  });

  it('checks client access with a real source read instead of a canned reply', async () => {
    const getClientBaseCount = jest.fn().mockResolvedValue(1_847);
    const service = createService({
      crmService: { getClientBaseCount } as unknown as CrmService,
    });

    const result = await service.execute(
      'clients.access.check',
      { ...principal, role: UserRole.TENANT_OWNER },
      {},
      'execution-client-access',
    );

    expect(getClientBaseCount).toHaveBeenCalledWith('tenant-a');
    expect(result).toEqual({
      connected: true,
      source: 'crm',
      customer_count: 1_847,
      scope: 'all_time',
      scope_label_ru: 'за всё время',
      capabilities: [
        'all_time_count',
        'redacted_client_dossier',
        'return_candidates',
      ],
    });
  });

  it('builds a read-only return queue with masked phones', async () => {
    const getClientReturnCandidates = jest.fn().mockResolvedValue([
      {
        client_id: 'private-client-id',
        name: 'Иван Петров',
        phone: '+7 999 123-45-67',
        reason_code: 'inactive_period',
        last_completed_visit: '2026-04-01T10:00:00.000Z',
        last_event_at: '2026-04-01T10:00:00.000Z',
        average_cycle_days: 31,
        days_overdue: 41,
      },
    ]);
    const service = createService({
      crmService: { getClientReturnCandidates } as unknown as CrmService,
    });

    const result = await service.execute(
      'clients.return_candidates.read',
      { ...principal, role: UserRole.TENANT_OWNER },
      { mode: 'inactive_period', inactive_days: 90, limit: 10 },
      'execution-client-return',
    );

    expect(getClientReturnCandidates).toHaveBeenCalledWith('tenant-a', 10, {
      lookbackDays: 365,
      futureDays: 90,
      inactiveDays: 90,
    });
    expect(result).toEqual({
      total_count: 1,
      shown_count: 1,
      requires_confirmation: true,
      communication_started: false,
      filter: {
        type: 'inactive_period',
        threshold_days: 90,
        lookback_days: 365,
      },
      candidates: [
        {
          display_name: 'Иван Петров',
          phone_masked: '••• •••-4567',
          reason_code: 'inactive_period',
          reason: 'Не был(а) 131 дн. (порог 90 дн.)',
          last_event_at: '2026-04-01T10:00:00.000Z',
          last_completed_visit: '2026-04-01T10:00:00.000Z',
          average_cycle_days: 31,
          days_overdue: 41,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('+7 999 123-45-67');
    expect(JSON.stringify(result)).not.toContain('private-client-id');
  });

  it('builds an exact, redacted CRM client dossier for staff', async () => {
    const searchClients = jest.fn().mockResolvedValue([
      { id: '42', name: 'Иван Петров', phone: '+79991234567' },
      { id: '43', name: 'Иван Сидоров', phone: null },
    ]);
    const getClientVisitHistory = jest.fn().mockResolvedValue([
      {
        start: '2026-05-01T10:00:00.000Z',
        status: 'completed',
        service_names: ['Стрижка'],
        booked_service_value: 1800,
      },
      {
        start: '2026-06-15T10:00:00.000Z',
        status: 'completed',
        service_names: ['Стрижка', 'Борода'],
        booked_service_value: 2500,
      },
      {
        start: '2026-07-20T10:00:00.000Z',
        status: 'completed',
        service_names: ['Стрижка'],
        booked_service_value: 1800,
      },
      {
        start: '2026-07-25T10:00:00.000Z',
        status: 'no_show',
        service_names: ['Стрижка'],
        booked_service_value: 1800,
      },
      {
        start: '2026-07-28T10:00:00.000Z',
        status: 'canceled',
        service_names: ['Борода'],
        booked_service_value: 700,
      },
    ]);
    const service = createService({
      crmService: {
        searchClients,
        getClientVisitHistory,
      } as unknown as CrmService,
    });

    const result = await service.execute(
      'clients.dossier.read',
      { ...principal, role: UserRole.STAFF, userId: 'master-a' },
      { query: '4567' },
      'execution-dossier-a',
    );

    expect(searchClients).toHaveBeenCalledWith('tenant-a', '4567');
    expect(getClientVisitHistory).toHaveBeenCalledWith('tenant-a', '42', 30);
    expect(result).toEqual({
      found: true,
      display_name: 'клиент',
      matches_count: 2,
      visits: 3,
      no_shows: 1,
      canceled_visits: 1,
      last_visit: '2026-07-20',
      favorite_services: ['Стрижка', 'Борода'],
      avg_cycle_days: 40,
      booked_service_value: 6100,
      value_note:
        'Сумма цен услуг в завершённых записях, а не фактически оплаченная сумма из кассы.',
      note: 'Телефон и имя не показывай. Это история и привычки клиента — для тёплого приёма и совета.',
    });
    expect(JSON.stringify(result)).not.toContain('Иван');
    expect(JSON.stringify(result)).not.toContain('7999');
    expect(JSON.stringify(result)).not.toContain('phone');
  });

  it('does not choose the first CRM client when a name is ambiguous', async () => {
    const getClientVisitHistory = jest.fn();
    const service = createService({
      crmService: {
        searchClients: jest.fn().mockResolvedValue([
          { id: '42', name: 'Иван Петров', phone: '+79991234567' },
          { id: '43', name: 'Иван Сидоров', phone: '+79997654321' },
        ]),
        getClientVisitHistory,
      } as unknown as CrmService,
    });

    const result = await service.execute(
      'clients.dossier.read',
      { ...principal, role: UserRole.STAFF, userId: 'master-a' },
      { query: 'Иван' },
      'execution-dossier-ambiguous',
    );

    expect(result).toEqual({
      found: false,
      ambiguous: true,
      matches_count: 2,
      error:
        'Найдено несколько совпадений. Уточните полное имя или последние четыре цифры телефона.',
    });
    expect(getClientVisitHistory).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('Петров');
    expect(JSON.stringify(result)).not.toContain('Сидоров');
    expect(JSON.stringify(result)).not.toContain('7999');
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

  it('converts the spoken rubles into kopecks and stamps the expense as manual', async () => {
    const expensesCreate = jest.fn().mockResolvedValue({
      id: 'expense-new',
      tenant_id: 'tenant-a',
      branch_id: null,
      category: 'rent',
      category_label: 'Аренда',
      category_kind: 'fixed',
      category_known: true,
      category_raw: 'rent',
      amount_kopecks: 6_000_000,
      currency: 'RUB',
      occurred_at: new Date('2026-08-07T09:00:00.000Z'),
      source: 'manual',
      external_id: null,
      note: 'Аренда за август',
      created_at: new Date('2026-08-07T09:00:00.000Z'),
      updated_at: new Date('2026-08-07T09:00:00.000Z'),
    });
    const expensesService = {
      create: expensesCreate,
    } as unknown as ExpensesService;
    const service = createService({
      expensesService,
      prisma: {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            calendarSource: 'external',
            defaultTimezone: 'Europe/Moscow',
          }),
        },
        branch: { findFirst: jest.fn() },
      } as unknown as PrismaService,
    });

    const result = await service.execute(
      'expenses.create',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-07',
        note: 'Аренда за август',
      },
      'approval-key-1',
    );

    // 60 тысяч рублей — это 6 000 000 копеек, и считает это сервер, не модель.
    expect(expensesCreate).toHaveBeenCalledWith(
      'tenant-a',
      'customer-a',
      expect.objectContaining({
        category: 'rent',
        amountKopecks: 6_000_000,
        currency: 'RUB',
        // Полдень по Москве — расход не переезжает в соседний день или месяц.
        occurredAt: '2026-08-07T09:00:00.000Z',
        note: 'Аренда за август',
      }),
      { source: 'manual', idempotencyKey: 'approval-key-1' },
    );
    expect(result).toMatchObject({
      recorded: true,
      expense_id: 'expense-new',
      category: 'rent',
      category_kind: 'fixed',
      amount_kopecks: 6_000_000,
      amount_major_units: 60_000,
      currency: 'RUB',
      occurred_on: '2026-08-07',
      source: 'manual',
    });
    // Заметка — свободный текст: наружу из инструмента она не возвращается.
    expect(JSON.stringify(result)).not.toContain('Аренда за август');
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
        spend_options: {
          status: 'available',
          basis: 'price_estimate',
          verification_required: true,
          items: [
            {
              id: 'service-spa',
              name: 'SPA для лица',
              price: 1200,
              points_required: 1200,
              currency: 'RUB',
              category: 'Уход',
              internal_note: 'must not leak',
            },
          ],
          best_service: { id: 'service-spa', points_required: 1200 },
          next_service: null,
        },
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
      spend_options: {
        status: 'available',
        basis: 'price_estimate',
        verification_required: true,
        items: [
          {
            id: 'service-spa',
            name: 'SPA для лица',
            price: 1200,
            points_required: 1200,
            currency: 'RUB',
            category: 'Уход',
          },
        ],
        best_service: { id: 'service-spa', points_required: 1200 },
        next_service: null,
      },
    });
  });

  it('applies only the immutable schedule approved by a manager', async () => {
    const applyStaffScheduleDayChange = jest.fn().mockResolvedValue({
      staff_id: '1461615',
      date: '2026-08-06',
      is_working: true,
      slots: [
        { from: '10:00', to: '14:00' },
        { from: '15:00', to: '18:00' },
      ],
      verified: true,
    });
    const crmService = {
      applyStaffScheduleDayChange,
    } as unknown as CrmService;
    const service = createService({ crmService });

    await expect(
      service.execute(
        'staff.schedule.update',
        { ...principal, role: UserRole.TENANT_OWNER, surface: 'native' },
        {
          staff_id: '1461615',
          date: '2026-08-06',
          current_revision: 'a'.repeat(64),
          slots: [
            { from: '10:00', to: '14:00' },
            { from: '15:00', to: '18:00' },
          ],
        },
        'execution-schedule',
      ),
    ).resolves.toEqual({
      status: 'applied',
      date: '2026-08-06',
      is_working: true,
      slots: [
        { from: '10:00', to: '14:00' },
        { from: '15:00', to: '18:00' },
      ],
      verified: true,
      existing_appointments_preserved: true,
    });
    expect(applyStaffScheduleDayChange).toHaveBeenCalledWith('tenant-a', {
      staffId: '1461615',
      date: '2026-08-06',
      slots: [
        { from: '10:00', to: '14:00' },
        { from: '15:00', to: '18:00' },
      ],
      expectedRevision: 'a'.repeat(64),
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
      'analytics.employee.query',
      { ...principal, role: UserRole.EMPLOYEE },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
        comparison: 'none',
      },
      'execution-d',
    );

    expect(JSON.stringify(result)).not.toContain('provider-secret-id');
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(published(result)).toMatchObject({
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
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'month_to_date', comparison: 'none' },
      'execution-period',
    );

    expect(getBusinessOverview).toHaveBeenCalledWith('tenant-a', {
      from: '2026-06-30T21:00:00.000Z',
      to: '2026-07-17T01:00:00.000Z',
    });
  });

  it('replaces external appointment prices with verified CRM finance totals', async () => {
    const getBusinessFinance = jest.fn().mockResolvedValue({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        timezone: 'Europe/Moscow',
      },
      revenue: {
        status: 'available',
        verified: true,
        transaction_count: 821,
        total: { currency: 'RUB', amount_kopecks: 120_439_000 },
        by_type: [],
        by_account: [],
      },
      payroll: {
        status: 'available',
        verified: true,
        accrued_total: { currency: 'RUB', amount_kopecks: 56_388_001 },
        paid_total: { currency: 'RUB', amount_kopecks: 0 },
        balance_total: { currency: 'RUB', amount_kopecks: 56_388_001 },
        staff: [
          {
            staff_id: 'provider-secret-id',
            name: 'Антон',
            status: 'available',
            verified: true,
          },
        ],
      },
      warnings: [],
    });
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: {},
        appointments: { total: 10, active: 10, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
        expenses: [{ currency: 'RUB', amount_kopecks: 1 }],
        net: [{ currency: 'RUB', amount_kopecks: 9_999_998 }],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 999_999 }],
        daily: [
          {
            date: '2026-07-01',
            appointments: 10,
            revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
          },
        ],
        staff: [
          {
            staff_external_id: 'provider-secret-id',
            appointments: 10,
            revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
          },
        ],
      }),
      getBusinessFinance,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-finance',
    );

    expect(published(result)).toMatchObject({
      data_source: 'crm',
      revenue: [
        {
          currency: 'RUB',
          amount_kopecks: 120_439_000,
          amount_major_units: 1_204_390,
        },
      ],
      expenses: [],
      net: [],
      average_ticket: [
        {
          currency: 'RUB',
          amount_kopecks: 146_698,
          amount_major_units: 1_466.98,
        },
      ],
      finance: {
        source: 'external_crm',
        provider: 'yclients',
        revenue: { verified: true, transaction_count: 821 },
        payroll: {
          status: 'available',
          verified: true,
          accrued_total: {
            amount_kopecks: 56_388_001,
            amount_major_units: 563_880.01,
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('Антон');
    expect(JSON.stringify(result)).not.toContain('provider-secret-id');
    expect(JSON.stringify(result)).not.toContain('9999999');
    expect(getBusinessFinance).toHaveBeenCalledWith('tenant-a', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
    });
  });

  it('fails closed for external finance when the role cannot read payroll', async () => {
    const getBusinessFinance = jest.fn();
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: {},
        appointments: { total: 3, active: 3, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 300_000 }],
        expenses: [],
        net: [{ currency: 'RUB', amount_kopecks: 300_000 }],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 100_000 }],
        daily: [],
        staff: [],
      }),
      getBusinessFinance,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.MANAGER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
        comparison: 'none',
      },
      'execution-manager-finance',
    );

    expect(published(result)).toMatchObject({
      appointments: { total: 3 },
      revenue: [],
      expenses: [],
      net: [],
      finance: {
        verified: false,
        warning_codes: ['role_restricted'],
      },
    });
    expect(getBusinessFinance).not.toHaveBeenCalled();
  });

  it('gives the owner accrued payroll per master and never calls it master revenue', async () => {
    const getBusinessFinance = jest.fn().mockResolvedValue({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        timezone: 'Europe/Moscow',
      },
      revenue: {
        status: 'available',
        verified: true,
        transaction_count: 100,
        total: { currency: 'RUB', amount_kopecks: 50_000_000 },
        by_type: [],
        by_account: [],
      },
      payroll: {
        // 🔴 Расчёт неполный: по одному мастеру CRM промолчала. Второй посчитан
        // честно, и прятать его начисления из-за соседа нельзя.
        status: 'partial',
        verified: false,
        accrued_total: null,
        paid_total: null,
        balance_total: null,
        staff: [
          {
            staff_id: 'crm-staff-1',
            // Имя из расчёта зарплаты — чужой источник имён. Наружу должно уйти
            // имя из операционного разреза, а это — нет.
            name: 'Антон',
            status: 'available',
            verified: true,
            accrued: { currency: 'RUB', amount_kopecks: 12_000_000 },
            paid: { currency: 'RUB', amount_kopecks: 5_000_000 },
            balance: null,
          },
          {
            staff_id: 'crm-staff-2',
            name: 'Пётр',
            status: 'unavailable',
            verified: false,
            accrued: null,
            paid: null,
            balance: null,
          },
        ],
      },
      warnings: [],
    });
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: {},
        appointments: { total: 50, active: 50, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'crm-staff-1',
            name: 'Стас',
            appointments: 30,
            revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
            booked_minutes: 1_800,
            services: [],
          },
          {
            staff_external_id: 'crm-staff-2',
            name: 'Илья',
            appointments: 20,
            revenue: [{ currency: 'RUB', amount_kopecks: 4_000_000 }],
            booked_minutes: 1_200,
            services: [],
          },
        ],
      }),
      getBusinessFinance,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-owner-staff-payroll',
    );

    expect(published(result)).toMatchObject({
      staff_summary: [
        {
          name: 'Стас',
          appointments: 30,
          // Цены журнала по-прежнему обнулены: подтверждённых денег мастера нет.
          revenue: [],
          confirmed_revenue: {
            status: 'unavailable',
            amount: null,
            unavailable_reason: stringContaining('whole_company'),
          },
          salary: {
            status: 'available',
            basis: 'crm_payroll_accrual',
            accrued: {
              currency: 'RUB',
              amount_kopecks: 12_000_000,
              amount_major_units: 120_000,
            },
            paid: {
              currency: 'RUB',
              amount_kopecks: 5_000_000,
              amount_major_units: 50_000,
            },
            unavailable_reason: null,
          },
        },
        {
          name: 'Илья',
          appointments: 20,
          revenue: [],
          salary: {
            status: 'unavailable',
            basis: null,
            accrued: null,
            paid: null,
            unavailable_reason: 'crm_payroll_row_unavailable_for_this_master',
          },
        },
      ],
    });
    // 🔴 Граница «зарплата по именам» держится тем, что имя из расчёта зарплаты
    // не переносится вообще: мастер называется именем операционного разреза.
    expect(JSON.stringify(result)).not.toContain('Антон');
    expect(JSON.stringify(result)).not.toContain('Пётр');
    expect(JSON.stringify(result)).not.toContain('crm-staff-1');
    // Начисление не выдаётся за выручку: цен журнала в ответе нет.
    expect(JSON.stringify(result)).not.toContain('6000000');
  });

  it('withholds per-master payroll from a role that may see names but not finance', async () => {
    const getBusinessFinance = jest.fn();
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: {},
        appointments: { total: 30, active: 30, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'crm-staff-1',
            name: 'Стас',
            appointments: 30,
            revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
            booked_minutes: 1_800,
            services: [],
          },
        ],
      }),
      getBusinessFinance,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.MANAGER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
        comparison: 'none',
      },
      'execution-manager-staff-payroll',
    );

    // Управляющий видит разрез по мастерам поимённо, но не их деньги.
    expect(published(result)).toMatchObject({
      staff_summary: [
        {
          name: 'Стас',
          appointments: 30,
          salary: {
            status: 'unavailable',
            accrued: null,
            unavailable_reason: 'role_not_allowed_to_read_payroll',
          },
        },
      ],
    });
    expect(getBusinessFinance).not.toHaveBeenCalled();
  });

  it('gives a master their own accrued salary and never a colleague payroll row', async () => {
    const getStaffFinance = jest.fn().mockResolvedValue({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: {},
      revenue: {
        status: 'available',
        verified: true,
        transaction_count: 10,
        total: { currency: 'RUB', amount_kopecks: 50_000_000 },
        by_type: [],
        by_account: [],
      },
      payroll: {
        status: 'available',
        verified: true,
        accrued_total: { currency: 'RUB', amount_kopecks: 42_000_000 },
        paid_total: null,
        balance_total: null,
        staff: [
          {
            staff_id: 'crm-self',
            name: 'Антон',
            status: 'available',
            verified: true,
            accrued: { currency: 'RUB', amount_kopecks: 12_000_000 },
            paid: null,
            balance: null,
          },
          {
            staff_id: 'crm-colleague',
            name: 'Анна',
            status: 'available',
            verified: true,
            accrued: { currency: 'RUB', amount_kopecks: 30_000_000 },
            paid: null,
            balance: null,
          },
        ],
      },
      warnings: [],
    });
    const analyticsService = {
      getEmployeeOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: { from: 'from', to: 'to', timezone: 'UTC' },
        appointments: { total: 8, active: 8, cancelled: 0 },
        revenue: [],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        employee: { provider_id: 'crm-self', name: 'Илья' },
        staff: [
          {
            staff_external_id: 'crm-self',
            name: 'Илья',
            appointments: 8,
            revenue: [],
            booked_minutes: 240,
            services: [],
          },
          // 🔴 Источник подмешал коллегу — его начисления не должны существовать
          // в ответе даже как число.
          {
            staff_external_id: 'crm-colleague',
            name: 'Анна',
            appointments: 32,
            revenue: [],
            booked_minutes: 960,
            services: [],
          },
        ],
      }),
      getStaffFinance,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = await service.execute(
      'analytics.employee.query',
      { ...principal, userId: 'employee-user', role: UserRole.STAFF },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-employee-own-payroll',
    );

    expect(published(result)).toMatchObject({
      staff_summary: [
        {
          name: 'Илья',
          appointments: 8,
          salary: {
            status: 'available',
            basis: 'crm_payroll_accrual',
            accrued: {
              currency: 'RUB',
              amount_kopecks: 12_000_000,
              amount_major_units: 120_000,
            },
          },
          confirmed_revenue: { status: 'unavailable', amount: null },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(JSON.stringify(result)).not.toContain('Антон');
    expect(JSON.stringify(result)).not.toContain('crm-self');
    // Начисления коллеги и общий фонд оплаты труда салона.
    expect(JSON.stringify(result)).not.toContain('30000000');
    expect(JSON.stringify(result)).not.toContain('42000000');
  });

  it('reports per-master payroll as unavailable with the CRM reason instead of zero', async () => {
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: {},
        appointments: { total: 30, active: 30, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'crm-staff-1',
            name: 'Стас',
            appointments: 30,
            revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
            booked_minutes: 1_800,
            services: [],
          },
        ],
      }),
      getBusinessFinance: jest.fn().mockResolvedValue({
        source: 'external_crm',
        provider: 'yclients',
        verified: false,
        period: {},
        revenue: {
          status: 'available',
          verified: true,
          transaction_count: 400,
          total: { currency: 'RUB', amount_kopecks: 90_000_000 },
          by_type: [],
          by_account: [],
        },
        payroll: {
          status: 'unavailable',
          verified: false,
          accrued_total: null,
          paid_total: null,
          balance_total: null,
          staff: [],
        },
        warnings: [
          {
            code: 'crm_payroll_range_too_large',
            message: 'Расчёт зарплаты доступен только за период до 31 дня.',
          },
        ],
      }),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-owner-payroll-range',
    );

    // 🔴 Ноль здесь читался бы как «мастеру ничего не начислено».
    expect(published(result)).toMatchObject({
      staff_summary: [
        {
          name: 'Стас',
          salary: {
            status: 'unavailable',
            accrued: null,
            paid: null,
            unavailable_reason: 'crm_payroll_range_too_large',
          },
        },
      ],
    });
  });

  it('says the internal calendar has no payroll instead of showing an empty salary', async () => {
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'maya',
        period: {},
        appointments: { total: 12, active: 12, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 2_400_000 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'internal-provider-1',
            name: 'Стас',
            appointments: 12,
            revenue: [{ currency: 'RUB', amount_kopecks: 2_400_000 }],
            booked_minutes: 720,
            services: [],
          },
        ],
      }),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'internal',
          defaultTimezone: 'UTC',
        }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
        comparison: 'none',
      },
      'execution-owner-internal-payroll',
    );

    expect(published(result)).toMatchObject({
      staff_summary: [
        {
          name: 'Стас',
          // Внутренний календарь свои цены отдаёт — но это стоимость записей.
          revenue: [{ amount_kopecks: 2_400_000 }],
          confirmed_revenue: {
            status: 'unavailable',
            amount: null,
            unavailable_reason: stringContaining('booked'),
          },
          salary: {
            status: 'unavailable',
            accrued: null,
            unavailable_reason: 'internal_calendar_has_no_payroll_calculation',
          },
        },
      ],
    });
  });

  it('names per-master revenue as an unavailable metric with its reason', async () => {
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: { from: 'from', to: 'to', timezone: 'UTC' },
        appointments: { total: 30, active: 30, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'crm-staff-1',
            name: 'Стас',
            appointments: 30,
            revenue: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
            booked_minutes: 1_800,
            services: [],
          },
        ],
      }),
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('crm is down')),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
        comparison: 'none',
      },
      'execution-staff-revenue-metric',
    )) as Record<string, unknown>;

    expect(result.unavailable_metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'staff_revenue',
          reason: stringContaining('accrued payroll'),
        }),
        expect.objectContaining({
          key: 'staff_accrued_salary',
          reason: stringContaining('crm_finance_unavailable'),
        }),
      ]),
    );
  });

  /**
   * 🔴 Год к году считает та же query-версия, что и всё остальное.
   *
   * Отдельный `analytics.business.compare_years` отдавал ровно три числа —
   * выручку, число операций и клиентов — и по ним нельзя было ни объяснить
   * причину, ни назвать мастера. Здесь проверяется, что при
   * `previous_year_same_period` сервер сам разрешает ОБА окна в часовом поясе
   * салона: текущий год с 1 января по «сейчас» и тот же отрезок годом раньше.
   */
  it('resolves both year-to-date windows on the server for a year-over-year query', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:34:56.789Z'));
    const prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const getBusinessOverview = jest
      .fn()
      .mockResolvedValueOnce({
        data_source: 'crm',
        period: { from: 'from', to: 'to', timezone: 'Europe/Moscow' },
        appointments: { total: 120, active: 120, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 15_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [],
      })
      .mockResolvedValueOnce({
        data_source: 'crm',
        period: { from: 'from', to: 'to', timezone: 'Europe/Moscow' },
        appointments: { total: 100, active: 100, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 10_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [],
      });
    const analyticsService = {
      getBusinessOverview,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService, prisma });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'year_to_date', comparison: 'previous_year_same_period' },
      'execution-year-over-year',
    )) as Record<string, unknown>;

    expect(getBusinessOverview).toHaveBeenNthCalledWith(1, 'tenant-a', {
      from: '2025-12-31T21:00:00.000Z',
      to: '2026-08-06T12:34:56.789Z',
    });
    expect(getBusinessOverview).toHaveBeenNthCalledWith(2, 'tenant-a', {
      from: '2024-12-31T21:00:00.000Z',
      to: '2025-08-06T12:34:56.789Z',
    });
    expect(result).toMatchObject({
      verified: true,
      comparison: { mode: 'previous_year_same_period' },
      changes: {
        appointments_total: {
          current: 120,
          previous: 100,
          delta: 20,
          percent_change: 20,
        },
      },
    });
  });

  it('answers a universal business query with server-computed metric and service changes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    const getBusinessOverview = jest
      .fn()
      .mockResolvedValueOnce({
        data_source: 'maya',
        period: { from: 'current-from', to: 'current-to', timezone: 'UTC' },
        appointments: {
          total: 120,
          active: 108,
          cancelled: 12,
          cancellation_rate_percent: 10,
          unique_clients: 80,
          repeat_clients_in_period: 28,
          repeat_client_rate_percent: 35,
          identified_client_visits: 108,
          booked_minutes: 6_480,
        },
        revenue: [{ currency: 'RUB', amount_kopecks: 15_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 125_000 }],
        daily: [],
        staff: [],
        services: [
          {
            name: 'Мужская стрижка',
            appointments: 60,
            booked_value: [{ currency: 'RUB', amount_kopecks: 9_000_000 }],
          },
        ],
      })
      .mockResolvedValueOnce({
        data_source: 'maya',
        period: { from: 'previous-from', to: 'previous-to', timezone: 'UTC' },
        appointments: {
          total: 140,
          active: 132,
          cancelled: 8,
          cancellation_rate_percent: 5.7,
          unique_clients: 100,
          repeat_clients_in_period: 40,
          repeat_client_rate_percent: 40,
          identified_client_visits: 132,
          booked_minutes: 7_920,
        },
        revenue: [{ currency: 'RUB', amount_kopecks: 17_500_000 }],
        expenses: [],
        net: [],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 125_000 }],
        daily: [],
        staff: [],
        services: [
          {
            name: 'Мужская стрижка',
            appointments: 75,
            booked_value: [{ currency: 'RUB', amount_kopecks: 11_250_000 }],
          },
        ],
      });
    const analyticsService = {
      getBusinessOverview,
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    const result = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'month_to_date', comparison: 'previous_period' },
      'execution-universal-business',
    );

    expect(result).toMatchObject({
      verified: true,
      metrics: {
        revenue_amount_kopecks: 15_000_000,
        appointments_total: 120,
        unique_clients: 80,
        average_ticket_amount_kopecks: 125_000,
      },
      changes: {
        revenue_amount_kopecks: {
          current: 15_000_000,
          previous: 17_500_000,
          delta: -2_500_000,
          percent_change: -14.3,
        },
        unique_clients: {
          current: 80,
          previous: 100,
          delta: -20,
          percent_change: -20,
        },
      },
      service_changes: [
        {
          name: 'Мужская стрижка',
          current_appointments: 60,
          previous_appointments: 75,
          delta: -15,
          percent_change: -20,
        },
      ],
    });
    expect(getBusinessOverview).toHaveBeenCalledTimes(2);
  });

  it('matches one master across both periods by name and never exposes the CRM id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    const period = (staff: unknown[]) => ({
      data_source: 'maya',
      period: { from: 'from', to: 'to', timezone: 'UTC' },
      appointments: { total: 40, active: 40, cancelled: 0 },
      revenue: [{ currency: 'RUB', amount_kopecks: 1_000_000 }],
      expenses: [],
      net: [],
      average_ticket: [],
      daily: [],
      services: [],
      staff,
    });
    const getBusinessOverview = jest
      .fn()
      .mockResolvedValueOnce(
        period([
          // Порядок «кто первым вышел в смену»: в текущем периоде Илья идёт
          // первым, в прошлом — вторым. Сопоставление обязано идти по внешнему
          // id, а не по позиции в массиве.
          {
            staff_external_id: 'secret-b',
            name: 'Илья',
            appointments: 8,
            revenue: [{ currency: 'RUB', amount_kopecks: 400_000 }],
            booked_minutes: 240,
            services: [{ name: 'Борода', appointments: 8 }],
          },
          {
            staff_external_id: 'secret-a',
            name: 'Анна',
            appointments: 32,
            revenue: [{ currency: 'RUB', amount_kopecks: 600_000 }],
            booked_minutes: 960,
            services: [{ name: 'Мужская стрижка', appointments: 32 }],
          },
        ]),
      )
      .mockResolvedValueOnce(
        period([
          {
            staff_external_id: 'secret-a',
            name: 'Анна',
            appointments: 30,
            revenue: [{ currency: 'RUB', amount_kopecks: 600_000 }],
            booked_minutes: 900,
            services: [{ name: 'Мужская стрижка', appointments: 30 }],
          },
          {
            staff_external_id: 'secret-b',
            name: 'Илья',
            appointments: 20,
            revenue: [{ currency: 'RUB', amount_kopecks: 900_000 }],
            booked_minutes: 600,
            services: [{ name: 'Борода', appointments: 20 }],
          },
          // Мастер, которого в текущем периоде нет вовсе.
          {
            staff_external_id: 'secret-c',
            name: 'Пётр',
            appointments: 4,
            revenue: [],
            booked_minutes: 120,
            services: [{ name: 'Борода', appointments: 4 }],
          },
        ]),
      );
    const analyticsService = {
      getBusinessOverview,
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'month_to_date', comparison: 'previous_period' },
      'execution-staff-names',
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      current: {
        staff_summary: [
          {
            name: 'Илья',
            appointments: 8,
            booked_minutes: 240,
            services: [{ name: 'Борода', appointments: 8 }],
          },
          { name: 'Анна', appointments: 32 },
        ],
      },
      previous: {
        staff_summary: [
          { name: 'Анна', appointments: 30 },
          { name: 'Илья', appointments: 20 },
          { name: 'Пётр', appointments: 4 },
        ],
      },
      staff_changes: [
        {
          name: 'Илья',
          current_appointments: 8,
          previous_appointments: 20,
          delta: -12,
          percent_change: -60,
          // 🔴 Ради этого разреза всё и переделывалось: «у Ильи просела
          // «Борода» на 12 записей» берётся отсюда и больше ниоткуда.
          services: [
            {
              name: 'Борода',
              current_appointments: 8,
              previous_appointments: 20,
              delta: -12,
              percent_change: -60,
            },
          ],
        },
        {
          name: 'Пётр',
          current_appointments: 0,
          previous_appointments: 4,
          delta: -4,
          percent_change: -100,
          services: [
            {
              name: 'Борода',
              current_appointments: 0,
              previous_appointments: 4,
              delta: -4,
              percent_change: -100,
            },
          ],
        },
        {
          name: 'Анна',
          current_appointments: 32,
          previous_appointments: 30,
          delta: 2,
          services: [
            {
              name: 'Мужская стрижка',
              current_appointments: 32,
              previous_appointments: 30,
              delta: 2,
            },
          ],
        },
      ],
    });
    // 🔴 Внешний идентификатор CRM наружу не уходит ни при какой роли: он ключ
    // к чужой системе, а не показатель.
    expect(JSON.stringify(result)).not.toContain('secret-a');
    expect(JSON.stringify(result)).not.toContain('secret-b');
    expect(JSON.stringify(result)).not.toContain('secret-c');
    expect(JSON.stringify(result)).not.toContain('staff_external_id');
  });

  it('tells two masters with the same name apart instead of merging them', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'maya',
        period: { from: 'from', to: 'to', timezone: 'UTC' },
        appointments: { total: 30, active: 30, cancelled: 0 },
        revenue: [],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'secret-z',
            name: 'Илья',
            appointments: 10,
            revenue: [],
            booked_minutes: 300,
            services: [{ name: 'Борода', appointments: 10 }],
          },
          {
            staff_external_id: 'secret-a',
            name: 'Илья',
            appointments: 20,
            revenue: [],
            booked_minutes: 600,
            services: [{ name: 'Борода', appointments: 20 }],
          },
        ],
      }),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-staff-namesakes',
    )) as Record<string, unknown>;

    // Различитель раздаётся по отсортированному внешнему id, а не по порядку
    // строк: secret-a идёт раньше secret-z, поэтому «Илья» — тот, у кого 20
    // записей, независимо от того, кто первым вышел в смену.
    expect(published(result)).toMatchObject({
      staff_summary: [
        { name: 'Илья (2)', appointments: 10 },
        { name: 'Илья', appointments: 20 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('secret-a');
    expect(JSON.stringify(result)).not.toContain('secret-z');
  });

  it('keeps journal prices out of a CRM answer while names and services survive', async () => {
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'crm',
        period: {},
        appointments: { total: 8, active: 8, cancelled: 0 },
        revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [
          {
            name: 'Борода',
            appointments: 8,
            // 🔴 Цена из журнала записей, а не подтверждённая касса.
            booked_value: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
          },
        ],
        staff: [
          {
            staff_external_id: 'provider-secret-id',
            name: 'Илья',
            appointments: 8,
            revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
            booked_minutes: 240,
            services: [{ name: 'Борода', appointments: 8 }],
          },
        ],
      }),
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-crm-staff-failclosed',
    )) as Record<string, unknown>;

    expect(published(result)).toMatchObject({
      staff_summary: [
        {
          name: 'Илья',
          appointments: 8,
          // Стоимость записей журнала — не подтверждённые деньги: остаётся пустой.
          revenue: [],
          booked_minutes: 240,
          services: [{ name: 'Борода', appointments: 8 }],
        },
      ],
      // 🔴 Та же граница для услуг: журнальная цена не выдаётся за выручку.
      service_summary: [{ name: 'Борода', appointments: 8, booked_value: [] }],
    });
    expect(JSON.stringify(result)).not.toContain('provider-secret-id');
    expect(JSON.stringify(result)).not.toContain('9999999');
  });

  it('publishes client cohorts as metrics and compares them between periods', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    const period = (
      cohort: Record<string, unknown>,
      uniqueClients: number,
    ) => ({
      data_source: 'maya',
      period: { from: 'from', to: 'to', timezone: 'UTC' },
      appointments: {
        total: 100,
        active: 100,
        cancelled: 0,
        unique_clients: uniqueClients,
        // 🔴 Внутрипериодный показатель мал по природе: на неделе при цикле
        // стрижки в 3–4 недели повторов почти нет. Именно из-за него владельцу
        // сказали, что салон живёт на новых гостях.
        repeat_clients_in_period: 3,
        repeat_client_rate_percent: 3.2,
        cohort_status: 'available',
        cohort_unavailable_reason: null,
        cohort_lookback_days: 90,
        ...cohort,
      },
      revenue: [],
      expenses: [],
      net: [],
      average_ticket: [],
      daily: [],
      services: [],
      staff: [],
    });
    const getBusinessOverview = jest
      .fn()
      .mockResolvedValueOnce(
        period(
          {
            clients_returning: 62,
            clients_new: 32,
            returning_share_percent: 66,
          },
          94,
        ),
      )
      .mockResolvedValueOnce(
        period(
          {
            clients_returning: 50,
            clients_new: 40,
            returning_share_percent: 55.6,
          },
          90,
        ),
      );
    const analyticsService = {
      getBusinessOverview,
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'last_7_days', comparison: 'previous_period' },
      'execution-client-cohorts',
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      metrics: {
        clients_returning: 62,
        clients_new: 32,
        returning_share_percent: 66,
        // Горизонт — часть показателя: «вернувшихся 66%» без него не значит
        // ничего.
        cohort_lookback_days: 90,
        repeat_clients_in_period: 3,
      },
      changes: {
        clients_returning: { current: 62, previous: 50, delta: 12 },
        returning_share_percent: { current: 66, previous: 55.6 },
      },
    });
    expect(result.available_metrics).toEqual(
      expect.arrayContaining([
        'clients_returning',
        'clients_new',
        'returning_share_percent',
        'cohort_lookback_days',
      ]),
    );
    expect(result.unavailable_metrics).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ key: 'client_cohorts' }),
      ]),
    );
  });

  it('reports unavailable client cohorts with a reason instead of zeroes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'maya',
        period: { from: 'from', to: 'to', timezone: 'UTC' },
        appointments: {
          total: 100,
          active: 100,
          cancelled: 0,
          unique_clients: 94,
          clients_returning: null,
          clients_new: null,
          returning_share_percent: null,
          cohort_lookback_days: 90,
          cohort_status: 'unavailable',
          cohort_unavailable_reason: 'lookback_window_unavailable',
        },
        revenue: [],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [],
      }),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'last_7_days', comparison: 'none' },
      'execution-cohorts-unavailable',
    )) as Record<string, unknown>;

    // 🔴 Ноль здесь означал бы «вернувшихся нет». Недоступность обязана быть
    // названа словами, иначе модель посчитает её фактом.
    expect(result.metrics).toMatchObject({
      clients_returning: null,
      clients_new: null,
      returning_share_percent: null,
    });
    expect(result.available_metrics).toEqual(
      expect.not.arrayContaining([
        'clients_returning',
        'clients_new',
        'returning_share_percent',
      ]),
    );
    expect(result.unavailable_metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'client_cohorts',
          reason: stringContaining('90-day'),
        }),
      ]),
    );
  });

  it('compares cancellations and repeat clients per master without leaking the CRM id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T12:00:00.000Z'));
    const period = (staff: unknown[]) => ({
      data_source: 'crm',
      period: { from: 'from', to: 'to', timezone: 'UTC' },
      appointments: { total: 40, active: 36, cancelled: 4 },
      revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
      expenses: [],
      net: [],
      average_ticket: [],
      daily: [],
      services: [],
      staff,
    });
    const getBusinessOverview = jest
      .fn()
      .mockResolvedValueOnce(
        period([
          {
            staff_external_id: 'provider-secret-id',
            name: 'Илья',
            appointments: 8,
            cancelled: 6,
            cancellation_rate_percent: 42.9,
            unique_clients: 7,
            repeat_clients_in_period: 1,
            revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
            booked_minutes: 240,
            services: [{ name: 'Борода', appointments: 8 }],
          },
        ]),
      )
      .mockResolvedValueOnce(
        period([
          {
            staff_external_id: 'provider-secret-id',
            name: 'Илья',
            appointments: 20,
            cancelled: 2,
            cancellation_rate_percent: 9.1,
            unique_clients: 18,
            repeat_clients_in_period: 2,
            revenue: [{ currency: 'RUB', amount_kopecks: 9_999_999 }],
            booked_minutes: 600,
            services: [{ name: 'Борода', appointments: 20 }],
          },
        ]),
      );
    const analyticsService = {
      getBusinessOverview,
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = (await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      { period: 'last_7_days', comparison: 'previous_period' },
      'execution-staff-cancellations',
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      current: {
        staff_summary: [
          {
            name: 'Илья',
            appointments: 8,
            cancelled: 6,
            cancellation_rate_percent: 42.9,
            unique_clients: 7,
            repeat_clients_in_period: 1,
            // Журнальные цены в режиме внешней CRM деньгами не признаются.
            revenue: [],
          },
        ],
      },
      staff_changes: [
        {
          name: 'Илья',
          current_appointments: 8,
          previous_appointments: 20,
          current_cancelled: 6,
          previous_cancelled: 2,
          cancelled_delta: 4,
          current_cancellation_rate_percent: 42.9,
          previous_cancellation_rate_percent: 9.1,
          cancellation_rate_delta_percentage_points: 33.8,
          current_unique_clients: 7,
          previous_unique_clients: 18,
          unique_clients_delta: -11,
          current_repeat_clients_in_period: 1,
          previous_repeat_clients_in_period: 2,
          repeat_clients_delta: -1,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('provider-secret-id');
    expect(JSON.stringify(result)).not.toContain('9999999');
  });

  it('hides the named master breakdown from a role that only manages itself', async () => {
    const analyticsService = {
      getBusinessOverview: jest.fn().mockResolvedValue({
        data_source: 'maya',
        period: { from: 'from', to: 'to', timezone: 'UTC' },
        appointments: { total: 8, active: 8, cancelled: 0 },
        revenue: [],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        staff: [
          {
            staff_external_id: 'secret-a',
            name: 'Илья',
            appointments: 8,
            revenue: [],
            booked_minutes: 240,
            services: [{ name: 'Борода', appointments: 8 }],
          },
        ],
      }),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = (await service.execute(
      'analytics.business.query',
      // Каталог такую роль к бизнес-аналитике не пускает. Проверяем вторую
      // границу: даже если пустит, имена коллег с ней не поедут.
      { ...principal, role: UserRole.STAFF },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-staff-role-scope',
    )) as Record<string, unknown>;

    expect(
      (published(result) as Record<string, unknown>).staff_summary,
    ).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Илья');
  });

  it('shows a master only their own row even when the source returns colleagues', async () => {
    const analyticsService = {
      getEmployeeOverview: jest.fn().mockResolvedValue({
        data_source: 'maya',
        period: { from: 'from', to: 'to', timezone: 'UTC' },
        appointments: { total: 8, active: 8, cancelled: 0 },
        revenue: [],
        expenses: [],
        net: [],
        average_ticket: [],
        daily: [],
        services: [],
        employee: { provider_id: 'secret-self', name: 'Илья' },
        staff: [
          {
            staff_external_id: 'secret-self',
            name: 'Илья',
            appointments: 8,
            revenue: [],
            booked_minutes: 240,
            services: [{ name: 'Борода', appointments: 8 }],
          },
          // 🔴 Источник подмешал коллегу. Полагаться на его аккуратность нельзя.
          {
            staff_external_id: 'secret-colleague',
            name: 'Анна',
            appointments: 32,
            revenue: [],
            booked_minutes: 960,
            services: [{ name: 'Мужская стрижка', appointments: 32 }],
          },
        ],
      }),
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });

    const result = (await service.execute(
      'analytics.employee.query',
      { ...principal, userId: 'employee-user', role: UserRole.STAFF },
      {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        comparison: 'none',
      },
      'execution-employee-self-scope',
    )) as Record<string, unknown>;

    expect(published(result)).toMatchObject({
      staff_summary: [{ name: 'Илья', appointments: 8 }],
    });
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(JSON.stringify(result)).not.toContain('secret-self');
    expect(JSON.stringify(result)).not.toContain('secret-colleague');
  });

  it('keeps a universal employee query scoped to the current master', async () => {
    const getEmployeeOverview = jest
      .fn()
      .mockResolvedValueOnce({
        data_source: 'crm',
        period: { from: 'current-from', to: 'current-to', timezone: 'UTC' },
        appointments: {
          total: 20,
          active: 18,
          cancelled: 2,
          cancellation_rate_percent: 10,
          unique_clients: 15,
          repeat_clients_in_period: 3,
          repeat_client_rate_percent: 20,
          identified_client_visits: 18,
          booked_minutes: 1_080,
        },
        revenue: [{ currency: 'RUB', amount_kopecks: 3_000_000 }],
        expenses: [],
        net: [],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 150_000 }],
        daily: [],
        staff: [],
        services: [],
        employee: { provider_id: 'secret-provider', name: 'Анна' },
      })
      .mockResolvedValueOnce({
        data_source: 'crm',
        period: { from: 'previous-from', to: 'previous-to', timezone: 'UTC' },
        appointments: {
          total: 16,
          active: 16,
          cancelled: 0,
          cancellation_rate_percent: 0,
          unique_clients: 13,
          repeat_clients_in_period: 3,
          repeat_client_rate_percent: 23.1,
          identified_client_visits: 16,
          booked_minutes: 960,
        },
        revenue: [{ currency: 'RUB', amount_kopecks: 2_240_000 }],
        expenses: [],
        net: [],
        average_ticket: [{ currency: 'RUB', amount_kopecks: 140_000 }],
        daily: [],
        staff: [],
        services: [],
        employee: { provider_id: 'secret-provider', name: 'Анна' },
      });
    const analyticsService = {
      getEmployeeOverview,
      getStaffFinance: jest.fn().mockResolvedValue(null),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = createService({ analyticsService, prisma });

    const result = await service.execute(
      'analytics.employee.query',
      { ...principal, userId: 'employee-user', role: UserRole.EMPLOYEE },
      { period: 'month_to_date', comparison: 'previous_period' },
      'execution-universal-employee',
    );

    expect(result).toMatchObject({
      verified: true,
      metrics: {
        booked_value_amount_kopecks: 3_000_000,
        average_booked_value_amount_kopecks: 150_000,
        appointments_total: 20,
        unique_clients: 15,
      },
      changes: {
        booked_value_amount_kopecks: {
          delta: 760_000,
          percent_change: 33.9,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-provider');
    expect(JSON.stringify(result)).not.toContain('Анна');
    expect(getEmployeeOverview).toHaveBeenCalledTimes(2);
    expect(getEmployeeOverview).toHaveBeenCalledWith(
      'tenant-a',
      'employee-user',
      expect.any(Object),
    );
  });

  it('caches verified CRM operations even when the finance feed is unavailable', async () => {
    const getBusinessOverview = jest.fn().mockResolvedValue({
      data_source: 'crm',
      period: { from: 'from', to: 'to', timezone: 'UTC' },
      appointments: {
        total: 12,
        active: 12,
        cancelled: 0,
        cancellation_rate_percent: 0,
        unique_clients: 9,
        repeat_clients_in_period: 3,
        repeat_client_rate_percent: 33.3,
        identified_client_visits: 12,
        booked_minutes: 720,
      },
      revenue: [],
      expenses: [],
      net: [],
      average_ticket: [],
      daily: [],
      staff: [],
      services: [],
    });
    const getBusinessFinance = jest
      .fn()
      .mockRejectedValue(new Error('finance temporarily unavailable'));
    const analyticsService = {
      getBusinessOverview,
      getBusinessFinance,
    } as unknown as OperationsAnalyticsService;
    const service = createService({ analyticsService });
    const args = {
      period: 'custom',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      comparison: 'previous_period',
    };

    const first = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      args,
      'execution-crm-cache-a',
    );
    const second = await service.execute(
      'analytics.business.query',
      { ...principal, role: UserRole.TENANT_OWNER },
      args,
      'execution-crm-cache-b',
    );

    expect(first).toMatchObject({
      verified: true,
      finance_verified: false,
      metrics: { appointments_total: 12, unique_clients: 9 },
    });
    expect(second).toEqual(first);
    expect(getBusinessOverview).toHaveBeenCalledTimes(2);
    expect(getBusinessFinance).toHaveBeenCalledTimes(2);
  });

  /**
   * Опубликованный срез текущего периода из ответа query-инструмента.
   *
   * Обзорные `analytics.*.read` убраны, но их минимизация никуда не делась: тот
   * же `publishAnalytics` собирает `current` внутри query-версии. Проверки
   * приватности остались на месте — сменился только адрес.
   */
  function published(value: unknown): unknown {
    return (value as { current?: unknown }).current;
  }

  function createService(overrides: {
    crmService?: CrmService;
    appointmentsService?: AppointmentsService;
    expensesService?: ExpensesService;
    loyaltyService?: LoyaltyService;
    analyticsService?: OperationsAnalyticsService;
    prisma?: PrismaService;
    customersService?: CustomersService;
    staffService?: StaffService;
  }) {
    return new AiToolHandlerService(
      overrides.crmService ?? ({} as CrmService),
      overrides.appointmentsService ?? ({} as AppointmentsService),
      overrides.loyaltyService ?? ({} as LoyaltyService),
      overrides.analyticsService ?? ({} as OperationsAnalyticsService),
      overrides.expensesService ?? ({} as ExpensesService),
      overrides.prisma ??
        ({
          tenant: {
            findUnique: jest.fn().mockResolvedValue({
              calendarSource: 'external',
              defaultTimezone: 'UTC',
            }),
          },
          branch: { findFirst: jest.fn() },
        } as unknown as PrismaService),
      overrides.customersService ?? ({} as CustomersService),
      overrides.staffService ?? ({} as StaffService),
    );
  }
});
