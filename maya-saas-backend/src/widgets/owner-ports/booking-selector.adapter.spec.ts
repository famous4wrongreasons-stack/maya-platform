import { encodeBookingCatalogOwnerRef } from '../booking/booking-noun-identity';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SealService } from '../emission/seal.service';
import { BookingSelectorAdapter } from './booking-selector.adapter';

const availability = {
  getCalendarSource: jest.fn().mockResolvedValue(null),
  readBranchAvailabilityRevision: jest.fn().mockResolvedValue(null),
  resolveConfiguredBookingBranch: jest.fn().mockResolvedValue(null),
  nextAvailabilityDay: jest
    .fn()
    .mockResolvedValue({ date: '2026-10-02', timezone: 'UTC', branchId: null }),
};

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

  it.each(['internal', 'external'] as const)(
    'projects the canonical %s calendar without a tool or availability read',
    async (source) => {
      const runtime = { execute: jest.fn() };
      const crm = { getCalendarSource: jest.fn().mockResolvedValue(source) };
      const adapter = new BookingSelectorAdapter(
        runtime as never,
        { ...availability, ...crm } as never,
      );

      await expect(adapter.readCalendarSource(TENANT)).resolves.toBe(source);
      expect(crm.getCalendarSource).toHaveBeenCalledTimes(1);
      expect(crm.getCalendarSource).toHaveBeenCalledWith(TENANT);
      expect(runtime.execute).not.toHaveBeenCalled();
      expect(availability.nextAvailabilityDay).not.toHaveBeenCalled();
    },
  );

  it('has no internal-calendar fallback when the canonical owner is absent', async () => {
    const runtime = { execute: jest.fn() };
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      availability as never,
    );

    await expect(adapter.readCalendarSource(TENANT)).resolves.toBeNull();
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(availability.nextAvailabilityDay).not.toHaveBeenCalled();
  });

  it('propagates the canonical owner tenant denial without a fallback or retry', async () => {
    const denial = new ForbiddenException('Tenant scope mismatch');
    const runtime = { execute: jest.fn() };
    const crm = { getCalendarSource: jest.fn().mockRejectedValue(denial) };
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      { ...availability, ...crm } as never,
    );

    await expect(adapter.readCalendarSource(OTHER_TENANT)).rejects.toBe(denial);
    expect(crm.getCalendarSource).toHaveBeenCalledTimes(1);
    expect(crm.getCalendarSource).toHaveBeenCalledWith(OTHER_TENANT);
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(availability.nextAvailabilityDay).not.toHaveBeenCalled();
  });

  it('reads staff through the existing policy/runtime and never accepts a raw service id', async () => {
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        result: { staff: [{ id: 'staff-1', name: 'Alice' }] },
      }),
    };
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      availability as never,
    );
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
      fact: {
        completeness: {
          status: 'PARTIAL',
          returnedCount: 1,
          totalCount: null,
          hasMore: true,
          reasonCodes: ['NOT_COLLECTED'],
        },
      },
      capabilityKey: 'catalog.staff.read',
      source: { staff: [{ id: 'staff-1', name: 'Alice' }] },
      inheritedHandles: { service },
    });
    expect(runtime.execute).toHaveBeenCalledWith(
      actor,
      'catalog.staff.read',
      { arguments: {}, surface: 'web' },
      expect.objectContaining({ suppressWidgetTrigger: true }),
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

  it('asks for an explicit day after exact service/staff selection without availability or provider writes', async () => {
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
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      availability as never,
    );
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
      nextKind: null,
      capabilityKey: 'catalog.staff.read',
      inheritedHandles: { service, staff },
    });
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(availability.nextAvailabilityDay).not.toHaveBeenCalled();

    const foreign = handle(OTHER_TENANT, 'staff', 'staff-1');
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'staff',
        handles: { service, staff: foreign },
      }),
    ).resolves.toBeNull();
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('retains the native source in the successor, rejects mixed scopes and refuses a withdrawn binding', async () => {
    const scope = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        result: { staff: [{ id: '71', name: 'Антон' }] },
      }),
    };
    const crm = {
      readBranchAvailabilityRevision: jest
        .fn()
        .mockResolvedValue(scope.sourceRevision),
    };
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      { ...availability, ...crm } as never,
    );
    const service = handle(
      TENANT,
      'service',
      encodeBookingCatalogOwnerRef('81', scope)!,
    );
    const staff = handle(
      TENANT,
      'staff',
      encodeBookingCatalogOwnerRef('71', {
        ...scope,
        sourceRevision: 'b'.repeat(64),
      })!,
    );
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'service',
        handles: { service },
      }),
    ).resolves.toMatchObject({
      nextKind: 'STAFF_SELECTOR',
      selectionScope: scope,
    });
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'staff',
        handles: { service, staff },
      }),
    ).resolves.toBeNull();
    crm.readBranchAvailabilityRevision.mockRejectedValue(
      new ServiceUnavailableException({
        error: { code: 'booking_branch_source_unavailable' },
      }),
    );
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'service',
        handles: { service },
      }),
    ).resolves.toBeNull();
    expect(runtime.execute).toHaveBeenCalledTimes(1);
  });

  it('refuses source drift during staff read and does not mint a successor from mixed provenance', async () => {
    const scope = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
    const crm = {
      readBranchAvailabilityRevision: jest
        .fn()
        .mockResolvedValue(scope.sourceRevision),
    };
    const runtime = {
      execute: jest.fn().mockImplementation(() => {
        crm.readBranchAvailabilityRevision.mockResolvedValue('b'.repeat(64));
        return Promise.resolve({
          status: 'completed',
          result: { staff: [{ id: '71', name: 'Антон' }] },
        });
      }),
    };
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      { ...availability, ...crm } as never,
    );
    const service = handle(
      TENANT,
      'service',
      encodeBookingCatalogOwnerRef('81', scope)!,
    );
    await expect(
      adapter.advance({
        routing: routing as never,
        actor: actor as never,
        step: 'service',
        handles: { service },
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
    const adapter = new BookingSelectorAdapter(
      runtime as never,
      availability as never,
    );
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
  it.each([null, {}, { staff: null }, { slots: [] }, 'not a result'])(
    'WR-L8 refuses an unrecognised staff result %p instead of certifying an empty complete list',
    async (result) => {
      const runtime = {
        execute: jest.fn().mockResolvedValue({ status: 'completed', result }),
      };
      await expect(
        new BookingSelectorAdapter(
          runtime as never,
          availability as never,
        ).advance({
          routing: routing as never,
          actor: actor as never,
          step: 'service',
          handles: { service: handle(TENANT, 'service', 'service-1') },
        }),
      ).resolves.toBeNull();
    },
  );
});
