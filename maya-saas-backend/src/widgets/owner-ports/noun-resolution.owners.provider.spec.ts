import { SealService } from '../emission/seal.service';
import { asHandle } from '../noun-resolution/noun-handles';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import { encodeBookingSlotOwnerRef } from '../booking/booking-noun-identity';
import { NounResolutionOwnersProvider } from './noun-resolution.owners.provider';

const TENANT = '00000000-0000-4000-8000-000000000001';
const START = '2026-10-02T10:00:00.000Z';

describe('FBE2E-2 — booking nouns at Gate 11', () => {
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

  const actor: NounActor = { tenantId: TENANT, userId: 'user-1' };

  const input = (slotOwnerRef: string | null): NounResolverInput => {
    const identities = [
      {
        tenantId: TENANT,
        noun: 'service',
        ownerKind: 'catalog_service',
        ownerRef: 'service-1',
      },
      {
        tenantId: TENANT,
        noun: 'staff',
        ownerKind: 'catalog_staff',
        ownerRef: 'staff-1',
      },
      ...(slotOwnerRef === null
        ? []
        : [
            {
              tenantId: TENANT,
              noun: 'slot',
              ownerKind: 'booking_availability',
              ownerRef: slotOwnerRef,
            },
          ]),
    ];
    const handles = new SealService().mintNounHandles(identities);
    return {
      capability: { space: 'C9', key: 'appointments.own.create' },
      frozenNouns: new Map(
        Object.entries(handles).map(([noun, handle]) => [
          noun,
          asHandle(handle),
        ]),
      ),
      requestedScopeHash: 'scope',
      principalProofHash: 'proof',
      tenantId: TENANT,
      confirmationOfRef: null,
      producedByIntentTokenHash: null,
    };
  };

  it('defers the exact selector-stage pair until Gate 13 supplies the validated slot', async () => {
    const quote = jest.fn();
    const provider = new NounResolutionOwnersProvider(
      { quote } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(provider.read(input(null), actor)).resolves.toEqual({
      kind: 'policy_deferred',
    });
    expect(quote).not.toHaveBeenCalled();
  });

  it('decodes only the recognized opaque booking slot before the canonical fresh quote', async () => {
    const quote = jest.fn().mockResolvedValue({ start: START });
    const provider = new NounResolutionOwnersProvider(
      { quote } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const slot = encodeBookingSlotOwnerRef(START);
    if (slot === null) throw new Error('fixture slot did not encode');

    await expect(provider.read(input(slot), actor)).resolves.toMatchObject({
      kind: 'resolved',
    });
    expect(quote).toHaveBeenCalledWith(
      actor,
      new Map([
        ['service', 'service-1'],
        ['staff', 'staff-1'],
        ['slot', START],
      ]),
    );
  });

  it('fails closed when a server-recognized booking slot has no canonical encoding', async () => {
    const quote = jest.fn();
    const provider = new NounResolutionOwnersProvider(
      { quote } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      provider.read(input('raw-client-time'), actor),
    ).resolves.toEqual({ kind: 'gone', reason: 'not_found' });
    expect(quote).not.toHaveBeenCalled();
  });
});
