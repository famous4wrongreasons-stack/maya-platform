import { createHash } from 'node:crypto';

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ActionExecutionState, type ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
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
import { CustomerSubscriptionRenewalShadowService } from './customer-subscription-renewal-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionRenewalShadowDto,
} from './dto/customer-subscription-renewal-shadow.dto';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const TERM_START = new Date('2026-08-04T12:00:00.000Z');
const TERM_END = new Date('2026-09-03T12:00:00.000Z');

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

const validDto = (): CustomerSubscriptionRenewalShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_BRIDGE_CONTRACT,
  initiator: 'telegram_subscription_renewal',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  subscription_id: 'subscription-1',
  renewal_intent_ref: 'telegram-update-202',
});

function canonicalPredecessor(overrides: Record<string, unknown> = {}) {
  const serviceScopeHash = hash([
    'p4-05.subscription-service-scope.v1',
    'tenant-a',
    'yclients.service.mens-haircut',
  ]);
  const planSnapshotHash = hash([
    CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    'tenant-a',
    'haircut.senior',
    'haircut',
    'senior',
    '330000',
    'RUB',
    '2',
    '30',
    serviceScopeHash,
  ]);
  return {
    id: 'subscription-1',
    clientId: 'client-7',
    termIdentityHash: 'predecessor-term-hash',
    planCode: 'haircut',
    planSnapshotHash,
    serviceScopeHash,
    priceKopecks: 330_000,
    currency: 'RUB',
    visitsIncluded: 2,
    status: 'active',
    termStartsAt: TERM_START,
    termEndsAt: TERM_END,
    activationExecution: {
      safeResultSummaryJson: { offerCode: 'haircut.senior' },
    },
    ...overrides,
  };
}

function preview(identityFingerprint = 'renewal-checkout-fingerprint') {
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
      id: 'execution-renewal-shadow-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findPredecessor = jest.fn().mockResolvedValue(canonicalPredecessor());
  const findSuccessor = jest.fn().mockResolvedValue(null);
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
  const resolveMembershipOfferByTemplate = jest.fn().mockResolvedValue({
    offerId: 'membership-offer-id',
    offerValueVersionId: 'membership-version-id',
    offerValueVersion: 1,
    templateKey: 'haircut.senior',
    valueSnapshotHash: 'membership-value-snapshot-hash',
    priceKopecks: 330_000,
    currency: 'RUB',
    kind: 'membership',
    planCode: 'haircut',
    tier: 'senior',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: ['yclients.service.mens-haircut'],
  });
  const service = new CustomerSubscriptionRenewalShadowService(
    {
      preview: previewAction,
      planShadow,
    } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      customerSubscription: {
        findUnique: findPredecessor,
        findFirst: findSuccessor,
      },
      actionExecution: { findFirst: findConflictingExecution },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    { checkCrmClientRegistrationGuard } as unknown as ClientIdentityService,
    { resolveMembershipOfferByTemplate } as never,
  );
  jest
    .spyOn(service as unknown as { currentTime: () => Date }, 'currentTime')
    .mockReturnValue(NOW);

  return {
    service,
    previewAction,
    planShadow,
    findLink,
    findPredecessor,
    findSuccessor,
    findConflictingExecution,
    checkCrmClientRegistrationGuard,
    bridgeSource,
    runAsSystemTenant,
    resolveMembershipOfferByTemplate,
  };
}

