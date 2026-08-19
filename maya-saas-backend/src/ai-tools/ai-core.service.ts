import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Optional,
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
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import {
  isBusinessReviewFollowUp,
  isComprehensiveBusinessReview,
} from '../ai-brain/business-review-intent';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import type {
  MayaBrainIntent,
  MayaBrainRoute,
} from '../ai-brain/maya-brain.types';
import { AiCoreModelService } from './ai-core-model.service';
import { AiMemoryService } from './ai-memory.service';
import type {
  AiCoreMessage,
  AiCoreModelDecision,
  AiCoreToolDescriptor,
  AiCoreToolResult,
} from './ai-core.types';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { buildChatReportCard } from './chat-report-card';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';
import { ReportingPeriodResolver } from './reporting-period.resolver';
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

/**
 * Требование заземления: «на этот вопрос отвечаем только по данным».
 *
 * Если вопрос явно относится к одному контракту данных (например, графику),
 * доказательством может быть только инструмент этой семьи. Для открытого
 * вопроса без конкретной темы модель по-прежнему выбирает из всех доступных
 * источников. Так промах подсказки не блокирует общий диалог, но расписание
 * больше нельзя «подтвердить» месячной аналитикой.
 */
type GroundingRequirement = {
  /**
   * Инструменты, способные ответить на вопрос. Для явно распознанной темы это
   * только её семья; для открытого вопроса — все доступные источники данных.
   */
  evidenceToolNames: string[];
  /**
   * Домен для отчёта, пока ни один инструмент не отработал. Взят из вероятного
   * инструмента и живёт только до первого результата: дальше домен — факт.
   */
  fallbackDomain: string | null;
  /**
   * Вопрос закрыт для роли или тарифа: ни один инструмент, способный на него
   * ответить, этому человеку не выдан. Это факт доступа, а не догадка о теме.
   */
  closedForAccess: boolean;
  /**
   * ПОЧЕМУ закрыто. Раньше все отказы звучали одинаково, а причины у них разные
   * и требуют разных действий от человека.
   *
   * `plan` — ассистента нет в тарифе вовсе: список инструментов пуст. Такому
   * человеку надо назвать тариф, иначе отказ читается как поломка.
   * `scope` — инструменты есть, но именно эта тема закрыта роли или тарифу.
   */
  closedReason?: 'plan' | 'scope';
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
};

/**
 * Спрашивают про факт, а не ведут разговор.
 *
 * Нужен только клиентской ветке предиката: «хочу стрижку» — это запись, а
 * «сколько стоит стрижка» — вопрос про данные, и различает их именно форма.
 */
const GROUNDING_FACT_PATTERN =
  /(сколько|какая|какой|какие|покажи|показать|дай|посчитай|есть\s+ли|когда|кто|мои|моя|мой|у\s+меня|за\s+сегодня|за\s+вчера|за\s+недел[а-яёa-z]*|за\s+месяц[а-яёa-z]*|сегодня|завтра)/i;
/**
 * ЕДИНСТВЕННЫЙ предикат темы: деньги, записи, клиенты, услуги, расходы,
 * расписание, баллы.
 *
 * 🔴 Он не выбирает инструмент и ничего не запрещает. Всё, что он включает, —
 * строгий режим чисел и запрет отвечать раньше инструмента. Раньше на его
 * месте стояла дюжина тематических регулярок, и каждая была развилкой, на
 * которой ход мог сломаться.
 */
const DATA_TOPIC_PATTERN =
  /(деньг|выруч|оборот|касс|доход|прибыл|марж|рентабельн|чек|зарплат|начисл|заработ|окупа|стоит|стоимост|цен[аеуы]|прайс|расход|затрат|трат|бюджет|реклам|аренд|налог|запис|визит|посещен|окн[аоу]|слот|свободн|расписан|график|смен[аеуы]|выходн|загруз|занятост|клиент|гост|посетител|мастер|специалист|сотрудник|команд|персонал|услуг|стриж|бород|балл|бонус|кэшбэк|лояльн|показател|метрик|аналитик|статистик|сводк|отчет|динамик|просад|просел|(?<![а-яё])рост|падени|отмен|повторн|средн)/i;
/** Приветствие и вежливость: ради них отчёт по салону не поднимают. */
const SMALL_TALK_PATTERN =
  /^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер|утро)|доброе\s+утро|спасибо|пожалуйста|пока|давай(?!\s+\S)|ладно|ок|окей|ясно|понятно|кто\s+ты|что\s+ты\s+умеешь|как\s+дела|че\s+как(?:\s+\w{1,24})?|как\s+(?:ты|сама|жизнь|делишки|настроен\w*)|маюшк\w*|майя|maya|хей|хай|hello|hi|yo)(?:\s*[,!.?]|\s|$)/i;
/** Открытый запрос именно о состоянии бизнеса, а не о неизвестной теме. */
const OPEN_BUSINESS_OVERVIEW_PATTERN =
  /(?:что.{0,40}требует.{0,24}внимани|на\s+что.{0,32}обратить\s+внимани|что\s+(?:сейчас\s+)?по\s+бизнесу|как\s+(?:у\s+нас\s+)?(?:идут\s+)?дела\s+(?:в\s+)?(?:бизнесе|салоне|барбершопе))/i;
/**
 * Интенты, в которых разговор идёт не про цифры: запись клиента, правка
 * расписания, база знаний, поддержка. Каталог и баллы сюда не входят: их
 * фактические вопросы ловит подсказка и заземляет как обычно.
 */
const NON_DATA_INTENTS = new Set<MayaBrainIntent>([
  'booking',
  'schedule_management',
  'knowledge',
  'support',
  'catalog',
  'loyalty',
]);
/**
 * Интенты про ДЕНЬГИ и показатели салона.
 *
 * Только они закрываются отказом, когда аналитики нет: клиенту такие данные не
 * положены никогда, а на младшем тарифе их нечем посчитать. Намеренно БЕЗ
 * staff_operations и marketing — вопрос «какие у вас мастера» задаёт и гость,
 * и он получает обезличенный список, а не отказ.
 */
const MONEY_INTENTS = new Set<MayaBrainIntent>([
  'finance',
  'business_analytics',
]);
// 🔴 Граница слова обязательна: «се-ГОД-ня» содержит «год», и без неё запрос
// «сравни сегодня с прошлой неделей» уезжал в годовое сравнение, а «сколько
// записей сегодня?» получал сопоставление с прошлым годом.
// Сравнение теперь живёт в ReportingPeriodResolver.comparison.
const BUSINESS_ACTION_REQUEST_PATTERN =
  /(что\s+(?:с\s+этим\s+)?делать|как\s+(?:это\s+)?исправить|как\s+(?:это\s+)?улучшить|объясни.{0,32}что\s+делать|дай\s+(?:план|рекомендац)|какие\s+действия|что\s+предпринять|посоветуй|подскажи|совет[а-яёa-z]*|как\s+(?:мне\s+)?(?:вернуть|поднять|увеличить|нарастить|удержать)|что\s+можно\s+сделать)/i;
// Просьба объяснить или разобрать. Отдельно от просьбы о действии: «почему»
// требует диагноза, «что делать» — плана, и вопрос часто содержит оба.
const BUSINESS_EXPLANATION_REQUEST_PATTERN =
  /(почему|причин[а-яёa-z]*|за\s+сч[её]т\s+чего|что\s+повлиял[оа]?|разбер[а-яёa-z]*|проанализир[а-яёa-z]*|анализ[а-яёa-z]*|объясни)/i;
/**
 * Вопрос о ПРИБЫЛИ, а не о выручке.
 *
 * Прибыль живёт в отдельном инструменте: она считается от подтверждённой кассы
 * минус полные расходы, и в операционном обзоре её нет по построению. Без
 * этой развилки «какая прибыль» уходило туда, где прибыли не существует, и
 * владелец получал перечень счётчиков вместо ответа.
 */
const PROFIT_QUESTION_PATTERN =
  /(прибыл[а-яёa-z]*|маржинальн[а-яёa-z]*|рентабельн[а-яёa-z]*|(?<![а-яё])марж[аеиуы][а-яёa-z]*|в\s+плюсе|в\s+минусе|в\s+ноль|чист[а-яёa-z]*\s+(?:прибыл|доход|остат)[а-яёa-z]*|(?<![а-яё])чистыми(?![а-яё])|после\s+(?:всех\s+)?расход[а-яёa-z]*|за\s+вычетом\s+расход[а-яёa-z]*|сколько\s+(?:я\s+|мы\s+)?(?:в\s+итоге\s+)?(?:заработал|остал)[а-яёa-z]*|(?:что|сколько)\s+(?:в\s+итоге\s+)?остал[а-яёa-z]*|(?<![а-яё])окупа[а-яёa-z]*)/i;
const GROSS_PROFIT_QUESTION_PATTERN = /валов[а-яёa-z]*\s+прибыл[а-яёa-z]*/i;
/**
 * Вопрос о СТРУКТУРЕ расходов: «на что больше всего тратим», «куда уходят
 * деньги», «сколько ушло на расходники». Отвечает разрез по статьям, а не
 * операционный обзор, в котором расходы — одна общая сумма.
 */
/**
 * Команда записать расход, а не вопрос о нём.
 *
 * 🔴 «Запиши аренду 60 тысяч» — это действие. Без этой развилки просьба
 * уезжала в аналитику: любая фраза, не похожая на приветствие, считается
 * бизнес-вопросом, и на команду сначала грузился весь отчёт по салону.
 */
const EXPENSE_RECORD_COMMAND_PATTERN =
  /(?:(запиш|запис(?:ать|ал)|внес|добав|провед|отмет|учт)[а-яёa-z]*\s+(?:[^,.]{0,40}\s+)?(аренд|расход|зарплат|реклам|налог|коммунал|закуп|материал|трат)|^\s*(?:есть\s+)?(?:расход|трата|аренда|реклама|налог|коммунал(?:ьные)?|закупка|материалы?|расходники?|интернет|эквайринг|ремонт|прочее)\s*(?::|—|–|-)?\s*[^?\n]{0,80}(?:\d|тысяч|тыс\.?|миллион|млн\.?)[^?\n]*$)/i;
const EXPENSE_STRUCTURE_QUESTION_PATTERN =
  /(расход[а-яёa-z]*|затрат[а-яёa-z]*|на\s+что\s+(?:мы\s+)?(?:больше\s+всего\s+)?(?:трат|уход|ушл)[а-яёa-z]*|куда\s+(?:у\s+нас\s+)?(?:уход|дева|ушл)[а-яёa-z]*|сколько\s+(?:мы\s+)?потратил[а-яёa-z]*|на\s+что\s+ушл[а-яёa-z]*)/i;
/**
 * 🔴 «Сколько стоит привести нового клиента» — это НЕ прайс-лист.
 *
 * Регулярка справочника услуг ловила любое «сколько стоит», и на вопрос о цене
 * привлечения MAYA отвечала стоимостью стрижки. Разводится по дополнению:
 * стоит УСЛУГА — прайс, стоит ПРИВЕСТИ КЛИЕНТА — экономика салона.
 */
const CLIENT_ACQUISITION_QUESTION_PATTERN =
  /(сколько\s+стоит\s+(?:нам\s+|мне\s+)?(?:привест|привлеч|получ|нов[а-яё]+\s+клиент|один\s+клиент|клиент)|(?:во\s+)?сколько\s+(?:нам\s+|мне\s+)?обходится\s+(?:нов[а-яё]+\s+)?клиент|(?:во\s+)?сколько\s+обходится\s+(?:нам|мне)\s+(?:нов[а-яё]+\s+)?клиент|цена\s+(?:одного\s+)?(?:нов[а-яё]+\s+)?клиент[а-яё]*|стоимост[ьи]\s+(?:привлечени[а-яё]*|одного\s+клиент[а-яё]*|нов[а-яё]+\s+клиент[а-яё]*)|привлечени[ея]\s+(?:одного\s+)?(?:нов[а-яё]+\s+)?клиент)/i;
/**
 * Досье конкретного клиента из CRM (не счётчик и не «кого вернуть»).
 * Имя в запросе нужно модели передать в query инструмента.
 */
const CLIENT_DOSSIER_HINT_PATTERN =
  /(?:досье|что\s+за\s+клиент|расскажи\s+(?:про|о)\s+|что\s+(?:ему|ей)\s+предложит|что\s+(?:(?:он|она)|.{2,40})\s+(?:обычно\s+)?(?:берет|берёт|брал|брала|любит)|что\s+обычно\s+(?:берет|берёт)|привычк[аи]\s+(?:этого\s+)?клиент|перед\s+(?:его|её|ее|этим)\s+визит|сколько\s+(?:(?:визит|посещени|балл|бонус)[а-яёa-z]*\s+у|у\s+(?!меня\b).{2,40}\s+(?:визит|посещени|балл|бонус))|(?:насколько|как).{2,40}\s+лоял[а-яёa-z]*|как[а-яёa-z]*\s+услуг[а-яёa-z]*\s+(?:покупает|берет|берёт|выбирает|любит))/i;
/** Полный CRM-реестр, лояльность и накопительные периоды отсутствия. */
const CLIENT_RETENTION_HINT_PATTERN =
  /(?:вс[ея]\s+(?:клиент|баз)|сколько\s+(?:у\s+нас\s+)?(?:всего\s+)?(?:клиент|гост)[а-яёa-z]*\s+(?:в\s+(?:нашей\s+|этой\s+)?баз|всего)|пол[а-яёa-z]*\s+баз[а-яёa-z]*\s+клиент|баз[а-яёa-z]*\s+(?:клиент|гост)|(?:клиент|гост)[а-яёa-z]*\s+в\s+(?:нашей\s+|этой\s+)?баз|лояльн[а-яёa-z]*\s+(?:клиент|гост)|(?:клиент|гост)[а-яёa-z]*\s+лояльн|(?:не\s+(?:был|были|ходил|ходили|ходят|приходил|приходили|приходят|посещал|посещали|посещают|посещало)|неактивн[а-яёa-z]*|спящ[а-яёa-z]*|уснувш[а-яёa-z]*|потерянн[а-яёa-z]*|ушедш[а-яёa-z]*).{0,55}(?:месяц|год|клиент|гост)|(?:клиент|гост)[а-яёa-z]*.{0,55}(?:не\s+(?:был|были|ходил|ходили|ходят|приходил|приходили|приходят|посещал|посещали|посещают|посещало)|неактивн|спящ|уснувш|потерянн|ушедш)|кого\s+(?:нужно\s+|можно\s+)?вернут|(?:как|чем).{0,24}вернут.{0,30}(?:клиент|гост)|как\s+(?:их|этих)\s+вернут|возврат[а-яёa-z]*\s+(?:клиент|гост)|анализ[а-яёa-z]*\s+(?:всей|полной)\s+баз|удержан[а-яёa-z]*\s+клиент)/i;
/**
 * Разрезы, которых в инструменте прибыли нет. Вопрос «прибыль по мастерам»
 * должен идти в аналитику с разрезом, а не в общую экономику салона.
 *
 * Это единственное, что этот шаблон теперь решает: какой инструмент ПРЕДЗАГРУЗИТЬ.
 * Ошибиться им больше не страшно — модель вправе взять другой.
 */
const PROFIT_BREAKDOWN_ESCAPE_PATTERN =
  /(мастер[а-яёa-z]*|сотрудник[а-яёa-z]*|специалист[а-яёa-z]*|по\s+услуг[а-яёa-z]*|по\s+дням|по\s+филиал[а-яёa-z]*)/i;
/** Подсказка: спрашивают про баллы. */
const LOYALTY_HINT_PATTERN =
  /(баланс[а-яёa-z]*|сколько\s+.*(?:балл|бонус)|мои\s+(?:балл|бонус)|(?:потрат|спис|оплат)[а-яёa-z]*.*(?:балл|бонус)|на\s+что.*(?:балл|бонус))/i;
/** Подсказка: спрашивают про СВОИ записи. */
const OWN_APPOINTMENTS_HINT_PATTERN =
  /(мои\s+запис[а-яёa-z]*|(?:какие|сколько)\s+у\s+меня\s+запис[а-яёa-z]*|когда\s+я\s+записан[а-яёa-z]*|истори[а-яёa-z]*\s+(?:моих\s+)?запис[а-яёa-z]*)/i;
/** Точный рабочий график команды на дату — отдельный факт YClients. */
const STAFF_SCHEDULE_READ_HINT_PATTERN =
  /(?:расписан[а-яёa-z]*|график[а-яёa-z]*|рабоч[а-яёa-z]*\s+(?:час|смен)[а-яёa-z]*|кто\s+(?:из\s+команды\s+)?работ[а-яёa-z]*|когда\s+[^?.,!]{0,50}работ[а-яёa-z]*|работает\s+ли|выходн[а-яёa-z]*)/i;
/** Точный журнал визитов и загрузка команды за один календарный день. */
const OPERATIONS_JOURNAL_HINT_PATTERN =
  /(?:запис(?:ь|и|ей|ям|ями|ях)|визит[а-яёa-z]*|при[её]м[а-яёa-z]*|услуг[а-яёa-z]*|загрузк[а-яёa-z]*|занятост[а-яёa-z]*|отмен[а-яёa-z]*|неявк[а-яёa-z]*)/i;
