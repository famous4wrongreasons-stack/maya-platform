import { UserRole } from '../common/domain.enums';
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
        'last_month',
        'custom',
      ],
      description:
        'Server-resolved reporting period. Use custom only when the person supplied explicit dates.',
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
    name: 'catalog.staff.read',
    description:
      'Read privacy-safe staff labels, titles and specializations for booking.',
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
    name: 'appointments.own.list',
    description: 'Read the authenticated customer appointment history.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
    allowedRoles: CLIENT_ROLES,
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
    allowedRoles: CLIENT_ROLES,
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
    name: 'analytics.employee.read',
    description:
      'Read operational analytics scoped to the current employee. Relative reporting periods are resolved by the server in the tenant timezone.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: STAFF_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.employee'],
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
      'Universal personal performance analytics for the current employee. Returns appointments, cancellations, unique clients, client cohorts, booked service value, average booked value, booked minutes, service demand and optional comparison. clients_returning counts this employee clients of the period who already visited within cohort_lookback_days BEFORE the period started, and clients_new counts those who did not: these are returning-within-N-days cohorts, not loyal clients overall, while repeat_clients_in_period only counts clients who came more than once INSIDE the period. This never exposes another employee data and booked value is not cash revenue.',
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
    name: 'analytics.business.read',
    description:
      'Read tenant or branch operational analytics. Relative reporting periods are resolved by the server in the tenant timezone.',
    inputSchema: REPORTING_PERIOD_SCHEMA,
    allowedRoles: BUSINESS_ROLES,
    allowedSurfaces: ALL_SURFACES,
    requiredFeatures: ['analytics.business'],
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
    timeoutMs: 8_000,
    retryPolicy: 'none',
    fallbackPolicy: 'fail_closed',
  },
  {
    name: 'analytics.business.query',
    description:
      'Universal verified business analytics for an owner or manager. Returns revenue and financial operations, appointments, cancellations, unique clients, client cohorts, average ticket, booked minutes, daily dynamics, service demand, a per-master breakdown with cancellations and repeat clients, and optional comparison with the previous equal period or previous year. clients_returning counts clients of the period who already visited within cohort_lookback_days BEFORE the period started, and clients_new counts those who did not: these are returning-within-N-days cohorts, not loyal or regular clients of the salon overall. repeat_clients_in_period is a different and much narrower thing: clients who came more than once INSIDE the period, which is near zero on a short period by nature and must never be presented as retention. Use this for any factual business-performance question that is not a personal employee question.',
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
    name: 'analytics.business.compare_years',
    description:
      'Compare verified business revenue, positive financial operations and unique clients from non-cancelled appointments for the current year to date with the same elapsed period of the previous year. Dates and percentage deltas are calculated by the server in the tenant timezone.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
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
    name: 'expenses.read',
    description:
      'Read tenant expenses without decrypted free-text notes. Relative reporting periods are resolved by the server in the tenant timezone.',
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
    name: 'customers.count',
    description: 'Read a tenant customer count without customer PII.',
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
    name: 'appointments.own.preview',
    description:
      'Validate one authenticated customer booking without creating it.',
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
    riskTier: 'read',
    approvalPolicy: 'none',
    idempotency: 'none',
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
] as const satisfies readonly AiToolDefinition[];

export type MayaAiToolName = (typeof MAYA_AI_TOOL_CATALOG)[number]['name'];
