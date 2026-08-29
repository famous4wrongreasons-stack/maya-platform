import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const LEGACY_LOYALTY_REFUND_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-refund-shadow-bridge/1' as const;

export const LEGACY_LOYALTY_REFUND_CANCELLATION_EVIDENCE = [
  'action_execution',
  'domain_event',
] as const;

export type LegacyLoyaltyRefundCancellationEvidence =
  (typeof LEGACY_LOYALTY_REFUND_CANCELLATION_EVIDENCE)[number];

export class LegacyLoyaltyRefundShadowDto {
  @IsIn([LEGACY_LOYALTY_REFUND_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_REFUND_SHADOW_BRIDGE_CONTRACT;

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
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  provider_record_id!: string;

  @IsString()
  @MaxLength(96)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  original_redemption_execution_id!: string;

  @IsIn(LEGACY_LOYALTY_REFUND_CANCELLATION_EVIDENCE)
  cancellation_evidence_kind!: LegacyLoyaltyRefundCancellationEvidence;

  @IsString()
  @MaxLength(96)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  cancellation_evidence_id!: string;

  @IsInt()
  @Min(1)
  @Max(5_000_000)
  legacy_claimed_refund_points!: number;
}
