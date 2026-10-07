import { SealService } from '../emission/seal.service';
import { ServiceUnavailableException } from '@nestjs/common';
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

  it('derives branch/source only from the sealed scoped slot and passes it to the fresh owner read', async () => {
    const quote = jest
      .fn<Promise<{ start: string }>, [unknown, ReadonlyMap<string, string>]>()
      .mockResolvedValue({ start: START });
    const provider = new NounResolutionOwnersProvider(
      { quote } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const scope = { branchId: 'branch-a', sourceRevision: 'b'.repeat(64) };
    const request = input(encodeBookingSlotOwnerRef(START, scope));
    const result = await provider.read(request, actor);
    expect(result.kind).toBe('resolved');
    expect(quote.mock.calls[0][1].get('branch')).toBe('branch-a');
    expect(quote.mock.calls[0][1].get('branch_source_revision')).toBe(
      scope.sourceRevision,
    );
    // A scope encoded for create cannot silently become reschedule authority.
    await expect(
      provider.read(
        {
          ...request,
          capability: { space: 'C9', key: 'appointments.own.reschedule' },
        },
        actor,
      ),
    ).resolves.toMatchObject({ kind: 'gone' });
    expect(quote).toHaveBeenCalledTimes(1);
  });

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

  it('maps only known withdrawn branch source to a gone noun, preserving genuine provider faults', async () => {
    const quote = jest.fn();
    const provider = new NounResolutionOwnersProvider(
      { quote } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const request = input(
      encodeBookingSlotOwnerRef(START, {
        branchId: 'branch-a',
        sourceRevision: 'a'.repeat(64),
      }),
    );
    quote.mockRejectedValueOnce(
      new ServiceUnavailableException({
        error: { code: 'booking_branch_source_unavailable' },
      }),
    );
    await expect(provider.read(request, actor)).resolves.toEqual({
      kind: 'gone',
      reason: 'not_found',
    });
    quote.mockRejectedValueOnce(
      new ServiceUnavailableException('Provider timeout'),
    );
    await expect(provider.read(request, actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
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
