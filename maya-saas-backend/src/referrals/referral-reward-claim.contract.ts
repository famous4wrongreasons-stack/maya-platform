import { createHmac } from 'node:crypto';

import { REFERRAL_REWARD_CLAIM_CONTRACT } from '../action-engine';

export function referralRewardClaimLookup(
  secret: string | Buffer,
  bearer: string,
): string {
  const normalizedBearer = bearer.trim().toUpperCase();
  return createHmac('sha256', secret)
    .update(
      `${REFERRAL_REWARD_CLAIM_CONTRACT}\u001f${normalizedBearer}`,
      'utf8',
    )
    .digest('hex');
}
