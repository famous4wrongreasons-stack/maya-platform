import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CustomerSubscriptionExpiryShadowService } from './customer-subscription-expiry-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionExpiryShadowDto,
} from './dto/customer-subscription-expiry-shadow.dto';

const TERM_START = new Date('2026-08-01T00:00:00.000Z');
const TERM_END = new Date('2026-08-31T00:00:00.000Z');

const validDto = (): CustomerSubscriptionExpiryShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_BRIDGE_CONTRACT,
  initiator: 'daily_scheduler',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  subscription_id: 'subscription-1',
});

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'subscription-1',
  clientId: 'client-7',
  termIdentityHash: 'term-hash',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  status: 'active',
  activatedAt: new Date('2026-07-31T23:59:00.000Z'),
  termStartsAt: TERM_START,
  termEndsAt: TERM_END,
  endedAt: null,
  endExecutionId: null,
  ...overrides,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'expiry-shadow-execution-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findSubscription = jest.fn().mockResolvedValue(subscription());
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
  const service = new CustomerSubscriptionExpiryShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      customerSubscription: { findUnique: findSubscription },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    {
      checkCrmClientRegistrationGuard,
    } as unknown as ClientIdentityService,
  );
  return {
    service,
    planShadow,
    findLink,
    findSubscription,
    checkCrmClientRegistrationGuard,
  };
}

describe('P4-05 expire_customer_subscription Shadow service', () => {
  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_ENABLED = 'true';
    jest.useFakeTimers({ now: new Date('2026-09-01T00:00:00.000Z') });
  });

  afterEach(() => {
    delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_ENABLED;
    jest.useRealTimers();
  });

  it('plans one genuinely elapsed term with deterministic immutable evidence', async () => {
    const h = buildHarness();

    const result = await h.service.planExpiry(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'expiry-shadow-execution-1',
      shadowDivergences: 0,
      intendedExpiry: {
        model: 'CustomerSubscription',
        canonicalClientId: 'client-7',
        subscriptionId: 'subscription-1',
        termIdentityHash: 'term-hash',
        termEndsAt: TERM_END.toISOString(),
        expiryEligibleAt: '2026-08-31T00:00:00.001Z',
        currentLifecycleState: 'active',
        intendedStatus: 'expired',
        intendedEndedAt: TERM_END.toISOString(),
        approvalRequirement: 'NONE',
        pendingRenewalBlocksExpiry: false,
        unknownApplicable: false,
        providerWritesRequired: false,
        mutatesImmutableTerm: false,
        createsRenewal: false,
        writesPerformed: false,
      },
      subscriptionsExpiredByNewPath: 0,
      termMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
    });
    const request = h.planShadow.mock.calls[0]?.[0];
    expect(request?.targetRef).toBe('subscription:subscription-1');
    expect(request).toMatchObject({
      capability: 'customer-subscriptions.expiry.shadow.v1',
      input: {
        serverTimeDecision: 'strictly_after_immutable_term_end',
        pendingRenewalBlocksExpiry: false,
      },
    });
  });

  it('rejects a term that has not strictly elapsed', async () => {
    const h = buildHarness();
    h.findSubscription.mockResolvedValue(
      subscription({ termEndsAt: new Date('2026-09-01T00:00:00.000Z') }),
    );

    await expect(h.service.planExpiry(validDto())).resolves.toMatchObject({
      outcome: 'term_not_elapsed',
      subscriptionsExpiredByNewPath: 0,
    });
    expect(h.planShadow).not.toHaveBeenCalled();
  });

  it('converges retry, restart, and duplicate scheduler invocations', async () => {
    const h = buildHarness();
    const restarted = buildHarness();
    const first = await h.service.planExpiry(validDto());
    const retry = await h.service.planExpiry(validDto());
    const restart = await restarted.service.planExpiry({
      ...validDto(),
      initiator: 'startup_reconciliation',
    });

    expect([
      first.actionExecutionId,
      retry.actionExecutionId,
      restart.actionExecutionId,
    ]).toEqual(Array(3).fill('expiry-shadow-execution-1'));
    const requests = [
      ...h.planShadow.mock.calls,
      ...restarted.planShadow.mock.calls,
    ].map((call) => call[0]);
    expect(new Set(requests.map((request) => request.targetRef)).size).toBe(1);
    expect(
      new Set(requests.map((request) => request.callerIdempotency?.key)).size,
    ).toBe(1);
  });

  it('does not terminalize an already expired, canceled, revoked, or claimed term', async () => {
    for (const terminal of [
      { status: 'expired' },
      { status: 'canceled' },
      { status: 'revoked' },
      { endedAt: TERM_END },
      { endExecutionId: 'end-execution-1' },
    ]) {
      const h = buildHarness();
      h.findSubscription.mockResolvedValue(subscription(terminal));

      await expect(h.service.planExpiry(validDto())).resolves.toMatchObject({
        outcome: 'terminal_already_claimed',
      });
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects wrong subscription, Client, and malformed lifecycle evidence', async () => {
    for (const changed of [
      null,
      subscription({ clientId: 'client-other' }),
      subscription({ termEndsAt: TERM_START }),
      subscription({ activatedAt: new Date('2026-08-02T00:00:00.000Z') }),
    ]) {
      const h = buildHarness();
      h.findSubscription.mockResolvedValue(changed);
      const result = await h.service.planExpiry(validDto());
      expect([
        'subscription_not_expirable',
        'lifecycle_evidence_incomplete',
      ]).toContain(result.outcome);
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed for wrong canonical identity and unresolved hold', async () => {
    const wrongClient = buildHarness();
    wrongClient.findLink.mockResolvedValue(null);
    await expect(
      wrongClient.service.planExpiry(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });

    const held = buildHarness();
    held.checkCrmClientRegistrationGuard.mockResolvedValue({
      allowed: false,
      reasonCode: CLIENT_IDENTITY_UNRESOLVED,
    });
    await expect(held.service.planExpiry(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
    });
  });

  it('does not let a pending renewal checkout block elapsed-term expiry', async () => {
    const h = buildHarness();

    const result = await h.service.planExpiry(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      intendedExpiry: { pendingRenewalBlocksExpiry: false },
      renewalsCreatedByNewPath: 0,
    });
  });

  it('rejects caller-supplied time, term end, lifecycle, and authority', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    for (const field of [
      ['current_time', '2026-10-01T00:00:00.000Z'],
      ['term_end', '2026-08-01T00:00:00.000Z'],
      ['status', 'expired'],
      ['pending_renewal', false],
      ['approved', true],
      ['entitled', true],
      ['autonomy', 'L5'],
    ] as const) {
      await expect(
        pipe.transform(
          { ...validDto(), [field[0]]: field[1] },
          { type: 'body', metatype: CustomerSubscriptionExpiryShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
