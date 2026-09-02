import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  type ActionExecution,
} from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  YooKassaClientService,
  type YooKassaPayment,
} from '../billing/yookassa-client.service';
import {
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_BRIDGE_CONTRACT,
  GiftCertificateActivationShadowDto,
} from './dto/gift-certificate-activation-shadow.dto';
import { GiftCertificateActivationShadowService } from './gift-certificate-activation-shadow.service';

const validDto = (): GiftCertificateActivationShadowDto => ({
  contract: GIFT_CERTIFICATE_ACTIVATION_SHADOW_BRIDGE_CONTRACT,
  initiator: 'provider_webhook',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  checkout_execution_id: 'checkout-execution-1',
});

const checkoutSafeResult = () => ({
  checkoutMode: 'gift_certificate_purchase',
  canonicalPurchaserClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  checkoutIdentityHash: 'checkout-identity-hash',
  purchaseIntentIdentityHash: 'purchase-intent-hash',
  offerCode: 'gift-certificate.3000',
  productCode: 'digital-gift-certificate',
  catalogVersion: 'p4-06.legacy-fixed-catalog.v1',
  offerSnapshotHash: 'offer-snapshot-hash',
  denominationType: 'fixed_money',
  nominalAmountKopecks: 300_000,
  currency: 'RUB',
  recipientSubjectHash: 'recipient-subject-hash',
  expiryDays: 365,
  expiryPolicyVersion: 'p4-06.fixed-365-days.v1',
  paymentProvider: 'yookassa',
  providerRequestIdentityHash: 'provider-request-hash',
  checkoutContractVersion: 'p4-06.gift-certificate-checkout.v1',
  intendedCertificateSemantics: 'transferable_bearer_full_value',
  redemptionMode: 'full_only',
  presentationContractVersion: 'gift-certificate-presentation.v1',
  presentationKeyPolicyVersion: 'p4-06.presentation-key-selection.v1',
  claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
});

const checkoutExecution = () => ({
  id: 'checkout-execution-1',
  actionClass: 'initiate_gift_certificate_purchase',
  state: ActionExecutionState.SUCCEEDED,
  dryRun: false,
  policyDecision: ActionPolicyDecision.ALLOW,
  finalOutcomeCode: 'provider_checkout_created',
  safeResultSummaryJson: checkoutSafeResult(),
});

