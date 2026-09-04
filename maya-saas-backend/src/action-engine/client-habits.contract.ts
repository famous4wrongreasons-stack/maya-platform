import { ActionPolicyDecision } from '@prisma/client';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import { serializeClientHabits } from './client-habits.policy';
import {
  exactPreferenceKeys,
  preferenceObject,
} from './client-preferences.contract';
export const CLIENT_HABITS_CAPABILITY = 'package5.client-habits.add.execute.v1';
export const CLIENT_HABITS_KIND = 'client_habits';

function normalize(value: unknown) {
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
    input.operation !== 'add_client_habit' ||
    input.targetKind !== CLIENT_HABITS_KIND ||
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
  exactPreferenceKeys(desired, ['preferences']);
  if (
    !Array.isArray(desired.preferences) ||
    !desired.preferences.length ||
    desired.preferences.some((x) => typeof x !== 'string')
  )
    throw new ActionContractError('Exact canonical habits required');
  serializeClientHabits(desired.preferences as string[]);
  return { ...input, consentChannel: { ...binding }, desired: { ...desired } };
}

export function clientHabitsCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CLIENT_HABITS_CAPABILITY,
    capabilityVersion: 1,
    actionClass: 'add_client_habit',
    normalizedInputContract: 'maya.client-habits-input/1',
    targetKind: CLIENT_HABITS_KIND,
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
    policyKey: 'chapter6.package5.client-habits.add',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'client-habits.local-transaction',
      version: 1,
      maxExecutionAttempts: 3,
      retryablePreDispatchErrors: new Set(['local_serialization']),
      backoffMs: [0, 25, 100],
    },
    reconciliation: {
      key: 'client-habits.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'package5.client-habits.local',
    executorVersion: 1,
    payloadRetentionMs: 30 * 86400000,
    auditRetentionMs: 7 * 365 * 86400000,
    normalizeInput: normalize,
  };
}
