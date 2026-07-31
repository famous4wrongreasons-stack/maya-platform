import { ForbiddenException } from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
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
    const crmService = {
      getJournal: crmGetJournal,
    } as unknown as CrmService;

    return {
      tenantContext,
      prisma,
      tenantsService,
      appointmentFindMany,
      expenseFindMany,
      crmGetJournal,
      getAppointmentQueryTenantId: () => appointmentQueryTenantId,
      getExpenseQueryTenantId: () => expenseQueryTenantId,
      service: new OperationsAnalyticsService(
        prisma,
        tenantContext,
        tenantsService,
        crmService,
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
});
