import { IsIn, IsString, MaxLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_BRIDGE_CONTRACT =
  'maya.customer-subscription-renewal-activation-shadow-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_INITIATORS = [
  'provider_webhook',
  'payment_poller',
  'startup_reconciliation',
] as const;

export type CustomerSubscriptionRenewalActivationShadowInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_INITIATORS)[number];

export class CustomerSubscriptionRenewalActivationShadowDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_INITIATORS)
  initiator!: CustomerSubscriptionRenewalActivationShadowInitiator;

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
