import { Injectable } from '@nestjs/common';

import type { AnalyticsRangeQueryDto } from '../analytics/dto/analytics-range-query.dto';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import type { RevenueBasis } from '../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Канонический владелец состояния бизнеса.
 *
 * 🔴 Зачем это понадобилось. Аудит Phase A показал: композиция бизнес-состояния
 * уже существовала и была верной — но жила приватными методами внутри
 * `AiToolHandlerService`. Добраться до неё можно было только вызовом
 * инструмента модели, поэтому кабинет, утренний бриф и вечерний отчёт считали
 * то же самое заново, каждый по-своему. Проблема была не в отсутствии слоя, а
 * в его адресе.
 *
 * P1 переносит вычисление сюда БЕЗ переписывания: тела методов те же, что
 * работали в бою, и это намеренно — переписывание не отличить от смены
 * поведения, а доказывать пришлось бы обе вещи сразу.
 *
 * 🔴 Направление зависимости — ОДНОСТОРОННЕЕ: `AI → Business State`. Здесь нет
 * ни модели, ни промптов, ни маршрутизации чата, ни форматирования ответа, ни
 * ролей. Роль — это решение вызывающего, и он передаёт сюда УЖЕ принятое
 * решение: можно ли читать деньги и кого называть по имени. Проверяется
 * храповиком в `business-state.boundary.spec.ts`.
 *
 * 🔴 Период приходит уже разрешённым. «Этот месяц» — живая речь, её разбор
 * принадлежит слою, который эту речь слышит. Детерминированное ядро получает
 * границы и часовой пояс.
 *
 * Ничего не сохраняется: состояние считается по запросу. При одном арендаторе
 * и 1950 визитах владелец вычисления нужен раньше, чем инфраструктура проекций.
 */

type StaffMoneyAmount = {
  currency: string | null;
  amount_kopecks: number;
  amount_major_units: number | null;
};

type StaffSalaryRow = {
  accrued: StaffMoneyAmount;
  paid: StaffMoneyAmount | null;
};

type StaffSalaryScope =
  | { status: 'available'; rows: Map<string, StaffSalaryRow> }
  | { status: 'unavailable'; reason: string };

/** Почему начислений по мастеру нет — машиночитаемо, без гадания. */
export const STAFF_SALARY_UNAVAILABLE = {
  notRequested: 'payroll_not_requested_for_this_report',
  internalCalendar: 'internal_calendar_has_no_payroll_calculation',
  companyScope: 'crm_payroll_is_company_scoped_and_has_no_branch_split',
  roleRestricted: 'role_not_allowed_to_read_payroll',
  identityUnknown: 'employee_is_not_linked_to_a_crm_staff_record',
  financeUnavailable: 'crm_finance_unavailable',
  payrollUnavailable: 'crm_payroll_unavailable',
  rangeTooLarge: 'crm_payroll_range_too_large',
  rowUnavailable: 'crm_payroll_row_unavailable_for_this_master',
} as const;

/** Почему подтверждённой выручки конкретного мастера может не быть. */
export const STAFF_CONFIRMED_REVENUE_UNAVAILABLE = {
  crm: 'crm_financial_transactions_are_not_attributed_to_this_master',
  maya: 'internal_calendar_records_booked_appointment_value_which_is_not_till_confirmed_cash',
} as const;

/**
 * Метрики, которых у Maya нет и не будет без новых доказательств.
 *
 * Окупаемость рекламы недоступна не потому, что её «пока не посчитали»:
 * выручки, ПРИВЕДЁННОЙ рекламой, не существует ни в одном источнике, а
 * подставить вместо неё общую выручку салона значит завысить результат в разы.
 */
const NEVER_AVAILABLE_METRICS: ReadonlyArray<{ key: string; reason: string }> =
  [
    {
      key: 'accounting_net_profit',
      reason: 'requires verified taxes and all accounting expenses',
    },
    {
      key: 'gross_margin',
      reason: 'requires direct cost allocation by service',
    },
    {
      key: 'marketing_roi',
      reason: 'requires advertising spend and attribution data',
    },
  ];

/** Почему стоимости записанного может не быть. Машинные коды, а не текст. */
export const BOOKED_VALUE_UNAVAILABLE = {
  /** Вызывающий не имеет права показывать этот операционный факт. */
  notPermitted:
    'booked_value is an operational fact and the caller is not permitted to see it for this request',
  /** Источник не дал ни одной записи с ценой за период. */
  noPricedRecords:
    'the source returned no priced appointment for this period, so there is no booked value to report',
} as const;

/**
 * Служебный ключ исходного обзора внутри композиции.
 *
 * Строка, а не символ: композиция ездит как обычный JSON между приватными
 * методами, и символ потерялся бы при первом же копировании через spread.
 * Двойное подчёркивание — знак «это не часть контракта».
 */
const SOURCE_OVERVIEW = '__source_overview';

export type PeriodComparisonMode =
  'none' | 'previous_period' | 'previous_year_same_period';

/** Идентичность мастера для решения о раскрытии имени. Ничего лишнего. */
export interface StaffIdentityRow {
  externalId: string;
  name: string | null;
}

/**
 * Что вызывающий разрешил раскрыть о мастерах.
 *
 * `allowedExternalIds = null` означает «всех»; пустое множество — «никого».
 * Решение принимается по роли ВНЕ этого сервиса.
 */
export interface StaffDisclosure {
  names: Map<string, string>;
  allowedExternalIds: Set<string> | null;
}

export interface BusinessStateRequest {
  tenantId: string;
  /** Уже разрешённое окно: границы и часовой пояс, а не «этот месяц». */
  period: AnalyticsRangeQueryDto;
  comparisonMode: PeriodComparisonMode;
  /** Уже разрешённое окно сравнения либо `null`. */
  comparisonPeriod: AnalyticsRangeQueryDto | null;
  /** Разрешено ли читать денежный контур. Решение по роли — вызывающего. */
  financeAllowed: boolean;
  /**
   * Разрешено ли показывать стоимость записанного.
   *
   * 🔴 Отдельное решение, а не следствие денежного. Стоимость записанного —
   * ОПЕРАЦИОННЫЙ факт: это не касса и не выручка, а сумма цен того, что стоит
   * в журнале. Право на неё шире права на кассу, и решает его вызывающий —
   * этот слой ролей не знает и знать не должен.
   */
  bookedValueAllowed: boolean;
  /**
   * Нужен ли исходный операционный обзор.
   *
   * 🔴 Просят его только авторизованные первые лица (кабинет владельца).
   * Модель не просит никогда: в обзоре внешние идентификаторы мастеров.
   */
  operationalDetail?: boolean;
  /**
   * Повторять ли чтение источника один раз при отказе.
   *
   * 🔴 Это НЕ настройка на вкус, а сохранение боевого поведения двух разных
   * потребителей. Инструмент модели читал с одной повторной попыткой: диалог
   * переживает лишние 250 мс, а «источник не ответил» посреди разговора стоит
   * дороже. HTTP-кабинет не повторял никогда: на том конце человек, у запроса
   * есть таймаут, и удвоенная нагрузка на провайдера в момент его отказа —
   * худшее, что можно сделать.
   *
   * Умолчание `true` — это поведение потребителя, который был первым: при
   * переносе кабинета сюда повтор приехал бы к нему молча, вместе с чужой
   * политикой чтения.
   */
  retryOnFailure?: boolean;
  /** Кого называть по имени. Решение по роли — вызывающего. */
  disclose: (rows: StaffIdentityRow[]) => StaffDisclosure;
}

export interface EmployeeStateRequest {
  tenantId: string;
  userId: string;
  period: AnalyticsRangeQueryDto;
  comparisonMode: PeriodComparisonMode;
  comparisonPeriod: AnalyticsRangeQueryDto | null;
  /**
   * Только ИМЕНОВАНИЕ. Кому именно открыт срез, решает не вызывающий: в личном
   * срезе это всегда один человек — сам спрашивающий, и допуск сервис выводит
   * из ответа источника, а не из доверия к параметру.
   */
  nameRows: (rows: StaffIdentityRow[]) => Map<string, string>;
  /**
   * Нужен ли исходный операционный обзор — то же решение, что и в срезе салона.
   *
   * 🔴 Личный кабинет мастера — такой же авторизованный фронт: он рисует свой
   * ответ из исходного обзора. Без этого флага `sourceOverview` оставался бы
   * `null`, и опубликованный контракт `/analytics/me` превратился бы в пустой
   * объект — тихо, без ошибки.
   */
  operationalDetail?: boolean;
}

/**
 * Состояние бизнеса за период.
 *
 * `published` — уже с применённым раскрытием мастеров: это то, что вызывающий
 * имеет право показать. `internal` НЕ отдаётся наружу вовсе: там остаются
 * внешние идентификаторы и непубликуемые денежные разрезы.
 */
export interface BusinessState {
  verified: boolean;
  financeVerified: boolean;
  source: unknown;
  period: unknown;
  comparison: {
    mode: PeriodComparisonMode;
    period: unknown;
    completeness: { current: string; previous: string | null };
  };
  current: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  metrics: Record<string, number | string | null>;
  changes: Record<string, unknown>;
  serviceChanges: unknown[];
  staffChanges: unknown[];
  availableMetrics: string[];
  limitations: Array<{ key: string; reason: string }>;
  unavailableMetrics: Array<{ key: string; reason: string }>;
  /**
   * Исходный операционный обзор для авторизованных первых лиц.
   *
   * `null`, если вызывающий его не просил. Наружу к модели не уходит никогда —
   * это витрина кабинета, а не ответ ассистента.
   */
  sourceOverview: unknown;
  /**
   * Ключ соединения строк мастера с данными, которыми канонический слой НЕ
   * владеет, — например с личными планами из настроек владельца.
   *
   * 🔴 Наружу это не отдаётся никогда: внешний идентификатор провайдера не
   * является публичным контрактом Maya. Поле существует ровно потому, что
   * планы хранятся под этим ключом, а планов у слоя фактов нет.
   */
  staffJoin: Array<{
    externalId: string;
    published: Record<string, unknown>;
  }>;
  /**
   * Составляющие «недоступного» по отдельности.
   *
   * 🔴 Нужны потому, что конверты потребителей РАЗНЫЕ и складывались они
   * исторически: у бизнес-среза свой набор и порядок, у KPI команды — свой.
   * Отдать один готовый список значило бы поменять оба конверта под видом
   * переноса. Состав считает канонический слой, порядок выбирает потребитель.
   */
  unavailableParts: {
    bookedValue: Array<{ key: string; reason: string }>;
    cohorts: Array<{ key: string; reason: string }>;
    attendance: Array<{ key: string; reason: string }>;
    staffMoney: Array<{ key: string; reason: string }>;
    neverAvailable: ReadonlyArray<{ key: string; reason: string }>;
  };
}

export interface EmployeeState extends BusinessState {
  /** Служебный ключ сотрудника: наружу не отдаётся, нужен для мотивации. */
  employeeExternalId: string | null;
}

