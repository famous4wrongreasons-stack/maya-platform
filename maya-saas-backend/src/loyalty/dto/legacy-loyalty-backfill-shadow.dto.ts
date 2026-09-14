import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export const LEGACY_LOYALTY_BACKFILL_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-backfill-shadow-bridge/1' as const;

export const LEGACY_LOYALTY_BACKFILL_INITIATORS = [
  'lazy_access',
  'admin_batch',
] as const;

export type LegacyLoyaltyBackfillInitiator =
  (typeof LEGACY_LOYALTY_BACKFILL_INITIATORS)[number];

export class LegacyLoyaltyBackfillShadowDto {
  @IsIn([LEGACY_LOYALTY_BACKFILL_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_BACKFILL_SHADOW_BRIDGE_CONTRACT;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(160)
  external_client_id!: string;

  @IsIn(LEGACY_LOYALTY_BACKFILL_INITIATORS)
  initiator_kind!: LegacyLoyaltyBackfillInitiator;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  legacy_claimed_sold_amount_rubles!: number;

  @IsInt()
  @Min(0)
  @Max(5_000_000)
  legacy_claimed_points!: number;
}
