import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const GIFT_CERTIFICATE_REDEMPTION_SHADOW_BRIDGE_CONTRACT =
  'maya.gift-certificate-redemption-shadow-bridge/1' as const;

export const GIFT_CERTIFICATE_REDEMPTION_SHADOW_INITIATORS = [
  'cashier_redeem',
  'admin_redeem',
] as const;

export type GiftCertificateRedemptionShadowInitiator =
  (typeof GIFT_CERTIFICATE_REDEMPTION_SHADOW_INITIATORS)[number];

export class GiftCertificateRedemptionShadowDto {
  @IsIn([GIFT_CERTIFICATE_REDEMPTION_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof GIFT_CERTIFICATE_REDEMPTION_SHADOW_BRIDGE_CONTRACT;

  @IsIn(GIFT_CERTIFICATE_REDEMPTION_SHADOW_INITIATORS)
  initiator!: GiftCertificateRedemptionShadowInitiator;

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

  @IsString()
  @MaxLength(160)
  target_external_client_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  target_external_record_id!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9_-]+$/)
  certificate_claim!: string;

  @IsIn(['full'])
  redemption_mode!: 'full';
}
