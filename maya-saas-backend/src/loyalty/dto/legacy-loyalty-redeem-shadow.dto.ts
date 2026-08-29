import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const LEGACY_LOYALTY_REDEEM_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-redeem-shadow-bridge/1' as const;

export class LegacyLoyaltyRedeemShadowDto {
  @IsIn([LEGACY_LOYALTY_REDEEM_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_REDEEM_SHADOW_BRIDGE_CONTRACT;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(160)
  external_client_id!: string;

  @IsString()
  @MaxLength(96)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  appointment_execution_id!: string;

  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  provider_record_id!: string;

  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  provider_service_id!: string;

  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:/-]+$/)
  redemption_request_id!: string;

  @IsInt()
  @Min(1)
  @Max(5_000_000)
  legacy_claimed_points!: number;
}
