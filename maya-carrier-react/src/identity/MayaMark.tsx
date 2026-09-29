// The MAYA mark. Ported from the canonical app.html:2478-2525 — MayaMark, MayaMarkAnimated,
// MayaVolumeMark and SeedLogoAnimated.
//
// 🔴 Owner decision D1. The canonical components call `window.MayaIdentity.markup()` and
// `.mount()`, and inject the result with `dangerouslySetInnerHTML`. None of that returns:
//
//   * the legacy runtime is not restored — the mark is a CSS background carrying the ribbon-v1
//     bytes, which is the mechanism the shell already certified for `.signin-mark`;
//   * nothing is turned from a string into HTML, so no Trusted Types policy is needed and the
//     CSP's `require-trusted-types-for 'script'` is not strained;
//   * business logic 0, authority 0, storage 0, network 0 — a `data:` URI issues no request.
//
// `window.__mayaAudioLevel`, which the canonical animated mark reads directly, is not read here.
// The level arrives as a bounded prop, so the mark cannot reach for a global that no port owns.

import { RIBBON_ASPECT, RIBBON_V1_BACKGROUND } from './ribbon.ts';

export type MarkState = 'idle' | 'launch' | 'thinking' | 'responding' | 'recording';

export function MayaMark({ size = 22 }: { readonly size?: number }) {
  return (
    <span
      data-maya-mark="ribbon-v1"
      aria-hidden="true"
      className="maya-mark"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        flex: 'none',
        alignItems: 'center',
        backgroundImage: RIBBON_V1_BACKGROUND,
        aspectRatio: RIBBON_ASPECT,
      }}
    />
  );
}

/**
 * The animated mark.
 *
 * What IS carried over: the ambient breath — opacity .82 → 1 → .82 over 2400 ms — which is the
 * motion present whenever MAYA is on screen, expressed as a CSS animation and therefore silenced by
 * `prefers-reduced-motion` like everything else.
 *
 * 🔴 What is NOT, and is disclosed rather than approximated: the seven-pose storyboard crossfade.
 * It needs a 1,038,006-byte owner storyboard PNG and composites the poses ADDITIVELY
 * (`globalCompositeOperation = 'lighter'`, maya-identity.js:71), and the source comment there states
 * plainly that plain alpha looks wrong. Loading that asset is a network fetch, which D1 forbids, and
 * faking it with alpha would be a different motion wearing the same name. The difference is shown at
 * M5 for the owner to judge.
 */
export function MayaMarkAnimated({
  size = 64,
  state = 'thinking',
  level = 0,
}: {
  readonly size?: number;
  readonly state?: MarkState;
  /** 0..1, from VoicePort. The canonical mark read a global; this one is told. */
  readonly level?: number;
}) {
  const scale = state === 'recording' ? 1 + Math.min(1, Math.max(0, level)) * 0.06 : 1;
  return (
    <span
      data-maya-motion={state}
      aria-hidden="true"
      className="maya-mark maya-mark--breathing"
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        flex: 'none',
        backgroundImage: RIBBON_V1_BACKGROUND,
        aspectRatio: RIBBON_ASPECT,
        transform: `scale(${scale})`,
      }}
    />
  );
}

/** Canonical alias (app.html:2494): the microphone glyph is the mark at 18. */
export function MayaVolumeMark({ size = 18 }: { readonly size?: number }) {
  return <MayaMark size={size} />;
}

/** Canonical alias (app.html:2515): the cold-start logo is the animated mark. */
export function SeedLogoAnimated({ size = 64 }: { readonly size?: number }) {
  return <MayaMarkAnimated size={size} state="launch" />;
}
