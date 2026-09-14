import { ActionPolicyDecision } from '@prisma/client';

import { ActionContractError } from './action-engine.errors';
import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY,
  giftCertificateActivationShadowNormalizer,
} from './gift-certificate-activation-shadow.contract';

const input = () => ({
  canonicalPurchaserClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  checkoutExecutionId: 'checkout-execution-1',
  checkoutIdentityHash: 'checkout-identity-hash',
  purchaseIntentIdentityHash: 'purchase-intent-hash',
  canonicalOfferId: 'certificate-offer-id',
  offerValueVersionId: 'certificate-version-id',
  offerValueSnapshotHash: 'certificate-value-snapshot-hash',
  offerCode: 'gift-certificate.3000',
  productCode: 'digital-gift-certificate',
  catalogVersion: 'p4-09.canonical-offer-authority.v1',
  offerSnapshotHash: 'offer-snapshot-hash',
  denominationType: 'fixed_money',
  nominalAmountKopecks: 300_000,
  currency: 'RUB',
  recipientSubjectHash: 'recipient-subject-hash',
  expiryDays: 365,
  expiryPolicyVersion: 'p4-06.fixed-365-days.v1',
  paymentProvider: 'yookassa',
  providerRequestIdentityHash: 'provider-request-hash',
  providerPaymentIdentityHash: 'provider-payment-hash',
  providerPaymentState: 'succeeded',
  providerPaidAt: '2026-09-02T10:15:30.000Z',
  activationIdentityHash: 'activation-identity-hash',
  issuanceIdentityHash: 'issuance-identity-hash',
  certificateIdentityHash: 'certificate-identity-hash',
  issuedAt: '2026-09-02T10:15:30.000Z',
  expiresAt: '2027-09-02T10:15:30.000Z',
  presentationContractVersion: 'gift-certificate-presentation.v1',
  presentationKeyPolicyVersion: 'p4-06.presentation-key-selection.v1',
  presentationKeyVersion: 'gift-cert-v1',
  claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
  bearerDerivationIdentityHash: 'bearer-derivation-hash',
  activationContractVersion: 'p4-06.paid-certificate-activation.v1',
  policyProfile: 'p4-06.gift-certificate-activation.shadow-policy.v1',
  policySnapshotHash: 'policy-snapshot-hash',
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
});

describe('gift certificate activation Shadow contract', () => {
  it('normalizes one exact paid activation plan without mutation', () => {
    expect(giftCertificateActivationShadowNormalizer(input())).toEqual(input());
  });

  it.each([
    ['nominalAmountKopecks', 500_001],
    ['currency', 'USD'],
    ['expiryDays', 1],
    ['providerPaymentState', 'pending'],
    ['providerPaymentState', 'UNKNOWN'],
    ['presentationKeyVersion', ''],
    ['presentationKeyVersion', 'unsupported version'],
    ['approvalRequirement', 'CALLER_APPROVED'],
    ['oneTimeActivationEligible', false],
    ['unknownApplicable', true],
    ['providerWritesRequired', true],
    ['certificateWritePerformed', true],
    ['rawBearerGenerated', true],
    ['rawCodePersisted', true],
    ['redemptionCreated', true],
  ])('rejects non-canonical %s', (key, value) => {
    expect(() =>
      giftCertificateActivationShadowNormalizer({
        ...input(),
        [key]: value,
      }),
    ).toThrow(ActionContractError);
  });

  it('rejects caller-owned authority and raw bearer/code material', () => {
    for (const forged of [
      { paid: true },
      { payment_success: true },
      { price: 1 },
      { bearer: 'secret' },
      { code: 'secret' },
      { codeHash: 'attacker-hash' },
      { presentationKey: 'raw-key' },
      { actorAuthority: 'owner' },
      { policyDecision: 'ALLOW' },
      { executor: 'legacy.direct' },
    ]) {
      expect(() =>
        giftCertificateActivationShadowNormalizer({
          ...input(),
          ...forged,
        }),
      ).toThrow(ActionContractError);
    }
  });

  it('requires paid time and policy-derived expiry to match exactly', () => {
    expect(() =>
      giftCertificateActivationShadowNormalizer({
        ...input(),
        issuedAt: '2026-09-02T10:15:31.000Z',
      }),
    ).toThrow(ActionContractError);
    expect(() =>
      giftCertificateActivationShadowNormalizer({
        ...input(),
        expiresAt: '2027-09-03T10:15:30.000Z',
      }),
    ).toThrow(ActionContractError);
  });

  it('registers only a physically non-executable L2.5 capability', () => {
    const registered = new ActionCapabilityRegistry().get(
      GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY,
    );

    expect(registered).toMatchObject({
      actionClass: 'activate_gift_certificate',
      targetKind: 'gift_certificate',
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
    });
    expect(registered.retry.maxExecutionAttempts).toBe(1);
  });
});
