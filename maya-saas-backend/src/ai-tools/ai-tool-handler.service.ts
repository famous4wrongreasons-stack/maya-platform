import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import type { AnalyticsRangeQueryDto } from '../analytics/dto/analytics-range-query.dto';
import { AppointmentsService } from '../appointments/appointments.service';
import { CalendarSource, UserRole } from '../common/domain.enums';
import { CustomersService } from '../customers/customers.service';
import { CrmService } from '../crm/crm.service';
import type { StaffScheduleSlot } from '../crm/crm-adapter.interface';
import {
  findExpenseCategory,
  resolveExpenseCategory,
  rublesToKopecks,
} from '../expenses/expense-category';
import { ExpensesService } from '../expenses/expenses.service';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import type {
  AiToolPrincipal,
  ValidatedAiToolArguments,
} from './ai-tool.types';
import {
  ReportingPeriodResolver,
  type ReportingPeriodToolArgs,
} from './reporting-period.resolver';
import {
  collectUpsellOpportunities,
  computePeriodMoneyMotivation,
  toMotivationVisit,
} from './master-money-motivation';

const CRM_FINANCE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
]);
const SCHEDULE_MANAGER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
]);
/**
 * Кому можно показывать именованный разрез ПО ВСЕМ мастерам.
 *
 * Список повторяет BUSINESS_ROLES из каталога инструментов — те же владелец,
 * админ, управляющий и бухгалтер. Дублирование намеренное: каталог решает,
 * кого пускать к инструменту, а это — кого пускать к чужим именам. Если
 * когда-нибудь бизнес-аналитику откроют мастеру, имена коллег не поедут
 * вместе с ней.
 */
const NAMED_STAFF_BREAKDOWN_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
]);

