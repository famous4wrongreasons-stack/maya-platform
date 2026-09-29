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

export type MarkState = 'idle' | 'launch' | 'thinking' | 'responding' | 'recording';

/** app.html:2367 — the one source of the mark's proportions. Do not edit without the icon and splash. */
const XS = [0.16667, 0.3125, 0.45833, 0.60417, 0.75] as const;
const BW = 0.08333;
const Y0 = 0.15625;
const TH = 0.67708;
/** The logo pose: the outer bars full height, the inner three stepped down. */
const HS = [1, 0.44615, 0.58462, 0.44615, 1] as const;
const YS = [0, 0.15385, 0.27692, 0.15385, 0] as const;
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
 * The animated mark. app.html:2452.
 *
 * What IS carried over: the ambient breath — opacity .82 → 1 → .82 over 2400 ms — expressed as a
 * CSS animation and therefore silenced by `prefers-reduced-motion` like everything else.
 *
 * 🔴 What is NOT, and is disclosed rather than approximated: the canonical mark also animates the
 * bar HEIGHTS, cycling an equaliser pose every 145 ms before settling into the logo pose. That
 * motion is portable and costs nothing — it is left out only because nothing in the M5 chat
 * presentation puts this component on screen (it belongs to the voice orb, which is a `voiceMode`
 * branch outside this unit). It should be restored with the voice surface, not guessed at here.
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
    <Bars
      size={size}
      heights={HS.map((h) => h * TH)}
      tops={YS.map((y) => Y0 + y * TH)}
      className="maya-mark--breathing"
      state={state}
      transform={`scale(${scale})`}
    />
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
