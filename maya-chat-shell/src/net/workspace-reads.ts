// Finite Inbox and retained OwnerReport projections. No links/payload authority.
import type { FeedSnapshot, ReportSummary, ReportsSnapshot, ReportSnapshot } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const reportKey = (v: unknown): v is string => typeof v === 'string' && v.length === 36 && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const reportType = (v: unknown): v is ReportSummary['type'] => v === 'daily_report' || v === 'morning_owner' || v === 'morning_staff';
const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && instant(v + 'T00:00:00.000Z');
/** Opaque current Inbox ID; never a path, URL, query or display index. */
export const feedKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
export function projectFeed(raw: unknown): FeedSnapshot | null {
  const v = object(raw);
  if (!v || !Array.isArray(v.items) || v.items.length > 50) return null;
  const ids = new Set<string>(), rows: FeedSnapshot['rows'][number][] = [];
  for (const entry of v.items) {
    const r = object(entry);
    if (!r || !text(r.id, 160) || ids.has(r.id) || !text(r.type, 100) || !text(r.title, 160) || !text(r.body_text, 12000) || !instant(r.created_at) || !(r.read_at === null || instant(r.read_at))) return null;
    ids.add(r.id);
    rows.push({ key: r.id, type: r.type, title: r.title, body: r.body_text, createdAt: r.created_at, unread: r.read_at === null });
  }
  return { rows, possiblyCapped: rows.length === 50 };
}
export function projectReports(raw: unknown): ReportsSnapshot | null {
  const v = object(raw);
  if (!v || !Array.isArray(v.reports) || v.reports.length > 100) return null;
  const ids = new Set<string>(), rows: ReportSummary[] = [];
  for (const entry of v.reports) {
    const r = object(entry);
    if (!r || !reportKey(r.runId) || ids.has(r.runId) || !reportType(r.reportType) || !day(r.periodLocalDate) || !text(r.title, 160)) return null;
    ids.add(r.runId);
    rows.push({ key: r.runId, type: r.reportType, period: r.periodLocalDate, title: r.title });
  }
  // Source examines at most 100 recent tenant runs BEFORE recipient filtering, even if empty.
  return { rows };
}
export function projectReport(raw: unknown, selected: ReportSummary): ReportSnapshot | null {
  const v = object(raw), c = object(v?.content);
  if (!v || v.contract !== 'maya.owner-report-snapshot/1' || v.runId !== selected.key || v.reportType !== selected.type || v.periodLocalDate !== selected.period || !text(v.timezone, 100) || !c || c.title !== selected.title || !text(c.bodyText, 12000)) return null;
  return { ...selected, timezone: v.timezone, body: c.bodyText };
}
