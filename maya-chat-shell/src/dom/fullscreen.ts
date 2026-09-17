// K5 — the fullscreen host (SHELL-PLAN v2.1 §1.5D, §1.11; D3, D7 A-5, R3.3.4).
//
// One modal dialog, at most one detail at a time. It opens only when the shell's view says so — a
// PROGRESS phase while a NAVIGATE(detail) activation runs, or an OPEN detail the shell presented —
// and never from a route key or an address. Focus moves in when it opens, Tab cycles inside it, and
// focus returns to the control that was focused before it opened. Close, Esc and Back are shell
// chrome, not intents: Close and Esc ask the shell to close, and Back reaches the shell through the
// history port entry/ built, which records no address.

import type { InteractiveRefKey, RenderResult } from '../renderer/nodes.ts';
import type { Cancel, DomFactory, FullscreenView, Scheduler, WidgetPort } from '../shell/ports.ts';
import type { DrawnResult } from './host.ts';

export const OPENING = 'Открываю…';

export interface FullscreenMount {
  readonly factory: DomFactory;
  /** The dialog is appended here; focus is remembered from inside it. */
  readonly container: HTMLElement;
  readonly widgets: Pick<WidgetPort, 'view' | 'subscribe' | 'activate' | 'closeDetail'>;
  readonly scheduler: Pick<Scheduler, 'frame'>;
  /** The host's drawing of a RenderResult (density SHEET for a detail). */
  readonly draw: (result: RenderResult, onActivate: (ref: InteractiveRefKey, control: HTMLElement) => void) => DrawnResult;
  /** The opener again after its item was redrawn: the control for `ref` inside that item's element. */
  readonly refind: (scope: HTMLElement, ref: string) => HTMLElement | null;
  /** Where focus goes on close when the opener is gone. */
  readonly focusFallback: () => void;
}

let serial = 0;

const focusedWithin = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>(':focus');

export function mountFullscreen(mount: FullscreenMount): Cancel {
  const { factory, widgets } = mount;
  serial += 1;

  const dialog = factory.create('dialog');
  dialog.classList.add('fullscreen');
  dialog.setAttribute('aria-modal', 'true');

  const bar = factory.create('header');
  bar.classList.add('fullscreen-bar');
  const title = factory.create('h2');
  title.id = `maya-fullscreen-title-${serial}`;
  title.classList.add('fullscreen-title');
  title.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', title.id);
  const close = factory.create('button');
  close.type = 'button';
  close.classList.add('fullscreen-close');
  close.textContent = 'Закрыть окно';
  bar.append(title, close);

  const body = factory.create('div');
  body.classList.add('fullscreen-body');
  dialog.append(bar, body);
  mount.container.append(dialog);

  /** The control focused before the dialog opened, its ref and its item's element (items redraw in place). */
  let returnTo: { readonly element: HTMLElement; readonly ref: string | null; readonly scope: HTMLElement | null } | null = null;
  let controls: readonly HTMLElement[] = [close];
  let shown: FullscreenView | null = null;

  const restoreFocus = (): void => {
    const target = returnTo;
    returnTo = null;
    mount.scheduler.frame(() => {
      if (target !== null && target.element.isConnected) return target.element.focus();
      const again = target !== null && target.ref !== null && target.scope !== null && target.scope.isConnected ? mount.refind(target.scope, target.ref) : null;
      if (again !== null) again.focus();
      else mount.focusFallback();
    });
  };

  const paint = (view: FullscreenView | null): void => {
    if (view === shown) return;
    const before = shown;
    shown = view;
    if (view === null) {
      if (!dialog.open) return;
      dialog.close();
      body.replaceChildren();
      controls = [close];
      restoreFocus();
      return;
    }
    if (!dialog.open) {
      const focused = focusedWithin(mount.container);
      returnTo = focused === null ? null : { element: focused, ref: focused.getAttribute('data-ref'), scope: focused.closest<HTMLElement>('article') };
      dialog.showModal();
    }
    if (view.phase === 'progress') {
      title.textContent = OPENING;
      const note = factory.create('p');
      note.classList.add('fullscreen-progress');
      note.textContent = OPENING;
      body.replaceChildren(note);
      dialog.setAttribute('aria-busy', 'true');
      controls = [close];
      mount.scheduler.frame(() => title.focus());
      return;
    }
    dialog.removeAttribute('aria-busy');
    if (before !== null && before.phase === 'open' && before.result === view.result && before.itemId === view.itemId) return;
    const itemId = view.itemId;
    const drawn = mount.draw(view.result, (ref) => widgets.activate(itemId, ref));
    title.textContent = view.result.label !== '' ? view.result.label : view.result.textEquivalent.headline;
    body.replaceChildren(drawn.element);
    controls = [close, ...drawn.controls.map((c) => c.element)];
    const heading = drawn.heading ?? title;
    mount.scheduler.frame(() => heading.focus());
  };

  close.addEventListener('click', () => widgets.closeDetail());
  // Esc: the dialog's own cancel is turned into the shell's close, so state and screen agree.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    widgets.closeDetail();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const reachable = controls.filter((el) => el.isConnected && !el.hidden);
    const first = reachable.at(0);
    const last = reachable.at(-1);
    if (first === undefined || last === undefined) return;
    const index = reachable.indexOf(focusedWithin(dialog) ?? title);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (index === -1 || index === reachable.length - 1)) {
      event.preventDefault();
      first.focus();
    }
  });

  paint(widgets.view().fullscreen);
  const off = widgets.subscribe((view) => paint(view.fullscreen));
  return () => {
    off();
    if (dialog.open) dialog.close();
    dialog.remove();
  };
}
