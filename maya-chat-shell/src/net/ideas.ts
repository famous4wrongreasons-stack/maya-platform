// A bounded read projection, not a recommendation/plan/recipient or action authority.
import type { IdeasSnapshot, IdeaRead } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, n: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const kinds = ['OBSERVED_VALUE', 'POLICY_SIGNAL', 'PREDICTION', 'SCENARIO', 'RANKING'] as const;
const scopes = ['client', 'appointment', 'staff', 'tenant', 'branch', 'cohort'] as const;
export function projectIdeas(raw: unknown): IdeasSnapshot | null {
  const v = object(raw);
  if (!v || v.contract !== 'c8.valuation.list/1' || v.numericPredictionsAvailable !== false || !Array.isArray(v.items) || v.items.length > 25 || !(v.nextCursor === null || text(v.nextCursor, 240))) return null;
  const ids = new Set<string>(), rows: IdeaRead[] = [];
  for (const entry of v.items) {
    const x = object(entry), p = object(x?.period), subject = object(x?.subject), boundaries = object(x?.boundaries);
    if (!x || x.contract !== 'c8.valuation.read/1' || x.version !== 1 || x.mode !== 'immutable_snapshot' || !text(x.id, 240) || ids.has(x.id) || !Number.isSafeInteger(x.revision) || (x.revision as number) < 1 || !(x.snapshotHash === null || typeof x.snapshotHash === 'string' && /^[a-f0-9]{64}$/.test(x.snapshotHash)) || !kinds.includes(x.kind as never) || !subject || !scopes.includes(subject.kind as never) || !p || !instant(p.from) || !instant(p.to) || p.from > p.to || !text(p.timezone, 100) || !instant(x.asOf) || !instant(x.expiresAt) || x.asOf >= x.expiresAt || typeof x.current !== 'boolean' || typeof x.available !== 'boolean' || !['COMPLETE', 'PARTIAL', 'UNAVAILABLE', 'NOT_MEASURED'].includes(x.completeness as string) || !['VERIFIED', 'SOURCE_LABELLED', 'UNQUALIFIED'].includes(x.qualification as string) || !text(x.message, 2000)) return null;
    if (!boundaries || ['factIsPrediction', 'predictionIsPolicy', 'valueImpliesConsent', 'rankingImpliesContactPermission', 'rankingImpliesActionAuthority', 'opportunityImpliesExecution'].some(k => boundaries[k] !== false) || x.numericPrediction !== null || x.activation !== 'DISABLED') return null;
    if (x.available && (!x.current || !x.snapshotHash || x.kind === 'PREDICTION')) return null;
    ids.add(x.id);
    rows.push({ key: x.id, revision: x.revision as number, digest: x.snapshotHash as string | null, kind: x.kind as IdeaRead['kind'], scope: subject.kind as IdeaRead['scope'], asOf: x.asOf, expiresAt: x.expiresAt, from: p.from, to: p.to, timezone: p.timezone, current: x.current, available: x.available, coverage: x.completeness as IdeaRead['coverage'], qualification: x.qualification as IdeaRead['qualification'], message: x.message });
  }
  // No subject id, ranking members, raw values, source references, action intents or contact data retained.
  return { rows, possiblyCapped: v.nextCursor !== null };
}
