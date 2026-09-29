// The fullscreen detail sheet: everything the dialog DOES, with no port import.
//
// Split from FullscreenDetail deliberately. A component that reaches for the live `widgets`
// singleton cannot be rendered anywhere but the app — not in a test, not in a harness — and an
// untestable dialog is one whose focus trap nobody has ever checked. The adapter beside this file
// is the only part that knows a port exists.
//
// Transcribed from dom/fullscreen.ts (146 lines).
//
// A detail is a ROUTE, not an address: it opens from `ShellView.fullscreen` and from nothing else.
// The URL never changes for it — `HistoryPort.push` deliberately re-pushes the current URL — so a
// React Router integration here would break the invariant the shell's back handling rests on.
//
// The rule that shapes everything below: NEITHER the close button NOR Esc closes the dialog. Both
// call `widgets.closeDetail()`, the shell publishes `fullscreen: null`, and only then does the
// dialog close. The browser's own `cancel` is preventDefault()ed for exactly that reason — if Esc
// closed the element directly, the screen would say closed while the shell still said open.

import { useCallback, useEffect, useId, useRef } from 'react';
import type { InteractiveRefKey } from '../../../maya-chat-shell/src/contract.ts';
import type { FullscreenView } from '../../../maya-chat-shell/src/shell/ports.ts';
import { widgetTheme } from '../identity/widgetTheme.ts';
import type { Tokens } from '../identity/tokens.ts';
import { WidgetCard } from './WidgetCard.tsx';

/** dom/fullscreen.ts:15 */
const OPENING = 'Открываю…';
const READING = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

type DialogOrNone = HTMLDialogElement | null;
type ElementOrNone = HTMLElement | null;
/** Where focus came from, and how to find it again if its item was redrawn underneath. */
interface Opener {
  readonly element: HTMLElement;
  readonly ref: string | null;
  readonly scope: ElementOrNone;
}
type OpenerOrNone = Opener | null;

export function DetailSheet({
  view,
  t,
  activate,
  close,
  focusFallback,
}: {
  /** The shell's own `ShellView.fullscreen`. A detail opens from this and from nothing else. */
  readonly view: FullscreenView | null;
  readonly t: Tokens;
  readonly activate: (itemId: string, ref: InteractiveRefKey) => void;
  /** ALWAYS the shell's `closeDetail`. Never `dialog.close()`. */
  readonly close: () => void;
  readonly focusFallback: () => void;
}) {
  const c = widgetTheme(t);
  const dialogRef = useRef<DialogOrNone>(null);
  const openerRef = useRef<OpenerOrNone>(null);
  const titleId = useId();

  const restoreFocus = useCallback(() => {
    const target = openerRef.current;
    openerRef.current = null;
    window.requestAnimationFrame(() => {
      if (target !== null && target.element.isConnected) {
        target.element.focus();
        return;
      }
      // The opener's item was redrawn while the submission ran, so the element is gone but its REF
      // is not: the server names it, and the same ref is usually back in the new result.
      const again =
        target !== null && target.ref !== null && target.scope !== null && target.scope.isConnected
          ? target.scope.querySelector('[data-ref="' + target.ref + '"]')
          : null;
      if (again instanceof HTMLElement) again.focus();
      else focusFallback();
    });
  }, [focusFallback]);

  // Open, close and focus in ONE effect, in that order — as dom/fullscreen.ts's `paint` does.
  //
  // 🔴 They were two effects and it was wrong. `showModal()` moves focus itself, and a separate
  // effect's frame raced it: whoever landed last won. In this harness the race was invisible
  // because the view object is rebuilt every render, so the effect re-ran and corrected itself. In
  // the app `ShellView` is identity-stable, the effect would run exactly ONCE, and focus would have
  // stayed on the dialog title instead of the card's heading — a bug that only ever appears in
  // production. Sequencing them here removes the race rather than papering over it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (view === null) {
      if (!dialog.open) return;
      dialog.close();
      restoreFocus();
      return;
    }
    if (!dialog.open) {
      // Captured once, at the moment it opens — not on every redraw.
      const active = document.activeElement;
      openerRef.current =
        active instanceof HTMLElement
          ? { element: active, ref: active.getAttribute('data-ref'), scope: active.closest('article') }
          : null;
      dialog.showModal();
    }
    // Focus goes to the drawn heading, or to the dialog's own title while it is still opening.
    const frame = window.requestAnimationFrame(() => {
      const target = dialog.querySelector('.widget-heading') ?? dialog.querySelector('.fullscreen-title');
      if (target instanceof HTMLElement) target.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, restoreFocus]);

  const trapTab = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    // Rebuilt from the live DOM each time, which is the shell's `isConnected && !hidden` filter by
    // another route. Close is FIRST, so it is the wrap-around target.
    const reachable = Array.from(dialog.querySelectorAll('.fullscreen-close, [data-ref]')).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    const first = reachable.at(0);
    const last = reachable.at(-1);
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? reachable.indexOf(active) : -1;
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (index === -1 || index === reachable.length - 1)) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const title =
    view === null || view.phase === 'progress'
      ? OPENING
      : view.result.label !== ''
        ? view.result.label
        : view.result.textEquivalent.headline;

  return (
    <dialog
      ref={dialogRef}
      className="fullscreen"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={view !== null && view.phase === 'progress' ? 'true' : undefined}
      onKeyDown={trapTab}
      onCancel={(event) => {
        // Esc becomes the shell's close, so state and screen cannot diverge.
        event.preventDefault();
        close();
      }}
      style={{
        width: 'min(100%, 560px)',
        maxWidth: '100%',
        maxHeight: '100%',
        height: '100%',
        margin: 0,
        marginInlineStart: 'auto',
        padding: 0,
        border: '0',
        background: t.bg,
        color: t.ink,
        overflow: 'hidden',
      }}
    >
      <header
        className="fullscreen-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px',
          borderBottom: '1px solid ' + c.line,
        }}
      >
        <h2
          id={titleId}
          className="fullscreen-title"
          tabIndex={-1}
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontFamily: READING,
            fontWeight: 500,
            fontSize: 17,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            color: t.ink,
          }}
        >
          {title}
        </h2>
        <button
          type="button"
          className="fullscreen-close"
          onClick={close}
          style={{
            flexShrink: 0,
            minHeight: 44,
            padding: '10px 14px',
            borderRadius: 999,
            border: '1px solid ' + c.line2,
            background: 'transparent',
            color: t.ink,
            fontFamily: READING,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Закрыть окно
        </button>
      </header>

      <div
        className="fullscreen-body"
        style={{
          height: 'calc(100% - 64px)',
          overflow: 'auto',
          overscrollBehavior: 'contain',
          padding: '4px 4px calc(env(safe-area-inset-bottom, 0px) + 24px)',
        }}
      >
        {view === null ? null : view.phase === 'progress' ? (
          <p
            className="fullscreen-progress"
            style={{ margin: 0, padding: 18, fontFamily: READING, fontSize: 13.5, color: c.muted }}
          >
            {OPENING}
          </p>
        ) : (
          // A detail is always drawn live and whole: never pending, never collapsed.
          <WidgetCard
            key={view.itemId}
            variant="sheet"
            t={t}
            item={{ id: view.itemId, result: view.result, display: 'live', pending: null, sentence: null }}
            activate={activate}
          />
        )}
      </div>
    </dialog>
  );
}
