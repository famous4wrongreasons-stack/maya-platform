import { ActionContractError } from './action-engine.errors';
import {
  GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
  GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
  GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  resolveGiftCertificatePurchaseOffer,
} from './gift-certificate-purchase-shadow.contract';

export const GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY =
  'gift-certificates.activation.shadow.v1' as const;
export const GIFT_CERTIFICATE_ACTIVATION_SHADOW_INPUT_CONTRACT =
  'maya.activate_gift_certificate-input/1' as const;
export const GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE =
  'p4-06.gift-certificate-activation.shadow-policy.v1' as const;
export const GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION =
  'p4-06.paid-certificate-activation.v1' as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
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

function keyVersion(source: Record<string, unknown>): string {
  const value = source.presentationKeyVersion;
  if (typeof value !== 'string' || !KEY_VERSION_PATTERN.test(value)) {
    throw new ActionContractError(
      'presentationKeyVersion is not a supported server key version',
    );
  }
  return value;
}

function exactNumber(
  source: Record<string, unknown>,
  key: string,
  expected: number,
): number {
  const value = source[key];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value !== expected
  ) {
    throw new ActionContractError(`${key} is not server-derived`);
  }
  return expected;
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

export function giftCertificateActivationShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'canonicalPurchaserClientId',
    'providerClientIdentityHash',
    'checkoutExecutionId',
    'checkoutIdentityHash',
    'purchaseIntentIdentityHash',
    'offerCode',
    'productCode',
    'catalogVersion',
    'offerSnapshotHash',
    'denominationType',
    'nominalAmountKopecks',
    'currency',
    'recipientSubjectHash',
    'expiryDays',
    'expiryPolicyVersion',
    'paymentProvider',
    'providerRequestIdentityHash',
    'providerPaymentIdentityHash',
    'providerPaymentState',
    'providerPaidAt',
    'activationIdentityHash',
    'issuanceIdentityHash',
    'certificateIdentityHash',
    'issuedAt',
    'expiresAt',
    'presentationContractVersion',
    'presentationKeyPolicyVersion',
    'presentationKeyVersion',
    'claimLookupContractVersion',
    'bearerDerivationIdentityHash',
    'activationContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'oneTimeActivationEligible',
    'approvalRequirement',
    'intendedPaymentStatus',
    'intendedCertificateMutation',
    'unknownApplicable',
    'providerWritesRequired',
    'certificateWritePerformed',
    'rawBearerGenerated',
    'rawCodePersisted',
    'redemptionCreated',
  ]);

  const offerCode = opaque(source, 'offerCode');
  const offer = resolveGiftCertificatePurchaseOffer(offerCode);
  if (!offer) throw new ActionContractError('offerCode is not canonical');

  const exactValues: Readonly<Record<string, unknown>> = {
    productCode: offer.productCode,
    catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
    denominationType: offer.denominationType,
    currency: offer.currency,
    expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    paymentProvider: 'yookassa',
    providerPaymentState: 'succeeded',
    presentationContractVersion: GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    presentationKeyPolicyVersion:
      GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    activationContractVersion: GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible_for_one_time_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedPaymentStatus: 'paid',
    intendedCertificateMutation: 'create_paid_certificate',
    unknownApplicable: false,
    providerWritesRequired: false,
    certificateWritePerformed: false,
    rawBearerGenerated: false,
    rawCodePersisted: false,
    redemptionCreated: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  const providerPaidAt = isoInstant(source, 'providerPaidAt');
  const issuedAt = isoInstant(source, 'issuedAt');
  const expiresAt = isoInstant(source, 'expiresAt');
  const expectedExpiry = new Date(
    new Date(issuedAt).getTime() + offer.expiryDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  if (
    providerPaidAt !== issuedAt ||
    expiresAt !== expectedExpiry ||
    source.expiryDays !== offer.expiryDays
  ) {
    throw new ActionContractError('issuance time/expiry is not server-derived');
  }

  return {
    canonicalPurchaserClientId: opaque(source, 'canonicalPurchaserClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    checkoutExecutionId: opaque(source, 'checkoutExecutionId'),
    checkoutIdentityHash: opaque(source, 'checkoutIdentityHash'),
    purchaseIntentIdentityHash: opaque(source, 'purchaseIntentIdentityHash'),
    offerCode: offer.offerCode,
    productCode: offer.productCode,
    catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
    offerSnapshotHash: opaque(source, 'offerSnapshotHash'),
    denominationType: offer.denominationType,
    nominalAmountKopecks: exactNumber(
      source,
      'nominalAmountKopecks',
      offer.nominalAmountKopecks,
    ),
    currency: offer.currency,
    recipientSubjectHash: opaque(source, 'recipientSubjectHash'),
    expiryDays: exactNumber(source, 'expiryDays', offer.expiryDays),
    expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    paymentProvider: 'yookassa',
    providerRequestIdentityHash: opaque(source, 'providerRequestIdentityHash'),
    providerPaymentIdentityHash: opaque(source, 'providerPaymentIdentityHash'),
    providerPaymentState: 'succeeded',
    providerPaidAt,
    activationIdentityHash: opaque(source, 'activationIdentityHash'),
    issuanceIdentityHash: opaque(source, 'issuanceIdentityHash'),
    certificateIdentityHash: opaque(source, 'certificateIdentityHash'),
    issuedAt,
    expiresAt,
    presentationContractVersion: GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    presentationKeyPolicyVersion:
      GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
    presentationKeyVersion: keyVersion(source),
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    bearerDerivationIdentityHash: opaque(
      source,
      'bearerDerivationIdentityHash',
    ),
    activationContractVersion: GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible_for_one_time_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedPaymentStatus: 'paid',
    intendedCertificateMutation: 'create_paid_certificate',
    unknownApplicable: false,
    providerWritesRequired: false,
    certificateWritePerformed: false,
    rawBearerGenerated: false,
    rawCodePersisted: false,
    redemptionCreated: false,
  };
}
