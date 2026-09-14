import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ActionIdentityService } from '../action-engine';
import {
  type YooKassaPayment,
  YooKassaClientService,
} from '../billing/yookassa-client.service';
import {
  type P406CheckoutProvider,
  P406ProviderDefinitiveError,
  P406ProviderDispatchAmbiguousError,
  type P406ProviderCheckoutRequest,
  type P406ProviderPayment,
  type P406ProviderReferenceCodec,
} from './p4-06-gift-certificate-executable.service';

@Injectable()
export class P406YooKassaCheckoutProvider implements P406CheckoutProvider {
  constructor(
    private readonly yooKassa: YooKassaClientService,
    private readonly config: ConfigService,
  ) {}

  async createPayment(
    input: P406ProviderCheckoutRequest,
  ): Promise<P406ProviderPayment> {
    const request = this.request(input);
    try {
      return this.payment(
        await this.yooKassa.createPayment(request, input.idempotencyKey),
      );
    } catch (error) {
      const providerStatus = this.providerStatus(error);
      if (providerStatus !== null && providerStatus < 500) {
        throw new P406ProviderDefinitiveError(
          'YooKassa definitively rejected the canonical gift-certificate checkout request',
        );
      }
      throw new P406ProviderDispatchAmbiguousError(
        'YooKassa gift-certificate checkout dispatch outcome is unknown',
      );
    }
  }

  async getPayment(
    providerPaymentId: string,
  ): Promise<P406ProviderPayment | null> {
    try {
      return this.payment(await this.yooKassa.getPayment(providerPaymentId));
    } catch (error) {
      if (this.providerStatus(error) === 404) return null;
      throw new P406ProviderDefinitiveError(
        'Authoritative YooKassa gift-certificate payment evidence is unavailable',
      );
    }
  }

  async reconcileByIdempotencyKey(
    input: P406ProviderCheckoutRequest,
  ): Promise<
    { outcome: 'FOUND'; payment: P406ProviderPayment } | { outcome: 'UNKNOWN' }
  > {
    try {
      const payment = await this.yooKassa.createPayment(
        this.request(input),
        input.idempotencyKey,
      );
      return { outcome: 'FOUND', payment: this.payment(payment) };
    } catch {
      // The exact original key and byte-equivalent request are the only
      // automated recovery attempt. An inconclusive response remains UNKNOWN;
      // no new payment key is ever dispatched.
      return { outcome: 'UNKNOWN' };
    }
  }

  private request(input: P406ProviderCheckoutRequest) {
    if (!this.yooKassa.isConfigured()) {
      throw new P406ProviderDefinitiveError(
        'YooKassa credentials are not configured',
      );
    }
    const returnUrl =
      this.config.get<string>('YOOKASSA_RETURN_URL')?.trim() ||
      this.config.get<string>('PUBLIC_APP_URL')?.trim();
    if (!returnUrl) {
      throw new P406ProviderDefinitiveError(
        'Gift-certificate checkout return URL is not configured',
      );
    }
    return {
      amount: {
        value: this.formatKopecks(input.amountKopecks),
        currency: input.currency,
      },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      description: 'MAYA gift certificate',
      metadata: { ...input.metadata },
    };
  }

  private payment(payment: YooKassaPayment): P406ProviderPayment {
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

  private status(value: string): P406ProviderPayment['status'] {
    if (value === 'pending') return 'pending';
    if (value === 'waiting_for_capture') return 'waiting_for_capture';
    if (value === 'succeeded') return 'succeeded';
    if (value === 'canceled') return 'canceled';
    return 'unknown';
  }

  private formatKopecks(value: number): string {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new P406ProviderDefinitiveError(
        'Checkout amount must be a positive integer number of kopecks',
      );
    }
    return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
  }

  private parseAmount(value: string | undefined): number {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value ?? '');
    if (!match) {
      throw new P406ProviderDefinitiveError(
        'YooKassa payment amount is malformed',
      );
    }
    const rubles = Number(match[1]);
    const kopecks = Number((match[2] ?? '').padEnd(2, '0'));
    const result = rubles * 100 + kopecks;
    if (!Number.isSafeInteger(result)) {
      throw new P406ProviderDefinitiveError(
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

export class P406ActionProviderReferenceCodec implements P406ProviderReferenceCodec {
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
    return this.identity.hmac('maya.p4-06.provider-reference/1', { value });
  }
}
