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
import { CustomerSubscriptionRevocationShadowService } from './customer-subscription-revocation-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionRevocationShadowDto,
} from './dto/customer-subscription-revocation-shadow.dto';

const TERM_START = new Date('2026-08-01T00:00:00.000Z');
const TERM_END = new Date('2026-08-31T00:00:00.000Z');

const validDto = (): CustomerSubscriptionRevocationShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_BRIDGE_CONTRACT,
  initiator: 'owner_revocation_decision',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  subscription_id: 'subscription-1',
  requester_identity_provider: 'telegram',
  external_requester_id: 'telegram-owner-1',
  revocation_decision_ref: 'revocation-decision-7001',
  revocation_evidence_ref: 'revocation-evidence-9001',
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
      id: 'revocation-shadow-execution-1',
    } as ActionExecution);
  });
  const preview = jest.fn().mockResolvedValue({
    identityFingerprint: 'revocation-fingerprint-1',
  });
  const findLink = jest.fn().mockResolvedValue({
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findRequester = jest.fn().mockResolvedValue({
    user: { id: 'user-owner-1', status: 'active' },
    membership: {
      id: 'membership-owner-1',
      role: 'tenant_owner',
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
  const service = new CustomerSubscriptionRevocationShadowService(
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

describe('P4-05 revoke_customer_subscription Shadow service', () => {
  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_ENABLED;
  });

  it('plans one exact owner-initiated approval-bound revocation without side effects', async () => {
    const h = buildHarness();

    const result = await h.service.planRevocation(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'revocation-shadow-execution-1',
      shadowDivergences: 0,
      intendedRevocation: {
        model: 'CustomerSubscription',
        canonicalClientId: 'client-7',
        subscriptionId: 'subscription-1',
        termIdentityHash: 'term-hash',
        termStartsAt: TERM_START.toISOString(),
        termEndsAt: TERM_END.toISOString(),
        requesterRole: 'tenant_owner',
        requesterAuthority: 'tenant_owner_or_admin',
        revocationReason: 'approved_policy_revocation',
        effectiveMode: 'immediate_on_canonical_commit',
        currentLifecycleState: 'active',
        intendedStatus: 'revoked',
        approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
        approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        paymentRefundIncluded: false,
        providerCancellationIncluded: false,
        oneTimeTerminalClaim: true,
        writesPerformed: false,
      },
      subscriptionsRevokedByNewPath: 0,
      termMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
    });
    expect(h.planShadow.mock.calls[0]?.[0]).toMatchObject({
      capability: 'customer-subscriptions.revocation.shadow.v1',
      targetRef: 'subscription:subscription-1',
      source: { actorUserId: 'user-owner-1' },
      input: {
        revocationReason: 'approved_policy_revocation',
        approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
        approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
        providerBoundary: 'LOCAL_ONLY',
      },
    });
  });

  it('allows an exact administrator request while preserving owner approval', async () => {
    const h = buildHarness();
    h.findRequester.mockResolvedValue({
      user: { id: 'user-admin-1', status: 'active' },
      membership: {
        id: 'membership-admin-1',
        role: 'administrator',
        status: 'active',
        branchId: 'branch-1',
      },
    });

    const result = await h.service.planRevocation({
      ...validDto(),
      initiator: 'admin_revocation_decision',
      external_requester_id: 'telegram-admin-1',
    });

    expect(result).toMatchObject({
      outcome: 'planned',
      intendedRevocation: {
        requesterRole: 'administrator',
        requesterAuthority: 'tenant_owner_or_admin',
        approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
      },
    });
  });

  it('converges retry, restart, and duplicate decision initiators', async () => {
    const h = buildHarness();
    const restarted = buildHarness();
    const first = await h.service.planRevocation(validDto());
    const retry = await h.service.planRevocation(validDto());
    const restart = await restarted.service.planRevocation(validDto());

    expect([
      first.actionExecutionId,
      retry.actionExecutionId,
      restart.actionExecutionId,
    ]).toEqual(Array(3).fill('revocation-shadow-execution-1'));
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

      await expect(h.service.planRevocation(validDto())).resolves.toMatchObject(
        { outcome: 'terminal_already_claimed' },
      );
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed against competing cancellation or expiry executions', async () => {
    for (const actionClass of [
      'cancel_customer_subscription',
      'expire_customer_subscription',
    ]) {
      const h = buildHarness();
      h.findTerminalConflict.mockResolvedValue({
        id: `execution-${actionClass}`,
        actionClass,
        state: 'READY',
      });

      await expect(h.service.planRevocation(validDto())).resolves.toMatchObject(
        { outcome: 'terminal_transition_conflict' },
      );
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
      const result = await h.service.planRevocation(validDto());
      expect([
        'subscription_not_revocable',
        'lifecycle_evidence_incomplete',
      ]).toContain(result.outcome);
      expect(h.planShadow).not.toHaveBeenCalled();
    }

    const missingLink = buildHarness();
    missingLink.findLink.mockResolvedValue(null);
    await expect(
      missingLink.service.planRevocation(validDto()),
    ).resolves.toMatchObject({ outcome: 'identity_unresolved' });
  });

  it('fails closed for unresolved Client hold', async () => {
    const h = buildHarness();
    h.checkCrmClientRegistrationGuard.mockResolvedValue({
      allowed: false,
      reasonCode: CLIENT_IDENTITY_UNRESOLVED,
    });

    await expect(h.service.planRevocation(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
    });
    expect(h.planShadow).not.toHaveBeenCalled();
  });

  it('rejects forged or insufficient owner/admin authority', async () => {
    const manager = buildHarness();
    manager.findRequester.mockResolvedValue({
      user: { id: 'user-manager', status: 'active' },
      membership: {
        id: 'membership-manager',
        role: 'manager',
        status: 'active',
        branchId: 'branch-1',
      },
    });
    await expect(
      manager.service.planRevocation(validDto()),
    ).resolves.toMatchObject({ outcome: 'requester_unauthorized' });

    const mismatchedInitiator = buildHarness();
    await expect(
      mismatchedInitiator.service.planRevocation({
        ...validDto(),
        initiator: 'admin_revocation_decision',
      }),
    ).resolves.toMatchObject({ outcome: 'requester_unauthorized' });

    const inactive = buildHarness();
    inactive.findRequester.mockResolvedValue({
      user: { id: 'user-owner-1', status: 'active' },
      membership: {
        id: 'membership-owner-1',
        role: 'tenant_owner',
        status: 'suspended',
        branchId: null,
      },
    });
    await expect(
      inactive.service.planRevocation(validDto()),
    ).resolves.toMatchObject({ outcome: 'requester_unauthorized' });
  });

  it('requires both exact revocation decision and evidence references', async () => {
    for (const changed of [
      { revocation_decision_ref: ' ' },
      { revocation_evidence_ref: ' ' },
    ]) {
      const h = buildHarness();
      await expect(
        h.service.planRevocation({ ...validDto(), ...changed }),
      ).resolves.toMatchObject({ outcome: 'revocation_evidence_unresolved' });
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('rejects caller-supplied actor, reason, effective date, approval, and authority', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    for (const field of [
      ['requester_role', 'tenant_owner'],
      ['requester_authority', 'owner'],
      ['revocation_reason', 'payment_failed'],
      ['effective_date', '2026-10-01T00:00:00.000Z'],
      ['approval_binding', 'caller-approved'],
      ['status', 'revoked'],
      ['approved', true],
      ['entitled', true],
      ['autonomy', 'L5'],
    ] as const) {
      await expect(
        pipe.transform(
          { ...validDto(), [field[0]]: field[1] },
          {
            type: 'body',
            metatype: CustomerSubscriptionRevocationShadowDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
