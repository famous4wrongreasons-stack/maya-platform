import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';

type AnalyticsAppointment = {
  id: string;
  clientId: string;
  branchId: string | null;
  staffExternalId: string;
  startAt: Date;
  status: string;
  totalPriceKopecks: number | null;
  currency: string;
};

type AnalyticsExpense = {
  amountKopecks: number;
  currency: string;
  occurredAt: Date;
};

type AnalyticsBreakdown = {
  appointments: number;
  revenueByCurrency: Map<string, number>;
};

@Injectable()
export class OperationsAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantsService: TenantsService,
    private readonly crmService: CrmService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getBusinessOverview(tenantId: string, query: AnalyticsRangeQueryDto) {
    return this.buildOverview(tenantId, query, null);
  }

  async getBusinessFinance(tenantId: string, query: AnalyticsRangeQueryDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (query.branchId) {
      throw new BadRequestException({
        message:
          'CRM finance is scoped to the connected company and cannot be filtered by a Maya branch.',
        error: { code: 'crm_finance_branch_filter_not_supported' },
      });
    }
    return this.crmService.getFinancialSummary(scopedTenantId, {
      from: query.from,
      to: query.to,
    });
  }

  async getEmployeeOverview(
    tenantId: string,
    userId: string,
    query: AnalyticsRangeQueryDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { calendarSource: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const external =
      (tenant.calendarSource as CalendarSource) === CalendarSource.EXTERNAL;
    let providerId: string;
    let providerName: string;
    if (external) {
      const identity = await this.prisma.crmStaffAccess.findFirst({
        where: {
          tenantId: scopedTenantId,
          userId,
          status: 'active',
        },
        select: { externalStaffId: true, encryptedDisplayName: true },
      });
      if (!identity) {
        throw this.staffIdentityNotLinked();
      }
      providerId = identity.externalStaffId;
      providerName = this.encryptionService.decrypt(
        identity.encryptedDisplayName,
      );
    } else {
      const identity = await this.prisma.internalProvider.findFirst({
        where: { tenantId: scopedTenantId, userId, active: true },
        select: { id: true, displayName: true },
      });
      if (!identity) {
        throw this.staffIdentityNotLinked();
      }
      providerId = identity.id;
      providerName = identity.displayName;
    }

    const overview = await this.buildOverview(
      scopedTenantId,
      query,
      providerId,
    );
    return {
      ...overview,
      employee: { provider_id: providerId, name: providerName },
    };
  }

  private staffIdentityNotLinked(): NotFoundException {
    return new NotFoundException({
      message: 'Employee calendar identity is not linked.',
      error: {
        code: 'staff_identity_not_linked',
        message:
          'Link this user to a calendar provider before opening employee analytics.',
      },
    });
  }

  private async buildOverview(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
    staffExternalId: string | null,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const { from, to } = this.parseRange(query);
    if (query.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        query.branchId,
        scopedTenantId,
      );
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { defaultTimezone: true, calendarSource: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const external =
      (tenant.calendarSource as CalendarSource) === CalendarSource.EXTERNAL;
    const [appointments, expenses] = await Promise.all([
      external
        ? this.loadExternalAppointments(
            scopedTenantId,
            from,
            to,
            staffExternalId,
          )
        : this.prisma.appointment.findMany({
            where: {
              tenantId: scopedTenantId,
              startAt: { gte: from, lte: to },
              ...(query.branchId ? { branchId: query.branchId } : {}),
              ...(staffExternalId ? { staffExternalId } : {}),
            },
            select: {
              id: true,
              clientId: true,
              branchId: true,
              staffExternalId: true,
              startAt: true,
              status: true,
              totalPriceKopecks: true,
              currency: true,
            },
            orderBy: { startAt: 'asc' },
          }),
      staffExternalId
        ? Promise.resolve([] as AnalyticsExpense[])
        : this.prisma.expense.findMany({
            where: {
              tenantId: scopedTenantId,
              occurredAt: { gte: from, lte: to },
              ...(query.branchId ? { branchId: query.branchId } : {}),
            },
            select: {
              amountKopecks: true,
              currency: true,
              occurredAt: true,
            },
          }),
    ]);

    return this.aggregate(
      appointments,
      expenses,
      tenant.defaultTimezone,
      from,
      to,
      external ? 'crm' : 'maya',
    );
  }

  private async loadExternalAppointments(
    tenantId: string,
    from: Date,
    to: Date,
    providerId: string | null,
  ): Promise<AnalyticsAppointment[]> {
    if (from.getTime() === to.getTime()) {
      return [];
    }

    const maxChunkMs = 31 * 24 * 60 * 60 * 1000;
    const journals = [];
    let cursor = from.getTime();
    while (cursor < to.getTime()) {
      const chunkTo = Math.min(cursor + maxChunkMs, to.getTime());
      journals.push(
        await this.crmService.getJournal(tenantId, {
          from: new Date(cursor).toISOString(),
          to: new Date(chunkTo).toISOString(),
          ...(providerId ? { providerId } : {}),
        }),
      );
      cursor = chunkTo;
    }

    const unique = new Map<string, AnalyticsAppointment>();
    for (const journal of journals) {
      for (const appointment of journal.appointments) {
        const startAt = new Date(appointment.start_at);
        if (
          Number.isNaN(startAt.getTime()) ||
          startAt.getTime() < from.getTime() ||
          startAt.getTime() > to.getTime()
        ) {
          continue;
        }
        unique.set(appointment.id, {
          id: appointment.id,
          clientId: appointment.client.id ?? `anonymous:${appointment.id}`,
          branchId: appointment.branch,
          staffExternalId: appointment.provider.id,
          startAt,
          status: appointment.status,
          totalPriceKopecks:
            appointment.total_price === null
              ? null
              : Math.round(appointment.total_price * 100),
          currency: appointment.currency,
        });
      }
    }

    return [...unique.values()].sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
  }

  private aggregate(
    appointments: AnalyticsAppointment[],
    expenses: AnalyticsExpense[],
    timezone: string,
    from: Date,
    to: Date,
    dataSource: 'maya' | 'crm' = 'maya',
  ) {
    const activeAppointments = appointments.filter(
      (appointment) => !this.isCancelled(appointment.status),
    );
    const cancelledCount = appointments.length - activeAppointments.length;
    const pricedAppointments = activeAppointments.filter(
      (appointment) => appointment.totalPriceKopecks !== null,
    );
    const revenueByCurrency = this.sumByCurrency(
      pricedAppointments.map((appointment) => ({
        amountKopecks: appointment.totalPriceKopecks ?? 0,
        currency: appointment.currency,
      })),
    );
    const expensesByCurrency = this.sumByCurrency(expenses);
    const revenueMap = new Map(
      revenueByCurrency.map((item) => [item.currency, item.amount_kopecks]),
    );
    const expenseMap = new Map(
      expensesByCurrency.map((item) => [item.currency, item.amount_kopecks]),
    );
    const currencies = [
      ...new Set([...revenueMap.keys(), ...expenseMap.keys()]),
    ].sort((left, right) => left.localeCompare(right));
    const netByCurrency = currencies.map((currency) => ({
      currency,
      amount_kopecks:
        (revenueMap.get(currency) ?? 0) - (expenseMap.get(currency) ?? 0),
    }));
    const pricedCountByCurrency = new Map<string, number>();
    for (const appointment of pricedAppointments) {
      pricedCountByCurrency.set(
        appointment.currency,
        (pricedCountByCurrency.get(appointment.currency) ?? 0) + 1,
      );
    }
    const uniqueClients = new Set(
      activeAppointments.map((appointment) => appointment.clientId),
    ).size;
    const daily = new Map<string, AnalyticsBreakdown>();
    const staff = new Map<string, AnalyticsBreakdown>();

    for (const appointment of activeAppointments) {
      const day = this.dateKey(appointment.startAt, timezone);
      const dayItem = daily.get(day) ?? {
        appointments: 0,
        revenueByCurrency: new Map<string, number>(),
      };
      dayItem.appointments += 1;
      this.addRevenue(dayItem, appointment);
      daily.set(day, dayItem);

      const staffItem = staff.get(appointment.staffExternalId) ?? {
        appointments: 0,
        revenueByCurrency: new Map<string, number>(),
      };
      staffItem.appointments += 1;
      this.addRevenue(staffItem, appointment);
      staff.set(appointment.staffExternalId, staffItem);
    }

    return {
      data_source: dataSource,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone,
      },
      appointments: {
        total: appointments.length,
        active: activeAppointments.length,
        cancelled: cancelledCount,
        unique_clients: uniqueClients,
      },
      revenue: revenueByCurrency,
      expenses: expensesByCurrency,
      net: netByCurrency,
      average_ticket: revenueByCurrency.map((revenue) => ({
        currency: revenue.currency,
        amount_kopecks:
          (pricedCountByCurrency.get(revenue.currency) ?? 0) > 0
            ? Math.round(
                revenue.amount_kopecks /
                  (pricedCountByCurrency.get(revenue.currency) ?? 1),
              )
            : 0,
      })),
      daily: [...daily.entries()].map(([date, value]) => ({
        date,
        appointments: value.appointments,
        revenue: this.serializeCurrencyMap(value.revenueByCurrency),
      })),
      staff: [...staff.entries()].map(([staff_external_id, value]) => ({
        staff_external_id,
        appointments: value.appointments,
        revenue: this.serializeCurrencyMap(value.revenueByCurrency),
      })),
      data_quality: {
        priced_appointments: pricedAppointments.length,
        active_appointments: activeAppointments.length,
        revenue_coverage:
          activeAppointments.length === 0
            ? 1
            : pricedAppointments.length / activeAppointments.length,
        note:
          pricedAppointments.length === activeAppointments.length
            ? null
            : 'Appointments created before price snapshots are excluded from revenue.',
      },
    };
  }

  private sumByCurrency(
    items: Array<{ amountKopecks: number; currency: string }>,
  ) {
    const totals = new Map<string, number>();
    for (const item of items) {
      totals.set(
        item.currency,
        (totals.get(item.currency) ?? 0) + item.amountKopecks,
      );
    }
    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount_kopecks]) => ({ currency, amount_kopecks }));
  }

  private addRevenue(
    target: AnalyticsBreakdown,
    appointment: AnalyticsAppointment,
  ): void {
    if (appointment.totalPriceKopecks === null) {
      return;
    }
    target.revenueByCurrency.set(
      appointment.currency,
      (target.revenueByCurrency.get(appointment.currency) ?? 0) +
        appointment.totalPriceKopecks,
    );
  }

  private serializeCurrencyMap(amounts: Map<string, number>) {
    return [...amounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount_kopecks]) => ({ currency, amount_kopecks }));
  }

  private parseRange(query: AnalyticsRangeQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() > to.getTime()
    ) {
      throw new BadRequestException('Invalid analytics date range');
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Analytics date range cannot exceed 366 days',
      );
    }
    return { from, to };
  }

  private dateKey(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private isCancelled(status: string): boolean {
    return ['canceled', 'cancelled'].includes(status.trim().toLowerCase());
  }
}
