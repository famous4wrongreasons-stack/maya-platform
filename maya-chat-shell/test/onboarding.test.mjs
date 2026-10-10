// Synthetic wire contracts; no server, provider, database, SMTP or model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNet } from '../src/net/session.ts';
import { onboardingInput, projectTrialActivation, projectTrialSignup, trialSignupBody } from '../src/net/onboarding.ts';
const now = Date.parse('2026-10-10T12:00:00Z');
const input = { name: 'Синтетический бизнес', slug: 'synthetic-salon', ownerEmail: 'owner@example.invalid', password: 'synthetic-password', branchName: 'Первый филиал', branchTimezone: 'Europe/Moscow' };
const activationRaw = { activation_id: 'activation-owned', activation_token: 'a'.repeat(43), status: 'pending', source: 'web', expires_at: '2026-10-11T12:00:00Z', trial_days: 10, trial_starts_when: 'registration_completed', counted_as_connected_business: false };
const activation = projectTrialActivation(activationRaw);
const signup = () => ({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 900, refresh_expires_at: '2026-11-10T12:00:00Z', token_type: 'Bearer',
  user: { id: 'p5o_owner', tenant_id: 'p5t_tenant', branch_id: 'p5b_branch', email: input.ownerEmail, role: 'tenant_owner', status: 'active', name: null, tenant: null, branch: null },
  tenant: { id: 'p5t_tenant', name: input.name, slug: input.slug, calendar_source: 'external', status: 'trial' },
  trial_activation: { activation_id: activation.id, status: 'completed', counted_as_connected_business: true }, trial: { days: 10, ends_at: '2026-10-20T12:00:00Z', full_access: true }, calendar_source: 'external', booking_mode: 'preview', next_step: 'connect_crm' });
const login = () => { const raw = signup(); return { ...raw, user: { ...raw.user, tenant: raw.tenant } }; };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function wire(handler, run) {
  const old = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { const call = { url, ...options }; calls.push(call); return handler(call, calls.length); };
  const net = createNet({ now: () => now, timeouts: { requestMs: 1000, transcribeMs: 1000 } });
  try { await run(net, calls); } finally { net.onboarding.dispose(); globalThis.fetch = old; }
}
const paths = calls => calls.map(call => new URL(call.url, 'https://example.invalid').pathname);
async function waitFor(check) { for (let i = 0; i < 30; i++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)); } assert.fail('Expected bounded async transition'); }

test('closed normalized body includes chosen password/external source, excludes injected authority/config', () => {
  const parsed = onboardingInput({ ...input, name: '  Бизнес  ', ownerEmail: ' OWNER@EXAMPLE.INVALID ', role: 'god', planId: 'bad', industryPresetId: 'bad' });
  assert.equal(parsed.ok, true); assert.equal(parsed.value.name, 'Бизнес'); assert.equal(parsed.value.ownerEmail, input.ownerEmail);
  assert.deepEqual(Object.keys(trialSignupBody(parsed.value, activation.token)).sort(), ['branchName', 'branchTimezone', 'calendarSource', 'name', 'ownerEmail', 'password', 'slug', 'trialActivationToken']);
  for (const password of ['', '1234567', ' 12345678', '12345678 ']) assert.deepEqual(onboardingInput({ ...input, password }), { ok: false, failure: { reason: 'invalid', field: 'password' } });
  assert.equal(onboardingInput({ ...input, branchTimezone: 'Unknown/Zone' }).ok, false);
});

test('real serializer shape allows null nested relations, validates activation and owner/tenant/branch facts', () => {
  assert.ok(projectTrialSignup(signup(), input, activation));
  const changes = [r => r.trial_activation.activation_id = 'foreign', r => r.user.tenant_id = 'foreign', r => r.user.branch_id = null, r => r.user.branch_id = '', r => r.user.status = 'blocked', r => r.user.role = 'business_owner', r => r.user.email = 'other@example.invalid', r => r.tenant.slug = 'other', r => r.calendar_source = 'internal', r => r.tenant.calendar_source = 'internal', r => r.next_step = 'chat', r => r.trial.days = 99];
  for (const change of changes) { const raw = signup(); change(raw); assert.equal(projectTrialSignup(raw, input, activation), null); }
  for (const patch of [{ status: 'completed' }, { source: 'partner' }, { activation_token: 'short' }, { expires_at: 'bad' }]) assert.equal(projectTrialActivation({ ...activationRaw, ...patch }), null);
});

