// Read projection of the existing A23 GET /operational-work. No commands or locators leave net.
import type { OwnTasksSnapshot, OwnTask } from './types.ts';
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function projectOwnTasks(raw: unknown): OwnTasksSnapshot | null {
  const v = object(raw);
  if (!v || v.contract !== 'maya.operational-work/1' || v.ok !== true || v.read_only !== true || !text(v.current_user_id, 160) || !text(v.tenant_id, 160) || !Array.isArray(v.tasks) || v.tasks.length > 50) return null;
  const ids = new Set<string>(), rows: OwnTask[] = [];
  for (const entry of v.tasks) {
    const r = object(entry);
    if (!r || r.canonical !== true || !text(r.work_item_id, 160) || ids.has(r.work_item_id) || !text(r.title, 300) || typeof r.detail !== 'string' || r.detail.length > 4000 || (r.status !== 'OPEN' && r.status !== 'COMPLETED')) return null;
    if (!(r.due_at === null || typeof r.due_at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.due_at) && Number.isFinite(Date.parse(r.due_at)) && new Date(r.due_at).toISOString() === r.due_at)) return null;
    ids.add(r.work_item_id);
    rows.push({ key: r.work_item_id, title: r.title, detail: r.detail, dueAt: r.due_at as string | null, completed: r.status === 'COMPLETED' });
  }
  // v1 has no hasMore/total. At its cap we explicitly decline to claim completeness.
  return { rows, possiblyCapped: rows.length === 50 };
}
