import type { OwnAppointment, OwnAppointmentsTransport, PersonalFailure, PersonalSlot, PersonalTransport } from '../net/types.ts';
import type { SessionPort } from './ports.ts';

export interface OwnAppointmentsView {
  readonly open: boolean; readonly busy: boolean;
  readonly phase: 'list' | 'cancel' | 'reschedule' | 'confirm_move';
  readonly rows: readonly OwnAppointment[]; readonly selected: OwnAppointment | null;
  readonly date: string; readonly slots: readonly PersonalSlot[]; readonly start: string;
  readonly notice: string; readonly blocked: readonly string[];
}
const empty = (): OwnAppointmentsView => ({ open: false, busy: false, phase: 'list', rows: [], selected: null, date: '', slots: [], start: '', notice: '', blocked: [] });
const canceled = (r: OwnAppointment) => ['canceled', 'cancelled'].includes(r.status);
const same = (a: OwnAppointment, b: OwnAppointment) => a.id === b.id && a.updatedAt === b.updatedAt && a.start === b.start && a.status === b.status;
const uncertain = 'Ответ не получен. Действие повторно не отправляем. Нажмите «Обновить записи», чтобы проверить результат.';
const failureText = (f: PersonalFailure) => f.reason === 'forbidden' ? 'Нет доступа к личным записям. Проверьте вход в свой аккаунт.' : f.reason === 'conflict' ? 'Запись или свободное время изменились. Обновите записи и выберите время заново.' : f.reason === 'unknown' ? uncertain : 'Не удалось получить подтверждение. Запись не считаем изменённой.';

export function createOwnAppointments(deps: {
  transport: OwnAppointmentsTransport & Pick<PersonalTransport, 'personalSlots'>;
  session: Pick<SessionPort, 'view' | 'subscribe'>; newId(): string; newAbort(): AbortController;
}) {
  let state = empty(), epoch = 0, abort = deps.newAbort();
  const listeners = new Set<(v: OwnAppointmentsView) => void>();
  const pending = new Map<string, { kind: 'cancel' | 'move'; start: string }>();
  const emit = (patch: Partial<OwnAppointmentsView>) => { state = { ...state, ...patch, blocked: [...pending.keys()] }; for (const l of listeners) l(state); };
  const current = (n: number) => n === epoch && state.open && deps.session.view().signedIn && !abort.signal.aborted;
  const reset = () => { epoch++; abort.abort(); abort = deps.newAbort(); state = empty(); emit({}); };
  const off = deps.session.subscribe(v => { if (!v.signedIn) { pending.clear(); reset(); } });
  async function refresh() {
    if (!state.open || state.busy) return;
    const n = epoch; emit({ busy: true });
    const result = await deps.transport.ownAppointments(abort.signal);
    if (!current(n)) return;
    if (!result.ok) { emit({ busy: false, notice: failureText(result.failure) }); return; }
    let confirmed = false;
    for (const [id, expected] of pending) {
      const row = result.value.find(r => r.id === id);
      if (row && (expected.kind === 'cancel' ? canceled(row) : Date.parse(row.start) === Date.parse(expected.start))) { pending.delete(id); confirmed = true; }
    }
    emit({ busy: false, rows: result.value, phase: 'list', selected: null, slots: [], start: '',
      notice: confirmed ? 'Изменение подтверждено в сохранённой записи.' : pending.size ? uncertain : 'Ваши записи обновлены.' });
  }
  const selectable = (id: string) => !state.busy && state.open && !pending.has(id) && state.rows.find(r => r.id === id && !canceled(r) && Date.parse(r.start) > Date.now());
  async function confirm(kind: 'cancel' | 'move') {
    const selected = state.selected;
    if (!selected || !selectable(selected.id) || (kind === 'cancel' ? state.phase !== 'cancel' : state.phase !== 'confirm_move' || !state.start)) return;
    const start = state.start, n = epoch;
    // Consume this gesture synchronously, before the read or write can yield.
    emit({ busy: true, notice: 'Проверяю выбранную запись…' });
    const before = await deps.transport.ownAppointments(abort.signal);
    if (!current(n)) return;
    const fresh = before.ok ? before.value.find(r => r.id === selected.id) : undefined;
    if (!fresh || !same(selected, fresh)) {
      emit({ busy: false, phase: 'list', selected: null, ...(before.ok ? { rows: before.value } : {}), notice: before.ok ? 'Запись изменилась. Проверьте её перед подтверждением.' : failureText(before.failure) }); return;
    }
    const key = deps.newId();
    pending.set(selected.id, { kind, start });
    emit({ notice: kind === 'cancel' ? 'Отменяю запись…' : 'Переношу запись…' });
    const result = kind === 'cancel' ? await deps.transport.ownCancel(selected.id, key, abort.signal) : await deps.transport.ownReschedule(selected.id, start, key, abort.signal);
    if (!current(n)) return;
    if (result.ok) pending.delete(selected.id);
    else if (result.failure.reason !== 'unknown') pending.delete(selected.id);
    emit({ busy: false, phase: 'list', selected: null, slots: [], start: '', notice: result.ok ? kind === 'cancel' ? 'Запись отменена.' : 'Запись перенесена.' : failureText(result.failure) });
    // A read cannot resend the mutation. Preserve explicit outcome wording.
    if (result.ok) { const notice = state.notice; await refresh(); if (current(n)) emit({ notice }); }
  }
  return {
    view: () => state,
    subscribe(l: (v: OwnAppointmentsView) => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    open() { if (!deps.session.view().signedIn || state.busy) return; reset(); emit({ open: true }); void refresh(); },
    close() { if (!state.busy) reset(); },
    refresh,
    cancel(id: string) { const row = selectable(id); if (row) emit({ phase: 'cancel', selected: row, notice: 'Проверьте запись перед отменой.' }); },
    move(id: string) { const row = selectable(id); if (row) emit({ phase: 'reschedule', selected: row, date: '', start: '', slots: [], notice: 'Выберите новую дату и свободное время. Услуги и мастер сохраняются.' }); },
    back() { if (!state.busy) emit({ phase: 'list', selected: null, start: '', slots: [], notice: '' }); },
    date(value: string) { if (!state.busy && state.phase === 'reschedule') emit({ date: value.slice(0, 10), slots: [], start: '' }); },
    async slots() {
      const row = state.selected, day = Date.parse(state.date + 'T00:00:00Z');
      if (state.busy || state.phase !== 'reschedule' || !row || !row.serviceIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(state.date) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== state.date) return;
      const n = epoch; emit({ busy: true, slots: [] });
      const result = await deps.transport.personalSlots(state.date, row.serviceIds.join(','), row.staffId, abort.signal, row.branchId ?? undefined);
      if (!current(n)) return;
      const slots = result.ok ? result.value.filter(s => s.staffId === row.staffId && s.branchId === row.branchId && Date.parse(s.start) > Date.now()) : [];
      emit({ busy: false, slots, notice: result.ok ? slots.length ? 'Выберите новое время.' : 'Свободного времени на эту дату нет.' : failureText(result.failure) });
    },
    choose(index: number) { const slot = Number.isInteger(index) ? state.slots[index] : null; if (!state.busy && state.phase === 'reschedule' && slot) emit({ phase: 'confirm_move', start: slot.start, notice: 'Подтвердите перенос на выбранное время.' }); },
    confirmCancel: () => confirm('cancel'), confirmMove: () => confirm('move'),
    dispose() { off(); pending.clear(); reset(); listeners.clear(); },
  };
}
