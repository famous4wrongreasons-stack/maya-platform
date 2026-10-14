import { useEffect, useRef, useState } from 'react';
import type { WorkspaceReadsPort, WorkspaceReadsView } from '../../../maya-chat-shell/src/shell/workspace-reads.ts';

type DialogRef = HTMLDialogElement | null;
type ButtonRef = HTMLButtonElement | null;

/** Presentation preferences only; the existing read owner retains layout/order and the list. */
export function LibraryViewMenu({ view, port }: {
  readonly view: WorkspaceReadsView;
  readonly port: Pick<WorkspaceReadsPort, 'layout' | 'order'>;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<DialogRef>(null), opener = useRef<ButtonRef>(null);
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open) {
      sheet.showModal();
      sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    } else if (sheet.open) {
      sheet.close();
      opener.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return <div className="companion-library-tools">
    <span className="companion-read-meta">{view.layout === 'list' ? 'Список' : 'Сетка'} · {view.order === 'recent' ? 'По дате' : 'По названию'}</span>
    <button ref={opener} type="button" className="companion-circle" aria-label="Вид библиотеки" aria-haspopup="dialog" onClick={() => setOpen(true)}><span aria-hidden="true">☷</span></button>
    <dialog ref={dialog} className="companion-library-menu" aria-labelledby="maya-library-view-title" aria-modal="true"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape') event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = controls.indexOf(document.activeElement as HTMLButtonElement);
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === controls.length - 1))) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
        }
      }}>
      <div className="companion-report-handle" aria-hidden="true"><span /></div>
      <div className="companion-library-menu-heading"><h2 id="maya-library-view-title" tabIndex={-1}>Вид библиотеки</h2>
        <button type="button" className="companion-circle" aria-label="Закрыть вид библиотеки" onClick={() => setOpen(false)}>×</button></div>
      <p className="companion-library-menu-description">Как показывать сохранённые отчёты.</p>
      <div role="group" aria-label="Вид отчётов">
        <button type="button" aria-label="Список" aria-pressed={view.layout === 'list'} onClick={() => port.layout('list')}>Список<span aria-hidden="true">{view.layout === 'list' ? '✓' : ''}</span></button>
        <button type="button" aria-label="Сетка" aria-pressed={view.layout === 'grid'} onClick={() => port.layout('grid')}>Сетка<span aria-hidden="true">{view.layout === 'grid' ? '✓' : ''}</span></button>
      </div>
      <div role="group" aria-label="Порядок отчётов">
        <button type="button" aria-label="По дате" disabled={view.phase !== 'ready'} aria-pressed={view.order === 'recent'} onClick={() => port.order('recent')}>По дате<span aria-hidden="true">{view.order === 'recent' ? '✓' : ''}</span></button>
        <button type="button" aria-label="По названию" disabled={view.phase !== 'ready'} aria-pressed={view.order === 'title'} onClick={() => port.order('title')}>По названию<span aria-hidden="true">{view.order === 'title' ? '✓' : ''}</span></button>
      </div>
      <button type="button" className="companion-library-menu-done" onClick={() => setOpen(false)}>Готово</button>
    </dialog>
  </div>;
}
