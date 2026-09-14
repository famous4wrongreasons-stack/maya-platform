import { PrismaService } from '../prisma/prisma.service';
import { referralRewardPresentation } from './referral-reward-claim.contract';
import { ReferralRewardPresentationService } from './referral-reward-presentation.service';

describe('ReferralRewardPresentationService', () => {
  const original = {
    key: process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY,
    version: process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION,
    keys: process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEYS,
    lookup: process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET,
  };
  const presentationKey = 'presentation-secret-00000000000000000000';
  const lookupKey = 'lookup-secret-0000000000000000000000000';
  const facts = {
    tenantId: 'tenant-a',
    issuanceId: 'issuance-1',
    rewardId: 'reward-1',
    recipientClientId: 'client-1',
    rewardSlot: 'invitee' as const,
    expiresAt: '2026-10-01T00:00:00.000Z',
  };

  beforeEach(() => {
    process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY = presentationKey;
    process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION = 'v1';
    process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEYS = JSON.stringify({
      v0: 'retained-presentation-secret-000000000000000',
    });
    process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET = lookupKey;
  });

  afterAll(() => {
    const values = {
      MAYA_REFERRAL_REWARD_PRESENTATION_KEY: original.key,
      MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION: original.version,
      MAYA_REFERRAL_REWARD_PRESENTATION_KEYS: original.keys,
      MAYA_REFERRAL_REWARD_CLAIM_SECRET: original.lookup,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('re-presents the stored issuance after restart without writes', async () => {
    const material = referralRewardPresentation(facts, {
      presentationKey,
      presentationKeyVersion: 'v1',
      lookupKey,
    });
    const findUnique = jest.fn().mockResolvedValue({
      id: facts.rewardId,
      tenantId: facts.tenantId,
      issuanceId: facts.issuanceId,
      recipientClientId: facts.recipientClientId,
      rewardSlot: facts.rewardSlot,
      expiresAt: new Date(facts.expiresAt),
      codeHash: material.codeHash,
      presentationKeyVersion: 'v1',
    });
    const createService = () =>
      new ReferralRewardPresentationService({
        referralReward: { findUnique },
      } as unknown as PrismaService);

    const first = await createService().present({
      tenantId: facts.tenantId,
      rewardId: facts.rewardId,
      recipientClientId: facts.recipientClientId,
    });
    const restarted = await createService().present({
      tenantId: facts.tenantId,
      rewardId: facts.rewardId,
      recipientClientId: facts.recipientClientId,
    });

    expect(first).toEqual(restarted);
    expect(first).toEqual({
      outcome: 'presented',
      bearer: material.bearer,
      presentationReference: material.presentationReference,
      writesPerformed: false,
    });
  });

  it('fails closed for wrong recipient, mismatched lookup, or missing retained key', async () => {
    const material = referralRewardPresentation(facts, {
      presentationKey,
      presentationKeyVersion: 'v1',
      lookupKey,
    });
    const reward = {
      id: facts.rewardId,
      tenantId: facts.tenantId,
      issuanceId: facts.issuanceId,
      recipientClientId: facts.recipientClientId,
      rewardSlot: facts.rewardSlot,
      expiresAt: new Date(facts.expiresAt),
      codeHash: material.codeHash,
      presentationKeyVersion: 'v1',
    };
    const findUnique = jest.fn().mockResolvedValue(reward);
    const service = new ReferralRewardPresentationService({
      referralReward: { findUnique },
    } as unknown as PrismaService);

    await expect(
      service.present({
        tenantId: facts.tenantId,
        rewardId: facts.rewardId,
        recipientClientId: 'wrong-client',
      }),
    ).resolves.toMatchObject({ outcome: 'reward_unresolved', bearer: null });
    findUnique.mockResolvedValueOnce({ ...reward, codeHash: 'forged' });
    await expect(
      service.present({
        tenantId: facts.tenantId,
        rewardId: facts.rewardId,
        recipientClientId: facts.recipientClientId,
      }),
    ).resolves.toMatchObject({ outcome: 'reward_unresolved', bearer: null });
    findUnique.mockResolvedValueOnce({
      ...reward,
      presentationKeyVersion: 'retired-without-key',
    });
    await expect(
      service.present({
        tenantId: facts.tenantId,
        rewardId: facts.rewardId,
        recipientClientId: facts.recipientClientId,
      }),
    ).resolves.toMatchObject({
      outcome: 'presentation_unavailable',
      bearer: null,
    });
  });
});
