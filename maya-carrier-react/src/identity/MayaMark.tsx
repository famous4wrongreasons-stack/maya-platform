// The MAYA mark. Ported from the canonical app.html:2367-2525.
//
// 🔴 Corrected at M5. M4 rendered these three components from the sign-in ribbon's `data:` URI,
// because that was the mechanism the shell had already certified. That was the wrong asset: the
// ribbon belongs to the sign-in surface, and the chat's mark is a different drawing. The canonical
// `MayaMarkGeometry()` (app.html:2367) is explicit about this — it is "🔴 ЕДИНСТВЕННЫЙ источник
// пропорций знака MAYA", shared with the app icon, the native splash and the sign-in screen: on a
// 96 grid, five bars 8 wide with 6 of gap, heights 65/29/38/29/65, top offsets 15/25/33/25/15.
// `ribbon.ts` is kept for the surface it actually belongs to.
//
// The bars are canonically five `<rect rx={w/2}>` inside an `<svg>`. `svg` is outside the carrier's
// closed tag set — it carries its own script surface — so each bar is a `<span>` placed by
// percentage on a square box. The geometry is identical (a rect with rx = w/2 IS a pill), it scales
// the same way, and `background: currentColor` inherits colour exactly as `fill: currentColor` did,
// which is what lets the mic button invert the glyph while recording.
//
// 🔴 Owner decision D1. The canonical components call `window.MayaIdentity.markup()` / `.mount()`
// and inject the result with `dangerouslySetInnerHTML`. None of that returns:
//
//   * the legacy runtime is not restored — nothing is turned from a string into HTML, so no Trusted
//     Types policy is needed and the CSP's `require-trusted-types-for 'script'` is not strained;
//   * business logic 0, authority 0, storage 0, network 0 — these bars issue no request at all.
//
// `window.__mayaAudioLevel`, which the canonical animated mark reads directly, is not read here.
// The level arrives as a bounded prop, so the mark cannot reach for a global that no port owns.

import { useEffect, useState, useSyncExternalStore } from 'react';

/** True while the reader asks for less motion. Re-read live, as the canonical mark does. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const fire = (): void => onChange();
      query.addEventListener('change', fire);
      return () => query.removeEventListener('change', fire);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  );
}

export type MarkState = 'idle' | 'launch' | 'thinking' | 'responding' | 'recording';

/** app.html:2454 — loop assembles and repeats, listen never assembles, once stops, static never moves. */
export type MarkMode = 'loop' | 'listen' | 'once' | 'static';

type Phase = 'eq' | 'm';
type Levels = readonly number[];

/** app.html:2489-2504 — the equaliser's own clock. */
const EQ_TICK_MS = 145;
const ASSEMBLE_AFTER_MS = 2_100;
const REPEAT_AFTER_MS = 2_200;

/** app.html:2367 — the one source of the mark's proportions. Do not edit without the icon and splash. */
const XS = [0.16667, 0.3125, 0.45833, 0.60417, 0.75] as const;
const BW = 0.08333;
const Y0 = 0.15625;
const TH = 0.67708;
/** The logo pose: the outer bars full height, the inner three stepped down. */
const HS = [1, 0.44615, 0.58462, 0.44615, 1] as const;
const YS = [0, 0.15385, 0.27692, 0.15385, 0] as const;
/** The per-bar stagger when the equaliser assembles into the logo. app.html:2380. */
const DL = [0, 0.07, 0.14, 0.07, 0] as const;
/** app.html:2429 — the frozen waveform frame the composer's microphone shows. */
const LEVELS = [0.58, 0.96, 0.4, 0.82, 0.62] as const;

const pct = (n: number) => `${n * 100}%`;

function Bars({
  size,
  heights,
  tops,
  className,
  state,
  transform,
}: {
  readonly size: number;
  readonly heights: readonly number[];
  readonly tops: readonly number[];
  readonly className?: string;
  readonly state?: MarkState;
  readonly transform?: string;
}) {
  return (
    <span
      data-maya-mark="bars"
      data-maya-motion={state}
      aria-hidden="true"
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
        flex: 'none',
        transform,
      }}
    >
      {XS.map((x, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: pct(x),
            top: pct(tops[i] ?? 0),
            width: pct(BW),
            height: pct(heights[i] ?? 0),
            borderRadius: 999,
            background: 'currentColor',
          }}
        />
      ))}
    </span>
  );
}

/** app.html:2383 — the mark itself: scales only, no icon tile. Takes the ambient `color`. */
export function MayaMark({ size = 22 }: { readonly size?: number }) {
  return (
    <Bars
      size={size}
      heights={HS.map((h) => h * TH)}
      tops={YS.map((y) => Y0 + y * TH)}
    />
  );
}

