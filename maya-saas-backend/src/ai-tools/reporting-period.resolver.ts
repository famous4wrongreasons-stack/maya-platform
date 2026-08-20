import { isComprehensiveBusinessReview } from '../ai-brain/business-review-intent';
// 🔴 Единственная реализация «какой сегодня день у арендатора» в проекте.
// Заводить вторую здесь значило бы начать ровно с того, что глава закрывала.
import { localCalendarDate } from '../owner-reports/owner-reports.time';

/**
 * Единый разбор отчётного окна из живой речи владельца.
 *
 * 🔴 Это единственный источник периода для preload и для любого tool-call
 * модели. Если модель попросит «август», а человек сказал «7 августа» —
 * побеждает человек. Подмена дня месяцем давала два «правдивых» ответа
 * (41.5к vs 244к) и выглядела как галлюцинация.
 */

export type ReportingPeriodToolArgs = {
  period: string;
  day?: string;
  month?: string;
  from_day?: string;
  to_day?: string;
};

export type PeriodComparison =
  'none' | 'previous_period' | 'previous_year_same_period';

export type PeriodResolution = {
  args: ReportingPeriodToolArgs;
  /** Человеческая подпись окна: «7 августа 2026», «август 2026 по сегодня». */
  label_ru: string;
  /**
   * true — человек явно назвал окно (день, месяц, диапазон, «вчера»…).
   * false — серверный дефолт month_to_date.
   */
  explicit: boolean;
  source: 'current' | 'previous' | 'default';
};

const MONTH_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

const MONTH_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

const YEAR_COMPARISON_PATTERN =
  /(?:(?<![а-яёa-z])год[а-яёa-z]*.{0,96}(?:сравн|прошл|предыдущ)|(?:сравн|прошл|предыдущ).{0,96}(?<![а-яёa-z])год[а-яёa-z]*|(?<![а-яёa-z])год\s+к\s+году)/i;

const BUSINESS_ACTION_REQUEST_PATTERN =
  /(что\s+(?:с\s+этим\s+)?делать|как\s+(?:это\s+)?исправить|как\s+(?:это\s+)?улучшить|объясни.{0,32}что\s+делать|дай\s+(?:план|рекомендац)|какие\s+действия|что\s+предпринять|посоветуй|подскажи|совет[а-яёa-z]*|как\s+(?:мне\s+)?(?:вернуть|поднять|увеличить|нарастить|удержать)|что\s+можно\s+сделать)/i;

const BUSINESS_EXPLANATION_REQUEST_PATTERN =
  /(почему|причин[а-яёa-z]*|за\s+сч[её]т\s+чего|что\s+повлиял[оа]?|разбер[а-яёa-z]*|проанализир[а-яёa-z]*|анализ[а-яёa-z]*|объясни)/i;

const REPORTING_TOOLS = new Set([
  'analytics.business.query',
  'analytics.employee.query',
  'analytics.business.profit',
  'analytics.revenue.forecast',
  'analytics.team-kpi.read',
  'clients.no-show-risk.read',
  'expenses.read',
  'expenses.period.complete',
  // Оба инструмента принимают период и раньше выпадали из списка: сервер не
  // перебивал им окно, и период целиком оставался на совести модели.
  'analytics.branches.compare',
  'reports.recovered',
]);

const COMPARISON_TOOLS = new Set([
  'analytics.business.query',
  'analytics.employee.query',
]);

/**
 * Календарное «сегодня» БИЗНЕСА.
 *
 * 🔴 Cycle 04 closure B1. Раньше резолвер спрашивал об этом UTC
 * (`today.month`, `today.day`), и у московского салона каждый
 * вопрос с 00:00 до 03:00 уезжал на месяц назад: «за 20 августа» в 01:30
 * возвращало 20 ИЮЛЯ с уверенной подписью. Наступил ли календарный день
 * бизнеса — решает пояс бизнеса, и никто другой.
 */
interface BusinessToday {
  readonly year: number;
  /** 0..11, как у `Date`. */
  readonly month: number;
  readonly day: number;
}

