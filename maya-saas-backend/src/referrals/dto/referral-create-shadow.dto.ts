import { IsIn, IsString, MaxLength } from 'class-validator';

export const REFERRAL_CREATE_SHADOW_BRIDGE_CONTRACT =
  'maya.referral-create-shadow-bridge/1' as const;

export const REFERRAL_CREATE_SHADOW_INITIATORS = [
  'telegram_referral_start',
  'webhook',
  'background_job',
] as const;

export type ReferralCreateShadowInitiator =
  (typeof REFERRAL_CREATE_SHADOW_INITIATORS)[number];

export class ReferralCreateShadowDto {
  @IsIn([REFERRAL_CREATE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof REFERRAL_CREATE_SHADOW_BRIDGE_CONTRACT;

  @IsIn(REFERRAL_CREATE_SHADOW_INITIATORS)
  initiator!: ReferralCreateShadowInitiator;

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
}
