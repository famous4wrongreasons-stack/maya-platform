import { ForbiddenException } from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  CLIENT_COHORT_LOOKBACK_DAYS,
  MARKETING_ROI_UNAVAILABLE,
  OperationsAnalyticsService,
  type ProfitabilityCohortSource,
} from './operations-analytics.service';

describe('OperationsAnalyticsService', () => {
  const createService = (
    calendarSource: CalendarSource = CalendarSource.INTERNAL,
  ) => {
    const tenantContext = new TenantContextService();
    let appointmentQueryTenantId: string | null = null;
    let expenseQueryTenantId: string | null = null;
    const appointmentFindMany = jest.fn(
      (args: { where: { tenantId: string } }) => {
        appointmentQueryTenantId = args.where.tenantId;
        return Promise.resolve([
          {
            id: 'appointment-rub',
            clientId: 'client-a',
            branchId: null,
            staffExternalId: 'staff-a',
            startAt: new Date('2026-07-10T09:00:00.000Z'),
            status: 'confirmed',
            totalPriceKopecks: 10_000,
            currency: 'RUB',
          },
          {
            id: 'appointment-cancelled',
            clientId: 'client-a',
            branchId: null,
            staffExternalId: 'staff-a',
            startAt: new Date('2026-07-10T10:00:00.000Z'),
            status: 'canceled',
            totalPriceKopecks: 5_000,
            currency: 'RUB',
          },
          {
            id: 'appointment-legacy',
            clientId: 'client-b',
            branchId: null,
            staffExternalId: 'staff-b',
            startAt: new Date('2026-07-10T11:00:00.000Z'),
            status: 'confirmed',
            totalPriceKopecks: null,
            currency: 'RUB',
          },
          {
            id: 'appointment-usd',
            clientId: 'client-c',
            branchId: null,
            staffExternalId: 'staff-b',
            startAt: new Date('2026-07-10T12:00:00.000Z'),
            status: 'confirmed',
            totalPriceKopecks: 2_000,
            currency: 'USD',
          },
        ]);
      },
    );
    const expenseFindMany = jest.fn((args: { where: { tenantId: string } }) => {
      expenseQueryTenantId = args.where.tenantId;
      return Promise.resolve([
        {
          amountKopecks: 2_500,
          currency: 'RUB',
          occurredAt: new Date('2026-07-10T08:00:00.000Z'),
        },
        {
          amountKopecks: 3_000,
          currency: 'EUR',
          occurredAt: new Date('2026-07-10T08:00:00.000Z'),
        },
      ]);
    });
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultTimezone: 'Europe/Moscow',
          calendarSource,
        }),
      },
      appointment: { findMany: appointmentFindMany },
      expense: { findMany: expenseFindMany },
      internalProvider: { findFirst: jest.fn() },
      crmStaffAccess: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const tenantsService = {
      assertBranchBelongsToTenant: jest.fn(),
    } as unknown as TenantsService;
    const crmGetJournal = jest.fn().mockResolvedValue({
      calendar_source: 'external',
      timezone: 'Europe/Moscow',
      range: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      },
      provider_id: null,
      count: 2,
      appointments: [
        {
          id: 'crm-active',
          client: { id: 'crm-client', name: 'Client' },
          provider: { id: 'crm-staff', name: 'Provider' },
          branch: null,
          service_ids: ['service-a'],
          services: [
            {
              id: 'service-a',
              name: 'Мужская стрижка',
              price: 2_500,
              currency: 'RUB',
            },
          ],
          start_at: '2026-07-10T09:00:00.000Z',
          end_at: '2026-07-10T10:00:00.000Z',
          status: 'confirmed',
          notes: null,
          total_price: 2_500,
          currency: 'RUB',
        },
        {
          id: 'crm-cancelled',
          client: { id: 'crm-client-2', name: 'Client 2' },
          provider: { id: 'crm-staff', name: 'Provider' },
          branch: null,
          service_ids: ['service-a'],
          services: [],
          start_at: '2026-07-11T09:00:00.000Z',
          end_at: '2026-07-11T10:00:00.000Z',
          status: 'cancelled',
          notes: null,
          total_price: 3_000,
          currency: 'RUB',
        },
      ],
    });
    const crmGetFinancialSummary = jest.fn().mockResolvedValue({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: {
        from: '2026-07-01',
        to: '2026-07-31',
        timezone: 'Europe/Moscow',
      },
      revenue: {
        status: 'available',
        verified: true,
        transaction_count: 10,
        total: { currency: 'RUB', amount_kopecks: 250_000 },
        by_type: [],
        by_account: [],
      },
      payroll: {
        status: 'available',
        verified: true,
        accrued_total: { currency: 'RUB', amount_kopecks: 100_000 },
        paid_total: { currency: 'RUB', amount_kopecks: 80_000 },
        balance_total: { currency: 'RUB', amount_kopecks: 20_000 },
        staff: [],
      },
      warnings: [],
    });
    const crmGetRevenueSummary = jest.fn().mockResolvedValue({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: {
        from: '2026-01-01',
        to: '2026-08-01',
        timezone: 'Europe/Moscow',
      },
      revenue: {
        status: 'available',
        verified: true,
        transaction_count: 2_100,
        total: { currency: 'RUB', amount_kopecks: 3_500_000 },
        by_type: [],
        by_account: [],
      },
      warnings: [],
    });
    const crmService = {
      getJournal: crmGetJournal,
      getFinancialSummary: crmGetFinancialSummary,
      getRevenueSummary: crmGetRevenueSummary,
    } as unknown as CrmService;

    return {
      tenantContext,
      prisma,
      tenantsService,
      appointmentFindMany,
      expenseFindMany,
      crmGetJournal,
      crmGetFinancialSummary,
      crmGetRevenueSummary,
      getAppointmentQueryTenantId: () => appointmentQueryTenantId,
      getExpenseQueryTenantId: () => expenseQueryTenantId,
      service: new OperationsAnalyticsService(
        prisma,
        tenantContext,
        tenantsService,
        crmService,
        {
          encrypt: (value: string) => `enc:${value}`,
          decrypt: (value: string) => value.replace(/^enc:/, ''),
        } as EncryptionService,
      ),
    };
  };

  /**
   * Внутренний календарь с раздельными ответами на окно и на lookback.
   *
   * Общий `createService` отдаёт один и тот же список на любой запрос, а
   * когорты только тем и заняты, что отличают визиты ДО периода от визитов
   * внутри него. Поэтому здесь запросы различаются: у основного среза в
   * `select` есть `id`, у прохода за историей — только клиент и статус.
   */
  const createCohortService = (options: {
    windowAppointments: Array<Record<string, unknown>>;
    lookback:
      Array<{ clientId: string | null; status: string }> | 'unavailable';
  }) => {
    const tenantContext = new TenantContextService();
    const lookbackQueries: Array<Record<string, unknown>> = [];
    const appointmentFindMany = jest.fn(
      (args: {
        where: Record<string, unknown>;
        select: Record<string, boolean>;
      }) => {
        if (args.select?.id === true) {
          return Promise.resolve(options.windowAppointments);
        }
        lookbackQueries.push(args.where);
        return options.lookback === 'unavailable'
          ? Promise.reject(new Error('calendar unavailable'))
          : Promise.resolve(options.lookback);
      },
    );
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultTimezone: 'Europe/Moscow',
          calendarSource: CalendarSource.INTERNAL,
        }),
      },
      appointment: { findMany: appointmentFindMany },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      internalProvider: { findFirst: jest.fn() },
      crmStaffAccess: { findFirst: jest.fn() },
    } as unknown as PrismaService;

    return {
      tenantContext,
      appointmentFindMany,
      lookbackQueries,
      service: new OperationsAnalyticsService(
        prisma,
        tenantContext,
        { assertBranchBelongsToTenant: jest.fn() } as unknown as TenantsService,
        { getJournal: jest.fn() } as unknown as CrmService,
        {
          encrypt: (value: string) => `enc:${value}`,
          decrypt: (value: string) => value,
        } as EncryptionService,
      ),
    };
  };

  const internalVisit = (
    id: string,
    clientId: string | null,
    startAt: string,
    status = 'confirmed',
  ) => ({
    id,
    clientId,
    branchId: null,
    staffExternalId: 'staff-a',
    startAt: new Date(startAt),
    endAt: new Date(new Date(startAt).getTime() + 30 * 60_000),
    status,
    totalPriceKopecks: 200_000,
    currency: 'RUB',
  });

  it('counts a client with an earlier visit as returning and one without as new', async () => {
    const setup = createCohortService({
      windowAppointments: [
        internalVisit('a', 'client-regular', '2026-07-10T09:00:00.000Z'),
        internalVisit('b', 'client-first-time', '2026-07-11T09:00:00.000Z'),
      ],
      // Визит того же клиента ДО начала окна — на этом и держится когорта.
      lookback: [{ clientId: 'client-regular', status: 'confirmed' }],
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments).toMatchObject({
      unique_clients: 2,
      clients_returning: 1,
      clients_new: 1,
      returning_share_percent: 50,
      cohort_lookback_days: 90,
      cohort_status: 'available',
      cohort_unavailable_reason: null,
      // 🔴 Внутрипериодный показатель остаётся нулём — и именно поэтому по нему
      // нельзя было судить об удержании: оба клиента приходили по одному разу.
      repeat_clients_in_period: 0,
    });
    // История берётся ровно за горизонт и строго ДО начала периода.
    expect(setup.lookbackQueries).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-a',
        startAt: {
          gte: new Date('2026-04-02T00:00:00.000Z'),
          lte: new Date('2026-06-30T23:59:59.999Z'),
        },
      }),
    ]);
    // Один запрос за окно и один за историю — больше ничего.
    expect(setup.appointmentFindMany).toHaveBeenCalledTimes(2);
  });

  it('does not count a cancelled earlier appointment as a previous visit', async () => {
    const setup = createCohortService({
      windowAppointments: [
        internalVisit('a', 'client-a', '2026-07-10T09:00:00.000Z'),
      ],
      lookback: [{ clientId: 'client-a', status: 'canceled' }],
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments).toMatchObject({
      clients_returning: 0,
      clients_new: 1,
      returning_share_percent: 0,
      cohort_status: 'available',
    });
  });

  it('marks cohorts unavailable instead of zero when the history cannot be read', async () => {
    const setup = createCohortService({
      windowAppointments: [
        internalVisit('a', 'client-a', '2026-07-10T09:00:00.000Z'),
      ],
      lookback: 'unavailable',
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    // 🔴 Ноль здесь читался бы как «вернувшихся нет» — ровно то враньё, ради
    // которого когорты и делались. Недоступность обязана быть видимой.
    expect(result.appointments).toMatchObject({
      clients_returning: null,
      clients_new: null,
      returning_share_percent: null,
      cohort_lookback_days: 90,
      cohort_status: 'unavailable',
      cohort_unavailable_reason: 'lookback_window_unavailable',
    });
    // Остальная аналитика от недоступной истории не страдает.
    expect(result.appointments.unique_clients).toBe(1);
  });

  it('refuses cohorts for a period longer than the lookback horizon without extra queries', async () => {
    const setup = createCohortService({
      windowAppointments: [
        internalVisit('a', 'client-a', '2026-03-10T09:00:00.000Z'),
      ],
      lookback: [],
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments).toMatchObject({
      clients_returning: null,
      clients_new: null,
      cohort_lookback_days: 90,
      cohort_status: 'unavailable',
      cohort_unavailable_reason: 'period_longer_than_cohort_lookback',
    });
    expect(setup.lookbackQueries).toEqual([]);
    expect(setup.appointmentFindMany).toHaveBeenCalledTimes(1);
  });

  it('excludes cancellations and keeps all currencies explicit', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOperationalOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments).toMatchObject({
      total: 4,
      active: 3,
      scheduled: 3,
      completed: 0,
      cancelled: 1,
      no_show: 0,
      cancellation_rate_percent: 25,
      unique_clients: 3,
      repeat_clients_in_period: 0,
      repeat_client_rate_percent: 0,
      identified_client_visits: 3,
      booked_minutes: 0,
    });
    expect(result.revenue).toEqual([
      { currency: 'RUB', amount_kopecks: 10_000 },
      { currency: 'USD', amount_kopecks: 2_000 },
    ]);
    expect(result.expenses).toEqual([
      { currency: 'EUR', amount_kopecks: 3_000 },
      { currency: 'RUB', amount_kopecks: 2_500 },
    ]);
    // 🔴 Прибыли в операционном обзоре нет. Раньше здесь стояло 7 500 ₽ по
    // рублям — «выручка минус расходы», где выручка была суммой цен из журнала
    // записей, а расходы — тем, что владелец успел завести руками. Обе части
    // не те, чем кажутся, и вместе давали прибыль почти равную выручке.
    expect(result.net).toEqual([]);
    expect(result.net_status).toBe('unavailable');
    expect(result.net_unavailable_reason).toContain('till_confirmed_cash');
    expect(result.average_ticket).toEqual([
      { currency: 'RUB', amount_kopecks: 10_000 },
      { currency: 'USD', amount_kopecks: 2_000 },
    ]);
    expect(result.daily[0]).toMatchObject({
      appointments: 3,
      total: 4,
      active: 3,
      scheduled: 3,
      completed: 0,
      cancelled: 1,
      no_show: 0,
      revenue: [
        { currency: 'RUB', amount_kopecks: 10_000 },
        { currency: 'USD', amount_kopecks: 2_000 },
      ],
    });
    expect(result.data_quality).toMatchObject({
      priced_appointments: 2,
      active_appointments: 3,
      revenue_coverage: 2 / 3,
    });
    expect(setup.getAppointmentQueryTenantId()).toBe('tenant-a');
    expect(setup.getExpenseQueryTenantId()).toBe('tenant-a');
  });

  it('rejects a tenant mismatch before any analytics query', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.getBusinessOverview('tenant-b', {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-31T23:59:59.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.appointmentFindMany).not.toHaveBeenCalled();
    expect(setup.expenseFindMany).not.toHaveBeenCalled();
  });

  it('uses the external CRM journal for business analytics', async () => {
    const setup = createService(CalendarSource.EXTERNAL);

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOperationalOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(setup.appointmentFindMany).not.toHaveBeenCalled();
    expect(setup.crmGetJournal).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
      // Аналитика просит отменённые визиты отдельным флагом: без него счётчик
      // отмен всегда ноль, и «отмен нет» звучало бы как измерение.
      { includeCanceled: true },
    );
    expect(result.data_source).toBe('crm');
    expect(result.appointments).toMatchObject({
      total: 2,
      active: 1,
      cancelled: 1,
      cancellation_rate_percent: 50,
      unique_clients: 1,
      repeat_clients_in_period: 0,
      repeat_client_rate_percent: 0,
      identified_client_visits: 1,
      booked_minutes: 60,
    });
    expect(result.revenue).toEqual([
      { currency: 'RUB', amount_kopecks: 250_000 },
    ]);
    expect(result.services).toEqual([
      {
        service_external_id: 'service-a',
        name: 'Мужская стрижка',
        appointments: 1,
        booked_value: [{ currency: 'RUB', amount_kopecks: 250_000 }],
      },
    ]);
  });

  it('breaks the CRM journal down by master and service in a stable order', async () => {
    const setup = createService(CalendarSource.EXTERNAL);
    const appointment = (
      id: string,
      providerId: string,
      providerName: string,
      serviceId: string,
      serviceName: string,
      startAt: string,
    ) => ({
      id,
      client: { id: `client-${id}`, name: 'Client' },
      provider: { id: providerId, name: providerName },
      branch: null,
      service_ids: [serviceId],
      services: [
        { id: serviceId, name: serviceName, price: 2_000, currency: 'RUB' },
      ],
      start_at: startAt,
      end_at: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
      status: 'confirmed',
      notes: null,
      total_price: 2_000,
      currency: 'RUB',
    });
    setup.crmGetJournal.mockResolvedValue({
      calendar_source: 'external',
      timezone: 'Europe/Moscow',
      range: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      },
      provider_id: null,
      count: 3,
      appointments: [
        // Первым в смену вышел мастер «b» — в выдаче он всё равно обязан
        // встать по идентификатору, иначе различитель тёзок поедет между
        // периодами.
        appointment(
          'crm-1',
          'staff-b',
          'Илья',
          'service-beard',
          'Борода',
          '2026-07-10T09:00:00.000Z',
        ),
        appointment(
          'crm-2',
          'staff-a',
          'Анна',
          'service-cut',
          'Мужская стрижка',
          '2026-07-10T10:00:00.000Z',
        ),
        appointment(
          'crm-3',
          'staff-b',
          'Илья',
          'service-beard',
          'Борода',
          '2026-07-11T09:00:00.000Z',
        ),
      ],
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOperationalOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.staff).toEqual([
      {
        staff_external_id: 'staff-a',
        staff_id: null,
        name: 'Анна',
        total: 1,
        appointments: 1,
        scheduled: 1,
        completed: 0,
        cancelled: 0,
        no_show: 0,
        cancellation_rate_percent: 0,
        unique_clients: 1,
        repeat_clients_in_period: 0,
        revenue: [{ currency: 'RUB', amount_kopecks: 200_000 }],
        booked_minutes: 30,
        services: [{ name: 'Мужская стрижка', appointments: 1 }],
      },
      {
        staff_external_id: 'staff-b',
        staff_id: null,
        name: 'Илья',
        total: 2,
        appointments: 2,
        scheduled: 2,
        completed: 0,
        cancelled: 0,
        no_show: 0,
        cancellation_rate_percent: 0,
        unique_clients: 2,
        repeat_clients_in_period: 0,
        revenue: [{ currency: 'RUB', amount_kopecks: 400_000 }],
        booked_minutes: 60,
        services: [{ name: 'Борода', appointments: 2 }],
      },
    ]);
    // Разбивка по мастерам не должна стоить ни одного лишнего обращения к CRM:
    // единственные запросы — один за сам период и проход за lookback-окно
    // когорт, который читается теми же чанками по 31 дню (90 дней → 3 чанка).
    expect(setup.crmGetJournal).toHaveBeenCalledTimes(4);
  });

  it('counts cancellations per master and keeps a master who only had cancellations', async () => {
    const setup = createService(CalendarSource.EXTERNAL);
    const journalAppointment = (
      id: string,
      providerId: string,
      providerName: string,
      status: string,
      startAt: string,
      clientId: string,
    ) => ({
      id,
      client: { id: clientId, name: 'Client' },
      provider: { id: providerId, name: providerName },
      branch: null,
      service_ids: ['service-cut'],
      services: [
        {
          id: 'service-cut',
          name: 'Мужская стрижка',
          price: 2_000,
          currency: 'RUB',
        },
      ],
      start_at: startAt,
      end_at: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
      status,
      notes: null,
      total_price: 2_000,
      currency: 'RUB',
    });
    setup.crmGetJournal.mockResolvedValue({
      calendar_source: 'external',
      timezone: 'Europe/Moscow',
      range: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      },
      provider_id: null,
      count: 5,
      appointments: [
        journalAppointment(
          'a-1',
          'staff-a',
          'Анна',
          'confirmed',
          '2026-07-10T09:00:00.000Z',
          'client-1',
        ),
        journalAppointment(
          'a-2',
          'staff-a',
          'Анна',
          'confirmed',
          '2026-07-12T09:00:00.000Z',
          'client-1',
        ),
        journalAppointment(
          'a-3',
          'staff-a',
          'Анна',
          'cancelled',
          '2026-07-13T09:00:00.000Z',
          'client-2',
        ),
        // Мастер, у которого в периоде НИЧЕГО, кроме отмен: без отдельного
        // прохода он исчезал из разреза целиком.
        journalAppointment(
          'b-1',
          'staff-b',
          'Илья',
          'canceled',
          '2026-07-14T09:00:00.000Z',
          'client-3',
        ),
        journalAppointment(
          'b-2',
          'staff-b',
          'Илья',
          'cancelled',
          '2026-07-15T09:00:00.000Z',
          'client-4',
        ),
      ],
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.staff).toMatchObject([
      {
        staff_external_id: 'staff-a',
        staff_id: null,
        name: 'Анна',
        appointments: 2,
        cancelled: 1,
        cancellation_rate_percent: 33.3,
        unique_clients: 1,
        repeat_clients_in_period: 1,
      },
      {
        staff_external_id: 'staff-b',
        staff_id: null,
        name: 'Илья',
        appointments: 0,
        cancelled: 2,
        cancellation_rate_percent: 100,
        unique_clients: 0,
        repeat_clients_in_period: 0,
      },
    ]);
    // Отмены не должны утекать в активные записи салона.
    expect(result.appointments).toMatchObject({
      total: 5,
      active: 2,
      cancelled: 3,
    });
  });

  it('reads the cohort history for external CRM in one extra chunked journal pass', async () => {
    const setup = createService(CalendarSource.EXTERNAL);
    let inFlight = 0;
    let maxInFlight = 0;
    const visit = (id: string, clientId: string, startAt: string) => ({
      id,
      client: { id: clientId, name: 'Client' },
      provider: { id: 'staff-a', name: 'Анна' },
      branch: null,
      service_ids: [],
      services: [],
      start_at: startAt,
      end_at: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
      status: 'confirmed',
      notes: null,
      total_price: 2_000,
      currency: 'RUB',
    });
    const windowStart = new Date('2026-07-01T00:00:00.000Z').getTime();
    setup.crmGetJournal.mockImplementation(
      async (_tenantId: string, range: { from: string; to: string }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          calendar_source: 'external',
          timezone: 'Europe/Moscow',
          range,
          provider_id: null,
          count: 1,
          appointments:
            new Date(range.from).getTime() >= windowStart
              ? [
                  visit('w-1', 'client-regular', '2026-07-10T09:00:00.000Z'),
                  visit('w-2', 'client-first-time', '2026-07-11T09:00:00.000Z'),
                ]
              : [visit('h-1', 'client-regular', '2026-06-15T09:00:00.000Z')],
        };
      },
    );

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments).toMatchObject({
      unique_clients: 2,
      clients_returning: 1,
      clients_new: 1,
      returning_share_percent: 50,
      cohort_lookback_days: 90,
      cohort_status: 'available',
    });
    // 🔴 Один запрос за сам период плюс ОДИН проход за историю, нарезанный на
    // чанки по 31 дню (90 дней → 3). Ни одного обращения сверх этого: добор
    // истории по каждому клиенту превратил бы вопрос в чате в сотню запросов.
    expect(setup.crmGetJournal).toHaveBeenCalledTimes(4);
    const historyRanges = setup.crmGetJournal.mock.calls
      .map(([, range]: [string, { from: string; to: string }]) => range)
      .filter((range) => new Date(range.from).getTime() < windowStart);
    expect(historyRanges).toHaveLength(3);
    expect(historyRanges[0].from).toBe('2026-04-02T00:00:00.000Z');
    expect(historyRanges[2].to).toBe('2026-06-30T23:59:59.999Z');
    expect(maxInFlight).toBeGreaterThanOrEqual(3);
  });

  it('names internal calendar masters from their provider card in one query', async () => {
    const setup = createService();
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'staff-a', displayName: 'Илья' }]);
    (
      setup.prisma as unknown as {
        internalProvider: { findMany: jest.Mock };
      }
    ).internalProvider.findMany = findMany;

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['staff-a', 'staff-b'] } },
      select: { id: true, displayName: true },
    });
    expect(result.staff).toMatchObject([
      { staff_external_id: 'staff-a', name: 'Илья', appointments: 1 },
      // Карточки нет — имени тоже, но показатели мастера остаются.
      { staff_external_id: 'staff-b', name: null, appointments: 2 },
    ]);
  });

  it('does not turn unidentified CRM appointments into unique clients', async () => {
    const setup = createService(CalendarSource.EXTERNAL);
    setup.crmGetJournal.mockResolvedValue({
      calendar_source: 'external',
      timezone: 'Europe/Moscow',
      range: {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      },
      provider_id: null,
      count: 1,
      appointments: [
        {
          id: 'crm-anonymous',
          client: { id: null, name: 'Клиент' },
          provider: { id: 'crm-staff', name: 'Мастер' },
          branch: null,
          service_ids: ['service-a'],
          services: [],
          start_at: '2026-07-10T09:00:00.000Z',
          end_at: '2026-07-10T10:00:00.000Z',
          status: 'confirmed',
          notes: null,
          total_price: 2_500,
          currency: 'RUB',
        },
      ],
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments.unique_clients).toBe(0);
    expect(result.data_quality.unidentified_client_appointments).toBe(1);
  });

  it('uses the tenant-scoped CRM staff link for employee analytics', async () => {
    const setup = createService(CalendarSource.EXTERNAL);
    const crmStaffFindFirst = (
      setup.prisma.crmStaffAccess.findFirst as jest.Mock
    ).mockResolvedValue({
      externalStaffId: 'crm-staff',
      encryptedDisplayName: 'enc:Илья',
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getEmployeeOverview('tenant-a', 'staff-user', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(crmStaffFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        userId: 'staff-user',
        status: 'active',
      },
      select: { externalStaffId: true, encryptedDisplayName: true },
    });
    expect(setup.crmGetJournal).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ providerId: 'crm-staff' }),
      { includeCanceled: true },
    );
    expect(result.employee).toEqual({
      provider_id: 'crm-staff',
      name: 'Илья',
    });
  });

  it('returns tenant-scoped verified CRM finance without local calculations', async () => {
    const setup = createService(CalendarSource.EXTERNAL);

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessFinance('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T20:59:59.000Z',
      }),
    );

    expect(setup.crmGetFinancialSummary).toHaveBeenCalledWith('tenant-a', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T20:59:59.000Z',
    });
    expect(result).toMatchObject({
      source: 'external_crm',
      verified: true,
      revenue: {
        total: { currency: 'RUB', amount_kopecks: 250_000 },
      },
      payroll: {
        accrued_total: { currency: 'RUB', amount_kopecks: 100_000 },
      },
    });
    expect(setup.appointmentFindMany).not.toHaveBeenCalled();
    expect(setup.expenseFindMany).not.toHaveBeenCalled();
  });

  it('keeps verified CRM revenue for long ranges and withholds payroll', async () => {
    const setup = createService(CalendarSource.EXTERNAL);

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessFinance('tenant-a', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-08-06T20:59:59.000Z',
      }),
    );

    expect(setup.crmGetFinancialSummary).not.toHaveBeenCalled();
    expect(setup.crmGetRevenueSummary).toHaveBeenCalledWith('tenant-a', {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-08-06T20:59:59.000Z',
    });
    expect(result).toMatchObject({
      source: 'external_crm',
      verified: false,
      revenue: {
        status: 'available',
        verified: true,
        total: { currency: 'RUB', amount_kopecks: 3_500_000 },
      },
      payroll: {
        status: 'unavailable',
        verified: false,
        accrued_total: null,
        paid_total: null,
        balance_total: null,
        staff: [],
      },
      warnings: [{ code: 'crm_payroll_range_too_large' }],
    });
  });

  it('rejects a finance tenant mismatch before contacting the CRM', async () => {
    const setup = createService(CalendarSource.EXTERNAL);

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.getBusinessFinance('tenant-b', {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-31T20:59:59.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.crmGetFinancialSummary).not.toHaveBeenCalled();
  });

  it('returns the whole payroll for a staff-scoped finance read so the caller can pick one row', async () => {
    const setup = createService(CalendarSource.EXTERNAL);

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getStaffFinance('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T20:59:59.000Z',
      }),
    );

    // 🔴 Источник company-scoped: «только про меня» у провайдера не существует,
    // и сужение до одного сотрудника — обязанность вызывающего.
    expect(setup.crmGetFinancialSummary).toHaveBeenCalledWith('tenant-a', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T20:59:59.000Z',
    });
    expect(result).toMatchObject({
      payroll: { accrued_total: { amount_kopecks: 100_000 } },
    });
  });

  it('degrades a staff-scoped finance read to nothing instead of failing personal analytics', async () => {
    const setup = createService(CalendarSource.EXTERNAL);
    setup.crmGetFinancialSummary.mockRejectedValueOnce(
      new Error('crm is unavailable'),
    );

    const failed = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getStaffFinance('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T20:59:59.000Z',
      }),
    );
    const branchScoped = await setup.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        setup.service.getStaffFinance('tenant-a', {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-31T20:59:59.000Z',
          branchId: '11111111-1111-4111-8111-111111111111',
        }),
    );

    expect(failed).toBeNull();
    // Расчёт зарплаты ведётся по компании и к филиалу не сводится — за ним даже
    // не идём.
    expect(branchScoped).toBeNull();
    expect(setup.crmGetFinancialSummary).toHaveBeenCalledTimes(1);
  });

  it('rejects a misleading Maya branch filter for company-wide CRM finance', async () => {
    const setup = createService(CalendarSource.EXTERNAL);

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.getBusinessFinance('tenant-a', {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-31T20:59:59.000Z',
          branchId: '11111111-1111-4111-8111-111111111111',
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'crm_finance_branch_filter_not_supported' },
      },
    });
    expect(setup.crmGetFinancialSummary).not.toHaveBeenCalled();
  });

  /**
   * Прибыль и стоимость нового клиента.
   *
   * 🔴 Всё, что здесь проверяется, — про один и тот же класс вранья: показать
   * владельцу число, которое выглядит как прибыль, но собрано не из того.
   */
  describe('profitability', () => {
    const createProfitabilityService = (options: {
      calendarSource?: CalendarSource;
      expenses?: Array<{
        category: string;
        amountKopecks: number;
        currency: string;
        occurredAt: Date;
      }>;
      expensesUnavailable?: boolean;
      revenueKopecks?: number | null;
      revenueVerified?: boolean;
      payrollAccruedKopecks?: number | null;
      financeFails?: boolean;
      expenseDeclaration?: boolean;
    }) => {
      const tenantContext = new TenantContextService();
      const expenseFindMany = jest.fn(() =>
        options.expensesUnavailable
          ? Promise.reject(new Error('expense ledger unavailable'))
          : Promise.resolve(options.expenses ?? []),
      );
      const prisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultTimezone: 'Europe/Moscow',
            calendarSource: options.calendarSource ?? CalendarSource.EXTERNAL,
          }),
        },
        appointment: { findMany: jest.fn().mockResolvedValue([]) },
        expense: { findMany: expenseFindMany },
        expensePeriodDeclaration: {
          findUnique: jest.fn().mockResolvedValue(
            options.expenseDeclaration === false
              ? null
              : {
                  id: 'expense-declaration-a',
                  tenantId: 'tenant-a',
                  declaredById: 'owner-a',
                  periodFromDay: '2026-07-01',
                  periodToDay: '2026-07-31',
                  idempotencyKey: null,
                  createdAt: new Date('2026-07-31T21:00:00.000Z'),
                  updatedAt: new Date('2026-07-31T21:00:00.000Z'),
                },
          ),
        },
        internalProvider: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        crmStaffAccess: { findFirst: jest.fn() },
      } as unknown as PrismaService;
      const revenueKopecks =
        options.revenueKopecks === undefined
          ? 1_000_000
          : options.revenueKopecks;
      const payrollAccruedKopecks =
        options.payrollAccruedKopecks === undefined
          ? null
          : options.payrollAccruedKopecks;
      const crmGetFinancialSummary = jest.fn(() =>
        options.financeFails
          ? Promise.reject(new Error('crm finance is unavailable'))
          : Promise.resolve({
              source: 'external_crm',
              provider: 'yclients',
              verified: true,
              period: {
                from: '2026-07-01',
                to: '2026-07-31',
                timezone: 'Europe/Moscow',
              },
              revenue: {
                status: revenueKopecks === null ? 'unavailable' : 'available',
                verified: options.revenueVerified ?? true,
                transaction_count: 120,
                total:
                  revenueKopecks === null
                    ? null
                    : { currency: 'RUB', amount_kopecks: revenueKopecks },
                by_type: [],
                by_account: [],
                by_staff: [],
                staff_attribution_status: 'unavailable',
                staff_attribution_coverage_percent: null,
                unattributed_service_total: null,
                unattributed_service_transaction_count: 0,
              },
              payroll: {
                status:
                  payrollAccruedKopecks === null ? 'unavailable' : 'available',
                verified: payrollAccruedKopecks !== null,
                accrued_total:
                  payrollAccruedKopecks === null
                    ? null
                    : {
                        currency: 'RUB',
                        amount_kopecks: payrollAccruedKopecks,
                      },
                paid_total: null,
                balance_total: null,
                staff: [],
              },
              warnings: [],
            }),
      );
      /**
       * Журнал записей нарочно «богаче» кассы: 50 000 ₽ записанных услуг
       * против 10 000 ₽ подтверждённой кассы. Если прибыль хоть где-то
       * возьмёт цены расписания вместо кассы, числа разойдутся в пять раз и
       * тест это увидит.
       */
      const crmGetJournal = jest.fn().mockResolvedValue({
        calendar_source: 'external',
        timezone: 'Europe/Moscow',
        range: { from: '', to: '' },
        provider_id: null,
        count: 1,
        appointments: [
          {
            id: 'journal-rich',
            client: { id: 'client-1', name: 'Client' },
            provider: { id: 'staff-1', name: 'Provider' },
            branch: null,
            service_ids: ['service-a'],
            services: [
              {
                id: 'service-a',
                name: 'Мужская стрижка',
                price: 50_000,
                currency: 'RUB',
              },
            ],
            start_at: '2026-07-10T09:00:00.000Z',
            end_at: '2026-07-10T10:00:00.000Z',
            status: 'confirmed',
            notes: null,
            total_price: 50_000,
            currency: 'RUB',
          },
        ],
      });
      const crmService = {
        getJournal: crmGetJournal,
        getFinancialSummary: crmGetFinancialSummary,
        getRevenueSummary: jest.fn(),
      } as unknown as CrmService;

      return {
        tenantContext,
        expenseFindMany,
        crmGetFinancialSummary,
        crmGetJournal,
        service: new OperationsAnalyticsService(
          prisma,
          tenantContext,
          {
            assertBranchBelongsToTenant: jest.fn(),
          } as unknown as TenantsService,
          crmService,
          {
            encrypt: (value: string) => `enc:${value}`,
            decrypt: (value: string) => value,
          } as EncryptionService,
        ),
      };
    };

    const july = {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T20:59:59.000Z',
    };

    const expense = (
      category: string,
      amountKopecks: number,
      currency = 'RUB',
    ) => ({
      category,
      amountKopecks,
      currency,
      occurredAt: new Date('2026-07-05T09:00:00.000Z'),
    });

    const cohorts = (
      clientsNew: number | null,
      status: 'available' | 'unavailable' = 'available',
      reason: string | null = null,
    ): ProfitabilityCohortSource => ({
      appointments: {
        clients_new: clientsNew,
        cohort_status: status,
        cohort_unavailable_reason: reason,
        cohort_lookback_days: CLIENT_COHORT_LOOKBACK_DAYS,
      },
    });

    it('computes profit from till-confirmed cash and not from journal prices', async () => {
      const setup = createProfitabilityService({
        // Подтверждённая касса 10 000 ₽ — она и есть база прибыли.
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.confirmed_revenue).toMatchObject({
        status: 'available',
        verified: true,
        source: 'crm_financial_transactions',
        total: { currency: 'RUB', amount_kopecks: 1_000_000 },
      });
      expect(result.completeness).toMatchObject({ status: 'complete' });
      // 10 000 ₽ кассы − 3 000 ₽ зарплаты − 2 000 ₽ аренды = 5 000 ₽.
      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: {
          currency: 'RUB',
          amount_kopecks: 500_000,
          amount_major_units: 5_000,
        },
        margin_percent: 50,
        unavailable_reason: null,
      });
      expect(setup.crmGetFinancialSummary).toHaveBeenCalledTimes(1);
    });

    it('ignores the booked value of the journal even when it loads the overview itself', async () => {
      const setup = createProfitabilityService({
        // Касса 10 000 ₽, а записанных услуг в журнале на 50 000 ₽.
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () => setup.service.getBusinessProfitability('tenant-a', july),
      );

      // Журнал прочитан — из него берутся когорты для стоимости гостя.
      expect(setup.crmGetJournal).toHaveBeenCalled();
      // Но прибыль всё равно от кассы: 10 000 − 5 000 = 5 000 ₽, а не
      // 50 000 − 5 000 = 45 000 ₽.
      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: { amount_kopecks: 500_000, amount_major_units: 5_000 },
      });
      expect(result.confirmed_revenue.total).toMatchObject({
        amount_kopecks: 1_000_000,
      });
    });

    it('calculates from recorded expenses and treats unrecorded additions as zero', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('coffee', 50_000)],
        expenseDeclaration: false,
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: { amount_kopecks: 650_000, amount_major_units: 6_500 },
        margin_percent: 65,
        unavailable_reason: null,
        calculation_basis: 'recorded_expenses_only',
        unrecorded_additional_expenses_assumed_zero: true,
      });
      expect(result.completeness).toMatchObject({
        status: 'provisional',
        owner_confirmation_required: false,
        owner_confirmation_recommended: true,
        unrecorded_additional_expenses_assumed_zero: true,
        calculation_basis: 'recorded_expenses_only',
        owner_declaration: null,
        missing_categories: [],
        understated_categories: [],
      });
      expect(result.payroll).toMatchObject({
        status: 'available',
        owner_can_record: false,
      });
      expect(result.unavailable_metrics).not.toContainEqual(
        expect.objectContaining({ key: 'net_profit' }),
      );
    });

    it('computes clean profit when the owner confirms there are no additional expenses', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.completeness).toMatchObject({
        status: 'complete',
        owner_confirmation_required: false,
        owner_declaration: {
          period_from_day: '2026-07-01',
          period_to_day: '2026-07-31',
        },
      });
      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: { amount_kopecks: 700_000, amount_major_units: 7_000 },
        unavailable_reason: null,
      });
    });

    it('subtracts additional expenses entered in chat without requiring rent', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('supplies', 40_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.completeness).toMatchObject({
        status: 'complete',
        missing_categories: [],
        understated_categories: [],
      });
      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: { amount_kopecks: 660_000, amount_major_units: 6_600 },
      });
    });

    it('accepts a category synonym so a real ledger is not called incomplete', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        // Владелец написал слаги по-своему: справочника категорий в базе нет.
        expenses: [expense('arenda', 200_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.completeness.status).toBe('complete');
      expect(result.completeness.missing_categories).toEqual([]);
      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: { amount_kopecks: 500_000 },
      });
    });

    it('counts salary once when CRM payroll and a manual salary expense both exist', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000), expense('salary', 900_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      // 🔴 Сложение обеих зарплат дало бы расходов на 14 000 ₽ и «убыток»
      // −4 000 ₽ там, где салон в плюсе на 5 000 ₽.
      expect(result.expenses.totals).toEqual([
        { currency: 'RUB', amount_kopecks: 500_000, amount_major_units: 5_000 },
      ]);
      expect(result.expenses.salary_source).toBe('crm_payroll');
      expect(result.expenses.by_category).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'salary',
            source: 'crm_payroll',
            amount_kopecks: 300_000,
          }),
        ]),
      );
      expect(
        result.expenses.by_category.filter((row) => row.category === 'salary'),
      ).toHaveLength(1);
      expect(result.expenses.ignored_manual_salary).toEqual([
        { currency: 'RUB', amount_kopecks: 900_000, amount_major_units: 9_000 },
      ]);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'manual_salary_expenses_replaced_by_crm_payroll',
        }),
      );
      expect(result.net_profit).toMatchObject({
        status: 'available',
        total: { amount_kopecks: 500_000 },
      });
    });

    it('refuses profit when the CRM gave no payroll, and does not ask to enter it by hand', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        // Расчёт есть, но он нулевой — значит за период его просто не сделали.
        payrollAccruedKopecks: 0,
        expenses: [expense('rent', 200_000), expense('salary', 300_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      // 🔴 Замкнутый круг: раньше ручная зарплата закрывала гейт, хотя вносить
      // её запрещено, и MAYA советовала сделать невозможное. Теперь зарплата
      // признаётся только из расчёта CRM, а её отсутствие — отдельная причина.
      expect(result.expenses.salary_source).toBe('owner_manual');
      expect(result.payroll).toMatchObject({
        status: 'unavailable',
        unavailable_reason:
          'salary_comes_only_from_the_crm_payroll_calculation_and_the_crm_returned_none_for_this_period',
        owner_can_record: false,
      });
      expect(result.net_profit).toMatchObject({
        status: 'unavailable',
        total: null,
        unavailable_reason:
          'salary_comes_only_from_the_crm_payroll_calculation_and_the_crm_returned_none_for_this_period',
      });
      // И список «что внести» пуст: аренда есть, а зарплату вносить нельзя.
      expect(result.net_profit.missing_categories).toEqual([]);
    });

    it('refuses profit for an internal calendar because there is no till at all', async () => {
      const setup = createProfitabilityService({
        calendarSource: CalendarSource.INTERNAL,
        expenses: [expense('rent', 200_000), expense('salary', 300_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(setup.crmGetFinancialSummary).not.toHaveBeenCalled();
      expect(result.confirmed_revenue).toMatchObject({
        status: 'unavailable',
        total: null,
        unavailable_reason:
          'internal_calendar_records_booked_appointment_prices_and_has_no_till_confirmed_cash',
      });
      // Расходы полные, а прибыли всё равно нет: вычитать не из чего.
      expect(result.completeness.status).toBe('complete');
      expect(result.net_profit).toMatchObject({
        status: 'unavailable',
        total: null,
        unavailable_reason:
          'profit_requires_till_confirmed_cash_and_there_is_none_for_this_period',
      });
    });

    it('refuses profit when the CRM did not confirm the cash', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        revenueVerified: false,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.confirmed_revenue).toMatchObject({
        status: 'unavailable',
        unavailable_reason:
          'crm_finance_returned_no_usable_revenue_block_for_this_period',
      });
      expect(result.net_profit.status).toBe('unavailable');
    });

    it('refuses to net expenses recorded in another currency', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000), expense('supplies', 5_000, 'EUR')],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      // Отбросить евро значило бы занизить расходы и завысить прибыль — курса
      // у нас нет, поэтому отказ.
      expect(result.net_profit).toMatchObject({
        status: 'unavailable',
        unavailable_reason:
          'expenses_and_confirmed_cash_are_recorded_in_different_currencies_and_cannot_be_netted',
      });
    });

    it('refuses profit for a branch filter without touching the CRM or the ledger', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', {
            ...july,
            branchId: '11111111-1111-4111-8111-111111111111',
          }),
      );

      expect(setup.crmGetFinancialSummary).not.toHaveBeenCalled();
      expect(setup.expenseFindMany).not.toHaveBeenCalled();
      expect(result.net_profit.unavailable_reason).toBe(
        'crm_confirms_cash_for_the_whole_company_and_has_no_branch_split',
      );
      expect(result.client_acquisition_cost.unavailable_reason).toBe(
        'marketing_spend_and_client_cohorts_are_company_scoped_and_have_no_branch_split',
      );
    });

    it('refuses everything when the expense ledger cannot be read', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expensesUnavailable: true,
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(4),
          }),
      );

      expect(result.expenses.status).toBe('unavailable');
      expect(result.net_profit.unavailable_reason).toBe(
        'expense_ledger_did_not_answer_for_this_period',
      );
      expect(result.client_acquisition_cost.unavailable_reason).toBe(
        'expense_ledger_did_not_answer_for_this_period',
      );
    });

    it('computes the cost of a new client and always carries the cohort horizon', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000), expense('ads', 600_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(4),
          }),
      );

      expect(result.client_acquisition_cost).toMatchObject({
        status: 'available',
        // 6 000 ₽ рекламы на 4 новых гостя — 1 500 ₽ за гостя.
        cost_per_new_client: {
          currency: 'RUB',
          amount_kopecks: 150_000,
          amount_major_units: 1_500,
        },
        marketing_spend: { currency: 'RUB', amount_kopecks: 600_000 },
        new_clients: 4,
        cohort_lookback_days: CLIENT_COHORT_LOOKBACK_DAYS,
        unavailable_reason: null,
      });
      // Реклама остаётся обычным расходом и участвует в прибыли.
      expect(result.expenses.totals).toEqual([
        {
          currency: 'RUB',
          amount_kopecks: 1_100_000,
          amount_major_units: 11_000,
        },
      ]);
    });

    it('refuses the cost of a new client instead of dividing by zero', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000), expense('marketing', 600_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(0),
          }),
      );

      expect(result.client_acquisition_cost).toMatchObject({
        status: 'unavailable',
        cost_per_new_client: null,
        marketing_spend: { amount_kopecks: 600_000 },
        new_clients: 0,
        cohort_lookback_days: CLIENT_COHORT_LOOKBACK_DAYS,
        unavailable_reason:
          'this_period_has_no_new_clients_so_cost_per_new_client_has_no_denominator',
      });
    });

    it('carries the cohort reason when new clients cannot be counted at all', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000), expense('marketing', 600_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(
              null,
              'unavailable',
              'lookback_window_unavailable',
            ),
          }),
      );

      expect(result.client_acquisition_cost).toMatchObject({
        status: 'unavailable',
        cost_per_new_client: null,
        new_clients: null,
        unavailable_reason: 'lookback_window_unavailable',
      });
    });

    it('refuses the cost of a new client when no advertising is recorded', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(4),
          }),
      );

      expect(result.client_acquisition_cost).toMatchObject({
        status: 'unavailable',
        cost_per_new_client: null,
        marketing_spend: null,
        new_clients: 4,
        unavailable_reason:
          'no_advertising_expenses_are_recorded_for_this_period',
      });
    });

    it('reports marketing ROI as permanently unavailable and points at the cost of a new client', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
        payrollAccruedKopecks: 300_000,
        expenses: [expense('rent', 200_000), expense('ads', 600_000)],
      });

      const result = await setup.tenantContext.runAsSystemTenant(
        'tenant-a',
        () =>
          setup.service.getBusinessProfitability('tenant-a', july, {
            overview: cohorts(4),
          }),
      );

      expect(result.unavailable_metrics).toContainEqual({
        key: 'marketing_roi',
        reason: MARKETING_ROI_UNAVAILABLE,
        nearest_available_metric: 'client_acquisition_cost',
      });
      expect(MARKETING_ROI_UNAVAILABLE).toContain('attribution');
    });

    it('rejects a profitability tenant mismatch before any query', async () => {
      const setup = createProfitabilityService({
        revenueKopecks: 1_000_000,
      });

      await expect(
        setup.tenantContext.runAsSystemTenant('tenant-a', () =>
          setup.service.getBusinessProfitability('tenant-b', july),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(setup.expenseFindMany).not.toHaveBeenCalled();
      expect(setup.crmGetFinancialSummary).not.toHaveBeenCalled();
    });
  });
});
