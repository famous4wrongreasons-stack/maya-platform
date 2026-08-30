import { ActionPolicyDecision } from '@prisma/client';

import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import { ActionCapabilityRegistry } from './action-engine.registry';
import { calculateLegacyLoyaltyBackfillPoints } from './legacy-loyalty-backfill-shadow.contract';

describe('P4-03 legacy loyalty backfill Shadow contract', () => {
  const registry = new ActionCapabilityRegistry();
  const input = {
    provider: 'yclients',
    canonicalClientId: 'client-7',
    loyaltyAccountIdentityHash: 'a'.repeat(64),
    providerClientIdentityHash: 'b'.repeat(64),
    providerSoldAmountRubles: 6000,
    legacyClaimedSoldAmountRubles: 6000,
    legacyClaimedPoints: 300,
    calculatedUncappedPoints: 300,
    intendedDeltaPoints: 300,
    backfillDecision: 'grant',
    backfillPolicy: 'legacy-welcome-ltv-5pct-cap.v1',
    programVersion: 'legacy-welcome-launch.v1',
    perClientCapPoints: 1000,
    perRunCapPoints: 10_000,
    clientCapDecision: 'within_cap',
    runCapDecision: 'within_cap',
    existingSourceDecision: 'none',
    providerEvidence: 'exact_client_ltv_snapshot',
    divergenceCodes: [],
  };

  it('registers only a capped non-executable canonical Shadow', () => {
    const capability = registry.get('loyalty.legacy-backfill.shadow.v1');

    expect(capability).toMatchObject({
      actionClass: 'backfill_legacy_loyalty',
      targetKind: 'loyalty_client',
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
        'bulk',
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

  it('matches Python half-even 5% calculation before the server cap', () => {
    expect(calculateLegacyLoyaltyBackfillPoints(2000)).toBe(100);
    expect(calculateLegacyLoyaltyBackfillPoints(2010)).toBe(100);
    expect(calculateLegacyLoyaltyBackfillPoints(2030)).toBe(102);
    expect(calculateLegacyLoyaltyBackfillPoints(0)).toBe(0);

    const capability = registry.get('loyalty.legacy-backfill.shadow.v1');
    expect(
      capability.normalizeInput({
        ...input,
        providerSoldAmountRubles: 100_000,
        legacyClaimedSoldAmountRubles: 100_000,
        legacyClaimedPoints: 1000,
        calculatedUncappedPoints: 5000,
        intendedDeltaPoints: 1000,
        clientCapDecision: 'capped',
      }),
    ).toMatchObject({
      calculatedUncappedPoints: 5000,
      intendedDeltaPoints: 1000,
      clientCapDecision: 'capped',
    });
  });

  it('rejects forged authority and non-derived grant decisions', () => {
    const capability = registry.get('loyalty.legacy-backfill.shadow.v1');

    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
      { phone: '+79990000000' },
      { batchApproved: true },
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
