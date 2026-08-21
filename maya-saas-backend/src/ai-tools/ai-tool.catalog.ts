import { UserRole } from '../common/domain.enums';
import {
  MANUAL_EXPENSE_CATEGORY_SLUGS,
  MAX_EXPENSE_RUBLES,
} from '../expenses/expense-category';
import { ASSISTANT_CAPABILITIES } from '../dashboard-preferences/assistant-capabilities.constants';
import type { AiToolDefinition } from './ai-tool.types';

const ALL_SURFACES = ['native', 'web', 'telegram', 'voice'] as const;

const CLIENT_ROLES = [UserRole.CLIENT, UserRole.CUSTOMER] as const;
const STAFF_ROLES = [
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
] as const;
const BUSINESS_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
] as const;
const OWNER_AND_ADMIN_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
] as const;
const EXPENSE_WRITE_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
] as const;
const FINANCE_ROLES = [...OWNER_AND_ADMIN_ROLES, UserRole.ACCOUNTANT] as const;
const SCHEDULE_MANAGER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
] as const;
const ALL_INTERACTIVE_TENANT_ROLES = [
  ...CLIENT_ROLES,
  ...STAFF_ROLES,
  ...BUSINESS_ROLES,
] as const;

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const REPORTING_PERIOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['period'],
  properties: {
    period: {
      type: 'string',
      enum: [
        'today',
        'yesterday',
        'week_to_date',
        'month_to_date',
        'year_to_date',
        'last_7_days',
        'last_30_days',
        'last_week',
        'last_month',
        'named_day',
        'named_month',
        'named_range',
        'custom',
      ],
      description:
        'Server-resolved reporting period. Prefer letting the server resolve from the user wording. Use named_day+day for a calendar day ("за 7 августа", "а за 7"). Use named_month+month for a whole month without a day ("в июле"). Use named_range+from_day+to_day for "с 1 по 7 августа" / "первая неделя августа". Never answer a day question with a month window.',
    },
    /**
     * Календарный месяц целиком. Без него «прибыль в июле» молча считалась за
     * текущий месяц по сегодня — вопрос про июль отвечался числами августа.
     */
    month: {
      type: 'string',
      pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
      description:
        'Calendar month as YYYY-MM, required by named_month and forbidden otherwise. A month already finished is counted whole; a month still running is counted up to today and the server says so.',
    },
    /**
     * Один календарный день. Без него «отчёт за 7 августа» молча становился
     * named_month и отдавал сумму за весь август — числа настоящие, день чужой.
     */
    day: {
      type: 'string',
      pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
      description:
        'Calendar day as YYYY-MM-DD, required by named_day and forbidden otherwise. Counts that local day only in the salon timezone.',
    },
    from_day: {
      type: 'string',
      pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
      description:
        'Inclusive start day YYYY-MM-DD for named_range ("с 1 по 7 августа").',
    },
    to_day: {
      type: 'string',
      pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
      description: 'Inclusive end day YYYY-MM-DD for named_range.',
    },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    branch_id: { type: 'string', minLength: 8, maxLength: 128 },
  },
} as const;

const BUSINESS_QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['period', 'comparison'],
  properties: {
    ...REPORTING_PERIOD_SCHEMA.properties,
    comparison: {
      type: 'string',
      enum: ['none', 'previous_period', 'previous_year_same_period'],
      description:
        'Use previous_period for adjacent equal-length periods and previous_year_same_period for the same local calendar dates one year earlier.',
    },
  },
} as const;

const BRANCH_COMPARISON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['period'],
  properties: {
    ...REPORTING_PERIOD_SCHEMA.properties,
    branch_ids: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      uniqueItems: true,
      items: { type: 'string', minLength: 8, maxLength: 128 },
      description:
        'Optional tenant branch ids to compare. If omitted, MAYA compares every configured branch, up to eight.',
    },
    metric: {
      type: 'string',
      enum: [
        'appointments_total',
        'appointments_active',
        'appointments_completed',
        'appointments_cancelled',
        'appointments_no_show',
        'unique_clients',
        'booked_minutes',
      ],
      default: 'appointments_completed',
    },
  },
} as const;

