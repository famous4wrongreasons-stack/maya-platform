import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
  referralResolveShadowNormalizer,
} from './referral-resolve-shadow.contract';

const canonicalInput = () => ({
  provider: 'yclients',
  customerReferralId: 'referral-1',
  canonicalReferrerClientId: 'client-1',
  canonicalReferredClientId: 'client-2',
  referrerProviderIdentityHash: 'hash-referrer',
  referredProviderIdentityHash: 'hash-referred',
  relationshipIdentityHash: 'hash-relationship',
  resolutionIdentityHash: 'hash-resolution',
  terminalOutcome: 'qualified',
  joinedAt: '2026-08-01T00:00:00.000Z',
  evaluationWindow: '2026-09-01',
  providerVisitIdentityHash: 'hash-visit',
  evidenceDecision: 'exact_attended_visit',
  policyProfile: REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'hash-policy',
  eligibilityDecision: 'eligible_for_resolution',
  legacyClaimedOutcome: 'qualified',
  shadowDivergence: false,
});

describe('referralResolveShadowNormalizer', () => {
  it('normalizes one canonical resolution plan', () => {
    expect(referralResolveShadowNormalizer(canonicalInput())).toEqual(
      canonicalInput(),
    );
  });

  it('rejects caller authority and executor fields', () => {
    for (const forged of [
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'legacy.direct' },
      { approvalBindingHash: 'forged' },
    ]) {
      expect(() =>
        referralResolveShadowNormalizer({ ...canonicalInput(), ...forged }),
      ).toThrow(ActionContractError);
    }
  });

  it('requires exact provider visit identity only for qualification', () => {
    expect(() =>
      referralResolveShadowNormalizer({
        ...canonicalInput(),
        providerVisitIdentityHash: null,
      }),
    ).toThrow('qualified outcome requires exact provider visit identity');

    expect(() =>
      referralResolveShadowNormalizer({
        ...canonicalInput(),
        terminalOutcome: 'expired',
        evidenceDecision: 'pending_ttl_elapsed',
      }),
    ).toThrow('non-qualified outcome cannot claim provider visit identity');
  });

  it('accepts an expiration plan with no provider visit identity', () => {
    expect(
      referralResolveShadowNormalizer({
        ...canonicalInput(),
        terminalOutcome: 'expired',
        providerVisitIdentityHash: null,
        evidenceDecision: 'pending_ttl_elapsed',
      }),
    ).toMatchObject({
      terminalOutcome: 'expired',
      providerVisitIdentityHash: null,
    });
  });
});
