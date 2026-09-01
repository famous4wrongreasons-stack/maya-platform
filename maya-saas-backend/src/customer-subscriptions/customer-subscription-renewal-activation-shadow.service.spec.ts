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
  YooKassaClientService,
  type YooKassaPayment,
} from '../billing/yookassa-client.service';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CustomerSubscriptionRenewalActivationShadowService } from './customer-subscription-renewal-activation-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionRenewalActivationShadowDto,
} from './dto/customer-subscription-renewal-activation-shadow.dto';

const PREDECESSOR_START = new Date('2026-08-04T12:00:00.000Z');
const PREDECESSOR_END = new Date('2026-09-03T12:00:00.000Z');

const validDto = (): CustomerSubscriptionRenewalActivationShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_BRIDGE_CONTRACT,
  initiator: 'provider_webhook',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  checkout_execution_id: 'renewal-checkout-execution-1',
});

const checkoutSafeResult = () => ({
  checkoutMode: 'renewal',
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  predecessorSubscriptionId: 'subscription-1',
  predecessorTermIdentityHash: 'predecessor-term-hash',
  predecessorStatus: 'active',
  predecessorTermStartsAt: PREDECESSOR_START.toISOString(),
  predecessorTermEndsAt: PREDECESSOR_END.toISOString(),
  renewalIntentIdentityHash: 'renewal-intent-hash',
  checkoutIdentityHash: 'renewal-checkout-identity-hash',
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
  nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
  paymentProvider: 'yookassa',
  providerRequestIdentityHash: 'provider-request-hash',
});

const checkoutExecution = () => ({
  id: 'renewal-checkout-execution-1',
  tenantId: 'tenant-a',
  actionClass: 'initiate_customer_subscription_renewal',
  state: ActionExecutionState.SUCCEEDED,
  dryRun: false,
  policyDecision: ActionPolicyDecision.ALLOW,
  finalOutcomeCode: 'provider_checkout_created',
  safeResultSummaryJson: checkoutSafeResult(),
});

const predecessor = (overrides: Record<string, unknown> = {}) => ({
  id: 'subscription-1',
  clientId: 'client-7',
  termIdentityHash: 'predecessor-term-hash',
  planCode: 'haircut',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  priceKopecks: 330_000,
  currency: 'RUB',
  visitsIncluded: 2,
  status: 'active',
  termStartsAt: PREDECESSOR_START,
  termEndsAt: PREDECESSOR_END,
  ...overrides,
});