@Injectable()
export class BusinessStateService {
  constructor(
    private readonly analyticsService: OperationsAnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Состояние бизнеса салона за период.
   *
   * Последовательность та же, что работала в бою: прочитать оба периода →
   * применить раскрытие мастеров → снять срез метрик → посчитать изменения →
   * назвать, чего нет и что означает не то, что кажется.
   */
  async business(request: BusinessStateRequest): Promise<BusinessState> {
    const composition = (query: AnalyticsRangeQueryDto) =>
      this.readBusinessComposition(
        {
          tenantId: request.tenantId,
          financeAllowed: request.financeAllowed,
          bookedValueAllowed: request.bookedValueAllowed,
        },
        query,
      );
    const read = (query: AnalyticsRangeQueryDto) =>
      request.retryOnFailure === false
        ? composition(query)
        : this.retryAnalyticsRead(() => composition(query));
    const [currentInternal, previousInternal] = await Promise.all([
      read(request.period),
      request.comparisonPeriod
        ? read(request.comparisonPeriod)
        : Promise.resolve(null),
    ]);
    return this.compose(
      request,
      currentInternal,
      previousInternal,
      request.period,
      request.comparisonPeriod,
    );
  }

  /** Личный срез мастера за период. Тот же порядок, другой источник строк. */
  async employee(request: EmployeeStateRequest): Promise<EmployeeState> {
    /**
     * 🔴 БЕЗ повтора — так и было в бою.
     *
     * Бизнес-срез читается с одной повторной попыткой, личный — нет, и это не
     * забытая симметрия: перенос не имеет права ни добавлять сетевые попытки,
     * ни убирать их. Добавленный здесь повтор менял бы и число обращений к
     * провайдеру, и наблюдаемое поведение при его отказе.
     */
    const read = (query: AnalyticsRangeQueryDto) =>
      this.readEmployeeComposition(
        { tenantId: request.tenantId, userId: request.userId },
        query,
      );
    const [currentInternal, previousInternal] = await Promise.all([
      read(request.period),
      request.comparisonPeriod
        ? read(request.comparisonPeriod)
        : Promise.resolve(null),
    ]);
    // 🔴 Источник и так отдаёт строки одного человека, но полагаться на это
    // нельзя. Ключ — идентификатор сотрудника из ответа; если его нет, разрез
    // закрывается целиком, а не открывается на всех.
    const allowed = new Set<string>();
    for (const period of [currentInternal, previousInternal]) {
      const externalId = this.record(period).employee_external_id;
      if (typeof externalId === 'string' && externalId !== '') {
        allowed.add(externalId);
      }
    }
    const state = this.compose(
      {
        comparisonMode: request.comparisonMode,
        personal: true,
        operationalDetail: request.operationalDetail,
        disclose: (rows) => ({
          names: request.nameRows(rows),
          allowedExternalIds: allowed,
        }),
      },
      currentInternal,
      previousInternal,
      request.period,
      request.comparisonPeriod,
    );
    const externalId = this.record(currentInternal).employee_external_id;
    return {
      ...state,
      employeeExternalId: typeof externalId === 'string' ? externalId : null,
      unavailableMetrics: [
        ...state.unavailableMetrics,
        ...this.personalCashUnavailableMetrics(state.current),
        {
          key: 'other_employee_personal_data',
          reason: 'role scope permits only the current employee data',
        },
      ],
    };
  }

  /**
   * Общая сборка состояния из двух прочитанных периодов.
   *
   * 🔴 Имена раздаются ОДИН раз на оба периода: тёзки обязаны получить один и
   * тот же различитель слева и справа, иначе «Илья (2)» в сравнении означал бы
   * разных людей.
   */
  private compose(
    request: {
      comparisonMode: PeriodComparisonMode;
      disclose: (rows: StaffIdentityRow[]) => StaffDisclosure;
      financeAllowed?: boolean;
      bookedValueAllowed?: boolean;
      operationalDetail?: boolean;
      /**
       * 🔴 Личный срез считает СВОИ метрики. Слово «выручка» у мастера значит
       * не то же, что у салона: касса конкретного человека провайдером не
       * подтверждается, и вместо неё честно публикуется стоимость записанного.
       * Подменить одно другим значило бы пообещать мастеру чужие деньги.
       */
      personal?: boolean;
    },
    currentInternal: unknown,
    previousInternal: unknown,
    currentQuery: AnalyticsRangeQueryDto,
    previousQuery: AnalyticsRangeQueryDto | null,
  ): BusinessState {
    const disclosure = request.disclose([
      ...this.staffIdentityRows(currentInternal),
      ...this.staffIdentityRows(previousInternal),
      ...this.payrollIdentityRows(currentInternal),
    ]);
    const current = this.publishAnalytics(currentInternal, disclosure);
    const previous = previousInternal
      ? this.publishAnalytics(previousInternal, disclosure)
      : null;
    const snapshot = (value: unknown) =>
      request.personal
        ? this.employeeMetricSnapshot(value)
        : this.businessMetricSnapshot(value);
    const currentSnapshot = snapshot(current);
    const previousSnapshot = previous ? snapshot(previous) : null;

    return {
      verified: this.businessOperationalAnalyticsVerified(current),
      financeVerified:
        this.record(this.record(current).finance).verified === true,
      source: this.record(current).data_source ?? null,
      period: this.record(current).period ?? currentQuery,
      comparison: {
        mode: request.comparisonMode,
        period: previous
          ? (this.record(previous).period ?? previousQuery)
          : null,
        completeness: {
          current: this.readCompletenessStatus(current),
          previous: previous ? this.readCompletenessStatus(previous) : null,
        },
      },
      current,
      previous,
      metrics: currentSnapshot,
      changes: previousSnapshot
        ? this.businessMetricChanges(currentSnapshot, previousSnapshot)
        : {},
      serviceChanges: previous
        ? this.businessServiceChanges(current, previous)
        : [],
      staffChanges: previousInternal
        ? this.businessStaffChanges(
            currentInternal,
            previousInternal,
            disclosure,
          )
        : [],
      availableMetrics: Object.entries(currentSnapshot)
        .filter(([, value]) => value !== null)
        .map(([key]) => key),
      limitations: [
        ...this.measurementLimitations(current),
        ...this.comparisonLimitations(
          current,
          previous,
          request.comparisonMode,
        ),
      ],
      sourceOverview: request.operationalDetail
        ? this.record(currentInternal)[SOURCE_OVERVIEW]
        : null,
      staffJoin: this.staffJoin(currentInternal, current, disclosure),
      unavailableParts: {
        bookedValue: this.bookedValueUnavailableMetrics(
          current,
          request.bookedValueAllowed !== false,
        ),
        cohorts: this.clientCohortUnavailableMetrics(current),
        attendance: this.attendanceUnavailableMetrics(current),
        staffMoney: this.staffMoneyUnavailableMetrics(current),
        neverAvailable: request.personal ? [] : NEVER_AVAILABLE_METRICS,
      },
      unavailableMetrics: [
        ...this.bookedValueUnavailableMetrics(
          current,
          request.bookedValueAllowed !== false,
        ),
        ...this.clientCohortUnavailableMetrics(current),
        ...this.attendanceUnavailableMetrics(current),
        ...this.staffMoneyUnavailableMetrics(current),
        // 🔴 Утверждения о том, чего Maya не считает и не будет, — тоже часть
        // бизнес-истины, а не украшение ответа. Держать их в слое, который
        // разговаривает, значило бы позволить ему передумать.
        //
        // Только для среза САЛОНА: маржа и окупаемость рекламы — утверждения
        // уровня бизнеса, и в личном срезе мастера им нечего делать.
        ...(request.personal ? [] : NEVER_AVAILABLE_METRICS),
      ],
    };
  }

  /**
   * Соединение внутренних строк мастера с опубликованными.
   *
   * 🔴 Порядок обеих последовательностей задаётся одним и тем же выражением в
   * `publishAnalytics`, поэтому они идут в ногу. Проверка длины стоит здесь не
   * для красоты: если фильтры разъедутся, план одного мастера молча приедет
   * другому, и заметить это будет нечем.
   */
  private staffJoin(
    internal: unknown,
    published: Record<string, unknown>,
    disclosure: StaffDisclosure,
  ): Array<{ externalId: string; published: Record<string, unknown> }> {
    const rows = this.staffRows(internal).filter(
      (row): row is typeof row & { externalId: string } =>
        typeof row.externalId === 'string' &&
        row.externalId !== '' &&
        (disclosure.allowedExternalIds === null ||
          disclosure.allowedExternalIds.has(row.externalId)),
    );
    const publishedRows = Array.isArray(published.staff_summary)
      ? published.staff_summary
      : [];
    if (rows.length !== publishedRows.length) {
      return [];
    }
    return rows.map((row, index) => ({
      externalId: row.externalId,
      published: this.record(publishedRows[index]),
    }));
  }

  private employeeMetricSnapshot(value: unknown) {
    const data = this.record(value);
    const appointments = this.record(data.appointments);
    /**
     * 🔴 Cycle 04 P2. То же поле, что и в срезе салона.
     *
     * В личном срезе `revenue` кассой не перезаписывается — подтверждённой
     * выручки конкретного мастера провайдер не даёт вовсе, — но читать
     * стоимость записанного из поля, которое ГДЕ-ТО перезаписывается, нельзя:
     * ровно так и появляется путь, по которому одно поле снова начинает
     * значить два факта.
     */
    const bookedValue = Array.isArray(data.booked_value)
      ? this.safeMoneyAmount(data.booked_value[0])
      : null;
    const averageBookedValue = Array.isArray(data.average_ticket)
      ? this.safeMoneyAmount(data.average_ticket[0])
      : null;
    return {
      booked_value_amount_kopecks: bookedValue?.amount_kopecks ?? null,
      appointments_total: this.optionalMetricNumber(appointments.total),
      appointments_active: this.optionalMetricNumber(appointments.active),
      appointments_scheduled: this.optionalMetricNumber(appointments.scheduled),
      appointments_completed: this.optionalMetricNumber(appointments.completed),
      appointments_cancelled: this.optionalMetricNumber(appointments.cancelled),
      appointments_no_show: this.optionalMetricNumber(appointments.no_show),
      cancellation_rate_percent: this.optionalMetricNumber(
        appointments.cancellation_rate_percent,
      ),
      unique_clients: this.optionalMetricNumber(appointments.unique_clients),
      repeat_clients_in_period: this.optionalMetricNumber(
        appointments.repeat_clients_in_period,
      ),
      repeat_client_rate_percent: this.optionalMetricNumber(
        appointments.repeat_client_rate_percent,
      ),
      identified_client_visits: this.optionalMetricNumber(
        appointments.identified_client_visits,
      ),
      ...this.clientCohortMetrics(appointments),
      average_booked_value_amount_kopecks:
        averageBookedValue?.amount_kopecks ?? null,
      booked_minutes: this.optionalMetricNumber(appointments.booked_minutes),
    };
  }

  /**
   * Почему стоимости записанного нет — словами, а не пустым местом.
   *
   * 🔴 До P2 это поле молча содержало кассу, и вопроса «почему его нет» не
   * возникало вовсе. Теперь оно честно пусто у CRM-арендатора, и молчать об
   * этом нельзя: пустота без причины читается как «записанного не было».
   */
  private bookedValueUnavailableMetrics(value: unknown, permitted: boolean) {
    const data = this.record(value);
    const bookedValue = Array.isArray(data.booked_value)
      ? data.booked_value
      : [];
    if (bookedValue.length > 0) {
      return [];
    }
    return [
      {
        key: 'booked_value',
        reason: permitted
          ? BOOKED_VALUE_UNAVAILABLE.noPricedRecords
          : BOOKED_VALUE_UNAVAILABLE.notPermitted,
      },
    ];
  }

  /**
   * Идентичности из расчёта зарплаты.
   *
   * 🔴 Мастер, которому начислено, но у которого за день нет ни одной записи,
   * в разрезе периода отсутствует — и всё равно должен быть назван, иначе его
   * строка в отчёте владельца превращается в безымянное «Мастер».
   */
  private payrollIdentityRows(value: unknown): StaffIdentityRow[] {
    const rows = this.record(
      this.record(this.record(value).finance).payroll,
    ).staff;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((entry) => {
      const row = this.record(entry);
      /**
       * 🔴 Имя сюда НЕ приходит.
       *
       * Как мастера зовут в чужой системе — не основание называть его так
       * владельцу: имя выдаёт вызывающий по идентичности Maya, и другого пути
       * нет. Первая же попытка подставить имя из расчёта зарплаты сломала
       * существующий страж приватности AI-слоя — и правильно сломала.
       */
      return typeof row.external_id === 'string' && row.external_id !== ''
        ? [{ externalId: row.external_id, name: null }]
        : [];
    });
  }

  /** Идентичности мастеров периода — вход для решения о раскрытии имён. */
  private staffIdentityRows(value: unknown): StaffIdentityRow[] {
    return this.staffRows(value)
      .filter(
        (row): row is typeof row & { externalId: string } =>
          typeof row.externalId === 'string' && row.externalId !== '',
      )
      .map((row) => ({ externalId: row.externalId, name: row.name }));
  }

  /** Тоже промежуточное представление — см. readAnalytics. */
  private async readBusinessComposition(
    actor: {
      tenantId: string;
      financeAllowed: boolean;
      bookedValueAllowed: boolean;
    },
    query: AnalyticsRangeQueryDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { calendarSource: true },
    });
    const shouldReadFinance =
      tenant?.calendarSource === 'external' &&
      !query.branchId &&
      actor.financeAllowed;
    const [overviewValue, financeSummary] = await Promise.all([
      this.businessOperationalOverview(actor.tenantId, query),
      shouldReadFinance
        ? Promise.resolve()
            .then(() =>
              this.analyticsService.getBusinessFinance(actor.tenantId, query),
            )
            .then((value) => this.record(value))
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const overview = this.record(overviewValue);
    /**
     * 🔴 Cycle 04 P3. Исходный обзор едет вместе с композицией — для первых лиц.
     *
     * Кабинет показывает то, чего модель не видит и видеть не должна: внешние
     * идентификаторы мастеров и цены журнала в разрезе мастера. Это не «менее
     * строгий» ответ, а ДРУГОЙ потребитель: авторизованный кабинет владельца
     * против языковой модели. Вычисление при этом одно — витрины разные.
     *
     * Поле служебное и в опубликованный срез не попадает: `publishAnalytics`
     * снимает его первым делом, рядом с внешним идентификатором сотрудника.
     */
    const operational = {
      ...this.safeAnalytics(overview),
      [SOURCE_OVERVIEW]: overview,
    };
    /**
     * 🔴 Cycle 04 P2. Стоимость записанного живёт в СОБСТВЕННОМ поле.
     *
     * Раньше её держали в `revenue`, а в денежной ветке то же поле
     * перезаписывалось подтверждённой кассой. Одно поле означало два разных
     * факта в зависимости от того, ответил ли финансовый контур, и снимок
     * метрик брал «записанное» уже из перезаписанного значения: в бою
     * `booked_value` и `revenue` оказывались одним и тем же числом
     * (60 105 000 копеек при настоящих 61 250 000).
     *
     * Теперь стоимость записанного снимается ДО любых замен и дальше не
     * трогается. Перепутать два факта нельзя: у каждого своё имя.
     */
    const bookedValue = operational.revenue;
    /**
     * 🔴 Cycle 04 P4. Средняя стоимость ЗАПИСАННОГО — по той же причине.
     *
     * `average_ticket` в денежной ветке перезаписывается кассой, поделённой на
     * число операций, а до неё содержит среднюю цену записи из журнала. Это
     * два разных факта в одном поле — ровно та ошибка, которую P2 уже
     * исправил для суммы. Снимаем среднюю по журналу ДО любых замен.
     *
     * Нужна она утреннему брифу: он показывал владельцу это число под именем
     * «средний чек», то есть выдавал цену записи за полученные деньги.
     */
    const averageBookedValue = operational.average_ticket;

    if (overview.data_source !== 'crm') {
      // Внутренний календарь не считает зарплату вовсе: расчёта нет ни у кого,
      // и это свойство источника, а не запрета по роли.
      //
      // Здесь `revenue` и `booked_value` — ОДНО И ТО ЖЕ ЧИСЛО, и это законно:
      // другого понятия денег у внутреннего календаря нет. Но факта всё равно
      // два, и у каждого своё основание.
      return this.withStaffSalary(
        {
          ...operational,
          booked_value: bookedValue,
          average_booked_value: averageBookedValue,
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.internalCalendar,
        },
      );
    }

    const failClosed = {
      ...operational,
      revenue: [],
      /**
       * 🔴 Стоимость записанного публикуется по решению ВЫЗЫВАЮЩЕГО.
       *
       * P7.1 прятал её целиком, и на то была причина: цены журнала маскировались
       * под кассу, потому что жили в одном поле с ней. Правило, ради которого
       * это делалось, никуда не делось — но теперь оно обеспечено иначе.
       * P2 развёл два факта физически: у каждого своё имя и своё основание, и
       * попасть в `revenue` цены журнала больше не могут ни при каком порядке
       * вызовов. Полное сокрытие перестало быть необходимым для инварианта.
       *
       * Это НЕ возврат старого поведения. Это отдельный операционный факт с
       * однозначной семантикой: `booked_value` с основанием `booked_prices`.
       */
      booked_value: actor.bookedValueAllowed ? bookedValue : [],
      /**
       * Средняя стоимость записанного — тот же операционный факт, то же
       * решение вызывающего. В `average_ticket` она попасть не может: там
       * живут деньги кассы, и подменять одно другим запрещено.
       */
      average_booked_value: actor.bookedValueAllowed ? averageBookedValue : [],
      /**
       * 🔴 Финальная сверка главы 4. Пустой массив рядом с `net`, у которого
       * причина есть, читался как «расходов не было». В режиме внешней CRM
       * операционный обзор расходы НЕ публикует вовсе: их владелец —
       * канонический сумматор, и приходят они расчётом прибыли. Раз число не
       * публикуется, обязано публиковаться основание.
       */
      expenses: [],
      expenses_status: 'unavailable' as const,
      expenses_unavailable_reason:
        'expenses_are_published_by_the_profitability_path_not_by_the_operational_overview',
      net: [],
      average_ticket: [],
      daily: operational.daily.map((entry) => ({ ...entry, revenue: [] })),
      staff_summary: operational.staff_summary.map((entry) => ({
        ...entry,
        revenue: [],
      })),
      // 🔴 booked_value — это цены из журнала записей, а не подтверждённая
      // касса. В CRM-режиме деньги признаются только через getBusinessFinance,
      // и оставлять здесь суммы значило бы отдать владельцу неподтверждённую
      // выручку в разрезе услуг — ровно то, ради чего fail-closed и написан.
      service_summary: operational.service_summary.map((entry) => ({
        ...entry,
        booked_value: [],
      })),
    };

    if (query.branchId) {
      return this.withStaffSalary(
        {
          ...failClosed,
          finance: this.unavailableFinance('company_scope_only'),
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.companyScope,
        },
      );
    }
    // 🔴 Начисления поимённо видит только тот, кому открыта касса салона.
    // Управляющий и руководитель филиала есть в разрезе мастеров по именам, но
    // в финансовых ролях их нет — им достаётся честное «недоступно с причиной»,
    // а не чужая зарплата в довесок к записям.
    if (!actor.financeAllowed) {
      return this.withStaffSalary(
        {
          ...failClosed,
          finance: this.unavailableFinance('role_restricted'),
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.roleRestricted,
        },
      );
    }
    if (!financeSummary) {
      return this.withStaffSalary(
        {
          ...failClosed,
          finance: this.unavailableFinance('finance_unavailable'),
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.financeUnavailable,
        },
      );
    }

    const revenue = this.record(financeSummary.revenue);
    const payroll = this.record(financeSummary.payroll);
    const revenueTotal =
      revenue.status === 'available' && revenue.verified === true
        ? this.safeMoneyAmount(revenue.total)
        : null;
    const transactionCount =
      typeof revenue.transaction_count === 'number' &&
      Number.isFinite(revenue.transaction_count)
        ? revenue.transaction_count
        : null;
    const averageTicket =
      revenueTotal && transactionCount && transactionCount > 0
        ? {
            currency: revenueTotal.currency,
            amount_kopecks: Math.round(
              revenueTotal.amount_kopecks / transactionCount,
            ),
            amount_major_units: this.majorUnits(
              Math.round(revenueTotal.amount_kopecks / transactionCount),
            ),
          }
        : null;
    /**
     * 🔴 Cycle 04 P4. Наличные и безналичные — деньги, а деньги складывает
     * владелец факта, а не текст отчёта.
     *
     * Вечерний отчёт складывал строки счетов сам: `filter(is_cash).reduce(+)`.
     * Это арифметика над кассой в презентации — то же самое, из-за чего
     * появлялись два разных числа выручки. Разбивка приходит из уже
     * прочитанной сводки, второго обращения к провайдеру не возникает.
     *
     * `null` означает «разбивки нет», а не «ноль»: счёт, который провайдер не
     * назвал, не превращается в отсутствие наличных.
     */
    const accountRows = Array.isArray(revenue.by_account)
      ? revenue.by_account.map((entry) => this.record(entry))
      : null;
    const accountTotal = (match: (isCash: unknown) => boolean) => {
      if (!accountRows) return null;
      const rows = accountRows.filter((row) => match(row.is_cash));
      if (rows.length === 0) {
        // Строк такого рода нет — это измеренный ноль ровно тогда, когда сама
        // разбивка получена. Валюта берётся у итога: другой в сводке нет.
        return revenueTotal
          ? { currency: revenueTotal.currency, amount_kopecks: 0 }
          : null;
      }
      let sum = 0;
      for (const row of rows) {
        sum += this.optionalMetricNumber(row.amount_kopecks) ?? 0;
      }
      const currency =
        typeof rows[0].currency === 'string'
          ? rows[0].currency
          : (revenueTotal?.currency ?? 'RUB');
      return { currency, amount_kopecks: sum };
    };
    const payrollAvailable =
      payroll.status === 'available' && payroll.verified === true;
    const staffRevenue = Array.isArray(revenue.by_staff)
      ? revenue.by_staff.flatMap((entry) => {
          const row = this.record(entry);
          const rawStaffId = row.staff_id;
          const staffExternalId =
            typeof rawStaffId === 'string' || typeof rawStaffId === 'number'
              ? String(rawStaffId).trim()
              : '';
          const amount = this.safeMoneyAmount(row);
          if (!staffExternalId || !amount) {
            return [];
          }
          return [
            {
              staff_external_id: staffExternalId,
              /**
               * 🔴 Cycle 04 P5. Ноль операций при непустой сумме — это деньги
               * ниоткуда. Источник может назвать сумму и промолчать о числе
               * операций; тогда числа НЕТ, и презентация обязана это увидеть.
               */
              transaction_count: this.optionalMetricNumber(
                row.transaction_count,
              ),
              amount,
            },
          ];
        })
      : [];
    const serviceRevenue = Array.isArray(revenue.by_service)
      ? revenue.by_service.flatMap((entry) => {
          const row = this.record(entry);
          const rawServiceId = row.service_id;
          const serviceExternalId =
            typeof rawServiceId === 'string' || typeof rawServiceId === 'number'
              ? String(rawServiceId).trim()
              : '';
          const amount = this.safeMoneyAmount(row);
          if (!serviceExternalId || !amount) {
            return [];
          }
          return [
            {
              service_external_id: serviceExternalId,
              name: typeof row.name === 'string' ? row.name : 'Услуга',
              transaction_count:
                this.optionalMetricNumber(row.transaction_count) ?? 0,
              amount,
            },
          ];
        })
      : [];

    return this.withStaffSalary(
      {
        ...failClosed,
        period: financeSummary.period ?? failClosed.period,
        revenue: revenueTotal ? [revenueTotal] : [],
        average_ticket: averageTicket ? [averageTicket] : [],
        finance: {
          source: financeSummary.source ?? 'external_crm',
          provider: financeSummary.provider ?? null,
          verified: financeSummary.verified === true,
          revenue: {
            status: revenue.status ?? 'unavailable',
            verified: revenue.verified === true,
            transaction_count: transactionCount,
            total: revenueTotal,
            cash_total: accountTotal((value) => value === true),
            cashless_total: accountTotal((value) => value === false),
            /**
             * Счета, у которых провайдер не сказал, наличные они или нет.
             * Ненулевое значение означает, что разбивка НЕ полна и сумма
             * «наличные + безнал» меньше кассы — это обязано быть видно.
             */
            unclassified_total: accountTotal(
              (value) => typeof value !== 'boolean',
            ),
            by_staff: staffRevenue,
            by_service: serviceRevenue,
            staff_attribution_status:
              revenue.staff_attribution_status ?? 'unavailable',
            staff_attribution_coverage_percent: this.optionalMetricNumber(
              revenue.staff_attribution_coverage_percent,
            ),
            unattributed_service_total: this.safeMoneyAmount(
              revenue.unattributed_service_total,
            ),
            unattributed_service_transaction_count:
              this.optionalMetricNumber(
                revenue.unattributed_service_transaction_count,
              ) ?? 0,
            service_attribution_status:
              revenue.service_attribution_status ?? 'unavailable',
            service_attribution_coverage_percent: this.optionalMetricNumber(
              revenue.service_attribution_coverage_percent,
            ),
            unattributed_service_breakdown_total: this.safeMoneyAmount(
              revenue.unattributed_service_breakdown_total,
            ),
            unattributed_service_breakdown_transaction_count:
              this.optionalMetricNumber(
                revenue.unattributed_service_breakdown_transaction_count,
              ) ?? 0,
          },
          payroll: {
            status: payroll.status ?? 'unavailable',
            verified: payroll.verified === true,
            /**
             * 🔴 Cycle 04 P4. Поимённые начисления смены — здесь, а не у
             * потребителя.
             *
             * Вечерний отчёт брал их прямо из ответа CRM и печатал имя оттуда
             * же — мимо решения о раскрытии. Строка со статусом `unavailable`
             * при этом исчезала молча: её отсеивал фильтр «начислено > 0», и
             * мастер, которому не посчиталось, выглядел как мастер, которому
             * не начислили.
             *
             * Внешний идентификатор нужен, чтобы имя выдал ТОТ ЖЕ механизм
             * раскрытия, что и в разрезе мастеров. Наружу он не уходит:
             * `publishedFinance` снимает его вместе с выдачей имени.
             */
            staff: Array.isArray(payroll.staff)
              ? payroll.staff.map((entry) => {
                  const row = this.record(entry);
                  const accrued = this.safeMoneyAmount(row.accrued);
                  return {
                    external_id:
                      typeof row.staff_id === 'string' ? row.staff_id : null,
                    status:
                      row.status === 'available' && row.verified === true
                        ? 'available'
                        : 'unavailable',
                    accrued:
                      row.status === 'available' && row.verified === true
                        ? accrued
                        : null,
                    paid:
                      row.status === 'available' && row.verified === true
                        ? this.safeMoneyAmount(row.paid)
                        : null,
                  };
                })
              : [],
            accrued_total: payrollAvailable
              ? this.safeMoneyAmount(payroll.accrued_total)
              : null,
            paid_total: payrollAvailable
              ? this.safeMoneyAmount(payroll.paid_total)
              : null,
            balance_total: payrollAvailable
              ? this.safeMoneyAmount(payroll.balance_total)
              : null,
          },
          warning_codes: this.safeWarningCodes(financeSummary.warnings),
        },
      },
      this.staffSalaryScope(financeSummary),
    );
  }

  /**
   * Личный срез сотрудника вместе с его собственными начислениями.
   *
   * 🔴 Строки коллег не должны существовать даже внутри обработчика: разрез
   * сужается до самого спрашивающего ДО того, как что-либо уходит в публикацию.
   */

  /**
   * Переходный вызов для поэтапного обновления backend-компонентов.
   * В актуальном сервисе всегда существует расширенный метод; fallback
   * сохраняет работоспособность старых тестовых и rolling-deploy контрактов.
   */
  private businessOperationalOverview(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
  ): Promise<unknown> {
    const analytics = this.analyticsService as unknown as {
      getBusinessOperationalOverview?: (
        scopedTenantId: string,
        range: AnalyticsRangeQueryDto,
      ) => Promise<unknown>;
      getBusinessOverview: (
        scopedTenantId: string,
        range: AnalyticsRangeQueryDto,
      ) => Promise<unknown>;
    };
    return typeof analytics.getBusinessOperationalOverview === 'function'
      ? analytics.getBusinessOperationalOverview(tenantId, query)
      : analytics.getBusinessOverview(tenantId, query);
  }

  private employeeOperationalOverview(
    tenantId: string,
    userId: string,
    query: AnalyticsRangeQueryDto,
  ): Promise<unknown> {
    const analytics = this.analyticsService as unknown as {
      getEmployeeOperationalOverview?: (
        scopedTenantId: string,
        scopedUserId: string,
        range: AnalyticsRangeQueryDto,
      ) => Promise<unknown>;
      getEmployeeOverview: (
        scopedTenantId: string,
        scopedUserId: string,
        range: AnalyticsRangeQueryDto,
      ) => Promise<unknown>;
    };
    return typeof analytics.getEmployeeOperationalOverview === 'function'
      ? analytics.getEmployeeOperationalOverview(tenantId, userId, query)
      : analytics.getEmployeeOverview(tenantId, userId, query);
  }

  /**
   * Начисления самому сотруднику — и только ему.
   *
   * Мастер имеет право знать, сколько ему начислено: это его собственные
   * деньги, а не финансы салона. Но источник company-scoped, поэтому строка
   * выбирается по идентификатору сотрудника из ответа аналитики, и если его
   * нет — разрез закрывается целиком, а не открывается на всех.
   */

  /**
   * Личный срез сотрудника вместе с его собственными начислениями.
   *
   * 🔴 Строки коллег не должны существовать даже внутри обработчика: разрез
   * сужается до самого спрашивающего ДО того, как что-либо уходит в публикацию.
   */
  private async readEmployeeComposition(
    actor: { tenantId: string; userId: string },
    query: AnalyticsRangeQueryDto,
  ) {
    const overview = await this.employeeOperationalOverview(
      actor.tenantId,
      actor.userId,
      query,
    );
    const internal = this.safeAnalytics(overview);
    // Стоимость записанного — собственным полем и здесь: одно имя на всю
    // систему, а не «в этой ветке можно и из revenue».
    const composition = {
      ...internal,
      booked_value: internal.revenue,
      [SOURCE_OVERVIEW]: overview,
    };
    return this.withStaffSalary(
      composition,
      await this.employeeSalaryScope(actor.tenantId, query, composition),
    );
  }

  /**
   * Переходный вызов для поэтапного обновления backend-компонентов.
   * В актуальном сервисе всегда существует расширенный метод; fallback
   * сохраняет работоспособность старых тестовых и rolling-deploy контрактов.
   */

  /**
   * Начисления самому сотруднику — и только ему.
   *
   * Мастер имеет право знать, сколько ему начислено: это его собственные
   * деньги, а не финансы салона. Но источник company-scoped, поэтому строка
   * выбирается по идентификатору сотрудника из ответа аналитики, и если его
   * нет — разрез закрывается целиком, а не открывается на всех.
   */
  private async employeeSalaryScope(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
    internal: unknown,
  ): Promise<StaffSalaryScope> {
    const data = this.record(internal);
    if (data.data_source !== 'crm') {
      return {
        status: 'unavailable',
        reason: STAFF_SALARY_UNAVAILABLE.internalCalendar,
      };
    }
    const externalId = data.employee_external_id;
    if (typeof externalId !== 'string' || externalId === '') {
      return {
        status: 'unavailable',
        reason: STAFF_SALARY_UNAVAILABLE.identityUnknown,
      };
    }
    if (query.branchId) {
      return {
        status: 'unavailable',
        reason: STAFF_SALARY_UNAVAILABLE.companyScope,
      };
    }

    const finance = await this.analyticsService.getStaffFinance(
      tenantId,
      query,
    );
    if (!finance) {
      return {
        status: 'unavailable',
        reason: STAFF_SALARY_UNAVAILABLE.financeUnavailable,
      };
    }
    const scope = this.staffSalaryScope(finance);
    if (scope.status !== 'available') {
      return scope;
    }
    const own = scope.rows.get(externalId);
    return {
      status: 'available',
      rows: own
        ? new Map<string, StaffSalaryRow>([[externalId, own]])
        : new Map<string, StaffSalaryRow>(),
    };
  }

  /**
   * Начисления по мастерам из финансовой сводки CRM.
   *
   * 🔴 Строка принимается только подтверждённой: `status: 'available'` и
   * `verified: true` У САМОЙ СТРОКИ. Общий статус расчёта здесь не решает
   * ничего — при `partial` часть сотрудников посчитана честно, и прятать их
   * начисления из-за соседа, по которому CRM промолчала, значило бы терять
   * подтверждённые деньги. Обратное тоже верно: при `available` в целом
   * непосчитанная строка всё равно остаётся недоступной.
   *
   * Начислено обязано быть суммой: строка без `accrued` — это не «ноль
   * начислено», а «расчёт не отдан».
   */

  /**
   * Начисления по мастерам из финансовой сводки CRM.
   *
   * 🔴 Строка принимается только подтверждённой: `status: 'available'` и
   * `verified: true` У САМОЙ СТРОКИ. Общий статус расчёта здесь не решает
   * ничего — при `partial` часть сотрудников посчитана честно, и прятать их
   * начисления из-за соседа, по которому CRM промолчала, значило бы терять
   * подтверждённые деньги. Обратное тоже верно: при `available` в целом
   * непосчитанная строка всё равно остаётся недоступной.
   *
   * Начислено обязано быть суммой: строка без `accrued` — это не «ноль
   * начислено», а «расчёт не отдан».
   */
  private staffSalaryScope(value: unknown): StaffSalaryScope {
    const summary = this.record(value);
    const payroll = this.record(summary.payroll);
    const rows = Array.isArray(payroll.staff) ? payroll.staff : [];
    if (payroll.status === 'unavailable' || rows.length === 0) {
      return {
        status: 'unavailable',
        reason: this.safeWarningCodes(summary.warnings).includes(
          STAFF_SALARY_UNAVAILABLE.rangeTooLarge,
        )
          ? STAFF_SALARY_UNAVAILABLE.rangeTooLarge
          : STAFF_SALARY_UNAVAILABLE.payrollUnavailable,
      };
    }

    const accepted = new Map<string, StaffSalaryRow>();
    for (const entry of rows) {
      const item = this.record(entry);
      const staffId =
        typeof item.staff_id === 'string' ? item.staff_id.trim() : '';
      const accrued = this.safeMoneyAmount(item.accrued);
      if (
        !staffId ||
        item.status !== 'available' ||
        item.verified !== true ||
        !accrued
      ) {
        continue;
      }
      // 🔴 Имя сотрудника из расчёта зарплаты сюда НЕ переносится. Мастер
      // называется тем же именем, что и в операционном разрезе, — иначе
      // граница «кому вообще показывать имена» проходила бы в двух местах и
      // разъехалась бы при первой же правке.
      accepted.set(staffId, {
        accrued,
        paid: this.safeMoneyAmount(item.paid),
      });
    }
    return { status: 'available', rows: accepted };
  }

  /** Дописывает в строки мастеров начисления — или причину, по которой их нет. */

  /** Дописывает в строки мастеров начисления — или причину, по которой их нет. */
  private withStaffSalary(value: unknown, scope: StaffSalaryScope) {
    const data = this.record(value);
    return {
      ...data,
      staff_summary: this.staffRows(data).map((row) => ({
        ...row.entry,
        salary: this.staffSalary(row.externalId, scope),
      })),
    };
  }

  private staffSalary(externalId: string | null, scope: StaffSalaryScope) {
    if (scope.status !== 'available') {
      return this.unavailableStaffSalary(scope.reason);
    }
    const row = externalId ? scope.rows.get(externalId) : undefined;
    if (!row) {
      return this.unavailableStaffSalary(
        STAFF_SALARY_UNAVAILABLE.rowUnavailable,
      );
    }
    return {
      status: 'available',
      basis: 'crm_payroll_accrual',
      accrued: row.accrued,
      paid: row.paid,
      unavailable_reason: null,
    };
  }

  private unavailableStaffSalary(reason: string) {
    return {
      status: 'unavailable',
      basis: null,
      accrued: null,
      paid: null,
      unavailable_reason: reason,
    };
  }

  /**
   * Линейный прогноз подтверждённой кассы до конца текущей недели, месяца
   * или года. Для закрытого/фиксированного окна прогноз равен факту.
   */

  private unavailableFinance(code: string) {
    return {
      source: 'external_crm',
      provider: null,
      verified: false,
      revenue: {
        status: 'unavailable',
        verified: false,
        transaction_count: null,
        total: null,
        by_staff: [],
        by_service: [],
        staff_attribution_status: 'unavailable',
        staff_attribution_coverage_percent: null,
        unattributed_service_total: null,
        unattributed_service_transaction_count: 0,
        service_attribution_status: 'unavailable',
        service_attribution_coverage_percent: null,
        unattributed_service_breakdown_total: null,
        unattributed_service_breakdown_transaction_count: 0,
      },
      payroll: {
        status: 'unavailable',
        verified: false,
        accrued_total: null,
        paid_total: null,
        balance_total: null,
      },
      warning_codes: [code],
    };
  }

  private safeAnalytics(value: unknown) {
    const result = this.record(value);
    return {
      data_source: result.data_source ?? null,
      period: result.period ?? null,
      appointments: result.appointments ?? null,
      revenue: this.safeMoneyEntries(result.revenue),
      expenses: this.safeMoneyEntries(result.expenses),
      net: this.safeMoneyEntries(result.net),
      average_ticket: this.safeMoneyEntries(result.average_ticket),
      daily: Array.isArray(result.daily)
        ? result.daily.map((entry) => {
            const item = this.record(entry);
            /**
             * 🔴 Cycle 04 P5. Корзины статусов дня — `null`, а не ноль.
             *
             * Здесь стояло `?? 0` по каждому полю. Доказательство, что это не
             * теоретический риск: `scheduled` / `completed` / `no_show` в
             * ответе аналитики существуют ТОЛЬКО у операционного среза
             * (`includeOperationalStatusBuckets`). Запасной путь чтения
             * (`getBusinessOverview`, см. `businessOperationalOverview`) их не
             * возвращает — и канон публиковал измеренные нули по корзинам,
             * которых источник не считал вовсе.
             *
             * `appointments` и `cancelled` источник отдаёт всегда, но и им
             * ноль по умолчанию не нужен: отсутствие поля — это отсутствие
             * измерения, а не пустой день.
             */
            const count = (value: unknown) => this.optionalMetricNumber(value);
            const appointments = count(item.appointments);
            return {
              date: item.date ?? null,
              appointments,
              total: count(item.total) ?? appointments,
              active: count(item.active) ?? appointments,
              scheduled: count(item.scheduled),
              completed: count(item.completed),
              cancelled: count(item.cancelled),
              no_show: count(item.no_show),
              revenue: this.safeMoneyEntries(item.revenue),
            };
          })
        : [],
      data_quality: result.data_quality ?? null,
      // 🔴 Cycle 04 P0. Полнота и присутствие обязаны доехать до слоя, который
      // отвечает владельцу: без них «0» и «не измерено» — одна строка.
      completeness: result.completeness ?? null,
      attendance: result.attendance ?? null,
      // 🔴 Промежуточное представление: внешний идентификатор мастера здесь
      // ещё есть, потому что по нему идёт сопоставление периодов и различение
      // тёзок. Наружу он не уходит никогда — publishAnalytics его снимает.
      // Возвращать safeAnalytics из обработчика напрямую нельзя.
      //
      // Идентификатор самого спрашивающего сотрудника — тоже служебный ключ:
      // по нему личный срез отфильтровывается до одного человека, если
      // источник вдруг вернул чужие строки.
      employee_external_id:
        typeof this.record(result.employee).provider_id === 'string' &&
        this.record(result.employee).provider_id !== ''
          ? (this.record(result.employee).provider_id as string)
          : null,
      staff_summary: Array.isArray(result.staff)
        ? result.staff.map((entry) => {
            const item = this.record(entry);
            return {
              staff_external_id:
                typeof item.staff_external_id === 'string'
                  ? item.staff_external_id
                  : null,
              staff_name: typeof item.name === 'string' ? item.name : null,
              /**
               * 🔴 Финальная сверка главы 4. Здесь стояла ВТОРАЯ формула того
               * же числа: при отсутствии `total` он складывался из записей и
               * отмен, каждая с `?? 0`. Считает итог владелец агрегации; если
               * он его не опубликовал (операционные корзины скрыты по решению
               * вызывающего), это «не публиковали», а не «ноль».
               */
              total: this.optionalMetricNumber(item.total),
              appointments: item.appointments ?? 0,
              scheduled: this.optionalMetricNumber(item.scheduled),
              completed: this.optionalMetricNumber(item.completed),
              // Отмены по мастеру: раньше их не было ни в одном поле, и на
              // вопрос «у кого больше отмен» отвечать было нечем.
              cancelled: this.optionalMetricNumber(item.cancelled) ?? 0,
              no_show: this.optionalMetricNumber(item.no_show),
              cancellation_rate_percent:
                this.optionalMetricNumber(item.cancellation_rate_percent) ?? 0,
              unique_clients:
                this.optionalMetricNumber(item.unique_clients) ?? 0,
              repeat_clients_in_period:
                this.optionalMetricNumber(item.repeat_clients_in_period) ?? 0,
              revenue: this.safeMoneyEntries(item.revenue),
              booked_minutes:
                typeof item.booked_minutes === 'number' &&
                Number.isFinite(item.booked_minutes)
                  ? item.booked_minutes
                  : 0,
              services: Array.isArray(item.services)
                ? item.services.map((service) => {
                    const row = this.record(service);
                    return {
                      name: typeof row.name === 'string' ? row.name : 'Услуга',
                      appointments: row.appointments ?? 0,
                    };
                  })
                : [],
            };
          })
        : [],
      service_summary: Array.isArray(result.services)
        ? result.services.map((entry) => {
            const item = this.record(entry);
            return {
              service_external_id:
                typeof item.service_external_id === 'string'
                  ? item.service_external_id
                  : null,
              name: typeof item.name === 'string' ? item.name : 'Услуга',
              appointments: item.appointments ?? 0,
              booked_value: this.safeMoneyEntries(item.booked_value),
            };
          })
        : [],
    };
  }

  /**
   * Строки мастеров промежуточного представления.
   *
   * Отдельный разбор нужен потому, что по этим строкам работают сразу три
   * вещи: раздача имён, сопоставление периодов и разрез по услугам.
   */

  /**
   * Убирает внешний идентификатор мастера, оставляя имя.
   *
   * 🔴 Идентификатор CRM наружу не уходит ни при каких ролях: он ключ к чужой
   * системе, а не показатель. Служебный `employee_external_id` снимается
   * здесь же — он живёт только внутри обработчика.
   */
  private publishAnalytics(
    value: unknown,
    /**
     * 🔴 Раскрытие ОБЯЗАТЕЛЬНО. Раньше здесь был запасной путь «имён нет —
     * раскрыть всех», и он существовал ровно потому, что решение о раскрытии
     * жило в том же классе. Теперь решение принимает вызывающий, а молчаливого
     * умолчания «показать всех» больше нет: забыть передать границу нельзя.
     */
    scope: StaffDisclosure,
  ): Record<string, unknown> {
    const data = this.record(value);
    const published: Record<string, unknown> = { ...data };
    delete published.employee_external_id;
    // Служебный исходный обзор наружу не уходит НИКОГДА: в нём внешние
    // идентификаторы мастеров и цены журнала в их разрезе.
    delete published[SOURCE_OVERVIEW];
    if (data.finance !== undefined) {
      published.finance = this.publishedFinance(data.finance, scope);
    }
    const staffScope = scope;
    return {
      ...published,
      service_summary: Array.isArray(data.service_summary)
        ? data.service_summary.map((entry) => {
            const row = this.record(entry);
            const serviceExternalId =
              typeof row.service_external_id === 'string'
                ? row.service_external_id
                : null;
            return {
              name: typeof row.name === 'string' ? row.name : 'Услуга',
              appointments: this.optionalMetricNumber(row.appointments) ?? 0,
              booked_value: this.safeMoneyEntries(row.booked_value),
              confirmed_revenue: this.serviceConfirmedRevenue(
                data,
                serviceExternalId,
              ),
            };
          })
        : [],
      staff_summary: this.staffRows(data)
        .filter(
          (row) =>
            row.externalId !== null &&
            (staffScope.allowedExternalIds === null ||
              staffScope.allowedExternalIds.has(row.externalId)),
        )
        .map((row) => ({
          name: staffScope.names.get(row.externalId as string) ?? null,
          // Та же правка, что и в срезе выше: итог не пересчитывается здесь,
          // а скрытая корзина остаётся неизвестной, а не нулём.
          total: this.optionalMetricNumber(row.entry.total),
          appointments: row.entry.appointments ?? 0,
          scheduled: this.optionalMetricNumber(row.entry.scheduled),
          completed: this.optionalMetricNumber(row.entry.completed),
          cancelled: this.optionalMetricNumber(row.entry.cancelled) ?? 0,
          no_show: this.optionalMetricNumber(row.entry.no_show),
          cancellation_rate_percent:
            this.optionalMetricNumber(row.entry.cancellation_rate_percent) ?? 0,
          unique_clients:
            this.optionalMetricNumber(row.entry.unique_clients) ?? 0,
          repeat_clients_in_period:
            this.optionalMetricNumber(row.entry.repeat_clients_in_period) ?? 0,
          revenue: this.safeMoneyEntries(row.entry.revenue),
          // 🔴 Два разных поля про деньги мастера, и перепутать их нельзя.
          // `confirmed_revenue` — только финансовые операции услуг, которые
          // YClients связал с записью и конкретным мастером. Несвязанный
          // остаток не распределяется приблизительно.
          // `salary` — сколько ЕМУ начислено по расчёту зарплаты CRM. Это
          // расход салона, а не его выручка, и подменять одно другим — врать
          // и о человеке, и о салоне.
          confirmed_revenue: this.staffConfirmedRevenue(data, row.externalId),
          salary: this.publishedStaffSalary(row.entry.salary),
          booked_minutes: row.entry.booked_minutes ?? 0,
          services: this.staffServiceRows(row.entry),
        })),
    };
  }

  /** Подтверждённая касса услуг, достоверно связанная с мастером в CRM. */

  /** Служебные CRM-ID нужны для сопоставления, но не должны уходить модели. */
  private publishedFinance(value: unknown, scope: StaffDisclosure) {
    const finance = this.record(value);
    const revenue = this.record(finance.revenue);
    const publishedRevenue = { ...revenue };
    delete publishedRevenue.by_staff;
    delete publishedRevenue.by_service;
    const payroll = this.record(finance.payroll);
    const publishedPayroll = Array.isArray(payroll.staff)
      ? {
          ...payroll,
          /**
           * 🔴 Нераскрытая строка выпадает ЦЕЛИКОМ, а не теряет имя.
           *
           * Разрез мастеров рядом делает именно так, и две поимённые витрины
           * обязаны жить по одному правилу: безымянная строка с суммой — это
           * всё ещё поимённый список, просто сопоставляемый по позиции.
           */
          staff: payroll.staff.flatMap((entry) => {
            const row = this.record(entry);
            const externalId =
              typeof row.external_id === 'string' ? row.external_id : null;
            const allowed =
              externalId !== null &&
              (scope.allowedExternalIds === null ||
                scope.allowedExternalIds.has(externalId));
            if (!allowed) return [];
            return [
              {
                // Имя выдаёт то же раскрытие, что и в разрезе мастеров:
                // граница «кому показывать имена» одна на всю систему.
                name: scope.names.get(externalId) ?? null,
                status: row.status ?? 'unavailable',
                accrued: row.accrued ?? null,
                paid: row.paid ?? null,
              },
            ];
          }),
        }
      : payroll;
    return {
      ...finance,
      revenue: publishedRevenue,
      ...(finance.payroll !== undefined ? { payroll: publishedPayroll } : {}),
    };
  }

  /**
   * Начисления строки мастера на выдачу.
   *
   * Отсутствие поля — это не «ноль», а «отчёт зарплату не запрашивал»: без
   * явной причины пустое место читается как отсутствие начислений.
   */

  /**
   * Начисления строки мастера на выдачу.
   *
   * Отсутствие поля — это не «ноль», а «отчёт зарплату не запрашивал»: без
   * явной причины пустое место читается как отсутствие начислений.
   */
  private publishedStaffSalary(value: unknown) {
    const salary = this.record(value);
    const accrued = this.safeMoneyAmount(salary.accrued);
    if (salary.status !== 'available' || !accrued) {
      return this.unavailableStaffSalary(
        typeof salary.unavailable_reason === 'string' &&
          salary.unavailable_reason !== ''
          ? salary.unavailable_reason
          : STAFF_SALARY_UNAVAILABLE.notRequested,
      );
    }
    return {
      status: 'available',
      basis: 'crm_payroll_accrual',
      accrued,
      paid: this.safeMoneyAmount(salary.paid),
      unavailable_reason: null,
    };
  }

  /**
   * Сравнение мастеров между периодами.
   *
   * 🔴 Ключ сопоставления — внешний идентификатор. Ни имя (оно повторяется и
   * меняется), ни позиция в массиве (она зависит от того, кто первым вышел в
   * смену) для этого не годятся. Мастер, отсутствующий в одном из периодов,
   * попадает в результат с нулём на своей стороне: уход человека из смены —
   * это тоже ответ на вопрос «что изменилось».
   *
   * 🔴 Разрез по услугам ВНУТРИ мастера — ради него всё и считается. Без него
   * фразы «у Ильи просела «Борода» на 12 записей» не существует: числа 12 нет
   * ни в одном поле, сторож чисел бракует ответ, и владелец получает шаблон.
   */

  /** Подтверждённая касса услуг, достоверно связанная с мастером в CRM. */
  private staffConfirmedRevenue(
    data: Record<string, unknown>,
    externalId: string | null,
  ) {
    if (data.data_source === 'crm' && externalId) {
      const finance = this.record(data.finance);
      const revenue = this.record(finance.revenue);
      const rows = Array.isArray(revenue.by_staff) ? revenue.by_staff : [];
      const match = rows
        .map((entry) => this.record(entry))
        .find((entry) => entry.staff_external_id === externalId);
      const amount = match ? this.safeMoneyAmount(match.amount) : null;
      if (match && amount) {
        return {
          status: 'available',
          basis: 'crm_financial_transaction_attribution',
          amount,
          /**
           * 🔴 Cycle 04 P5. Ноль операций при непустой сумме — деньги ниоткуда.
           * Источник может назвать сумму и промолчать о числе операций.
           */
          transaction_count: this.optionalMetricNumber(match.transaction_count),
          attribution_status: revenue.staff_attribution_status ?? 'unavailable',
          attribution_coverage_percent: this.optionalMetricNumber(
            revenue.staff_attribution_coverage_percent,
          ),
          unavailable_reason: null,
        };
      }
    }
    return {
      status: 'unavailable',
      basis: null,
      amount: null,
      unavailable_reason:
        data.data_source === 'crm'
          ? STAFF_CONFIRMED_REVENUE_UNAVAILABLE.crm
          : STAFF_CONFIRMED_REVENUE_UNAVAILABLE.maya,
    };
  }

  /**
   * Касса услуги публикуется только по одноуслуговым записям,
   * которые YClients связал с подтверждённой финансовой операцией.
   */

  /**
   * Касса услуги публикуется только по одноуслуговым записям,
   * которые YClients связал с подтверждённой финансовой операцией.
   */
  private serviceConfirmedRevenue(
    data: Record<string, unknown>,
    externalId: string | null,
  ) {
    if (data.data_source === 'crm' && externalId) {
      const finance = this.record(data.finance);
      const revenue = this.record(finance.revenue);
      const rows = Array.isArray(revenue.by_service) ? revenue.by_service : [];
      const match = rows
        .map((entry) => this.record(entry))
        .find((entry) => entry.service_external_id === externalId);
      const amount = match ? this.safeMoneyAmount(match.amount) : null;
      if (match && amount) {
        return {
          status: 'available',
          basis: 'crm_single_service_transaction_attribution',
          amount,
          /**
           * 🔴 Cycle 04 P5. Ноль операций при непустой сумме — деньги ниоткуда.
           * Источник может назвать сумму и промолчать о числе операций.
           */
          transaction_count: this.optionalMetricNumber(match.transaction_count),
          attribution_status:
            revenue.service_attribution_status ?? 'unavailable',
          attribution_coverage_percent: this.optionalMetricNumber(
            revenue.service_attribution_coverage_percent,
          ),
          unavailable_reason: null,
        };
      }
    }
    return {
      status: 'unavailable',
      basis: null,
      amount: null,
      unavailable_reason:
        data.data_source === 'crm'
          ? 'crm_confirmed_service_revenue_not_attributed'
          : 'internal_calendar_has_no_confirmed_service_cash',
    };
  }

  /** Служебные CRM-ID нужны для сопоставления, но не должны уходить модели. */

  /**
   * Строки мастеров промежуточного представления.
   *
   * Отдельный разбор нужен потому, что по этим строкам работают сразу три
   * вещи: раздача имён, сопоставление периодов и разрез по услугам.
   */
  private staffRows(value: unknown): Array<{
    externalId: string | null;
    name: string | null;
    appointments: number;
    entry: Record<string, unknown>;
  }> {
    const data = this.record(value);
    if (!Array.isArray(data.staff_summary)) {
      return [];
    }
    return data.staff_summary.map((entry) => {
      const item = this.record(entry);
      return {
        externalId:
          typeof item.staff_external_id === 'string' &&
          item.staff_external_id !== ''
            ? item.staff_external_id
            : null,
        name:
          typeof item.staff_name === 'string' && item.staff_name.trim() !== ''
            ? item.staff_name.trim()
            : null,
        appointments: this.optionalMetricNumber(item.appointments) ?? 0,
        entry: item,
      };
    });
  }

  /** Услуги внутри строки мастера — уже нормализованные safeAnalytics. */

  /** Услуги внутри строки мастера — уже нормализованные safeAnalytics. */
  private staffServiceRows(
    entry: Record<string, unknown>,
  ): Array<{ name: string; appointments: number }> {
    if (!Array.isArray(entry.services)) {
      return [];
    }
    return entry.services.map((service) => {
      const row = this.record(service);
      return {
        name: typeof row.name === 'string' ? row.name : 'Услуга',
        appointments: this.optionalMetricNumber(row.appointments) ?? 0,
      };
    });
  }

  /**
   * Кого и под каким именем показывать в разрезе мастеров.
   *
   * `names` пусто и `allowedExternalIds` — пустое множество означают «разрез
   * закрыт»: наружу уйдут пустые массивы. Отдельный флаг для этого не нужен,
   * фильтр по множеству и так fail-closed.
   */

  private staffServiceMap(
    entry: Record<string, unknown> | undefined,
  ): Map<string, number> {
    if (!entry) {
      return new Map<string, number>();
    }
    // 🔴 Складываем, а не перезаписываем. Аналитика копит услуги по
    // идентификатору, а сюда они приходят уже без него — только с названием.
    // Прежний `new Map(...)` при двух одноимённых позициях молча оставлял
    // последнюю, и объём терялся: дельта выходила −5 вместо −15, причём
    // ответ противоречил сам себе. Идентификатора здесь нет, поэтому
    // одноимённые позиции честно суммируем.
    const rows = new Map<string, number>();
    for (const service of this.staffServiceRows(entry)) {
      rows.set(
        service.name,
        (rows.get(service.name) ?? 0) + service.appointments,
      );
    }
    return rows;
  }

  private businessMetricSnapshot(value: unknown) {
    const data = this.record(value);
    const appointments = this.record(data.appointments);
    const finance = this.record(data.finance);
    const financeRevenue = this.record(finance.revenue);
    /**
     * 🔴 ДВА РАЗНЫХ ЧИСЛА, а не одно с запасным вариантом.
     *
     * Здесь стоял `финансовая выручка ?? цены журнала`. При недоступном
     * кассовом блоке метрика молча становилась стоимостью ЗАПИСАННОГО и уезжала
     * дальше — вплоть до карточки «Сводка салона» — как рубли выручки. Само
     * основание (`revenue_basis`), которое P4 завёл в HTTP-ответе, на эту
     * сторону не переходило вовсе.
     *
     * Теперь касса остаётся кассой, забронированное — забронированным, и у
     * числа есть основание.
     */
    const financialRevenue = this.safeMoneyAmount(financeRevenue.total);
    /**
     * 🔴 Cycle 04 P2. Стоимость записанного читается из СВОЕГО поля.
     *
     * Здесь стояло `data.revenue[0]` — то самое поле, которое денежная ветка
     * композиции перезаписывает кассой. Из-за этого у CRM-арендатора «касса» и
     * «стоимость записанного» были одним числом, и владельцу отвечали одной
     * величиной на два разных вопроса.
     */
    const bookedValue = Array.isArray(data.booked_value)
      ? this.safeMoneyAmount(data.booked_value[0])
      : null;
    /**
     * 🔴 Основание описывает ВЫРУЧКУ, а не «какое-нибудь число рядом».
     *
     * У внутреннего календаря другого понятия денег нет, и там выручка честно
     * стоит на ценах журнала. У CRM-арендатора деньгами признаётся только
     * кассовый контур: нет кассы — нет выручки, и стоимость записанного её не
     * заменяет, сколько бы её ни было.
     */
    const revenueBasis: RevenueBasis = financialRevenue
      ? 'provider_transactions'
      : data.data_source === 'crm'
        ? 'unavailable'
        : bookedValue
          ? 'booked_prices'
          : 'unavailable';
    const averageTicket = Array.isArray(data.average_ticket)
      ? this.safeMoneyAmount(data.average_ticket[0])
      : null;
    /**
     * 🔴 Cycle 04 P4. Средняя стоимость записи по ценам журнала.
     *
     * Отдельная метрика с отдельным именем, потому что это НЕ средний чек:
     * средний чек стоит на кассе и без кассы недоступен. Утренний бриф
     * показывал именно эту величину, называя её средним чеком.
     */
    const averageBookedValue = Array.isArray(data.average_booked_value)
      ? this.safeMoneyAmount(data.average_booked_value[0])
      : null;
    return {
      // Только подтверждённая касса. Нет кассы — нет числа.
      revenue_amount_kopecks: financialRevenue?.amount_kopecks ?? null,
      /** Стоимость записанного. Отдельное имя, потому что это другое понятие. */
      booked_value_amount_kopecks: bookedValue?.amount_kopecks ?? null,
      /**
       * Основание стоимости записанного — своё, а не заимствованное у выручки.
       * Два факта могут законно совпасть по величине и всё равно остаются
       * двумя фактами: у внутреннего календаря это одно и то же число.
       */
      booked_value_basis: (bookedValue
        ? 'booked_prices'
        : 'unavailable') as RevenueBasis,
      /** На чём стоит денежное число. См. `domain/revenue-basis.ts`. */
      revenue_basis: revenueBasis,
      financial_operations: this.optionalMetricNumber(
        financeRevenue.transaction_count,
      ),
      appointments_total: this.optionalMetricNumber(appointments.total),
      appointments_active: this.optionalMetricNumber(appointments.active),
      appointments_scheduled: this.optionalMetricNumber(appointments.scheduled),
      appointments_completed: this.optionalMetricNumber(appointments.completed),
      appointments_cancelled: this.optionalMetricNumber(appointments.cancelled),
      appointments_no_show: this.optionalMetricNumber(appointments.no_show),
      cancellation_rate_percent: this.optionalMetricNumber(
        appointments.cancellation_rate_percent,
      ),
      unique_clients: this.optionalMetricNumber(appointments.unique_clients),
      repeat_clients_in_period: this.optionalMetricNumber(
        appointments.repeat_clients_in_period,
      ),
      repeat_client_rate_percent: this.optionalMetricNumber(
        appointments.repeat_client_rate_percent,
      ),
      identified_client_visits: this.optionalMetricNumber(
        appointments.identified_client_visits,
      ),
      ...this.clientCohortMetrics(appointments),
      ...this.attendanceMetrics(data),
      average_ticket_amount_kopecks: averageTicket?.amount_kopecks ?? null,
      average_booked_value_amount_kopecks:
        averageBookedValue?.amount_kopecks ?? null,
      booked_minutes: this.optionalMetricNumber(appointments.booked_minutes),
    };
  }

  /**
   * Присутствие как метрика — только когда его можно назвать измерением.
   *
   * 🔴 Тот же приём, что у когорт, и по той же причине: `null` выпадает из
   * `available_metrics` и из сравнения периодов, а причина уезжает словами в
   * `unavailable_metrics`. Ноль здесь означал бы «никто не пришёл», хотя на
   * деле присутствие у части записей просто не наблюдалось.
   *
   * `appointments_completed` рядом НЕ переопределяется: это слово провайдера,
   * и оно означает «отмечен приход ИЛИ оплачено». Два разных факта остаются
   * двумя разными полями.
   */

  /**
   * Когорты клиентов как метрики.
   *
   * 🔴 Недоступные когорты обязаны быть `null`, а не нулём: ноль читается как
   * «вернувшихся нет». Именно на этом владельцу однажды сказали, что салон
   * живёт на новых гостях, хотя всё было наоборот. `null` выпадает и из
   * `available_metrics`, и из `changes`, а причина уезжает в
   * `unavailable_metrics`.
   *
   * `cohort_lookback_days` отдаётся всегда: «вернувшихся 62%» без горизонта —
   * это число без единицы измерения.
   */
  private clientCohortMetrics(appointments: Record<string, unknown>) {
    const available = appointments.cohort_status === 'available';
    return {
      clients_returning: available
        ? this.optionalMetricNumber(appointments.clients_returning)
        : null,
      clients_new: available
        ? this.optionalMetricNumber(appointments.clients_new)
        : null,
      returning_share_percent: available
        ? this.optionalMetricNumber(appointments.returning_share_percent)
        : null,
      cohort_lookback_days: this.optionalMetricNumber(
        appointments.cohort_lookback_days,
      ),
    };
  }

  /**
   * Почему когорт нет — словами, а не кодом.
   *
   * Пустой массив означает «когорты посчитаны»: причина появляется только
   * когда показатели действительно недоступны.
   */

  /**
   * Присутствие как метрика — только когда его можно назвать измерением.
   *
   * 🔴 Тот же приём, что у когорт, и по той же причине: `null` выпадает из
   * `available_metrics` и из сравнения периодов, а причина уезжает словами в
   * `unavailable_metrics`. Ноль здесь означал бы «никто не пришёл», хотя на
   * деле присутствие у части записей просто не наблюдалось.
   *
   * `appointments_completed` рядом НЕ переопределяется: это слово провайдера,
   * и оно означает «отмечен приход ИЛИ оплачено». Два разных факта остаются
   * двумя разными полями.
   */
  private attendanceMetrics(data: Record<string, unknown>) {
    const attendance = this.record(data.attendance);
    const measured = attendance.state === 'measured';
    return {
      attended_appointments: measured
        ? this.optionalMetricNumber(attendance.arrived)
        : null,
      attendance_no_show: measured
        ? this.optionalMetricNumber(attendance.no_show)
        : null,
      // Сколько записей осталось без наблюдения — отдаётся всегда: именно это
      // число объясняет, почему двух метрик выше может не быть.
      appointments_attendance_not_observed: this.optionalMetricNumber(
        attendance.not_observed,
      ),
    };
  }

  /** Почему присутствие не стало метрикой — словами. */

  private businessMetricChanges(
    current: Record<string, unknown>,
    previous: Record<string, unknown>,
  ) {
    return Object.fromEntries(
      Object.keys(current).flatMap((key) => {
        const currentValue = current[key];
        const previousValue = previous[key];
        // Не всякая метрика — число: у денежного числа есть ещё и ОСНОВАНИЕ,
        // а разницу оснований не считают вычитанием.
        if (
          typeof currentValue !== 'number' ||
          typeof previousValue !== 'number'
        ) {
          return [];
        }
        return [
          [
            key,
            {
              current: currentValue,
              previous: previousValue,
              delta: currentValue - previousValue,
              percent_change: this.percentageDelta(currentValue, previousValue),
            },
          ],
        ];
      }),
    );
  }

  private percentageDelta(current: number, previous: number): number | null {
    if (previous === 0) {
      return null;
    }
    return Math.round(((current - previous) / Math.abs(previous)) * 1_000) / 10;
  }

  private businessServiceChanges(current: unknown, previous: unknown) {
    const rows = (value: unknown) => {
      const data = this.record(value);
      const totals = new Map<string, number>();
      if (!Array.isArray(data.service_summary)) {
        return totals;
      }
      for (const entry of data.service_summary) {
        const item = this.record(entry);
        if (
          typeof item.name !== 'string' ||
          typeof item.appointments !== 'number'
        ) {
          continue;
        }
        // Одноимённые позиции складываем: раньше вторая затирала первую и
        // объём просто исчезал из сравнения.
        totals.set(item.name, (totals.get(item.name) ?? 0) + item.appointments);
      }
      return totals;
    };
    return this.serviceChangeRows(rows(current), rows(previous));
  }

  /**
   * Дельты по услугам из двух срезов «название → записи».
   *
   * Один и тот же счёт нужен и салону целиком, и каждому мастеру по
   * отдельности, поэтому он вынесен сюда: расхождение формул между этими
   * двумя разрезами читалось бы как расхождение данных.
   */

  /**
   * Дельты по услугам из двух срезов «название → записи».
   *
   * Один и тот же счёт нужен и салону целиком, и каждому мастеру по
   * отдельности, поэтому он вынесен сюда: расхождение формул между этими
   * двумя разрезами читалось бы как расхождение данных.
   */
  private serviceChangeRows(
    current: Map<string, number>,
    previous: Map<string, number>,
  ) {
    return [...new Set([...current.keys(), ...previous.keys()])]
      .map((name) => {
        const currentAppointments = current.get(name) ?? 0;
        const previousAppointments = previous.get(name) ?? 0;
        return {
          name,
          current_appointments: currentAppointments,
          previous_appointments: previousAppointments,
          delta: currentAppointments - previousAppointments,
          percent_change: this.percentageDelta(
            currentAppointments,
            previousAppointments,
          ),
        };
      })
      .sort(
        (left, right) =>
          Math.abs(right.delta) - Math.abs(left.delta) ||
          left.name.localeCompare(right.name),
      );
  }

  /**
   * Сравнение мастеров между периодами.
   *
   * 🔴 Ключ сопоставления — внешний идентификатор. Ни имя (оно повторяется и
   * меняется), ни позиция в массиве (она зависит от того, кто первым вышел в
   * смену) для этого не годятся. Мастер, отсутствующий в одном из периодов,
   * попадает в результат с нулём на своей стороне: уход человека из смены —
   * это тоже ответ на вопрос «что изменилось».
   *
   * 🔴 Разрез по услугам ВНУТРИ мастера — ради него всё и считается. Без него
   * фразы «у Ильи просела «Борода» на 12 записей» не существует: числа 12 нет
   * ни в одном поле, сторож чисел бракует ответ, и владелец получает шаблон.
   */
  private businessStaffChanges(
    current: unknown,
    previous: unknown,
    scope: {
      names: Map<string, string>;
      allowedExternalIds: Set<string> | null;
    },
  ) {
    const rows = (value: unknown) =>
      new Map(
        this.staffRows(value).flatMap((row) =>
          row.externalId ? [[row.externalId, row] as const] : [],
        ),
      );
    const currentRows = rows(current);
    const previousRows = rows(previous);
    return (
      [...new Set([...currentRows.keys(), ...previousRows.keys()])]
        .filter(
          (externalId) =>
            scope.allowedExternalIds === null ||
            scope.allowedExternalIds.has(externalId),
        )
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((externalId) => {
          const currentRow = currentRows.get(externalId);
          const previousRow = previousRows.get(externalId);
          const currentAppointments = currentRow?.appointments ?? 0;
          const previousAppointments = previousRow?.appointments ?? 0;
          const staffNumber = (
            row: { entry: Record<string, unknown> } | undefined,
            key: string,
          ) => (row ? (this.optionalMetricNumber(row.entry[key]) ?? 0) : 0);
          const currentCancelled = staffNumber(currentRow, 'cancelled');
          const previousCancelled = staffNumber(previousRow, 'cancelled');
          const currentCancellationRate = staffNumber(
            currentRow,
            'cancellation_rate_percent',
          );
          const previousCancellationRate = staffNumber(
            previousRow,
            'cancellation_rate_percent',
          );
          const currentUniqueClients = staffNumber(
            currentRow,
            'unique_clients',
          );
          const previousUniqueClients = staffNumber(
            previousRow,
            'unique_clients',
          );
          const currentRepeatClients = staffNumber(
            currentRow,
            'repeat_clients_in_period',
          );
          const previousRepeatClients = staffNumber(
            previousRow,
            'repeat_clients_in_period',
          );
          return {
            name: scope.names.get(externalId) ?? null,
            current_appointments: currentAppointments,
            previous_appointments: previousAppointments,
            delta: currentAppointments - previousAppointments,
            percent_change: this.percentageDelta(
              currentAppointments,
              previousAppointments,
            ),
            current_cancelled: currentCancelled,
            previous_cancelled: previousCancelled,
            cancelled_delta: currentCancelled - previousCancelled,
            current_cancellation_rate_percent: currentCancellationRate,
            previous_cancellation_rate_percent: previousCancellationRate,
            // 🔴 Разница долей — в процентных пунктах, а не в процентах: «отмены
            // выросли на 5» у мастера с 5% и с 40% означают разное, и путать эти
            // две величины в одном поле нельзя. Округление обязательно — обе
            // доли уже округлены до десятых, и вычитание даёт хвост из
            // двоичной дроби.
            cancellation_rate_delta_percentage_points:
              Math.round(
                (currentCancellationRate - previousCancellationRate) * 10,
              ) / 10,
            current_unique_clients: currentUniqueClients,
            previous_unique_clients: previousUniqueClients,
            unique_clients_delta: currentUniqueClients - previousUniqueClients,
            current_repeat_clients_in_period: currentRepeatClients,
            previous_repeat_clients_in_period: previousRepeatClients,
            repeat_clients_delta: currentRepeatClients - previousRepeatClients,
            services: this.serviceChangeRows(
              this.staffServiceMap(currentRow?.entry),
              this.staffServiceMap(previousRow?.entry),
            ),
          };
        })
        // 🔴 По возрастанию дельты, а не по модулю. Сортировка по модулю ставила
        // первым мастера с самым большим РОСТОМ, и на вопрос «кто больше всего в
        // просадке» модель называла лучшего — с верным числом, поэтому сторож
        // молчал. Худший результат должен быть первым.
        .sort((left, right) => left.delta - right.delta)
    );
  }

  /**
   * Пришёл ли ОПЕРАЦИОННЫЙ обзор из известного источника.
   *
   * 🔴 Флаг относится к счётчикам — записям, клиентам, отменам, — а НЕ к
   * деньгам. За деньги отвечает соседний `finance_verified`, и пара
   * `verified: true, finance_verified: false` — связное утверждение: «счётчики
   * из реального источника, касса не подтверждена».
   *
   * P4 намеренно НЕ трогает этот флаг. Правда о деньгах живёт в
   * `revenue_basis` (`domain/revenue-basis.ts`): выручка обзора всегда стоит на
   * ценах журнала, и теперь это сказано полем, а не подразумевается.
   */
  private businessOperationalAnalyticsVerified(value: unknown): boolean {
    const data = this.record(value);
    return data.data_source === 'maya' || data.data_source === 'crm';
  }

  /** Полнота чтения записей у уже опубликованного среза. */
  private readCompletenessStatus(value: unknown): 'complete' | 'incomplete' {
    const appointments = this.record(
      this.record(this.record(value).completeness).appointments,
    );
    return appointments.status === 'incomplete' ? 'incomplete' : 'complete';
  }

  /**
   * Можно ли сравнивать эти два периода как равные.
   *
   * 🔴 Молчание здесь было опаснее отсутствия сравнения: разница между полным
   * и усечённым чтением выглядит как изменение бизнеса и читается как вывод.
   */

  /**
   * Оговорки об ИЗМЕРЕНИИ — отдельно от недоступности.
   *
   * 🔴 Разделение и есть исправление противоречия. `unavailable_metrics`
   * означает «числа нет»; `limitations` означает «число есть, но означает не
   * то, что кажется». Пока эти два списка были одним, ответ мог одновременно
   * положить `appointments_cancelled` в доступные метрики и объявить отмены
   * недоступными — что и происходило: сначала безусловно для любого
   * CRM-арендатора, а после первой правки — на усечённой выборке.
   *
   * Утверждение устарело потому, что аналитика просит удалённые записи
   * (`includeCanceled: true`) и они приходят: в боевом зеркале, которое
   * наполняется тем же флагом, лежат сотни отменённых визитов.
   *
   * Семантика отмены усилению не подлежит: провайдер сообщает ТОЛЬКО факт
   * удаления записи (реестр 3.6). Кто удалил и почему — не часть контракта.
   */
  private measurementLimitations(value: unknown) {
    const data = this.record(value);
    if (data.data_source !== 'crm') {
      return [];
    }
    const limitations: Array<{ key: string; reason: string }> = [
      {
        key: 'cancellation_reason',
        reason:
          'the provider reports only that a record was removed; a business cancellation reason is not part of the contract and must not be inferred',
      },
    ];

    const appointments = this.record(
      this.record(data.completeness).appointments,
    );

    if (appointments.status === 'incomplete') {
      const reason =
        typeof appointments.reason === 'string'
          ? appointments.reason
          : 'unknown';
      // 🔴 Число остаётся: усечённая выборка даёт нижнюю границу, а не пустоту.
      // Меняется ровно одно — право читать ноль как «ничего не было».
      limitations.push({
        key: 'incomplete_read',
        reason: `the journal read for this period is incomplete (${reason}), so every appointment counter — appointments_total, appointments_cancelled, appointments_no_show and the per-staff rows — is a lower bound and a zero in any of them means "not measured", not "none"`,
      });
    }

    const discarded = this.optionalMetricNumber(
      appointments.out_of_period_discarded,
    );
    if (discarded !== null && discarded > 0) {
      limitations.push({
        key: 'provider_window',
        reason: `the provider returned ${discarded} record(s) outside the requested period; they are excluded from every period metric`,
      });
    }

    const attendance = this.record(data.attendance);
    const notObserved = this.optionalMetricNumber(attendance.not_observed);
    if (notObserved !== null && notObserved > 0) {
      limitations.push({
        key: 'attendance_coverage',
        reason: `attendance was not observed for ${notObserved} record(s) of the period, so attended_appointments is not published for it and appointments_no_show is a lower bound: a record whose attendance was never observed cannot be counted as a no-show. appointments_completed is a provider status that means "arrival marked OR bill paid" and is not proof of attendance`,
      });
    }
    return limitations;
  }

  /**
   * Деньги в разрезе мастера: что недоступно и почему.
   *
   * Финансовые операции YClients иногда связаны с записью и мастером, иногда
   * нет. Публикуем только точные строки, а здесь называем непокрытый остаток:
   * модель не должна ни прятать подтверждённые суммы, ни распределять кассу
   * приблизительно по ценам записей.
   */

  /**
   * Можно ли сравнивать эти два периода как равные.
   *
   * 🔴 Молчание здесь было опаснее отсутствия сравнения: разница между полным
   * и усечённым чтением выглядит как изменение бизнеса и читается как вывод.
   */
  private comparisonLimitations(
    current: unknown,
    previous: unknown,
    mode: string,
  ) {
    if (mode === 'none' || !previous) {
      return [];
    }
    const currentStatus = this.readCompletenessStatus(current);
    const previousStatus = this.readCompletenessStatus(previous);
    if (currentStatus === 'complete' && previousStatus === 'complete') {
      return [];
    }
    const side =
      currentStatus === previousStatus
        ? 'both periods were'
        : currentStatus === 'incomplete'
          ? 'the current period was'
          : 'the previous period was';
    return [
      {
        key: 'comparison_completeness',
        reason: `${side} read incompletely, so changes and percent_change compare samples of different completeness: the difference may reflect how much was read rather than what happened in the salon`,
      },
    ];
  }

  /**
   * Оговорки об ИЗМЕРЕНИИ — отдельно от недоступности.
   *
   * 🔴 Разделение и есть исправление противоречия. `unavailable_metrics`
   * означает «числа нет»; `limitations` означает «число есть, но означает не
   * то, что кажется». Пока эти два списка были одним, ответ мог одновременно
   * положить `appointments_cancelled` в доступные метрики и объявить отмены
   * недоступными — что и происходило: сначала безусловно для любого
   * CRM-арендатора, а после первой правки — на усечённой выборке.
   *
   * Утверждение устарело потому, что аналитика просит удалённые записи
   * (`includeCanceled: true`) и они приходят: в боевом зеркале, которое
   * наполняется тем же флагом, лежат сотни отменённых визитов.
   *
   * Семантика отмены усилению не подлежит: провайдер сообщает ТОЛЬКО факт
   * удаления записи (реестр 3.6). Кто удалил и почему — не часть контракта.
   */

  /**
   * Почему когорт нет — словами, а не кодом.
   *
   * Пустой массив означает «когорты посчитаны»: причина появляется только
   * когда показатели действительно недоступны.
   */
  private clientCohortUnavailableMetrics(value: unknown) {
    const appointments = this.record(this.record(value).appointments);
    if (appointments.cohort_status === 'available') {
      return [];
    }
    const days = this.optionalMetricNumber(appointments.cohort_lookback_days);
    const horizon = days === null ? 'lookback' : `${days}-day`;
    const reason =
      appointments.cohort_unavailable_reason ===
      'period_longer_than_cohort_lookback'
        ? `the analysed period is longer than the ${horizon} cohort horizon, so returning clients cannot be told apart from clients first seen inside the period`
        : `requires the ${horizon} visit history before the period, which the calendar source did not return`;
    return [
      {
        key: 'client_cohorts',
        reason: `clients_returning, clients_new and returning_share_percent are unavailable: ${reason}`,
      },
    ];
  }

  /** Полнота чтения записей у уже опубликованного среза. */

  /** Почему присутствие не стало метрикой — словами. */
  private attendanceUnavailableMetrics(value: unknown) {
    const attendance = this.record(this.record(value).attendance);
    if (attendance.state === 'measured') {
      return [];
    }
    const completeness = this.record(
      this.record(this.record(value).completeness).attendance,
    );
    const reason =
      typeof completeness.reason === 'string'
        ? completeness.reason
        : 'attendance_observation_is_incomplete';
    return [
      {
        key: 'attendance',
        reason: `attended_appointments and attendance_no_show are unavailable: ${reason}. appointments_completed is a provider status that mixes arrival with payment and is not proof of attendance`,
      },
    ];
  }

  /**
   * Когорты клиентов как метрики.
   *
   * 🔴 Недоступные когорты обязаны быть `null`, а не нулём: ноль читается как
   * «вернувшихся нет». Именно на этом владельцу однажды сказали, что салон
   * живёт на новых гостях, хотя всё было наоборот. `null` выпадает и из
   * `available_metrics`, и из `changes`, а причина уезжает в
   * `unavailable_metrics`.
   *
   * `cohort_lookback_days` отдаётся всегда: «вернувшихся 62%» без горизонта —
   * это число без единицы измерения.
   */

  /**
   * Деньги в разрезе мастера: что недоступно и почему.
   *
   * Финансовые операции YClients иногда связаны с записью и мастером, иногда
   * нет. Публикуем только точные строки, а здесь называем непокрытый остаток:
   * модель не должна ни прятать подтверждённые суммы, ни распределять кассу
   * приблизительно по ценам записей.
   */
  private staffMoneyUnavailableMetrics(value: unknown) {
    const data = this.record(value);
    const rows = Array.isArray(data.staff_summary) ? data.staff_summary : [];
    const unavailableRevenueRows = rows.filter(
      (entry) =>
        this.record(this.record(entry).confirmed_revenue).status !==
        'available',
    );
    const metrics: Array<{ key: string; reason: string }> = [];
    if (unavailableRevenueRows.length > 0) {
      const attribution = this.record(this.record(data.finance).revenue);
      const coverage = this.optionalMetricNumber(
        attribution.staff_attribution_coverage_percent,
      );
      metrics.push({
        key: 'staff_revenue',
        reason:
          data.data_source === 'crm'
            ? `confirmed per-master revenue is unavailable for ${unavailableRevenueRows.length} master(s): YClients did not attribute their service financial transactions to a staff member${coverage === null ? '' : `; exact attributed coverage is ${coverage}%`}. Do not estimate the missing cash from booked appointment prices`
            : 'per-master revenue is unavailable as confirmed cash: the internal calendar stores the booked price of an appointment, which is planned value rather than a confirmed payment',
      });
    }

    const salaryReasons = [
      ...new Set(
        rows.flatMap((entry) => {
          const salary = this.record(this.record(entry).salary);
          return salary.status === 'available' ||
            typeof salary.unavailable_reason !== 'string'
            ? []
            : [salary.unavailable_reason];
        }),
      ),
    ];
    if (salaryReasons.length > 0) {
      metrics.push({
        key: 'staff_accrued_salary',
        reason: `accrued salary is unavailable for at least one master: ${salaryReasons.join(', ')}`,
      });
    }
    return metrics;
  }

  private personalCashUnavailableMetrics(value: unknown) {
    const data = this.record(value);
    const rows = Array.isArray(data.staff_summary) ? data.staff_summary : [];
    const own = rows.length === 1 ? this.record(rows[0]) : null;
    if (own && this.record(own.confirmed_revenue).status === 'available') {
      return [];
    }
    return [
      {
        key: 'personal_cash_revenue',
        reason:
          'confirmed personal cash is unavailable because no YClients service financial transaction was attributed to this master; booked service value and accrued payroll are different metrics',
      },
    ];
  }

  private async retryAnalyticsRead<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return read();
    }
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

  private optionalMetricNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private majorUnits(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? value / 100
      : null;
  }

  private safeMoneyAmount(value: unknown) {
    const item = this.record(value);
    if (
      typeof item.amount_kopecks !== 'number' ||
      !Number.isFinite(item.amount_kopecks)
    ) {
      return null;
    }
    return {
      currency: typeof item.currency === 'string' ? item.currency : null,
      amount_kopecks: item.amount_kopecks,
      amount_major_units: this.majorUnits(item.amount_kopecks),
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

  private safeWarningCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((warning) => this.record(warning).code)
      .filter(
        (code): code is string =>
          typeof code === 'string' && /^[a-z0-9_:-]{1,80}$/i.test(code),
      );
  }

  private requiredString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Validated AI tool string is missing');
    }
    return value;
  }
}
