import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { StaffScheduleSlot } from '../crm/crm-adapter.interface';
import {
  normalizeScheduleSlots,
  staffScheduleRevision,
} from '../crm/staff-schedule.utils';
import { MAYA_AI_TOOL_CATALOG, MayaAiToolName } from './ai-tool.catalog';
import type {
  AiToolDefinition,
  ValidatedAiToolArguments,
} from './ai-tool.types';

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const REPORTING_PERIODS = new Set([
  'today',
  'yesterday',
  'week_to_date',
  'month_to_date',
  'year_to_date',
  'last_7_days',
  'last_30_days',
  'last_month',
  'custom',
]);

@Injectable()
export class AiToolRegistryService {
  private readonly definitions = new Map<string, AiToolDefinition>(
    MAYA_AI_TOOL_CATALOG.map((definition) => [definition.name, definition]),
  );

  list(): AiToolDefinition[] {
    return MAYA_AI_TOOL_CATALOG.map((definition) => ({ ...definition }));
  }

  get(toolName: string): AiToolDefinition {
    const definition = this.definitions.get(toolName);
    if (!definition) {
      throw new NotFoundException({
        message: 'AI tool not found.',
        error: { code: 'ai_tool_not_found' },
      });
    }
    if (definition.riskTier === 'restricted') {
      throw new NotFoundException({
        message: 'AI tool not found.',
        error: { code: 'ai_tool_not_found' },
      });
    }
    return definition;
  }

  validateArguments(
    toolName: string,
    input: unknown,
  ): ValidatedAiToolArguments {
    const args = this.assertObject(input);
    switch (toolName as MayaAiToolName) {
      case 'catalog.services.read':
      case 'catalog.staff.read':
      case 'appointments.own.list':
      case 'loyalty.own.read':
      case 'customers.count':
      case 'analytics.business.compare_years':
        this.assertAllowedKeys(args, []);
        return {};
      case 'booking.availability.read':
        this.assertAllowedKeys(args, [
          'date',
          'staff_id',
          'service_ids',
          'branch_id',
        ]);
        return {
          date: this.parseBookingDay(args.date, 'date'),
          ...(args.staff_id === undefined
            ? {}
            : {
                staff_id: this.assertExternalId(args.staff_id, 'staff_id'),
              }),
          ...(args.service_ids === undefined
            ? {}
            : {
                service_ids: this.assertExternalIdArray(
                  args.service_ids,
                  'service_ids',
                ),
              }),
          ...(args.branch_id === undefined
            ? {}
            : {
                branch_id: this.assertExternalId(args.branch_id, 'branch_id'),
              }),
        };
      case 'analytics.employee.read':
      case 'analytics.business.read':
      case 'expenses.read':
        return this.parseReportingPeriod(args);
      case 'analytics.employee.query':
      case 'analytics.business.query':
        return this.parseAnalyticsQuery(args);
      case 'appointments.own.cancel':
        this.assertAllowedKeys(args, ['appointment_id']);
        return {
          appointment_id: this.assertEntityId(
            args.appointment_id,
            'appointment_id',
          ),
        };
      case 'appointments.own.preview':
      case 'appointments.own.create':
        this.assertAllowedKeys(args, [
          'staff_id',
          'service_ids',
          'start',
          'branch_id',
        ]);
        return {
          staff_id: this.assertExternalId(args.staff_id, 'staff_id'),
          service_ids: this.assertExternalIdArray(
            args.service_ids,
            'service_ids',
          ),
          start: this.parseDate(args.start, 'start').toISOString(),
          ...(args.branch_id === undefined
            ? {}
            : {
                branch_id: this.assertExternalId(args.branch_id, 'branch_id'),
              }),
        };
      case 'appointments.own.reschedule':
        this.assertAllowedKeys(args, [
          'appointment_id',
          'start',
          'staff_id',
          'service_ids',
          'branch_id',
        ]);
        return {
          appointment_id: this.assertEntityId(
            args.appointment_id,
            'appointment_id',
          ),
          start: this.parseDate(args.start, 'start').toISOString(),
          ...(args.staff_id === undefined
            ? {}
            : {
                staff_id: this.assertExternalId(args.staff_id, 'staff_id'),
              }),
          ...(args.service_ids === undefined
            ? {}
            : {
                service_ids: this.assertExternalIdArray(
                  args.service_ids,
                  'service_ids',
                ),
              }),
          ...(args.branch_id === undefined
            ? {}
            : {
                branch_id: this.assertExternalId(args.branch_id, 'branch_id'),
              }),
        };
      case 'staff.schedule.update': {
        this.assertAllowedKeys(args, [
          'staff_id',
          'date',
          'operation',
          'current_revision',
          'current_slots',
          'slots',
        ]);
        const staffId = this.assertExternalId(args.staff_id, 'staff_id');
        const date = this.assertDateKey(args.date, 'date');
        const operation = this.assertScheduleOperation(args.operation);
        const currentSlots = this.assertScheduleSlots(
          args.current_slots,
          'current_slots',
        );
        const slots = this.assertScheduleSlots(args.slots, 'slots');
        const currentRevision = this.assertScheduleRevision(
          args.current_revision,
        );
        if (
          currentRevision !== staffScheduleRevision(staffId, date, currentSlots)
        ) {
          this.invalidArguments(
            'current_revision does not match the schedule preview',
          );
        }
        return {
          staff_id: staffId,
          date,
          operation,
          current_revision: currentRevision,
          current_slots: currentSlots,
          slots,
        };
      }
      case 'loyalty.internal.adjust':
        this.assertAllowedKeys(args, ['target_user_id', 'delta', 'reason']);
        return {
          target_user_id: this.assertEntityId(
            args.target_user_id,
            'target_user_id',
          ),
          delta: this.assertDelta(args.delta),
          reason: this.assertSafeReason(args.reason),
        };
      default:
        throw new NotFoundException({
          message: 'AI tool not found.',
          error: { code: 'ai_tool_not_found' },
        });
    }
  }

