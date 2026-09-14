import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ActionExecutionState, type ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type ActionExecutionPreviewV1,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  GIFT_CERTIFICATE_PURCHASE_SHADOW_BRIDGE_CONTRACT,
  GiftCertificatePurchaseShadowDto,
} from './dto/gift-certificate-purchase-shadow.dto';
import { GiftCertificatePurchaseShadowService } from './gift-certificate-purchase-shadow.service';

const validDto = (): GiftCertificatePurchaseShadowDto => ({
  contract: GIFT_CERTIFICATE_PURCHASE_SHADOW_BRIDGE_CONTRACT,
  initiator: 'telegram_gift_certificate_purchase',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  purchase_intent_ref: 'telegram-update-101',
  offer_code: 'certificate-offer-id',
  recipient_subject_ref: 'a'.repeat(64),
});

function preview(identityFingerprint = 'gift-checkout-fingerprint') {
  return { identityFingerprint } as ActionExecutionPreviewV1;
}

function buildHarness() {
  const previewAction: jest.MockedFunction<
    ActionEngineRuntimeService['preview']
  > = jest.fn().mockResolvedValue(preview());
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'execution-gift-checkout-shadow-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    externalId: 'provider-client-7',
    unlinkedAt: null,
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findConflictingExecution = jest.fn().mockResolvedValue(null);
  const checkCrmClientRegistrationGuard = jest
    .fn()
    .mockResolvedValue({ allowed: true, reasonCode: null });
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
  const resolveCertificateOffer = jest.fn(
    (tenantId: string, offerId: string) =>
      tenantId === 'tenant-a' && offerId === 'certificate-offer-id'
        ? Promise.resolve({
            offerId,
            offerValueVersionId: 'certificate-version-id',
            offerValueVersion: 1,
            templateKey: 'gift-certificate.3000',
            valueSnapshotHash: 'certificate-value-snapshot-hash',
            priceKopecks: 300_000,
            currency: 'RUB' as const,
            kind: 'certificate' as const,
            productCode: 'digital-gift-certificate' as const,
            denominationType: 'fixed_money' as const,
            nominalAmountKopecks: 300_000,
            expiryDays: 365 as const,
          })
        : Promise.reject(new Error('not found')),
  );
  const service = new GiftCertificatePurchaseShadowService(
    {
      preview: previewAction,
      planShadow,
    } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      actionExecution: { findFirst: findConflictingExecution },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
    { resolveCertificateOffer } as never,
  );

  return {
    service,
    previewAction,
    planShadow,
    findLink,
    findConflictingExecution,
    checkCrmClientRegistrationGuard,
    bridgeSource,
    runAsSystemTenant,
    resolveCertificateOffer,
  };
}

