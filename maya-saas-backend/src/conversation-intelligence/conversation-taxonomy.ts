import { UserRole } from '../common/domain.enums';
import type {
  ConversationAction,
  ConversationCapabilityReadiness,
  ConversationDataClass,
  ConversationDomain,
  ConversationIntentDefinition,
  ConversationRisk,
} from './conversation-intelligence.types';

const CLIENT_ROLES = [UserRole.CLIENT, UserRole.CUSTOMER] as const;
const EMPLOYEE_ROLES = [
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
] as const;
const ADMIN_ROLES = [
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
] as const;
const OWNER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
] as const;
const EXPENSE_WRITE_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
] as const;
const FINANCE_ROLES = [
  ...OWNER_ROLES,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
] as const;
const TEAM_ROLES = [...OWNER_ROLES, ...ADMIN_ROLES, ...EMPLOYEE_ROLES] as const;
const BUSINESS_ROLES = [
  ...OWNER_ROLES,
  ...ADMIN_ROLES,
  UserRole.ACCOUNTANT,
] as const;
const SCHEDULE_MANAGER_ROLES = [...OWNER_ROLES, ...ADMIN_ROLES] as const;
const CAMPAIGN_ROLES = [...OWNER_ROLES, UserRole.ADMINISTRATOR] as const;
const ALL_INTERACTIVE_ROLES = [
  ...CLIENT_ROLES,
  ...TEAM_ROLES,
  UserRole.ACCOUNTANT,
] as const;

type IntentOptions = {
  subIntent?: string;
  action?: ConversationAction;
  dataClass?: ConversationDataClass;
  risk?: ConversationRisk;
  permission?: string | null;
  roles?: readonly UserRole[];
  tools?: readonly string[];
  readiness?: ConversationCapabilityReadiness;
  readinessNote?: string;
  requiredSlots?: readonly string[];
  optionalSlots?: readonly string[];
  clarificationRule?: string;
  responseRule?: string;
  synonyms?: readonly string[];
  examples?: readonly string[];
};

function intent(
  id: string,
  domain: ConversationDomain,
  description: string,
  options: IntentOptions = {},
): ConversationIntentDefinition {
  const action = options.action ?? 'answer';
  const dataClass = options.dataClass ?? (action === 'answer' ? 'A' : 'C');
  const toolCandidates = options.tools ?? [];
  const readiness =
    options.readiness ??
    (dataClass === 'A' || toolCandidates.length > 0 ? 'ready' : 'planned');
  return {
    id,
    domain,
    subIntent: options.subIntent ?? id,
    description,
    action,
    dataClass,
    risk:
      options.risk ??
      (action === 'execute' || action === 'write' ? 'high' : 'low'),
    permission: options.permission ?? null,
    allowedRoles: options.roles ?? ALL_INTERACTIVE_ROLES,
    readiness,
    readinessNote:
      options.readinessNote ??
      (readiness === 'planned'
        ? 'The intent is understood, but no production data or action provider is registered yet.'
        : null),
    toolCandidates,
    requiredSlots: options.requiredSlots ?? [],
    optionalSlots: options.optionalSlots ?? [],
    clarificationRule:
      options.clarificationRule ??
      'Clarify only a missing slot that materially changes the answer or action.',
    responseRule:
      options.responseRule ??
      'Answer the requested intent directly, then offer at most one useful next step.',
    synonyms: options.synonyms ?? [],
    examples: options.examples ?? [],
  };
}

/**
 * Canonical semantic catalogue. It describes product meaning, not phrases.
 * Tool availability is evaluated per tenant and role at runtime.
 */
