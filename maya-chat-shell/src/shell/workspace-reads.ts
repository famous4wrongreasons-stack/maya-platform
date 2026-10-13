// Finite host workspaces, independent of WidgetContract routes and conversation/model history.
import type { FeedRow, ReportSummary, ReportSnapshot, WorkspaceReadFailure, WorkspaceReadTransport } from '../net/types.ts';
import type { SessionPort, WidgetPort, Scheduler } from './ports.ts';
export interface WorkspaceReadsView {
  readonly workspace: 'feed' | 'library' | null;
  readonly phase: 'closed' | 'loading' | 'ready' | 'failed';
  readonly feed: readonly FeedRow[]; readonly reports: readonly ReportSummary[];
  readonly unreadOnly: boolean; readonly possiblyCapped: boolean;
  readonly order: 'recent' | 'title'; readonly layout: 'list' | 'grid';
  readonly detail: { readonly phase: 'loading'; readonly title: string } | { readonly phase: 'ready'; readonly report: ReportSnapshot } | null;
  readonly notice: string; readonly retryAt: number | null;
}
export interface WorkspaceReadsPort {
  view(): WorkspaceReadsView; subscribe(listener: (view: WorkspaceReadsView) => void): () => void;
  openFeed(): void; openLibrary(): void; close(): void; refresh(): Promise<void>;
  filterUnread(value: boolean): void; order(value: 'recent' | 'title'): void; layout(value: 'list' | 'grid'): void;
  read(key: string): Promise<void>; back(): void; dispose(): void;
}
const empty = (): WorkspaceReadsView => ({ workspace: null, phase: 'closed', feed: [], reports: [], unreadOnly: false, possiblyCapped: false, order: 'recent', layout: 'list', detail: null, notice: '', retryAt: null });
const message = (f: WorkspaceReadFailure): string => f.reason === 'forbidden' ? 'Материалы недоступны для текущего входа.' : f.reason === 'invalid_response' ? 'Не удалось проверить ответ. Попробуйте обновить список.' : f.reason === 'rate_limited' ? 'Можно обновить список немного позже.' : 'Не удалось загрузить материалы. Попробуйте ещё раз.';
export function createWorkspaceReads(deps: {
  transport: WorkspaceReadTransport; session: Pick<SessionPort, 'view' | 'subscribe'>;
  shell: Pick<WidgetPort, 'view' | 'subscribe' | 'navigate'> & { openFeed(): void; openLibrary(): void };
  scheduler: Pick<Scheduler, 'now' | 'after'>; newAbort: () => AbortController;
}): WorkspaceReadsPort {
  let current = empty(), serial = 0, disposed = false;
  let allFeed: readonly FeedRow[] = [], allReports: readonly ReportSummary[] = [];
  let abort = deps.newAbort(), offTimer: (() => void) | null = null;
  const listeners = new Set<(v: WorkspaceReadsView) => void>();
  const publish = (patch: Partial<WorkspaceReadsView>) => { current = { ...current, ...patch }; for (const fn of listeners) fn(current); };
  const cancel = () => { serial++; abort.abort(); abort = deps.newAbort(); offTimer?.(); offTimer = null; };
  const clear = () => { cancel(); allFeed = []; allReports = []; current = empty(); publish({}); };
  const live = (version: number) => !disposed && current.workspace !== null && version === serial && deps.session.view().signedIn;
  const fail = (failure: WorkspaceReadFailure, version: number) => {
    allFeed = []; allReports = [];
    const retryAt = failure.reason === 'rate_limited' ? deps.scheduler.now() + failure.retryAfterSec * 1000 : null;
    publish({ phase: 'failed', feed: [], reports: [], detail: null, notice: message(failure), possiblyCapped: false, retryAt });
    if (retryAt !== null) offTimer = deps.scheduler.after(Math.max(0, retryAt - deps.scheduler.now()), () => { offTimer = null; if (live(version)) publish({ retryAt: null }); });
  };
  const sorted = () => current.order === 'title' ? [...allReports].sort((a, b) => a.title.localeCompare(b.title, 'ru')) : allReports;
  const refresh = async () => {
    const workspace = current.workspace;
    if (!workspace || disposed || current.phase === 'loading' || !deps.session.view().signedIn || current.retryAt !== null && current.retryAt > deps.scheduler.now()) return;
    cancel(); const version = serial;
    allFeed = []; allReports = [];
    publish({ phase: 'loading', feed: [], reports: [], detail: null, notice: '', possiblyCapped: false, retryAt: null });
    if (workspace === 'feed') {
      const result = await deps.transport.feed(abort.signal);
      if (!live(version)) return;
      if (!result.ok) { fail(result.failure, version); return; }
      allFeed = result.value.rows;
      publish({ phase: 'ready', feed: allFeed.filter(row => !current.unreadOnly || row.unread), possiblyCapped: result.value.possiblyCapped });
    } else {
      const result = await deps.transport.reports(abort.signal);
      if (!live(version)) return;
      if (!result.ok) { fail(result.failure, version); return; }
      allReports = result.value.rows;
      publish({ phase: 'ready', reports: sorted() });
    }
  };
  const watch = () => {
    const workspace = deps.shell.view().workspace;
    const shown = deps.session.view().signedIn && (workspace === 'feed' || workspace === 'library') ? workspace : null;
    if (shown === current.workspace) return;
    clear(); if (shown) { publish({ workspace: shown }); void refresh(); }
  };
  const offShell = deps.shell.subscribe(watch);
  const offSession = deps.session.subscribe(() => { clear(); watch(); });
  const port: WorkspaceReadsPort = {
    view: () => current, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    openFeed() { if (!disposed && deps.session.view().signedIn) deps.shell.openFeed(); },
    openLibrary() { if (!disposed && deps.session.view().signedIn) deps.shell.openLibrary(); },
    close() { if (!disposed && current.workspace) deps.shell.navigate('shell.root'); },
    refresh,
    filterUnread(value) { if (current.workspace !== 'feed' || current.phase !== 'ready' || typeof value !== 'boolean') return; publish({ unreadOnly: value, feed: allFeed.filter(row => !value || row.unread) }); },
    order(value) { if (current.workspace !== 'library' || current.phase !== 'ready' || !['recent', 'title'].includes(value)) return; publish({ order: value }); publish({ reports: sorted() }); },
    layout(value) { if (current.workspace === 'library' && ['list', 'grid'].includes(value)) publish({ layout: value }); },
    async read(key) {
      if (disposed || current.workspace !== 'library' || current.phase !== 'ready' || !deps.session.view().signedIn) return;
      const selected = allReports.find(row => row.key === key);
      if (!selected) return; // Only this session's loaded list can select a report; server rereads authority.
      cancel(); const version = serial;
      publish({ detail: { phase: 'loading', title: selected.title } });
      const result = await deps.transport.report(selected, abort.signal);
      if (!live(version)) return;
      if (!result.ok) { fail(result.failure, version); return; }
      publish({ detail: { phase: 'ready', report: result.value } });
    },
    back() { if (current.workspace === 'library' && current.detail) { cancel(); publish({ detail: null }); } },
    dispose() { disposed = true; offShell(); offSession(); clear(); listeners.clear(); },
  };
  watch(); return port;
}
