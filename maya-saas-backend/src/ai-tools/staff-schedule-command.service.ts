import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import type {
  StaffMember,
  StaffScheduleDay,
  StaffScheduleSlot,
} from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import {
  normalizeScheduleSlots,
  scheduleMinutesLabel,
  scheduleTimeMinutes,
} from '../crm/staff-schedule.utils';
import { PrismaService } from '../prisma/prisma.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';

const SCHEDULE_MANAGER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
]);

const WEEKDAYS = new Map<string, number>([
  ['воскресенье', 0],
  ['воскресенья', 0],
  ['воскресенью', 0],
  ['понедельник', 1],
  ['понедельника', 1],
  ['понедельнику', 1],
  ['вторник', 2],
  ['вторника', 2],
  ['вторнику', 2],
  ['среда', 3],
  ['среду', 3],
  ['среды', 3],
  ['четверг', 4],
  ['четверга', 4],
  ['четвергу', 4],
  ['пятница', 5],
  ['пятницу', 5],
  ['пятницы', 5],
  ['суббота', 6],
  ['субботу', 6],
  ['субботы', 6],
]);

const MONTHS = new Map<string, number>([
  ['января', 1],
  ['февраля', 2],
  ['марта', 3],
  ['апреля', 4],
  ['мая', 5],
  ['июня', 6],
  ['июля', 7],
  ['августа', 8],
  ['сентября', 9],
  ['октября', 10],
  ['ноября', 11],
  ['декабря', 12],
]);

const GIVEN_NAME_ALIASES = new Map<string, string[]>([
  ['стас', ['станислав']],
  ['саша', ['александр', 'александра']],
  ['макс', ['максим']],
  ['антоха', ['антон']],
  ['леша', ['алексей']],
  ['лёша', ['алексей']],
  ['дима', ['дмитрий']],
  ['миша', ['михаил']],
  ['вова', ['владимир']],
]);

type ScheduleOperation = 'close_day' | 'set_break' | 'set_hours';

type ParsedScheduleIntent = {
  operation: ScheduleOperation;
  date: string | null;
  range: { from: string; to: string } | null;
  end: string | null;
};

type OperationsStaffRow = {
  name: string;
  isWorking: boolean | null;
  workingHours: StaffScheduleSlot[];
  appointments: {
    total: number;
    active: number;
    confirmed: number;
    completed: number;
    canceled: number;
    noShow: number;
    other: number;
  };
  bookedMinutes: number;
  workingMinutes: number;
  loadPercent: number | null;
};

type OperationsAppointmentRow = {
  time: string;
  endTime: string;
  status: string;
  staffName: string;
  services: string[];
};

type OperationsCounts = {
  total: number;
  active: number;
  confirmed: number;
  completed: number;
  canceled: number;
  noShow: number;
  other: number;
};

export interface StaffScheduleCommandResult {
  reply: string;
  action: Record<string, unknown> | null;
  toolUsage: {
    name: string;
    status: string;
    execution_id: string | null;
  } | null;
}

@Injectable()
export class StaffScheduleCommandService {
  constructor(
    private readonly configService: ConfigService,
    private readonly crmService: CrmService,
    private readonly prisma: PrismaService,
    private readonly runtime: AiToolRuntimeService,
  ) {}

