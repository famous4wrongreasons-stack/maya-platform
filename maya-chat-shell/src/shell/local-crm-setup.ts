// The local A17 adapter holds only display state; existing AE receipts own operation outcomes.
import type { CrmSetupConnection, CrmSetupFailure, CrmSetupInput, CrmSetupTransport, PersonalBranch, CrmOperationLocator, CrmOperationStatus, CrmSetupCompletion } from '../net/types.ts';
import type { SessionPort } from './ports.ts';
export interface CrmPendingLocator {
  read(): CrmOperationLocator | 'invalid' | null;
  save(locator: CrmOperationLocator): boolean;
  clear(locator: CrmOperationLocator): boolean;
}
export interface LocalCrmSetupView {
  readonly phase: 'idle' | 'loading' | 'ready' | 'staging' | 'activating' | 'uncertain' | 'blocked';
  readonly busy: boolean; readonly branches: readonly PersonalBranch[];
  readonly connection: CrmSetupConnection | null; readonly notice: string;
  readonly stagedCounts: { readonly services: number | null; readonly staff: number | null } | null;
  readonly operation: CrmOperationStatus | null;
  readonly canStage: boolean; readonly canActivate: boolean; readonly resuming: boolean;
}
export interface LocalCrmSetupPort {
  view(): LocalCrmSetupView; subscribe(listener: (v: LocalCrmSetupView) => void): () => void;
  load(): Promise<void>; stage(input: CrmSetupInput, confirmed: boolean): Promise<void>;
  activate(confirmed: boolean): Promise<void>; close(): void; dispose(): void;
}
const empty = (): LocalCrmSetupView => ({ phase: 'idle', busy: false, branches: [], connection: null, notice: '', stagedCounts: null, operation: null, canStage: false, canActivate: false, resuming: false });
const same = (a: CrmSetupConnection | null, b: CrmSetupConnection | null): boolean => a === null || b === null ? a === b :
  a.id === b.id && a.tenantId === b.tenantId && a.configVersion === b.configVersion && a.provider === b.provider && a.status === b.status && a.hasCredentials === b.hasCredentials && a.companyId === b.companyId && a.branchId === b.branchId;
