import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type P410CredentialVerificationOutcome =
  'ACCEPTED' | 'REJECTED' | 'UNAVAILABLE';

export interface P410CredentialVerification {
  outcome: P410CredentialVerificationOutcome;
  errorCode: string | null;
  httpStatus: number | null;
  providerWrites: 0;
}

export interface P410CredentialVerifier {
  verify(
    shopId: string,
    secretKey: string,
  ): Promise<P410CredentialVerification>;
}

@Injectable()
export class P410YooKassaCredentialVerifier implements P410CredentialVerifier {
  constructor(private readonly config: ConfigService) {}

  async verify(
    shopId: string,
    secretKey: string,
  ): Promise<P410CredentialVerification> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/payments?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch {
      return {
        outcome: 'UNAVAILABLE',
        errorCode: 'commerce_provider_unavailable',
        httpStatus: null,
        providerWrites: 0,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        outcome: 'REJECTED',
        errorCode: 'commerce_credentials_rejected',
        httpStatus: response.status,
        providerWrites: 0,
      };
    }
    if (!response.ok) {
      return {
        outcome: 'UNAVAILABLE',
        errorCode: 'commerce_provider_error',
        httpStatus: response.status,
        providerWrites: 0,
      };
    }
    return {
      outcome: 'ACCEPTED',
      errorCode: null,
      httpStatus: response.status,
      providerWrites: 0,
    };
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('YOOKASSA_API_BASE_URL')?.trim() ||
      'https://api.yookassa.ru/v3'
    ).replace(/\/+$/, '');
  }

  private timeoutMs(): number {
    const value = Number(
      this.config.get<string>('YOOKASSA_REQUEST_TIMEOUT_MS'),
    );
    return Number.isFinite(value) && value >= 1_000 && value <= 60_000
      ? value
      : 15_000;
  }
}
