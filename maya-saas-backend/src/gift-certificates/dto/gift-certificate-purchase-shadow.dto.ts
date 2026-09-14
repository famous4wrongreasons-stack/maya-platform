import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const GIFT_CERTIFICATE_PURCHASE_SHADOW_BRIDGE_CONTRACT =
  'maya.gift-certificate-purchase-shadow-bridge/1' as const;

export const GIFT_CERTIFICATE_PURCHASE_SHADOW_INITIATORS = [
  'telegram_gift_certificate_purchase',
  'pwa_gift_certificate_purchase',
] as const;

export type GiftCertificatePurchaseShadowInitiator =
  (typeof GIFT_CERTIFICATE_PURCHASE_SHADOW_INITIATORS)[number];

export class GiftCertificatePurchaseShadowDto {
  @IsIn([GIFT_CERTIFICATE_PURCHASE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof GIFT_CERTIFICATE_PURCHASE_SHADOW_BRIDGE_CONTRACT;

  @IsIn(GIFT_CERTIFICATE_PURCHASE_SHADOW_INITIATORS)
  initiator!: GiftCertificatePurchaseShadowInitiator;

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
  purchase_intent_ref!: string;

  @IsString()
  @MaxLength(80)
  offer_code!: string;

  @IsString()
  @MaxLength(240)
  @Matches(/^[a-f0-9]{64}$/)
  recipient_subject_ref!: string;
}
