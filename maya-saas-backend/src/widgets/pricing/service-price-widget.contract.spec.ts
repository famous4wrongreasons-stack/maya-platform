import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { servicePriceCapability } from '../../action-engine/service-price.contract';
import { SERVICE_PRICE_CAPABILITY } from '../../crm/yclients-service-price.contract';
import {
  MONEY,
  deriveAeFamily,
} from '../authority/ae-commit-allowlist.runtime';
import {
  AE_FAMILY_FLOOR,
  aeFloor,
} from '../authority/verification-floor.runtime';
import { isCataloguePriceConfiguration } from './service-price-widget.contract';

describe('YC-SP1-WIDGET-1 exact financial configuration descriptor', () => {
  it('admits only the registered fixed-price capability while retaining MONEY', () => {
    const capabilities = new ActionCapabilityRegistry().list();
    expect(
      capabilities
        .filter(isCataloguePriceConfiguration)
        .map((c) => c.capability),
    ).toEqual([SERVICE_PRICE_CAPABILITY]);
    expect(MONEY(servicePriceCapability)).toBe(true);
    expect(deriveAeFamily(servicePriceCapability)).toBe(
      'catalogue_price_configuration',
    );
    expect(AE_FAMILY_FLOOR.catalogue_price_configuration).toBe(
      'SESSION_VERIFIED',
    );
    expect(AE_FAMILY_FLOOR.money).toBe('STEP_UP_VERIFIED');
    expect(AE_FAMILY_FLOOR.marketing_fanout).toBe('STEP_UP_VERIFIED');
    expect(aeFloor(SERVICE_PRICE_CAPABILITY)).toBe('SESSION_VERIFIED');
    for (const cap of capabilities.filter(
      (c) => MONEY(c) && c.capability !== SERVICE_PRICE_CAPABILITY,
    ))
      expect(isCataloguePriceConfiguration(cap)).toBe(false);
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
        riskFacets: servicePriceCapability.riskFacets.filter(
          (f) => f !== 'financial',
        ),
      },
    ],
    [
      'widened financial classification',
      { riskFacets: [...servicePriceCapability.riskFacets, 'payment_value'] },
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
    [
      'dispatch retry',
      { retry: { ...servicePriceCapability.retry, maxExecutionAttempts: 2 } },
    ],
    [
      'pre-dispatch retry',
      {
        retry: {
          ...servicePriceCapability.retry,
          retryablePreDispatchErrors: new Set(['anything']),
        },
      },
    ],
    [
      'retry delay',
      { retry: { ...servicePriceCapability.retry, backoffMs: [1] } },
    ],
    [
      'different retry policy',
      { retry: { ...servicePriceCapability.retry, key: 'generic' } },
    ],
    [
      'retry policy version',
      { retry: { ...servicePriceCapability.retry, version: 2 } },
    ],
    [
      'different reconciliation',
      {
        reconciliation: {
          ...servicePriceCapability.reconciliation,
          key: 'generic',
        },
      },
    ],
    [
      'reconciliation version',
      {
        reconciliation: {
          ...servicePriceCapability.reconciliation,
          version: 2,
        },
      },
    ],
    [
      'more reconciliation attempts',
      {
        reconciliation: {
          ...servicePriceCapability.reconciliation,
          maxInconclusiveAttempts: 2,
        },
      },
    ],
    [
      'reconciliation redispatch',
      {
        reconciliation: {
          ...servicePriceCapability.reconciliation,
          retryAfterProvenNonExecution: true,
        },
      },
    ],
  ];

  it.each(changes)(
    'refuses %s even when the known key is reused',
    (_name, change) => {
      expect(
        isCataloguePriceConfiguration({ ...servicePriceCapability, ...change }),
      ).toBe(false);
    },
  );
});