  async tryHandle(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
  ): Promise<StaffScheduleCommandResult | null> {
    if (dto.surface !== 'native') {
      return null;
    }
    const rawText = this.latestUserText(dto);
    const normalizedText = this.normalizeText(rawText);
    const operation = this.detectOperation(normalizedText);
    if (!operation) {
      const journal = await this.tryReadOperationsJournal(
        user,
        this.operationsReadContextText(dto, normalizedText),
      );
      if (journal) {
        return journal;
      }
      return this.tryReadSchedule(
        user,
        dto,
        this.scheduleReadContextText(dto, normalizedText),
      );
    }
    if (!this.enabled()) {
      return null;
    }
    if (!SCHEDULE_MANAGER_ROLES.has(user.role)) {
      return this.replyOnly(
        'Изменять график мастеров может владелец, администратор или управляющий.',
      );
    }
    if (!user.tenantId) {
      return this.replyOnly('Не нашла активный салон для этой команды.');
    }

    const allowed = await this.runtime.listTools(user, 'native');
    if (!allowed.tools.some((tool) => tool.name === 'staff.schedule.update')) {
      return this.replyOnly(
        'Изменение графика недоступно для текущей роли или тарифа.',
      );
    }

    const timezone = await this.tenantTimezone(user.tenantId);
    const parsed: ParsedScheduleIntent = {
      operation,
      date: this.parseDate(normalizedText, timezone),
      range: this.parseTimeRange(normalizedText),
      end: this.parseEndTime(normalizedText),
    };
    if (!parsed.date) {
      return this.replyOnly('На какую дату изменить график?');
    }

    const staff = await this.crmService.getStaff(user.tenantId);
    const match = this.resolveStaff(normalizedText, staff);
    if (match.kind === 'missing') {
      return this.replyOnly('Какому мастеру изменить график?');
    }
    if (match.kind === 'ambiguous') {
      return this.replyOnly(`Уточните мастера: ${match.names.join(', ')}.`);
    }

    let current: StaffScheduleDay;
    try {
      current = await this.crmService.getStaffScheduleDay(user.tenantId, {
        staffId: match.staff.id,
        date: parsed.date,
      });
    } catch {
      return this.replyOnly(
        'Не смогла прочитать текущий график из YClients. Ничего не изменила.',
      );
    }

    const planned = this.planSlots(parsed, current.slots);
    if ('error' in planned) {
      return this.replyOnly(planned.error);
    }

    let preview;
    try {
      preview = await this.crmService.previewStaffScheduleDayChange(
        user.tenantId,
        {
          staffId: match.staff.id,
          date: parsed.date,
          slots: planned.slots,
        },
      );
    } catch {
      return this.replyOnly(
        'Не смогла безопасно проверить записи на этот день. График не изменён.',
      );
    }
    if (preview.conflict_times.length > 0) {
      return this.replyOnly(
        `Не могу изменить график: в новые часы не помещаются записи на ${preview.conflict_times.join(', ')}. Я ничего не меняла.`,
      );
    }

    const execution = this.asRecord(
      await this.runtime.execute(user, 'staff.schedule.update', {
        surface: 'native',
        arguments: {
          staff_id: match.staff.id,
          date: preview.current.date,
          operation: parsed.operation,
          current_revision: preview.current.revision,
          current_slots: preview.current.slots,
          slots: preview.proposed.slots,
        },
        idempotencyKey: this.idempotencyKey(
          user.tenantId,
          user.userId,
          dto.requestId,
        ),
      }),
    );
    if (execution.status !== 'approval_required') {
      return this.replyOnly(
        'Не смогла создать безопасное подтверждение. График не изменён.',
      );
    }

    return {
      reply:
        `${match.staff.name}, ${this.displayDate(preview.current.date)}: ` +
        `сейчас ${this.slotsText(preview.current.slots)}, ` +
        `после изменения ${this.slotsText(preview.proposed.slots)}. ` +
        'Существующие записи сохранятся. Подтвердите изменение.',
      action: {
        status: 'approval_required',
        approval: execution.approval ?? null,
      },
      toolUsage: {
        name: 'staff.schedule.update',
        status: 'approval_required',
        execution_id:
          typeof execution.execution_id === 'string'
            ? execution.execution_id
            : null,
      },
    };
  }

  private async tryReadOperationsJournal(
    user: AuthenticatedUser,
    text: string,
  ): Promise<StaffScheduleCommandResult | null> {
    if (!this.isOperationsJournalQuestion(text)) {
      return null;
    }
    // 🔴 НЕ отказываем здесь. Это перехватчик ДО модели, и жёсткая проверка
    // роли делала его вторым движком прав: мастер, спросивший про СВОИ записи,
    // получал «доступно владельцу и администратору» и не доходил ни до модели,
    // ни до собственных инструментов own-scope, которые ему как раз выданы.
    // Возвращаем null — дальше решает единственный движок прав AiToolPolicy.
    if (!SCHEDULE_MANAGER_ROLES.has(user.role)) {
      return null;
    }
    if (!user.tenantId) {
      return this.replyOnly('Не нашла активный бизнес для этого запроса.');
    }

    let allowed;
    try {
      allowed = await this.runtime.listTools(user, 'native');
    } catch {
      return this.operationsReadFailure();
    }
    if (
      !allowed.tools.some((tool) => tool.name === 'operations.journal.read')
    ) {
      return this.replyOnly(
        'Точный журнал записей YClients недоступен для текущей роли или тарифа.',
      );
    }

    const timezone = await this.tenantTimezone(user.tenantId);
    const date = this.parseDate(text, timezone);
    if (!date) {
      return this.replyOnly('За какую дату показать записи?');
    }

    let staff: StaffMember[];
    try {
      staff = await this.crmService.getStaff(user.tenantId);
    } catch {
      return this.operationsReadFailure();
    }
    const match = this.resolveStaff(text, staff);
    if (match.kind === 'ambiguous') {
      return this.replyOnly(`Уточните мастера: ${match.names.join(', ')}.`);
    }
    if (match.kind === 'missing' && this.hasNamedStaffReference(text)) {
      return this.replyOnly(
        'Не нашла такого активного сотрудника в YClients. Уточните имя.',
      );
    }

    let execution: Record<string, unknown>;
    try {
      execution = this.asRecord(
        await this.runtime.execute(user, 'operations.journal.read', {
          surface: 'native',
          arguments: {
            date,
            ...(match.kind === 'found' ? { staff_id: match.staff.id } : {}),
          },
        }),
      );
    } catch {
      return this.operationsReadFailure();
    }
    if (execution.status !== 'completed') {
      return this.operationsReadFailure();
    }

    const result = this.asRecord(execution.result);
    const rows = this.operationsStaffRows(result.staff);
    const appointments = this.operationsAppointmentRows(result.appointments);
    const summary = this.operationsCounts(result.summary);
    if (!summary || rows.length === 0) {
      return this.operationsReadFailure();
    }

    return {
      reply: this.operationsJournalReply(
        date,
        timezone,
        rows,
        appointments,
        summary,
        match.kind === 'found',
      ),
      action: null,
      toolUsage: {
        name: 'operations.journal.read',
        status: 'completed',
        execution_id:
          typeof execution.execution_id === 'string'
            ? execution.execution_id
            : null,
      },
    };
  }