test('explicit consent starts exactly two canonical requests; single flight; grant remains private', async () => {
  const pause = deferred();
  await wire((_, count) => count === 1 ? pause.promise : response(signup()), async (net, calls) => {
    const snapshots = []; net.onboarding.subscribe(value => snapshots.push(value));
    net.onboarding.view(); assert.equal(calls.length, 0);
    await net.onboarding.submit(input, false); assert.equal(calls.length, 0);
    const pending = net.onboarding.submit(input, true); await net.onboarding.submit(input, true);
    assert.equal(calls.length, 1); pause.resolve(response(activationRaw)); await pending;
    assert.deepEqual(paths(calls), ['/api/onboarding/trial-activations', '/api/onboarding/trial']);
    assert.deepEqual(JSON.parse(calls[0].body), { source: 'web' });
    assert.deepEqual(JSON.parse(calls[1].body), trialSignupBody(input, activation.token));
    for (const call of calls) { assert.equal(call.credentials, 'omit'); assert.equal(call.headers.Authorization, undefined); }
    assert.equal(net.session.view().signedIn, true); assert.equal(net.onboarding.view().phase, 'completed');
    assert.equal(net.onboarding.view().display.tenantName, input.name);
    assert.doesNotMatch(JSON.stringify(snapshots), /synthetic-access|synthetic-refresh|synthetic-password|activation-owned|full_access|widgets.runtime/);
    net.onboarding.cancel(); assert.equal(net.onboarding.view().phase, 'completed');
    net.onboarding.finish(); assert.equal(net.onboarding.view().phase, 'idle');
  });
});

test('invalid password makes zero requests and reports finite field', async () => {
  await wire(() => assert.fail('No dispatch'), async net => {
    await net.onboarding.submit({ ...input, password: ' password ' }, true);
    assert.deepEqual(net.onboarding.view().failure, { reason: 'invalid', field: 'password' });
    assert.equal(net.session.view().signedIn, false);
  });
});

for (const mode of ['network', '500', '403', 'malformed', 'foreign', 'expired-refresh', 'invalid-refresh', 'expired-trial']) {
  test(`signup ${mode} is uncertain, never retries creation even after close; ordinary password login recovers`, async () => {
    await wire(call => {
      if (call.url.endsWith('/trial-activations')) return response(activationRaw);
      if (call.url.endsWith('/auth/login')) return response(login());
      if (mode === 'network') throw new TypeError('PRIVATE network');
      if (mode === '500' || mode === '403') return response({ message: 'PRIVATE' }, Number(mode));
      if (mode === 'malformed') return response({});
      const raw = signup();
      if (mode === 'foreign') raw.user.tenant_id = 'foreign';
      if (mode === 'expired-refresh') raw.refresh_expires_at = '2026-10-09T00:00:00Z';
      if (mode === 'invalid-refresh') raw.refresh_expires_at = 'nonsense';
      if (mode === 'expired-trial') raw.trial.ends_at = '2026-10-09T00:00:00Z';
      return response(raw);
    }, async (net, calls) => {
      await net.onboarding.submit(input, true);
      assert.equal(net.onboarding.view().phase, 'uncertain'); assert.equal(net.session.view().signedIn, false);
      assert.doesNotMatch(JSON.stringify(net.onboarding.view()), /PRIVATE/);
      net.onboarding.cancel(); await net.onboarding.submit({ ...input, slug: 'another' }, true);
      assert.equal(calls.length, 2);
      assert.equal((await net.session.signInPassword(input.slug, input.ownerEmail, input.password)).step, 'signed_in');
      assert.equal(net.session.view().signedIn, true); assert.equal(calls.length, 3);
    });
  });
}

test('expired activation never dispatches signup and can be explicitly restarted', async () => {
  await wire(() => response({ ...activationRaw, expires_at: '2026-10-09T00:00:00Z' }), async (net, calls) => {
    await net.onboarding.submit(input, true); assert.equal(calls.length, 1);
    assert.deepEqual(net.onboarding.view().failure, { reason: 'expired' });
    await net.onboarding.submit(input, true); assert.equal(calls.length, 2);
  });
});

