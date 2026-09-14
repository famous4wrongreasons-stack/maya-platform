import { ActionPolicyDecision } from '@prisma/client';

import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  REFERRAL_CREATE_SHADOW_CAPABILITY,
  REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
  referralCreateShadowNormalizer,
} from './referral-create-shadow.contract';

const validInput = () => ({
  provider: 'yclients',
  canonicalReferrerClientId: 'client-referrer',
  canonicalReferredClientId: 'client-referred',
  referrerProviderIdentityHash: 'hash-referrer',
  referredProviderIdentityHash: 'hash-referred',
  relationshipIdentityHash: 'hash-relationship',
  referredSubjectHash: 'hash-subject',
  referralCodeBindingHash: 'hash-code-binding',
  policyProfile: REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'hash-policy',
  eligibilityDecision: 'eligible',
  intendedStatus: 'pending',
});

describe('P4-04 create_customer_referral Shadow contract', () => {
  it('normalizes only the server-derived referral plan', () => {
    expect(referralCreateShadowNormalizer(validInput())).toEqual(validInput());
  });

  it('rejects self-referral, forged authority, and forged eligibility', () => {
    expect(() =>
      referralCreateShadowNormalizer({
        ...validInput(),
        canonicalReferredClientId: 'client-referrer',
      }),
    ).toThrow('self referral is forbidden');

    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      expect(() =>
        referralCreateShadowNormalizer({ ...validInput(), ...forged }),
      ).toThrow('Unexpected action input');
    }
    expect(() =>
      referralCreateShadowNormalizer({
        ...validInput(),
        eligibilityDecision: 'eligible_from_initiator',
      }),
    ).toThrow('eligibilityDecision is not canonical');
  });

  it('registers a referrals-entitled non-executable capability', () => {
    const registry = new ActionCapabilityRegistry();
    const capability = registry.get(REFERRAL_CREATE_SHADOW_CAPABILITY);

    expect(capability).toMatchObject({
      actionClass: 'create_customer_referral',
      targetKind: 'customer_referral',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
    });
    expect(capability.retry.maxExecutionAttempts).toBe(1);
    expect(capability.retry.retryablePreDispatchErrors).toEqual(new Set());
    expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(false);
    expect(capability.normalizeInput(validInput())).toEqual(validInput());

    const policy = canonicalProductionPolicyDefinitions(registry).find(
      (definition) => definition.capability === capability.capability,
    );
    expect(policy).toMatchObject({
      actorPolicy: 'OPTIONAL_TRUSTED_SERVICE',
      trustedServiceSourceTypes: ['legacy_bridge'],
      requiredFeatures: ['referrals'],
      approverPolicyKey: 'none',
    });
  });
});
