import { Injectable } from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CrmService } from '../crm/crm.service';
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
        return this.readAnalytics(
          this.analyticsService.getBusinessOverview(principal.tenantId, query),
        );
      }
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
    const result = this.record(await resultPromise);
    return {
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
    return {
      balance: loyalty.balance ?? null,
      currency: loyalty.currency ?? 'RUB',
      source: loyalty.source ?? null,
      authoritative: loyalty.authoritative ?? null,
      sync_status: loyalty.sync_status ?? null,
      stale: loyalty.stale ?? null,
      synced_at: loyalty.synced_at ?? null,
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
