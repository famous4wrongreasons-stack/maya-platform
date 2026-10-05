/** Resolves preferences against the current public catalog, never grants authority.
 * Exact normalized labels only: no stemming, guessed IDs, default staff, or fuzzy matching.
 * Original user text stays local and is used only to recover an unambiguous public staff label.
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
const mentioned = (text: string, name: string) => {
  const words = normalize(text)
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
  const label = normalize(name)
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
  return (
    label.length > 0 &&
    words.some((_, i) => label.every((word, j) => words[i + j] === word))
  );
};
export type BookingCatalogBinding =
  | { kind: 'resolved'; staff: Row; services: Row[] }
  | {
      kind: 'unresolved';
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
  latestText: string;
  latestRedactedText: string;
  previousEmployee?: unknown;
}): BookingCatalogBinding {
  const staff = rows(input.staffSource, 'staff');
  const services = rows(input.serviceSource, 'services');
  if (staff === null || services === null)
    return { kind: 'unresolved', reason: 'source_unavailable' };
  const current = staff.filter((r) => mentioned(input.latestText, r.name));
  // A current name switch wins over remembered preferences. Multiple names require selection.
  let selected = current.length === 1 ? current[0] : null;
  if (current.length === 0) {
    const redactedName = input.latestRedactedText.includes('[name removed]');
    // A new redacted/unmatched name cannot silently fall back to the previous specialist.
    if (!redactedName)
      selected =
        unique(staff, input.employee) ??
        (input.employee === '[name removed]'
          ? unique(staff, input.previousEmployee)
          : null);
  }
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
    return { kind: 'unresolved', reason: 'service_ambiguous_or_missing' };
  return {
    kind: 'resolved',
    staff: selected,
    services: selectedServices as Row[],
  };
}
