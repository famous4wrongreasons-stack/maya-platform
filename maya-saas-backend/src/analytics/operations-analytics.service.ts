import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import type { CrmFinancialSummary } from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';

type AnalyticsAppointment = {
  id: string;
  clientId: string | null;
  branchId: string | null;
  staffExternalId: string;
  /**
   * Имя мастера. Уходит в модель напрямую: имя сотрудника не является
   * персональными данными клиента, а без него разбор «у кого что просело»
   * невозможен. Кому показывать именованный разрез, решает слой
   * AI-инструментов по роли спрашивающего.
   */
  staffName: string | null;
  services: Array<{
    id: string;
    name: string;
    amountKopecks: number;
    currency: string;
  }>;
  startAt: Date;
  durationMinutes: number;
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

type AnalyticsStaffBreakdown = AnalyticsBreakdown & {
  name: string | null;
  bookedMinutes: number;
  /** Ключ — идентификатор услуги, чтобы одноимённые позиции не слипались. */
  services: Map<string, { name: string; appointments: number }>;
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
    const from = new Date(query.from);
    const to = new Date(query.to);
    const fullFinanceRangeMs = 31 * 24 * 60 * 60 * 1000;

    if (to.getTime() - from.getTime() <= fullFinanceRangeMs) {
      return this.crmService.getFinancialSummary(scopedTenantId, {
        from: query.from,
        to: query.to,
      });
    }

    // YClients limits payroll calculation to 31 days, while its verified
    // revenue feed supports annual comparisons. Keep the money facts
    // available for long owner reports and explicitly withhold payroll.
    const summary = await this.crmService.getRevenueSummary(scopedTenantId, {
      from: query.from,
      to: query.to,
    });
    const payroll: CrmFinancialSummary['payroll'] = {
      status: 'unavailable',
      verified: false,
      accrued_total: null,
      paid_total: null,
      balance_total: null,
      staff: [],
    };

    return {
      ...summary,
      verified: false,
      payroll,
      warnings: [
        ...summary.warnings,
        {
          code: 'crm_payroll_range_too_large',
          message:
            'Расчёт зарплаты доступен только за период до 31 дня. Выручка за выбранный период подтверждена CRM.',
        },
      ],
    } satisfies CrmFinancialSummary;
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
        : this.prisma.appointment
            .findMany({
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
                endAt: true,
                status: true,
                totalPriceKopecks: true,
                currency: true,
              },
              orderBy: { startAt: 'asc' },
            })
            .then((items) =>
              items.map((item) => ({
                ...item,
                services: [],
                staffName: null as string | null,
                durationMinutes:
                  item.endAt instanceof Date
                    ? Math.max(
                        0,
                        Math.round(
                          (item.endAt.getTime() - item.startAt.getTime()) /
                            60_000,
                        ),
                      )
                    : 0,
              })),
            ),
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
      external
        ? appointments
        : await this.withInternalProviderNames(scopedTenantId, appointments),
      expenses,
      tenant.defaultTimezone,
      from,
      to,
      external ? 'crm' : 'maya',
    );
  }

  /**
   * Имена мастеров внутреннего календаря одним запросом.
   *
   * Внешний журнал отдаёт имя вместе с записью, у внутреннего его нет — там
   * в записи лежит только идентификатор InternalProvider. Запрос ровно один,
   * по уже известному набору идентификаторов: разбивка по услугам считается
   * из тех же записей и в базу не ходит.
   */
  private async withInternalProviderNames(
    tenantId: string,
    appointments: AnalyticsAppointment[],
  ): Promise<AnalyticsAppointment[]> {
    const providerIds = [
      ...new Set(
        appointments
          .map((appointment) => appointment.staffExternalId)
          .filter((id): id is string => typeof id === 'string' && id !== ''),
      ),
    ];
    // Защита от подменённого prisma в юнит-тестах: имя — украшение отчёта,
    // из-за него аналитика падать не должна.
    if (
      providerIds.length === 0 ||
      typeof this.prisma.internalProvider?.findMany !== 'function'
    ) {
      return appointments;
    }
    const providers = await this.prisma.internalProvider.findMany({
      where: { tenantId, id: { in: providerIds } },
      select: { id: true, displayName: true },
    });
    const names = new Map(
      providers.map((provider) => [provider.id, provider.displayName]),
    );
    return appointments.map((appointment) => ({
      ...appointment,
      staffName: names.get(appointment.staffExternalId) ?? null,
    }));
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
          clientId: appointment.client.id,
          branchId: appointment.branch,
          staffExternalId: appointment.provider.id,
          staffName:
            typeof appointment.provider.name === 'string' &&
            appointment.provider.name.trim() !== ''
              ? appointment.provider.name.trim()
              : null,
          services: appointment.services.map((service) => ({
            id: service.id,
            name: service.name,
            amountKopecks: Math.round(service.price * 100),
            currency: service.currency,
          })),
          startAt,
          durationMinutes: Math.max(
            0,
            Math.round(
              (new Date(appointment.end_at).getTime() - startAt.getTime()) /
                60_000,
            ),
          ),
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
      activeAppointments
        .map((appointment) => appointment.clientId)
        .filter((clientId): clientId is string => clientId !== null),
    ).size;
    const unidentifiedClientAppointments = activeAppointments.filter(
      (appointment) => appointment.clientId === null,
    ).length;
    const identifiedClientVisits = new Map<string, number>();
    for (const appointment of activeAppointments) {
      if (!appointment.clientId) continue;
      identifiedClientVisits.set(
        appointment.clientId,
        (identifiedClientVisits.get(appointment.clientId) ?? 0) + 1,
      );
    }
    const repeatClientsInPeriod = [...identifiedClientVisits.values()].filter(
      (visits) => visits > 1,
    ).length;
    const bookedMinutes = activeAppointments.reduce(
      (total, appointment) => total + appointment.durationMinutes,
      0,
    );
    const daily = new Map<string, AnalyticsBreakdown>();
    const staff = new Map<string, AnalyticsStaffBreakdown>();
    const services = new Map<
      string,
      {
        name: string;
        appointments: number;
        revenueByCurrency: Map<string, number>;
      }
    >();

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
        name: null,
        appointments: 0,
        bookedMinutes: 0,
        revenueByCurrency: new Map<string, number>(),
        services: new Map<string, { name: string; appointments: number }>(),
      };
      staffItem.appointments += 1;
      staffItem.bookedMinutes += appointment.durationMinutes;
      staffItem.name ??= appointment.staffName;
      this.addRevenue(staffItem, appointment);
      staff.set(appointment.staffExternalId, staffItem);

      for (const service of appointment.services) {
        const serviceItem = services.get(service.id) ?? {
          name: service.name,
          appointments: 0,
          revenueByCurrency: new Map<string, number>(),
        };
        serviceItem.appointments += 1;
        serviceItem.revenueByCurrency.set(
          service.currency,
          (serviceItem.revenueByCurrency.get(service.currency) ?? 0) +
            service.amountKopecks,
        );
        services.set(service.id, serviceItem);

        // Разрез «мастер × услуга» собираем здесь же: отдельного обхода и
        // тем более отдельного запроса к CRM он не стоит.
        const staffService = staffItem.services.get(service.id) ?? {
          name: service.name,
          appointments: 0,
        };
        staffService.appointments += 1;
        staffItem.services.set(service.id, staffService);
      }
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
        cancellation_rate_percent:
          appointments.length === 0
            ? 0
            : Math.round((cancelledCount / appointments.length) * 1_000) / 10,
        unique_clients: uniqueClients,
        repeat_clients_in_period: repeatClientsInPeriod,
        repeat_client_rate_percent:
          uniqueClients === 0
            ? 0
            : Math.round((repeatClientsInPeriod / uniqueClients) * 1_000) / 10,
        identified_client_visits: [...identifiedClientVisits.values()].reduce(
          (total, visits) => total + visits,
          0,
        ),
        booked_minutes: bookedMinutes,
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
      // 🔴 Порядок обязан быть детерминированным: по нему слой AI-инструментов
      // различает тёзок («Илья» и «Илья (2)»). Раньше мастера шли в порядке
      // выхода в смену, и между двумя периодами один и тот же человек
      // оказывался на разных местах — различитель переезжал бы с одного на
      // другого, и сравнение периодов сопоставляло бы разных людей.
      staff: [...staff.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([staff_external_id, value]) => ({
          staff_external_id,
          name: value.name,
          appointments: value.appointments,
          revenue: this.serializeCurrencyMap(value.revenueByCurrency),
          booked_minutes: value.bookedMinutes,
          services: [...value.services.values()]
            .sort(
              (left, right) =>
                right.appointments - left.appointments ||
                left.name.localeCompare(right.name),
            )
            .map((service) => ({
              name: service.name,
              appointments: service.appointments,
            })),
        })),
      services: [...services.values()]
        .sort(
          (left, right) =>
            right.appointments - left.appointments ||
            left.name.localeCompare(right.name),
        )
        .map((value) => ({
          name: value.name,
          appointments: value.appointments,
          booked_value: this.serializeCurrencyMap(value.revenueByCurrency),
        })),
      data_quality: {
        priced_appointments: pricedAppointments.length,
        active_appointments: activeAppointments.length,
        unidentified_client_appointments: unidentifiedClientAppointments,
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