/**
 * Нейтральный пояс по умолчанию.
 *
 * Это НЕ бизнес-правило и НЕ скрытая Москва: боевые вызывающие обязаны
 * передать пояс арендатора, и это закреплено храповиком
 * `reporting-period.boundary.spec.ts`. UTC оставлен для чистого разбора в
 * тестах, где пояс не участвует в утверждении.
 */
const NEUTRAL_TIMEZONE = 'UTC';

export class ReportingPeriodResolver {
  /** Календарное «сегодня» в поясе бизнеса. Одна реализация на весь резолвер. */
  private static businessToday(now: Date, timezone: string): BusinessToday {
    const key = localCalendarDate(timezone, now);
    const [year, month, day] = key.split('-').map(Number);
    return { year, month: month - 1, day };
  }

  static isReportingTool(toolName: string): boolean {
    return REPORTING_TOOLS.has(toolName);
  }

  static needsComparison(toolName: string): boolean {
    return COMPARISON_TOOLS.has(toolName);
  }

  /**
   * Разбор вопроса → аргументы инструмента + подпись.
   *
   * Порядок важен: день и диапазон раньше месяца, текущая реплика раньше
   * прошлой. Склеенный «сегодня + а за 7» больше не превращается в today.
   */
  static resolve(
    text: string,
    previousUserText = '',
    now: Date = new Date(),
    timezone: string = NEUTRAL_TIMEZONE,
  ): PeriodResolution {
    const current = text.trim();
    const previous = previousUserText.trim();
    const context = `${previous} ${current}`.trim();
    // Календарь бизнеса решает, наступил ли день. UTC об этом не спрашивают.
    const today = this.businessToday(now, timezone);

    if (/(?:за\s+)?вчера/i.test(current)) {
      return this.pack({ period: 'yesterday' }, true, 'current');
    }
    if (/(?:за\s+)?сегодня|сегодняшн/i.test(current)) {
      return this.pack({ period: 'today' }, true, 'current');
    }
    if (/последн[а-яa-z]*\s+7\s+дн/i.test(context)) {
      return this.pack({ period: 'last_7_days' }, true, 'current');
    }
    if (/последн[а-яa-z]*\s+30\s+дн/i.test(context)) {
      return this.pack({ period: 'last_30_days' }, true, 'current');
    }
    if (
      /(?:за\s+)?прошл[а-яa-z]*\s+недел/i.test(current) ||
      (/недел/i.test(current) && /прошл/i.test(current))
    ) {
      return this.pack({ period: 'last_week' }, true, 'current');
    }

    const range =
      this.namedRangeForQuestion(current, previous, today) ??
      this.namedRangeForQuestion(previous, '', today);
    if (range) {
      return this.pack(range, true, 'current');
    }

    const namedDay = this.namedDayForQuestion(current, previous, today);
    if (namedDay) {
      return this.pack({ period: 'named_day', day: namedDay }, true, 'current');
    }

    const namedMonth =
      this.namedMonthForQuestion(current, today) ??
      this.namedMonthForQuestion(previous, today);
    if (namedMonth) {
      const source = this.namedMonthForQuestion(current, today)
        ? 'current'
        : 'previous';
      return this.pack(
        { period: 'named_month', month: namedMonth },
        true,
        source,
      );
    }

    if (/(?:за\s+)?вчера/i.test(previous)) {
      return this.pack({ period: 'yesterday' }, true, 'previous');
    }
    if (/(?:за\s+)?сегодня|сегодняшн/i.test(previous)) {
      return this.pack({ period: 'today' }, true, 'previous');
    }
    if (
      /(?:за\s+)?прошл[а-яa-z]*\s+месяц/i.test(context) &&
      !/(сравн|по\s+сравнению|динамик|просел|вырос|рост|снизил|упал)/i.test(
        context,
      )
    ) {
      return this.pack({ period: 'last_month' }, true, 'current');
    }
    // 🔴 Границы слова обязательны: голое «год» сидит внутри «выГОДный»,
    // «поГОДа», «ГОДится» — и вопрос «какие услуги самые выгодные» уезжал
    // в отчёт с начала года. Форма взята из YEAR_COMPARISON_PATTERN выше,
    // где границы уже стоят.
    if (
      /(?<![а-яё])год(?:а|ов|у|ом|е)?(?![а-яё])|(?<![а-яё])годов(?:ой|ая|ое|ые|ого|ому)?(?![а-яё])/i.test(
        context,
      )
    ) {
      return this.pack({ period: 'year_to_date' }, true, 'current');
    }
    if (/недел/i.test(context)) {
      return this.pack({ period: 'week_to_date' }, true, 'current');
    }
    if (/месяц/i.test(context)) {
      return this.pack({ period: 'month_to_date' }, true, 'current');
    }
    return this.pack({ period: 'month_to_date' }, false, 'default');
  }

