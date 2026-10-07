// Existing backend reason-table phrases for a refused booking confirmation.
// Presentation only: neither these codes nor their text grant a retry or change an AE outcome.
export const BOOKING_REFUSALS = {
  handle_stale: { sentence: 'booking_stale', phrase_key: 'widget.refusal.handle_stale',
    rendered: 'Данные изменились с момента показа. Откройте актуальную версию.' },
  booking_confirmation_required: { sentence: 'booking_confirmation_required', phrase_key: 'widget.refusal.booking_confirmation_required',
    rendered: 'Сначала нужно подтвердить запись.' },
  NOT_COLLECTED: { sentence: 'booking_facts_unavailable', phrase_key: 'widget.limitation.not_collected',
    rendered: 'Эти данные пока не собраны.' },
} as const;
export type BookingRefusalSentence = typeof BOOKING_REFUSALS[keyof typeof BOOKING_REFUSALS]['sentence'];
export const bookingRefusal = (code: unknown) =>
  typeof code === 'string' && Object.hasOwn(BOOKING_REFUSALS, code)
    ? BOOKING_REFUSALS[code as keyof typeof BOOKING_REFUSALS] : null;
