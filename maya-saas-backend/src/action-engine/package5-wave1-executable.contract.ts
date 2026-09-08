import { validateGovernedNormalizedInput } from '../package5-wave1/governed-settings.contract';
import { ActionContractError } from './action-engine.errors';

export const PACKAGE5_WAVE1_INPUT_CONTRACT =
  'maya.package5-wave1-local-command-input/1' as const;

export const PACKAGE5_WAVE1_POLICY_VERSION =
  'package5.wave1.local-command-policy.v1' as const;

export type Package5Wave1ActionClass =
  | 'update_tenant_business_configuration'
  | 'update_staff_notification_preferences'
  | 'update_assistant_preferences'
  | 'update_finance_dashboard_preferences'
  | 'update_appointment_notification_settings'
  | 'create_operational_task'
  | 'complete_operational_task'
  | 'request_administrator_contact';

export type Package5Wave1Operation =
  | 'tenant_business_configuration'
  | 'staff_notification_preferences'
  | 'assistant_preferences'
  | 'finance_preferences'
  | 'appointment_notifications'
  | 'create_task'
  | 'complete_task'
  | 'request_admin_contact';

export interface Package5Wave1Registration {
  operation: Package5Wave1Operation;
  actionClass: Package5Wave1ActionClass;
  targetKind: 'setting' | 'operational_work_item';
  shadowCapability: string;
  executableCapability: string;
  allowedSourceTypes: readonly (
    'authenticated_request' | 'legacy_bridge' | 'synthetic_shadow'
  )[];
}

export const PACKAGE5_WAVE1_REGISTRATIONS = Object.freeze([
  { operation: 'tenant_business_configuration', actionClass: 'update_tenant_business_configuration', targetKind: 'setting', shadowCapability: 'package5.settings.tenant-business.shadow.v1', executableCapability: 'package5.settings.tenant-business.execute.v1', allowedSourceTypes: ['authenticated_request'] },
  { operation: 'staff_notification_preferences', actionClass: 'update_staff_notification_preferences', targetKind: 'setting', shadowCapability: 'package5.settings.staff-notifications.shadow.v1', executableCapability: 'package5.settings.staff-notifications.execute.v1', allowedSourceTypes: ['authenticated_request'] },
  {
    operation: 'assistant_preferences',
    actionClass: 'update_assistant_preferences',
    targetKind: 'setting',
    shadowCapability: 'package5.settings.assistant.shadow.v1',
    executableCapability: 'package5.settings.assistant.execute.v1',
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
  },
  {
    operation: 'finance_preferences',
    actionClass: 'update_finance_dashboard_preferences',
    targetKind: 'setting',
    shadowCapability: 'package5.settings.finance.shadow.v1',
    executableCapability: 'package5.settings.finance.execute.v1',
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
  },
  {
    operation: 'appointment_notifications',
    actionClass: 'update_appointment_notification_settings',
    targetKind: 'setting',
    shadowCapability: 'package5.settings.appointment-notifications.shadow.v1',
    executableCapability:
      'package5.settings.appointment-notifications.execute.v1',
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
  },
  {
    operation: 'create_task',
    actionClass: 'create_operational_task',
    targetKind: 'operational_work_item',
    shadowCapability: 'package5.work-item.task-create.shadow.v1',
    executableCapability: 'package5.work-item.task-create.execute.v1',
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
  },
  {
    operation: 'complete_task',
    actionClass: 'complete_operational_task',
    targetKind: 'operational_work_item',
    shadowCapability: 'package5.work-item.task-complete.shadow.v1',
    executableCapability: 'package5.work-item.task-complete.execute.v1',
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
  },
  {
    operation: 'request_admin_contact',
    actionClass: 'request_administrator_contact',
    targetKind: 'operational_work_item',
    shadowCapability: 'package5.work-item.admin-contact.shadow.v1',
    executableCapability: 'package5.work-item.admin-contact.execute.v1',
    allowedSourceTypes: [
      'authenticated_request',
      'legacy_bridge',
      'synthetic_shadow',
    ],
  },
] satisfies readonly Package5Wave1Registration[]);

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const HASH = /^[0-9a-f]{64}$/;
const ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
  'accountant',
  'provider',
  'employee',
  'staff',
  'client',
  'customer',
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Package 5 Wave 1 input must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(source: Record<string, unknown>) {
  const allowed = new Set([
    'operation',
    'targetKind',
    'targetRef',
    'mutationKey',
    'targetGeneration',
    'beforeStateHash',
    'afterStateHash',
    'noOp',
    'actorMembershipId',
    'actorRole',
    'policyVersion',
    'policySnapshotHash',
    'approvalRequirement',
    'oneTargetCount',
    'bulkMutation',
    'intendedMutation',
    'mutationPerformed',
    'configJson',
    'semanticCommand',
    'callerId',
    'workItemId',
    'workItemKind',
    'assigneeUserId',
    'createdByUserId',
    'title',
    'bodyText',
    'dueAt',
    'expectedStatus',
    'deliveryProjectionRequired',
  ]);
  const extras = Object.keys(source).filter((key) => !allowed.has(key));
  if (extras.length) {
    throw new ActionContractError(
      `Unexpected Wave 1 input: ${extras.join(', ')}`,
    );
  }
}

