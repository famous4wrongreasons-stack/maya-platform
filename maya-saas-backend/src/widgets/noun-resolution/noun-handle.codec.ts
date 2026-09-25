// P-HANDLE — owner-minted, integrity-tagged frozen-noun handles.
//
// A frozen noun names WHAT a canonical owner must re-read. It never contains the displayed value,
// a user phrase, a price, or client identity. The handle is server-side and AUDIT_RETAINED; it never
// crosses the widget wire (F14, R3.7.3). This codec owns only the envelope and HMAC namespace. The
// canonical owner supplies the opaque row identity and later performs the fresh read (BOOK.4/U11b).

import { timingSafeEqual } from 'node:crypto';

import { asHandle, type Handle } from './noun-handles';

export const NOUN_HANDLE_NAMESPACE = 'maya.widget-frozen-noun-handle/1';
export const NOUN_HANDLE_VERSION = 1 as const;

/** The one platform keyed-HMAC discipline P-HANDLE accepts. */
export interface NounHandleTagger {
  hmac(namespace: string, value: unknown): string;
}

export interface OwnerNounIdentity {
  readonly tenantId: string;
  readonly noun: string;
  readonly ownerKind: string;
  readonly ownerRef: string;
}

interface NounHandlePayload extends OwnerNounIdentity {
  readonly version: typeof NOUN_HANDLE_VERSION;
}

export class InvalidOwnerNounIdentityError extends Error {
  constructor(message: string) {
    super(`widget noun handle: ${message}`);
    this.name = 'InvalidOwnerNounIdentityError';
  }
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
// Canonical owner ids are opaque to the widget layer. Internal Appointment ids deliberately use
// the namespaced `appointment-action:<execution-id>` form, so `:` is part of the owner's stable
// identity alphabet; accepting it here does not make the value client-authoritative because the
// whole payload remains server-minted and HMAC authenticated.
const OPAQUE_REF = /^[A-Za-z0-9_:-]{1,256}$/;

const normalize = (input: OwnerNounIdentity): NounHandlePayload => {
  const tenantId = input.tenantId.trim();
  const noun = input.noun.trim();
  const ownerKind = input.ownerKind.trim();
  const ownerRef = input.ownerRef.trim();
  if (!OPAQUE_REF.test(tenantId))
    throw new InvalidOwnerNounIdentityError(
      'tenantId is not an opaque canonical id',
    );
  if (!NAME.test(noun))
    throw new InvalidOwnerNounIdentityError(
      'noun is not a canonical noun name',
    );
  if (noun === 'client')
    throw new InvalidOwnerNounIdentityError(
      'client is deliberately not a frozen noun',
    );
  if (!NAME.test(ownerKind))
    throw new InvalidOwnerNounIdentityError(
      'ownerKind is not a canonical owner name',
    );
  if (!OPAQUE_REF.test(ownerRef))
    throw new InvalidOwnerNounIdentityError(
      'ownerRef is not an opaque canonical id',
    );
  return Object.freeze({
    version: NOUN_HANDLE_VERSION,
    tenantId,
    noun,
    ownerKind,
    ownerRef,
  });
};

const encode = (payload: NounHandlePayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const equalTag = (left: string, right: string): boolean => {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Mint one server-side handle. The output discloses none of the displayed noun value. */
export const mintOwnerNounHandle = (
  input: OwnerNounIdentity,
  tagger: NounHandleTagger,
): Handle => {
  const payload = normalize(input);
  const encoded = encode(payload);
  const tag = tagger.hmac(NOUN_HANDLE_NAMESPACE, payload);
  return asHandle(`h_${encoded}.${tag}`);
};

/**
 * Authenticate and open a handle for an owner adapter. Invalid, malformed, cross-key or tampered
 * handles resolve to null; they never become a best-effort owner reference.
 */
export const openOwnerNounHandle = (
  handle: Handle,
  tagger: NounHandleTagger,
): OwnerNounIdentity | null => {
  const raw = handle as string;
  if (!raw.startsWith('h_')) return null;
  const pieces = raw.slice(2).split('.');
  if (pieces.length !== 2 || pieces.some((piece) => piece.length === 0))
    return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(pieces[0], 'base64url').toString('utf8'),
    );
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !==
        'noun,ownerKind,ownerRef,tenantId,version' ||
      record.version !== NOUN_HANDLE_VERSION ||
      typeof record.tenantId !== 'string' ||
      typeof record.noun !== 'string' ||
      typeof record.ownerKind !== 'string' ||
      typeof record.ownerRef !== 'string'
    )
      return null;
    const payload = normalize({
      tenantId: record.tenantId,
      noun: record.noun,
      ownerKind: record.ownerKind,
      ownerRef: record.ownerRef,
    });
    if (encode(payload) !== pieces[0]) return null;
    const expected = tagger.hmac(NOUN_HANDLE_NAMESPACE, payload);
    if (!equalTag(expected, pieces[1])) return null;
    return Object.freeze({
      tenantId: payload.tenantId,
      noun: payload.noun,
      ownerKind: payload.ownerKind,
      ownerRef: payload.ownerRef,
    });
  } catch {
    return null;
  }
};

/** Mint a whole frozen-noun object while refusing duplicate noun names. */
export const mintFrozenNouns = (
  identities: readonly OwnerNounIdentity[],
  tagger: NounHandleTagger,
): Readonly<Record<string, Handle>> => {
  const result: Record<string, Handle> = {};
  for (const identity of identities) {
    if (Object.prototype.hasOwnProperty.call(result, identity.noun))
      throw new InvalidOwnerNounIdentityError(
        `duplicate noun ${identity.noun}`,
      );
    result[identity.noun] = mintOwnerNounHandle(identity, tagger);
  }
  return Object.freeze(result);
};
