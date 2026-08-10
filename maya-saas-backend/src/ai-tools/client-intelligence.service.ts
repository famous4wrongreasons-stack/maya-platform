import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import type {
  CrmClientReturnCandidate,
  CrmClientVisitInsight,
} from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import type { ChatReportCard } from './chat-report-card';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';

const PRIVATE_CLIENT_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
]);

const CLIENT_ACCESS_PATTERN =
  /(?:есть|имеет|получил|получила|видит|видишь|доступ).{0,30}(?:баз[а-яё]*\s+клиент|клиентск[а-яё]*\s+баз)|(?:баз[а-яё]*\s+клиент).{0,30}(?:доступ|видит|видишь)/iu;
const RETURN_QUEUE_PATTERN =
  /(?:кого|клиент[а-яё]*).{0,35}(?:вернут|возврат|приглас|напомн)|(?:неявк|не\s+приш[её]л|пропустил[а-яё]*\s+запис|отменил[а-яё]*\s+и\s+не\s+запис|просрочил[а-яё]*\s+цикл|давно\s+не\s+(?:был|приходил)|ушедш[а-яё]*\s+клиент)/iu;
const DOSSIER_PATTERN =
  /(?:расскажи|покажи|дай|найди|что\s+знаешь).{0,30}(?:про\s+)?(?:клиент|гост)|(?:досье|истори[а-яё]*).{0,30}(?:клиент|гост|[а-яё]{3,})|(?:что\s+(?:(?:он|она)\s+)?обычно\s+бер[её]т|что\s+(?:ему|ей)\s+предложить)/iu;

export type ClientIntelligenceCommand = {
  reply: string;
  card: ChatReportCard | null;
  toolUsage: {
    name: string;
    status: string;
    execution_id: string | null;
  };
};

@Injectable()
export class ClientIntelligenceService {
  constructor(private readonly crmService: CrmService) {}

  async tryHandle(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
  ): Promise<ClientIntelligenceCommand | null> {
    const text = this.latestUserText(dto);
    const accessQuestion = CLIENT_ACCESS_PATTERN.test(text);
    const returnQuestion = RETURN_QUEUE_PATTERN.test(text);
    const dossierQuestion = DOSSIER_PATTERN.test(text);
    if (!accessQuestion && !returnQuestion && !dossierQuestion) return null;

    if (!user.tenantId || !PRIVATE_CLIENT_ROLES.has(user.role)) {
      return this.result(
        'Полная клиентская база доступна только владельцу, управляющему или администратору этого бизнеса.',
        null,
        'clients.private.access_denied',
        'denied',
      );
    }

    try {
      if (returnQuestion || accessQuestion) {
        const candidates = await this.crmService.getClientReturnCandidates(
          user.tenantId,
          returnQuestion ? 50 : 1,
          returnQuestion ? {} : { lookbackDays: 90, futureDays: 14 },
        );
        if (accessQuestion && !returnQuestion) {
          return this.result(
            'Проверила YClients: доступ к истории записей клиентов работает. Я могу найти конкретного клиента, показать его привычные услуги и собрать очередь на возврат по неявкам, отменам и просроченному циклу.',
            null,
            'clients.private.access_check',
          );
        }
        return this.returnQueue(candidates);
      }

      const query = this.extractClientQuery(text);
      if (!query) {
        return this.result(
          'Уточните имя клиента минимум из трёх букв или последние четыре цифры телефона.',
          null,
          'clients.private.dossier',
          'needs_input',
        );
      }
      return await this.clientDossier(user.tenantId, query);
    } catch {
      return this.result(
        'Не удалось прочитать клиентскую базу YClients. Проверьте статус CRM в профиле и повторите запрос.',
        null,
        returnQuestion
          ? 'clients.private.return_candidates'
          : 'clients.private.dossier',
        'failed',
      );
    }
  }

