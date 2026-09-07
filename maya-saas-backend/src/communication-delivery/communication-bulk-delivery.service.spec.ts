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
  };
  const service = new CommunicationBulkDeliveryService(
    prisma as never,
    {} as never,
    {} as never,
    { hash } as never,
    { decrypt: (s: string) => s } as never,
    {} as never,
    {} as never,
    new ConfigService({
      CRM_ENCRYPTION_KEY: 'b35-synthetic-key-at-least-24-characters',
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
