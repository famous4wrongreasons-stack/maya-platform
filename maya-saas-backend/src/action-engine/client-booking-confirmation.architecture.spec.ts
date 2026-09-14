import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bookingConfirmationKey,
  BOOKING_CONFIRMATION_NAMESPACE,
} from '../crm/client-booking-confirmation.service';

describe('B33 durable source receipt architecture', () => {
  const backend = resolve(__dirname, '../..');
  const schema = readFileSync(resolve(backend, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      backend,
      'prisma/migrations/20260906180000_b33_client_booking_confirmation/migration.sql',
    ),
    'utf8',
  );
  it('has exactly approved eight scalar fields and no identity generator', () => {
    const body = schema
      .split('model ClientBookingConfirmation {')[1]
      .split('\n}')[0];
    const fields = [
      ...body.matchAll(/^\s+(\w+)\s+(String|Json|DateTime)\b/gm),
    ].map((m) => m[1]);
    expect(fields).toEqual([
      'id',
      'tenantId',
      'clientId',
      'clientChannelLinkId',
      'actionNamespace',
      'confirmationEvidenceJson',
      'confirmationEvidenceHash',
      'acceptedAt',
    ]);
    expect(body).not.toContain('@default(uuid())');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE');
    expect(migration).toContain('FOR SHARE OF l, c');
    expect(migration).not.toMatch(/INSERT INTO|UPDATE "ActionExecution"/);
  });
  it('derives a stable namespaced key independent of model output', () => {
    const receipt = {
      id: '12345678-1234-4123-8123-123456789abc',
      tenantId: 'tenant',
      clientId: 'client',
      actionNamespace: BOOKING_CONFIRMATION_NAMESPACE,
    };
    const key = bookingConfirmationKey(receipt);
    expect(key).toMatch(/^chat-confirmation:v1:[a-f0-9]{64}$/);
    expect(
      bookingConfirmationKey({
        ...receipt,
        ...{ staffId: 'changed', start: 'changed' },
      }),
    ).toBe(key);
    expect(bookingConfirmationKey({ ...receipt, clientId: 'other' })).not.toBe(
      key,
    );
    expect(
      bookingConfirmationKey({
        ...receipt,
        id: '12345678-1234-4123-8123-123456789abd',
      }),
    ).not.toBe(key);
  });
});

describe('B33 chat initiator ratchets', () => {
  const root = resolve(__dirname, '../../..');
  const source = (p: string) => readFileSync(resolve(root, p), 'utf8');
  it('requires receipt before interpretation and derives no model key in Python', () => {
    const context = source('ai администратор/legacy_client_habits_bridge.py');
    const webhook = source('ai администратор/webhook_server.py');
    const finalizer = webhook
      .split('def _finalize_booking_for_chat(')[1]
      .split('\nasync def ')[0];
    expect(context).toContain(
      'command("booking-confirmation", proof, confirmation)',
    );
    expect(finalizer).toContain('if not command_context.confirmation_id:');
    expect(finalizer).toContain(
      '"confirmationId": command_context.confirmation_id',
    );
    expect(finalizer).toContain('"chat-appointment-create"');
    expect(finalizer).not.toMatch(
      /hashlib|idempotencyKey|uuid|identity_material|database\.|_yc\./,
    );
    for (const name of ['chat_handler', 'chat_stream_handler']) {
      const body = webhook
        .split(`async def ${name}(`)[1]
        .split('\nasync def ')[0];
      expect(
        body.indexOf('_client_command_context=request_context'),
      ).toBeLessThan(body.lastIndexOf('get_ai_response'));
      expect(body).toContain('body["booking_confirmation"]["sourceContext"]');
    }
    const runtime = source(
      'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
    );
    const confirmed = runtime
      .split('async createConfirmedChatAppointment(')[1]
      .split('/** B19')[0];
    expect(confirmed).toContain('.resolveKey(');
    expect(confirmed).toContain('this.createClientAppointment(');
    expect(confirmed).not.toMatch(
      /appointment\.(create|upsert)|adapter\.|randomUUID|createHash/,
    );
  });
  it('sender persists once per gesture, replays after restart and fails closed on storage failure', () => {
    const app = source('сайт и приложение/app.html');
    const block = app.slice(
      app.indexOf('  function pendingBookingConfirmation()'),
      app.indexOf('  async function send(textArg'),
    );
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
    };
    const randomUUID = jest
      .fn()
      .mockReturnValueOnce('12345678-1234-4123-8123-123456789abc')
      .mockReturnValueOnce('12345678-1234-4123-8123-123456789abd');
    const send = jest.fn<void, [string, string, { id: string }]>();
    // Execute the actual bundled sender functions with storage/transport boundaries only.
    const load = () => {
      const loaded: unknown = runInNewContext(block + '; confirmChatBooking;', {
        sending: false,
        chatSurface: () => 'client',
        localStorage: storage,
        chatHistoryCacheKey: () => 'synthetic-chat',
        window: { crypto: { randomUUID } },
        send,
        setMsgs: jest.fn(),
      });
      return loaded as (offer: unknown, replay: boolean) => void;
    };
    const offer = {
      id: 'message-1',
      text: 'Подтвердите запись отдельным действием: synthetic',
    };
    load()(offer, false);
    load()(offer, false);
    load()(null, true);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][2]).toEqual(send.mock.calls[2][2]);
    load()({ ...offer, id: 'message-2' }, false);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[3][2].id).not.toBe(send.mock.calls[0][2].id);
    storage.setItem.mockImplementation(() => {
      throw Error('Storage unavailable');
    });
    load()({ ...offer, id: 'message-3' }, false);
    expect(send).toHaveBeenCalledTimes(4);
    const sendBody = app
      .split('  async function send(textArg')[1]
      .split('\n  // iOS/Safari')[0];
    expect(sendBody.match(/JSON.stringify\(ap.payload\)/g)?.length).toBe(2);
  });
});
