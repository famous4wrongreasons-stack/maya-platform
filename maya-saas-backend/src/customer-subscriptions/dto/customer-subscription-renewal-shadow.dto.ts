import { IsIn, IsString, MaxLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_BRIDGE_CONTRACT =
  'maya.customer-subscription-renewal-shadow-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_INITIATORS = [
  'telegram_subscription_renewal',
  'pwa_subscription_renewal',
] as const;

export type CustomerSubscriptionRenewalShadowInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_INITIATORS)[number];

export class CustomerSubscriptionRenewalShadowDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_INITIATORS)
  initiator!: CustomerSubscriptionRenewalShadowInitiator;

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
  subscription_id!: string;

  @IsString()
  @MaxLength(160)
  renewal_intent_ref!: string;
}
