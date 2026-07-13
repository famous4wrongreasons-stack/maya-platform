import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingService } from './billing.service';
import { BillingSystemGateway } from './billing-system.gateway';
import {
  YooKassaClientService,
  YooKassaPayment,
} from './yookassa-client.service';

type BillingPaymentRecord = {
  id: string;
  tenantId: string;
  planId: string | null;
  provider: string;
  providerPaymentId: string | null;
  idempotenceKey: string;
  purpose: string;
  status: string;
  amountKopecks: number;
  currency: string;
  confirmationUrl: string | null;
  returnUrl: string | null;
  paidAt: Date | null;
  canceledAt: Date | null;
  providerPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type BillingPaymentCreateArgs = {
  data: {
    tenantId: string;
    planId: string | null;
    amountKopecks: number;
    purpose: string;
  };
};

type TenantRecord = {
  id: string;
  name: string;
  status: string;
  planId: string | null;
  trialEndsAt: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd: Date | null;
  billingMethodId: string | null;
  plan?: {
    id: string;
    name: string;
    priceMonthly: number;
  } | null;
};

type TenantUpdateArgs = {
  where: {
    id: string;
  };
  data: {
    status?: string;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    billingMethodId?: string | null;
  };
};

describe('BillingService', () => {
  const basePayment = (): BillingPaymentRecord => ({
    id: 'billing-payment-1',
    tenantId: 'tenant-1',
    planId: 'plan-salon',
    provider: 'yookassa',
    providerPaymentId: null,
    idempotenceKey: 'idem-1',
    purpose: 'initial_checkout',
    status: 'pending',
    amountKopecks: 249000,
    currency: 'RUB',
    confirmationUrl: null,
    returnUrl: 'http://127.0.0.1:8787/maya-admin.html',
    paidAt: null,
    canceledAt: null,
    providerPayload: null,
    createdAt: new Date('2026-07-05T12:00:00.000Z'),
    updatedAt: new Date('2026-07-05T12:00:00.000Z'),
  });

  const pendingProviderPayment = (): YooKassaPayment => ({
    id: 'yk-payment-1',
    status: 'pending',
    amount: {
      value: '2490.00',
      currency: 'RUB',
    },
    confirmation: {
      type: 'redirect',
      confirmation_url: 'https://yookassa.ru/checkout/payments/yk-payment-1',
    },
  });

  const succeededProviderPayment = (): YooKassaPayment => ({
    id: 'yk-payment-1',
    status: 'succeeded',
    paid: true,
    amount: {
      value: '2490.00',
      currency: 'RUB',
    },
    payment_method: {
      id: 'pm_saved_1',
      saved: true,
    },
    captured_at: '2026-07-05T12:05:00.000Z',
  });

  const createService = (prisma: PrismaService) => {
    const subscriptionsService = {
      getPlanByIdOrThrow: jest.fn().mockResolvedValue({
        id: 'plan-salon',
        name: 'Салон',
        priceMonthly: 2490,
      }),
    } as unknown as SubscriptionsService;
    const createPaymentMock: jest.MockedFunction<
      YooKassaClientService['createPayment']
    > = jest.fn();
    const getPaymentMock: jest.MockedFunction<
      YooKassaClientService['getPayment']
    > = jest.fn();
    const yooKassaClient = {
      createPayment: createPaymentMock,
      getPayment: getPaymentMock,
    } as unknown as YooKassaClientService;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'YOOKASSA_RETURN_URL'
          ? 'http://127.0.0.1:8787/maya-admin.html'
          : undefined,
      ),
    } as unknown as ConfigService;
    const tenantContext = new TenantContextService();
    const findPaymentByProviderPaymentIdMock = jest.fn();
    const listBillingCandidatesMock = jest.fn().mockResolvedValue([]);
    const systemGateway = {
      findPaymentByProviderPaymentId: findPaymentByProviderPaymentIdMock,
      listBillingCandidates: listBillingCandidatesMock,
    } as unknown as BillingSystemGateway;

    return {
      service: new BillingService(
        prisma,
        subscriptionsService,
        yooKassaClient,
        configService,
        tenantContext,
        systemGateway,
      ),
      tenantContext,
      subscriptionsService,
      createPaymentMock,
      getPaymentMock,
      findPaymentByProviderPaymentIdMock,
      listBillingCandidatesMock,
    };
  };

  it('creates a YooKassa checkout payment that can save a payment method', async () => {
    const payment = basePayment();
    const providerPayment = pendingProviderPayment();
    const billingPaymentCreateMock: jest.MockedFunction<
      (args: BillingPaymentCreateArgs) => Promise<BillingPaymentRecord>
    > = jest.fn().mockResolvedValue(payment);
    const billingPaymentUpdateMock = jest
      .fn()
      .mockResolvedValueOnce({
        ...payment,
        providerPaymentId: providerPayment.id,
        confirmationUrl: providerPayment.confirmation?.confirmation_url,
      })
      .mockResolvedValueOnce({
        ...payment,
        providerPaymentId: providerPayment.id,
        confirmationUrl: providerPayment.confirmation?.confirmation_url,
      });
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: 'Demo Salon',
          planId: 'plan-salon',
        }),
      },
      billingPayment: {
        create: billingPaymentCreateMock,
        update: billingPaymentUpdateMock,
      },
    } as unknown as PrismaService;
    const { service, tenantContext, createPaymentMock } = createService(prisma);

    createPaymentMock.mockResolvedValue(providerPayment);

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.createCheckout('tenant-1', {
        returnUrl: 'http://127.0.0.1:8787/maya-admin.html',
      }),
    );

    const [billingPaymentCreateArgs] =
      billingPaymentCreateMock.mock.calls[0] ?? [];

    expect(billingPaymentCreateArgs.data.tenantId).toBe('tenant-1');
    expect(billingPaymentCreateArgs.data.planId).toBe('plan-salon');
    expect(billingPaymentCreateArgs.data.amountKopecks).toBe(249000);
    expect(billingPaymentCreateArgs.data.purpose).toBe('initial_checkout');
    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: {
          value: '2490.00',
          currency: 'RUB',
        },
        save_payment_method: true,
      }),
      'idem-1',
    );
    expect(billingPaymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: {
            id: 'billing-payment-1',
            tenantId: 'tenant-1',
          },
        },
      }),
    );
    expect(result.confirmation_url).toBe(
      'https://yookassa.ru/checkout/payments/yk-payment-1',
    );
  });

  it('applies verified succeeded webhook and activates the tenant period', async () => {
    const payment = {
      ...basePayment(),
      providerPaymentId: 'yk-payment-1',
    };
    const tenant: TenantRecord = {
      id: 'tenant-1',
      name: 'Demo Salon',
      status: 'trial',
      planId: 'plan-salon',
      trialEndsAt: new Date('2026-07-19T12:00:00.000Z'),
      currentPeriodEnd: null,
      billingMethodId: null,
    };
    const billingPaymentUpdateMock = jest.fn().mockResolvedValue({
      ...payment,
      status: 'succeeded',
      paidAt: new Date('2026-07-05T12:05:00.000Z'),
    });
    const tenantUpdateMock: jest.MockedFunction<
      (args: TenantUpdateArgs) => Promise<TenantRecord>
    > = jest.fn().mockResolvedValue({
      ...tenant,
      status: TenantStatus.ACTIVE,
      currentPeriodStart: new Date('2026-07-05T12:05:00.000Z'),
      currentPeriodEnd: new Date('2026-08-05T12:05:00.000Z'),
      billingMethodId: 'pm_saved_1',
    });
    const transactionMock = jest
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            tenant: {
              findUnique: jest.fn().mockResolvedValue(tenant),
              update: tenantUpdateMock,
            },
            billingPayment: {
              update: billingPaymentUpdateMock,
            },
          }),
        ),
      );
    const prisma = {
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const {
      service,
      tenantContext,
      getPaymentMock,
      findPaymentByProviderPaymentIdMock,
    } = createService(prisma);

    findPaymentByProviderPaymentIdMock.mockResolvedValue(payment);
    getPaymentMock.mockImplementation(() => {
      expect(tenantContext.requireTenantId()).toBe('tenant-1');
      return Promise.resolve(succeededProviderPayment());
    });

    const result = await service.handleYooKassaWebhook({
      type: 'notification',
      event: 'payment.succeeded',
      object: {
        id: 'yk-payment-1',
      },
    });

    expect(getPaymentMock).toHaveBeenCalledWith('yk-payment-1');
    const [tenantUpdateArgs] = tenantUpdateMock.mock.calls[0] ?? [];

    expect(tenantUpdateArgs.where).toEqual({ id: 'tenant-1' });
    expect(tenantUpdateArgs.data.status).toBe(TenantStatus.ACTIVE);
    expect(tenantUpdateArgs.data.currentPeriodStart).toEqual(
      new Date('2026-07-05T12:05:00.000Z'),
    );
    expect(tenantUpdateArgs.data.currentPeriodEnd).toEqual(
      new Date('2026-08-05T12:05:00.000Z'),
    );
    expect(tenantUpdateArgs.data.billingMethodId).toBe('pm_saved_1');
    expect(billingPaymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: {
            id: 'billing-payment-1',
            tenantId: 'tenant-1',
          },
        },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      event: 'payment.succeeded',
      tenant: {
        id: 'tenant-1',
        status: TenantStatus.ACTIVE,
        billing_method_attached: true,
      },
    });
  });

  it('marks expired tenants past_due when there is no saved billing method', async () => {
    const tenant: TenantRecord = {
      id: 'tenant-1',
      name: 'Demo Salon',
      status: TenantStatus.ACTIVE,
      planId: 'plan-salon',
      trialEndsAt: null,
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      billingMethodId: null,
    };
    const tenantUpdateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      tenant: {
        update: tenantUpdateMock,
      },
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const { service, tenantContext, listBillingCandidatesMock } =
      createService(prisma);
    tenantUpdateMock.mockImplementation(() => {
      expect(tenantContext.requireTenantId()).toBe('tenant-1');
      return Promise.resolve(undefined);
    });
    listBillingCandidatesMock.mockResolvedValue([tenant]);

    const result = await service.runDueBilling(
      new Date('2026-07-05T12:00:00.000Z'),
    );

    expect(tenantUpdateMock).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: {
        status: TenantStatus.PAST_DUE,
        trialFullAccess: false,
      },
    });
    expect(result).toMatchObject({
      checked: 1,
      marked_past_due: 1,
      charged: 0,
    });
  });

  it('rejects a foreign billing tenant before database access', async () => {
    const tenantFindUniqueMock = jest.fn();
    const billingPaymentFindManyMock = jest.fn();
    const prisma = {
      tenant: {
        findUnique: tenantFindUniqueMock,
      },
      billingPayment: {
        findMany: billingPaymentFindManyMock,
      },
    } as unknown as PrismaService;
    const { service, tenantContext } = createService(prisma);

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.listTenantPayments('tenant-b'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantFindUniqueMock).not.toHaveBeenCalled();
    expect(billingPaymentFindManyMock).not.toHaveBeenCalled();
  });

  it('fails closed before billing access without tenant context', async () => {
    const tenantFindUniqueMock = jest.fn();
    const prisma = {
      tenant: {
        findUnique: tenantFindUniqueMock,
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(
      service.createCheckout('tenant-1', {
        returnUrl: 'http://127.0.0.1:8787/maya-admin.html',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantFindUniqueMock).not.toHaveBeenCalled();
  });

  it('rejects verified provider metadata for a different tenant', async () => {
    const payment = {
      ...basePayment(),
      providerPaymentId: 'yk-payment-1',
    };
    const transactionMock = jest.fn();
    const prisma = {
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const {
      service,
      tenantContext,
      getPaymentMock,
      findPaymentByProviderPaymentIdMock,
    } = createService(prisma);
    findPaymentByProviderPaymentIdMock.mockResolvedValue(payment);
    getPaymentMock.mockResolvedValue({
      ...succeededProviderPayment(),
      metadata: {
        tenant_id: 'tenant-b',
        billing_payment_id: payment.id,
      },
    });

    await expect(
      service.handleYooKassaWebhook({
        type: 'notification',
        event: 'payment.succeeded',
        object: {
          id: 'yk-payment-1',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(tenantContext.get()).toBeUndefined();
  });
});
