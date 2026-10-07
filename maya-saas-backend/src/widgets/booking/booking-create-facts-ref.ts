import { randomUUID } from 'node:crypto';

// An opaque audit-retained reference, never conversation content or authority.
// UUID keeps each draft unique; the checksum binds the existing owner's quote.
export const mintBookingCreateFactsRef = (factsHash: string | null): string => {
  if (factsHash === null || !/^[a-f0-9]{64}$/.test(factsHash))
    throw new Error('BOOKING_FACTS_REQUIRED');
  return `booking-create:v1:${randomUUID()}:${factsHash}`;
};

export const bookingCreateFactsHashOf = (reference: string): string | null =>
  /^booking-create:v1:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:([a-f0-9]{64})$/.exec(
    reference,
  )?.[1] ?? null;
