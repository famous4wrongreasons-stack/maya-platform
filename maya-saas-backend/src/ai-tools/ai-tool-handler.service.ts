import { ForbiddenException, Injectable } from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import type { AnalyticsRangeQueryDto } from '../analytics/dto/analytics-range-query.dto';
import { AppointmentsService } from '../appointments/appointments.service';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import type { StaffScheduleSlot } from '../crm/crm-adapter.interface';
import { CustomersService } from '../customers/customers.service';
import { ExpensesService } from '../expenses/expenses.service';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import type {
  AiToolPrincipal,
  ValidatedAiToolArguments,
} from './ai-tool.types';

const CRM_FINANCE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
]);
const SCHEDULE_MANAGER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
]);

@Injectable()
export class AiToolHandlerService {
  constructor(
    private readonly crmService: CrmService,
    private readonly appointmentsService: AppointmentsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly analyticsService: OperationsAnalyticsService,
    private readonly expensesService: ExpensesService,
    private readonly customersService: CustomersService,
    private readonly staffService: StaffService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ): Promise<unknown> {
    switch (toolName) {
      case 'catalog.services.read':
        return this.readServices(principal.tenantId);
      case 'catalog.staff.read':
        return this.readStaff(principal.tenantId);
      case 'booking.availability.read':
        return this.readAvailability(principal.tenantId, args);
      case 'appointments.own.list':
        return this.listOwnAppointments(principal);
      case 'loyalty.own.read':
        return this.readOwnLoyalty(principal);
      case 'analytics.employee.read': {
        const query = await this.reportingQuery(principal.tenantId, args);
        return this.readAnalytics(
          this.analyticsService.getEmployeeOverview(
            principal.tenantId,
            principal.userId,
            query,
          ),
        );
      }
      case 'analytics.business.read': {
        const query = await this.reportingQuery(principal.tenantId, args);
        return this.readBusinessAnalytics(principal, query);
      }
      case 'analytics.business.compare_years':
        return this.compareBusinessYears(principal);
      case 'expenses.read':
        return this.readExpenses(principal.tenantId, args);
      case 'customers.count':
        return this.customersService.countCustomers(principal.tenantId);
      case 'appointments.own.cancel':
        return this.cancelOwnAppointment(principal, args);
      case 'appointments.own.preview':
        return this.previewOwnAppointment(principal, args);
      case 'appointments.own.create':
        return this.createOwnAppointment(principal, args);
      case 'appointments.own.reschedule':
        return this.rescheduleOwnAppointment(principal, args);
      case 'staff.schedule.update':
        return this.applyStaffScheduleDayChange(principal, args);
      case 'loyalty.internal.adjust':
        return this.adjustInternalLoyalty(principal, args, idempotencyKey);
      default:
        throw new Error('Unreachable AI tool handler');
    }
  }

