// Fixed read-only workspace view. ShellController owns navigation, net owns auth/HTTP.
import type { OwnTask, OwnTasksFailure, OwnTasksTransport } from '../net/types.ts';
import type { SessionPort, WidgetPort, Scheduler } from './ports.ts';
export interface OwnTasksView {
  readonly phase: 'closed' | 'loading' | 'ready' | 'failed';
  readonly filter: 'active' | 'done'; readonly rows: readonly OwnTask[];
  readonly activeCount: number; readonly doneCount: number; readonly possiblyCapped: boolean;
  readonly notice: string; readonly retryAt: number | null;
}
export interface OwnTasksPort {
  view(): OwnTasksView; subscribe(listener: (v: OwnTasksView) => void): () => void;
  open(): void; close(): void; filter(value: 'active' | 'done'): void;
  refresh(): Promise<void>; dispose(): void;
}
const empty = (): OwnTasksView => ({ phase: 'closed', filter: 'active', rows: [], activeCount: 0, doneCount: 0, possiblyCapped: false, notice: '', retryAt: null });
const message = (f: OwnTasksFailure): string => f.reason === 'forbidden' ? 'Задачи недоступны для текущего входа.' : f.reason === 'invalid_response' ? 'Не удалось проверить список задач. Попробуйте обновить его.' : f.reason === 'rate_limited' ? 'Слишком частые запросы. Можно обновить список немного позже.' : 'Не удалось загрузить задачи. Попробуйте ещё раз.';
export function createOwnTasks(deps: { transport: OwnTasksTransport; session: Pick<SessionPort, 'view' | 'subscribe'>;
  shell: Pick<WidgetPort, 'view' | 'subscribe' | 'navigate'> & { openTasks(): void };
  scheduler: Pick<Scheduler, 'now' | 'after'>; newAbort: () => AbortController }): OwnTasksPort {
  let current = empty(), all: readonly OwnTask[] = [], active = false, disposed = false, serial = 0;
  let abort = deps.newAbort(), offTimer: (() => void) | null = null;
  const listeners = new Set<(v: OwnTasksView) => void>();
  const publish = (patch: Partial<OwnTasksView>) => { current = { ...current, ...patch }; for (const fn of listeners) fn(current); };
  const reset = () => { serial++; abort.abort(); abort = deps.newAbort(); offTimer?.(); offTimer = null; all = []; current = empty(); publish({}); };
  const refresh = async () => {
    if (!active || disposed || current.phase === 'loading' || !deps.session.view().signedIn || current.retryAt !== null && current.retryAt > deps.scheduler.now()) return;
    const version = ++serial;
    abort.abort(); abort = deps.newAbort(); all = []; offTimer?.(); offTimer = null;
    publish({ phase: 'loading', rows: [], activeCount: 0, doneCount: 0, possiblyCapped: false, notice: '', retryAt: null });
    const result = await deps.transport.ownTasks(abort.signal);
    if (disposed || !active || version !== serial || !deps.session.view().signedIn) return;
    if (!result.ok) {
      const retryAt = result.failure.reason === 'rate_limited' ? deps.scheduler.now() + result.failure.retryAfterSec * 1000 : null;
      publish({ phase: 'failed', notice: message(result.failure), retryAt });
      if (retryAt !== null) offTimer = deps.scheduler.after(Math.max(0, retryAt - deps.scheduler.now()), () => { offTimer = null; if (active && version === serial) publish({ retryAt: null }); });
      return;
    }
    all = result.value.rows;
    publish({ phase: 'ready', rows: all.filter(r => r.completed === (current.filter === 'done')), activeCount: all.filter(r => !r.completed).length,
      doneCount: all.filter(r => r.completed).length, possiblyCapped: result.value.possiblyCapped });
  };
  const watch = () => {
    const shown = deps.session.view().signedIn && deps.shell.view().workspace === 'tasks';
    if (shown === active) return;
    active = shown; reset(); if (active) void refresh();
  };
  const offShell = deps.shell.subscribe(watch);
  const offSession = deps.session.subscribe(() => { active = false; reset(); watch(); });
  const port: OwnTasksPort = {
    view: () => current, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    open() { if (!disposed && deps.session.view().signedIn) deps.shell.openTasks(); },
    close() { if (!disposed && active) deps.shell.navigate('shell.root'); },
    filter(value) { if (current.phase !== 'ready' || !['active', 'done'].includes(value)) return; publish({ filter: value, rows: all.filter(r => r.completed === (value === 'done')) }); },
    refresh,
    dispose() { disposed = true; active = false; offShell(); offSession(); reset(); listeners.clear(); },
  };
  watch(); return port;
}
