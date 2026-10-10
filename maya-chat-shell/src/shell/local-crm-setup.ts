// Opt-in local A17 adapter. Presentation never grants tenant, role or provider authority.
import type { CrmSetupConnection, CrmSetupFailure, CrmSetupInput, CrmSetupTransport, PersonalBranch } from '../net/types.ts';
import type { SessionPort } from './ports.ts';
export interface LocalCrmSetupView {
  readonly phase: 'idle' | 'loading' | 'ready' | 'staging' | 'uncertain' | 'blocked';
  readonly busy: boolean; readonly branches: readonly PersonalBranch[];
  readonly connection: CrmSetupConnection | null; readonly notice: string;
  readonly stagedCounts: { readonly services: number | null; readonly staff: number | null } | null;
}
export interface LocalCrmSetupPort {
  view(): LocalCrmSetupView; subscribe(listener: (v: LocalCrmSetupView) => void): () => void;
  load(): Promise<void>; stage(input: CrmSetupInput, confirmed: boolean): Promise<void>;
  close(): void; dispose(): void;
}
const empty = (): LocalCrmSetupView => ({ phase: 'idle', busy: false, branches: [], connection: null, notice: '', stagedCounts: null });
const same = (a: CrmSetupConnection | null, b: CrmSetupConnection | null): boolean => a === null || b === null ? a === b :
  a.id === b.id && a.tenantId === b.tenantId && a.updatedAt === b.updatedAt && a.provider === b.provider && a.status === b.status && a.hasCredentials === b.hasCredentials && a.companyId === b.companyId && a.branchId === b.branchId;
const uncertain = 'Результат действия не подтверждён. Проверьте состояние подключения. Автоматического повтора не будет.';
export function createLocalCrmSetup(deps: {
  readonly enabled: boolean; readonly transport: CrmSetupTransport;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly newAbort: () => AbortController; readonly newId: () => string;
}): LocalCrmSetupPort {
  let current = empty(), serial = 0, abort = deps.newAbort(), disposed = false;
  // Held across close/signout. A status snapshot is not a terminal A17 operation receipt.
  let writeUnresolved = false;
  const listeners = new Set<(v: LocalCrmSetupView) => void>();
  const publish = (patch: Partial<LocalCrmSetupView>) => { current = { ...current, ...patch }; for (const listener of listeners) listener(current); };
  const allowed = () => deps.enabled && !disposed && deps.session.view().signedIn;
  const active = (version: number) => version === serial && allowed() && !abort.signal.aborted;
  const reset = () => { serial++; abort.abort(); abort = deps.newAbort(); current = empty(); publish(writeUnresolved ? { phase: 'uncertain', notice: uncertain } : {}); };
  const fail = (failure: CrmSetupFailure) => {
    if (failure.reason === 'forbidden') { current = empty(); publish({ phase: 'blocked', notice: 'Доступ к настройке подключения не подтверждён. Войдите с правами владельца или администратора.' }); }
    else publish({ busy: false, phase: failure.reason === 'uncertain' ? 'uncertain' : 'blocked', stagedCounts: null, notice: failure.reason === 'uncertain' ? uncertain : 'Не удалось подтвердить актуальное подключение. Проверьте состояние перед продолжением.' });
  };
  // Re-read the existing owner just before a write. A changed connection requires a new review.
  const fresh = async (version: number, expected: CrmSetupConnection | null, branchId: string): Promise<boolean> => {
    const status = await deps.transport.crmSetupStatus(abort.signal);
    if (!active(version)) return false;
    if (!status.ok) { fail(status.failure); return false; }
    if (!same(expected, status.value.connection)) { current = empty(); publish({ phase: 'blocked', notice: 'Подключение изменилось. Загрузите его снова и проверьте компанию и филиал.' }); return false; }
    const branches = await deps.transport.personalBranches(abort.signal);
    if (!active(version)) return false;
    if (!branches.ok || !branches.value.some((b) => b.id === branchId)) { fail({ reason: 'unavailable' }); return false; }
    publish({ branches: branches.value });
    return true;
  };
  const stopSession = deps.session.subscribe(() => reset());
  return {
    view: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      if (!allowed() || current.busy) return;
      const version = serial;
      publish({ phase: 'loading', busy: true, connection: null, branches: [], stagedCounts: null, notice: '' });
      try {
        const status = await deps.transport.crmSetupStatus(abort.signal);
        if (!active(version)) return;
        if (!status.ok) { fail(status.failure); return; }
        const branches = await deps.transport.personalBranches(abort.signal);
        if (!active(version)) return;
        if (!branches.ok) { fail({ reason: 'unavailable' }); return; }
        publish({ phase: writeUnresolved ? 'uncertain' : 'ready', busy: false, connection: status.value.connection, branches: branches.value, notice: writeUnresolved ? uncertain : 'Показано сохранённое подключение. Проверка доступа к YCLIENTS ещё не выполнялась.' });
      } catch { if (active(version)) fail({ reason: 'unavailable' }); }
    },
    async stage(input, confirmed) {
      if (!allowed() || writeUnresolved || current.busy || current.phase !== 'ready' || !confirmed || (current.connection !== null && current.connection.provider !== 'yclients')) return;
      const companyId = input.companyId.trim();
      if (!/^[1-9]\d{0,15}$/.test(companyId) || !Number.isSafeInteger(Number(companyId)) || !current.branches.some((b) => b.id === input.branchId) || !input.apiToken.trim() || input.apiToken.length > 4096) {
        publish({ notice: 'Укажите пользовательский токен, корректный ID компании и доступный филиал.' }); return;
      }
      const version = serial, previous = current.connection;
      let sent = false;
      publish({ phase: 'staging', busy: true, stagedCounts: null, notice: '' });
      try {
        if (!await fresh(version, previous, input.branchId)) return;
        sent = true;
        writeUnresolved = true;
        const result = await deps.transport.crmSetupStage({ apiToken: input.apiToken, companyId, branchId: input.branchId }, deps.newId(), abort.signal);
        if (!active(version)) return;
        if (!result.ok) { fail(result.failure); return; }
        const connection = result.value.connection;
        if (!connection || connection.provider !== 'yclients' || connection.status !== 'pending_activation' || !connection.hasCredentials || connection.companyId !== companyId || connection.branchId !== input.branchId || (previous !== null && connection.tenantId !== previous.tenantId)) { fail({ reason: 'uncertain' }); return; }
        writeUnresolved = false;
        publish({ phase: 'ready', busy: false, connection, stagedCounts: result.value.counts, notice: 'Подключение сохранено. Активация и импорт требуют отдельного подтверждения.' });
      } catch { if (active(version)) fail({ reason: sent ? 'uncertain' : 'unavailable' }); }
    },
    close: reset,
    dispose() { disposed = true; stopSession(); reset(); listeners.clear(); },
  };
}
