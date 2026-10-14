import { useEffect, useRef } from 'react';
import { MayaCompanion, type CompanionState } from '../identity/MayaCompanion.tsx';

type DialogRef = HTMLDialogElement | null;
type ElementRef = HTMLElement | null;

/** Static introduction. It shares the actual mascot state and delegates the existing chat return. */
export function AboutMayaSheet({ open, close, openChat, chatEnabled, state, event, moving, greet }: {
  readonly open: boolean; readonly close: () => void; readonly openChat: () => void;
  readonly chatEnabled: boolean; readonly state: CompanionState; readonly event: number;
  readonly moving: boolean; readonly greet: () => void;
}) {
  const dialog = useRef<DialogRef>(null), opener = useRef<ElementRef>(null);
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open && !sheet.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      sheet.showModal();
      sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    } else if (!open && sheet.open) {
      sheet.close();
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
      opener.current = null;
    }
  }, [open]);
  return <dialog ref={dialog} className="companion-about-sheet" aria-modal="true" aria-labelledby="maya-about-title"
    onCancel={e => { e.preventDefault(); e.stopPropagation(); close(); }}
    onKeyDown={e => {
      if (e.key === 'Escape') e.stopPropagation();
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && (index < 0 || index === controls.length - 1))) {
        e.preventDefault(); (e.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
      }
    }}>
    <div className="companion-report-handle" aria-hidden="true"><span /></div>
    <header className="companion-about-heading"><h2 id="maya-about-title" tabIndex={-1}>Привет, я Maya</h2>
      <button type="button" className="companion-circle" aria-label="Закрыть окно о Maya" onClick={close}>×</button></header>
    <div className="companion-about-body">
      <button type="button" className="companion-about-greet" aria-label="Поздороваться с Maya" onClick={greet}>
        {open ? <MayaCompanion state={state} event={event} moving={moving} /> : null}
        <span className="companion-caption">Maya</span>
      </button>
      <h3>{'На вашей стороне.\nВ курсе вашего дела.'}</h3>
      <p>Обсудим важное, разберёмся в вопросах и найдём следующий шаг.</p>
      <button type="button" className="companion-about-chat" disabled={!chatEnabled}
        onClick={() => { if (!chatEnabled) return; close(); openChat(); }}>Давай поговорим</button>
    </div>
  </dialog>;
}