  private async readServices(tenantId: string) {
    const services = await this.crmService.getServices(tenantId);
    return {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        price: service.price,
        duration_minutes: service.duration_minutes,
        currency: service.currency,
        category: service.category ?? null,
      })),
    };
  }

  private async listOwnAppointments(principal: AiToolPrincipal) {
    const appointments = await this.appointmentsService.listClientAppointments(
      principal.tenantId,
      principal.userId,
    );
    return {
      appointments: appointments.map((item) => this.safeAppointment(item)),
    };
  }

  private async readStaff(tenantId: string) {
    const staff = await this.staffService.listStaff(tenantId);
    return {
      staff: staff.map((item, index) => ({
        id: item.id,
        label: `specialist_${index + 1}`,
        title: item.title ?? null,
        specialization: item.specialization ?? null,
      })),
    };
  }

  private async readAvailability(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    const slots = await this.appointmentsService.getAvailableSlots(tenantId, {
      date: this.requiredString(args.date),
      ...(typeof args.staff_id === 'string' ? { staffId: args.staff_id } : {}),
      ...(Array.isArray(args.service_ids)
        ? { serviceIds: this.stringArray(args.service_ids) }
        : {}),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    });
    return {
      slots: slots.map((slot) => ({
        start: slot.start,
        end: slot.end,
        staff_id: slot.staff_id,
        branch_id: slot.branch_id ?? null,
      })),
    };
  }

  private async readOwnLoyalty(principal: AiToolPrincipal) {
    const loyalty = await this.loyaltyService.getForUser(
      principal.tenantId,
      principal.userId,
    );
    return this.safeLoyalty(loyalty);
  }

  private async applyStaffScheduleDayChange(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!SCHEDULE_MANAGER_ROLES.has(principal.role)) {
      throw new ForbiddenException({
        message: 'Staff schedule management is not available to this role.',
        error: { code: 'staff_schedule_forbidden' },
      });
    }
    const result = await this.crmService.applyStaffScheduleDayChange(
      principal.tenantId,
      {
        staffId: this.requiredString(args.staff_id),
        date: this.requiredString(args.date),
        slots: this.scheduleSlots(args.slots),
        expectedRevision: this.requiredString(args.current_revision),
      },
    );
    return {
      status: 'applied',
      date: result.date,
      is_working: result.is_working,
      slots: result.slots,
      verified: result.verified,
      existing_appointments_preserved: true,
    };
  }

  private async readExpenses(tenantId: string, args: ValidatedAiToolArguments) {
    const result = await this.expensesService.list(
      tenantId,
      await this.reportingQuery(tenantId, args),
    );
    return {
      items: result.items.map((item) => ({
        id: item.id,
        branch_id: item.branch_id,
        category: item.category,
        amount_kopecks: item.amount_kopecks,
        amount_major_units: this.majorUnits(item.amount_kopecks),
        currency: item.currency,
        occurred_at: item.occurred_at,
      })),
      totals: this.safeMoneyEntries(result.totals),
      truncated: result.truncated,
    };
  }

  private async readAnalytics(resultPromise: Promise<unknown>) {
    return this.safeAnalytics(await resultPromise);
  }

  private async readBusinessAnalytics(
    principal: AiToolPrincipal,
    query: AnalyticsRangeQueryDto,
  ) {
    const overview = this.record(
      await this.analyticsService.getBusinessOverview(
        principal.tenantId,
        query,
      ),
    );
    const operational = this.safeAnalytics(overview);
    if (overview.data_source !== 'crm') {
      return operational;
    }

    const failClosed = {
      ...operational,
      revenue: [],
      expenses: [],
      net: [],
      average_ticket: [],
      daily: operational.daily.map((entry) => ({ ...entry, revenue: [] })),
      staff_summary: operational.staff_summary.map((entry) => ({
        ...entry,
        revenue: [],
      })),
    };

    if (query.branchId) {
      return {
        ...failClosed,
        finance: this.unavailableFinance('company_scope_only'),
      };
    }
    if (!CRM_FINANCE_ROLES.has(principal.role)) {
      return {
        ...failClosed,
        finance: this.unavailableFinance('role_restricted'),
      };
    }

    try {
      const summary = this.record(
        await this.analyticsService.getBusinessFinance(
          principal.tenantId,
          query,
        ),
      );
      const revenue = this.record(summary.revenue);
      const payroll = this.record(summary.payroll);
      const revenueTotal =
        revenue.status === 'available' && revenue.verified === true
          ? this.safeMoneyAmount(revenue.total)
          : null;
      const payrollAvailable =
        payroll.status === 'available' && payroll.verified === true;

      return {
        ...failClosed,
        period: summary.period ?? failClosed.period,
        revenue: revenueTotal ? [revenueTotal] : [],
        finance: {
          source: summary.source ?? 'external_crm',
          provider: summary.provider ?? null,
          verified: summary.verified === true,
          revenue: {
            status: revenue.status ?? 'unavailable',
            verified: revenue.verified === true,
            transaction_count:
              typeof revenue.transaction_count === 'number'
                ? revenue.transaction_count
                : null,
            total: revenueTotal,
          },
          payroll: {
            status: payroll.status ?? 'unavailable',
            verified: payroll.verified === true,
            accrued_total: payrollAvailable
              ? this.safeMoneyAmount(payroll.accrued_total)
              : null,
            paid_total: payrollAvailable
              ? this.safeMoneyAmount(payroll.paid_total)
              : null,
            balance_total: payrollAvailable
              ? this.safeMoneyAmount(payroll.balance_total)
              : null,
          },
          warning_codes: this.safeWarningCodes(summary.warnings),
        },
      };
    } catch {
      return {
        ...failClosed,
        finance: this.unavailableFinance('finance_unavailable'),
      };
    }
  }

  private async compareBusinessYears(principal: AiToolPrincipal) {
    const ranges = await this.businessYearComparisonRanges(principal.tenantId);
    const [currentSummary, previousSummary] = await Promise.all([
      this.crmService.getRevenueSummary(principal.tenantId, ranges.current),
      this.crmService.getRevenueSummary(principal.tenantId, ranges.previous),
    ]);
    const currentRevenue = this.record(currentSummary.revenue);
    const previousRevenue = this.record(previousSummary.revenue);
    const currentTotal = this.safeMoneyAmount(currentRevenue.total);
    const previousTotal = this.safeMoneyAmount(previousRevenue.total);
    const currentTransactions = this.optionalMetricNumber(
      currentRevenue.transaction_count,
    );
    const previousTransactions = this.optionalMetricNumber(
      previousRevenue.transaction_count,
    );
    const comparableMoney =
      currentTotal !== null &&
      previousTotal !== null &&
      currentTotal.currency === previousTotal.currency;
    const revenueDeltaKopecks = comparableMoney
      ? currentTotal.amount_kopecks - previousTotal.amount_kopecks
      : null;
    const transactionDelta =
      currentTransactions !== null && previousTransactions !== null
        ? currentTransactions - previousTransactions
        : null;

    return {
      comparison: 'current_year_to_date_vs_previous_year_same_period',
      timezone: ranges.timezone,
      verified:
        currentSummary.verified === true && previousSummary.verified === true,
      periods: {
        current: {
          year: ranges.currentYear,
          from: ranges.current.from,
          to: ranges.current.to,
          start_day: 1,
          start_month: 1,
          end_day: ranges.currentEndDay,
          end_month: ranges.currentEndMonth,
        },
        previous: {
          year: ranges.previousYear,
          from: ranges.previous.from,
          to: ranges.previous.to,
          start_day: 1,
          start_month: 1,
          end_day: ranges.previousEndDay,
          end_month: ranges.previousEndMonth,
        },
      },
      revenue: {
        current: currentTotal,
        previous: previousTotal,
        delta:
          revenueDeltaKopecks === null || !currentTotal
            ? null
            : {
                currency: currentTotal.currency,
                amount_kopecks: revenueDeltaKopecks,
                amount_major_units: this.majorUnits(revenueDeltaKopecks),
              },
        percent_change:
          comparableMoney && previousTotal
            ? this.percentageDelta(
                currentTotal.amount_kopecks,
                previousTotal.amount_kopecks,
              )
            : null,
      },
      transactions: {
        current: currentTransactions,
        previous: previousTransactions,
        delta: transactionDelta,
        percent_change:
          currentTransactions !== null && previousTransactions !== null
            ? this.percentageDelta(currentTransactions, previousTransactions)
            : null,
      },
      warning_codes: [
        ...new Set([
          ...this.safeWarningCodes(currentSummary.warnings),
          ...this.safeWarningCodes(previousSummary.warnings),
        ]),
      ],
    };
  }

  private async businessYearComparisonRanges(tenantId: string) {
    const timezone = await this.reportingTimezone(tenantId);
    const now = new Date();
    const local = this.localDateTime(now, timezone);
    const currentYear = Number(local.date.slice(0, 4));
    const previousYear = currentYear - 1;
    const previousDate = this.sameLocalDateInYear(local.date, previousYear);
    const previousTo = new Date(
      localDateMinuteToUtc(
        previousDate,
        local.hour * 60 + local.minute,
        timezone,
      ).getTime() +
        local.second * 1_000 +
        now.getUTCMilliseconds(),
    );
    const currentFromDate = `${currentYear}-01-01`;
    const previousFromDate = `${previousYear}-01-01`;

    return {
      timezone,
      currentYear,
      previousYear,
      current: {
        from: localDateMinuteToUtc(currentFromDate, 0, timezone).toISOString(),
        to: now.toISOString(),
      },
      previous: {
        from: localDateMinuteToUtc(previousFromDate, 0, timezone).toISOString(),
        to: previousTo.toISOString(),
      },
      currentEndDay: Number(local.date.slice(8, 10)),
      currentEndMonth: Number(local.date.slice(5, 7)),
      previousEndDay: Number(previousDate.slice(8, 10)),
      previousEndMonth: Number(previousDate.slice(5, 7)),
    };
  }

  private localDateTime(value: Date, timezone: string) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  private sameLocalDateInYear(value: string, year: number): string {
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  }

  private optionalMetricNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private percentageDelta(current: number, previous: number): number | null {
    if (previous === 0) {
      return null;
    }
    return Math.round(((current - previous) / Math.abs(previous)) * 1_000) / 10;
  }

  private safeAnalytics(value: unknown) {
    const result = this.record(value);
    return {
      data_source: result.data_source ?? null,
      period: result.period ?? null,
      appointments: result.appointments ?? null,
      revenue: this.safeMoneyEntries(result.revenue),
      expenses: this.safeMoneyEntries(result.expenses),
      net: this.safeMoneyEntries(result.net),
      average_ticket: this.safeMoneyEntries(result.average_ticket),
      daily: Array.isArray(result.daily)
        ? result.daily.map((entry) => {
            const item = this.record(entry);
            return {
              date: item.date ?? null,
              appointments: item.appointments ?? 0,
              revenue: this.safeMoneyEntries(item.revenue),
            };
          })
        : [],
      data_quality: result.data_quality ?? null,
      staff_summary: Array.isArray(result.staff)
        ? result.staff.map((entry) => {
            const item = this.record(entry);
            return {
              appointments: item.appointments ?? 0,
              revenue: this.safeMoneyEntries(item.revenue),
            };
          })
        : [],
    };
  }

  private unavailableFinance(code: string) {
    return {
      source: 'external_crm',
      provider: null,
      verified: false,
      revenue: {
        status: 'unavailable',
        verified: false,
        transaction_count: null,
        total: null,
      },
      payroll: {
        status: 'unavailable',
        verified: false,
        accrued_total: null,
        paid_total: null,
        balance_total: null,
      },
      warning_codes: [code],
    };
  }

  private async cancelOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.cancelForClient(
      principal.tenantId,
      principal.userId,
      this.requiredString(args.appointment_id),
    );
    return this.safeAppointmentOutput(result);
  }

  private async previewOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.previewForClient(
      principal.tenantId,
      principal.userId,
      this.bookingDto(args),
    );
    return this.safeAppointmentPreview(result);
  }

  private async createOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.createForClient(
      principal.tenantId,
      principal.userId,
      this.bookingDto(args),
    );
    return this.safeAppointmentOutput(result);
  }

  private async rescheduleOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.rescheduleForClient(
      principal.tenantId,
      principal.userId,
      this.requiredString(args.appointment_id),
      {
        start: this.requiredString(args.start),
        ...(typeof args.staff_id === 'string'
          ? { staffId: args.staff_id }
          : {}),
        ...(Array.isArray(args.service_ids)
          ? { serviceIds: this.stringArray(args.service_ids) }
          : {}),
        ...(typeof args.branch_id === 'string'
          ? { branchId: args.branch_id }
          : {}),
      },
    );
    return this.safeAppointmentOutput(result);
  }

  private async adjustInternalLoyalty(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const result = await this.loyaltyService.adjustInternalBalance({
      tenantId: principal.tenantId,
      targetUserId: this.requiredString(args.target_user_id),
      actorUserId: principal.userId,
      dto: {
        delta: this.requiredNumber(args.delta),
        reason: this.requiredString(args.reason),
        idempotencyKey,
      },
    });
    return this.safeLoyalty(result);
  }

  private async reportingQuery(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    const period = this.requiredString(args.period);
    const branchId =
      typeof args.branch_id === 'string' ? args.branch_id : undefined;
    if (period === 'custom') {
      return {
        from: this.requiredString(args.from),
        to: this.requiredString(args.to),
        ...(branchId ? { branchId } : {}),
      };
    }

    const timezone = await this.reportingTimezone(tenantId, branchId);
    const now = new Date();
    const today = this.localDate(now, timezone);
    const todayStart = localDateMinuteToUtc(today, 0, timezone);
    let from: Date;
    let to = now;

    switch (period) {
      case 'today':
        from = todayStart;
        break;
      case 'yesterday': {
        const yesterday = this.shiftLocalDate(today, -1);
        from = localDateMinuteToUtc(yesterday, 0, timezone);
        to = new Date(todayStart.getTime() - 1);
        break;
      }
      case 'week_to_date': {
        const weekday = this.localWeekday(today);
        const monday = this.shiftLocalDate(today, -((weekday + 6) % 7));
        from = localDateMinuteToUtc(monday, 0, timezone);
        break;
      }
      case 'month_to_date':
        from = localDateMinuteToUtc(`${today.slice(0, 7)}-01`, 0, timezone);
        break;
      case 'last_7_days':
        from = localDateMinuteToUtc(
          this.shiftLocalDate(today, -6),
          0,
          timezone,
        );
        break;
      case 'last_30_days':
        from = localDateMinuteToUtc(
          this.shiftLocalDate(today, -29),
          0,
          timezone,
        );
        break;
      case 'last_month': {
        const currentMonth = `${today.slice(0, 7)}-01`;
        const previousMonth = this.shiftLocalMonth(currentMonth, -1);
        from = localDateMinuteToUtc(previousMonth, 0, timezone);
        to = new Date(
          localDateMinuteToUtc(currentMonth, 0, timezone).getTime() - 1,
        );
        break;
      }
      default:
        throw new Error('Validated AI reporting period is invalid');
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ...(branchId ? { branchId } : {}),
    };
  }

  private async reportingTimezone(
    tenantId: string,
    branchId?: string,
  ): Promise<string> {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { timezone: true },
      });
      if (!branch) {
        throw new Error('AI reporting branch is unavailable');
      }
      if (branch.timezone) {
        return branch.timezone;
      }
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    if (!tenant) {
      throw new Error('AI reporting tenant is unavailable');
    }
    return tenant.defaultTimezone;
  }

  private localDate(value: Date, timezone: string): string {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private shiftLocalDate(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private shiftLocalMonth(value: string, months: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  private localWeekday(value: string): number {
    return new Date(`${value}T00:00:00.000Z`).getUTCDay();
  }

  private safeAppointment(value: unknown) {
    const item = this.record(value);
    const branch = this.recordOrNull(item.branch);
    const staff = this.recordOrNull(item.staff);
    const services = Array.isArray(item.services)
      ? item.services.map((service) => {
          const safe = this.record(service);
          return {
            id: safe.id ?? null,
            name: safe.name ?? null,
            price: safe.price ?? null,
            duration_minutes: safe.duration_minutes ?? null,
            currency: safe.currency ?? null,
            category: safe.category ?? null,
          };
        })
      : [];

    return {
      id: item.id ?? null,
      status: item.status ?? null,
      start_at: item.start_at ?? null,
      end_at: item.end_at ?? null,
      is_upcoming: item.is_upcoming ?? null,
      timeline: item.timeline ?? null,
      branch: branch
        ? { id: branch.id ?? null, name: branch.name ?? null }
        : null,
      staff: staff
        ? {
            title: staff.title ?? null,
            specialization: staff.specialization ?? null,
          }
        : null,
      services,
      total_price: item.total_price ?? null,
      duration_minutes: item.duration_minutes ?? null,
      currency: item.currency ?? null,
    };
  }

  private safeAppointmentOutput(value: unknown) {
    const result = this.record(value);
    const appointment = this.recordOrNull(result.appointment);
    return this.safeAppointment(appointment ?? result);
  }

  private safeAppointmentPreview(value: unknown) {
    const result = this.record(value);
    const slot = this.recordOrNull(result.slot);
    return {
      ok: result.ok ?? null,
      preview: result.preview ?? null,
      mode: result.mode ?? null,
      branch_id: result.branch_id ?? null,
      branch_timezone: result.branch_timezone ?? null,
      staff_id: result.staff_id ?? null,
      service_ids: Array.isArray(result.service_ids)
        ? this.stringArray(result.service_ids)
        : [],
      requested_start: result.requested_start ?? null,
      matched_slot_start: result.matched_slot_start ?? null,
      slot: slot
        ? {
            start: slot.start ?? null,
            end: slot.end ?? null,
            staff_id: slot.staff_id ?? null,
            branch_id: slot.branch_id ?? null,
          }
        : null,
      total_price: result.total_price ?? null,
      duration_minutes: result.duration_minutes ?? null,
      currency: result.currency ?? null,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    };
  }

  private bookingDto(args: ValidatedAiToolArguments) {
    return {
      staffId: this.requiredString(args.staff_id),
      serviceIds: this.stringArray(args.service_ids),
      start: this.requiredString(args.start),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    };
  }

  private safeLoyalty(value: unknown) {
    const loyalty = this.record(value);
    const spend = this.record(loyalty.spend_options);
    const items = Array.isArray(spend.items)
      ? spend.items.slice(0, 6).map((item) => {
          const service = this.record(item);
          return {
            id: service.id ?? null,
            name: service.name ?? null,
            price: service.price ?? null,
            points_required: service.points_required ?? null,
            currency: service.currency ?? loyalty.currency ?? 'RUB',
            category: service.category ?? null,
          };
        })
      : [];
    return {
      balance: loyalty.balance ?? null,
      currency: loyalty.currency ?? 'RUB',
      source: loyalty.source ?? null,
      authoritative: loyalty.authoritative ?? null,
      sync_status: loyalty.sync_status ?? null,
      stale: loyalty.stale ?? null,
      synced_at: loyalty.synced_at ?? null,
      spend_options: {
        status: spend.status ?? null,
        basis: spend.basis ?? null,
        verification_required: spend.verification_required ?? true,
        items,
        best_service: spend.best_service ?? null,
        next_service: spend.next_service ?? null,
      },
    };
  }

  private safeMoneyEntries(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => {
      const item = this.record(entry);
      return {
        currency: item.currency ?? null,
        amount_kopecks: item.amount_kopecks ?? null,
        amount_major_units: this.majorUnits(item.amount_kopecks),
      };
    });
  }

  private safeMoneyAmount(value: unknown) {
    const item = this.record(value);
    if (
      typeof item.amount_kopecks !== 'number' ||
      !Number.isFinite(item.amount_kopecks)
    ) {
      return null;
    }
    return {
      currency: typeof item.currency === 'string' ? item.currency : null,
      amount_kopecks: item.amount_kopecks,
      amount_major_units: this.majorUnits(item.amount_kopecks),
    };
  }

  private safeWarningCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((warning) => this.record(warning).code)
      .filter(
        (code): code is string =>
          typeof code === 'string' && /^[a-z0-9_:-]{1,80}$/i.test(code),
      );
  }

  private majorUnits(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? value / 100
      : null;
  }

  private record(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private recordOrNull(value: unknown): Record<string, unknown> | null {
    const result = this.record(value);
    return Object.keys(result).length > 0 ? result : null;
  }

  private requiredString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Validated AI tool string is missing');
    }
    return value;
  }

  private requiredNumber(value: unknown): number {
    if (typeof value !== 'number') {
      throw new Error('Validated AI tool number is missing');
    }
    return value;
  }

  private scheduleSlots(value: unknown): StaffScheduleSlot[] {
    if (!Array.isArray(value)) {
      throw new Error('Validated AI tool schedule slots are missing');
    }
    return value.map((item) => {
      const slot = this.record(item);
      return {
        from: this.requiredString(slot.from),
        to: this.requiredString(slot.to),
      };
    });
  }

  private stringArray(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new Error('Validated AI tool string array is missing');
    }
    return value as string[];
  }
}