const EXPLICIT_CALENDAR_DAY_PATTERN =
  /(?:сегодня|завтра|послезавтра|понедельник[а-яё]*|вторник[а-яё]*|сред[а-яё]*|четверг[а-яё]*|пятниц[а-яё]*|суббот[а-яё]*|воскресень[а-яё]*|\d{1,2}[./]\d{1,2}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{4}-\d{2}-\d{2})/i;
/** Подсказка: спрашивают про свободное время. */
const AVAILABILITY_HINT_PATTERN =
  /(свободн[а-яёa-z]*\s+(?:окн[а-яёa-z]*|врем[а-яёa-z]*|слот[а-яёa-z]*)|ближайш[а-яёa-z]*\s+(?:окн[а-яёa-z]*|врем[а-яёa-z]*|слот[а-яёa-z]*)|есть\s+ли\s+(?:окн[а-яёa-z]*|мест[а-яёa-z]*|врем[а-яёa-z]*)|когда\s+можно\s+запис)/i;
/** Подсказка: спрашивают прайс. Подписка и тариф MAYA — не позиция прайса. */
const PRICE_HINT_PATTERN =
  /(сколько\s+стоит|цен[а-яёa-z]*|прайс[а-яёa-z]*|какие\s+услуг[а-яёa-z]*|длительн[а-яёa-z]*\s+услуг[а-яёa-z]*)/i;
/** Подсказка: спрашивают про мастеров — поимённо. */
const STAFF_HINT_PATTERN =
  /(какие\s+(?:у\s+вас\s+)?(?:мастер|специалист|барбер)[а-яёa-z]*|кто\s+(?:из\s+)?(?:мастер|специалист|барбер)[а-яёa-z]*|выбрать\s+(?:мастер|специалист)[а-яёa-z]*|к\s+кому\s+(?:лучше\s+)?(?:записат|попаст|сходит)|расскаж[а-яёa-z]*\s+о\s+(?:мастер|барбер)|про\s+мастер)/i;
/**
 * Деньги ПО ЛЮДЯМ: начисление мастеру и вклад мастера в кассу — разные вопросы.
 *
 * «Кто сколько принёс» означает вклад в выручку салона. YClients не связывает
 * подтверждённые кассовые операции с мастером, поэтому такой показатель нельзя
 * подменять зарплатой или ценами записей. «Сколько каждый заработал» в контексте
 * команды означает начисленную зарплату: она приходит отдельной проверенной
 * строкой расчёта зарплаты CRM и доступна владельцу по каждому мастеру.
 */
const STAFF_CONTRIBUTION_QUESTION_PATTERN =
  /(?:кто\s+сколько|сколько\s+(?:кажд[а-яёa-z]*|кто))[^.?!]{0,48}(?:прин[её]с|дал\s+(?:в\s+)?касс|сделал\s+(?:для\s+)?салон)|(?:выруч|касс|оборот|доход)[^.?!]{0,36}(?:по\s+)?(?:мастер|барбер|сотрудник|специалист)/i;
const STAFF_PAYROLL_BREAKDOWN_QUESTION_PATTERN =
  /(?:кто\s+сколько|сколько\s+(?:кажд[а-яёa-z]*|кто)|по\s+(?:кажд[а-яёa-z]*|всем))[^.?!]{0,56}(?:заработ|получ|начисл|зарплат)|(?:заработ|получ|начисл|зарплат)[^.?!]{0,56}(?:кажд[а-яёa-z]*|по\s+(?:мастер|барбер|сотрудник|специалист))|сколько\s+кажд[а-яёa-z]*\s+из\s+(?:мастер|барбер|сотрудник|специалист)/i;
/** Точный счёт записей и их статусов сервер формулирует без пересказа LLM. */
const APPOINTMENT_COUNT_QUESTION_PATTERN =
  /(?:(?:сколько|количеств[а-яёa-z]*|числ[а-яёa-z]*|всего|сводк[а-яёa-z]*)[^.?!]{0,48}(?:запис[а-яёa-z]*|визит[а-яёa-z]*|посещен[а-яёa-z]*)|(?:запис[а-яёa-z]*|визит[а-яёa-z]*|посещен[а-яёa-z]*)[^.?!]{0,48}(?:сколько|всего|общ[а-яёa-z]*|статус[а-яёa-z]*|заверш[а-яёa-z]*|провед[а-яёa-z]*|отмен[а-яёa-z]*|неяв[а-яёa-z]*|ожида[а-яёa-z]*))/i;
/** Дневной разрез должен оставаться точным и воспроизводимым. */
const DAILY_ANALYTICS_BREAKDOWN_QUESTION_PATTERN =
  /(?:по\s+дням|дневн[а-яёa-z]*\s+(?:свод[а-яёa-z]*|разбив[а-яёa-z]*|динамик[а-яёa-z]*)|разбивк[а-яёa-z]*\s+по\s+дн[а-яёa-z]*|кажд[а-яёa-z]*\s+день)/i;
/** Подсказка: спрашивают про сам салон / историю — не аналитику. */
const SALON_ABOUT_HINT_PATTERN =
  /(расскаж[а-яёa-z]*\s+о\s+(?:барбершоп|салон|вас|вашем|вашей)|истор[а-яёa-z]*\s+(?:открыт|салон|барбер)|когда\s+(?:открыл|основа)|в\s+каком\s+году|о\s+барбершоп|про\s+(?:барбершоп|салон)|чем\s+(?:у\s+вас\s+)?(?:хорош|интересн)|атмосфер)/i;
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
 * Инструменты данных и домен каждого.
 *
 * 🔴 Здесь и только здесь живёт соответствие «инструмент → тема». Домен —
 * свойство инструмента, а значит известен ПОСЛЕ его выполнения, а не до. От
 * него зависят перехват ПД, выбор детерминированного ответа и отчёт в аудите.
 * Ключи этого справочника — исчерпывающий список того, что считается
 * доказательством: всё остальное (запись, отмена, начисление) — действие.
 */
const DATA_TOOL_DOMAINS: Record<string, string> = {
  'analytics.business.query': 'business_query',
  'analytics.employee.query': 'employee_query',
  'analytics.business.profit': 'business_profit',
  'expenses.period.complete': 'business_profit',
  'expenses.read': 'business_expenses',
  'customers.count': 'customer_count',
  'clients.retention.scan': 'client_retention',
  'clients.dormant.list': 'client_retention',
  'clients.dossier.read': 'client_dossier',
  'catalog.services.read': 'service_catalog',
  'catalog.staff.read': 'staff_catalog',
  'staff.schedule.read': 'staff_schedule',
  // 🔴 Свой график мастера обязан быть ИСТОЧНИКОМ ДАННЫХ наравне с командным.
  // Его тут не было, поэтому инструмент, выданный мастеру каталогом, не мог
  // стать доказательством ни в одном ходу: подсказка про график называла
  // только руководительский вариант, у мастера его нет — и семья считалась
  // закрытой. Мастер спрашивал про СВОЙ день и получал «недоступно для вашей
  // роли», хотя данные лежали рядом.
  'staff.schedule.own.read': 'staff_schedule',
  'operations.journal.read': 'operations_journal',
  'booking.availability.read': 'booking_availability',
  'appointments.own.list': 'client_appointments',
  'loyalty.own.read': 'client_loyalty',
  'booking.upsell.suggest': 'client_upsell',
};
/** Инструменты, которые предзагружаем: подсказка к ним однозначна. */
const PRELOADABLE_TOOLS = new Set([
  'analytics.business.query',
  'analytics.employee.query',
  'analytics.business.profit',
  'expenses.read',
  'clients.retention.scan',
  'clients.dossier.read',
  // Гостевой «расскажи о салоне» — сразу публичный каталог, не ждём второй ход.
  'catalog.staff.read',
]);
/**
 * Инструменты, чей результат — личные данные самого спрашивающего.
 *
 * Их ответ собирает сервер, и во внешнюю модель полезная нагрузка не уходит.
 * Обезличивание по именам ключей тут недостаточно: история визитов человека
 * идентифицирует его сама по себе, даже без имени и телефона. Проверка идёт по
 * фактически вызванному инструменту, а не по предположению о теме: инструмент
 * невозможно «угадать неверно» — он либо отработал, либо нет.
 */
const PII_SENSITIVE_TOOLS = new Set([
  'appointments.own.list',
  'loyalty.own.read',
  // Поиск выполняется по имени/телефону внутри периметра, а наружу выходит
  // только обезличенное досье. Формулировку тоже собирает сервер: так даже
  // история услуг конкретного человека не отправляется внешней модели.
  'clients.dossier.read',
  // Единственный инструмент, отдающий ИМЕНА гостей списком. Ответ собирает
  // сервер: ни одно имя и ни один телефон не уходят во внешнюю модель.
  'clients.dormant.list',
]);
/**
 * Инструменты, для которых проверенный сервером ответ нельзя переформулировать
 * моделью. Помимо ПД сюда входит retention-срез: в нём важны точные размеры
 * когорт и границы периодов, а свободный пересказ не должен менять цифры.
 */
const SERVER_COMPOSED_REPLY_TOOLS = new Set([
  ...PII_SENSITIVE_TOOLS,
  'clients.retention.scan',
  // График — точный факт по дате. Его нельзя пересказывать из аналитики
  // записей или заменять предположением модели.
  'staff.schedule.read',
  // Дневной журнал нельзя превращать в месячную сводку или пересчитывать LLM.
  'operations.journal.read',
  // Финансовый ответ должен дословно следовать серверному расчёту. Модель не
  // должна снова потребовать аренду или пересчитать прибыль самостоятельно.
  'analytics.business.profit',
  'expenses.period.complete',
]);
/**
 * Для этих контрактов соседний источник не может служить доказательством.
 * Они либо содержат персональные/точные CRM-факты, либо отвечают на вопрос,
 * который нельзя честно восстановить из общей аналитики.
 */
