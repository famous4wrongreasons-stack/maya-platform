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
import {
  MANUAL_EXPENSE_CATEGORY_SLUGS,
  findExpenseCategory,
  isManualExpenseCategory,
  rublesToKopecks,
} from '../expenses/expense-category';
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
  'named_month',
  'custom',
]);
/** Календарный месяц, названный словом: «в июле», «за март». */
const CALENDAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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
      case 'customers.count':
      case 'appointments.own.list':
      case 'loyalty.own.read':
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
      case 'analytics.business.profit':
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
      case 'expenses.create':
        this.assertAllowedKeys(args, [
          'category',
          'amount_rubles',
          'occurred_on',
          'note',
        ]);
        return {
          category: this.assertManualExpenseCategory(args.category),
          // Сумма остаётся В РУБЛЯХ: карточку подтверждения человек читает в
          // рублях, а в копейки её переводит сервер уже при исполнении.
          // Переводить здесь нельзя — валидатор прогоняется второй раз по
          // сохранённым аргументам, и лишний ключ сломал бы хеш подтверждения.
          amount_rubles: this.assertExpenseRubles(args.amount_rubles),
          ...(args.occurred_on === undefined
            ? {}
            : {
                occurred_on: this.assertDateKey(
                  args.occurred_on,
                  'occurred_on',
                ),
              }),
          ...(args.note === undefined
            ? {}
            : { note: this.assertSafeReason(args.note) }),
        };
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
    if (toolName === 'expenses.create') {
      const category = findExpenseCategory(args.category);
      const amountRubles =
        typeof args.amount_rubles === 'number' ? args.amount_rubles : 0;
      const occurredOn =
        typeof args.occurred_on === 'string' ? args.occurred_on : null;
      const money = this.formatRubles(amountRubles);
      const day = occurredOn ? this.formatLocalDay(occurredOn) : null;
      return {
        // 🔴 Заголовок карточки на фронте — это имя инструмента, а описание —
        // вот эта строка. Русского словаря для нового инструмента у отдельно
        // деплоящегося фронта нет, поэтому подтверждаемое действие обязано
        // читаться целиком отсюда: что, сколько и за какое число.
        summary: `Записать расход: ${category?.label ?? 'без категории'} — ${money}${
          day ? ` за ${day}` : ''
        }.`,
        // 🔴 ПОРЯДОК КЛЮЧЕЙ ЗДЕСЬ — ЧАСТЬ ПОВЕДЕНИЯ, А НЕ ОФОРМЛЕНИЕ.
        // Карточка показывает первые ШЕСТЬ полей превью, а хранится превью в
        // jsonb, который порядок вставки не сохраняет: он сортирует ключи по
        // ДЛИНЕ, а при равной длине побайтово. Раньше сумма и категория
        // занимали длинные имена, а дата — самое длинное, и владелец
        // подтверждал расход, не видя, за какое число он пишется.
        // Поэтому короткие имена достались ровно тому, что человек обязан
        // увидеть: сумма, дата, статья, предупреждение о дубле. Ключи
        // перечислены в том же порядке, в котором их выдаст jsonb, чтобы
        // карточка выглядела одинаково и в тестах, и на проде.
        payload: {
          sum: money,
          date: day,
          type: category?.label ?? null,
          action: 'create_expense',
          comment: args.note ?? null,
          category: category?.slug ?? null,
          currency: 'RUB',
          amount_rubles: amountRubles,
          category_kind: category?.kind ?? null,
          amount_kopecks: rublesToKopecks(amountRubles),
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
    this.assertAllowedKeys(args, [
      'period',
      'month',
      'from',
      'to',
      'branch_id',
    ]);
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
    // Месяц живёт только вместе с named_month. Пустить его в другие периоды
    // значило бы завести второй способ задать окно — и молча его игнорировать.
    if (period !== 'named_month' && args.month !== undefined) {
      this.invalidArguments(
        'month is only allowed with the named_month period',
      );
    }
    let namedMonth: string | null = null;
    if (period === 'named_month') {
      if (
        typeof args.month !== 'string' ||
        !CALENDAR_MONTH_PATTERN.test(args.month)
      ) {
        this.invalidArguments('named_month requires month as YYYY-MM');
      }
      namedMonth = args.month;
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
      ...(namedMonth === null ? {} : { month: namedMonth }),
      ...(customRange ?? {}),
      ...(args.branch_id === undefined
        ? {}
        : {
            branch_id: this.assertEntityId(args.branch_id, 'branch_id'),
          }),
    };
  }

  private parseAnalyticsQuery(args: Record<string, unknown>) {
    // 🔴 'month' обязателен в списке. Роутер подмешивает {period:'named_month',
    // month:'2026-07'} на любой вопрос с названием месяца, а валидатор ключ не
    // знал и отбивал аргументы целиком — «что по деньгам за июль» падало с
    // ошибкой инструмента, и владелец слышал, что CRM недоступна.
    this.assertAllowedKeys(args, [
      'period',
      'from',
      'to',
      'branch_id',
      'comparison',
      'month',
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

  /**
   * Категория расхода при записи из чата.
   *
   * Справочник закрыт, а зарплата отбивается отдельным сообщением: начисления
   * мастерам приходят расчётом из CRM, и ручной дубль сложил бы зарплату саму
   * с собой. Модель должна услышать причину, а не «invalid enum».
   */
  private assertManualExpenseCategory(value: unknown): string {
    const category = findExpenseCategory(value);
    if (!category) {
      this.invalidArguments(
        `category must be one of: ${MANUAL_EXPENSE_CATEGORY_SLUGS.join(', ')}`,
      );
    }
    if (!isManualExpenseCategory(category.slug)) {
      this.invalidArguments(
        'payroll is never recorded by hand: master payroll already comes from the CRM payroll calculation and a manual copy would count it twice',
      );
    }
    return category.slug;
  }

  /** «60 000 ₽» — как человек читает деньги, а не как их хранит база. */
  private formatRubles(amountRubles: number): string {
    const kopecks = rublesToKopecks(amountRubles);
    if (kopecks === null) {
      return `${amountRubles} ₽`;
    }
    const whole = Math.trunc(kopecks / 100);
    const rest = kopecks % 100;
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return rest === 0
      ? `${grouped} ₽`
      : `${grouped},${String(rest).padStart(2, '0')} ₽`;
  }

  /** `2026-08-05` → `05.08.2026`: дата в карточке читается, а не расшифровывается. */
  private formatLocalDay(value: string): string {
    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }

  private assertExpenseRubles(value: unknown): number {
    if (rublesToKopecks(value) === null) {
      this.invalidArguments(
        'amount_rubles must be a positive amount in rubles with at most two decimals',
      );
    }
    return value as number;
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
