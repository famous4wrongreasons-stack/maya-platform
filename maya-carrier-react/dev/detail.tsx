// A harness for the detail sheet's DIALOG behaviour, which only a real browser can show:
// showModal, Esc redirected to the shell's close, the Tab trap, and where focus goes on close.
// Dev-only; the shell port is replaced by local state, which is exactly why DetailSheet takes it
// as a prop instead of reaching for the singleton.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DetailSheet } from '../src/widgets/DetailSheet.tsx';
import { MayaMarkAnimated } from '../src/identity/MayaMark.tsx';
import { tokens } from '../src/identity/tokens.ts';
import items from './results.json';

type Phase = 'closed' | 'progress' | 'open';

function Harness() {
  const t = tokens(true);
  const [phase, setPhase] = useState<Phase>('closed');
  const entry = (items as never[])[0] as unknown as { id: string; result: unknown };
  const report = (items as never[]).map((x) => x as unknown as { fixture: string; result: unknown })
    .find((x) => x.fixture === 'kind-report') ?? { fixture: 'first', result: entry.result };

  const view =
    phase === 'closed'
      ? null
      : phase === 'progress'
        ? { phase: 'progress' as const, itemId: 'w-detail' }
        : { phase: 'open' as const, itemId: 'w-detail', result: report.result as never };

  return (
    <main style={{ background: t.bg, color: t.ink, minHeight: '100vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <h2 style={{ margin: 0, font: '500 17px/1.3 -apple-system, system-ui, sans-serif' }}>Detail sheet harness</h2>
      <button id="opener" type="button" data-ref="intent:opener" onClick={() => setPhase('open')} style={{ minHeight: 44, padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(244,240,235,0.22)', background: 'transparent', color: t.ink, cursor: 'pointer', font: 'inherit' }}>
        Открыть карточку
      </button>
      <button id="progress" type="button" onClick={() => setPhase('progress')} style={{ minHeight: 44, padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(244,240,235,0.22)', background: 'transparent', color: t.ink, cursor: 'pointer', font: 'inherit' }}>
        Показать «Открываю…»
      </button>
      <div id="orbs" style={{ display: 'flex', gap: 28, alignItems: 'center', padding: '8px 0', color: t.ink }}>
        <span data-orb="listen"><MayaMarkAnimated size={36} mode="listen" state="recording" level={0.6} /></span>
        <span data-orb="loop"><MayaMarkAnimated size={36} mode="loop" /></span>
        <span data-orb="static"><MayaMarkAnimated size={36} mode="static" /></span>
      </div>
      <textarea id="fallback" aria-label="composer stand-in" rows={1} style={{ width: 240, height: 44, borderRadius: 14, border: '1px solid rgba(244,240,235,0.22)', background: 'transparent', color: t.ink, padding: 10 }} />
      <DetailSheet
        view={view}
        t={t}
        activate={() => undefined}
        close={() => setPhase('closed')}
        focusFallback={() => document.getElementById('fallback')?.focus()}
      />
    </main>
  );
}

const root = document.getElementById('maya');
if (root) createRoot(root).render(<Harness />);
