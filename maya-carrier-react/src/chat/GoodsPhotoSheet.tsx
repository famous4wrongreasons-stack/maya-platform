import { useEffect, useRef } from 'react';
import type { GoodsPhotoPort, GoodsPhotoView } from '../../../maya-chat-shell/src/shell/goods-photo.ts';
import type { Tokens } from '../identity/tokens.ts';
import { GoodsPhotoPanel } from './GoodsPhotoPanel.tsx';

/** Presentation of the existing ephemeral photo owner, never a generic file store. */
export function GoodsPhotoSheet({ view, port, disabled, t, focusFallback }: {
  readonly view: GoodsPhotoView; readonly port: GoodsPhotoPort; readonly disabled: boolean;
  readonly t: Tokens; readonly focusFallback: () => void;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const fallback = useRef(focusFallback); fallback.current = focusFallback;
  const open = view.phase !== 'closed';
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open && !sheet.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      sheet.showModal();
      sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    } else if (!open && sheet.open) {
      sheet.close();
      const target = opener.current; opener.current = null;
      if (target?.isConnected && !target.closest('dialog:not([open])') && !(target instanceof HTMLButtonElement && target.disabled)) target.focus({ preventScroll: true });
      else fallback.current();
    }
  }, [open]);
  return <dialog ref={dialog} className="companion-photo-sheet" aria-modal="true" aria-labelledby="maya-photo-title"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); port.abort(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === controls.length - 1))) {
        event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
      }
    }}>
    <div className="companion-report-handle" aria-hidden="true"><span /></div>
    <header className="companion-photo-heading"><h2 id="maya-photo-title" tabIndex={-1}>Добавить в разговор</h2>
      <button type="button" className="companion-circle" aria-label="Закрыть фото и очистить поля" onClick={() => port.abort()}>×</button></header>
    <p className="companion-photo-caption">Фото накладной или заказ-наряда</p>
    <div className="companion-photo-body">{open ? <GoodsPhotoPanel view={view} port={port} disabled={disabled} t={t} withinSheet /> : null}</div>
  </dialog>;
}
