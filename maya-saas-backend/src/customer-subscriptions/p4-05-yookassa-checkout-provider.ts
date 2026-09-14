import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ActionIdentityService } from '../action-engine';
import {
  type YooKassaPayment,
  YooKassaClientService,
} from '../billing/yookassa-client.service';
import {
  type P405CheckoutProvider,
  P405ProviderDefinitiveError,
  P405ProviderDispatchAmbiguousError,
  type P405ProviderCheckoutRequest,
  type P405ProviderPayment,
  type P405ProviderReferenceCodec,
} from './p4-05-customer-subscription-executable.service';

@Injectable()
export class P405YooKassaCheckoutProvider implements P405CheckoutProvider {
  constructor(
    private readonly yooKassa: YooKassaClientService,
    private readonly config: ConfigService,
  ) {}

  async createPayment(
    input: P405ProviderCheckoutRequest,
  ): Promise<P405ProviderPayment> {
    const request = this.request(input);
    try {
      return this.payment(
        await this.yooKassa.createPayment(request, input.idempotencyKey),
      );
    } catch (error) {
      const providerStatus = this.providerStatus(error);
      if (providerStatus !== null && providerStatus < 500) {
        throw new P405ProviderDefinitiveError(
          'YooKassa definitively rejected the canonical checkout request',
        );
      }
      throw new P405ProviderDispatchAmbiguousError(
        'YooKassa checkout dispatch outcome is unknown',
      );
    }
  }

  async getPayment(
    providerPaymentId: string,
  ): Promise<P405ProviderPayment | null> {
    try {
      return this.payment(await this.yooKassa.getPayment(providerPaymentId));
    } catch (error) {
      if (this.providerStatus(error) === 404) return null;
      throw new P405ProviderDefinitiveError(
        'Authoritative YooKassa payment evidence is unavailable',
      );
    }
  }

  async reconcileByIdempotencyKey(
    input: P405ProviderCheckoutRequest,
  ): Promise<
    { outcome: 'FOUND'; payment: P405ProviderPayment } | { outcome: 'UNKNOWN' }
  > {
    try {
      const payment = await this.yooKassa.createPayment(
        this.request(input),
        input.idempotencyKey,
      );
      return { outcome: 'FOUND', payment: this.payment(payment) };
    } catch {
      // YooKassa's same idempotence key plus byte-equivalent request is the
      // only automated reconciliation attempt. Any inconclusive response
      // remains UNKNOWN/manual-required; a new key is never dispatched.
      return { outcome: 'UNKNOWN' };
    }
  }

  private request(input: P405ProviderCheckoutRequest) {
    if (!this.yooKassa.isConfigured()) {
      throw new P405ProviderDefinitiveError(
        'YooKassa credentials are not configured',
      );
    }
    const returnUrl =
      this.config.get<string>('YOOKASSA_RETURN_URL')?.trim() ||
      this.config.get<string>('PUBLIC_APP_URL')?.trim();
    if (!returnUrl) {
      throw new P405ProviderDefinitiveError(
        'Subscription checkout return URL is not configured',
      );
    }
    return {
      amount: {
        value: this.formatKopecks(input.amountKopecks),
        currency: input.currency,
      },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      description: 'MAYA customer subscription',
      metadata: { ...input.metadata },
    };
  }

  private payment(payment: YooKassaPayment): P405ProviderPayment {
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
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
      metadata,
    };
  }

  private status(value: string): P405ProviderPayment['status'] {
    if (value === 'pending' || value === 'waiting_for_capture')
      return 'pending';
    if (value === 'succeeded') return 'succeeded';
    if (value === 'canceled') return 'canceled';
    return 'unknown';
  }

  private formatKopecks(value: number): string {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new P405ProviderDefinitiveError(
        'Checkout amount must be a positive integer number of kopecks',
      );
    }
    return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
  }

  private parseAmount(value: string | undefined): number {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value ?? '');
    if (!match) {
      throw new P405ProviderDefinitiveError(
        'YooKassa payment amount is malformed',
      );
    }
    const rubles = Number(match[1]);
    const kopecks = Number((match[2] ?? '').padEnd(2, '0'));
    const result = rubles * 100 + kopecks;
    if (!Number.isSafeInteger(result)) {
      throw new P405ProviderDefinitiveError(
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

export class P405ActionProviderReferenceCodec implements P405ProviderReferenceCodec {
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
    return this.identity.hmac('maya.p4-05.provider-reference/1', { value });
  }
}
