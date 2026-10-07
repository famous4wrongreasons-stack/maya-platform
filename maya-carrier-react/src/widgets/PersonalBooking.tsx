import { useEffect, useRef } from 'react';
// Presentation of a fixed transient runtime port. No fetch, authority or history writer.
import { personalBooking } from '../runtime/compose.ts';
import { usePortView } from '../runtime/useView.ts';
import type { Tokens } from '../identity/tokens.ts';
import { widgetTheme } from '../identity/widgetTheme.ts';
const stateText = (state: string) => state === 'SUCCEEDED' ? 'Запись подтверждена' : state === 'FAILED' || state === 'NOT_EXECUTED' ? 'Запись не выполнена' : 'Результат пока не подтверждён';
export function PersonalBooking({ t }: { readonly t: Tokens }) {
  const v = usePortView(personalBooking), c = widgetTheme(t);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (v.phase === 'preview' || v.phase === 'outcome' || v.phase === 'unavailable') { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'nearest' }); }
  }, [v.phase]);
  if (v.phase === 'closed') return null;
  const choosing = ['choose', 'slots'].includes(v.phase);
  const branch = v.branches.find((item) => item.id === v.branchId);
  const slotTimezone = branch?.timezone ?? 'UTC';
  return <section aria-label="Личная запись" style={{ padding: 20, color: c.ink, fontSize: 16, lineHeight: 1.5, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
    <h2 ref={heading} tabIndex={-1} style={{ fontSize: 21, margin: '0 0 12px' }}>Запись для себя</h2>
    <p role="status">{v.notice || 'Читаю актуальные данные…'}</p>
    {choosing ? <div>
      {v.branches.length ? <div>
        <h3>Филиал</h3>
        <div>{v.branches.map((item) => <button key={item.id} type="button" data-personal-control aria-pressed={v.branchId === item.id} disabled={v.busy} onClick={() => personalBooking.chooseBranch(item.id)} style={{ margin: 4, padding: 12, border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontSize: 15, fontFamily: 'inherit' }}>{item.name}{item.timezone ? ` · ${item.timezone}` : ''}</button>)}</div>
      </div> : null}
      <h3>Услуга</h3>
      <div>{v.services.map((service) => <button key={service.id} type="button" data-personal-control aria-pressed={v.serviceId === service.id} disabled={v.busy} onClick={() => personalBooking.chooseService(service.id)} style={{ margin: 4, padding: 12, border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontSize: 15, fontFamily: 'inherit' }}>{service.name}</button>)}</div>
      <h3>Мастер</h3>
      <div>{v.staff.map((staff) => <button key={staff.id} type="button" data-personal-control aria-pressed={v.staffId === staff.id} disabled={v.busy} onClick={() => personalBooking.chooseStaff(staff.id)} style={{ margin: 4, padding: 12, border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontSize: 15, fontFamily: 'inherit' }}>{staff.name}</button>)}</div>
      <label>Дата (ГГГГ-ММ-ДД)<input type="text" data-personal-control value={v.date} placeholder="2026-10-15" maxLength={10} disabled={v.busy} onChange={(event) => personalBooking.date(event.target.value)} style={{ display: 'block', padding: 12, fontSize: 16, margin: '8px 0', border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontFamily: 'inherit' }} /></label>
      <button type="button" data-personal-control disabled={v.busy || (v.branches.length > 0 && !v.branchId) || !v.serviceId || !v.staffId || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)} onClick={() => void personalBooking.slots()} style={{ padding: 12, border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontSize: 15, fontFamily: 'inherit' }}>Показать свободное время</button>
    </div> : null}
    {v.phase === 'slots' ? <div>{v.slots.map((slot, index) => <button key={`${slot.start}:${slot.staffId}:${slot.branchId}`} type="button" data-personal-control disabled={v.busy} onClick={() => void personalBooking.preview(index)} style={{ margin: 4, padding: 12, border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontSize: 15, fontFamily: 'inherit' }}>{new Intl.DateTimeFormat('ru', { timeZone: slotTimezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(slot.start))} ({slotTimezone})</button>)}</div> : null}
    {v.phase === 'preview' && v.preview ? <div aria-label="Предложение записи">
      <h3>Проверьте запись</h3>
      {branch ? <p>Филиал: {branch.name}</p> : null}
      <button type="button" data-personal-control disabled={v.busy} onClick={() => personalBooking.chooseService(v.serviceId)} style={{ padding: 8, border: 'none', background: 'transparent', color: c.muted, fontSize: 14, fontFamily: 'inherit' }}>Изменить выбор</button>
      {v.preview.services.map((service, index) => <p key={index}>{service.name} · {service.price === null || service.currency === null ? 'Стоимость не указана' : `${service.price} ${service.currency}`} · {service.durationMinutes === null ? 'Длительность не указана' : `${service.durationMinutes} мин`}</p>)}
      <p>{v.preview.staff}</p>
      <p>{new Intl.DateTimeFormat('ru', { timeZone: v.preview.timezone ?? 'UTC', dateStyle: 'long', timeStyle: 'short' }).format(new Date(v.preview.start))} ({v.preview.timezone})</p>
      <p>Источник: {v.preview.source === 'internal' ? 'календарь MAYA' : 'CRM'}. Проверено: {new Intl.DateTimeFormat('ru', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v.preview.asOf))} UTC.</p>
      <button type="button" data-personal-control disabled={v.busy} onClick={() => void personalBooking.confirm()} style={{ padding: 14, border: 'none', borderRadius: 24, background: c.invBg, color: c.invText, fontSize: 15, fontFamily: 'inherit' }}>Подтвердить личную запись</button>
    </div> : null}
    {v.phase === 'outcome' || v.phase === 'unavailable' ? <div>
      {v.results?.results.map((result) => <p key={result.id}>{stateText(result.state)} · {new Intl.DateTimeFormat('ru', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.recordedAt))} UTC</p>)}
      {v.results?.hasMore ? <p>Показаны последние 20 запросов.</p> : null}
      <button type="button" data-personal-control disabled={v.busy} onClick={() => void personalBooking.refresh()} style={{ padding: 12, border: '1px solid ' + c.line, borderRadius: 12, background: c.surf2, color: c.ink, fontSize: 15, fontFamily: 'inherit' }}>Проверить результат</button>
    </div> : null}
  </section>;
}
