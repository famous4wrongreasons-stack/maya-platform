import { ActionPolicyDecision } from '@prisma/client';

import { ActionContractError } from './action-engine.errors';
import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY,
  giftCertificatePurchaseShadowNormalizer,
  resolveGiftCertificatePurchaseOffer,
} from './gift-certificate-purchase-shadow.contract';

const exactInput = () => ({
  providerClientSource: 'yclients',
  canonicalPurchaserClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  purchaseIntentIdentityHash: 'purchase-intent-hash',
  recipientSubjectHash: 'recipient-subject-hash',
  checkoutIdentityHash: 'checkout-identity-hash',
  canonicalOfferId: 'certificate-offer-id',
  offerValueVersionId: 'certificate-version-id',
  offerValueSnapshotHash: 'certificate-value-snapshot-hash',
  offerCode: 'gift-certificate.3000',
  productCode: 'digital-gift-certificate',
  catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  offerSnapshotHash: 'offer-snapshot-hash',
  denominationType: 'fixed_money',
  nominalAmountKopecks: 300_000,
  currency: 'RUB',
  expiryDays: 365,
  expiryPolicyVersion: 'p4-06.fixed-365-days.v1',
  paymentProvider: 'yookassa',
  providerRequestIdentitySeedHash: 'provider-request-seed-hash',
  checkoutContractVersion: 'p4-06.gift-certificate-checkout.v1',
  intendedCertificateSemantics: 'transferable_bearer_full_value',
  redemptionMode: 'full_only',
  presentationContractVersion: 'gift-certificate-presentation.v1',
  presentationKeyPolicyVersion: 'p4-06.presentation-key-selection.v1',
  claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
  policyProfile: 'p4-06.gift-certificate-purchase.shadow-policy.v1',
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible',
  approvalRequirement: 'NONE',
  expectedProviderState: 'PENDING',
  unknownApplicable: false,
  intendedProviderOperation: 'provider_checkout_create',
  createsCertificate: false,
  issuesBearer: false,
});

describe('P4-06 gift certificate purchase Shadow contract', () => {
  it('resolves only the three server-owned legacy certificate offers', () => {
    expect(
      resolveGiftCertificatePurchaseOffer('gift-certificate.2000'),
    ).toMatchObject({
      nominalAmountKopecks: 200_000,
      currency: 'RUB',
      expiryDays: 365,
    });
    expect(
      resolveGiftCertificatePurchaseOffer('GIFT-CERTIFICATE.5000'),
    ).toMatchObject({
      nominalAmountKopecks: 500_000,
      currency: 'RUB',
      expiryDays: 365,
    });
    expect(
      resolveGiftCertificatePurchaseOffer('gift-certificate.9999'),
    ).toBeUndefined();
  });

  it('normalizes the exact checkout-only value and presentation plan', () => {
    expect(giftCertificatePurchaseShadowNormalizer(exactInput())).toEqual(
      exactInput(),
    );
  });

  it.each([
    ['nominalAmountKopecks', 500_001],
    ['currency', 'USD'],
    ['expiryDays', 366],
    ['offerCode', 'gift-certificate.9999'],
    ['expectedProviderState', 'UNKNOWN'],
    ['unknownApplicable', true],
    ['createsCertificate', true],
    ['issuesBearer', true],
    ['presentationKeyPolicyVersion', 'attacker-key'],
    ['eligibilityDecision', 'caller-approved'],
  ])('rejects non-canonical %s', (key, value) => {
    expect(() =>
      giftCertificatePurchaseShadowNormalizer({
        ...exactInput(),
        [key]: value,
      }),
    ).toThrow(ActionContractError);
  });

  it('rejects caller authority and raw bearer additions', () => {
    for (const extra of [
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'provider.direct' },
      { certificateCode: 'RAW-CODE' },
      { bearer: 'RAW-BEARER' },
      { presentationKey: 'RAW-KEY' },
    ]) {
      expect(() =>
        giftCertificatePurchaseShadowNormalizer({ ...exactInput(), ...extra }),
      ).toThrow(ActionContractError);
    }
  });

  it('registers an L2.5 non-executable canonical ingress capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY,
    );

    expect(capability).toMatchObject({
      actionClass: 'initiate_gift_certificate_purchase',
      targetKind: 'gift_certificate_checkout',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
      retry: { maxExecutionAttempts: 1 },
      reconciliation: { retryAfterProvenNonExecution: false },
    });
  });
});
