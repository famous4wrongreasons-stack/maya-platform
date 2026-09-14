import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_BRIDGE_CONTRACT =
  'maya.customer-subscription-revocation-shadow-bridge/1' as const;

export const CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_INITIATORS = [
  'owner_revocation_decision',
  'admin_revocation_decision',
] as const;

export type CustomerSubscriptionRevocationShadowInitiator =
  (typeof CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_INITIATORS)[number];

export class CustomerSubscriptionRevocationShadowDto {
  @IsIn([CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_BRIDGE_CONTRACT])
  contract!: typeof CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_BRIDGE_CONTRACT;

  @IsIn(CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_INITIATORS)
  initiator!: CustomerSubscriptionRevocationShadowInitiator;

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
  revocation_decision_ref!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  revocation_evidence_ref!: string;
}