/**
 * Деньги мастера: что CRM подтверждает поимённо, а что — нет.
 *
 * Подтверждённая ВЫРУЧКА мастера строится только по стабильной связи YClients:
 * финансовая операция -> record_id -> staff_id записи. Цены из журнала сами
 * по себе выручкой не являются: их и обнуляет fail-closed. Отдельно CRM отдаёт
 * расчёт зарплаты: НАЧИСЛЕНО и ВЫПЛАЧЕНО за период.
 *
 * Поэтому начисления и выручка разведены в два разных поля строки мастера:
 * `salary` (что салон должен мастеру) и `confirmed_revenue` (сколько он принёс
 * в кассу подтверждёнными оплатами услуг). Складывать их в одно поле нельзя:
 * для салона с процентной схемой начисление — это доля от выручки, и подмена
 * одного другим занижает деньги мастера ровно во столько раз, во сколько
 * отличается его процент.
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

type StaffRevenueRow = {
  total: StaffMoneyAmount;
  transactionCount: number;
};

type StaffRevenueScope =
  | {
      status: 'available';
      currency: string | null;
      rows: Map<string, StaffRevenueRow>;
    }
  | { status: 'unavailable'; reason: string };

/** Почему начислений по мастеру нет — машиночитаемо, без гадания. */
const STAFF_SALARY_UNAVAILABLE = {
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

/** Почему подтверждённой выручки мастера нет в конкретном срезе. */
const STAFF_CONFIRMED_REVENUE_UNAVAILABLE = {
  notRequested: 'staff_revenue_not_requested_for_this_report',
  maya: 'internal_calendar_records_booked_appointment_value_which_is_not_till_confirmed_cash',
  companyScope:
    'crm_staff_revenue_is_company_scoped_and_has_no_maya_branch_split',
  roleRestricted: 'role_not_allowed_to_read_staff_revenue',
  identityUnknown: 'employee_is_not_linked_to_a_crm_staff_record',
  financeUnavailable: 'crm_finance_unavailable',
  attributionUnavailable:
    'crm_service_payments_could_not_be_fully_joined_to_records_and_staff',
  rowUnavailable: 'crm_staff_revenue_row_unavailable_for_this_master',
} as const;

@Injectable()
export class AiToolHandlerService {
  private readonly businessQueryCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly employeeQueryCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();

  constructor(
    private readonly crmService: CrmService,
    private readonly appointmentsService: AppointmentsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly analyticsService: OperationsAnalyticsService,
    private readonly expensesService: ExpensesService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly staffService: StaffService,
  ) {}

  async execute(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ): Promise<unknown> {
    switch (toolName) {
      case 'catalog.staff.read':
        return this.readStaff(principal.tenantId);
      case 'customers.count':
        return this.countCustomers(principal.tenantId);
      case 'catalog.services.read':
        return this.readServices(principal.tenantId);
      case 'booking.availability.read':
        return this.readAvailability(principal.tenantId, args);
      case 'appointments.own.list':
        return this.listOwnAppointments(principal);
      case 'loyalty.own.read':
        return this.readOwnLoyalty(principal);
      case 'analytics.employee.query':
        return this.queryEmployeeAnalytics(principal, args);
      case 'analytics.business.query':
        return this.queryBusinessAnalytics(principal, args);
      case 'analytics.business.profit':
        return this.readBusinessProfit(principal, args);
      case 'expenses.read':
        return this.readExpenses(principal.tenantId, args);
      case 'expenses.create':
        return this.createExpense(principal, args, idempotencyKey);
      case 'appointments.own.cancel':
        return this.cancelOwnAppointment(principal, args);
      case 'appointments.own.create':
        return this.createOwnAppointment(principal, args);
      case 'appointments.own.reschedule':
        return this.rescheduleOwnAppointment(principal, args);
      case 'staff.schedule.update':
        return this.applyStaffScheduleDayChange(principal, args);
      case 'loyalty.internal.adjust':
        return this.adjustInternalLoyalty(principal, args, idempotencyKey);
      default:
        throw new Error('Unreachable AI tool handler');
    }
  }

  private async countCustomers(tenantId: string) {
    const source = await this.crmService.getCalendarSource(tenantId);

    if (source === CalendarSource.EXTERNAL) {
      return this.crmService.countCustomers(tenantId);
    }

    const result = await this.customersService.countCustomers(tenantId);
    return {
      ...result,
      source: 'maya',
      provider: CalendarSource.INTERNAL,
      verified: true,
    };
  }

  private async readServices(tenantId: string) {
    const services = await this.crmService.getServices(tenantId);
    return {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        price: service.price,
        duration_minutes: service.duration_minutes,
        currency: service.currency,
        category: service.category ?? null,
      })),
    };
  }

  private async listOwnAppointments(principal: AiToolPrincipal) {
    const appointments = await this.appointmentsService.listClientAppointments(
      principal.tenantId,
      principal.userId,
    );
    return {
      appointments: appointments.map((item) => this.safeAppointment(item)),
    };
  }

  /**
   * Обезличенный список мастеров для записи.
   *
   * Ярлыки specialist_N вместо имён: это единственный список, доступный ГОСТЮ,
   * а гостю знать состав смены поимённо незачем. Владельцу имена приходят из
   * аналитики, где они уместны.
   */
  private async readStaff(tenantId: string) {
    const staff = await this.staffService.listStaff(tenantId);
    return {
      staff: staff.map((item, index) => ({
        id: item.id,
        label: `specialist_${index + 1}`,
        title: item.title ?? null,
        specialization: item.specialization ?? null,
      })),
    };
  }

  private async readAvailability(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    const slots = await this.appointmentsService.getAvailableSlots(tenantId, {
      date: this.requiredString(args.date),
      ...(typeof args.staff_id === 'string' ? { staffId: args.staff_id } : {}),
      ...(Array.isArray(args.service_ids)
        ? { serviceIds: this.stringArray(args.service_ids) }
        : {}),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    });
    return {
      slots: slots.map((slot) => ({
        start: slot.start,
        end: slot.end,
        staff_id: slot.staff_id,
        branch_id: slot.branch_id ?? null,
      })),
    };
  }

  private async readOwnLoyalty(principal: AiToolPrincipal) {
    const loyalty = await this.loyaltyService.getForUser(
      principal.tenantId,
      principal.userId,
    );
    return this.safeLoyalty(loyalty);
  }

  private async applyStaffScheduleDayChange(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    if (!SCHEDULE_MANAGER_ROLES.has(principal.role)) {
      throw new ForbiddenException({
        message: 'Staff schedule management is not available to this role.',
        error: { code: 'staff_schedule_forbidden' },
      });
    }
    const result = await this.crmService.applyStaffScheduleDayChange(
      principal.tenantId,
      {
        staffId: this.requiredString(args.staff_id),
        date: this.requiredString(args.date),
        slots: this.scheduleSlots(args.slots),
        expectedRevision: this.requiredString(args.current_revision),
      },
    );
    return {
      status: 'applied',
      date: result.date,
      is_working: result.is_working,
      slots: result.slots,
      verified: result.verified,
      existing_appointments_preserved: true,
    };
  }

  private async readExpenses(tenantId: string, args: ValidatedAiToolArguments) {
    const result = await this.expensesService.list(
      tenantId,
      await this.reportingQuery(tenantId, args),
    );
    return {
      // 🔴 Разрез по статьям считает сервер. «Сколько ушло на расходники» без
      // него неотвечаемо: модели складывать запрещено, а перечень отдельных
      // платежей — это не ответ, а работа, переложенная на владельца.
      by_category: this.expenseCategoryTotals(result.items),
      items: result.items.map((item) => ({
        id: item.id,
        branch_id: item.branch_id,
        category: item.category,
        // Постоянная или переменная — без этого маржу не разложить.
        category_kind: item.category_kind,
        // Записи со старой свободной категорией читаются как `other`,
        // но то, что там было написано, не прячем.
        category_raw: item.category_raw,
        amount_kopecks: item.amount_kopecks,
        amount_major_units: this.majorUnits(item.amount_kopecks),
        currency: item.currency,
        occurred_at: item.occurred_at,
        source: item.source,
      })),
      totals: this.safeMoneyEntries(result.totals),
      truncated: result.truncated,
    };
  }

  /**
   * Суммы по статьям расходов за период — уже сложенные.
   *
   * Ключ — статья и валюта: складывать рубли с тенге нельзя, а разложить по
   * валютам дешевле, чем объяснять потом, откуда взялась смесь. Порядок —
   * от большего к меньшему: вопрос «на что больше всего тратим» отвечается
   * первой строкой, а не поиском максимума в голове у модели.
   */
  private expenseCategoryTotals(
    items: Array<{
      category: string;
      category_label?: string;
      category_kind?: string;
      currency: string;
      amount_kopecks: number;
    }>,
  ) {
    const totals = new Map<
      string,
      {
        category: string;
        label: string;
        kind: string;
        currency: string;
        amount_kopecks: number;
        expense_count: number;
      }
    >();
    for (const item of items) {
      const resolved = resolveExpenseCategory(item.category);
      const key = `${resolved.slug}|${item.currency}`;
      const row = totals.get(key) ?? {
        category: resolved.slug,
        label: resolved.label,
        kind: resolved.kind,
        currency: item.currency,
        amount_kopecks: 0,
        expense_count: 0,
      };
      row.amount_kopecks += item.amount_kopecks;
      row.expense_count += 1;
      totals.set(key, row);
    }
    return [...totals.values()]
      .sort(
        (left, right) =>
          right.amount_kopecks - left.amount_kopecks ||
          left.category.localeCompare(right.category),
      )
      .map((row) => ({
        ...row,
        amount_major_units: this.majorUnits(row.amount_kopecks),
      }));
  }

  /**
   * Прибыль, структура расходов и стоимость нового клиента.
   *
   * 🔴 Единственный путь из прода к движку прибыли. Пока его не было, движок
   * существовал только в собственном спеке: владелец спрашивал «прибыль
   * какая», а отвечать было нечем — вопрос уходил в операционный обзор, где
   * прибыли нет по построению.
   *
   * Обзор и финсводка загружаются здесь один раз и передаются движку
   * контекстом: без этого один вопрос стоил бы двойного прохода журнала CRM.
   */
  private async readBusinessProfit(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const window = await this.reportingWindow(principal.tenantId, args);
    const profitability = await this.analyticsService.getBusinessProfitability(
      principal.tenantId,
      window.query,
    );
    const data = this.record(profitability);
    const period = this.record(data.period);
    const resolved = this.resolvedPeriodPayload(args, window);
    return {
      ...data,
      resolved_period: resolved,
      period: {
        ...period,
        ...resolved,
        // Месяц ещё не кончился — сказать это обязаны мы, а не владелец,
        // который сам заметит расхождение с бухгалтерией.
        truncated_to_today: window.truncatedToToday,
      },
    };
  }

  /**
   * Записать расход из чата — уже после подтверждения человеком.
   *
   * Сумма приходит в рублях: модель повторяет то, что сказал человек, и не
   * пересчитывает разряды. В копейки её переводит сервер — единственным
   * помощником `rublesToKopecks`, чтобы «60 тысяч» не превратились в 600.
   */
  private async createExpense(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const category = this.requiredString(args.category);
    const amountKopecks = rublesToKopecks(args.amount_rubles);
    if (amountKopecks === null) {
      throw new BadRequestException({
        message: 'AI tool arguments are invalid.',
        error: {
          code: 'ai_tool_arguments_invalid',
          detail: 'amount_rubles is not a valid ruble amount',
        },
      });
    }

    const timezone = await this.reportingTimezone(principal.tenantId);
    // Дата к этому моменту уже проставлена: её подставляет `normalizeArguments`
    // ДО того, как карточка ушла человеку, — иначе он подтверждал бы расход, не
    // видя числа, за которое тот пишется.
    const occurredOn =
      typeof args.occurred_on === 'string'
        ? args.occurred_on
        : this.localDate(new Date(), timezone);
    // Полдень по часовому поясу салона: любой сдвиг ±14 часов оставляет
    // отметку внутри того же местного дня, поэтому расход не переезжает
    // в соседний месяц на границе периода.
    const occurredAt = localDateMinuteToUtc(occurredOn, 12 * 60, timezone);
    const note = typeof args.note === 'string' ? args.note : undefined;

    const expense = await this.expensesService.create(
      principal.tenantId,
      principal.userId,
      {
        category,
        amountKopecks,
        currency: 'RUB',
        occurredAt: occurredAt.toISOString(),
        ...(note ? { note } : {}),
      },
      // Повторное подтверждение той же карточки вернёт уже созданный расход.
      { source: 'manual', idempotencyKey },
    );

    const resolved = resolveExpenseCategory(expense.category);
    return {
      recorded: true,
      expense_id: expense.id,
      category: resolved.slug,
      category_label: resolved.label,
      category_kind: resolved.kind,
      amount_kopecks: expense.amount_kopecks,
      amount_major_units: this.majorUnits(expense.amount_kopecks),
      currency: expense.currency,
      occurred_at: expense.occurred_at,
      // Местная дата берётся из сохранённой записи, а не из аргументов: при
      // повторном подтверждении вернётся дата уже существующего расхода.
      occurred_on: this.localDate(new Date(expense.occurred_at), timezone),
      source: expense.source,
      // Тот же платёж мог приехать из CRM. Не блокируем — владелец может знать
      // лучше, — но говорим вслух, чтобы дубль не жил молча.
      possible_duplicate: expense.possible_duplicate ?? null,
    };
  }

  /**
   * Доводка аргументов ДО подписи и показа карточки.
   *
   * 🔴 Почему не в реестре: там нет ни тенанта, ни его часового пояса, а
   * «сегодня» — понятие местное. И почему до хеша: карточка подтверждения
   * обязана показывать ту самую дату, которая будет записана. Если оставить
   * «сегодня» неразрешённым до момента исполнения, человек подтверждает одно,
   * а сервер пишет другое — на границе суток буквально другое число.
   *
   * Для всех остальных инструментов это тождественное преобразование.
   */
  async normalizeArguments(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ): Promise<ValidatedAiToolArguments> {
    if (
      toolName !== 'expenses.create' ||
      typeof args.occurred_on === 'string'
    ) {
      return args;
    }
    const timezone = await this.reportingTimezone(principal.tenantId);
    return { ...args, occurred_on: this.localDate(new Date(), timezone) };
  }

  /**
   * Дописать в карточку подтверждения то, что видно только из базы.
   *
   * Пока что это одно: похоже ли расход на дубль уже записанного платежа из
   * другого источника. Предупреждение встаёт сразу после даты — то есть в
   * пределах тех шести полей, которые карточка вообще показывает.
   */
  async enrichApprovalPreview(
    toolName: string,
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (toolName !== 'expenses.create') {
      return payload;
    }
    const amountKopecks = rublesToKopecks(args.amount_rubles);
    const category = findExpenseCategory(args.category);
    if (amountKopecks === null || !category) {
      return payload;
    }
    const timezone = await this.reportingTimezone(principal.tenantId);
    const occurredOn =
      typeof args.occurred_on === 'string'
        ? args.occurred_on
        : this.localDate(new Date(), timezone);
    // Подсказка о дубле — украшение карточки. Если её не удалось собрать,
    // расход всё равно должен дойти до подтверждения: потерять запись из-за
    // необязательной проверки хуже, чем не предупредить.
    const duplicates = await this.expensesService
      .findProbableDuplicates(principal.tenantId, {
        category: category.slug,
        amountKopecks,
        currency: 'RUB',
        occurredAt: localDateMinuteToUtc(occurredOn, 12 * 60, timezone),
        source: 'manual',
      })
      .catch(() => []);
    if (duplicates.length === 0) {
      return payload;
    }
    const first = duplicates[0];
    const enriched: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      enriched[key] = value;
      if (key === 'date') {
        enriched.alert = `Похоже на дубль: такой же расход уже записан ${this.humanDay(
          this.localDate(new Date(first.occurred_at), timezone),
        )}${first.source === 'crm' ? ' (пришёл из CRM)' : ''}. Записать всё равно?`;
      }
    }
    return enriched;
  }

  private humanDay(localDate: string): string {
    const [year, month, day] = localDate.split('-');
    return `${day}.${month}.${year}`;
  }

  /**
   * Промежуточное представление аналитики: имя и внешний идентификатор мастера
   * ещё на месте. Отдавать это наружу нельзя — обязательно через
   * publishAnalytics.
   */
  private async readAnalytics(resultPromise: Promise<unknown>) {
    return this.safeAnalytics(await resultPromise);
  }

  /** Тоже промежуточное представление — см. readAnalytics. */
  private async readBusinessAnalytics(
    principal: AiToolPrincipal,
    query: AnalyticsRangeQueryDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: principal.tenantId },
      select: { calendarSource: true },
    });
    const shouldReadFinance =
      tenant?.calendarSource === 'external' &&
      !query.branchId &&
      CRM_FINANCE_ROLES.has(principal.role);
    const [overviewValue, financeSummary] = await Promise.all([
      this.analyticsService.getBusinessOverview(principal.tenantId, query),
      shouldReadFinance
        ? Promise.resolve()
            .then(() =>
              this.analyticsService.getBusinessFinance(
                principal.tenantId,
                query,
              ),
            )
            .then((value) => this.record(value))
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const overview = this.record(overviewValue);
    const operational = this.safeAnalytics(overview);
    if (overview.data_source !== 'crm') {
      // Внутренний календарь не считает зарплату вовсе: расчёта нет ни у кого,
      // и это свойство источника, а не запрета по роли.
      return this.withStaffMoney(
        operational,
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.internalCalendar,
        },
        {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.maya,
        },
      );
    }

    const failClosed = {
      ...operational,
      revenue: [],
      expenses: [],
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
      return this.withStaffMoney(
        {
          ...failClosed,
          finance: this.unavailableFinance('company_scope_only'),
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.companyScope,
        },
        {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.companyScope,
        },
      );
    }
    // 🔴 Начисления поимённо видит только тот, кому открыта касса салона.
    // Управляющий и руководитель филиала есть в разрезе мастеров по именам, но
    // в финансовых ролях их нет — им достаётся честное «недоступно с причиной»,
    // а не чужая зарплата в довесок к записям.
    if (!CRM_FINANCE_ROLES.has(principal.role)) {
      return this.withStaffMoney(
        {
          ...failClosed,
          finance: this.unavailableFinance('role_restricted'),
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.roleRestricted,
        },
        {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.roleRestricted,
        },
      );
    }
    if (!financeSummary) {
      return this.withStaffMoney(
        {
          ...failClosed,
          finance: this.unavailableFinance('finance_unavailable'),
        },
        {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.financeUnavailable,
        },
        {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.financeUnavailable,
        },
      );
    }

    const revenue = this.record(financeSummary.revenue);
    const payroll = this.record(financeSummary.payroll);
    const staffRevenue = this.record(financeSummary.staff_revenue);
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
    const payrollAvailable =
      payroll.status === 'available' && payroll.verified === true;
    const staffRevenueAvailable =
      staffRevenue.status === 'available' && staffRevenue.verified === true;

    return this.withStaffMoney(
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
          },
          staff_revenue: {
            status: staffRevenue.status ?? 'unavailable',
            verified: staffRevenue.verified === true,
            transaction_count:
              this.optionalMetricNumber(staffRevenue.transaction_count) ?? null,
            attributed_total: staffRevenueAvailable
              ? this.safeMoneyAmount(staffRevenue.attributed_total)
              : null,
            unattributed_total: staffRevenueAvailable
              ? this.safeMoneyAmount(staffRevenue.unattributed_total)
              : null,
          },
          payroll: {
            status: payroll.status ?? 'unavailable',
            verified: payroll.verified === true,
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
      this.staffRevenueScope(financeSummary),
    );
  }

  /**
   * Личный срез сотрудника вместе с его собственными начислениями.
   *
   * 🔴 Строки коллег не должны существовать даже внутри обработчика: разрез
   * сужается до самого спрашивающего ДО того, как что-либо уходит в публикацию.
   */
  private async readEmployeeAnalytics(
    principal: AiToolPrincipal,
    query: AnalyticsRangeQueryDto,
  ) {
    const internal = await this.readAnalytics(
      this.analyticsService.getEmployeeOverview(
        principal.tenantId,
        principal.userId,
        query,
      ),
    );
    const scopes = await this.employeeMoneyScopes(principal, query, internal);
    return this.withStaffMoney(internal, scopes.salary, scopes.revenue);
  }

  /**
   * Начисления самому сотруднику — и только ему.
   *
   * Мастер имеет право знать, сколько ему начислено: это его собственные
   * деньги, а не финансы салона. Но источник company-scoped, поэтому строка
   * выбирается по идентификатору сотрудника из ответа аналитики, и если его
   * нет — разрез закрывается целиком, а не открывается на всех.
   */
  private async employeeMoneyScopes(
    principal: AiToolPrincipal,
    query: AnalyticsRangeQueryDto,
    internal: unknown,
  ): Promise<{ salary: StaffSalaryScope; revenue: StaffRevenueScope }> {
    const data = this.record(internal);
    if (data.data_source !== 'crm') {
      return {
        salary: {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.internalCalendar,
        },
        revenue: {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.maya,
        },
      };
    }
    const externalId = data.employee_external_id;
    if (typeof externalId !== 'string' || externalId === '') {
      return {
        salary: {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.identityUnknown,
        },
        revenue: {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.identityUnknown,
        },
      };
    }
    if (query.branchId) {
      return {
        salary: {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.companyScope,
        },
        revenue: {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.companyScope,
        },
      };
    }

    const finance = await this.analyticsService.getStaffFinance(
      principal.tenantId,
      query,
    );
    if (!finance) {
      return {
        salary: {
          status: 'unavailable',
          reason: STAFF_SALARY_UNAVAILABLE.financeUnavailable,
        },
        revenue: {
          status: 'unavailable',
          reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.financeUnavailable,
        },
      };
    }
    const salaryScope = this.staffSalaryScope(finance);
    const revenueScope = this.staffRevenueScope(finance);
    const ownSalary =
      salaryScope.status === 'available'
        ? salaryScope.rows.get(externalId)
        : undefined;
    const ownRevenue =
      revenueScope.status === 'available'
        ? revenueScope.rows.get(externalId)
        : undefined;
    return {
      salary:
        salaryScope.status === 'available'
          ? {
              status: 'available',
              rows: ownSalary
                ? new Map<string, StaffSalaryRow>([[externalId, ownSalary]])
                : new Map<string, StaffSalaryRow>(),
            }
          : salaryScope,
      revenue:
        revenueScope.status === 'available'
          ? {
              status: 'available',
              currency: revenueScope.currency,
              rows: ownRevenue
                ? new Map<string, StaffRevenueRow>([[externalId, ownRevenue]])
                : new Map<string, StaffRevenueRow>(),
            }
          : revenueScope,
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

  /** Confirmed service revenue already reconciled by the CRM adapter. */
  private staffRevenueScope(value: unknown): StaffRevenueScope {
    const summary = this.record(value);
    const staffRevenue = this.record(summary.staff_revenue);
    const attributedTotal = this.safeMoneyAmount(staffRevenue.attributed_total);
    if (
      staffRevenue.status !== 'available' ||
      staffRevenue.verified !== true ||
      !attributedTotal ||
      !Array.isArray(staffRevenue.staff)
    ) {
      return {
        status: 'unavailable',
        reason: STAFF_CONFIRMED_REVENUE_UNAVAILABLE.attributionUnavailable,
      };
    }

    const accepted = new Map<string, StaffRevenueRow>();
    for (const entry of staffRevenue.staff) {
      const item = this.record(entry);
      const staffId =
        typeof item.staff_id === 'string' ? item.staff_id.trim() : '';
      const total = this.safeMoneyAmount(item.total);
      const transactionCount = this.optionalMetricNumber(
        item.transaction_count,
      );
      if (
        !staffId ||
        item.status !== 'available' ||
        item.verified !== true ||
        !total ||
        transactionCount === null
      ) {
        continue;
      }
      accepted.set(staffId, { total, transactionCount });
    }
    return {
      status: 'available',
      currency: attributedTotal.currency,
      rows: accepted,
    };
  }

  private withStaffMoney(
    value: unknown,
    salaryScope: StaffSalaryScope,
    revenueScope: StaffRevenueScope,
  ) {
    return this.withStaffConfirmedRevenue(
      this.withStaffSalary(value, salaryScope),
      revenueScope,
    );
  }

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

  private withStaffConfirmedRevenue(value: unknown, scope: StaffRevenueScope) {
    const data = this.record(value);
    return {
      ...data,
      staff_summary: this.staffRows(data).map((row) => ({
        ...row.entry,
        confirmed_revenue: this.staffRevenue(row.externalId, scope),
      })),
    };
  }

  private staffRevenue(externalId: string | null, scope: StaffRevenueScope) {
    if (scope.status !== 'available') {
      return this.unavailableStaffConfirmedRevenue(scope.reason);
    }
    if (!externalId) {
      return this.unavailableStaffConfirmedRevenue(
        STAFF_CONFIRMED_REVENUE_UNAVAILABLE.rowUnavailable,
      );
    }
    const row = scope.rows.get(externalId);
    const total =
      row?.total ??
      ({
        currency: scope.currency,
        amount_kopecks: 0,
        amount_major_units: 0,
      } satisfies StaffMoneyAmount);
    return {
      status: 'available',
      basis: 'crm_financial_transaction_record_join',
      transaction_count: row?.transactionCount ?? 0,
      amount: total,
      unavailable_reason: null,
    };
  }

  private unavailableStaffConfirmedRevenue(reason: string) {
    return {
      status: 'unavailable',
      basis: null,
      transaction_count: null,
      amount: null,
      unavailable_reason: reason,
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

  private async queryBusinessAnalytics(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const comparison = this.requiredString(args.comparison);
    if (
      !['none', 'previous_period', 'previous_year_same_period'].includes(
        comparison,
      )
    ) {
      throw new Error('Invalid business analytics comparison');
    }
    const cacheKey = [
      principal.tenantId,
      principal.role,
      this.requiredString(args.period),
      comparison,
      typeof args.day === 'string' ? args.day : '',
      typeof args.month === 'string' ? args.month : '',
      typeof args.from_day === 'string' ? args.from_day : '',
      typeof args.to_day === 'string' ? args.to_day : '',
      typeof args.from === 'string' ? args.from : '',
      typeof args.to === 'string' ? args.to : '',
      typeof args.branch_id === 'string' ? args.branch_id : '',
    ].join('|');
    const cached = this.businessQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached) {
      this.businessQueryCache.delete(cacheKey);
    }

    const window = await this.reportingWindow(principal.tenantId, args);
    const currentQuery = window.query;
    const previousQuery =
      comparison === 'none'
        ? null
        : await this.comparisonReportingQuery(
            principal.tenantId,
            currentQuery,
            comparison as 'previous_period' | 'previous_year_same_period',
          );
    const read = (query: AnalyticsRangeQueryDto) =>
      this.retryAnalyticsRead(() =>
        this.readBusinessAnalytics(principal, query),
      );
    const [currentInternal, previousInternal] = await Promise.all([
      read(currentQuery),
      previousQuery ? read(previousQuery) : Promise.resolve(null),
    ]);
    // Имена раздаются один раз на оба периода: тёзки обязаны получить один и
    // тот же различитель слева и справа, иначе «Илья (2)» в сравнении означал
    // бы разных людей.
    const staffScope = this.businessStaffScope(
      principal,
      currentInternal,
      previousInternal,
    );
    const current = this.publishAnalytics(currentInternal, staffScope);
    const previous = previousInternal
      ? this.publishAnalytics(previousInternal, staffScope)
      : null;
    const currentSnapshot = this.businessMetricSnapshot(current);
    const previousSnapshot = previous
      ? this.businessMetricSnapshot(previous)
      : null;
    const resolved = this.resolvedPeriodPayload(args, window);
    const basePeriod = this.record(current).period ?? currentQuery;
    const result = {
      verified: this.businessOperationalAnalyticsVerified(current),
      finance_verified:
        this.record(this.record(current).finance).verified === true,
      source: this.record(current).data_source ?? null,
      resolved_period: resolved,
      period: {
        ...this.record(basePeriod),
        ...resolved,
      },
      comparison: {
        mode: comparison,
        period: previous
          ? (this.record(previous).period ?? previousQuery)
          : null,
      },
      current,
      previous,
      metrics: currentSnapshot,
      changes: previousSnapshot
        ? this.businessMetricChanges(currentSnapshot, previousSnapshot)
        : {},
      service_changes: previous
        ? this.businessServiceChanges(current, previous)
        : [],
      staff_changes: previousInternal
        ? this.businessStaffChanges(
            currentInternal,
            previousInternal,
            staffScope,
          )
        : [],
      available_metrics: Object.entries(currentSnapshot)
        .filter(([, value]) => value !== null)
        .map(([key]) => key),
      unavailable_metrics: [
        ...this.clientCohortUnavailableMetrics(current),
        ...this.cancellationUnavailableMetrics(current),
        ...this.staffMoneyUnavailableMetrics(current),
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
      ],
    };
    if (result.verified) {
      this.businessQueryCache.set(cacheKey, {
        expiresAt: Date.now() + 5 * 60 * 1_000,
        value: result,
      });
    }
    return result;
  }

  private async queryEmployeeAnalytics(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const comparison = this.requiredString(args.comparison);
    if (
      !['none', 'previous_period', 'previous_year_same_period'].includes(
        comparison,
      )
    ) {
      throw new Error('Invalid employee analytics comparison');
    }
    const cacheKey = [
      principal.tenantId,
      principal.userId,
      this.requiredString(args.period),
      comparison,
      typeof args.day === 'string' ? args.day : '',
      typeof args.month === 'string' ? args.month : '',
      typeof args.from_day === 'string' ? args.from_day : '',
      typeof args.to_day === 'string' ? args.to_day : '',
      typeof args.from === 'string' ? args.from : '',
      typeof args.to === 'string' ? args.to : '',
      typeof args.branch_id === 'string' ? args.branch_id : '',
    ].join('|');
    const cached = this.employeeQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached) {
      this.employeeQueryCache.delete(cacheKey);
    }

    const window = await this.reportingWindow(principal.tenantId, args);
    const currentQuery = window.query;
    const previousQuery =
      comparison === 'none'
        ? null
        : await this.comparisonReportingQuery(
            principal.tenantId,
            currentQuery,
            comparison as 'previous_period' | 'previous_year_same_period',
          );
    const read = (query: AnalyticsRangeQueryDto) =>
      this.readEmployeeAnalytics(principal, query);
    const [currentInternal, previousInternal] = await Promise.all([
      read(currentQuery),
      previousQuery ? read(previousQuery) : Promise.resolve(null),
    ]);
    const staffScope = this.employeeStaffScope(
      currentInternal,
      previousInternal,
    );
    const current = this.publishAnalytics(currentInternal, staffScope);
    const previous = previousInternal
      ? this.publishAnalytics(previousInternal, staffScope)
      : null;
    const currentSnapshot = this.employeeMetricSnapshot(current);
    const previousSnapshot = previous
      ? this.employeeMetricSnapshot(previous)
      : null;
    const currentSource = this.record(current).data_source;
    const resolved = this.resolvedPeriodPayload(args, window);
    const basePeriod = this.record(current).period ?? currentQuery;
    const result = {
      verified:
        typeof currentSource === 'string' &&
        ['crm', 'maya'].includes(currentSource),
      source: typeof currentSource === 'string' ? currentSource : null,
      resolved_period: resolved,
      period: {
        ...this.record(basePeriod),
        ...resolved,
      },
      comparison: {
        mode: comparison,
        period: previous
          ? (this.record(previous).period ?? previousQuery)
          : null,
      },
      current,
      previous,
      metrics: currentSnapshot,
      changes: previousSnapshot
        ? this.businessMetricChanges(currentSnapshot, previousSnapshot)
        : {},
      service_changes: previous
        ? this.businessServiceChanges(current, previous)
        : [],
      staff_changes: previousInternal
        ? this.businessStaffChanges(
            currentInternal,
            previousInternal,
            staffScope,
          )
        : [],
      available_metrics: Object.entries(currentSnapshot)
        .filter(([, value]) => value !== null)
        .map(([key]) => key),
      unavailable_metrics: [
        ...this.clientCohortUnavailableMetrics(current),
        ...this.cancellationUnavailableMetrics(current),
        ...this.staffMoneyUnavailableMetrics(current),
        ...this.personalCashRevenueUnavailableMetrics(current),
        {
          key: 'other_employee_personal_data',
          reason: 'role scope permits only the current employee data',
        },
      ],
    };
    const motivation = await this.employeeMoneyMotivation(
      principal,
      currentQuery,
      current,
    );
    const enriched = motivation
      ? {
          ...result,
          money_motivation: motivation.money_motivation,
          upsell_opportunities: motivation.upsell_opportunities,
        }
      : result;
    if (enriched.verified) {
      this.employeeQueryCache.set(cacheKey, {
        expiresAt: Date.now() + 5 * 60 * 1_000,
        value: enriched,
      });
    }
    return enriched;
  }

  private async employeeMoneyMotivation(
    principal: AiToolPrincipal,
    query: AnalyticsRangeQueryDto,
    currentPublished: unknown,
  ): Promise<{
    money_motivation: ReturnType<typeof computePeriodMoneyMotivation>;
    upsell_opportunities: ReturnType<typeof collectUpsellOpportunities>;
  } | null> {
    try {
      const bundle = await this.analyticsService.getEmployeeMotivationVisits(
        principal.tenantId,
        principal.userId,
        query,
        60,
      );
      if (!bundle) return null;
      const mapVisit = (appointment: {
        clientId: string | null;
        startAt: Date;
        status: string;
        totalPriceKopecks: number | null;
        services: Array<{ name: string; amountKopecks: number }>;
      }) =>
        toMotivationVisit({
          clientId: appointment.clientId,
          startAt: appointment.startAt,
          status: appointment.status,
          totalPriceKopecks: appointment.totalPriceKopecks,
          services: appointment.services,
        });
      const periodVisits = bundle.period.map(mapVisit);
      const historyVisits = bundle.history.map(mapVisit);
      const staff = this.staffRows(currentPublished);
      const self = staff.length === 1 ? this.record(staff[0]) : {};
      const salary = this.record(self.salary);
      const accrued = this.record(salary.accrued);
      const earnedRub =
        salary.status === 'available' &&
        typeof accrued.amount_kopecks === 'number'
          ? Math.round(accrued.amount_kopecks / 100)
          : null;
      const money_motivation = computePeriodMoneyMotivation({
        periodVisits,
        historyVisits,
        earnedRub,
        lookbackDays: 60,
      });
      const upsell_opportunities = collectUpsellOpportunities({
        periodVisits,
        historyVisits: [...historyVisits, ...periodVisits],
        salaryShare: money_motivation.salary_share ?? 0.5,
        limit: 3,
      });
      return { money_motivation, upsell_opportunities };
    } catch {
      return null;
    }
  }

  private async comparisonReportingQuery(
    tenantId: string,
    current: AnalyticsRangeQueryDto,
    comparison: 'previous_period' | 'previous_year_same_period',
  ): Promise<AnalyticsRangeQueryDto> {
    const from = new Date(current.from);
    const to = new Date(current.to);
    if (comparison === 'previous_period') {
      const duration = to.getTime() - from.getTime();
      const previousTo = new Date(from.getTime() - 1);
      return {
        from: new Date(previousTo.getTime() - duration).toISOString(),
        to: previousTo.toISOString(),
        ...(current.branchId ? { branchId: current.branchId } : {}),
      };
    }

    const timezone = await this.reportingTimezone(tenantId, current.branchId);
    const shift = (value: Date) => {
      const local = this.localDateTime(value, timezone);
      const year = Number(local.date.slice(0, 4)) - 1;
      const date = this.sameLocalDateInYear(local.date, year);
      return new Date(
        localDateMinuteToUtc(
          date,
          local.hour * 60 + local.minute,
          timezone,
        ).getTime() +
          local.second * 1_000 +
          value.getUTCMilliseconds(),
      );
    };
    return {
      from: shift(from).toISOString(),
      to: shift(to).toISOString(),
      ...(current.branchId ? { branchId: current.branchId } : {}),
    };
  }

  private businessOperationalAnalyticsVerified(value: unknown): boolean {
    const data = this.record(value);
    return data.data_source === 'maya' || data.data_source === 'crm';
  }

  private async retryAnalyticsRead<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return read();
    }
  }

  private businessMetricSnapshot(value: unknown) {
    const data = this.record(value);
    const appointments = this.record(data.appointments);
    const finance = this.record(data.finance);
    const financeRevenue = this.record(finance.revenue);
    const revenue =
      this.safeMoneyAmount(financeRevenue.total) ??
      (Array.isArray(data.revenue)
        ? this.safeMoneyAmount(data.revenue[0])
        : null);
    const averageTicket = Array.isArray(data.average_ticket)
      ? this.safeMoneyAmount(data.average_ticket[0])
      : null;
    return {
      revenue_amount_kopecks: revenue?.amount_kopecks ?? null,
      financial_operations: this.optionalMetricNumber(
        financeRevenue.transaction_count,
      ),
      appointments_total: this.optionalMetricNumber(appointments.total),
      appointments_active: this.optionalMetricNumber(appointments.active),
      appointments_cancelled: this.optionalMetricNumber(appointments.cancelled),
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
      average_ticket_amount_kopecks: averageTicket?.amount_kopecks ?? null,
      booked_minutes: this.optionalMetricNumber(appointments.booked_minutes),
    };
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

  /**
   * Отмены во внешней CRM невидимы, и ноль здесь — не измерение.
   *
   * 🔴 Журнал YClients отдаёт только неудалённые записи, а статус «отменена»
   * выводится ровно из признака удаления. То есть отменённая запись до
   * аналитики не доходит вообще, и счётчик всегда равен нулю — независимо от
   * того, сколько отмен было на самом деле. Молчаливый ноль опаснее пропуска:
   * MAYA уверенно отвечала «отмен нет», и по этому «факту» принимались решения.
   */
  private cancellationUnavailableMetrics(value: unknown) {
    if (this.record(value).data_source !== 'crm') {
      return [];
    }
    return [
      {
        key: 'cancellations',
        reason:
          'appointments_cancelled, cancellation_rate_percent and per-staff cancellations are unavailable: the CRM journal returns only non-deleted records, so cancelled appointments never reach analytics and a zero here means "not measured", not "none"',
      },
    ];
  }

  /**
   * Деньги в разрезе мастера: что недоступно и почему.
   *
   * Подтверждённая выручка доступна только после полной ID-сверки финансовых
   * операций с записями. Если хотя бы одна оплата не связалась, адаптер
   * закрывает весь рейтинг: частичная таблица выглядела бы точной, но была бы
   * финансово неверной. Начисления зарплаты остаются отдельной метрикой.
   */
  private staffMoneyUnavailableMetrics(value: unknown) {
    const data = this.record(value);
    const rows = Array.isArray(data.staff_summary) ? data.staff_summary : [];
    const revenueAvailable = rows.some(
      (entry) =>
        this.record(this.record(entry).confirmed_revenue).status ===
        'available',
    );
    const metrics: Array<{ key: string; reason: string }> = [];
    if (!revenueAvailable) {
      const revenueReasons = [
        ...new Set(
          rows.flatMap((entry) => {
            const revenue = this.record(this.record(entry).confirmed_revenue);
            return revenue.status === 'available' ||
              typeof revenue.unavailable_reason !== 'string'
              ? []
              : [revenue.unavailable_reason];
          }),
        ),
      ];
      metrics.push({
        key: 'staff_revenue',
        reason:
          revenueReasons.length > 0
            ? `confirmed per-master revenue is unavailable: ${revenueReasons.join(', ')}`
            : data.data_source === 'crm'
              ? 'confirmed per-master revenue is unavailable because financial transactions could not be fully reconciled to appointment records and staff IDs'
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

  private personalCashRevenueUnavailableMetrics(value: unknown) {
    const rows = Array.isArray(this.record(value).staff_summary)
      ? (this.record(value).staff_summary as unknown[])
      : [];
    return rows.some(
      (entry) =>
        this.record(this.record(entry).confirmed_revenue).status ===
        'available',
    )
      ? []
      : [
          {
            key: 'personal_cash_revenue',
            reason:
              'confirmed service payments could not be fully reconciled through CRM transaction.record_id to record.staff_id',
          },
        ];
  }

  private employeeMetricSnapshot(value: unknown) {
    const data = this.record(value);
    const appointments = this.record(data.appointments);
    const bookedValue = Array.isArray(data.revenue)
      ? this.safeMoneyAmount(data.revenue[0])
      : null;
    const averageBookedValue = Array.isArray(data.average_ticket)
      ? this.safeMoneyAmount(data.average_ticket[0])
      : null;
    return {
      booked_value_amount_kopecks: bookedValue?.amount_kopecks ?? null,
      appointments_total: this.optionalMetricNumber(appointments.total),
      appointments_active: this.optionalMetricNumber(appointments.active),
      appointments_cancelled: this.optionalMetricNumber(appointments.cancelled),
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

  private businessMetricChanges(
    current: Record<string, number | null>,
    previous: Record<string, number | null>,
  ) {
    return Object.fromEntries(
      Object.keys(current).flatMap((key) => {
        const currentValue = current[key];
        const previousValue = previous[key];
        if (currentValue === null || previousValue === null) {
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

  private localDateTime(value: Date, timezone: string) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  private sameLocalDateInYear(value: string, year: number): string {
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  }

  private optionalMetricNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private percentageDelta(current: number, previous: number): number | null {
    if (previous === 0) {
      return null;
    }
    return Math.round(((current - previous) / Math.abs(previous)) * 1_000) / 10;
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
            return {
              date: item.date ?? null,
              appointments: item.appointments ?? 0,
              revenue: this.safeMoneyEntries(item.revenue),
            };
          })
        : [],
      data_quality: result.data_quality ?? null,
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
              appointments: item.appointments ?? 0,
              // Отмены по мастеру: раньше их не было ни в одном поле, и на
              // вопрос «у кого больше отмен» отвечать было нечем.
              cancelled: this.optionalMetricNumber(item.cancelled) ?? 0,
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
  private staffScope(
    names: Map<string, string>,
    allowedExternalIds: Set<string> | null,
  ): { names: Map<string, string>; allowedExternalIds: Set<string> | null } {
    return { names, allowedExternalIds };
  }

  /**
   * Разрез мастеров для бизнес-аналитики: все мастера, по именам.
   *
   * Роль проверяется здесь, а не только в каталоге инструментов: каталог
   * решает, кого пускать к инструменту, а имена коллег — отдельная граница.
   */
  private businessStaffScope(
    principal: AiToolPrincipal,
    ...periods: unknown[]
  ) {
    if (!NAMED_STAFF_BREAKDOWN_ROLES.has(principal.role)) {
      return this.staffScope(new Map(), new Set<string>());
    }
    return this.staffScope(this.staffDisplayNames(...periods), null);
  }

  /**
   * Разрез мастеров для личного среза сотрудника: только он сам.
   *
   * 🔴 Источник и так отдаёт записи одного человека, но полагаться на это
   * нельзя. Ключ — идентификатор сотрудника из ответа аналитики; если его нет,
   * разрез закрывается целиком, а не открывается на всех.
   */
  private employeeStaffScope(...periods: unknown[]) {
    const allowed = new Set<string>();
    for (const period of periods) {
      const externalId = this.record(period).employee_external_id;
      if (typeof externalId === 'string' && externalId !== '') {
        allowed.add(externalId);
      }
    }
    return this.staffScope(this.staffDisplayNames(...periods), allowed);
  }

  /**
   * Внешний идентификатор мастера → имя для выдачи.
   *
   * 🔴 Тёзок различаем устойчиво. Порядок нумерации — по ОБЪЕДИНЕНИЮ внешних
   * идентификаторов всех переданных периодов, отсортированному по кодовым
   * точкам: иначе один и тот же Илья был бы «Илья» в текущем периоде и
   * «Илья (2)» в прошлом, и сравнение «у кого просело» сопоставляло бы разных
   * людей. localeCompare здесь нельзя — его порядок зависит от локали и
   * версии ICU. Молча склеивать двух людей в одного нельзя тем более: у них
   * разные записи и разная выручка.
   *
   * Мастер без имени получает безличное «Мастер N» по тому же порядку —
   * внешний идентификатор наружу не отдаём никогда.
   */
  private staffDisplayNames(...periods: unknown[]): Map<string, string> {
    const names = new Map<string, string | null>();
    for (const period of periods) {
      for (const row of this.staffRows(period)) {
        if (!row.externalId) continue;
        if (!names.get(row.externalId)) {
          names.set(row.externalId, row.name);
        }
      }
    }
    const display = new Map<string, string>();
    const taken = new Set<string>();
    [...names.keys()]
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .forEach((externalId, index) => {
        const base = names.get(externalId) ?? `Мастер ${index + 1}`;
        let candidate = base;
        let suffix = 1;
        while (taken.has(candidate)) {
          suffix += 1;
          candidate = `${base} (${suffix})`;
        }
        taken.add(candidate);
        display.set(externalId, candidate);
      });
    return display;
  }

  /**
   * Убирает внешний идентификатор мастера, оставляя имя.
   *
   * 🔴 Идентификатор CRM наружу не уходит ни при каких ролях: он ключ к чужой
   * системе, а не показатель. Служебный `employee_external_id` снимается
   * здесь же — он живёт только внутри обработчика.
   */
  private publishAnalytics(
    value: unknown,
    scope?: {
      names: Map<string, string>;
      allowedExternalIds: Set<string> | null;
    },
  ): Record<string, unknown> {
    const data = this.record(value);
    const published = { ...data };
    delete published.employee_external_id;
    const staffScope =
      scope ?? this.staffScope(this.staffDisplayNames(data), null);
    return {
      ...published,
      staff_summary: this.staffRows(data)
        .filter(
          (row) =>
            row.externalId !== null &&
            (staffScope.allowedExternalIds === null ||
              staffScope.allowedExternalIds.has(row.externalId)),
        )
        .map((row) => ({
          name: staffScope.names.get(row.externalId as string) ?? null,
          appointments: row.entry.appointments ?? 0,
          cancelled: this.optionalMetricNumber(row.entry.cancelled) ?? 0,
          cancellation_rate_percent:
            this.optionalMetricNumber(row.entry.cancellation_rate_percent) ?? 0,
          unique_clients:
            this.optionalMetricNumber(row.entry.unique_clients) ?? 0,
          repeat_clients_in_period:
            this.optionalMetricNumber(row.entry.repeat_clients_in_period) ?? 0,
          revenue: this.safeMoneyEntries(row.entry.revenue),
          // 🔴 Два разных поля про деньги мастера, и перепутать их нельзя.
          // `confirmed_revenue` — сколько он принёс подтверждёнными оплатами
          // услуг: только сверка transaction.record_id -> record.staff_id.
          // `salary` — сколько ЕМУ начислено по расчёту зарплаты CRM. Это
          // расход салона, а не его выручка, и подменять одно другим — врать
          // и о человеке, и о салоне.
          confirmed_revenue: this.publishedStaffConfirmedRevenue(
            row.entry.confirmed_revenue,
            data.data_source,
          ),
          salary: this.publishedStaffSalary(row.entry.salary),
          booked_minutes: row.entry.booked_minutes ?? 0,
          services: this.staffServiceRows(row.entry),
        })),
    };
  }

  /** Publish only the already verified adapter reconciliation. */
  private publishedStaffConfirmedRevenue(value: unknown, dataSource: unknown) {
    const revenue = this.record(value);
    const amount = this.safeMoneyAmount(revenue.amount);
    const transactionCount = this.optionalMetricNumber(
      revenue.transaction_count,
    );
    if (
      revenue.status === 'available' &&
      revenue.basis === 'crm_financial_transaction_record_join' &&
      amount &&
      transactionCount !== null
    ) {
      return {
        status: 'available',
        basis: revenue.basis,
        transaction_count: transactionCount,
        amount,
        unavailable_reason: null,
      };
    }
    return {
      status: 'unavailable',
      basis: null,
      transaction_count: null,
      amount: null,
      unavailable_reason:
        typeof revenue.unavailable_reason === 'string' &&
        revenue.unavailable_reason !== ''
          ? revenue.unavailable_reason
          : dataSource === 'crm'
            ? STAFF_CONFIRMED_REVENUE_UNAVAILABLE.notRequested
            : STAFF_CONFIRMED_REVENUE_UNAVAILABLE.maya,
    };
  }

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
      },
      staff_revenue: {
        status: 'unavailable',
        verified: false,
        transaction_count: null,
        attributed_total: null,
        unattributed_total: null,
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

  private async cancelOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.cancelForClient(
      principal.tenantId,
      principal.userId,
      this.requiredString(args.appointment_id),
    );
    return this.safeAppointmentOutput(result);
  }

  private async createOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.createForClient(
      principal.tenantId,
      principal.userId,
      this.bookingDto(args),
    );
    return this.safeAppointmentOutput(result);
  }

  private async rescheduleOwnAppointment(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
  ) {
    const result = await this.appointmentsService.rescheduleForClient(
      principal.tenantId,
      principal.userId,
      this.requiredString(args.appointment_id),
      {
        start: this.requiredString(args.start),
        ...(typeof args.staff_id === 'string'
          ? { staffId: args.staff_id }
          : {}),
        ...(Array.isArray(args.service_ids)
          ? { serviceIds: this.stringArray(args.service_ids) }
          : {}),
        ...(typeof args.branch_id === 'string'
          ? { branchId: args.branch_id }
          : {}),
      },
    );
    return this.safeAppointmentOutput(result);
  }

  private async adjustInternalLoyalty(
    principal: AiToolPrincipal,
    args: ValidatedAiToolArguments,
    idempotencyKey: string,
  ) {
    const result = await this.loyaltyService.adjustInternalBalance({
      tenantId: principal.tenantId,
      targetUserId: this.requiredString(args.target_user_id),
      actorUserId: principal.userId,
      dto: {
        delta: this.requiredNumber(args.delta),
        reason: this.requiredString(args.reason),
        idempotencyKey,
      },
    });
    return this.safeLoyalty(result);
  }

  private async reportingQuery(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ) {
    return (await this.reportingWindow(tenantId, args)).query;
  }

  /**
   * Окно отчёта вместе с тем, что о нём нужно сказать вслух.
   *
   * `truncatedToToday` относится только к названному месяцу: спросили про
   * текущий месяц по имени — считаем по сегодня, и это обязано прозвучать в
   * ответе, иначе «июль» и «июль по седьмое» выглядят одинаково.
   * `named_day` / `named_range` — ровно названные локальные дни, без подмены месяцем.
   */
  private async reportingWindow(
    tenantId: string,
    args: ValidatedAiToolArguments,
  ): Promise<{
    query: AnalyticsRangeQueryDto;
    truncatedToToday: boolean;
    namedMonth: string | null;
    namedDay: string | null;
    fromDay: string | null;
    toDay: string | null;
  }> {
    const period = this.requiredString(args.period);
    const branchId =
      typeof args.branch_id === 'string' ? args.branch_id : undefined;
    if (period === 'custom') {
      return {
        query: {
          from: this.requiredString(args.from),
          to: this.requiredString(args.to),
          ...(branchId ? { branchId } : {}),
        },
        truncatedToToday: false,
        namedMonth: null,
        namedDay: null,
        fromDay: null,
        toDay: null,
      };
    }

    const timezone = await this.reportingTimezone(tenantId, branchId);
    const now = new Date();
    const today = this.localDate(now, timezone);
    const todayStart = localDateMinuteToUtc(today, 0, timezone);
    let from: Date;
    let to = now;
    let truncatedToToday = false;
    let namedMonth: string | null = null;
    let namedDay: string | null = null;
    let fromDay: string | null = null;
    let toDay: string | null = null;

    switch (period) {
      case 'today':
        from = todayStart;
        break;
      case 'yesterday': {
        const yesterday = this.shiftLocalDate(today, -1);
        from = localDateMinuteToUtc(yesterday, 0, timezone);
        to = new Date(todayStart.getTime() - 1);
        break;
      }
      case 'week_to_date': {
        const weekday = this.localWeekday(today);
        const monday = this.shiftLocalDate(today, -((weekday + 6) % 7));
        from = localDateMinuteToUtc(monday, 0, timezone);
        break;
      }
      case 'month_to_date':
        from = localDateMinuteToUtc(`${today.slice(0, 7)}-01`, 0, timezone);
        break;
      case 'year_to_date':
        from = localDateMinuteToUtc(`${today.slice(0, 4)}-01-01`, 0, timezone);
        break;
      case 'last_7_days':
        from = localDateMinuteToUtc(
          this.shiftLocalDate(today, -6),
          0,
          timezone,
        );
        break;
      case 'last_30_days':
        from = localDateMinuteToUtc(
          this.shiftLocalDate(today, -29),
          0,
          timezone,
        );
        break;
      case 'last_week': {
        // Прошлая календарная неделя пн–вс в TZ салона — не «последние 7 дней».
        const weekday = this.localWeekday(today);
        const thisMonday = this.shiftLocalDate(today, -((weekday + 6) % 7));
        const lastMonday = this.shiftLocalDate(thisMonday, -7);
        const thisMondayStart = localDateMinuteToUtc(thisMonday, 0, timezone);
        from = localDateMinuteToUtc(lastMonday, 0, timezone);
        to = new Date(thisMondayStart.getTime() - 1);
        break;
      }
      case 'last_month': {
        const currentMonth = `${today.slice(0, 7)}-01`;
        const previousMonth = this.shiftLocalMonth(currentMonth, -1);
        from = localDateMinuteToUtc(previousMonth, 0, timezone);
        to = new Date(
          localDateMinuteToUtc(currentMonth, 0, timezone).getTime() - 1,
        );
        break;
      }
      case 'named_day': {
        // Один названный день — ровно этот локальный день. «Отчёт за 7 августа»
        // нельзя подменять суммой за август: это и была жалоба владельца.
        namedDay = this.requiredString(args.day);
        from = localDateMinuteToUtc(namedDay, 0, timezone);
        const nextDay = this.shiftLocalDate(namedDay, 1);
        to = new Date(localDateMinuteToUtc(nextDay, 0, timezone).getTime() - 1);
        break;
      }
      case 'named_range': {
        fromDay = this.requiredString(args.from_day);
        toDay = this.requiredString(args.to_day);
        from = localDateMinuteToUtc(fromDay, 0, timezone);
        const dayAfter = this.shiftLocalDate(toDay, 1);
        to = new Date(
          localDateMinuteToUtc(dayAfter, 0, timezone).getTime() - 1,
        );
        if (to.getTime() > now.getTime()) {
          to = now;
          truncatedToToday = true;
        }
        break;
      }
      case 'named_month': {
        // Названный месяц — это КАЛЕНДАРНЫЙ месяц целиком, от первого числа до
        // последней миллисекунды последнего. Отвечать на «прибыль в июле»
        // цифрами текущего месяца по сегодня — самая незаметная ложь из
        // возможных: числа настоящие, период чужой.
        namedMonth = this.requiredString(args.month);
        const firstDay = `${namedMonth}-01`;
        from = localDateMinuteToUtc(firstDay, 0, timezone);
        const monthEnd = new Date(
          localDateMinuteToUtc(
            this.shiftLocalMonth(firstDay, 1),
            0,
            timezone,
          ).getTime() - 1,
        );
        if (monthEnd.getTime() > now.getTime()) {
          // Месяц ещё идёт: считаем по сегодня и обязаны это сказать.
          to = now;
          truncatedToToday = true;
        } else {
          to = monthEnd;
        }
        break;
      }
      default:
        throw new Error('Validated AI reporting period is invalid');
    }

    return {
      query: {
        from: from.toISOString(),
        to: to.toISOString(),
        ...(branchId ? { branchId } : {}),
      },
      truncatedToToday,
      namedMonth,
      namedDay,
      fromDay,
      toDay,
    };
  }

  private periodArgsFromValidated(
    args: ValidatedAiToolArguments,
  ): ReportingPeriodToolArgs {
    return {
      period: this.requiredString(args.period),
      ...(typeof args.day === 'string' ? { day: args.day } : {}),
      ...(typeof args.month === 'string' ? { month: args.month } : {}),
      ...(typeof args.from_day === 'string' ? { from_day: args.from_day } : {}),
      ...(typeof args.to_day === 'string' ? { to_day: args.to_day } : {}),
    };
  }

  private resolvedPeriodPayload(
    args: ValidatedAiToolArguments,
    window: {
      query: AnalyticsRangeQueryDto;
      truncatedToToday: boolean;
    },
  ) {
    return ReportingPeriodResolver.resolvedPeriodMeta(
      this.periodArgsFromValidated(args),
      { from: window.query.from, to: window.query.to },
      { truncatedToToday: window.truncatedToToday },
    );
  }

  private async reportingTimezone(
    tenantId: string,
    branchId?: string,
  ): Promise<string> {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { timezone: true },
      });
      if (!branch) {
        throw new Error('AI reporting branch is unavailable');
      }
      if (branch.timezone) {
        return branch.timezone;
      }
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    if (!tenant) {
      throw new Error('AI reporting tenant is unavailable');
    }
    return tenant.defaultTimezone;
  }

  private localDate(value: Date, timezone: string): string {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private shiftLocalDate(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private shiftLocalMonth(value: string, months: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  private localWeekday(value: string): number {
    return new Date(`${value}T00:00:00.000Z`).getUTCDay();
  }

  private safeAppointment(value: unknown) {
    const item = this.record(value);
    const branch = this.recordOrNull(item.branch);
    const staff = this.recordOrNull(item.staff);
    const services = Array.isArray(item.services)
      ? item.services.map((service) => {
          const safe = this.record(service);
          return {
            id: safe.id ?? null,
            name: safe.name ?? null,
            price: safe.price ?? null,
            duration_minutes: safe.duration_minutes ?? null,
            currency: safe.currency ?? null,
            category: safe.category ?? null,
          };
        })
      : [];

    return {
      id: item.id ?? null,
      status: item.status ?? null,
      start_at: item.start_at ?? null,
      end_at: item.end_at ?? null,
      is_upcoming: item.is_upcoming ?? null,
      timeline: item.timeline ?? null,
      branch: branch
        ? { id: branch.id ?? null, name: branch.name ?? null }
        : null,
      staff: staff
        ? {
            title: staff.title ?? null,
            specialization: staff.specialization ?? null,
          }
        : null,
      services,
      total_price: item.total_price ?? null,
      duration_minutes: item.duration_minutes ?? null,
      currency: item.currency ?? null,
    };
  }

  private safeAppointmentOutput(value: unknown) {
    const result = this.record(value);
    const appointment = this.recordOrNull(result.appointment);
    return this.safeAppointment(appointment ?? result);
  }

  private bookingDto(args: ValidatedAiToolArguments) {
    return {
      staffId: this.requiredString(args.staff_id),
      serviceIds: this.stringArray(args.service_ids),
      start: this.requiredString(args.start),
      ...(typeof args.branch_id === 'string'
        ? { branchId: args.branch_id }
        : {}),
    };
  }

  private safeLoyalty(value: unknown) {
    const loyalty = this.record(value);
    const spend = this.record(loyalty.spend_options);
    const items = Array.isArray(spend.items)
      ? spend.items.slice(0, 6).map((item) => {
          const service = this.record(item);
          return {
            id: service.id ?? null,
            name: service.name ?? null,
            price: service.price ?? null,
            points_required: service.points_required ?? null,
            currency: service.currency ?? loyalty.currency ?? 'RUB',
            category: service.category ?? null,
          };
        })
      : [];
    return {
      balance: loyalty.balance ?? null,
      currency: loyalty.currency ?? 'RUB',
      source: loyalty.source ?? null,
      authoritative: loyalty.authoritative ?? null,
      sync_status: loyalty.sync_status ?? null,
      stale: loyalty.stale ?? null,
      synced_at: loyalty.synced_at ?? null,
      spend_options: {
        status: spend.status ?? null,
        basis: spend.basis ?? null,
        verification_required: spend.verification_required ?? true,
        items,
        best_service: spend.best_service ?? null,
        next_service: spend.next_service ?? null,
      },
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

  private majorUnits(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? value / 100
      : null;
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

  private requiredString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Validated AI tool string is missing');
    }
    return value;
  }

  private requiredNumber(value: unknown): number {
    if (typeof value !== 'number') {
      throw new Error('Validated AI tool number is missing');
    }
    return value;
  }

  private scheduleSlots(value: unknown): StaffScheduleSlot[] {
    if (!Array.isArray(value)) {
      throw new Error('Validated AI tool schedule slots are missing');
    }
    return value.map((item) => {
      const slot = this.record(item);
      return {
        from: this.requiredString(slot.from),
        to: this.requiredString(slot.to),
      };
    });
  }

  private stringArray(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new Error('Validated AI tool string array is missing');
    }
    return value as string[];
  }
}
