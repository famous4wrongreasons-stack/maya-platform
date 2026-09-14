import { IsIn, IsString, MaxLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_BRIDGE_CONTRACT =
  'maya.customer-subscription-usage-shadow-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_INITIATORS = [
  'daily_scheduler',
  'manual_reconciliation',
  'startup_reconciliation',
] as const;

export type CustomerSubscriptionUsageShadowInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_INITIATORS)[number];

export class CustomerSubscriptionUsageShadowDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_INITIATORS)
  initiator!: CustomerSubscriptionUsageShadowInitiator;

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
  visit_record_id!: string;
}
