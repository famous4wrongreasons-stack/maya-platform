// A23 current-user read; action locators remain private to the task runtime, never the view.
import type { OwnTasksSnapshot, OwnTask, TaskCommand, TaskReceipt } from './types.ts';
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
  if (v.action_contract === undefined) return { rows, possiblyCapped: rows.length === 50 };
  if (v.action_contract !== 'maya.operational-work.actions/1' || typeof v.can_create !== 'boolean') return null;
  const completions: { key: string; inboxId: string }[] = [], bindings = new Set<string>();
  for (const entry of v.tasks) {
    const r = object(entry)!;
    if (r.task_id !== null && (!text(r.task_id, 160) || /^\d+$/.test(r.task_id))) return null;
    if (!Array.isArray(r.next_actions) || r.next_actions.some(a => a !== 'done') || r.next_actions.length > 1) return null;
    if (r.task_id !== null) {
      if (bindings.has(r.task_id as string)) return null;
      bindings.add(r.task_id as string);
    }
    if (r.status === 'OPEN' && r.task_id !== null && r.next_actions.includes('done')) completions.push({ key: r.work_item_id as string, inboxId: r.task_id as string });
  }
  return { rows, possiblyCapped: rows.length === 50, actions: { userId: v.current_user_id, tenantId: v.tenant_id, canCreate: v.can_create, completions } };
}

export const taskIdentity = (value: unknown): value is string => typeof value === 'string' && /^companion-task:[a-f0-9-]{36}$/.test(value);
export function taskBody(command: TaskCommand): { assigneeUserId: string; title: string; bodyText: string; dueAt: null } | { inboxItemId: string } | null {
  if (command.kind === 'create' && text(command.assignee, 160) && text(command.title, 300) && text(command.detail, 4000))
    return { assigneeUserId: command.assignee, title: command.title.trim(), bodyText: command.detail.trim(), dueAt: null };
  if (command.kind === 'complete' && text(command.key, 160) && text(command.inboxId, 160) && !/^\d+$/.test(command.inboxId)) return { inboxItemId: command.inboxId };
  return null;
}
export function projectTaskReceipt(raw: unknown, command: TaskCommand): TaskReceipt | null {
  const wrapper = object(raw), r = command.kind === 'create' ? object(wrapper?.result) : wrapper;
  if (!wrapper || !r || r.actionClass !== (command.kind === 'create' ? 'create_operational_task' : 'complete_operational_task') ||
    !text(r.actionExecutionId, 160) || !text(r.targetRef, 160) || r.targetGeneration !== (command.kind === 'create' ? 0 : 1) ||
    typeof r.noOp !== 'boolean' || r.settingMutations !== 0 || ![0, 1].includes(r.workItemMutations as number) ||
    r.unknownApplicable !== false || r.providerWrites !== 0 || typeof wrapper.projectionPending !== 'boolean' ||
    command.kind === 'complete' && r.targetRef !== command.key) return null;
  return { executionId: r.actionExecutionId, target: r.targetRef, projectionPending: wrapper.projectionPending };
}