  private async tryReadSchedule(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
    text: string,
  ): Promise<StaffScheduleCommandResult | null> {
    if (!this.isScheduleReadQuestion(text)) {
      return null;
    }
    // 🔴 То же самое: не отказываем ролью в перехватчике. У мастера есть
    // staff.schedule.own.read — пусть до него дойдёт обычный путь.
    if (!SCHEDULE_MANAGER_ROLES.has(user.role)) {
      return null;
    }
    if (!user.tenantId) {
      return this.replyOnly('Не нашла активный бизнес для этого запроса.');
    }

    let allowed;
    try {
      allowed = await this.runtime.listTools(user, 'native');
    } catch {
      return this.scheduleReadFailure();
    }
    if (!allowed.tools.some((tool) => tool.name === 'staff.schedule.read')) {
      return this.replyOnly(
        'Чтение графика YClients недоступно для текущей роли или тарифа.',
      );
    }

    const timezone = await this.tenantTimezone(user.tenantId);
    const date = this.parseDate(text, timezone);
    if (!date) {
      return this.replyOnly('На какую дату показать график?');
    }

    let staff: StaffMember[];
    try {
      staff = await this.crmService.getStaff(user.tenantId);
    } catch {
      return this.scheduleReadFailure();
    }
    const match = this.resolveStaff(text, staff);
    if (match.kind === 'ambiguous') {
      return this.replyOnly(`Уточните мастера: ${match.names.join(', ')}.`);
    }
    if (match.kind === 'missing') {
      if (this.hasNamedStaffReference(text)) {
        return this.replyOnly(
          'Не нашла такого активного сотрудника в YClients. Уточните имя.',
        );
      }
      if (!this.isTeamScheduleQuestion(text)) {
        return this.replyOnly('График какого мастера показать?');
      }
    }

    let execution: Record<string, unknown>;
    try {
      execution = this.asRecord(
        await this.runtime.execute(user, 'staff.schedule.read', {
          surface: 'native',
          arguments: {
            date,
            ...(match.kind === 'found' ? { staff_id: match.staff.id } : {}),
          },
        }),
      );
    } catch {
      return this.scheduleReadFailure();
    }
    if (execution.status !== 'completed') {
      return this.scheduleReadFailure();
    }
    const result = this.asRecord(execution.result);
    const rows = this.scheduleRows(result.staff);
    if (rows.length === 0) {
      return this.replyOnly(
        `${this.scheduleDateLabel(date, timezone)}: в YClients нет активных мастеров с графиком.`,
      );
    }

    return {
      reply: this.scheduleReadReply(date, timezone, rows),
      action: null,
      toolUsage: {
        name: 'staff.schedule.read',
        status: 'completed',
        execution_id:
          typeof execution.execution_id === 'string'
            ? execution.execution_id
            : null,
      },
    };
  }

  private isScheduleReadQuestion(text: string): boolean {
    const explicitSchedule =
      /(?:расписан|график|рабоч[^ы]*\s+(?:час|смен)|(?:^|[^а-я])смен(?:а|ы|е|у|ой|ою)(?:$|[^а-я])|выходн)/.test(
        text,
      );
    const rosterQuestion =
      /(?:кто\s+[^?.,!]{0,40}(?:работ|на\s+смен)|когда\s+[^?.,!]{0,50}работ|работает\s+ли|во\s+сколько\s+[^?.,!]{0,50}(?:выход|начина))/u.test(
        text,
      );
    const hasCalendarDate =
      /(?:сегодня|завтра|послезавтра|понедельник|понедельника|вторник|вторника|среда|среду|четверг|четверга|пятница|пятницу|суббота|субботу|воскресенье|воскресенья|\d{1,2}[./]\d{1,2}|\d{4}-\d{2}-\d{2})/.test(
        text,
      );
    const hasWorkPredicate =
      /(?:^|[^а-я])(?:работ(?:аю|ает|ают|ал|ала|али)|выход(?:ит|ят|ишь|им|ите)|на\s+смене)(?:$|[^а-я])/u.test(
        text,
      );
    return (
      explicitSchedule ||
      rosterQuestion ||
      (hasCalendarDate && hasWorkPredicate)
    );
  }

