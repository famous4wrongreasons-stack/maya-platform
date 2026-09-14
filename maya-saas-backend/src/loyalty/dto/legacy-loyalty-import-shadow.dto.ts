import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export const LEGACY_LOYALTY_IMPORT_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-import-shadow-bridge/1' as const;

export class LegacyLoyaltyImportShadowDto {
  @IsIn([LEGACY_LOYALTY_IMPORT_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_IMPORT_SHADOW_BRIDGE_CONTRACT;

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
  @Min(0)
  @Max(5_000_000)
  legacy_claimed_provider_balance_points!: number;

  @IsInt()
  @Min(0)
  @Max(5_000_000)
  legacy_claimed_current_balance_points!: number;

  @IsInt()
  @Min(-5_000_000)
  @Max(5_000_000)
  legacy_claimed_delta_points!: number;
}
