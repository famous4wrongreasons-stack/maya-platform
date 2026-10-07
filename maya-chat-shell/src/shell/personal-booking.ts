// A request-local personal form, mounted only after the existing bound-detail admission.
// No writer, session switch, model history, timer, retry or persistent client store.
import type { PersonalChoice, PersonalSlot, PersonalPreview, PersonalResults, PersonalSelection, PersonalTransport, PersonalFailure } from '../net/types.ts';
import type { SessionPort, WidgetPort } from './ports.ts';
export interface PersonalBookingView {
  readonly phase: 'closed' | 'loading' | 'choose' | 'slots' | 'preview' | 'submitting' | 'outcome' | 'unavailable';
  readonly busy: boolean;
  readonly services: readonly PersonalChoice[]; readonly staff: readonly PersonalChoice[];
  readonly serviceId: string; readonly staffId: string; readonly date: string;
  readonly slots: readonly PersonalSlot[]; readonly preview: PersonalPreview | null;
  readonly results: PersonalResults | null; readonly notice: string;
}
export interface PersonalBookingPort {
  view(): PersonalBookingView; subscribe(listener: (v: PersonalBookingView) => void): () => void;
  chooseService(id: string): void; chooseStaff(id: string): void; date(value: string): void;
  slots(): Promise<void>; preview(index: number): Promise<void>; confirm(): Promise<void>;
  refresh(): Promise<void>; dispose(): void;
}
const empty = (): PersonalBookingView => ({ phase: 'closed', busy: false, services: [], staff: [], serviceId: '', staffId: '', date: '', slots: [], preview: null, results: null, notice: '' });
const uncertain = 'Результат записи пока не подтверждён. Повторно запрос не отправляем. Можно проверить сохранённый результат.';
const message = (failure: PersonalFailure) => failure.reason === 'forbidden' ? 'Личная запись недоступна: подтверждённая связь или доступ изменились.' : failure.reason === 'conflict' ? 'Предложение изменилось. Проверьте записи и выберите время заново.' : 'Не удалось прочитать актуальные данные. Запись не подтверждена.';
export function createPersonalBooking(deps: { transport: PersonalTransport; widgets: Pick<WidgetPort, 'view' | 'subscribe'>; session: Pick<SessionPort, 'view' | 'subscribe'>; newAbort: () => AbortController }): PersonalBookingPort {
  let current = empty(), item: string | null = null, serial = 0, abort = deps.newAbort();
  let selection: PersonalSelection | null = null;
  const listeners = new Set<(v: PersonalBookingView) => void>();
  const publish = (patch: Partial<PersonalBookingView>) => { current = { ...current, ...patch }; for (const listener of listeners) listener(current); };
  const active = (version: number) => serial === version && item !== null && !abort.signal.aborted && deps.session.view().signedIn;
  const reset = () => { serial++; abort.abort(); abort = deps.newAbort(); item = null; selection = null; current = empty(); publish({}); };
  const fail = (failure: PersonalFailure) => { selection = null; current = empty(); publish({ phase: 'unavailable', notice: message(failure) }); };
  const open = async () => {
    const version = serial, signal = abort.signal;
    publish({ phase: 'loading', busy: true });
    const results = await deps.transport.personalResults(signal);
    if (!active(version)) return;
    if (!results.ok) { fail(results.failure); return; }
    publish({ results: results.value });
    if (results.value.hasPending) { publish({ phase: 'outcome', busy: false, notice: uncertain }); return; }
    // Reads are finite and serial. Public choices carry no personal authority.
    const services = await deps.transport.personalServices(signal);
    if (!active(version)) return;
    if (!services.ok) { fail(services.failure); return; }
    const staff = await deps.transport.personalStaff(signal);
    if (!active(version)) return;
    if (!staff.ok) { fail(staff.failure); return; }
    publish({ phase: 'choose', busy: false, services: services.value, staff: staff.value, notice: 'Запись для вашего подтверждённого клиентского профиля. Роль в компании не меняется.' });
  };
  const watch = () => {
    const view = deps.widgets.view().fullscreen;
    const next = deps.session.view().signedIn && view?.phase === 'open' && view.receiver === 'personal_booking' ? view.itemId : null;
    if (item === next) return;
    reset();
    if (next !== null) { item = next; void open(); }
  };
  const offWidgets = deps.widgets.subscribe(watch), offSession = deps.session.subscribe(watch);
  const editable = () => item !== null && !current.busy && ['choose', 'slots', 'preview'].includes(current.phase);
  const invalidate = (patch: Partial<PersonalBookingView>) => { selection = null; publish({ ...patch, phase: 'choose', slots: [], preview: null, notice: '' }); };
  const refresh = async () => {
    if (item === null || current.busy || !['outcome', 'unavailable'].includes(current.phase)) return;
    const version = serial;
    publish({ busy: true });
    const results = await deps.transport.personalResults(abort.signal);
    if (!active(version)) return;
    if (!results.ok) { fail(results.failure); return; }
    publish({ phase: 'outcome', busy: false, results: results.value, notice: results.value.hasPending ? uncertain : 'Показаны сохранённые результаты. Новый запрос не отправлялся.' });
  };
  const port: PersonalBookingPort = {
    view: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    chooseService(id) { if (editable() && current.services.some((s) => s.id === id)) invalidate({ serviceId: id }); },
    chooseStaff(id) { if (editable() && current.staff.some((s) => s.id === id)) invalidate({ staffId: id }); },
    date(value) { if (editable()) invalidate({ date: value.slice(0, 10) }); },
    async slots() {
      if (!editable() || !current.serviceId || !current.staffId || !/^\d{4}-\d{2}-\d{2}$/.test(current.date)) return;
      const day = Date.parse(current.date + 'T00:00:00Z');
      if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== current.date) { publish({ notice: 'Введите существующую дату в формате ГГГГ-ММ-ДД.' }); return; }
      const version = serial;
      selection = null; publish({ busy: true, preview: null, slots: [] });
      const result = await deps.transport.personalSlots(current.date, current.serviceId, current.staffId, abort.signal);
      if (!active(version)) return;
      if (!result.ok) { fail(result.failure); return; }
      const slots = result.value.filter((slot) => slot.staffId === current.staffId);
      publish({ phase: 'slots', busy: false, slots, notice: slots.length ? 'Время ниже указано в UTC. Часовой пояс салона будет показан в предложении.' : 'Доступных окон на выбранную дату нет.' });
    },
    async preview(index) {
      if (current.phase !== 'slots' || current.busy || !Number.isInteger(index)) return;
      const slot = current.slots[index]; if (!slot) return;
      const version = serial;
      const proposed: PersonalSelection = { staffId: slot.staffId, serviceIds: [current.serviceId], start: slot.start, ...(slot.branchId === null ? {} : { branchId: slot.branchId }) };
      publish({ busy: true });
      const result = await deps.transport.personalPreview(proposed, abort.signal);
      if (!active(version)) return;
      if (!result.ok) { fail(result.failure); return; }
      if (result.value.existing) { publish({ phase: 'outcome', busy: false, notice: 'Такой запрос уже сохранён. Проверьте его результат.' }); await refresh(); return; }
      if (Date.parse(result.value.start) !== Date.parse(proposed.start) || result.value.timezone === null) { fail({ reason: 'unavailable' }); return; }
      selection = proposed; publish({ phase: 'preview', busy: false, preview: result.value, notice: 'Окно проверено на момент предложения. Запись появится только после подтверждённого результата.' });
    },
    async confirm() {
      if (current.phase !== 'preview' || current.busy || selection === null || current.preview === null) return;
      const frozen = selection, version = serial;
      // Consume the local confirmation before any await. A second tap cannot dispatch.
      selection = null; publish({ phase: 'submitting', busy: true, notice: 'Отправляю запись…' });
      const created = await deps.transport.personalCreate(frozen, abort.signal);
      if (!active(version)) return;
      if (!created.ok && created.failure.reason !== 'unknown') { fail(created.failure); return; }
      // Correlate through the canonical selection/idempotency owner. Another tab's
      // successful action in the result page must never confirm this selection.
      const exact = await deps.transport.personalPreview(frozen, abort.signal);
      if (!active(version)) return;
      if (!exact.ok && exact.failure.reason === 'forbidden') { fail(exact.failure); return; }
      const confirmed = exact.ok && exact.value.existing && exact.value.requestState === 'SUCCEEDED' && Date.parse(exact.value.start) === Date.parse(frozen.start);
      const results = await deps.transport.personalResults(abort.signal);
      if (!active(version)) return;
      if (!results.ok && results.failure.reason === 'forbidden') { fail(results.failure); return; }
      publish({ phase: 'outcome', busy: false, ...(results.ok ? { results: results.value } : {}), notice: confirmed ? 'Запись подтверждена.' : uncertain });
    },
    refresh,
    dispose() { offWidgets(); offSession(); reset(); listeners.clear(); },
  };
  watch();
  return port;
}
