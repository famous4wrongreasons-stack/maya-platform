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

/** Slot facts have no provider row id. Retain their canonical ISO instant as an opaque handle ref. */
export const encodeBookingSlotOwnerRef = (value: string): string | null => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${SLOT_PREFIX}${Buffer.from(date.toISOString(), 'utf8').toString('base64url')}`;
};

export const decodeBookingSlotOwnerRef = (value: string): string | null => {
  if (!value.startsWith(SLOT_PREFIX)) return null;
  try {
    const decoded = Buffer.from(
      value.slice(SLOT_PREFIX.length),
      'base64url',
    ).toString('utf8');
    const normalized = new Date(decoded);
    if (!Number.isFinite(normalized.getTime())) return null;
    const iso = normalized.toISOString();
    return encodeBookingSlotOwnerRef(iso) === value ? iso : null;
  } catch {
    return null;
  }
};
