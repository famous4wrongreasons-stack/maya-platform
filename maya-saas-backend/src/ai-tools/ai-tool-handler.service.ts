import { Injectable } from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CrmService } from '../crm/crm.service';
import { CustomersService } from '../customers/customers.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
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
      case 'appointments.own.list':
        return this.listOwnAppointments(principal);
      case 'loyalty.own.read':
        return this.readOwnLoyalty(principal);
      case 'analytics.employee.read':
        return this.readAnalytics(
          this.analyticsService.getEmployeeOverview(
            principal.tenantId,
            principal.userId,
            this.analyticsQuery(args),
          ),
        );
      case 'analytics.business.read':
        return this.readAnalytics(
          this.analyticsService.getBusinessOverview(
            principal.tenantId,
            this.analyticsQuery(args),
          ),
        );
      case 'expenses.read':
        return this.readExpenses(principal.tenantId, args);
      case 'customers.count':
        return this.customersService.countCustomers(principal.tenantId);
      case 'appointments.own.cancel':
        return this.cancelOwnAppointment(principal, args);
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

  private async readOwnLoyalty(principal: AiToolPrincipal) {
    const loyalty = await this.loyaltyService.getForUser(
      principal.tenantId,
      principal.userId,
    );
    return this.safeLoyalty(loyalty);
  }

  private async readExpenses(tenantId: string, args: ValidatedAiToolArguments) {
    const result = await this.expensesService.list(tenantId, {
      from: this.requiredString(args.from),
      to: this.requiredString(args.to),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    });
    return {
      items: result.items.map((item) => ({
        id: item.id,
        branch_id: item.branch_id,
        category: item.category,
        amount_kopecks: item.amount_kopecks,
        currency: item.currency,
        occurred_at: item.occurred_at,
      })),
      totals: result.totals,
      truncated: result.truncated,
    };
  }

  private async readAnalytics(resultPromise: Promise<unknown>) {
    const result = this.record(await resultPromise);
    return {
      period: result.period ?? null,
      appointments: result.appointments ?? null,
      revenue: result.revenue ?? [],
      expenses: result.expenses ?? [],
      net: result.net ?? [],
      average_ticket: result.average_ticket ?? [],
      daily: result.daily ?? [],
      data_quality: result.data_quality ?? null,
      staff_summary: Array.isArray(result.staff)
        ? result.staff.map((entry) => {
            const item = this.record(entry);
            return {
              appointments: item.appointments ?? 0,
              revenue: item.revenue ?? [],
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
    return this.safeAppointment(result);
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

  private analyticsQuery(args: ValidatedAiToolArguments) {
    return {
      from: this.requiredString(args.from),
      to: this.requiredString(args.to),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    };
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
            id: staff.id ?? null,
            name: staff.name ?? null,
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
}
