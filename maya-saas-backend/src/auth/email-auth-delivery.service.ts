import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export type EmailAuthDeliveryResult =
  | {
      delivery: 'debug';
      debug_code: string;
    }
  | {
      delivery: 'email';
    };

export class EmailAuthDeliveryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailAuthDeliveryUnavailableError';
  }
}

export class EmailAuthDeliveryFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailAuthDeliveryFailedError';
  }
}

@Injectable()
export class EmailAuthDeliveryService {
  private readonly logger = new Logger(EmailAuthDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  getDeliveryType(): 'debug' | 'email' {
    return this.resolveProvider() === 'debug' ? 'debug' : 'email';
  }

  async deliverCode(params: {
    email: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<EmailAuthDeliveryResult> {
    const provider = this.resolveProvider();

    if (provider === 'debug') {
      return {
        delivery: 'debug',
        debug_code: params.code,
      };
    }

    await this.sendViaSmtp(params);

    return { delivery: 'email' };
  }

  private resolveProvider(): 'debug' | 'smtp' {
    const debugForced = this.configService.get<string>('EMAIL_AUTH_DEBUG');
    const provider = this.configService
      .get<string>('EMAIL_AUTH_PROVIDER')
      ?.trim()
      .toLowerCase();
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const smtpReady = this.hasSmtpConfig();

    if (debugForced === 'true' || provider === 'debug') {
      return 'debug';
    }

    if (provider === 'smtp') {
      if (!smtpReady) {
        throw new EmailAuthDeliveryUnavailableError(
          'SMTP email delivery is selected, but its credentials are incomplete.',
        );
      }

      return 'smtp';
    }

    if (!provider || provider === 'auto') {
      if (smtpReady) return 'smtp';
      if (nodeEnv !== 'production') return 'debug';

      throw new EmailAuthDeliveryUnavailableError(
        'Email auth delivery is not configured for production.',
      );
    }

    throw new EmailAuthDeliveryUnavailableError(
      `Unsupported email auth provider: ${provider}.`,
    );
  }

  private async sendViaSmtp(params: {
    email: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const password = this.configService.get<string>('SMTP_PASSWORD');
    const from = this.configService.get<string>('EMAIL_AUTH_FROM')?.trim();

    if (!host || !user || !password || !from) {
      throw new EmailAuthDeliveryUnavailableError(
        'SMTP email delivery credentials are incomplete.',
      );
    }

    const port = this.getSmtpPort();
    const secureSetting = this.configService.get<string>('SMTP_SECURE');
    const secure = secureSetting ? secureSetting === 'true' : port === 465;
    const servername =
      this.configService.get<string>('SMTP_TLS_SERVERNAME')?.trim() || host;
    const timeout = this.getSmtpTimeoutMs();
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
      tls: { servername },
    });

    try {
      await transporter.sendMail({
        from,
        to: params.email,
        subject:
          this.configService.get<string>('EMAIL_AUTH_SUBJECT')?.trim() ||
          'Код входа в MAYA',
        text: this.renderText(params.code, params.expiresInMinutes),
      });
    } catch (error) {
      this.logger.error(
        `SMTP email auth transport failed: ${this.safeTransportCode(error)}`,
      );
      throw new EmailAuthDeliveryFailedError(
        'Could not send the email verification code.',
      );
    } finally {
      transporter.close();
    }
  }

  private hasSmtpConfig(): boolean {
    return Boolean(
      this.configService.get<string>('SMTP_HOST')?.trim() &&
      this.configService.get<string>('SMTP_USER')?.trim() &&
      this.configService.get<string>('SMTP_PASSWORD') &&
      this.configService.get<string>('EMAIL_AUTH_FROM')?.trim(),
    );
  }

  private renderText(code: string, expiresInMinutes: number): string {
    const template =
      this.configService.get<string>('EMAIL_AUTH_TEXT_TEMPLATE')?.trim() ||
      'MAYA: код входа {{code}}. Он действует {{minutes}} минут. Никому не сообщайте его.';

    return template
      .replaceAll('{{code}}', code)
      .replaceAll('{{minutes}}', String(expiresInMinutes));
  }

  private getSmtpPort(): number {
    const value = Number(this.configService.get<string>('SMTP_PORT'));
    return Number.isInteger(value) && value > 0 && value <= 65_535
      ? value
      : 587;
  }

  private getSmtpTimeoutMs(): number {
    const value = Number(this.configService.get<string>('SMTP_TIMEOUT_MS'));
    return Number.isInteger(value) && value >= 1_000 && value <= 60_000
      ? value
      : 15_000;
  }

  private safeTransportCode(error: unknown): string {
    if (!error || typeof error !== 'object') return 'unknown';
    const value = error as { code?: unknown; command?: unknown };
    const code = typeof value.code === 'string' ? value.code.slice(0, 40) : '';
    const command =
      typeof value.command === 'string' ? value.command.slice(0, 40) : '';
    return [code, command].filter(Boolean).join(':') || 'unknown';
  }
}
