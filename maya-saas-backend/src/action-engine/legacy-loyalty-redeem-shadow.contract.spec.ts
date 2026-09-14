import { ActionPolicyDecision } from '@prisma/client';

import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import { ActionCapabilityRegistry } from './action-engine.registry';

describe('P4-03 legacy loyalty redeem Shadow contract', () => {
  const registry = new ActionCapabilityRegistry();
  const input = {
    provider: 'yclients',
    canonicalClientId: 'client-7',
    canonicalAppointmentId: 'appointment-7',
    appointmentActionExecutionId: 'appointment-execution-7',
    providerRecordIdentityHash: 'a'.repeat(64),
    providerServiceId: 'service-care-7',
    redemptionRequestIdentityHash: 'b'.repeat(64),
    canonicalBalancePoints: 500,
    serverDerivedPoints: 300,
    legacyClaimedPoints: 300,
    intendedDeltaPoints: -300,
    resultingBalancePoints: 200,
    eligibilityDecision: 'redeem',
    redemptionPolicy: 'legacy-booking-one-care-service.v1',
    perActionCapPoints: 1000,
    capDecision: 'within_cap',
    appointmentEvidence: 'canonical_create_succeeded',
    providerProjectionDecision: 'deferred_attempt',
    divergenceCodes: [],
  };

  it('registers only a destructive non-executable canonical Shadow', () => {
    const capability = registry.get('loyalty.legacy-redeem.shadow.v1');

    expect(capability).toMatchObject({
      actionClass: 'redeem_legacy_loyalty',
      targetKind: 'loyalty_redemption',
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
        'destructive',
        'external_crm',
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

  it('rejects forged authority and non-derived value decisions', () => {
    const capability = registry.get('loyalty.legacy-redeem.shadow.v1');

    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      expect(() => capability.normalizeInput({ ...input, ...forged })).toThrow(
        'Unexpected action input',
      );
    }
    expect(() =>
      capability.normalizeInput({ ...input, intendedDeltaPoints: -250 }),
    ).toThrow('intendedDeltaPoints is not server-derived');
    expect(() =>
      capability.normalizeInput({
        ...input,
        appointmentEvidence: 'caller_asserted',
      }),
    ).toThrow('appointment evidence is not canonical');
  });
});