  private async clientDossier(
    tenantId: string,
    query: string,
  ): Promise<ClientIntelligenceCommand> {
    const matches = this.uniqueMatches(
      await this.crmService.searchClients(tenantId, query),
    );
    const exact = this.exactMatches(matches, query);
    const selected =
      exact.length === 1
        ? exact[0]
        : exact.length === 0 && matches.length === 1
          ? matches[0]
          : null;

    if (!selected) {
      if (matches.length === 0) {
        return this.result(
          'В YClients такой клиент не найден. Проверьте имя или последние четыре цифры телефона.',
          null,
          'clients.private.dossier',
          'not_found',
        );
      }
      const candidates = matches.slice(0, 6).map((candidate) => ({
        display_name: candidate.name || 'Клиент',
        phone_masked: this.maskPhone(candidate.phone),
        phone_tail: this.phoneTail(candidate.phone),
      }));
      return this.result(
        'Нашла несколько совпадений. Выберите клиента по маске телефона — случайного человека я не открою.',
        {
          widget: 'client_dossier',
          widget_data: {
            mode: 'ambiguous',
            title: 'Уточните клиента',
            candidates,
          },
        },
        'clients.private.dossier',
        'ambiguous',
      );
    }

    const history = await this.crmService.getClientVisitHistory(
      tenantId,
      selected.id,
      100,
    );
    const summary = this.summarizeHistory(history);
    const lastVisit = summary.lastCompleted
      ? this.formatDate(summary.lastCompleted.start)
      : 'не было';
    const favorite = summary.favoriteServices.length
      ? summary.favoriteServices.join(', ')
      : 'пока не определены';
    const cycle = summary.averageCycleDays
      ? `${summary.averageCycleDays} дн.`
      : 'недостаточно данных';
    const bookedValue =
      summary.bookedServiceValue > 0
        ? `${summary.bookedServiceValue.toLocaleString('ru-RU')} ₽`
        : 'нет данных';
    const reply = [
      `${selected.name || 'Клиент'}: завершённых визитов — ${summary.completed}, неявок — ${summary.noShows}, отмен — ${summary.canceled}.`,
      `Последний визит: ${lastVisit}. Любимые услуги: ${favorite}. Привычный цикл: ${cycle}.`,
      `Сумма цен услуг в завершённых записях: ${bookedValue}. Это не фактически оплаченная сумма из кассы.`,
    ].join('\n');

    return this.result(
      reply,
      {
        widget: 'client_dossier',
        widget_data: {
          mode: 'found',
          title: selected.name || 'Клиент',
          phone_masked: this.maskPhone(selected.phone),
          completed_visits: summary.completed,
          no_shows: summary.noShows,
          canceled_visits: summary.canceled,
          last_completed_visit: summary.lastCompleted?.start ?? null,
          favorite_services: summary.favoriteServices,
          average_cycle_days: summary.averageCycleDays,
          booked_service_value_rub: summary.bookedServiceValue,
          value_note: 'Сумма цен услуг в записях, не подтверждённые оплаты.',
        },
      },
      'clients.private.dossier',
    );
  }

  private returnQueue(
    candidates: CrmClientReturnCandidate[],
  ): ClientIntelligenceCommand {
    if (candidates.length === 0) {
      return this.result(
        'Проверила YClients: сейчас нет клиентов без будущей записи, которые попадают в безопасные правила возврата.',
        {
          widget: 'client_return_candidates',
          widget_data: {
            title: 'Очередь возврата',
            total_count: 0,
            candidates: [],
          },
        },
        'clients.private.return_candidates',
      );
    }
    const rows = candidates.slice(0, 15).map((candidate) => ({
      display_name: candidate.name || 'Клиент',
      phone_masked: this.maskPhone(candidate.phone),
      reason_code: candidate.reason_code,
      reason: this.returnReason(candidate),
      last_event_at: candidate.last_event_at,
      last_completed_visit: candidate.last_completed_visit,
      average_cycle_days: candidate.average_cycle_days,
      days_overdue: candidate.days_overdue,
    }));
    return this.result(
      `Проверила YClients: нашла ${candidates.length} клиент(а/ов) без будущей записи. Сначала показала неявки, затем отмены без перезаписи и просроченный привычный цикл. Никакая рассылка не запущена.`,
      {
        widget: 'client_return_candidates',
        widget_data: {
          title: 'Клиенты для возврата',
          total_count: candidates.length,
          candidates: rows,
          requires_confirmation: true,
        },
      },
      'clients.private.return_candidates',
    );
  }

