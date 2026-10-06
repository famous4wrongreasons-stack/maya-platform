import { ActionPolicyDecision } from '@prisma/client';
import { ActionContractError } from './action-engine.errors';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import {
  SERVICE_PRICE_CAPABILITY,
  priceMinor,
  ycId,
} from '../crm/yclients-service-price.contract';

export function normalizeServicePriceInput(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ActionContractError('Exact service price input required');
  const input = value as Record<string, unknown>;
  const keys = [
    'approval_id',
    'service_id',
    'company_id',
    'integration_revision',
    'current_revision',
    'current_price_rubles',
    'price_rubles',
    'service_name',
    'currency',
  ];
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new ActionContractError('Unexpected service price input');
  for (const key of ['integration_revision', 'current_revision'])
    if (typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key]))
      throw new ActionContractError('Exact service price revision required');
  if (
    typeof input.approval_id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.approval_id) ||
    typeof input.service_name !== 'string' ||
    !input.service_name.trim() ||
    input.service_name.length > 240 ||
    input.currency !== 'RUB'
  )
    throw new ActionContractError('Invalid service price approval');
  return {
    ...input,
    service_id: ycId(input.service_id),
    company_id: ycId(input.company_id),
    current_price_rubles: priceMinor(input.current_price_rubles) / 100,
    price_rubles: priceMinor(input.price_rubles) / 100,
  };
}

/** Local candidate registration YC-SP1; does not expand the internal A28 family. */
export const servicePriceCapability: RegisteredActionCapabilityV1 = {
  capability: SERVICE_PRICE_CAPABILITY,
  capabilityVersion: 1,
  actionClass: 'update_crm_service_fixed_price',
  normalizedInputContract: 'maya.crm-service-fixed-price/1',
  targetKind: 'crm_service',
  allowedSourceTypes: ['authenticated_request'],
  identityVersion: 1,
  riskProfileVersion: 1,
  riskFacets: [
    'ac2',
    'external',
    'one_target',
    'financial',
    'explicit_actor_approval',
  ],
  policyKey: 'production.crm-service-price.confirmed-request',
  policyVersion: 1,
  policyDecision: ActionPolicyDecision.ALLOW,
  autonomyLevel: 'L2_CONFIRMED_REQUEST',
  // Existing AiApprovalRequest is verified by the owner before ingress and dispatch.
  // No second approval UI or new Action Engine lifecycle is introduced.
  approvalRequirement: 'NONE',
  retry: {
    key: 'crm-service-price.no-redispatch',
    version: 1,
    maxExecutionAttempts: 1,
    retryablePreDispatchErrors: new Set<string>(),
    backoffMs: [],
  },
  reconciliation: {
    key: 'crm-service-price.unattributed-readback-hold',
    version: 1,
    maxInconclusiveAttempts: 1,
    retryAfterProvenNonExecution: false,
  },
  transportIdentityVersion: 1,
  executorKey: 'crm.service.fixed-price',
  executorVersion: 1,
  payloadRetentionMs: 7 * 86400000,
  auditRetentionMs: 365 * 86400000,
  normalizeInput: normalizeServicePriceInput,
};
