import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { normalizeGoodsReceiptInput } from '../../action-engine/goods-receipt.contract';
import { GOODS_RECEIPT_CAPABILITY } from '../../crm/goods-receipt.contract';

/** GR-PC1 owner-approved 2026-10-07: a financial configuration subtype, never a payment authority. */
export const INVENTORY_RECEIPT_PURCHASE_COST =
  'inventory_receipt_purchase_cost' as const;

const EXACT_RISK_FACETS = Object.freeze([
  'ac2',
  'external',
  'one_target',
  'financial',
  'explicit_actor_approval',
]);

/**
 * Closed admission over the registered semantic contract. A matching key, input label or
 * `financial` facet alone cannot grant the approved exception. Any widened contract returns
 * to the ordinary MONEY veto until independently versioned. The owner still checks the
 * live tenant/OWNER, exact approval hash, source revision and one existing goods item/store/company at use.
 */
export const isInventoryReceiptPurchaseCost = (
  cap: RegisteredActionCapabilityV1,
): boolean =>
  cap.capability === GOODS_RECEIPT_CAPABILITY &&
  cap.capabilityVersion === 1 &&
  cap.actionClass === 'create_crm_goods_receipt' &&
  cap.targetKind === 'crm_goods_receipt' &&
  cap.normalizedInputContract === 'maya.crm-goods-receipt/1' &&
  cap.normalizeInput === normalizeGoodsReceiptInput &&
  cap.identityVersion === 1 &&
  cap.riskProfileVersion === 1 &&
  cap.riskFacets.length === EXACT_RISK_FACETS.length &&
  EXACT_RISK_FACETS.every((facet) => cap.riskFacets.includes(facet)) &&
  cap.allowedSourceTypes.length === 1 &&
  cap.allowedSourceTypes[0] === 'authenticated_request' &&
  cap.policyKey === 'production.crm-goods-receipt.confirmed-request' &&
  cap.policyVersion === 1 &&
  cap.policyDecision === 'ALLOW' &&
  cap.autonomyLevel === 'L2_CONFIRMED_REQUEST' &&
  cap.approvalRequirement === 'NONE' &&
  cap.approvalTtlMs === undefined &&
  cap.transportIdentityVersion === 1 &&
  cap.executorKey === 'crm.goods.receipt' &&
  cap.executorVersion === 1 &&
  cap.payloadRetentionMs === 30 * 86400000 &&
  cap.auditRetentionMs === 7 * 365 * 86400000 &&
  cap.retry.key === 'crm-goods-receipt.no-redispatch' &&
  cap.retry.version === 1 &&
  cap.retry.maxExecutionAttempts === 1 &&
  cap.retry.retryablePreDispatchErrors.size === 0 &&
  cap.retry.backoffMs.length === 0 &&
  cap.reconciliation.key === 'crm-goods-receipt.attributed-receipt-required' &&
  cap.reconciliation.version === 1 &&
  cap.reconciliation.maxInconclusiveAttempts === 1 &&
  cap.reconciliation.retryAfterProvenNonExecution === false;
