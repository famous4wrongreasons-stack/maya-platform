import { useEffect, useRef, useState } from 'react';
import type { WorkspaceReadsPort, WorkspaceReadsView } from '../../../maya-chat-shell/src/shell/workspace-reads.ts';

/** Local presentation of the existing unread filter; never an acknowledgement or subscription. */
export function FeedFilterMenu({ view, port }: {
  readonly view: WorkspaceReadsView;
  readonly port: Pick<WorkspaceReadsPort, 'filterUnread'>;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null), opener = useRef<HTMLButtonElement | null>(null);
  const ready = view.workspace === 'feed' && view.phase === 'ready';
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open && !sheet.open) {
      sheet.showModal();
      sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    } else if (!open && sheet.open) {
      sheet.close();
      opener.current?.focus({ preventScroll: true });
    }
  }, [open]);
  const choose = (unread: boolean): void => {
    if (!ready) return;
    if (unread !== view.unreadOnly) port.filterUnread(unread);
    setOpen(false);
  };
  return <div className="companion-library-tools companion-feed-tools">
    <span className="companion-feed-filter-summary">{view.unreadOnly ? 'Непрочитанные' : 'Все'} · из загруженной ленты</span>
    <button ref={opener} type="button" className="companion-circle" aria-label="Настроить ленту" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <span className="companion-filter-icon" aria-hidden="true"><span /><span /></span>
    </button>
    <dialog ref={dialog} className="companion-library-menu companion-feed-filter-sheet" aria-labelledby="maya-feed-filter-title" aria-modal="true"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape') event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = controls.indexOf(document.activeElement as HTMLButtonElement);
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === controls.length - 1))) {
          event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
        }
      }}>
      <div className="companion-report-handle" aria-hidden="true"><span /></div>
      <div className="companion-library-menu-heading"><h2 id="maya-feed-filter-title" tabIndex={-1}>Ваша лента</h2>
        <button type="button" className="companion-circle" aria-label="Закрыть настройки ленты" onClick={() => setOpen(false)}>×</button></div>
      <p className="companion-library-menu-description">Что показывать из загруженных уведомлений.</p>
      <div role="group" aria-label="Уведомления">
        <button type="button" aria-label="Все" aria-pressed={!view.unreadOnly} disabled={!ready} onClick={() => choose(false)}>Все<span aria-hidden="true">{!view.unreadOnly ? '✓' : ''}</span></button>
        <button type="button" aria-label="Непрочитанные" aria-pressed={view.unreadOnly} disabled={!ready} onClick={() => choose(true)}>Непрочитанные<span aria-hidden="true">{view.unreadOnly ? '✓' : ''}</span></button>
      </div>
      {!ready ? <p role="status" className="companion-library-menu-description">{view.phase === 'loading' ? 'Сначала дождёмся загрузки ленты.' : 'Фильтр будет доступен после успешной загрузки списка.'}</p> : null}
      <p className="companion-feed-filter-note">{view.possiblyCapped ? 'Загружены 50 последних уведомлений. ' : ''}Фильтр относится только к загруженной части ленты. Просмотр не отмечает уведомления прочитанными.</p>
    </dialog>
  </div>;
}
