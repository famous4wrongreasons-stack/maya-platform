import { useEffect, useRef, useState } from 'react';
import { ownAppointments, personalBooking } from '../runtime/compose.ts';
import { usePortView } from '../runtime/useView.ts';
import type { Tokens } from '../identity/tokens.ts';
import { PersonalBooking } from '../widgets/PersonalBooking.tsx';
import type { OwnAppointment } from '../../../maya-chat-shell/src/net/types.ts';

const canceled = (status: string) => ['canceled', 'cancelled'].includes(status);
const when = (start: string, timezone: string | null) => new Intl.DateTimeFormat('ru', {
  timeZone: timezone ?? 'UTC', dateStyle: 'long', timeStyle: 'short',
}).format(new Date(start)) + (timezone === null ? ' UTC' : '');
function Summary({ row }: { readonly row: OwnAppointment }) {
  return <><p>{row.serviceNames.join(', ') || 'Услуга из записи'} · {row.staffName}</p>
    <p>{when(row.start, row.timezone)}</p></>;
}
/** Existing personal form and canonical own-appointment owners; no model, role switch or widget forgery. */
export function OwnAppointmentsSheet({ t }: { readonly t: Tokens }) {
  const v = usePortView(ownAppointments), create = usePortView(personalBooking);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [creating, setCreating] = useState(false);
  const locked = v.busy || (creating && create.busy);
  useEffect(() => {
    if (v.open) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else { dialog.current?.close(); setCreating(false); personalBooking.closeDirect(); }
  }, [v.open]);
  const close = () => { if (!locked) { personalBooking.closeDirect(); ownAppointments.close(); } };
  return <dialog ref={dialog} className="companion-menu" aria-label="Мои записи" aria-modal="true"
    style={{ width: 'min(calc(100vw - 24px), 560px)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}
    onCancel={e => { e.preventDefault(); close(); }}>
    <div className="companion-menu-heading"><h2>Мои записи</h2>
      <button type="button" className="companion-circle" aria-label="Закрыть мои записи" disabled={locked} onClick={close}>×</button></div>
    <p>Ваши личные записи. Бизнес-роль не меняется.</p>
    <div>
      <button type="button" className="companion-menu-row" disabled={locked} onClick={() => { personalBooking.closeDirect(); setCreating(false); void ownAppointments.refresh(); }}>Обновить записи</button>
      {!creating ? <button type="button" className="companion-menu-row" disabled={locked || v.blocked.length > 0} onClick={() => { setCreating(true); personalBooking.openDirect(); }}>Записаться</button>
        : <button type="button" className="companion-menu-row" disabled={locked} onClick={() => { personalBooking.closeDirect(); setCreating(false); void ownAppointments.refresh(); }}>Вернуться к моим записям</button>}
    </div>
    {creating ? <PersonalBooking t={t} /> : <>
      <p role="status" aria-live="polite">{v.notice}</p>
      {v.phase === 'list' ? <div aria-label="Список личных записей">
        {!v.busy && !v.rows.length ? <p>У вас пока нет записей в Maya.</p> : null}
        {v.rows.map(row => <section key={row.id} style={{ padding: '16px 0', borderBottom: '1px solid currentColor' }}>
          <Summary row={row} />
          <p>{canceled(row.status) ? 'Отменена' : Date.parse(row.start) <= Date.now() ? 'Прошедшая запись' : 'Предстоящая запись'}</p>
          {!canceled(row.status) && Date.parse(row.start) > Date.now() ? <div>
            <button type="button" className="companion-menu-row" disabled={locked || v.blocked.includes(row.id)} onClick={() => ownAppointments.move(row.id)}>Перенести</button>
            <button type="button" className="companion-menu-row" disabled={locked || v.blocked.includes(row.id)} onClick={() => ownAppointments.cancel(row.id)}>Отменить запись</button>
          </div> : null}
        </section>)}
      </div> : v.selected ? <section aria-label="Подтверждение изменения записи">
        <Summary row={v.selected} />
        {v.phase === 'reschedule' ? <>
          <label>Новая дата (ГГГГ-ММ-ДД)<input type="text" placeholder="ГГГГ-ММ-ДД" maxLength={10} value={v.date} disabled={locked} onChange={e => ownAppointments.date(e.target.value)} style={{ display: 'block', padding: 12, fontSize: 16, width: '100%', boxSizing: 'border-box' }} /></label>
          <button type="button" className="companion-menu-row" disabled={locked || !v.date} onClick={() => void ownAppointments.slots()}>Показать свободное время</button>
          {v.slots.map((slot, index) => <button key={slot.start} type="button" className="companion-menu-row" disabled={locked} onClick={() => ownAppointments.choose(index)}>{when(slot.start, v.selected!.timezone)}</button>)}
        </> : v.phase === 'confirm_move' ? <>
          <p>Новое время: {when(v.start, v.selected.timezone)}</p>
          <button type="button" className="companion-menu-row" disabled={locked} onClick={() => void ownAppointments.confirmMove()}>Подтвердить перенос</button>
        </> : <button type="button" className="companion-menu-row" disabled={locked} onClick={() => void ownAppointments.confirmCancel()}>Да, отменить эту запись</button>}
        <button type="button" className="companion-menu-row" disabled={locked} onClick={() => ownAppointments.back()}>Оставить без изменений</button>
      </section> : null}
    </>}
  </dialog>;
}
