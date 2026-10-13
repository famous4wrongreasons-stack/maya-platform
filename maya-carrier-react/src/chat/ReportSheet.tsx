import { useEffect, useId, useRef } from 'react';
import type { WorkspaceReadsView } from '../../../maya-chat-shell/src/shell/workspace-reads.ts';

type DialogRef = HTMLDialogElement | null;
type ElementRef = HTMLElement | null;
export const reportPeriod = (value: string) => value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4);
export const reportLabel = (type: string) => type === 'daily_report' ? 'Отчёт за день' : type === 'morning_owner' ? 'Утренний обзор' : 'План на день';

/** Retained library read only. The runtime owns loading, authority, cancellation and back. */
export function ReportSheet({ detail, back, focusFallback }: {
  readonly detail: WorkspaceReadsView['detail'];
  readonly back: () => void;
  readonly focusFallback: () => void;
}) {
  const dialog = useRef<DialogRef>(null);
  const opener = useRef<ElementRef>(null);
  const fallback = useRef(focusFallback);
  fallback.current = focusFallback;
  const titleId = useId();
  const open = detail !== null;

  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open) {
      if (!sheet.open) {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        sheet.showModal();
      }
      const frame = window.requestAnimationFrame(() => sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }));
      return () => window.cancelAnimationFrame(frame);
    }
    if (!sheet.open) return;
    sheet.close();
    const target = opener.current;
    opener.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
      else fallback.current();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return <dialog ref={dialog} className="companion-report-sheet" aria-modal="true" aria-labelledby={titleId}
    aria-busy={detail?.phase === 'loading' ? 'true' : undefined}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); back(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.key !== 'Tab') return;
      const reachable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), .companion-report-reader') ?? []);
      const index = reachable.indexOf(document.activeElement as HTMLElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === reachable.length - 1))) {
        event.preventDefault();
        (event.shiftKey ? reachable.at(-1) : reachable.at(0))?.focus();
      }
    }}>
    {detail ? <>
      <div className="companion-report-handle" aria-hidden="true"><span /></div>
      <header className="companion-report-heading">
        <h2 id={titleId} tabIndex={-1}>{detail.phase === 'loading' ? detail.title : detail.report.title}</h2>
        <button type="button" className="companion-circle" aria-label="Закрыть отчёт" onClick={back}>×</button>
        {detail.phase === 'ready' ? <p className="companion-read-meta">{reportLabel(detail.report.type)} · {reportPeriod(detail.report.period)} · {detail.report.timezone}</p> : null}
      </header>
      <div className="companion-report-reader" tabIndex={0} role="region" aria-label="Содержимое отчёта">
        {detail.phase === 'loading' ? <p role="status">Открываю отчёт…</p> : <p className="companion-report-body">{detail.report.body}</p>}
        <button type="button" className="companion-read-back" onClick={back}>← К списку отчётов</button>
      </div>
    </> : null}
  </dialog>;
}