function text(source: Record<string, unknown>, key: string, max = 240) {
  const value = source[key];
  if (typeof value !== 'string')
    throw new ActionContractError(`${key} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ActionContractError(`${key} has an invalid length`);
  }
  return normalized;
}

function opaque(source: Record<string, unknown>, key: string) {
  const value = text(source, key);
  if (!OPAQUE.test(value))
    throw new ActionContractError(`${key} must be opaque`);
  return value;
}

function hash(source: Record<string, unknown>, key: string, nullable = false) {
  const value = source[key];
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new ActionContractError(`${key} must be a SHA-256 hex digest`);
  }
  return value;
}

function nullableText(
  source: Record<string, unknown>,
  key: string,
  max: number,
) {
  const value = source[key];
  if (value === null) return null;
  return text(source, key, max);
}

function jsonObject(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError(`${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function normalizePackage5Wave1Input(
  operation: Package5Wave1Operation,
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  exactKeys(source);
  const registration = PACKAGE5_WAVE1_REGISTRATIONS.find(
    (candidate) => candidate.operation === operation,
  );
  if (!registration || source.operation !== operation) {
    throw new ActionContractError('Wave 1 operation is not canonical');
  }
  if (
    source.targetKind !== registration.targetKind ||
    source.policyVersion !== PACKAGE5_WAVE1_POLICY_VERSION ||
    source.approvalRequirement !== 'SERVER_DERIVED_AUTHORITY' ||
    source.oneTargetCount !== 1 ||
    source.bulkMutation !== false ||
    source.mutationPerformed !== false
  ) {
    throw new ActionContractError(
      'Wave 1 authority or mutation boundary is invalid',
    );
  }
  const generation = source.targetGeneration;
  if (!Number.isSafeInteger(generation) || (generation as number) < 0) {
    throw new ActionContractError('targetGeneration must be non-negative');
  }
  const role = opaque(source, 'actorRole');
  if (!ROLES.has(role))
    throw new ActionContractError('actorRole is not allowlisted');
  const common = {
    operation,
    targetKind: registration.targetKind,
    targetRef: opaque(source, 'targetRef'),
    mutationKey: opaque(source, 'mutationKey'),
    targetGeneration: generation as number,
    beforeStateHash: hash(source, 'beforeStateHash', true),
    afterStateHash: hash(source, 'afterStateHash'),
    noOp: source.noOp === true,
    actorMembershipId: opaque(source, 'actorMembershipId'),
    actorRole: role,
    policyVersion: PACKAGE5_WAVE1_POLICY_VERSION,
    policySnapshotHash: hash(source, 'policySnapshotHash'),
    approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    intendedMutation: opaque(source, 'intendedMutation'),
    mutationPerformed: false,
  };

  if (registration.targetKind === 'setting') {
    const configJson = jsonObject(source, 'configJson');
    if (
      source.workItemId !== null ||
      source.workItemKind !== null ||
      source.assigneeUserId !== null ||
      source.createdByUserId !== null ||
      source.title !== null ||
      source.bodyText !== null ||
      source.dueAt !== null ||
      source.expectedStatus !== null ||
      source.deliveryProjectionRequired !== false
    ) {
      throw new ActionContractError(
        'Setting input contains work-item authority',
      );
    }
    const governed = operation === 'tenant_business_configuration' || operation === 'staff_notification_preferences';
    if (governed) validateGovernedNormalizedInput(operation, source);
    else if ('semanticCommand' in source || 'callerId' in source) throw new ActionContractError('Governed command in unrelated settings action');
    return {
      ...common,
      ...(governed ? {semanticCommand: source.semanticCommand, callerId: source.callerId} : {}),
      configJson,
      workItemId: null,
      workItemKind: null,
      assigneeUserId: null,
      createdByUserId: null,
      title: null,
      bodyText: null,
      dueAt: null,
      expectedStatus: null,
      deliveryProjectionRequired: false,
    };
  }

  const workItemId = opaque(source, 'workItemId');
  const workItemKind = opaque(source, 'workItemKind');
  if (!['task', 'support_request'].includes(workItemKind)) {
    throw new ActionContractError('workItemKind is not allowlisted');
  }
  const dueAtRaw = source.dueAt;
  if (dueAtRaw !== null) {
    const dueAt = new Date(text(source, 'dueAt', 40));
    if (Number.isNaN(dueAt.getTime()) || dueAt.toISOString() !== dueAtRaw) {
      throw new ActionContractError('dueAt must be an exact canonical instant');
    }
  }
  if (
    source.deliveryProjectionRequired !== true ||
    source.configJson !== null
  ) {
    throw new ActionContractError('Work item projection boundary is invalid');
  }
  return {
    ...common,
    configJson: null,
    workItemId,
    workItemKind,
    assigneeUserId: opaque(source, 'assigneeUserId'),
    createdByUserId: opaque(source, 'createdByUserId'),
    title: text(source, 'title', 160),
    bodyText: text(source, 'bodyText', 4000),
    dueAt: nullableText(source, 'dueAt', 40),
    expectedStatus: nullableText(source, 'expectedStatus', 20),
    deliveryProjectionRequired: true,
  };
}
