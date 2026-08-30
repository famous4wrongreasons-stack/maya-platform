import { ActionPolicyDecision } from '@prisma/client';

import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import { ActionCapabilityRegistry } from './action-engine.registry';

describe('P4-03 legacy loyalty grant issue Shadow contract', () => {
  const registry = new ActionCapabilityRegistry();
  const input = {
    provider: 'yclients',
    canonicalClientId: 'client-7',
    requestIdentityHash: 'a'.repeat(64),
    loyaltyAccountIdentityHash: 'b'.repeat(64),
    serviceRef: 'yclients:service-spa',
    serviceIdentityHash: 'c'.repeat(64),
    serviceTitleIdentityHash: 'd'.repeat(64),
    legacyClaimedServiceTitleIdentityHash: 'd'.repeat(64),
    servicePoints: 1200,
    legacyClaimedPoints: 1200,
    availableBalancePoints: 1500,
    grantDecision: 'issue',
    grantPolicy: 'legacy-one-time-service-grant.v1',
    catalogPolicyVersion: 'server-redeemable-service-allowlist.v1',
    ttlDays: 14,
    perGrantCapPoints: 2000,
    serviceEligibility: 'allowed',
    balanceDecision: 'sufficient',
    capDecision: 'within_cap',
    existingGrantDecision: 'none',
    authorizationEvidence: 'trusted_shadow_candidate_only',
    divergenceCodes: [],
  };

  it('registers only a one-time non-executable grant Shadow', () => {
    const capability = registry.get('loyalty.redemption-grant.issue.shadow.v1');

    expect(capability).toMatchObject({
      actionClass: 'issue_loyalty_redemption_grant',
      targetKind: 'loyalty_redemption_grant',
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
        'one_time',
        'bearer_secret',
        'provider_evidence',
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

  it('derives denial from balance, cap, allowlist, and prior issuance', () => {
    const capability = registry.get('loyalty.redemption-grant.issue.shadow.v1');
    const denied = capability.normalizeInput({
      ...input,
      availableBalancePoints: 1000,
      perGrantCapPoints: 1100,
      serviceEligibility: 'not_allowed',
      existingGrantDecision: 'already_issued',
      grantDecision: 'do_not_issue',
      balanceDecision: 'insufficient',
      capDecision: 'exceeds_cap',
      divergenceCodes: [
        'canonical_grant_already_exists',
        'insufficient_canonical_balance',
        'per_grant_cap_exceeded',
        'service_not_allowed',
      ],
    });

    expect(denied).toMatchObject({
      grantDecision: 'do_not_issue',
      balanceDecision: 'insufficient',
      capDecision: 'exceeds_cap',
      serviceEligibility: 'not_allowed',
      existingGrantDecision: 'already_issued',
    });
  });

  it('rejects forged authority and non-derived grant facts', () => {
    const capability = registry.get('loyalty.redemption-grant.issue.shadow.v1');

    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
      { rawCode: 'LOY-FORGED' },
      { codeHash: 'forged' },
      { authenticatedClient: true },
    ]) {
      expect(() => capability.normalizeInput({ ...input, ...forged })).toThrow(
        'Unexpected action input',
      );
    }
    expect(() =>
      capability.normalizeInput({ ...input, grantDecision: 'do_not_issue' }),
    ).toThrow('grantDecision is not server-derived');
    expect(() =>
      capability.normalizeInput({
        ...input,
        authorizationEvidence: 'caller_authenticated',
      }),
    ).toThrow('authorizationEvidence is not canonical');
  });
});
