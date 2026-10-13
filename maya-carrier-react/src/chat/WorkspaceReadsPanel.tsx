import { useEffect, useRef } from 'react';
import type { WorkspaceReadsPort, WorkspaceReadsView } from '../../../maya-chat-shell/src/shell/workspace-reads.ts';
type HeadingRef = HTMLHeadingElement | null;
const date = (v: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
const period = (v: string) => v.slice(8, 10) + '.' + v.slice(5, 7) + '.' + v.slice(0, 4);
const reportLabel = (type: string) => type === 'daily_report' ? 'Отчёт за день' : type === 'morning_owner' ? 'Утренний обзор' : 'План на день';

/** Companion reference layout over retained reads, not a WidgetDetail or a model context. */
export function WorkspaceReadsPanel({ view, port, close }: { readonly view: WorkspaceReadsView; readonly port: Pick<WorkspaceReadsPort, 'refresh' | 'filterUnread' | 'layout' | 'order' | 'read' | 'back' | 'markRead'>; readonly close: () => void }) {
  const heading = useRef<HeadingRef>(null), detail = view.detail;
  const wasMarking = useRef(false);
  useEffect(() => {
    if (view.markingRead) wasMarking.current = true;
    else if (wasMarking.current) { wasMarking.current = false; heading.current?.focus({ preventScroll: true }); }
  }, [view.markingRead]);
  const feed = view.workspace === 'feed';
  useEffect(() => { const frame = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(frame); }, [view.workspace, detail?.phase]);
  return <section className="companion-reads" aria-labelledby="maya-reads-heading" aria-busy={view.phase === 'loading' || detail?.phase === 'loading' || view.markingRead !== null}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (detail) port.back(); else close(); } }}>
    <div className="companion-tasks-heading"><h2 ref={heading} id="maya-reads-heading" tabIndex={-1}>{detail ? 'Сохранённый отчёт' : feed ? 'Лента' : 'Библиотека'}</h2>
      <button type="button" className="companion-circle" aria-label="Вернуться к разговору" onClick={close}>×</button></div>
    {detail ? <div className="companion-report-reader">
      <button type="button" className="companion-read-back" onClick={() => port.back()}>← К списку отчётов</button>
      {detail.phase === 'loading' ? <p role="status">Открываю отчёт…</p> : <>
        <p className="companion-read-meta">{reportLabel(detail.report.type)} · {period(detail.report.period)} · {detail.report.timezone}</p>
        <h2>{detail.report.title}</h2><p className="companion-report-body">{detail.report.body}</p>
      </>}
    </div> : <>
      <p className="companion-tasks-subtitle">{feed ? 'То, что стоит держать под рукой.' : 'Важное остаётся рядом.'}</p>
      <p className="companion-tasks-scope">{feed ? 'Ваши сохранённые уведомления. Отметить прочитанным можно кнопкой под уведомлением.' : 'Отчёты, доступные вам из последних 100 сохранённых отчётов салона. Более ранние материалы могут не попасть в список.'}</p>
      {feed ? <div className="companion-task-filters" role="group" aria-label="Уведомления">
        <button type="button" aria-pressed={!view.unreadOnly} disabled={view.phase !== 'ready'} onClick={() => port.filterUnread(false)}>Все</button>
        <button type="button" aria-pressed={view.unreadOnly} disabled={view.phase !== 'ready'} onClick={() => port.filterUnread(true)}>Непрочитанные</button>
      </div> : <div className="companion-library-tools">
        <div role="group" aria-label="Вид отчётов"><button type="button" aria-pressed={view.layout === 'list'} onClick={() => port.layout('list')}>Список</button><button type="button" aria-pressed={view.layout === 'grid'} onClick={() => port.layout('grid')}>Сетка</button></div>
        <div role="group" aria-label="Порядок отчётов"><button type="button" disabled={view.phase !== 'ready'} aria-pressed={view.order === 'recent'} onClick={() => port.order('recent')}>По дате</button><button type="button" disabled={view.phase !== 'ready'} aria-pressed={view.order === 'title'} onClick={() => port.order('title')}>По названию</button></div>
      </div>}
      <p role="status" className="companion-tasks-status">{view.phase === 'loading' ? 'Загружаю…' : view.phase === 'failed' ? view.notice : [view.notice, view.phase === 'ready' && feed && view.possiblyCapped ? 'Показана часть ленты: 50 последних уведомлений. Фильтр относится только к загруженным.' : ''].filter(Boolean).join(' ')}</p>
      {view.phase === 'ready' && (feed ? view.feed.length === 0 : view.reports.length === 0) ? <div className="companion-tasks-empty"><h2>{feed ? view.unreadOnly ? 'В этой части ленты нет непрочитанных' : 'В этой части ленты пока пусто' : 'В этой части библиотеки нет доступных отчётов'}</h2><p>{feed && view.unreadOnly ? 'Переключитесь на «Все», чтобы увидеть прочитанные уведомления.' : 'Здесь появятся сохранённые материалы, доступные вашему аккаунту.'}</p></div> : null}
      {feed ? <ul className="companion-feed-list">{view.feed.map(row => <li key={row.key}>
        <div className="companion-read-meta"><span className={'companion-feed-dot' + (row.unread ? ' is-unread' : '')} aria-hidden="true" />{row.unread ? 'Не прочитано' : 'Прочитано'} · {date(row.createdAt)} UTC</div>
        <h2>{row.title}</h2><p className="companion-feed-body">{row.body}</p>
        {row.unread ? <button type="button" className="companion-read-back" disabled={view.markingRead !== null || view.phase !== 'ready'} onClick={() => void port.markRead(row.key)}>Отметить прочитанным</button> : null}
      </li>)}</ul> : <ul className={'companion-report-list' + (view.layout === 'grid' ? ' is-grid' : '')}>{view.reports.map(row => <li key={row.key}>
        <button type="button" onClick={() => void port.read(row.key)}><span className="companion-report-icon" aria-hidden="true">▤</span><span className="companion-report-info"><span className="companion-report-title">{row.title}</span><span className="companion-read-meta">{reportLabel(row.type)} · {period(row.period)}</span></span><span aria-hidden="true">↗</span></button>
      </li>)}</ul>}
      <div className="companion-tasks-footer"><button type="button" disabled={view.phase === 'loading' || view.markingRead !== null || view.retryAt !== null} onClick={() => void port.refresh()}>Обновить список</button><button type="button" onClick={close}>К разговору с Maya ↗</button></div>
    </>}
  </section>;
}
