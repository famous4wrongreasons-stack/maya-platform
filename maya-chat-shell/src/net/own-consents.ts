import type { OwnConsentsSnapshot, OwnConsent } from './types.ts';

const own = (v: unknown, key: string): unknown => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = Object.getOwnPropertyDescriptor(v, key);
  return d && 'value' in d ? d.value : undefined;
};
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

/** Display-only own facts. Subject IDs, raw source hashes and export bytes never enter the shell. */
export function projectOwnConsents(raw: unknown): OwnConsentsSnapshot | null {
  const asOf = own(raw, 'asOf'), expiresAt = own(raw, 'expiresAt'), rows = own(raw, 'consents'), qualification = own(raw, 'registerExport');
  if (own(raw, 'contract') !== 'maya.privacy.own-consents/1' || !instant(asOf) || !instant(expiresAt) || expiresAt <= asOf || Date.parse(expiresAt) - Date.parse(asOf) > 300_000 || !Array.isArray(rows) || rows.length !== 2 || own(qualification, 'available') !== false || own(qualification, 'reason') !== 'STEP_UP_UNAVAILABLE') return null;
  const consents: OwnConsent[] = [];
  for (const row of rows) {
    const kind = own(row, 'kind'), state = own(row, 'state'), invalidated = own(row, 'invalidated'), recordedAt = own(row, 'recordedAt'), effectiveAt = own(row, 'effectiveAt');
    if ((kind !== 'privacy' && kind !== 'marketing') || consents.some(c => c.kind === kind) || !['GRANTED', 'NOT_GRANTED', 'NEVER_ASKED'].includes(String(state)) || typeof invalidated !== 'boolean' || (recordedAt !== null && !instant(recordedAt)) || (effectiveAt !== null && !instant(effectiveAt))) return null;
    if (state === 'GRANTED' && (invalidated || recordedAt === null || effectiveAt === null) || state !== 'GRANTED' && effectiveAt !== null || state === 'NEVER_ASKED' && (recordedAt !== null || invalidated) || state === 'NOT_GRANTED' && recordedAt === null || effectiveAt !== null && effectiveAt > asOf) return null;
    consents.push({ kind, state: state as OwnConsent['state'], invalidated, recordedAt, effectiveAt });
  }
  return { asOf, expiresAt, consents, registerExport: { available: false, reason: 'STEP_UP_UNAVAILABLE' } };
}
