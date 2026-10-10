// Test-only synthetic port: no HTTP API, grant, database or real account.
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { StandardOnboarding, OnboardingComplete } from '../src/signin/StandardOnboarding.tsx';
import { tokens } from '../src/identity/tokens.ts';
import type { OnboardingPort, OnboardingView } from '../../maya-chat-shell/src/net/types.ts';

let view: OnboardingView = { phase: 'idle', busy: false, failure: null, display: null, trialDays: null, trialEndsAt: null };
const listeners = new Set<() => void>();
let settle: (() => void) | null = null;
const publish = (next: OnboardingView): void => { view = next; listeners.forEach(listener => listener()); };
const fixture = {
  calls: 0, cancels: 0, completed: false, recovered: false, inputsValid: false,
  finish(result: 'completed' | 'uncertain' | 'unavailable' | 'slug_taken' | 'reject') {
    if (result !== 'reject') publish({ ...view, busy: false, phase: result === 'completed' ? 'completed' : result === 'uncertain' ? 'uncertain' : 'failed', failure: result === 'completed' ? null : { reason: result }, display: result === 'completed' ? { tenantName: 'Синтетический бизнес', userName: 'Fixture' } : null, trialDays: result === 'completed' ? 10 : null });
    if (result === 'reject') rejectPending?.(new Error('synthetic failure'));
    else settle?.();
  },
};
let rejectPending: ((error: Error) => void) | null = null;
const port: OnboardingPort = {
  view: () => view,
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  submit(input, confirmed) {
    fixture.calls++;
    fixture.inputsValid = confirmed && ['fixture-manual', 'fixture-corrected'].includes(input.slug) && input.name === 'Синтетический новый бизнес' && input.branchName === 'Тестовый филиал' && input.ownerEmail === 'owner@example.invalid' && input.branchTimezone === 'Europe/Moscow' && input.password === 'Synthetic-Only-42';
    publish({ ...view, phase: 'creating', busy: true, failure: null });
    return new Promise<void>((resolve, reject) => { settle = resolve; rejectPending = reject; });
  },
  cancel() { fixture.cancels++; },
};
const root = createRoot(document.getElementById('root')!);
function App() {
  const current = useSyncExternalStore(port.subscribe, port.view, port.view);
  if (current.phase === 'completed') return <OnboardingComplete view={current} t={tokens(false)} finish={() => { fixture.completed = true; }} />;
  return <StandardOnboarding port={port} t={tokens(false)} back={(slug, email) => { fixture.recovered = slug === 'fixture-manual' && email === 'owner@example.invalid'; root.unmount(); }} />;
}
Object.assign(window, { onboardingFixture: fixture });
root.render(<App />);
