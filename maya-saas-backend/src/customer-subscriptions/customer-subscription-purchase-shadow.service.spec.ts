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
import { CustomerSubscriptionPurchaseShadowService } from './customer-subscription-purchase-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionPurchaseShadowDto,
} from './dto/customer-subscription-purchase-shadow.dto';

const validDto = (): CustomerSubscriptionPurchaseShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_BRIDGE_CONTRACT,
  initiator: 'telegram_subscription_purchase',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  purchase_intent_ref: 'telegram-update-101',
  offer_code: 'membership-offer-id',
});

function preview(identityFingerprint = 'checkout-fingerprint') {
  return {
    identityFingerprint,
  } as ActionExecutionPreviewV1;
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
      id: 'execution-checkout-shadow-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    externalId: 'provider-client-7',
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findActiveSubscription = jest.fn().mockResolvedValue(null);
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
  const resolveMembershipOffer = jest.fn((tenantId: string, offerId: string) =>
    tenantId === 'tenant-a' && offerId === 'membership-offer-id'
      ? Promise.resolve({
          offerId,
          offerValueVersionId: 'membership-version-id',
          offerValueVersion: 1,
          templateKey: 'haircut.senior',
          valueSnapshotHash: 'membership-value-snapshot-hash',
          priceKopecks: 330_000,
          currency: 'RUB' as const,
          kind: 'membership' as const,
          planCode: 'haircut' as const,
          tier: 'senior' as const,
          visitsIncluded: 2 as const,
          termDays: 30 as const,
          serviceScopeRefs: ['yclients.service.mens-haircut'] as const,
        })
      : Promise.reject(new Error('not found')),
  );
  const service = new CustomerSubscriptionPurchaseShadowService(
    {
      preview: previewAction,
      planShadow,
    } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      customerSubscription: { findFirst: findActiveSubscription },
      actionExecution: { findFirst: findConflictingExecution },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
    { resolveMembershipOffer } as never,
  );

  return {
    service,
    previewAction,
    planShadow,
    findLink,
    findActiveSubscription,
    findConflictingExecution,
    checkCrmClientRegistrationGuard,
    bridgeSource,
    runAsSystemTenant,
    resolveMembershipOffer,
  };
}

describe('CustomerSubscriptionPurchaseShadowService', () => {
  const originalEnabled =
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_ENABLED;
    } else {
      process.env.MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_ENABLED =
        originalEnabled;
    }
  });

  it('plans one exact server-derived checkout intent with no side effect', async () => {
    const setup = buildHarness();

    const result = await setup.service.planPurchase(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-checkout-shadow-1',
      shadowDivergences: 0,
      intendedCheckout: {
        actionClass: 'initiate_customer_subscription_purchase',
        checkoutMode: 'initial_purchase',
        canonicalClientId: 'client-7',
        offerCode: 'haircut.senior',
        planCode: 'haircut',
        tier: 'senior',
        priceKopecks: 330_000,
        currency: 'RUB',
        visitsIncluded: 2,
        termDays: 30,
        paymentProvider: 'yookassa',
        intendedProviderOperation: 'provider_checkout_create',
        expectedProviderState: 'PENDING',
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
        providerDispatchPerformed: false,
        unknownApplicable: false,
        activatesSubscription: false,
      },
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      subscriptionsCreatedOrActivatedByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'customer-subscriptions.purchase.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-subscription:initiate-customer-purchase',
      },
      targetRef: 'customer-subscription-purchase:client-7',
      input: {
        canonicalClientId: 'client-7',
        offerCode: 'haircut.senior',
        priceKopecks: 330_000,
        currency: 'RUB',
        paymentProvider: 'yookassa',
        expectedProviderState: 'PENDING',
        unknownApplicable: false,
        activatesSubscription: false,
      },
      callerIdempotency: {
        scope: 'p4-05.initiate-customer-subscription-purchase.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(2);
    expect(request.source.occurrenceScope).toContain(
      request.callerIdempotency?.key,
    );
    expect(setup.previewAction).toHaveBeenCalledWith(request);
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('converges retry and service restart to the same logical identity', async () => {
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

  it('rejects a wrong-tenant or merged Client instead of planning', async () => {
    for (const link of [
      null,
      {
        externalId: 'provider-client-7',
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

  it('rejects an offer absent from the server-owned catalog', async () => {
    const setup = buildHarness();

    await expect(
      setup.service.planPurchase({
        ...validDto(),
        offer_code: 'forged.unlimited',
      }),
    ).resolves.toMatchObject({ outcome: 'invalid_plan' });
    expect(setup.checkCrmClientRegistrationGuard).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('separates initial checkout from renewal when an active term exists', async () => {
    const setup = buildHarness();
    setup.findActiveSubscription.mockResolvedValue({ id: 'active-term-1' });

    await expect(setup.service.planPurchase(validDto())).resolves.toMatchObject(
      {
        outcome: 'active_subscription_conflict',
        intendedCheckout: null,
      },
    );
    expect(setup.previewAction).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed for a different open checkout but allows exact convergence', async () => {
    const blocked = buildHarness();
    blocked.findConflictingExecution.mockResolvedValue({
      id: 'other-checkout',
    });

    await expect(
      blocked.service.planPurchase(validDto()),
    ).resolves.toMatchObject({ outcome: 'checkout_conflict' });
    expect(blocked.planShadow).not.toHaveBeenCalled();
    expect(blocked.findConflictingExecution).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        actionClass: 'initiate_customer_subscription_purchase',
        targetRef: 'customer-subscription-purchase:client-7',
        identityFingerprint: { not: 'checkout-fingerprint' },
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

  it('rejects forged price, currency, entitlement and authority at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { price_kopecks: 1 },
      { currency: 'USD' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: CustomerSubscriptionPurchaseShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('does not plan when the exact source identity is incomplete', async () => {
    const setup = buildHarness();

    for (const dto of [
      { ...validDto(), external_client_id: ' ' },
      { ...validDto(), purchase_intent_ref: ' ' },
    ]) {
      await expect(setup.service.planPurchase(dto)).resolves.toMatchObject({
        outcome: 'identity_unresolved',
      });
    }
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('keeps the fixture disabled unless explicitly enabled', async () => {
    const setup = buildHarness();
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_ENABLED = 'false';

    await expect(setup.service.planPurchase(validDto())).resolves.toEqual({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      shadowDivergences: 0,
      intendedCheckout: null,
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      subscriptionsCreatedOrActivatedByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
