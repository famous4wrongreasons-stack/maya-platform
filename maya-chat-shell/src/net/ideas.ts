// A bounded read projection, not a recommendation/plan/recipient or action authority.
import type { IdeasSnapshot, IdeaRead, IdeaFinding, IdeaBasis, IdeaRuleParameters } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, n: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const kinds = ['OBSERVED_VALUE', 'POLICY_SIGNAL', 'PREDICTION', 'SCENARIO', 'RANKING'] as const;
const scopes = ['client', 'appointment', 'staff', 'tenant', 'branch', 'cohort'] as const;
const bases = ['confirmed_cash', 'confirmed_refunds', 'confirmed_cash_net_linked_refunds', 'booked_value', 'provider_reported_gross', 'observed_attended_count'];
const integral = (v: unknown): v is string => typeof v === 'string' && v.length <= 240 && /^-?(0|[1-9]\d*)$/.test(v);
const currency = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const keys = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
/** Parameters come only from this result's current C8 reader. No local/default policy lookup. */
function ruleParameters(raw: unknown, period: unknown): IdeaRuleParameters | null {
  const p = object(raw), window = object(p?.elapsed), scope = object(p?.serviceScope), sourcePeriod = object(period);
  if (!p || !window || !scope || !keys(p, ['elapsed', 'comparison', 'evidence', 'minimumCoverage', 'serviceScope', 'timezone']) || !keys(window, ['unit', 'count']) || !keys(scope, ['restricted', 'count'])) return null;
  if (!['day', 'calendar_month'].includes(window.unit as string) || !Number.isSafeInteger(window.count) || (window.count as number) < 1 || !['gt', 'gte'].includes(p.comparison as string) || p.evidence !== 'proven_attendance' || !['COMPLETE', 'PARTIAL'].includes(p.minimumCoverage as string)) return null;
  if (!Number.isSafeInteger(scope.count) || (scope.count as number) < 0 || (scope.count as number) > 100 || typeof scope.restricted !== 'boolean' || scope.restricted !== ((scope.count as number) > 0)) return null;
  if (!text(p.timezone, 100) || p.timezone !== p.timezone.trim() || !sourcePeriod || typeof sourcePeriod.timezone !== 'string' || p.timezone !== sourcePeriod.timezone.trim()) return null;
  try { new Intl.DateTimeFormat('ru-RU', { timeZone: p.timezone }); } catch { return null; }
  return { elapsed: { unit: window.unit as 'day' | 'calendar_month', count: window.count as number }, comparison: p.comparison as 'gt' | 'gte', evidence: 'proven_attendance', minimumCoverage: p.minimumCoverage as 'COMPLETE' | 'PARTIAL', serviceScope: { restricted: scope.restricted, count: scope.count as number }, timezone: p.timezone };
}
function finding(x: Record<string, unknown>, scope: unknown): IdeaFinding {
  // A value never makes an unavailable/unqualified result usable.
  if (!x.current || !x.available || !['COMPLETE', 'PARTIAL'].includes(x.completeness as string) || x.qualification === 'UNQUALIFIED') return { kind: 'unavailable' };
  if (x.kind === 'PREDICTION' || x.kind === 'RANKING') return { kind: 'unsupported' };
  const rule = object(x.rule);
  if (!rule || rule.version !== 1 || typeof rule.key !== 'string') return { kind: 'unsupported' };
  const observed = x.kind === 'OBSERVED_VALUE' && /^c8\.value\/[a-z][a-z0-9_]{0,79}$/.test(rule.key);
  const policy = x.kind === 'POLICY_SIGNAL' && /^c8\.dormancy\/[a-z][a-z0-9_]{0,79}$/.test(rule.key);
  const scenario = x.kind === 'SCENARIO' && rule.key === 'c8.scenario/booked_appointment';
  if (!observed && !policy && !scenario) return { kind: 'unsupported' };
  if (!Array.isArray(x.values) || x.values.length !== 1) return { kind: 'invalid' };
  const v = object(x.values[0]);
  if (!v || v.basis !== x.basis || v.currency !== x.currency) return { kind: 'invalid' };
  if (observed) {
    if (!bases.includes(x.basis as string)) return { kind: 'unsupported' };
    const count = x.basis === 'observed_attended_count';
    if (v.key !== rule.key.slice('c8.value/'.length) || v.type !== 'observed' || !integral(v.value) || v.unit !== (count ? 'count' : 'money_minor') || !(count ? x.currency === null : currency(x.currency))) return { kind: 'invalid' };
    return { kind: 'observation', basis: x.basis as IdeaBasis, value: v.value, currency: x.currency as string | null };
  }
  if (policy) {
    if (scope !== 'client' || x.qualification !== 'VERIFIED' || x.basis !== 'proven_attendance_policy' || x.currency !== null || v.key !== rule.key.slice('c8.dormancy/'.length) || v.type !== 'policy' || v.unit !== 'boolean' || typeof v.value !== 'boolean') return { kind: 'invalid' };
    return { kind: 'policy', met: v.value, parameters: ruleParameters(rule.parameters, x.period) };
  }
  if (scope !== 'appointment' || x.basis !== 'booked_value' || v.key !== 'conditional_booked_value' || v.type !== 'scenario' || v.unit !== 'money_minor' || !integral(v.value) || !currency(x.currency) || !instant(x.horizonEnd) || x.horizonEnd <= (x.asOf as string)) return { kind: 'invalid' };
  return { kind: 'scenario', value: v.value, currency: x.currency, horizonEnd: x.horizonEnd };
}
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
    rows.push({ key: x.id, revision: x.revision as number, digest: x.snapshotHash as string | null, kind: x.kind as IdeaRead['kind'], scope: subject.kind as IdeaRead['scope'], asOf: x.asOf, expiresAt: x.expiresAt, from: p.from, to: p.to, timezone: p.timezone, current: x.current, available: x.available, coverage: x.completeness as IdeaRead['coverage'], qualification: x.qualification as IdeaRead['qualification'], message: x.message, finding: finding(x, subject.kind) });
  }
  // No subject id, ranking members, unprojected values, source references, action intents or contact data retained.
  return { rows, possiblyCapped: v.nextCursor !== null };
}
