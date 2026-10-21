import assert from 'node:assert/strict';
import test from 'node:test';
import { projectOwnConsents } from '../src/net/own-consents.ts';
import { createOwnConsents } from '../src/shell/own-consents.ts';
import { createTransport } from '../src/net/client.ts';
const start = Date.parse('2026-10-21T10:00:00.000Z');
const source = () => ({ contract: 'maya.privacy.own-consents/1', asOf: new Date(start).toISOString(), expiresAt: new Date(start + 300_000).toISOString(), consents: [
  { kind: 'privacy', state: 'GRANTED', invalidated: false, recordedAt: new Date(start).toISOString(), effectiveAt: new Date(start).toISOString() },
  { kind: 'marketing', state: 'NEVER_ASKED', invalidated: false, recordedAt: null, effectiveAt: null },
], registerExport: { available: false, reason: 'STEP_UP_UNAVAILABLE' } });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('registered network path is only a no-store own GET; 401 refresh stays bound to the current session', async () => {
  const original = globalThis.fetch, calls = [];
  let refresh = 0;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(calls.length === 1 ? {} : source()), { status: calls.length === 1 ? 401 : 200 }); };
  try {
    const transport = createTransport({ authorize: async () => ({ kind: 'bearer', serial: 1, bearer: 'synthetic' }), reauthorize: async () => { refresh++; return { kind: 'bearer', serial: 2, bearer: 'fresh' }; }, refused() {} });
    const result = await transport.ownConsents(new AbortController().signal);
    assert.equal(result.ok, true); assert.equal(refresh, 1); assert.equal(calls.length, 2);
    for (const { url, init } of calls) { assert.equal(url, '/api/privacy/consents'); assert.equal(init.method, 'GET'); assert.equal(init.body, null); assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); }
    assert.deepEqual(calls[1].init.headers, { Authorization: 'Bearer fresh' });
  } finally { globalThis.fetch = original; }
});

test('wire projection keeps two qualified own consent facts, never raw subject/provenance', () => {
  const value = source(); value.clientId = 'private'; value.consents[0].sourceIdentityHash = 'secret';
  const projected = projectOwnConsents(value);
  assert.ok(projected); assert.doesNotMatch(JSON.stringify(projected), /private|secret|clientId|sourceIdentityHash/);
  assert.equal(projected.consents[0].state, 'GRANTED');
});
test('malformed, incomplete, contradictory, overlong-lived or falsely enabled export response is refused', () => {
  for (const mutate of [ v => v.consents.pop(), v => v.consents[1].kind = 'privacy', v => v.consents[0].invalidated = true, v => v.consents[0].effectiveAt = null, v => v.consents[1].recordedAt = v.asOf, v => v.expiresAt = new Date(start + 300_001).toISOString(), v => v.registerExport.available = true, v => v.contract = 'fake' ]) {
    const value = source(); mutate(value); assert.equal(projectOwnConsents(value), null);
  }
  const v = source(); Object.defineProperty(v, 'consents', { get() { throw new Error('getter must not execute'); } });
  assert.equal(projectOwnConsents(v), null);
});
function setup() {
  let signedIn = true, primary = 'shell.root', now = start;
  const sl = new Set(), nl = new Set(), timers = [], calls = [];
  const port = createOwnConsents({
    transport: { ownConsents: signal => new Promise(resolve => calls.push({ signal, resolve })) },
    session: { view: () => ({ signedIn }), subscribe: fn => (sl.add(fn), () => sl.delete(fn)) },
    shell: { view: () => ({ primary }), subscribe: fn => (nl.add(fn), () => nl.delete(fn)) },
    scheduler: { now: () => now, after: (ms, fn) => { const t = { ms, fn, active: true }; timers.push(t); return () => { t.active = false; }; } },
    newAbort: () => new AbortController(),
  });
  return { port, calls, timers, route(p) { primary = p; for (const fn of nl) fn(); }, session(value) { signedIn = value; for (const fn of sl) fn({ signedIn }); }, advance(ms) { now += ms; for (const t of timers) if (t.active && t.ms <= ms) { t.active = false; t.fn(); } } };
}
test('privacy route loads once; expiry removes facts and refresh is explicit, with no export/control request', async () => {
  const s = setup(); assert.equal(s.calls.length, 0); s.route('shell.privacy'); assert.equal(s.calls.length, 1);
  s.calls[0].resolve({ ok: true, value: projectOwnConsents(source()) }); await flush();
  assert.equal(s.port.view().phase, 'ready'); assert.equal(s.port.view().consents.length, 2);
  s.advance(300_000); assert.equal(s.port.view().phase, 'expired'); assert.equal(s.port.view().consents.length, 0); assert.equal(s.calls.length, 1);
  void s.port.refresh(); assert.equal(s.calls.length, 2); s.port.dispose();
});
test('navigation/sign-out/tenant session replacement abort and fence late results, including transports ignoring abort', async () => {
  for (const action of [s => s.route('shell.root'), s => s.session(false), s => s.session(true)]) {
    const s = setup(); s.route('shell.privacy'); const first = s.calls[0]; action(s);
    assert.equal(first.signal.aborted, true); first.resolve({ ok: true, value: projectOwnConsents(source()) }); await flush();
    assert.notEqual(s.port.view().phase, 'ready'); assert.equal(s.port.view().consents.length, 0); s.port.dispose();
  }
});
test('expired or future-dated result and invalid_response never become visible or auto retry', async () => {
  for (const result of [{ ok: true, value: { ...projectOwnConsents(source()), expiresAt: new Date(start).toISOString() } }, { ok: true, value: { ...projectOwnConsents(source()), asOf: new Date(start + 1).toISOString() } }, { ok: false, failure: { reason: 'invalid_response' } }]) {
    const s = setup(); s.route('shell.privacy'); s.calls[0].resolve(result); await flush();
    assert.equal(s.port.view().phase, 'failed'); assert.equal(s.port.view().consents.length, 0); assert.equal(s.calls.length, 1); s.port.dispose();
  }
});
