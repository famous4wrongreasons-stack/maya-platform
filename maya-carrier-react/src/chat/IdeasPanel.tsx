import { useEffect, useRef } from 'react';
import type { IdeasView, IdeasPort } from '../../../maya-chat-shell/src/shell/ideas.ts';
import type { IdeaRead } from '../../../maya-chat-shell/src/net/types.ts';
const titles = { OBSERVED_VALUE: 'Что показывают факты', POLICY_SIGNAL: 'Проверка по правилу салона', PREDICTION: 'Прогноз пока недоступен', SCENARIO: 'Условный сценарий', RANKING: 'Сравнение по заданному правилу' };
const scopes = { client: 'Отдельный клиент', appointment: 'Отдельная запись', staff: 'Сотрудник', tenant: 'Салон', branch: 'Филиал', cohort: 'Группа' };
const coverage = { COMPLETE: 'Полные данные в пределах расчёта', PARTIAL: 'Часть данных отсутствует', UNAVAILABLE: 'Данные недоступны', NOT_MEASURED: 'Данные не измерены' };
const qualification = { VERIFIED: 'Основание проверено', SOURCE_LABELLED: 'Сведения с отметкой источника', UNQUALIFIED: 'Основание не подтверждено' };
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) + ' UTC';
const status = (row: IdeaRead) => row.available && row.current ? 'Доступен при последней проверке' : 'Сейчас недоступен';
/** Source inspection only. No inferred recommendations, numerical forecast or plan writer. */
export function IdeasPanel({ view, port, close }: { readonly view: IdeasView; readonly port: Pick<IdeasPort, 'refresh' | 'read' | 'back'>; readonly close: () => void }) {
  const heading = useRef<HTMLHeadingElement | null>(null), detail = view.detail;
  useEffect(() => { const f = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(f); }, [view.phase, detail]);
  return <section className="companion-ideas" aria-labelledby="maya-ideas-heading" aria-busy={view.phase === 'loading'} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (detail || view.reading) port.back(); else close(); } }}>
    <div className="companion-tasks-heading"><h2 id="maya-ideas-heading" ref={heading} tabIndex={-1}>{detail ? 'О расчёте' : 'Идеи'}</h2><button type="button" className="companion-circle" aria-label="Вернуться к разговору" onClick={close}>×</button></div>
    <p className="companion-tasks-subtitle">Сначала разберёмся в данных.</p>
    <p role="status" className="companion-tasks-status">{view.phase === 'loading' ? view.reading ? 'Проверяю доступность расчёта…' : 'Загружаю расчёты…' : view.notice}</p>
    {detail ? <article className="companion-idea-detail">
      <button type="button" className="companion-read-back" onClick={() => port.back()}>← К расчётам</button>
      <h3>{titles[detail.kind]}</h3><p className="companion-read-meta">{scopes[detail.scope]} · {status(detail)}</p>
      <p>{detail.message}</p>
      <div className="companion-idea-facts"><p className="companion-idea-label">Данные на</p><p>{date(detail.asOf)}</p><p className="companion-idea-label">Период</p><p>{date(detail.from)} — {date(detail.to)}</p><p className="companion-idea-label">Часовой пояс расчёта</p><p>{detail.timezone}</p><p className="companion-idea-label">Полнота</p><p>{coverage[detail.coverage]}</p><p className="companion-idea-label">Основание</p><p>{qualification[detail.qualification]}</p><p className="companion-idea-label">Срок просмотра</p><p>До {date(detail.expiresAt)}</p></div>
      <p className="companion-tasks-scope">Это сведения о сохранённом расчёте. Числовые значения, имена и контакты здесь не показаны. Расчёт не даёт разрешения на сообщения клиентам или другие действия.</p>
    </article> : <>
      <p className="companion-tasks-scope">Здесь можно проверить основание и актуальность сохранённых расчётов. Готовые рекомендации и планы действий пока не подключены.</p>
      <h3 className="companion-ideas-label">ОСНОВА ДЛЯ РЕШЕНИЙ</h3>
      {view.phase === 'ready' && !view.rows.length && !view.notice ? <div className="companion-tasks-empty"><h3>Пока нет доступных расчётов</h3><p>Когда появятся сохранённые результаты, вы сможете посмотреть их здесь.</p></div> : null}
      <ul className="companion-ideas-list">{view.rows.map(row => <li key={row.key}><span className="companion-idea-icon" aria-hidden="true">◇</span><div><p className="companion-read-meta">{scopes[row.scope]} · {status(row)}</p><h3>{titles[row.kind]}</h3><p>{row.message}</p><p className="companion-read-meta">{coverage[row.coverage]} · {date(row.asOf)}</p><button type="button" onClick={() => void port.read(row.key)}>Посмотреть основание <span aria-hidden="true">↗</span></button></div></li>)}</ul>
      {view.phase === 'ready' ? <p className="companion-tasks-scope">{view.possiblyCapped ? 'Это часть списка.' : 'В показанной части списка больше результатов нет.'} Показаны доступные расчёты из последних 25 результатов; часть может быть скрыта из-за ограничений доступа или актуальности. Список не обновляется сам.</p> : null}
    </>}
    <div className="companion-tasks-footer"><button type="button" disabled={view.phase === 'loading' || view.retryAt !== null} onClick={() => void port.refresh()}>Обновить расчёты</button><button type="button" onClick={close}>К разговору с Maya ↗</button></div>
  </section>;
}
