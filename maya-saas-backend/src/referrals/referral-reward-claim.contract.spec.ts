import {
  referralRewardClaimLookup,
  referralRewardPresentation,
} from './referral-reward-claim.contract';

const facts = {
  tenantId: 'tenant-a',
  issuanceId: 'issuance-1',
  rewardId: 'reward-1',
  recipientClientId: 'client-1',
  rewardSlot: 'invitee' as const,
  expiresAt: '2026-10-01T00:00:00.000Z',
};

describe('referral reward presentation contract', () => {
  const keys = {
    presentationKey: 'presentation-secret-00000000000000000000',
    presentationKeyVersion: 'v1',
    lookupKey: 'lookup-secret-0000000000000000000000000',
  };

  it('re-presents the same bearer after restart without a second issuance', () => {
    const issued = referralRewardPresentation(facts, keys);
    const restarted = referralRewardPresentation({ ...facts }, { ...keys });

    expect(restarted).toEqual(issued);
    expect(issued.codeHash).toBe(
      referralRewardClaimLookup(keys.lookupKey, issued.bearer),
    );
    expect(issued.presentationKeyVersion).toBe('v1');
  });

  it('separates presentation PRF material from stored lookup material', () => {
    const material = referralRewardPresentation(facts, keys);
    const persistedFacts = {
      codeHash: material.codeHash,
      presentationKeyVersion: material.presentationKeyVersion,
      presentationReference: material.presentationReference,
    };

    expect(JSON.stringify(persistedFacts)).not.toContain(material.bearer);
    expect(material.codeHash).not.toContain(material.bearer);
    expect(
      referralRewardPresentation(facts, {
        ...keys,
        presentationKey: 'rotated-presentation-secret-00000000000000',
        presentationKeyVersion: 'v2',
      }).bearer,
    ).not.toBe(material.bearer);
  });
});
