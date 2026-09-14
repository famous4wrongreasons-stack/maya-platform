import { Injectable, NotFoundException } from '@nestjs/common';
import type { BillingPayment } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CreateBillingCheckoutDto } from './dto/create-billing-checkout.dto';
import { P408TenantBillingCanonicalCutoverService } from './p4-08-tenant-billing-canonical-cutover.service';

/**
 * Production billing facade. Read operations remain local projections; every
 * payment/value mutation delegates to the P4-08 canonical cutover adapter.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly canonical: P408TenantBillingCanonicalCutoverService,
  ) {}

  createCheckout(
    tenantId: string,
    actorUserId: string,
    dto: CreateBillingCheckoutDto,
  ) {
    return this.canonical.createCheckout(tenantId, actorUserId, dto);
  }

  chargeTenant(tenantId: string, actorUserId?: string) {
    return this.canonical.chargeTenant(tenantId, actorUserId);
  }

  handleYooKassaWebhook(payload: Record<string, unknown>) {
    return this.canonical.handleYooKassaWebhook(payload);
  }

  reconcilePendingPayments(now = new Date()) {
    return this.canonical.reconcilePendingPayments(now);
  }

  runDueBilling(now = new Date()) {
    return this.canonical.runDueBilling(now);
  }

  async getSubscriptionSummary(tenantId: string) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scoped },
      include: { plan: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const activeUntil = tenant.currentPeriodEnd ?? tenant.trialEndsAt;
    const daysLeft = activeUntil
      ? Math.max(
          0,
          Math.ceil((activeUntil.getTime() - Date.now()) / 86_400_000),
        )
      : null;
    return {
      status: tenant.status,
      plan: tenant.plan
        ? {
            id: tenant.plan.id,
            name: tenant.plan.name,
            price_monthly_kopecks: Math.round(tenant.plan.priceMonthly * 100),
            currency: tenant.defaultCurrency,
          }
        : null,
      trial_ends_at: tenant.trialEndsAt?.toISOString() ?? null,
      current_period_start: tenant.currentPeriodStart?.toISOString() ?? null,
      current_period_end: tenant.currentPeriodEnd?.toISOString() ?? null,
      past_due_at: tenant.pastDueAt?.toISOString() ?? null,
      grace_ends_at: tenant.graceEndsAt?.toISOString() ?? null,
      days_left: daysLeft,
      autopay_enabled: Boolean(tenant.billingMethodId),
    };
  }

  async listTenantPayments(tenantId: string) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const exists = await this.prisma.tenant.count({ where: { id: scoped } });
    if (!exists) throw new NotFoundException('Tenant not found');
    const payments = await this.prisma.billingPayment.findMany({
      where: { tenantId: scoped },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { payments: payments.map((payment) => this.serialize(payment)) };
  }

  private serialize(payment: BillingPayment) {
    return {
      id: payment.id,
      tenant_id: payment.tenantId,
      plan_id: payment.planId,
      provider: payment.provider,
      provider_payment_id: payment.providerPaymentId,
      purpose: payment.purpose,
      status: payment.status,
      amount_kopecks: payment.amountKopecks,
      amount: (payment.amountKopecks / 100).toFixed(2),
      currency: payment.currency,
      confirmation_url: payment.confirmationUrl,
      return_url: payment.returnUrl,
      paid_at: payment.paidAt,
      canceled_at: payment.canceledAt,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }
}
