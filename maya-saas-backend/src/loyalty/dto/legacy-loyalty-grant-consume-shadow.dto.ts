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

export const LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-grant-consume-shadow-bridge/1' as const;

export const LEGACY_LOYALTY_GRANT_CONSUME_INITIATORS = [
  'telegram_cashier',
  'panel_cashier',
] as const;

export type LegacyLoyaltyGrantConsumeInitiator =
  (typeof LEGACY_LOYALTY_GRANT_CONSUME_INITIATORS)[number];

export class LegacyLoyaltyGrantConsumeShadowDto {
  @IsIn([LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_GRANT_CONSUME_SHADOW_BRIDGE_CONTRACT;

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

  @IsIn(LEGACY_LOYALTY_GRANT_CONSUME_INITIATORS)
  initiator_kind!: LegacyLoyaltyGrantConsumeInitiator;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9-]+$/)
  redemption_code!: string;

  @IsInt()
  @Min(1)
  @Max(5_000_000)
  legacy_claimed_points!: number;

  @IsInt()
  @Min(0)
  @Max(5_000_000)
  legacy_claimed_balance_points!: number;

  @IsBoolean()
  legacy_claimed_used!: boolean;

  @IsBoolean()
  legacy_claimed_expired!: boolean;
}