describe('GiftCertificatePurchaseShadowService', () => {
  const originalEnabled =
    process.env.MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED;
    } else {
      process.env.MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED =
        originalEnabled;
    }
  });

  it('plans exact server-derived checkout and presentation contracts with no side effect', async () => {
    const setup = buildHarness();

    const result = await setup.service.planPurchase(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-gift-checkout-shadow-1',
      shadowDivergences: 0,
      intendedCheckout: {
        actionClass: 'initiate_gift_certificate_purchase',
        canonicalPurchaserClientId: 'client-7',
        offerCode: 'gift-certificate.3000',
        productCode: 'digital-gift-certificate',
        denominationType: 'fixed_money',
        nominalAmountKopecks: 300_000,
        currency: 'RUB',
        expiryDays: 365,
        expiryPolicyVersion: 'p4-06.fixed-365-days.v1',
        paymentProvider: 'yookassa',
        intendedProviderOperation: 'provider_checkout_create',
        expectedProviderState: 'PENDING',
        presentationContractVersion: 'gift-certificate-presentation.v1',
        presentationKeyPolicyVersion: 'p4-06.presentation-key-selection.v1',
        claimLookupContractVersion: 'giftCertificateClaimLookup.v1',
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
        providerDispatchPerformed: false,
        unknownApplicable: false,
        createsCertificate: false,
        issuesBearer: false,
      },
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      certificatesCreatedOrActivatedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      providerValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'gift-certificates.purchase.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-gift-certificate:initiate-purchase',
      },
      input: {
        canonicalPurchaserClientId: 'client-7',
        offerCode: 'gift-certificate.3000',
        nominalAmountKopecks: 300_000,
        currency: 'RUB',
        expectedProviderState: 'PENDING',
        unknownApplicable: false,
        createsCertificate: false,
        issuesBearer: false,
      },
      callerIdempotency: {
        scope: 'p4-06.initiate-gift-certificate-purchase.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(3);
    expect(request.source.occurrenceScope).toContain(
      request.callerIdempotency?.key,
    );
    expect(setup.previewAction).toHaveBeenCalledWith(request);
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('converges retry and restart to the same execution identity', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planPurchase(validDto());
    await first.service.planPurchase(validDto());
    await restarted.service.planPurchase(validDto());

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('converges Telegram and PWA initiators for one logical purchase', async () => {
    const telegram = buildHarness();
    const pwa = buildHarness();

    await telegram.service.planPurchase(validDto());
    await pwa.service.planPurchase({
      ...validDto(),
      initiator: 'pwa_gift_certificate_purchase',
    });

    expect(pwa.planShadow.mock.calls[0]?.[0]).toEqual(
      telegram.planShadow.mock.calls[0]?.[0],
    );
  });

  it('rejects a missing, unlinked, or merged same-tenant Client', async () => {
    for (const link of [
      null,
      {
        externalId: 'provider-client-7',
        unlinkedAt: new Date('2026-01-01T00:00:00Z'),
        client: { id: 'client-7', mergedIntoClientId: null },
      },
      {
        externalId: 'provider-client-7',
        unlinkedAt: null,
        client: { id: 'client-7', mergedIntoClientId: 'client-winner' },
      },
    ]) {
      const setup = buildHarness();
      setup.findLink.mockResolvedValue(link);

      await expect(
        setup.service.planPurchase(validDto()),
      ).resolves.toMatchObject({
        outcome: 'identity_unresolved',
        actionExecutionId: null,
      });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed for P02/P03-style holds and guard lookup failure', async () => {
    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const setup = buildHarness();
      setup.checkCrmClientRegistrationGuard.mockResolvedValue(decision);

      const result = await setup.service.planPurchase(validDto());

      expect(result.outcome).toBe(
        decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : 'identity_guard_unavailable',
      );
      expect(setup.findLink).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects certificate config absent from the server-owned catalog', async () => {
    const setup = buildHarness();

    await expect(
      setup.service.planPurchase({
        ...validDto(),
        offer_code: 'gift-certificate.9999',
      }),
    ).resolves.toMatchObject({ outcome: 'invalid_certificate_config' });
    expect(setup.checkCrmClientRegistrationGuard).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed for a conflicting logical checkout but converges the exact one', async () => {
    const blocked = buildHarness();
    blocked.findConflictingExecution.mockResolvedValue({
      id: 'other-checkout',
    });

    await expect(
      blocked.service.planPurchase(validDto()),
    ).resolves.toMatchObject({ outcome: 'checkout_conflict' });
    expect(blocked.planShadow).not.toHaveBeenCalled();
    const previewRequest = blocked.previewAction.mock.calls[0]?.[0];
    expect(previewRequest?.targetRef).toContain('gift-certificate-purchase:');
    expect(blocked.findConflictingExecution).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        actionClass: 'initiate_gift_certificate_purchase',
        targetRef: previewRequest?.targetRef,
        identityFingerprint: { not: 'gift-checkout-fingerprint' },
        state: {
          in: [
            ActionExecutionState.PENDING_APPROVAL,
            ActionExecutionState.READY,
            ActionExecutionState.EXECUTING,
            ActionExecutionState.UNKNOWN,
            ActionExecutionState.SUCCEEDED,
          ],
        },
      },
      select: { id: true },
    });

    const converging = buildHarness();
    await expect(
      converging.service.planPurchase(validDto()),
    ).resolves.toMatchObject({ outcome: 'planned' });
    expect(converging.planShadow).toHaveBeenCalledTimes(1);
  });

  it('rejects forged value, currency, entitlement and authority at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { price_kopecks: 1 },
      { nominal_amount_kopecks: 1 },
      { value: 1 },
      { currency: 'USD' },
      { expiry_days: 9999 },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'legacy.direct' },
      { presentation_key_version: 'attacker-key' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: GiftCertificatePurchaseShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('fails closed when exact purchase or recipient evidence is incomplete', async () => {
    const setup = buildHarness();

    for (const dto of [
      { ...validDto(), external_client_id: ' ' },
      { ...validDto(), purchase_intent_ref: ' ' },
      { ...validDto(), recipient_subject_ref: ' ' },
      { ...validDto(), recipient_subject_ref: '+79991234567' },
    ]) {
      await expect(setup.service.planPurchase(dto)).resolves.toMatchObject({
        outcome: 'identity_unresolved',
      });
    }
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('keeps the Shadow disabled unless explicitly enabled', async () => {
    const setup = buildHarness();
    process.env.MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED = 'false';

    await expect(setup.service.planPurchase(validDto())).resolves.toEqual({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      shadowDivergences: 0,
      intendedCheckout: null,
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      certificatesCreatedOrActivatedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      providerValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
