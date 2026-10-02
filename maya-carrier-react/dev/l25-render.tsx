// L25 browser-only proof. No network, credentials or business authority.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WidgetCard } from '../src/widgets/WidgetCard';
import { tokens } from '../src/identity/tokens';
import items from './results.json';
const entry = (items as unknown as { fixture: string; result: unknown }[]).find(x => x.fixture === 'kind-service-selector')!;
const observed: unknown[] = [];
let activations = 0;
function report() {
  document.querySelector('#result')!.textContent = JSON.stringify({ observed, activations });
}
const rendered = (id: string) => {
  const article = document.querySelector('article');
  observed.push({ id, connected: article?.isConnected === true, controls: article?.querySelectorAll('[data-ref]').length ?? 0, beforeAnyTap: activations === 0 });
  report();
};
function Harness() {
  const [mounted, setMounted] = useState(false);
  const [display, setDisplay] = useState<'live' | 'collapsed'>('live');
  const item = { id: 'l25-mounted', result: entry.result as never, display, pending: null, sentence: null };
  return <>
    <button onClick={() => { setDisplay('live'); setMounted(true); }}>Mount selector</button>
    <button onClick={() => setDisplay('collapsed')}>Collapse selector</button>
    <button onClick={() => setMounted(false)}>Unmount selector</button>
    <pre id="result">{'{"observed":[],"activations":0}'}</pre>
    {mounted && <WidgetCard item={item} t={tokens(false)} rendered={rendered} activate={() => { activations++; report(); }} />}
  </>;
}
createRoot(document.querySelector('#maya')!).render(<Harness />);
