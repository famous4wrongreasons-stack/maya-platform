import { ActionPolicyDecision } from '@prisma/client';
import { ActionContractError } from './action-engine.errors';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';

const keys = [
  'approval_id',
  'goods_id',
  'store_id',
  'quantity',
  'unit_id',
  'unit_cost',
  'currency',
  'price_kind',
  'received_at',
  'photo_sha256',
  'source_line',
  'review_version',
  'company_id',
  'integration_revision',
  'current_revision',
  'goods_name',
  'store_name',
  'unit_label',
  'line_total',
];
export function normalizeGoodsReceiptInput(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ActionContractError('Exact goods receipt required');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new ActionContractError('Exact goods receipt fields required');
  for (const key of ['goods_id', 'store_id', 'unit_id', 'company_id'])
    if (typeof input[key] !== 'string' || !/^[1-9]\d{0,14}$/.test(input[key]))
      throw new ActionContractError('Exact goods target required');
  for (const key of ['quantity', 'unit_cost', 'line_total'])
    if (
      typeof input[key] !== 'string' ||
      !/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(input[key])
    )
      throw new ActionContractError('Exact goods decimal required');
  if (!/[1-9]/.test(input.quantity as string))
    throw new ActionContractError('Positive receipt quantity required');
  const amount = (s: string) => {
    const [w, f = ''] = s.split('.');
    return BigInt(w + f.padEnd(6, '0'));
  };
  if (
    amount(input.quantity as string) * amount(input.unit_cost as string) !==
    amount(input.line_total as string) * 1000000n
  )
    throw new ActionContractError('Exact goods line total required');
  for (const key of [
    'integration_revision',
    'current_revision',
    'photo_sha256',
  ])
    if (typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key]))
      throw new ActionContractError('Exact goods evidence required');
  for (const key of ['goods_name', 'store_name', 'unit_label'])
    if (
      typeof input[key] !== 'string' ||
      !input[key].trim() ||
      input[key].length > 512
    )
      throw new ActionContractError('Bounded goods source label required');
  if (
    typeof input.approval_id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.approval_id) ||
    input.price_kind !== 'receipt_purchase_unit' ||
    typeof input.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !Number.isSafeInteger(input.source_line) ||
    Number(input.source_line) < 1 ||
    Number(input.source_line) > 20 ||
    !Number.isSafeInteger(input.review_version) ||
    Number(input.review_version) < 1 ||
    Number(input.review_version) > 20 ||
    typeof input.received_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      input.received_at,
    ) ||
    !Number.isFinite(Date.parse(input.received_at)) ||
    new Date(input.received_at.slice(0, 10) + 'T00:00:00Z')
      .toISOString()
      .slice(0, 10) !== input.received_at.slice(0, 10)
  )
    throw new ActionContractError('Exact goods approval required');
  return { ...input };
}

/** Finite external inventory candidate. Preserves financial classification and
 * existing inventory retention values; creates no widget admission or purge permission. */
export const goodsReceiptCapability: RegisteredActionCapabilityV1 = {
  capability: 'crm.goods.receipt.create.v1',
  capabilityVersion: 1,
  actionClass: 'create_crm_goods_receipt',
  normalizedInputContract: 'maya.crm-goods-receipt/1',
  targetKind: 'crm_goods_receipt',
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
  policyKey: 'production.crm-goods-receipt.confirmed-request',
  policyVersion: 1,
  policyDecision: ActionPolicyDecision.ALLOW,
  autonomyLevel: 'L2_CONFIRMED_REQUEST',
  approvalRequirement: 'NONE',
  retry: {
    key: 'crm-goods-receipt.no-redispatch',
    version: 1,
    maxExecutionAttempts: 1,
    retryablePreDispatchErrors: new Set<string>(),
    backoffMs: [],
  },
  reconciliation: {
    key: 'crm-goods-receipt.attributed-receipt-required',
    version: 1,
    maxInconclusiveAttempts: 1,
    retryAfterProvenNonExecution: false,
  },
  transportIdentityVersion: 1,
  executorKey: 'crm.goods.receipt',
  executorVersion: 1,
  // Existing A27 EXECUTE inventory profile. AiApproval/R10 compatibility rows
  // keep their existing audit owner; this is not a new erasure contract.
  payloadRetentionMs: 30 * 86400000,
  auditRetentionMs: 7 * 365 * 86400000,
  normalizeInput: normalizeGoodsReceiptInput,
};
