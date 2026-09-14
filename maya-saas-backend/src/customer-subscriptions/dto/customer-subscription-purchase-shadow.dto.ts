import { IsIn, IsString, MaxLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_BRIDGE_CONTRACT =
  'maya.customer-subscription-purchase-shadow-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_INITIATORS = [
  'telegram_subscription_purchase',
  'pwa_subscription_purchase',
] as const;

export type CustomerSubscriptionPurchaseShadowInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_INITIATORS)[number];

export class CustomerSubscriptionPurchaseShadowDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_INITIATORS)
  initiator!: CustomerSubscriptionPurchaseShadowInitiator;

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
}