  private isTeamScheduleQuestion(text: string): boolean {
    if (
      /(?:кто\s+[^?.,!]{0,40}(?:работ|на\s+смен)|кто\s+выходной|расписание\s+(?:всех|команды|мастеров|сотрудников)|график\s+(?:всех|команды|мастеров|сотрудников))/.test(
        text,
      )
    ) {
      return true;
    }
    return (
      /^(?:какое\s+)?(?:расписание|график)(?:$|[^а-я])/.test(text) &&
      !this.hasNamedStaffReference(text)
    );
  }

  private hasNamedStaffReference(text: string): boolean {
    const match = text.match(
      /(?:^|[^а-я])(?:у|для|про)\s+([a-zа-я][a-zа-я-]{1,})(?:$|[^а-я])/u,
    );
    if (!match) {
      return false;
    }
    return !new Set([
      'нас',
      'всех',
      'команды',
      'мастеров',
      'сотрудников',
      'барберов',
      'персонала',
      'салона',
      'бизнеса',
    ]).has(match[1]);
  }

  private scheduleReadContextText(dto: AiCoreChatDto, latest: string): string {
    if (this.isScheduleReadQuestion(latest)) {
      return latest;
    }
    const previous = this.previousUserText(dto);
    if (
      previous &&
      this.isScheduleReadQuestion(previous) &&
      /^(?:а\s+)?(?:у\s+)?[a-zа-я\s-]{2,60}\??$/.test(latest)
    ) {
      return `${previous} ${latest}`;
    }
    return latest;
  }

  private isOperationsJournalQuestion(text: string): boolean {
    if (
      this.isScheduleReadQuestion(text) ||
      /(?:свободн|ближайш)[а-я]*\s+(?:окн|врем|слот)|когда\s+можно\s+запис|есть\s+ли\s+(?:окн|мест|врем)/.test(
        text,
      )
    ) {
      return false;
    }
    const hasCalendarDate =
      /(?:сегодня|завтра|послезавтра|понедельник|понедельника|вторник|вторника|среда|среду|четверг|четверга|пятница|пятницу|суббота|субботу|воскресенье|воскресенья|\d{1,2}[./]\d{1,2}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{4}-\d{2}-\d{2})/.test(
        text,
      );
    // Именно сущности журнала, а не любая фраза со словом
    // «записан». Иначе «Иван записан сегодня» перехватывало досье клиента.
    const hasDayOperations =
      /(?:запис(?:ь|и|ей|ям|ями|ях)|визит|при[её]м|услуг|загрузк|занятост|отмен|неявк)/.test(
        text,
      );
    return hasCalendarDate && hasDayOperations;
  }

  private operationsReadContextText(
    dto: AiCoreChatDto,
    latest: string,
  ): string {
    if (this.isOperationsJournalQuestion(latest)) {
      return latest;
    }
    const previous = this.previousUserText(dto);
    if (
      previous &&
      this.isOperationsJournalQuestion(previous) &&
      /^(?:а\s+)?(?:(?:у|про)\s+)?[a-zа-я\s-]{2,60}\??$/.test(latest)
    ) {
      return `${previous} ${latest}`;
    }
    return latest;
  }

