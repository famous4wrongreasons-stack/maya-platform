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
import { CustomerSubscriptionCancellationShadowService } from './customer-subscription-cancellation-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionCancellationShadowDto,
} from './dto/customer-subscription-cancellation-shadow.dto';

const TERM_START = new Date('2026-08-01T00:00:00.000Z');
const TERM_END = new Date('2026-08-31T00:00:00.000Z');

const validDto = (): CustomerSubscriptionCancellationShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_BRIDGE_CONTRACT,
  initiator: 'telegram_client_cancellation',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  subscription_id: 'subscription-1',
  requester_identity_provider: 'telegram',
  external_requester_id: 'telegram-user-7',
  cancellation_intent_ref: 'telegram-update-7001',
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
      id: 'cancellation-shadow-execution-1',
    } as ActionExecution);
  });
  const preview = jest.fn().mockResolvedValue({
    identityFingerprint: 'cancellation-fingerprint-1',
  });
  const findLink = jest.fn().mockResolvedValue({
    client: {
      id: 'client-7',
      userId: 'user-client-7',
      mergedIntoClientId: null,
    },
  });
  const findRequester = jest.fn().mockResolvedValue({
    user: { id: 'user-client-7', status: 'active' },
    membership: {
      id: 'membership-client-7',
      role: 'client',
      status: 'active',
      branchId: null,
    },
  });
  const findSubscription = jest.fn().mockResolvedValue(subscription());
  const findTerminalConflict = jest.fn().mockResolvedValue(null);
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
  const service = new CustomerSubscriptionCancellationShadowService(
    { preview, planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      authIdentity: { findUnique: findRequester },
      customerSubscription: { findUnique: findSubscription },
      actionExecution: { findFirst: findTerminalConflict },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    {
      checkCrmClientRegistrationGuard,
    } as unknown as ClientIdentityService,
  );
  return {
    service,
    preview,
    planShadow,
    findLink,
    findRequester,
    findSubscription,
    findTerminalConflict,
    checkCrmClientRegistrationGuard,
  };
}

