import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const REFERRAL_RESOLVE_SHADOW_BRIDGE_CONTRACT =
  'maya.referral-resolve-shadow-bridge/1' as const;

export const REFERRAL_RESOLVE_SHADOW_INITIATORS = [
  'scheduled_resolver',
  'admin_command',
  'owner_panel',
] as const;

export type ReferralResolveShadowInitiator =
  (typeof REFERRAL_RESOLVE_SHADOW_INITIATORS)[number];

export class ReferralResolveShadowDto {
  @IsIn([REFERRAL_RESOLVE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof REFERRAL_RESOLVE_SHADOW_BRIDGE_CONTRACT;

  @IsIn(REFERRAL_RESOLVE_SHADOW_INITIATORS)
  initiator!: ReferralResolveShadowInitiator;

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

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  evaluation_date!: string;

  @IsIn(['succeeded', 'failed', 'not_run'])
  provider_read_status!: 'succeeded' | 'failed' | 'not_run';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  visit_record_id?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  visit_occurred_on?: string;

  @IsOptional()
  @IsInt()
  visit_attendance?: number;

  @IsOptional()
  @IsIn(['qualified', 'expired', 'self_blocked', 'pending'])
  legacy_claimed_outcome?: 'qualified' | 'expired' | 'self_blocked' | 'pending';
}
