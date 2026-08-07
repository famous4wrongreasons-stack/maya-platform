import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import {
  ASSISTANT_CAPABILITY_CATALOG,
  type AssistantCapability,
} from '../dashboard-preferences/assistant-capabilities.constants';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MayaBrainService } from '../ai-brain/maya-brain.service';
import type { MayaBrainContext } from '../ai-brain/maya-brain.types';
import { AiCoreModelService } from './ai-core-model.service';
import type {
  AiCoreMessage,
  AiCoreModelDecision,
  AiCoreToolDescriptor,
  AiCoreToolResult,
} from './ai-core.types';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

const MAX_CHAT_INPUT_BYTES = 16 * 1_024;
const COMMON_PERSON_NAME_FORMS = buildCommonPersonNameForms([
  'александр',
  'алексей',
  'алёна',
  'анастасия',
  'андрей',
  'анна',
  'антон',
  'артём',
  'борис',
  'вадим',
  'валерий',
  'валерия',
  'василий',
  'виктор',
  'виктория',
  'владимир',
  'дарья',
  'диана',
  'дмитрий',
  'евгений',
  'евгения',
  'егор',
  'екатерина',
  'елена',
  'иван',
  'илья',
  'ирина',
  'кирилл',
  'константин',
  'ксения',
  'максим',
  'маргарита',
  'марина',
  'мария',
  'михаил',
  'надежда',
  'наталья',
  'никита',
  'николай',
  'олег',
  'ольга',
  'павел',
  'пётр',
  'полина',
  'роман',
  'руслан',
  'светлана',
  'сергей',
  'софия',
  'станислав',
  'татьяна',
  'тимур',
  'фёдор',
  'юлия',
  'юрий',
  'ярослав',
]);

