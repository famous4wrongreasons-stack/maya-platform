import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PhoneAuthDeliveryService } from './phone-auth-delivery.service';

describe('SB-1 existing SMS transport strict adapter', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });
  function fixture(patch: Record<string, string | undefined> = {}) {
    const map = {
      NODE_ENV: 'production',
      PHONE_AUTH_PROVIDER: 'smsru',
      SMSRU_API_ID: 'fixture-key',
      ...patch,
    };
    const service = new PhoneAuthDeliveryService({
      get: (key: string) => map[key as keyof typeof map],
    } as ConfigService);
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            status: 'OK',
            status_code: 100,
            sms: {
              '79990000001': {
                status: 'OK',
                status_code: 100,
                sms_id: 'fixture-only',
              },
            },
          }),
        ),
    });
    global.fetch = fetch;
    return { service, fetch };
  }
  it.each([
    { PHONE_AUTH_DEBUG: 'true' },
    { PHONE_AUTH_PROVIDER: 'debug' },
    { SMSRU_TEST: 'true' },
    { SMSRU_API_ID: undefined },
    { NODE_ENV: 'test', PHONE_AUTH_PROVIDER: undefined },
    { PHONE_AUTH_PROVIDER: 'unknown' },
  ])(
    'RV-TRANSPORT refuses debug/test/missing paths before sending: %j',
    async (patch) => {
      const h = fixture(patch);
      await expect(
        h.service.deliverClientVerificationCode({
          phone: '+79990000001',
          code: '123456',
        }),
      ).rejects.toThrow('VERIFIER TRANSPORT MISSING');
      expect(h.fetch).not.toHaveBeenCalled();
    },
  );
  it('RV-TRANSPORT reuses SMS.ru for the exact server destination; no debug code or login proof', async () => {
    const h = fixture({ PHONE_AUTH_SMS_TEMPLATE: 'custom login {{code}}' });
    await expect(
      h.service.deliverClientVerificationCode({
        phone: '+79990000001',
        code: '123456',
      }),
    ).resolves.toEqual({ delivery: 'sms' });
    const [url, init] = h.fetch.mock.calls[0] as [
      string,
      { body: URLSearchParams },
    ];
    expect(url).toBe('https://sms.ru/sms/send');
    expect(init.body.get('to')).toBe('79990000001');
    expect(init.body.has('test')).toBe(false);
    expect(init.body.get('msg')).toContain(
      'личного клиентского профиля 123456',
    );
    expect(init.body.get('msg')).not.toContain('custom login');
  });
  it.each(['exception', 'non-json', 'provider refusal', 'recipient refusal'])(
    'RV-PRIVACY does not disclose phone/code through %s response or log',
    async (kind) => {
      const h = fixture();
      const secret = 'private-phone-and-OTP';
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      if (kind === 'exception') h.fetch.mockRejectedValue(new Error(secret));
      else
        h.fetch.mockResolvedValue({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              kind === 'non-json'
                ? secret
                : JSON.stringify(
                    kind === 'provider refusal'
                      ? { status: 'ERROR', status_text: secret }
                      : {
                          status: 'OK',
                          status_code: 100,
                          sms: {
                            '79990000001': {
                              status: 'ERROR',
                              status_text: secret,
                            },
                          },
                        },
                  ),
            ),
        });
      let message = '';
      try {
        await h.service.deliverClientVerificationCode({
          phone: '+79990000001',
          code: '123456',
        });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(secret);
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    },
  );
});
