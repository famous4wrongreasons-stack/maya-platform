import { ActionPolicyDecision } from '@prisma/client';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';

export const CLIENT_PREFERENCE_CAPABILITIES = Object.freeze({
  visit_mood: 'package5.client-preferences.visit-mood.execute.v1',
  notifications: 'package5.client-preferences.notifications.execute.v1',
});
export type ClientPreferenceOperation =
  keyof typeof CLIENT_PREFERENCE_CAPABILITIES;
export type ClientNotificationOverrides = Record<
  string,
  boolean | number | string | null
>;
export const CLIENT_PREFERENCE_KINDS = Object.freeze({
  visit_mood: 'client_visit_preference',
  notifications: 'client_notification_preferences',
});
const BOOL_KEYS = [
  'record_changes',
  'reminder',
  'marketing',
  'cycle',
  'birthday',
  'freed_slot',
];
export function preferenceObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ActionContractError('Preference object required');
  return value as Record<string, unknown>;
}
export function exactPreferenceKeys(
  value: Record<string, unknown>,
  keys: string[],
) {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
    throw new ActionContractError('Unexpected or missing preference fields');
}
export function notificationOverrides(
  value: unknown,
): ClientNotificationOverrides {
  const input = preferenceObject(value);
  for (const [key, v] of Object.entries(input)) {
    if (BOOL_KEYS.includes(key)) {
      if (typeof v !== 'boolean')
        throw new ActionContractError('Explicit boolean required');
    } else if (key === 'reminder_hours') {
      if (!Number.isInteger(v) || Number(v) < 1 || Number(v) > 48)
        throw new ActionContractError(
          'reminder_hours must be an integer from 1 to 48',
        );
    } else if (key === 'marketing_freq') {
      if (!['week', '2weeks', 'month'].includes(String(v)))
        throw new ActionContractError('Unsupported marketing frequency');
    } else if (key === 'quiet_from' || key === 'quiet_to') {
      if (
        v !== null &&
        (!Number.isInteger(v) || Number(v) < 0 || Number(v) > 23)
      )
        throw new ActionContractError(
          'Quiet hour must be null or integer from 0 to 23',
        );
    } else throw new ActionContractError('Notification key is not allowlisted');
  }
  if ('quiet_from' in input || 'quiet_to' in input) {
    if (
      !('quiet_from' in input && 'quiet_to' in input) ||
      (input.quiet_from === null) !== (input.quiet_to === null)
    )
      throw new ActionContractError(
        'Quiet hours require a complete consistent pair',
      );
  }
  return { ...input } as ClientNotificationOverrides;
}

export function verifiedClientChannelCapability(capability: string) {
  return (
    capability === 'package5.client-habits.add.execute.v1' ||
    capability === 'package5.client-wanted-slot.add.execute.v1' ||
    /^package5\.wave3\.record-client-consent\.(?:execute|shadow)\.v1$/.test(
      capability,
    ) ||
    Object.values(CLIENT_PREFERENCE_CAPABILITIES).some(
      (value) => value === capability,
    )
  );
}

function normalize(operation: ClientPreferenceOperation, value: unknown) {
  const input = preferenceObject(value);
  exactPreferenceKeys(input, [
    'operation',
    'targetKind',
    'targetRef',
    'targetGeneration',
    'beforeStateHash',
    'afterStateHash',
    'requestMaterialHash',
    'consentChannel',
    'desired',
  ]);
  if (
    input.operation !== operation ||
    input.targetKind !== CLIENT_PREFERENCE_KINDS[operation] ||
    typeof input.targetRef !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,240}$/.test(input.targetRef) ||
    !Number.isSafeInteger(input.targetGeneration) ||
    Number(input.targetGeneration) < 0
  )
    throw new ActionContractError('Invalid canonical preference target');
  for (const key of [
    'beforeStateHash',
    'afterStateHash',
    'requestMaterialHash',
  ])
    if (typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key]))
      throw new ActionContractError('Preference evidence hash required');
  const binding = preferenceObject(input.consentChannel);
  exactPreferenceKeys(binding, [
    'linkId',
    'provider',
    'providerSubjectHash',
    'verificationEvidenceHash',
  ]);
  if (
    typeof binding.linkId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,240}$/.test(binding.linkId) ||
    !['telegram', 'maya_user'].includes(String(binding.provider)) ||
    !/^[a-f0-9]{64}$/.test(String(binding.providerSubjectHash)) ||
    !/^[a-f0-9]{64}$/.test(String(binding.verificationEvidenceHash))
  )
    throw new ActionContractError('Exact verified Client binding required');
  const desired = preferenceObject(input.desired);
  if (operation === 'visit_mood') {
    exactPreferenceKeys(desired, ['appointmentId', 'mood']);
    if (
      typeof desired.appointmentId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,240}$/.test(desired.appointmentId) ||
      !['red', 'blue'].includes(String(desired.mood))
    )
      throw new ActionContractError('Exact appointment mood required');
  } else notificationOverrides(desired);
  return { ...input, consentChannel: { ...binding }, desired: { ...desired } };
}

export function clientPreferenceCapabilities(): RegisteredActionCapabilityV1[] {
  return (
    Object.keys(CLIENT_PREFERENCE_CAPABILITIES) as ClientPreferenceOperation[]
  ).map((operation) => ({
    capability: CLIENT_PREFERENCE_CAPABILITIES[operation],
    capabilityVersion: 1,
    actionClass:
      operation === 'visit_mood'
        ? 'update_client_visit_mood'
        : 'update_client_notification_preferences',
    normalizedInputContract: 'maya.client-preferences-input/1',
    targetKind: CLIENT_PREFERENCE_KINDS[operation],
    allowedSourceTypes: ['authenticated_request'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'a18',
      'ac1',
      'client_owned',
      'local_atomic',
      'verified_client_channel',
    ],
    policyKey: `chapter6.package5.client-preferences.${operation}`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'client-preferences.local-transaction',
      version: 1,
      maxExecutionAttempts: 3,
      retryablePreDispatchErrors: new Set(['local_serialization']),
      backoffMs: [0, 25, 100],
    },
    reconciliation: {
      key: 'client-preferences.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'package5.client-preferences.local',
    executorVersion: 1,
    payloadRetentionMs: 30 * 86400000,
    auditRetentionMs: 7 * 365 * 86400000,
    normalizeInput: (value) => normalize(operation, value),
  }));
}