  private summarizeHistory(history: CrmClientVisitInsight[]) {
    const completedVisits = history.filter(
      (visit) => visit.status === 'completed',
    );
    const serviceCounts = new Map<string, number>();
    for (const visit of completedVisits) {
      for (const serviceName of visit.service_names) {
        serviceCounts.set(
          serviceName,
          (serviceCounts.get(serviceName) ?? 0) + 1,
        );
      }
    }
    const favoriteServices = [...serviceCounts.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, 3)
      .map(([name]) => name);
    const gaps: number[] = [];
    const sorted = completedVisits
      .slice()
      .sort((left, right) => left.start.localeCompare(right.start));
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = Math.round(
        (Date.parse(sorted[index].start) -
          Date.parse(sorted[index - 1].start)) /
          (24 * 60 * 60 * 1000),
      );
      if (gap >= 7 && gap <= 120) gaps.push(gap);
    }
    gaps.sort((left, right) => left - right);
    const middle = Math.floor(gaps.length / 2);
    const averageCycleDays =
      gaps.length === 0
        ? null
        : gaps.length % 2 === 1
          ? gaps[middle]
          : Math.round((gaps[middle - 1] + gaps[middle]) / 2);

    return {
      completed: completedVisits.length,
      noShows: history.filter((visit) => visit.status === 'no_show').length,
      canceled: history.filter((visit) => visit.status === 'canceled').length,
      lastCompleted: sorted.at(-1) ?? null,
      favoriteServices,
      averageCycleDays,
      bookedServiceValue: Math.round(
        completedVisits.reduce(
          (total, visit) => total + (visit.booked_service_value ?? 0),
          0,
        ),
      ),
    };
  }

  private extractClientQuery(text: string): string | null {
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-11);
    const quoted = /[«"]([^»"]{3,80})[»"]/u.exec(text)?.[1]?.trim();
    if (quoted) return quoted;
    const marker =
      /(?:про|клиент[а-яё]*|гост[а-яё]*|досье\s+(?:на\s+)?|истори[а-яё]*\s+)([\p{L}-]+(?:\s+[\p{L}-]+){0,2})/iu.exec(
        text,
      )?.[1] ?? '';
    const leading =
      /^([\p{L}-]+(?:\s+[\p{L}-]+){0,2})\s*[,—-]?\s+(?:что|кто|какие|какую)/iu.exec(
        text,
      )?.[1] ?? '';
    const query = (marker || leading)
      .replace(
        /\b(?:покажи|расскажи|найди|мне|кто|такой|такая|обычно|берет|берёт|что|предложить)\b/giu,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
    return query.length >= 3 ? query : null;
  }

  private exactMatches(
    matches: Array<{ id: string; name: string; phone: string | null }>,
    query: string,
  ) {
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 4) {
      return matches.filter((candidate) =>
        String(candidate.phone || '')
          .replace(/\D/g, '')
          .endsWith(digits),
      );
    }
    const normalized = this.normalizeName(query);
    return matches.filter(
      (candidate) => this.normalizeName(candidate.name) === normalized,
    );
  }

  private uniqueMatches(
    matches: Array<{ id: string; name: string; phone: string | null }>,
  ) {
    return [...new Map(matches.map((match) => [match.id, match])).values()];
  }

  private normalizeName(value: string): string {
    return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  private maskPhone(phone: string | null): string | null {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 4) return null;
    return `••• •••-${digits.slice(-4)}`;
  }

  private phoneTail(phone: string | null): string | null {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : null;
  }

  private returnReason(candidate: CrmClientReturnCandidate): string {
    if (candidate.reason_code === 'no_show') return 'Неявка без новой записи';
    if (candidate.reason_code === 'canceled_without_rebooking') {
      return 'Отмена без повторной записи';
    }
    return candidate.days_overdue
      ? `Привычный цикл просрочен на ${candidate.days_overdue} дн.`
      : 'Привычный цикл просрочен';
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'дата не определена';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private latestUserText(dto: AiCoreChatDto): string {
    return (
      dto.messages
        .slice()
        .reverse()
        .find((message) => message.role === 'user')?.content ?? ''
    ).trim();
  }

  private result(
    reply: string,
    card: ChatReportCard | null,
    toolName: string,
    status = 'completed',
  ): ClientIntelligenceCommand {
    return {
      reply,
      card,
      toolUsage: { name: toolName, status, execution_id: null },
    };
  }
}
