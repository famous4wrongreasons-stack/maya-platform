import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import {
  P4_08_EXECUTABLE_CAPABILITIES,
  P4_08_SAFETY_LIMITS,
  P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type { ActionEngineKernel } from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingSystemGateway } from './billing-system.gateway';
import { P408TenantBillingCanonicalCutoverService } from './p4-08-tenant-billing-canonical-cutover.service';
import type { P408TenantBillingExecutableService } from './p4-08-tenant-billing-executable.service';
import type {
  P408ActionProviderReferenceCodec,
  P408YooKassaPaymentProvider,
} from './p4-08-yookassa-payment-provider';

const NOW = new Date('2026-09-02T12:00:00.000Z');
const DUE = new Date('2026-09-01T12:00:00.000Z');

function payment(id = 'payment-1') {
  return {
    id,
    tenantId: 'tenant-1',
    actionExecutionId: 'execution-1',
    planId: 'plan-1',
    provider: 'yookassa',
    providerPaymentId: 'provider-payment-1',
    idempotenceKey: 'transport-1',
    purpose: 'initial_checkout',
    status: 'pending',
    amountKopecks: 299_000,
    currency: 'RUB',
    confirmationUrl: 'https://yookassa.example/p/1',
    returnUrl: 'https://app.example/billing-return',
    paidAt: null,
    canceledAt: null,
    providerPayload: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function harness() {
  const execute = jest.fn((request: TrustedActionExecutionRequestV1) =>
    Promise.resolve({
      value: {
        actionClass:
          request.capability === P4_08_EXECUTABLE_CAPABILITIES.recurring
            ? 'charge_tenant_billing_recurring'
            : request.capability === P4_08_SCHEDULER_ENVELOPE_CAPABILITY
              ? 'tenant_billing_scheduler_envelope'
              : 'initiate_tenant_billing_checkout',
        actionExecutionId: 'execution-1',
        billingPaymentId: 'payment-1',
        providerState: 'pending',
        providerDispatches: 1,
        paymentMutations: 1,
        entitlementMutations: 0,
      },
    }),
  );
  const tenant = {
    id: 'tenant-1',
    planId: 'plan-1',
    plan: {
      id: 'plan-1',
      name: 'Business',
      priceMonthly: 2990,
    },
    status: 'active',
    defaultCurrency: 'RUB',
    currentPeriodEnd: null,
    trialEndsAt: null,
    billingMethodId: null,
  };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    subscriptionPlan: {
      findUnique: jest.fn().mockResolvedValue(tenant.plan),
    },
    billingPayment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(payment()),
    },
  } as unknown as PrismaService;
  const listBillingCandidates = jest.fn().mockResolvedValue([]);
  const getBillingCandidate = jest.fn().mockResolvedValue(tenant);
  const gateway = {
    listBillingCandidates,
    getBillingCandidate,
    listPendingPayments: jest.fn().mockResolvedValue([]),
    findPaymentByProviderPaymentId: jest.fn(),
  } as unknown as BillingSystemGateway;
  const tenantContext = {
    assertTenantId: jest.fn((tenantId: string) => tenantId),
    runAsSystemTenant: jest.fn(
      (_tenantId: string, work: () => Promise<unknown>) => work(),
    ),
  } as unknown as TenantContextService;
  const provider = {
    checkoutReturnUrl: jest.fn(() => 'https://app.example/billing-return'),
    getPayment: jest.fn(),
  } as unknown as P408YooKassaPaymentProvider;
  const codec = {
    hash: jest.fn((value: string) => `hash:${value}`),
  } as unknown as P408ActionProviderReferenceCodec;
  const service = new P408TenantBillingCanonicalCutoverService(
    prisma,
    tenantContext,
    gateway,
    { execute } as unknown as P408TenantBillingExecutableService,
    provider,
    codec,
    {} as ActionEngineKernel,
    { get: jest.fn() } as unknown as ConfigService,
  );
  return {
    service,
    execute,
    prisma,
    gateway,
    tenant,
    provider,
    listBillingCandidates,
    getBillingCandidate,
  };
}

describe('P408TenantBillingCanonicalCutoverService', () => {
  it('derives checkout amount/currency/policy and sends one canonical action', async () => {
    const h = harness();
    await expect(
      h.service.createCheckout('tenant-1', 'actor-1', {
        planId: 'plan-1',
        returnUrl: 'https://app.example/after-payment',
      }),
    ).resolves.toMatchObject({
      payment: { id: 'payment-1', amount_kopecks: 299_000 },
    });

    expect(h.execute).toHaveBeenCalledTimes(1);
    const checkoutRequest = h.execute.mock.calls[0]?.[0];
    expect(checkoutRequest).toMatchObject({
      tenantId: 'tenant-1',
      capability: P4_08_EXECUTABLE_CAPABILITIES.checkout,
      source: {
        type: 'authenticated_request',
        actorUserId: 'actor-1',
      },
      input: {
        tenantId: 'tenant-1',
        planId: 'plan-1',
        amountKopecks: 299_000,
        currency: 'RUB',
        expectedProviderState: 'PENDING',
        providerDispatchPerformed: false,
        paymentDerivedEntitlementMutations: 0,
      },
    });
  });

  it('fails closed for a different-plan active-window prepayment', async () => {
    const h = harness();
    Object.assign(h.tenant, {
      planId: 'plan-old',
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    });
    await expect(
      h.service.createCheckout('tenant-1', 'actor-1', { planId: 'plan-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('builds bounded recurring envelope and child facts server-side', async () => {
    const h = harness();
    const candidate = {
      ...h.tenant,
      currentPeriodEnd: DUE,
      billingMethodId: 'saved-method-1',
    };
    h.listBillingCandidates.mockResolvedValue([candidate]);
    await expect(h.service.runDueBilling(NOW)).resolves.toMatchObject({
      checked: 1,
      charged: 1,
      failed: 0,
    });

    expect(h.listBillingCandidates).toHaveBeenCalledWith(
      NOW,
      P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope,
    );
    expect(h.execute.mock.calls[0]?.[0]).toMatchObject({
      capability: P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
      input: { childCount: 1, aggregateKopecks: 299_000 },
    });
    expect(h.execute.mock.calls[1]?.[0]).toMatchObject({
      capability: P4_08_EXECUTABLE_CAPABILITIES.recurring,
      input: {
        amountKopecks: 299_000,
        dueWindowEndsAt: DUE.toISOString(),
        envelopeChildCount: 1,
        envelopeAggregateKopecks: 299_000,
      },
    });
  });

  it('does not create a recurring intent before the exact due window', async () => {
    const h = harness();
    h.getBillingCandidate.mockResolvedValue({
      ...h.tenant,
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      billingMethodId: 'saved-method-1',
    });
    await expect(
      h.service.chargeTenant('tenant-1', 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.execute).not.toHaveBeenCalled();
  });
});
