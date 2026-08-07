import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import type { CrmFinancialSummary } from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';

type AnalyticsAppointment = {
  id: string;
  clientId: string | null;
  branchId: string | null;
  staffExternalId: string;
  /**
   * Имя мастера. Уходит в модель напрямую: имя сотрудника не является
   * персональными данными клиента, а без него разбор «у кого что просело»
   * невозможен. Кому показывать именованный разрез, решает слой
   * AI-инструментов по роли спрашивающего.
   */
  staffName: string | null;
  services: Array<{
    id: string;
    name: string;
    amountKopecks: number;
    currency: string;
  }>;
  startAt: Date;
  durationMinutes: number;
  status: string;
  totalPriceKopecks: number | null;
  currency: string;
};

type AnalyticsExpense = {
  amountKopecks: number;
  currency: string;
  occurredAt: Date;
};

type AnalyticsBreakdown = {
  appointments: number;
  revenueByCurrency: Map<string, number>;
};

type AnalyticsStaffBreakdown = AnalyticsBreakdown & {
  name: string | null;
  bookedMinutes: number;
  /** Отменённые записи мастера. Считаются отдельным проходом по отменам. */
  cancelled: number;
  /** Идентифицированный клиент → его состоявшиеся визиты к этому мастеру. */
  clientVisits: Map<string, number>;
  /** Ключ — идентификатор услуги, чтобы одноимённые позиции не слипались. */
  services: Map<string, { name: string; appointments: number }>;
};

/**
 * Горизонт когорт клиентов.
 *
 * 🔴 «Повторный клиент» и «клиент, пришедший больше одного раза за неделю» —
 * разные вещи. При цикле стрижки в 3–4 недели второй показатель на недельном
 * окне близок к нулю ПО ПРИРОДЕ, и по нему владельцу отвечали, что салон
 * держится на новых гостях, хотя всё наоборот. Поэтому «вернувшийся» считается
 * относительно визитов ДО начала окна, а не внутри него.
 *
 * 90 дней — компромисс: три цикла стрижки покрывают почти всех постоянных, а
 * журнал внешней CRM читается чанками по 31 дню, поэтому горизонт стоит ровно
 * три запроса. Год стоил бы двенадцати на каждый вопрос в чате.
 */
export const CLIENT_COHORT_LOOKBACK_DAYS = 90;
const CLIENT_COHORT_LOOKBACK_MS =
  CLIENT_COHORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/**
 * Когорты либо посчитаны честно, либо недоступны с причиной.
 *
 * 🔴 Третьего состояния нет специально. Нули вместо неизвестности читаются как
 * «повторных нет» — ровно та ошибка, из-за которой всё и переделывалось.
 */
type ClientCohortHistory =
  | { status: 'available'; clientIds: Set<string> }
  | { status: 'unavailable'; reason: string };

/**
 * Расход с категорией — только для расчёта прибыли.
 *
 * Основной обзор категорию не читает намеренно: слой AI-инструментов гасит
 * денежные поля обзора по ролям поимённо, и любое НОВОЕ денежное поле там
 * проехало бы мимо этого гашения. Разрез по категориям живёт только в
 * прибыльности, куда пускают отдельно.
 */
type AnalyticsCategoryExpense = AnalyticsExpense & { category: string };

/** Деньги наружу: копейки для арифметики, рубли — чтобы их назвали вслух. */
type ProfitMoney = {
  currency: string;
  amount_kopecks: number;
  amount_major_units: number;
};

/**
 * Категории расходов, которые владелец обязан внести САМ.
 *
 * 🔴 Это гейт полноты, а не украшение. Салон, у которого за месяц забит один
 * расход на 500 ₽, при вычитании «выручка минус расходы» показывает прибыль
 * почти равную выручке — и владелец принимает решения по числу, которое
 * завышено в разы. Аренда есть у любого салона всегда; её нет — считать нечего,
 * и надо назвать вслух, какой именно статьи не хватает, а не выдавать цифру.
 *
 * 🔴 ЗАРПЛАТЫ ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. Ручной ввод зарплаты запрещён
 * (см. `manualEntry: 'blocked'` в справочнике категорий): начисления приходят
 * расчётом из CRM, и ручной дубль сложил бы фонд оплаты труда сам с собой.
 * Пока зарплата стояла в этом списке, получался замкнутый круг: гейт требовал
 * внести то, что внести физически нельзя, и MAYA советовала владельцу
 * невозможное. Отсутствие расчёта CRM — это ОТДЕЛЬНАЯ причина недоступности
 * прибыли, а не пункт списка «что внести».
 */
export const REQUIRED_PROFIT_EXPENSE_CATEGORIES = ['rent'] as const;

/**
 * Нижняя граница правдоподобия статьи расходов — доля от подтверждённой кассы.
 *
 * 🔴 Гейт «сумма больше нуля» обходится одной копейкой. Расход в 1 ₽ с
 * категорией «аренда» закрывал требование полноты, и прибыль выходила почти
 * равной выручке — то самое завышенное в разы число, ради борьбы с которым гейт
 * и написан. Порог отсекает не «маленькую аренду», а «внесено не всё»: салон,
 * пробивший за период кассу, платит за помещение долю этой кассы, а не сотые
 * её процента.
 *
 * 5% выбраны с большим запасом вниз. Аренда в барбершопе — обычно 10–20% от
 * оборота, и даже сильно недозагруженный месяц не уводит её ниже пяти. Всё, что
 * ниже, — это почти наверняка один чек вместо месячного платежа. Ошибка порога
 * в безопасную сторону: MAYA скажет «похоже, внесено не всё» и назовёт статью,
 * а не покажет завышенную прибыль.
 */
export const MIN_PLAUSIBLE_EXPENSE_SHARE_OF_CONFIRMED_REVENUE = 0.05;

/** Категория, из которой берётся стоимость привлечения нового клиента. */
export const MARKETING_EXPENSE_CATEGORY = 'marketing';

/**
 * Синонимы категорий расходов.
 *
 * Категория в базе — свободный слаг (`^[a-z0-9_-]{2,40}$`), справочника у неё
 * нет. Владелец пишет то, что пришло в голову: `arenda`, `ads`, `payroll`.
 * Без сведения к канону гейт полноты ругался бы на отсутствие аренды, когда
 * аренда внесена — и это было бы хуже, чем отсутствие гейта.
 */
const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  rent: 'rent',
  arenda: 'rent',
  lease: 'rent',
  premises: 'rent',
  rent_payment: 'rent',
  office_rent: 'rent',
  salary: 'salary',
  salaries: 'salary',
  payroll: 'salary',
  wages: 'salary',
  zarplata: 'salary',
  staff_salary: 'salary',
  marketing: 'marketing',
  ads: 'marketing',
  advertising: 'marketing',
  advertisement: 'marketing',
  promo: 'marketing',
  promotion: 'marketing',
  reklama: 'marketing',
  smm: 'marketing',
  targeting: 'marketing',
  supplies: 'supplies',
  consumables: 'supplies',
  materials: 'supplies',
  rashodniki: 'supplies',
  taxes: 'taxes',
  tax: 'taxes',
  nalogi: 'taxes',
  utilities: 'utilities',
  communal: 'utilities',
  kommunalka: 'utilities',
  other: 'other',
};

/**
 * Человеческие имена категорий.
 *
 * Отказ обязан называть недостающее словом из жизни салона («не внесена
 * аренда»), а не служебным слагом: слаг — это схема данных, а её вслух не
 * произносят.
 */
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  rent: 'аренда',
  salary: 'зарплата',
  marketing: 'реклама',
  supplies: 'расходники',
  taxes: 'налоги',
  utilities: 'коммунальные платежи',
  other: 'прочее',
};

/** Почему подтверждённой кассы за период нет. */
export const CONFIRMED_REVENUE_UNAVAILABLE = {
  branchScope:
    'crm_confirms_cash_for_the_whole_company_and_has_no_branch_split',
  internalCalendar:
    'internal_calendar_records_booked_appointment_prices_and_has_no_till_confirmed_cash',
  crmUnavailable: 'crm_finance_did_not_answer_for_this_period',
  crmUnverified: 'crm_returned_cash_revenue_without_confirmation',
} as const;

