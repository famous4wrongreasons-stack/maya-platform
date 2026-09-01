import { createHmac } from 'node:crypto';

import {
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_PRESENTATION_CONTRACT,
} from '../action-engine';

export interface ReferralRewardPresentationFacts {
  tenantId: string;
  issuanceId: string;
  rewardId: string;
  recipientClientId: string;
  rewardSlot: 'inviter' | 'invitee';
  expiresAt: string;
}

export interface ReferralRewardPresentationMaterial {
  bearer: string;
  codeHash: string;
  presentationKeyVersion: string;
  presentationReference: string;
}

function canonicalPresentationMessage(
  facts: ReferralRewardPresentationFacts,
  keyVersion: string,
): string {
  return JSON.stringify([
    REFERRAL_REWARD_PRESENTATION_CONTRACT,
    keyVersion,
    facts.tenantId,
    facts.issuanceId,
    facts.rewardId,
    facts.recipientClientId,
    facts.rewardSlot,
    facts.expiresAt,
  ]);
}

export function referralRewardClaimLookup(
  secret: string | Buffer,
  bearer: string,
): string {
  const normalizedBearer = bearer.trim().toUpperCase();
  return createHmac('sha256', secret)
    .update(
      `${REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT}\u001f${normalizedBearer}`,
      'utf8',
    )
    .digest('hex');
}

/**
 * The bearer is a versioned PRF output over immutable issuance facts. It can
 * therefore be re-presented after a crash without persisting the raw bearer
 * and without issuing a second reward. The lookup HMAC uses a separate key.
 */
export function referralRewardPresentation(
  facts: ReferralRewardPresentationFacts,
  input: {
    presentationKey: string | Buffer;
    presentationKeyVersion: string;
    lookupKey: string | Buffer;
  },
): ReferralRewardPresentationMaterial {
  const digest = createHmac('sha256', input.presentationKey)
    .update(
      canonicalPresentationMessage(facts, input.presentationKeyVersion),
      'utf8',
    )
    .digest('base64url')
    .toUpperCase();
  const bearer = `MAYA-RR-${digest}`;
  return {
    bearer,
    codeHash: referralRewardClaimLookup(input.lookupKey, bearer),
    presentationKeyVersion: input.presentationKeyVersion,
    presentationReference: createHmac('sha256', input.presentationKey)
      .update(
        `reference\u001f${canonicalPresentationMessage(facts, input.presentationKeyVersion)}`,
      )
      .digest('base64url'),
  };
}

export function referralRewardPresentationConfig(environment = process.env): {
  presentationKey: string;
  presentationKeyVersion: string;
  presentationKeys: ReadonlyMap<string, string>;
  lookupKey: string;
} | null {
  const presentationKey = String(
    environment.MAYA_REFERRAL_REWARD_PRESENTATION_KEY || '',
  ).trim();
  const presentationKeyVersion = String(
    environment.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION || '',
  ).trim();
  const lookupKey = String(
    environment.MAYA_REFERRAL_REWARD_CLAIM_SECRET || '',
  ).trim();
  let retainedKeys: Record<string, unknown> = {};
  const serializedKeys = String(
    environment.MAYA_REFERRAL_REWARD_PRESENTATION_KEYS || '',
  ).trim();
  if (serializedKeys) {
    try {
      const parsed = JSON.parse(serializedKeys) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      retainedKeys = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const presentationKeys = new Map<string, string>();
  for (const [version, value] of Object.entries(retainedKeys)) {
    if (
      !/^[A-Za-z0-9._:-]{1,64}$/.test(version) ||
      typeof value !== 'string' ||
      value.length < 32 ||
      value.length > 256
    ) {
      return null;
    }
    presentationKeys.set(version, value);
  }
  if (
    presentationKey.length < 32 ||
    presentationKey.length > 256 ||
    lookupKey.length < 32 ||
    lookupKey.length > 256 ||
    !/^[A-Za-z0-9._:-]{1,64}$/.test(presentationKeyVersion)
  ) {
    return null;
  }
  presentationKeys.set(presentationKeyVersion, presentationKey);
  return {
    presentationKey,
    presentationKeyVersion,
    presentationKeys,
    lookupKey,
  };
}
