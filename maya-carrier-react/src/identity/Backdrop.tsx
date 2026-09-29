// Ported from the canonical app.html:2238-2310, AURORA branch only.
//
// `noir` and `atelier` are not ported: the owner's ruling excludes them. This is the layer the chat
// actually renders — `e(Backdrop, { t, dir: 'aurora' })` at app.html:21393.
//
// Every value is the owner's: inset -20%, three radial highlights, blur(10px), and a PaperGrain at
// 0.06 in dark / 0.25 in light. In dark the wash is `none` — the ground is simply the page.

import { PaperGrain } from './PaperGrain.tsx';
import type { Tokens } from './tokens.ts';

const WASH_LIGHT =
  'radial-gradient(48% 36% at 18% 10%, rgba(255,255,255,0.22), transparent 60%), ' +
  'radial-gradient(52% 42% at 90% 28%, rgba(150,148,142,0.10), transparent 62%), ' +
  'radial-gradient(60% 45% at 50% 110%, rgba(255,255,255,0.14), transparent 60%)';

export function Backdrop({ t }: { readonly t: Tokens }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: t.bg }}>
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          background: t.dark ? 'none' : WASH_LIGHT,
          filter: 'blur(10px)',
        }}
      />
      <PaperGrain opacity={t.dark ? 0.06 : 0.25} />
    </div>
  );
}