for (const stop of ['cancel', 'signout', 'dispose', 'password', 'email', 'telegram']) {
  test(`${stop} during pending signup prevents late grant/completion and preserves uncertainty`, async () => {
    const pause = deferred();
    await wire(call => {
      if (call.url.endsWith('/trial-activations')) return response(activationRaw);
      if (call.url.endsWith('/trial')) return pause.promise;
      if (call.url.endsWith('/auth/login')) return response({ ...login(), user: { ...login().user, tenant: { name: 'Другой бизнес' } } });
      return response({ next_step: 'verify_email_code' });
    }, async (net, calls) => {
      const pending = net.onboarding.submit(input, true); await waitFor(() => calls.length === 2);
      if (stop === 'cancel') net.onboarding.cancel();
      if (stop === 'signout') await net.session.signOut();
      if (stop === 'dispose') net.onboarding.dispose();
      if (stop === 'password') await net.session.signInPassword('other', input.ownerEmail, input.password);
      if (stop === 'email') await net.session.startEmail(input.ownerEmail);
      if (stop === 'telegram') await net.session.startTelegram('other');
      pause.resolve(response(signup())); await pending;
      assert.equal(net.onboarding.view().phase, 'uncertain');
      assert.equal(net.session.view().signedIn, stop === 'password');
      if (stop === 'password') assert.equal(net.session.view().display.tenantName, 'Другой бизнес');
      await net.onboarding.submit(input, true); assert.equal(paths(calls).filter(path => path.endsWith('/trial')).length, 1);
    });
  });
}

for (const later of ['before-signup-completion', 'after-signup-completion']) {
  test(`older pending password login cannot replace newer signup ${later}`, async () => {
    const oldLogin = deferred(), pendingSignup = deferred();
    await wire(call => call.url.endsWith('/auth/login') ? oldLogin.promise : call.url.endsWith('/trial') ? pendingSignup.promise : response(activationRaw), async (net, calls) => {
      const old = net.session.signInPassword('other', input.ownerEmail, input.password);
      const next = net.onboarding.submit(input, true); await waitFor(() => calls.length === 3);
      if (later === 'before-signup-completion') { oldLogin.resolve(response(login())); assert.equal((await old).step, 'failed'); }
      pendingSignup.resolve(response(signup())); await next;
      if (later === 'after-signup-completion') { oldLogin.resolve(response(login())); assert.equal((await old).step, 'failed'); }
      assert.equal(net.onboarding.view().phase, 'completed'); assert.equal(net.session.view().signedIn, true);
    });
  });
}

test('cancel before activation response prevents signup; publication cancellation prevents all dispatch', async () => {
  const pause = deferred();
  await wire(() => pause.promise, async (net, calls) => {
    const pending = net.onboarding.submit(input, true); net.onboarding.cancel(); pause.resolve(response(activationRaw)); await pending;
    assert.equal(calls.length, 1); assert.equal(net.onboarding.view().phase, 'idle');
    const stop = net.onboarding.subscribe(view => { if (view.phase === 'creating') net.onboarding.cancel(); });
    await net.onboarding.submit(input, true); stop(); assert.equal(calls.length, 1);
  });
});

test('signout on successful session publication cannot be followed by stale completed onboarding', async () => {
  await wire(call => response(call.url.endsWith('/trial-activations') ? activationRaw : signup()), async net => {
    net.session.subscribe(view => { if (view.signedIn) void net.session.signOut(); });
    await net.onboarding.submit(input, true);
    assert.equal(net.session.view().signedIn, false); assert.notEqual(net.onboarding.view().phase, 'completed');
  });
});


test('successful session publication may synchronously unmount the form without losing completion', async () => {
  await wire(call => response(call.url.endsWith('/trial-activations') ? activationRaw : signup()), async net => {
    net.session.subscribe(view => { if (view.signedIn) net.onboarding.cancel(); });
    await net.onboarding.submit(input, true);
    assert.equal(net.session.view().signedIn, true); assert.equal(net.onboarding.view().phase, 'completed');
  });
});
test('dispose on successful session publication suppresses completion', async () => {
  await wire(call => response(call.url.endsWith('/trial-activations') ? activationRaw : signup()), async net => {
    net.session.subscribe(view => { if (view.signedIn) net.onboarding.dispose(); });
    await net.onboarding.submit(input, true);
    assert.notEqual(net.onboarding.view().phase, 'completed');
  });
});
