import { ActionPolicyDecision } from '@prisma/client';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import {
  STAFF_CREATE_CAPABILITY,
  staffCreatePrepared,
} from '../crm/yclients-staff-create.contract';

export function normalizeStaffCreateInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ActionContractError('Exact staff proposal required');
  const { approval_id, ...proposal } = value as Record<string, unknown>;
  if (
    typeof approval_id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(approval_id)
  )
    throw new ActionContractError('Exact staff approval required');
  return { ...staffCreatePrepared(proposal), approval_id };
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