/** Почему чистой прибыли за период нет. */
export const NET_PROFIT_UNAVAILABLE = {
  branchScope:
    'crm_confirms_cash_for_the_whole_company_and_has_no_branch_split',
  confirmedRevenueMissing:
    'profit_requires_till_confirmed_cash_and_there_is_none_for_this_period',
  expenseLedgerUnavailable: 'expense_ledger_did_not_answer_for_this_period',
  incompleteExpenses: 'required_expense_categories_are_missing_for_this_period',
  /**
   * 🔴 Зарплату владелец внести не может — только CRM. Поэтому её отсутствие
   * это не «внесите зарплату», а «расчёта за период нет». Чаще всего причина
   * ровно одна: у периода длиннее 31 дня CRM расчёт не отдаёт вовсе.
   */
  payrollMissing:
    'salary_comes_only_from_the_crm_payroll_calculation_and_the_crm_returned_none_for_this_period',
  /**
   * Статьи есть, но суммы неправдоподобно малы относительно кассы. Это не
   * «полно» и не «пусто», а «похоже, внесено не всё» — отдельное состояние.
   */
  understatedExpenses:
    'recorded_expense_categories_are_implausibly_small_against_the_confirmed_cash_of_this_period_and_look_partially_entered',
  currencyMismatch:
    'expenses_and_confirmed_cash_are_recorded_in_different_currencies_and_cannot_be_netted',
  /**
   * Прибыль не живёт в операционном обзоре. Обзор считает выручку как сумму цен
   * из ЖУРНАЛА записей — это стоимость записанного, а не пробитая касса.
   */
  notInOperationalOverview:
    'profit_is_calculated_only_from_till_confirmed_cash_and_a_complete_expense_ledger_never_from_booked_prices',
} as const;

/** Почему стоимости нового клиента за период нет. */
export const CLIENT_ACQUISITION_COST_UNAVAILABLE = {
  branchScope:
    'marketing_spend_and_client_cohorts_are_company_scoped_and_have_no_branch_split',
  expenseLedgerUnavailable: 'expense_ledger_did_not_answer_for_this_period',
  marketingSpendMissing: 'no_advertising_expenses_are_recorded_for_this_period',
  mixedCurrencies:
    'advertising_expenses_of_this_period_are_recorded_in_more_than_one_currency',
  cohortsUnavailable: 'client_cohorts_are_unavailable_for_this_period',
  noNewClients:
    'this_period_has_no_new_clients_so_cost_per_new_client_has_no_denominator',
} as const;

/**
 * 🔴 ОКУПАЕМОСТЬ РЕКЛАМЫ НЕ СЧИТАЕТСЯ И НЕ БУДЕТ.
 *
 * ROMI = выручка, ПРИВЕДЁННАЯ рекламой, делить на затраты на рекламу. Первого
 * слагаемого не существует ни в одном источнике: CRM не хранит, откуда пришёл
 * клиент, а без атрибуции знаменатель можно только выдумать. Соблазн подставить
 * вместо «выручки от рекламы» общую выручку салона огромен и даёт число,
 * завышенное в разы. Ближайшее ЧЕСТНОЕ — стоимость привлечения нового клиента.
 */
export const MARKETING_ROI_UNAVAILABLE =
  'crm_stores_no_attribution_of_a_client_to_an_advertising_source_so_revenue_generated_by_advertising_has_no_denominator';

/**
 * Источник когорт для стоимости нового клиента.
 *
 * Структурный тип, а не импорт обзора: вызывающий обычно УЖЕ загрузил обзор
 * ради ответа на вопрос владельца, и второй проход журнала внешней CRM стоил
 * бы ещё трёх запросов на тот же самый вопрос.
 */
export type ProfitabilityCohortSource = {
  appointments: {
    clients_new: number | null;
    cohort_status: 'available' | 'unavailable';
    cohort_unavailable_reason: string | null;
    cohort_lookback_days: number;
  };
};

type ExpenseCategoryRow = {
  category: string;
  label: string;
  source: 'owner_manual' | 'crm_payroll';
  currency: string;
  amount_kopecks: number;
  amount_major_units: number;
};

type ExpenseLedger = {
  status: 'available' | 'unavailable';
  unavailable_reason: string | null;
  salary_source: 'crm_payroll' | 'owner_manual' | null;
  by_category: ExpenseCategoryRow[];
  totals: ProfitMoney[];
  ignored_manual_salary: ProfitMoney[];
  warnings: Array<{ code: string; message: string }>;
};

