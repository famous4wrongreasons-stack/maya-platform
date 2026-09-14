import { ActionPolicyDecision } from '@prisma/client';

import { ActionContractError } from './action-engine.errors';
import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  LEGACY_LOYALTY_GRANT_CONSUME_POLICY,
  LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY,
  LOYALTY_REDEMPTION_CODE_HASH_CONTRACT,
  legacyLoyaltyGrantConsumeShadowNormalizer,
} from './legacy-loyalty-grant-consume-shadow.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function validInput(): Record<string, unknown> {
  return {
    provider: 'yclients',
    canonicalGrantId: 'grant-8',
    grantIdentityHash: HASH_A,
    issueExecutionIdentityHash: HASH_B,
    canonicalClientId: 'client-8',
    requesterIdentityHash: 'c'.repeat(64),
    requesterRole: 'business_owner',
    requesterAuthority: 'administrative_role',
    loyaltyAccountIdentityHash: 'd'.repeat(64),
    serviceRef: 'yclients:service-spa',
    serviceIdentityHash: 'e'.repeat(64),
    grantPoints: 1200,
    availableBalancePoints: 1500,
    consumeDecision: 'consume',
    consumePolicy: LEGACY_LOYALTY_GRANT_CONSUME_POLICY,
    codeHashContract: LOYALTY_REDEMPTION_CODE_HASH_CONTRACT,
    perRedemptionCapPoints: 2000,
    expiryDecision: 'unexpired',
    balanceDecision: 'sufficient',
    capDecision: 'within_cap',
    existingRedemptionDecision: 'none',
    providerProjectionDecision: 'not_evaluated_in_shadow',
    authorizationEvidence: 'server_resolved_cashier_or_admin',
    legacyClaimedPoints: 1200,
    legacyClaimedBalancePoints: 1500,
    legacyClaimedUsedDecision: 'none',
    legacyClaimedExpiredDecision: 'unexpired',
    divergenceCodes: [],
  };
}

describe('legacy loyalty grant consume Shadow contract', () => {
  it('registers only a non-executable L2.5 one-time consume capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_CAPABILITY,
    );

    expect(capability).toMatchObject({
      actionClass: 'consume_loyalty_redemption_grant',
      targetKind: 'loyalty_redemption',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
      retry: { maxExecutionAttempts: 1 },
    });
    expect(capability.riskFacets).toEqual(
      expect.arrayContaining([
        'customer_value',
        'financial_equivalent',
        'one_time',
        'bearer_secret',
        'destructive',
        'external_crm',
        'shadow_only',
      ]),
    );
  });

  it('derives denial and divergences from canonical grant state and caps', () => {
    const input = validInput();
    Object.assign(input, {
      availableBalancePoints: 900,
      perRedemptionCapPoints: 1000,
      expiryDecision: 'expired',
      existingRedemptionDecision: 'already_redeemed',
      consumeDecision: 'do_not_consume',
      balanceDecision: 'insufficient',
      capDecision: 'exceeds_cap',
      legacyClaimedExpiredDecision: 'unexpired',
      legacyClaimedUsedDecision: 'none',
      divergenceCodes: [
        'canonical_grant_already_redeemed',
        'canonical_grant_expired',
        'insufficient_canonical_balance',
        'legacy_balance_mismatch',
        'legacy_expiry_mismatch',
        'legacy_used_state_mismatch',
        'per_redemption_cap_exceeded',
      ],
    });

    expect(legacyLoyaltyGrantConsumeShadowNormalizer(input)).toMatchObject({
      consumeDecision: 'do_not_consume',
      balanceDecision: 'insufficient',
      capDecision: 'exceeds_cap',
      expiryDecision: 'expired',
      existingRedemptionDecision: 'already_redeemed',
    });
  });

  it('rejects forged authority, bearer/code hash fields, and non-derived decisions', () => {
    expect(() =>
      legacyLoyaltyGrantConsumeShadowNormalizer({
        ...validInput(),
        approved: true,
        autonomy: 'L4',
        redemptionCode: 'LOY-FORGED',
        codeHash: HASH_A,
      }),
    ).toThrow(ActionContractError);

    expect(() =>
      legacyLoyaltyGrantConsumeShadowNormalizer({
        ...validInput(),
        consumeDecision: 'do_not_consume',
      }),
    ).toThrow('consumeDecision is not server-derived');
  });
});