  buildApprovalPreview(
    toolName: string,
    args: ValidatedAiToolArguments,
  ): { summary: string; payload: Record<string, unknown> } {
    if (toolName === 'appointments.own.cancel') {
      return {
        summary: 'Cancel the selected appointment.',
        payload: {
          action: 'cancel_appointment',
          appointment_id: args.appointment_id,
        },
      };
    }
    if (toolName === 'appointments.own.create') {
      return {
        summary: 'Create the selected appointment.',
        payload: {
          action: 'create_appointment',
          staff_id: args.staff_id,
          service_ids: args.service_ids,
          start: args.start,
          branch_id: args.branch_id ?? null,
        },
      };
    }
    if (toolName === 'appointments.own.reschedule') {
      return {
        summary: 'Move the selected appointment to a new time.',
        payload: {
          action: 'reschedule_appointment',
          appointment_id: args.appointment_id,
          start: args.start,
          staff_id: args.staff_id ?? null,
          service_ids: args.service_ids ?? null,
          branch_id: args.branch_id ?? null,
        },
      };
    }
    if (toolName === 'loyalty.internal.adjust') {
      return {
        summary: 'Adjust the selected internal loyalty balance.',
        payload: {
          action: 'adjust_internal_loyalty',
          target_user_id: args.target_user_id,
          delta: args.delta,
          reason: args.reason,
        },
      };
    }
    if (toolName === 'staff.schedule.update') {
      return {
        summary:
          'Change one staff workday. Existing appointments will be preserved.',
        payload: {
          action: 'update_staff_schedule',
          date: args.date,
          operation: args.operation,
          current_slots: args.current_slots,
          proposed_slots: args.slots,
          existing_appointments_preserved: true,
        },
      };
    }
    throw new BadRequestException({
      message: 'This AI tool does not support approvals.',
      error: { code: 'ai_tool_approval_not_supported' },
    });
  }

  private parseReportingPeriod(args: Record<string, unknown>) {
    this.assertAllowedKeys(args, ['period', 'from', 'to', 'branch_id']);
    if (
      typeof args.period !== 'string' ||
      !REPORTING_PERIODS.has(args.period)
    ) {
      this.invalidArguments('reporting period is invalid');
    }
    const period = args.period;
    const hasFrom = args.from !== undefined;
    const hasTo = args.to !== undefined;
    if (period !== 'custom' && (hasFrom || hasTo)) {
      this.invalidArguments('relative periods must not include from or to');
    }
    if (period === 'custom' && (!hasFrom || !hasTo)) {
      this.invalidArguments('custom period requires from and to');
    }

    let customRange: { from: string; to: string } | null = null;
    if (period === 'custom') {
      const from = this.parseDate(args.from, 'from');
      const to = this.parseDate(args.to, 'to');
      if (
        from.getTime() > to.getTime() ||
        to.getTime() - from.getTime() > MAX_RANGE_MS
      ) {
        this.invalidArguments(
          'date range must be ordered and at most 366 days',
        );
      }
      customRange = { from: from.toISOString(), to: to.toISOString() };
    }

    return {
      period,
      ...(customRange ?? {}),
      ...(args.branch_id === undefined
        ? {}
        : {
            branch_id: this.assertEntityId(args.branch_id, 'branch_id'),
          }),
    };
  }

