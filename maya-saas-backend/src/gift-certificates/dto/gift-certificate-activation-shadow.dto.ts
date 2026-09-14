import { IsIn, IsString, MaxLength } from 'class-validator';

export const GIFT_CERTIFICATE_ACTIVATION_SHADOW_BRIDGE_CONTRACT =
  'maya.gift-certificate-activation-shadow-bridge/1' as const;

export const GIFT_CERTIFICATE_ACTIVATION_SHADOW_INITIATORS = [
  'provider_webhook',
  'payment_poller',
  'startup_reconciliation',
] as const;

export type GiftCertificateActivationShadowInitiator =
  (typeof GIFT_CERTIFICATE_ACTIVATION_SHADOW_INITIATORS)[number];

export class GiftCertificateActivationShadowDto {
  @IsIn([GIFT_CERTIFICATE_ACTIVATION_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof GIFT_CERTIFICATE_ACTIVATION_SHADOW_BRIDGE_CONTRACT;

  @IsIn(GIFT_CERTIFICATE_ACTIVATION_SHADOW_INITIATORS)
  initiator!: GiftCertificateActivationShadowInitiator;

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
  checkout_execution_id!: string;
}