  static comparison(text: string, previousUserText = ''): PeriodComparison {
    const context = `${previousUserText} ${text}`;
    if (YEAR_COMPARISON_PATTERN.test(context)) {
      return 'previous_year_same_period';
    }
    if (
      /(сравн|по\s+сравнению|динамик|изменил|просад|просел|вырос|рост|снизил|упал|лучше|хуже|предыдущ[а-яa-z]*\s+(?:период|месяц|недел)|прошл[а-яa-z]*\s+(?:период|месяц|недел))/i.test(
        context,
      )
    ) {
      return 'previous_period';
    }
    if (isComprehensiveBusinessReview(text, previousUserText)) {
      return 'previous_period';
    }
    if (
      BUSINESS_ACTION_REQUEST_PATTERN.test(text) ||
      BUSINESS_EXPLANATION_REQUEST_PATTERN.test(text)
    ) {
      return 'previous_period';
    }
    return 'none';
  }

  /**
   * Жёстко подменяет period-поля в аргументах инструмента.
   * Модель не может ответить за август на вопрос про 7 августа.
   */
  static hardenToolArguments(
    toolName: string,
    args: Record<string, unknown>,
    text: string,
    previousUserText = '',
    now: Date = new Date(),
    timezone: string = NEUTRAL_TIMEZONE,
  ): Record<string, unknown> {
    if (!this.isReportingTool(toolName)) {
      return args;
    }
    const resolution = this.resolve(text, previousUserText, now, timezone);
    const next: Record<string, unknown> = { ...args };
    delete next.day;
    delete next.month;
    delete next.from;
    delete next.to;
    delete next.from_day;
    delete next.to_day;
    Object.assign(next, resolution.args);
    if (this.needsComparison(toolName)) {
      next.comparison = this.comparison(text, previousUserText);
    }
    return next;
  }

  static labelRu(
    args: ReportingPeriodToolArgs,
    options: { truncatedToToday?: boolean } = {},
  ): string {
    const truncated = options.truncatedToToday === true;
    switch (args.period) {
      case 'today':
        return 'сегодня';
      case 'yesterday':
        return 'вчера';
      case 'week_to_date':
        return 'эту неделю';
      case 'month_to_date':
        return truncated ? 'этот месяц по сегодня' : 'этот месяц';
      case 'year_to_date':
        return truncated ? 'этот год по сегодня' : 'этот год';
      case 'last_7_days':
        return 'последние 7 дней';
      case 'last_30_days':
        return 'последние 30 дней';
      case 'last_week':
        return 'прошлую неделю';
      case 'last_month':
        return 'прошлый месяц';
      case 'named_day':
        return args.day ? this.formatDayRu(args.day) : 'выбранный день';
      case 'named_month': {
        if (!args.month) return 'выбранный месяц';
        const [year, month] = args.month.split('-');
        const name = MONTH_NOMINATIVE[Number(month) - 1] ?? args.month;
        return truncated ? `${name} ${year} по сегодня` : `${name} ${year}`;
      }
      case 'named_range': {
        if (!args.from_day || !args.to_day) return 'выбранный период';
        return this.formatRangeRu(args.from_day, args.to_day);
      }
      default:
        return 'выбранный период';
    }
  }

