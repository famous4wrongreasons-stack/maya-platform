import { ActionPolicyDecision } from '@prisma/client';

import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import {
  exactPreferenceKeys,
  preferenceObject,
} from './client-preferences.contract';

export const CLIENT_WANTED_SLOT_CAPABILITIES = Object.freeze({
  add: 'package5.client-wanted-slot.add.execute.v1',
  match: 'package5.client-wanted-slot.match.execute.v1',
});
export const CLIENT_WANTED_SLOT_KIND = 'client_wanted_slot';
const HASH = /^[a-f0-9]{64}$/;
const REF = /^[A-Za-z0-9._:-]{1,240}$/;

function hashes(input: Record<string, unknown>) {
  for (const key of [
    'beforeStateHash',
    'afterStateHash',
    'requestMaterialHash',
  ])
    if (typeof input[key] !== 'string' || !HASH.test(input[key]))
      throw new ActionContractError('Wanted-slot evidence hash required');
}

function addInput(value: unknown) {
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
    input.operation !== 'add_client_wanted_slot' ||
    input.targetKind !== CLIENT_WANTED_SLOT_KIND ||
    typeof input.targetRef !== 'string' ||
    !REF.test(input.targetRef) ||
    !Number.isSafeInteger(input.targetGeneration) ||
    Number(input.targetGeneration) < 0
  )
    throw new ActionContractError('Invalid wanted-slot Client target');
  hashes(input);
  const binding = preferenceObject(input.consentChannel);
  exactPreferenceKeys(binding, [
    'linkId',
    'provider',
    'providerSubjectHash',
    'verificationEvidenceHash',
  ]);
  if (
    typeof binding.linkId !== 'string' ||
    !REF.test(binding.linkId) ||
    !['telegram', 'maya_user'].includes(String(binding.provider)) ||
    !HASH.test(String(binding.providerSubjectHash)) ||
    !HASH.test(String(binding.verificationEvidenceHash))
  )
    throw new ActionContractError('Exact verified Client binding required');
  const desired = preferenceObject(input.desired);
  exactPreferenceKeys(desired, [
    'branchId',
    'clientId',
    'desiredStartAt',
    'staffId',
  ]);
  if (
    desired.clientId !== input.targetRef ||
    typeof desired.branchId !== 'string' ||
    !REF.test(desired.branchId) ||
    typeof desired.staffId !== 'string' ||
    !REF.test(desired.staffId) ||
    typeof desired.desiredStartAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(desired.desiredStartAt)
  )
    throw new ActionContractError('Exact canonical wanted slot required');
  return { ...input, consentChannel: { ...binding }, desired: { ...desired } };
}

function matchInput(value: unknown) {
  const input = preferenceObject(value);
  exactPreferenceKeys(input, [
    'operation',
    'targetKind',
    'targetRef',
    'targetGeneration',
    'beforeStateHash',
    'afterStateHash',
    'requestMaterialHash',
    'desired',
  ]);
  if (
    input.operation !== 'match_client_wanted_slot' ||
    input.targetKind !== CLIENT_WANTED_SLOT_KIND ||
    typeof input.targetRef !== 'string' ||
    !REF.test(input.targetRef) ||
    input.targetGeneration !== 0
  )
    throw new ActionContractError('Invalid wanted-slot match target');
  hashes(input);
  const desired = preferenceObject(input.desired);
  exactPreferenceKeys(desired, ['matchedSourceEventId']);
  if (
    typeof desired.matchedSourceEventId !== 'string' ||
    !REF.test(desired.matchedSourceEventId)
  )
    throw new ActionContractError('Exact availability source fact required');
  return { ...input, desired: { ...desired } };
}

function capability(operation: 'add' | 'match'): RegisteredActionCapabilityV1 {
  const client = operation === 'add';
  return {
    capability: CLIENT_WANTED_SLOT_CAPABILITIES[operation],
    capabilityVersion: 1,
    actionClass: `${operation}_client_wanted_slot`,
    normalizedInputContract: 'maya.client-wanted-slot-input/1',
    targetKind: CLIENT_WANTED_SLOT_KIND,
    allowedSourceTypes: [client ? 'authenticated_request' : 'webhook'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: [
      'a18',
      client ? 'ac1' : 'ac5',
      'client_owned',
      'local_atomic',
      ...(client ? ['verified_client_channel'] : ['verified_provider_event']),
    ],
    policyKey: `chapter6.package5.client-wanted-slot.${operation}`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'client-wanted-slot.local-transaction',
      version: 1,
      maxExecutionAttempts: 3,
      retryablePreDispatchErrors: new Set(['local_serialization']),
      backoffMs: [0, 25, 100],
    },
    reconciliation: {
      key: 'client-wanted-slot.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: `package5.client-wanted-slot.${operation}.local`,
    executorVersion: 1,
    payloadRetentionMs: 30 * 86400000,
    auditRetentionMs: 7 * 365 * 86400000,
    normalizeInput: client ? addInput : matchInput,
  };
}

export function clientWantedSlotCapabilities() {
  return [capability('add'), capability('match')];
}
