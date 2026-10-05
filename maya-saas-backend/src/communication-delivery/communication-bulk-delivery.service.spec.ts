import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { CommunicationBulkDeliveryService } from './communication-bulk-delivery.service';
import { CommunicationDeliveryService } from './communication-delivery.service';
import { prepareInboxApnsCanonical } from '../inbox/apns-push';
import {
  bulkContent,
  type BulkRoute,
} from '../marketing/canonical-bulk.contract';

jest.mock('../inbox/apns-push', () => ({
  prepareInboxApnsCanonical: jest.fn(),
}));
const hash = (_kind: string, value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture() {
  const device = { token: 'a'.repeat(64) };
  const prisma = {
    devicePushToken: { findFirstOrThrow: jest.fn().mockResolvedValue(device) },
    clientChannelLink: {
      findFirstOrThrow: jest
        .fn()
        .mockResolvedValue({ deliveryAddressEncrypted: '7' }),
    },
  };
  const service = new CommunicationBulkDeliveryService(
    prisma as never,
    {} as never,
    {} as never,
    { hash, current: jest.fn().mockResolvedValue({ allowed: true }) } as never,
    { decrypt: (s: string) => s } as never,
    {} as never,
    {} as never,
    new ConfigService({
      CRM_ENCRYPTION_KEY: 'b35-synthetic-key-at-least-24-characters',
      MAYA_INBOX_BRIDGE_TOKEN: 'synthetic-local-bridge-token',
    }),
  );
  const route: BulkRoute = {
    contract: 'maya.bulk-client-route/1',
    primary: 'inbox',
    link: null,
    userId: 'user',
    webPushEndpoints: [],
    apnsDevices: [
      {
        id: 'device',
        tokenHash: hash('apns-token', [
          'tenant',
          'client',
          'device',
          device.token,
        ]),
      },
    ],
    policyVersion: 1,
  };
  const prepare = (
    service as unknown as {
      prepare: (
        ...args: unknown[]
      ) => Promise<() => Promise<{ state: string }>>;
    }
  ).prepare.bind(service);
  const child = {
    id: 'logical',
    clientId: 'client',
    contentEncrypted: JSON.stringify(bulkContent('Approved text')),
    contentIdentityHash: hash('content', bulkContent('Approved text')),
  };
  return {
    service,
    device,
    prisma,
    child,
    route,
    prepare,
    run: () =>
      prepare(
        { tenantId: 'tenant' },
        child,
        route,
        { channel: 'apns', bulkSlotKey: 'apns:device' },
        {},
      ),
  };
}
describe('B35 fixed transport results', () => {
  beforeEach(() => jest.clearAllMocks());
  it('pending Clients get the bounded work window before previously unresolved Clients', async () => {
    let clock = 1000;
    const claims: string[] = [];
    const db = {
      actionExecution: {
        findFirst: jest.fn().mockResolvedValue({ id: 'admitted' }),
      },
      marketingCampaignRecipient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a-unknown', aggregateState: 'UNRESOLVED' },
          { id: 'z-pending', aggregateState: 'READY' },
        ]),
        updateMany: ({ where }: { where: { id: string } }) => {
          claims.push(where.id);
          if (where.id === 'a-unknown') clock += 26000;
          return Promise.resolve({ count: 0 });
        },
      },
      marketingCampaign: { update: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(db)),
    };
    const service = new CommunicationBulkDeliveryService(
      db as never,
      {} as never,
      {} as never,
      { hash } as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({
        CRM_ENCRYPTION_KEY: 'b35-synthetic-key-at-least-24-characters',
      }),
    );
    const time = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      await service.resume({
        id: 'root',
        tenantId: 'tenant',
        confirmedAt: new Date(),
        actionExecutionId: 'admitted',
      } as never);
      expect(claims[0]).toBe('z-pending');
    } finally {
      time.mockRestore();
    }
  });
  it.each([
    ['accepted', 'ACCEPTED'],
    ['rejected', 'FAILED'],
    ['unknown', 'UNKNOWN'],
  ])('preserves APNs %s without route fallback', async (outcome, state) => {
    const send = jest
      .fn()
      .mockResolvedValue({ outcome, providerReference: 'synthetic-ref' });
    jest.mocked(prepareInboxApnsCanonical).mockReturnValue({ send });
    const f = fixture(),
      operation = await f.run();
    expect(await operation()).toMatchObject({ state });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      deviceToken: f.device.token,
      title: 'MAYA',
      body: 'Approved text',
      deepLink: 'maya://inbox',
      type: 'marketing_broadcast',
    });
  });
  it('a rotated pinned device cannot be replaced or sent', async () => {
    const f = fixture();
    f.device.token = 'b'.repeat(64);
    await expect(f.run()).rejects.toThrow('B35_DEVICE_CHANGED');
    expect(prepareInboxApnsCanonical).not.toHaveBeenCalled();
  });
  it('changed durable ciphertext cannot replace approved content', async () => {
    const f = fixture();
    f.child.contentEncrypted = JSON.stringify(bulkContent('Changed text'));
    await expect(f.run()).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(f.prisma.devicePushToken.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prepareInboxApnsCanonical).not.toHaveBeenCalled();
  });
  it('retired v1 bulk does not touch any execution or provider dependency', async () => {
    await expect(
      CommunicationDeliveryService.prototype.deliverBulkCampaign.call(
        {} as never,
        {} as never,
      ),
    ).rejects.toThrow('Use the immutable canonical Client bulk owner');
  });
});

