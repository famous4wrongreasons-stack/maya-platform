import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const LEGACY_LOYALTY_EARN_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-earn-shadow-bridge/1' as const;

export class LegacyLoyaltyEarnShadowDto {
  @IsIn([LEGACY_LOYALTY_EARN_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_EARN_SHADOW_BRIDGE_CONTRACT;

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
  @MaxLength(160)
  visit_record_id!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  visit_occurred_on!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  visit_amount_rubles!: number;

  @IsInt()
  @Min(1)
  @Max(5_000_000)
  legacy_claimed_points!: number;
}
