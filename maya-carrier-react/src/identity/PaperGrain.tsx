// Ported verbatim from the canonical app.html:2311-2330.
//
// The SVG fractal-noise grain the glass picks up. Every number is the owner's: 160x160,
// baseFrequency 0.85, numOctaves 2, stitchTiles stitch, mix-blend-mode overlay.

const GRAIN_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
);

export function PaperGrain({ opacity = 0.1 }: { readonly opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url("data:image/svg+xml,${GRAIN_SVG}")`,
        opacity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }}
    />
  );
}
