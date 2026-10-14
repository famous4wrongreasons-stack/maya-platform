import { useEffect, useRef, useState } from 'react';
import type { OwnTasksPort, OwnTasksView } from '../../../maya-chat-shell/src/shell/own-tasks.ts';
type HeadingRef = HTMLHeadingElement | null;
const due = (value: string): string => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

/** Current-user layout; gestures go to A23 through runtime, never optimistic state. */
export function OwnTasksPanel({ view, port, close }: { readonly view: OwnTasksView; readonly port: Pick<OwnTasksPort, 'filter' | 'refresh' | 'create' | 'complete' | 'retryCommand'>; readonly close: () => void }) {
  const heading = useRef<HeadingRef>(null), add = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null), titleInput = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false), [title, setTitle] = useState(''), [detail, setDetail] = useState('');
  const busy = view.command?.phase === 'pending' || view.command?.phase === 'unknown';
  const closeForm = () => {
    setCreating(false); setTitle(''); setDetail('');
    window.requestAnimationFrame(() => {
      const target = add.current;
      if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
      else heading.current?.focus({ preventScroll: true });
    });
  };
  useEffect(() => { if (creating) { dialog.current?.showModal(); titleInput.current?.focus(); } else dialog.current?.close(); }, [creating]);
  useEffect(() => { if (creating && view.command?.phase === 'confirmed') closeForm(); }, [view.command]);
  const commandNotice = view.command ? <div className="companion-task-command" role="status"><p>{view.command.message}</p>{view.command.phase === 'unknown' ? <button type="button" disabled={view.phase !== 'ready'} onClick={() => void port.retryCommand()}>Повторить ту же операцию</button> : null}</div> : null;
  useEffect(() => { const frame = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(frame); }, []);
  return <section className="companion-tasks" aria-labelledby="maya-tasks-heading" aria-busy={view.phase === 'loading'}
    onKeyDown={event => { if (event.key === 'Escape' && !creating) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="companion-tasks-heading"><h2 ref={heading} id="maya-tasks-heading" tabIndex={-1}>Мои задачи</h2>
      <button type="button" className="companion-circle" aria-label="Вернуться к разговору" onClick={close}>×</button></div>
    {view.canCreate ? <button ref={add} type="button" className="companion-task-add" disabled={busy || view.phase !== 'ready'} onClick={() => setCreating(true)}>Новая задача +</button> : null}
    {creating ? <dialog ref={dialog} className="companion-task-dialog" aria-modal="true" aria-labelledby="new-task-title" aria-describedby="new-task-scope"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); closeForm(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') ?? []);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === controls.length - 1))) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
        }
      }}>
      <div className="companion-report-handle" aria-hidden="true"><span /></div>
      <header className="companion-task-sheet-heading">
        <h2 id="new-task-title">Новая задача</h2><button type="button" className="companion-circle" aria-label="Закрыть новую задачу" onClick={closeForm}>×</button>
        <p id="new-task-scope">Для вас · без срока</p>
      </header>
      <div className="companion-task-fields">
        <label>Название<input ref={titleInput} id="maya-new-task-name" type="text" maxLength={160} required disabled={busy} value={title} onChange={event => setTitle(event.target.value)} placeholder="Например, подготовить расписание" /></label>
        <label>Что нужно сделать?<textarea id="maya-new-task-detail" maxLength={4000} required disabled={busy} value={detail} onChange={event => setDetail(event.target.value)} placeholder="Добавьте детали задачи" /></label>
        {commandNotice}
        <button className="companion-task-add" type="button" onClick={() => void port.create(title, detail)} disabled={busy || !title.trim() || !detail.trim() || view.phase !== 'ready' || !view.canCreate}>Создать задачу +</button>
      </div>
    </dialog> : null}
    {!creating ? commandNotice : null}
    <p className="companion-tasks-subtitle">Шаг за шагом — к тому, что важно.</p>
    <p className="companion-tasks-scope">Задачи, назначенные вам. Этот экран показывает сохранённое состояние.</p>
    <div className="companion-task-filters" role="group" aria-label="Статус задач">
      <button type="button" aria-pressed={view.filter === 'active'} disabled={view.phase !== 'ready'} onClick={() => port.filter('active')}>В работе{view.phase === 'ready' ? ' · ' + view.activeCount : ''}</button>
      <button type="button" aria-pressed={view.filter === 'done'} disabled={view.phase !== 'ready'} onClick={() => port.filter('done')}>Готово{view.phase === 'ready' ? ' · ' + view.doneCount : ''}</button>
    </div>
    <p role="status" className="companion-tasks-status">{view.phase === 'loading' ? 'Загружаю ваши задачи…' : view.phase === 'failed' ? view.notice : view.possiblyCapped ? 'Показаны 50 последних задач. Более ранние задачи могут не попасть в список; счётчики относятся только к загруженным.' : view.phase === 'ready' ? 'Счётчики относятся к загруженному списку.' : ''}</p>
    {view.phase === 'ready' && view.rows.length === 0 ? <div className="companion-tasks-empty"><h2>{view.possiblyCapped ? 'В этой части списка задач нет' : view.filter === 'done' ? 'Завершённых задач пока нет' : 'Сейчас нет задач в работе'}</h2><p>Можно вернуться к разговору с Maya.</p></div> : null}
    <ul className="companion-task-list">{view.rows.map(row => <li key={row.key}>
      {view.completable?.includes(row.key) && !row.completed ? <button type="button" className="companion-task-mark" aria-label={'Завершить: ' + row.title} disabled={busy || view.phase !== 'ready'} onClick={() => void port.complete(row.key)} /> : <span className={'companion-task-mark' + (row.completed ? ' is-done' : '')} aria-hidden="true">{row.completed ? '✓' : ''}</span>}
      <div><h2>{row.title}</h2><span className="vh">{row.completed ? 'Завершена' : 'В работе'}</span><p>{row.detail}</p>
        {row.dueAt ? <p className="companion-task-date">Срок: {due(row.dueAt)} UTC</p> : null}</div>
    </li>)}</ul>
    <div className="companion-tasks-footer"><button type="button" disabled={view.phase === 'loading' || view.retryAt !== null || view.command?.phase === 'pending'} onClick={() => void port.refresh()}>Обновить список</button>
      <button type="button" onClick={close}>К разговору с Maya ↗</button></div>
  </section>;
}
