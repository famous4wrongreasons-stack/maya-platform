// The widget gallery: every sealed fixture drawn by the React card, side by side in both themes.
// Dev-only; never part of the shipped bundle.
import { createRoot } from 'react-dom/client';
import { WidgetCard } from '../src/widgets/WidgetCard.tsx';
import { tokens } from '../src/identity/tokens.ts';
import items from './results.json';

function Gallery({ dark }: { readonly dark: boolean }) {
  const t = tokens(dark);
  return (
    <div style={{ background: t.bg, padding: '20px 16px 40px', minHeight: '100vh' }}>
      {(items as never[]).map((item: never) => {
        const meta = item as unknown as { id: string; fixture: string; kind: string };
        return (
          <div key={meta.id} style={{ marginBottom: 26 }}>
            <div
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 10,
                letterSpacing: '0.08em',
                color: dark ? 'rgba(244,240,235,0.42)' : 'rgba(11,11,12,0.42)',
                marginBottom: 2,
              }}
            >
              {meta.kind} · {meta.fixture}
            </div>
            <WidgetCard item={item} t={t} activate={() => undefined} />
          </div>
        );
      })}
    </div>
  );
}

const root = document.getElementById('maya');
if (root)
  createRoot(root).render(
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <Gallery dark />
      <Gallery dark={false} />
    </div>,
  );
