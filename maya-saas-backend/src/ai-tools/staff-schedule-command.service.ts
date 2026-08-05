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
    if (dto.surface !== 'native' || !this.enabled()) {
      return null;
    }
    const rawText = this.latestUserText(dto);
    const normalizedText = this.normalizeText(rawText);
    const operation = this.detectOperation(normalizedText);
    if (!operation) {
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

  private detectOperation(text: string): ScheduleOperation | null {
    if (/\b(перерыв|обед)\b/.test(text)) {
      return 'set_break';
    }
    if (
      /(\bзакр(?:ой|ыть|ывай|ываем)\b|\bвыходн(?:ой|ым)\b)/.test(text) &&
      /(\bзапис|\bден|сегодня|завтра|послезавтра|\d{1,2}[./]\d{1,2}|\d{4}-\d{2}-\d{2}|[а-яё]+ник|\bсред|\bпятниц|\bсуббот|\bвоскрес)/.test(
        text,
      )
    ) {
      return 'close_day';
    }
    if (
      /(\bсократ|\bтолько\s+до\b|\bсмен\w*.*\bдо\b|\bработ\w*.*\bс\s+\d)/.test(
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
    if (left === right) {
      return true;
    }
    const prefixLength = Math.min(left.length, right.length, 5);
    return (
      prefixLength >= 4 &&
      left.slice(0, prefixLength) === right.slice(0, prefixLength)
    );
  }

  private parseDate(text: string, timezone: string): string | null {
    const today = this.localDate(new Date(), timezone);
    if (/\bпослезавтра\b/.test(text)) {
      return this.shiftDate(today, 2);
    }
    if (/\bзавтра\b/.test(text)) {
      return this.shiftDate(today, 1);
    }
    if (/\bсегодня\b/.test(text)) {
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
      new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`),
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
      if (new RegExp(`\\b${word}\\b`).test(text)) {
        const current = new Date(`${today}T00:00:00.000Z`).getUTCDay();
        return this.shiftDate(today, (weekday - current + 7) % 7);
      }
    }
    return null;
  }

  private parseTimeRange(text: string): { from: string; to: string } | null {
    const match = text.match(
      /(?:\bс\s+)?(\d{1,2}(?::[0-5]\d)?)(?:\s*(?:-|\u2013|\u2014)\s*|\s+до\s+)(\d{1,2}(?::[0-5]\d)?)/,
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
    const match = text.match(/\bдо\s+(\d{1,2}(?::[0-5]\d)?)\b/);
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
