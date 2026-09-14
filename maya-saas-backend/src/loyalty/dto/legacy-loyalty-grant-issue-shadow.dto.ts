import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_BRIDGE_CONTRACT =
  'maya.legacy-loyalty-grant-issue-shadow-bridge/1' as const;

export const LEGACY_LOYALTY_GRANT_ISSUE_INITIATORS = [
  'telegram_client',
  'pwa_client',
] as const;

export type LegacyLoyaltyGrantIssueInitiator =
  (typeof LEGACY_LOYALTY_GRANT_ISSUE_INITIATORS)[number];

export class LegacyLoyaltyGrantIssueShadowDto {
  @IsIn([LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof LEGACY_LOYALTY_GRANT_ISSUE_SHADOW_BRIDGE_CONTRACT;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(160)
  external_client_id!: string;

  @IsIn(LEGACY_LOYALTY_GRANT_ISSUE_INITIATORS)
  initiator_kind!: LegacyLoyaltyGrantIssueInitiator;

  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  caller_request_id!: string;

  @IsString()
  @MaxLength(160)
  service_id!: string;

  @IsString()
  @MaxLength(160)
  legacy_claimed_service_title!: string;

  @IsInt()
  @Min(1)
  @Max(5_000_000)
  legacy_claimed_points!: number;
}