export const MAYA_CONVERSATION_TAXONOMY: readonly ConversationIntentDefinition[] =
  [
    intent(
      'booking.find_availability',
      'booking',
      'Find suitable booking slots.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'booking.read',
        tools: ['booking.availability.read'],
        requiredSlots: ['date_or_period'],
        optionalSlots: ['employee', 'services', 'branch', 'time_of_day'],
        synonyms: ['окно', 'свободное время', 'слот', 'когда можно попасть'],
        examples: ['Есть окно вечером?', 'К Артёму завтра после шести'],
      },
    ),
    intent('booking.list_own', 'booking', 'List the actor own appointments.', {
      action: 'read',
      dataClass: 'C',
      permission: 'appointments.own.read',
      tools: ['appointments.own.list'],
      optionalSlots: ['period', 'status'],
      synonyms: ['мои записи', 'мои визиты', 'когда я записан'],
      examples: ['Покажи мои записи', 'Когда я записан в следующий раз?'],
    }),
    intent(
      'booking.create_own',
      'booking',
      'Create an appointment for the actor.',
      {
        action: 'execute',
        dataClass: 'E',
        risk: 'high',
        roles: CLIENT_ROLES,
        permission: 'appointments.own.create',
        tools: ['appointments.own.create'],
        requiredSlots: ['services', 'date', 'time'],
        optionalSlots: ['employee', 'branch'],
        clarificationRule:
          'Resolve service, date, time and ambiguous employee before previewing the appointment.',
        synonyms: ['запиши', 'поставь меня', 'забронируй', 'хочу попасть'],
        examples: ['Запиши меня завтра', 'Давай к Саше на 19:00'],
      },
    ),
    intent(
      'booking.reschedule_own',
      'booking',
      'Reschedule the actor appointment.',
      {
        action: 'execute',
        dataClass: 'E',
        risk: 'high',
        roles: CLIENT_ROLES,
        permission: 'appointments.own.reschedule',
        tools: ['appointments.own.reschedule'],
        requiredSlots: ['appointment', 'new_date', 'new_time'],
        optionalSlots: ['new_employee'],
        synonyms: ['перенеси', 'передвинь запись', 'другое время'],
        examples: ['Перенеси меня на пятницу', 'Нет, лучше завтра'],
      },
    ),
    intent('booking.cancel_own', 'booking', 'Cancel the actor appointment.', {
      action: 'execute',
      dataClass: 'E',
      risk: 'high',
      roles: CLIENT_ROLES,
      permission: 'appointments.own.cancel',
      tools: ['appointments.own.cancel'],
      requiredSlots: ['appointment'],
      synonyms: ['отмени запись', 'не смогу прийти', 'сними бронь'],
      examples: ['Отмени мою запись на завтра'],
    }),
    intent(
      'booking.get_employee',
      'booking',
      'Tell who performs an appointment.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'appointments.own.read',
        tools: ['appointments.own.list'],
        optionalSlots: ['appointment', 'date'],
        synonyms: ['к кому я записан', 'кто меня стрижёт'],
        examples: ['Кто меня сегодня стрижёт?'],
      },
    ),
    intent(
      'booking.repeat_last',
      'booking',
      'Repeat the last usual service bundle.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'appointments.own.read',
        tools: ['appointments.own.list'],
        optionalSlots: ['date', 'time'],
        synonyms: [
          'мне как обычно',
          'как в прошлый раз',
          'повтори прошлую запись',
        ],
        examples: ['Мне как всегда, только в пятницу'],
      },
    ),
    intent(
      'booking.group_or_simultaneous',
      'booking',
      'Find slots for multiple people.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'booking.read',
        tools: ['booking.group-availability.read'],
        requiredSlots: ['party_size', 'services', 'date_or_period'],
        optionalSlots: ['simultaneous', 'branch'],
        responseRule:
          'Return verified distinct slots for every participant. Never claim that several appointments were booked atomically; each write requires its own confirmation.',
        synonyms: ['нас двое', 'одновременно', 'рядом по времени'],
        examples: ['Можно записать нас двоих одновременно?'],
      },
    ),

    intent(
      'schedule.get_own',
      'schedule',
      'Read the employee own work schedule.',
      {
        action: 'read',
        dataClass: 'C',
        roles: TEAM_ROLES,
        permission: 'schedule.own.read',
        tools: ['staff.schedule.own.read'],
        optionalSlots: ['period'],
        synonyms: ['мой график', 'когда я работаю', 'моя смена'],
        examples: ['Я завтра работаю?'],
      },
    ),
    intent('schedule.get_team', 'schedule', 'Read the team working schedule.', {
      action: 'read',
      dataClass: 'C',
      roles: SCHEDULE_MANAGER_ROLES,
      permission: 'schedule.team.read',
      tools: ['staff.schedule.read'],
      requiredSlots: ['date_or_period'],
      optionalSlots: ['branch', 'employee'],
      synonyms: ['кто сегодня работает', 'график команды', 'кто в смене'],
      examples: ['Кто из ребят работает завтра?'],
    }),
    intent(
      'schedule.update_employee',
      'schedule',
      'Update an employee schedule.',
      {
        action: 'execute',
        dataClass: 'E',
        risk: 'high',
        roles: [...OWNER_ROLES, ...ADMIN_ROLES],
        permission: 'schedule.team.write',
        tools: ['staff.schedule.update'],
        requiredSlots: ['employee', 'date_or_period', 'working_hours'],
        synonyms: ['поставь смену', 'измени график', 'сделай выходной'],
        examples: ['Поставь Илье выходной в пятницу'],
      },
    ),
    intent(
      'schedule.find_free_employee',
      'schedule',
      'Find employees with capacity.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: TEAM_ROLES,
        permission: 'schedule.team.read',
        tools: ['booking.availability.read'],
        requiredSlots: ['date_or_period'],
        optionalSlots: ['time_of_day', 'services', 'branch'],
        synonyms: ['кто свободен', 'у кого окно', 'кого можно загрузить'],
        examples: ['Кто свободен после пяти?'],
      },
    ),

    intent('clients.count_total', 'clients', 'Count all CRM clients.', {
      action: 'read',
      dataClass: 'C',
      roles: BUSINESS_ROLES,
      permission: 'clients.registry.read',
      tools: ['clients.retention.scan', 'customers.count'],
      synonyms: ['вся база', 'сколько всего клиентов', 'размер базы'],
      examples: ['Сколько людей во всей базе за всё время?'],
    }),
    intent(
      'clients.count_period',
      'clients',
      'Count unique clients in a period.',
      {
        action: 'read',
        dataClass: 'C',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        requiredSlots: ['period'],
        synonyms: ['клиентов за месяц', 'уникальные гости', 'сколько посетило'],
        examples: ['Сколько уникальных клиентов было в июле?'],
      },
    ),
    intent('clients.count_new', 'clients', 'Count new clients in a period.', {
      action: 'read',
      dataClass: 'C',
      roles: BUSINESS_ROLES,
      permission: 'analytics.business.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      synonyms: ['новые клиенты', 'новички', 'впервые пришли'],
      examples: ['Сколько новых гостей пришло в этом месяце?'],
    }),
    intent(
      'clients.retention_summary',
      'retention',
      'Summarize retention cohorts.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'clients.registry.read',
        tools: ['clients.retention.scan'],
        optionalSlots: ['absence_period', 'loyalty_threshold', 'branch'],
        synonyms: ['возвращаемость', 'удержание', 'лояльные клиенты'],
        examples: ['Что у нас с возвращаемостью?'],
      },
    ),
    intent(
      'clients.inactive_cohort',
      'churn',
      'Find clients absent for a period.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'clients.registry.read',
        tools: ['clients.retention.scan'],
        requiredSlots: ['absence_period'],
        optionalSlots: ['previous_frequency', 'employee', 'service', 'branch'],
        synonyms: ['давно не приходили', 'пропали', 'уснувшие', 'не были'],
        examples: ['Кто не был больше трёх месяцев?'],
      },
    ),
    intent(
      'clients.at_risk',
      'churn',
      'Detect inactive client cohorts at risk of churn.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'clients.registry.read',
        tools: ['clients.retention.scan'],
        optionalSlots: ['branch', 'employee', 'service'],
        responseRule:
          'Use verified aggregate inactivity cohorts. Do not claim individual cadence prediction or expose an outreach list from this read-only intent.',
        synonyms: ['уходящие клиенты', 'цикл просрочен', 'кого теряем'],
        examples: ['Кто ходил регулярно и сейчас пропал?'],
      },
    ),
    intent('clients.high_value', 'clients', 'Find the most valuable clients.', {
      action: 'analyze',
      dataClass: 'D',
      roles: BUSINESS_ROLES,
      permission: 'clients.registry.read',
      tools: ['clients.high-value.read'],
      optionalSlots: ['period', 'metric', 'branch'],
      synonyms: ['самые ценные', 'кто больше потратил', 'лучшие клиенты'],
      examples: ['Кто наши самые лояльные гости?'],
    }),
    intent('clients.dossier', 'clients', 'Read one client CRM dossier.', {
      action: 'read',
      dataClass: 'C',
      roles: BUSINESS_ROLES,
      permission: 'clients.dossier.read',
      tools: ['clients.dossier.read'],
      requiredSlots: ['client_reference'],
      optionalSlots: ['requested_fields'],
      clarificationRule:
        'If several clients match, ask which one without exposing unrelated records.',
      synonyms: ['досье клиента', 'что он обычно берёт', 'история гостя'],
      examples: ['Что обычно выбирает этот клиент?'],
    }),
    intent(
      'clients.no_show_risk',
      'clients',
      'Analyze verified no-show and cancellation history.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'clients.registry.read',
        tools: ['clients.no-show-risk.read'],
        optionalSlots: ['period', 'employee', 'branch'],
        responseRule:
          'Report observed no-shows and cancellations only. If asked specifically about late cancellations, explain that the CRM source does not expose cancellation timestamps.',
        synonyms: ['неявки', 'отмены', 'кто часто не приходит'],
        examples: ['У кого из клиентов много неявок?'],
      },
    ),

    intent('employees.list_public', 'employees', 'List bookable specialists.', {
      action: 'read',
      dataClass: 'C',
      permission: 'catalog.staff.read',
      tools: ['catalog.staff.read'],
      optionalSlots: ['service', 'branch'],
      synonyms: ['мастера', 'специалисты', 'к кому записаться'],
      examples: ['Какие у вас барберы?'],
    }),
    intent(
      'employees.performance_team',
      'employees',
      'Analyze team performance.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        optionalSlots: ['period', 'metric', 'branch'],
        synonyms: [
          'результаты команды',
          'сравни мастеров',
          'эффективность ребят',
        ],
        examples: ['Сравни мастеров за этот месяц'],
      },
    ),
    intent(
      'employees.performance_own',
      'employees',
      'Analyze own employee performance.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: EMPLOYEE_ROLES,
        permission: 'analytics.employee.read',
        tools: ['analytics.employee.query'],
        optionalSlots: ['period', 'metric'],
        synonyms: ['мои показатели', 'сколько я сделал', 'моя загрузка'],
        examples: ['Что у меня по работе за неделю?'],
      },
    ),
    intent(
      'employees.revenue',
      'employees',
      'Read verified employee revenue if supplied.',
      {
        action: 'read',
        dataClass: 'C',
        roles: FINANCE_ROLES,
        permission: 'analytics.business.finance.read',
        tools: ['analytics.business.query'],
        readiness: 'ready',
        readinessNote:
          'Returns exact YClients cash attributed to an employee when financial operations are linked to that employee, including an explicit attribution coverage status; never substitutes payroll or booked value.',
        requiredSlots: ['period'],
        optionalSlots: ['employee', 'branch'],
        responseRule:
          'Never present salary or booked service value as confirmed employee revenue.',
        synonyms: [
          'сколько принёс мастер',
          'выручка сотрудника',
          'кто заработал',
        ],
        examples: ['Сколько принёс Максим за месяц?'],
      },
    ),
    intent('employees.salary', 'employees', 'Read accrued CRM payroll.', {
      action: 'read',
      dataClass: 'C',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query', 'analytics.business.profit'],
      requiredSlots: ['period'],
      optionalSlots: ['employee', 'branch'],
      responseRule:
        'Call it accrued salary, never revenue generated by the employee.',
      synonyms: ['зарплата', 'зп', 'начислено мастеру'],
      examples: ['Сколько начислено Антону за месяц?'],
    }),
    intent('employees.workload', 'employees', 'Compare employee workload.', {
      action: 'analyze',
      dataClass: 'D',
      roles: BUSINESS_ROLES,
      permission: 'analytics.business.read',
      tools: ['analytics.business.query'],
      optionalSlots: ['period', 'branch'],
      synonyms: [
        'самый загруженный',
        'у кого больше записей',
        'загрузка мастеров',
      ],
      examples: ['Кто сейчас самый загруженный?'],
    }),
    intent(
      'employees.retention',
      'employees',
      'Compare employee client retention.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        optionalSlots: ['period', 'branch'],
        responseRule:
          'Compare cohort retention only for the selected reporting period and name the period explicitly; never present it as lifetime retention.',
        synonyms: [
          'возвращаемость мастеров',
          'к кому возвращаются',
          'кто теряет гостей',
        ],
        examples: ['У кого хуже возвращаемость?'],
      },
    ),

    intent('services.list', 'services', 'Read the service catalogue.', {
      action: 'read',
      dataClass: 'C',
      permission: 'catalog.services.read',
      tools: ['catalog.services.read'],
      optionalSlots: ['category', 'branch', 'employee'],
      synonyms: ['услуги', 'прайс', 'что можно сделать'],
      examples: ['Какие есть услуги?'],
    }),
    intent('services.price', 'services', 'Read service price.', {
      action: 'read',
      dataClass: 'C',
      permission: 'catalog.services.read',
      tools: ['catalog.services.read'],
      requiredSlots: ['service'],
      optionalSlots: ['employee', 'branch'],
      synonyms: ['сколько стоит', 'цена услуги', 'почём'],
      examples: ['Сколько стоит мужская стрижка?'],
    }),
    intent('services.duration', 'services', 'Read service duration.', {
      action: 'read',
      dataClass: 'C',
      permission: 'catalog.services.read',
      tools: ['catalog.services.read'],
      requiredSlots: ['service'],
      optionalSlots: ['employee'],
      synonyms: ['сколько длится', 'сколько времени', 'продолжительность'],
      examples: ['Сколько идёт стрижка с бородой?'],
    }),
    intent('services.popularity', 'services', 'Analyze service demand.', {
      action: 'analyze',
      dataClass: 'D',
      roles: BUSINESS_ROLES,
      permission: 'analytics.business.read',
      tools: ['analytics.business.query'],
      optionalSlots: ['period', 'branch', 'employee'],
      synonyms: ['популярная услуга', 'что берут чаще', 'спрос на услуги'],
      examples: ['Какие услуги покупают чаще всего?'],
    }),
    intent('services.revenue', 'services', 'Analyze service sales value.', {
      action: 'analyze',
      dataClass: 'D',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      optionalSlots: ['period', 'service', 'branch'],
      responseRule:
        'Use confirmed_revenue only. State attribution coverage when partial; never substitute booked_value for confirmed cash.',
      synonyms: ['выручка по услугам', 'что приносит деньги', 'продажи услуги'],
      examples: ['Сколько заработали на стрижках?'],
    }),
    intent(
      'services.count',
      'services',
      'Count completed or booked services.',
      {
        action: 'read',
        dataClass: 'C',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        requiredSlots: ['period'],
        optionalSlots: ['service', 'employee', 'branch'],
        synonyms: ['сколько сделали', 'количество услуг', 'сколько стрижек'],
        examples: ['Сколько стрижек сделали за неделю?'],
      },
    ),

    intent('finance.revenue', 'finance', 'Read verified company revenue.', {
      action: 'read',
      dataClass: 'C',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      optionalSlots: ['branch', 'payment_method'],
      synonyms: [
        'выручка',
        'оборот',
        'касса',
        'сколько сделали',
        'наторговали',
      ],
      examples: ['Что сегодня по деньгам?'],
    }),
    intent('finance.profit', 'finance', 'Read net or gross profit.', {
      action: 'analyze',
      dataClass: 'D',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.profit', 'expenses.period.complete'],
      requiredSlots: ['period'],
      optionalSlots: ['profit_type', 'branch'],
      responseRule:
        'Return the server-calculated profit from confirmed cash, CRM payroll and recorded owner expenses. When the server marks unrecorded additional expenses as assumed zero, state that briefly after the result and invite the owner to add them later; never invent amounts or block an available calculation.',
      synonyms: ['прибыль', 'чистыми', 'что осталось', 'в плюсе'],
      examples: ['Какая чистая прибыль за месяц?'],
    }),
    intent('finance.expenses', 'finance', 'Read expense total and structure.', {
      action: 'read',
      dataClass: 'C',
      roles: FINANCE_ROLES,
      permission: 'expenses.read',
      tools: ['analytics.business.profit', 'expenses.read'],
      requiredSlots: ['period'],
      optionalSlots: ['category', 'branch'],
      synonyms: ['расходы', 'затраты', 'куда уходят деньги', 'траты'],
      examples: ['На что больше всего потратили?'],
    }),
    intent(
      'finance.record_expense',
      'finance',
      'Record a manual business expense.',
      {
        action: 'execute',
        dataClass: 'E',
        risk: 'high',
        roles: EXPENSE_WRITE_ROLES,
        permission: 'expenses.write',
        tools: ['expenses.create'],
        requiredSlots: ['amount', 'category', 'date'],
        optionalSlots: ['description', 'branch'],
        synonyms: [
          'запиши расход',
          'внеси аренду',
          'учти трату',
          'добавь расходники',
          'запомни коммуналку',
        ],
        examples: [
          'Запомни расход на рекламу 30 тысяч сегодня',
          'Учти коммуналку 12 000 за август',
          'Добавь расходники 30 тысяч',
        ],
      },
    ),
    intent(
      'finance.confirm_expenses_complete',
      'finance',
      'Confirm that all additional business expenses are recorded for a period.',
      {
        action: 'execute',
        dataClass: 'D',
        risk: 'low',
        roles: EXPENSE_WRITE_ROLES,
        permission: 'expenses.write',
        tools: ['expenses.period.complete', 'analytics.business.profit'],
        requiredSlots: ['period'],
        synonyms: [
          'дополнительных расходов нет',
          'больше расходов нет',
          'это все расходы',
          'все расходы внесены',
          'считай без дополнительных расходов',
        ],
        examples: ['Дополнительных расходов за этот месяц нет, считай прибыль'],
        responseRule:
          'Persist the optional owner declaration for the exact period and return the recalculated profit. Profit is already calculable before this declaration. Never create a zero-value rent expense.',
      },
    ),
    intent('finance.average_check', 'finance', 'Read average paid ticket.', {
      action: 'read',
      dataClass: 'C',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      optionalSlots: ['branch'],
      synonyms: ['средний чек', 'средняя покупка'],
      examples: ['Какой средний чек за месяц?'],
    }),
    intent('finance.compare_periods', 'finance', 'Compare financial periods.', {
      action: 'analyze',
      dataClass: 'D',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period', 'comparison_period'],
      optionalSlots: ['metric', 'branch'],
      synonyms: ['сравни периоды', 'к прошлой неделе', 'год к году'],
      examples: ['Сравни эту неделю с прошлой'],
    }),
    intent(
      'finance.revenue_forecast',
      'forecasting',
      'Forecast period-end revenue.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: FINANCE_ROLES,
        permission: 'analytics.business.finance.read',
        tools: ['analytics.revenue.forecast'],
        requiredSlots: ['target_period'],
        optionalSlots: ['branch', 'scenario'],
        responseRule: 'Clearly label forecast, assumptions and uncertainty.',
        synonyms: [
          'прогноз выручки',
          'сколько будет к концу',
          'если так пойдёт',
        ],
        examples: ['Сколько будет к концу месяца при таком темпе?'],
      },
    ),
    intent('payments.breakdown', 'payments', 'Read cash and card breakdown.', {
      action: 'read',
      dataClass: 'C',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      optionalSlots: ['payment_method', 'branch'],
      synonyms: ['наличные и карта', 'способы оплаты', 'безнал'],
      examples: ['Сколько наличными и сколько картой?'],
    }),
    intent('payments.refunds', 'payments', 'Read refunds for a period.', {
      action: 'read',
      dataClass: 'C',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      optionalSlots: ['branch'],
      synonyms: ['возвраты денег', 'вернули оплату', 'refund'],
      examples: ['Были возвраты в этом месяце?'],
    }),
    intent('sales.summary', 'sales', 'Analyze service and product sales.', {
      action: 'analyze',
      dataClass: 'D',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      optionalSlots: ['sale_type', 'branch'],
      synonyms: ['продажи', 'что продали', 'услуги и товары'],
      examples: ['Что мы продали за неделю?'],
    }),
    intent('products.sales', 'products', 'Analyze product sales.', {
      action: 'analyze',
      dataClass: 'D',
      roles: FINANCE_ROLES,
      permission: 'analytics.business.finance.read',
      tools: ['analytics.business.query'],
      requiredSlots: ['period'],
      optionalSlots: ['product', 'branch'],
      synonyms: ['продажи товаров', 'косметика', 'розница'],
      examples: ['Какие товары продаются лучше?'],
    }),
    intent('inventory.stock', 'inventory', 'Read current inventory stock.', {
      action: 'read',
      dataClass: 'C',
      roles: BUSINESS_ROLES,
      permission: 'inventory.read',
      tools: ['inventory.stock.read'],
      optionalSlots: ['product', 'branch', 'low_stock_only'],
      synonyms: ['остатки', 'склад', 'что заканчивается'],
      examples: ['Что заканчивается на складе?'],
    }),

    intent(
      'analytics.business_summary',
      'analytics',
      'Build a business health summary.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        optionalSlots: ['period', 'branch'],
        synonyms: ['как дела', 'сводка бизнеса', 'что происходит'],
        examples: ['Майя, что у нас сегодня по бизнесу?'],
      },
    ),
    intent(
      'analytics.anomaly_detection',
      'analytics',
      'Detect material anomalies.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        optionalSlots: ['period', 'metric', 'branch'],
        synonyms: ['аномалии', 'что выбивается', 'необычные изменения'],
        examples: ['Есть что-то странное за эту неделю?'],
      },
    ),
    intent(
      'analytics.root_cause',
      'analytics',
      'Explain a business metric change.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        requiredSlots: ['metric_or_problem'],
        optionalSlots: ['period', 'comparison_period', 'branch'],
        synonyms: ['почему упало', 'причина просадки', 'за счёт чего'],
        examples: ['Почему выручка снизилась?'],
      },
    ),
    intent(
      'analytics.recommendations',
      'recommendations',
      'Recommend next business actions.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query', 'clients.retention.scan'],
        optionalSlots: ['goal', 'period', 'branch'],
        synonyms: ['что делать', 'дай совет', 'на что обратить внимание'],
        examples: ['Что мне сейчас делать в первую очередь?'],
      },
    ),
    intent('kpi.team', 'kpi', 'Read team KPI progress.', {
      action: 'analyze',
      dataClass: 'D',
      roles: BUSINESS_ROLES,
      permission: 'analytics.business.read',
      tools: ['analytics.team-kpi.read'],
      optionalSlots: ['period', 'employee', 'metric', 'branch'],
      synonyms: ['kpi', 'выполнение плана', 'цели мастеров'],
      examples: ['Кто выполняет план, а кто отстаёт?'],
    }),
    intent(
      'reports.daily_briefing',
      'reports',
      'Prepare the owner daily briefing.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'analytics.business.read',
        tools: ['analytics.business.query'],
        optionalSlots: ['date', 'branch'],
        synonyms: ['брифинг', 'итоги дня', 'утренняя сводка'],
        examples: ['Дай краткий брифинг на сегодня'],
      },
    ),
    intent(
      'reports.recovered',
      'reports',
      'Report recovered clients and revenue.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'clients.registry.read',
        tools: ['reports.recovered'],
        optionalSlots: ['period', 'branch'],
        synonyms: ['maya recovered', 'кого вернули', 'заполненные окна'],
        examples: ['Покажи Maya Recovered за месяц'],
      },
    ),

    intent('loyalty.read_own', 'loyalty', 'Read the actor loyalty balance.', {
      action: 'read',
      dataClass: 'C',
      permission: 'loyalty.own.read',
      tools: ['loyalty.own.read'],
      synonyms: ['мои баллы', 'бонусный баланс', 'сколько бонусов'],
      examples: ['Сколько у меня баллов?'],
    }),
    intent(
      'loyalty.spend_options',
      'bonuses',
      'Suggest affordable bonus redemptions.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'loyalty.own.read',
        tools: ['loyalty.own.read', 'booking.upsell.suggest'],
        optionalSlots: ['appointment', 'available_time'],
        synonyms: ['на что потратить баллы', 'списать бонусы', 'хватит ли'],
        examples: ['На какую услугу хватит моих баллов?'],
      },
    ),
    intent('loyalty.adjust', 'bonuses', 'Adjust internal loyalty balance.', {
      action: 'execute',
      dataClass: 'E',
      risk: 'high',
      roles: OWNER_ROLES,
      permission: 'loyalty.adjust',
      tools: ['loyalty.internal.adjust'],
      requiredSlots: ['client_reference', 'delta', 'reason'],
      synonyms: ['начисли баллы', 'спиши бонусы', 'компенсация баллами'],
      examples: ['Начисли клиенту 500 баллов за ошибку'],
    }),
    intent(
      'certificates.catalog',
      'certificates',
      'Read available certificates.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'commerce.catalog.read',
        tools: ['commerce.certificates.read'],
        optionalSlots: ['nominal', 'branch'],
        synonyms: ['сертификат', 'подарочная карта', 'номиналы'],
        examples: ['Какие сертификаты можно купить?'],
      },
    ),
    intent(
      'subscriptions.catalog',
      'subscriptions',
      'Read available subscriptions.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'commerce.catalog.read',
        tools: ['commerce.memberships.read'],
        optionalSlots: ['service', 'branch'],
        synonyms: ['абонемент', 'пакет посещений', 'подписка салона'],
        examples: ['Какие есть абонементы?'],
      },
    ),
    intent('referrals.status', 'referrals', 'Read referral status and rules.', {
      action: 'read',
      dataClass: 'C',
      permission: 'referrals.own.read',
      tools: ['referrals.status.read'],
      optionalSlots: ['referral'],
      synonyms: ['пригласить друга', 'реферальная программа', 'мой код'],
      examples: ['Что я получу за приглашённого друга?'],
    }),

    intent(
      'marketing.find_audience',
      'marketing',
      'Build a consent-safe audience.',
      {
        action: 'analyze',
        dataClass: 'D',
        risk: 'medium',
        roles: CAMPAIGN_ROLES,
        permission: 'marketing.audience.read',
        tools: ['marketing.audience.find'],
        requiredSlots: ['audience_rule'],
        optionalSlots: ['minimum_visits', 'max_recipients'],
        responseRule:
          'Return only aggregate counts and the opaque audience reference. Never expose names, phones or CRM identifiers.',
        synonyms: ['кому написать', 'сегмент клиентов', 'кого вернуть'],
        examples: ['Найди тех, кто не был 60 дней'],
      },
    ),
    intent(
      'marketing.draft_message',
      'messaging',
      'Draft a campaign message.',
      {
        action: 'preview',
        dataClass: 'A',
        risk: 'medium',
        roles: BUSINESS_ROLES,
        permission: 'marketing.message.preview',
        requiredSlots: ['goal_or_audience'],
        optionalSlots: ['offer', 'tone', 'channel'],
        synonyms: ['напиши текст', 'черновик рассылки', 'покажи сообщение'],
        examples: ['Напиши мягкое сообщение тем, кто давно не был'],
      },
    ),
    intent(
      'marketing.preview_campaign',
      'messaging',
      'Preview campaign impact.',
      {
        action: 'preview',
        dataClass: 'D',
        risk: 'medium',
        roles: CAMPAIGN_ROLES,
        permission: 'marketing.campaign.preview',
        tools: ['marketing.campaign.preview'],
        requiredSlots: ['audience', 'message'],
        optionalSlots: [],
        responseRule:
          'Show the final message and exact recipient count, then request explicit confirmation. Do not claim that anything was sent.',
        synonyms: ['не отправляй', 'сначала покажи', 'сколько получат'],
        examples: ['Сначала покажи текст и сколько человек его получат'],
      },
    ),
    intent(
      'marketing.send_campaign',
      'messaging',
      'Send a consent-safe campaign.',
      {
        action: 'execute',
        dataClass: 'E',
        risk: 'high',
        roles: CAMPAIGN_ROLES,
        permission: 'marketing.campaign.execute',
        tools: ['marketing.campaign.send'],
        requiredSlots: ['approved_preview'],
        clarificationRule:
          'Require an explicit confirmation of the persisted campaign preview. Never construct a new audience or message during execution.',
        responseRule:
          'Report server-confirmed delivered, skipped and failed counts. Never say sent before the tool succeeds.',
        synonyms: ['отправь рассылку', 'запусти кампанию', 'разошли'],
        examples: ['Да, отправляй этот вариант'],
      },
    ),
    intent(
      'notifications.appointments',
      'notifications',
      'Configure appointment notices.',
      {
        action: 'write',
        dataClass: 'E',
        risk: 'high',
        roles: CAMPAIGN_ROLES,
        permission: 'notifications.settings.write',
        tools: ['notifications.appointments.update'],
        requiredSlots: ['enabled'],
        optionalSlots: ['timing'],
        clarificationRule:
          'If the owner does not specify timing, preserve the current lead times. The production channel is always the MAYA inbox with push announcement; do not offer email or SMS as if they were connected.',
        responseRule:
          'Change the persisted tenant reminder policy only through the tool and report the exact enabled state and lead times returned by the server.',
        synonyms: [
          'напоминания',
          'уведомления о записи',
          'предупреждать клиентов',
        ],
        examples: ['Напоминай клиентам за день до визита'],
      },
    ),

    intent('reviews.list_recent', 'reviews', 'Read recent business reviews.', {
      action: 'read',
      dataClass: 'C',
      roles: BUSINESS_ROLES,
      permission: 'reviews.read',
      tools: ['reviews.list.read'],
      optionalSlots: ['period', 'rating', 'employee', 'branch'],
      synonyms: ['последние отзывы', 'что пишут', 'отзывы клиентов'],
      examples: ['Покажи последние плохие отзывы'],
    }),
    intent(
      'reviews.analyze_topics',
      'reviews',
      'Aggregate review topics and sentiment.',
      {
        action: 'analyze',
        dataClass: 'D',
        roles: BUSINESS_ROLES,
        permission: 'reviews.read',
        tools: ['reviews.analyze'],
        optionalSlots: ['period', 'employee', 'branch'],
        synonyms: ['на что жалуются', 'что нравится', 'темы отзывов'],
        examples: ['На что люди жалуются чаще всего?'],
      },
    ),
    intent('reviews.rating_trend', 'reviews', 'Analyze rating trend.', {
      action: 'analyze',
      dataClass: 'D',
      roles: BUSINESS_ROLES,
      permission: 'reviews.read',
      tools: ['reviews.analyze'],
      optionalSlots: ['period', 'branch'],
      synonyms: ['средняя оценка', 'рейтинг стал лучше', 'динамика отзывов'],
      examples: ['Рейтинг стал лучше или хуже?'],
    }),

    intent('branches.compare', 'branches', 'Compare branches.', {
      action: 'analyze',
      dataClass: 'D',
      roles: BUSINESS_ROLES,
      permission: 'analytics.business.read',
      tools: ['analytics.branches.compare'],
      requiredSlots: ['period'],
      optionalSlots: ['metric', 'branches'],
      synonyms: ['сравни филиалы', 'какой филиал лучше', 'по точкам'],
      examples: ['Сравни филиалы по загрузке'],
    }),
    intent(
      'company.public_info',
      'company',
      'Read public business information.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'company.public.read',
        tools: ['catalog.staff.read'],
        optionalSlots: ['field', 'branch'],
        synonyms: ['адрес', 'телефон салона', 'как добраться', 'о компании'],
        examples: ['Как вас найти?'],
      },
    ),
    intent(
      'company.business_hours',
      'company',
      'Read business opening hours.',
      {
        action: 'read',
        dataClass: 'C',
        permission: 'company.public.read',
        tools: ['company.business-hours.read'],
        optionalSlots: ['date', 'branch'],
        synonyms: ['режим работы', 'когда открыты', 'до скольки'],
        examples: ['До скольки вы сегодня работаете?'],
      },
    ),
    intent('settings.read', 'settings', 'Read available MAYA settings.', {
      action: 'read',
      dataClass: 'B',
      roles: TEAM_ROLES,
      permission: 'settings.read',
      tools: ['settings.read'],
      optionalSlots: ['section'],
      synonyms: ['настройки', 'как настроено', 'мои параметры'],
      examples: ['Какие у меня включены модули?'],
    }),
    intent('settings.update', 'settings', 'Update a MAYA setting.', {
      action: 'write',
      dataClass: 'E',
      risk: 'medium',
      roles: TEAM_ROLES,
      permission: 'settings.write',
      tools: ['settings.update'],
      requiredSlots: ['capability', 'enabled'],
      synonyms: ['включи функцию', 'измени настройку', 'отключи модуль'],
      examples: ['Включи анализ сотрудников'],
    }),
    intent('tasks.list', 'tasks', 'Read operational tasks.', {
      action: 'read',
      dataClass: 'B',
      roles: TEAM_ROLES,
      permission: 'tasks.read',
      tools: ['tasks.list'],
      optionalSlots: ['assignee', 'status', 'period'],
      synonyms: ['задачи', 'что нужно сделать', 'мой план'],
      examples: ['Какие у меня задачи на сегодня?'],
    }),
    intent('tasks.create', 'tasks', 'Create an operational task.', {
      action: 'write',
      dataClass: 'E',
      risk: 'high',
      roles: BUSINESS_ROLES,
      permission: 'tasks.write',
      tools: ['tasks.create'],
      requiredSlots: ['task', 'assignee'],
      optionalSlots: ['deadline', 'priority'],
      synonyms: ['поставь задачу', 'напомни сотруднику', 'создай поручение'],
      examples: ['Поставь Антону задачу проверить отмены'],
    }),
    intent('tasks.complete', 'tasks', 'Complete an assigned task.', {
      action: 'write',
      dataClass: 'E',
      risk: 'low',
      roles: TEAM_ROLES,
      permission: 'tasks.write',
      tools: ['tasks.complete'],
      requiredSlots: ['task_id'],
      synonyms: ['задача выполнена', 'закрой задачу', 'отметь выполненной'],
      examples: ['Отметь эту задачу выполненной'],
    }),

    intent(
      'general.explain_term',
      'general_business_questions',
      'Explain a business term.',
      {
        action: 'answer',
        dataClass: 'A',
        requiredSlots: ['topic'],
        synonyms: ['что такое', 'объясни', 'простыми словами'],
        examples: ['Что такое LTV простыми словами?'],
      },
    ),
    intent(
      'general.strategy_advice',
      'general_business_questions',
      'Give general business advice.',
      {
        action: 'answer',
        dataClass: 'A',
        optionalSlots: ['goal', 'constraint'],
        synonyms: ['как улучшить', 'что посоветуешь', 'идея для бизнеса'],
        examples: ['Как в целом поднять средний чек?'],
      },
    ),
    intent(
      'general.write_text',
      'general_business_questions',
      'Write non-executing content.',
      {
        action: 'answer',
        dataClass: 'A',
        requiredSlots: ['content_goal'],
        optionalSlots: ['tone', 'length', 'audience'],
        synonyms: ['напиши текст', 'придумай акцию', 'сформулируй'],
        examples: ['Придумай короткий текст для акции'],
      },
    ),
    intent('support.capabilities', 'support', 'Explain MAYA capabilities.', {
      action: 'answer',
      dataClass: 'A',
      optionalSlots: ['role', 'feature'],
      synonyms: ['что ты умеешь', 'чем поможешь', 'возможности майя'],
      examples: ['Майя, что ты можешь делать для владельца?'],
    }),
    intent(
      'support.integration_status',
      'support',
      'Explain integration status.',
      {
        action: 'read',
        dataClass: 'B',
        roles: BUSINESS_ROLES,
        permission: 'integrations.read',
        tools: ['support.integration-status.read'],
        optionalSlots: ['provider'],
        synonyms: ['crm подключена', 'статус интеграции', 'есть связь'],
        examples: ['YCLIENTS сейчас подключён?'],
      },
    ),
    intent(
      'support.contact_admin',
      'support',
      'Contact the business administrator.',
      {
        action: 'preview',
        dataClass: 'B',
        risk: 'medium',
        roles: CLIENT_ROLES,
        permission: 'support.contact',
        tools: ['support.contact-admin.request'],
        readiness: 'ready',
        optionalSlots: ['reason', 'channel'],
        synonyms: [
          'связаться с админом',
          'позвать администратора',
          'нужен человек',
        ],
        examples: ['Соедини меня с администратором'],
      },
    ),
    intent('small_talk.greeting', 'small_talk', 'Respond to a greeting.', {
      action: 'answer',
      dataClass: 'A',
      synonyms: ['привет', 'добрый день', 'как дела'],
      examples: ['Привет, Майя!'],
    }),
    intent('small_talk.thanks', 'small_talk', 'Respond to thanks.', {
      action: 'answer',
      dataClass: 'A',
      synonyms: ['спасибо', 'благодарю', 'супер'],
      examples: ['Спасибо, всё понятно'],
    }),
    intent(
      'small_talk.free_form',
      'small_talk',
      'Handle free-form conversation.',
      {
        action: 'answer',
        dataClass: 'A',
        synonyms: ['поговорим', 'помоги подумать', 'есть вопрос'],
        examples: ['Помоги мне разобраться'],
      },
    ),
  ] as const;

