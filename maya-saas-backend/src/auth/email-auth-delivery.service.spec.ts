import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

import {
  EmailAuthDeliveryService,
  EmailAuthDeliveryUnavailableError,
} from './email-auth-delivery.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('EmailAuthDeliveryService', () => {
  type SendMail = (message: {
    from: string;
    subject: string;
    text: string;
    to: string;
  }) => Promise<{ accepted: string[] }>;

  const createService = (config: Record<string, string>) =>
    new EmailAuthDeliveryService({
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the code only in explicit debug delivery', async () => {
    const service = createService({
      NODE_ENV: 'development',
      EMAIL_AUTH_PROVIDER: 'debug',
    });

    await expect(
      service.deliverCode({
        email: 'owner@example.test',
        code: '123456',
        expiresInMinutes: 5,
      }),
    ).resolves.toEqual({ delivery: 'debug', debug_code: '123456' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends a short plaintext code through configured SMTP', async () => {
    const sendMail: jest.MockedFunction<SendMail> = jest
      .fn()
      .mockResolvedValue({ accepted: ['masked'] });
    const close = jest.fn();
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
      close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    const service = createService({
      NODE_ENV: 'production',
      EMAIL_AUTH_PROVIDER: 'smtp',
      EMAIL_AUTH_FROM: 'MAYA <no-reply@example.test>',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
    });

    await expect(
      service.deliverCode({
        email: 'owner@example.test',
        code: '654321',
        expiresInMinutes: 5,
      }),
    ).resolves.toEqual({ delivery: 'email' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        auth: { user: 'smtp-user', pass: 'smtp-password' },
      }),
    );
    const sentMail = sendMail.mock.calls[0]?.[0];
    expect(sentMail).toMatchObject({
      from: 'MAYA <no-reply@example.test>',
      to: 'owner@example.test',
      subject: 'Код входа в MAYA',
    });
    expect(sentMail.text).toContain('654321');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails closed when production SMTP is incomplete', () => {
    const service = createService({
      NODE_ENV: 'production',
      EMAIL_AUTH_PROVIDER: 'auto',
    });

    expect(() => service.getDeliveryType()).toThrow(
      EmailAuthDeliveryUnavailableError,
    );
  });
});
