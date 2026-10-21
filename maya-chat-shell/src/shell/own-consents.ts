import type { OwnConsent, OwnConsentsTransport } from '../net/types.ts';
import type { SessionPort, WidgetPort, Scheduler } from './ports.ts';

export interface OwnConsentsView {
  readonly phase: 'closed' | 'loading' | 'ready' | 'failed' | 'expired';
  readonly consents: readonly OwnConsent[];
  readonly asOf: string | null;
  readonly notice: string;
  readonly retryAt: number | null;
}
export interface OwnConsentsPort {
  view(): OwnConsentsView;
  subscribe(listener: (value: OwnConsentsView) => void): () => void;
  refresh(): Promise<void>;
  dispose(): void;
}
const empty = (): OwnConsentsView => ({ phase: 'closed', consents: [], asOf: null, notice: '', retryAt: null });

/** First-party Privacy & Data read. No subject selector, stored receipts, automatic
 * retry, consent mutation, export control or lifetime beyond this login/route. */
export function createOwnConsents(deps: {
  transport: OwnConsentsTransport;
  session: Pick<SessionPort, 'view' | 'subscribe'>;
  shell: Pick<WidgetPort, 'view' | 'subscribe'>;
  scheduler: Pick<Scheduler, 'now' | 'after'>;
  newAbort: () => AbortController;
}): OwnConsentsPort {
  let current = empty(), active = false, disposed = false, serial = 0;
  let abort = deps.newAbort(), cancelTimer: (() => void) | null = null;
  const listeners = new Set<(value: OwnConsentsView) => void>();
  const publish = (patch: Partial<OwnConsentsView>) => { current = { ...current, ...patch }; for (const fn of [...listeners]) fn(current); };
  const reset = () => { serial++; abort.abort(); abort = deps.newAbort(); cancelTimer?.(); cancelTimer = null; current = empty(); publish({}); };
  const refresh = async () => {
    if (!active || disposed || current.phase === 'loading' || !deps.session.view().signedIn || current.retryAt !== null && current.retryAt > deps.scheduler.now()) return;
    reset(); const version = serial, owned = abort;
    publish({ phase: 'loading' });
    if (!active || disposed || version !== serial || owned.signal.aborted) return;
    const result = await deps.transport.ownConsents(owned.signal).catch(() => ({ ok: false as const, failure: { reason: 'unavailable' as const } }));
    if (!active || disposed || version !== serial || owned.signal.aborted || !deps.session.view().signedIn) return;
    if (!result.ok) {
      const limited = result.failure.reason === 'rate_limited';
      const retryAt = limited ? deps.scheduler.now() + result.failure.retryAfterSec * 1000 : null;
      publish({ phase: 'failed', retryAt, notice: result.failure.reason === 'forbidden' ? 'Согласия доступны только для подтверждённого профиля клиента.' : limited ? 'Запросы слишком частые. Обновите немного позже.' : 'Не удалось получить подтверждённые сведения о согласиях.' });
      if (retryAt !== null) cancelTimer = deps.scheduler.after(Math.max(0, retryAt - deps.scheduler.now()), () => { if (version === serial && active) publish({ retryAt: null }); });
      return;
    }
    const value = result.value, remaining = Date.parse(value.expiresAt) - deps.scheduler.now();
    if (remaining <= 0 || remaining > 300_000 || Date.parse(value.asOf) > deps.scheduler.now()) { publish({ phase: 'failed', notice: 'Срок актуальности сведений не подтверждён. Обновите данные.' }); return; }
    publish({ phase: 'ready', consents: value.consents, asOf: value.asOf });
    if (!active || disposed || version !== serial) return;
    cancelTimer = deps.scheduler.after(remaining, () => {
      if (version === serial && active) publish({ phase: 'expired', consents: [], asOf: null, notice: 'Сведения могли измениться. Обновите данные.' });
    });
  };
  const watch = () => {
    const shown = deps.session.view().signedIn && deps.shell.view().primary === 'shell.privacy';
    if (shown === active) return;
    active = shown; reset(); if (active) void refresh();
  };
  const offShell = deps.shell.subscribe(watch);
  const offSession = deps.session.subscribe(() => { active = false; reset(); watch(); });
  watch();
  return { view: () => current, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }, refresh,
    dispose() { disposed = true; active = false; offShell(); offSession(); reset(); listeners.clear(); },
  };
}
