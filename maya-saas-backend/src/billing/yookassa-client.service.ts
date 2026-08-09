import {
  Logger,
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface YooKassaPaymentAmount {
  value: string;
  currency: string;
}

export interface YooKassaPaymentMethod {
  id?: string;
  saved?: boolean;
  type?: string;
  title?: string;
}

export interface YooKassaPayment {
  id: string;
  status: string;
  paid?: boolean;
  amount?: YooKassaPaymentAmount;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  payment_method?: YooKassaPaymentMethod;
  metadata?: Record<string, unknown>;
  captured_at?: string;
  canceled_at?: string;
}

export type YooKassaPaymentPayload = Record<string, unknown>;

@Injectable()
export class YooKassaClientService {
  private readonly logger = new Logger(YooKassaClientService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getShopId() && this.getSecretKey());
  }

  async createPayment(
    payload: YooKassaPaymentPayload,
    idempotenceKey: string,
  ): Promise<YooKassaPayment> {
    return this.request<YooKassaPayment>('/payments', {
      method: 'POST',
      idempotenceKey,
      body: payload,
    });
  }

  async getPayment(paymentId: string): Promise<YooKassaPayment> {
    return this.request<YooKassaPayment>(
      `/payments/${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
      },
    );
  }

  private async request<T>(
    path: string,
    params: {
      method: 'GET' | 'POST';
      idempotenceKey?: string;
      body?: YooKassaPaymentPayload;
    },
  ): Promise<T> {
    const shopId = this.getShopId();
    const secretKey = this.getSecretKey();

    if (!shopId || !secretKey) {
      throw new ServiceUnavailableException(
        this.buildYooKassaError(
          'billing_provider_unavailable',
          'YooKassa credentials are not configured.',
        ),
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString(
        'base64',
      )}`,
      'Content-Type': 'application/json',
    };

    if (params.idempotenceKey) {
      headers['Idempotence-Key'] = params.idempotenceKey;
    }

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: params.method,
      headers,
      body: params.body ? JSON.stringify(params.body) : undefined,
      signal: AbortSignal.timeout(this.getTimeoutMs()),
    });

    if (!response.ok) {
      const providerBody = await this.safeReadProviderBody(response);
      // 🔴 Пишем настоящий ответ банка в лог. Раньше наружу уходил общий текст
      // «YooKassa rejected the billing request», а причина не сохранялась
      // нигде — разбирать отказ было не по чему.
      this.logger.warn(
        `YooKassa отказал: HTTP ${response.status} ${JSON.stringify(providerBody).slice(0, 400)}`,
      );

      // Понятный текст вместо общего: салон должен видеть, ЧТО делать.
      // «Магазину не разрешены рекуррентные платежи» — это заявка в ЮKassa,
      // а не поломка у нас, и человек не должен догадываться об этом сам.
      const providerDescription =
        providerBody &&
        typeof providerBody === 'object' &&
        'description' in providerBody
          ? providerBody.description
          : null;
      const description =
        typeof providerDescription === 'string' ? providerDescription : '';
      const recurringForbidden =
        response.status === 403 && /recurring/i.test(description);

      throw new BadGatewayException(
        this.buildYooKassaError(
          recurringForbidden
            ? 'billing_recurring_not_allowed'
            : 'billing_provider_error',
          recurringForbidden
            ? 'Магазину в ЮKassa не разрешены автосписания. Напишите менеджеру ЮKassa, чтобы подключить рекуррентные платежи, — или отключите автопродление в настройках MAYA.'
            : 'YooKassa rejected the billing request.',
          { status: response.status, body: providerBody },
        ),
      );
    }

    return (await response.json()) as T;
  }

  private getShopId(): string | null {
    return (
      this.configService.get<string>('YOOKASSA_SHOP_ID')?.trim() ||
      this.configService.get<string>('YUKASSA_SHOP_ID')?.trim() ||
      null
    );
  }

  private getSecretKey(): string | null {
    return (
      this.configService.get<string>('YOOKASSA_SECRET_KEY')?.trim() ||
      this.configService.get<string>('YUKASSA_SECRET_KEY')?.trim() ||
      null
    );
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('YOOKASSA_API_BASE_URL')?.trim() ||
      'https://api.yookassa.ru/v3';

    return baseUrl.replace(/\/+$/, '');
  }

  private getTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>('YOOKASSA_REQUEST_TIMEOUT_MS'),
    );

    return Number.isFinite(raw) && raw > 0 ? raw : 15000;
  }

  private async safeReadProviderBody(
    response: Response,
  ): Promise<Record<string, unknown> | string | null> {
    const contentType = response.headers.get('content-type') ?? '';

    try {
      if (contentType.includes('application/json')) {
        return (await response.json()) as Record<string, unknown>;
      }

      return await response.text();
    } catch {
      return null;
    }
  }

  private buildYooKassaError(
    code:
      | 'billing_provider_error'
      | 'billing_provider_unavailable'
      | 'billing_recurring_not_allowed',
    message: string,
    extra?: Record<string, unknown>,
  ) {
    return {
      message,
      error: {
        code,
        message,
        ...(extra ?? {}),
      },
    };
  }
}
