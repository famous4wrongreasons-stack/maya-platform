import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { TenantStatus } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateBillingCheckoutDto } from './dto/create-billing-checkout.dto';
import {
  YooKassaClientService,
  YooKassaPayment,
} from './yookassa-client.service';

const PAYMENT_PROVIDER_YOOKASSA = 'yookassa';
const PAYMENT_PURPOSE_INITIAL = 'initial_checkout';
const PAYMENT_PURPOSE_RECURRING = 'recurring';
const PAYMENT_STATUS_PENDING = 'pending';
const PAYMENT_STATUS_SUCCEEDED = 'succeeded';
const PAYMENT_STATUS_CANCELED = 'canceled';
const PAYMENT_STATUS_FAILED = 'failed';
const RUB_CURRENCY = 'RUB';

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

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly yooKassaClient: YooKassaClientService,
    private readonly configService: ConfigService,
  ) {}

  async createCheckout(tenantId: string, dto: CreateBillingCheckoutDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const planId = dto.planId ?? tenant.planId;

    if (!planId) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_plan_required',
          'Select a subscription plan before starting checkout.',
          'planId',
        ),
      );
    }

    const plan = await this.subscriptionsService.getPlanByIdOrThrow(planId);
    const returnUrl = this.resolveReturnUrl(dto.returnUrl);
    const amountKopecks = this.normalizeAmount(plan.priceMonthly);

    const payment = await this.prisma.billingPayment.create({
      data: {
        tenantId,
        planId: plan.id,
        provider: PAYMENT_PROVIDER_YOOKASSA,
        idempotenceKey: randomUUID(),
        purpose: PAYMENT_PURPOSE_INITIAL,
        status: PAYMENT_STATUS_PENDING,
        amountKopecks,
        currency: RUB_CURRENCY,
        returnUrl,
      },
    });

    try {
      const providerPayment = await this.yooKassaClient.createPayment(
        {
          amount: {
            value: this.formatKopecks(amountKopecks),
            currency: RUB_CURRENCY,
          },
          confirmation: {
            type: 'redirect',
            return_url: returnUrl,
          },
          capture: true,
          save_payment_method: true,
          description: this.buildPaymentDescription(tenant.name, plan.name),
          metadata: {
            tenant_id: tenant.id,
            billing_payment_id: payment.id,
            plan_id: plan.id,
            purpose: PAYMENT_PURPOSE_INITIAL,
          },
        },
        payment.idempotenceKey,
      );

      const syncedPayment = await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: providerPayment.id,
          status: this.normalizeProviderStatus(providerPayment.status),
          confirmationUrl:
            providerPayment.confirmation?.confirmation_url ?? null,
          providerPayload: asJson(providerPayment),
        },
      });

      const result = await this.applyProviderPaymentIfFinal(
        syncedPayment,
        providerPayment,
      );

      return {
        payment: this.serializePayment(result.payment),
        confirmation_url: result.payment.confirmationUrl,
        tenant: result.tenant,
      };
    } catch (error) {
      await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          status: PAYMENT_STATUS_FAILED,
          providerPayload: asJson({
            error: error instanceof Error ? error.message : 'unknown_error',
          }),
        },
      });

      throw error;
    }
  }

  async chargeTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!tenant.planId || !tenant.plan) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_plan_required',
          'Tenant has no subscription plan to charge.',
        ),
      );
    }

    if (!tenant.billingMethodId) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_method_required',
          'Tenant has no saved YooKassa payment method.',
        ),
      );
    }

    const pendingPayment = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId,
        purpose: PAYMENT_PURPOSE_RECURRING,
        status: PAYMENT_STATUS_PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingPayment) {
      throw new ConflictException(
        this.buildBillingError(
          'billing_payment_pending',
          'A recurring charge is already pending for this tenant.',
        ),
      );
    }

    const amountKopecks = this.normalizeAmount(tenant.plan.priceMonthly);
    const payment = await this.prisma.billingPayment.create({
      data: {
        tenantId,
        planId: tenant.plan.id,
        provider: PAYMENT_PROVIDER_YOOKASSA,
        idempotenceKey: randomUUID(),
        purpose: PAYMENT_PURPOSE_RECURRING,
        status: PAYMENT_STATUS_PENDING,
        amountKopecks,
        currency: RUB_CURRENCY,
      },
    });

    try {
      const providerPayment = await this.yooKassaClient.createPayment(
        {
          amount: {
            value: this.formatKopecks(amountKopecks),
            currency: RUB_CURRENCY,
          },
          capture: true,
          payment_method_id: tenant.billingMethodId,
          description: this.buildPaymentDescription(
            tenant.name,
            tenant.plan.name,
          ),
          metadata: {
            tenant_id: tenant.id,
            billing_payment_id: payment.id,
            plan_id: tenant.plan.id,
            purpose: PAYMENT_PURPOSE_RECURRING,
          },
        },
        payment.idempotenceKey,
      );

      const syncedPayment = await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: providerPayment.id,
          status: this.normalizeProviderStatus(providerPayment.status),
          providerPayload: asJson(providerPayment),
        },
      });

      const result = await this.applyProviderPaymentIfFinal(
        syncedPayment,
        providerPayment,
      );

      return {
        payment: this.serializePayment(result.payment),
        tenant: result.tenant,
      };
    } catch (error) {
      await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          status: PAYMENT_STATUS_FAILED,
          providerPayload: asJson({
            error: error instanceof Error ? error.message : 'unknown_error',
          }),
        },
      });
      await this.markTenantPastDue(tenant.id);

      throw error;
    }
  }

  async handleYooKassaWebhook(payload: Record<string, unknown>) {
    const event = typeof payload.event === 'string' ? payload.event : null;
    const object = this.asRecord(payload.object);
    const providerPaymentId =
      typeof object?.id === 'string' ? object.id.trim() : null;

    if (payload.type !== 'notification' || !event || !providerPaymentId) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_webhook_invalid',
          'Invalid YooKassa webhook payload.',
        ),
      );
    }

    if (!event.startsWith('payment.')) {
      return {
        ok: true,
        ignored: true,
        event,
      };
    }

    const payment = await this.prisma.billingPayment.findUnique({
      where: { providerPaymentId },
    });

    if (!payment) {
      return {
        ok: true,
        ignored: true,
        event,
        provider_payment_id: providerPaymentId,
      };
    }

    const verifiedPayment =
      await this.yooKassaClient.getPayment(providerPaymentId);
    const result = await this.applyProviderPaymentIfFinal(
      payment,
      verifiedPayment,
    );

    return {
      ok: true,
      event,
      payment: this.serializePayment(result.payment),
      tenant: result.tenant,
    };
  }

  async runDueBilling(now = new Date()) {
    const candidates = await this.prisma.tenant.findMany({
      where: {
        status: {
          in: [TenantStatus.ACTIVE, TenantStatus.TRIAL, TenantStatus.PAST_DUE],
        },
      },
      include: { plan: true },
    });
    const result = {
      checked: candidates.length,
      charged: 0,
      marked_past_due: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ tenant_id: string; message: string }>,
    };

    for (const tenant of candidates) {
      const accessWindowEndsAt =
        tenant.currentPeriodEnd ?? tenant.trialEndsAt ?? null;

      if (!accessWindowEndsAt || accessWindowEndsAt.getTime() > now.getTime()) {
        result.skipped += 1;
        continue;
      }

      const pendingPayment = await this.prisma.billingPayment.findFirst({
        where: {
          tenantId: tenant.id,
          status: PAYMENT_STATUS_PENDING,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingPayment) {
        result.skipped += 1;
        continue;
      }

      if (tenant.billingMethodId && tenant.planId) {
        try {
          await this.chargeTenant(tenant.id);
          result.charged += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            tenant_id: tenant.id,
            message: error instanceof Error ? error.message : 'unknown_error',
          });
        }
        continue;
      }

      await this.markTenantPastDue(tenant.id);
      result.marked_past_due += 1;
    }

    return result;
  }

  async listTenantPayments(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const payments = await this.prisma.billingPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      payments: payments.map((payment) => this.serializePayment(payment)),
    };
  }

  private async applyProviderPaymentIfFinal(
    payment: BillingPaymentRecord,
    providerPayment: YooKassaPayment,
  ) {
    this.assertProviderPaymentMatchesLocal(payment, providerPayment);

    if (providerPayment.status === PAYMENT_STATUS_SUCCEEDED) {
      return this.applySuccessfulPayment(payment, providerPayment);
    }

    if (providerPayment.status === PAYMENT_STATUS_CANCELED) {
      const canceledPayment = await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          status: PAYMENT_STATUS_CANCELED,
          canceledAt: this.parseProviderDate(providerPayment.canceled_at),
          providerPayload: asJson(providerPayment),
        },
      });

      if (payment.purpose === PAYMENT_PURPOSE_RECURRING) {
        await this.markTenantPastDue(payment.tenantId);
      }

      return {
        payment: canceledPayment,
        tenant: null,
      };
    }

    const pendingPayment = await this.prisma.billingPayment.update({
      where: { id: payment.id },
      data: {
        status: this.normalizeProviderStatus(providerPayment.status),
        providerPayload: asJson(providerPayment),
      },
    });

    return {
      payment: pendingPayment,
      tenant: null,
    };
  }

  private async applySuccessfulPayment(
    payment: BillingPaymentRecord,
    providerPayment: YooKassaPayment,
  ) {
    const paidAt =
      this.parseProviderDate(providerPayment.captured_at) ?? new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: payment.tenantId },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      const periodStartBase =
        tenant.currentPeriodEnd &&
        tenant.currentPeriodEnd.getTime() > paidAt.getTime()
          ? tenant.currentPeriodEnd
          : paidAt;
      const periodEnd = this.addCalendarMonths(periodStartBase, 1);
      const savedPaymentMethodId =
        providerPayment.payment_method?.saved &&
        providerPayment.payment_method.id
          ? providerPayment.payment_method.id
          : tenant.billingMethodId;

      const updatedPayment = await tx.billingPayment.update({
        where: { id: payment.id },
        data: {
          status: PAYMENT_STATUS_SUCCEEDED,
          paidAt,
          providerPayload: asJson(providerPayment),
        },
      });
      const updatedTenant = await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          status: TenantStatus.ACTIVE,
          planId: payment.planId ?? tenant.planId,
          currentPeriodStart: periodStartBase,
          currentPeriodEnd: periodEnd,
          billingMethodId: savedPaymentMethodId,
        },
      });

      return {
        payment: updatedPayment,
        tenant: updatedTenant,
      };
    });

    return {
      payment: result.payment,
      tenant: {
        id: result.tenant.id,
        status: result.tenant.status,
        plan_id: result.tenant.planId,
        current_period_start: result.tenant.currentPeriodStart,
        current_period_end: result.tenant.currentPeriodEnd,
        billing_method_attached: Boolean(result.tenant.billingMethodId),
      },
    };
  }

  private async markTenantPastDue(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.PAST_DUE,
      },
    });
  }

  private assertProviderPaymentMatchesLocal(
    payment: BillingPaymentRecord,
    providerPayment: YooKassaPayment,
  ) {
    const providerAmount = providerPayment.amount;

    if (!providerAmount) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_payment_invalid',
          'YooKassa payment has no amount.',
        ),
      );
    }

    if (
      this.parseRubToKopecks(providerAmount.value) !== payment.amountKopecks ||
      providerAmount.currency !== payment.currency
    ) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_payment_amount_mismatch',
          'YooKassa payment amount does not match the local billing payment.',
        ),
      );
    }
  }

  private resolveReturnUrl(returnUrl?: string): string {
    const resolved =
      returnUrl?.trim() ||
      this.configService.get<string>('YOOKASSA_RETURN_URL')?.trim() ||
      this.configService.get<string>('BILLING_RETURN_URL')?.trim();

    if (!resolved) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_return_url_required',
          'Set returnUrl or YOOKASSA_RETURN_URL before starting checkout.',
          'returnUrl',
        ),
      );
    }

    return resolved;
  }

  private normalizeAmount(priceMonthly: number): number {
    if (!Number.isFinite(priceMonthly) || priceMonthly <= 0) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_plan_price_invalid',
          'Subscription plan price must be greater than zero.',
        ),
      );
    }

    return Math.round(priceMonthly * 100);
  }

  private formatKopecks(amountKopecks: number): string {
    return (amountKopecks / 100).toFixed(2);
  }

  private parseRubToKopecks(value: string): number {
    return Math.round(Number(value) * 100);
  }

  private normalizeProviderStatus(status: string): string {
    if (status === PAYMENT_STATUS_SUCCEEDED) {
      return PAYMENT_STATUS_SUCCEEDED;
    }

    if (status === PAYMENT_STATUS_CANCELED) {
      return PAYMENT_STATUS_CANCELED;
    }

    return PAYMENT_STATUS_PENDING;
  }

  private parseProviderDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private addCalendarMonths(date: Date, months: number): Date {
    const next = new Date(date.getTime());
    next.setUTCMonth(next.getUTCMonth() + months);

    return next;
  }

  private buildPaymentDescription(
    tenantName: string,
    planName: string,
  ): string {
    return `MAYA SaaS: ${tenantName}, ${planName}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private serializePayment(payment: BillingPaymentRecord) {
    return {
      id: payment.id,
      tenant_id: payment.tenantId,
      plan_id: payment.planId,
      provider: payment.provider,
      provider_payment_id: payment.providerPaymentId,
      purpose: payment.purpose,
      status: payment.status,
      amount_kopecks: payment.amountKopecks,
      amount: this.formatKopecks(payment.amountKopecks),
      currency: payment.currency,
      confirmation_url: payment.confirmationUrl,
      return_url: payment.returnUrl,
      paid_at: payment.paidAt,
      canceled_at: payment.canceledAt,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }

  private buildBillingError(
    code:
      | 'billing_method_required'
      | 'billing_payment_amount_mismatch'
      | 'billing_payment_invalid'
      | 'billing_payment_pending'
      | 'billing_plan_price_invalid'
      | 'billing_plan_required'
      | 'billing_return_url_required'
      | 'billing_webhook_invalid',
    message: string,
    field?: string,
  ) {
    return {
      message,
      error: {
        code,
        message,
        ...(field ? { field } : {}),
      },
    };
  }
}
