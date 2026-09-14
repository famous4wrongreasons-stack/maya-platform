import { ActionPolicyDecision } from '@prisma/client';

import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import { ActionCapabilityRegistry } from './action-engine.registry';

describe('P4-03 legacy loyalty import Shadow contract', () => {
  const registry = new ActionCapabilityRegistry();
  const input = {
    provider: 'yclients',
    canonicalClientId: 'client-7',
    loyaltyAccountIdentityHash: 'a'.repeat(64),
    providerCardIdentityHash: 'b'.repeat(64),
    providerBalancePoints: 900,
    canonicalCurrentBalancePoints: 600,
    legacyClaimedProviderBalancePoints: 900,
    legacyClaimedCurrentBalancePoints: 600,
    legacyClaimedDeltaPoints: 300,
    intendedDeltaPoints: 300,
    importDecision: 'import',
    importPolicy: 'legacy-one-time-provider-card-alignment.v1',
    perActionCapPoints: 1000,
    capDecision: 'within_cap',
    existingImportDecision: 'none',
    providerEvidence: 'exact_card_snapshot',
    divergenceCodes: [],
  };

  it('registers only a one-time non-executable canonical Shadow', () => {
    const capability = registry.get('loyalty.legacy-import.shadow.v1');

    expect(capability).toMatchObject({
      actionClass: 'import_legacy_loyalty_balance',
      targetKind: 'loyalty_account',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
    });
    expect(capability.riskFacets).toEqual(
      expect.arrayContaining([
        'financial_equivalent',
        'customer_value',
        'provider_evidence',
        'one_time',
        'shadow_only',
      ]),
    );
    expect(capability.retry.maxExecutionAttempts).toBe(1);
    expect(capability.retry.retryablePreDispatchErrors).toEqual(new Set());
    expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(false);
    expect(capability.normalizeInput(input)).toEqual(input);

    const policy = canonicalProductionPolicyDefinitions(registry).find(
      (definition) => definition.capability === capability.capability,
    );
    expect(policy).toMatchObject({
      actorPolicy: 'OPTIONAL_TRUSTED_SERVICE',
      trustedServiceSourceTypes: ['legacy_bridge'],
      requiredFeatures: ['loyalty'],
      approverPolicyKey: 'none',
    });
  });

  it('rejects forged authority and non-derived import decisions', () => {
    const capability = registry.get('loyalty.legacy-import.shadow.v1');

    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
      { providerCardId: 'caller-card' },
    ]) {
      expect(() => capability.normalizeInput({ ...input, ...forged })).toThrow(
        'Unexpected action input',
      );
    }
    expect(() =>
      capability.normalizeInput({ ...input, intendedDeltaPoints: 301 }),
    ).toThrow('intendedDeltaPoints is not server-derived');
    expect(() =>
      capability.normalizeInput({
        ...input,
        providerEvidence: 'caller_asserted',
      }),
    ).toThrow('provider evidence is not canonical');
  });
});
