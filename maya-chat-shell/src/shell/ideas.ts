import type { IdeaRead, IdeasTransport, WorkspaceReadFailure } from '../net/types.ts';
import type { SessionPort, WidgetPort, Scheduler } from './ports.ts';
export interface IdeasView {
  readonly phase: 'closed' | 'loading' | 'ready' | 'failed'; readonly rows: readonly IdeaRead[];
  readonly detail: IdeaRead | null; readonly reading: boolean; readonly possiblyCapped: boolean;
  readonly notice: string; readonly retryAt: number | null;
}
export interface IdeasPort {
  view(): IdeasView; subscribe(listener: (v: IdeasView) => void): () => void;
  open(): void; close(): void; refresh(): Promise<void>; read(key: string): Promise<void>; back(): void; dispose(): void;
}
const empty = (): IdeasView => ({ phase: 'closed', rows: [], detail: null, reading: false, possiblyCapped: false, notice: '', retryAt: null });
export function createIdeas(deps: { transport: IdeasTransport; session: Pick<SessionPort, 'view' | 'subscribe'>; shell: Pick<WidgetPort, 'view' | 'subscribe' | 'navigate'> & { openIdeas(): void }; scheduler: Pick<Scheduler, 'now' | 'after'>; newAbort: () => AbortController }): IdeasPort {
  let current = empty(), serial = 0, disposed = false, shown = false;
  let abort = deps.newAbort(), offExpiry: (() => void) | null = null, offRetry: (() => void) | null = null;
  const listeners = new Set<(v: IdeasView) => void>();
  const publish = (patch: Partial<IdeasView>) => { current = { ...current, ...patch }; for (const fn of listeners) fn(current); };
  const cancel = () => { serial++; abort.abort(); abort = deps.newAbort(); offExpiry?.(); offExpiry = null; offRetry?.(); offRetry = null; };
  const clear = () => { cancel(); current = empty(); publish({}); };
  const live = (version: number) => !disposed && shown && deps.session.view().signedIn && version === serial;
  const unexpired = (row: IdeaRead) => Date.parse(row.expiresAt) > deps.scheduler.now();
  const scheduleExpiry = (version: number) => {
    offExpiry?.(); offExpiry = null;
    if (!current.rows.length) return;
    const deadline = Math.min(...current.rows.map(row => Date.parse(row.expiresAt)));
    offExpiry = deps.scheduler.after(Math.min(2147483647, Math.max(0, deadline - deps.scheduler.now())), () => {
      if (!live(version)) return;
      const rows = current.rows.filter(unexpired), removed = rows.length !== current.rows.length;
      publish({ rows, detail: current.detail && unexpired(current.detail) ? current.detail : null, ...(removed ? { notice: 'Срок части расчётов истёк. Обновите список.' } : {}) });
      scheduleExpiry(version);
    });
  };
  const fail = (failure: WorkspaceReadFailure, version: number) => {
    const retryAt = failure.reason === 'rate_limited' ? deps.scheduler.now() + failure.retryAfterSec * 1000 : null;
    publish({ phase: 'failed', rows: [], detail: null, reading: false, possiblyCapped: false, retryAt, notice: failure.reason === 'forbidden' ? 'Расчёты недоступны для текущего входа.' : failure.reason === 'rate_limited' ? 'Можно обновить список немного позже.' : 'Не удалось проверить расчёты. Попробуйте обновить список.' });
    if (retryAt !== null) offRetry = deps.scheduler.after(Math.max(0, retryAt - deps.scheduler.now()), () => { if (live(version)) publish({ retryAt: null }); });
  };
  const load = async (selected: IdeaRead | null) => {
    if (!shown || disposed || !deps.session.view().signedIn || current.phase === 'loading' || current.reading || current.retryAt !== null && current.retryAt > deps.scheduler.now()) return;
    cancel(); const version = serial;
    publish({ phase: 'loading', rows: [], detail: null, reading: selected !== null, notice: '', retryAt: null });
    // Re-read the existing bounded list; no new snapshot URL or caller query authority.
    const result = await deps.transport.ideas(abort.signal);
    if (!live(version)) return;
    if (!result.ok) { fail(result.failure, version); return; }
    const rows = result.value.rows.filter(unexpired);
    const detail = selected ? rows.find(row => row.key === selected.key && row.revision === selected.revision && row.digest === selected.digest) ?? null : null;
    publish({ phase: 'ready', rows, detail, reading: false, possiblyCapped: result.value.possiblyCapped, notice: selected && !detail ? 'Этот расчёт больше недоступен в текущем списке. Выберите доступный результат.' : rows.length !== result.value.rows.length ? 'Срок части расчётов истёк. Обновите список.' : '' });
    scheduleExpiry(version);
  };
  const watch = () => { const next = deps.session.view().signedIn && deps.shell.view().workspace === 'ideas'; if (next === shown) return; shown = next; clear(); if (shown) void load(null); };
  const offShell = deps.shell.subscribe(watch);
  const offSession = deps.session.subscribe(() => { shown = false; clear(); watch(); });
  const port: IdeasPort = {
    view: () => current, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    open() { if (!disposed && deps.session.view().signedIn) deps.shell.openIdeas(); },
    close() { if (!disposed && shown) deps.shell.navigate('shell.root'); },
    refresh: () => load(null),
    async read(key) { const selected = current.rows.find(row => row.key === key && unexpired(row)); if (selected && current.phase === 'ready') await load(selected); },
    back() { if (shown && (current.detail || current.reading)) { cancel(); publish({ detail: null, reading: false, phase: 'ready', ...(current.reading ? { notice: 'Просмотр отменён. Обновите список.' } : {}) }); scheduleExpiry(serial); } },
    dispose() { disposed = true; offShell(); offSession(); clear(); listeners.clear(); },
  };
  watch(); return port;
}
