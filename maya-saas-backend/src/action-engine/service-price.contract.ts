import { ActionPolicyDecision } from '@prisma/client';
import { ActionContractError } from './action-engine.errors';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
export const SERVICE_PRICE_CAPABILITY = 'crm.service.fixed-price.update.v1';

// AE validates its closed normalized input independently of the CRM/provider owner.
function serviceId(value: unknown): string {
  const id = String(value);
  if (!/^[1-9]\d{0,14}$/.test(id))
    throw new ActionContractError('Invalid service price target ID');
  return id;
}
function exactRubles(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new ActionContractError('Invalid service price amount');
  const text = String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text))
    throw new ActionContractError('Invalid service price amount');
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > 100_000_000_000)
    throw new ActionContractError('Invalid service price amount');
  return minor / 100;
}

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
    service_id: serviceId(input.service_id),
    company_id: serviceId(input.company_id),
    current_price_rubles: exactRubles(input.current_price_rubles),
    price_rubles: exactRubles(input.price_rubles),
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
