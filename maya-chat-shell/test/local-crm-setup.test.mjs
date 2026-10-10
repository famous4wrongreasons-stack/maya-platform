// Synthetic contracts only: no HTTP server, provider, database or model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/net/client.ts';
import { projectCrmSetup } from '../src/net/crm-setup.ts';
import { createLocalCrmSetup } from '../src/shell/local-crm-setup.ts';

const key = '12345678-abcd-4def-8abc-123456789abc';
const input = { apiToken: 'synthetic-user-token', companyId: '12345', branchId: 'branch-owned' };
const rawConnection = { id: 'integration', tenant_id: 'tenant-owned', updated_at: '2026-10-10T10:00:00Z', provider: 'yclients', status: 'pending_activation', has_credentials: true,
  settings_json: { companyId: 12345, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 12345, branchId: 'branch-owned' } } };
const raw = { connection: rawConnection, preview: { services: { count: 4, items: ['PRIVATE'] }, staff: { count: 2 }, company: 'PRIVATE' } };
const snapshot = () => projectCrmSetup(raw);
const branch = { id: 'branch-owned', name: 'Синтетический филиал', timezone: 'Europe/Moscow' };
const ok = value => ({ ok: true, value });
const fail = reason => ({ ok: false, failure: { reason } });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const signal = () => new AbortController().signal;
async function wire(handler, run, extra = {}) {
  const calls = [], saved = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return handler(calls.at(-1), calls.length); };
  const auth = { authorize: async () => ({ kind: 'bearer', bearer: 'synthetic-first', serial: 1 }), reauthorize: async () => { throw Error('unexpected refresh'); }, refused() {}, ...extra };
  try { await run(createTransport(auth, { requestMs: 1000, transcribeMs: 1000 }), calls); } finally { globalThis.fetch = saved; }
}
function fixture({ enabled = true, connection = null, ...overrides } = {}) {
  let signedIn = true, stored = { connection, counts: null };
  const sessionListeners = new Set(), calls = [];
  const transport = {
    crmSetupStatus: async () => { calls.push('status'); return ok(stored); },
    personalBranches: async () => { calls.push('branches'); return ok([branch]); },
    crmSetupStage: async (_input, _key) => { calls.push('stage'); stored = snapshot(); return ok(stored); },
    ...overrides,
  };
  const port = createLocalCrmSetup({ enabled, transport, newAbort: () => new AbortController(), newId: () => key,
    session: { view: () => ({ signedIn }), subscribe: listener => { sessionListeners.add(listener); return () => sessionListeners.delete(listener); } } });
  return { port, calls, transport, store(value) { stored = value; }, revoke() { signedIn = false; for (const fn of sessionListeners) fn({ signedIn: false }); } };
}

test('projection drops raw previews, errors and secrets, and refuses incomplete public metadata', () => {
  const projected = projectCrmSetup({ ...raw, apiToken: 'PRIVATE', error: 'PRIVATE', connection: { ...rawConnection, encryptedApiToken: 'PRIVATE' } });
  assert.equal(JSON.stringify(projected).includes('PRIVATE'), false);
  assert.deepEqual(projected.counts, { services: 4, staff: 2 });
  for (const value of [null, {}, { connection: {} }, { connection: { ...rawConnection, tenant_id: null } }, { connection: { ...rawConnection, updated_at: 'bad' } }]) assert.equal(projectCrmSetup(value), null);
  const mismatched = projectCrmSetup({ connection: { ...rawConnection, settings_json: { ...rawConnection.settings_json, companyId: 999 } } });
  assert.equal(mismatched.connection.branchId, null);
});

test('wire uses exact owned paths, fresh body, idempotency and public response projection', async () => {
  await wire(() => response(raw), async (net, calls) => {
    await net.crmSetupStatus(signal());
    await net.crmSetupStage({ ...input, tenantId: 'foreign', baseUrl: 'https://invalid.test', role: 'admin' }, key, signal());
    assert.deepEqual(calls.map(c => [c.url, c.method]), [['/api/integrations/crm', 'GET'], ['/api/integrations/crm/connect', 'POST']]);
    assert.equal(calls[0].body, null);
    assert.equal(calls[0].headers['Idempotency-Key'], undefined);
    assert.deepEqual(JSON.parse(calls[1].body), { provider: 'yclients', apiToken: input.apiToken, settingsJson: { companyId: 12345, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 12345, branchId: input.branchId } } });
    for (const c of calls.slice(1)) { assert.equal(c.headers['Idempotency-Key'], key); assert.equal(c.credentials, 'omit'); assert.equal(c.redirect, 'error'); assert.equal(c.cache, 'no-store'); }
  });
});

test('invalid company/token/key/branch does no authorization or I/O', async () => {
  await wire(() => { throw Error('unexpected fetch'); }, async (net, calls) => {
    for (const value of ['0', '-1', '1e3', '9007199254740992', '', '1\n']) assert.deepEqual(await net.crmSetupStage({ ...input, companyId: value }, key, signal()), fail('invalid'));
    for (const value of ['', ' '.repeat(10), 'x'.repeat(4097)]) assert.deepEqual(await net.crmSetupStage({ ...input, apiToken: value }, key, signal()), fail('invalid'));
    assert.deepEqual(await net.crmSetupStage({ ...input, branchId: '' }, key, signal()), fail('invalid'));
    assert.deepEqual(await net.crmSetupStage(input, 'bad\r\nkey', signal()), fail('invalid'));
    assert.equal(calls.length, 0);
  }, { authorize: async () => { throw Error('unexpected authorize'); } });
});