const providerPayment = (): YooKassaPayment => ({
  id: 'provider-payment-1',
  status: 'succeeded',
  paid: true,
  amount: { value: '3000.00', currency: 'RUB' },
  captured_at: '2026-09-02T10:15:30.000Z',
  metadata: {
    tenant_id: 'tenant-a',
    checkout_execution_id: 'checkout-execution-1',
    checkout_identity_hash: 'checkout-identity-hash',
    canonical_purchaser_client_id: 'client-7',
    offer_snapshot_hash: 'offer-snapshot-hash',
    recipient_subject_hash: 'recipient-subject-hash',
  },
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'certificate-activation-shadow-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    unlinkedAt: null,
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findCheckout = jest.fn().mockResolvedValue(checkoutExecution());
  const findAttempt = jest.fn().mockResolvedValue({
    providerRequestIdentityHash: 'provider-request-hash',
    providerReferenceEncrypted: 'encrypted-provider-payment-1',
    providerReferenceHash: 'provider-payment-reference-hash',
  });
  const findClaim = jest.fn().mockResolvedValue(null);
  const checkCrmClientRegistrationGuard = jest
    .fn()
    .mockResolvedValue({ allowed: true, reasonCode: null });
  const getPayment: jest.MockedFunction<YooKassaClientService['getPayment']> =
    jest.fn().mockResolvedValue(providerPayment());
  const decrypt = jest.fn().mockReturnValue('provider-payment-1');
  const getConfig = jest.fn((key: string) =>
    key === 'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION'
      ? 'gift-cert-v1'
      : undefined,
  );
  const bridgeSource = {
    assertBridgeSecret: jest.fn(),
    assertBridgeIntegrationBinding: jest.fn().mockReturnValue({
      provider: 'yclients',
      externalCompanyId: 'company-42',
    }),
    resolveTenantByIntegration: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      slug: 'tenant-a',
      resolvedBy: 'integration',
    }),
  };
  const runAsSystemTenant = jest.fn(
    (_tenantId: string, callback: () => unknown) => callback(),
  );
  const service = new GiftCertificateActivationShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      actionExecution: { findUnique: findCheckout },
      actionAttempt: { findFirst: findAttempt },
      giftCertificate: { findFirst: findClaim },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
    { decrypt } as unknown as EncryptionService,
    { getPayment } as unknown as YooKassaClientService,
    { get: getConfig } as unknown as ConfigService,
  );

  return {
    service,
    planShadow,
    findLink,
    findCheckout,
    findAttempt,
    findClaim,
    checkCrmClientRegistrationGuard,
    getPayment,
    decrypt,
    getConfig,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('GiftCertificateActivationShadowService', () => {
  const originalEnabled =
    process.env.MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED;
    } else {
      process.env.MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED =
        originalEnabled;
    }
  });

  it('plans one exact paid certificate activation without value mutation', async () => {
    const setup = buildHarness();

    const result = await setup.service.planActivation(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'certificate-activation-shadow-1',
      shadowDivergences: 0,
      intendedActivation: {
        model: 'GiftCertificate',
        intendedPaymentStatus: 'paid',
        canonicalPurchaserClientId: 'client-7',
        checkoutExecutionId: 'checkout-execution-1',
        offerCode: 'gift-certificate.3000',
        nominalAmountKopecks: 300_000,
        currency: 'RUB',
        recipientSubjectHash: 'recipient-subject-hash',
        issuedAt: '2026-09-02T10:15:30.000Z',
        expiresAt: '2027-09-02T10:15:30.000Z',
        presentationContractVersion: 'gift-certificate-presentation.v1',
        presentationKeyPolicyVersion: 'p4-06.presentation-key-selection.v1',
        presentationKeyVersion: 'gift-cert-v1',
        claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
        oneTimeActivationEligible: true,
        approvalRequirement: 'NONE',
        providerWritesRequired: false,
        unknownApplicable: false,
        certificateWritePerformed: false,
        rawBearerGenerated: false,
        rawCodePersisted: false,
        redemptionCreated: false,
      },
      certificatesCreatedOrActivatedByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      paymentProviderValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'gift-certificates.activation.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-gift-certificate:payment-evidence',
      },
      input: {
        canonicalPurchaserClientId: 'client-7',
        checkoutExecutionId: 'checkout-execution-1',
        providerPaymentState: 'succeeded',
        nominalAmountKopecks: 300_000,
        currency: 'RUB',
        presentationKeyVersion: 'gift-cert-v1',
        intendedPaymentStatus: 'paid',
        unknownApplicable: false,
        providerWritesRequired: false,
        certificateWritePerformed: false,
        rawBearerGenerated: false,
        rawCodePersisted: false,
        redemptionCreated: false,
      },
      callerIdempotency: {
        scope: 'p4-06.activate-gift-certificate.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(5);
    expect(setup.getPayment).toHaveBeenCalledWith('provider-payment-1');
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('converges retry and restart to the same certificate/activation identity', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planActivation(validDto());
    await first.service.planActivation(validDto());
    await restarted.service.planActivation(validDto());

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('converges webhook, poller, and restart initiators', async () => {
    const setup = buildHarness();

    for (const initiator of [
      'provider_webhook',
      'payment_poller',
      'startup_reconciliation',
    ] as const) {
      await setup.service.planActivation({ ...validDto(), initiator });
    }

    expect(setup.planShadow.mock.calls[1]?.[0]).toEqual(
      setup.planShadow.mock.calls[0]?.[0],
    );
    expect(setup.planShadow.mock.calls[2]?.[0]).toEqual(
      setup.planShadow.mock.calls[0]?.[0],
    );
  });

  it.each(['pending', 'waiting_for_capture'])(
    'does not activate a known %s payment',
    async (status) => {
      const setup = buildHarness();
      setup.getPayment.mockResolvedValue({
        ...providerPayment(),
        status,
        paid: false,
        captured_at: undefined,
      });

      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({
        outcome: 'payment_pending',
        intendedActivation: null,
      });
      expect(setup.planShadow).not.toHaveBeenCalled();
    },
  );

  it('does not activate an UNKNOWN checkout or provider outcome', async () => {
    const unknownCheckout = buildHarness();
    unknownCheckout.findCheckout.mockResolvedValue({
      ...checkoutExecution(),
      state: ActionExecutionState.UNKNOWN,
    });
    await expect(
      unknownCheckout.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_unknown' });
    expect(unknownCheckout.getPayment).not.toHaveBeenCalled();
    expect(unknownCheckout.planShadow).not.toHaveBeenCalled();

    const unknownProvider = buildHarness();
    unknownProvider.getPayment.mockResolvedValue({
      ...providerPayment(),
      status: 'unknown',
      paid: false,
    });
    await expect(
      unknownProvider.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_unknown' });
    expect(unknownProvider.planShadow).not.toHaveBeenCalled();
  });

  it.each(['failed', 'canceled', 'cancelled'])(
    'does not activate a %s payment',
    async (status) => {
      const setup = buildHarness();
      setup.getPayment.mockResolvedValue({
        ...providerPayment(),
        status,
        paid: false,
        captured_at: undefined,
      });

      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'payment_not_succeeded' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    },
  );

  it('rejects wrong checkout contract and payment evidence', async () => {
    const wrongCheckout = buildHarness();
    wrongCheckout.findCheckout.mockResolvedValue({
      ...checkoutExecution(),
      actionClass: 'initiate_customer_subscription_purchase',
    });
    await expect(
      wrongCheckout.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'checkout_not_activatable' });

    const wrongRequest = buildHarness();
    wrongRequest.findAttempt.mockResolvedValue({
      providerRequestIdentityHash: 'wrong-request-hash',
      providerReferenceEncrypted: 'encrypted-provider-payment-1',
      providerReferenceHash: 'provider-payment-reference-hash',
    });
    await expect(
      wrongRequest.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_evidence_mismatch' });

    for (const payment of [
      { ...providerPayment(), id: 'other-payment' },
      {
        ...providerPayment(),
        amount: { value: '1.00', currency: 'RUB' },
      },
      {
        ...providerPayment(),
        metadata: {
          ...providerPayment().metadata,
          checkout_execution_id: 'other-checkout',
        },
      },
      {
        ...providerPayment(),
        metadata: {
          ...providerPayment().metadata,
          recipient_subject_hash: 'other-recipient',
        },
      },
    ]) {
      const setup = buildHarness();
      setup.getPayment.mockResolvedValue(payment);
      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'payment_evidence_mismatch' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects wrong Client, tenant-scoped absence, unlinked, and merged identity', async () => {
    for (const link of [
      null,
      {
        unlinkedAt: new Date('2026-01-01T00:00:00Z'),
        client: { id: 'client-7', mergedIntoClientId: null },
      },
      {
        unlinkedAt: null,
        client: { id: 'client-7', mergedIntoClientId: 'client-winner' },
      },
    ]) {
      const setup = buildHarness();
      setup.findLink.mockResolvedValue(link);
      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'identity_unresolved' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }

    const mismatched = buildHarness();
    mismatched.findCheckout.mockResolvedValue({
      ...checkoutExecution(),
      safeResultSummaryJson: {
        ...checkoutSafeResult(),
        canonicalPurchaserClientId: 'other-client',
      },
    });
    await expect(
      mismatched.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_evidence_mismatch' });
  });

  it('fails closed for unresolved holds and guard lookup failure', async () => {
    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const setup = buildHarness();
      setup.checkCrmClientRegistrationGuard.mockResolvedValue(decision);

      const result = await setup.service.planActivation(validDto());

      expect(result.outcome).toBe(
        decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : 'identity_guard_unavailable',
      );
      expect(setup.getPayment).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects forged value, payment success, key version, expiry, and authority at DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { paid: true },
      { payment_status: 'succeeded' },
      { price_kopecks: 1 },
      { nominal_amount_kopecks: 1 },
      { value: 1 },
      { currency: 'USD' },
      { expiry_days: 9999 },
      { presentation_key_version: 'attacker-key' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { bearer: 'secret' },
      { code: 'secret' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: GiftCertificateActivationShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('derives a supported presentation key version server-side and fails closed otherwise', async () => {
    const planned = buildHarness();
    await planned.service.planActivation(validDto());
    expect(planned.getConfig).toHaveBeenCalledWith(
      'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION',
    );
    expect(
      planned.planShadow.mock.calls[0]?.[0].input.presentationKeyVersion,
    ).toBe('gift-cert-v1');

    for (const value of [undefined, '', 'unsupported version']) {
      const setup = buildHarness();
      setup.getConfig.mockReturnValue(value);
      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'presentation_key_unavailable' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects an already claimed provider payment or issuance identity', async () => {
    const setup = buildHarness();
    setup.findClaim.mockResolvedValue({ id: 'certificate-existing' });

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'activation_already_claimed' });
    expect(setup.findClaim).toHaveBeenCalledTimes(1);
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed when authoritative provider evidence cannot be read', async () => {
    const setup = buildHarness();
    setup.getPayment.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'provider_evidence_unavailable' });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('queries only acknowledged successful attempt evidence', async () => {
    const setup = buildHarness();

    await setup.service.planActivation(validDto());

    expect(setup.findAttempt).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        actionExecutionId: 'checkout-execution-1',
        state: ActionAttemptState.SUCCEEDED,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
      },
      orderBy: { attemptNumber: 'desc' },
      select: {
        providerRequestIdentityHash: true,
        providerReferenceEncrypted: true,
        providerReferenceHash: true,
      },
    });
  });

  it('is inert while disabled and creates no certificate, code, redemption, or provider/value state', async () => {
    const setup = buildHarness();
    process.env.MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED = 'false';

    const result = await setup.service.planActivation(validDto());

    expect(result).toMatchObject({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      certificatesCreatedOrActivatedByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      paymentProviderValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    expect(setup.findLink).not.toHaveBeenCalled();
    expect(setup.getPayment).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