const providerPayment = (
  overrides: Partial<YooKassaPayment> = {},
): YooKassaPayment => ({
  id: 'provider-payment-1',
  status: 'succeeded',
  paid: true,
  amount: { value: '3300.00', currency: 'RUB' },
  captured_at: '2026-09-01T10:15:30.000Z',
  metadata: {
    tenant_id: 'tenant-a',
    checkout_execution_id: 'renewal-checkout-execution-1',
    checkout_identity_hash: 'renewal-checkout-identity-hash',
    canonical_client_id: 'client-7',
    predecessor_subscription_id: 'subscription-1',
  },
  ...overrides,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'renewal-activation-shadow-execution-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findCheckout = jest.fn().mockResolvedValue(checkoutExecution());
  const findPredecessor = jest.fn().mockResolvedValue(predecessor());
  const findAttempt = jest.fn().mockResolvedValue({
    providerRequestIdentityHash: 'provider-request-hash',
    providerReferenceEncrypted: 'encrypted-provider-payment-1',
    providerReferenceHash: 'provider-payment-reference-hash',
  });
  const findClaim: jest.MockedFunction<
    (args: Record<string, unknown>) => Promise<{ id: string } | null>
  > = jest.fn().mockResolvedValue(null);
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
  const service = new CustomerSubscriptionRenewalActivationShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      actionExecution: { findUnique: findCheckout },
      actionAttempt: { findFirst: findAttempt },
      customerSubscription: {
        findUnique: findPredecessor,
        findFirst: findClaim,
      },
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
    findPredecessor,
    findAttempt,
    findClaim,
    checkCrmClientRegistrationGuard,
    getPayment,
    decrypt,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('CustomerSubscriptionRenewalActivationShadowService', () => {
  const originalEnabled =
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_ENABLED =
      'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env
        .MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_ENABLED;
    } else {
      process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_ENABLED =
        originalEnabled;
    }
  });

  it('plans one exact paid successor term without mutating its predecessor', async () => {
    const setup = buildHarness();

    const result = await setup.service.planActivation(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'renewal-activation-shadow-execution-1',
      shadowDivergences: 0,
      intendedActivation: {
        model: 'CustomerSubscription',
        status: 'active',
        canonicalClientId: 'client-7',
        previousSubscriptionId: 'subscription-1',
        predecessorTermIdentityHash: 'predecessor-term-hash',
        predecessorTermStartsAt: PREDECESSOR_START.toISOString(),
        predecessorTermEndsAt: PREDECESSOR_END.toISOString(),
        checkoutExecutionId: 'renewal-checkout-execution-1',
        planCode: 'haircut',
        tier: 'senior',
        priceKopecks: 330_000,
        currency: 'RUB',
        visitsIncluded: 2,
        termStartsAt: PREDECESSOR_END.toISOString(),
        termEndsAt: '2026-10-03T12:00:00.000Z',
        oneTimeActivationEligible: true,
        approvalRequirement: 'NONE',
        providerWritesRequired: false,
        unknownApplicable: false,
        mutatesPredecessor: false,
        writesPerformed: false,
      },
      subscriptionsCreatedOrActivatedByNewPath: 0,
      predecessorTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageClaimsCreatedByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'customer-subscriptions.renewal-activation.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-subscription:renewal-payment-evidence',
      },
      input: {
        canonicalClientId: 'client-7',
        predecessorSubscriptionId: 'subscription-1',
        predecessorStatusAtCheckout: 'active',
        checkoutExecutionId: 'renewal-checkout-execution-1',
        providerPaymentState: 'succeeded',
        termStartsAt: PREDECESSOR_END.toISOString(),
        intendedStatus: 'active',
        mutatesPredecessor: false,
      },
      callerIdempotency: {
        scope: 'p4-05.activate-customer-subscription-renewal.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(6);
    expect(request.source.occurrenceScope).toContain(
      request.callerIdempotency?.key,
    );
    expect(setup.getPayment).toHaveBeenCalledWith('provider-payment-1');
  });

  it('starts a delayed successor at payment success after predecessor end', async () => {
    const setup = buildHarness();
    setup.getPayment.mockResolvedValue(
      providerPayment({ captured_at: '2026-09-05T09:00:00.000Z' }),
    );

    const result = await setup.service.planActivation(validDto());

    expect(result.intendedActivation).toMatchObject({
      termStartsAt: '2026-09-05T09:00:00.000Z',
      termEndsAt: '2026-10-05T09:00:00.000Z',
    });
  });

  it('converges retry, restart, webhook, poller, and reconciliation initiators', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planActivation(validDto());
    await first.service.planActivation({
      ...validDto(),
      initiator: 'payment_poller',
    });
    await restarted.service.planActivation({
      ...validDto(),
      initiator: 'startup_reconciliation',
    });

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('keeps known PENDING and indeterminate UNKNOWN from activating', async () => {
    const pending = buildHarness();
    pending.getPayment.mockResolvedValue(
      providerPayment({ status: 'pending', paid: false }),
    );
    await expect(
      pending.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_pending' });
    expect(pending.planShadow).not.toHaveBeenCalled();

    const checkoutUnknown = buildHarness();
    checkoutUnknown.findCheckout.mockResolvedValue({
      ...checkoutExecution(),
      state: ActionExecutionState.UNKNOWN,
    });
    await expect(
      checkoutUnknown.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_unknown' });
    expect(checkoutUnknown.getPayment).not.toHaveBeenCalled();

    const providerUnknown = buildHarness();
    providerUnknown.getPayment.mockResolvedValue(
      providerPayment({ status: 'unknown', paid: false }),
    );
    await expect(
      providerUnknown.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_unknown' });
    expect(providerUnknown.planShadow).not.toHaveBeenCalled();
  });

  it('rejects failed, canceled, and expired provider payment outcomes', async () => {
    for (const status of ['canceled', 'failed', 'expired']) {
      const setup = buildHarness();
      setup.getPayment.mockResolvedValue(
        providerPayment({ status, paid: false }),
      );

      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'payment_not_succeeded' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects non-executable, initial-purchase, or mismatched renewal checkout evidence', async () => {
    for (const checkout of [
      { ...checkoutExecution(), dryRun: true },
      {
        ...checkoutExecution(),
        actionClass: 'initiate_customer_subscription_purchase',
      },
      {
        ...checkoutExecution(),
        safeResultSummaryJson: {
          ...checkoutSafeResult(),
          canonicalClientId: 'other-client',
        },
      },
    ]) {
      const setup = buildHarness();
      setup.findCheckout.mockResolvedValue(checkout);

      const result = await setup.service.planActivation(validDto());

      expect([
        'checkout_not_activatable',
        'payment_evidence_mismatch',
      ]).toContain(result.outcome);
      expect(setup.getPayment).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects wrong payment id, amount, currency, or renewal metadata', async () => {
    for (const payment of [
      providerPayment({ id: 'other-payment' }),
      providerPayment({ amount: { value: '1.00', currency: 'RUB' } }),
      providerPayment({ amount: { value: '3300.00', currency: 'USD' } }),
      providerPayment({
        metadata: {
          tenant_id: 'tenant-a',
          checkout_execution_id: 'renewal-checkout-execution-1',
          checkout_identity_hash: 'renewal-checkout-identity-hash',
          canonical_client_id: 'client-7',
          predecessor_subscription_id: 'other-predecessor',
        },
      }),
    ]) {
      const setup = buildHarness();
      setup.getPayment.mockResolvedValue(payment);

      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'payment_evidence_mismatch' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects wrong tenant/Client, merged Client, and unresolved identity holds', async () => {
    const missing = buildHarness();
    missing.findLink.mockResolvedValue(null);
    await expect(
      missing.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });

    const merged = buildHarness();
    merged.findLink.mockResolvedValue({
      client: { id: 'client-7', mergedIntoClientId: 'client-winner' },
    });
    await expect(
      merged.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });

    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const held = buildHarness();
      held.checkCrmClientRegistrationGuard.mockResolvedValue(decision);
      const result = await held.service.planActivation(validDto());
      expect(result.outcome).toBe(
        decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : 'identity_guard_unavailable',
      );
      expect(held.findLink).not.toHaveBeenCalled();
      expect(held.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects missing, changed, canceled, or revoked predecessor facts', async () => {
    for (const value of [
      null,
      predecessor({ clientId: 'other-client' }),
      predecessor({ termIdentityHash: 'changed-term' }),
      predecessor({ status: 'canceled' }),
      predecessor({ status: 'revoked' }),
    ]) {
      const setup = buildHarness();
      setup.findPredecessor.mockResolvedValue(value);

      await expect(
        setup.service.planActivation(validDto()),
      ).resolves.toMatchObject({ outcome: 'predecessor_not_renewable' });
      expect(setup.getPayment).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('allows an expired immutable predecessor when paid after its end', async () => {
    const setup = buildHarness();
    setup.findPredecessor.mockResolvedValue(predecessor({ status: 'expired' }));
    setup.getPayment.mockResolvedValue(
      providerPayment({ captured_at: '2026-09-05T09:00:00.000Z' }),
    );

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({
      outcome: 'planned',
      intendedActivation: {
        previousSubscriptionId: 'subscription-1',
        termStartsAt: '2026-09-05T09:00:00.000Z',
        mutatesPredecessor: false,
      },
    });
  });

  it('rejects an already claimed payment, successor, or term identity', async () => {
    const setup = buildHarness();
    setup.findClaim.mockResolvedValue({ id: 'existing-successor' });

    await expect(
      setup.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'activation_already_claimed' });
    expect(setup.findClaim).toHaveBeenCalledTimes(1);
    const claimQuery = setup.findClaim.mock.calls[0]?.[0] as unknown as {
      where: {
        tenantId: string;
        OR: [
          { provider: string; providerPaymentRefHash: string },
          { termIdentityHash: string },
          { previousSubscriptionId: string },
        ];
      };
      select: { id: boolean };
    };
    expect(claimQuery).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        OR: [
          {
            provider: 'yookassa',
          },
          {},
          { previousSubscriptionId: 'subscription-1' },
        ],
      },
      select: { id: true },
    });
    expect(claimQuery.where.OR[0].providerPaymentRefHash).toEqual(
      expect.any(String),
    );
    expect(claimQuery.where.OR[1].termIdentityHash).toEqual(expect.any(String));
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed when acknowledged attempt or provider read is unavailable', async () => {
    const missingAttempt = buildHarness();
    missingAttempt.findAttempt.mockResolvedValue(null);
    await expect(
      missingAttempt.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'payment_evidence_mismatch' });
    expect(missingAttempt.getPayment).not.toHaveBeenCalled();

    const unavailable = buildHarness();
    unavailable.getPayment.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      unavailable.service.planActivation(validDto()),
    ).resolves.toMatchObject({ outcome: 'provider_evidence_unavailable' });
    expect(unavailable.planShadow).not.toHaveBeenCalled();
  });

  it('rejects forged success, value, predecessor, dates, and authority at DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { paid: true },
      { payment_status: 'succeeded' },
      { price_kopecks: 1 },
      { currency: 'USD' },
      { offer_code: 'complex.top' },
      { previous_subscription_id: 'other' },
      { term_starts_at: '2026-09-01T00:00:00Z' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'subscription.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          {
            type: 'body',
            metatype: CustomerSubscriptionRenewalActivationShadowDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('keeps the fixture disabled unless explicitly enabled', async () => {
    const setup = buildHarness();
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_ENABLED =
      'false';

    await expect(setup.service.planActivation(validDto())).resolves.toEqual({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      shadowDivergences: 0,
      intendedActivation: null,
      subscriptionsCreatedOrActivatedByNewPath: 0,
      predecessorTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageClaimsCreatedByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('queries only exact acknowledged provider evidence before planning', async () => {
    const setup = buildHarness();

    await setup.service.planActivation(validDto());

    expect(setup.findAttempt).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        actionExecutionId: 'renewal-checkout-execution-1',
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
