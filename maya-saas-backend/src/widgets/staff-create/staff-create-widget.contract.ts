import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { normalizeStaffCreateInput } from '../../action-engine/staff-create.contract';
import { STAFF_CREATE_CAPABILITY } from '../../crm/yclients-staff-create.contract';

/** YC-ST1-CHAT-1: exact settings subtype; no account/tenant authority. */
const EXACT_RISK_FACETS = Object.freeze([
  'ac2',
  'external',
  'one_target',
  'no_account_binding',
  'explicit_actor_approval',
]);

export const isStaffQuickCreate = (
  cap: RegisteredActionCapabilityV1,
): boolean =>
  cap.capability === STAFF_CREATE_CAPABILITY &&
  cap.capabilityVersion === 1 &&
  cap.actionClass === 'create_crm_staff_without_account' &&
  cap.targetKind === 'crm_staff_proposal' &&
  cap.normalizedInputContract === 'maya.crm-staff-quick-create/1' &&
  cap.normalizeInput === normalizeStaffCreateInput &&
  cap.identityVersion === 1 &&
  cap.riskProfileVersion === 1 &&
  cap.riskFacets.length === EXACT_RISK_FACETS.length &&
  EXACT_RISK_FACETS.every((facet) => cap.riskFacets.includes(facet)) &&
  cap.allowedSourceTypes.length === 1 &&
  cap.allowedSourceTypes[0] === 'authenticated_request' &&
  cap.policyKey === 'production.crm-staff-create.confirmed-request' &&
  cap.policyVersion === 1 &&
  cap.policyDecision === 'ALLOW' &&
  cap.autonomyLevel === 'L3_OWNER_APPROVED' &&
  cap.approvalRequirement === 'REQUIRED' &&
  cap.approvalTtlMs === 600000 &&
  cap.transportIdentityVersion === 1 &&
  cap.executorKey === 'crm.staff.quick-create' &&
  cap.executorVersion === 1 &&
  cap.retry.key === 'crm-staff-create.no-redispatch' &&
  cap.retry.version === 1 &&
  cap.retry.maxExecutionAttempts === 1 &&
  cap.retry.retryablePreDispatchErrors.size === 0 &&
  cap.retry.backoffMs.length === 0 &&
  cap.reconciliation.key === 'crm-staff-create.no-attributable-readback' &&
  cap.reconciliation.version === 1 &&
  cap.reconciliation.maxInconclusiveAttempts === 1 &&
  cap.reconciliation.retryAfterProvenNonExecution === false;
