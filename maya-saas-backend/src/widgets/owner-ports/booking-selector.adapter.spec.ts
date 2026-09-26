import { SealService } from '../emission/seal.service';
import { BookingSelectorAdapter } from './booking-selector.adapter';

const NOW = new Date('2026-10-01T09:00:00.000Z');
const TENANT = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000002';

const actor = {
  userId: 'user-1',
  sessionId: 'session-1',
  tenantId: TENANT,
  role: 'customer',
  email: null,
  branchId: null,
  membershipId: 'membership-1',
  membershipStatus: 'active',
};

const routing = {
  tenantId: TENANT,
  now: NOW,
  record: { requestedScopeHash: 'scope-hash' },
};

describe('FBE2E-2 — canonical booking selector owner adapter', () => {
  const beforeIdentity = process.env.ACTION_ENGINE_IDENTITY_SECRET;
  const beforePayload = process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET;

  beforeAll(() => {
    process.env.ACTION_ENGINE_IDENTITY_SECRET = 'i'.repeat(64);
    process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = 'p'.repeat(64);
  });

  afterAll(() => {
    if (beforeIdentity === undefined)
      delete process.env.ACTION_ENGINE_IDENTITY_SECRET;
    else process.env.ACTION_ENGINE_IDENTITY_SECRET = beforeIdentity;
    if (beforePayload === undefined)
      delete process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET;
    else process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = beforePayload;
  });

  const handle = (
    tenantId: string,
    noun: 'service' | 'staff',
    ownerRef: string,
  ) =>
    new SealService().mintNounHandles([
      {
        tenantId,
        noun,
        ownerKind: noun === 'service' ? 'catalog_service' : 'catalog_staff',
        ownerRef,
      },
    ])[noun];

  it('reads staff through the existing policy/runtime and never accepts a raw service id', async () => {
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        result: { staff: [{ id: 'staff-1', name: 'Alice' }] },
      }),
    };
    const adapter = new BookingSelectorAdapter(runtime as never);
    const service = handle(TENANT, 'service', 'service-1');
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'service',
        handles: { service },
      }),
    ).resolves.toMatchObject({
      nextKind: 'STAFF_SELECTOR',
      capabilityKey: 'catalog.staff.read',
      source: { staff: [{ id: 'staff-1', name: 'Alice' }] },
      inheritedHandles: { service },
    });
    expect(runtime.execute).toHaveBeenCalledWith(
      actor,
      'catalog.staff.read',
      { arguments: {}, surface: 'web' },
      { suppressWidgetTrigger: true },
    );
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'service',
        handles: { service: 'service-1' },
      }),
    ).resolves.toBeNull();
    expect(runtime.execute).toHaveBeenCalledTimes(1);
  });

  it('reads availability with exact reopened service/staff ids and rejects foreign tenant handles', async () => {
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        result: {
          slots: [
            {
              start: '2026-10-02T10:00:00.000Z',
              end: '2026-10-02T11:00:00.000Z',
            },
          ],
        },
      }),
    };
    const adapter = new BookingSelectorAdapter(runtime as never);
    const service = handle(TENANT, 'service', 'service-1');
    const staff = handle(TENANT, 'staff', 'staff-1');
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'staff',
        handles: { service, staff },
      }),
    ).resolves.toMatchObject({
      nextKind: 'TIME_SLOT_SELECTOR',
      capabilityKey: 'booking.availability.read',
      inheritedHandles: { service, staff },
    });
    expect(runtime.execute).toHaveBeenCalledWith(
      actor,
      'booking.availability.read',
      {
        arguments: {
          date: '2026-10-02T09:00:00.000Z',
          service_ids: ['service-1'],
          staff_id: 'staff-1',
        },
        surface: 'web',
      },
      { suppressWidgetTrigger: true },
    );

    const foreign = handle(OTHER_TENANT, 'staff', 'staff-1');
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'staff',
        handles: { service, staff: foreign },
      }),
    ).resolves.toBeNull();
    expect(runtime.execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed when current actor tenant or canonical read result is unavailable', async () => {
    const runtime = {
      execute: jest
        .fn()
        .mockResolvedValue({ status: 'failed', result: { staff: [] } }),
    };
    const adapter = new BookingSelectorAdapter(runtime as never);
    const service = handle(TENANT, 'service', 'service-1');
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: { ...actor, tenantId: OTHER_TENANT } as never,
        step: 'service',
        handles: { service },
      }),
    ).resolves.toBeNull();
    expect(runtime.execute).not.toHaveBeenCalled();
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'service',
        handles: { service },
      }),
    ).resolves.toBeNull();
  });
});
