import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export const LEGACY_LOYALTY_EXPIRE_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-expire-shadow-bridge/1' as const;

export class LegacyLoyaltyExpireShadowDto {
  @IsIn([LEGACY_LOYALTY_EXPIRE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_EXPIRE_SHADOW_BRIDGE_CONTRACT;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(160)
  external_client_id!: string;

  @IsInt()
  @Min(1)
  @Max(5_000_000)
  legacy_claimed_balance_points!: number;
}
