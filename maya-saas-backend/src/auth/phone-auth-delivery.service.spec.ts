import { ConfigService } from '@nestjs/config';

import {
  PhoneAuthDeliveryFailedError,
  PhoneAuthDeliveryService,
  PhoneAuthDeliveryUnavailableError,
} from './phone-auth-delivery.service';

type FetchResponseShape = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

describe('PhoneAuthDeliveryService', () => {
  const originalFetch = global.fetch;

  const createService = (configMap: Record<string, string | undefined>) => {
    const configService: Pick<ConfigService, 'get'> = {
      get: jest.fn((key: string) => configMap[key]),
    };

    return new PhoneAuthDeliveryService(configService as ConfigService);
  };

  const createFetchResponse = (body: unknown): FetchResponseShape => ({
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses debug delivery outside production by default', async () => {
    const service = createService({
      NODE_ENV: 'test',
    });

    await expect(
      service.deliverCode({
        phone: '+79990000000',
        code: '123456',
      }),
    ).resolves.toEqual({
      delivery: 'debug',
      debug_code: '123456',
    });
  });

  it('sends SMS via SMS.ru in production when configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createFetchResponse({
        status: 'OK',
        status_code: 100,
        sms: {
          '79990000000': {
            status: 'OK',
            status_code: 100,
            sms_id: 'sms-id-1',
          },
        },
      }),
    );

    global.fetch = fetchMock;

    const service = createService({
      NODE_ENV: 'production',
      PHONE_AUTH_PROVIDER: 'auto',
      PHONE_AUTH_SMS_TEMPLATE: 'MAYA code {{code}}',
      SMSRU_API_ID: 'smsru-api-id',
      SMSRU_FROM: 'MAYA',
      SMSRU_TEST: 'true',
      SMSRU_TIMEOUT_MS: '4000',
    });

    await expect(
      service.deliverCode({
        phone: '+7 (999) 000-00-00',
        code: '654321',
        clientIp: '203.0.113.8',
      }),
    ).resolves.toEqual({
      delivery: 'sms',
    });

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      {
        method: string;
        body: URLSearchParams;
        signal: AbortSignal;
      },
    ];

    expect(url).toBe('https://sms.ru/sms/send');
    expect(init.method).toBe('POST');
    expect(init.body.get('api_id')).toBe('smsru-api-id');
    expect(init.body.get('to')).toBe('79990000000');
    expect(init.body.get('msg')).toBe('MAYA code 654321');
    expect(init.body.get('from')).toBe('MAYA');
    expect(init.body.get('ip')).toBe('203.0.113.8');
    expect(init.body.get('test')).toBe('1');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws an unavailable error in production without SMS creds', async () => {
    const service = createService({
      NODE_ENV: 'production',
      PHONE_AUTH_PROVIDER: 'auto',
    });

    await expect(
      service.deliverCode({
        phone: '+79990000000',
        code: '123456',
      }),
    ).rejects.toThrow(PhoneAuthDeliveryUnavailableError);
  });

  it('throws a delivery error when SMS.ru rejects the message', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createFetchResponse({
        status: 'OK',
        status_code: 100,
        sms: {
          '79990000000': {
            status: 'ERROR',
            status_code: 207,
            status_text: 'Number is blocked',
          },
        },
      }),
    );

    global.fetch = fetchMock;

    const service = createService({
      NODE_ENV: 'production',
      PHONE_AUTH_PROVIDER: 'smsru',
      SMSRU_API_ID: 'smsru-api-id',
    });

    await expect(
      service.deliverCode({
        phone: '+79990000000',
        code: '123456',
      }),
    ).rejects.toThrow(PhoneAuthDeliveryFailedError);
  });
});
