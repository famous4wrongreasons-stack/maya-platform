import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_BRIDGE_CONTRACT =
  'maya.customer-subscription-cancellation-shadow-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_INITIATORS = [
  'telegram_client_cancellation',
  'pwa_client_cancellation',
  'staff_cancellation',
] as const;

export type CustomerSubscriptionCancellationShadowInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_INITIATORS)[number];

export class CustomerSubscriptionCancellationShadowDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_INITIATORS)
  initiator!: CustomerSubscriptionCancellationShadowInitiator;

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
  @MaxLength(40)
  requester_identity_provider!: string;

  @IsString()
  @MaxLength(160)
  external_requester_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  cancellation_intent_ref!: string;
}
