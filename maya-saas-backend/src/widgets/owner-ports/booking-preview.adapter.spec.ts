import { SealService } from '../emission/seal.service';
import { BookingPreviewAdapter } from './booking-preview.adapter';
import { encodeBookingSlotOwnerRef } from '../booking/booking-noun-identity';

const TENANT = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000002';

describe('FBE2E-2 — selected slot to canonical booking preview', () => {
  const oldIdentity = process.env.ACTION_ENGINE_IDENTITY_SECRET;
  const oldPayload = process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET;

  beforeAll(() => {
    process.env.ACTION_ENGINE_IDENTITY_SECRET = 'i'.repeat(64);
    process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = 'p'.repeat(64);
  });
  afterAll(() => {
    if (oldIdentity === undefined)
      delete process.env.ACTION_ENGINE_IDENTITY_SECRET;
    else process.env.ACTION_ENGINE_IDENTITY_SECRET = oldIdentity;
    if (oldPayload === undefined)
      delete process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET;
    else process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET = oldPayload;
  });

  const mint = (
    tenantId: string,
    noun: 'service' | 'staff' | 'slot',
    ownerRef: string,
  ) =>
    new SealService().mintNounHandles([
      {
        tenantId,
        noun,
        ownerKind:
          noun === 'service'
            ? 'catalog_service'
            : noun === 'staff'
              ? 'catalog_staff'
              : 'booking_availability',
        ownerRef:
          noun === 'slot'
            ? (encodeBookingSlotOwnerRef(ownerRef) as string)
            : ownerRef,
      },
    ])[noun];

  const harness = () => {
    const create = {
      quoteForAccount: jest.fn().mockResolvedValue({
        start: '2026-10-02T10:00:00.000Z',
        services: [
          {
            id: 'service-1',
            name: 'Haircut',
            duration_minutes: 60,
            price: 1500,
            currency: 'RUB',
          },
        ],
      }),
    };
    return {
      create,
      adapter: new BookingPreviewAdapter(
        create as never,
        {} as never,
        {} as never,
      ),
    };
  };

  const request = () => ({
    routing: {
      tenantId: TENANT,
      now: new Date('2026-10-01T09:00:00.000Z'),
      record: { requestedScopeHash: 'scope-hash' },
    } as never,
    actorUserId: 'user-1',
    principal: { proofHash: 'proof' } as never,
    handles: {
      service: mint(TENANT, 'service', 'service-1'),
      staff: mint(TENANT, 'staff', 'staff-1'),
      slot: mint(TENANT, 'slot', '2026-10-02T10:00:00.000Z'),
    },
  });

  it('reopens exact opaque handles and delegates quote semantics to the existing booking owner', async () => {
    const { adapter, create } = harness();
    const input = request();
    const result = await adapter.proposeCreateSelection(input);
    expect(create.quoteForAccount).toHaveBeenCalledWith(TENANT, 'user-1', {
      staffId: 'staff-1',
      serviceIds: ['service-1'],
      start: '2026-10-02T10:00:00.000Z',
    });
    expect(result.values).toEqual(
      new Map([
        ['service', 'service-1'],
        ['staff', 'staff-1'],
        ['slot', '2026-10-02T10:00:00.000Z'],
      ]),
    );
    expect(result.outcome).toMatchObject({
      receiptOutcome: 'ACCEPTED',
      actionReceiptRef: null,
      ownerDecision: {
        kind: 'booking_preview',
        preview: {
          subject: 'create',
          sourceCapabilityKey: 'appointments.own.create',
          frozenArgumentHandles: input.handles,
          when: '2026-10-02T10:00:00.000Z',
          serviceLabel: 'Haircut',
          staffLabel: 'staff-1',
        },
      },
    });
  });

  it('rejects raw or foreign handles before asking the booking owner', async () => {
    const { adapter, create } = harness();
    const raw = request();
    await expect(
      adapter.proposeCreateSelection({
        ...raw,
        handles: { ...raw.handles, slot: '2026-10-02T10:00:00.000Z' },
      }),
    ).resolves.toMatchObject({
      outcome: { receiptOutcome: 'REFUSED' },
      values: new Map(),
    });
    const foreign = request();
    await expect(
      adapter.proposeCreateSelection({
        ...foreign,
        handles: {
          ...foreign.handles,
          staff: mint(OTHER_TENANT, 'staff', 'staff-1'),
        },
      }),
    ).resolves.toMatchObject({
      outcome: { receiptOutcome: 'REFUSED' },
      values: new Map(),
    });
    expect(create.quoteForAccount).not.toHaveBeenCalled();
  });
});
