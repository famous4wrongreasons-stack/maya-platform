import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { goodsReceiptCapability } from '../../action-engine/goods-receipt.contract';
import { GOODS_RECEIPT_CAPABILITY } from '../../crm/goods-receipt.contract';
import {
  MONEY,
  deriveAeFamily,
} from '../authority/ae-commit-allowlist.runtime';
import {
  AE_FAMILY_FLOOR,
  aeFloor,
} from '../authority/verification-floor.runtime';
import { isInventoryReceiptPurchaseCost } from './goods-receipt-widget.contract';

describe('GR-PC1 exact financial configuration descriptor', () => {
  it('admits only the registered single-line receipt capability while retaining MONEY', () => {
    const capabilities = new ActionCapabilityRegistry().list();
    expect(
      capabilities
        .filter(isInventoryReceiptPurchaseCost)
        .map((c) => c.capability),
    ).toEqual([GOODS_RECEIPT_CAPABILITY]);
    expect(MONEY(goodsReceiptCapability)).toBe(true);
    expect(deriveAeFamily(goodsReceiptCapability)).toBe(
      'inventory_receipt_purchase_cost',
    );
    expect(AE_FAMILY_FLOOR.inventory_receipt_purchase_cost).toBe(
      'SESSION_VERIFIED',
    );
    expect(AE_FAMILY_FLOOR.money).toBe('STEP_UP_VERIFIED');
    expect(AE_FAMILY_FLOOR.marketing_fanout).toBe('STEP_UP_VERIFIED');
    expect(aeFloor(GOODS_RECEIPT_CAPABILITY)).toBe('SESSION_VERIFIED');
    for (const cap of capabilities.filter(
      (c) => MONEY(c) && c.capability !== GOODS_RECEIPT_CAPABILITY,
    ))
      expect(isInventoryReceiptPurchaseCost(cap)).toBe(false);
  });

  const changes: Array<[string, Partial<RegisteredActionCapabilityV1>]> = [
    ['same semantics at another key', { capability: 'crm.other.price.v1' }],
    ['new version', { capabilityVersion: 2 }],
    ['payment action', { actionClass: 'take_payment' }],
    ['new service action', { actionClass: 'create_crm_service' }],
    ['other target', { targetKind: 'tenant_catalog_item' }],
    ['other input', { normalizedInputContract: 'maya.payment/1' }],
    ['replacement normalizer', { normalizeInput: () => ({}) }],
    ['identity change', { identityVersion: 2 }],
    ['risk version change', { riskProfileVersion: 2 }],
    [
      'erased financial classification',
      {
        riskFacets: goodsReceiptCapability.riskFacets.filter(
          (f) => f !== 'financial',
        ),
      },
    ],
    [
      'widened financial classification',
      { riskFacets: [...goodsReceiptCapability.riskFacets, 'payment_value'] },
    ],
    [
      'duplicate risk in place of required risk',
      {
        riskFacets: ['ac2', 'external', 'one_target', 'financial', 'financial'],
      },
    ],
    [
      'extra source',
      { allowedSourceTypes: ['authenticated_request', 'scheduler'] },
    ],
    ['changed policy', { policyKey: 'another-policy' }],
    ['changed policy version', { policyVersion: 2 }],
    ['shadow', { policyDecision: 'SHADOW_ONLY' }],
    ['changed autonomy', { autonomyLevel: 'L3_CANONICAL' }],
    ['second approval lifecycle', { approvalRequirement: 'REQUIRED' }],
    ['AE approval timer', { approvalTtlMs: 1000 }],
    ['changed transport identity', { transportIdentityVersion: 2 }],
    ['other executor', { executorKey: 'payment' }],
    ['changed executor version', { executorVersion: 2 }],
    ['changed payload retention', { payloadRetentionMs: 1 }],
    ['changed audit retention', { auditRetentionMs: 1 }],
    [
      'dispatch retry',
      { retry: { ...goodsReceiptCapability.retry, maxExecutionAttempts: 2 } },
    ],
    [
      'pre-dispatch retry',
      {
        retry: {
          ...goodsReceiptCapability.retry,
          retryablePreDispatchErrors: new Set(['anything']),
        },
      },
    ],
    [
      'retry delay',
      { retry: { ...goodsReceiptCapability.retry, backoffMs: [1] } },
    ],
    [
      'different retry policy',
      { retry: { ...goodsReceiptCapability.retry, key: 'generic' } },
    ],
    [
      'retry policy version',
      { retry: { ...goodsReceiptCapability.retry, version: 2 } },
    ],
    [
      'different reconciliation',
      {
        reconciliation: {
          ...goodsReceiptCapability.reconciliation,
          key: 'generic',
        },
      },
    ],
    [
      'reconciliation version',
      {
        reconciliation: {
          ...goodsReceiptCapability.reconciliation,
          version: 2,
        },
      },
    ],
    [
      'more reconciliation attempts',
      {
        reconciliation: {
          ...goodsReceiptCapability.reconciliation,
          maxInconclusiveAttempts: 2,
        },
      },
    ],
    [
      'reconciliation redispatch',
      {
        reconciliation: {
          ...goodsReceiptCapability.reconciliation,
          retryAfterProvenNonExecution: true,
        },
      },
    ],
  ];

  it.each(changes)(
    'refuses %s even when the known key is reused',
    (_name, change) => {
      expect(
        isInventoryReceiptPurchaseCost({
          ...goodsReceiptCapability,
          ...change,
        }),
      ).toBe(false);
    },
  );
});
