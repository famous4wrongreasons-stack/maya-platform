import { ActionIdentityService } from '../../action-engine/action-engine.identity';
import { asHandle } from './noun-handles';
import {
  InvalidOwnerNounIdentityError,
  mintFrozenNouns,
  mintOwnerNounHandle,
  NOUN_HANDLE_NAMESPACE,
  openOwnerNounHandle,
  type OwnerNounIdentity,
} from './noun-handle.codec';

const identity = (key = 'a') =>
  new ActionIdentityService(key.repeat(40), `${key}-payload`.repeat(8));

const APPOINTMENT: OwnerNounIdentity = Object.freeze({
  tenantId: 'tenant_A',
  noun: 'appointment',
  ownerKind: 'appointment',
  ownerRef: 'appt_A',
});

describe('P-HANDLE — owner-minted frozen noun handles', () => {
  it('PH-1 mints a stable opaque handle in the dedicated ActionIdentityService namespace', () => {
    const signer = identity();
    const first = mintOwnerNounHandle(APPOINTMENT, signer);
    const second = mintOwnerNounHandle({ ...APPOINTMENT }, signer);
    expect(first).toBe(second);
    expect(first).toMatch(/^h_[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    expect(first).not.toContain(APPOINTMENT.ownerRef);
    expect(NOUN_HANDLE_NAMESPACE).toBe('maya.widget-frozen-noun-handle/1');
    expect(openOwnerNounHandle(first, signer)).toEqual(APPOINTMENT);
  });

  it.each([
    ['tenantId', 'tenant_B'],
    ['noun', 'start'],
    ['ownerKind', 'booking_slot'],
    ['ownerRef', 'appt_B'],
  ] as const)('PH-2 binds %s into the integrity tag', (member, changed) => {
    const signer = identity();
    const original = mintOwnerNounHandle(APPOINTMENT, signer);
    const distinct = mintOwnerNounHandle(
      { ...APPOINTMENT, [member]: changed },
      signer,
    );
    expect(distinct).not.toBe(original);
    expect(openOwnerNounHandle(distinct, signer)?.[member]).toBe(changed);
  });

  it('PH-3 fails closed for tampering, another key, malformed payloads and unknown members', () => {
    const signer = identity('a');
    const handle = mintOwnerNounHandle(APPOINTMENT, signer);
    const raw = handle as string;
    expect(
      openOwnerNounHandle(asHandle(`${raw.slice(0, -1)}0`), signer),
    ).toBeNull();
    expect(openOwnerNounHandle(handle, identity('b'))).toBeNull();
    expect(
      openOwnerNounHandle(asHandle('h_not-json.not-a-tag'), signer),
    ).toBeNull();
    const payload = Buffer.from(
      JSON.stringify({ version: 1, ...APPOINTMENT, extra: 'forbidden' }),
      'utf8',
    ).toString('base64url');
    expect(
      openOwnerNounHandle(asHandle(`h_${payload}.${'0'.repeat(64)}`), signer),
    ).toBeNull();
  });

  it('PH-4 refuses a client member, displayed values, user phrases and duplicate nouns', () => {
    const signer = identity();
    expect(() =>
      mintOwnerNounHandle({ ...APPOINTMENT, noun: 'client' }, signer),
    ).toThrow(InvalidOwnerNounIdentityError);
    expect(() =>
      mintOwnerNounHandle(
        { ...APPOINTMENT, ownerRef: '2026-09-20T12:00:00+03:00' },
        signer,
      ),
    ).toThrow(InvalidOwnerNounIdentityError);
    expect(() =>
      mintOwnerNounHandle({ ...APPOINTMENT, ownerRef: 'Иван Петров' }, signer),
    ).toThrow(InvalidOwnerNounIdentityError);
    expect(() => mintFrozenNouns([APPOINTMENT, APPOINTMENT], signer)).toThrow(
      'duplicate noun appointment',
    );
  });

  it('PH-5 mints the BOOK.4 appointment/start set without a client member', () => {
    const signer = identity();
    const nouns = mintFrozenNouns(
      [
        APPOINTMENT,
        {
          tenantId: 'tenant_A',
          noun: 'start',
          ownerKind: 'booking_slot',
          ownerRef: 'slot_A',
        },
      ],
      signer,
    );
    expect(Object.keys(nouns).sort()).toEqual(['appointment', 'start']);
    expect(openOwnerNounHandle(nouns.start, signer)).toMatchObject({
      ownerKind: 'booking_slot',
      ownerRef: 'slot_A',
    });
  });

  it('PH-6 preserves a canonical namespaced Appointment id as one opaque owner reference', () => {
    const signer = identity();
    const namespaced = {
      ...APPOINTMENT,
      ownerRef: 'appointment-action:461ba982-b96b-4479-b01a-9400d0605473',
    };
    const handle = mintOwnerNounHandle(namespaced, signer);
    expect(openOwnerNounHandle(handle, signer)).toEqual(namespaced);
    expect(handle).not.toContain(namespaced.ownerRef);
  });
});
