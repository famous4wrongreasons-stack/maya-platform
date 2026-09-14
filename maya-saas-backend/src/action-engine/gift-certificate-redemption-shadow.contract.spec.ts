import { ActionPolicyDecision } from '@prisma/client';

import { ActionContractError } from './action-engine.errors';
import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY,
  giftCertificateRedemptionShadowNormalizer,
} from './gift-certificate-redemption-shadow.contract';

const input = () => ({
  provider: 'yclients',
  canonicalCertificateId: 'certificate-1',
  issuanceIdentityHash: 'issuance-hash',
  issueExecutionId: 'activation-execution-1',
  recipientSubjectHash: 'recipient-subject-hash',
  offerSnapshotHash: 'offer-snapshot-hash',
  certificateOwnershipSemantics: 'tenant_transferable_bearer_liability',
  purchaserIsRedemptionOwner: false,
  recipientSubjectIsClientIdentity: false,
  certificateIdentityHash: 'certificate-identity-hash',
  claimBindingHash: 'claim-binding-hash',
  claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
  presentationKeyVersion: 'gift-cert-v1',
  nominalAmountKopecks: 300_000,
  currency: 'RUB',
  issuedAt: '2026-09-02T10:15:30.000Z',
  paidAt: '2026-09-02T10:15:30.000Z',
  expiresAt: '2030-09-02T10:15:30.000Z',
  targetContractVersion:
    'p4-06.gift-certificate-redemption-target.appointment.v1',
  targetKind: 'appointment_service_bundle',
  targetAppointmentId: 'appointment-1',
  targetClientId: 'client-7',
  targetClientIdentityHash: 'target-client-hash',
  targetRefHash: 'target-ref-hash',
  providerRecordIdentity: 'record-11',
  providerVisitIdentity: 'visit-12',
  serviceIds: ['service-1', 'service-2'],
  targetAmountKopecks: 350_000,
  targetCurrency: 'RUB',
  requesterIdentityHash: 'requester-hash',
  requesterRole: 'manager',
  requesterAuthority: 'server_cashier_allowlist',
  redemptionIdentityHash: 'redemption-identity-hash',
  redemptionContractVersion: 'p4-06.full-gift-certificate-redemption.v1',
  policyProfile: 'p4-06.gift-certificate-redemption.shadow-policy.v1',
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible_for_full_redemption',
  redemptionMode: 'full_only',
  intendedValueApplication: 'consume_entire_certificate_nominal',
  approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
  providerBoundary: 'LOCAL_ONLY',
  unknownApplicable: false,
  reconciliationContract: 'p4-06.local-full-redemption-reconciliation.v1',
  existingRedemptionDecision: 'none',
  intendedRedemptionMutation: 'insert_full_redemption_claim',
  redemptionWritePerformed: false,
  certificateValueMutationPerformed: false,
  loyaltyTransactionCreated: false,
  paymentMutationPerformed: false,
  providerWritesRequired: false,
  rawBearerPersisted: false,
});

describe('gift certificate redemption Shadow contract', () => {
  it('normalizes one exact full-only local redemption plan', () => {
    expect(giftCertificateRedemptionShadowNormalizer(input())).toEqual(input());
  });

  it.each([
    ['redemptionMode', 'partial'],
    ['nominalAmountKopecks', 0],
    ['currency', 'USD'],
    ['targetCurrency', 'USD'],
    ['presentationKeyVersion', 'bad version'],
    ['approvalRequirement', 'CALLER_APPROVED'],
    ['providerBoundary', 'YCLIENTS_WRITE'],
    ['unknownApplicable', true],
    ['existingRedemptionDecision', 'redeemed'],
    ['redemptionWritePerformed', true],
    ['certificateValueMutationPerformed', true],
    ['loyaltyTransactionCreated', true],
    ['providerWritesRequired', true],
    ['rawBearerPersisted', true],
  ])('rejects non-canonical %s', (key, value) => {
    expect(() =>
      giftCertificateRedemptionShadowNormalizer({
        ...input(),
        [key]: value,
      }),
    ).toThrow(ActionContractError);
  });

  it('rejects raw bearer, local lookup hash, caller authority, and partial value', () => {
    for (const forged of [
      { certificate_claim: 'MAYA-GC-SECRET' },
      { bearer: 'MAYA-GC-SECRET' },
      { code: 'MAYA-GC-SECRET' },
      { codeHash: 'lookup-hash' },
      { presentationKey: 'raw-key' },
      { partialAmountKopecks: 1 },
      { actorAuthority: 'owner' },
      { policyDecision: 'ALLOW' },
      { executor: 'legacy.direct' },
    ]) {
      expect(() =>
        giftCertificateRedemptionShadowNormalizer({
          ...input(),
          ...forged,
        }),
      ).toThrow(ActionContractError);
    }
  });

  it('rejects changed lifecycle and unsorted/duplicate service evidence', () => {
    for (const changed of [
      { paidAt: '2026-09-02T10:15:31.000Z' },
      { expiresAt: '2025-09-02T10:15:30.000Z' },
      { serviceIds: ['service-2', 'service-1'] },
      { serviceIds: ['service-1', 'service-1'] },
      { serviceIds: [] },
    ]) {
      expect(() =>
        giftCertificateRedemptionShadowNormalizer({
          ...input(),
          ...changed,
        }),
      ).toThrow(ActionContractError);
    }
  });

  it('registers only a physically non-executable local L2.5 capability', () => {
    const registered = new ActionCapabilityRegistry().get(
      GIFT_CERTIFICATE_REDEMPTION_SHADOW_CAPABILITY,
    );

    expect(registered).toMatchObject({
      actionClass: 'redeem_gift_certificate',
      targetKind: 'gift_certificate',
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
    });
    expect(registered.retry.maxExecutionAttempts).toBe(1);
    expect(registered.reconciliation.retryAfterProvenNonExecution).toBe(false);
  });
});