test('401 refresh is bounded and keeps the exact write idempotency/body', async () => {
  let refreshes = 0;
  await wire((_call, n) => response(n === 1 ? {} : raw, n === 1 ? 401 : 200), async (net, calls) => {
    assert.equal((await net.crmSetupStage(input, key, signal())).ok, true);
    assert.equal(calls.length, 2); assert.equal(calls[0].body, calls[1].body);
    assert.equal(calls[1].headers['Idempotency-Key'], key);
    assert.equal(calls[1].headers.Authorization, 'Bearer synthetic-second');
  }, { reauthorize: async () => { refreshes++; return { kind: 'bearer', bearer: 'synthetic-second', serial: 2 }; } });
  assert.equal(refreshes, 1);
});

test('lost/malformed/server/conflict write result stays uncertain with no resend; 403 is blocked', async () => {
  for (const [handler, reason] of [[() => { throw Error('PRIVATE'); }, 'uncertain'], [() => response({ privateError: 'PRIVATE' }), 'uncertain'], [() => response({}, 500), 'uncertain'], [() => response({}, 409), 'uncertain'], [() => response({}, 403), 'forbidden']]) {
    await wire(handler, async (net, calls) => { assert.deepEqual(await net.crmSetupStage(input, key, signal()), fail(reason)); assert.equal(calls.length, 1); });
  }
});

test('default disabled and render/session subscription produce no calls', async () => {
  const f = fixture({ enabled: false });
  await f.port.load(); await f.port.stage(input, true);
  assert.deepEqual(f.calls, []); assert.equal(f.port.view().phase, 'idle'); f.port.dispose();
});

test('load is local reads only; each write needs confirmation and revalidates saved connection/branch', async () => {
  const f = fixture(); assert.deepEqual(f.calls, []);
  await f.port.load(); assert.deepEqual(f.calls, ['status', 'branches']);
  await f.port.stage(input, false); await f.port.stage({ ...input, branchId: 'foreign' }, true); assert.equal(f.calls.length, 2);
  await f.port.stage(input, true);
  assert.deepEqual(f.calls, ['status', 'branches', 'status', 'branches', 'stage']);
  assert.equal(f.port.view().connection.status, 'pending_activation');
  assert.equal(JSON.stringify(f.port.view()).includes(input.apiToken), false);
  assert.equal(f.port.activate, undefined); f.port.dispose();
});

test('changed connection, removed branch and foreign tenant response cannot become activation authority', async () => {
  for (const change of ['connection', 'branch', 'foreign']) {
    const f = fixture({ connection: snapshot().connection }); await f.port.load();
    if (change === 'connection') f.store({ connection: { ...snapshot().connection, updatedAt: '2026-10-10T11:00:00Z' }, counts: null });
    if (change === 'branch') f.transport.personalBranches = async () => ok([]);
    if (change === 'foreign') f.transport.crmSetupStage = async () => ok({ connection: { ...snapshot().connection, tenantId: 'foreign' }, counts: null });
    await f.port.stage(input, true);
    assert.equal(f.port.view().phase, change === 'foreign' ? 'uncertain' : 'blocked');
    assert.equal(f.calls.includes('activate'), false); f.port.dispose();
  }
});

test('other provider never replaced; adapter exposes no activation authority', async () => {
  const f = fixture({ connection: { ...snapshot().connection, provider: 'other' } }); await f.port.load();
  await f.port.stage(input, true); assert.equal(f.calls.includes('stage'), false);
  assert.equal(f.port.activate, undefined); f.port.dispose();
});

test('uncertain latch survives status read, close and re-entry; status is not a terminal receipt', async () => {
  const f = fixture({ crmSetupStage: async () => fail('uncertain') }); await f.port.load(); await f.port.stage(input, true);
  assert.equal(f.port.view().phase, 'uncertain'); const before = f.calls.length;
  await f.port.stage(input, true); assert.equal(f.calls.length, before);
  await f.port.load(); assert.equal(f.port.view().phase, 'uncertain');
  f.port.close(); await f.port.load(); assert.equal(f.port.view().phase, 'uncertain');
  const after = f.calls.length; await f.port.stage(input, true); assert.equal(f.calls.length, after); f.port.dispose();
});

test('double submit is single flight; signout aborts and ignores late staged response', async () => {
  let finish, capturedSignal;
  const f = fixture({ crmSetupStage: async (_input, _key, signal) => { capturedSignal = signal; return new Promise(resolve => { finish = resolve; }); } });
  await f.port.load(); const flight = f.port.stage(input, true);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  const before = f.calls.length; await f.port.stage(input, true); assert.equal(f.calls.length, before);
  f.revoke(); assert.equal(capturedSignal.aborted, true); finish(ok(snapshot())); await flight;
  assert.equal(f.port.view().phase, 'uncertain'); assert.equal(f.port.view().connection, null); f.port.dispose();
});

test('restart reconstructs only public persisted metadata through explicit read; revocation stops before writes', async () => {
  const f = fixture({ connection: snapshot().connection }); assert.equal(f.port.view().connection, null);
  await f.port.load(); assert.equal(f.port.view().connection.branchId, input.branchId);
  f.transport.crmSetupStatus = async () => fail('forbidden'); await f.port.stage(input, true);
  assert.equal(f.port.view().phase, 'blocked'); assert.equal(f.port.view().connection, null); assert.equal(f.calls.includes('activate'), false); f.port.dispose();
});