const intentIds = new Set<string>();
for (const definition of MAYA_CONVERSATION_TAXONOMY) {
  if (intentIds.has(definition.id)) {
    throw new Error(`duplicate_conversation_intent:${definition.id}`);
  }
  if (
    definition.readiness === 'partial' &&
    (!definition.readinessNote || definition.toolCandidates.length === 0)
  ) {
    throw new Error(`invalid_partial_conversation_intent:${definition.id}`);
  }
  if (
    definition.readiness === 'planned' &&
    definition.toolCandidates.length > 0
  ) {
    throw new Error(`planned_conversation_intent_has_tool:${definition.id}`);
  }
  if (
    definition.readiness === 'ready' &&
    ['C', 'D', 'E'].includes(definition.dataClass) &&
    definition.toolCandidates.length === 0
  ) {
    throw new Error(`ready_conversation_intent_has_no_tool:${definition.id}`);
  }
  intentIds.add(definition.id);
}

export const MAYA_CONVERSATION_INTENTS = new Map(
  MAYA_CONVERSATION_TAXONOMY.map((definition) => [definition.id, definition]),
);

export const MAYA_CONVERSATION_ROLE_GROUPS = {
  owner: OWNER_ROLES,
  admin: ADMIN_ROLES,
  employee: EMPLOYEE_ROLES,
  client: CLIENT_ROLES,
} as const;