  static resolvedPeriodMeta(
    args: ReportingPeriodToolArgs,
    query: { from: string; to: string },
    options: { truncatedToToday?: boolean } = {},
  ) {
    return {
      kind: args.period,
      ...(args.day ? { day: args.day } : {}),
      ...(args.month ? { month: args.month } : {}),
      ...(args.from_day ? { from_day: args.from_day } : {}),
      ...(args.to_day ? { to_day: args.to_day } : {}),
      from: query.from,
      to: query.to,
      label_ru: this.labelRu(args, options),
      truncated_to_today: options.truncatedToToday === true,
    };
  }

  private static pack(
    args: ReportingPeriodToolArgs,
    explicit: boolean,
    source: PeriodResolution['source'],
  ): PeriodResolution {
    return {
      args,
      label_ru: this.labelRu(args),
      explicit,
      source,
    };
  }

  private static namedDayForQuestion(
    text: string,
    previousUserText: string,
    today: BusinessToday,
  ): string | null {
    const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso) {
      return this.normalizeCalendarDay(iso[1], today);
    }

    const dotted = text.match(
      /(?:^|[^\d])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)/,
    );
    if (dotted) {
      const day = Number(dotted[1]);
      const month = Number(dotted[2]);
      const yearHint = dotted[3]
        ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3])
        : null;
      // «20.08» — месяц назван цифрой, но назван.
      return this.buildCalendarDay(day, month - 1, yearHint, today, {
        explicitMonth: true,
      });
    }

    const dayWithMonth = text.match(
      /(?:за\s+)?(\d{1,2})\s+(январ[ьяей]|феврал[ьяей]|март[ае]?|апрел[ьяей]|ма[йея]|июн[ьяей]|июл[ьяей]|август[ае]?|сентябр[ьяей]|октябр[ьяей]|ноябр[ьяей]|декабр[ьяей])(?:\s+(\d{4}))?/i,
    );
    if (dayWithMonth) {
      const monthIndex = this.monthNameIndex(dayWithMonth[2]);
      if (monthIndex >= 0) {
        return this.buildCalendarDay(
          Number(dayWithMonth[1]),
          monthIndex,
          dayWithMonth[3] ? Number(dayWithMonth[3]) : null,
          today,
          // 🔴 Месяц назван СЛОВОМ — та же календарная личность, что и у
          // «21.08». Без этого «21 августа» уезжало в июль, а «за 21.08»
          // оставалось в августе: один вопрос, два разных месяца в ответе.
          { explicitMonth: true },
        );
      }
    }

    // 🔴 В исключениях были только дни, поэтому «выручка за 3 месяца»
    // читалась как «за 3-е число», а «за 6 недель» — как «за 6-е». Число
    // после «за» — календарный день ТОЛЬКО когда за ним не стоит единица
    // периода. «за 7 августа» сюда не доходит: его ловит ветка dayWithMonth
    // выше, а «а за 7» и «за 7» без единицы продолжают работать.
    const bare = text.match(
      /(?:^|\s)(?:а\s+)?за\s+(\d{1,2})(?!\s*(?:дн|день|дня|дней|недел|мес|год|лет|квартал|\d|[./]))\b/i,
    );
    if (!bare) {
      return null;
    }
    const day = Number(bare[1]);
    const monthFromPrevious = this.namedMonthForQuestion(
      previousUserText,
      today,
    );
    if (monthFromPrevious) {
      const [yearText, monthText] = monthFromPrevious.split('-');
      return this.buildCalendarDay(
        day,
        Number(monthText) - 1,
        Number(yearText),
        today,
      );
    }
    return this.buildCalendarDay(day, today.month, today.year, today);
  }

  /**
   * «с 1 по 7 августа», «1–7 августа», «за первую неделю августа».
   */
  private static namedRangeForQuestion(
    text: string,
    previousUserText: string,
    today: BusinessToday,
  ): ReportingPeriodToolArgs | null {
    const firstWeek = text.match(
      /(?:за\s+)?перв(?:ую|ой|ая)\s+недел[а-яё]*\s+(январ[ьяей]|феврал[ьяей]|март[ае]?|апрел[ьяей]|ма[йея]|июн[ьяей]|июл[ьяей]|август[ае]?|сентябр[ьяей]|октябр[ьяей]|ноябр[ьяей]|декабр[ьяей])(?:\s+(\d{4}))?/i,
    );
    if (firstWeek) {
      const monthIndex = this.monthNameIndex(firstWeek[1]);
      if (monthIndex >= 0) {
        const month = this.namedMonthFromIndex(
          monthIndex,
          firstWeek[2] ? Number(firstWeek[2]) : null,
          today,
        );
        if (month) {
          return {
            period: 'named_range',
            from_day: `${month}-01`,
            to_day: `${month}-07`,
          };
        }
      }
    }

    const ranged = text.match(
      /(?:с|со)\s+(\d{1,2})\s+по\s+(\d{1,2})(?:\s+(январ[ьяей]|феврал[ьяей]|март[ае]?|апрел[ьяей]|ма[йея]|июн[ьяей]|июл[ьяей]|август[ае]?|сентябр[ьяей]|октябр[ьяей]|ноябр[ьяей]|декабр[ьяей]))?(?:\s+(\d{4}))?/i,
    );
    const dashed = text.match(
      /(?:за\s+)?(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+(январ[ьяей]|феврал[ьяей]|март[ае]?|апрел[ьяей]|ма[йея]|июн[ьяей]|июл[ьяей]|август[ае]?|сентябр[ьяей]|октябр[ьяей]|ноябр[ьяей]|декабр[ьяей])(?:\s+(\d{4}))?/i,
    );
    const match = ranged ?? dashed;
    if (!match) {
      return null;
    }
    const fromDay = Number(match[1]);
    const toDay = Number(match[2]);
    if (
      !Number.isInteger(fromDay) ||
      !Number.isInteger(toDay) ||
      fromDay < 1 ||
      toDay < 1 ||
      fromDay > toDay
    ) {
      return null;
    }
    const monthToken = ranged ? match[3] : match[3];
    const yearToken = ranged ? match[4] : match[4];
    let monthIndex = monthToken ? this.monthNameIndex(monthToken) : -1;
    let yearHint = yearToken ? Number(yearToken) : null;
    if (monthIndex < 0) {
      const fromPrevious = this.namedMonthForQuestion(previousUserText, today);
      if (fromPrevious) {
        const [yearText, monthText] = fromPrevious.split('-');
        monthIndex = Number(monthText) - 1;
        yearHint = Number(yearText);
      } else {
        monthIndex = today.month;
        yearHint = today.year;
      }
    }
    /**
     * 🔴 Cycle 04 closure B2. Обе границы принадлежат ОДНОМУ названному месяцу.
     *
     * Раньше каждая строилась отдельно и конец «31 августа», ещё не
     * наступивший, уезжал в июль. После этого `from > to` роняло разбор
     * диапазона целиком, и вопрос про месяц отвечался одним днём чужого
     * месяца. Явно названный период сохраняет свою календарную личность даже
     * если он ещё не закончился.
     */
    const explicitMonth = Boolean(monthToken) || yearHint !== null;
    const from = this.buildCalendarDay(fromDay, monthIndex, yearHint, today, {
      explicitMonth,
    });
    const to = this.buildCalendarDay(toDay, monthIndex, yearHint, today, {
      explicitMonth,
    });
    if (!from || !to || from > to) {
      return null;
    }
    return { period: 'named_range', from_day: from, to_day: to };
  }

  private static namedMonthForQuestion(
    context: string,
    today: BusinessToday,
  ): string | null {
    if (!context.trim()) {
      return null;
    }
    const months = this.calendarMonthPatterns();
    let matched = -1;
    let earliest = Number.POSITIVE_INFINITY;
    months.forEach((pattern, index) => {
      const found = context.search(pattern);
      if (found >= 0 && found < earliest) {
        earliest = found;
        matched = index;
      }
    });
    if (matched < 0) {
      return null;
    }
    let year = today.year;
    if (matched > today.month) {
      year -= 1;
    }
    if (/прошл[а-яa-z]*\s+год|прошлогодн/i.test(context)) {
      year -= 1;
    }
    return `${year}-${String(matched + 1).padStart(2, '0')}`;
  }

  private static namedMonthFromIndex(
    monthIndex: number,
    yearHint: number | null,
    today: BusinessToday,
  ): string | null {
    if (monthIndex < 0 || monthIndex > 11) {
      return null;
    }
    let year = yearHint ?? today.year;
    if (yearHint === null && monthIndex > today.month) {
      year -= 1;
    }
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  }

  private static calendarMonthPatterns(): RegExp[] {
    return [
      /(?<![а-яё])январ[ьяей]|(?<![а-яё])янв(?![а-яё])/i,
      /(?<![а-яё])феврал[ьяей]|(?<![а-яё])фев(?![а-яё])/i,
      /(?<![а-яё])март[ае]?(?![а-яё])/i,
      /(?<![а-яё])апрел[ьяей]/i,
      /(?<![а-яё])ма[йея](?![а-яё])/i,
      /(?<![а-яё])июн[ьяей]/i,
      /(?<![а-яё])июл[ьяей]/i,
      /(?<![а-яё])август[ае]?(?![а-яё])/i,
      /(?<![а-яё])сентябр[ьяей]/i,
      /(?<![а-яё])октябр[ьяей]/i,
      /(?<![а-яё])ноябр[ьяей]/i,
      /(?<![а-яё])декабр[ьяей]/i,
    ];
  }

  private static monthNameIndex(name: string): number {
    const months = this.calendarMonthPatterns();
    for (let index = 0; index < months.length; index += 1) {
      if (months[index].test(name)) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Календарный день из «числа + месяца».
   *
   * 🔴 Cycle 04 closure B1/B2. Две правки против одной строки, которая
   * отвечала не про тот месяц.
   *
   * Первая: «наступил ли этот день» решает КАЛЕНДАРЬ БИЗНЕСА, а не UTC.
   * Вторая: откат «день ещё не наступил → значит прошлый месяц» — эвристика
   * про ГОЛОЕ число («а за 20»). Когда человек назвал месяц или год словами,
   * он назвал календарную личность периода, и подменять её нельзя: «с 1 по
   * 31 августа» из-за этого схлопывалось в 31 июля.
   */
  private static buildCalendarDay(
    day: number,
    monthIndex: number,
    yearHint: number | null,
    today: BusinessToday,
    options: { explicitMonth?: boolean } = {},
  ): string | null {
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      monthIndex < 0 ||
      monthIndex > 11
    ) {
      return null;
    }
    let year = yearHint ?? today.year;
    let month = monthIndex;
    const mayShift = yearHint === null && options.explicitMonth !== true;
    if (yearHint === null) {
      // Год выбирается всегда: названный месяц, который в этом году ещё не
      // наступал, относится к прошлому году.
      if (month > today.month) {
        year -= 1;
      } else if (mayShift && month === today.month && day > today.day) {
        if (month === 0) {
          year -= 1;
          month = 11;
        } else {
          month -= 1;
        }
      }
    }
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (day > lastDay) {
      return null;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private static normalizeCalendarDay(
    value: string,
    today: BusinessToday,
  ): string | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    return this.buildCalendarDay(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      today,
    );
  }

  private static formatDayRu(day: string): string {
    const [year, month, date] = day.split('-');
    const monthName = MONTH_GENITIVE[Number(month) - 1] ?? month;
    return `${Number(date)} ${monthName} ${year}`;
  }

  private static formatRangeRu(fromDay: string, toDay: string): string {
    const [fromYear, fromMonth, fromDate] = fromDay.split('-');
    const [toYear, toMonth, toDate] = toDay.split('-');
    if (fromYear === toYear && fromMonth === toMonth) {
      const monthName = MONTH_GENITIVE[Number(fromMonth) - 1] ?? fromMonth;
      return `${Number(fromDate)}–${Number(toDate)} ${monthName} ${fromYear}`;
    }
    return `${this.formatDayRu(fromDay)} — ${this.formatDayRu(toDay)}`;
  }
}
