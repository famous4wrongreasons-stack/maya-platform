// Local presentation preview only. No registration transport or auth owner.
import { createRoot } from 'react-dom/client';
import { StandardOnboarding } from '../src/signin/StandardOnboarding.tsx';
import { tokens } from '../src/identity/tokens.ts';
import type { OnboardingPort, OnboardingView } from '../../maya-chat-shell/src/net/types.ts';

let view: OnboardingView = { phase: 'idle', busy: false, failure: null, display: null, trialDays: null, trialEndsAt: null };
const listeners = new Set<() => void>();
const port: OnboardingPort = {
  view: () => view, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async submit() { view = { ...view, phase: 'failed', failure: { reason: 'closed' } }; listeners.forEach(listener => listener()); },
  cancel() {},
};
const root = createRoot(document.getElementById('root')!);
let revision = 0;
function render(): void {
  root.render(<>
    <aside style={{ position: 'absolute', inset: '0 0 auto', padding: '12px 20px', boxSizing: 'border-box', fontFamily: 'system-ui', fontSize: 14, lineHeight: '20px', background: '#18160f', color: '#f4f0eb' }}>Предпросмотр формы · только вымышленные данные.<br />Бизнес не создаётся. YCLIENTS не подключается.</aside>
    <div style={{ position: 'absolute', inset: '104px 0 0' }}><StandardOnboarding key={revision} port={port} t={tokens(false)} back={() => { view = { ...view, phase: 'idle', failure: null }; revision++; render(); }} /></div>
  </>);
}
render();
