import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export const REFERRAL_REWARD_ISSUE_SHADOW_BRIDGE_CONTRACT =
  'maya.referral-reward-issue-shadow-bridge/1' as const;

export const REFERRAL_REWARD_ISSUE_SHADOW_INITIATORS = [
  'qualified_resolution',
  'scheduled_convergence',
  'admin_convergence',
] as const;

export type ReferralRewardIssueShadowInitiator =
  (typeof REFERRAL_REWARD_ISSUE_SHADOW_INITIATORS)[number];

export class ReferralRewardIssueShadowDto {
  @IsIn([REFERRAL_REWARD_ISSUE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof REFERRAL_REWARD_ISSUE_SHADOW_BRIDGE_CONTRACT;

  @IsIn(REFERRAL_REWARD_ISSUE_SHADOW_INITIATORS)
  initiator!: ReferralRewardIssueShadowInitiator;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(160)
  referrer_external_client_id!: string;

  @IsString()
  @MaxLength(160)
  referred_external_client_id!: string;

  @IsOptional()
  @IsInt()
  legacy_claimed_inviter_reward_kopecks?: number;

  @IsOptional()
  @IsInt()
  legacy_claimed_invitee_reward_kopecks?: number;
}
