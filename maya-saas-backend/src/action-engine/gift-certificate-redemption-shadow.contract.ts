import { ActionContractError } from './action-engine.errors';
import { GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION } from './gift-certificate-purchase-shadow.contract';

export const GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY =
  'gift-certificates.redemption.shadow.v1' as const;
export const GIFT_CERTIFICATE_REDEMPTION_SHADOW_INPUT_CONTRACT =
  'maya.redeem_gift_certificate-input/1' as const;
export const GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE =
  'p4-06.gift-certificate-redemption.shadow-policy.v1' as const;
export const GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION =
  'p4-06.full-gift-certificate-redemption.v1' as const;
export const GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT =
  'p4-06.gift-certificate-redemption-target.appointment.v1' as const;
export const GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT =
  'p4-06.local-full-redemption-reconciliation.v1' as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(source).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new ActionContractError(
      `Unexpected action input: ${unexpected.join(', ')}`,
    );
  }
}

function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function nullableOpaque(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be null or an opaque reference`);
  }
  return value;
}

function isoInstant(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (
    typeof value !== 'string' ||
    !ISO_INSTANT_PATTERN.test(value) ||
    Number.isNaN(new Date(value).getTime())
  ) {
    throw new ActionContractError(`${key} must be an ISO instant`);
  }
  return new Date(value).toISOString();
}

function serviceIds(source: Record<string, unknown>): string[] {
  const value = source.serviceIds;
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100 ||
    value.some(
      (item) => typeof item !== 'string' || !OPAQUE_REF_PATTERN.test(item),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new ActionContractError(
      'serviceIds must be a sorted unique server-derived list',
    );
  }
  const ids = value as string[];
  if ([...ids].sort().some((item, index) => item !== ids[index])) {
    throw new ActionContractError(
      'serviceIds must be a sorted unique server-derived list',
    );
  }
  return ids;
}

export function giftCertificateRedemptionShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalCertificateId',
    'issuanceIdentityHash',
    'issueExecutionId',
    'recipientSubjectHash',
    'offerSnapshotHash',
    'certificateOwnershipSemantics',
    'purchaserIsRedemptionOwner',
    'recipientSubjectIsClientIdentity',
    'certificateIdentityHash',
    'claimBindingHash',
    'claimLookupContractVersion',
    'presentationKeyVersion',
    'nominalAmountKopecks',
    'currency',
    'issuedAt',
    'paidAt',
    'expiresAt',
    'targetContractVersion',
    'targetKind',
    'targetAppointmentId',
    'targetClientId',
    'targetClientIdentityHash',
    'targetRefHash',
    'providerRecordIdentity',
    'providerVisitIdentity',
    'serviceIds',
    'targetAmountKopecks',
    'targetCurrency',
    'requesterIdentityHash',
    'requesterRole',
    'requesterAuthority',
    'redemptionIdentityHash',
    'redemptionContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'redemptionMode',
    'intendedValueApplication',
    'approvalRequirement',
    'providerBoundary',
    'unknownApplicable',
    'reconciliationContract',
    'existingRedemptionDecision',
    'intendedRedemptionMutation',
    'redemptionWritePerformed',
    'certificateValueMutationPerformed',
    'loyaltyTransactionCreated',
    'paymentMutationPerformed',
    'providerWritesRequired',
    'rawBearerPersisted',
  ]);

  const exactValues: Readonly<Record<string, unknown>> = {
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
    purchaserIsRedemptionOwner: false,
    recipientSubjectIsClientIdentity: false,
    targetContractVersion: GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
    targetKind: 'appointment_service_bundle',
    redemptionContractVersion: GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible_for_full_redemption',
    redemptionMode: 'full_only',
    intendedValueApplication: 'consume_entire_certificate_nominal',
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    providerBoundary: 'LOCAL_ONLY',
    unknownApplicable: false,
    reconciliationContract: GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
    existingRedemptionDecision: 'none',
    intendedRedemptionMutation: 'insert_full_redemption_claim',
    redemptionWritePerformed: false,
    certificateValueMutationPerformed: false,
    loyaltyTransactionCreated: false,
    paymentMutationPerformed: false,
    providerWritesRequired: false,
    rawBearerPersisted: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  const presentationKeyVersion = source.presentationKeyVersion;
  if (
    typeof presentationKeyVersion !== 'string' ||
    !KEY_VERSION_PATTERN.test(presentationKeyVersion)
  ) {
    throw new ActionContractError('presentationKeyVersion is not canonical');
  }
  const nominalAmountKopecks = source.nominalAmountKopecks;
  const targetAmountKopecks = source.targetAmountKopecks;
  if (
    !Number.isSafeInteger(nominalAmountKopecks) ||
    (nominalAmountKopecks as number) < 1 ||
    !Number.isSafeInteger(targetAmountKopecks) ||
    (targetAmountKopecks as number) < 1
  ) {
    throw new ActionContractError(
      'certificate and target values must be positive',
    );
  }
  if (
    typeof source.currency !== 'string' ||
    !CURRENCY_PATTERN.test(source.currency) ||
    source.targetCurrency !== source.currency
  ) {
    throw new ActionContractError('currency must match the exact target');
  }
  const issuedAt = isoInstant(source, 'issuedAt');
  const paidAt = isoInstant(source, 'paidAt');
  const expiresAt = isoInstant(source, 'expiresAt');
  if (
    issuedAt !== paidAt ||
    new Date(expiresAt).getTime() <= new Date(issuedAt).getTime()
  ) {
    throw new ActionContractError('certificate lifecycle is not canonical');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalCertificateId: opaque(source, 'canonicalCertificateId'),
    issuanceIdentityHash: opaque(source, 'issuanceIdentityHash'),
    issueExecutionId: opaque(source, 'issueExecutionId'),
    recipientSubjectHash: opaque(source, 'recipientSubjectHash'),
    offerSnapshotHash: opaque(source, 'offerSnapshotHash'),
    certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
    purchaserIsRedemptionOwner: false,
    recipientSubjectIsClientIdentity: false,
    certificateIdentityHash: opaque(source, 'certificateIdentityHash'),
    claimBindingHash: opaque(source, 'claimBindingHash'),
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    presentationKeyVersion,
    nominalAmountKopecks,
    currency: source.currency,
    issuedAt,
    paidAt,
    expiresAt,
    targetContractVersion: GIFT_CERTIFICATE_REDEMPTION_TARGET_CONTRACT,
    targetKind: 'appointment_service_bundle',
    targetAppointmentId: opaque(source, 'targetAppointmentId'),
    targetClientId: opaque(source, 'targetClientId'),
    targetClientIdentityHash: opaque(source, 'targetClientIdentityHash'),
    targetRefHash: opaque(source, 'targetRefHash'),
    providerRecordIdentity: opaque(source, 'providerRecordIdentity'),
    providerVisitIdentity: nullableOpaque(source, 'providerVisitIdentity'),
    serviceIds: serviceIds(source),
    targetAmountKopecks,
    targetCurrency: source.currency,
    requesterIdentityHash: opaque(source, 'requesterIdentityHash'),
    requesterRole: opaque(source, 'requesterRole'),
    requesterAuthority: opaque(source, 'requesterAuthority'),
    redemptionIdentityHash: opaque(source, 'redemptionIdentityHash'),
    redemptionContractVersion: GIFT_CERTIFICATE_REDEMPTION_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_REDEMPTION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible_for_full_redemption',
    redemptionMode: 'full_only',
    intendedValueApplication: 'consume_entire_certificate_nominal',
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    providerBoundary: 'LOCAL_ONLY',
    unknownApplicable: false,
    reconciliationContract: GIFT_CERTIFICATE_REDEMPTION_RECONCILIATION_CONTRACT,
    existingRedemptionDecision: 'none',
    intendedRedemptionMutation: 'insert_full_redemption_claim',
    redemptionWritePerformed: false,
    certificateValueMutationPerformed: false,
    loyaltyTransactionCreated: false,
    paymentMutationPerformed: false,
    providerWritesRequired: false,
    rawBearerPersisted: false,
  };
}
