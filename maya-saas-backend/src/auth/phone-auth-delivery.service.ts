import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PhoneAuthDeliveryResult =
  | {
      delivery: 'debug';
      debug_code: string;
    }
  | {
      delivery: 'sms';
    };

export class PhoneAuthDeliveryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneAuthDeliveryUnavailableError';
  }
}

export class PhoneAuthDeliveryFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneAuthDeliveryFailedError';
  }
}

type SmsRuSendResponse = {
  status?: string;
  status_code?: number;
  status_text?: string;
  sms?: Record<
    string,
    {
      status?: string;
      status_code?: number;
      status_text?: string;
      sms_id?: string;
    }
  >;
};

@Injectable()
export class PhoneAuthDeliveryService {
  private readonly logger = new Logger(PhoneAuthDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  async deliverCode(params: {
    phone: string;
    code: string;
    clientIp?: string | null;
  }): Promise<PhoneAuthDeliveryResult> {
    const provider = this.resolveProvider();

    if (provider === 'debug') {
      return {
        delivery: 'debug',
        debug_code: params.code,
      };
    }

    await this.sendViaSmsRu(params);

    return {
      delivery: 'sms',
    };
  }

  private resolveProvider(): 'debug' | 'smsru' {
    const debugForced = this.configService.get<string>('PHONE_AUTH_DEBUG');
    const provider = this.configService
      .get<string>('PHONE_AUTH_PROVIDER')
      ?.trim()
      .toLowerCase();
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const apiId = this.configService.get<string>('SMSRU_API_ID')?.trim();

    if (debugForced === 'true' || provider === 'debug') {
      return 'debug';
    }

    if (provider === 'smsru') {
      if (!apiId) {
        throw new PhoneAuthDeliveryUnavailableError(
          'SMS.ru delivery is selected, but SMSRU_API_ID is missing.',
        );
      }

      return 'smsru';
    }

    if (!provider || provider === 'auto') {
      if (nodeEnv === 'production') {
        if (!apiId) {
          throw new PhoneAuthDeliveryUnavailableError(
            'Phone auth SMS delivery is not configured for production.',
          );
        }

        return 'smsru';
      }

      return 'debug';
    }

    throw new PhoneAuthDeliveryUnavailableError(
      `Unsupported phone auth provider: ${provider}.`,
    );
  }

  private async sendViaSmsRu(params: {
    phone: string;
    code: string;
    clientIp?: string | null;
  }): Promise<void> {
    const apiId = this.configService.get<string>('SMSRU_API_ID')?.trim();

    if (!apiId) {
      throw new PhoneAuthDeliveryUnavailableError(
        'SMS.ru delivery is selected, but SMSRU_API_ID is missing.',
      );
    }

    const form = new URLSearchParams({
      api_id: apiId,
      to: this.normalizeSmsRuPhone(params.phone),
      msg: this.renderSmsText(params.code),
      json: '1',
    });
    const from = this.configService.get<string>('SMSRU_FROM')?.trim();
    const smsRuTest = this.configService.get<string>('SMSRU_TEST') === 'true';
    const clientIp = params.clientIp?.trim();

    if (from) {
      form.set('from', from);
    }

    if (clientIp) {
      form.set('ip', clientIp);
    }

    if (smsRuTest) {
      form.set('test', '1');
    }

    let responseText = '';

    try {
      const response = await fetch('https://sms.ru/sms/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: form,
        signal: AbortSignal.timeout(this.getSmsRuTimeoutMs()),
      });

      responseText = await response.text();

      if (!response.ok) {
        throw new PhoneAuthDeliveryFailedError(
          `SMS.ru request failed with status ${response.status}.`,
        );
      }
    } catch (error) {
      if (
        error instanceof PhoneAuthDeliveryUnavailableError ||
        error instanceof PhoneAuthDeliveryFailedError
      ) {
        throw error;
      }

      const details =
        error instanceof Error ? error.message : 'Unknown transport error';

      this.logger.error(`SMS.ru transport error: ${details}`);
      throw new PhoneAuthDeliveryFailedError(
        'Could not reach SMS transport provider.',
      );
    }

    let payload: SmsRuSendResponse;

    try {
      payload = JSON.parse(responseText) as SmsRuSendResponse;
    } catch {
      this.logger.error(
        `SMS.ru returned non-JSON response: ${responseText.slice(0, 300)}`,
      );
      throw new PhoneAuthDeliveryFailedError(
        'SMS provider returned an unreadable response.',
      );
    }

    if (payload.status !== 'OK' || payload.status_code !== 100) {
      throw new PhoneAuthDeliveryFailedError(
        payload.status_text || 'SMS provider rejected the verification code.',
      );
    }

    const smsStatus = payload.sms?.[this.normalizeSmsRuPhone(params.phone)];

    if (
      !smsStatus ||
      smsStatus.status !== 'OK' ||
      smsStatus.status_code !== 100
    ) {
      throw new PhoneAuthDeliveryFailedError(
        smsStatus?.status_text ||
          'SMS provider did not accept the verification code for delivery.',
      );
    }
  }

  private renderSmsText(code: string): string {
    const template =
      this.configService.get<string>('PHONE_AUTH_SMS_TEMPLATE')?.trim() ||
      'MAYA: код входа {{code}}. Никому не сообщайте его.';

    if (template.includes('{{code}}')) {
      return template.replaceAll('{{code}}', code);
    }

    return `${template} ${code}`;
  }

  private getSmsRuTimeoutMs(): number {
    const raw = Number(this.configService.get<string>('SMSRU_TIMEOUT_MS'));

    return Number.isFinite(raw) && raw > 0 ? raw : 15000;
  }

  private normalizeSmsRuPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