@Injectable()
export class OperationsAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantsService: TenantsService,
    private readonly crmService: CrmService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getBusinessOverview(tenantId: string, query: AnalyticsRangeQueryDto) {
    return this.buildOverview(tenantId, query, null);
  }

  /**
   * Обзор для HTTP-кабинета — со СТАРЫМ полем `net`.
   *
   * 🔴 Это не забытый откат, а сознательная граница контракта. Кабинет —
   * отдельно деплоящийся фронт, и он рисует карточку «Чистыми» из `net`. На
   * пустом массиве карточка показывает «0 ₽», то есть салон с прибылью
   * выглядит как салон в ноль. Убрать поле, не имея возможности одновременно
   * поправить фронт, значит соврать пользователю новым способом вместо
   * старого.
   *
   * Карточка «Чистыми» рисуется ТОЛЬКО у тенанта на внутреннем календаре
   * (у CRM-тенанта фронт показывает другой набор карточек), а там `net` и
   * считался честно: и выручка, и расходы — это цены внутреннего календаря и
   * ручные расходы того же салона, обе величины одной природы. Поэтому старое
   * поведение возвращается ровно для этого источника и ровно в этом ответе.
   *
   * Честная прибыль от подтверждённой кассы живёт в `getBusinessProfitability`
   * и в AI-инструменте прибыли — она НЕ протекает обратно в этот контракт, а
   * AI-слой продолжает получать обзор без `net` (см. `aggregate`).
   */
  async getBusinessOverviewForCabinet(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
  ) {
    return this.withLegacyNet(await this.getBusinessOverview(tenantId, query));
  }

  /** Личный срез для HTTP-кабинета — тот же старый контракт `net`. */
  async getEmployeeOverviewForCabinet(
    tenantId: string,
    userId: string,
    query: AnalyticsRangeQueryDto,
  ) {
    return this.withLegacyNet(
      await this.getEmployeeOverview(tenantId, userId, query),
    );
  }

  /**
   * Вернуть ответу форму, которая была до появления честной прибыли.
   *
   * Побайтово прежняя: `net` считается тем же способом (объединение валют
   * выручки и расходов, сортировка по коду валюты), стоит на том же месте, а
   * служебные `net_status` / `net_unavailable_reason` из ответа исчезают —
   * их в старом контракте не было, и лишние ключи сломали бы сравнение.
   */
  private withLegacyNet<
    T extends {
      data_source: string;
      revenue: Array<{ currency: string; amount_kopecks: number }>;
      expenses: Array<{ currency: string; amount_kopecks: number }>;
      net: Array<{ currency: string; amount_kopecks: number }>;
      net_status: string;
      net_unavailable_reason: string;
    },
  >(overview: T) {
    if (overview.data_source !== 'maya') {
      return overview;
    }
    // Копия и точечное удаление: порядок оставшихся ключей сохраняется, а
    // именно он и есть контракт — фронт читает объект как есть.
    const rest = { ...overview } as Omit<
      T,
      'net_status' | 'net_unavailable_reason'
    > &
      Partial<Pick<T, 'net_status' | 'net_unavailable_reason'>>;
    delete rest.net_status;
    delete rest.net_unavailable_reason;
    const revenueMap = new Map(
      rest.revenue.map((item) => [item.currency, item.amount_kopecks]),
    );
    const expenseMap = new Map(
      rest.expenses.map((item) => [item.currency, item.amount_kopecks]),
    );
    const currencies = [
      ...new Set([...revenueMap.keys(), ...expenseMap.keys()]),
    ].sort((left, right) => left.localeCompare(right));
    rest.net = currencies.map((currency) => ({
      currency,
      amount_kopecks:
        (revenueMap.get(currency) ?? 0) - (expenseMap.get(currency) ?? 0),
    }));
    return rest;
  }

  async getBusinessFinance(tenantId: string, query: AnalyticsRangeQueryDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (query.branchId) {
      throw new BadRequestException({
        message:
          'CRM finance is scoped to the connected company and cannot be filtered by a Maya branch.',
        error: { code: 'crm_finance_branch_filter_not_supported' },
      });
    }
    const from = new Date(query.from);
    const to = new Date(query.to);
    const fullFinanceRangeMs = 31 * 24 * 60 * 60 * 1000;

    if (to.getTime() - from.getTime() <= fullFinanceRangeMs) {
      return this.crmService.getFinancialSummary(scopedTenantId, {
        from: query.from,
        to: query.to,
      });
    }

    // YClients limits payroll calculation to 31 days, while its verified
    // revenue feed supports annual comparisons. Keep the money facts
    // available for long owner reports and explicitly withhold payroll.
    const summary = await this.crmService.getRevenueSummary(scopedTenantId, {
      from: query.from,
      to: query.to,
    });
    const payroll: CrmFinancialSummary['payroll'] = {
      status: 'unavailable',
      verified: false,
      accrued_total: null,
      paid_total: null,
      balance_total: null,
      staff: [],
    };

    return {
      ...summary,
      verified: false,
      payroll,
      warnings: [
        ...summary.warnings,
        {
          code: 'crm_payroll_range_too_large',
          message:
            'Расчёт зарплаты доступен только за период до 31 дня. Выручка за выбранный период подтверждена CRM.',
        },
      ],
    } satisfies CrmFinancialSummary;
  }

  /**
   * Финансовая сводка CRM для ЛИЧНОГО среза сотрудника.
   *
   * 🔴 Источник ровно тот же, что и у владельца: расчёт зарплаты в CRM ведётся
   * по компании, отдельного «только про меня» эндпоинта у провайдера нет.
   * Поэтому метод возвращает сводку ЦЕЛИКОМ, а вызывающий ОБЯЗАН отфильтровать
   * её до строки самого сотрудника — чужие начисления наружу не уходят.
   *
   * `null` означает «денег в этом срезе не будет»: либо запрошен филиал (расчёт
   * ведётся по компании и к филиалу не сводится), либо CRM не ответила. Ни то,
   * ни другое не должно ронять личную аналитику: записи, клиенты и загрузка
   * полезны и без денег.
   */
  async getStaffFinance(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
  ): Promise<CrmFinancialSummary | null> {
    if (query.branchId) {
      return null;
    }
    try {
      return await this.getBusinessFinance(tenantId, query);
    } catch {
      return null;
    }
  }

  /**
   * Чистая прибыль и стоимость нового клиента — единственное честное место.
   *
   * 🔴 Почему это ОТДЕЛЬНЫЙ метод, а не поле обзора. Подтверждённая касса —
   * коммерческая тайна, и слой AI-инструментов гасит денежные поля обзора
   * поимённо: `revenue`, `expenses`, `net`, `average_ticket`, суточная разбивка,
   * строки мастеров. Любое новое денежное поле ВНУТРИ обзора проехало бы мимо
   * этого списка и утекло бы роли, которой касса не открыта. Поэтому прибыль
   * живёт там же, где и остальная касса: за отдельным вызовом, который
   * вызывающий делает осознанно и только для финансовых ролей.
   *
   * Три правила, ради которых метод и написан:
   * 1. Прибыль считается от ПОДТВЕРЖДЁННОЙ кассы (финансовые операции CRM), а
   *    не от суммы цен из журнала записей. Записанное ≠ пробитое.
   * 2. Прибыль показывается только при полноте расходов: нет аренды или
   *    зарплаты — вместо числа отказ с ИМЕНЕМ недостающей категории.
   * 3. Зарплата берётся из расчёта CRM и входит в расходы ровно один раз;
   *    ручные записи о зарплате при этом отбрасываются, а не суммируются.
   *
   * `context` позволяет переиспользовать уже загруженные обзор и финсводку:
   * иначе один вопрос владельца стоил бы двойного прохода журнала CRM.
   */
  async getBusinessProfitability(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
    context?: {
      overview?: ProfitabilityCohortSource | null;
      finance?: CrmFinancialSummary | null;
    },
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const { from, to } = this.parseRange(query);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { defaultTimezone: true, calendarSource: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const external =
      (tenant.calendarSource as CalendarSource) === CalendarSource.EXTERNAL;
    const dataSource: 'crm' | 'maya' = external ? 'crm' : 'maya';
    const period = {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: tenant.defaultTimezone,
    };

    // Касса подтверждается по компании целиком: разложить её по филиалам
    // нечем, а «прибыль филиала» из общей кассы и филиальных расходов была бы
    // выдумкой в обе стороны.
    if (query.branchId) {
      return this.profitabilityEnvelope({
        period,
        dataSource,
        revenue: this.unavailableConfirmedRevenue(
          CONFIRMED_REVENUE_UNAVAILABLE.branchScope,
        ),
        ledger: this.emptyLedger(NET_PROFIT_UNAVAILABLE.branchScope),
        netProfitReason: NET_PROFIT_UNAVAILABLE.branchScope,
        acquisitionReason: CLIENT_ACQUISITION_COST_UNAVAILABLE.branchScope,
      });
    }

    const [finance, expenseRows, overview] = await Promise.all([
      external
        ? context?.finance !== undefined
          ? Promise.resolve(context.finance)
          : this.getBusinessFinance(scopedTenantId, query).catch(() => null)
        : Promise.resolve(null),
      this.loadCategorisedExpenses(scopedTenantId, from, to),
      context?.overview !== undefined
        ? Promise.resolve(context.overview)
        : this.getBusinessOverview(scopedTenantId, query).catch(() => null),
    ]);

    const revenue = this.confirmedRevenue(external, finance);
    const ledger = this.expenseLedger(expenseRows, finance);
    return this.profitabilityEnvelope({
      period,
      dataSource,
      revenue,
      ledger,
      overview,
    });
  }

  async getEmployeeOverview(
    tenantId: string,
    userId: string,
    query: AnalyticsRangeQueryDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { calendarSource: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const external =
      (tenant.calendarSource as CalendarSource) === CalendarSource.EXTERNAL;
    let providerId: string;
    let providerName: string;
    if (external) {
      const identity = await this.prisma.crmStaffAccess.findFirst({
        where: {
          tenantId: scopedTenantId,
          userId,
          status: 'active',
        },
        select: { externalStaffId: true, encryptedDisplayName: true },
      });
      if (!identity) {
        throw this.staffIdentityNotLinked();
      }
      providerId = identity.externalStaffId;
      providerName = this.encryptionService.decrypt(
        identity.encryptedDisplayName,
      );
    } else {
      const identity = await this.prisma.internalProvider.findFirst({
        where: { tenantId: scopedTenantId, userId, active: true },
        select: { id: true, displayName: true },
      });
      if (!identity) {
        throw this.staffIdentityNotLinked();
      }
      providerId = identity.id;
      providerName = identity.displayName;
    }

    const overview = await this.buildOverview(
      scopedTenantId,
      query,
      providerId,
    );
    return {
      ...overview,
      employee: { provider_id: providerId, name: providerName },
    };
  }

  private staffIdentityNotLinked(): NotFoundException {
    return new NotFoundException({
      message: 'Employee calendar identity is not linked.',
      error: {
        code: 'staff_identity_not_linked',
        message:
          'Link this user to a calendar provider before opening employee analytics.',
      },
    });
  }

  private async buildOverview(
    tenantId: string,
    query: AnalyticsRangeQueryDto,
    staffExternalId: string | null,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const { from, to } = this.parseRange(query);
    if (query.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        query.branchId,
        scopedTenantId,
      );
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { defaultTimezone: true, calendarSource: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const external =
      (tenant.calendarSource as CalendarSource) === CalendarSource.EXTERNAL;
    const cohortWindow = this.clientCohortWindow(from, to);
    const [appointments, expenses, cohortClientIds] = await Promise.all([
      external
        ? this.loadExternalAppointments(
            scopedTenantId,
            from,
            to,
            staffExternalId,
          )
        : this.prisma.appointment
            .findMany({
              where: {
                tenantId: scopedTenantId,
                startAt: { gte: from, lte: to },
                ...(query.branchId ? { branchId: query.branchId } : {}),
                ...(staffExternalId ? { staffExternalId } : {}),
              },
              select: {
                id: true,
                clientId: true,
                branchId: true,
                staffExternalId: true,
                startAt: true,
                endAt: true,
                status: true,
                totalPriceKopecks: true,
                currency: true,
              },
              orderBy: { startAt: 'asc' },
            })
            .then((items) =>
              items.map((item) => ({
                ...item,
                services: [],
                staffName: null as string | null,
                durationMinutes:
                  item.endAt instanceof Date
                    ? Math.max(
                        0,
                        Math.round(
                          (item.endAt.getTime() - item.startAt.getTime()) /
                            60_000,
                        ),
                      )
                    : 0,
              })),
            ),
      staffExternalId
        ? Promise.resolve([] as AnalyticsExpense[])
        : this.prisma.expense.findMany({
            where: {
              tenantId: scopedTenantId,
              occurredAt: { gte: from, lte: to },
              ...(query.branchId ? { branchId: query.branchId } : {}),
            },
            select: {
              amountKopecks: true,
              currency: true,
              occurredAt: true,
            },
          }),
      cohortWindow
        ? this.loadCohortClientIds(
            scopedTenantId,
            external,
            cohortWindow,
            query.branchId ?? null,
            staffExternalId,
          )
        : Promise.resolve(null),
    ]);

    return this.aggregate(
      external
        ? appointments
        : await this.withInternalProviderNames(scopedTenantId, appointments),
      expenses,
      tenant.defaultTimezone,
      from,
      to,
      external ? 'crm' : 'maya',
      this.clientCohortHistory(cohortWindow, cohortClientIds),
    );
  }

  /**
   * Окно, за которое ищем прошлые визиты: [начало периода − горизонт; начало).
   *
   * `null` означает «когорты в этом разрезе не считаем»: окно анализа само
   * длиннее горизонта, и «вернувшийся за 90 дней» перестаёт отличаться от
   * «постоянного, впервые замеченного внутри окна». Считать в такой ситуации
   * нельзя, а молчать — тем более: вызывающий превратит `null` в честное
   * «недоступно с причиной».
   */
  private clientCohortWindow(
    from: Date,
    to: Date,
  ): { from: Date; to: Date } | null {
    if (to.getTime() - from.getTime() > CLIENT_COHORT_LOOKBACK_MS) {
      return null;
    }
    return {
      from: new Date(from.getTime() - CLIENT_COHORT_LOOKBACK_MS),
      // Ровно до начала окна, без нахлёста: визит внутри периода не делает
      // клиента вернувшимся сам по себе.
      to: new Date(from.getTime() - 1),
    };
  }

  private clientCohortHistory(
    window: { from: Date; to: Date } | null,
    clientIds: Set<string> | null,
  ): ClientCohortHistory {
    if (!window) {
      return {
        status: 'unavailable',
        reason: 'period_longer_than_cohort_lookback',
      };
    }
    if (!clientIds) {
      return { status: 'unavailable', reason: 'lookback_window_unavailable' };
    }
    return { status: 'available', clientIds };
  }

  /**
   * Клиенты с состоявшимся визитом ДО начала периода.
   *
   * 🔴 Ровно один дополнительный проход источника: для внешней CRM — тот же
   * путь журнала с чанкованием по 31 дню, что и у основного периода, для
   * внутреннего календаря — один запрос к БД. Никакого пер-клиентского
   * добора, иначе один вопрос в чате превратился бы в сотню запросов.
   *
   * Отменённая запись прошлым визитом не считается: клиент тогда не приходил.
   * Любая ошибка загрузки возвращает `null` — когорты станут недоступными, а
   * не нулевыми.
   */
  private async loadCohortClientIds(
    tenantId: string,
    external: boolean,
    window: { from: Date; to: Date },
    branchId: string | null,
    staffExternalId: string | null,
  ): Promise<Set<string> | null> {
    try {
      let visits: Array<{ clientId: string | null; status: string }>;
      if (external) {
        visits = await this.loadExternalAppointments(
          tenantId,
          window.from,
          window.to,
          staffExternalId,
        );
      } else {
        if (typeof this.prisma.appointment?.findMany !== 'function') {
          return null;
        }
        visits = await this.prisma.appointment.findMany({
          where: {
            tenantId,
            startAt: { gte: window.from, lte: window.to },
            ...(branchId ? { branchId } : {}),
            ...(staffExternalId ? { staffExternalId } : {}),
          },
          select: { clientId: true, status: true },
        });
      }
      const clientIds = new Set<string>();
      for (const visit of visits) {
        if (this.isCancelled(visit.status)) {
          continue;
        }
        if (typeof visit.clientId === 'string' && visit.clientId !== '') {
          clientIds.add(visit.clientId);
        }
      }
      return clientIds;
    } catch {
      return null;
    }
  }

  /**
   * Имена мастеров внутреннего календаря одним запросом.
   *
   * Внешний журнал отдаёт имя вместе с записью, у внутреннего его нет — там
   * в записи лежит только идентификатор InternalProvider. Запрос ровно один,
   * по уже известному набору идентификаторов: разбивка по услугам считается
   * из тех же записей и в базу не ходит.
   */
  private async withInternalProviderNames(
    tenantId: string,
    appointments: AnalyticsAppointment[],
  ): Promise<AnalyticsAppointment[]> {
    const providerIds = [
      ...new Set(
        appointments
          .map((appointment) => appointment.staffExternalId)
          .filter((id): id is string => typeof id === 'string' && id !== ''),
      ),
    ];
    // Защита от подменённого prisma в юнит-тестах: имя — украшение отчёта,
    // из-за него аналитика падать не должна.
    if (
      providerIds.length === 0 ||
      typeof this.prisma.internalProvider?.findMany !== 'function'
    ) {
      return appointments;
    }
    const providers = await this.prisma.internalProvider.findMany({
      where: { tenantId, id: { in: providerIds } },
      select: { id: true, displayName: true },
    });
    const names = new Map(
      providers.map((provider) => [provider.id, provider.displayName]),
    );
    return appointments.map((appointment) => ({
      ...appointment,
      staffName: names.get(appointment.staffExternalId) ?? null,
    }));
  }

  private async loadExternalAppointments(
    tenantId: string,
    from: Date,
    to: Date,
    providerId: string | null,
  ): Promise<AnalyticsAppointment[]> {
    if (from.getTime() === to.getTime()) {
      return [];
    }

    const maxChunkMs = 31 * 24 * 60 * 60 * 1000;
    const journals = [];
    let cursor = from.getTime();
    while (cursor < to.getTime()) {
      const chunkTo = Math.min(cursor + maxChunkMs, to.getTime());
      journals.push(
        // 🔴 Аналитике отмены нужны. Без этого флага отменённая запись не
        // доходит сюда вообще, счётчик отмен всегда ноль, и владельцу
        // отвечали «отмен нет (0%)» вместо «не вижу». Сетка расписания флаг не
        // ставит и отменённых визитов по-прежнему не показывает.
        await this.crmService.getJournal(
          tenantId,
          {
            from: new Date(cursor).toISOString(),
            to: new Date(chunkTo).toISOString(),
            ...(providerId ? { providerId } : {}),
          },
          { includeCanceled: true },
        ),
      );
      cursor = chunkTo;
    }

    const unique = new Map<string, AnalyticsAppointment>();
    for (const journal of journals) {
      for (const appointment of journal.appointments) {
        const startAt = new Date(appointment.start_at);
        if (
          Number.isNaN(startAt.getTime()) ||
          startAt.getTime() < from.getTime() ||
          startAt.getTime() > to.getTime()
        ) {
          continue;
        }
        unique.set(appointment.id, {
          id: appointment.id,
          clientId: appointment.client.id,
          branchId: appointment.branch,
          staffExternalId: appointment.provider.id,
          staffName:
            typeof appointment.provider.name === 'string' &&
            appointment.provider.name.trim() !== ''
              ? appointment.provider.name.trim()
              : null,
          services: appointment.services.map((service) => ({
            id: service.id,
            name: service.name,
            amountKopecks: Math.round(service.price * 100),
            currency: service.currency,
          })),
          startAt,
          durationMinutes: Math.max(
            0,
            Math.round(
              (new Date(appointment.end_at).getTime() - startAt.getTime()) /
                60_000,
            ),
          ),
          status: appointment.status,
          totalPriceKopecks:
            appointment.total_price === null
              ? null
              : Math.round(appointment.total_price * 100),
          currency: appointment.currency,
        });
      }
    }

    return [...unique.values()].sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
  }

  private aggregate(
    appointments: AnalyticsAppointment[],
    expenses: AnalyticsExpense[],
    timezone: string,
    from: Date,
    to: Date,
    dataSource: 'maya' | 'crm' = 'maya',
    cohortHistory: ClientCohortHistory = {
      status: 'unavailable',
      reason: 'lookback_window_unavailable',
    },
  ) {
    const activeAppointments = appointments.filter(
      (appointment) => !this.isCancelled(appointment.status),
    );
    const cancelledAppointments = appointments.filter((appointment) =>
      this.isCancelled(appointment.status),
    );
    const cancelledCount = cancelledAppointments.length;
    const pricedAppointments = activeAppointments.filter(
      (appointment) => appointment.totalPriceKopecks !== null,
    );
    const revenueByCurrency = this.sumByCurrency(
      pricedAppointments.map((appointment) => ({
        amountKopecks: appointment.totalPriceKopecks ?? 0,
        currency: appointment.currency,
      })),
    );
    const expensesByCurrency = this.sumByCurrency(expenses);
    const pricedCountByCurrency = new Map<string, number>();
    for (const appointment of pricedAppointments) {
      pricedCountByCurrency.set(
        appointment.currency,
        (pricedCountByCurrency.get(appointment.currency) ?? 0) + 1,
      );
    }
    const uniqueClients = new Set(
      activeAppointments
        .map((appointment) => appointment.clientId)
        .filter((clientId): clientId is string => clientId !== null),
    ).size;
    const unidentifiedClientAppointments = activeAppointments.filter(
      (appointment) => appointment.clientId === null,
    ).length;
    const identifiedClientVisits = new Map<string, number>();
    for (const appointment of activeAppointments) {
      if (!appointment.clientId) continue;
      identifiedClientVisits.set(
        appointment.clientId,
        (identifiedClientVisits.get(appointment.clientId) ?? 0) + 1,
      );
    }
    const repeatClientsInPeriod = [...identifiedClientVisits.values()].filter(
      (visits) => visits > 1,
    ).length;
    const cohorts = this.clientCohorts(identifiedClientVisits, cohortHistory);
    const bookedMinutes = activeAppointments.reduce(
      (total, appointment) => total + appointment.durationMinutes,
      0,
    );
    const daily = new Map<string, AnalyticsBreakdown>();
    const staff = new Map<string, AnalyticsStaffBreakdown>();
    const services = new Map<
      string,
      {
        name: string;
        appointments: number;
        revenueByCurrency: Map<string, number>;
      }
    >();

    for (const appointment of activeAppointments) {
      const day = this.dateKey(appointment.startAt, timezone);
      const dayItem = daily.get(day) ?? {
        appointments: 0,
        revenueByCurrency: new Map<string, number>(),
      };
      dayItem.appointments += 1;
      this.addRevenue(dayItem, appointment);
      daily.set(day, dayItem);

      const staffItem = this.staffBucket(staff, appointment);
      staffItem.appointments += 1;
      staffItem.bookedMinutes += appointment.durationMinutes;
      if (appointment.clientId) {
        staffItem.clientVisits.set(
          appointment.clientId,
          (staffItem.clientVisits.get(appointment.clientId) ?? 0) + 1,
        );
      }
      this.addRevenue(staffItem, appointment);

      for (const service of appointment.services) {
        const serviceItem = services.get(service.id) ?? {
          name: service.name,
          appointments: 0,
          revenueByCurrency: new Map<string, number>(),
        };
        serviceItem.appointments += 1;
        serviceItem.revenueByCurrency.set(
          service.currency,
          (serviceItem.revenueByCurrency.get(service.currency) ?? 0) +
            service.amountKopecks,
        );
        services.set(service.id, serviceItem);

        // Разрез «мастер × услуга» собираем здесь же: отдельного обхода и
        // тем более отдельного запроса к CRM он не стоит.
        const staffService = staffItem.services.get(service.id) ?? {
          name: service.name,
          appointments: 0,
        };
        staffService.appointments += 1;
        staffItem.services.set(service.id, staffService);
      }
    }

    // 🔴 Отдельный проход по отменам. Основной цикл идёт по активным записям —
    // отменённые до него не доходили вовсе, и на вопрос «у кого больше отмен»
    // ответа не существовало ни в одном поле. Здесь же заводится строка
    // мастера, у которого в периоде НИЧЕГО, кроме отмен, не было: это тоже
    // ответ. Новых обращений к CRM или БД проход не стоит — отменённые записи
    // уже лежат в тех же исходных данных.
    for (const appointment of cancelledAppointments) {
      this.staffBucket(staff, appointment).cancelled += 1;
    }

    return {
      data_source: dataSource,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone,
      },
      appointments: {
        total: appointments.length,
        active: activeAppointments.length,
        cancelled: cancelledCount,
        cancellation_rate_percent:
          appointments.length === 0
            ? 0
            : Math.round((cancelledCount / appointments.length) * 1_000) / 10,
        unique_clients: uniqueClients,
        repeat_clients_in_period: repeatClientsInPeriod,
        repeat_client_rate_percent:
          uniqueClients === 0
            ? 0
            : Math.round((repeatClientsInPeriod / uniqueClients) * 1_000) / 10,
        identified_client_visits: [...identifiedClientVisits.values()].reduce(
          (total, visits) => total + visits,
          0,
        ),
        // Когорты по горизонту, а не по нахлёсту визитов внутри окна.
        // `cohort_lookback_days` обязателен всегда, в том числе когда когорты
        // недоступны: без горизонта числа «вернувшихся» ничего не значат.
        clients_returning: cohorts.returning,
        clients_new: cohorts.fresh,
        returning_share_percent: cohorts.returningSharePercent,
        cohort_lookback_days: CLIENT_COHORT_LOOKBACK_DAYS,
        cohort_status: cohortHistory.status,
        cohort_unavailable_reason:
          cohortHistory.status === 'available' ? null : cohortHistory.reason,
        booked_minutes: bookedMinutes,
      },
      revenue: revenueByCurrency,
      expenses: expensesByCurrency,
      /**
       * 🔴 ПРИБЫЛИ ЗДЕСЬ НЕТ — И НЕ БУДЕТ. Поле остаётся пустым всегда.
       *
       * Раньше тут стояло `revenue − expenses`, и оба слагаемых были не теми,
       * чем казались. `revenue` выше — сумма цен из ЖУРНАЛА записей, то есть
       * стоимость записанного, а не пробитая касса; у салона на внешней CRM это
       * вообще не про деньги салона. `expenses` — что владелец успел завести
       * руками: один расход на 500 ₽ за месяц давал «прибыль», почти равную
       * выручке. Настоящая прибыль считается от подтверждённой кассы и только
       * при полной книге расходов — это `getBusinessProfitability`.
       */
      net: [] as Array<{ currency: string; amount_kopecks: number }>,
      net_status: 'unavailable' as const,
      net_unavailable_reason: NET_PROFIT_UNAVAILABLE.notInOperationalOverview,
      average_ticket: revenueByCurrency.map((revenue) => ({
        currency: revenue.currency,
        amount_kopecks:
          (pricedCountByCurrency.get(revenue.currency) ?? 0) > 0
            ? Math.round(
                revenue.amount_kopecks /
                  (pricedCountByCurrency.get(revenue.currency) ?? 1),
              )
            : 0,
      })),
      daily: [...daily.entries()].map(([date, value]) => ({
        date,
        appointments: value.appointments,
        revenue: this.serializeCurrencyMap(value.revenueByCurrency),
      })),
      // 🔴 Порядок обязан быть детерминированным: по нему слой AI-инструментов
      // различает тёзок («Илья» и «Илья (2)»). Раньше мастера шли в порядке
      // выхода в смену, и между двумя периодами один и тот же человек
      // оказывался на разных местах — различитель переезжал бы с одного на
      // другого, и сравнение периодов сопоставляло бы разных людей.
      staff: [...staff.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([staff_external_id, value]) => ({
          staff_external_id,
          name: value.name,
          appointments: value.appointments,
          cancelled: value.cancelled,
          cancellation_rate_percent:
            value.appointments + value.cancelled === 0
              ? 0
              : Math.round(
                  (value.cancelled / (value.appointments + value.cancelled)) *
                    1_000,
                ) / 10,
          unique_clients: value.clientVisits.size,
          repeat_clients_in_period: [...value.clientVisits.values()].filter(
            (visits) => visits > 1,
          ).length,
          revenue: this.serializeCurrencyMap(value.revenueByCurrency),
          booked_minutes: value.bookedMinutes,
          services: [...value.services.values()]
            .sort(
              (left, right) =>
                right.appointments - left.appointments ||
                left.name.localeCompare(right.name),
            )
            .map((service) => ({
              name: service.name,
              appointments: service.appointments,
            })),
        })),
      services: [...services.values()]
        .sort(
          (left, right) =>
            right.appointments - left.appointments ||
            left.name.localeCompare(right.name),
        )
        .map((value) => ({
          name: value.name,
          appointments: value.appointments,
          booked_value: this.serializeCurrencyMap(value.revenueByCurrency),
        })),
      data_quality: {
        priced_appointments: pricedAppointments.length,
        active_appointments: activeAppointments.length,
        unidentified_client_appointments: unidentifiedClientAppointments,
        revenue_coverage:
          activeAppointments.length === 0
            ? 1
            : pricedAppointments.length / activeAppointments.length,
        note:
          pricedAppointments.length === activeAppointments.length
            ? null
            : 'Appointments created before price snapshots are excluded from revenue.',
      },
    };
  }

  /**
   * Строка мастера, создавая её при первом появлении.
   *
   * Заводится и активной записью, и отменой: иначе мастер, у которого в
   * периоде одни отмены, просто исчезал бы из разреза.
   */
  private staffBucket(
    staff: Map<string, AnalyticsStaffBreakdown>,
    appointment: AnalyticsAppointment,
  ): AnalyticsStaffBreakdown {
    const item = staff.get(appointment.staffExternalId) ?? {
      name: null,
      appointments: 0,
      cancelled: 0,
      bookedMinutes: 0,
      clientVisits: new Map<string, number>(),
      revenueByCurrency: new Map<string, number>(),
      services: new Map<string, { name: string; appointments: number }>(),
    };
    item.name ??= appointment.staffName;
    staff.set(appointment.staffExternalId, item);
    return item;
  }

  /**
   * Разделение клиентов периода на вернувшихся и впервые замеченных.
   *
   * «Вернувшийся» здесь означает ровно одно: у клиента был визит в течение
   * lookback-горизонта ДО начала периода. Это НЕ «постоянный клиент салона» —
   * тот, кто ходит раз в полгода, в 90-дневный горизонт не попадёт.
   */
  private clientCohorts(
    identifiedClientVisits: Map<string, number>,
    history: ClientCohortHistory,
  ): {
    returning: number | null;
    fresh: number | null;
    returningSharePercent: number | null;
  } {
    if (history.status !== 'available') {
      return { returning: null, fresh: null, returningSharePercent: null };
    }
    let returning = 0;
    for (const clientId of identifiedClientVisits.keys()) {
      if (history.clientIds.has(clientId)) {
        returning += 1;
      }
    }
    const identified = identifiedClientVisits.size;
    return {
      returning,
      fresh: identified - returning,
      returningSharePercent:
        identified === 0
          ? 0
          : Math.round((returning / identified) * 1_000) / 10,
    };
  }

  /**
   * Расходы периода вместе с категорией.
   *
   * Отдельный запрос, а не расширение обзорного: обзор категорию не возит
   * специально — см. комментарий у `AnalyticsCategoryExpense`. `null` означает
   * «книгу расходов прочитать не удалось»; ноль расходов — это пустой массив,
   * и путать эти два состояния нельзя: при первом прибыли нет, при втором она
   * не считается из-за неполноты и об этом надо сказать словами.
   */
  private async loadCategorisedExpenses(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsCategoryExpense[] | null> {
    if (typeof this.prisma.expense?.findMany !== 'function') {
      return null;
    }
    try {
      return await this.prisma.expense.findMany({
        where: { tenantId, occurredAt: { gte: from, lte: to } },
        select: {
          category: true,
          amountKopecks: true,
          currency: true,
          occurredAt: true,
        },
      });
    } catch {
      return null;
    }
  }

  /**
   * Подтверждённая касса за период.
   *
   * Единственный признанный источник — финансовые операции внешней CRM, и
   * только когда она сама пометила их подтверждёнными. Внутренний календарь
   * кассу не ведёт вовсе: там есть цены записанных услуг, а это стоимость
   * записанного, а не пробитые деньги. Подставить одно вместо другого — ровно
   * тот класс вранья, ради которого весь этот метод и существует.
   */
  private confirmedRevenue(
    external: boolean,
    finance: CrmFinancialSummary | null,
  ) {
    if (!external) {
      return this.unavailableConfirmedRevenue(
        CONFIRMED_REVENUE_UNAVAILABLE.internalCalendar,
      );
    }
    if (!finance) {
      return this.unavailableConfirmedRevenue(
        CONFIRMED_REVENUE_UNAVAILABLE.crmUnavailable,
      );
    }
    const revenue = finance.revenue;
    if (
      revenue?.status !== 'available' ||
      revenue.verified !== true ||
      !revenue.total ||
      typeof revenue.total.amount_kopecks !== 'number'
    ) {
      return this.unavailableConfirmedRevenue(
        CONFIRMED_REVENUE_UNAVAILABLE.crmUnverified,
      );
    }
    return {
      status: 'available' as const,
      verified: true,
      source: 'crm_financial_transactions' as const,
      transaction_count: revenue.transaction_count ?? null,
      total: this.money(revenue.total.currency, revenue.total.amount_kopecks),
      unavailable_reason: null as string | null,
    };
  }

  private unavailableConfirmedRevenue(reason: string) {
    return {
      status: 'unavailable' as const,
      verified: false,
      source: null,
      transaction_count: null as number | null,
      total: null as ProfitMoney | null,
      unavailable_reason: reason as string | null,
    };
  }

  /**
   * Книга расходов периода, сведённая к каноническим категориям.
   *
   * 🔴 ЗАРПЛАТА ВХОДИТ РОВНО ОДИН РАЗ. Расчёт зарплаты ведёт CRM, и он же —
   * единственный авторитетный источник. Если владелец вдобавок завёл ручной
   * расход «зарплата», сумма при наивном сложении удвоилась бы, и прибыль
   * оказалась бы занижена на целый фонд оплаты труда. Поэтому при доступном
   * расчёте CRM ручные записи о зарплате ОТБРАСЫВАЮТСЯ, а не суммируются, —
   * и отброшенное показывается отдельной строкой, чтобы владелец понял, куда
   * делись его цифры.
   *
   * Начисленное, а не выплаченное: расход периода — это то, что за период
   * начислено. Выплата могла уехать на следующий месяц и к прибыли этого
   * периода отношения не имеет.
   */
  private expenseLedger(
    rows: AnalyticsCategoryExpense[] | null,
    finance: CrmFinancialSummary | null,
  ): ExpenseLedger {
    if (rows === null) {
      return this.emptyLedger(NET_PROFIT_UNAVAILABLE.expenseLedgerUnavailable);
    }
    const warnings: Array<{ code: string; message: string }> = [];
    const payroll = finance?.payroll;
    const accrued =
      payroll?.status === 'available' &&
      payroll.verified === true &&
      payroll.accrued_total &&
      typeof payroll.accrued_total.amount_kopecks === 'number' &&
      // Ноль начислений при живой выручке означает, что расчёт за период просто
      // не сделан. Признать такой ноль зарплатой значило бы закрыть гейт
      // полноты пустотой — тогда лучше честно откатиться к ручным расходам.
      payroll.accrued_total.amount_kopecks > 0
        ? payroll.accrued_total
        : null;

    const totals = new Map<string, number>();
    const categories = new Map<string, ExpenseCategoryRow>();
    const ignoredSalary = new Map<string, number>();
    let manualSalarySeen = false;

    for (const row of rows) {
      const category = this.canonicalExpenseCategory(row.category);
      if (category === 'salary') {
        manualSalarySeen = true;
        if (accrued) {
          ignoredSalary.set(
            row.currency,
            (ignoredSalary.get(row.currency) ?? 0) + row.amountKopecks,
          );
          continue;
        }
      }
      this.addLedgerRow(
        categories,
        totals,
        category,
        'owner_manual',
        row.currency,
        row.amountKopecks,
      );
    }

    if (accrued) {
      this.addLedgerRow(
        categories,
        totals,
        'salary',
        'crm_payroll',
        accrued.currency,
        accrued.amount_kopecks,
      );
      if (manualSalarySeen) {
        warnings.push({
          code: 'manual_salary_expenses_replaced_by_crm_payroll',
          message:
            'Зарплата взята из расчёта CRM. Ручные расходы с той же категорией не сложены с ним, иначе фонд оплаты труда посчитался бы дважды.',
        });
      }
    }

    return {
      status: 'available',
      unavailable_reason: null,
      salary_source: accrued
        ? 'crm_payroll'
        : manualSalarySeen
          ? 'owner_manual'
          : null,
      by_category: [...categories.values()].sort(
        (left, right) =>
          right.amount_kopecks - left.amount_kopecks ||
          left.category.localeCompare(right.category),
      ),
      totals: [...totals.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => this.money(currency, amount)),
      ignored_manual_salary: [...ignoredSalary.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => this.money(currency, amount)),
      warnings,
    };
  }

  private addLedgerRow(
    categories: Map<string, ExpenseCategoryRow>,
    totals: Map<string, number>,
    category: string,
    source: 'owner_manual' | 'crm_payroll',
    currency: string,
    amountKopecks: number,
  ): void {
    const key = `${category}|${currency}|${source}`;
    const existing = categories.get(key);
    if (existing) {
      existing.amount_kopecks += amountKopecks;
      existing.amount_major_units = existing.amount_kopecks / 100;
    } else {
      categories.set(key, {
        category,
        label: this.expenseCategoryLabel(category),
        source,
        currency,
        amount_kopecks: amountKopecks,
        amount_major_units: amountKopecks / 100,
      });
    }
    totals.set(currency, (totals.get(currency) ?? 0) + amountKopecks);
  }

  private emptyLedger(reason: string): ExpenseLedger {
    return {
      status: 'unavailable',
      unavailable_reason: reason,
      salary_source: null,
      by_category: [],
      totals: [],
      ignored_manual_salary: [],
      warnings: [],
    };
  }

  /**
   * Гейт полноты: без каких статей прибыли не бывает.
   *
   * Категория считается заполненной, только если её сумма и существует, и
   * правдоподобна относительно подтверждённой кассы периода. Три состояния,
   * и путать их нельзя:
   * • `complete` — всё, что владелец обязан внести, внесено и похоже на правду;
   * • `incomplete` — статьи просто нет («аренды нет»);
   * • `understated` — статья есть, но сумма исчезающе мала на фоне кассы, то
   *   есть «похоже, внесено не всё». Это не полнота: считать по ней прибыль —
   *   значит завысить её почти до выручки.
   *
   * Зарплата в этот гейт не входит: её нельзя внести руками, и её отсутствие
   * разбирается отдельно, у источника CRM.
   */
  private expenseCompleteness(
    ledger: ExpenseLedger,
    revenue: ReturnType<OperationsAnalyticsService['confirmedRevenue']>,
  ) {
    const confirmed =
      revenue.status === 'available' && revenue.total ? revenue.total : null;
    const amounts = new Map<string, number>();
    for (const row of ledger.by_category) {
      // Чужая валюта в долю от кассы не складывается: курса у нас нет, а
      // сложить «1000 ₸» с «60000 ₽» значило бы выдумать число.
      if (confirmed && row.currency !== confirmed.currency) {
        continue;
      }
      amounts.set(
        row.category,
        (amounts.get(row.category) ?? 0) + row.amount_kopecks,
      );
    }

    const missing: string[] = [];
    const understated: Array<{
      category: string;
      label: string;
      recorded: ProfitMoney;
      share_of_confirmed_revenue_percent: number;
    }> = [];
    for (const category of REQUIRED_PROFIT_EXPENSE_CATEGORIES) {
      const amount = amounts.get(category) ?? 0;
      if (amount <= 0) {
        missing.push(category);
        continue;
      }
      // Порог применим только там, где есть с чем сравнивать. Нет
      // подтверждённой кассы или она нулевая — прибыли всё равно не будет, и
      // выдумывать «подозрительность» на пустом знаменателе незачем.
      if (!confirmed || confirmed.amount_kopecks <= 0) {
        continue;
      }
      const share = amount / confirmed.amount_kopecks;
      if (share < MIN_PLAUSIBLE_EXPENSE_SHARE_OF_CONFIRMED_REVENUE) {
        understated.push({
          category,
          label: this.expenseCategoryLabel(category),
          recorded: this.money(confirmed.currency, amount),
          share_of_confirmed_revenue_percent:
            Math.round(share * 1_000_000) / 10_000,
        });
      }
    }

    const status =
      ledger.status !== 'available' || missing.length > 0
        ? 'incomplete'
        : understated.length > 0
          ? 'understated'
          : 'complete';

    return {
      status,
      required_categories: REQUIRED_PROFIT_EXPENSE_CATEGORIES.map(
        (category) => ({
          category,
          label: this.expenseCategoryLabel(category),
        }),
      ),
      present_categories: [...amounts.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([category]) => category)
        .sort((left, right) => left.localeCompare(right)),
      missing_categories: missing.map((category) => ({
        category,
        label: this.expenseCategoryLabel(category),
      })),
      understated_categories: understated,
      min_plausible_share_percent:
        MIN_PLAUSIBLE_EXPENSE_SHARE_OF_CONFIRMED_REVENUE * 100,
    };
  }

  /**
   * Есть ли за период расчёт зарплаты — и почему его нет.
   *
   * 🔴 Отдельно от гейта полноты намеренно. Владелец не может внести зарплату
   * руками: она приходит расчётом из CRM. Смешать её с «внесите аренду» значило
   * бы советовать невозможное — самый дорогой вид бесполезного совета, потому
   * что человек идёт выполнять и упирается в запрет.
   */
  private payrollSource(ledger: ExpenseLedger) {
    if (ledger.salary_source === 'crm_payroll') {
      return {
        status: 'available' as const,
        source: 'crm_payroll' as const,
        unavailable_reason: null as string | null,
        owner_can_record: false,
      };
    }
    return {
      status: 'unavailable' as const,
      source: ledger.salary_source,
      unavailable_reason: NET_PROFIT_UNAVAILABLE.payrollMissing,
      // Ровно то поле, из-за отсутствия которого рождался замкнутый круг.
      owner_can_record: false,
    };
  }

  /**
   * Чистая прибыль: подтверждённая касса минус ПОЛНЫЕ расходы.
   *
   * Любая недостача превращается в отказ с причиной. Числа «почти прибыль»
   * здесь нет и быть не должно: владелец не отличит его от настоящего.
   */
  private netProfit(
    revenue: ReturnType<OperationsAnalyticsService['confirmedRevenue']>,
    ledger: ExpenseLedger,
    completeness: ReturnType<OperationsAnalyticsService['expenseCompleteness']>,
    payroll: ReturnType<OperationsAnalyticsService['payrollSource']>,
    forcedReason?: string,
  ) {
    const refusal = (reason: string) => ({
      status: 'unavailable' as const,
      total: null as ProfitMoney | null,
      margin_percent: null as number | null,
      unavailable_reason: reason,
      // 🔴 Только то, что владелец физически может внести сам. Зарплаты здесь
      // нет никогда — её источник CRM, и она разбирается полем `payroll`.
      missing_categories: completeness.missing_categories,
      understated_categories: completeness.understated_categories,
      payroll,
    });

    if (forcedReason) {
      return refusal(forcedReason);
    }
    if (ledger.status !== 'available') {
      return refusal(
        ledger.unavailable_reason ??
          NET_PROFIT_UNAVAILABLE.expenseLedgerUnavailable,
      );
    }
    if (revenue.status !== 'available' || !revenue.total) {
      return refusal(NET_PROFIT_UNAVAILABLE.confirmedRevenueMissing);
    }
    // 🔴 Сначала зарплата, потом недостающие статьи. Порядок важен по-людски:
    // когда нет и того и другого, MAYA просила внести аренду — владелец вносил,
    // и прибыль всё равно не считалась, потому что настоящий блокер был другой.
    // Совет обязан быть тем, после которого получится ответ. Зарплата приходит
    // только расчётом CRM, и на периоде длиннее месяца CRM его не отдаёт —
    // внести её руками нельзя, значит и предлагать нечего.
    if (payroll.status !== 'available') {
      return refusal(NET_PROFIT_UNAVAILABLE.payrollMissing);
    }
    if (completeness.missing_categories.length > 0) {
      return refusal(NET_PROFIT_UNAVAILABLE.incompleteExpenses);
    }
    if (completeness.status !== 'complete') {
      return refusal(NET_PROFIT_UNAVAILABLE.understatedExpenses);
    }
    const currency = revenue.total.currency;
    const foreign = ledger.totals.filter((item) => item.currency !== currency);
    if (foreign.length > 0) {
      // Отбросить чужую валюту значило бы занизить расходы и завысить прибыль —
      // именно в ту сторону, в которую ошибаться нельзя. Курса у нас нет.
      return refusal(NET_PROFIT_UNAVAILABLE.currencyMismatch);
    }
    const expenseTotal =
      ledger.totals.find((item) => item.currency === currency)
        ?.amount_kopecks ?? 0;
    const amount = revenue.total.amount_kopecks - expenseTotal;
    return {
      status: 'available' as const,
      total: this.money(currency, amount),
      margin_percent:
        revenue.total.amount_kopecks === 0
          ? null
          : Math.round((amount / revenue.total.amount_kopecks) * 1_000) / 10,
      unavailable_reason: null as string | null,
      missing_categories: completeness.missing_categories,
      understated_categories: completeness.understated_categories,
      payroll,
    };
  }

  /**
   * Стоимость привлечения нового клиента: реклама периода ÷ новые клиенты.
   *
   * «Новый» здесь — из когорт: гость периода, у которого НЕ было визита за
   * `cohort_lookback_days` дней до его начала. Горизонт обязателен в ответе
   * всегда: без него число читается как «стоимость нового клиента вообще», а
   * оно про конкретное окно. Знаменатель ноль — отказ, а не деление.
   */
  private clientAcquisitionCost(
    ledger: ExpenseLedger,
    overview: ProfitabilityCohortSource | null | undefined,
    forcedReason?: string,
  ) {
    const marketing = ledger.by_category.filter(
      (row) => row.category === MARKETING_EXPENSE_CATEGORY,
    );
    const marketingCurrencies = [
      ...new Set(marketing.map((row) => row.currency)),
    ];
    const spend =
      marketingCurrencies.length === 1
        ? this.money(
            marketingCurrencies[0],
            marketing.reduce((total, row) => total + row.amount_kopecks, 0),
          )
        : null;
    const cohorts = overview?.appointments;
    const newClients =
      cohorts?.cohort_status === 'available' &&
      typeof cohorts.clients_new === 'number'
        ? cohorts.clients_new
        : null;
    const lookbackDays =
      typeof cohorts?.cohort_lookback_days === 'number'
        ? cohorts.cohort_lookback_days
        : CLIENT_COHORT_LOOKBACK_DAYS;

    const refusal = (reason: string) => ({
      status: 'unavailable' as const,
      cost_per_new_client: null as ProfitMoney | null,
      marketing_spend: spend,
      new_clients: newClients,
      cohort_lookback_days: lookbackDays,
      unavailable_reason: reason,
    });

    if (forcedReason) {
      return refusal(forcedReason);
    }
    if (ledger.status !== 'available') {
      return refusal(
        CLIENT_ACQUISITION_COST_UNAVAILABLE.expenseLedgerUnavailable,
      );
    }
    if (marketing.length === 0) {
      return refusal(CLIENT_ACQUISITION_COST_UNAVAILABLE.marketingSpendMissing);
    }
    if (!spend) {
      return refusal(CLIENT_ACQUISITION_COST_UNAVAILABLE.mixedCurrencies);
    }
    if (newClients === null) {
      return refusal(
        cohorts?.cohort_unavailable_reason ??
          CLIENT_ACQUISITION_COST_UNAVAILABLE.cohortsUnavailable,
      );
    }
    if (newClients === 0) {
      return refusal(CLIENT_ACQUISITION_COST_UNAVAILABLE.noNewClients);
    }
    return {
      status: 'available' as const,
      cost_per_new_client: this.money(
        spend.currency,
        Math.round(spend.amount_kopecks / newClients),
      ),
      marketing_spend: spend,
      new_clients: newClients,
      cohort_lookback_days: lookbackDays,
      unavailable_reason: null as string | null,
    };
  }

  private profitabilityEnvelope(input: {
    period: { from: string; to: string; timezone: string };
    dataSource: 'crm' | 'maya';
    revenue: ReturnType<OperationsAnalyticsService['confirmedRevenue']>;
    ledger: ExpenseLedger;
    overview?: ProfitabilityCohortSource | null;
    netProfitReason?: string;
    acquisitionReason?: string;
  }) {
    const completeness = this.expenseCompleteness(input.ledger, input.revenue);
    const payroll = this.payrollSource(input.ledger);
    const netProfit = this.netProfit(
      input.revenue,
      input.ledger,
      completeness,
      payroll,
      input.netProfitReason,
    );
    const acquisition = this.clientAcquisitionCost(
      input.ledger,
      input.overview,
      input.acquisitionReason,
    );
    const unavailableMetrics: Array<{
      key: string;
      reason: string;
      nearest_available_metric?: string;
    }> = [
      {
        key: 'marketing_roi',
        reason: MARKETING_ROI_UNAVAILABLE,
        nearest_available_metric: 'client_acquisition_cost',
      },
    ];
    if (netProfit.status !== 'available') {
      unavailableMetrics.unshift({
        key: 'net_profit',
        reason: netProfit.unavailable_reason ?? '',
      });
    }
    if (acquisition.status !== 'available') {
      unavailableMetrics.push({
        key: 'client_acquisition_cost',
        reason: acquisition.unavailable_reason ?? '',
      });
    }
    return {
      period: input.period,
      data_source: input.dataSource,
      confirmed_revenue: input.revenue,
      expenses: {
        status: input.ledger.status,
        unavailable_reason: input.ledger.unavailable_reason,
        salary_source: input.ledger.salary_source,
        totals: input.ledger.totals,
        // Доля статьи от подтверждённой кассы считается здесь, а не моделью:
        // деление — это счёт, а считать модели запрещено.
        by_category: input.ledger.by_category.map((row) => ({
          ...row,
          share_of_confirmed_revenue_percent: this.shareOfConfirmedRevenue(
            row,
            input.revenue,
          ),
        })),
        ignored_manual_salary: input.ledger.ignored_manual_salary,
      },
      completeness,
      payroll,
      net_profit: netProfit,
      client_acquisition_cost: acquisition,
      unavailable_metrics: unavailableMetrics,
      warnings: input.ledger.warnings,
    };
  }

  /** Доля строки расходов от подтверждённой кассы. `null` — сравнивать не с чем. */
  private shareOfConfirmedRevenue(
    row: ExpenseCategoryRow,
    revenue: ReturnType<OperationsAnalyticsService['confirmedRevenue']>,
  ): number | null {
    const confirmed =
      revenue.status === 'available' && revenue.total ? revenue.total : null;
    if (
      !confirmed ||
      confirmed.amount_kopecks <= 0 ||
      confirmed.currency !== row.currency
    ) {
      return null;
    }
    return (
      Math.round((row.amount_kopecks / confirmed.amount_kopecks) * 1_000_000) /
      10_000
    );
  }

  private canonicalExpenseCategory(category: string): string {
    const normalised = category
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, '_');
    return EXPENSE_CATEGORY_ALIASES[normalised] ?? normalised;
  }

  private expenseCategoryLabel(category: string): string {
    return EXPENSE_CATEGORY_LABELS[category] ?? category;
  }

  private money(currency: string, amountKopecks: number): ProfitMoney {
    return {
      currency,
      amount_kopecks: amountKopecks,
      amount_major_units: amountKopecks / 100,
    };
  }

  private sumByCurrency(
    items: Array<{ amountKopecks: number; currency: string }>,
  ) {
    const totals = new Map<string, number>();
    for (const item of items) {
      totals.set(
        item.currency,
        (totals.get(item.currency) ?? 0) + item.amountKopecks,
      );
    }
    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount_kopecks]) => ({ currency, amount_kopecks }));
  }

  private addRevenue(
    target: AnalyticsBreakdown,
    appointment: AnalyticsAppointment,
  ): void {
    if (appointment.totalPriceKopecks === null) {
      return;
    }
    target.revenueByCurrency.set(
      appointment.currency,
      (target.revenueByCurrency.get(appointment.currency) ?? 0) +
        appointment.totalPriceKopecks,
    );
  }

  private serializeCurrencyMap(amounts: Map<string, number>) {
    return [...amounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount_kopecks]) => ({ currency, amount_kopecks }));
  }

  private parseRange(query: AnalyticsRangeQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() > to.getTime()
    ) {
      throw new BadRequestException('Invalid analytics date range');
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Analytics date range cannot exceed 366 days',
      );
    }
    return { from, to };
  }

  private dateKey(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private isCancelled(status: string): boolean {
    return ['canceled', 'cancelled'].includes(status.trim().toLowerCase());
  }
}