const STRICT_GROUNDING_HINT_TOOLS = new Set([
  'staff.schedule.read',
  // Свой график — та же семья и та же чувствительность: месячной сводкой
  // конкретный день не подменяют.
  'staff.schedule.own.read',
  'operations.journal.read',
  'clients.retention.scan',
  'clients.dossier.read',
  'appointments.own.list',
  'loyalty.own.read',
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
/** Роли, которые уже и так живут на поверхности мастера. */
const STAFF_SURFACE_ROLES = new Set<UserRole>([
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
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
    private readonly brainRouter: MayaBrainRouterService,
    @Optional() private readonly memory?: AiMemoryService,
    @Optional()
    private readonly conversationIntelligence?: ConversationIntelligenceService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async chat(user: AuthenticatedUser, dto: AiCoreChatDto) {
    const tenantId = this.requireTenant(user);
    const businessTimezone = await this.resolveBusinessTimezone(tenantId);
    await this.rateLimit.assertTenant('ai_chat', {
      tenantId,
      identity: user.userId,
    });
    const sanitized = this.sanitizeMessages(dto.messages);
    const clientAudience = this.isClientAudience(user, dto.audience);
    // Поверхность мастера: владельцу/менеджеру в режиме мастера инструменты
    // выдаются и исполняются от роли STAFF — личная аналитика вместо кассы
    // салона. Аудит при этом пишется на настоящего человека (см. complete).
    const toolUser = this.effectiveToolUser(user, dto.audience);
    // Маршрутизация — синхронная и безусловная: ни флага, ни списка
    // арендаторов, ни записи в базу. Она решает ровно две вещи — персону и
    // намерение, и обе нужны уже на первом шаге.
    // audience=client принудительно даёт admin-персону даже владельцу.
    const brain = this.brainRouter.route(
      toolUser.role,
      this.contextualUserText(sanitized.messages),
      dto.audience ?? null,
    );
    const memoryCommand = this.memory
      ? await this.memory.handleExplicitCommand(
          tenantId,
          user.userId,
          this.latestUserText(dto.messages),
        )
      : null;
    if (memoryCommand) {
      return this.complete(user, dto, brain, sanitized.redacted, [], [], {
        reply: memoryCommand.reply,
        source: 'safe_fallback',
        action: null,
      });
    }
    const scheduleCommand = await this.staffScheduleCommand.tryHandle(
      toolUser,
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
    const clientBaseAccess = this.handleClientBaseAccessQuestion(
      clientAudience ? { ...user, role: UserRole.CLIENT } : toolUser,
      sanitized.messages,
    );
    if (clientBaseAccess) {
      return this.complete(user, dto, brain, false, [], [], {
        reply: clientBaseAccess.reply,
        source: 'safe_fallback',
        action: null,
      });
    }
    const assistantCommand = await this.handleAssistantCommand(
      clientAudience ? { ...user, role: UserRole.CLIENT } : toolUser,
      sanitized.messages,
    );
    if (assistantCommand) {
      return this.complete(user, dto, brain, sanitized.redacted, [], [], {
        ...assistantCommand,
        source: 'safe_fallback',
        action: null,
      });
    }
    const memoryFacts = await this.memoryFactsForModel(tenantId, user.userId);
    const listed = await this.runtime.listTools(toolUser, dto.surface);
    const tools: AiCoreToolDescriptor[] = listed.tools
      .filter((tool) => !clientAudience || !this.isBusinessOnlyTool(tool.name))
      .map((tool) => ({
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
    let activeSemanticPlan: ConversationSemanticPlan | null = null;
    // let, а не const: смысловой план приходит от модели ПОЗЖЕ и может снять
    // требование источника — см. ниже про болтовню.
    let requirement = this.groundingRequirement(
      sanitized.messages,
      allowedNames,
      brain,
      this.latestUserText(dto.messages),
      this.previousUserText(dto.messages),
    );
    // Список для модели: вероятный инструмент первым, за ним — остальные
    // доступные инструменты данных. Первый — рекомендация, любой другой из
    // списка тоже принимается как доказательство.
    const requiredToolNames = requirement?.evidenceToolNames ?? [];
    let groundingRetries = 0;
    let numberRetries = 0;
    let corrections: string[] = [];

    try {
      // Короткое «нет» после вопроса MAYA про дополнительные расходы — это не
      // свободный разговор с моделью, а однозначное серверное действие. Так
      // ответ не зависит от формулировки модели и всегда закрывает тот же
      // отчётный период без фиктивной строки «аренда 0 ₽».
      if (
        allowedNames.has('expenses.period.complete') &&
        this.explicitNoAdditionalExpenses(sanitized.messages)
      ) {
        const toolName = 'expenses.period.complete';
        const argumentsForTool = ReportingPeriodResolver.hardenToolArguments(
          toolName,
          {},
          this.latestUserText(sanitized.messages),
          this.previousReportingUserText(sanitized.messages),
        );
        const execution = this.record(
          await this.runtime.execute(toolUser, toolName, {
            surface: dto.surface,
            arguments: argumentsForTool,
            idempotencyKey: this.toolIdempotencyKey(
              tenantId,
              user.userId,
              dto.requestId,
              -2,
              toolName,
            ),
          }),
        );
        const status =
          typeof execution.status === 'string' ? execution.status : 'unknown';
        toolsUsed.push({
          name: toolName,
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
          name: toolName,
          result: this.sanitizeToolResult(execution.result),
        });
        const completionRequirement: GroundingRequirement = {
          evidenceToolNames: [toolName],
          fallbackDomain: 'business_profit',
          closedForAccess: false,
          strictNumbers: true,
        };
        const reply = this.deterministicGroundedReply(
          toolResults,
          this.contextualUserText(sanitized.messages),
        );
        if (!reply) {
          this.modelFailure('ai_tool_result_unavailable');
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
            source: 'safe_fallback',
            action: null,
            grounding: this.groundingReport(
              completionRequirement,
              'verified',
              toolResults,
            ),
          },
          toolResults,
        );
      }
      if (
        allowedNames.has('expenses.period.complete') &&
        this.explicitNoRentOnly(sanitized.messages)
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
              'Поняла, аренда за этот период — 0 ₽. Прибыль уже можно считать по кассе, зарплате из CRM и внесённым расходам. Если есть другие расходы — расходники, реклама, коммунальные услуги или что-то ещё — напишите статью и сумму, и я добавлю их после вашего подтверждения.',
            source: 'safe_fallback',
            action: null,
          },
          toolResults,
        );
      }
      // Единственный оставшийся отказ ДО модели: вопрос про данные, а данных
      // этой роли или тарифу не выдано вовсе. Молчать здесь нельзя — человек
      // должен услышать причину.
      if (
        requirement &&
        (requirement.closedForAccess || requiredToolNames.length === 0)
      ) {
        return this.complete(
          user,
          dto,
          brain,
          sanitized.redacted,
          toolsUsed,
          decisions,
          this.groundingFallback(requirement, toolResults, true),
          toolResults,
        );
      }
      if (requirement?.presetToolCall) {
        const preset = requirement.presetToolCall;
        const execution = this.record(
          await this.runtime.execute(toolUser, preset.name, {
            surface: dto.surface,
            arguments: preset.arguments,
            idempotencyKey: this.toolIdempotencyKey(
              tenantId,
              user.userId,
              dto.requestId,
              // 🔴 НЕ 0: нулевой шаг занимает первая итерация цикла. Ключ
              // считается по паре «шаг + инструмент», поэтому чужой инструмент
              // на шаге 0 конфликта не даёт, а вот тот же самый — дал бы:
              // рантайм сверяет аргументы и на расхождении бросает конфликт
              // идемпотентности. Вопрос вида «а за прошлый месяц целиком?»
              // падал бы вместо ответа.
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
        // ПД и точные retention-когорты форматирует сервер. Остальная бизнес-
        // аналитика продолжает ход: смысл вопроса и составные задачи разбирает
        // Conversation Intelligence слой.
        const contextualText = this.contextualUserText(sanitized.messages);
        if (this.requiresServerComposedReply(preset.name, contextualText)) {
          const fastReply = this.deterministicGroundedReply(
            toolResults,
            contextualText,
          );
          if (fastReply) {
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              {
                reply: fastReply,
                source: 'safe_fallback',
                action: null,
                grounding: this.groundingReport(
                  requirement,
                  'verified',
                  toolResults,
                ),
              },
              toolResults,
            );
          }
        }
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
        const pendingSemanticTool =
          this.conversationLayer().hasPendingToolTasks(
            activeSemanticPlan,
            toolResults.map((result) => result.name),
          );
        const decision = await this.model.decide({
          surface: dto.surface,
          persona: brain.persona,
          principalRole: toolUser.role,
          messages: sanitized.messages,
          tools,
          toolResults: [...toolResults],
          // После подтверждённого результата CRM отдельный этап планирования
          // больше не нужен: он мог выбрать несуществующий инструмент и
          // уничтожить уже готовые данные. Следующий вызов сразу формулирует
          // ответ. Для действий и ещё не заземлённых вопросов планирование
          // остаётся доступным.
          allowToolCall:
            step < maxToolSteps &&
            (activeSemanticPlan === null ||
              pendingSemanticTool ||
              (requirement ? !requirementSatisfied : toolResults.length === 0)),
          requiredToolNames:
            requirement && !requirementSatisfied ? requiredToolNames : [],
          nowUtc: new Date().toISOString(),
          businessTimezone,
          memoryFacts,
          corrections: pendingCorrections,
          conversationPlan: activeSemanticPlan,
        });
        if (!decision) {
          const deterministicReply = this.deterministicGroundedReply(
            toolResults,
            this.contextualUserText(sanitized.messages),
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
              toolResults,
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
            toolResults,
          );
        }
        decisions.push(decision);
        if (decision.semanticPlan) {
          activeSemanticPlan = decision.semanticPlan;
          // 🔴 Болтовню требовать подтверждать источником нельзя. «Че ты как?»
          // разбиралось так: смысловой планировщик верно помечал ход как
          // small_talk, а требование источника ставилось РАНЬШЕ него — по
          // регулярке, где «че как» есть, а «че ТЫ как» уже нет. Модель
          // отвечала по-человечески, сторож видел ответ без единого инструмента
          // и подменял его заготовкой. Спор двух слоёв выигрывал тот, что
          // глупее. Теперь вердикт умного слоя старше: он видел саму фразу,
          // а не её совпадение с шаблоном.
          if (requirement && this.isSmallTalkPlan(activeSemanticPlan)) {
            requirement = null;
          }
        }
        if (!decision.toolCall) {
          const clarification = this.semanticClarification(activeSemanticPlan);
          if (clarification) {
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              {
                reply: clarification,
                source: 'safe_fallback',
                action: null,
                // An ambiguity question states no business fact, therefore it
                // neither needs nor pretends to have CRM evidence.
                grounding: this.groundingReport(
                  requirement,
                  'not_required',
                  toolResults,
                ),
              },
              toolResults,
            );
          }
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
          const schemaLeak = this.schemaLeakTokens(reply);
          if (schemaLeak.length > 0) {
            if (numberRetries < 1 && step < maxToolSteps) {
              numberRetries += 1;
              corrections = [
                `В ответе прозвучали служебные имена схемы: ${schemaLeak.join(', ')}. Перепиши ответ языком салона (барбер, гость, запись, касса, прайс) — без имён полей, инструментов и JSON-ключей.`,
              ];
              continue;
            }
            const deterministicReply = this.deterministicGroundedReply(
              toolResults,
              this.contextualUserText(sanitized.messages),
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
                    grounding: this.groundingReport(
                      requirement,
                      requirement ? 'verified' : 'not_required',
                      toolResults,
                    ),
                  }
                : this.groundingFallback(
                    requirement as GroundingRequirement,
                    toolResults,
                  ),
              toolResults,
            );
          }
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
          if (unsourced.length > 0) {
            // Раньше любое неподтверждённое число молча стирало весь ответ. Это
            // самая частая причина шаблонов: достаточно было написать процент
            // или округлить сумму. Даём переписать один раз, назвав виновные
            // числа, и только потом падаем в детерминированный текст.
            if (numberRetries < 1 && step < maxToolSteps) {
              numberRetries += 1;
              corrections = [
                `Эти числа отсутствуют в tool_results: ${unsourced.join(', ')}. Перепиши ответ, оставив только значения, которые есть в результатах инструментов.`,
              ];
              continue;
            }
            const deterministicReply = this.deterministicGroundedReply(
              toolResults,
              this.contextualUserText(sanitized.messages),
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
                  },
              toolResults,
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
            toolResults,
          );
        }
        if (step >= maxToolSteps) {
          this.modelFailure('ai_model_tool_step_limit');
        }
        if (!allowedNames.has(decision.toolCall.name)) {
          this.modelFailure('ai_model_tool_not_allowed');
        }
        // 🔴 Здесь раньше стоял отказ: модель попросила инструмент не из
        // списка — и ход обрывался. Список составляла регулярка, угадывавшая
        // тему, поэтому промах регулярки был для владельца отказом. Теперь
        // разрешён любой инструмент, доступный роли (проверка выше), а
        // требование «ответить только после данных» никуда не делось: оно
        // проверяется по результату, а не по имени в списке.
        // 🔴 Период всегда с сервера. Модель могла попросить named_month на
        // «7 августа» — и владелец видел 244к вместо 41.5к. Hardening
        // перебивает period/day/month до подписи и до execute.
        const hardenedArguments = ReportingPeriodResolver.hardenToolArguments(
          decision.toolCall.name,
          decision.toolCall.arguments,
          this.latestUserText(sanitized.messages),
          this.previousUserText(sanitized.messages),
        );
        const signature = this.toolSignature(
          decision.toolCall.name,
          hardenedArguments,
        );
        if (signatures.has(signature)) {
          // Тот же вызов уже сделан — чаще всего это предзагруженный сервером
          // инструмент, который модель попросила повторно. Данные у неё на
          // руках; повторять запрос незачем, а падать тем более — иначе
          // предзагрузка сама себе создавала бы конфликт.
          continue;
        }
        signatures.add(signature);

        let execution: Record<string, unknown>;
        try {
          execution = this.record(
            await this.runtime.execute(toolUser, decision.toolCall.name, {
              surface: dto.surface,
              arguments: hardenedArguments,
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
            toolResults,
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
        //
        // 🔴 Условие теперь по ФАКТИЧЕСКИ вызванному инструменту, а не по
        // угаданной теме: инструмент нельзя «не угадать» — он либо отработал,
        // либо нет. Раньше промах темы означал бы утечку истории визитов.
        if (
          this.requiresServerComposedReply(
            decision.toolCall.name,
            this.contextualUserText(sanitized.messages),
          )
        ) {
          const deterministicReply = this.deterministicGroundedReply(
            toolResults,
            this.contextualUserText(sanitized.messages),
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
                  // Текст собрал сервер, а не провайдер: источник называем
                  // честно, иначе в аудите шаблон не отличить от ответа модели.
                  source: 'safe_fallback',
                  action: null,
                  grounding: this.groundingReport(
                    requirement,
                    'verified',
                    toolResults,
                  ),
                }
              : // Собрать текст не вышло — ход всё равно заканчивается здесь.
                // Отдать эти данные модели «раз уж шаблон не сложился» значит
                // разменять контур 152-ФЗ на удобство формулировки.
                {
                  reply:
                    'Ваши данные получены, но собрать по ним ответ не удалось. Загляните в раздел «Записи» или повторите вопрос чуть позже.',
                  source: 'safe_fallback',
                  action: null,
                  grounding: this.groundingReport(
                    requirement,
                    'verified',
                    toolResults,
                  ),
                },
            toolResults,
          );
        }
      }
      this.modelFailure('ai_model_tool_step_limit');
    } catch (error) {
      const deterministicReply = this.deterministicGroundedReply(
        toolResults,
        this.contextualUserText(sanitized.messages),
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
              grounding_domain: this.groundingDomain(requirement, toolResults),
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
          toolResults,
        );
      }
      // Данных нет вовсе, а вопрос был про аналитику: молчание CRM — это сбой
      // связи, и называть его надо сбоем, а не отсутствием ответа у MAYA.
      const failedDomain = requirement?.fallbackDomain;
      if (
        toolResults.length === 0 &&
        (failedDomain === 'business_query' || failedDomain === 'employee_query')
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
              failedDomain === 'employee_query'
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
          toolResults,
        );
      }
      // 🔴 Мягкая запись по той же причине, что и у соседней ветки на 1269: мы
      // внутри catch, и падение аудита подменило бы исходное исключение —
      // наружу ушёл бы другой класс сбоя, а настоящая причина деградации
      // потерялась бы. Отказ базы аудита и отказ хода модели приходят вместе.
      await this.auditLog.tryLog({
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
    // 🔴 «добавь» без предмета — слишком жадный глагол. «Добавь расход на
    // материалы 5000» и «Добавь мастера Илью в команду» попадали сюда РАНЬШЕ,
    // чем расходная команда и движок прав, и вместо дела молча меняли
    // настройки сводки. Теперь «добавь» считается командой настройки, только
    // когда рядом назван сам модуль.
    const togglesOn =
      /(?:^|\s)(?:включи|подключи|активируй)(?:\s|$)/i.test(text) ||
      /(?:^|\s)добавь\s+(?:мне\s+)?(?:модул|анализ|аналитик|сводк|отчет|отчёт|ежедневн)/i.test(
        text,
      );
    const togglesOff =
      /(?:^|\s)(?:выключи|отключи|деактивируй|убери)(?:\s|$)/i.test(text);
    const requested = this.requestedAssistantCapabilities(text);
    const isClient =
      user.role === UserRole.CLIENT || user.role === UserRole.CUSTOMER;

    if (isClient) {
      if (!asksCapabilities) return null;
      return {
        reply:
          'Я MAYA, администратор вашего салона. Помогу выбрать услугу и мастера, найти реальное свободное время, записаться, рассказать о барберах и атмосфере, показать ваши записи и проверить баллы. Цифры бизнеса и чужие данные я не раскрываю.',
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
          'Я MAYA, ваша рабочая помощница. Могу показать личный план дня, записи, свободные окна, доступные показатели и досье конкретного клиента из CRM по имени или телефону — без озвучивания персональных данных.',
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
      reply: `Я MAYA, ваша операционная помощница. Работаю с данными CRM в рамках вашей роли: аналитика, записи, касса и досье конкретного клиента по имени или телефону (без озвучивания ПД). ${this.assistantCapabilitiesSummary([...enabled])} Настройки можно менять прямо здесь командами «включи...» и «отключи...».`,
    };
  }

  /**
   * Мета-вопрос про доступ к клиентской базе.
   * Без детерминированного ответа модель из старого правила ПД отвечала
   * «базу не вижу» — хотя clients.dossier.read уже есть.
   */
  private handleClientBaseAccessQuestion(
    user: AuthenticatedUser,
    messages: AiCoreMessage[],
  ): { reply: string } | null {
    if (user.role === UserRole.CLIENT || user.role === UserRole.CUSTOMER) {
      return null;
    }
    const text = this.contextualUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е');
    if (
      // 🔴 Здесь ловится ТОЛЬКО мета-вопрос «а ты вообще видишь базу?».
      // Раньше вторая половина правила ловила голое «баз[ауиеы] клиент» без
      // всякого глагола доступа — и «Сколько всего в базе клиентов?» получал
      // заготовку «могу посчитать» вместо числа, не дойдя ни до инструмента,
      // ни до модели. Заодно убрана мёртвая ветка `клиентск\w*\s+баз`:
      // \w в JavaScript не понимает кириллицу, она не срабатывала никогда.
      !/(видишь|видит|есть\s+(?:ли\s+)?доступ|доступна?|можешь\s+(?:ли\s+)?(?:смотр|видеть|подним|откры)|подключен[ао]?|открыт[ао]?).{0,48}(?:баз[ауиеы]|клиент)|доступ\s+к\s+клиент/i.test(
        text,
      )
    ) {
      return null;
    }
    return {
      reply:
        'Да — к CRM-базе клиентов у меня доступ есть. Могу точно посчитать всю базу, лояльных и тех, кто не был больше 1–6 месяцев или года. По конкретному гостю подниму обезличенное досье: визиты, любимые услуги, цикл, траты и бонусы. Имена и телефоны списком вслух не читаю.',
    };
  }

  private guardClientUpsell(
    brain: MayaBrainRoute,
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
        (result.name === 'catalog.services.read' &&
          Array.isArray(this.record(result.result).services)) ||
        (result.name === 'booking.upsell.suggest' &&
          (Array.isArray(this.record(result.result).suggestions) ||
            Array.isArray(this.record(result.result).menu_addons))),
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
    brain: MayaBrainRoute,
    redacted: boolean,
    toolsUsed: ToolUsage[],
    decisions: AiCoreModelDecision[],
    response: AiCoreCompletion,
    toolResults: AiCoreToolResult[] = [],
  ) {
    const completedResponse = response;
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
    const personal = [
      UserRole.EMPLOYEE,
      UserRole.PROVIDER,
      UserRole.STAFF,
    ].includes(user.role);
    const clientAudience = this.isClientAudience(user, dto.audience);
    const reportCard =
      !clientAudience &&
      grounding.status === 'verified' &&
      toolResults.length > 0
        ? buildChatReportCard(toolResults, {
            personal,
            userText: this.latestUserText(dto.messages),
          })
        : null;
    const semanticPlans = decisions.flatMap((decision) =>
      decision.semanticPlan ? [decision.semanticPlan] : [],
    );
    const conversationAudit =
      semanticPlans.length > 0
        ? this.conversationLayer().summarizeForAudit(semanticPlans)
        : null;
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
        brain_persona: brain.persona,
        brain_intent: brain.intent,
        conversation_intelligence_version: conversationAudit
          ? 'maya-ci/1'
          : null,
        conversation_domains: conversationAudit?.domains ?? [],
        conversation_intents: conversationAudit?.intents ?? [],
        conversation_task_count: conversationAudit?.task_count ?? 0,
        conversation_denied_task_count:
          conversationAudit?.denied_task_count ?? 0,
        conversation_clarification_required:
          conversationAudit?.clarification_required ?? false,
        conversation_confirmation_required:
          conversationAudit?.confirmation_required ?? false,
        grounding_status: grounding.status,
        grounding_domain: grounding.domain,
        grounding_evidence_tools: grounding.evidence_tools,
        // Почему ответ модели был отклонён. Только числа, без текста.
        unsourced_numbers: completedResponse.unsourced ?? [],
        redacted_input: redacted,
        widget: reportCard?.widget ?? null,
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
      brain: {
        persona: brain.persona,
        intent: brain.intent,
      },
      ...(reportCard
        ? {
            widget: reportCard.widget,
            widget_data: reportCard.widget_data,
          }
        : {}),
    };
  }

  private conversationLayer(): ConversationIntelligenceService {
    return (
      this.conversationIntelligence ?? new ConversationIntelligenceService()
    );
  }

  /**
   * Ход целиком про болтовню: ни одной задачи о данных салона.
   *
   * Пустой план сюда НЕ попадает — отсутствие разбора не повод снимать сторожа,
   * иначе любой сбой планировщика открывал бы дорогу ответу без источника.
   */
  private isSmallTalkPlan(plan: ConversationSemanticPlan | null): boolean {
    const tasks = plan?.tasks ?? [];
    return (
      tasks.length > 0 && tasks.every((task) => task.domain === 'small_talk')
    );
  }

  private semanticClarification(
    plan: ConversationSemanticPlan | null,
  ): string | null {
    return (
      plan?.tasks.find((task) => task.requires_clarification)
        ?.clarification_question ?? null
    );
  }

  private async resolveBusinessTimezone(tenantId: string): Promise<string> {
    if (!this.prisma) {
      return 'Europe/Moscow';
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    const timezone = tenant?.defaultTimezone?.trim() || 'Europe/Moscow';
    try {
      new Intl.DateTimeFormat('ru-RU', { timeZone: timezone });
      return timezone;
    } catch {
      return 'Europe/Moscow';
    }
  }

  /**
   * Нужно ли отвечать только по данным — и что может быть доказательством.
   *
   * Для открытого вопроса доказательством считаются все доступные инструменты.
   * Для явно распознанной темы доказательством остаётся только её семейство:
   * это не даёт соседнему отчёту подменить отсутствующий ответ.
   */
  private groundingRequirement(
    messages: AiCoreMessage[],
    allowedNames: Set<string>,
    brain: MayaBrainRoute,
    rawLatestText = '',
    rawPreviousUserText = '',
  ): GroundingRequirement | null {
    const latestText = this.latestUserText(messages);
    const previousUserText = this.previousUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е');
    const text = this.contextualUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е');
    const hinted = this.toolHint(text, brain);
    if (!this.isDataQuestion(brain, text, hinted !== null)) {
      return null;
    }
    // 🔴 ПРАВИЛО ВЛАДЕЛЬЦА: ограничения только про деньги и право. Всё, что
    // угадывало тему по списку слов и подставляло заранее выбранный
    // инструмент, снято. Это был главный источник отказов: «выгодный» уводил
    // отчёт в год, «за 3 месяца» — в третье число, вопрос мастера про свои
    // записи упирался в журнал команды, которого ему не выдают.
    //
    // Теперь модель получает ВСЕ доступные ей инструменты данных как равные и
    // выбирает сама. Что доступно — решает единственный движок прав.
    const dataTools = [...allowedNames].filter(
      (name) => name in DATA_TOOL_DOMAINS,
    );
    // Вопрос про деньги салона от того, кому их считать нечем: у клиента таких
    // данных нет никогда, на младшем тарифе — нечем посчитать. Здесь честный
    // отказ обязателен, иначе MAYA ответит выручкой из прайс-листа. Это прямо
    // денежная сторона — единственная, где ограничение остаётся по правилу
    // владельца.
    const hintedDataTools = (hinted ?? []).filter(
      (name) => name in DATA_TOOL_DOMAINS,
    );
    const analyticsEvidenceTool = [
      'analytics.business.profit',
      'analytics.employee.query',
      'analytics.business.query',
    ].find((name) => allowedNames.has(name));
    // Не только по интенту: клиент, спросивший «сколько заработал салон»,
    // распознаётся подсказкой в аналитику, которой у него нет никогда. Деньги
    // салона мимо роли не отдаём — это и роль, и деньги сразу.
    const moneyWithoutAnalytics =
      (MONEY_INTENTS.has(brain.intent) ||
        hintedDataTools.some((name) => name.startsWith('analytics.'))) &&
      !analyticsEvidenceTool;
    // Третий и последний отказ: спросили про ЧУВСТВИТЕЛЬНУЮ семью — чужой
    // график, точный журнал дня, досье клиента, свои визиты или баллы, — а ни
    // одного её инструмента человеку не выдано. Подменять такой вопрос
    // соседней аналитикой нельзя: «какой график у Стаса» не отвечается месячной
    // сводкой, а «визиты Иванова» — выборкой по всей базе. Для всех остальных
    // тем промах подсказки больше НЕ закрывает вопрос.
    const sensitiveFamilyClosed =
      hintedDataTools.length > 0 &&
      hintedDataTools.every((name) => STRICT_GROUNDING_HINT_TOOLS.has(name)) &&
      !hintedDataTools.some((name) => allowedNames.has(name));
    // Второй отказ — источников данных нет вовсе: ассистента нет в тарифе либо
    // роль не даёт ни одного инструмента.
    if (
      dataTools.length === 0 ||
      moneyWithoutAnalytics ||
      sensitiveFamilyClosed
    ) {
      return {
        evidenceToolNames: [],
        fallbackDomain: sensitiveFamilyClosed
          ? (DATA_TOOL_DOMAINS[hintedDataTools[0]] ?? null)
          : moneyWithoutAnalytics
            ? 'business_query'
            : null,
        closedForAccess: true,
        closedReason: allowedNames.size === 0 ? 'plan' : 'scope',
        strictNumbers: true,
      };
    }
    // Подсказка осталась СОВЕТОМ и перестала быть запретом. Вероятный
    // инструмент идёт первым, но доказательством принимается ЛЮБОЙ доступный:
    // промах подсказки больше не может закрыть тему и родить отказ. Именно
    // закрытие семьи давало «недоступно для вашей роли» там, где данные лежали
    // рядом — мастеру про его же записи, владельцу про его же прибыль.
    // Денежный вопрос владельца по умолчанию ведёт в аналитику: без этого
    // первым оказывался случайный источник вроде прайс-листа. Это тоже СОВЕТ —
    // остальные инструменты остаются равноправными доказательствами.
    const reportingPeriod = ReportingPeriodResolver.resolve(
      rawLatestText || latestText,
      rawPreviousUserText,
    );
    const analyticsPreference =
      brain.persona === 'director' &&
      (MONEY_INTENTS.has(brain.intent) ||
        brain.intent === 'staff_operations' ||
        reportingPeriod.explicit ||
        STAFF_CONTRIBUTION_QUESTION_PATTERN.test(text) ||
        STAFF_PAYROLL_BREAKDOWN_QUESTION_PATTERN.test(text) ||
        DATA_TOPIC_PATTERN.test(text) ||
        OPEN_BUSINESS_OVERVIEW_PATTERN.test(text) ||
        isComprehensiveBusinessReview(text, previousUserText))
        ? ['analytics.business.query', 'analytics.employee.query'].find(
            (name) => allowedNames.has(name),
          )
        : undefined;
    const preferred =
      hinted?.find(
        (name) => name in DATA_TOOL_DOMAINS && allowedNames.has(name),
      ) ??
      analyticsPreference ??
      null;
    // Клиентские данные и точный день суток — семьи, где ШИРОТА вредна:
    // «сколько визитов у Иванова» не должно отвечаться выборкой по всей базе.
    // Это и есть юридическая сторона, а не выдуманное ограничение. Поэтому для
    // них доказательства сужаются до семьи — но БЕЗ отказа: если ни один
    // инструмент семьи не выдан, идём ко всем доступным, а не в стену.
    const strictFamily =
      preferred && STRICT_GROUNDING_HINT_TOOLS.has(preferred)
        ? (hinted ?? []).filter(
            (name) => name in DATA_TOOL_DOMAINS && allowedNames.has(name),
          )
        : [];
    // Расчёт по просьбе владельца — не отчёт: числа он назвал сам, а
    // арифметику по ним сторож блокировать не должен.
    const scenario = this.isScenarioQuestion(text);
    return {
      evidenceToolNames: strictFamily.length
        ? strictFamily
        : preferred
          ? [preferred, ...dataTools.filter((name) => name !== preferred)]
          : dataTools,
      fallbackDomain: preferred ? (DATA_TOOL_DOMAINS[preferred] ?? null) : null,
      closedForAccess: false,
      strictNumbers: !scenario,
      // Предзагрузка аргументов — не ограничение, а работа сервера за модель:
      // он лучше разбирает падежи («визиты Ивана» → клиент «Иван») и даты.
      ...(preferred && PRELOADABLE_TOOLS.has(preferred)
        ? (() => {
            const preloadArguments = this.preloadArguments(
              preferred,
              latestText,
              previousUserText,
              rawLatestText,
              rawPreviousUserText,
            );
            return preloadArguments
              ? {
                  presetToolCall: {
                    name: preferred,
                    arguments: preloadArguments,
                  },
                }
              : {};
          })()
        : {}),
    };
  }

  /**
   * ЕДИНСТВЕННЫЙ предикат маршрутизации: спрашивают ли про ДАННЫЕ — деньги,
   * записи, клиентов, услуги, расходы, расписание, баллы.
   *
   * От ответа зависят ровно две вещи: строгий режим чисел и запрет отвечать
   * раньше инструмента. Тему он не определяет — её назовёт тот инструмент,
   * который отработает.
   */
  /**
   * Просят РАСЧЁТ, а не факт из CRM.
   *
   * 🔴 Правило «все числа только из инструментов» защищает от выдуманной
   * выручки — и это правильно. Но оно же запрещало обычную арифметику:
   * на «посчитай, если вернём 1800 клиентов, какая будет загрузка на 5
   * мастеров и 4 кресла» MAYA дважды уходила в готовый отчёт, потому что
   * любое вычисленное число сторож считал непроверенным.
   *
   * Здесь режим смягчается: цифры, которые владелец назвал сам, и
   * арифметику по ним считать можно. База для расчёта по-прежнему берётся
   * из CRM, а ответ обязан называться прикидкой — этого требует промпт.
   */
  private isScenarioQuestion(text: string): boolean {
    if (!text) return false;
    const asksToCompute =
      /(?:^|[^а-я])(?:посчитай|подсчитай|рассчитай|прикин|смоделируй|спрогнозируй|оцени)/i.test(
        text,
      );
    const hypothetical =
      /(?:^|[^а-я])(?:если|при\s+условии|допустим|представь|предположим|а\s+что\s+если|сколько\s+будет|каким\s+будет|какая\s+будет|какой\s+будет)/i.test(
        text,
      );
    // Одного «если» мало: «сколько записей, если считать отменённые» — это
    // всё ещё вопрос о факте. Нужна либо явная просьба посчитать, либо
    // гипотеза вместе с числом, которое назвал сам человек.
    return asksToCompute || (hypothetical && /\d/.test(text));
  }

  private isDataQuestion(
    brain: MayaBrainRoute,
    text: string,
    hinted: boolean,
  ): boolean {
    if (!text) {
      return false;
    }
    // Команда записать расход — это действие, а не вопрос. Требование
    // источника заставило бы MAYA сперва прочитать отчёт по салону и только
    // потом услышать просьбу.
    if (EXPENSE_RECORD_COMMAND_PATTERN.test(text)) {
      return false;
    }
    if (SMALL_TALK_PATTERN.test(text.trim())) {
      return false;
    }
    if (hinted) {
      return true;
    }
    if (brain.persona === 'director') {
      // Владелец и команда приходят в MAYA за салоном: всё, кроме записи
      // клиента, правки расписания, базы знаний и поддержки, — вопрос о данных.
      return !NON_DATA_INTENTS.has(brain.intent);
    }
    // Клиент чаще ведёт запись, чем читает отчёты: «хочу стрижку» — это
    // разговор, а «сколько стоит стрижка» — вопрос о факте. Различает форма.
    return DATA_TOPIC_PATTERN.test(text) && GROUNDING_FACT_PATTERN.test(text);
  }

  /**
   * Подсказка: с какого инструмента вероятнее начать.
   *
   * 🔴 Это ПОДСКАЗКА, а не приговор. Она встаёт первой в required_tools и, если
   * однозначна, предзагружается, но модель вправе взять любой другой доступный
   * инструмент данных. Внутри списка порядок — по убыванию полноты ответа, а
   * выбирает из него не догадка, а факт: что выдано роли и тарифу. Поэтому
   * «сколько у меня записей» у клиента идёт в его историю, а у мастера — в его
   * личную аналитику, без отдельной ветки на каждую роль.
   */
  private toolHint(text: string, brain?: MayaBrainRoute): string[] | null {
    // Полный реестр проверяем раньше клиентского баланса и любой периодной
    // аналитики: «лояльные клиенты» — не «мои бонусы» и не гости месяца.
    if (
      CLIENT_RETENTION_HINT_PATTERN.test(text) &&
      brain?.persona !== 'admin'
    ) {
      return ['clients.retention.scan'];
    }
    // Досье конкретного гостя проверяем до «моих баллов». Иначе фраза
    // «сколько бонусов у Ивана» открывала баланс самого сотрудника.
    if (CLIENT_DOSSIER_HINT_PATTERN.test(text) && brain?.persona !== 'admin') {
      return ['clients.dossier.read'];
    }
    if (LOYALTY_HINT_PATTERN.test(text)) {
      return ['loyalty.own.read'];
    }
    if (OWN_APPOINTMENTS_HINT_PATTERN.test(text)) {
      // Гость — своя история визитов. Команда салона на ту же фразу смотрит
      // загрузку/записи в аналитике: иначе мастер получает пустой client-list.
      if (brain?.persona === 'admin') {
        return ['appointments.own.list'];
      }
      return [
        'analytics.employee.query',
        'analytics.business.query',
        'appointments.own.list',
      ];
    }
    if (
      STAFF_SCHEDULE_READ_HINT_PATTERN.test(text) &&
      brain?.persona !== 'admin'
    ) {
      // Подсказка называет ОБА варианта — командный и свой. Кто что получит,
      // решит движок прав: у руководителя останется первый, у мастера второй.
      // Раньше здесь стоял только командный, и вопрос мастера про свой график
      // упирался в отказ по роли.
      return ['staff.schedule.read', 'staff.schedule.own.read'];
    }
    if (
      brain?.persona !== 'admin' &&
      EXPLICIT_CALENDAR_DAY_PATTERN.test(text) &&
      OPERATIONS_JOURNAL_HINT_PATTERN.test(text) &&
      !AVAILABILITY_HINT_PATTERN.test(text)
    ) {
      // То же самое для журнала дня. Мастеру журнал команды не выдан, но его
      // собственный день лежит в личной аналитике — именно ею MAYA и ответила,
      // когда владелец переспросил «это мои данные, я мастер». Пусть она
      // доходит туда сразу, а не после ругани.
      return [
        'operations.journal.read',
        'analytics.employee.query',
        'analytics.business.query',
      ];
    }
    if (AVAILABILITY_HINT_PATTERN.test(text)) {
      return ['booking.availability.read'];
    }
    // 🔴 До справочника услуг. «Сколько стоит привести нового клиента» и «какая
    // прибыль» — вопросы экономики салона, и оба раньше уезжали не туда: первый
    // в прайс-лист, второй в операционный обзор, где прибыли нет по построению.
    if (
      CLIENT_ACQUISITION_QUESTION_PATTERN.test(text) ||
      (PROFIT_QUESTION_PATTERN.test(text) &&
        !PROFIT_BREAKDOWN_ESCAPE_PATTERN.test(text))
    ) {
      return [
        'analytics.business.profit',
        'analytics.business.query',
        'analytics.employee.query',
      ];
    }
    if (EXPENSE_STRUCTURE_QUESTION_PATTERN.test(text)) {
      return [
        'expenses.read',
        'analytics.business.profit',
        'analytics.business.query',
      ];
    }
    if (brain?.persona === 'director' && isComprehensiveBusinessReview(text)) {
      return ['analytics.business.query', 'analytics.employee.query'];
    }
    if (
      PRICE_HINT_PATTERN.test(text) &&
      // Цена привлечения клиента — не позиция прайса, а подписка MAYA не услуга
      // салона: ни то, ни другое в каталоге не лежит.
      !CLIENT_ACQUISITION_QUESTION_PATTERN.test(text) &&
      !/(подписк\w*|тариф\w*|maya|майя)/i.test(text)
    ) {
      return ['catalog.services.read'];
    }
    if (SALON_ABOUT_HINT_PATTERN.test(text)) {
      return ['catalog.staff.read', 'catalog.services.read'];
    }
    if (STAFF_HINT_PATTERN.test(text)) {
      if (brain?.persona === 'admin') {
        return ['catalog.staff.read', 'catalog.services.read'];
      }
      // Владельцу/команде — сначала поимённая аналитика, каталог запасной.
      return [
        'analytics.business.query',
        'analytics.employee.query',
        'catalog.staff.read',
      ];
    }
    return null;
  }

  /**
   * Аргументы предзагрузки: период разрешает сервер, сравнение — тоже.
   *
   * Модели их не доверяют не из недоверия, а по устройству: календаря у неё
   * нет, а без сравнения разбор просадки вырождается в перечень счётчиков.
   */
  private preloadArguments(
    toolName: string,
    text: string,
    previousUserText: string,
    rawLatestText = '',
    rawPreviousUserText = '',
  ): Record<string, unknown> | null {
    if (toolName === 'clients.dossier.read') {
      const query = this.clientDossierQuery(rawLatestText, rawPreviousUserText);
      return query ? { query } : null;
    }
    return ReportingPeriodResolver.hardenToolArguments(
      toolName,
      {},
      text,
      previousUserText,
    );
  }

  /**
   * Извлекает поисковую строку внутри сервера, до обезличивания для LLM.
   * Реальное имя/телефон уходит только в зашифрованные аргументы CRM-инструмента.
   */
  private clientDossierQuery(
    rawText: string,
    rawPreviousText = '',
  ): string | null {
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const phone = text.match(/\+?\d[\d\s().-]{2,}\d/);
    if (phone) {
      const digits = phone[0].replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-11);
    }

    const patterns = [
      /(?:что\s+за\s+клиент|досье(?:\s+клиента)?|расскажи\s+(?:про|о))\s+(.+)$/i,
      /сколько\s+(?:визит|посещени|балл|бонус)[а-яёa-z]*\s+у\s+(.+)$/i,
      /сколько\s+у\s+(.+?)\s+(?:визит|посещени|балл|бонус)[а-яёa-z]*\b/i,
      /(?:насколько|как)\s+(.+?)\s+лоял[а-яёa-z]*\b/i,
      /как[а-яёa-z]*\s+услуг[а-яёa-z]*\s+(?:покупает|берет|берёт|выбирает|любит)\s+(.+)$/i,
      /что\s+(.+?)\s+(?:обычно\s+)?(?:берет|берёт|брал|брала|любит)\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const query = match?.[1]
        ?.replace(/^(?:клиент[а-яёa-z]*|гост[а-яёa-z]*)\s+/i, '')
        .replace(/[?!.;,]+$/g, '')
        .trim();
      if (
        query &&
        query.length >= 3 &&
        query.length <= 80 &&
        !/^(?:меня|мне|мой|мои|него|нее|неё|ему|ей)$/i.test(query)
      ) {
        return query;
      }
    }
    if (
      rawPreviousText &&
      /(?:что\s+(?:он|она)\s+(?:обычно\s+)?(?:берет|берёт|любит)|что\s+(?:ему|ей)\s+предложит|сколько\s+у\s+(?:него|нее|неё)\s+(?:визит|посещени|балл|бонус))/i.test(
        text,
      )
    ) {
      return this.clientDossierQuery(rawPreviousText);
    }
    return null;
  }

  /** Данные на руках: отработал любой из доступных инструментов данных. */
  private groundingSatisfied(
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
  ): boolean {
    return (
      !requirement ||
      toolResults.some((result) =>
        requirement.evidenceToolNames.includes(result.name),
      )
    );
  }

  /**
   * Домен хода: по факту, а не по догадке.
   *
   * Пока ни один инструмент не отработал, называется вероятный домен — только
   * чтобы отчёт и текст отказа не были безымянными. Как только результат есть,
   * тему называет он: берём последний отработавший инструмент данных.
   */
  private groundingDomain(
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
  ): string | null {
    for (let index = toolResults.length - 1; index >= 0; index -= 1) {
      const domain = DATA_TOOL_DOMAINS[toolResults[index]?.name ?? ''];
      if (domain) {
        return domain;
      }
    }
    return requirement?.fallbackDomain ?? null;
  }

  private groundingReport(
    requirement: GroundingRequirement | null,
    status: GroundingReport['status'],
    toolResults: AiCoreToolResult[],
  ): GroundingReport {
    return {
      status,
      domain: requirement
        ? this.groundingDomain(requirement, toolResults)
        : null,
      required_tools: requirement?.evidenceToolNames ?? [],
      evidence_tools: requirement
        ? [
            ...new Set(
              toolResults
                .map((result) => result.name)
                .filter((name) => requirement.evidenceToolNames.includes(name)),
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
    const domain = this.groundingDomain(requirement, toolResults);
    return {
      reply: unavailableForCurrentAccess
        ? requirement.closedReason === 'plan'
          ? 'MAYA не входит в ваш текущий тариф, поэтому я не могу открыть данные бизнеса. Ассистент включён в тариф Business+ — после перехода все ответы по вашей CRM станут доступны сразу, ничего настраивать не нужно.'
          : 'Этот запрос недоступен для вашей текущей роли или тарифа. MAYA не покажет чужие или закрытые данные.'
        : domain === 'staff_schedule'
          ? 'Не смогла сейчас получить точный график из YClients. Общей аналитикой его не заменяю — попробуйте повторить запрос.'
          : domain === 'operations_journal'
            ? 'Не смогла сейчас получить точный журнал записей из YClients. Месячной сводкой его не заменяю — попробуйте повторить запрос.'
            : 'Не смогла подтвердить данные в защищённом источнике MAYA. Чтобы не показать неверные цифры или факты, попробуйте повторить запрос позже.',
      source: 'safe_fallback' as const,
      action: null,
      grounding: this.groundingReport(requirement, 'blocked', toolResults),
    };
  }

  /**
   * Ответ без модели — по тому инструменту, который ОТРАБОТАЛ.
   *
   * 🔴 Раньше ветка выбиралась по угаданной теме: промах регулярки — и текст
   * не собирался вовсе, а владелец получал извинение вместо цифр, которые уже
   * лежали на руках. Теперь тему называет имя инструмента, и промахнуться в
   * нём нельзя. Идём с конца: последний ответивший инструмент и есть тема хода.
   */
  private deterministicGroundedReply(
    toolResults: AiCoreToolResult[],
    userText: string,
  ): string | null {
    for (let index = toolResults.length - 1; index >= 0; index -= 1) {
      const evidence = toolResults[index];
      const reply = evidence
        ? this.deterministicReplyForTool(evidence, userText)
        : null;
      if (reply) {
        return reply;
      }
    }
    return null;
  }

  /**
   * Список спящих гостей — поимённо, силами сервера.
   *
   * 🔴 Имена и телефоны сюда доходят, но дальше не идут: этот текст
   * возвращается пользователю напрямую, минуя внешнюю модель. Так владелец
   * получает живой список «кого возвращать», а контур 152-ФЗ остаётся цел.
   */
  private deterministicDormantClientsReply(value: unknown): string | null {
    const data = this.record(value);
    const rows = Array.isArray(data.clients) ? data.clients : [];
    const days =
      typeof data.inactive_days === 'number' ? data.inactive_days : null;
    const total =
      typeof data.total_dormant === 'number' ? data.total_dormant : rows.length;
    if (days === null) {
      return null;
    }
    if (!rows.length) {
      return `Гостей, которые не приходили дольше ${days} дней, нет — база активна.`;
    }
    const lines = rows
      .map((row: unknown) => {
        const client = this.record(row);
        const name =
          typeof client.name === 'string' && client.name.trim()
            ? client.name.trim()
            : 'Без имени в CRM';
        const phone =
          typeof client.phone === 'string' && client.phone.trim()
            ? `, ${client.phone.trim()}`
            : '';
        const gap =
          typeof client.inactivity_days === 'number'
            ? `${client.inactivity_days} дн.`
            : 'давно';
        const visits =
          typeof client.visits === 'number'
            ? `, визитов: ${client.visits}`
            : '';
        return `• ${name}${phone} — не был ${gap}${visits}`;
      })
      .join('\n');
    const tail =
      total > rows.length
        ? `\n\nПоказала ${rows.length} из ${total} — скажите, если нужен весь список.`
        : '';
    return `Гости, которые не приходили дольше ${days} дней — всего ${total}:\n\n${lines}${tail}`;
  }

  private deterministicReplyForTool(
    evidence: AiCoreToolResult,
    userText: string,
  ): string | null {
    const text = userText.toLowerCase().replace(/ё/g, 'е');
    switch (evidence.name) {
      case 'analytics.business.query':
      case 'analytics.employee.query': {
        const reply = this.deterministicAnalyticsQueryReply(
          evidence.name === 'analytics.employee.query',
          evidence.result,
          userText,
        );
        return reply
          ? this.appendAnalyticsFreshness(reply, evidence.result)
          : null;
      }
      case 'expenses.read':
        return this.deterministicExpenseReply(evidence.result);
      case 'expenses.period.complete':
      case 'analytics.business.profit':
        return this.deterministicProfitReply(
          evidence.result,
          // Спросили про цену клиента — с неё и начинаем. Ответ на вопрос не
          // должен ждать, пока договорит отчёт о прибыли.
          CLIENT_ACQUISITION_QUESTION_PATTERN.test(text),
          GROSS_PROFIT_QUESTION_PATTERN.test(text),
        );
      case 'clients.retention.scan':
        return this.deterministicClientRetentionReply(evidence.result, text);
      case 'clients.dormant.list':
        return this.deterministicDormantClientsReply(evidence.result);
      case 'clients.dossier.read':
        return this.deterministicClientDossierReply(evidence.result);
      case 'staff.schedule.read':
        return this.deterministicStaffScheduleReply(evidence.result);
      case 'operations.journal.read':
        return this.deterministicOperationsJournalReply(evidence.result);
      case 'booking.availability.read': {
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
      case 'loyalty.own.read': {
        const loyalty = this.record(evidence.result);
        const balance = this.safeMetricNumber(loyalty.balance);
        const balanceLabel = `${this.formatMetricNumber(balance)} ${this.pluralize(balance, 'балл', 'балла', 'баллов')}`;
        /**
         * 🔴 Оговорка о владельце, а не украшение. Баланс ведёт внешний
         * журнал или карта провайдера, Maya его не считает и обещать списание
         * за них не может. Раньше здесь произносилось голое число — даже
         * когда оно отдано из кэша, потому что владелец не ответил.
         */
        const balanceCaveat =
          loyalty.verification_required === false
            ? ''
            : loyalty.stale === true
              ? ' Это последнее известное значение — при списании MAYA уточнит его у источника.'
              : ' Точную сумму MAYA подтвердит у источника перед списанием.';
        if (!/(потрат|спис|оплат|на\s+что)/i.test(text)) {
          return `Ваш баланс: ${balanceLabel}.${balanceCaveat}`;
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
          : `Ваш баланс: ${balanceLabel}.${balanceCaveat} Подходящих услуг для списания сейчас нет.`;
      }
      case 'appointments.own.list': {
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
      default:
        return null;
    }
  }

  private deterministicStaffScheduleReply(result: unknown): string | null {
    const data = this.record(result);
    if (typeof data.date !== 'string' || !Array.isArray(data.staff)) {
      return null;
    }
    const dateMatch = data.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dateLabel = dateMatch
      ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`
      : data.date;
    const rows = data.staff
      .map((entry) => {
        const staff = this.record(entry);
        if (typeof staff.name !== 'string') {
          return null;
        }
        const slots = Array.isArray(staff.slots)
          ? staff.slots
              .map((slot) => {
                const value = this.record(slot);
                return typeof value.from === 'string' &&
                  typeof value.to === 'string'
                  ? `${value.from}–${value.to}`
                  : null;
              })
              .filter((slot): slot is string => slot !== null)
          : [];
        return {
          name: staff.name,
          isWorking: staff.is_working === true && slots.length > 0,
          slots,
        };
      })
      .filter(
        (row): row is { name: string; isWorking: boolean; slots: string[] } =>
          row !== null,
      );
    if (rows.length === 0) {
      return `На ${dateLabel} в YClients нет активных мастеров с графиком.`;
    }
    if (rows.length === 1) {
      const row = rows[0];
      return `График на ${dateLabel}: ${row.name} — ${
        row.isWorking ? row.slots.join(', ') : 'выходной'
      }. Источник: YClients.`;
    }
    const working = rows
      .filter((row) => row.isWorking)
      .map((row) => `${row.name} ${row.slots.join(', ')}`);
    const off = rows.filter((row) => !row.isWorking).map((row) => row.name);
    return [
      `График на ${dateLabel}.`,
      working.length > 0
        ? `Работают: ${working.join('; ')}.`
        : 'По графику никто не работает.',
      off.length > 0 ? `Выходной: ${off.join(', ')}.` : '',
      'Источник: YClients.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private deterministicOperationsJournalReply(result: unknown): string | null {
    const data = this.record(result);
    if (typeof data.date !== 'string' || !Array.isArray(data.staff)) {
      return null;
    }
    const dateMatch = data.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dateLabel = dateMatch
      ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`
      : data.date;
    const summary = this.record(data.summary);
    const staff = data.staff
      .map((entry) => {
        const row = this.record(entry);
        const appointments = this.record(row.appointments);
        if (typeof row.name !== 'string') {
          return null;
        }
        return {
          name: row.name,
          total: this.safeMetricNumber(appointments.total),
          active: this.safeMetricNumber(appointments.active),
          confirmed: this.safeMetricNumber(appointments.confirmed),
          completed: this.safeMetricNumber(appointments.completed),
          canceled: this.safeMetricNumber(appointments.canceled),
          noShow: this.safeMetricNumber(appointments.no_show),
          bookedMinutes: this.safeMetricNumber(row.booked_minutes),
          workingMinutes: this.safeMetricNumber(row.working_minutes),
          loadPercent: this.optionalMetricNumber(row.load_percent),
        };
      })
      .filter(
        (
          row,
        ): row is {
          name: string;
          total: number;
          active: number;
          confirmed: number;
          completed: number;
          canceled: number;
          noShow: number;
          bookedMinutes: number;
          workingMinutes: number;
          loadPercent: number | null;
        } => row !== null,
      );
    if (staff.length === 0) {
      return null;
    }
    if (staff.length === 1) {
      const row = staff[0];
      const appointments = Array.isArray(data.appointments)
        ? data.appointments
            .slice(0, 12)
            .map((entry) => {
              const appointment = this.record(entry);
              if (
                typeof appointment.time !== 'string' ||
                typeof appointment.end_time !== 'string'
              ) {
                return null;
              }
              const services = Array.isArray(appointment.services)
                ? appointment.services.filter(
                    (service): service is string => typeof service === 'string',
                  )
                : [];
              return `${appointment.time}–${appointment.end_time} — ${services.length > 0 ? services.join(', ') : 'услуга не указана'}`;
            })
            .filter((entry): entry is string => entry !== null)
        : [];
      return [
        `${dateLabel}: ${row.name} — ${row.total} записей.`,
        // Статусы записи — статусами; присутствие мастера канон по-человеку
        // не считает, и выдумывать его из статуса нельзя (реестр 4.33).
        `Предстоящих: ${row.confirmed}, проведённых: ${row.completed}, отмен: ${row.canceled}.`,
        row.workingMinutes > 0
          ? `Занято ${row.bookedMinutes} из ${row.workingMinutes} мин${row.loadPercent === null ? '' : ` (${this.formatMetricNumber(row.loadPercent)}%)`}.`
          : '',
        appointments.length > 0 ? `Записи: ${appointments.join('; ')}.` : '',
        'Источник: YClients.',
      ]
        .filter(Boolean)
        .join(' ');
    }
    const total = this.safeMetricNumber(summary.total);
    const active = this.safeMetricNumber(summary.active);
    const completed = this.safeMetricNumber(summary.completed);
    const canceled = this.safeMetricNumber(summary.canceled);
    const byStaff = staff
      .slice(0, 12)
      .map(
        (row) =>
          `${row.name} — ${row.active} активных, ${row.canceled} отмен${row.loadPercent === null ? '' : `, загрузка ${this.formatMetricNumber(row.loadPercent)}%`}`,
      );
    /**
     * 🔴 Cycle 04 P5. Присутствие — из наблюдения, а не из статуса.
     *
     * Здесь печаталось «неявок N» из статусной корзины провайдера. Статус
     * `no_show` — это состояние ЗАПИСИ, а присутствие отвечает на другой
     * вопрос, и инструмент отдаёт его отдельным блоком вместе с числом
     * ненаблюдённых. Пока наблюдение неполно, число неявок не называется.
     */
    const attendance = this.record(data.attendance);
    const arrived = this.optionalMetricNumber(attendance.arrived);
    const attendanceNoShow = this.optionalMetricNumber(attendance.no_show);
    const notObserved = this.optionalMetricNumber(attendance.not_observed);
    const attendanceLine =
      arrived === null || attendanceNoShow === null
        ? 'Присутствие за день не сверено.'
        : notObserved !== null && notObserved > 0
          ? `Присутствие: пришли ${this.formatMetricNumber(arrived)}, неявок ${this.formatMetricNumber(attendanceNoShow)}; по ${this.formatMetricNumber(notObserved)} записям отметки нет.`
          : `Присутствие: пришли ${this.formatMetricNumber(arrived)}, неявок ${this.formatMetricNumber(attendanceNoShow)}.`;

    return [
      `${dateLabel}: всего ${total} записей, активных ${active}, проведённых ${completed}, отмен ${canceled}.`,
      attendanceLine,
      `По мастерам: ${byStaff.join('; ')}.`,
      'Источник: YClients.',
    ].join(' ');
  }

  private deterministicClientRetentionReply(
    evidence: unknown,
    text: string,
  ): string | null {
    const data = this.record(evidence);
    if (data.complete !== true || data.source !== 'external_crm') {
      return null;
    }
    const total = this.safeMetricNumber(data.total_clients);
    const loyal = this.safeMetricNumber(data.loyal_clients);
    const repeat = this.safeMetricNumber(data.repeat_clients);
    const noVisits = this.safeMetricNumber(data.clients_without_visits);
    const unknown = this.safeMetricNumber(data.clients_with_unknown_last_visit);
    const loyalUnknown = this.safeMetricNumber(
      data.loyal_clients_with_unknown_last_visit,
    );
    const inactivity = this.record(data.inactivity);
    const loyalInactivity = this.record(data.loyal_inactivity);
    const values = {
      1: this.safeMetricNumber(inactivity.over_1_month),
      2: this.safeMetricNumber(inactivity.over_2_months),
      3: this.safeMetricNumber(inactivity.over_3_months),
      4: this.safeMetricNumber(inactivity.over_4_months),
      5: this.safeMetricNumber(inactivity.over_5_months),
      6: this.safeMetricNumber(inactivity.over_6_months),
      12: this.safeMetricNumber(inactivity.over_1_year),
    } as const;
    const loyalValues = {
      1: this.safeMetricNumber(loyalInactivity.over_1_month),
      2: this.safeMetricNumber(loyalInactivity.over_2_months),
      3: this.safeMetricNumber(loyalInactivity.over_3_months),
      4: this.safeMetricNumber(loyalInactivity.over_4_months),
      5: this.safeMetricNumber(loyalInactivity.over_5_months),
      6: this.safeMetricNumber(loyalInactivity.over_6_months),
      12: this.safeMetricNumber(loyalInactivity.over_1_year),
    } as const;
    const threshold = this.requestedInactivityMonths(text);
    const loyalSegment = /лояльн/i.test(text);

    if (
      BUSINESS_ACTION_REQUEST_PATTERN.test(text) &&
      /(вернут|возврат|удерж|реактив|рассыл)/i.test(text)
    ) {
      return this.deterministicClientReactivationAdvice(
        data,
        loyal,
        loyalValues,
        threshold,
      );
    }

    if (threshold !== null) {
      const selectedValues = loyalSegment ? loyalValues : values;
      const count = selectedValues[threshold];
      const period =
        threshold === 12
          ? 'больше года'
          : `больше ${this.inactivityMonthLabel(threshold)}`;
      const selectedUnknown = loyalSegment ? loyalUnknown : unknown;
      const suffix =
        selectedUnknown > 0
          ? ` Ещё у ${selectedUnknown} ${this.pluralize(selectedUnknown, 'карточки', 'карточек', 'карточек')} с визитами CRM не указала дату последнего визита, поэтому в этот срок они не включены.`
          : '';
      const scope = loyalSegment
        ? `Из ${loyal} лояльных клиентов`
        : 'По полному реестру CRM';
      return `${scope} ${period} не посещали салон ${count} ${this.pluralize(count, 'клиент', 'клиента', 'клиентов')}.${suffix}`;
    }
    if (/лояльн/i.test(text)) {
      return `В полной CRM-базе ${loyal} лояльных ${this.pluralize(loyal, 'клиент', 'клиента', 'клиентов')} из ${total}. Лояльными считаю карточки минимум с 3 визитами; повторных клиентов с 2 и более визитами — ${repeat}.`;
    }
    if (
      /вс[ея]\s+(?:клиент|баз)|сколько\s+(?:всего\s+)?(?:клиент|гост)|(?:клиент|гост)[а-яёa-z]*\s+в\s+баз/i.test(
        text,
      )
    ) {
      return `В полной CRM-базе ${total} ${this.pluralize(total, 'клиентская карточка', 'клиентские карточки', 'клиентских карточек')}. Из них лояльных с 3 и более визитами — ${loyal}, повторных с 2 и более — ${repeat}, без единого визита — ${noVisits}.`;
    }
    const suffix =
      unknown > 0
        ? ` Ещё у ${unknown} ${this.pluralize(unknown, 'карточки', 'карточек', 'карточек')} с визитами CRM не указала дату последнего визита.`
        : '';
    return `По полной CRM-базе: всего ${total} ${this.pluralize(total, 'карточка', 'карточки', 'карточек')}, лояльных — ${loyal}, повторных — ${repeat}. Не были больше 1 месяца — ${values[1]}, 2 месяцев — ${values[2]}, 3 — ${values[3]}, 4 — ${values[4]}, 5 — ${values[5]}, 6 — ${values[6]}, больше года — ${values[12]}.${suffix}`;
  }

  private deterministicClientReactivationAdvice(
    data: Record<string, unknown>,
    loyalClients: number,
    loyalValues: Record<1 | 2 | 3 | 4 | 5 | 6 | 12, number>,
    requestedThreshold: 1 | 2 | 3 | 4 | 5 | 6 | 12 | null,
  ): string {
    const threshold = requestedThreshold ?? 1;
    const targetCount = loyalValues[threshold];
    const cohorts = this.record(data.loyal_reactivation_cohorts);
    const candidates: Array<{ count: number; label: string }> = [
      {
        count: this.safeMetricNumber(cohorts.from_1_to_2_months),
        label: 'не были 1–2 месяца',
      },
      {
        count: this.safeMetricNumber(cohorts.from_2_to_3_months),
        label: 'не были 2–3 месяца',
      },
      {
        count: this.safeMetricNumber(cohorts.from_3_to_6_months),
        label: 'не были 3–6 месяцев',
      },
      {
        count: this.safeMetricNumber(cohorts.from_6_to_12_months),
        label: 'не были 6–12 месяцев',
      },
      {
        count: this.safeMetricNumber(cohorts.over_1_year),
        label: 'не были больше года',
      },
    ];
    const startIndex =
      threshold >= 12
        ? 4
        : threshold >= 6
          ? 3
          : threshold >= 3
            ? 2
            : threshold >= 2
              ? 1
              : 0;
    const warmest = candidates
      .slice(startIndex)
      .find((candidate) => candidate.count > 0) ??
      candidates.find((candidate) => candidate.count > 0) ?? {
        count: targetCount,
        label:
          threshold === 12
            ? 'не были больше года'
            : `не были больше ${this.inactivityMonthLabel(threshold)}`,
      };
    const pilotCount = Math.min(100, warmest.count || targetCount);
    const targetPeriod =
      threshold === 12
        ? 'больше года'
        : `больше ${this.inactivityMonthLabel(threshold)}`;

    return [
      `В базе ${loyalClients} лояльных клиентов; ${targetPeriod} не были ${targetCount}. Писать всем сразу не стоит: начните с самого тёплого сегмента — ${warmest.count} ${this.pluralize(warmest.count, 'клиент', 'клиента', 'клиентов')}, которые ${warmest.label}.`,
      `1. Перед контактом исключить уже записанных, клиентов без согласия на сообщения, дубли и тех, кому уже недавно писали.`,
      '2. Обратиться персонально: напомнить привычного мастера и услугу, предложить 2–3 реальных окна. Первый контакт — без скидки.',
      `3. Запустить пилот не больше чем на ${pilotCount} ${this.pluralize(pilotCount, 'человека', 'человек', 'человек')}; не ответившим — один повтор через 5–7 дней, не массовый спам.`,
      '4. Считать не отправки, а результат: доставка, ответы, записи, состоявшиеся визиты, возвращённая выручка и отказы от рассылки. Любая отправка — только после проверки согласий и вашего подтверждения.',
    ].join('\n');
  }

  private deterministicClientDossierReply(evidence: unknown): string | null {
    const data = this.record(evidence);
    if (data.found !== true) {
      return typeof data.error === 'string'
        ? data.error
        : 'Клиент не найден. Уточните имя или последние четыре цифры телефона.';
    }

    const visits = this.safeMetricNumber(data.visits);
    const segmentLabels: Record<string, string> = {
      without_visits: 'без визитов',
      new: 'новый клиент',
      repeat: 'повторный клиент',
      loyal: 'лояльный клиент',
      regular: 'постоянный клиент',
      core: 'ядро постоянных клиентов',
    };
    const segment =
      typeof data.loyalty_segment === 'string'
        ? (segmentLabels[data.loyalty_segment] ?? data.loyalty_segment)
        : data.loyal === true
          ? 'лояльный клиент'
          : 'статус лояльности не определён';
    const parts = [
      `По карточке CRM: ${visits} ${this.pluralize(visits, 'визит', 'визита', 'визитов')}. Сегмент — ${segment}.`,
    ];

    if (typeof data.last_visit === 'string') {
      const match = data.last_visit.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const date = match
        ? `${match[3]}.${match[2]}.${match[1]}`
        : data.last_visit;
      const inactivityDays = this.safeMetricNumber(data.inactivity_days);
      parts.push(
        `Последний визит — ${date}${inactivityDays > 0 ? `, ${inactivityDays} ${this.pluralize(inactivityDays, 'день', 'дня', 'дней')} назад` : ''}.`,
      );
    }

    const services = Array.isArray(data.favorite_services)
      ? data.favorite_services.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : [];
    if (services.length > 0) {
      parts.push(
        `Чаще всего в последних визитах: ${services.slice(0, 4).join(', ')}.`,
      );
    }

    const averageCycleDays = this.safeMetricNumber(data.avg_cycle_days);
    if (averageCycleDays > 0) {
      parts.push(
        `Средний цикл между визитами — ${averageCycleDays} ${this.pluralize(averageCycleDays, 'день', 'дня', 'дней')}.`,
      );
    }

    if (typeof data.total_spent === 'number') {
      parts.push(
        `Покупки по карточке — ${this.formatMetricNumber(data.total_spent)} ₽.`,
      );
    }
    if (data.bonus_status === 'available') {
      const bonus = this.safeMetricNumber(data.bonus_balance);
      const bonusLabel =
        data.bonus_currency === 'RUB'
          ? `${this.formatMetricNumber(bonus)} ₽`
          : `${this.formatMetricNumber(bonus)} ${this.pluralize(bonus, 'балл', 'балла', 'баллов')}`;
      parts.push(`Бонусный баланс — ${bonusLabel}.`);
    } else {
      parts.push('Бонусный баланс CRM для этой карточки не вернула.');
    }

    if (this.safeMetricNumber(data.matches_count) > 1) {
      parts.push(
        'Нашла несколько совпадений и использовала первое; уточните последние четыре цифры телефона, если нужен другой клиент.',
      );
    }
    return parts.join(' ');
  }

  private requestedInactivityMonths(
    text: string,
  ): 1 | 2 | 3 | 4 | 5 | 6 | 12 | null {
    if (
      /(?:больше|дольше|свыше|около)?\s*(?:1\s*год|год[ау]?|12\s*месяц)/i.test(
        text,
      )
    ) {
      return 12;
    }
    const words: Array<[RegExp, 1 | 2 | 3 | 4 | 5 | 6]> = [
      [/(?:^|\D)(?:6|шест[ьи])\s*месяц/i, 6],
      [/(?:^|\D)(?:5|пят[ьи])\s*месяц/i, 5],
      [/(?:^|\D)(?:4|четыр[еёх])\s*месяц/i, 4],
      [/(?:^|\D)(?:3|тр[еёх])\s*месяц/i, 3],
      [/(?:^|\D)(?:2|двух|два)\s*месяц/i, 2],
      [/(?:^|\D)(?:1|один|одного)\s*месяц/i, 1],
    ];
    return words.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  }

  private inactivityMonthLabel(months: 1 | 2 | 3 | 4 | 5 | 6): string {
    return months === 1 ? 'одного месяца' : `${months} месяцев`;
  }

  /**
   * Ответ про структуру расходов без модели.
   *
   * Разрез уже сложен сервером — здесь только называние. Пустая книга расходов
   * это не «ноль», а «за период ничего не заведено», и предложение завести
   * обязано прозвучать: иначе разговор упирается в тупик. Непрочитанная книга —
   * третье состояние, и его нельзя произносить ни одним из первых двух.
   */
  private deterministicExpenseReply(evidence: unknown): string | null {
    const data = this.record(evidence);
    // 🔴 Cycle 04 P8. Непрочитанная книга расходов — не «расходов не было».
    // Пустой разрез при недоступном источнике раньше произносился вслух как
    // измеренный ноль, да ещё и с предложением завести первый расход.
    if (data.totals_basis === 'unavailable') {
      return 'Книгу расходов за этот период прочитать не удалось, поэтому разбора по статьям сейчас не будет. Это не значит, что расходов нет.';
    }
    const rows = Array.isArray(data.by_category)
      ? data.by_category.map((row) => this.record(row))
      : [];
    if (rows.length === 0) {
      return 'За этот период расходов не заведено ни одного. Назовите статью и сумму — запишу, и разбор по статьям появится.';
    }
    const named = rows
      .slice(0, 5)
      .map(
        (row) =>
          `${this.categoryLabel(row)} — ${this.formatMoneyAmount(row) ?? '—'}`,
      );
    const total = this.formatVerifiedMoneyEntries(data.totals);
    return `Расходы за период по статьям: ${named.join(', ')}.${
      total ? ` Всего ${total}.` : ''
    } Больше всего — «${this.categoryLabel(rows[0])}».`;
  }

  /** Человеческое имя статьи расходов из строки разреза. */
  private categoryLabel(row: Record<string, unknown>): string {
    if (typeof row.label === 'string' && row.label.trim()) {
      return row.label;
    }
    return typeof row.category === 'string' ? row.category : 'без статьи';
  }

  /**
   * Ответ про прибыль без модели: тем же текстом, что сказал бы человек.
   *
   * Здесь нет ни одного вычисления — все числа уже посчитаны сервером. Отказ
   * обязан называть недостающую статью словом из жизни салона и предлагать её
   * внести: «не хватает данных» без продолжения — это тупик, а не ответ.
   */
  private deterministicProfitReply(
    evidence: unknown,
    acquisitionFirst = false,
    grossProfitRequested = false,
  ): string | null {
    const data = this.record(evidence);
    const revenue = this.record(data.confirmed_revenue);
    const net = this.record(data.net_profit);
    const acquisition = this.record(data.client_acquisition_cost);
    const period = this.record(data.period);
    const expenses = this.record(data.expenses);
    const payroll = this.record(data.payroll);
    const completeness = this.record(data.completeness);
    const profitParts: string[] = [];
    const acquisitionParts: string[] = [];

    const truncated =
      period.truncated_to_today === true
        ? ' Месяц ещё не закончился, поэтому считаю по сегодняшний день.'
        : '';

    if (grossProfitRequested) {
      const revenueTotal = this.formatMoneyAmount(revenue.total);
      if (revenue.status === 'available' && revenueTotal) {
        return `Валовый доход до расходов: ${revenueTotal}. Это подтверждённая касса.${truncated} Аренда здесь не нужна: она относится к расчёту чистой прибыли. Точную валовую прибыль пока не называю, потому что CRM не выделяет прямую себестоимость услуг — выплаты мастерам и расходники — отдельным подтверждённым показателем.`;
      }
      return 'Аренда для валовой прибыли не нужна. Но CRM за этот период не отдала подтверждённую кассу и прямую себестоимость услуг, поэтому точную валовую прибыль я сейчас не назову.';
    }

    if (net.status === 'available') {
      const total = this.formatMoneyAmount(net.total);
      const revenueTotal = this.formatMoneyAmount(revenue.total);
      const margin =
        typeof net.margin_percent === 'number'
          ? ` Это ${this.formatMetricNumber(net.margin_percent)}% от поступлений.`
          : '';
      profitParts.push(
        `Чистая прибыль: ${total ?? '—'}. Поступления в кассу — ${revenueTotal ?? '—'}.${margin}${truncated}`,
      );
      const categories = Array.isArray(expenses.by_category)
        ? expenses.by_category
            .map((row) => this.record(row))
            .slice(0, 4)
            .map(
              (row) =>
                `${this.categoryLabel(row)}: ${this.formatMoneyAmount(row) ?? '—'}`,
            )
        : [];
      if (categories.length > 0) {
        profitParts.push(`Расходы: ${categories.join(', ')}.`);
      }
      if (completeness.unrecorded_additional_expenses_assumed_zero === true) {
        profitParts.push(
          'Не внесённые дополнительные расходы в этом расчёте приняты за 0 ₽. Если они есть, напишите, например: «Запиши расход на рекламу 30 000 ₽ за август» — после вашего подтверждения я добавлю расход и сразу пересчитаю прибыль.',
        );
      }
    } else {
      const revenueTotal = this.formatMoneyAmount(revenue.total);
      if (revenue.status === 'available' && revenueTotal) {
        profitParts.push(
          `Поступления до вычета расходов: ${revenueTotal}. Это подтверждённая касса, а не чистая прибыль.${truncated}`,
        );
      }
      const labels = (value: unknown): string[] =>
        Array.isArray(value)
          ? value
              .map((item) => this.record(item).label)
              .filter((label): label is string => typeof label === 'string')
          : [];
      const missing = labels(net.missing_categories);
      const understated = labels(net.understated_categories);
      // 🔴 Текст следует ПРИЧИНЕ из результата, а не собственному перебору
      // условий. Иначе порядок проверок здесь и в движке расходится, и MAYA
      // называет одну помеху, пока сервер считает главной другую.
      const reason =
        typeof net.unavailable_reason === 'string'
          ? net.unavailable_reason
          : '';
      if (reason.startsWith('expense_ledger_')) {
        // 🔴 Cycle 04 P8. Книгу расходов движок проверяет ПЕРВОЙ, и когда она
        // не прочитана, ни одна другая ветка лестницы не верна. Раньше здесь
        // не было ветки вовсе, и MAYA рассказывала про расчёт зарплаты CRM с
        // советом «спросите за месяц» — совет, после которого ответа не будет,
        // потому что мешало другое.
        profitParts.push(
          'Прибыль за период посчитать не могу: книгу расходов за него прочитать не удалось. Это сбой чтения, а не отсутствие расходов — повторите вопрос через минуту.',
        );
      } else if (reason.startsWith('salary_comes_only_from_the_crm_payroll')) {
        profitParts.push(
          'Прибыль за период посчитать не могу: зарплата берётся только из расчёта CRM, а за такой период CRM его не отдаёт — расчёт доступен максимум за месяц. Спросите за месяц, и я посчитаю. Вносить зарплату руками не нужно и нельзя: она задвоится.',
        );
      } else if (revenue.status !== 'available') {
        // Сначала называем настоящий серверный блокер. Пока кассы нет, вопрос
        // про дополнительные расходы всё равно не приблизит владельца к ответу.
        const revenueReason =
          typeof revenue.unavailable_reason === 'string'
            ? revenue.unavailable_reason
            : '';
        profitParts.push(
          revenueReason.startsWith('crm_finance_did_not_answer')
            ? 'Прибыль считается от подтверждённой кассы, а CRM за этот период её не отдала. Это сбой связи, а не отсутствие денег — повторите вопрос через минуту.'
            : revenueReason.startsWith('crm_returned_cash_revenue_without')
              ? 'Прибыль считается от подтверждённой кассы, а CRM вернула суммы без подтверждения. Показывать их как прибыль я не буду.'
              : revenueReason.startsWith('crm_confirms_cash_for_the_whole')
                ? 'Прибыль по отдельному филиалу не считается: касса подтверждается по компании целиком. Спросите по всему салону.'
                : 'Прибыль считается от подтверждённой кассы, а её за этот период нет: внутренний календарь хранит цены записей, а не пробитые деньги. Стоимость записанного я показать могу, но называть её прибылью не буду.',
        );
      } else if (completeness.owner_confirmation_required === true) {
        profitParts.push(
          'Есть ли за этот период дополнительные расходы кроме зарплаты из CRM? Если расходов нет, так и напишите — я сразу посчитаю чистую прибыль. Если есть, назовите статью и сумму, и я подготовлю запись на подтверждение.',
        );
      } else if (reason.startsWith('required_expense_categories_are_missing')) {
        profitParts.push(
          `Прибыль за период посчитать не могу: за него не внесена ${
            missing.join(' и ') || 'часть обязательных статей расходов'
          }. Внесите — и я посчитаю. Хотите, запишу прямо сейчас: назовите сумму.`,
        );
      } else if (
        reason.startsWith('recorded_expense_categories_are_implausibly_small')
      ) {
        profitParts.push(
          `Прибыль за период посчитать не могу: похоже, внесено не всё — сумма по статье «${understated.join(
            '», «',
          )}» слишком мала на фоне кассы за этот же период. Проверьте и добавьте недостающее, тогда посчитаю.`,
        );
      } else if (reason.startsWith('crm_confirms_cash_for_the_whole_company')) {
        profitParts.push(
          'Прибыль по отдельному филиалу не считается: касса подтверждается по компании целиком, разложить её по филиалам нечем. Спросите по всему салону.',
        );
      } else if (
        reason.startsWith('expenses_and_confirmed_cash_are_recorded_in_diff')
      ) {
        profitParts.push(
          'Прибыль за период посчитать не могу: расходы и касса записаны в разных валютах, а курса у меня нет. Приведите их к одной валюте, тогда посчитаю.',
        );
      } else if (payroll.status !== 'available') {
        profitParts.push(
          'Прибыль за период посчитать не могу: зарплата берётся только из расчёта CRM, а за такой период CRM его не отдаёт — расчёт доступен максимум за месяц. Спросите за месяц, и я посчитаю.',
        );
      } else {
        profitParts.push(
          'Прибыль за период посчитать не могу: расходы за него неполные. Скажите, каких статей не хватает, и я их запишу.',
        );
      }
    }

    if (acquisition.status === 'available') {
      const cost = this.formatMoneyAmount(acquisition.cost_per_new_client);
      const lookback =
        typeof acquisition.cohort_lookback_days === 'number'
          ? acquisition.cohort_lookback_days
          : null;
      acquisitionParts.push(
        `Новый гость обходился в ${cost ?? '—'}${
          lookback === null
            ? ''
            : ` — это те, кого не было у нас последние ${lookback} дней`
        }. Столько мы тратили на рекламу в расчёте на одного нового гостя, а не доказательство, что его привела реклама.`,
      );
    } else if (
      acquisition.unavailable_reason ===
      'no_advertising_expenses_are_recorded_for_this_period'
    ) {
      acquisitionParts.push(
        'Стоимость нового клиента посчитать не из чего: расходов на рекламу за период не внесено. Запишу их — назовите сумму, и число появится.',
      );
    }

    const ordered = acquisitionFirst
      ? [...acquisitionParts, ...profitParts]
      : [...profitParts, ...acquisitionParts];
    return ordered.length > 0 ? ordered.join(' ') : null;
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
    personal: boolean,
    evidence: unknown,
    userText: string,
  ): string | null {
    const data = this.record(evidence);
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
    if (isComprehensiveBusinessReview(userText)) {
      return this.deterministicComprehensiveAnalyticsReview(personal, data);
    }
    if (DAILY_ANALYTICS_BREAKDOWN_QUESTION_PATTERN.test(text)) {
      const daily = Array.isArray(current.daily)
        ? current.daily.map((entry) => this.record(entry)).slice(-31)
        : [];
      if (daily.length === 0) {
        return 'Дневной разрез за выбранный период пока недоступен. Общую сумму за период я не буду выдавать за разбивку по дням.';
      }
      const lines = daily.map((row) => {
        const rawDate = typeof row.date === 'string' ? row.date : '';
        const parts = rawDate.split('-');
        const date =
          parts.length === 3 ? `${parts[2]}.${parts[1]}` : rawDate || 'День';
        /**
         * 🔴 Cycle 04 P5. Неизмеренное называется словом.
         *
         * Здесь стояла цепочка `?? 0` — тот же приём, который P4 вычистил из
         * сводок владельца: день без числа выглядел как день с нулём.
         */
        const count = (value: unknown) => {
          const parsed = this.optionalMetricNumber(value);
          return parsed === null
            ? 'не измерено'
            : this.formatMetricNumber(parsed);
        };
        const total =
          this.optionalMetricNumber(row.total) ??
          this.optionalMetricNumber(row.appointments);
        // Пустой массив у канона означает «показывать нельзя», а не «ноль».
        const bookedValue = this.formatMoneyEntries(
          Array.isArray(row.revenue) ? row.revenue : [],
        );
        return `${date}: всего ${total === null ? 'не измерено' : this.formatMetricNumber(total)}, завершено ${count(row.completed)}, ожидают ${count(row.scheduled)}, отменено ${count(row.cancelled)}${bookedValue ? `; стоимость неотменённых записей ${bookedValue}` : ''}`;
      });
      return `Сводка по дням за выбранный период:\n${lines.join('\n')}`;
    }
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
    /**
     * Величина здесь ВСЕГДА есть: аргумент — конечное число, и пустым массив
     * быть не может. Запасной путь существует только чтобы не молчать, если
     * валюта окажется неразборчивой.
     */
    const money = (value: number): string =>
      this.formatMoneyEntries([
        {
          currency: this.analyticsCurrency(current),
          amount_kopecks: value,
        },
      ]) ?? this.formatMetricNumber(value / 100);
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

    // 🔴 Валовая прибыль и маржа — отдельные отказы, а не разновидность
    // «чистой». Оба переехали сюда из обзорных `analytics.*.read`: без них
    // вопрос про валовую прибыль получал ответ про бухгалтерскую чистую, то
    // есть про другой показатель.
    if (/валов[а-яa-z]*\s+прибыл[а-яa-z]*/i.test(text)) {
      const revenueAmount = metric('revenue_amount_kopecks');
      const confirmedRevenue =
        revenueAmount === null
          ? ''
          : `Поступления до вычета расходов: ${money(revenueAmount)}. `;
      return `${confirmedRevenue}Валовая прибыль сейчас не рассчитывается: прямые затраты на оказание услуг в CRM не выделены отдельно. Я не подменю прибыль выручкой.`;
    }
    if (/(?<![а-яё])марж[аеиуы][а-яa-z]*/i.test(text)) {
      return 'Маржа сейчас не рассчитывается отдельным подтверждённым показателем. Нужна классификация прямых затрат, поэтому я не буду выводить её из выручки приблизительно.';
    }
    if (
      /(чист[а-яa-z]*|бухгалтер[а-яa-z]*)\s+прибыл|прибыл[а-яa-z]*/i.test(text)
    ) {
      // 🔴 Не подсовываем поступления как «ближайший показатель»: владелец
      // слышит это как ответ на вопрос про прибыль. Лучше честный отказ.
      return 'Чистую прибыль из этого среза не подтверждаю — здесь операционные показатели, а не расчёт касса минус расходы. Не подменю прибыль поступлениями. Спроси отдельно «какая прибыль» — возьму именно её.';
    }
    if (!personal && STAFF_CONTRIBUTION_QUESTION_PATTERN.test(text)) {
      const staff = this.analyticsStaffRows(current);
      const period = this.analyticsPeriodHint(data) ?? 'за выбранный период';
      const exactRevenue = staff
        .map((row) => {
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          const confirmed = this.record(row.confirmed_revenue);
          const amount = this.formatMoneyAmount(confirmed.amount);
          return name && confirmed.status === 'available' && amount
            ? `${name} — ${amount}`
            : null;
        })
        .filter((row): row is string => row !== null);
      if (exactRevenue.length > 0) {
        const financeRevenue = this.record(
          this.record(current.finance).revenue,
        );
        const attributionStatus = financeRevenue.staff_attribution_status;
        const coverage = this.optionalMetricNumber(
          financeRevenue.staff_attribution_coverage_percent,
        );
        const coverageNote =
          attributionStatus === 'partial'
            ? ` YClients точно связал с мастерами ${this.formatMetricNumber(coverage ?? 0)}% кассы услуг; нераспределённый остаток я не делю приблизительно.`
            : '';
        return `Подтверждённая касса по мастерам ${period}: ${exactRevenue.join('; ')}.${coverageNote} Это финансовые операции YClients, связанные с мастерами, а не стоимость записанных услуг.`;
      }
      const workload = staff
        .slice(0, 6)
        .map((row) => {
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          const appointments = this.optionalMetricNumber(row.appointments);
          return name && appointments !== null
            ? `${name} — ${this.formatMetricNumber(appointments)} ${this.pluralize(appointments, 'запись', 'записи', 'записей')}`
            : null;
        })
        .filter((row): row is string => row !== null);
      return [
        `Подтверждённую кассовую выручку по каждому мастеру ${period} YClients не распределяет: касса подтверждается только по салону целиком. Поэтому честно назвать, кто сколько принёс, нельзя.`,
        workload.length > 0
          ? `Ближайший проверенный срез — загрузка: ${workload.join('; ')}.`
          : null,
        'Могу отдельно показать начисленную зарплату каждому мастеру — это другой показатель.',
      ]
        .filter((part): part is string => part !== null)
        .join(' ');
    }
    if (!personal && STAFF_PAYROLL_BREAKDOWN_QUESTION_PATTERN.test(text)) {
      const staff = this.analyticsStaffRows(current);
      const available = staff
        .map((row) => {
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          const salary = this.record(row.salary);
          const accrued = this.formatMoneyAmount(salary.accrued);
          return name && salary.status === 'available' && accrued
            ? `${name} — ${accrued}`
            : null;
        })
        .filter((row): row is string => row !== null);
      if (available.length > 0) {
        const period = this.analyticsPeriodHint(data) ?? 'за выбранный период';
        return `Если под «заработал» имеется в виду начисление мастеру, то ${period}: ${available.join('; ')}. Это начисленная зарплата по расчёту YClients, не выручка, которую мастер принёс салону.`;
      }
      return 'Поимённые начисления мастерам за выбранный период YClients сейчас не подтвердил. Я не подменю их выручкой салона или стоимостью записей.';
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
    if (/(не\s+пришел|неявк)/i.test(text)) {
      /**
       * 🔴 Cycle 04 P5. «Неявка» — это НАБЛЮДЕНИЕ, а не статус записи.
       *
       * Здесь отвечал `appointments_no_show` — статусная корзина провайдера.
       * Канон публикует рядом `attendance_no_show`: он приходит из зеркала
       * главы 3 и становится `null`, пока присутствие за период не сверено.
       * На вопрос «сколько не пришло» отвечает только он; статус записи
       * остаётся статусом и называется своим именем.
       */
      const observedNoShow = metric('attendance_no_show');
      if (observedNoShow !== null) {
        return withRecommendation(
          `Не пришли: ${this.formatMetricNumber(observedNoShow)}.${metricChange('attendance_no_show')}`,
        );
      }
      const statusNoShow = metric('appointments_no_show');
      if (statusNoShow !== null) {
        return withRecommendation(
          `Присутствие за период не сверено, поэтому число неявок назвать не могу. Записей со статусом «не пришёл» у провайдера: ${this.formatMetricNumber(statusNoShow)} — это состояние записи, а не наблюдение за визитом.`,
        );
      }
    }
    if (/отмен/i.test(text)) {
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
      const scheduled = metric('appointments_scheduled');
      const completed = metric('appointments_completed');
      const cancelled = metric('appointments_cancelled');
      const noShow = metric('appointments_no_show');
      if (total !== null) {
        return withRecommendation(
          `Всего записей: ${this.formatMetricNumber(total)}${completed === null ? '' : `, завершённых ${this.formatMetricNumber(completed)}`}${scheduled === null ? '' : `, ожидают визита ${this.formatMetricNumber(scheduled)}`}${cancelled === null ? '' : `, отменённых ${this.formatMetricNumber(cancelled)}`}${noShow === null ? '' : `, со статусом «не пришёл» ${this.formatMetricNumber(noShow)}`}${completed === null && scheduled === null && active !== null ? `, неотменённых ${this.formatMetricNumber(active)}` : ''}.${metricChange('appointments_total')}`,
        );
      }
    }

    // 🔴 Деньги в общей сводке идут СО СРАВНЕНИЕМ, как и счётчики.
    // Пока сравнение года с годом жило в отдельном инструменте, его шаблон
    // называл прошлогоднюю сумму сам. Инструмент убран, и без этой строки
    // ответ на «сравни этот год с прошлым» терял ровно то число, ради
    // которого вопрос и задавали.
    const moneyKey = personal
      ? 'booked_value_amount_kopecks'
      : 'revenue_amount_kopecks';
    const moneyValue = metric(moneyKey);
    const moneyPrevious = this.optionalMetricNumber(
      this.record(changes[moneyKey]).previous,
    );
    const summary = [
      moneyValue === null
        ? null
        : `${personal ? 'стоимость записанных услуг' : 'поступления'} ${money(moneyValue)}${comparisonLabel && moneyPrevious !== null ? ` против ${money(moneyPrevious)}` : ''}`,
      (() => {
        const value = metric('appointments_total');
        const previous = this.optionalMetricNumber(
          this.record(changes.appointments_total).previous,
        );
        return value === null
          ? null
          : `${this.formatMetricNumber(value)} записей${comparisonLabel && previous !== null ? ` против ${this.formatMetricNumber(previous)}` : ''}`;
      })(),
      (() => {
        const value = metric('unique_clients');
        const previous = this.optionalMetricNumber(
          this.record(changes.unique_clients).previous,
        );
        return value === null
          ? null
          : `${this.formatMetricNumber(value)} уникальных клиентов${comparisonLabel && previous !== null ? ` против ${this.formatMetricNumber(previous)}` : ''}`;
      })(),
    ].filter((part): part is string => Boolean(part));
    const recommendation =
      requestedRecommendation ?? this.analyticsRecommendation(data, personal);
    const insight = [requestedDiagnosis, recommendation]
      .filter((part): part is string => Boolean(part))
      .join(' ');
    if (summary.length === 0) {
      return null;
    }
    // 🔴 Раньше отдавали табло «Поступления: … Записи: …» — владелец читал
    // это как мёртвый отчёт. Даже запасной путь должен звучать живо.
    const periodHint = this.analyticsPeriodHint(data);
    const lead = periodHint
      ? `Смотри, кратко ${periodHint}: `
      : 'Смотри, кратко по салону: ';
    const changeBits = [
      moneyValue === null ? null : metricChange(moneyKey, money).trim(),
      metricChange('appointments_total').trim(),
      metricChange('unique_clients').trim(),
    ].filter((part): part is string => Boolean(part));
    const body = summary.join(', ');
    const changesSentence = changeBits.length ? ` ${changeBits.join(' ')}` : '';
    return `${lead}${body}.${changesSentence}${insight ? ` ${insight}` : ' Если нужно — разберём, что за этим стоит.'}`;
  }

  private deterministicComprehensiveAnalyticsReview(
    personal: boolean,
    data: Record<string, unknown>,
  ): string | null {
    const metrics = this.record(data.metrics);
    const changes = this.record(data.changes);
    const current = this.record(data.current);
    const metric = (key: string) => this.optionalMetricNumber(metrics[key]);
    /**
     * Величина здесь ВСЕГДА есть: аргумент — конечное число, и пустым массив
     * быть не может. Запасной путь существует только чтобы не молчать, если
     * валюта окажется неразборчивой.
     */
    const money = (value: number): string =>
      this.formatMoneyEntries([
        {
          currency: this.analyticsCurrency(current),
          amount_kopecks: value,
        },
      ]) ?? this.formatMetricNumber(value / 100);
    const facts: string[] = [];
    const moneyKey = personal
      ? 'booked_value_amount_kopecks'
      : 'revenue_amount_kopecks';
    const averageKey = personal
      ? 'average_booked_value_amount_kopecks'
      : 'average_ticket_amount_kopecks';
    const moneyValue = metric(moneyKey);
    const appointments = metric('appointments_total');
    const uniqueClients = metric('unique_clients');
    const average = metric(averageKey);
    const repeats = metric('repeat_clients_in_period');
    const repeatRate = metric('repeat_client_rate_percent');
    const cancellations = metric('appointments_cancelled');
    const cancellationRate = metric('cancellation_rate_percent');

    if (moneyValue !== null) {
      facts.push(
        `${personal ? 'стоимость записанных услуг' : 'поступления'} ${money(moneyValue)}`,
      );
    }
    if (appointments !== null) {
      facts.push(`${this.formatMetricNumber(appointments)} записей`);
    }
    if (uniqueClients !== null) {
      facts.push(
        `${this.formatMetricNumber(uniqueClients)} уникальных клиентов`,
      );
    }
    if (average !== null) {
      facts.push(
        `${personal ? 'средняя стоимость записи' : 'средний чек'} ${money(average)}`,
      );
    }
    if (repeats !== null) {
      facts.push(
        `${this.formatMetricNumber(repeats)} повторных клиентов${repeatRate === null ? '' : ` (${this.formatMetricNumber(repeatRate)}%)`}`,
      );
    }
    if (cancellations !== null) {
      facts.push(
        `${this.formatMetricNumber(cancellations)} отмен${cancellationRate === null ? '' : ` (${this.formatMetricNumber(cancellationRate)}%)`}`,
      );
    }
    if (facts.length === 0) {
      return null;
    }

    const comparisonLabel =
      this.record(data.comparison).mode === 'previous_year_same_period'
        ? 'к аналогичному периоду прошлого года'
        : 'к предыдущему равному периоду';
    const dynamics = [
      { key: moneyKey, label: personal ? 'стоимость записей' : 'поступления' },
      { key: 'appointments_total', label: 'записи' },
      { key: 'unique_clients', label: 'клиенты' },
      { key: averageKey, label: personal ? 'стоимость записи' : 'средний чек' },
      { key: 'booked_minutes', label: 'загрузка' },
    ]
      .map(({ key, label }) => ({
        label,
        percent: this.optionalMetricNumber(
          this.record(changes[key]).percent_change,
        ),
      }))
      .filter(
        (entry): entry is { label: string; percent: number } =>
          entry.percent !== null,
      )
      .sort((left, right) => left.percent - right.percent)
      .slice(0, 5)
      .map(
        (entry) =>
          `${entry.label} ${this.formatSignedPercent(entry.percent) ?? 'без изменения'}`,
      );

    const serviceChanges = Array.isArray(data.service_changes)
      ? data.service_changes.map((entry) => this.record(entry))
      : [];
    const weakestService = serviceChanges
      .filter(
        (entry) =>
          typeof entry.name === 'string' &&
          this.optionalMetricNumber(entry.percent_change) !== null &&
          Number(entry.percent_change) < 0,
      )
      .sort(
        (left, right) =>
          Number(left.percent_change) - Number(right.percent_change),
      )[0];
    const diagnosis = this.analyticsDiagnosis(data, personal);
    const serviceDiagnosis = weakestService
      ? `По услугам сильнее всего просела «${String(weakestService.name)}»: ${this.formatSignedPercent(weakestService.percent_change)}.`
      : null;
    const recommendation =
      this.analyticsRecommendation(data, personal) ??
      'Первое действие: отдельно проверить загрузку по дням и мастерам, затем работать с самым слабым подтверждённым участком.';
    const period = this.analyticsPeriodHint(data) ?? 'за выбранный период';

    return [
      `Полный срез ${period}: ${facts.join('; ')}.`,
      dynamics.length > 0
        ? `Динамика ${comparisonLabel}: ${dynamics.join('; ')}.`
        : 'Сравнение с предыдущим периодом сейчас недоступно, поэтому подтверждённую динамику не выдумываю.',
      `Слабые места: ${[diagnosis, serviceDiagnosis].filter(Boolean).join(' ') || 'подтверждённого снижения в доступных показателях нет.'}`,
      recommendation,
    ].join('\n\n');
  }

  private analyticsPeriodHint(data: Record<string, unknown>): string | null {
    const resolved = this.record(data.resolved_period);
    if (typeof resolved.label_ru === 'string' && resolved.label_ru.trim()) {
      return `за ${resolved.label_ru.trim()}`;
    }
    const periodTop = this.record(data.period);
    if (typeof periodTop.label_ru === 'string' && periodTop.label_ru.trim()) {
      return `за ${periodTop.label_ru.trim()}`;
    }
    const current = this.record(data.current);
    const period = this.record(current.period);
    const label = typeof period.label === 'string' ? period.label.trim() : '';
    if (label) {
      return `за ${label}`;
    }
    const mode = typeof period.mode === 'string' ? period.mode : '';
    if (mode === 'today') return 'за сегодня';
    if (mode === 'week' || mode === 'this_week') return 'за эту неделю';
    if (mode === 'month' || mode === 'this_month') return 'за этот месяц';
    return null;
  }

  private analyticsStaffRows(
    current: Record<string, unknown>,
  ): Record<string, unknown>[] {
    return Array.isArray(current.staff_summary)
      ? current.staff_summary.map((row) => this.record(row))
      : [];
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

  /**
   * Денежные величины в текст. `null` — когда величины НЕТ.
   *
   * 🔴 Cycle 04 P5. Здесь стояло `return '0 ₽'` для пустого массива — а пустой
   * массив у канонического слоя означает ровно противоположное: «денег
   * показывать нельзя» (fail-closed по роли или недоступный источник). Текст
   * превращал отказ в измеренный ноль, и владелец читал «0 ₽» там, где
   * система молчала. Вызывающие обязаны решить, что сказать вместо числа.
   */
  private formatMoneyEntries(value: unknown): string | null {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
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
    return formatted.length > 0 ? formatted.join(', ') : null;
  }

  /** То же самое; имя сохранено ради вызывающих, ждавших `null`. */
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
   * Явное подтверждение нулевых дополнительных расходов.
   *
   * Одно слово «нет» считается подтверждением только после вопроса MAYA про
   * расходы. Разговор только об отсутствии аренды сюда намеренно не попадает:
   * своё помещение ничего не говорит о рекламе, расходниках и коммуналке.
   */
  private explicitNoAdditionalExpenses(messages: AiCoreMessage[]): boolean {
    const latest = this.latestUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[!?.,:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const explicit =
      /^(?:у\s+меня\s+)?(?:никаких\s+)?(?:доп(?:олнительн[а-яa-z]*)?|других|прочих)\s+расход[а-яa-z]*(?:\s+у\s+меня)?\s+нет$/i.test(
        latest,
      ) ||
      /^(?:у\s+меня\s+)?нет\s+(?:никаких\s+)?(?:доп(?:олнительн[а-яa-z]*)?|других|прочих)\s+расход[а-яa-z]*$/i.test(
        latest,
      ) ||
      /^(?:кроме|помимо)\s+зарплат[а-яa-z]*\s+(?:никаких\s+)?расход[а-яa-z]*\s+нет$/i.test(
        latest,
      ) ||
      /^(?:больше\s+)?(?:никаких\s+)?расход[а-яa-z]*\s+(?:больше\s+)?нет$/i.test(
        latest,
      ) ||
      /^(?:это\s+)?все\s+расход[а-яa-z]*\s+(?:внесены|указаны|учтены)$/i.test(
        latest,
      ) ||
      /^все\s+(?:внесено|указано|учтено)$/i.test(latest) ||
      (/^(?:это\s+)?все$/i.test(latest) &&
        /доп(?:олнительн[а-яa-z]*)?\s+расход|расход[а-яa-z]*\s+(?:кроме|помимо)\s+зарплат/i.test(
          this.previousAssistantText(messages).toLowerCase().replace(/ё/g, 'е'),
        ));
    if (explicit) {
      return true;
    }
    if (!/^(?:нет|больше\s+нет)$/i.test(latest)) {
      return false;
    }
    return /(?:доп(?:олнительн)?|друг)[а-яa-z]*\s+расход|расход[а-яa-z]*\s+(?:кроме|помимо)\s+зарплат/i.test(
      this.previousAssistantText(messages).toLowerCase().replace(/ё/g, 'е'),
    );
  }

  private explicitNoRentOnly(messages: AiCoreMessage[]): boolean {
    const latest = this.latestUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е');
    // 🔴 Это ОТВЕТ про аренду, а не вопрос. Раньше подстрока проверялась без
    // оглядки на остальную реплику, и «Помещение своё, покажи прибыль за июль»
    // уходило в ветку «аренда 0 ₽»: вопрос про прибыль терялся целиком,
    // инструмент не вызывался вовсе.
    //
    // Якоря ^…$ здесь не годятся — живой ответ бывает составным:
    // «У меня своё помещение, я не плачу аренду». Поэтому отсекаем иначе: если
    // в реплике есть вопрос или требование отчёта, это уже не констатация.
    const carriesQuestion =
      /[?]|(?:^|\s)(?:покажи|посчитай|подсчитай|выведи|сравни|дай)\s|(?:^|\s)(?:сколько|какая|какой|каков|какие)\s/i.test(
        latest,
      );
    return (
      !carriesQuestion &&
      /(?:аренд[а-яa-z]*\s+(?:нет|не\s+плачу)|не\s+плачу\s+(?:за\s+)?аренд|помещени[ея]\s+(?:свое|собственн))/i.test(
        latest,
      ) &&
      !/(?:дополнительн|друг)[а-яa-z]*\s+расход[а-яa-z]*\s+нет/i.test(latest)
    );
  }

  private previousAssistantText(messages: AiCoreMessage[]): string {
    let latestUserFound = false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message?.content.trim()) continue;
      if (message.role === 'user' && !latestUserFound) {
        latestUserFound = true;
        continue;
      }
      if (latestUserFound && message.role === 'assistant') {
        return message.content.trim();
      }
    }
    return '';
  }

  /** Последний явно названный период сохраняется через уточняющие ходы. */
  private previousReportingUserText(messages: AiCoreMessage[]): string {
    let latestUserFound = false;
    let immediatePrevious = '';
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== 'user' || !message.content.trim()) continue;
      if (!latestUserFound) {
        latestUserFound = true;
        continue;
      }
      immediatePrevious ||= message.content.trim();
      if (ReportingPeriodResolver.resolve(message.content).explicit) {
        return message.content.trim();
      }
    }
    return immediatePrevious;
  }

  private requiresServerComposedReply(
    toolName: string,
    userText: string,
  ): boolean {
    if (SERVER_COMPOSED_REPLY_TOOLS.has(toolName)) {
      return true;
    }
    if (
      (toolName === 'analytics.business.query' ||
        toolName === 'analytics.employee.query') &&
      (APPOINTMENT_COUNT_QUESTION_PATTERN.test(userText) ||
        DAILY_ANALYTICS_BREAKDOWN_QUESTION_PATTERN.test(userText))
    ) {
      return true;
    }
    return (
      toolName === 'analytics.business.query' &&
      (STAFF_CONTRIBUTION_QUESTION_PATTERN.test(userText) ||
        STAFF_PAYROLL_BREAKDOWN_QUESTION_PATTERN.test(userText))
    );
  }

  private contextualUserText(messages: AiCoreMessage[]): string {
    const latest = this.latestUserText(messages);
    const previous = this.previousUserText(messages);
    if (!previous) {
      return latest;
    }
    const normalizedLatest = latest.toLowerCase().replace(/ё/g, 'е');
    const normalizedPrevious = previous.toLowerCase().replace(/ё/g, 'е');
    const retentionFollowUp =
      CLIENT_RETENTION_HINT_PATTERN.test(normalizedPrevious) &&
      (CLIENT_RETENTION_HINT_PATTERN.test(normalizedLatest) ||
        (BUSINESS_ACTION_REQUEST_PATTERN.test(normalizedLatest) &&
          /(?:их|этих|клиент|гост|вернут|возврат)/i.test(normalizedLatest)));
    if (!isBusinessReviewFollowUp(latest) && !retentionFollowUp) {
      return latest;
    }
    return `${previous}\n${latest}`;
  }

  private async memoryFactsForModel(
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    if (!this.memory) {
      return [];
    }
    try {
      const facts = await this.memory.listForModel(tenantId, userId);
      return facts.map((fact) => {
        const sensitive = this.redactSensitiveText(fact);
        return this.redactLikelyProperNames(sensitive.content).content;
      });
    } catch {
      // Memory continuity must never make the main chat unavailable.
      return [];
    }
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

  /**
   * Служебные имена схемы в живом ответе — та же класс ошибок, что «поле
   * revenue пустое» у владельца. Ловим до выдачи и просим переписать.
   */
  private schemaLeakTokens(reply: string): string[] {
    const patterns: Array<[RegExp, string]> = [
      [/\bbooked_value\b/i, 'booked_value'],
      [/\bstaff_summary\b/i, 'staff_summary'],
      [/\bstaff_changes\b/i, 'staff_changes'],
      [/\bwarning_codes?\b/i, 'warning_codes'],
      [/\bamount_kopecks\b/i, 'amount_kopecks'],
      [/\brevenue_amount_kopecks\b/i, 'revenue_amount_kopecks'],
      [/\btool_results?\b/i, 'tool_results'],
      [/\bunavailable_metrics\b/i, 'unavailable_metrics'],
      [/\bavailable_metrics\b/i, 'available_metrics'],
      [/\bresolved_period\b/i, 'resolved_period'],
      [/\banalytics\.(business|employee)\b/i, 'analytics.*'],
      [/\bcatalog\.services\.read\b/i, 'catalog.services.read'],
      [/\bnet_profit\.status\b/i, 'net_profit.status'],
      [/\binput_schema\b/i, 'input_schema'],
    ];
    const found: string[] = [];
    for (const [pattern, label] of patterns) {
      if (pattern.test(reply)) found.push(label);
    }
    return [...new Set(found)].slice(0, 6);
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

  /**
   * Все вхождения чисел с позициями — без склейки одинаковых значений.
   *
   * Крупные числа берём по строгому шаблону, мелкие — только рядом с единицей
   * измерения: «17 записей» это показатель, а «17» в дате — нет.
   */
  private numberOccurrences(
    text: string,
  ): Array<{ value: string; index: number }> {
    const seen = new Set<string>();
    const found: Array<{ value: string; index: number }> = [];
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
      found.push({ value: normalized, index });
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
    // 🔴 Длинный разговор ОБРЕЗАЕМ, а не отвергаем.
    //
    // Здесь стоял отказ 400, и он положил чат в проде: фронт присылает до 12
    // сообщений по 2000 знаков, по-русски это до 48 КБ при пороге в 16 —
    // а сработало только теперь, потому что ответы MAYA стали длиннее. Владелец
    // видел молчание: запрос не доходил даже до обработчика, поэтому в логах
    // было пусто, а в аудите ни строки.
    //
    // Отвергать разговор за то, что он получился содержательным, нельзя.
    // Убираем самые старые реплики, пока не влезет; последнюю — вопрос, на
    // который отвечаем, — не трогаем никогда.
    const fits = (items: AiCoreMessage[]) =>
      Buffer.byteLength(JSON.stringify(items), 'utf8') <= MAX_CHAT_INPUT_BYTES;
    const trimmed = [...sanitized];
    while (trimmed.length > 1 && !fits(trimmed)) {
      trimmed.shift();
    }
    if (!fits(trimmed)) {
      // Не влезает даже одно сообщение — вот это уже действительно ошибка ввода.
      throw new BadRequestException({
        message: 'AI chat input is too large.',
        error: { code: 'ai_chat_input_too_large' },
      });
    }
    return { messages: trimmed, redacted };
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
    const value = raw ? Number(raw) : 3;
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
      .slice(0, 3_500);
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

  private isClientAudience(
    user: AuthenticatedUser,
    audience?: 'client' | 'staff' | 'owner' | null,
  ): boolean {
    if (audience === 'client') {
      return true;
    }
    if (audience === 'staff' || audience === 'owner') {
      return false;
    }
    return user.role === UserRole.CLIENT || user.role === UserRole.CUSTOMER;
  }

  /**
   * Контракт поверхности «мастер»: audience=staff обязывает сервер выдать
   * СТРОГО мастерский набор прав, кем бы человек ни был по членству.
   *
   * 🔴 Главный источник расхождений с документацией: приложение честно шлёт
   * audience из трёх режимов входа (владелец/мастер/клиент), но сервер
   * понимал только client. Владелец, открывший режим мастера, получал
   * владельческие инструменты — «Моя статистика» отвечала кассой всего
   * салона, а не личными показателями, и поверхность мастера вела себя как
   * кабинет директора. Клиентские роли повысить нельзя: для них audience
   * игнорируется, это защита, а не удобство.
   */
  private effectiveToolUser(
    user: AuthenticatedUser,
    audience?: 'client' | 'staff' | 'owner' | null,
  ): AuthenticatedUser {
    if (
      audience !== 'staff' ||
      user.role === UserRole.CLIENT ||
      user.role === UserRole.CUSTOMER ||
      STAFF_SURFACE_ROLES.has(user.role)
    ) {
      return user;
    }
    return { ...user, role: UserRole.STAFF };
  }

  private isBusinessOnlyTool(toolName: string): boolean {
    return (
      toolName.startsWith('analytics.') ||
      toolName.startsWith('expenses.') ||
      toolName === 'customers.count' ||
      toolName === 'clients.retention.scan' ||
      toolName === 'clients.dossier.read' ||
      toolName === 'staff.schedule.read' ||
      toolName === 'operations.journal.read' ||
      toolName === 'staff.schedule.update' ||
      toolName === 'loyalty.internal.adjust'
    );
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
