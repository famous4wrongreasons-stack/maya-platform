import { ForbiddenException } from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { OperationsAnalyticsService } from './operations-analytics.service';

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
          services: [],
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
    const crmService = {
      getJournal: crmGetJournal,
      getFinancialSummary: crmGetFinancialSummary,
    } as unknown as CrmService;

    return {
      tenantContext,
      prisma,
      tenantsService,
      appointmentFindMany,
      expenseFindMany,
      crmGetJournal,
      crmGetFinancialSummary,
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

  it('excludes cancellations and keeps all currencies explicit', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getBusinessOverview('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.appointments).toEqual({
      total: 4,
      active: 3,
      cancelled: 1,
      unique_clients: 3,
    });
    expect(result.revenue).toEqual([
      { currency: 'RUB', amount_kopecks: 10_000 },
      { currency: 'USD', amount_kopecks: 2_000 },
    ]);
    expect(result.expenses).toEqual([
      { currency: 'EUR', amount_kopecks: 3_000 },
      { currency: 'RUB', amount_kopecks: 2_500 },
    ]);
    expect(result.net).toEqual([
      { currency: 'EUR', amount_kopecks: -3_000 },
      { currency: 'RUB', amount_kopecks: 7_500 },
      { currency: 'USD', amount_kopecks: 2_000 },
    ]);
    expect(result.average_ticket).toEqual([
      { currency: 'RUB', amount_kopecks: 10_000 },
      { currency: 'USD', amount_kopecks: 2_000 },
    ]);
    expect(result.daily[0]).toMatchObject({
      appointments: 3,
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
      setup.service.getBusinessOverview('tenant-a', {
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
    );
    expect(result.data_source).toBe('crm');
    expect(result.appointments).toEqual({
      total: 2,
      active: 1,
      cancelled: 1,
      unique_clients: 1,
    });
    expect(result.revenue).toEqual([
      { currency: 'RUB', amount_kopecks: 250_000 },
    ]);
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
});
