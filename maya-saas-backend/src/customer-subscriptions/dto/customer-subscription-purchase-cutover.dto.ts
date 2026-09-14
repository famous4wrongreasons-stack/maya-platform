import { IsIn, IsString, MaxLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_BRIDGE_CONTRACT =
  'maya.customer-subscription-purchase-cutover-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_INITIATORS = [
  'telegram_subscription_purchase',
  'pwa_subscription_purchase',
] as const;

export type CustomerSubscriptionPurchaseCutoverInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_INITIATORS)[number];

export class CustomerSubscriptionPurchaseCutoverDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_PURCHASE_CUTOVER_INITIATORS)
  initiator!: CustomerSubscriptionPurchaseCutoverInitiator;

  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  @IsString()
  @MaxLength(16_384)
  channel_proof!: string;

  @IsString()
  @MaxLength(180)
  purchase_intent_ref!: string;

  @IsString()
  @MaxLength(80)
  offer_code!: string;
}
