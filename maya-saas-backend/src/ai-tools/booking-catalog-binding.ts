import { ServiceUnavailableException } from '@nestjs/common';
import { localCalendarDate } from '../owner-reports/owner-reports.time';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { isSingleDaySemanticValue } from '../conversation-intelligence/semantic-slot-normalization';
import { buildCommonPersonNameForms } from '../common/person-name-forms';
/** Resolves preferences against the current public catalog, never grants authority.
 * The semantic owner selects an entity or request-local opaque mention. Existing
 * name forms are checked against this tenant catalog; raw utterances never select staff.
 */
type Row = { id: string; name: string };
const normalize = (s: string) =>
  s.normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ');
const rows = (value: unknown, key: string): Row[] | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const list = (value as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return null;
  if (
    !list.every(
      (v: unknown) =>
        v &&
        typeof v === 'object' &&
        typeof (v as Row).id === 'string' &&
        typeof (v as Row).name === 'string',
    )
  )
    return null;
  return list as Row[];
};
const unique = (list: Row[], preference: unknown): Row | null => {
  if (typeof preference !== 'string' || !preference.trim()) return null;
  const matches = list.filter(
    (r) => r.id === preference || normalize(r.name) === normalize(preference),
  );
  return matches.length === 1 ? matches[0] : null;
};
const staffPreference = (list: Row[], preference: unknown): Row | null => {
  if (typeof preference !== 'string' || !preference.trim()) return null;
  // Enumerate forms forward from the catalog. Do not trim arbitrary user suffixes,
  // expand nicknames or choose a "best" fuzzy match. Collisions remain ambiguous.
  const value = normalize(preference);
  const matches = list.filter(
    (row) =>
      row.id === preference ||
      buildCommonPersonNameForms([normalize(row.name)]).has(value),
  );
  return matches.length === 1 ? matches[0] : null;
};
export function bindBookingServices(
  source: unknown,
  preferences: unknown,
): Row[] | null {
  const catalog = rows(source, 'services');
  if (!catalog) return null;
  const choices = (
    Array.isArray(preferences) ? preferences : [preferences]
  ).map((p) => unique(catalog, p));
  return choices.length &&
    choices.every((c): c is Row => c !== null) &&
    new Set(choices.map((c) => c.id)).size === choices.length
    ? choices
    : null;
}
export type BookingCatalogBinding =
  | { kind: 'resolved'; staff: Row; services: Row[] }
  | {
      kind: 'unresolved';
      staff?: Row;
      reason:
        | 'source_unavailable'
        | 'staff_ambiguous_or_missing'
        | 'service_ambiguous_or_missing';
    };
export function bindBookingCatalog(input: {
  staffSource: unknown;
  serviceSource: unknown;
  employee: unknown;
  services: unknown;
  nameReferences: ReadonlyMap<string, string>;
}): BookingCatalogBinding {
  const staff = rows(input.staffSource, 'staff');
  const services = rows(input.serviceSource, 'services');
  if (staff === null || services === null)
    return { kind: 'unresolved', reason: 'source_unavailable' };
  const reference =
    typeof input.employee === 'string' &&
    input.employee.startsWith('[name removed]')
      ? input.nameReferences.get(input.employee)
      : input.employee;
  const selected = staffPreference(staff, reference);
  if (!selected)
    return { kind: 'unresolved', reason: 'staff_ambiguous_or_missing' };
  const preferences = Array.isArray(input.services)
    ? input.services
    : [input.services];
  const selectedServices = preferences.map((p) => unique(services, p));
  if (
    selectedServices.length === 0 ||
    selectedServices.some((s) => s === null) ||
    new Set(selectedServices.map((s) => s?.id)).size !== selectedServices.length
  )
    return {
      kind: 'unresolved',
      reason: 'service_ambiguous_or_missing',
      staff: selected,
    };
  return {
    kind: 'resolved',
    staff: selected,
    services: selectedServices as Row[],
  };
}

export const MULTI_SERVICE_LIMITATION =
  'В этом чате пока можно подтвердить запись только на одну услугу. Две услуги в одну запись здесь пока не оформлю. Остальные пожелания сохранены; какую одну услугу выбрать?';

/** Project a semantic single day through the existing business calendar, not tool-argument guesses. */
export function bookingPreferenceDate(
  value: unknown,
  timezone: string,
  now = new Date(),
): string | null {
  if (typeof value !== 'string' || !isSingleDaySemanticValue(value))
    return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; // registry owns date validation
  const today = localCalendarDate(timezone, now);
  return ['tomorrow', 'завтра'].includes(value)
    ? localCalendarDate(
        timezone,
        localDateMinuteToUtc(today, 24 * 60, timezone),
      )
    : today;
}

export class BookingCatalogSourceChangedError extends Error {
  readonly name = 'BookingCatalogSourceChangedError';
}
export function isBookingSourceUnavailable(error: unknown): boolean {
  if (error instanceof BookingCatalogSourceChangedError) return true;
  if (!(error instanceof ServiceUnavailableException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof response.error === 'object' &&
    response.error !== null &&
    'code' in response.error &&
    response.error.code === 'booking_branch_source_unavailable'
  );
}
