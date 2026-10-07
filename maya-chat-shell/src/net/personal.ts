// Fixed projections for the existing verified personal-client HTTP contract.
// No contact, role, link, provider payload or authority token leaves net/.
import type { PersonalChoice, PersonalSlot, PersonalPreview, PersonalResults } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const string = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 512;
const instant = (v: unknown): v is string => string(v) && /T.*(Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const amount = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function projectPersonalChoices(raw: unknown): readonly PersonalChoice[] | null {
  if (!Array.isArray(raw) || raw.length > 200) return null;
  const out: PersonalChoice[] = [];
  for (const value of raw) { const v = object(value); if (!v || !string(v.id) || !string(v.name) || out.some((x) => x.id === v.id)) return null; out.push({ id: v.id, name: v.name }); }
  return out;
}
export function projectPersonalSlots(raw: unknown): readonly PersonalSlot[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const out: PersonalSlot[] = [];
  for (const value of raw) { const v = object(value); if (!v || !instant(v.start) || !string(v.staff_id) || !(v.branch_id == null || string(v.branch_id))) return null;
    out.push({ start: v.start, staffId: v.staff_id, branchId: v.branch_id == null ? null : v.branch_id }); }
  return out;
}
export function projectPersonalPreview(raw: unknown): PersonalPreview | null {
  const v = object(raw);
  if (!v || v.contract !== 'maya.personal-booking.preview/1' || !Array.isArray(v.services) || v.services.length === 0 || v.services.length > 20 || !string(v.staff) || !instant(v.start) || !instant(v.asOf) || !string(v.source) || !(v.timezone === null || string(v.timezone)) || !(v.requestState === null || typeof v.requestState === 'string' && STATES.has(v.requestState)) || !['existing_request', 'available_at_read'].includes(String(v.availability))) return null;
  if (v.timezone !== null) { try { new Intl.DateTimeFormat('ru', { timeZone: v.timezone as string }); } catch { return null; } }
  const services = [];
  for (const rawService of v.services) { const s = object(rawService); if (!s || !string(s.name)) return null;
    services.push({ name: s.name, price: amount(s.price), currency: string(s.currency) ? s.currency : null, durationMinutes: amount(s.durationMinutes) }); }
  return { services, staff: v.staff, start: v.start, timezone: v.timezone as string | null, source: v.source, asOf: v.asOf, existing: v.availability === 'existing_request', requestState: v.requestState as string | null };
}
const STATES = new Set(['PENDING_APPROVAL', 'READY', 'EXECUTING', 'UNKNOWN', 'SUCCEEDED', 'FAILED', 'NOT_EXECUTED']);
export function projectPersonalResults(raw: unknown): PersonalResults | null {
  const v = object(raw);
  if (!v || v.contract !== 'maya.personal-booking.results/1' || typeof v.hasPending !== 'boolean' || typeof v.hasMore !== 'boolean' || !Array.isArray(v.results) || v.results.length > 20) return null;
  const results: { id: string; state: string; recordedAt: string }[] = [];
  for (const value of v.results) { const r = object(value); if (!r || !string(r.id) || !string(r.state) || !STATES.has(r.state) || !instant(r.recordedAt) || results.some((x) => x.id === r.id)) return null;
    results.push({ id: r.id, state: r.state, recordedAt: r.recordedAt }); }
  if (!v.hasPending && results.some((r) => ['PENDING_APPROVAL', 'READY', 'EXECUTING', 'UNKNOWN'].includes(r.state))) return null;
  return { results, hasPending: v.hasPending, hasMore: v.hasMore };
}
