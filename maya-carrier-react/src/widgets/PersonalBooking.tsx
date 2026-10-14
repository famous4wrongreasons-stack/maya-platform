import { useEffect, useRef } from 'react';
// Presentation of a fixed transient runtime port. No fetch, authority or history writer.
import { personalBooking } from '../runtime/compose.ts';
import { usePortView } from '../runtime/useView.ts';
import type { Tokens } from '../identity/tokens.ts';
import { widgetTheme } from '../identity/widgetTheme.ts';
const stateText = (state: string) => state === 'SUCCEEDED' ? 'Запись подтверждена' : state === 'FAILED' || state === 'NOT_EXECUTED' ? 'Запись не выполнена' : 'Результат пока не подтверждён';
export function PersonalBooking({ t }: { readonly t: Tokens }) {
  const v = usePortView(personalBooking), c = widgetTheme(t);
  const companion = t.name === 'companion';
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (v.phase === 'preview' || v.phase === 'outcome' || v.phase === 'unavailable') { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'nearest' }); }
  }, [v.phase]);
  if (v.phase === 'closed') return null;
  const choosing = ['choose', 'slots'].includes(v.phase);
  const branch = v.branches.find((item) => item.id === v.branchId);
  const slotTimezone = branch?.timezone ?? 'UTC';
  return <section className={companion ? 'personal-booking companion-personal-booking' : 'personal-booking'} aria-label="Личная запись" style={{ padding: companion ? undefined : 20, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 16, lineHeight: companion ? undefined : 1.5, fontFamily: companion ? undefined : '-apple-system, BlinkMacSystemFont, sans-serif' }}>
    <h2 ref={heading} tabIndex={-1} style={{ fontSize: companion ? undefined : 21, margin: companion ? undefined : '0 0 12px' }}>Запись для себя</h2>
    <p className="personal-notice" role="status">{v.notice || 'Читаю актуальные данные…'}</p>
    {choosing ? <div>
      {v.branches.length ? <div>
        <h3>Филиал</h3>
        <div>{v.branches.map((item) => <button key={item.id} type="button" data-personal-control aria-pressed={v.branchId === item.id} disabled={v.busy} onClick={() => personalBooking.chooseBranch(item.id)} style={{ margin: companion ? undefined : 4, padding: companion ? undefined : 12, border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>{item.name}{item.timezone ? ` · ${item.timezone}` : ''}</button>)}</div>
      </div> : null}
      <h3>Услуга</h3>
      <div>{v.services.map((service) => <button key={service.id} type="button" data-personal-control aria-pressed={v.serviceId === service.id} disabled={v.busy} onClick={() => personalBooking.chooseService(service.id)} style={{ margin: companion ? undefined : 4, padding: companion ? undefined : 12, border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>{service.name}</button>)}</div>
      <h3>Мастер</h3>
      <div>{v.staff.map((staff) => <button key={staff.id} type="button" data-personal-control aria-pressed={v.staffId === staff.id} disabled={v.busy} onClick={() => personalBooking.chooseStaff(staff.id)} style={{ margin: companion ? undefined : 4, padding: companion ? undefined : 12, border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>{staff.name}</button>)}</div>
      <label>Дата (ГГГГ-ММ-ДД)<input type="text" data-personal-control value={v.date} placeholder="2026-10-15" maxLength={10} disabled={v.busy} onChange={(event) => personalBooking.date(event.target.value)} style={{ display: companion ? undefined : 'block', padding: companion ? undefined : 12, fontSize: companion ? undefined : 16, margin: companion ? undefined : '8px 0', border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontFamily: companion ? undefined : 'inherit' }} /></label>
      <button type="button" data-personal-control disabled={v.busy || (v.branches.length > 0 && !v.branchId) || (!!v.branchId && !branch) || !v.serviceId || !v.staffId || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)} onClick={() => void personalBooking.slots()} style={{ padding: companion ? undefined : 12, border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>Показать свободное время</button>
    </div> : null}
    {v.phase === 'slots' ? <div className="personal-slots">{v.slots.map((slot, index) => <button key={`${slot.start}:${slot.staffId}:${slot.branchId}`} type="button" data-personal-control disabled={v.busy} onClick={() => void personalBooking.preview(index)} style={{ margin: companion ? undefined : 4, padding: companion ? undefined : 12, border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>{new Intl.DateTimeFormat('ru', { timeZone: slotTimezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(slot.start))} ({slotTimezone})</button>)}</div> : null}
    {v.phase === 'preview' && v.preview ? <div className="personal-preview" aria-label="Предложение записи">
      <h3>Проверьте запись</h3>
      {branch ? <p>Филиал: {branch.name}</p> : null}
      <button type="button" data-personal-control className="personal-change" disabled={v.busy} onClick={() => personalBooking.chooseService(v.serviceId)} style={{ padding: companion ? undefined : 8, border: companion ? undefined : 'none', background: companion ? undefined : 'transparent', color: companion ? undefined : c.muted, fontSize: companion ? undefined : 14, fontFamily: companion ? undefined : 'inherit' }}>Изменить выбор</button>
      {v.preview.services.map((service, index) => <p key={index}>{service.name} · {service.price === null || service.currency === null ? 'Стоимость не указана' : `${service.price} ${service.currency}`} · {service.durationMinutes === null ? 'Длительность не указана' : `${service.durationMinutes} мин`}</p>)}
      <p>{v.preview.staff}</p>
      <p>{new Intl.DateTimeFormat('ru', { timeZone: v.preview.timezone ?? 'UTC', dateStyle: 'long', timeStyle: 'short' }).format(new Date(v.preview.start))} ({v.preview.timezone})</p>
      <p>Источник: {v.preview.source === 'internal' ? 'календарь MAYA' : 'CRM'}. Проверено: {new Intl.DateTimeFormat('ru', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v.preview.asOf))} UTC.</p>
      <button type="button" data-personal-control className="personal-confirm" disabled={v.busy} onClick={() => void personalBooking.confirm()} style={{ padding: companion ? undefined : 14, border: companion ? undefined : 'none', borderRadius: companion ? undefined : 24, background: companion ? undefined : c.invBg, color: companion ? undefined : c.invText, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>Подтвердить личную запись</button>
    </div> : null}
    {v.phase === 'outcome' || v.phase === 'unavailable' ? <div>
      {v.results?.results.map((result) => <p key={result.id}>{stateText(result.state)} · {new Intl.DateTimeFormat('ru', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.recordedAt))} UTC</p>)}
      {v.results?.hasMore ? <p>Показаны последние 20 запросов.</p> : null}
      <button type="button" data-personal-control disabled={v.busy} onClick={() => void personalBooking.refresh()} style={{ padding: companion ? undefined : 12, border: companion ? undefined : '1px solid ' + c.line, borderRadius: companion ? undefined : 12, background: companion ? undefined : c.surf2, color: companion ? undefined : c.ink, fontSize: companion ? undefined : 15, fontFamily: companion ? undefined : 'inherit' }}>Проверить результат</button>
    </div> : null}
  </section>;
}
