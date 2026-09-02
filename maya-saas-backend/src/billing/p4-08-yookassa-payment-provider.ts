import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ActionIdentityService } from '../action-engine';
import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  P408ProviderDefinitiveError,
  P408ProviderDispatchAmbiguousError,
  type P408PaymentProvider,
  type P408ProviderPayment,
  type P408ProviderPaymentRequest,
  type P408ProviderReferenceCodec,
} from './p4-08-tenant-billing-executable.service';
import {
  type YooKassaPayment,
  YooKassaClientService,
} from './yookassa-client.service';

/**
 * Production YooKassa boundary for P4-08. It preserves the exact provider
 * idempotence key supplied by Action Engine. A transport failure after the
 * request may have crossed is deliberately ambiguous; only the same-key,
 * byte-equivalent reconciliation path may recover it.
 */
@Injectable()
export class P408YooKassaPaymentProvider implements P408PaymentProvider {
  constructor(
    private readonly yooKassa: YooKassaClientService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async createPayment(
    input: P408ProviderPaymentRequest,
  ): Promise<P408ProviderPayment> {
    const request = await this.request(input);
    try {
      return this.payment(
        await this.yooKassa.createPayment(request, input.idempotencyKey),
        input.paymentMethodId ? null : this.checkoutReturnUrl(),
      );
    } catch (error) {
      const providerStatus = this.providerStatus(error);
      if (providerStatus !== null && providerStatus < 500) {
        throw new P408ProviderDefinitiveError(
          'YooKassa definitively rejected the canonical tenant-billing request',
        );
      }
      throw new P408ProviderDispatchAmbiguousError(
        'YooKassa tenant-billing dispatch outcome is unknown',
      );
    }
  }

  async getPayment(
    providerPaymentId: string,
  ): Promise<P408ProviderPayment | null> {
    try {
      return this.payment(await this.yooKassa.getPayment(providerPaymentId));
    } catch (error) {
      if (this.providerStatus(error) === 404) return null;
      throw new P408ProviderDispatchAmbiguousError(
        'Authoritative YooKassa tenant-billing evidence is unavailable',
      );
    }
  }

  async reconcileByIdempotencyKey(input: P408ProviderPaymentRequest) {
    try {
      const payment = await this.yooKassa.createPayment(
        await this.request(input),
        input.idempotencyKey,
      );
      return {
        outcome: 'FOUND' as const,
        payment: this.payment(
          payment,
          input.paymentMethodId ? null : this.checkoutReturnUrl(),
        ),
      };
    } catch {
      // This is the sole automated re-presentation and uses the exact
      // original key/request. Inconclusive evidence remains UNKNOWN.
      return { outcome: 'UNKNOWN' as const };
    }
  }

  checkoutReturnUrl(proposed?: string): string {
    const configured =
      this.config.get<string>('YOOKASSA_RETURN_URL')?.trim() ||
      this.config.get<string>('BILLING_RETURN_URL')?.trim() ||
      this.defaultReturnUrl();
    if (!configured) {
      throw new P408ProviderDefinitiveError(
        'Tenant-billing return URL is not configured',
      );
    }
    const candidate = proposed?.trim();
    if (candidate) {
      try {
        const allowedOrigins = new Set(
          [
            configured,
            this.config.get<string>('PUBLIC_APP_URL')?.trim(),
            this.config.get<string>('APP_PUBLIC_URL')?.trim(),
          ]
            .filter((value): value is string => Boolean(value))
            .map((value) => new URL(value).origin),
        );
        if (!allowedOrigins.has(new URL(candidate).origin)) {
          throw new Error('origin mismatch');
        }
      } catch {
        throw new P408ProviderDefinitiveError(
          'Checkout return URL is outside the server policy',
        );
      }
    }
    return configured;
  }

  private async request(input: P408ProviderPaymentRequest) {
    if (!this.yooKassa.isConfigured()) {
      throw new P408ProviderDefinitiveError(
        'YooKassa credentials are not configured',
      );
    }
    const tenantId = input.metadata.tenant_id;
    const planId = input.metadata.plan_id;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: { name: true },
    });
    if (!tenant || !plan) {
      throw new P408ProviderDefinitiveError(
        'Tenant-billing provider facts are no longer available',
      );
    }
    const recurring = Boolean(input.paymentMethodId);
    return {
      amount: {
        value: this.formatKopecks(input.amountKopecks),
        currency: input.currency,
      },
      ...(recurring
        ? { payment_method_id: input.paymentMethodId }
        : {
            confirmation: {
              type: 'redirect',
              return_url: this.checkoutReturnUrl(),
            },
            save_payment_method: this.recurringEnabled(),
          }),
      capture: true,
      description: `MAYA SaaS: ${tenant.name}, ${plan.name}`.slice(0, 128),
      ...(await this.receipt(
        tenantId,
        plan.name,
        input.amountKopecks,
        input.currency,
      )),
      metadata: { ...input.metadata },
    };
  }

  private payment(
    payment: YooKassaPayment,
    returnUrl: string | null = null,
  ): P408ProviderPayment {
    const metadata = Object.fromEntries(
      Object.entries(payment.metadata ?? {}).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value]] : [],
      ),
    );
    return {
      id: payment.id,
      status: this.status(payment.status),
      paid: payment.paid === true,
      amountKopecks: this.parseAmount(payment.amount?.value),
      currency: String(payment.amount?.currency ?? '').toUpperCase(),
      capturedAt: payment.captured_at ?? null,
      paymentMethodId: payment.payment_method?.id ?? null,
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
      returnUrl,
      metadata,
    };
  }

  private status(value: string): P408ProviderPayment['status'] {
    if (value === 'pending' || value === 'waiting_for_capture')
      return 'pending';
    if (value === 'succeeded') return 'succeeded';
    if (value === 'canceled') return 'canceled';
    return 'unknown';
  }

  private recurringEnabled(): boolean {
    const raw = this.config.get<string>('YOOKASSA_RECURRING_ENABLED');
    if (raw === undefined || String(raw).trim() === '') return true;
    return !['false', '0', 'off', 'no'].includes(
      String(raw).trim().toLowerCase(),
    );
  }

  private async receipt(
    tenantId: string,
    planName: string,
    amountKopecks: number,
    currency: string,
  ): Promise<Record<string, unknown>> {
    const enabled =
      String(this.config.get<string>('YOOKASSA_SEND_RECEIPT') ?? '')
        .trim()
        .toLowerCase() === 'true';
    if (!enabled) return {};
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
    const email = owner?.email?.trim();
    const phone = owner?.phone?.trim();
    if (!email && !phone) return {};
    const configuredVat = Number(this.config.get<string>('YOOKASSA_VAT_CODE'));
    const vatCode =
      Number.isInteger(configuredVat) &&
      configuredVat >= 1 &&
      configuredVat <= 6
        ? configuredVat
        : 1;
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
              currency,
            },
            vat_code: vatCode,
            payment_mode: 'full_payment',
            payment_subject: 'service',
          },
        ],
      },
    };
  }

  private defaultReturnUrl(): string | null {
    const publicBase = (
      this.config.get<string>('PUBLIC_APP_URL')?.trim() ||
      this.config.get<string>('APP_PUBLIC_URL')?.trim() ||
      ''
    ).replace(/\/+$/, '');
    return publicBase ? `${publicBase}/app/?billing=return` : null;
  }

  private formatKopecks(value: number): string {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new P408ProviderDefinitiveError(
        'Payment amount must be positive integer kopecks',
      );
    }
    return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
  }

  private parseAmount(value: string | undefined): number {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value ?? '');
    if (!match) {
      throw new P408ProviderDefinitiveError(
        'YooKassa payment amount is malformed',
      );
    }
    const result =
      Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    if (!Number.isSafeInteger(result)) {
      throw new P408ProviderDefinitiveError(
        'YooKassa payment amount is outside the supported range',
      );
    }
    return result;
  }

  private providerStatus(error: unknown): number | null {
    if (!(error instanceof HttpException)) return null;
    const response = error.getResponse();
    if (!response || typeof response !== 'object') return null;
    const nested = (response as { error?: { status?: unknown } }).error?.status;
    return typeof nested === 'number' ? nested : null;
  }
}

export class P408ActionProviderReferenceCodec implements P408ProviderReferenceCodec {
  private readonly identity: ActionIdentityService;

  constructor(identitySecret: string, payloadEncryptionSecret: string) {
    this.identity = new ActionIdentityService(
      identitySecret,
      payloadEncryptionSecret,
    );
  }

  encrypt(value: string): string {
    return this.identity.encryptNormalizedPayload(value);
  }

  decrypt(value: string): string {
    return this.identity.decryptNormalizedPayload(value);
  }

  hash(value: string): string {
    return this.identity.hmac('maya.p4-08.provider-reference/1', { value });
  }
}