describe('B35 Telegram authoritative response classification', () => {
  afterEach(() => jest.restoreAllMocks());
  async function deliver(status: number, body: unknown, invalidJson = false) {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          invalidJson ? '<html>gateway response</html>' : JSON.stringify(body),
          { status },
        ),
      );
    const f = fixture();
    const operation = await f.prepare(
      { tenantId: 'tenant' },
      f.child,
      { ...f.route, primary: 'telegram', link: { id: 'link' } },
      { channel: 'telegram' },
      {},
    );
    const result = await operation();
    expect(request).toHaveBeenCalledTimes(1);
    expect(f.prisma.clientChannelLink.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'link', tenantId: 'tenant', clientId: 'client' },
    });
    return result;
  }
  it.each([408, 429, 500, 502, 504])(
    'keeps HTTP %s inconclusive even with a rejection-shaped body',
    async (status) => {
      expect(
        await deliver(status, { error: 'B35_TELEGRAM_REJECTED' }),
      ).toMatchObject({ state: 'UNKNOWN' });
    },
  );
  it.each([
    'invalid_request',
    'invalid_bulk_transport',
    'invalid_parse_mode',
    'invalid_buttons',
    'B35_TELEGRAM_REJECTED',
  ])('retains explicit bridge rejection %s', async (error) => {
    expect(await deliver(400, { error })).toMatchObject({ state: 'FAILED' });
  });
  it.each([400, 403, 404])(
    'does not turn an unrecognized HTTP %s body into a definitive failure',
    async (status) => {
      expect(
        await deliver(status, { error: 'upstream_timeout' }),
      ).toMatchObject({ state: 'UNKNOWN' });
    },
  );
  it.each([200, 400])(
    'keeps a non-JSON HTTP %s response unknown',
    async (status) => {
      expect(await deliver(status, null, true)).toMatchObject({
        state: 'UNKNOWN',
      });
    },
  );
  it.each([
    null,
    {},
    [],
    { message_id: {} },
    { message_id: [] },
    { message_id: true },
    { message_id: -1 },
    { message_id: 1.5 },
    { message_id: '0' },
    { message_id: 'garbage' },
    { message_id: '123', error: 'B35_TELEGRAM_REJECTED' },
  ])(
    'does not accept malformed or contradictory provider evidence %j',
    async (body) => {
      expect(await deliver(200, body)).toMatchObject({ state: 'UNKNOWN' });
    },
  );
  it.each([123, '123'])(
    'accepts the canonical message reference %j',
    async (message_id) => {
      expect(await deliver(200, { message_id })).toMatchObject({
        state: 'ACCEPTED',
        reference: '123',
      });
    },
  );
});

describe('B35 Telegram UNKNOWN through dispatch and resume', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    [408, { error: 'B35_TELEGRAM_REJECTED' }],
    [200, { message_id: { unexpected: 'reference' } }],
  ])(
    'persists HTTP %s ambiguity and resumes without another send',
    async (status, body) => {
      const f = fixture();
      const leaf = {
        id: 'leaf',
        revision: 1,
        deliveryState: 'NOT_SENT',
        reconciliationState: 'NOT_REQUIRED',
        eligibilityEvidenceRef: 'b35:link:link',
      };
      const db = {
        ...f.prisma,
        marketingCampaignRecipient: {
          findMany: jest.fn(() => Promise.resolve([{ ...leaf }])),
        },
        $transaction: (run: (tx: unknown) => unknown) =>
          Promise.resolve(run(db)),
      };
      Object.assign(f.prisma, db);
      const claim = {
        campaign: { id: 'envelope', tenantId: 'tenant' },
        recipient: { ...leaf },
        attempt: { id: 'attempt' },
        leaseToken: 'lease',
      };
      const claimNext = jest
        .spyOn(f.service.kernel, 'claimNext')
        .mockResolvedValueOnce(claim as never)
        .mockResolvedValue(null);
      jest
        .spyOn(f.service.kernel, 'markBulkDispatchBoundary')
        .mockResolvedValue({
          allowed: true,
          recipient: { ...leaf, revision: 2 },
        } as never);
      const unknown = jest
        .spyOn(f.service.kernel, 'finalizeUnknown')
        .mockImplementation(() => {
          leaf.deliveryState = 'UNKNOWN';
          leaf.reconciliationState = 'MANUAL_REQUIRED';
          return Promise.resolve(leaf as never);
        });
      const rejected = jest.spyOn(
        f.service.kernel,
        'finalizeDeterministicReject',
      );
      const accepted = jest.spyOn(f.service.kernel, 'finalizeAccepted');
      const reconciled = jest.spyOn(f.service.kernel, 'claimReconciliation');
      const request = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(body), { status }));
      const deliverSlot = (
        f.service as unknown as {
          deliverSlot: (...args: unknown[]) => Promise<void>;
        }
      ).deliverSlot.bind(f.service);
      const run = () =>
        deliverSlot(
          { tenantId: 'tenant', expiresAt: new Date(Date.now() + 60_000) },
          f.child,
          { ...f.route, primary: 'telegram', link: { id: 'link' } },
          { id: 'envelope', channel: 'telegram' },
          Date.now() + 60_000,
        );
      await run();
      expect(unknown).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant',
          campaignId: 'envelope',
          recipientId: 'leaf',
          attemptId: 'attempt',
          leaseToken: 'lease',
          recipientRevision: 2,
        }),
      );
      const claimsBeforeResume = claimNext.mock.calls.length;
      await run();
      expect(claimNext).toHaveBeenCalledTimes(claimsBeforeResume);
      expect(request).toHaveBeenCalledTimes(1);
      expect(unknown).toHaveBeenCalledTimes(1);
      expect(rejected).not.toHaveBeenCalled();
      expect(accepted).not.toHaveBeenCalled();
      expect(reconciled).not.toHaveBeenCalled();
    },
  );
});
