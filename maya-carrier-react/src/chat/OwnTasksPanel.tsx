import { useEffect, useRef } from 'react';
import type { OwnTasksPort, OwnTasksView } from '../../../maya-chat-shell/src/shell/own-tasks.ts';
type HeadingRef = HTMLHeadingElement | null;
const due = (value: string): string => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

/** Owner-supplied Tasks layout over current-user READ. No completion checkbox or action authority. */
export function OwnTasksPanel({ view, port, close }: { readonly view: OwnTasksView; readonly port: Pick<OwnTasksPort, 'filter' | 'refresh'>; readonly close: () => void }) {
  const heading = useRef<HeadingRef>(null);
  useEffect(() => { const frame = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(frame); }, []);
  return <section className="companion-tasks" aria-labelledby="maya-tasks-heading" aria-busy={view.phase === 'loading'}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="companion-tasks-heading"><h2 ref={heading} id="maya-tasks-heading" tabIndex={-1}>Мои задачи</h2>
      <button type="button" className="companion-circle" aria-label="Вернуться к разговору" onClick={close}>×</button></div>
    <p className="companion-tasks-subtitle">Шаг за шагом — к тому, что важно.</p>
    <p className="companion-tasks-scope">Задачи, назначенные вам. Этот экран показывает сохранённое состояние.</p>
    <div className="companion-task-filters" role="group" aria-label="Статус задач">
      <button type="button" aria-pressed={view.filter === 'active'} disabled={view.phase !== 'ready'} onClick={() => port.filter('active')}>В работе{view.phase === 'ready' ? ' · ' + view.activeCount : ''}</button>
      <button type="button" aria-pressed={view.filter === 'done'} disabled={view.phase !== 'ready'} onClick={() => port.filter('done')}>Готово{view.phase === 'ready' ? ' · ' + view.doneCount : ''}</button>
    </div>
    <p role="status" className="companion-tasks-status">{view.phase === 'loading' ? 'Загружаю ваши задачи…' : view.phase === 'failed' ? view.notice : view.possiblyCapped ? 'Показаны 50 последних задач. Более ранние задачи могут не попасть в список; счётчики относятся только к загруженным.' : view.phase === 'ready' ? 'Счётчики относятся к загруженному списку.' : ''}</p>
    {view.phase === 'ready' && view.rows.length === 0 ? <div className="companion-tasks-empty"><h2>{view.possiblyCapped ? 'В этой части списка задач нет' : view.filter === 'done' ? 'Завершённых задач пока нет' : 'Сейчас нет задач в работе'}</h2><p>Можно вернуться к разговору с Maya.</p></div> : null}
    <ul className="companion-task-list">{view.rows.map(row => <li key={row.key}>
      <span className={'companion-task-mark' + (row.completed ? ' is-done' : '')} aria-hidden="true">{row.completed ? '✓' : ''}</span>
      <div><h2>{row.title}</h2><span className="vh">{row.completed ? 'Завершена' : 'В работе'}</span><p>{row.detail}</p>
        {row.dueAt ? <p className="companion-task-date">Срок: {due(row.dueAt)} UTC</p> : null}</div>
    </li>)}</ul>
    <div className="companion-tasks-footer"><button type="button" disabled={view.phase === 'loading' || view.retryAt !== null} onClick={() => void port.refresh()}>Обновить список</button>
      <button type="button" onClick={close}>К разговору с Maya ↗</button></div>
  </section>;
}