const uncertain = 'Результат действия ещё не подтверждён. Проверьте сохранённую операцию. Автоматического повтора не будет.';
const sameLocator = (a: CrmOperationLocator, b: CrmOperationLocator) => a.operation === b.operation && a.requestId === b.requestId;
export function createLocalCrmSetup(deps: {
  readonly enabled: boolean; readonly transport: CrmSetupTransport;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly newAbort: () => AbortController; readonly newId: () => string;
  readonly pending: CrmPendingLocator;
}): LocalCrmSetupPort {
  let current = empty(), serial = 0, abort = deps.newAbort(), disposed = false;
  const listeners = new Set<(v: LocalCrmSetupView) => void>();
  const allowed = () => deps.enabled && !disposed && deps.session.view().signedIn;
  const locator = () => { try { return deps.pending.read(); } catch { return 'invalid' as const; } };
  const publish = (patch: Partial<LocalCrmSetupView>) => {
    current = { ...current, ...patch, canStage: false, canActivate: false, resuming: false };
    const pending = locator(), connection = current.connection, op = current.operation;
    const resume = pending !== null && pending !== 'invalid' && op?.status === 'READY' && sameLocator(pending, op);
    const eligible = allowed() && !current.busy && (current.phase === 'ready' || current.phase === 'uncertain') && (pending === null || resume);
    // Resuming uses the original key; the server compares immutable request material again.
    current = { ...current, resuming: resume,
      canStage: eligible && (pending === null || pending.operation === 'install') && (!connection || connection.provider === 'yclients'),
      canActivate: eligible && (pending === null || pending.operation === 'activate') && connection?.provider === 'yclients' && connection.hasCredentials && !!connection.companyId && !!connection.branchId && current.branches.some(b => b.id === connection.branchId) &&
        (connection.status === 'pending_activation' || (resume && connection.status === 'active')) && (!op?.receipt || op.receipt.configVersion === connection.configVersion),
    };
    for (const listener of listeners) listener(current);
  };
  const active = (version: number) => version === serial && allowed() && !abort.signal.aborted;
  const reset = () => { serial++; abort.abort(); abort = deps.newAbort(); current = empty(); publish({}); };
  const fail = (failure: CrmSetupFailure) => {
    if (failure.reason === 'forbidden') { current = empty(); publish({ phase: 'blocked', notice: 'Доступ к настройке подключения не подтверждён. Войдите с правами владельца или администратора.' }); }
    else publish({ busy: false, phase: locator() !== null ? 'uncertain' : 'blocked', stagedCounts: null, operation: null, notice: locator() !== null ? uncertain : 'Не удалось подтвердить актуальное подключение. Проверьте состояние перед продолжением.' });
  };
  const fresh = async (version: number, expected: CrmSetupConnection | null, branchId: string): Promise<boolean> => {
    const status = await deps.transport.crmSetupStatus(abort.signal);
    if (!active(version)) return false;
    if (!status.ok) { fail(status.failure); return false; }
    if (!same(expected, status.value.connection)) { current = empty(); publish({ phase: 'blocked', notice: 'Подключение изменилось. Загрузите его снова и проверьте компанию и филиал.' }); return false; }
    const branches = await deps.transport.personalBranches(abort.signal);
    if (!active(version)) return false;
    if (!branches.ok || !branches.value.some(b => b.id === branchId)) { fail({ reason: 'unavailable' }); return false; }
    publish({ branches: branches.value }); return active(version);
  };
  const begin = (operation: 'install' | 'activate'): CrmOperationLocator | null => {
    const pending = locator();
    if (pending === 'invalid') return null;
    if (pending !== null) return current.operation?.status === 'READY' && sameLocator(pending, current.operation) && pending.operation === operation ? pending : null;
    const next = { operation, requestId: deps.newId() };
    try { return deps.pending.save(next) ? next : null; } catch { return null; }
  };
  const complete = (value: CrmSetupCompletion, pending: CrmOperationLocator, previous: CrmSetupConnection | null, companyId: string, branchId: string) => {
    if (value.operation.status !== 'SUCCEEDED' || !sameLocator(pending, value.operation) || !value.operation.receipt) { fail({ reason: 'uncertain' }); return; }
    const connection = value.snapshot.connection;
    if ((previous && connection && (connection.tenantId !== previous.tenantId || connection.id !== previous.id)) ||
      (value.operation.current.matchesCurrentVersion && (!connection || connection.configVersion !== value.operation.receipt.configVersion || connection.provider !== 'yclients' || connection.companyId !== companyId || connection.branchId !== branchId))) { fail({ reason: 'uncertain' }); return; }
    try { if (!deps.pending.clear(pending)) { fail({ reason: 'uncertain' }); return; } } catch { fail({ reason: 'uncertain' }); return; }
    const matches = value.operation.current.matchesCurrentVersion && value.snapshot.connection?.configVersion === value.operation.receipt.configVersion;
    publish({ phase: matches ? 'ready' : 'blocked', busy: false, connection: value.snapshot.connection, operation: value.operation,
      stagedCounts: matches && pending.operation === 'install' ? value.snapshot.counts : null,
      notice: !matches ? 'Исходная операция завершена, но подключение уже изменилось. Проверьте его актуальное состояние.' : pending.operation === 'install' ? 'Подключение сохранено. Активация и импорт требуют отдельного подтверждения.' : 'Сервер подтвердил активацию и импорт этой версии подключения. Доступность записи проверяется отдельно.' });
  };
  const stopSession = deps.session.subscribe(() => reset());
  return {
    view: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      if (!allowed() || current.busy) return;
      const version = serial, pending = locator();
      if (pending === 'invalid') { publish({ phase: 'blocked', notice: 'Ссылка на незавершённую операцию повреждена. Новое действие недоступно.' }); return; }
      publish({ phase: 'loading', busy: true, connection: null, branches: [], stagedCounts: null, operation: null, notice: '' });
      try {
        let operation: CrmOperationStatus | null = null;
        if (pending) {
          const result = await deps.transport.crmSetupOperation(pending, abort.signal);
          if (!active(version)) return;
          if (!result.ok) { fail(result.failure); return; }
          operation = result.value;
          if (operation.status === 'SUCCEEDED') {
            if (!deps.pending.clear(pending)) { fail({ reason: 'uncertain' }); return; }
            if (!active(version)) return;
          }
        }
        const status = await deps.transport.crmSetupStatus(abort.signal);
        if (!active(version)) return;
        if (!status.ok) { fail(status.failure); return; }
        const branches = await deps.transport.personalBranches(abort.signal);
        if (!active(version)) return;
        if (!branches.ok) { fail({ reason: 'unavailable' }); return; }
        const unresolved = locator() !== null;
        publish({ phase: unresolved ? 'uncertain' : 'ready', busy: false, operation, connection: status.value.connection, branches: branches.value,
          notice: unresolved ? operation?.status === 'READY' ? 'Существующая операция ещё не завершена. Допустимо только явно продолжить её с теми же параметрами.' : uncertain : operation?.status === 'SUCCEEDED' ? 'Сохранённый результат исходной операции восстановлен. Показано текущее подключение.' : 'Показано сохранённое подключение. Проверка доступа к YCLIENTS ещё не выполнялась.' });
      } catch { if (active(version)) fail({ reason: 'unavailable' }); }
    },
    async stage(input, confirmed) {
      if (!current.canStage || !confirmed || !allowed()) return;
      const companyId = input.companyId.trim();
      if (!/^[1-9]\d{0,15}$/.test(companyId) || !Number.isSafeInteger(Number(companyId)) || !current.branches.some(b => b.id === input.branchId) || !input.apiToken.trim() || input.apiToken.length > 4096) { publish({ notice: 'Укажите пользовательский токен, корректный ID компании и доступный филиал.' }); return; }
      const version = serial, previous = current.connection;
      publish({ phase: 'staging', busy: true, stagedCounts: null, notice: '' });
      try {
        if (!await fresh(version, previous, input.branchId) || !active(version)) return;
        const pending = begin('install');
        if (!active(version)) return;
        if (!pending) { fail({ reason: 'unavailable' }); return; }
        const result = await deps.transport.crmSetupStage({ apiToken: input.apiToken, companyId, branchId: input.branchId, expectedVersion: previous?.configVersion ?? null }, pending.requestId, abort.signal);
        if (!active(version)) return;
        if (!result.ok) { fail(result.failure); return; }
        complete(result.value, pending, previous, companyId, input.branchId);
      } catch { if (active(version)) fail({ reason: 'uncertain' }); }
    },
    async activate(confirmed) {
      const previous = current.connection;
      if (!current.canActivate || !confirmed || !allowed() || !previous?.branchId) return;
      const version = serial;
      publish({ phase: 'activating', busy: true, notice: '' });
      try {
        if (!await fresh(version, previous, previous.branchId) || !active(version)) return;
        const pending = begin('activate');
        if (!active(version)) return;
        if (!pending) { fail({ reason: 'unavailable' }); return; }
        const result = await deps.transport.crmSetupActivate(previous.configVersion, pending.requestId, abort.signal);
        if (!active(version)) return;
        if (!result.ok) { fail(result.failure); return; }
        complete(result.value, pending, previous, previous.companyId!, previous.branchId);
      } catch { if (active(version)) fail({ reason: 'uncertain' }); }
    },
    close: reset,
    dispose() { disposed = true; stopSession(); reset(); listeners.clear(); },
  };
}
