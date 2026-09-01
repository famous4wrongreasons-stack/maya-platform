import { BadRequestException, ValidationPipe } from '@nestjs/common';
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
import { CustomerSubscriptionActivationShadowService } from './customer-subscription-activation-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionActivationShadowDto,
} from './dto/customer-subscription-activation-shadow.dto';

const validDto = (): CustomerSubscriptionActivationShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_BRIDGE_CONTRACT,
  initiator: 'provider_webhook',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  checkout_execution_id: 'checkout-execution-1',
});

const checkoutSafeResult = () => ({
  checkoutMode: 'initial_purchase',
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  checkoutIdentityHash: 'checkout-identity-hash',
  purchaseIntentIdentityHash: 'purchase-intent-hash',
  offerCode: 'haircut.senior',
  planCode: 'haircut',
  tier: 'senior',
  catalogVersion: 'p4-05.legacy-fixed-catalog.v1',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  priceKopecks: 330_000,
  currency: 'RUB',
  visitsIncluded: 2,
  termDays: 30,
  paymentProvider: 'yookassa',
  providerRequestIdentityHash: 'provider-request-hash',
});

const checkoutExecution = () => ({
  id: 'checkout-execution-1',
  tenantId: 'tenant-a',
  actionClass: 'initiate_customer_subscription_purchase',
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
  amount: { value: '3300.00', currency: 'RUB' },
  captured_at: '2026-09-01T10:15:30.000Z',
  metadata: {
    tenant_id: 'tenant-a',
    checkout_execution_id: 'checkout-execution-1',
    checkout_identity_hash: 'checkout-identity-hash',
    canonical_client_id: 'client-7',
  },
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'activation-shadow-execution-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
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
  const service = new CustomerSubscriptionActivationShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      actionExecution: { findUnique: findCheckout },
      actionAttempt: { findFirst: findAttempt },
      customerSubscription: { findFirst: findClaim },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
    { decrypt } as unknown as EncryptionService,
    { getPayment } as unknown as YooKassaClientService,
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
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('CustomerSubscriptionActivationShadowService', () => {
  const originalEnabled =
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_ENABLED;
    } else {
      process.env.MAYA_CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_ENABLED =
        originalEnabled;
    }
  });

  it('plans one exact activation only from proven successful payment evidence', async () => {
    const setup = buildHarness();

    const result = await setup.service.planActivation(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'activation-shadow-execution-1',
      shadowDivergences: 0,
      intendedActivation: {
        model: 'CustomerSubscription',
        status: 'active',
        canonicalClientId: 'client-7',
        checkoutExecutionId: 'checkout-execution-1',
        planCode: 'haircut',
        tier: 'senior',
        priceKopecks: 330_000,
        currency: 'RUB',
        visitsIncluded: 2,
        termStartsAt: '2026-09-01T10:15:30.000Z',
        termEndsAt: '2026-10-01T10:15:30.000Z',
        oneTimeActivationEligible: true,
        approvalRequirement: 'NONE',
        providerWritesRequired: false,
        unknownApplicable: false,
        writesPerformed: false,
      },
      subscriptionsCreatedOrActivatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageClaimsCreatedByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'customer-subscriptions.activation.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-subscription:payment-evidence',
      },
      input: {
        canonicalClientId: 'client-7',
        checkoutExecutionId: 'checkout-execution-1',
        providerPaymentState: 'succeeded',
        priceKopecks: 330_000,
        currency: 'RUB',
        intendedStatus: 'active',
        unknownApplicable: false,
        providerWritesRequired: false,
      },
      callerIdempotency: {
        scope: 'p4-05.activate-customer-subscription.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(4);
    expect(setup.getPayment).toHaveBeenCalledWith('provider-payment-1');
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('converges retry and restart to the same activation identity', async () => {
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

  it('does not activate a known pending provider checkout', async () => {
    const setup = buildHarness();
    setup.getPayment.mockResolvedValue({
      ...providerPayment(),
      status: 'pending',
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
  });

  it('does not activate an UNKNOWN checkout outcome', async () => {
    const setup = buildHarness();
    setup.findCheckout.mockResolvedValue({
      ...checkoutExecution(),
      state: ActionExecutionState.UNKNOWN,
    });

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({
      outcome: 'payment_unknown',
      intendedActivation: null,
    });
    expect(setup.getPayment).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('does not activate failed, canceled, or unknown provider outcomes', async () => {
    for (const status of ['failed', 'canceled', 'unknown']) {
      const setup = buildHarness();
      setup.getPayment.mockResolvedValue({
        ...providerPayment(),
        status,
        paid: false,
        captured_at: undefined,
      });

      const result = await setup.service.planActivation(validDto());

      expect(result.outcome).toBe(
        status === 'unknown' ? 'payment_unknown' : 'payment_not_succeeded',
      );
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects a wrong checkout/payment reference or metadata pair', async () => {
    for (const payment of [
      { ...providerPayment(), id: 'other-payment' },
      {
        ...providerPayment(),
        metadata: {
          ...providerPayment().metadata,
          checkout_execution_id: 'other-checkout',
        },
      },
      {
        ...providerPayment(),
        amount: { value: '1.00', currency: 'RUB' },
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

  it('rejects wrong tenant and wrong Client evidence', async () => {
    for (const mutate of [
      (setup: ReturnType<typeof buildHarness>) =>
        setup.findCheckout.mockResolvedValue(null),
      (setup: ReturnType<typeof buildHarness>) =>
        setup.findCheckout.mockResolvedValue({
          ...checkoutExecution(),
          safeResultSummaryJson: {
            ...checkoutSafeResult(),
            canonicalClientId: 'other-client',
          },
        }),
      (setup: ReturnType<typeof buildHarness>) =>
        setup.findLink.mockResolvedValue(null),
    ]) {
      const setup = buildHarness();
      mutate(setup);

      const result = await setup.service.planActivation(validDto());

      expect([
        'checkout_not_activatable',
        'payment_evidence_mismatch',
        'identity_unresolved',
      ]).toContain(result.outcome);
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed for P02/P03-style holds and hold lookup failure', async () => {
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
      expect(setup.findCheckout).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('ignores initiator claims by rejecting forged success, price, plan, or authority fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { payment_status: 'succeeded' },
      { paid: true },
      { price_kopecks: 1 },
      { plan_code: 'forged' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: CustomerSubscriptionActivationShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('does not create a second activation when the payment or term is claimed', async () => {
    const setup = buildHarness();
    setup.findClaim.mockResolvedValue({ id: 'existing-subscription-term' });

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({
      outcome: 'activation_already_claimed',
      intendedActivation: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed when the read-only provider evidence is unavailable', async () => {
    const setup = buildHarness();
    setup.getPayment.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({
      outcome: 'provider_evidence_unavailable',
      intendedActivation: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires a real successful executable checkout rather than a Shadow plan', async () => {
    const setup = buildHarness();
    setup.findCheckout.mockResolvedValue({
      ...checkoutExecution(),
      state: ActionExecutionState.NOT_EXECUTED,
      dryRun: true,
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      finalOutcomeCode: null,
    });

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({
      outcome: 'checkout_not_activatable',
      intendedActivation: null,
    });
    expect(setup.getPayment).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('queries only an acknowledged successful checkout attempt', async () => {
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
});
