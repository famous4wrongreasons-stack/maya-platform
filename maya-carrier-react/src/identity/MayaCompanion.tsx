// Companion v1 artwork geometry and expressions from the owner's 2026-10-11 package.
// React spans + finite CSS/data-SVG leaves replace its HTML-injecting web component.
// Decorative only: no transport, authority, outcome interpretation or persisted state.
import { useEffect, useRef, useState } from 'react';
import type { ConversationView, VoiceView } from '../../../maya-chat-shell/src/shell/ports.ts';

export type CompanionState = 'idle' | 'greeting' | 'attentive' | 'thinking' | 'reply' | 'success' | 'error';
const FACES: Readonly<Record<CompanionState, readonly string[]>> = {
  idle: ['M230 368v23', 'M425 368v23', 'M310 439 Q337 466 367 439'],
  greeting: ['M207 392 Q236 350 265 392', 'M396 392 Q425 350 454 392', 'M309 435 Q337 477 370 435'],
  attentive: ['M230 361v30', 'M425 361v30', 'M316 442 Q337 456 360 442'],
  thinking: ['M224 365v20', 'M419 365v20', 'M324 446h26'],
  reply: ['M209 389 Q236 355 263 389', 'M398 389 Q425 355 452 389', 'M310 438 Q337 470 367 438'],
  success: ['M205 393 Q236 346 267 393', 'M394 393 Q425 346 456 393', 'M305 433 Q337 483 373 433'],
  error: ['M221 376l19 6', 'M413 381l22-14', 'M321 450 Q338 436 355 448'],
};
// Each URL contains only literals from FACES. Nothing received from the server enters markup.
function expression(state: CompanionState, part: 'eyes' | 'mouth'): string {
  const paths = FACES[state];
  return 'url("data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 135 700 495">' +
    paths.map((d, i) => (part === 'eyes' ? i < 2 : i === 2) ? '<path d="' + d + '" fill="none" stroke="#6deaff" stroke-width="' +
      (i === 2 ? '10' : '18') + '" stroke-linecap="round" stroke-linejoin="round"/>' : '').join('') + '</svg>',
  ) + '")';
}

export function MayaCompanion({ state = 'idle', moving = true, event = 0 }: {
  readonly state?: CompanionState; readonly moving?: boolean; readonly event?: number;
}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const read = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', read);
    read();
    return () => document.removeEventListener('visibilitychange', read);
  }, []);
  return <span className="companion" aria-hidden="true" data-motion={moving ? 'on' : 'off'} data-paused={hidden}>
    <span className="companion-stage" data-state={state} key={event}>
      <span className="companion-shadow" />
      <span className="companion-float">
        <span className="companion-body companion-atlas" />
        <span className="companion-head">
          <span className="companion-head-art companion-atlas" />
          <span className="companion-face">
            <span className="companion-eyes" style={{ backgroundImage: expression(state, 'eyes') }} />
            <span className="companion-mouth" style={{ backgroundImage: expression(state, 'mouth') }} />
          </span>
        </span>
        <span className="companion-left companion-arm"><span className="companion-left-art companion-atlas" /></span>
        <span className="companion-right companion-arm"><span className="companion-right-art companion-atlas" /></span>
      </span>
    </span>
  </span>;
}

export function companionContext(view: ConversationView, draft: string, voice: VoiceView): CompanionState {
  if (view.inFlight || voice.state === 'transcribing') return 'thinking';
  const lastUser = [...view.items].reverse().find(item => item.kind === 'user');
  if (lastUser?.kind === 'user' && lastUser.state === 'failed') return 'error';
  if (draft.trim() || ['arming', 'listening', 'recording', 'held'].includes(voice.state)) return 'attentive';
  return 'idle';
}

/** Chat completion means reply, never business success. Historical restoration emits no cue. */
export function useCompanion(view: ConversationView, draft: string, voice: VoiceView) {
  const context = companionContext(view, draft, voice);
  const [cue, setCue] = useState<{ state: CompanionState; event: number } | null>({ state: 'greeting', event: 0 });
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (before.inFlight && !view.inFlight && view.items.some(item =>
      item.kind === 'assistant' && !before.items.some(old => old.id === item.id))) {
      setCue({ state: 'reply', event: Date.now() });
    }
  }, [view]);
  // A sent draft clears in the parent's effect. Do not erase the reply cue during that
  // intermediate render. New typing/recording or a new flight does interrupt a cue.
  useEffect(() => { if (draft.trim()) setCue(null); }, [draft]);
  useEffect(() => {
    if (view.inFlight || !['idle', 'unavailable'].includes(voice.state)) setCue(null);
  }, [view.inFlight, voice.state]);
  useEffect(() => {
    if (cue === null) return;
    const timer = window.setTimeout(() => setCue(null), 1900);
    return () => window.clearTimeout(timer);
  }, [cue]);
  return {
    state: context === 'thinking' || context === 'error' ? context : cue?.state ?? context,
    event: cue?.event ?? 0,
    greet: () => { if (context === 'idle') setCue({ state: 'greeting', event: Date.now() }); },
  };
}