function buildCommonPersonNameForms(names: string[]): Set<string> {
  const forms = new Set<string>();
  for (const name of names) {
    forms.add(name);
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
      ['ь', 'я', 'и', 'ю', 'ем', 'ью', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else {
      ['', 'а', 'у', 'ом', 'е'].forEach((ending) =>
        forms.add(`${name}${ending}`),
      );
    }
  }
  return forms;
}

type ToolUsage = {
  name: string;
  status: string;
  execution_id: string | null;
};

type GroundingRequirement = {
  domain: string;
  toolNames: string[];
  strictNumbers: boolean;
  presetToolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

type GroundingReport = {
  status: 'not_required' | 'verified' | 'blocked';
  domain: string | null;
  required_tools: string[];
  evidence_tools: string[];
};

type AiCoreCompletion = {
  reply: string;
  source: 'deepseek' | 'openai' | 'safe_fallback';
  action: Record<string, unknown> | null;
  grounding?: GroundingReport;
  /**
   * Числа, из-за которых ответ модели был отклонён. Уходят в аудит: без них
   * подмена ответа шаблоном невидима, и понять, что именно не сошлось,
   * можно только гаданием.
   */
  unsourced?: string[];
  /**
   * Числа, отклонённые по ПРИВЯЗКЕ: сами по себе они настоящие, но названы
   * рядом с мастером или услугой, которой не принадлежат. Отдельное поле, а не
   * общая свалка с unsourced: причина отказа тут другая, и по аудиту её надо
   * различать без гадания — «выдумала цифру» и «приписала чужую» чинятся
   * по-разному.
   */
  misattributed?: string[];
};

/**
 * Массивы результата, элементы которых — самостоятельные сущности с именем.
 *
 * Именно они дают привязку «имя → его числа». `services` встречается дважды:
 * внутри строки мастера в staff_summary[] и в staff_changes[], и оба раза это
 * разрез конкретного человека, а не общий срез салона.
 */
const ATTRIBUTION_ENTITY_ARRAY_KEYS = new Set([
  'staff_summary',
  'staff_changes',
  'service_summary',
  'service_changes',
  'services',
]);
/**
 * Дальше этого расстояния число уже не «про это имя».
 *
 * Считается по символам ОТ КРАЯ имени ДО КРАЯ числа в любую сторону: по-русски
 * владелец числа стоит и слева («у Ильи 61 запись»), и справа («17 записей у
 * Ильи»). Прежнее окно смотрело только вперёд, и во фразе «17 записей у Ильи и
 * 23 у Стаса» второе число объявлялось чужим — на этом и набралась пятая часть
 * ложных тревог.
 */
const ATTRIBUTION_ATTACH_DISTANCE = 64;
/**
 * Надбавка к расстоянию за союз между именем и числом.
 *
 * «И», «а», «но» вводят новую мысль, поэтому имя за союзом — кандидат слабый:
 * в «17 у Ильи и 23 у Стаса» до 23 от обоих имён по три символа, и без этой
 * надбавки выбор был бы монеткой. Надбавка, а не запрет: если других кандидатов
 * нет, привязка через союз всё равно состоится.
 */
const ATTRIBUTION_CONJUNCTION_PENALTY = 40;
/**
 * Насколько кандидаты должны различаться, чтобы выбор считался определённым.
 * Разница меньше — сторож молчит: ложная тревога дороже пропуска.
 */
const ATTRIBUTION_TIE_MARGIN = 8;
/**
 * Оговорка «это по салону, а не по нему». Рядом с такой пометкой общий итог
 * назван честно, и придираться к нему нельзя — иначе сторож забракует ровно
 * ту формулировку, которой мы от модели и добиваемся.
 */
const SALON_SCOPE_MARKER =
  /(по\s+салону|салон[а-яa-z]*|в\s+целом|итого|суммарно|в\s+сумме|по\s+итогам|на\s+двоих|на\s+троих|вместе|общ[а-яa-z]*|из\s+них|на\s+всех|(?<!больше\s)(?<!меньше\s)(?<!чаще\s)всего)/i;
/** «19 из 40» — второе число это база, а не показатель названного мастера. */
const SHARE_BASE_MARKER = /(?:^|[\s(])(?:из|от)\s+$/i;
/**
 * Союз, вводящий новую мысль. Между именем и числом означает, что число, скорее
 * всего, принадлежит не этому имени.
 */
const ATTRIBUTION_CONJUNCTION_PATTERN =
  /(?:^|[\s(-])(?:и|а|но|зато|хотя|же|при\s+этом|тогда\s+как|причем|причём)(?:\s|$)/i;
/**
 * Перечисление сущностей: «Илья и Стас», «у Ильи и у Стаса».
 *
 * Такая пара — совместное подлежащее, и число за ней относится к обоим сразу
 * («Илья и Стас дали 40 записей»). Проверить сумму по строкам нельзя, поэтому
 * на перечислении сторож молчит.
 */
const ATTRIBUTION_ENUMERATION_JOINER =
  /^[\s]*(?:и|или|с|плюс|вместе\s+с)[\s]*(?:у|от|для|по|в)?[\s]*$/i;
/**
 * Имена, которые сущностью не считаем.
 *
 * Строку без названия сервер подписывает словом «Услуга», и такая «сущность»
 * совпала бы с любым «по услугам» в обычной речи — а следом за этим совпадением
 * под проверку привязки попал бы весь салонный итог. То же с «мастер» и
 * «клиент»: это слова связки, а не имена.
 */
const ATTRIBUTION_GENERIC_NAMES = new Set([
  'услуга',
  'услуги',
  'мастер',
  'специалист',
  'сотрудник',
  'клиент',
  'запись',
  'прочее',
  'другое',
  'без названия',
  'не указано',
]);

type AttributionEntity = {
  key: string;
  name: string;
  numbers: Set<string>;
  kind: 'staff' | 'service';
  /**
   * Для услуги: её числа В СТРОКЕ конкретного мастера.
   *
   * Плоского множества услуги мало. «Борода» просела на 19 у Ильи и стояла
   * ровно у Стаса — по общему набору «Бороды» обе фразы одинаково законны, и
   * подмена мастера проходит незамеченной. Разрез по владельцу — единственное,
   * что их различает.
   */
  byOwner: Map<string, Set<string>>;
  /** Для мастера: выдан ли по нему разрез по услугам. */
  detailed: boolean;
};

type AttributionMention = {
  entity: AttributionEntity;
  start: number;
  end: number;
};

/**
 * Кандидат на владение числом: одно имя или перечисление имён.
 *
 * Перечисление держим отдельной сущностью, потому что число за ним не
 * принадлежит ни одному из членов по отдельности.
 */
type AttributionTarget = {
  members: AttributionMention[];
  kind: 'staff' | 'service';
  start: number;
  end: number;
};

type AttributionClause = { start: number; end: number };

const GROUNDING_FACT_PATTERN =
  /(сколько|какая|какой|какие|покажи|показать|дай|посчитай|есть\s+ли|когда|кто|мои|моя|мой|у\s+меня|за\s+сегодня|за\s+вчера|за\s+недел[а-яёa-z]*|за\s+месяц[а-яёa-z]*|сегодня|завтра)/i;
const GROUNDING_ANALYTICS_PATTERN =
  /(выруч[а-яёa-z]*|оборот[а-яёa-z]*|касс[а-яёa-z]*|доход[а-яёa-z]*|зарплат[а-яёa-z]*|средн[а-яёa-z]*\s+чек|прибыл[а-яёa-z]*|марж[а-яёa-z]*|аналитик[а-яёa-z]*|статистик[а-яёa-z]*|показател[а-яёa-z]*|цифр[а-яёa-z]*)/i;
const GROUNDING_APPOINTMENT_METRIC_PATTERN =
  /(?:(?:сколько|количеств[а-яёa-z]*|числ[а-яёa-z]*).{0,32}запис[а-яёa-z]*|запис[а-яёa-z]*.{0,32}(?:за\s+)?(?:сегодня|вчера|недел[а-яёa-z]*|месяц[а-яёa-z]*))/i;
const GROUNDING_PERSONAL_SCOPE_PATTERN =
  /(моя|мой|мои|личн[а-яёa-z]*|у\s+меня|сколько\s+я|я\s+заработ)/i;
const GROUNDING_BUSINESS_SCOPE_PATTERN =
  /(бизнес[а-яёa-z]*|компан[а-яёa-z]*|по\s+всем|все\s+сотрудник[а-яёa-z]*|все\s+специалист[а-яёa-z]*|общ[а-яёa-z]*\s+(?:выруч|касс|статист)|мы\s+заработ)/i;
// 🔴 Граница слова обязательна: «се-ГОД-ня» содержит «год», и без неё запрос
// «сравни сегодня с прошлой неделей» уезжал в годовое сравнение, а «сколько
// записей сегодня?» получал сопоставление с прошлым годом.
const GROUNDING_YEAR_COMPARISON_PATTERN =
  /(?:(?<![а-яёa-z])год[а-яёa-z]*.{0,96}(?:сравн|прошл|предыдущ)|(?:сравн|прошл|предыдущ).{0,96}(?<![а-яёa-z])год[а-яёa-z]*|(?<![а-яёa-z])год\s+к\s+году)/i;
const GROUNDING_CUSTOMER_COUNT_PATTERN =
  /(сколько\s+(?:у\s+нас\s+)?клиент[а-яёa-z]*|количеств[а-яёa-z]*\s+клиент[а-яёa-z]*|по\s+клиент[а-яёa-z]*)/i;
// 🔴 «Посоветуй как вернуть клиентов» под старый список не подходило: там были
// только «что делать» и «как исправить». Просьба о совете оставалась без совета.
const BUSINESS_ACTION_REQUEST_PATTERN =
  /(что\s+(?:с\s+этим\s+)?делать|как\s+(?:это\s+)?исправить|как\s+(?:это\s+)?улучшить|объясни.{0,32}что\s+делать|дай\s+(?:план|рекомендац)|какие\s+действия|что\s+предпринять|посоветуй|подскажи|совет[а-яёa-z]*|как\s+(?:мне\s+)?(?:вернуть|поднять|увеличить|нарастить|удержать)|что\s+можно\s+сделать)/i;
// Просьба объяснить или разобрать. Отдельно от просьбы о действии: «почему»
// требует диагноза, «что делать» — плана, и вопрос часто содержит оба.
const BUSINESS_EXPLANATION_REQUEST_PATTERN =
  /(почему|причин[а-яёa-z]*|за\s+сч[её]т\s+чего|что\s+повлиял[оа]?|разбер[а-яёa-z]*|проанализир[а-яёa-z]*|анализ[а-яёa-z]*|объясни)/i;
const GROUNDING_NUMBER_PATTERN =
  /(?<![\p{L}\p{N}_-])-?(?:\d{1,3}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_-])/gu;
/**
 * \u0427\u0438\u0441\u043b\u0430 \u0412\u041d\u0423\u0422\u0420\u0418 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044e\u0449\u0438\u0445 \u0434\u0430\u043d\u043d\u044b\u0445 \u2014 \u0431\u0435\u0437 \u043e\u0433\u043b\u044f\u0434\u043a\u0438 \u043d\u0430 \u0441\u043e\u0441\u0435\u0434\u043d\u0438\u0435 \u0441\u0438\u043c\u0432\u043e\u043b\u044b.
 * \u0421\u0442\u0440\u043e\u0433\u0438\u0439 \u0448\u0430\u0431\u043b\u043e\u043d \u0432\u044b\u0448\u0435 \u043f\u0440\u043e\u043f\u0443\u0441\u043a\u0430\u043b \u0433\u043e\u0434 \u0432 \u00ab2026-01-01\u00bb, \u0438\u0437-\u0437\u0430 \u0447\u0435\u0433\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u043d\u044b\u0439
 * \u043c\u043e\u0434\u0435\u043b\u044c\u044e \u0433\u043e\u0434 \u0441\u0447\u0438\u0442\u0430\u043b\u0441\u044f \u0432\u044b\u0434\u0443\u043c\u0430\u043d\u043d\u044b\u043c.
 */
const GROUNDING_EVIDENCE_NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?/g;
/** Дата или метка времени: из такой строки берём только год. */
const DATE_LIKE_PATTERN = /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/;
/**
 * Слова о движении показателя. Нужны, чтобы поймать переворот направления:
 * сервер отдал −9.2, а модель написала «выросли на 9,2%». По модулю число
 * подтверждено, и без этой проверки владелец увидел бы рост вместо падения.
 */
const GROWTH_WORD_PATTERN =
  /(вырос[а-яёa-z]*|рост[а-яёa-z]*|раст[её]т|увеличил[а-яёa-z]*|прибавил[а-яёa-z]*|поднял[а-яёa-z]*|выше|больше|плюс)/i;
const DECLINE_WORD_PATTERN =
  /(упал[а-яёa-z]*|снизил[а-яёa-z]*|снижен[а-яёa-z]*|просел[а-яёa-z]*|сократил[а-яёa-z]*|уменьшил[а-яёa-z]*|паден[а-яёa-z]*|потер[а-яёa-z]*|ниже|меньше|минус)/i;
const GROUNDING_SMALL_METRIC_PATTERN =
  /(?<number>\d{1,3}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:₽|руб\w*|%|балл\w*|бонус\w*|визит\w*|клиент\w*|запис\w*|минут\w*|час\w*|специалист\w*)/giu;
/**
 * Домены, где результат инструмента — личные данные самого спрашивающего.
 *
 * Их ответ собирает сервер, и во внешнюю модель полезная нагрузка не уходит.
 * Обезличивание по именам ключей тут недостаточно: история визитов человека
 * идентифицирует его сама по себе, даже без имени и телефона.
 */
const PII_SENSITIVE_DOMAINS = new Set([
  'client_appointments',
  'client_loyalty',
]);
const ASSISTANT_MANAGER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
]);

@Injectable()
export class AiCoreService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly runtime: AiToolRuntimeService,
    private readonly model: AiCoreModelService,
    private readonly auditLog: AuditLogService,
    private readonly dashboardPreferences: DashboardPreferencesService,
    private readonly staffScheduleCommand: StaffScheduleCommandService,
    private readonly brain: MayaBrainService,
  ) {}

  async chat(user: AuthenticatedUser, dto: AiCoreChatDto) {
    const tenantId = this.requireTenant(user);
    await this.rateLimit.assertTenant('ai_chat', {
      tenantId,
      identity: user.userId,
    });
    const sanitized = this.sanitizeMessages(dto.messages);
    const brain = await this.brain.prepare(user, dto, sanitized.messages);
    const scheduleCommand = await this.staffScheduleCommand.tryHandle(
      user,
      dto,
    );
    if (scheduleCommand) {
      return this.complete(
        user,
        dto,
        brain,
        false,
        scheduleCommand.toolUsage ? [scheduleCommand.toolUsage] : [],
        [],
        {
          reply: scheduleCommand.reply,
          source: 'safe_fallback',
          action: scheduleCommand.action,
        },
      );
    }
    const assistantCommand = await this.handleAssistantCommand(
      user,
      sanitized.messages,
    );
    if (assistantCommand) {
      return this.complete(user, dto, brain, sanitized.redacted, [], [], {
        ...assistantCommand,
        source: 'safe_fallback',
        action: null,
      });
    }
    if (
      brain.active &&
      brain.knowledgeRequired &&
      brain.knowledge.length === 0
    ) {
      return this.complete(user, dto, brain, sanitized.redacted, [], [], {
        reply:
          'В базе знаний пока нет подтверждённого материала по этому вопросу. Я не буду придумывать ответ — добавьте источник или сформулируйте запрос точнее.',
        source: 'safe_fallback',
        action: null,
      });
    }
    const listed = await this.runtime.listTools(user, dto.surface);
    const tools: AiCoreToolDescriptor[] = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_tier: tool.risk_tier,
      approval_policy: tool.approval_policy,
    }));
    const allowedNames = new Set(tools.map((tool) => tool.name));
    const toolResults: AiCoreToolResult[] = [];
    const toolsUsed: ToolUsage[] = [];
    const decisions: AiCoreModelDecision[] = [];
    const signatures = new Set<string>();
    const maxToolSteps = this.maxToolSteps();
    const requirement = this.groundingRequirement(
      sanitized.messages,
      allowedNames,
      brain,
    );
    const requiredToolNames =
      requirement?.toolNames.filter((name) => allowedNames.has(name)) ?? [];
    let groundingRetries = 0;
    let numberRetries = 0;
    let corrections: string[] = [];

    try {
      if (requirement && requiredToolNames.length === 0) {
        return this.complete(
          user,
          dto,
          brain,
          sanitized.redacted,
          toolsUsed,
          decisions,
          this.groundingFallback(requirement, toolResults, true),
        );
      }
      if (requirement?.presetToolCall) {
        const preset = requirement.presetToolCall;
        if (!requiredToolNames.includes(preset.name)) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            this.groundingFallback(requirement, toolResults, true),
          );
        }
        const execution = this.record(
          await this.runtime.execute(user, preset.name, {
            surface: dto.surface,
            arguments: preset.arguments,
            idempotencyKey: this.toolIdempotencyKey(
              tenantId,
              user.userId,
              dto.requestId,
              // 🔴 НЕ 0: нулевой шаг занимает первая итерация цикла. При
              // совпадении ключа рантайм сверяет аргументы и на расхождении
              // бросает конфликт идемпотентности — вопрос вида «а за прошлый
              // месяц целиком?» падал бы вместо ответа.
              -1,
              preset.name,
            ),
          }),
        );
        const status =
          typeof execution.status === 'string' ? execution.status : 'unknown';
        toolsUsed.push({
          name: preset.name,
          status,
          execution_id:
            typeof execution.execution_id === 'string'
              ? execution.execution_id
              : null,
        });
        if (status !== 'completed' || !('result' in execution)) {
          this.modelFailure('ai_tool_result_unavailable');
        }
        toolResults.push({
          name: preset.name,
          result: this.sanitizeToolResult(execution.result),
        });
        signatures.add(this.toolSignature(preset.name, preset.arguments));
        // 🔴 Здесь раньше стоял возврат готового шаблона, и цикл с моделью не
        // начинался вовсе — на типовые вопросы владельца («сколько заработали»,
        // «почему просело», «посоветуй») отвечал конструктор строк. Теперь этот
        // вызов — только предзагрузка: данные уже на руках, а озвучивает их
        // модель на первом же шаге цикла, без лишнего обращения к провайдеру.
      }
      for (let step = 0; step <= maxToolSteps; step += 1) {
        const requirementSatisfied = this.groundingSatisfied(
          requirement,
          toolResults,
        );
        if (requirement && !requirementSatisfied && step >= maxToolSteps) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            this.groundingFallback(requirement, toolResults),
          );
        }
        const pendingCorrections = corrections;
        corrections = [];
        const decision = await this.model.decide({
          surface: dto.surface,
          persona: brain.persona,
          messages: sanitized.messages,
          tools,
          toolResults: [...toolResults],
          allowToolCall: step < maxToolSteps,
          requiredToolNames:
            requirement && !requirementSatisfied ? requiredToolNames : [],
          brain,
          nowUtc: new Date().toISOString(),
          corrections: pendingCorrections,
        });
        if (!decision) {
          const deterministicReply = this.deterministicGroundedReply(
            requirement,
            toolResults,
            this.latestUserText(sanitized.messages),
          );
          if (deterministicReply) {
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              {
                reply: deterministicReply,
                source: 'safe_fallback',
                action: null,
                grounding: this.groundingReport(
                  requirement,
                  'verified',
                  toolResults,
                ),
              },
            );
          }
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply:
                'MAYA AI пока не подключена к этой среде. Доступные функции защищены и станут доступны после настройки серверного AI-ключа.',
              source: 'safe_fallback',
              action: null,
              grounding: this.groundingReport(
                requirement,
                requirement ? 'blocked' : 'not_required',
                toolResults,
              ),
            },
          );
        }
        decisions.push(decision);
        if (!decision.toolCall) {
          if (requirement && !requirementSatisfied) {
            if (groundingRetries < 1 && step < maxToolSteps) {
              groundingRetries += 1;
              continue;
            }
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              this.groundingFallback(requirement, toolResults),
            );
          }
          const reply = this.guardClientUpsell(
            brain,
            sanitized.messages,
            this.plainReply(decision.reply),
            toolResults,
          );
          const unsourced = requirement
            ? this.unsourcedNumbers(
                reply,
                requirement,
                toolResults,
                // 🔴 Весь диалог, а не последняя реплика. Собеседник ссылается
                // на цифры, названные ходом раньше — «а кто из мастеров в
                // просадке?» после разбора выручки. Эти числа уже проходили
                // сверку тогда, но сторож видел только текущий ход и объявлял
                // их выдуманными, обрывая разговор на втором вопросе.
                this.conversationText(sanitized.messages),
              )
            : [];
          // Число может быть настоящим и всё равно ложным: сказанное рядом с
          // именем, оно утверждает принадлежность. Сверка происхождения этого
          // не ловит — её множество плоское.
          // 🔴 Здесь, в отличие от сверки происхождения, идёт РЕПЛИКА
          // ВЛАДЕЛЬЦА, а не весь диалог. Числа из прошлых ответов MAYA привязку
          // не подтверждают: «61» могло стоять у Ильи ходом раньше, и зачесть
          // его Стасу сейчас — это ровно та ошибка, которую сторож ищет.
          const misattributed =
            requirement &&
            unsourced.length === 0 &&
            this.attributionGuardEnabled()
              ? this.misattributedNumbers(
                  reply,
                  requirement,
                  toolResults,
                  this.latestUserText(sanitized.messages),
                )
              : [];
          if (unsourced.length > 0 || misattributed.length > 0) {
            // Раньше любое неподтверждённое число молча стирало весь ответ. Это
            // самая частая причина шаблонов: достаточно было написать процент
            // или округлить сумму. Даём переписать один раз, назвав виновные
            // числа, и только потом падаем в детерминированный текст.
            if (numberRetries < 1 && step < maxToolSteps) {
              numberRetries += 1;
              corrections = [
                ...(unsourced.length > 0
                  ? [
                      `Эти числа отсутствуют в tool_results: ${unsourced.join(', ')}. Перепиши ответ, оставив только значения, которые есть в результатах инструментов.`,
                    ]
                  : []),
                ...(misattributed.length > 0
                  ? [
                      `Эти числа названы рядом с сущностью, которой они не принадлежат: ${misattributed.join(', ')}. Число, стоящее рядом с именем мастера или услуги, обязано быть взято из строки именно этого мастера или этой услуги; салонный итог мастеру не приписывай. Если по названному мастеру или услуге данных нет — скажи это, а не бери ближайшую цифру.`,
                    ]
                  : []),
              ];
              continue;
            }
            const deterministicReply = this.deterministicGroundedReply(
              requirement,
              toolResults,
              this.latestUserText(sanitized.messages),
            );
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              deterministicReply
                ? {
                    reply: deterministicReply,
                    source: 'safe_fallback',
                    action: null,
                    unsourced,
                    misattributed,
                    grounding: this.groundingReport(
                      requirement,
                      'verified',
                      toolResults,
                    ),
                  }
                : {
                    ...this.groundingFallback(
                      requirement as GroundingRequirement,
                      toolResults,
                    ),
                    unsourced,
                    misattributed,
                  },
            );
          }
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply,
              source: decision.provider,
              action: null,
              grounding: this.groundingReport(
                requirement,
                requirement ? 'verified' : 'not_required',
                toolResults,
              ),
            },
          );
        }
        if (step >= maxToolSteps) {
          this.modelFailure('ai_model_tool_step_limit');
        }
        if (!allowedNames.has(decision.toolCall.name)) {
          this.modelFailure('ai_model_tool_not_allowed');
        }
        if (
          requirement &&
          !requirementSatisfied &&
          !requiredToolNames.includes(decision.toolCall.name)
        ) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            this.groundingFallback(requirement, toolResults),
          );
        }
        const signature = this.toolSignature(
          decision.toolCall.name,
          decision.toolCall.arguments,
        );
        if (signatures.has(signature)) {
          this.modelFailure('ai_model_repeated_tool_call');
        }
        signatures.add(signature);

        let execution: Record<string, unknown>;
        try {
          execution = this.record(
            await this.runtime.execute(user, decision.toolCall.name, {
              surface: dto.surface,
              arguments: decision.toolCall.arguments,
              idempotencyKey: this.toolIdempotencyKey(
                tenantId,
                user.userId,
                dto.requestId,
                step,
                decision.toolCall.name,
              ),
            }),
          );
        } catch (error) {
          if (error instanceof BadRequestException) {
            this.modelFailure('ai_model_tool_arguments_invalid');
          }
          throw error;
        }
        const status =
          typeof execution.status === 'string' ? execution.status : 'unknown';
        const executionId =
          typeof execution.execution_id === 'string'
            ? execution.execution_id
            : null;
        toolsUsed.push({
          name: decision.toolCall.name,
          status,
          execution_id: executionId,
        });
        if (status === 'approval_required') {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply: 'Действие подготовлено и ждёт вашего подтверждения.',
              source: decision.provider,
              action: {
                status: 'approval_required',
                approval: execution.approval ?? null,
              },
              grounding: this.groundingReport(
                requirement,
                requirement ? 'verified' : 'not_required',
                toolResults,
              ),
            },
          );
        }
        if (status !== 'completed' || !('result' in execution)) {
          this.modelFailure('ai_tool_result_unavailable');
        }
        const safeResult = this.sanitizeToolResult(execution.result);
        toolResults.push({
          name: decision.toolCall.name,
          result: safeResult,
        });
        // Здесь раньше стоял второй перехват: как только инструмент отдавал
        // данные, ход завершался шаблоном — модель уходила за цифрами и не
        // возвращалась к микрофону, так и не увидев того, что сама запросила.
        // Теперь цикл идёт дальше и следующий шаг — её ответ по этим данным.
        //
        // 🔴 Кроме личных данных клиента. Для собственной истории визитов и
        // баланса баллов перехват сохранён: там результат инструмента — это ПД
        // самого спрашивающего (даты визитов, услуги, суммы, идентификаторы
        // CRM), и отправлять их во внешнюю модель значит вывезти их за периметр.
        // Обезличивание ключей с именами тут не помогает: набор визитов сам по
        // себе привязан к человеку. Контур 152-ФЗ важнее гладкой формулировки.
        if (PII_SENSITIVE_DOMAINS.has(requirement?.domain ?? '')) {
          const deterministicReply = this.deterministicGroundedReply(
            requirement,
            toolResults,
            this.latestUserText(sanitized.messages),
          );
          if (deterministicReply) {
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              {
                reply: deterministicReply,
                // Текст собрал сервер, а не провайдер: источник называем честно,
                // иначе в аудите шаблон не отличить от ответа модели.
                source: 'safe_fallback',
                action: null,
                grounding: this.groundingReport(
                  requirement,
                  'verified',
                  toolResults,
                ),
              },
            );
          }
        }
      }
      this.modelFailure('ai_model_tool_step_limit');
    } catch (error) {
      const deterministicReply = this.deterministicGroundedReply(
        requirement,
        toolResults,
        this.latestUserText(sanitized.messages),
      );
      if (deterministicReply) {
        // Ход упал, но пользователь получит связный текст из уже собранных
        // данных. Раньше такой случай выглядел в аудите как обычный успешный
        // ответ, и деградация модели была невидима — теперь она отмечена.
        //
        // 🔴 Без await и с проглатыванием ошибки: мы уже внутри catch, и
        // исключение отсюда ловить некому. Отказ базы аудита и отказ модели
        // приходят вместе, так что падение здесь уничтожило бы готовый ответ
        // ровно в тот момент, ради которого деградация и написана.
        void this.auditLog
          .log({
            tenantId,
            userId: user.userId,
            action: 'ai.core_turn_degraded',
            entityType: 'ai_core_turn',
            entityId: dto.requestId,
            metadata: {
              surface: dto.surface,
              error_code: this.safeErrorCode(error),
              model_calls: decisions.length,
              tools_used: toolsUsed.map((tool) => tool.name),
              grounding_domain: requirement?.domain ?? null,
            },
          })
          .catch(() => undefined);
        return this.complete(
          user,
          dto,
          brain,
          sanitized.redacted,
          toolsUsed,
          decisions,
          {
            reply: deterministicReply,
            source: 'safe_fallback',
            action: null,
            grounding: this.groundingReport(
              requirement,
              'verified',
              toolResults,
            ),
          },
        );
      }
      if (
        toolResults.length === 0 &&
        (requirement?.domain === 'business_query' ||
          requirement?.domain === 'employee_query')
      ) {
        return this.complete(
          user,
          dto,
          brain,
          sanitized.redacted,
          toolsUsed,
          decisions,
          {
            reply:
              requirement.domain === 'employee_query'
                ? 'Сейчас не отвечает источник личных показателей CRM. Это временная проблема данных, а не отсутствие ответа у MAYA. Повторите через минуту.'
                : 'Сейчас не отвечает источник бизнес-данных CRM. Это временная проблема соединения, а не отсутствие ответа у MAYA. Повторите через минуту.',
            source: 'safe_fallback',
            action: null,
            grounding: this.groundingReport(
              requirement,
              'blocked',
              toolResults,
            ),
          },
        );
      }
      await this.auditLog.log({
        tenantId,
        userId: user.userId,
        action: 'ai.core_turn_failed',
        entityType: 'ai_core_turn',
        entityId: dto.requestId,
        metadata: {
          surface: dto.surface,
          error_code: this.safeErrorCode(error),
          model_calls: decisions.length,
          tools_started: toolsUsed.length,
          redacted_input: sanitized.redacted,
        },
      });
      throw error;
    }
  }

  private async handleAssistantCommand(
    user: AuthenticatedUser,
    messages: AiCoreMessage[],
  ): Promise<{ reply: string } | null> {
    const text = this.latestUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[!?.,:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return null;

    const asksCapabilities =
      /(что\s+ты\s+умеешь|что\s+умеет\s+(?:майя|maya)|возможност[а-яa-z]*\s+(?:майи|maya)|на\s+что\s+ты\s+способна|познакомься|расскажи\s+(?:о\s+себе|что\s+можешь)|настро(?:ить|й)\s+анализ)/i.test(
        text,
      );
    const togglesOn =
      /(?:^|\s)(?:включи|подключи|активируй|добавь)(?:\s|$)/i.test(text);
    const togglesOff =
      /(?:^|\s)(?:выключи|отключи|деактивируй|убери)(?:\s|$)/i.test(text);
    const requested = this.requestedAssistantCapabilities(text);
    const isClient =
      user.role === UserRole.CLIENT || user.role === UserRole.CUSTOMER;

    if (isClient) {
      if (!asksCapabilities) return null;
      return {
        reply:
          'Я MAYA, помощница вашего бизнеса. Помогу выбрать услугу и мастера, найти реальное свободное время, записаться, показать ваши записи и проверить баллы. Личные и финансовые данные других людей я не раскрываю.',
      };
    }

    if (!ASSISTANT_MANAGER_ROLES.has(user.role)) {
      if (togglesOn || togglesOff) {
        return {
          reply:
            'Настройки аналитики меняет владелец или администратор. Я продолжу отвечать на доступные вашей роли вопросы о рабочем дне и личных показателях.',
        };
      }
      if (!asksCapabilities) return null;
      return {
        reply:
          'Я MAYA, ваша рабочая помощница. Могу показать личный план дня, записи, свободные окна и доступные вашей роли показатели. Данные бизнеса и клиентов всегда ограничены серверными правами доступа.',
      };
    }

    if (!asksCapabilities && !togglesOn && !togglesOff) return null;
    const tenantId = this.requireTenant(user);
    const preferences = await this.dashboardPreferences.getAssistant(
      tenantId,
      user.userId,
    );
    const enabled = new Set<AssistantCapability>(
      preferences.config.enabled_capabilities,
    );

    if ((togglesOn || togglesOff) && requested.length > 0) {
      for (const capability of requested) {
        if (togglesOn) enabled.add(capability);
        if (togglesOff) enabled.delete(capability);
      }
      const updated = await this.dashboardPreferences.updateAssistant(
        tenantId,
        user.userId,
        { enabledCapabilities: [...enabled] },
      );
      const changed = requested
        .map((capability) => this.assistantCapabilityTitle(capability))
        .join(', ');
      return {
        reply: `${togglesOn ? 'Включила' : 'Отключила'}: ${changed}. ${this.assistantCapabilitiesSummary(updated.config.enabled_capabilities)}`,
      };
    }

    if (togglesOn || togglesOff) {
      return {
        reply: `${this.assistantCapabilitiesSummary([...enabled])} Напишите, например: «включи анализ сотрудников» или «отключи ежедневную сводку».`,
      };
    }

    return {
      reply: `Я MAYA, ваша операционная помощница. Работаю только с данными, которые подтверждены CRM и разрешены вашей ролью. ${this.assistantCapabilitiesSummary([...enabled])} Настройки можно менять прямо здесь командами «включи...» и «отключи...».`,
    };
  }

  private guardClientUpsell(
    brain: MayaBrainContext,
    messages: AiCoreMessage[],
    reply: string,
    toolResults: AiCoreToolResult[],
  ): string {
    if (brain.persona !== 'admin' || !this.looksLikeUpsell(reply)) {
      return reply;
    }
    const latest = this.latestUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .trim();
    const clientRefused =
      /(?:^|\s)(?:нет|не\s+надо|не\s+нужно|только|без\s+доп|без\s+дополнительн|ничего\s+больше)(?=\s|[.!?,]|$)/i.test(
        latest,
      ) ||
      (/^(?:мужская\s+)?стрижк[а-яa-z]*[.!\s]*$/i.test(latest) &&
        messages.some(
          (message) =>
            message.role === 'assistant' &&
            this.looksLikeUpsell(message.content),
        ));
    const upsellAlreadyMade = messages.some(
      (message) =>
        message.role === 'assistant' && this.looksLikeUpsell(message.content),
    );
    const continueBooking =
      'Хорошо, без дополнительных услуг. Продолжаем запись: уточните мастера или удобное время.';
    if (clientRefused) {
      return continueBooking;
    }
    const catalogRead = toolResults.some(
      (result) =>
        result.name === 'catalog.services.read' &&
        Array.isArray(this.record(result.result).services),
    );
    if (!catalogRead) {
      return 'Сначала уточним основную услугу, мастера и удобное время. Дополнения предложу только после проверки каталога.';
    }
    if (!clientRefused && !upsellAlreadyMade) {
      return reply;
    }

    const cleaned = reply
      .split(/(?<=[.!?])\s+/u)
      .filter((sentence) => !this.looksLikeUpsell(sentence))
      .join(' ')
      .trim();
    return cleaned || continueBooking;
  }

  private looksLikeUpsell(text: string): boolean {
    const normalized = text.toLowerCase().replace(/ё/g, 'е');
    return /(?:можно|можем|хотите|предлагаю|давайте).{0,48}(?:добавить|дополнить|еще\s+услуг|доп[а-яa-z]*\s+услуг)|(?:добавим|добавляем).{0,48}(?:к\s+стрижке|к\s+услуге|еще)|обязательн[а-яa-z]*\s+апсейл/i.test(
      normalized,
    );
  }

  private requestedAssistantCapabilities(text: string): AssistantCapability[] {
    const result: AssistantCapability[] = [];
    const add = (capability: AssistantCapability, pattern: RegExp) => {
      if (pattern.test(text) && !result.includes(capability)) {
        result.push(capability);
      }
    };
    add(
      'daily_brief',
      /(ежедневн|утренн|дневн|сводк[а-яa-z]*\s+дн|план[а-яa-z]*\s+на\s+день)/i,
    );
    add(
      'finance_analytics',
      /(финанс|касс|деньг|выруч|оборот|средн[а-яa-z]*\s+чек)/i,
    );
    add(
      'staff_performance',
      /(сотрудник|мастер|специалист|команд|персонал|исполнен[а-яa-z]*\s+план)/i,
    );
    add(
      'client_return',
      /(возврат[а-яa-z]*\s+клиент|клиент[а-яa-z]*\s+верн|просроченн[а-яa-z]*\s+цикл)/i,
    );
    add(
      'business_analytics',
      /(анализ[а-яa-z]*\s+бизнес|бизнес[а-яa-z]*\s+аналитик|общ[а-яa-z]*\s+показател)/i,
    );
    return result;
  }

  private assistantCapabilityTitle(capability: AssistantCapability): string {
    return (
      ASSISTANT_CAPABILITY_CATALOG.find((item) => item.key === capability)
        ?.title ?? capability
    );
  }

  private assistantCapabilitiesSummary(
    enabledCapabilities: AssistantCapability[],
  ): string {
    const enabled = new Set(enabledCapabilities);
    const lines = ASSISTANT_CAPABILITY_CATALOG.map(
      (item) =>
        `${enabled.has(item.key) ? 'включено' : 'выключено'} — ${item.title}`,
    );
    return `Ваши модули: ${lines.join('; ')}.`;
  }

  private async complete(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
    brain: MayaBrainContext,
    redacted: boolean,
    toolsUsed: ToolUsage[],
    decisions: AiCoreModelDecision[],
    response: AiCoreCompletion,
  ) {
    const citedIds = [
      ...new Set(decisions.flatMap((decision) => decision.citationIds ?? [])),
    ];
    const citations = this.brain.citations(brain, citedIds);
    const missingRequiredCitation =
      brain.active && brain.knowledgeRequired && citations.length === 0;
    const completedResponse: AiCoreCompletion = missingRequiredCitation
      ? {
          reply:
            'Не нашла подтверждённого ответа в базе знаний. Я не буду дополнять его догадками.',
          source: 'safe_fallback',
          action: null,
        }
      : response;
    const grounding =
      completedResponse.grounding ??
      this.groundingReport(null, 'not_required', []);
    const usage = decisions.reduce(
      (totals, decision) => ({
        input_tokens: this.addTokenCount(
          totals.input_tokens,
          decision.usage.inputTokens,
        ),
        output_tokens: this.addTokenCount(
          totals.output_tokens,
          decision.usage.outputTokens,
        ),
        total_tokens: this.addTokenCount(
          totals.total_tokens,
          decision.usage.totalTokens,
        ),
      }),
      {
        input_tokens: null as number | null,
        output_tokens: null as number | null,
        total_tokens: null as number | null,
      },
    );
    const plan = await this.brain.recordOutcome(brain, {
      toolNames: toolsUsed.map((tool) => tool.name),
      approvalRequired: completedResponse.action !== null,
      blocked: missingRequiredCitation || grounding.status === 'blocked',
      citedIds: citations.map((citation) => citation.id),
    });
    await this.auditLog.log({
      tenantId: this.requireTenant(user),
      userId: user.userId,
      action: 'ai.core_turn_completed',
      entityType: 'ai_core_turn',
      entityId: dto.requestId,
      metadata: {
        surface: dto.surface,
        source: completedResponse.source,
        models: [...new Set(decisions.map((decision) => decision.model))],
        model_calls: decisions.length,
        tools_used: toolsUsed.map((tool) => tool.name),
        outcome: completedResponse.action ? 'approval_required' : 'reply',
        brain_profile: brain.profile,
        brain_active: brain.active,
        brain_intent: brain.intent,
        brain_prompt_version: brain.promptVersion,
        brain_plan_status: plan.status,
        brain_memory_keys: brain.preferences.map((item) => item.key),
        brain_citation_count: citations.length,
        grounding_status: grounding.status,
        grounding_domain: grounding.domain,
        grounding_evidence_tools: grounding.evidence_tools,
        // Почему ответ модели был отклонён. Только числа, без текста.
        unsourced_numbers: completedResponse.unsourced ?? [],
        // Отдельно от предыдущего: тут числа настоящие, ложной была привязка
        // к мастеру или услуге. Смешивать их в один список нельзя — по аудиту
        // разбирают, что именно пошло не так.
        misattributed_numbers: completedResponse.misattributed ?? [],
        redacted_input: redacted,
        ...usage,
      },
    });
    return {
      request_id: dto.requestId,
      reply: completedResponse.reply,
      source: completedResponse.source,
      redacted_input: redacted,
      action: completedResponse.action,
      tools_used: toolsUsed,
      grounding,
      citations,
      brain: {
        session_id: brain.sessionId,
        active: brain.active,
        profile: brain.profile,
        intent: brain.intent,
        prompt_version: brain.promptVersion,
        plan,
        memory_applied: brain.preferences.map((item) => item.key),
      },
    };
  }

  private groundingRequirement(
    messages: AiCoreMessage[],
    allowedNames: Set<string>,
    brain: MayaBrainContext,
  ): GroundingRequirement | null {
    const text = this.latestUserText(messages).toLowerCase().replace(/ё/g, 'е');
    const previousUserText = this.previousUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е');
    if (!text) {
      return null;
    }
    const factRequest = GROUNDING_FACT_PATTERN.test(text);

    if (
      /(баланс[а-яёa-z]*|сколько\s+.*(?:балл|бонус)|мои\s+(?:балл|бонус)|(?:потрат|спис|оплат)[а-яёa-z]*.*(?:балл|бонус)|на\s+что.*(?:балл|бонус))[а-яёa-z]*/i.test(
        text,
      )
    ) {
      return this.requireGrounding('client_loyalty', ['loyalty.own.read']);
    }
    if (
      /(мои\s+запис[а-яёa-z]*|(?:какие|сколько)\s+у\s+меня\s+запис[а-яёa-z]*|когда\s+я\s+записан[а-яёa-z]*|истори[а-яёa-z]*\s+(?:моих\s+)?запис[а-яёa-z]*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('client_appointments', [
        'appointments.own.list',
      ]);
    }
    if (
      /(свободн[а-яёa-z]*\s+(?:окн[а-яёa-z]*|врем[а-яёa-z]*|слот[а-яёa-z]*)|ближайш[а-яёa-z]*\s+(?:окн[а-яёa-z]*|врем[а-яёa-z]*|слот[а-яёa-z]*)|есть\s+ли\s+(?:окн[а-яёa-z]*|мест[а-яёa-z]*|врем[а-яёa-z]*)|когда\s+можно\s+запис)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('booking_availability', [
        'booking.availability.read',
      ]);
    }
    if (
      !/(подписк\w*|тариф\w*|maya|майя)/i.test(text) &&
      /(сколько\s+стоит|цен[а-яёa-z]*|прайс[а-яёa-z]*|какие\s+услуг[а-яёa-z]*|длительн[а-яёa-z]*\s+услуг[а-яёa-z]*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('service_catalog', [
        'catalog.services.read',
      ]);
    }
    if (
      /(кто\s+работает|график[а-яёa-z]*\s+(?:работ|мастер|специалист)|смен[а-яёa-z]*|выходн[а-яёa-z]*)/i.test(
        text,
      ) &&
      factRequest
    ) {
      // Availability is not a work roster, so this remains blocked until a
      // dedicated tenant-scoped schedule tool exists.
      return this.requireGrounding('staff_schedule', ['staff.schedule.read']);
    }
    if (
      /(какие\s+(?:мастер|специалист)[а-яёa-z]*|кто\s+(?:из\s+)?(?:мастер|специалист)[а-яёa-z]*|выбрать\s+(?:мастер|специалист)[а-яёa-z]*)/i.test(
        text,
      ) &&
      // 🔴 «Кто из мастеров больше всего в просадке» — это вопрос аналитики, а
      // не справочника. Прежний список исключений знал только «лучший»,
      // «выручка», «заработал» и «эффективность», поэтому вопрос уходил в
      // catalog.staff.read, цифры оттуда не подтверждались, и владелец получал
      // «не смогла подтвердить данные».
      !/(лучш[а-яёa-z]*|худш[а-яёa-z]*|хуже|выруч[а-яёa-z]*|заработ[а-яёa-z]*|эффектив[а-яёa-z]*|просад[а-яёa-z]*|просел[а-яёa-z]*|упал[а-яёa-z]*|снизил[а-яёa-z]*|динамик[а-яёa-z]*|загруз[а-яёa-z]*|отмен[а-яёa-z]*|повторн[а-яёa-z]*|показател[а-яёa-z]*|средн[а-яёa-z]*\s+чек|больше\s+всего|меньше\s+всего)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('staff_catalog', ['catalog.staff.read']);
    }
    if (/(расход[а-яёa-z]*|затрат[а-яёa-z]*)/i.test(text) && factRequest) {
      return this.requireGrounding('business_expenses', ['expenses.read']);
    }
    const customerCountRequest = GROUNDING_CUSTOMER_COUNT_PATTERN.test(text);
    if (
      GROUNDING_YEAR_COMPARISON_PATTERN.test(text) ||
      (customerCountRequest &&
        GROUNDING_YEAR_COMPARISON_PATTERN.test(previousUserText))
    ) {
      if (
        allowedNames.has('analytics.business.query') &&
        (BUSINESS_ACTION_REQUEST_PATTERN.test(text) ||
          // 🔴 «Почему просадка» уходило в compare_years, а тот отдаёт ровно
          // три числа: выручку, число операций и клиентов. Ни услуг, ни дней,
          // ни отмен — объяснить причину по ним невозможно. Просьба разобраться
          // должна идти в business.query: там 12 метрик со сравнением и разрез
          // по услугам. Чистое «на сколько изменилось» по-прежнему берёт
          // compare_years — только он сверяет деньги сразу за два года.
          BUSINESS_EXPLANATION_REQUEST_PATTERN.test(text))
      ) {
        return this.businessQueryRequirement(text, previousUserText);
      }
      if (allowedNames.has('analytics.business.compare_years')) {
        return this.requireGrounding('business_year_comparison', [
          'analytics.business.compare_years',
        ]);
      }
      if (allowedNames.has('analytics.employee.query')) {
        return this.employeeQueryRequirement(text, previousUserText);
      }
    }
    if (customerCountRequest) {
      if (allowedNames.has('analytics.business.query')) {
        return this.businessQueryRequirement(text, previousUserText);
      }
      return this.requireGrounding('customer_count', ['customers.count']);
    }
    if (
      allowedNames.has('analytics.business.query') &&
      this.isBusinessQuestion(brain, text, previousUserText, factRequest)
    ) {
      return this.businessQueryRequirement(text, previousUserText);
    }
    if (
      allowedNames.has('analytics.employee.query') &&
      this.isEmployeePerformanceQuestion(
        brain,
        text,
        previousUserText,
        factRequest,
      )
    ) {
      return this.employeeQueryRequirement(text, previousUserText);
    }
    if (
      ((GROUNDING_ANALYTICS_PATTERN.test(text) ||
        GROUNDING_APPOINTMENT_METRIC_PATTERN.test(text)) &&
        factRequest) ||
      /(сводк[а-яёa-z]*|что\s+у\s+нас\s+сегодня)/i.test(text)
    ) {
      const personal = GROUNDING_PERSONAL_SCOPE_PATTERN.test(text);
      const business = GROUNDING_BUSINESS_SCOPE_PATTERN.test(text);
      if (personal) {
        return this.requireGrounding('personal_analytics', [
          'analytics.employee.read',
        ]);
      }
      if (business) {
        return this.requireGrounding('business_analytics', [
          'analytics.business.read',
        ]);
      }
      if (
        allowedNames.has('analytics.employee.read') &&
        !allowedNames.has('analytics.business.read')
      ) {
        return this.requireGrounding('personal_analytics', [
          'analytics.employee.read',
        ]);
      }
      return this.requireGrounding('business_analytics', [
        'analytics.business.read',
      ]);
    }
    return null;
  }

  private requireGrounding(
    domain: string,
    toolNames: string[],
    presetToolCall?: GroundingRequirement['presetToolCall'],
  ): GroundingRequirement {
    return {
      domain,
      toolNames,
      strictNumbers: true,
      ...(presetToolCall ? { presetToolCall } : {}),
    };
  }

  private businessQueryRequirement(
    text: string,
    previousUserText: string,
  ): GroundingRequirement {
    return this.requireGrounding(
      'business_query',
      ['analytics.business.query'],
      {
        name: 'analytics.business.query',
        arguments: {
          period: this.reportingPeriodForQuestion(text, previousUserText),
          comparison: this.comparisonForQuestion(text, previousUserText),
        },
      },
    );
  }

  private employeeQueryRequirement(
    text: string,
    previousUserText: string,
  ): GroundingRequirement {
    return this.requireGrounding(
      'employee_query',
      ['analytics.employee.query'],
      {
        name: 'analytics.employee.query',
        arguments: {
          period: this.reportingPeriodForQuestion(text, previousUserText),
          comparison: this.comparisonForQuestion(text, previousUserText),
        },
      },
    );
  }

  private isBusinessQuestion(
    brain: MayaBrainContext,
    text: string,
    previousUserText: string,
    factRequest: boolean,
  ): boolean {
    if (
      [
        'booking',
        'schedule_management',
        'knowledge',
        'catalog',
        'loyalty',
        'support',
      ].includes(brain.intent)
    ) {
      return false;
    }
    if (
      [
        'business_analytics',
        'finance',
        'staff_operations',
        'marketing',
      ].includes(brain.intent)
    ) {
      return true;
    }
    const businessSignal =
      /(бизнес|салон|филиал|клиент|посетител|запис|визит|отмен|услуг|мастер|сотрудник|команд|выруч|оборот|касс|доход|прибыл|марж|деньг|чек|загруз|повторн|возврат|удержан|просад|рост|динамик|эффективност|показател|план|kpi)/i;
    if (businessSignal.test(text)) {
      return true;
    }
    if (
      brain.intent === 'general' &&
      !/^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер|утро)|спасибо|пока|кто\s+ты|что\s+ты\s+умеешь|как\s+дела)[!.?\s]*$/i.test(
        text.trim(),
      )
    ) {
      return true;
    }
    const shortFollowUp =
      /^(?:а\s+)?(?:почему|что\s+делать|как\s+исправить|как\s+улучшить|подробнее|а\s+по\s+этому|и\s+что|какой\s+вывод)\??$/i.test(
        text.trim(),
      );
    return (
      shortFollowUp && (businessSignal.test(previousUserText) || factRequest)
    );
  }

  private isEmployeePerformanceQuestion(
    brain: MayaBrainContext,
    text: string,
    previousUserText: string,
    factRequest: boolean,
  ): boolean {
    if (
      [
        'booking',
        'schedule_management',
        'knowledge',
        'catalog',
        'loyalty',
        'support',
      ].includes(brain.intent)
    ) {
      return false;
    }
    if (
      [
        'business_analytics',
        'finance',
        'staff_operations',
        'marketing',
      ].includes(brain.intent)
    ) {
      return true;
    }
    const performanceSignal =
      /(мой|мои|у\s+меня|я\s+заработ|моя\s+работ|мои\s+клиент|запис|выруч|чек|клиент|отмен|загруз|повторн|услуг|показател|план|kpi)/i;
    if (performanceSignal.test(text)) {
      return true;
    }
    return (
      factRequest &&
      /^(?:а\s+)?(?:почему|что\s+делать|как\s+улучшить|подробнее)/i.test(
        text,
      ) &&
      performanceSignal.test(previousUserText)
    );
  }

  private reportingPeriodForQuestion(
    text: string,
    previousUserText: string,
  ):
    | 'today'
    | 'yesterday'
    | 'week_to_date'
    | 'month_to_date'
    | 'year_to_date'
    | 'last_7_days'
    | 'last_30_days'
    | 'last_month' {
    const context = `${previousUserText} ${text}`;
    if (/(?:за\s+)?вчера/i.test(context)) return 'yesterday';
    if (/(?:за\s+)?сегодня|сегодняшн/i.test(context)) return 'today';
    if (/последн[а-яa-z]*\s+7\s+дн/i.test(context)) return 'last_7_days';
    if (/последн[а-яa-z]*\s+30\s+дн/i.test(context)) return 'last_30_days';
    if (
      /(?:за\s+)?прошл[а-яa-z]*\s+месяц/i.test(context) &&
      !/(сравн|по\s+сравнению|динамик|просел|вырос|рост|снизил|упал)/i.test(
        context,
      )
    ) {
      return 'last_month';
    }
    if (/год|годов|годовой/i.test(context)) return 'year_to_date';
    if (/недел/i.test(context)) return 'week_to_date';
    if (/месяц/i.test(context)) return 'month_to_date';
    return 'month_to_date';
  }

  private comparisonForQuestion(
    text: string,
    previousUserText: string,
  ): 'none' | 'previous_period' | 'previous_year_same_period' {
    const context = `${previousUserText} ${text}`;
    if (GROUNDING_YEAR_COMPARISON_PATTERN.test(context)) {
      return 'previous_year_same_period';
    }
    if (
      /(сравн|по\s+сравнению|динамик|изменил|просад|просел|вырос|рост|снизил|упал|лучше|хуже|предыдущ[а-яa-z]*\s+(?:период|месяц|недел)|прошл[а-яa-z]*\s+(?:период|месяц|недел))/i.test(
        context,
      )
    ) {
      return 'previous_period';
    }
    // 🔴 Просьба объяснить или посоветовать без сравнения бессмысленна: без
    // него инструмент вернёт changes={} и service_changes=[], и разбирать
    // будет нечего — ответом снова станет перечень текущих счётчиков, ровно
    // та жалоба, ради которой всё и затевалось.
    if (
      BUSINESS_ACTION_REQUEST_PATTERN.test(text) ||
      BUSINESS_EXPLANATION_REQUEST_PATTERN.test(text)
    ) {
      return 'previous_period';
    }
    return 'none';
  }

  private groundingSatisfied(
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
  ): boolean {
    return (
      !requirement ||
      toolResults.some((result) => requirement.toolNames.includes(result.name))
    );
  }

  private groundingReport(
    requirement: GroundingRequirement | null,
    status: GroundingReport['status'],
    toolResults: AiCoreToolResult[],
  ): GroundingReport {
    return {
      status,
      domain: requirement?.domain ?? null,
      required_tools: requirement?.toolNames ?? [],
      evidence_tools: requirement
        ? [
            ...new Set(
              toolResults
                .map((result) => result.name)
                .filter((name) => requirement.toolNames.includes(name)),
            ),
          ]
        : [],
    };
  }

  private groundingFallback(
    requirement: GroundingRequirement,
    toolResults: AiCoreToolResult[],
    unavailableForCurrentAccess = false,
  ) {
    return {
      reply: unavailableForCurrentAccess
        ? 'Этот запрос недоступен для вашей текущей роли или тарифа. MAYA не покажет чужие или закрытые данные.'
        : 'Не смогла подтвердить данные в защищённом источнике MAYA. Чтобы не показать неверные цифры или факты, попробуйте повторить запрос позже.',
      source: 'safe_fallback' as const,
      action: null,
      grounding: this.groundingReport(requirement, 'blocked', toolResults),
    };
  }

  private deterministicGroundedReply(
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): string | null {
    if (
      requirement?.domain === 'business_query' ||
      requirement?.domain === 'employee_query'
    ) {
      const reply = this.deterministicAnalyticsQueryReply(
        requirement,
        toolResults,
        userText,
      );
      if (!reply) {
        return null;
      }
      const toolName =
        requirement.domain === 'employee_query'
          ? 'analytics.employee.query'
          : 'analytics.business.query';
      const evidence = toolResults.find((result) => result.name === toolName);
      return this.appendAnalyticsFreshness(reply, evidence?.result);
    }
    if (requirement?.domain === 'business_year_comparison') {
      const evidence = toolResults.find(
        (result) => result.name === 'analytics.business.compare_years',
      );
      if (!evidence) {
        return null;
      }
      const data = this.record(evidence.result);
      const periods = this.record(data.periods);
      const currentPeriod = this.record(periods.current);
      const previousPeriod = this.record(periods.previous);
      const revenue = this.record(data.revenue);
      const transactions = this.record(data.transactions);
      const clients = this.record(data.clients);
      const currentRevenue = this.formatMoneyAmount(revenue.current);
      const previousRevenue = this.formatMoneyAmount(revenue.previous);
      const revenueDelta = this.formatMoneyAmount(revenue.delta);

      if (
        data.verified !== true ||
        !currentRevenue ||
        !previousRevenue ||
        !revenueDelta
      ) {
        return 'Не удалось получить подтверждённые финансовые операции сразу за оба годовых периода. Я не буду подменять их стоимостью записей или приблизительным расчётом.';
      }

      const currentLabel =
        this.comparisonPeriodLabel(currentPeriod) ?? 'текущий период';
      const previousLabel =
        this.comparisonPeriodLabel(previousPeriod) ??
        'аналогичный период прошлого года';
      const revenueDeltaKopecks = this.optionalMetricNumber(
        this.record(revenue.delta).amount_kopecks,
      );
      const transactionCurrent = this.optionalMetricNumber(
        transactions.current,
      );
      const transactionPrevious = this.optionalMetricNumber(
        transactions.previous,
      );
      const transactionDelta = this.optionalMetricNumber(transactions.delta);
      const revenuePercent = this.formatSignedPercent(revenue.percent_change);
      const transactionPercent = this.formatSignedPercent(
        transactions.percent_change,
      );
      const clientCurrent = this.optionalMetricNumber(clients.current);
      const clientPrevious = this.optionalMetricNumber(clients.previous);
      const clientDelta = this.optionalMetricNumber(clients.delta);
      const clientPercent = this.formatSignedPercent(clients.percent_change);
      const clientLine =
        clients.verified === true &&
        clientCurrent !== null &&
        clientPrevious !== null &&
        clientDelta !== null
          ? `Уникальных клиентов с CRM-картой по неотменённым записям: ${this.formatMetricNumber(clientCurrent)} против ${this.formatMetricNumber(clientPrevious)}. Изменение: ${this.signedValue(clientDelta, this.formatMetricNumber(Math.abs(clientDelta)))}${clientPercent ? ` (${clientPercent})` : ''}.`
          : null;
      const customerFocused = GROUNDING_CUSTOMER_COUNT_PATTERN.test(
        userText.toLowerCase().replace(/ё/g, 'е'),
      );

      if (customerFocused) {
        const reply = clientLine
          ? `Сравнила одинаковые периоды: ${currentLabel} и ${previousLabel}. ${clientLine} Источник — подтверждённый журнал записей CRM.`
          : 'Не удалось получить из CRM подтверждённое число уникальных клиентов сразу за оба периода. Я не буду подменять клиентов транзакциями или локальным счётчиком.';
        return this.appendAnalyticsFreshness(reply, evidence.result);
      }
      const financeLine = `Поступления: ${currentRevenue} против ${previousRevenue}. Изменение: ${this.signedValue(revenueDeltaKopecks, revenueDelta)}${revenuePercent ? ` (${revenuePercent})` : ''}.`;
      const transactionLine =
        transactionCurrent !== null &&
        transactionPrevious !== null &&
        transactionDelta !== null
          ? `Положительных финансовых операций: ${this.formatMetricNumber(transactionCurrent)} против ${this.formatMetricNumber(transactionPrevious)}. Изменение: ${this.signedValue(transactionDelta, this.formatMetricNumber(Math.abs(transactionDelta)))}${transactionPercent ? ` (${transactionPercent})` : ''}.`
          : null;

      const reply = [
        `Сравнила одинаковые периоды: ${currentLabel} и ${previousLabel}.`,
        financeLine,
        transactionLine,
        clientLine,
        clientLine
          ? 'Источник — подтверждённые операции и журнал записей CRM.'
          : 'Источник — подтверждённые операции CRM.',
      ]
        .filter((part): part is string => part !== null)
        .join(' ');
      return this.appendAnalyticsFreshness(reply, evidence.result);
    }

    if (requirement?.domain === 'booking_availability') {
      const evidence = toolResults.find(
        (result) => result.name === 'booking.availability.read',
      );
      if (!evidence) {
        return null;
      }
      const slots = this.record(evidence.result).slots;
      if (!Array.isArray(slots)) {
        return null;
      }
      const dateMatch = userText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      const dateLabel = dateMatch
        ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`
        : 'выбранную дату';
      if (slots.length === 0) {
        return `На ${dateLabel} свободных окон нет. Проверить другую дату?`;
      }
      return `На ${dateLabel} есть свободные окна: ${slots.length} ${this.pluralize(slots.length, 'вариант', 'варианта', 'вариантов')} времени. Уточните специалиста или услугу, чтобы сузить выбор.`;
    }

    if (requirement?.domain === 'client_loyalty') {
      const evidence = toolResults.find(
        (result) => result.name === 'loyalty.own.read',
      );
      if (!evidence) {
        return null;
      }
      const loyalty = this.record(evidence.result);
      const balance = this.safeMetricNumber(loyalty.balance);
      const balanceLabel = `${this.formatMetricNumber(balance)} ${this.pluralize(balance, 'балл', 'балла', 'баллов')}`;
      const text = userText.toLowerCase().replace(/ё/g, 'е');
      if (!/(потрат|спис|оплат|на\s+что)/i.test(text)) {
        return `Ваш баланс: ${balanceLabel}.`;
      }
      const spend = this.record(loyalty.spend_options);
      const items = Array.isArray(spend.items)
        ? spend.items
            .slice(0, 3)
            .map((entry) => {
              const item = this.record(entry);
              if (typeof item.name !== 'string') {
                return null;
              }
              const points = this.safeMetricNumber(item.points_required);
              return `${item.name} — ${this.formatMetricNumber(points)} ${this.pluralize(points, 'балл', 'балла', 'баллов')}`;
            })
            .filter((entry): entry is string => entry !== null)
        : [];
      return items.length > 0
        ? `Ваш баланс: ${balanceLabel}. Можно рассмотреть: ${items.join('; ')}. Перед списанием MAYA ещё раз проверит сумму и попросит подтверждение.`
        : `Ваш баланс: ${balanceLabel}. Подходящих услуг для списания сейчас нет.`;
    }

    if (requirement?.domain === 'client_appointments') {
      const evidence = toolResults.find(
        (result) => result.name === 'appointments.own.list',
      );
      if (!evidence) {
        return null;
      }
      const appointments = this.record(evidence.result).appointments;
      if (!Array.isArray(appointments) || appointments.length === 0) {
        return 'У вас пока нет записей.';
      }
      const upcoming = appointments.filter((entry) => {
        const item = this.record(entry);
        return item.is_upcoming === true && item.status !== 'canceled';
      }).length;
      const cancelled = appointments.filter(
        (entry) => this.record(entry).status === 'canceled',
      ).length;
      return `В вашей истории ${appointments.length} ${this.pluralize(appointments.length, 'запись', 'записи', 'записей')}. Предстоящих: ${upcoming}, отменённых: ${cancelled}. Подробности доступны в разделе «Записи».`;
    }

    if (
      requirement?.domain !== 'business_analytics' &&
      requirement?.domain !== 'personal_analytics'
    ) {
      return null;
    }
    const toolName =
      requirement.domain === 'personal_analytics'
        ? 'analytics.employee.read'
        : 'analytics.business.read';
    const evidence = toolResults.find((result) => result.name === toolName);
    if (!evidence) {
      return null;
    }
    const data = this.record(evidence.result);
    const finance = this.record(data.finance);
    const payroll = this.record(finance.payroll);
    const text = userText.toLowerCase().replace(/ё/g, 'е');
    const scope =
      requirement.domain === 'personal_analytics' ? 'вашим данным' : 'бизнесу';

    if (/зарплат[а-яa-z]*/i.test(text)) {
      const accrued = this.formatMoneyAmount(payroll.accrued_total);
      if (
        requirement.domain === 'business_analytics' &&
        payroll.status === 'available' &&
        payroll.verified === true &&
        accrued
      ) {
        const paid = this.formatMoneyAmount(payroll.paid_total);
        const balance = this.formatMoneyAmount(payroll.balance_total);
        return [
          `Начислено сотрудникам по данным CRM за выбранный период: ${accrued}.`,
          paid ? `Выплачено: ${paid}.` : null,
          balance ? `Остаток к выплате: ${balance}.` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' ');
      }
      if (payroll.status === 'partial') {
        return 'CRM вернула расчёт зарплаты не по всем сотрудникам, поэтому общую сумму я не называю. Проверьте права финансового доступа в CRM.';
      }
      return 'Подтверждённый расчёт зарплаты за выбранный период недоступен. Я не буду рассчитывать его приблизительно из выручки.';
    }
    if (/валов[а-яa-z]*\s+прибыл[а-яa-z]*/i.test(text)) {
      return 'Валовая прибыль сейчас не рассчитывается: в данных есть выручка и внесённые расходы, но прямые затраты на оказание услуг не выделены отдельно. Я не буду подменять её выручкой или операционным результатом.';
    }
    if (/марж[а-яa-z]*/i.test(text)) {
      return 'Маржа сейчас не рассчитывается отдельным подтверждённым показателем. Нужна классификация прямых затрат, поэтому я не буду выводить её из выручки приблизительно.';
    }
    if (/средн[а-яa-z]*\s+чек/i.test(text)) {
      const averageTicket = this.formatVerifiedMoneyEntries(
        data.average_ticket,
      );
      return averageTicket
        ? `Средний чек по ${scope} за выбранный период: ${averageTicket}.`
        : `Подтверждённый средний чек по ${scope} за выбранный период недоступен. Я не буду выводить его из стоимости записей приблизительно.`;
    }
    if (GROUNDING_APPOINTMENT_METRIC_PATTERN.test(text)) {
      const appointments = this.record(data.appointments);
      const total = this.safeMetricNumber(appointments.total);
      const active = this.safeMetricNumber(appointments.active);
      const cancelled = this.safeMetricNumber(appointments.cancelled);
      return `Записей по ${scope} за выбранный период: ${total}. Активных: ${active}, отменённых: ${cancelled}.`;
    }
    if (/чист[а-яa-z]*\s+прибыл[а-яa-z]*|прибыл[а-яa-z]*/i.test(text)) {
      const net = this.formatVerifiedMoneyEntries(data.net);
      return net
        ? `Операционный результат по ${scope} за выбранный период: ${net}. Это выручка минус внесённые расходы, а не бухгалтерская чистая прибыль.`
        : `Операционный результат по ${scope} за выбранный период недоступен: CRM не передала полный набор подтверждённых расходов. Я не буду подменять прибыль выручкой.`;
    }
    if (
      /выруч[а-яa-z]*|оборот[а-яa-z]*|касс[а-яa-z]*|доход[а-яa-z]*/i.test(text)
    ) {
      const revenue = this.formatVerifiedMoneyEntries(data.revenue);
      if (!revenue) {
        return `Подтверждённые денежные поступления по ${scope} за выбранный период недоступны. Я не буду использовать вместо них стоимость записей.`;
      }
      return finance.source === 'external_crm'
        ? `Подтверждённые поступления по данным CRM за выбранный период: ${revenue}.`
        : `Выручка по ${scope} за выбранный период: ${revenue}.`;
    }
    return null;
  }

  private appendAnalyticsFreshness(reply: string, evidence: unknown): string {
    const data = this.record(evidence);
    const freshness = this.record(data.freshness);
    if (
      freshness.status !== 'stale' ||
      typeof freshness.snapshot_at !== 'string'
    ) {
      return reply;
    }
    const snapshotAt = new Date(freshness.snapshot_at);
    if (!Number.isFinite(snapshotAt.getTime())) {
      return `${reply} Временно показываю последний подтверждённый снимок: CRM сейчас не ответила, данные не обнулены.`;
    }
    const period = this.record(data.period);
    const timezone =
      typeof period.timezone === 'string'
        ? period.timezone
        : typeof data.timezone === 'string'
          ? data.timezone
          : 'UTC';
    let label: string;
    try {
      label = new Intl.DateTimeFormat('ru-RU', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(snapshotAt);
    } catch {
      label = snapshotAt.toISOString();
    }
    return `${reply} Временно показываю последний подтверждённый снимок от ${label}: CRM сейчас не ответила, данные не обнулены.`;
  }

  private deterministicAnalyticsQueryReply(
    requirement: GroundingRequirement,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): string | null {
    const personal = requirement.domain === 'employee_query';
    const toolName = personal
      ? 'analytics.employee.query'
      : 'analytics.business.query';
    const evidence = toolResults.find((result) => result.name === toolName);
    if (!evidence) {
      return null;
    }

    const data = this.record(evidence.result);
    const metrics = this.record(data.metrics);
    const changes = this.record(data.changes);
    const current = this.record(data.current);
    const comparison = this.record(data.comparison);
    const text = userText.toLowerCase().replace(/ё/g, 'е');
    const requestedRecommendation = BUSINESS_ACTION_REQUEST_PATTERN.test(text)
      ? this.analyticsRecommendation(data, personal)
      : null;
    const requestedDiagnosis = BUSINESS_EXPLANATION_REQUEST_PATTERN.test(text)
      ? this.analyticsDiagnosis(data, personal)
      : null;
    const withRecommendation = (reply: string) =>
      [reply, requestedDiagnosis, requestedRecommendation]
        .filter((part): part is string => Boolean(part))
        .join(' ');
    const comparisonLabel =
      comparison.mode === 'previous_year_same_period'
        ? 'с аналогичным периодом прошлого года'
        : comparison.mode === 'previous_period'
          ? 'с предыдущим равным периодом'
          : null;
    const metric = (key: string) => this.optionalMetricNumber(metrics[key]);
    const metricChange = (
      key: string,
      formatter: (value: number) => string = (value) =>
        this.formatMetricNumber(value),
    ) => {
      const change = this.record(changes[key]);
      const delta = this.optionalMetricNumber(change.delta);
      if (delta === null || !comparisonLabel) {
        return '';
      }
      const percent = this.formatSignedPercent(change.percent_change);
      return ` Изменение ${comparisonLabel}: ${this.signedValue(delta, formatter(Math.abs(delta)))}${percent ? ` (${percent})` : ''}.`;
    };
    const money = (value: number) =>
      this.formatMoneyEntries([
        {
          currency: this.analyticsCurrency(current),
          amount_kopecks: value,
        },
      ]);
    const countLine = (
      label: string,
      key: string,
      suffix = '',
    ): string | null => {
      const value = metric(key);
      const previous = this.optionalMetricNumber(
        this.record(changes[key]).previous,
      );
      return value === null
        ? null
        : `${label}: ${this.formatMetricNumber(value)}${suffix}${comparisonLabel && previous !== null ? ` против ${this.formatMetricNumber(previous)}${suffix}` : ''}.${metricChange(key)}`;
    };

    if (
      /(чист[а-яa-z]*|бухгалтер[а-яa-z]*)\s+прибыл|прибыл[а-яa-z]*/i.test(text)
    ) {
      const revenue = metric('revenue_amount_kopecks');
      return `Бухгалтерскую чистую прибыль CRM не подтверждает: нет полного учёта налогов и всех расходов.${revenue === null ? '' : ` Ближайший подтверждённый показатель — поступления ${money(revenue)}.`}`;
    }
    if (/зарплат[а-яa-z]*/i.test(text) && !personal) {
      const payroll = this.record(this.record(current.finance).payroll);
      const accrued = this.formatMoneyAmount(payroll.accrued_total);
      if (
        payroll.status === 'available' &&
        payroll.verified === true &&
        accrued
      ) {
        const paid = this.formatMoneyAmount(payroll.paid_total);
        const balance = this.formatMoneyAmount(payroll.balance_total);
        return [
          `Начислено сотрудникам по данным CRM: ${accrued}.`,
          paid ? `Выплачено: ${paid}.` : null,
          balance ? `Остаток к выплате: ${balance}.` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' ');
      }
      return 'Подтверждённый расчёт зарплат за выбранный период недоступен. Я не буду рассчитывать его из выручки.';
    }
    if (/(марж|валов[а-яa-z]*\s+прибыл)/i.test(text)) {
      return 'В CRM нет распределения прямых затрат по услугам, поэтому валовую маржу достоверно рассчитать нельзя. Доступны поступления, средний чек, записи, клиенты, отмены и динамика услуг.';
    }
    if (
      /(roi|окупаемост[^а-яa-z]*реклам|эффективност[^а-яa-z]*реклам)/i.test(
        text,
      )
    ) {
      return 'В CRM нет расходов на рекламу с атрибуцией к записям, поэтому marketing ROI пока не рассчитывается. Могу оценить динамику клиентов, записей и поступлений.';
    }
    if (
      // 🔴 Было /(?:...|по).{0,24}клиент/ без границы слова, и предлог «по»
      // находился внутри «ПОсоветуй как вернуть клиентов»: просьбу о совете
      // ветка принимала за вопрос «сколько клиентов» и отвечала счётчиком.
      /(?:количеств[а-яa-z]*|сколько|числ[а-яa-z]*|(?<![а-яa-z])по)\s[^.?!]{0,24}клиент|клиент.{0,24}(?:просел|вырос|динамик)/i.test(
        text,
      )
    ) {
      const line = countLine(
        personal
          ? 'Ваших уникальных клиентов по неотменённым записям'
          : 'Уникальных клиентов с CRM-картой по неотменённым записям',
        'unique_clients',
      );
      if (!line) {
        return 'В журнале CRM нет подтверждённого идентификатора клиента для этого среза; записи и транзакции при этом доступны.';
      }
      return withRecommendation(line);
    }
    if (/(повторн|возвращ|удержан)/i.test(text)) {
      const repeat = metric('repeat_clients_in_period');
      const rate = metric('repeat_client_rate_percent');
      if (repeat !== null) {
        return withRecommendation(
          `Повторных клиентов внутри выбранного периода: ${this.formatMetricNumber(repeat)}${rate === null ? '' : `, доля ${this.formatMetricNumber(rate)}%`}.${metricChange('repeat_clients_in_period')}`,
        );
      }
    }
    if (/(отмен|не\s+пришел|неявк)/i.test(text)) {
      const cancelled = metric('appointments_cancelled');
      const rate = metric('cancellation_rate_percent');
      if (cancelled !== null) {
        return withRecommendation(
          `Отменённых записей: ${this.formatMetricNumber(cancelled)}${rate === null ? '' : `, доля ${this.formatMetricNumber(rate)}%`}.${metricChange('appointments_cancelled')}`,
        );
      }
    }
    if (/средн[а-яa-z]*\s+чек/i.test(text)) {
      const key = personal
        ? 'average_booked_value_amount_kopecks'
        : 'average_ticket_amount_kopecks';
      const value = metric(key);
      return value === null
        ? personal
          ? 'Личная кассовая выручка мастера не атрибутируется CRM. Доступна средняя стоимость записанных услуг.'
          : 'Подтверждённый средний чек за выбранный период недоступен.'
        : `${personal ? 'Средняя стоимость записанных услуг' : 'Средний чек'}: ${money(value)}.${metricChange(key, money)}${
            personal
              ? ' Первое действие: после консультации предлагайте один действительно подходящий уход из каталога, без давления и повторной продажи после отказа.'
              : ''
          }`;
    }
    if (/(выруч|оборот|касс|доход|деньг|заработ)/i.test(text)) {
      const key = personal
        ? 'booked_value_amount_kopecks'
        : 'revenue_amount_kopecks';
      const value = metric(key);
      return value === null
        ? personal
          ? 'Кассовую выручку конкретного мастера CRM не подтверждает. Могу показать стоимость его записанных услуг, загрузку и повторных клиентов.'
          : 'Подтверждённые денежные поступления за выбранный период недоступны.'
        : withRecommendation(
            `${personal ? 'Стоимость записанных вам услуг' : 'Подтверждённые поступления'}: ${money(value)}.${metricChange(key, money)}${personal ? ' Это стоимость записей, а не кассовая выручка.' : ''}`,
          );
    }
    if (/(услуг|стриж|бород|популяр|спрос)/i.test(text)) {
      const serviceChanges = Array.isArray(data.service_changes)
        ? data.service_changes.map((entry) => this.record(entry))
        : [];
      const declining = serviceChanges.find(
        (entry) =>
          this.optionalMetricNumber(entry.delta) !== null &&
          Number(entry.delta) < 0,
      );
      if (declining && typeof declining.name === 'string') {
        const delta = this.safeMetricNumber(declining.delta);
        const currentAppointments = this.safeMetricNumber(
          declining.current_appointments,
        );
        const previousAppointments = this.safeMetricNumber(
          declining.previous_appointments,
        );
        const percent = this.formatSignedPercent(declining.percent_change);
        return withRecommendation(
          `Наибольшая просадка по услугам: ${declining.name} — ${this.formatMetricNumber(currentAppointments)} записей против ${this.formatMetricNumber(previousAppointments)}, изменение ${this.signedValue(delta, this.formatMetricNumber(Math.abs(delta)))}${percent ? ` (${percent})` : ''}.`,
        );
      }
      const services = Array.isArray(current.service_summary)
        ? current.service_summary
            .slice(0, 3)
            .map((entry) => this.record(entry))
            .filter((entry) => typeof entry.name === 'string')
        : [];
      if (services.length > 0) {
        return withRecommendation(
          `Лидеры по числу записей: ${services
            .map(
              (entry) =>
                `${String(entry.name)} — ${this.formatMetricNumber(this.safeMetricNumber(entry.appointments))}`,
            )
            .join('; ')}.`,
        );
      }
    }
    if (/(загруз|час|минут|занятост)/i.test(text)) {
      const minutes = metric('booked_minutes');
      if (minutes !== null) {
        return withRecommendation(
          `Записанное рабочее время: ${this.formatDuration(minutes)}.${metricChange('booked_minutes', (value) => this.formatDuration(value))}`,
        );
      }
    }
    if (/(запис|визит|посещен)/i.test(text)) {
      const total = metric('appointments_total');
      const active = metric('appointments_active');
      const cancelled = metric('appointments_cancelled');
      if (total !== null) {
        return withRecommendation(
          `Записей: ${this.formatMetricNumber(total)}${active === null ? '' : `, активных ${this.formatMetricNumber(active)}`}${cancelled === null ? '' : `, отменённых ${this.formatMetricNumber(cancelled)}`}.${metricChange('appointments_total')}`,
        );
      }
    }

    const summary = [
      personal
        ? this.analyticsMoneySummary(
            'Стоимость записанных услуг',
            metric('booked_value_amount_kopecks'),
            money,
          )
        : this.analyticsMoneySummary(
            'Поступления',
            metric('revenue_amount_kopecks'),
            money,
          ),
      countLine('Записи', 'appointments_total'),
      countLine('Уникальные клиенты', 'unique_clients'),
    ].filter((part): part is string => Boolean(part));
    const recommendation =
      requestedRecommendation ?? this.analyticsRecommendation(data, personal);
    const insight = [requestedDiagnosis, recommendation]
      .filter((part): part is string => Boolean(part))
      .join(' ');
    return summary.length > 0
      ? `${summary.join(' ')}${insight ? ` ${insight}` : ''}`
      : null;
  }

  private analyticsMoneySummary(
    label: string,
    value: number | null,
    formatter: (value: number) => string,
  ): string | null {
    return value === null ? null : `${label}: ${formatter(value)}.`;
  }

  private analyticsRecommendation(
    data: Record<string, unknown>,
    personal: boolean,
  ): string | null {
    const metrics = this.record(data.metrics);
    const changes = this.record(data.changes);
    const cancellationRate = this.optionalMetricNumber(
      metrics.cancellation_rate_percent,
    );
    const clientChange = this.record(changes.unique_clients);
    const clientDelta = this.optionalMetricNumber(clientChange.delta);
    const serviceChanges = Array.isArray(data.service_changes)
      ? data.service_changes.map((entry) => this.record(entry))
      : [];
    const decliningService = serviceChanges.find(
      (entry) =>
        this.optionalMetricNumber(entry.delta) !== null &&
        Number(entry.delta) < 0,
    );

    if (cancellationRate !== null && cancellationRate >= 10) {
      return `Первое действие: снизить отмены через подтверждение записи и точечное напоминание — сейчас их доля ${this.formatMetricNumber(cancellationRate)}%.`;
    }
    if (clientDelta !== null && clientDelta < 0) {
      return personal
        ? 'Первое действие: вернуться к клиентам, у которых уже закончился обычный цикл визита.'
        : 'Первое действие: сегментировать уснувших клиентов по их обычному циклу и запустить точечный возврат.';
    }
    if (decliningService && typeof decliningService.name === 'string') {
      return `Первое действие: разобрать просадку услуги «${decliningService.name}» по мастерам, окнам и повторным визитам.`;
    }
    return null;
  }

  private analyticsDiagnosis(
    data: Record<string, unknown>,
    personal: boolean,
  ): string | null {
    const changes = this.record(data.changes);
    const candidates = [
      {
        key: 'unique_clients',
        label: personal
          ? 'число ваших уникальных клиентов'
          : 'число уникальных клиентов',
      },
      { key: 'appointments_total', label: 'количество записей' },
      {
        key: personal
          ? 'average_booked_value_amount_kopecks'
          : 'average_ticket_amount_kopecks',
        label: personal ? 'средняя стоимость записи' : 'средний чек',
      },
      { key: 'booked_minutes', label: 'записанное рабочее время' },
    ]
      .map((candidate) => {
        const change = this.record(changes[candidate.key]);
        return {
          ...candidate,
          percent: this.optionalMetricNumber(change.percent_change),
        };
      })
      .filter(
        (
          candidate,
        ): candidate is { key: string; label: string; percent: number } =>
          candidate.percent !== null && candidate.percent < 0,
      )
      .sort((left, right) => left.percent - right.percent);
    const strongest = candidates[0];
    if (!strongest) {
      return 'В доступных CRM-показателях нет подтверждённого снижения, поэтому конкретную причину просадки назвать нельзя.';
    }

    const averageKey = personal
      ? 'average_booked_value_amount_kopecks'
      : 'average_ticket_amount_kopecks';
    const averageChange = this.record(changes[averageKey]);
    const averagePercent = this.optionalMetricNumber(
      averageChange.percent_change,
    );
    const offset =
      averagePercent !== null && averagePercent > 0
        ? ` При этом ${personal ? 'средняя стоимость записи' : 'средний чек'} вырос${personal ? 'ла' : ''} на ${this.formatMetricNumber(averagePercent)}%, поэтому он частично компенсирует падение потока.`
        : '';
    return `Самое сильное подтверждённое ухудшение в доступных данных — ${strongest.label}: ${this.formatSignedPercent(strongest.percent)}.${offset}`;
  }

  private analyticsCurrency(current: Record<string, unknown>): string {
    for (const key of ['revenue', 'average_ticket']) {
      const entries = current[key];
      if (!Array.isArray(entries) || entries.length === 0) {
        continue;
      }
      const currency = this.record(entries[0]).currency;
      if (typeof currency === 'string' && currency.trim()) {
        return currency;
      }
    }
    return 'RUB';
  }

  private formatDuration(minutes: number): string {
    const rounded = Math.max(0, Math.round(minutes));
    const hours = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    if (hours === 0) {
      return `${remainder} мин`;
    }
    return remainder === 0 ? `${hours} ч` : `${hours} ч ${remainder} мин`;
  }

  private formatMoneyEntries(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) {
      return '0 ₽';
    }
    const formatted = value
      .map((entry) => {
        const item = this.record(entry);
        const majorUnits =
          typeof item.amount_major_units === 'number'
            ? item.amount_major_units
            : typeof item.amount_kopecks === 'number'
              ? item.amount_kopecks / 100
              : null;
        if (majorUnits === null || !Number.isFinite(majorUnits)) {
          return null;
        }
        const currency =
          typeof item.currency === 'string' ? item.currency.toUpperCase() : '';
        const currencyLabel =
          { RUB: '₽', USD: '$', EUR: '€', KZT: '₸' }[currency] || currency;
        const amount = new Intl.NumberFormat('ru-RU', {
          maximumFractionDigits: 2,
        })
          .format(majorUnits)
          .replace(/\u00a0/g, ' ');
        return `${amount}${currencyLabel ? ` ${currencyLabel}` : ''}`;
      })
      .filter((entry): entry is string => entry !== null);
    return formatted.length > 0 ? formatted.join(', ') : '0 ₽';
  }

  private formatVerifiedMoneyEntries(value: unknown): string | null {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }
    const valid = value.filter((entry) => {
      const item = this.record(entry);
      return (
        (typeof item.amount_major_units === 'number' &&
          Number.isFinite(item.amount_major_units)) ||
        (typeof item.amount_kopecks === 'number' &&
          Number.isFinite(item.amount_kopecks))
      );
    });
    return valid.length > 0 ? this.formatMoneyEntries(valid) : null;
  }

  private formatMoneyAmount(value: unknown): string | null {
    return this.formatVerifiedMoneyEntries([value]);
  }

  private safeMetricNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private optionalMetricNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private signedValue(value: number | null, formatted: string): string {
    if (value === null || value === 0) {
      return formatted;
    }
    return value > 0 ? `+${formatted}` : `−${formatted.replace(/^-/, '')}`;
  }

  private formatSignedPercent(value: unknown): string | null {
    const metric = this.optionalMetricNumber(value);
    if (metric === null) {
      return null;
    }
    const formatted = `${this.formatMetricNumber(Math.abs(metric))}%`;
    return this.signedValue(metric, formatted);
  }

  private comparisonPeriodLabel(value: Record<string, unknown>): string | null {
    const year = this.optionalMetricNumber(value.year);
    const startDay = this.optionalMetricNumber(value.start_day);
    const startMonth = this.optionalMetricNumber(value.start_month);
    const endDay = this.optionalMetricNumber(value.end_day);
    const endMonth = this.optionalMetricNumber(value.end_month);
    if (
      year === null ||
      startDay === null ||
      startMonth === null ||
      endDay === null ||
      endMonth === null
    ) {
      return null;
    }
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${pad(startDay)}.${pad(startMonth)}.${year}–${pad(endDay)}.${pad(endMonth)}.${year}`;
  }

  private formatMetricNumber(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: 2,
    })
      .format(value)
      .replace(/\u00a0/g, ' ');
  }

  private pluralize(
    value: number,
    one: string,
    few: string,
    many: string,
  ): string {
    const remainder10 = Math.abs(value) % 10;
    const remainder100 = Math.abs(value) % 100;
    if (remainder10 === 1 && remainder100 !== 11) {
      return one;
    }
    if (
      remainder10 >= 2 &&
      remainder10 <= 4 &&
      (remainder100 < 12 || remainder100 > 14)
    ) {
      return few;
    }
    return many;
  }

  private latestUserText(messages: AiCoreMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'user' && message.content.trim()) {
        return message.content.trim();
      }
    }
    return '';
  }

  /**
   * Весь диалог одной строкой — источник уже подтверждённых чисел.
   *
   * Числа в прошлых репликах MAYA не могли появиться из воздуха: каждое из них
   * либо прошло эту же сверку, либо было собрано сервером из результата
   * инструмента. Поэтому ссылаться на них в следующем ходе безопасно.
   */
  private conversationText(messages: AiCoreMessage[]): string {
    return messages.map((message) => message.content).join(' \n ');
  }

  private previousUserText(messages: AiCoreMessage[]): string {
    let latestFound = false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== 'user' || !message.content.trim()) {
        continue;
      }
      if (!latestFound) {
        latestFound = true;
        continue;
      }
      return message.content.trim();
    }
    return '';
  }

  private groundedNumbersMatch(
    reply: string,
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): boolean {
    return (
      this.unsourcedNumbers(reply, requirement, toolResults, userText)
        .length === 0
    );
  }

  /**
   * Числа из ответа модели, которых нет в результатах инструментов.
   *
   * Асимметрия намеренная: к тому, что модель УТВЕРЖДАЕТ, требования строгие,
   * а к тому, что считается ПОДТВЕРЖДЕНИЕМ, — щедрые. Иначе сторож ловил
   * добросовестные ответы: год из строки «2026-01-01» не извлекался вовсе, а
   * «снизилось на 9,2%» не сходилось с серверным −9.2 из-за знака, и весь
   * ответ уходил в мусор.
   */
  private unsourcedNumbers(
    reply: string,
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): string[] {
    if (!requirement?.strictNumbers) {
      return [];
    }
    const claims = this.groundingClaims(reply);
    if (claims.length === 0) {
      return [];
    }
    const evidence = this.groundingEvidence(toolResults);
    for (const value of this.groundingNumbers(userText)) {
      evidence.absolute.add(value);
    }
    const allowed = new Set([...evidence.absolute, ...evidence.delta]);
    const problems: string[] = [];
    for (const claim of claims) {
      if (allowed.has(claim.value)) {
        // 🔴 Проверять направление у АБСОЛЮТНОЙ величины нельзя: она его не
        // несёт. «Средний чек 1 436,17 ₽ — просел с 1 503,74» — правильная
        // фраза, а прежний сторож видел «просел» рядом с положительным числом
        // и браковал ответ. На вопросе «что у нас за просадки» под нож
        // попадало всё сразу: семь верных чисел из одного ответа.
        // Смысл направление имеет только у дельт и процентов изменения.
        const onlyDelta =
          evidence.delta.has(claim.value) &&
          !evidence.absolute.has(claim.value);
        if (
          !onlyDelta ||
          claim.value.startsWith('-') ||
          !this.directionConflict(reply, claim, 'positive')
        ) {
          continue;
        }
        problems.push(`${claim.value} (в данных это не снижение)`);
        continue;
      }
      // Знака нет, но по модулю число подтверждено: «снизилось на 9,2%» при
      // серверном −9.2 — нормальная человеческая формулировка, её и добивались.
      // А вот «выросло на 9,2%» на тех же данных — переворот направления, и
      // раньше его случайно ловил сторож чисел. Ловим явно.
      if (!claim.value.startsWith('-') && allowed.has(`-${claim.value}`)) {
        if (!this.directionConflict(reply, claim, 'negative')) {
          continue;
        }
        problems.push(`${claim.value} (в данных это снижение, а не рост)`);
        continue;
      }
      // 🔴 То же число в правильной единице — не выдумка. В changes денежные
      // дельты лежат ТОЛЬКО в копейках, рублёвого двойника у них нет: сказать
      // «выручка упала на 10 000 ₽» при серверных −1000000 было невозможно, и
      // весь разбор просадки — а он именно про изменение денег — обречённо
      // сваливался в шаблон. Признаём копейки→рубли и долю→проценты.
      if (this.scaledMatch(claim.value, allowed)) {
        continue;
      }
      problems.push(claim.value);
    }
    return [...new Set(problems)].slice(0, 8);
  }

  /**
   * Числа, названные рядом с сущностью, которой они не принадлежат.
   *
   * Сторож происхождения проверяет только ОТКУДА число: множество
   * подтверждённых значений плоское, поэтому «У Стаса «Борода» просела на 12
   * записей» проходило без единой пометки, хотя просадка у Ильи, а «Илья
   * заработал 104 500 ₽» — при том что это выручка всего салона. Цифры при
   * этом настоящие, и владелец шёл разговаривать с человеком по выдуманной
   * привязке.
   *
   * 🔴 Разбор построен вокруг одного правила: ЛОЖНАЯ ТРЕВОГА ДОРОЖЕ ПРОПУСКА.
   * Забракованный верный ответ уходит в шаблон — ровно та беда, от которой
   * лечили мозг MAYA. Поэтому сторож молчит везде, где привязка неочевидна:
   * число вне клаузы с именем, перечисление имён, два одинаково близких
   * кандидата, салонная пометка рядом, число из реплики самого владельца.
   * Число, не подтверждённое нигде, здесь не наша забота — им занимается
   * unsourcedNumbers, и дублировать его в двух списках нельзя.
   */
  private misattributedNumbers(
    reply: string,
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): string[] {
    if (!requirement?.strictNumbers) {
      return [];
    }
    const entities = this.attributionEntities(toolResults);
    if (entities.length === 0) {
      return [];
    }
    const text = reply.replace(/[−–—]/g, '-');
    const mentions = this.entityMentions(text, entities);
    if (mentions.length === 0) {
      return [];
    }
    const evidence = this.groundingEvidence(toolResults);
    const sourced = new Set([...evidence.absolute, ...evidence.delta]);
    // Число, названное самим владельцем, привязке не подлежит: за ним нет
    // строки данных, с которой можно свериться.
    const spoken = this.groundingNumbers(userText);
    const occurrences = this.numberOccurrences(text);
    const problems: string[] = [];
    for (const clause of this.attributionClauses(text)) {
      const targets = this.attributionTargets(
        text,
        mentions.filter(
          (mention) =>
            mention.start >= clause.start && mention.end <= clause.end,
        ),
      );
      // Ни одного имени в клаузе — это общий показатель салона. Он назван
      // честно, и придираться не к чему.
      if (targets.length === 0) {
        continue;
      }
      for (const occurrence of occurrences) {
        if (
          occurrence.index < clause.start ||
          occurrence.index >= clause.end ||
          !this.numberInSet(occurrence.value, sourced) ||
          this.numberInSet(occurrence.value, spoken) ||
          this.salonScopeExempt(text, clause, occurrence.index)
        ) {
          continue;
        }
        const target = this.attributionTarget(text, targets, occurrence);
        if (!target) {
          continue;
        }
        const allowed = this.attributionAllowed(target, targets);
        if (!allowed || this.numberInSet(occurrence.value, allowed.numbers)) {
          continue;
        }
        problems.push(`${occurrence.value} (это не данные «${allowed.label}»)`);
      }
    }
    return [...new Set(problems)].slice(0, 8);
  }

  /**
   * Клаузы ответа — рамка, внутри которой число ищет владельца.
   *
   * Запятая границей считается наравне с точкой: «Илья сделал 61 запись,
   * средний чек 2 612 ₽» — чек тут салонный, и без границы он приписался бы
   * человеку. Двоеточие и тире, наоборот, границей НЕ считаются: по-русски они
   * как раз вводят данные названного («Илья: 61 запись», «лидер - Стас, 142»).
   */
  private attributionClauses(text: string): AttributionClause[] {
    const clauses: AttributionClause[] = [];
    let start = 0;
    for (let cursor = 0; cursor < text.length; cursor += 1) {
      if (!this.attributionBoundary(text, cursor)) {
        continue;
      }
      if (cursor > start) {
        clauses.push({ start, end: cursor });
      }
      start = cursor + 1;
    }
    if (start < text.length) {
      clauses.push({ start, end: text.length });
    }
    return clauses;
  }

  /**
   * Разделитель между цифрами разделителем не считается: «38,7» и «0.94» иначе
   * разрывались бы посреди числа.
   */
  private attributionBoundary(text: string, index: number): boolean {
    const character = text[index];
    if (/[;!?\n•()]/.test(character)) {
      return true;
    }
    if (character !== '.' && character !== ',') {
      return false;
    }
    return !(
      /\d/.test(text[index - 1] ?? '') && /\d/.test(text[index + 1] ?? '')
    );
  }

  /**
   * Оговорки, при которых общий итог рядом с именем — не нарушение.
   *
   * Смотрим всю клаузу целиком: пометка «по салону» может стоять и до числа, и
   * после него («у Ильи 61, по салону 268» / «Илья дал 61 из 268 по салону»).
   * Узкое окно ловило только первый порядок и браковало второй.
   */
  private salonScopeExempt(
    text: string,
    clause: AttributionClause,
    numberIndex: number,
  ): boolean {
    return (
      SALON_SCOPE_MARKER.test(text.slice(clause.start, clause.end)) ||
      SHARE_BASE_MARKER.test(text.slice(clause.start, numberIndex))
    );
  }

  /** Значение есть в наборе — с точностью до знака и единицы измерения. */
  private numberInSet(value: string, values: Set<string>): boolean {
    if (values.has(value)) {
      return true;
    }
    const unsigned = value.startsWith('-') ? value.slice(1) : `-${value}`;
    if (values.has(unsigned)) {
      return true;
    }
    return this.scaledMatch(value, values);
  }

  /**
   * Карта «сущность → числа её поддерева» плюс разрез услуги по владельцу.
   *
   * Одноимённые строки из разных массивов объединяются: у мастера есть срез за
   * период в staff_summary[] и сравнение периодов в staff_changes[], и оба
   * набора — его собственные числа. Раздельно они дали бы ложные тревоги на
   * первой же фразе вида «у Ильи 19 записей против 31».
   *
   * 🔴 Услуга живёт в двух видах сразу: салонная строка (service_changes[]) и
   * строка внутри мастера (staff_changes[].services[]). Плоское объединение
   * стирает разницу — а именно она отличает «у Ильи просела «Борода»» от «у
   * Стаса просела «Борода»», когда цифра в обеих фразах одна и та же настоящая.
   * Поэтому числа услуги дополнительно раскладываются по владельцу.
   */
  private attributionEntities(value: unknown): AttributionEntity[] {
    const entities = new Map<string, AttributionEntity>();
    const entityKey = (name: string) =>
      name.toLowerCase().replace(/ё/g, 'е').trim();
    const remember = (
      name: string,
      node: unknown,
      kind: AttributionEntity['kind'],
      owner: string | null,
    ): string | null => {
      const key = entityKey(name);
      if (key.length < 3 || ATTRIBUTION_GENERIC_NAMES.has(key)) {
        return null;
      }
      const entity: AttributionEntity = entities.get(key) ?? {
        key,
        name: name.trim(),
        numbers: new Set<string>(),
        kind,
        byOwner: new Map<string, Set<string>>(),
        detailed: false,
      };
      const numbers = this.groundingNumbers(node);
      for (const number of numbers) {
        entity.numbers.add(number);
      }
      if (owner) {
        const scoped = entity.byOwner.get(owner) ?? new Set<string>();
        for (const number of numbers) {
          scoped.add(number);
        }
        entity.byOwner.set(owner, scoped);
      }
      // Мастер сильнее услуги: если имя встретилось в обеих ролях, разбор
      // «мастер + его услуга» должен остаться возможным.
      if (kind === 'staff') {
        entity.kind = 'staff';
        const nested = (node as Record<string, unknown> | null)?.services;
        entity.detailed ||= Array.isArray(nested) && nested.length > 0;
      }
      entities.set(key, entity);
      return key;
    };
    const walk = (node: unknown, owner: string | null) => {
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, owner));
        return;
      }
      if (node === null || typeof node !== 'object') {
        return;
      }
      for (const [key, item] of Object.entries(
        node as Record<string, unknown>,
      )) {
        if (!ATTRIBUTION_ENTITY_ARRAY_KEYS.has(key) || !Array.isArray(item)) {
          walk(item, owner);
          continue;
        }
        const kind = key.startsWith('staff') ? 'staff' : 'service';
        for (const entry of item) {
          if (entry === null || typeof entry !== 'object') {
            continue;
          }
          const name = (entry as Record<string, unknown>).name;
          if (typeof name !== 'string' || name.trim() === '') {
            walk(entry, owner);
            continue;
          }
          // Услуга наследует владельца только внутри строки мастера; в
          // service_summary[]/service_changes[] она салонная и владельца не
          // имеет.
          const scope = kind === 'staff' ? null : owner;
          const stored = remember(name, entry, kind, scope);
          walk(entry, kind === 'staff' ? stored : owner);
        }
      }
    };
    walk(value, null);
    return [...entities.values()];
  }

  /**
   * Где в ответе названы сущности из данных.
   *
   * Имена склоняются («у Ильи», «по Анне», «мужской стрижки»), поэтому ищем по
   * основе слова с коротким хвостом. Вложенные совпадения («стрижка» внутри
   * «мужская стрижка») отбрасываем: иначе окно внешнего имени схлопнется в
   * ноль и проверка молча перестанет работать.
   */
  private entityMentions(
    text: string,
    entities: AttributionEntity[],
  ): AttributionMention[] {
    const haystack = text.toLowerCase().replace(/ё/g, 'е');
    const found: AttributionMention[] = [];
    for (const entity of entities) {
      const pattern = this.entityNamePattern(entity.name);
      if (!pattern) continue;
      for (const match of haystack.matchAll(pattern)) {
        const start = match.index ?? 0;
        found.push({ entity, start, end: start + match[0].length });
      }
    }
    found.sort((left, right) =>
      left.start !== right.start
        ? left.start - right.start
        : right.end - left.end,
    );
    const mentions: AttributionMention[] = [];
    for (const mention of found) {
      const previous = mentions.at(-1);
      if (previous && mention.start < previous.end) {
        continue;
      }
      mentions.push(mention);
    }
    return mentions;
  }

  /**
   * Имена клаузы, свёрнутые до кандидатов на владение числом.
   *
   * Соседние однородные имена без числа между ними — перечисление: «Илья и
   * Стас дали 268 записей» говорит о паре, а не о Стасе, и требовать 268 от
   * последнего названного нельзя. Такие пары склеиваем в один кандидат, и на
   * нём сторож потом промолчит.
   */
  private attributionTargets(
    text: string,
    mentions: AttributionMention[],
  ): AttributionTarget[] {
    const targets: AttributionTarget[] = [];
    for (const mention of mentions) {
      const previous = targets.at(-1);
      const gap = previous ? text.slice(previous.end, mention.start) : '';
      if (
        previous &&
        previous.kind === mention.entity.kind &&
        !/\d/.test(gap) &&
        ATTRIBUTION_ENUMERATION_JOINER.test(gap)
      ) {
        previous.members.push(mention);
        previous.end = mention.end;
        continue;
      }
      targets.push({
        members: [mention],
        kind: mention.entity.kind,
        start: mention.start,
        end: mention.end,
      });
    }
    return targets;
  }

  /**
   * Кому принадлежит число — по БЛИЖАЙШЕМУ имени в любую сторону.
   *
   * Русский порядок слов свободен: «у Ильи 61 запись» и «61 запись у Ильи»
   * одинаково нормальны, поэтому смотрим и влево, и вправо. Союз между именем
   * и числом удорожает кандидата: во фразе «17 записей у Ильи и 23 у Стаса»
   * до 23 от обоих имён по три символа, и без надбавки выбор был бы случайным.
   * Если два кандидата всё равно почти равны или ближайший слишком далеко —
   * возвращаем null, и сторож молчит.
   */
  private attributionTarget(
    text: string,
    targets: AttributionTarget[],
    occurrence: { value: string; index: number; end: number },
  ): AttributionTarget | null {
    const scored = targets
      .map((target) => {
        if (occurrence.index >= target.start && occurrence.end <= target.end) {
          return { target, distance: 0 };
        }
        const gap =
          occurrence.index >= target.end
            ? text.slice(target.end, occurrence.index)
            : text.slice(occurrence.end, target.start);
        const penalty = ATTRIBUTION_CONJUNCTION_PATTERN.test(gap)
          ? ATTRIBUTION_CONJUNCTION_PENALTY
          : 0;
        return { target, distance: gap.length + penalty };
      })
      .sort((left, right) => left.distance - right.distance);
    const best = scored[0];
    if (!best || best.distance > ATTRIBUTION_ATTACH_DISTANCE) {
      return null;
    }
    const runnerUp = scored[1];
    if (
      runnerUp &&
      runnerUp.target.kind === best.target.kind &&
      runnerUp.distance - best.distance < ATTRIBUTION_TIE_MARGIN
    ) {
      // Два одинаково близких имени одного рода — угадывать нельзя.
      return null;
    }
    return best.target;
  }

  /**
   * Какие числа кандидат вправе носить.
   *
   * Услуга без мастера в клаузе отвечает за свой салонный набор. Услуга рядом
   * с мастером — за набор ИМЕННО ЕГО строки, плюс за любые числа самого
   * мастера: «у Ильи 61 запись, «Борода» 24» — 61 принадлежит человеку, а не
   * услуге, и требовать его от строки услуги было бы ложной тревогой. Прежняя
   * схема брала пересечение мастера и услуги и заваливалась именно на этом.
   */
  private attributionAllowed(
    target: AttributionTarget,
    targets: AttributionTarget[],
  ): { numbers: Set<string>; label: string } | null {
    // Перечисление сущностей: число может быть их суммой, а сумму мы не считаем.
    if (target.members.length > 1) {
      return null;
    }
    const entity = target.members[0].entity;
    if (entity.kind === 'staff') {
      return { numbers: entity.numbers, label: entity.name };
    }
    const staffTargets = targets.filter(
      (item) => item.kind === 'staff' && item.members.length === 1,
    );
    if (staffTargets.length === 0) {
      return { numbers: entity.numbers, label: entity.name };
    }
    if (staffTargets.length > 1) {
      // Два мастера в одной клаузе — чья это услуга, не определить.
      return null;
    }
    const owner = staffTargets[0].members[0].entity;
    const scoped = entity.byOwner.get(owner.key);
    const label = `${owner.name} → ${entity.name}`;
    if (scoped) {
      return { numbers: new Set([...owner.numbers, ...scoped]), label };
    }
    // Разрез по услугам у мастера есть, а этой услуги в нём нет — значит она
    // не его. Разреза нет вовсе — судить не по чему, и услуга отвечает за свой
    // общий набор.
    return owner.detailed
      ? { numbers: owner.numbers, label }
      : {
          numbers: new Set([...owner.numbers, ...entity.numbers]),
          label,
        };
  }

  private entityNamePattern(name: string): RegExp | null {
    const words = name
      .toLowerCase()
      .replace(/ё/g, 'е')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 0);
    if (words.length === 0) {
      return null;
    }
    const parts = words.map((word) => {
      let stem = word;
      for (let drop = 0; drop < 2; drop += 1) {
        if (stem.length <= 3 || !/[аеиоуыэюяйь]$/.test(stem)) break;
        stem = stem.slice(0, -1);
      }
      const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `${escaped}[а-яa-z]{0,3}`;
    });
    try {
      return new RegExp(
        `(?<![а-яa-z])${parts.join('[\\s\\-]+')}(?![а-яa-z])`,
        'giu',
      );
    } catch {
      return null;
    }
  }

  /**
   * Все вхождения чисел с позициями — без склейки одинаковых значений.
   *
   * groundingClaims оставляет от повторов только первое вхождение: для сверки
   * происхождения этого достаточно, а для привязки — нет. Одно и то же «19»
   * может стоять и у Ильи (верно), и у Стаса (нет).
   */
  private numberOccurrences(
    text: string,
  ): Array<{ value: string; index: number; end: number }> {
    const seen = new Set<string>();
    const found: Array<{ value: string; index: number; end: number }> = [];
    const remember = (
      raw: string | undefined,
      index: number,
      requireLarge: boolean,
    ) => {
      const normalized = this.normalizeGroundingNumber(raw);
      if (normalized === null) return;
      if (requireLarge && Math.abs(Number(normalized)) <= 10) return;
      const key = `${normalized}@${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      // Конец вхождения нужен привязке: расстояние до имени СПРАВА считается от
      // последней цифры, иначе «142 у Стаса» мерилось бы от первой.
      found.push({ value: normalized, index, end: index + (raw?.length ?? 0) });
    };
    for (const match of text.matchAll(GROUNDING_NUMBER_PATTERN)) {
      remember(match[0], match.index ?? 0, true);
    }
    for (const match of text.matchAll(GROUNDING_SMALL_METRIC_PATTERN)) {
      const index = match.index ?? 0;
      // «−18 записей» ловится обоими шаблонами: первым со знаком, вторым без.
      // Это одно и то же место в тексте, и в аудите оно должно быть одной
      // строкой, а не парой «-18» и «18».
      if (
        seen.has(
          `-${this.normalizeGroundingNumber(match.groups?.number)}@${index - 1}`,
        )
      ) {
        continue;
      }
      remember(match.groups?.number, index, false);
    }
    return found;
  }

  /**
   * То же значение в другой единице измерения.
   *
   * Разрешаем ровно два перевода, оба однозначные и присутствующие в данных
   * как соседние поля: копейки→рубли (×100) и доля→проценты (÷100). Это не
   * послабление к выдумыванию: число всё равно обязано быть в результате
   * инструмента, меняется только запись. Свободного счёта это не открывает —
   * сумма, разность или среднее по-прежнему не пройдут.
   */
  private scaledMatch(claim: string, allowed: Set<string>): boolean {
    const value = Number(claim);
    if (!Number.isFinite(value) || value === 0) {
      return false;
    }
    const asText = (input: number) =>
      Number.isInteger(input)
        ? String(input)
        : String(Number(input.toFixed(6)));
    for (const scaled of [value * 100, value / 100]) {
      if (!Number.isFinite(scaled)) continue;
      if (allowed.has(asText(scaled)) || allowed.has(asText(-scaled))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Описывает ли текст рядом с числом движение, противоположное данным.
   *
   * Смотрим только назад и близко: «выручка выросла на 9,2%» — слово стоит
   * перед числом. Дальше по предложению могут идти другие показатели со своим
   * направлением, поэтому окно узкое.
   */
  /**
   * Включена ли сверка привязки числа к сущности.
   *
   * 🔴 Включена по умолчанию — но только после того, как замер показал НОЛЬ
   * ложных тревог. Прежний разбор бракова́л 7 верных ответов из 31 (22,6%), и с
   * таким счётом сторож вредил больше, чем помогал: каждый пятый разбор
   * подменялся шаблоном. После перехода на «ближайшее имя в клаузе в любую
   * сторону» замер на 58 ответах (46 верных + 12 подмен) дал 0 ложных тревог
   * при 10 пойманных подменах из 12 — см. `describe('сверка привязки числа к
   * сущности — замер')` в спеке, набор там же.
   * `AI_CORE_ATTRIBUTION_GUARD=false` глушит сверку без выката, если на живом
   * трафике всплывёт формулировка, которую разбор не понимает.
   */
  private attributionGuardEnabled(): boolean {
    // 🔴 Снова ВЫКЛЮЧЕНА по умолчанию. Замер на собственном наборе дал ноль
    // ложных тревог, но независимый ревизор на СВОЁМ наборе получил две — и
    // главное, нашёл целый класс, который набор не покрывал: год из даты
    // привязывается к мастеру («За август 2026 у Дмитрия 118 записей» → «2026
    // это не данные Дмитрия»), семь ложных тревог из восьми фраз с годом.
    //
    // Плюс структурное ограничение: числа сущности лежат плоским множеством,
    // поэтому перестановка метрик ВНУТРИ одного мастера проходит молча — «у
    // Дмитрия 76 отмен», где 76 это его стрижки. А это и есть самая частая
    // ошибка. Сторож, который ловит редкое и пропускает частое, ценой ложных
    // тревог покупать нельзя: они возвращают владельцу шаблоны.
    //
    // Чинится сверкой на уровне МЕТРИКИ, а не сущности. До тех пор — opt-in.
    return (
      this.configService
        .get<string>('AI_CORE_ATTRIBUTION_GUARD')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  private directionConflict(
    reply: string,
    claim: { value: string; index: number },
    actual: 'positive' | 'negative',
  ): boolean {
    // 🔴 Только в пределах своей части предложения. Плоское окно в 48 символов
    // цепляло глагол СОСЕДНЕГО мастера: «У Стаса плюс 2 записи, у Ильи минус
    // 14» — слово «плюс» попадало в окно числа 14 и верный ответ шёл на
    // переписывание. Режем по ближайшей границе клаузы.
    const raw = reply.slice(Math.max(0, claim.index - 48), claim.index);
    const boundary = Math.max(
      raw.lastIndexOf(','),
      raw.lastIndexOf(';'),
      raw.lastIndexOf('.'),
      raw.lastIndexOf('!'),
      raw.lastIndexOf('?'),
      raw.lastIndexOf('—'),
      raw.lastIndexOf(' и '),
    );
    const window = boundary >= 0 ? raw.slice(boundary + 1) : raw;
    return actual === 'negative'
      ? GROWTH_WORD_PATTERN.test(window)
      : DECLINE_WORD_PATTERN.test(window);
  }

  private groundingClaims(
    value: string,
  ): Array<{ value: string; index: number }> {
    // Типографский минус («−», U+2212) и тире модель ставит чаще дефиса, а
    // шаблон ниже знает только ASCII. Без этой замены «−9,2%» разбиралось как
    // «9,2» и теряло знак ещё до сверки.
    const text = value.replace(/[−–—]/g, '-');
    const claims = new Map<string, number>();
    for (const occurrence of this.numberOccurrences(text)) {
      if (!claims.has(occurrence.value)) {
        claims.set(occurrence.value, occurrence.index);
      }
    }
    return [...claims].map(([claimValue, index]) => ({
      value: claimValue,
      index,
    }));
  }

  /**
   * Разделяет подтверждённые числа на абсолютные величины и изменения.
   *
   * Различие нужно ровно для одной проверки — направления. Выручка, число
   * записей и средний чек сами по себе не растут и не падают, их можно
   * упоминать в любом контексте. А вот дельта и процент изменения несут знак,
   * и назвать падение ростом — уже искажение факта.
   */
  private groundingEvidence(value: unknown): {
    absolute: Set<string>;
    delta: Set<string>;
  } {
    const absolute = new Set<string>();
    const delta = new Set<string>();
    const isChangeKey = (key: string) =>
      key === 'delta' || key === 'percent_change';
    const walk = (node: unknown, inChange: boolean) => {
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, inChange));
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [key, item] of Object.entries(
          node as Record<string, unknown>,
        )) {
          walk(item, isChangeKey(key));
        }
        return;
      }
      for (const number of this.groundingNumbers(node)) {
        (inChange ? delta : absolute).add(number);
      }
    };
    walk(value, false);
    return { absolute, delta };
  }

  private groundingNumbers(value: unknown): Set<string> {
    const values = new Set<string>();
    if (Array.isArray(value)) {
      value.forEach((item) => {
        for (const number of this.groundingNumbers(item)) {
          values.add(number);
        }
      });
      return values;
    }
    if (value !== null && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) => {
        for (const number of this.groundingNumbers(item)) {
          values.add(number);
        }
      });
      return values;
    }
    const normalized = this.normalizeGroundingNumber(value);
    if (normalized !== null) {
      values.add(normalized);
      return values;
    }
    if (typeof value === 'string') {
      // 🔴 Даты и метки времени НЕ разбираем на числа. Из
      // «2026-08-01T21:00:00.000Z» иначе выпадают 8, 1, 21, 0, 59 и прочая
      // мелочь, которая тут же становится «подтверждённой»: модель могла бы
      // написать «доля отмен 21%», и сторож пропустил бы это, потому что 21 —
      // это час из таймзоны. Забираем из таких строк только год.
      if (DATE_LIKE_PATTERN.test(value)) {
        for (const match of value.matchAll(/(?<!\d)\d{4}(?!\d)/g)) {
          values.add(match[0]);
        }
        return values;
      }
      for (const match of value.matchAll(GROUNDING_EVIDENCE_NUMBER_PATTERN)) {
        const normalized = this.normalizeGroundingNumber(match[0]);
        if (normalized !== null) {
          values.add(normalized);
        }
      }
    }
    return values;
  }

  private normalizeGroundingNumber(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }
    const normalized = String(value)
      .replace(/[\s\u00a0]/g, '')
      .replace(',', '.');
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
      return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Number.isInteger(parsed)
      ? String(parsed)
      : String(parsed).replace(/0+$/, '').replace(/\.$/, '');
  }

  private sanitizeMessages(messages: AiCoreChatDto['messages']): {
    messages: AiCoreMessage[];
    redacted: boolean;
  } {
    let redacted = false;
    const sanitized = messages.map((message) => {
      const sensitive = this.redactSensitiveText(message.content);
      const names = this.redactLikelyProperNames(sensitive.content);
      redacted ||= sensitive.redacted || names.redacted;
      return { role: message.role, content: names.content };
    });
    if (
      Buffer.byteLength(JSON.stringify(sanitized), 'utf8') >
      MAX_CHAT_INPUT_BYTES
    ) {
      throw new BadRequestException({
        message: 'AI chat input is too large.',
        error: { code: 'ai_chat_input_too_large' },
      });
    }
    return { messages: sanitized, redacted };
  }

  private redactSensitiveText(value: string): {
    content: string;
    redacted: boolean;
  } {
    let content = this.stripControlCharacters(value)
      .replace(/\s+/g, ' ')
      .trim();
    const original = content;
    content = content
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, '[secret removed]')
      .replace(
        /\b(?:sk|rk|dk|api)[-_][A-Za-z0-9_-]{16,}\b/gi,
        '[secret removed]',
      )
      .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[email removed]')
      .replace(/https?:\/\/[^\s]+/gi, '[link removed]')
      .replace(/(?<!\d)\+?\d[\d\s().-]{7,}\d(?!\d)/g, (candidate) =>
        /^\d{4}-\d{2}-\d{2}$/.test(candidate.trim())
          ? candidate
          : '[phone removed]',
      )
      .replace(/\b\d(?:[ -]?\d){11,18}\b/g, '[number removed]')
      // 🔴 Без флага `i`. С ним класс [А-ЯЁA-Z] матчил и строчные буквы, то есть
      // вырезалось ЛЮБОЕ следующее слово, а не имя: вопрос «Какие мастера
      // просели за месяц?» превращался в «Какие мастера [name removed] за
      // месяц?», аналитика не вызывалась и владелец получал отказ. Регистр
      // ключевого слова покрываем перечислением, имя — по-прежнему только с
      // заглавной.
      .replace(
        /(^|[\s,;:])([КкСсМмВв](?:лиент|отрудник|астер|рач)(?:а|у|ом)?)\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,40}(?=$|[\s,.;:!?])/gu,
        '$1$2 [name removed]',
      )
      .replace(
        /(^|[\s,;:])([Мм]еня|[Ее]го|[ЕеЁё]ё?)\s+зовут\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,40}(?=$|[\s,.;:!?])/gu,
        '$1$2 зовут [name removed]',
      );
    return { content, redacted: content !== original };
  }

  private redactLikelyProperNames(value: string): {
    content: string;
    redacted: boolean;
  } {
    const pattern = /[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,40}/gu;
    let content = '';
    let cursor = 0;
    let redacted = false;
    for (const match of value.matchAll(pattern)) {
      const word = match[0];
      const index = match.index ?? cursor;
      content += value.slice(cursor, index);
      const normalized = word.toLowerCase();
      if (COMMON_PERSON_NAME_FORMS.has(normalized)) {
        content += '[name removed]';
        redacted = true;
      } else {
        content += word;
      }
      cursor = index + word.length;
    }
    content += value.slice(cursor);
    return { content, redacted };
  }

  private toolIdempotencyKey(
    tenantId: string,
    userId: string,
    requestId: string,
    step: number,
    toolName: string,
  ): string {
    return `ai-chat-${createHash('sha256')
      .update(`${tenantId}\0${userId}\0${requestId}\0${step}\0${toolName}`)
      .digest('hex')}`;
  }

  private toolSignature(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    return `${toolName}:${this.canonicalJson(args)}`;
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private maxToolSteps(): number {
    const raw = this.configService.get<string>('AI_CORE_MAX_TOOL_STEPS');
    const value = raw ? Number(raw) : 2;
    if (!Number.isInteger(value) || value < 1 || value > 3) {
      throw new Error('ai_core_max_tool_steps_invalid');
    }
    return value;
  }

  private plainReply(value: string): string {
    return this.stripControlCharacters(value)
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, 2_000);
  }

  private stripControlCharacters(value: string): string {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    }).join('');
  }

  private sanitizeToolResult(value: unknown, depth = 0): unknown {
    if (depth > 8) {
      return null;
    }
    if (typeof value === 'string') {
      return this.redactSensitiveText(value).content;
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, 200)
        .map((item) => this.sanitizeToolResult(item, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
      const blockedKeys = new Set([
        'client_email',
        'client_name',
        'client_phone',
        'customer_email',
        'customer_name',
        'customer_phone',
        'email',
        'encrypted_note',
        'notes',
        'password',
        'phone',
        'provider_payload',
        'secret',
        'token',
      ]);
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !blockedKeys.has(key.toLowerCase()))
          .map(([key, item]) => [
            key,
            this.sanitizeToolResult(item, depth + 1),
          ]),
      );
    }
    return value;
  }

  private addTokenCount(
    current: number | null,
    next: number | null,
  ): number | null {
    return next === null ? current : (current ?? 0) + next;
  }

  private record(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private requireTenant(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException({
        message: 'Tenant membership is required.',
        error: { code: 'tenant_required' },
      });
    }
    return this.tenantContext.assertTenantId(user.tenantId);
  }

  private modelFailure(code: string): never {
    throw new ServiceUnavailableException({
      message: 'MAYA could not safely complete this turn.',
      error: { code },
    });
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof ConflictException) {
      return 'ai_core_conflict';
    }
    if (error instanceof HttpException) {
      const response: unknown = error.getResponse();
      const record = this.record(response);
      const nested = this.record(record.error);
      if (typeof nested.code === 'string' && nested.code.length <= 80) {
        return nested.code;
      }
    }
    return 'ai_core_turn_failed';
  }
}
