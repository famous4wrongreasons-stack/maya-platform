import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const REFERRAL_REWARD_FULFILL_SHADOW_BRIDGE_CONTRACT =
  'maya.referral-reward-fulfill-shadow-bridge/1' as const;

export const REFERRAL_REWARD_FULFILL_SHADOW_INITIATORS = [
  'cashier_claim',
  'admin_claim',
  'client_claim',
] as const;

export type ReferralRewardFulfillShadowInitiator =
  (typeof REFERRAL_REWARD_FULFILL_SHADOW_INITIATORS)[number];

export class ReferralRewardFulfillShadowDto {
  @IsIn([REFERRAL_REWARD_FULFILL_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof REFERRAL_REWARD_FULFILL_SHADOW_BRIDGE_CONTRACT;

  @IsIn(REFERRAL_REWARD_FULFILL_SHADOW_INITIATORS)
  initiator!: ReferralRewardFulfillShadowInitiator;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(40)
  requester_identity_provider!: string;

  @IsString()
  @MaxLength(160)
  external_requester_id!: string;

  @IsString()
  @MaxLength(160)
  recipient_external_client_id!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9-]+$/)
  reward_claim!: string;

  @IsInt()
  @Min(0)
  @Max(50_000)
  legacy_claimed_value_kopecks!: number;

  @IsBoolean()
  legacy_claimed_fulfilled!: boolean;
}