  private operationsStaffRows(value: unknown): OperationsStaffRow[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => {
        const row = this.asRecord(entry);
        const appointments = this.asRecord(row.appointments);
        if (typeof row.name !== 'string') {
          return null;
        }
        return {
          name: row.name,
          isWorking:
            typeof row.is_working === 'boolean' ? row.is_working : null,
          workingHours: this.readScheduleSlots(row.working_hours),
          appointments: {
            total: this.safeCount(appointments.total),
            active: this.safeCount(appointments.active),
            confirmed: this.safeCount(appointments.confirmed),
            completed: this.safeCount(appointments.completed),
            canceled: this.safeCount(appointments.canceled),
            noShow: this.safeCount(appointments.no_show),
            other: this.safeCount(appointments.other),
          },
          bookedMinutes: this.safeCount(row.booked_minutes),
          workingMinutes: this.safeCount(row.working_minutes),
          loadPercent:
            typeof row.load_percent === 'number' &&
            Number.isFinite(row.load_percent)
              ? row.load_percent
              : null,
        };
      })
      .filter((row): row is OperationsStaffRow => row !== null);
  }

  private operationsAppointmentRows(
    value: unknown,
  ): OperationsAppointmentRow[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) => {
        const row = this.asRecord(entry);
        if (
          typeof row.time !== 'string' ||
          typeof row.end_time !== 'string' ||
          typeof row.staff_name !== 'string' ||
          typeof row.status !== 'string'
        ) {
          return null;
        }
        return {
          time: row.time,
          endTime: row.end_time,
          status: row.status,
          staffName: row.staff_name,
          services: Array.isArray(row.services)
            ? row.services.filter(
                (service): service is string => typeof service === 'string',
              )
            : [],
        };
      })
      .filter((row): row is OperationsAppointmentRow => row !== null);
  }

  private operationsCounts(value: unknown): OperationsCounts | null {
    const row = this.asRecord(value);
    if (typeof row.total !== 'number') {
      return null;
    }
    return {
      total: this.safeCount(row.total),
      active: this.safeCount(row.active),
      confirmed: this.safeCount(row.confirmed),
      completed: this.safeCount(row.completed),
      canceled: this.safeCount(row.canceled),
      noShow: this.safeCount(row.no_show),
      other: this.safeCount(row.other),
    };
  }

  private operationsJournalReply(
    date: string,
    timezone: string,
    rows: OperationsStaffRow[],
    appointments: OperationsAppointmentRow[],
    summary: OperationsCounts,
    singleStaff: boolean,
  ): string {
    const label = this.scheduleDateLabel(date, timezone);
    if (singleStaff && rows.length === 1) {
      const row = rows[0];
      const details = appointments.slice(0, 12).map((appointment) => {
        const services =
          appointment.services.length > 0
            ? appointment.services.join(', ')
            : 'услуга не указана';
        return `${appointment.time}–${appointment.endTime} — ${services} (${this.appointmentStatusLabel(appointment.status)})`;
      });
      return [
        `${label}: ${row.name} — ${row.appointments.total} ${this.pluralize(row.appointments.total, 'запись', 'записи', 'записей')}.`,
        `Предстоящих: ${row.appointments.confirmed}, проведённых: ${row.appointments.completed}, отмен: ${row.appointments.canceled}, неявок: ${row.appointments.noShow}.`,
        row.workingHours.length > 0
          ? `Смена ${this.slotsText(row.workingHours)}; занято ${row.bookedMinutes} из ${row.workingMinutes} мин${row.loadPercent === null ? '' : `, загрузка ${this.formatPercent(row.loadPercent)}`}.`
          : row.isWorking === false
            ? 'По графику выходной.'
            : '',
        details.length > 0 ? `Записи: ${details.join('; ')}.` : '',
        appointments.length > details.length
          ? `Ещё записей: ${appointments.length - details.length}.`
          : '',
        'Источник: YClients.',
      ]
        .filter(Boolean)
        .join(' ');
    }

    const staffSummary = rows
      .slice(0, 12)
      .map(
        (row) =>
          `${row.name} — ${row.appointments.active} активных, ${row.appointments.canceled} отмен${row.loadPercent === null ? '' : `, загрузка ${this.formatPercent(row.loadPercent)}`}`,
      );
    return [
      `${label}: всего ${summary.total} ${this.pluralize(summary.total, 'запись', 'записи', 'записей')}, активных ${summary.active}, проведённых ${summary.completed}, отмен ${summary.canceled}, неявок ${summary.noShow}.`,
      staffSummary.length > 0 ? `По мастерам: ${staffSummary.join('; ')}.` : '',
      rows.length > staffSummary.length
        ? `Ещё сотрудников: ${rows.length - staffSummary.length}.`
        : '',
      'Источник: YClients.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private appointmentStatusLabel(status: string): string {
    if (status === 'confirmed') return 'ожидается';
    if (status === 'completed') return 'проведена';
    if (status === 'canceled') return 'отменена';
    if (status === 'no_show') return 'неявка';
    return 'активна';
  }

  private pluralize(
    value: number,
    one: string,
    few: string,
    many: string,
  ): string {
    const absolute = Math.abs(Math.trunc(value));
    const lastTwo = absolute % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return many;
    const last = absolute % 10;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  private formatPercent(value: number): string {
    return `${new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: 1,
    }).format(value)}%`;
  }

  private safeCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.round(value))
      : 0;
  }

  private scheduleRows(value: unknown): Array<{
    name: string;
    isWorking: boolean;
    slots: StaffScheduleSlot[];
  }> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        const row = this.asRecord(item);
        if (typeof row.name !== 'string') {
          return null;
        }
        return {
          name: row.name,
          isWorking: row.is_working === true,
          slots: this.readScheduleSlots(row.slots),
        };
      })
      .filter(
        (
          row,
        ): row is {
          name: string;
          isWorking: boolean;
          slots: StaffScheduleSlot[];
        } => row !== null,
      );
  }

  private readScheduleSlots(value: unknown): StaffScheduleSlot[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        const slot = this.asRecord(item);
        return typeof slot.from === 'string' && typeof slot.to === 'string'
          ? { from: slot.from, to: slot.to }
          : null;
      })
      .filter((slot): slot is StaffScheduleSlot => slot !== null);
  }

  private scheduleReadReply(
    date: string,
    timezone: string,
    rows: Array<{
      name: string;
      isWorking: boolean;
      slots: StaffScheduleSlot[];
    }>,
  ): string {
    const label = this.scheduleDateLabel(date, timezone);
    if (rows.length === 1) {
      const row = rows[0];
      return `${label}: ${row.name} — ${
        row.isWorking && row.slots.length > 0
          ? this.slotsText(row.slots)
          : 'выходной'
      }. Источник: YClients.`;
    }
    const working = rows
      .filter((row) => row.isWorking && row.slots.length > 0)
      .map((row) => `${row.name} ${this.slotsText(row.slots)}`);
    const off = rows
      .filter((row) => !row.isWorking || row.slots.length === 0)
      .map((row) => row.name);
    return [
      `${label}.`,
      working.length > 0
        ? `Работают: ${working.join('; ')}.`
        : 'По графику никто не работает.',
      off.length > 0 ? `Выходной: ${off.join(', ')}.` : '',
      'Источник: YClients.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private scheduleDateLabel(date: string, timezone: string): string {
    const today = this.localDate(new Date(), timezone);
    const relative =
      date === today
        ? 'Сегодня'
        : date === this.shiftDate(today, 1)
          ? 'Завтра'
          : date === this.shiftDate(today, 2)
            ? 'Послезавтра'
            : null;
    const formatted = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00.000Z`));
    return relative ? `${relative}, ${formatted}` : formatted;
  }

  private scheduleReadFailure(): StaffScheduleCommandResult {
    return this.replyOnly(
      'Не смогла сейчас получить точный график из YClients. Общей аналитикой его не заменяю — попробуйте повторить запрос.',
    );
  }

  private operationsReadFailure(): StaffScheduleCommandResult {
    return this.replyOnly(
      'Не смогла сейчас получить точный журнал записей из YClients. Месячной сводкой его не заменяю — попробуйте повторить запрос.',
    );
  }

  private detectOperation(text: string): ScheduleOperation | null {
    if (/(?:^|[^а-я])(перерыв|обед)(?:$|[^а-я])/.test(text)) {
      return 'set_break';
    }
    if (
      /(?:^|[^а-я])(?:закр(?:ой|ыть|ывай|ываем)|(?:сделай|поставь|назначь)[^.!?]{0,40}выходн)(?:$|[^а-я])/.test(
        text,
      ) &&
      /(запис|ден|сегодня|завтра|послезавтра|\d{1,2}[./]\d{1,2}|\d{4}-\d{2}-\d{2}|[а-я]+ник|сред|пятниц|суббот|воскрес)/.test(
        text,
      )
    ) {
      return 'close_day';
    }
    if (
      /(сократ|только\s+до|смен[а-я]*.*до|работ[а-я]*.*(?:с\s+\d|до\s+\d))/.test(
        text,
      )
    ) {
      return 'set_hours';
    }
    return null;
  }

  private planSlots(
    intent: ParsedScheduleIntent,
    currentSlots: StaffScheduleSlot[],
  ): { slots: StaffScheduleSlot[] } | { error: string } {
    if (intent.operation === 'close_day') {
      return { slots: [] };
    }
    if (intent.operation === 'set_break') {
      if (!intent.range) {
        return { error: 'Укажите время перерыва, например 14:00–15:00.' };
      }
      if (currentSlots.length === 0) {
        return {
          error:
            'У мастера нет рабочей смены на эту дату, поэтому перерыв добавить некуда.',
        };
      }
      const pauseFrom = scheduleTimeMinutes(intent.range.from);
      const pauseTo = scheduleTimeMinutes(intent.range.to);
      const next: StaffScheduleSlot[] = [];
      let touched = false;
      for (const slot of currentSlots) {
        const from = scheduleTimeMinutes(slot.from);
        const to = scheduleTimeMinutes(slot.to);
        if (pauseTo <= from || pauseFrom >= to) {
          next.push(slot);
          continue;
        }
        touched = true;
        if (from < pauseFrom) {
          next.push({ from: slot.from, to: intent.range.from });
        }
        if (pauseTo < to) {
          next.push({ from: intent.range.to, to: slot.to });
        }
      }
      return touched
        ? { slots: normalizeScheduleSlots(next) }
        : { error: 'Перерыв не попадает в текущую рабочую смену.' };
    }

    const range = intent.range;
    const end = range?.to ?? intent.end;
    if (!end) {
      return { error: 'До какого времени сократить рабочий день?' };
    }
    if (currentSlots.length === 0 && !range) {
      return {
        error:
          'У мастера нет смены на эту дату. Укажите полные часы, например с 10:00 до 18:00.',
      };
    }
    const fromMinutes = range
      ? scheduleTimeMinutes(range.from)
      : scheduleTimeMinutes(currentSlots[0].from);
    const toMinutes = scheduleTimeMinutes(end);
    if (fromMinutes >= toMinutes) {
      return { error: 'Начало смены должно быть раньше её окончания.' };
    }
    if (currentSlots.length === 0) {
      return { slots: [{ from: range!.from, to: range!.to }] };
    }
    const next = currentSlots
      .map((slot) => {
        const from = Math.max(fromMinutes, scheduleTimeMinutes(slot.from));
        const to = Math.min(toMinutes, scheduleTimeMinutes(slot.to));
        return from < to
          ? {
              from: scheduleMinutesLabel(from),
              to: scheduleMinutesLabel(to),
            }
          : null;
      })
      .filter((slot): slot is StaffScheduleSlot => slot !== null);
    return next.length > 0
      ? { slots: normalizeScheduleSlots(next) }
      : { error: 'Новые часы не пересекаются с текущей сменой.' };
  }

  private resolveStaff(
    text: string,
    staff: StaffMember[],
  ):
    | { kind: 'found'; staff: StaffMember }
    | { kind: 'missing' }
    | { kind: 'ambiguous'; names: string[] } {
    const words = this.words(text);
    const scored = staff
      .map((member) => ({ member, score: this.staffMatchScore(words, member) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);
    if (scored.length === 0) {
      return { kind: 'missing' };
    }
    const best = scored[0].score;
    const matches = scored.filter((entry) => entry.score === best);
    if (matches.length > 1) {
      return {
        kind: 'ambiguous',
        names: matches.map((entry) => entry.member.name),
      };
    }
    return { kind: 'found', staff: matches[0].member };
  }

  private staffMatchScore(words: string[], staff: StaffMember): number {
    const nameWords = this.words(staff.name);
    let score = 0;
    for (const nameWord of nameWords) {
      const aliases = [
        nameWord,
        ...[...GIVEN_NAME_ALIASES.entries()]
          .filter(([, canonical]) => canonical.includes(nameWord))
          .map(([alias]) => alias),
      ];
      if (
        words.some((word) =>
          aliases.some((alias) => this.wordsApproximatelyMatch(word, alias)),
        )
      ) {
        score += nameWord === nameWords[0] ? 3 : 2;
      }
    }
    return score;
  }

  private wordsApproximatelyMatch(left: string, right: string): boolean {
    const leftAliases = GIVEN_NAME_ALIASES.get(left) ?? [];
    const rightAliases = GIVEN_NAME_ALIASES.get(right) ?? [];
    if (leftAliases.includes(right) || rightAliases.includes(left)) {
      return true;
    }
    if (left === right || this.nameWordForms(right).has(left)) {
      return true;
    }
    const prefixLength = Math.min(left.length, right.length, 5);
    return (
      prefixLength >= 4 &&
      left.slice(0, prefixLength) === right.slice(0, prefixLength)
    );
  }

  private nameWordForms(name: string): Set<string> {
    const forms = new Set<string>([name]);
    const final = name.at(-1);
    const stem = name.slice(0, -1);
    if (final === 'а') {
      ['а', 'ы', 'и', 'е', 'у', 'ой', 'ою'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'я') {
      ['я', 'и', 'е', 'ю', 'ей', 'ею'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'й') {
      ['й', 'я', 'ю', 'ем', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'ь') {
      ['ь', 'я', 'и', 'ю', 'ем', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else {
      ['', 'а', 'у', 'ом', 'е'].forEach((ending) =>
        forms.add(`${name}${ending}`),
      );
    }
    return forms;
  }

  private parseDate(text: string, timezone: string): string | null {
    const today = this.localDate(new Date(), timezone);
    if (/(?:^|[^а-я])послезавтра(?:$|[^а-я])/.test(text)) {
      return this.shiftDate(today, 2);
    }
    if (/(?:^|[^а-я])завтра(?:$|[^а-я])/.test(text)) {
      return this.shiftDate(today, 1);
    }
    if (/(?:^|[^а-я])сегодня(?:$|[^а-я])/.test(text)) {
      return today;
    }
    const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (iso && this.validDateKey(iso)) {
      return iso;
    }
    const numeric = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
    if (numeric) {
      const year = numeric[3]
        ? Number(numeric[3]) < 100
          ? 2000 + Number(numeric[3])
          : Number(numeric[3])
        : Number(today.slice(0, 4));
      return this.futureDateKey(
        year,
        Number(numeric[2]),
        Number(numeric[1]),
        today,
      );
    }
    const monthPattern = [...MONTHS.keys()].join('|');
    const named = text.match(
      new RegExp(
        `\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{4}))?(?=$|[^\u0430-\u044f0-9])`,
      ),
    );
    if (named) {
      return this.futureDateKey(
        named[3] ? Number(named[3]) : Number(today.slice(0, 4)),
        MONTHS.get(named[2])!,
        Number(named[1]),
        today,
      );
    }
    for (const [word, weekday] of WEEKDAYS.entries()) {
      if (
        new RegExp(`(?:^|[^\u0430-\u044f])${word}(?:$|[^\u0430-\u044f])`).test(
          text,
        )
      ) {
        const current = new Date(`${today}T00:00:00.000Z`).getUTCDay();
        return this.shiftDate(today, (weekday - current + 7) % 7);
      }
    }
    return null;
  }

  private parseTimeRange(text: string): { from: string; to: string } | null {
    const match = text.match(
      /(?:^|\s)(?:с\s+)?(\d{1,2}(?::[0-5]\d)?)(?:\s*(?:-|\u2013|\u2014)\s*|\s+до\s+)(\d{1,2}(?::[0-5]\d)?)(?=$|\s|[.,!?])/,
    );
    if (!match) {
      return null;
    }
    const from = this.normalizeTime(match[1]);
    const to = this.normalizeTime(match[2]);
    return from && to && scheduleTimeMinutes(from) < scheduleTimeMinutes(to)
      ? { from, to }
      : null;
  }

  private parseEndTime(text: string): string | null {
    const match = text.match(
      /(?:^|\s)до\s+(\d{1,2}(?::[0-5]\d)?)(?=$|\s|[.,!?])/,
    );
    return match ? this.normalizeTime(match[1]) : null;
  }

  private normalizeTime(value: string): string | null {
    const [hourText, minuteText = '00'] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private futureDateKey(
    year: number,
    month: number,
    day: number,
    today: string,
  ): string | null {
    let candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!this.validDateKey(candidate)) {
      return null;
    }
    if (candidate < today && year === Number(today.slice(0, 4))) {
      candidate = `${year + 1}-${candidate.slice(5)}`;
    }
    return this.validDateKey(candidate) ? candidate : null;
  }

  private validDateKey(value: string): boolean {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }

  private localDate(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private shiftDate(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private async tenantTimezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    return tenant?.defaultTimezone ?? 'Europe/Moscow';
  }

  private latestUserText(dto: AiCoreChatDto): string {
    for (let index = dto.messages.length - 1; index >= 0; index -= 1) {
      if (dto.messages[index].role === 'user') {
        return dto.messages[index].content;
      }
    }
    return '';
  }

  private previousUserText(dto: AiCoreChatDto): string {
    let latestSeen = false;
    for (let index = dto.messages.length - 1; index >= 0; index -= 1) {
      if (dto.messages[index].role !== 'user') {
        continue;
      }
      if (!latestSeen) {
        latestSeen = true;
        continue;
      }
      return this.normalizeText(dto.messages[index].content);
    }
    return '';
  }

  private normalizeText(value: string): string {
    return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  private words(value: string): string[] {
    return this.normalizeText(value).match(/[a-zа-я]+/g) ?? [];
  }

  private slotsText(slots: StaffScheduleSlot[]): string {
    return slots.length === 0
      ? 'день закрыт'
      : slots.map((slot) => `${slot.from}–${slot.to}`).join(', ');
  }

  private displayDate(value: string): string {
    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }

  private idempotencyKey(
    tenantId: string,
    userId: string,
    requestId: string,
  ): string {
    return `native-schedule-${createHash('sha256')
      .update(`${tenantId}\0${userId}\0${requestId}`)
      .digest('hex')}`;
  }

  private enabled(): boolean {
    return (
      this.configService
        .get<string>('MAYA_NATIVE_SCHEDULE_ACTIONS_ENABLED')
        ?.trim()
        .toLowerCase() !== 'false'
    );
  }

  private replyOnly(reply: string): StaffScheduleCommandResult {
    return { reply, action: null, toolUsage: null };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
