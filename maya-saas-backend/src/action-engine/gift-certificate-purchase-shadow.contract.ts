import { ActionContractError } from './action-engine.errors';

export const GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY =
  'gift-certificates.purchase.shadow.v1' as const;
export const GIFT_CERTIFICATE_PURCHASE_SHADOW_INPUT_CONTRACT =
  'maya.initiate_gift_certificate_purchase-input/1' as const;
export const GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE =
  'p4-06.gift-certificate-purchase.shadow-policy.v1' as const;
export const GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION =
  'p4-06.legacy-fixed-catalog.v1' as const;
export const GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION =
  'p4-06.gift-certificate-checkout.v1' as const;
export const GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION =
  'p4-06.fixed-365-days.v1' as const;
export const GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION =
  'gift-certificate-presentation.v1' as const;
export const GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION =
  'p4-06.presentation-key-selection.v1' as const;
export const GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION =
  'giftCertificateClaimLookup.v1' as const;

export interface GiftCertificatePurchaseOffer {
  offerCode:
    'gift-certificate.2000' | 'gift-certificate.3000' | 'gift-certificate.5000';
  productCode: 'digital-gift-certificate';
  denominationType: 'fixed_money';
  nominalAmountKopecks: 200_000 | 300_000 | 500_000;
  currency: 'RUB';
  expiryDays: 365;
}

export const GIFT_CERTIFICATE_PURCHASE_OFFERS: Readonly<
  Record<string, GiftCertificatePurchaseOffer>
> = Object.freeze({
  'gift-certificate.2000': Object.freeze({
    offerCode: 'gift-certificate.2000',
    productCode: 'digital-gift-certificate',
    denominationType: 'fixed_money',
    nominalAmountKopecks: 200_000,
    currency: 'RUB',
    expiryDays: 365,
  }),
  'gift-certificate.3000': Object.freeze({
    offerCode: 'gift-certificate.3000',
    productCode: 'digital-gift-certificate',
    denominationType: 'fixed_money',
    nominalAmountKopecks: 300_000,
    currency: 'RUB',
    expiryDays: 365,
  }),
  'gift-certificate.5000': Object.freeze({
    offerCode: 'gift-certificate.5000',
    productCode: 'digital-gift-certificate',
    denominationType: 'fixed_money',
    nominalAmountKopecks: 500_000,
    currency: 'RUB',
    expiryDays: 365,
  }),
});

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

export function resolveGiftCertificatePurchaseOffer(
  offerCode: string,
): GiftCertificatePurchaseOffer | undefined {
  return GIFT_CERTIFICATE_PURCHASE_OFFERS[offerCode.trim().toLowerCase()];
}

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

export function giftCertificatePurchaseShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'providerClientSource',
    'canonicalPurchaserClientId',
    'providerClientIdentityHash',
    'purchaseIntentIdentityHash',
    'recipientSubjectHash',
    'checkoutIdentityHash',
    'offerCode',
    'productCode',
    'catalogVersion',
    'offerSnapshotHash',
    'denominationType',
    'nominalAmountKopecks',
    'currency',
    'expiryDays',
    'expiryPolicyVersion',
    'paymentProvider',
    'providerRequestIdentitySeedHash',
    'checkoutContractVersion',
    'intendedCertificateSemantics',
    'redemptionMode',
    'presentationContractVersion',
    'presentationKeyPolicyVersion',
    'claimLookupContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'approvalRequirement',
    'expectedProviderState',
    'unknownApplicable',
    'intendedProviderOperation',
    'createsCertificate',
    'issuesBearer',
  ]);

  const offerCode = opaque(source, 'offerCode');
  const offer = resolveGiftCertificatePurchaseOffer(offerCode);
  if (!offer) {
    throw new ActionContractError('offerCode is not canonical');
  }

  const exactValues: Readonly<Record<string, unknown>> = {
    productCode: offer.productCode,
    catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
    denominationType: offer.denominationType,
    currency: offer.currency,
    expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    paymentProvider: 'yookassa',
    checkoutContractVersion: GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
    intendedCertificateSemantics: 'transferable_bearer_full_value',
    redemptionMode: 'full_only',
    presentationContractVersion: GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    presentationKeyPolicyVersion:
      GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    createsCertificate: false,
    issuesBearer: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  return {
    providerClientSource: opaque(source, 'providerClientSource'),
    canonicalPurchaserClientId: opaque(source, 'canonicalPurchaserClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    purchaseIntentIdentityHash: opaque(source, 'purchaseIntentIdentityHash'),
    recipientSubjectHash: opaque(source, 'recipientSubjectHash'),
    checkoutIdentityHash: opaque(source, 'checkoutIdentityHash'),
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
    expiryDays: exactNumber(source, 'expiryDays', offer.expiryDays),
    expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    paymentProvider: 'yookassa',
    providerRequestIdentitySeedHash: opaque(
      source,
      'providerRequestIdentitySeedHash',
    ),
    checkoutContractVersion: GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
    intendedCertificateSemantics: 'transferable_bearer_full_value',
    redemptionMode: 'full_only',
    presentationContractVersion: GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    presentationKeyPolicyVersion:
      GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
    claimLookupContractVersion: GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
    policyProfile: GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    createsCertificate: false,
    issuesBearer: false,
  };
}
