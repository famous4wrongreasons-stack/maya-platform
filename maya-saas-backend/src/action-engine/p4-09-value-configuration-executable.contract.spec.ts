import { ActionPolicyDecision } from '@prisma/client';

import {
  ActionCapabilityRegistry,
  P4_09_EXECUTABLE_CAPABILITIES,
  P4_09_REGISTRATIONS,
  P4_09_SAFETY_LIMITS,
  P4_09_SHADOW_CAPABILITIES,
} from './index';

const authority = {
  actorMembershipId: 'membership_1',
  actorRole: 'tenant_owner',
  policyVersion: 'p4-09.owner-approved-value-configuration.v1',
  policySnapshotHash: 'policy_hash',
  ownerApprovalRequired: true,
  oneTargetCount: 1,
  bulkMutation: false,
  configWritePerformed: false,
  providerWrites: 0,
};

function offerInput(overrides: Record<string, unknown> = {}) {
  return {
    offerId: 'offer_1',
    offerKind: 'certificate',
    templateKey: 'gift-certificate.2000',
    supersedesOfferId: null,
    previousVersionId: null,
    nextVersion: 1,
    versionId: 'version_1',
    name: 'Gift certificate 2000',
    description: null,
    priceKopecks: 200_000,
    currency: 'RUB',
    availabilityState: 'ACTIVE',
    externalRef: 'legacy.gift.2000',
    valueSnapshotHash: 'snapshot_hash',
    ...authority,
    intendedMutation: 'create_immutable_certificate_offer_value_version',
    ...overrides,
  };
}

function referralInput(overrides: Record<string, unknown> = {}) {
  return {
    programId: 'program_1',
    previousVersionId: null,
    nextVersion: 1,
    versionId: 'version_1',
    enabled: true,
    inviterRewardKopecks: 40_000,
    inviteeRewardKopecks: 50_000,
    inviterRewardPercentBasisPoints: null,
    inviteeRewardPercentBasisPoints: null,
    inviterRewardLiabilityCapKopecks: null,
    inviteeRewardLiabilityCapKopecks: null,
    currency: 'RUB',
    terms: null,
    codePrefix: null,
    valueSnapshotHash: 'snapshot_hash',
    ...authority,
    intendedMutation: 'append_referral_reward_policy_version',
    ...overrides,
  };
}

describe('P4-09 value configuration contracts', () => {
  it('registers exactly seven Shadows and seven owner-approved executors', () => {
    const registry = new ActionCapabilityRegistry();
    const shadows = Object.values(P4_09_SHADOW_CAPABILITIES).map((key) =>
      registry.get(key),
    );
    const executors = Object.values(P4_09_EXECUTABLE_CAPABILITIES).map((key) =>
      registry.get(key),
    );
    expect(shadows).toHaveLength(7);
    expect(executors).toHaveLength(7);
    expect(P4_09_REGISTRATIONS).toHaveLength(7);
    expect(
      shadows.every(
        (capability) =>
          capability.policyDecision === ActionPolicyDecision.SHADOW_ONLY &&
          capability.executorKey === 'shadow.none' &&
          capability.approvalRequirement === 'NONE',
      ),
    ).toBe(true);
    expect(
      executors.every(
        (capability) =>
          capability.policyDecision === ActionPolicyDecision.ALLOW &&
          capability.executorKey === 'business-content.canonical-value' &&
          capability.approvalRequirement === 'REQUIRED',
      ),
    ).toBe(true);
  });

  it('enforces immutable internal identity, exact versions, and certificate cap', () => {
    const create = P4_09_REGISTRATIONS[0].normalizeInput(offerInput());
    expect(create.offerId).toBe('offer_1');
    expect(create.externalRef).toBe('legacy.gift.2000');
    expect(create.oneTargetCount).toBe(1);
    expect(create.bulkMutation).toBe(false);
    expect(() =>
      P4_09_REGISTRATIONS[0].normalizeInput(
        offerInput({ priceKopecks: 500_001 }),
      ),
    ).toThrow('approved cap');
    expect(() =>
      P4_09_REGISTRATIONS[0].normalizeInput(
        offerInput({ externalRef: 'changed.alias', offerId: '' }),
      ),
    ).toThrow('offerId');
  });

  it('enforces membership cap and append-only transition shapes', () => {
    const membershipCreate = P4_09_REGISTRATIONS[3];
    expect(() =>
      membershipCreate.normalizeInput(
        offerInput({
          offerKind: 'membership',
          templateKey: 'complex.top',
          priceKopecks: 600_001,
          intendedMutation: 'create_immutable_membership_offer_value_version',
        }),
      ),
    ).toThrow('approved cap');
    const certificateUpdate = P4_09_REGISTRATIONS[1];
    expect(() =>
      certificateUpdate.normalizeInput(
        offerInput({
          previousVersionId: null,
          nextVersion: 2,
          intendedMutation: 'update_immutable_certificate_offer_value_version',
        }),
      ),
    ).toThrow('transition');
  });

  it('enforces fixed-or-percent referral denomination and aggregate caps', () => {
    const referral = P4_09_REGISTRATIONS[6];
    expect(referral.normalizeInput(referralInput()).currency).toBe('RUB');
    expect(() =>
      referral.normalizeInput(
        referralInput({
          inviterRewardKopecks: 50_000,
          inviterRewardPercentBasisPoints: 500,
        }),
      ),
    ).toThrow('denomination is ambiguous');
    expect(() =>
      referral.normalizeInput(
        referralInput({
          inviterRewardKopecks: 50_001,
          inviteeRewardKopecks: 50_000,
        }),
      ),
    ).toThrow('approved cap');
  });

  it('keeps the approved blast-radius values explicit and non-bulk', () => {
    expect(P4_09_SAFETY_LIMITS).toEqual({
      oneTargetPerMutation: 1,
      bulkMutationAllowed: false,
      membershipCapKopecks: 600_000,
      certificateCapKopecks: 500_000,
      referralCapPerSlotKopecks: 50_000,
      referralAggregateCapKopecks: 100_000,
      referralMaxRecipients: 2,
    });
  });
});
