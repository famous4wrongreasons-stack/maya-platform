// One widget item: the article envelope, transcribed from dom/host.ts's drawResult.
//
// The server owns everything inside. This component chooses elements and wires ARIA; it decides
// nothing, composes no text, and learns nothing from a click. Activation crosses as (itemId, ref)
// and the only news of what happened arrives as the NEXT view — a new `display`, a `pending`, or a
// `sentence`. Drawing a tick from a tap would be presentation inventing a receipt.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RenderResult } from '../../../maya-chat-shell/src/renderer/nodes.ts';
import type { InteractiveRefKey } from '../../../maya-chat-shell/src/contract.ts';
import type { WidgetSentence } from '../../../maya-chat-shell/src/shell/ports.ts';
import { widgetTheme } from '../identity/widgetTheme.ts';
import type { Tokens } from '../identity/tokens.ts';
import { widgetSentence } from '../runtime/copy.ts';
import { drawNode } from './nodes.tsx';

export interface WidgetItemView {
  readonly id: string;
  readonly result: RenderResult;
  readonly display: 'live' | 'pending' | 'collapsed' | 'stale' | 'terminal';
  readonly pending: InteractiveRefKey | null;
  readonly sentence: WidgetSentence | null;
}

type ResultOrNone = RenderResult | null;
type ElementOrNone = HTMLElement | null;
type RefKeyOrNone = InteractiveRefKey | null;

export function WidgetCard({
  item,
  t,
  activate,
  rendered,
  variant = 'lane',
}: {
  readonly item: WidgetItemView;
  readonly t: Tokens;
  readonly rendered?: ((itemId: string) => void) | undefined;
  readonly activate: (itemId: string, ref: InteractiveRefKey) => void;
  /** In the lane a card is one turn's width; in the fullscreen sheet it is the whole sheet. */
  readonly variant?: 'lane' | 'sheet';
}) {
  const result = item.result;
  useEffect(() => {
    if (item.display === 'live') rendered?.(item.id);
  }, [item, rendered]);
  const c = widgetTheme(t);
  const cardRef = useRef<ElementOrNone>(null);
  const seenResultRef = useRef<ResultOrNone>(null);
  const spokeAtRef = useRef(0);
  const [spoken, setSpoken] = useState('');

  const collapsed = item.display === 'collapsed';
  const nodes = collapsed ? result.nodes.filter((node) => node.t === 'heading') : result.nodes;
  const describedBy = 'desc-' + item.id;

  // The live region is born EMPTY and filled a frame later: a region that already contains its text
  // when it is created is not announced at all. PROGRESS throttles to one announcement per 5 s;
  // everything else is 0. Keyed on result IDENTITY, so a re-render does not re-announce.
  useEffect(() => {
    setSpoken('');
    if (result.liveRegion === 'off') return;
    const interval = result.announceIntervalMs;
    const say = (): void => {
      spokeAtRef.current = Date.now();
      setSpoken(result.textEquivalent.headline);
    };
    const wait =
      interval === 0 || spokeAtRef.current === 0
        ? 0
        : Math.max(0, spokeAtRef.current + interval - Date.now());
    if (wait === 0) {
      const frame = window.requestAnimationFrame(say);
      return () => window.cancelAnimationFrame(frame);
    }
    const handle = window.setTimeout(say, wait);
    return () => window.clearTimeout(handle);
  }, [result]);

  // dom/host.ts:480-483 — the focused control's REF is captured before a redraw and restored after.
  // A widget redraw replaces every control, so React reconciliation drops focus to <body>; the ref
  // survives because the server names it, and the same ref usually reappears in the new result.
  const focusedRefKey = useRef<RefKeyOrNone>(null);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (card === null) return;
    const active = document.activeElement;
    const held = active instanceof HTMLElement ? active.closest('[data-ref]') : null;
    const key = held === null ? null : held.getAttribute('data-ref');
    const previous = focusedRefKey.current;
    focusedRefKey.current = key === null ? null : (key as InteractiveRefKey);
    if (key !== null || previous === null) return;
    if (active !== null && active !== document.body && card.contains(active)) return;
    const back = card.querySelector('[data-ref="' + previous + '"]');
    if (back instanceof HTMLElement) back.focus();
  }, [result, item.display]);

  // D7 focus, on a FRESH result only, and only while the card is live or pending — never on a
  // re-render, never on a collapse the person did not cause. Moved on the next frame, as the DOM
  // host does, so the element exists and the browser has settled.
  useEffect(() => {
    const card = cardRef.current;
    const fresh = seenResultRef.current !== result;
    seenResultRef.current = result;
    if (card === null || !fresh) return;
    if (item.display !== 'live' && item.display !== 'pending') return;
    const selector =
      result.focus === 'heading'
        ? '.widget-heading'
        : result.focus === 'first_refused_field'
          ? '.widget-field--refused'
          : null;
    if (selector === null) return;
    const target = card.querySelector(selector);
    if (target === null) return;
    const frame = window.requestAnimationFrame(() => {
      if (target instanceof HTMLElement) target.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result, item.display]);

  return (
    <div style={{ marginTop: variant === 'sheet' ? 0 : 10, maxWidth: variant === 'sheet' ? 'none' : 420 }}>
      <article
        ref={cardRef}
        className={
          'widget widget--' +
          result.density.toLowerCase() +
          ' widget--' +
          result.mode.replace('_', '-') +
          (result.motion === 'none' ? ' widget--still' : '') +
          ' widget--' +
          item.display
        }
        aria-label={result.label === '' ? undefined : result.label}
        aria-describedby={result.description === '' ? undefined : describedBy}
        aria-busy={item.pending !== null ? 'true' : undefined}
        style={{
          // entry/styles.css `.widget`: the article is the flex column that spaces its own
          // children. The chrome around it — the 20px radius, the `line` edge, the `surf` ground,
          // 18px of padding — is the owner's card (app.html:16326).
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minWidth: 0,
          maxWidth: '100%',
          overflowWrap: 'anywhere',
          borderRadius: variant === 'sheet' ? 0 : 20,
          border: variant === 'sheet' ? '0' : '1px solid ' + c.line,
          padding: 18,
          background: variant === 'sheet' ? 'transparent' : c.surf,
          opacity: item.display === 'stale' ? 0.62 : 1,
        }}
      >
        {result.description === '' ? null : (
          <span id={describedBy} className="vh">
            {result.description}
          </span>
        )}

        {nodes.map((node, i) =>
          drawNode(node, 'block', String(i), {
            c,
            names: new Map(Object.entries(result.accessibleNames)),
            pending: item.pending,
            activate: (ref) => activate(item.id, ref),
          }),
        )}

        {result.liveRegion === 'off' ? null : (
          <p className="vh widget-live" aria-live={result.liveRegion} aria-atomic="true">
            {spoken}
          </p>
        )}
      </article>

      {item.sentence === null ? null : (
        <p
          className="widget-sentence"
          style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.45, color: c.muted }}
        >
          {widgetSentence(item.sentence)}
        </p>
      )}
    </div>
  );
}