/**
 * The animated mark. app.html:2452-2560, now including the motion itself.
 *
 * The bars run as an equaliser — each height re-rolled to 0.24 + random × 0.76 every 145 ms — and
 * then, unless the mode is `listen`, assemble into the logo pose after 2 100 ms with a staggered
 * 780 ms ease and repeat 2 200 ms later. `listen` never assembles: that is the voice orb, and it
 * moves for as long as MAYA is listening.
 *
 * Two transitions, not one: assembling is `.78s cubic-bezier(.16,1,.3,1)` with a per-bar delay, and
 * the equaliser is `.14s linear`, which is what keeps a fast random walk from looking like syrup.
 *
 * 🔴 The heights are random, as they are canonically — this meter has never been a level meter. The
 * real `VoiceView.level` (0..3) is available and is NOT wired into the bars, because driving them
 * from it would be a different motion wearing the same name. `level` stays the bounded VoicePort
 * input D1 asked for, and scales the whole mark while recording.
 *
 * `prefers-reduced-motion` holds the logo pose and never starts the clock.
 */
export function MayaMarkAnimated({
  size = 64,
  mode = 'loop',
  state = 'thinking',
  level = 0,
}: {
  readonly size?: number;
  readonly mode?: MarkMode;
  readonly state?: MarkState;
  /** 0..1, from VoicePort. The canonical mark read a global; this one is told. */
  readonly level?: number;
}) {
  const reduce = useReducedMotion();
  const still = reduce || mode === 'static';
  const [phase, setPhase] = useState<Phase>(still ? 'm' : 'eq');
  const [eq, setEq] = useState<Levels>(still ? [...HS] : HS.map(() => 0.62));

  useEffect(() => {
    if (still) {
      setPhase('m');
      setEq([...HS]);
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const clearAll = (): void => {
      for (const id of timers.splice(0)) window.clearTimeout(id);
    };
    const schedule = (run: () => void, ms: number): void => {
      timers.push(window.setTimeout(run, ms));
    };
    const tick = (started: number): void => {
      if (cancelled) return;
      setPhase('eq');
      setEq(HS.map(() => 0.24 + Math.random() * 0.76));
      if (mode === 'listen') {
        schedule(() => tick(started), EQ_TICK_MS);
        return;
      }
      if (Date.now() - started > ASSEMBLE_AFTER_MS) {
        setPhase('m');
        setEq([...HS]);
        if (mode === 'once') return;
        schedule(() => start(), REPEAT_AFTER_MS);
        return;
      }
      schedule(() => tick(started), EQ_TICK_MS);
    };
    const start = (): void => {
      if (cancelled) return;
      clearAll();
      tick(Date.now());
    };
    start();
    return () => {
      cancelled = true;
      clearAll();
    };
  }, [mode, still]);

  const assembled = phase === 'm';
  const scale = state === 'recording' ? 1 + Math.min(1, Math.max(0, level)) * 0.06 : 1;
  return (
    <span
      data-maya-mark="bars"
      data-maya-motion={state}
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size,
        flex: 'none',
        transform: `scale(${scale})`,
      }}
    >
      {XS.map((x, i) => {
        const hMul = assembled ? (HS[i] ?? 0) : (eq[i] ?? HS[i] ?? 0);
        const off = assembled ? (YS[i] ?? 0) : (1 - hMul) / 2;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: pct(x),
              top: pct(Y0 + off * TH),
              width: pct(BW),
              height: pct(hMul * TH),
              borderRadius: 999,
              background: 'currentColor',
              transition: assembled
                ? `top .78s cubic-bezier(.16,1,.3,1) ${DL[i] ?? 0}s, height .78s cubic-bezier(.16,1,.3,1) ${DL[i] ?? 0}s`
                : 'top .14s linear, height .14s linear',
              willChange: 'top, height',
            }}
          />
        );
      })}
    </span>
  );
}

/** app.html:2421 — the microphone glyph: the same bars at a fixed volume frame, vertically centred. */
export function MayaVolumeMark({ size = 18 }: { readonly size?: number }) {
  return (
    <Bars
      size={size}
      heights={LEVELS.map((l) => l * TH)}
      tops={LEVELS.map((l) => Y0 + ((1 - l) * TH) / 2)}
    />
  );
}

/** Canonical alias (app.html:2515): the cold-start logo is the animated mark. */
export function SeedLogoAnimated({ size = 64 }: { readonly size?: number }) {
  return <MayaMarkAnimated size={size} state="launch" />;
}