  private parseAnalyticsQuery(args: Record<string, unknown>) {
    this.assertAllowedKeys(args, [
      'period',
      'from',
      'to',
      'branch_id',
      'comparison',
    ]);
    if (
      typeof args.comparison !== 'string' ||
      !['none', 'previous_period', 'previous_year_same_period'].includes(
        args.comparison,
      )
    ) {
      this.invalidArguments('analytics comparison is invalid');
    }
    const period = this.parseReportingPeriod(
      Object.fromEntries(
        Object.entries(args).filter(([key]) => key !== 'comparison'),
      ),
    );
    return { ...period, comparison: args.comparison };
  }

  private assertObject(input: unknown): Record<string, unknown> {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype
    ) {
      this.invalidArguments('arguments must be a JSON object');
    }
    return input as Record<string, unknown>;
  }

  private assertAllowedKeys(
    args: Record<string, unknown>,
    allowedKeys: string[],
  ): void {
    const unknownKey = Object.keys(args).find(
      (key) => !allowedKeys.includes(key),
    );
    if (unknownKey) {
      this.invalidArguments(`unknown argument: ${unknownKey}`);
    }
  }

  private assertEntityId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value)) {
      this.invalidArguments(`${field} is invalid`);
    }
    return value;
  }

  private assertExternalId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !EXTERNAL_ID_PATTERN.test(value)) {
      this.invalidArguments(`${field} is invalid`);
    }
    return value;
  }

  private assertExternalIdArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
      this.invalidArguments(`${field} must contain from 1 to 10 identifiers`);
    }
    const normalized = value.map((item) => this.assertExternalId(item, field));
    if (new Set(normalized).size !== normalized.length) {
      this.invalidArguments(`${field} must not contain duplicates`);
    }
    return normalized;
  }

  private assertScheduleSlots(
    value: unknown,
    field: string,
  ): StaffScheduleSlot[] {
    if (!Array.isArray(value) || value.length > 12) {
      this.invalidArguments(`${field} must contain at most 12 intervals`);
    }
    const slots = value.map((item) => {
      const slot = this.assertObject(item);
      this.assertAllowedKeys(slot, ['from', 'to']);
      if (typeof slot.from !== 'string' || typeof slot.to !== 'string') {
        this.invalidArguments(`${field} intervals must contain from and to`);
      }
      return { from: slot.from, to: slot.to };
    });
    try {
      return normalizeScheduleSlots(slots);
    } catch {
      this.invalidArguments(`${field} contains an invalid interval`);
    }
  }

  private assertScheduleOperation(value: unknown): string {
    if (!['close_day', 'set_break', 'set_hours'].includes(String(value))) {
      this.invalidArguments('schedule operation is invalid');
    }
    return String(value);
  }

  private assertScheduleRevision(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
      this.invalidArguments('current_revision is invalid');
    }
    return value;
  }

  private assertDelta(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value === 0 ||
      value < -1_000_000 ||
      value > 1_000_000
    ) {
      this.invalidArguments('delta must be a non-zero integer within limits');
    }
    return value;
  }

  private assertSafeReason(value: unknown): string {
    if (typeof value !== 'string') {
      this.invalidArguments('reason is required');
    }
    const reason = value.trim();
    if (reason.length < 2 || reason.length > 160) {
      this.invalidArguments('reason length must be between 2 and 160');
    }
    if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(reason)) {
      this.invalidArguments('reason must not contain email addresses');
    }
    if (/\+?\d[\d\s()-]{6,}\d/.test(reason)) {
      this.invalidArguments('reason must not contain phone numbers');
    }
    return reason;
  }

  private parseDate(value: unknown, field: string): Date {
    if (typeof value !== 'string') {
      this.invalidArguments(`${field} must be an ISO date-time`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      this.invalidArguments(`${field} must be an ISO date-time`);
    }
    return date;
  }

  private parseBookingDay(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      this.invalidArguments(`${field} must be an ISO date or date-time`);
    }
    const datePart = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1];
    if (!datePart) {
      this.invalidArguments(`${field} must be an ISO date or date-time`);
    }
    const normalized = new Date(`${datePart}T00:00:00.000Z`);
    if (
      Number.isNaN(normalized.getTime()) ||
      normalized.toISOString().slice(0, 10) !== datePart
    ) {
      this.invalidArguments(`${field} must be an ISO date or date-time`);
    }
    return normalized.toISOString();
  }

  private assertDateKey(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.invalidArguments(`${field} must be YYYY-MM-DD`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      this.invalidArguments(`${field} must be a valid date`);
    }
    return value;
  }

  private invalidArguments(message: string): never {
    throw new BadRequestException({
      message: 'AI tool arguments are invalid.',
      error: { code: 'ai_tool_arguments_invalid', detail: message },
    });
  }
}
