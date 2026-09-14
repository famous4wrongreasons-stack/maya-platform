import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { CommunicationWebPushTransport } from './communication-web-push.transport';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
const send = jest.mocked(webPush.sendNotification);
const material = {
  endpoint: 'https://fcm.googleapis.com/synthetic-only',
  expirationTime: null,
  keys: { p256dh: 'synthetic', auth: 'synthetic' },
};
const transport = new CommunicationWebPushTransport(
  new ConfigService({
    WEBPUSH_VAPID_PRIVATE_KEY: 'synthetic',
    WEBPUSH_VAPID_PUBLIC_KEY: 'synthetic',
    WEBPUSH_VAPID_SUBJECT: 'mailto:synthetic@example.invalid',
  }),
);
describe('Canonical Web Push transport outcomes', () => {
  beforeEach(() => send.mockReset());
  it('acceptance is a provider acknowledgement with bounded canonical expiry', async () => {
    send.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    expect(
      await transport.send(material, 'synthetic', new Date(Date.now() + 60000)),
    ).toBe('SUCCEEDED');
    expect(send).toHaveBeenCalledTimes(1);
    const options = send.mock.calls[0][2]!;
    expect(options.TTL).toBeGreaterThan(0);
    expect(options.TTL).toBeLessThanOrEqual(60);
  });
  it.each([
    [404, 'PERMANENT_ENDPOINT_INVALID'],
    [403, 'DETERMINISTIC_FAILED'],
    [410, 'DETERMINISTIC_FAILED'],
    [429, 'DETERMINISTIC_FAILED'],
    [500, 'UNKNOWN'],
    [0, 'UNKNOWN'],
  ])(
    'status %s has exact outcome %s, no retry',
    async (statusCode, outcome) => {
      send.mockRejectedValue({
        statusCode,
        body: 'synthetic secret provider response',
      });
      expect(
        await transport.send(
          material,
          'synthetic',
          new Date(Date.now() + 60000),
        ),
      ).toBe(outcome);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    'http://fcm.googleapis.com/x',
    'https://fcm.googleapis.com.attacker.invalid/x',
    'https://127.0.0.1/x',
    'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
  ])('unapproved destination %s never reaches I/O', async (endpoint) => {
    expect(
      await transport.send(
        { ...material, endpoint },
        'synthetic',
        new Date(Date.now() + 60000),
      ),
    ).toBe('DETERMINISTIC_FAILED');
    expect(send).not.toHaveBeenCalled();
  });
  it('expired communication cannot dispatch', async () => {
    expect(
      await transport.send(material, 'synthetic', new Date(Date.now() - 1)),
    ).toBe('DETERMINISTIC_FAILED');
    expect(send).not.toHaveBeenCalled();
  });
});
