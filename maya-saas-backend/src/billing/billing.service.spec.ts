import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingService } from './billing.service';
import { P408TenantBillingCanonicalCutoverService } from './p4-08-tenant-billing-canonical-cutover.service';

describe('BillingService canonical cutover facade', () => {
  const tenantContext = new TenantContextService();
  const createCheckout = jest.fn();
  const chargeTenant = jest.fn();
  const handleYooKassaWebhook = jest.fn();
  const reconcilePendingPayments = jest.fn();
  const runDueBilling = jest.fn();
  const canonical = {
    createCheckout,
    chargeTenant,
    handleYooKassaWebhook,
    reconcilePendingPayments,
    runDueBilling,
  } as unknown as P408TenantBillingCanonicalCutoverService;

  beforeEach(() => jest.clearAllMocks());

  function service(prisma: PrismaService) {
    return new BillingService(prisma, tenantContext, canonical);
  }

  it('delegates checkout/payment/lifecycle mutations to the canonical owner', async () => {
    createCheckout.mockResolvedValue({ payment: { id: 'payment-1' } });
    chargeTenant.mockResolvedValue({ payment: { id: 'payment-2' } });
    handleYooKassaWebhook.mockResolvedValue({ ok: true });
    reconcilePendingPayments.mockResolvedValue({ checked: 0 });
    runDueBilling.mockResolvedValue({ checked: 0 });
    const facade = service({} as PrismaService);

    await expect(
      facade.createCheckout('tenant-1', 'actor-1', { planId: 'plan-1' }),
    ).resolves.toEqual({ payment: { id: 'payment-1' } });
    await facade.chargeTenant('tenant-1', 'actor-1');
    await facade.handleYooKassaWebhook({ type: 'notification' });
    const now = new Date('2026-09-02T12:00:00.000Z');
    await facade.reconcilePendingPayments(now);
    await facade.runDueBilling(now);

    expect(createCheckout).toHaveBeenCalledWith('tenant-1', 'actor-1', {
      planId: 'plan-1',
    });
    expect(chargeTenant).toHaveBeenCalledWith('tenant-1', 'actor-1');
    expect(handleYooKassaWebhook).toHaveBeenCalledWith({
      type: 'notification',
    });
    expect(reconcilePendingPayments).toHaveBeenCalledWith(now);
    expect(runDueBilling).toHaveBeenCalledWith(now);
  });

  it('keeps subscription/payment reads tenant-scoped and mutation-free', async () => {
    const tenant = {
      id: 'tenant-1',
      status: 'active',
      plan: { id: 'plan-1', name: 'Base', priceMonthly: 2990 },
      defaultCurrency: 'RUB',
      trialEndsAt: null,
      currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      pastDueAt: null,
      graceEndsAt: null,
      billingMethodId: 'saved-method',
    };
    const findUnique = jest.fn().mockResolvedValue(tenant);
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      tenant: { findUnique, count },
      billingPayment: { findMany },
    } as unknown as PrismaService;

    await tenantContext.runAsSystemTenant('tenant-1', async () => {
      await expect(
        service(prisma).getSubscriptionSummary('tenant-1'),
      ).resolves.toMatchObject({
        status: 'active',
        plan: { id: 'plan-1', price_monthly_kopecks: 299000 },
        autopay_enabled: true,
      });
      await expect(
        service(prisma).listTenantPayments('tenant-1'),
      ).resolves.toEqual({ payments: [] });
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      include: { plan: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('rejects a missing tenant and foreign tenant reads', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      billingPayment: { findMany: jest.fn() },
    } as unknown as PrismaService;
    await tenantContext.runAsSystemTenant('tenant-1', async () => {
      await expect(
        service(prisma).getSubscriptionSummary('tenant-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service(prisma).listTenantPayments('tenant-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
