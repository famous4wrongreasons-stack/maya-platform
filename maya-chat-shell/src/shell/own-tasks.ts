// Fixed current-user workspace view. ShellController owns navigation, net owns auth/HTTP.
import type { OwnTask, OwnTasksFailure, OwnTasksTransport, OwnTaskContext, TaskCommand, TaskCommandTransport } from '../net/types.ts';
import type { SessionPort, WidgetPort, Scheduler } from './ports.ts';
export interface OwnTasksView {
  readonly phase: 'closed' | 'loading' | 'ready' | 'failed';
  readonly filter: 'active' | 'done'; readonly rows: readonly OwnTask[];
  readonly activeCount: number; readonly doneCount: number; readonly possiblyCapped: boolean;
  readonly notice: string; readonly retryAt: number | null;
  readonly canCreate?: boolean; readonly completable?: readonly string[];
  readonly command?: { readonly phase: 'pending' | 'unknown' | 'confirmed' | 'refused'; readonly message: string } | null;
}
export interface OwnTasksPort {
  view(): OwnTasksView; subscribe(listener: (v: OwnTasksView) => void): () => void;
  open(): void; close(): void; filter(value: 'active' | 'done'): void;
  refresh(): Promise<void>; create(title: string, detail: string): Promise<void>; complete(key: string): Promise<void>; retryCommand(): Promise<void>; dispose(): void;
}
const empty = (): OwnTasksView => ({ phase: 'closed', filter: 'active', rows: [], activeCount: 0, doneCount: 0, possiblyCapped: false, notice: '', retryAt: null });
const message = (f: OwnTasksFailure): string => f.reason === 'forbidden' ? 'Задачи недоступны для текущего входа.' : f.reason === 'invalid_response' ? 'Не удалось проверить список задач. Попробуйте обновить его.' : f.reason === 'rate_limited' ? 'Слишком частые запросы. Можно обновить список немного позже.' : 'Не удалось загрузить задачи. Попробуйте ещё раз.';
export function createOwnTasks(deps: { transport: OwnTasksTransport & Partial<TaskCommandTransport>; newId?: () => string; session: Pick<SessionPort, 'view' | 'subscribe'>;
  shell: Pick<WidgetPort, 'view' | 'subscribe' | 'navigate'> & { openTasks(): void };
  scheduler: Pick<Scheduler, 'now' | 'after'>; newAbort: () => AbortController }): OwnTasksPort {
  let current = empty(), all: readonly OwnTask[] = [], active = false, disposed = false, serial = 0;
  let context: OwnTaskContext | undefined, commandSerial = 0, commandAbort = deps.newAbort();
  let pending: { command: TaskCommand; identity: string; tenantId: string; userId: string } | null = null;
  let commandState: Exclude<OwnTasksView['command'], undefined> = null;
  const busy = () => commandState?.phase === 'pending' || commandState?.phase === 'unknown';
  let abort = deps.newAbort(), offTimer: (() => void) | null = null;
  const listeners = new Set<(v: OwnTasksView) => void>();
  const publish = (patch: Partial<OwnTasksView>) => { current = { ...current, ...patch }; for (const fn of listeners) fn(current); };
  const reset = () => { serial++; abort.abort(); abort = deps.newAbort(); offTimer?.(); offTimer = null; all = []; context = undefined; current = empty(); publish({}); };
  const refresh = async () => {
    if (!active || disposed || current.phase === 'loading' || commandState?.phase === 'pending' || !deps.session.view().signedIn || current.retryAt !== null && current.retryAt > deps.scheduler.now()) return;
    const version = ++serial;
    abort.abort(); abort = deps.newAbort(); all = []; context = undefined; offTimer?.(); offTimer = null;
    publish({ canCreate: false, completable: [], command: commandState, phase: 'loading', rows: [], activeCount: 0, doneCount: 0, possiblyCapped: false, notice: '', retryAt: null });
    const result = await deps.transport.ownTasks(abort.signal);
    if (disposed || !active || version !== serial || !deps.session.view().signedIn) return;
    if (!result.ok) {
      const retryAt = result.failure.reason === 'rate_limited' ? deps.scheduler.now() + result.failure.retryAfterSec * 1000 : null;
      publish({ phase: 'failed', notice: message(result.failure), retryAt });
      if (retryAt !== null) offTimer = deps.scheduler.after(Math.max(0, retryAt - deps.scheduler.now()), () => { offTimer = null; if (active && version === serial) publish({ retryAt: null }); });
      return;
    }
    all = result.value.rows; context = result.value.actions;
    publish({ canCreate: !!context?.canCreate && !!deps.transport.taskCommand && !!deps.newId, completable: deps.transport.taskCommand && deps.newId ? context?.completions.map(c => c.key) ?? [] : [], phase: 'ready', rows: all.filter(r => r.completed === (current.filter === 'done')), activeCount: all.filter(r => !r.completed).length,
      doneCount: all.filter(r => r.completed).length, possiblyCapped: result.value.possiblyCapped });
  };
  const showCommand = (value: Exclude<OwnTasksView['command'], undefined>) => { commandState = value; if (active) publish({ command: value }); };
  const execute = async (retry: boolean) => {
    if (!pending || !deps.transport.taskCommand || disposed || !active || !deps.session.view().signedIn || commandState?.phase === 'pending') return;
    if (!context || context.tenantId !== pending.tenantId || context.userId !== pending.userId) return;
    const captured = pending, version = ++commandSerial;
    showCommand({ phase: 'pending', message: retry ? 'Проверяю ту же операцию…' : 'Сохраняю задачу…' });
    const result = await deps.transport.taskCommand(captured.command, captured.identity, commandAbort.signal);
    if (disposed || version !== commandSerial || !deps.session.view().signedIn) return;
    if (!result.ok) {
      // After an uncertain first attempt even a later refusal cannot erase the possible effect.
      const unknown = retry || result.failure.reason === 'unknown';
      if (!unknown) pending = null;
      showCommand({ phase: unknown ? 'unknown' : 'refused', message: unknown ? 'Результат пока не подтверждён. Повтор проверит ту же операцию; новая задача не отправляется автоматически. До подтверждения не обновляйте страницу.' : 'Не удалось сохранить задачу. Обновите список и проверьте доступ.' });
      if (active && current.phase === 'closed') await refresh();
      return;
    }
    pending = null;
    showCommand({ phase: 'confirmed', message: (captured.command.kind === 'create' ? 'Задача создана.' : 'Задача завершена.') + (result.value.projectionPending ? ' Обновление уведомления ещё ожидается.' : '') });
    if (active) await refresh();
  };
  const start = async (command: TaskCommand) => {
    if (!context || !deps.newId || !deps.transport.taskCommand || !active || current.phase !== 'ready' || busy()) return;
    pending = { command, identity: 'companion-task:' + deps.newId(), tenantId: context.tenantId, userId: context.userId };
    await execute(false);
  };
  const watch = () => {
    const shown = deps.session.view().signedIn && deps.shell.view().workspace === 'tasks';
    if (shown === active) return;
    active = shown; reset(); if (active) { publish({ command: commandState }); void refresh(); }
  };
  const offShell = deps.shell.subscribe(watch);
  const offSession = deps.session.subscribe(() => { commandSerial++; commandAbort.abort(); commandAbort = deps.newAbort(); pending = null; commandState = null; active = false; reset(); watch(); });
  const port: OwnTasksPort = {
    view: () => current, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    open() { if (!disposed && deps.session.view().signedIn) deps.shell.openTasks(); },
    close() { if (!disposed && active) deps.shell.navigate('shell.root'); },
    filter(value) { if (current.phase !== 'ready' || !['active', 'done'].includes(value)) return; publish({ filter: value, rows: all.filter(r => r.completed === (value === 'done')) }); },
    refresh,
    async create(title, detail) {
      if (!context?.canCreate || typeof title !== 'string' || !title.trim() || title.length > 160 || typeof detail !== 'string' || !detail.trim() || detail.length > 4000) return;
      await start({ kind: 'create', assignee: context.userId, title: title.trim(), detail: detail.trim() });
    },
    async complete(key) {
      const selected = context?.completions.find(c => c.key === key);
      if (!selected || !all.some(row => row.key === key && !row.completed)) return;
      await start({ kind: 'complete', key: selected.key, inboxId: selected.inboxId });
    },
    async retryCommand() { if (commandState?.phase === 'unknown') await execute(true); },
    dispose() { disposed = true; commandSerial++; commandAbort.abort(); pending = null; commandState = null; active = false; offShell(); offSession(); reset(); listeners.clear(); },
  };
  watch(); return port;
}