export const MAYA_AI_TOOL_CATALOG = [
  {
    name: 'catalog.services.read',
    description: 'Read the current tenant service catalog without credentials.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'booking.availability.read',
    description: 'Read available appointment slots without customer PII.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: { type: 'string', format: 'date-time' },
        staff_id: { type: 'string', minLength: 1, maxLength: 128 },
        service_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { type: 'string', minLength: 1, maxLength: 128 },
        },
        branch_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'booking.group-availability.read',
    description:
      'Find verified groups of CRM slots for two or more people. Simultaneous mode requires distinct specialists at the same start time; nearby mode allows a bounded gap. This tool is read-only and never claims that a multi-person booking is atomic.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'party_size'],
      properties: {
        date: { type: 'string', format: 'date-time' },
        party_size: { type: 'integer', minimum: 2, maximum: 10 },
        service_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 128 },
        },
        branch_id: { type: 'string', minLength: 1, maxLength: 128 },
        mode: {
          type: 'string',
          enum: ['simultaneous', 'nearby'],
          default: 'simultaneous',
        },
        max_gap_minutes: {
          type: 'integer',
          minimum: 0,
          maximum: 120,
          default: 30,
        },
      },
    },
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 12_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'appointments.own.list',
    description: 'Read the authenticated customer appointment history.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking.customer_app'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'loyalty.own.read',
    description:
      'Read the authenticated customer authoritative loyalty balance and price-matched spend options.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['loyalty'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'analytics.employee.query',
    description:
      'Universal personal performance analytics for the current employee. Returns appointments, cancellations, unique clients, client cohorts, booked service value, average booked value, booked minutes, service demand, the salary accrued to this employee by the CRM payroll calculation, and optional comparison. clients_returning counts this employee clients of the period who already visited within cohort_lookback_days BEFORE the period started, and clients_new counts those who did not: these are returning-within-N-days cohorts, not loyal clients overall, while repeat_clients_in_period only counts clients who came more than once INSIDE the period. This never exposes another employee data. Booked value is not cash revenue, and staff_summary[].salary is what the salon accrued TO this employee, never how much money he brought in. staff_summary[].confirmed_revenue is available only when YClients linked exact service financial transactions to this employee; if unavailable or partial, never estimate the missing cash from appointment prices.',
    inputSchema: BUSINESS_QUERY_SCHEMA,
    allowedRoles: STAFF_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.employee'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'last_verified_snapshot',
  },
  {
    name: 'analytics.business.query',
    description:
      'Universal verified business analytics for an owner or manager. Returns revenue and financial operations, appointments, cancellations, unique clients, client cohorts, average ticket, booked minutes, daily dynamics, service demand, a per-master breakdown with cancellations and repeat clients, and optional comparison with the previous equal period or previous year. clients_returning counts clients of the period who already visited within cohort_lookback_days BEFORE the period started, and clients_new counts those who did not: these are returning-within-N-days cohorts, not loyal or regular clients of the salon overall. repeat_clients_in_period is a different and much narrower thing: clients who came more than once INSIDE the period, which is near zero on a short period by nature and must never be presented as retention. Money per master is two separate fields that must never be mixed: staff_summary[].confirmed_revenue is exact cash attributed through YClients service financial transactions and may be available, partial, or unavailable; staff_summary[].salary is payroll accrued and paid TO that master for the period, which is a salon cost. Publish exact confirmed_revenue rows, state attribution coverage when partial, and never distribute the unlinked remainder from booked appointment prices. Salary is present only for roles allowed to read finance. Use this for any factual business-performance question that is not a personal employee question. ВАЖНО про деньги: revenue_amount_kopecks — подтверждённые кассовые операции провайдера (revenue_basis: provider_transactions); booked_value_amount_kopecks — СТОИМОСТЬ ЗАПИСАННОГО, сумма цен того, что стоит в журнале (booked_value_basis: booked_prices). Это два разных факта: они могут различаться и присутствовать по отдельности. Стоимость записанного НИКОГДА не называй выручкой, кассой, поступлениями, полученным или заработанным — говори «стоимость записанного». Если кассы нет, а записанное есть, так и скажи.',
    inputSchema: BUSINESS_QUERY_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'last_verified_snapshot',
  },
  {
    name: 'analytics.business.profit',
    description:
      'Net profit, expense structure and cost of one new client for the salon. This is the only server-calculated profit source: till-confirmed CRM cash minus CRM payroll and every additional expense currently recorded by the owner, never booked appointment prices. Missing additional expense rows are treated as zero and explicitly marked by completeness.unrecorded_additional_expenses_assumed_zero; answer with the calculated result first, then briefly say that expenses can be added later in chat and the result will recalculate. Never invent rent, taxes or any other amount. Every money figure is already calculated; never subtract, divide or scale anything yourself. client_acquisition_cost is advertising spend divided by new clients of the period and is not proof of attribution.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    // Те же роли, что и у чтения финансов: подтверждённая касса и расходы —
    // коммерческая тайна, управляющему и руководителю филиала они не открыты.
    allowedRoles: FINANCE_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    // Внутри — финсводка CRM (включая расчёт зарплаты по каждому сотруднику) и
    // полный обзор с когортами: тот же порядок работы, что у business.query.
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'analytics.revenue.forecast',
    description:
      'Deterministic period-end revenue forecast based only on verified CRM cash already received in the selected period. Returns the actual amount, run-rate projection, conservative/base/optimistic scenarios and explicit assumptions. This is a forecast, not a guaranteed result; never present it as confirmed revenue.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: FINANCE_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'last_verified_snapshot',
  },
  {
    name: 'analytics.team-kpi.read',
    description:
      'Read verified team performance and plan completion for a reporting period. Uses exact CRM appointments, statuses, attributed cash and configured monthly staff targets. If a target or exact attributed cash is missing, returns an explicit unavailable reason and never estimates it from appointment prices.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'last_verified_snapshot',
  },
  {
    name: 'analytics.branches.compare',
    description:
      'Compare two or more tenant branches over one exact reporting period using branch-scoped CRM appointment facts: total, active, completed, cancelled and no-show appointments, unique clients and booked minutes. Company-scoped YClients cash is deliberately excluded because it cannot be attributed to a branch safely. Never substitute the whole-company till or booked prices for branch revenue.',
    inputSchema: BRANCH_COMPARISON_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 120_000,
    retryPolicy: 'none',
    fallbackPolicy: 'last_verified_snapshot',
  },
  {
    name: 'reports.recovered',
    description:
      'Read deterministic MAYA Recovered attribution for a reporting period. Returns sent recovery touchpoints, bookings created after outreach, canceled bookings, filled freed slots, booked service value and till-confirmed service revenue linked to exact YClients record ids. Booked value is never presented as recovered cash. If CRM transactions cannot verify every booking, the result is explicitly partial or unavailable and must never be estimated.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'catalog.staff.read',
    description:
      'Read the public booking staff list for guests: real display names, titles and specializations, plus a short salon public profile (name, city, address, tagline, about). Use this for “расскажи о барбершопе / мастерах”. Never use business analytics for guest questions.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'inventory.stock.read',
    description:
      'Read the tenant-owned inventory catalog and exact low-stock signals. If no inventory is configured, say so instead of inventing stock from CRM services.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        low_stock_only: { type: 'boolean', default: false },
      },
    },
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['commerce.store'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'commerce.certificates.read',
    description:
      'Read only the certificate denominations configured by this tenant. Never invent a denomination or substitute another business catalog.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['commerce.certificates'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'commerce.memberships.read',
    description:
      'Read only the membership or subscription offers configured by this tenant. Never invent an offer or price.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['commerce.memberships'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'referrals.status.read',
    description:
      'Read this tenant referral program status and configured rewards. This does not create a referral or grant a reward.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['referrals'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'reviews.list.read',
    description:
      'Read privacy-safe recent business review facts: rating, source, date and deterministic topics. Original review text is never sent to the model.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 3650, default: 90 },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        branch_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['reviews.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'reviews.analyze',
    description:
      'Analyze privacy-safe business review aggregates. Topic mode returns deterministic topic counts and rating distribution; trend mode returns monthly rating dynamics. Original review text is never sent to the model.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['topics', 'trend'] },
        days: { type: 'integer', minimum: 1, maximum: 3650, default: 365 },
        branch_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['reviews.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'customers.count',
    description:
      'Read a tenant customer count without customer PII. Kept for tariffs that have no business analytics: there it is the only answer to "how many clients do we have".',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['customers.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 5_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'clients.dormant.list',
    description:
      'List salon guests who have not returned for at least inactive_days, by name, longest inactivity first. Use for "кто давно не приходил", "кого можно вернуть", "покажи спящих клиентов", "выгрузи тех кто пропал". Returns real client names because the owner needs to know WHOM to win back; phone numbers are included only for the salon owner. This is the only client tool that carries personal data, so its answer is composed by the server and never sent to an external model. Counts and cohorts without names live in clients.retention.scan; a single guest dossier lives in clients.dossier.read.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['inactive_days'],
      properties: {
        inactive_days: {
          type: 'integer',
          minimum: 14,
          maximum: 3650,
          description:
            'Minimum days since the last visit: 30 for a month, 90 for long gone.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'How many guests to list. Default 20.',
        },
      },
    },
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['customers.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'clients.retention.scan',
    description:
      'Analyze the complete paginated CRM client registry without PII. Returns exact total cards, repeat and loyal counts, cumulative inactivity counts, the intersection of loyal + inactive clients, and non-overlapping reactivation cohorts over 1, 2, 3, 4, 5, 6 months and 1 year. Use for "how many clients are in the whole database", "how many loyal clients", "which loyal clients have not visited for N months", win-back advice, retention and dormant-base questions. Never substitute period analytics for this tool.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 45_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'clients.dossier.read',
    description:
      'Staff/owner CRM client dossier by name (≥3 letters) or phone digits (≥4): exact CRM visit count, last visit, recent favorite services, average cycle, lifetime spend, loyalty status and current bonus balance. Call for "что за клиент", "расскажи про <имя>", "сколько визитов у <имя>", "что обычно берёт", "сколько бонусов у <имя>". 152-ФЗ: never echo phone or real name — the server returns display_name "клиент" only. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 3,
          maxLength: 80,
          description:
            'Client name (≥3 letters) or phone fragment (≥4 digits) for CRM search.',
        },
      },
    },
    allowedRoles: [...STAFF_ROLES, ...BUSINESS_ROLES],
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 12_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'clients.high-value.read',
    description:
      'Rank the complete CRM client registry by verified lifetime spend, visit count or recency. Results are anonymized as client_1, client_2 and never expose CRM ids, names, phones or contacts to the model. Use for high-value and loyal-client prioritization, not for direct outreach.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        metric: {
          type: 'string',
          enum: ['lifetime_spend', 'visits', 'recency'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 45_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'clients.no-show-risk.read',
    description:
      'Analyze provider attendance marks and cancellations by anonymized client for a reporting period. These are PROVIDER MARKS per client, not the canonical attendance fact: the period-level question "how many arrived" is owned solely by the chapter 3 mirror, and per-client attendance has no canonical owner while business client identity is empty. Never present provider_marked_no_show as the salon attendance number. provider_attendance_marks.not_observed is the number of records the provider never marked: while it is above zero every count is a lower bound and completeness.zero_means_none is false. Records the provider returns outside the requested period are excluded. The provider reports only that a record was removed — a business cancellation reason is not part of the contract and must never be inferred. YClients does not provide the cancellation timestamp here, so late-cancellation risk is explicitly unavailable.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 70_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'expenses.read',
    description:
      'Read tenant expenses without decrypted free-text notes, together with by_category totals already summed by the server for the period. Use by_category for "сколько ушло на расходники", "на что больше всего тратим": never add the individual items up yourself. totals and by_category cover EVERY expense of the period; items is only the first page of up to 500 operations, so never divide totals by items.length and never describe items as the full list — expense_count is how many rows the period really has and truncated says the page is shorter than that. totals_basis says whether the expense book was read at all: when it is "unavailable" the sums are unknown, expense_count is null, and that is NOT zero expenses. scope names the branch the sums cover. Relative reporting periods are resolved by the server in the tenant timezone.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['expenses.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'appointments.own.cancel',
    description: 'Cancel one appointment owned by the authenticated customer.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['appointment_id'],
      properties: {
        appointment_id: { type: 'string', minLength: 8, maxLength: 128 },
      },
    },
    allowedRoles: CLIENT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking.customer_app'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'appointments.own.create',
    description:
      'Create one appointment for the authenticated customer after approval.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['staff_id', 'service_ids', 'start'],
      properties: {
        staff_id: { type: 'string', minLength: 1, maxLength: 128 },
        service_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { type: 'string', minLength: 1, maxLength: 128 },
        },
        start: { type: 'string', format: 'date-time' },
        branch_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: CLIENT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking.customer_app'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 12_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'appointments.own.reschedule',
    description:
      'Reschedule one authenticated customer appointment after approval.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['appointment_id', 'start'],
      properties: {
        appointment_id: { type: 'string', minLength: 8, maxLength: 128 },
        start: { type: 'string', format: 'date-time' },
        staff_id: { type: 'string', minLength: 1, maxLength: 128 },
        service_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { type: 'string', minLength: 1, maxLength: 128 },
        },
        branch_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: CLIENT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking.customer_app'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 12_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'staff.schedule.read',
    description:
      'Read the exact YClients work schedule for one named staff member or the active team on one calendar date. Returns verified working/off status and CRM shift slots. Use for "какое расписание у Стаса завтра", "кто работает сегодня", "у Ильи выходной?" and all factual staff-roster questions. Never substitute appointment analytics for this tool.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: { type: 'string', format: 'date' },
        staff_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: SCHEDULE_MANAGER_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 15_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'staff.schedule.own.read',
    description:
      'Read the authenticated employee own verified CRM work schedule for one calendar date. The server resolves the employee through the tenant-scoped CRM staff link; it never accepts another staff id and never exposes colleague schedules.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: { type: 'string', format: 'date' },
      },
    },
    allowedRoles: [...STAFF_ROLES, ...BUSINESS_ROLES],
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 15_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'operations.journal.read',
    description:
      'Read the exact PII-free YClients appointment journal for one calendar date, optionally limited to one active staff member. Returns verified appointment/status counts, booked time, service names and staff workload without client names, phones, notes or CRM record IDs. Records the provider returns outside the requested day are excluded and counted in completeness.out_of_period_discarded. summary.completed is the PROVIDER STATUS and means "arrival marked OR bill paid": never present it as proof that the client came. Client attendance is the separate attendance block (arrived / no_show / awaiting / not_observed); not_observed is neither zero nor waiting, and while it is above zero a zero in arrived does not prove that nobody came — completeness.zero_means_none says so explicitly. Use for "сколько записей у Стаса завтра", "кто загружен сегодня", "сколько отмен сегодня" and other operational day questions. Never substitute a monthly analytics summary for this tool.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: { type: 'string', format: 'date' },
        staff_id: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    allowedRoles: SCHEDULE_MANAGER_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 20_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'staff.schedule.update',
    description:
      'Apply one precomputed staff-day schedule after actor approval. Existing appointments are never moved or deleted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'staff_id',
        'date',
        'operation',
        'current_revision',
        'current_slots',
        'slots',
      ],
      properties: {
        staff_id: { type: 'string', minLength: 1, maxLength: 128 },
        date: { type: 'string', format: 'date' },
        operation: {
          type: 'string',
          enum: ['close_day', 'set_break', 'set_hours'],
        },
        current_revision: {
          type: 'string',
          minLength: 64,
          maxLength: 64,
        },
        current_slots: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['from', 'to'],
            properties: {
              from: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
              to: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
            },
          },
        },
        slots: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['from', 'to'],
            properties: {
              from: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
              to: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
            },
          },
        },
      },
    },
    allowedRoles: SCHEDULE_MANAGER_ROLES,
    allowedSurfaces: ['native'],
    requiredFeatures: ['booking'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 15_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'loyalty.internal.adjust',
    description:
      'Adjust an internal-calendar loyalty balance after owner approval.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['target_user_id', 'delta', 'reason'],
      properties: {
        target_user_id: { type: 'string', minLength: 8, maxLength: 128 },
        delta: {
          type: 'integer',
          minimum: -1_000_000,
          maximum: 1_000_000,
        },
        reason: { type: 'string', minLength: 2, maxLength: 160 },
      },
    },
    allowedRoles: OWNER_AND_ADMIN_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['loyalty'],
    riskTier: 'high_write',
    approvalPolicy: 'owner',
    idempotency: 'required',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'expenses.create',
    description:
      'Record one salon expense from the authenticated owner chat after that same owner confirms the card. The amount is given in RUBLES exactly as the person said them ("шестьдесят тысяч" is amount_rubles 60000): never convert to kopecks, the server does that. category must be one of the fixed slugs, because a free-text category splits one cost line into several and breaks the margin. Salary is never recorded here: master payroll already arrives from the CRM payroll calculation and a manual copy would count it twice, so a payroll request is rejected. occurred_on is optional and defaults to today in the salon timezone. Nothing is written until the requesting owner confirms the card.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'amount_rubles'],
      properties: {
        category: {
          type: 'string',
          enum: MANUAL_EXPENSE_CATEGORY_SLUGS,
          description:
            'rent — аренда, supplies — расходники, marketing — реклама, taxes — налоги, utilities — коммунальные платежи, other — прочее.',
        },
        amount_rubles: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: MAX_EXPENSE_RUBLES,
          description:
            'Amount in rubles, at most two decimals. 60 тысяч рублей is 60000, not 6000000.',
        },
        occurred_on: {
          type: 'string',
          format: 'date',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description:
            'Local salon date of the expense. Omit it for today: the server resolves today in the salon timezone.',
        },
        note: {
          type: 'string',
          minLength: 2,
          maxLength: 160,
          description:
            'Short human note without personal data, phone numbers or emails.',
        },
      },
    },
    allowedRoles: EXPENSE_WRITE_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['expenses.core'],
    riskTier: 'high_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'expenses.period.complete',
    description:
      'Optionally persist the authenticated owner explicit declaration that every additional non-payroll expense for the selected period has been entered. Profit does not wait for this declaration: without it the server calculates from recorded expenses and marks unrecorded additions as assumed zero. Call only after an explicit statement such as "дополнительных расходов нет", "это все расходы" or "все расходы внесены". This does not create a zero-value expense. CRM payroll remains system-owned. The successful result contains recalculated server-side net profit.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: EXPENSE_WRITE_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['expenses.core'],
    riskTier: 'low_write',
    approvalPolicy: 'none',
    idempotency: 'required',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'company.business-hours.read',
    description:
      'Read verified public business hours from the connected CRM company profile. Returns the raw CRM schedule together with timezone and source; if the CRM has no schedule, says unavailable instead of inventing opening hours.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: ALL_INTERACTIVE_TENANT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['booking'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 12_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'settings.read',
    description:
      'Read the authenticated team member tenant-scoped MAYA assistant capabilities and finance dashboard preferences. Returns only safe configuration values, available capability descriptions and configured targets; never returns credentials or integration secrets.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: [...STAFF_ROLES, ...BUSINESS_ROLES],
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: [],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'settings.update',
    description:
      'Enable or disable one personal MAYA analytics capability for the authenticated team member. This tool changes only the caller own assistant preferences; it cannot change tenant security, roles, credentials, billing or another person settings.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['capability', 'enabled'],
      properties: {
        capability: {
          type: 'string',
          enum: ASSISTANT_CAPABILITIES,
          description:
            'daily_brief, business_analytics, finance_analytics, staff_performance or client_return.',
        },
        enabled: { type: 'boolean' },
      },
    },
    allowedRoles: [...STAFF_ROLES, ...BUSINESS_ROLES],
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: [],
    riskTier: 'low_write',
    approvalPolicy: 'none',
    idempotency: 'required',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'tasks.list',
    description:
      'Read persistent MAYA tasks assigned to the authenticated team member. Returns only that person tasks and never exposes another employee inbox.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'all'],
        },
        period: {
          type: 'string',
          enum: ['today', 'overdue', 'all'],
        },
      },
    },
    allowedRoles: [...STAFF_ROLES, ...BUSINESS_ROLES],
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['notifications.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'tasks.create',
    description:
      'Assign one persistent operational task to the authenticated actor or an active CRM team member after confirmation. The recipient must already have an active MAYA account linked to the CRM team. The task is delivered to the in-app inbox and announced by push when available.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['task', 'assignee'],
      properties: {
        task: {
          type: 'string',
          minLength: 2,
          maxLength: 240,
          description:
            'Concise operational task without phone numbers or email addresses.',
        },
        assignee: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          description:
            'Public CRM team display name, or self/я/мне for the authenticated actor.',
        },
        due_date: {
          type: 'string',
          format: 'date',
          description: 'Optional local due date as YYYY-MM-DD.',
        },
      },
    },
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['notifications.core'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'tasks.complete',
    description:
      'Complete one persistent MAYA task assigned to the authenticated team member. The task must belong to the current tenant and caller; another employee task cannot be changed.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          description: 'Opaque task id returned by tasks.list.',
        },
      },
    },
    allowedRoles: [...STAFF_ROLES, ...BUSINESS_ROLES],
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['notifications.core'],
    riskTier: 'low_write',
    approvalPolicy: 'none',
    idempotency: 'required',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'notifications.appointments.read',
    description:
      'Read the tenant-wide transactional appointment reminder policy. Returns whether reminders are enabled, their lead times and the fixed MAYA inbox/push channel. No client data or credentials are returned.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['notifications.core'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'notifications.appointments.update',
    description:
      'Enable or disable tenant-wide transactional appointment reminders and choose up to four lead times from 30 minutes to 7 days. Delivery is limited to matching active MAYA customer accounts through the persistent in-app inbox and push; this never creates a marketing campaign.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
        lead_times_minutes: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: {
            type: 'integer',
            minimum: 30,
            maximum: 10080,
          },
          description:
            'Reminder offsets before the appointment in whole minutes, for example [1440, 120].',
        },
      },
    },
    allowedRoles: OWNER_AND_ADMIN_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['notifications.core'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 10_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'support.integration-status.read',
    description:
      'Read a safe CRM integration health summary for the current business: configured state, provider, calendar source, connection status, last check/sync and next action. Tokens, secrets, base URLs and raw errors are never returned.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['crm.integration'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'support.contact-admin.request',
    description:
      'Create a persistent in-app request for an active business owner or administrator after the customer confirms it. The request is idempotent and never exposes administrator contacts or the requester personal data to the model.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          minLength: 2,
          maxLength: 160,
          description:
            'Short reason without a phone number, email address or other contact details.',
        },
      },
    },
    allowedRoles: CLIENT_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['notifications.core'],
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    idempotency: 'required',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
] as const satisfies readonly AiToolDefinition[];

export type MayaAiToolName = (typeof MAYA_AI_TOOL_CATALOG)[number]['name'];