describe('P4-05 cancel_customer_subscription Shadow service', () => {
  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_ENABLED;
  });

  it('plans one exact client-authorized cancellation without side effects', async () => {
    const h = buildHarness();

    const result = await h.service.planCancellation(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'cancellation-shadow-execution-1',
      shadowDivergences: 0,
      intendedCancellation: {
        model: 'CustomerSubscription',
        canonicalClientId: 'client-7',
        subscriptionId: 'subscription-1',
        termIdentityHash: 'term-hash',
        termStartsAt: TERM_START.toISOString(),
        termEndsAt: TERM_END.toISOString(),
        requesterAuthority: 'subscription_client',
        cancellationReason: 'customer_requested',
        effectiveMode: 'immediate_on_canonical_commit',
        currentLifecycleState: 'active',
        intendedStatus: 'canceled',
        approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        paymentRefundIncluded: false,
        providerCancellationIncluded: false,
        oneTimeTerminalClaim: true,
        writesPerformed: false,
      },
      subscriptionsCancelledByNewPath: 0,
      termMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
    });
    expect(h.planShadow).toHaveBeenCalledTimes(1);
    expect(h.planShadow.mock.calls[0]?.[0]).toMatchObject({
      capability: 'customer-subscriptions.cancellation.shadow.v1',
      targetRef: 'subscription:subscription-1',
      source: { actorUserId: 'user-client-7' },
      input: {
        requesterAuthority: 'subscription_client',
        cancellationReason: 'customer_requested',
        providerBoundary: 'LOCAL_ONLY',
      },
    });
  });

  it('derives an authorized staff cancellation independently from the value owner', async () => {
    const h = buildHarness();
    h.findRequester.mockResolvedValue({
      user: { id: 'user-manager-1', status: 'active' },
      membership: {
        id: 'membership-manager-1',
        role: 'manager',
        status: 'active',
        branchId: 'branch-1',
      },
    });

    const result = await h.service.planCancellation({
      ...validDto(),
      initiator: 'staff_cancellation',
      external_requester_id: 'telegram-manager-1',
    });

    expect(result).toMatchObject({
      outcome: 'planned',
      intendedCancellation: {
        requesterAuthority: 'authorized_staff_role',
        cancellationReason: 'staff_confirmed_customer_request',
      },
    });
  });

  it('converges retry, restart, and duplicate client initiators', async () => {
    const h = buildHarness();
    const restarted = buildHarness();
    const first = await h.service.planCancellation(validDto());
    const retry = await h.service.planCancellation(validDto());
    const restart = await restarted.service.planCancellation({
      ...validDto(),
      initiator: 'pwa_client_cancellation',
    });

    expect([
      first.actionExecutionId,
      retry.actionExecutionId,
      restart.actionExecutionId,
    ]).toEqual(Array(3).fill('cancellation-shadow-execution-1'));
    const requests = [
      ...h.planShadow.mock.calls,
      ...restarted.planShadow.mock.calls,
    ].map((call) => call[0]);
    expect(new Set(requests.map((request) => request.targetRef)).size).toBe(1);
    expect(
      new Set(requests.map((request) => request.callerIdempotency?.key)).size,
    ).toBe(1);
  });

  it('does not plan a second terminal transition for terminal or claimed terms', async () => {
    for (const terminal of [
      { status: 'expired' },
      { status: 'canceled' },
      { status: 'revoked' },
      { endedAt: TERM_END },
      { endExecutionId: 'end-execution-1' },
    ]) {
      const h = buildHarness();
      h.findSubscription.mockResolvedValue(subscription(terminal));

      await expect(
        h.service.planCancellation(validDto()),
      ).resolves.toMatchObject({ outcome: 'terminal_already_claimed' });
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed against competing expire or revoke executions', async () => {
    for (const actionClass of [
      'expire_customer_subscription',
      'revoke_customer_subscription',
    ]) {
      const h = buildHarness();
      h.findTerminalConflict.mockResolvedValue({
        id: `execution-${actionClass}`,
        actionClass,
        state: 'READY',
      });

      await expect(
        h.service.planCancellation(validDto()),
      ).resolves.toMatchObject({ outcome: 'terminal_transition_conflict' });
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects wrong Client, subscription, tenant-scoped evidence, and malformed lifecycle', async () => {
    for (const changed of [
      null,
      subscription({ clientId: 'client-other' }),
      subscription({ termEndsAt: TERM_START }),
      subscription({ activatedAt: new Date('2026-08-02T00:00:00.000Z') }),
    ]) {
      const h = buildHarness();
      h.findSubscription.mockResolvedValue(changed);
      const result = await h.service.planCancellation(validDto());
      expect([
        'subscription_not_cancelable',
        'lifecycle_evidence_incomplete',
      ]).toContain(result.outcome);
      expect(h.planShadow).not.toHaveBeenCalled();
    }

    const missingLink = buildHarness();
    missingLink.findLink.mockResolvedValue(null);
    await expect(
      missingLink.service.planCancellation(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });
  });

  it('fails closed for unresolved Client hold', async () => {
    const h = buildHarness();
    h.checkCrmClientRegistrationGuard.mockResolvedValue({
      allowed: false,
      reasonCode: CLIENT_IDENTITY_UNRESOLVED,
    });

    await expect(h.service.planCancellation(validDto())).resolves.toMatchObject(
      { outcome: 'identity_unresolved' },
    );
    expect(h.planShadow).not.toHaveBeenCalled();
  });

  it('rejects forged or insufficient requester authority', async () => {
    const wrongClient = buildHarness();
    wrongClient.findRequester.mockResolvedValue({
      user: { id: 'user-other', status: 'active' },
      membership: {
        id: 'membership-other',
        role: 'client',
        status: 'active',
        branchId: null,
      },
    });
    await expect(
      wrongClient.service.planCancellation(validDto()),
    ).resolves.toMatchObject({ outcome: 'requester_unauthorized' });

    const weakStaff = buildHarness();
    weakStaff.findRequester.mockResolvedValue({
      user: { id: 'user-employee', status: 'active' },
      membership: {
        id: 'membership-employee',
        role: 'employee',
        status: 'active',
        branchId: 'branch-1',
      },
    });
    await expect(
      weakStaff.service.planCancellation({
        ...validDto(),
        initiator: 'staff_cancellation',
      }),
    ).resolves.toMatchObject({ outcome: 'requester_unauthorized' });

    const inactive = buildHarness();
    inactive.findRequester.mockResolvedValue({
      user: { id: 'user-client-7', status: 'suspended' },
      membership: {
        id: 'membership-client-7',
        role: 'client',
        status: 'active',
        branchId: null,
      },
    });
    await expect(
      inactive.service.planCancellation(validDto()),
    ).resolves.toMatchObject({ outcome: 'requester_unauthorized' });
  });

  it('rejects caller-supplied actor, reason, effective date, policy, and authority', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    for (const field of [
      ['requester_role', 'tenant_owner'],
      ['requester_authority', 'owner'],
      ['cancellation_reason', 'refund_requested'],
      ['effective_date', '2026-10-01T00:00:00.000Z'],
      ['status', 'canceled'],
      ['approved', true],
      ['entitled', true],
      ['autonomy', 'L5'],
    ] as const) {
      await expect(
        pipe.transform(
          { ...validDto(), [field[0]]: field[1] },
          {
            type: 'body',
            metatype: CustomerSubscriptionCancellationShadowDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