describe('CustomerSubscriptionRenewalShadowService', () => {
  const originalEnabled =
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED;

  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED;
    } else {
      process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED =
        originalEnabled;
    }
  });

  it('plans one exact server-derived successor checkout with no mutation', async () => {
    const setup = buildHarness();

    const result = await setup.service.planRenewal(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-renewal-shadow-1',
      shadowDivergences: 0,
      intendedRenewalCheckout: {
        actionClass: 'initiate_customer_subscription_renewal',
        checkoutMode: 'renewal',
        canonicalClientId: 'client-7',
        predecessorSubscriptionId: 'subscription-1',
        predecessorTermIdentityHash: 'predecessor-term-hash',
        predecessorTermStartsAt: TERM_START.toISOString(),
        predecessorTermEndsAt: TERM_END.toISOString(),
        renewalWindowOpensAt: '2026-08-31T12:00:00.000Z',
        offerCode: 'haircut.senior',
        planCode: 'haircut',
        tier: 'senior',
        priceKopecks: 330_000,
        currency: 'RUB',
        visitsIncluded: 2,
        termDays: 30,
        nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
        minimumNextTermStartsAt: TERM_END.toISOString(),
        paymentProvider: 'yookassa',
        intendedProviderOperation: 'provider_checkout_create',
        expectedProviderState: 'PENDING',
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
        providerDispatchPerformed: false,
        unknownApplicable: false,
        activatesSubscription: false,
        mutatesPredecessor: false,
      },
      renewalCheckoutsCreatedByNewPath: 0,
      subscriptionTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    const [request] = setup.planShadow.mock.calls[0];
    expect(request).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'customer-subscriptions.renewal-purchase.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-subscription:initiate-customer-renewal',
      },
      targetRef: 'customer-subscription-renewal:subscription-1',
      input: {
        canonicalClientId: 'client-7',
        predecessorSubscriptionId: 'subscription-1',
        predecessorStatus: 'active',
        planCode: 'haircut',
        priceKopecks: 330_000,
        currency: 'RUB',
        expectedProviderState: 'PENDING',
        unknownApplicable: false,
        activatesSubscription: false,
        mutatesPredecessor: false,
      },
      callerIdempotency: {
        scope: 'p4-05.initiate-customer-subscription-renewal.shadow',
      },
    });
    expect(request.evidenceRefs).toHaveLength(3);
    expect(request.source.occurrenceScope).toContain(
      request.callerIdempotency?.key,
    );
    expect(setup.previewAction).toHaveBeenCalledWith(request);
  });

  it('converges retries, restart, and duplicate initiators on one identity', async () => {
    const first = buildHarness();
    const restarted = buildHarness();

    await first.service.planRenewal(validDto());
    await first.service.planRenewal({
      ...validDto(),
      initiator: 'pwa_subscription_renewal',
    });
    await restarted.service.planRenewal(validDto());

    expect(first.planShadow.mock.calls[1]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
    expect(restarted.planShadow.mock.calls[0]?.[0]).toEqual(
      first.planShadow.mock.calls[0]?.[0],
    );
  });

  it('keeps the predecessor immutable and derives the next term server-side', async () => {
    const setup = buildHarness();
    const predecessor = canonicalPredecessor();
    setup.findPredecessor.mockResolvedValue(predecessor);
    const before = structuredClone(predecessor);

    const result = await setup.service.planRenewal(validDto());

    expect(predecessor).toEqual(before);
    expect(result.intendedRenewalCheckout).toMatchObject({
      predecessorSubscriptionId: predecessor.id,
      predecessorTermStartsAt: TERM_START.toISOString(),
      predecessorTermEndsAt: TERM_END.toISOString(),
      minimumNextTermStartsAt: TERM_END.toISOString(),
      nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
      mutatesPredecessor: false,
    });
  });

  it('rejects renewal outside the server-owned three-day window', async () => {
    for (const termEndsAt of [
      new Date('2026-09-10T12:00:00.000Z'),
      new Date('2026-08-31T11:59:59.000Z'),
    ]) {
      const setup = buildHarness();
      setup.findPredecessor.mockResolvedValue(
        canonicalPredecessor({ termEndsAt }),
      );

      await expect(
        setup.service.planRenewal(validDto()),
      ).resolves.toMatchObject({
        outcome: 'renewal_window_closed',
        intendedRenewalCheckout: null,
      });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects canceled, revoked, and expired predecessor terms', async () => {
    for (const status of ['canceled', 'revoked', 'expired']) {
      const setup = buildHarness();
      setup.findPredecessor.mockResolvedValue(canonicalPredecessor({ status }));

      await expect(
        setup.service.planRenewal(validDto()),
      ).resolves.toMatchObject({ outcome: 'terminal_subscription' });
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects a wrong tenant, wrong Client, or merged Client', async () => {
    const missing = buildHarness();
    missing.findPredecessor.mockResolvedValue(null);
    await expect(
      missing.service.planRenewal(validDto()),
    ).resolves.toMatchObject({ outcome: 'subscription_not_found' });

    const wrongClient = buildHarness();
    wrongClient.findPredecessor.mockResolvedValue(
      canonicalPredecessor({ clientId: 'other-client' }),
    );
    await expect(
      wrongClient.service.planRenewal(validDto()),
    ).resolves.toMatchObject({ outcome: 'subscription_client_mismatch' });

    const merged = buildHarness();
    merged.findLink.mockResolvedValue({
      client: { id: 'client-7', mergedIntoClientId: 'client-winner' },
    });
    await expect(merged.service.planRenewal(validDto())).resolves.toMatchObject(
      { outcome: 'identity_unresolved' },
    );
    expect(missing.planShadow).not.toHaveBeenCalled();
    expect(wrongClient.planShadow).not.toHaveBeenCalled();
    expect(merged.planShadow).not.toHaveBeenCalled();
  });

  it('fails closed for P02/P03-style holds and guard lookup failure', async () => {
    for (const decision of [
      { allowed: false, reasonCode: CLIENT_IDENTITY_UNRESOLVED },
      { allowed: false, reasonCode: CLIENT_IDENTITY_GUARD_UNAVAILABLE },
    ]) {
      const setup = buildHarness();
      setup.checkCrmClientRegistrationGuard.mockResolvedValue(decision);

      const result = await setup.service.planRenewal(validDto());

      expect(result.outcome).toBe(
        decision.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : 'identity_guard_unavailable',
      );
      expect(setup.findLink).not.toHaveBeenCalled();
      expect(setup.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects a predecessor without durable canonical offer evidence', async () => {
    const setup = buildHarness();
    setup.findPredecessor.mockResolvedValue(
      canonicalPredecessor({ activationExecution: null }),
    );

    await expect(setup.service.planRenewal(validDto())).resolves.toMatchObject({
      outcome: 'invalid_plan',
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('rejects an existing successor or a conflicting open renewal checkout', async () => {
    const successor = buildHarness();
    successor.findSuccessor.mockResolvedValue({ id: 'successor-term-1' });
    await expect(
      successor.service.planRenewal(validDto()),
    ).resolves.toMatchObject({ outcome: 'successor_exists' });
    expect(successor.planShadow).not.toHaveBeenCalled();

    const conflict = buildHarness();
    conflict.findConflictingExecution.mockResolvedValue({
      id: 'other-renewal-checkout',
    });
    await expect(
      conflict.service.planRenewal(validDto()),
    ).resolves.toMatchObject({ outcome: 'checkout_conflict' });
    expect(conflict.findConflictingExecution).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        actionClass: 'initiate_customer_subscription_renewal',
        targetRef: 'customer-subscription-renewal:subscription-1',
        identityFingerprint: { not: 'renewal-checkout-fingerprint' },
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
    expect(conflict.planShadow).not.toHaveBeenCalled();
  });

  it('rejects forged price, plan, dates, eligibility, and authority at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    for (const forged of [
      { price_kopecks: 1 },
      { currency: 'USD' },
      { offer_code: 'complex.top' },
      { plan_code: 'complex' },
      { next_term_starts_at: '2026-09-01T00:00:00Z' },
      { renewal_eligible: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'yookassa.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: CustomerSubscriptionRenewalShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('keeps the fixture disabled unless explicitly enabled', async () => {
    const setup = buildHarness();
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED = 'false';

    await expect(setup.service.planRenewal(validDto())).resolves.toEqual({
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      shadowDivergences: 0,
      intendedRenewalCheckout: null,
      renewalCheckoutsCreatedByNewPath: 0,
      subscriptionTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    });
    expect(
      setup.bridgeSource.resolveTenantByIntegration,
    ).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });
});
