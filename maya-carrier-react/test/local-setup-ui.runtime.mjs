// Synthetic ports for presentation tests only. No HTTP, owner identity or session credentials.
function store(initial) {
  let value = initial;
  const listeners = new Set();
  return { view: () => value, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(next) { value = next; for (const listener of listeners) listener(value); } };
}
const signedOut = { signedIn: false, reason: null };
const idleOnboarding = { phase: 'idle', busy: false, failure: null, display: null, trialDays: null, trialEndsAt: null };
const idleSetup = { phase: 'idle', busy: false, branches: [], connection: null, notice: '', stagedCounts: null, operation: null, canStage: false, canActivate: false, resuming: false };
const auth = store(signedOut), signup = store(idleOnboarding), setup = store(idleSetup);
export const fixture = {
  calls: [], passwordInputMatched: false, stageInputMatched: false, tokenClearedBeforeStage: false,
  reset() { this.calls.length = 0; this.passwordInputMatched = false; this.stageInputMatched = false; this.tokenClearedBeforeStage = false; auth.set(signedOut); signup.set(idleOnboarding); setup.set(idleSetup); },
  setSetup: setup.set,
};
const record = name => { fixture.calls.push(name); };
const unexpected = name => () => { record(name); throw new Error('Unexpected presentation operation'); };
export const session = {
  view: auth.view, subscribe: auth.subscribe, landing: () => ({ state: 'idle' }), onLanding: () => () => {},
  findBusinesses: unexpected('findBusinesses'), startEmail: unexpected('startEmail'), verifyEmail: unexpected('verifyEmail'), startTelegram: unexpected('startTelegram'),
  async signInPassword(slug, email, password) {
    record('password');
    fixture.passwordInputMatched = slug === 'synthetic-local' && email === 'owner@example.invalid' && password === 'Synthetic-Only-42';
    if (!fixture.passwordInputMatched) return { step: 'failed', failure: { state: 'invalid_credentials' } };
    const display = { tenantName: 'Синтетический бизнес', userName: 'Fixture' };
    auth.set({ signedIn: true, display });
    return { step: 'signed_in', display };
  },
  async signOut() { record('signOut'); setup.set(idleSetup); auth.set(signedOut); },
};
export const onboarding = {
  view: signup.view, subscribe: signup.subscribe,
  async submit() { record('signup'); signup.set({ ...idleOnboarding, phase: 'uncertain', failure: { reason: 'uncertain' } }); },
  cancel() {}, finish() { signup.set(idleOnboarding); },
};
export const localCrmSetup = {
  view: setup.view, subscribe: setup.subscribe,
  async load() {
    record('loadBranches'); setup.set({ ...idleSetup, phase: 'loading', busy: true });
    await Promise.resolve();
    setup.set({ ...idleSetup, phase: 'ready', canStage: true, branches: [{ id: 'synthetic-branch', name: 'Синтетический филиал', timezone: 'Europe/Moscow' }], notice: 'Показано сохранённое подключение.' });
  },
  async stage(input, confirmed) {
    record('stage');
    fixture.stageInputMatched = confirmed === true && input.apiToken === 'SYNTHETIC-USER-TOKEN' && input.companyId === '123' && input.branchId === 'synthetic-branch';
    fixture.tokenClearedBeforeStage = document.querySelector('input[aria-label="Пользовательский API-токен YCLIENTS"]').value === '';
    if (!fixture.stageInputMatched) throw new Error('Unexpected synthetic stage input');
    setup.set({ ...setup.view(), phase: 'ready', connection: { tenantId: 'synthetic-tenant', provider: 'yclients', status: 'pending_activation', hasCredentials: true, companyId: '123', branchId: 'synthetic-branch', configVersion: 'a'.repeat(64) }, canActivate: true, notice: 'Подключение сохранено. Активация и импорт требуют отдельного подтверждения.' });
  },
  activate: unexpected('activate'), close() { setup.set(idleSetup); },
};
export const conversation = store({ items: [] });
export const landFragment = () => {};
// The production selector stays in compose. This fixture supplies its two outcomes to actual App.
export const localCrmSetupEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('local_crm_setup') === '1';
