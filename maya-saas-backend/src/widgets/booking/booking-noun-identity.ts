import type { OwnerNounIdentity } from '../noun-resolution/noun-handle.codec';

export const BOOKING_NOUN_OWNERS = Object.freeze({
  service: 'catalog_service',
  staff: 'catalog_staff',
  slot: 'booking_availability',
} as const);

export const isBookingNounIdentity = (
  value: OwnerNounIdentity,
  noun: keyof typeof BOOKING_NOUN_OWNERS,
): boolean =>
  value.noun === noun && value.ownerKind === BOOKING_NOUN_OWNERS[noun];

const SLOT_PREFIX = 'slot_iso:';
const SCOPED_SLOT_PREFIX = 'slot_v2:';

export type BookingSlotScope = {
  readonly branchId: string;
  readonly sourceRevision: string;
};
export type BookingSlotSelection = {
  readonly start: string;
  readonly scope: BookingSlotScope | null;
};

/** Slot facts have no provider row id. Retain their canonical ISO instant as an opaque handle ref. */
export const encodeBookingSlotOwnerRef = (
  value: string,
  scope?: BookingSlotScope,
): string | null => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (scope) {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(scope.branchId) ||
      !/^[a-f0-9]{64}$/.test(scope.sourceRevision)
    )
      return null;
    const ref = `${SCOPED_SLOT_PREFIX}${date.getTime().toString(36)}:${Buffer.from(scope.branchId, 'utf8').toString('base64url')}:${scope.sourceRevision}`;
    // Preserve the existing opaque noun ownerRef ceiling and alphabet.
    return ref.length <= 256 ? ref : null;
  }
  return `${SLOT_PREFIX}${Buffer.from(date.toISOString(), 'utf8').toString('base64url')}`;
};

export const decodeBookingSlotSelectionRef = (
  value: string,
): BookingSlotSelection | null => {
  if (value.startsWith(SCOPED_SLOT_PREFIX)) {
    const pieces = value.slice(SCOPED_SLOT_PREFIX.length).split(':');
    if (pieces.length !== 3 || !/^-?[0-9a-z]+$/.test(pieces[0])) return null;
    const date = new Date(Number.parseInt(pieces[0], 36));
    if (!Number.isFinite(date.getTime())) return null;
    const scope = {
      branchId: Buffer.from(pieces[1], 'base64url').toString('utf8'),
      sourceRevision: pieces[2],
    };
    const start = date.toISOString();
    return encodeBookingSlotOwnerRef(start, scope) === value
      ? { start, scope }
      : null;
  }
  if (!value.startsWith(SLOT_PREFIX)) return null;
  try {
    const decoded = Buffer.from(
      value.slice(SLOT_PREFIX.length),
      'base64url',
    ).toString('utf8');
    const normalized = new Date(decoded);
    if (!Number.isFinite(normalized.getTime())) return null;
    const iso = normalized.toISOString();
    return encodeBookingSlotOwnerRef(iso) === value
      ? { start: iso, scope: null }
      : null;
  } catch {
    return null;
  }
};

/** Legacy callers may read an instant; action owners must also retain its scope. */
export const decodeBookingSlotOwnerRef = (value: string): string | null =>
  decodeBookingSlotSelectionRef(value)?.start ?? null;
