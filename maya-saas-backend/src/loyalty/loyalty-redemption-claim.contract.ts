import { createHmac, randomBytes } from 'node:crypto';

import { LOYALTY_REDEMPTION_CODE_HASH_CONTRACT } from '../action-engine/legacy-loyalty-grant-consume-shadow.contract';

export const LOYALTY_REDEMPTION_CLAIM_OUTPUT_CONTRACT =
  'maya.loyalty-redemption-claim/1' as const;

export interface LoyaltyRedemptionClaimArtifactV1 {
  contract: typeof LOYALTY_REDEMPTION_CLAIM_OUTPUT_CONTRACT;
  bearer: string;
}

export function issueLoyaltyRedemptionClaim(): LoyaltyRedemptionClaimArtifactV1 {
  return {
    contract: LOYALTY_REDEMPTION_CLAIM_OUTPUT_CONTRACT,
    bearer: `MAYA-LR-${randomBytes(24).toString('hex').toUpperCase()}`,
  };
}

export function loyaltyRedemptionClaimLookup(
  secret: string | Buffer,
  bearer: string,
): string {
  const normalizedBearer = bearer.trim().toUpperCase();
  return createHmac('sha256', secret)
    .update(
      `${LOYALTY_REDEMPTION_CODE_HASH_CONTRACT}\u001f${normalizedBearer}`,
      'utf8',
    )
    .digest('hex');
}
