import { ActionPolicyDecision } from '@prisma/client';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
export const STAFF_CREATE_CAPABILITY = 'crm.staff.quick-create.v1';
export const STAFF_CREATE_ORIGIN = 'YC-ST1-CHAT-1';

// Like service-price, AE independently validates its closed normalized input.
// The generic engine does not import a provider owner or a CRM exception type.
export function normalizeStaffCreateInput(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ActionContractError('Exact staff proposal required');
  const input = value as Record<string, unknown>;
  const keys = [
    'name',
    'specialization',
    'company_id',
    'integration_revision',
    'permission_revision',
    'origin',
    'approval_id',
  ];
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new ActionContractError('Unexpected staff proposal field');
  for (const key of ['name', 'specialization']) {
    const label = input[key];
    if (
      typeof label !== 'string' ||
      !label ||
      label !== label.trim() ||
      label.length > 240 ||
      /[\p{Cc}\p{Cf}]/u.test(label)
    )
      throw new ActionContractError('Exact bounded staff label required');
  }
  for (const key of ['integration_revision', 'permission_revision'])
    if (typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key]))
      throw new ActionContractError('Exact staff source revision required');
  if (
    (typeof input.company_id !== 'number' &&
      typeof input.company_id !== 'string') ||
    !/^[1-9]\d{0,14}$/.test(String(input.company_id))
  )
    throw new ActionContractError('Exact staff company required');
  if (
    input.origin !== STAFF_CREATE_ORIGIN ||
    typeof input.approval_id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.approval_id)
  )
    throw new ActionContractError('Exact staff approval required');
  return { ...input, company_id: String(input.company_id) };
}
export const staffCreateCapability: RegisteredActionCapabilityV1 = {
  capability: STAFF_CREATE_CAPABILITY,
  capabilityVersion: 1,
  actionClass: 'create_crm_staff_without_account',
  normalizedInputContract: 'maya.crm-staff-quick-create/1',
  targetKind: 'crm_staff_proposal',
  allowedSourceTypes: ['authenticated_request'],
  identityVersion: 1,
  riskProfileVersion: 1,
  riskFacets: [
    'ac2',
    'external',
    'one_target',
    'explicit_actor_approval',
    'no_account_binding',
  ],
  policyKey: 'production.crm-staff-create.confirmed-request',
  policyVersion: 1,
  policyDecision: ActionPolicyDecision.ALLOW,
  autonomyLevel: 'L3_OWNER_APPROVED',
  approvalRequirement: 'REQUIRED',
  approvalTtlMs: 10 * 60 * 1000,
  retry: {
    key: 'crm-staff-create.no-redispatch',
    version: 1,
    maxExecutionAttempts: 1,
    retryablePreDispatchErrors: new Set<string>(),
    backoffMs: [],
  },
  reconciliation: {
    key: 'crm-staff-create.no-attributable-readback',
    version: 1,
    maxInconclusiveAttempts: 1,
    retryAfterProvenNonExecution: false,
  },
  transportIdentityVersion: 1,
  executorKey: 'crm.staff.quick-create',
  executorVersion: 1,
  payloadRetentionMs: 7 * 86400000,
  auditRetentionMs: 365 * 86400000,
  normalizeInput: normalizeStaffCreateInput,
};
