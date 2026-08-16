import {
  BadRequestException,
  Logger,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { TenantStatus, UserRole } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { addDays, PAST_DUE_GRACE_DAYS } from '../tenants/tenant-access-state';
import { BillingSystemGateway } from './billing-system.gateway';
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

type BillingCandidateRecord = {
  id: string;
  planId: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  billingMethodId: string | null;
  pastDueAt: Date | null;
  graceEndsAt: Date | null;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly yooKassaClient: YooKassaClientService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly systemGateway: BillingSystemGateway,
    private readonly auditLog: AuditLogService,
  ) {}

  async createCheckout(tenantId: string, dto: CreateBillingCheckoutDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
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
        tenantId: scopedTenantId,
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
          save_payment_method: this.isRecurringEnabled(),
          description: this.buildPaymentDescription(tenant.name, plan.name),
          ...(await this.buildReceipt(
            scopedTenantId,
            plan.name,
            amountKopecks,
          )),
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
        where: this.paymentWhere(payment),
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
        where: this.paymentWhere(payment),
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
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
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
        tenantId: scopedTenantId,
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
        tenantId: scopedTenantId,
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
        where: this.paymentWhere(payment),
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
        where: this.paymentWhere(payment),
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

    const payment =
      await this.systemGateway.findPaymentByProviderPaymentId(
        providerPaymentId,
      );

    if (!payment) {
      return {
        ok: true,
        ignored: true,
        event,
        provider_payment_id: providerPaymentId,
      };
    }

    return this.tenantContext.runAsSystemTenant(payment.tenantId, async () => {
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
    });
  }

  /**
   * Сверка «зависших» платежей с банком.
   *
   * 🔴 Уведомление от ЮKassa может не дойти: не настроен адрес, таймаут,
   * недоступный сервер. Тогда деньги списаны, а подписка не продлена — салон
   * заплатил и наутро отключён. Это худшее, что может случиться с платящим
   * клиентом, и полагаться на один канал доставки нельзя.
   *
   * Поэтому спрашиваем у банка сами: берём платежи, которые у нас всё ещё
   * «в ожидании», но у которых есть номер в банке, и досчитываем финальные.
   * Проверка идёт через тот же путь, что и уведомление, — статус берётся у
   * ЮKassa, а не выдумывается.
   */
  async reconcilePendingPayments(now = new Date()) {
    // Свежие платежи не трогаем: человек может прямо сейчас быть на странице
    // оплаты, и дёргать банк на каждом тике незачем.
    const olderThan = new Date(now.getTime() - 5 * 60 * 1000);
    const pending = await this.systemGateway.listPendingPayments(olderThan);
    const result = { checked: pending.length, applied: 0, failed: 0 };

    for (const payment of pending) {
      if (!payment.providerPaymentId) {
        continue;
      }

      try {
        await this.tenantContext.runAsSystemTenant(
          payment.tenantId,
          async () => {
            const providerPayment = await this.yooKassaClient.getPayment(
              payment.providerPaymentId as string,
            );
            const outcome = await this.applyProviderPaymentIfFinal(
              payment,
              providerPayment,
            );

            if (outcome?.payment?.status !== PAYMENT_STATUS_PENDING) {
              result.applied += 1;
            }
          },
        );
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          `Сверка платежа ${payment.providerPaymentId} не удалась: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    if (result.applied > 0) {
      this.logger.log(
        `Сверка с банком: досчитано ${result.applied} из ${result.checked}.`,
      );
    }

    return result;
  }

  async runDueBilling(now = new Date()) {
    const candidates = await this.systemGateway.listBillingCandidates();
    const result = {
      checked: candidates.length,
      charged: 0,
      marked_past_due: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ tenant_id: string; message: string }>,
    };

    for (const tenant of candidates) {
      try {
        const outcome = await this.tenantContext.runAsSystemTenant(
          tenant.id,
          () => this.processDueTenant(tenant, now),
        );

        if (outcome === 'charged') {
          result.charged += 1;
        } else if (outcome === 'marked_past_due') {
          result.marked_past_due += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          tenant_id: tenant.id,
          message: error instanceof Error ? error.message : 'unknown_error',
        });
      }
    }

    return result;
  }

  private async processDueTenant(
    tenant: BillingCandidateRecord,
    now: Date,
  ): Promise<'charged' | 'marked_past_due' | 'skipped'> {
    const tenantId = this.tenantContext.assertTenantId(tenant.id);
    const accessWindowEndsAt =
      tenant.currentPeriodEnd ?? tenant.trialEndsAt ?? null;

    if (!accessWindowEndsAt || accessWindowEndsAt.getTime() > now.getTime()) {
      return 'skipped';
    }

    const pendingPayment = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId,
        status: PAYMENT_STATUS_PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingPayment) {
      return 'skipped';
    }

    if (tenant.billingMethodId && tenant.planId && this.isRecurringEnabled()) {
      await this.chargeTenant(tenantId);
      return 'charged';
    }

    await this.markTenantPastDue(tenantId, {
      transitionAt: now,
      pastDueAt: tenant.pastDueAt,
      graceEndsAt: tenant.graceEndsAt,
    });
    return 'marked_past_due';
  }

  /**
   * Состояние подписки для кабинета: тариф, срок, чем платим.
   *
   * Нужно, чтобы раздел «Подписка» был виден ВСЕГДА, а не только после
   * блокировки: раньше владелец узнавал о деньгах в момент, когда его уже
   * отключили, и это худший момент для первого разговора о цене.
   */
  async getSubscriptionSummary(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      include: { plan: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const now = new Date();
    const trialEndsAt = tenant.trialEndsAt ?? null;
    const periodEnd = tenant.currentPeriodEnd ?? null;
    const activeUntil = periodEnd ?? trialEndsAt;
    const daysLeft = activeUntil
      ? Math.max(
          0,
          Math.ceil((activeUntil.getTime() - now.getTime()) / 86400000),
        )
      : null;

    return {
      status: tenant.status,
      plan: tenant.plan
        ? {
            id: tenant.plan.id,
            name: tenant.plan.name,
            price_monthly_kopecks: this.normalizeAmount(
              tenant.plan.priceMonthly,
            ),
            currency: 'RUB',
          }
        : null,
      trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
      current_period_start: tenant.currentPeriodStart
        ? tenant.currentPeriodStart.toISOString()
        : null,
      current_period_end: periodEnd ? periodEnd.toISOString() : null,
      past_due_at: tenant.pastDueAt ? tenant.pastDueAt.toISOString() : null,
      grace_ends_at: tenant.graceEndsAt
        ? tenant.graceEndsAt.toISOString()
        : null,
      days_left: daysLeft,
      // Карта сохранена — значит продление спишется само, и это надо сказать
      // прямо: иначе владелец ждёт счёта и удивляется списанию.
      autopay_enabled: Boolean(tenant.billingMethodId),
    };
  }

  async listTenantPayments(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const payments = await this.prisma.billingPayment.findMany({
      where: { tenantId: scopedTenantId },
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
    this.tenantContext.assertTenantId(payment.tenantId);
    this.assertProviderPaymentMatchesLocal(payment, providerPayment);

    if (providerPayment.status === PAYMENT_STATUS_SUCCEEDED) {
      // 🔴 Идемпотентность. ЮKassa повторяет уведомление, пока не получит 200,
      // и один платёж легко приходит дважды. applySuccessfulPayment сдвигает
      // currentPeriodEnd на месяц ВПЕРЁД от текущего — повторное применение
      // дарило салону лишний оплаченный месяц. Один платёж применяем один раз.
      if (payment.status === PAYMENT_STATUS_SUCCEEDED) {
        return { payment, tenant: null };
      }

      return this.applySuccessfulPayment(payment, providerPayment);
    }

    if (providerPayment.status === PAYMENT_STATUS_CANCELED) {
      const canceledPayment = await this.prisma.billingPayment.update({
        where: this.paymentWhere(payment),
        data: {
          status: PAYMENT_STATUS_CANCELED,
          canceledAt: this.parseProviderDate(providerPayment.canceled_at),
          providerPayload: asJson(providerPayment),
        },
      });

      if (payment.purpose === PAYMENT_PURPOSE_RECURRING) {
        await this.markTenantPastDue(payment.tenantId, { force: true });
      }

      return {
        payment: canceledPayment,
        tenant: null,
      };
    }

    const pendingPayment = await this.prisma.billingPayment.update({
      where: this.paymentWhere(payment),
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
    const tenantId = this.tenantContext.assertTenantId(payment.tenantId);
    const paidAt =
      this.parseProviderDate(providerPayment.captured_at) ?? new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
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
        where: {
          id_tenantId: {
            id: payment.id,
            tenantId,
          },
        },
        data: {
          status: PAYMENT_STATUS_SUCCEEDED,
          paidAt,
          providerPayload: asJson(providerPayment),
        },
      });
      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          status: TenantStatus.ACTIVE,
          planId: payment.planId ?? tenant.planId,
          currentPeriodStart: periodStartBase,
          currentPeriodEnd: periodEnd,
          pastDueAt: null,
          graceEndsAt: null,
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

  private async markTenantPastDue(
    tenantId: string,
    options: {
      transitionAt?: Date;
      pastDueAt?: Date | null;
      graceEndsAt?: Date | null;
      force?: boolean;
    } = {},
    attempt = 0,
  ): Promise<void> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: {
        status: true,
        trialFullAccess: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        pastDueAt: true,
        graceEndsAt: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const transitionAt = options.transitionAt ?? new Date();
    const accessEndsAt = tenant.currentPeriodEnd ?? tenant.trialEndsAt;
    if (
      !options.force &&
      tenant.status !== String(TenantStatus.PAST_DUE) &&
      (!accessEndsAt || accessEndsAt.getTime() > transitionAt.getTime())
    ) {
      return;
    }

    if (
      tenant.status === String(TenantStatus.PAST_DUE) &&
      tenant.pastDueAt &&
      tenant.graceEndsAt &&
      !tenant.trialFullAccess
    ) {
      return;
    }

    const pastDueAt =
      tenant.status === String(TenantStatus.PAST_DUE)
        ? (tenant.pastDueAt ?? options.pastDueAt ?? transitionAt)
        : (options.pastDueAt ??
          (options.force ? null : accessEndsAt) ??
          transitionAt);
    const graceEndsAt =
      tenant.status === String(TenantStatus.PAST_DUE)
        ? (tenant.graceEndsAt ??
          options.graceEndsAt ??
          addDays(pastDueAt, PAST_DUE_GRACE_DAYS))
        : (options.graceEndsAt ?? addDays(pastDueAt, PAST_DUE_GRACE_DAYS));

    const updated = await this.prisma.tenant.updateMany({
      where: {
        id: scopedTenantId,
        status: tenant.status,
        updatedAt: tenant.updatedAt,
      },
      data: {
        status: TenantStatus.PAST_DUE,
        trialFullAccess: false,
        pastDueAt,
        graceEndsAt,
      },
    });

    if (updated.count === 0) {
      if (attempt >= 2) {
        throw new ConflictException(
          'Tenant billing state changed during past-due transition.',
        );
      }
      await this.markTenantPastDue(tenantId, options, attempt + 1);
      return;
    }

    // 🔴 Переход в past_due — это отключение доступа к салону, и до сих пор он
    // не оставлял следа. Статус, pastDueAt и graceEndsAt пишутся в колонки
    // самого арендатора, то есть ПЕРЕЗАПИСЫВАЮТСЯ: после второго цикла история
    // первого отключения физически отсутствовала. В логе оставалась одна
    // агрегированная строка планировщика, даже без арендатора. Спор «нас
    // отключили ошибочно» разобрать было нечем. Ручная смена тарифа через
    // админку при этом аудировалась — асимметрия, а не решение.
    await this.auditLog.tryLog({
      tenantId: scopedTenantId,
      action: 'billing.tenant_past_due',
      entityType: 'tenant',
      entityId: scopedTenantId,
      metadata: {
        previous_status: tenant.status,
        past_due_at: pastDueAt?.toISOString() ?? null,
        grace_ends_at: graceEndsAt?.toISOString() ?? null,
        forced: options.force === true,
        had_trial_full_access: tenant.trialFullAccess,
      },
    });
  }

  private paymentWhere(payment: Pick<BillingPaymentRecord, 'id' | 'tenantId'>) {
    const tenantId = this.tenantContext.assertTenantId(payment.tenantId);

    return {
      id_tenantId: {
        id: payment.id,
        tenantId,
      },
    };
  }

  private assertProviderPaymentMatchesLocal(
    payment: BillingPaymentRecord,
    providerPayment: YooKassaPayment,
  ) {
    const metadataTenantId = providerPayment.metadata?.tenant_id;
    const metadataPaymentId = providerPayment.metadata?.billing_payment_id;

    if (
      !payment.providerPaymentId ||
      providerPayment.id !== payment.providerPaymentId ||
      !this.metadataIdentifierMatches(metadataTenantId, payment.tenantId) ||
      !this.metadataIdentifierMatches(metadataPaymentId, payment.id)
    ) {
      throw new BadRequestException(
        this.buildBillingError(
          'billing_payment_identity_mismatch',
          'YooKassa payment identity does not match the local billing payment.',
        ),
      );
    }

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

  private metadataIdentifierMatches(value: unknown, expected: string): boolean {
    if (value === undefined) {
      return true;
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
      return false;
    }

    return String(value) === expected;
  }

  /**
   * Кому выписывать чек.
   *
   * 🔴 У бизнеса нет полей почты и телефона вовсе — контакт есть только у
   * людей. Берём владельца: он и платит. Без контакта чек не примут, а без
   * чека магазин, настроенный на фискализацию через API, отклонит платёж.
   */
  /**
   * Разрешены ли магазину рекуррентные платежи (сохранение карты).
   *
   * 🔴 ЮKassa отвечает 403 «This store can't make recurring payments», если
   * магазину такое право не выдано, и платёж не проходит ВООБЩЕ. Лучше дать
   * салону заплатить вручную, чем отказать совсем: подписка продлится, просто
   * без автосписания. Включается обратно одной переменной, когда ЮKassa
   * подключит рекуррентные.
   */
  private isRecurringEnabled(): boolean {
    const raw = this.configService.get<string>('YOOKASSA_RECURRING_ENABLED');

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return true;
    }

    return !['false', '0', 'off', 'no'].includes(
      String(raw).trim().toLowerCase(),
    );
  }

  private async resolveReceiptCustomer(
    tenantId: string,
  ): Promise<{ email?: string | null; phone?: string | null }> {
    const owner = await this.prisma.user.findFirst({
      where: {
        tenantId,
        role: {
          in: [
            UserRole.TENANT_OWNER,
            UserRole.BUSINESS_OWNER,
            UserRole.TENANT_ADMIN,
            UserRole.ADMINISTRATOR,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { email: true, phone: true },
    });

    return { email: owner?.email ?? null, phone: owner?.phone ?? null };
  }

  /**
   * Чек по 54-ФЗ.
   *
   * 🔴 Если магазин в ЮKassa настроен на формирование чеков через API, платёж
   * БЕЗ чека отклоняется — салон видит непонятный отказ на ровном месте. Если
   * же чеки шлёт касса магазина, лишний чек тоже ошибка. Поэтому включается
   * явным YOOKASSA_SEND_RECEIPT=true, а не угадыванием.
   *
   * Контакт покупателя обязателен: без email или телефона чек не примут.
   */
  private async buildReceipt(
    tenantId: string,
    planName: string,
    amountKopecks: number,
  ): Promise<Record<string, unknown>> {
    const enabled =
      String(this.configService.get<string>('YOOKASSA_SEND_RECEIPT') ?? '')
        .trim()
        .toLowerCase() === 'true';

    if (!enabled) {
      return {};
    }

    const customer = await this.resolveReceiptCustomer(tenantId);
    const email = String(customer.email || '').trim();
    const phone = String(customer.phone || '').trim();

    if (!email && !phone) {
      this.logger.warn(
        'Чек не приложен: у тенанта нет ни email, ни телефона для отправки.',
      );
      return {};
    }

    const vatCode = Number(
      this.configService.get<string>('YOOKASSA_VAT_CODE') ?? 1,
    );

    return {
      receipt: {
        customer: {
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        },
        items: [
          {
            description: `Подписка MAYA OS · ${planName}`.slice(0, 128),
            quantity: '1.00',
            amount: {
              value: this.formatKopecks(amountKopecks),
              currency: RUB_CURRENCY,
            },
            vat_code:
              Number.isFinite(vatCode) && vatCode >= 1 && vatCode <= 6
                ? vatCode
                : 1,
            payment_mode: 'full_payment',
            payment_subject: 'service',
          },
        ],
      },
    };
  }

  private resolveReturnUrl(returnUrl?: string): string {
    const resolved =
      returnUrl?.trim() ||
      this.configService.get<string>('YOOKASSA_RETURN_URL')?.trim() ||
      this.configService.get<string>('BILLING_RETURN_URL')?.trim();

    if (resolved) {
      return resolved;
    }

    // 🔴 Раньше без настройки чекаут просто отказывал. Для салона это выглядело
    // как «оплатить нельзя», хотя причина была в пустой переменной окружения.
    // Возвращаем человека на страницу приложения с меткой — по ней кабинет
    // понимает, что надо перепроверить подписку.
    const publicBase = (
      this.configService.get<string>('PUBLIC_APP_URL')?.trim() ||
      this.configService.get<string>('APP_PUBLIC_URL')?.trim() ||
      ''
    ).replace(/\/+$/, '');

    if (publicBase) {
      return `${publicBase}/app/?billing=return`;
    }

    throw new BadRequestException(
      this.buildBillingError(
        'billing_return_url_required',
        'Укажите адрес возврата: параметр returnUrl либо переменная PUBLIC_APP_URL / YOOKASSA_RETURN_URL.',
        'returnUrl',
      ),
    );
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
      | 'billing_payment_identity_mismatch'
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
