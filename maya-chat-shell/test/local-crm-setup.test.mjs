// Synthetic public contracts only: no HTTP server, provider, database or model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/net/client.ts';
import { projectCrmSetup, projectCrmOperation } from '../src/net/crm-setup.ts';
import { createLocalCrmSetup } from '../src/shell/local-crm-setup.ts';

const key = '12345678-abcd-4def-8abc-123456789abc';
const nextKey = '23456789-abcd-4def-8abc-123456789abc';
const version = 'a'.repeat(64), changedVersion = 'b'.repeat(64);
const input = { apiToken: 'synthetic-user-token', companyId: '12345', branchId: 'branch-owned' };
const install = { ...input, expectedVersion: null };
const rawConnection = { id: 'integration', tenant_id: 'tenant-owned', updated_at: '2026-10-10T10:00:00Z', configVersion: version, provider: 'yclients', status: 'pending_activation', has_credentials: true,
  settings_json: { companyId: 12345, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 12345, branchId: 'branch-owned' } } };
const raw = { connection: rawConnection, preview: { services: { count: 4, items: ['PRIVATE'] }, staff: { count: 2 }, company: 'PRIVATE' } };
const snapshot = (patch = {}) => projectCrmSetup({ ...raw, connection: { ...rawConnection, ...patch } });
const branch = { id: 'branch-owned', name: 'Синтетический филиал', timezone: 'Europe/Moscow' };
const locator = (operation = 'install', requestId = key) => ({ operation, requestId });
function operationRaw(operation = 'install', { status = 'SUCCEEDED', requestId = key, configVersion = version, matches = true, phase, receiptPhase, ...patch } = {}) {
  const receipt = status === 'SUCCEEDED' || receiptPhase ? {
    contract: 'maya.crm-operation-receipt/1', operation, requestId,
    phase: receiptPhase ?? (operation === 'install' ? 'installed' : 'import_confirmed'),
    configVersion, executionId: '34567890-abcd-4def-8abc-123456789abc', atomicProjection: (receiptPhase ?? (operation === 'install' ? 'installed' : 'import_confirmed')) === 'import_confirmed',
  } : null;
  return { contract: 'maya.crm-operation-status/1', operation, requestId, status,
    phase: phase ?? (status === 'SUCCEEDED' ? null : operation), receipt,
    current: { configVersion, matchesCurrentVersion: !!receipt && matches }, ...patch };
}
const operation = (kind = 'install', options = {}) => projectCrmOperation(operationRaw(kind, options), locator(kind, options.requestId ?? key));
const completed = (kind = 'install', options = {}, snapshotPatch = {}) => ({
  snapshot: snapshot({ ...(kind === 'activate' ? { status: 'active' } : {}), ...snapshotPatch }), operation: operation(kind, options),
});
const completionRaw = (kind = 'install', options = {}) => ({ ...raw, connection: { ...rawConnection, status: kind === 'activate' ? 'active' : 'pending_activation' }, ...operationRaw(kind, options) });
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
function pendingStore(initial = null) {
  let value = initial;
  const events = [];
  return {
    events, read: () => value,
    save(next) { events.push(['save', { ...next }]); if (value !== null) return false; value = { ...next }; return true; },
    clear(expected) { events.push(['clear', { ...expected }]); if (!value || value.operation !== expected.operation || value.requestId !== expected.requestId) return false; value = null; return true; },
  };
}
function fixture({ enabled = true, connection = null, pending = pendingStore(), ...overrides } = {}) {
  let signedIn = true, stored = { connection, counts: null }, keyIndex = 0;
  const sessionListeners = new Set(), calls = [], writes = [], receipts = [];
  const defaults = {
    crmSetupStatus: async () => ok(stored),
    personalBranches: async () => ok([branch]),
    crmSetupStage: async (_input, requestId) => { const result = completed('install', { requestId }); stored = result.snapshot; return ok(result); },
    crmSetupActivate: async (_version, requestId) => { const result = completed('activate', { requestId }); stored = result.snapshot; return ok(result); },
    crmSetupOperation: async current => ok(operation(current.operation, { requestId: current.requestId, status: 'NOT_OBSERVED' })),
  };
  const transport = {};
  for (const [method, handler] of Object.entries({ ...defaults, ...overrides })) transport[method] = async (...args) => {
    const name = { crmSetupStatus: 'status', personalBranches: 'branches', crmSetupStage: 'stage', crmSetupActivate: 'activate', crmSetupOperation: 'operation' }[method];
    calls.push(name);
    if (name === 'stage' || name === 'activate') writes.push({ kind: name, material: args[0], key: args[1], signal: args[2] });
    if (name === 'operation') receipts.push({ ...args[0] });
    return handler(...args);
  };
  const port = createLocalCrmSetup({ enabled, transport, pending, newAbort: () => new AbortController(), newId: () => [key, nextKey][keyIndex++],
    session: { view: () => ({ signedIn }), subscribe: listener => { sessionListeners.add(listener); return () => sessionListeners.delete(listener); } } });
  return { port, calls, writes, receipts, pending, transport, keysMinted: () => keyIndex,
    store(value) { stored = value; }, session(value) { signedIn = value; for (const fn of sessionListeners) fn({ signedIn }); } };
}

test('public projection drops raw previews/secrets and requires a valid configVersion', () => {
  const projected = projectCrmSetup({ ...raw, apiToken: 'PRIVATE', error: 'PRIVATE', connection: { ...rawConnection, encryptedApiToken: 'PRIVATE' } });
  assert.equal(JSON.stringify(projected).includes('PRIVATE'), false);
  assert.deepEqual(projected.counts, { services: 4, staff: 2 });
  assert.equal(projected.connection.configVersion, version);
  for (const value of [null, {}, { connection: {} }, { connection: { ...rawConnection, tenant_id: null } }, { connection: { ...rawConnection, updated_at: 'bad' } }, ...[undefined, '', 'A'.repeat(64), 'a'.repeat(63)].map(configVersion => ({ connection: { ...rawConnection, configVersion } }))]) assert.equal(projectCrmSetup(value), null);
  assert.deepEqual(projectCrmSetup({ configured: false, connection: null }), { connection: null, counts: null });
  const mismatched = projectCrmSetup({ connection: { ...rawConnection, settings_json: { ...rawConnection.settings_json, companyId: 999 } } });
  assert.equal(mismatched.connection.branchId, null);
});

test('operation projection binds the exact locator and refuses unqualified import success', () => {
  assert.equal(operation('activate').receipt.phase, 'import_confirmed');
  assert.equal(JSON.stringify(projectCrmOperation({ ...operationRaw(), privateError: 'PRIVATE' }, locator())).includes('PRIVATE'), false);
  for (const rawStatus of [
    { ...operationRaw(), requestId: nextKey }, { ...operationRaw(), operation: 'activate' },
    { ...operationRaw(), receipt: null }, { ...operationRaw(), current: { configVersion: changedVersion, matchesCurrentVersion: true } },
    { ...operationRaw(), receipt: { ...operationRaw().receipt, requestId: nextKey } },
    { ...operationRaw(), receipt: { ...operationRaw().receipt, executionId: 'not-an-execution-id' } },
    { ...operationRaw(), receipt: { ...operationRaw().receipt, atomicProjection: true } },
    { ...operationRaw(), receipt: { ...operationRaw().receipt, phase: 'activated' } },
  ]) assert.equal(projectCrmOperation(rawStatus, locator()), null);
  for (const receipt of [
    { ...operationRaw('activate').receipt, phase: 'activated' },
    { ...operationRaw('activate').receipt, atomicProjection: false },
  ]) assert.equal(projectCrmOperation({ ...operationRaw('activate'), receipt }, locator('activate')), null);
});

test('wire sends versioned closed bodies and exact operation GET without authority in query', async () => {
  await wire(call => response(call.url.includes('/operation?') ? operationRaw() : call.url.endsWith('/activate') ? completionRaw('activate') : call.url.endsWith('/connect') ? completionRaw() : raw), async (net, calls) => {
    assert.equal((await net.crmSetupStatus(signal())).ok, true);
    assert.equal((await net.crmSetupStage({ ...install, tenantId: 'foreign', baseUrl: 'https://invalid.test', role: 'admin' }, key, signal())).ok, true);
    assert.equal((await net.crmSetupActivate(version, key, signal())).ok, true);
    assert.equal((await net.crmSetupOperation({ ...locator(), apiToken: 'PRIVATE', tenantId: 'foreign' }, signal())).ok, true);
    assert.deepEqual(calls.map(c => [c.url, c.method]), [
      ['/api/integrations/crm', 'GET'], ['/api/integrations/crm/connect', 'POST'], ['/api/integrations/crm/activate', 'POST'],
      [`/api/integrations/crm/operation?operation=install&requestId=${key}`, 'GET'],
    ]);
    assert.deepEqual(JSON.parse(calls[1].body), { provider: 'yclients', apiToken: input.apiToken, expectedVersion: null, settingsJson: { companyId: 12345, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 12345, branchId: input.branchId } } });
    assert.deepEqual(JSON.parse(calls[2].body), { expectedVersion: version });
    for (const c of calls) {
      assert.equal(c.credentials, 'omit'); assert.equal(c.redirect, 'error'); assert.equal(c.cache, 'no-store');
      assert.equal(c.headers['Idempotency-Key'], c.method === 'POST' ? key : undefined);
      if (c.method === 'GET') assert.equal(c.body, null);
    }
  });
});

test('invalid fields, versions and locators do no authorization or I/O', async () => {
  await wire(() => { throw Error('unexpected fetch'); }, async (net, calls) => {
    for (const value of ['0', '-1', '1e3', '9007199254740992', '', '1\n']) assert.deepEqual(await net.crmSetupStage({ ...install, companyId: value }, key, signal()), fail('invalid'));
    for (const value of ['', ' '.repeat(10), 'x'.repeat(4097)]) assert.deepEqual(await net.crmSetupStage({ ...install, apiToken: value }, key, signal()), fail('invalid'));
    for (const value of [undefined, '', 'a'.repeat(63), 'A'.repeat(64)]) {
      assert.deepEqual(await net.crmSetupStage({ ...install, expectedVersion: value }, key, signal()), fail('invalid'));
      assert.deepEqual(await net.crmSetupActivate(value, key, signal()), fail('invalid'));
    }
    assert.deepEqual(await net.crmSetupStage({ ...install, branchId: '' }, key, signal()), fail('invalid'));
    assert.deepEqual(await net.crmSetupStage(install, 'bad\r\nkey', signal()), fail('invalid'));
    for (const value of [null, { operation: 'delete', requestId: key }, { operation: 'install', requestId: 'bad\r\nkey' }]) assert.deepEqual(await net.crmSetupOperation(value, signal()), fail('invalid'));
    assert.equal(calls.length, 0);
  }, { authorize: async () => { throw Error('unexpected authorize'); } });
});

test('401 refresh is bounded and keeps the exact operation key and versioned write body', async () => {
  for (const kind of ['install', 'activate']) {
    let refreshes = 0;
    await wire((_call, n) => response(n === 1 ? {} : completionRaw(kind), n === 1 ? 401 : 200), async (net, calls) => {
      const result = kind === 'install' ? await net.crmSetupStage(install, key, signal()) : await net.crmSetupActivate(version, key, signal());
      assert.equal(result.ok, true); assert.equal(calls.length, 2); assert.equal(calls[0].body, calls[1].body);
      assert.equal(calls[1].headers['Idempotency-Key'], key); assert.equal(calls[1].headers.Authorization, 'Bearer synthetic-second');
    }, { reauthorize: async () => { refreshes++; return { kind: 'bearer', bearer: 'synthetic-second', serial: 2 }; } });
    assert.equal(refreshes, 1);
  }
});

test('lost, malformed, conflict and server write results never automatically resend', async () => {
  for (const kind of ['install', 'activate']) for (const [handler, reason] of [[() => { throw Error('PRIVATE'); }, 'uncertain'], [() => response({ privateError: 'PRIVATE' }), 'uncertain'], [() => response({}, 500), 'uncertain'], [() => response({}, 409), 'uncertain'], [() => response({}, 403), 'forbidden']]) {
    await wire(handler, async (net, calls) => {
      const result = kind === 'install' ? await net.crmSetupStage(install, key, signal()) : await net.crmSetupActivate(version, key, signal());
      assert.deepEqual(result, fail(reason)); assert.equal(calls.length, 1);
    });
  }
});

test('disabled composition, viewing and subscribing trigger no transport or pending write', async () => {
  const f = fixture({ enabled: false }); const stop = f.port.subscribe(() => {});
  f.port.view(); await f.port.load(); await f.port.stage(input, true); await f.port.activate(true);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.pending.events, []); assert.equal(f.keysMinted(), 0);
  stop(); f.port.dispose();
});

test('explicit load reads only; stage requires consent, current branch and a persisted locator before dispatch', async () => {
  const f = fixture(); await f.port.load(); assert.deepEqual(f.calls, ['status', 'branches']);
  await f.port.stage(input, false); await f.port.stage({ ...input, branchId: 'foreign' }, true); assert.equal(f.calls.length, 2);
  f.transport.crmSetupStage = async (material, requestId) => {
    assert.deepEqual(f.pending.read(), locator('install', requestId));
    assert.deepEqual(material, install);
    return ok(completed('install', { requestId }));
  };
  await f.port.stage(input, true);
  assert.equal(f.port.view().connection.status, 'pending_activation');
  assert.equal(f.port.view().canActivate, true); assert.equal(f.pending.read(), null);
  assert.equal(JSON.stringify(f.port.view()).includes(input.apiToken), false);
  assert.equal(f.port.view().operation.receipt.phase, 'installed'); f.port.dispose();
});

test('activation needs separate consent and pins the reviewed configVersion through canonical import receipt', async () => {
  const f = fixture({ connection: snapshot().connection }); await f.port.load();
  await f.port.activate(false); assert.equal(f.writes.length, 0);
  await f.port.activate(true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].kind, 'activate');
  assert.equal(f.writes[0].material, version); assert.equal(f.writes[0].key, key);
  assert.equal(f.port.view().operation.receipt.phase, 'import_confirmed');
  assert.equal(f.port.view().connection.status, 'active'); assert.equal(f.port.view().canActivate, false);
  assert.equal(f.pending.read(), null); f.port.dispose();
});

test('configVersion drift with unchanged timestamp and removed branches refuse before either write', async () => {
  for (const kind of ['stage', 'activate']) for (const change of ['version', 'branch']) {
    const f = fixture({ connection: snapshot().connection }); await f.port.load();
    if (change === 'version') f.store(snapshot({ configVersion: changedVersion }));
    else f.transport.personalBranches = async () => ok([]);
    if (kind === 'stage') await f.port.stage(input, true); else await f.port.activate(true);
    assert.equal(f.writes.length, 0); assert.equal(f.keysMinted(), 0); assert.equal(f.port.view().canActivate, false);
    assert.equal(f.port.view().phase, 'blocked'); f.port.dispose();
  }
});

test('a foreign tenant completion cannot replace the reviewed owner connection', async () => {
  const f = fixture({ connection: snapshot().connection, crmSetupStage: async () => ok(completed('install', {}, { tenant_id: 'foreign' })) });
  await f.port.load(); await f.port.stage(input, true);
  assert.equal(f.port.view().canActivate, false);
  assert.notEqual(f.port.view().connection?.tenantId, 'foreign');
  assert.deepEqual(f.pending.read(), locator()); f.port.dispose();
});

test('another CRM provider cannot be staged or activated', async () => {
  const f = fixture({ connection: { ...snapshot().connection, provider: 'other' } }); await f.port.load();
  await f.port.stage(input, true); await f.port.activate(true);
  assert.equal(f.writes.length, 0); assert.equal(f.port.view().canStage, false); assert.equal(f.port.view().canActivate, false); f.port.dispose();
});

test('uncertain write survives close/signout/re-entry; only explicit NOT_OBSERVED read enables consented same-key resend', async () => {
  const f = fixture({ crmSetupStage: async () => fail('uncertain') }); await f.port.load(); await f.port.stage(input, true);
  assert.equal(f.writes.length, 1); assert.equal(f.port.view().phase, 'uncertain'); assert.deepEqual(f.pending.read(), locator());
  await f.port.stage(input, true); f.port.close(); f.session(false); f.session(true);
  await f.port.stage(input, true); assert.equal(f.writes.length, 1); await f.port.load();
  assert.deepEqual(f.receipts, [locator()]); assert.equal(f.port.view().operation.status, 'NOT_OBSERVED');
  assert.equal(f.port.view().canStage, true); assert.equal(f.port.view().resuming, true); assert.equal(f.port.view().canActivate, false);
  assert.equal(f.writes.length, 1); assert.deepEqual(f.pending.read(), locator());
  await f.port.stage(input, false); await f.port.activate(true); assert.equal(f.writes.length, 1);
  await f.port.stage(input, true); assert.equal(f.writes.length, 2);
  assert.deepEqual(f.writes.map(write => write.key), [key, key]); assert.equal(f.keysMinted(), 1);
  assert.equal(f.port.view().canStage, false); assert.deepEqual(f.pending.read(), locator());
  await f.port.stage(input, true); assert.equal(f.writes.length, 2); f.port.dispose();
});

test('NOT_OBSERVED after runtime restart uses freshly re-entered material with the saved operation key', async () => {
  const pending = pendingStore();
  const before = fixture({ pending, crmSetupStage: async () => fail('uncertain') });
  await before.port.load(); await before.port.stage(input, true); before.port.dispose();
  const after = fixture({ pending });
  assert.deepEqual(after.calls, []); await after.port.stage(input, true); assert.equal(after.writes.length, 0);
  await after.port.load(); assert.deepEqual(after.calls, ['operation', 'status', 'branches']);
  assert.equal(after.port.view().operation.status, 'NOT_OBSERVED'); assert.deepEqual(pending.read(), locator());
  const reentered = { ...input, apiToken: 'synthetic-reentered-token' };
  await after.port.stage(reentered, false); assert.equal(after.writes.length, 0);
  await after.port.stage(reentered, true);
  assert.equal(after.writes.length, 1); assert.equal(after.writes[0].key, key);
  assert.deepEqual(after.writes[0].material, { ...reentered, expectedVersion: null });
  assert.equal(after.keysMinted(), 0); assert.equal(pending.read(), null);
  assert.equal(JSON.stringify(after.port.view()).includes(reentered.apiToken), false); after.port.dispose();
});

test('NOT_OBSERVED activation requires a new explicit consent and preserves the existing key', async () => {
  const pending = pendingStore(locator('activate'));
  const f = fixture({ pending, connection: snapshot().connection });
  await f.port.activate(true); assert.equal(f.writes.length, 0);
  await f.port.load(); assert.equal(f.port.view().canActivate, true); assert.equal(f.port.view().canStage, false);
  assert.equal(f.writes.length, 0); assert.deepEqual(pending.read(), locator('activate'));
  await f.port.activate(false); assert.equal(f.writes.length, 0);
  await f.port.activate(true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].key, key); assert.equal(f.writes[0].material, version);
  assert.equal(f.keysMinted(), 0); assert.equal(pending.read(), null); f.port.dispose();
  const active = fixture({ pending: pendingStore(locator('activate')), connection: snapshot({ status: 'active' }).connection });
  await active.port.load(); assert.equal(active.port.view().operation.status, 'NOT_OBSERVED');
  assert.equal(active.port.view().canActivate, false); await active.port.activate(true);
  assert.equal(active.writes.length, 0); assert.equal(active.keysMinted(), 0); active.port.dispose();
});

test('NOT_OBSERVED same-key retry still rejects configuration drift after explicit receipt read', async () => {
  for (const kind of ['install', 'activate']) {
    const pending = pendingStore(locator(kind));
    const f = fixture({ pending, connection: snapshot().connection }); await f.port.load();
    f.store(snapshot({ configVersion: changedVersion }));
    if (kind === 'install') await f.port.stage(input, true); else await f.port.activate(true);
    assert.equal(f.writes.length, 0); assert.equal(f.keysMinted(), 0);
    assert.deepEqual(pending.read(), locator(kind)); assert.equal(f.port.view().phase, 'blocked'); f.port.dispose();
  }
});

test('new runtime after response loss recovers the same completed locator without a write', async () => {
  const pending = pendingStore();
  const before = fixture({ pending, crmSetupStage: async () => fail('uncertain') });
  await before.port.load(); await before.port.stage(input, true); before.port.dispose();
  const after = fixture({ pending, connection: snapshot().connection, crmSetupOperation: async current => ok(operation(current.operation, { requestId: current.requestId })) });
  assert.deepEqual(after.calls, []); assert.equal(after.port.view().connection, null);
  await after.port.load();
  assert.deepEqual(after.calls, ['operation', 'status', 'branches']); assert.deepEqual(after.receipts, [locator()]);
  assert.equal(after.keysMinted(), 0); assert.equal(after.writes.length, 0); assert.equal(pending.read(), null);
  assert.equal(after.port.view().operation.receipt.phase, 'installed'); after.port.dispose();
});

test('READY install after restart continues only by explicit consent using the original key', async () => {
  const pending = pendingStore(locator());
  const f = fixture({ pending, crmSetupOperation: async () => ok(operation('install', { status: 'READY' })) });
  await f.port.load(); assert.equal(f.port.view().resuming, true); assert.equal(f.port.view().canStage, true);
  assert.equal(f.writes.length, 0); await f.port.stage(input, false); assert.equal(f.writes.length, 0);
  await f.port.stage(input, true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].key, key); assert.deepEqual(f.writes[0].material, install);
  assert.equal(f.keysMinted(), 0); assert.equal(pending.read(), null); f.port.dispose();
});

test('a refused READY continuation retains the original locator and never starts a replacement operation', async () => {
  const f = fixture({ pending: pendingStore(locator()),
    crmSetupOperation: async () => ok(operation('install', { status: 'READY' })),
    crmSetupStage: async () => fail('uncertain'),
  });
  await f.port.load();
  // The authenticated server owns immutable material matching. Its refusal is not a retry grant.
  await f.port.stage({ ...input, companyId: '67890' }, true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].key, key);
  assert.deepEqual(f.pending.read(), locator()); assert.equal(f.port.view().canStage, false);
  await f.port.stage(input, true); assert.equal(f.writes.length, 1); assert.equal(f.keysMinted(), 0); f.port.dispose();
});

test('READY activation confirmation resumes its same key and current receipt version without token', async () => {
  const pending = pendingStore(locator('activate'));
  const f = fixture({ pending, connection: snapshot({ status: 'active' }).connection,
    crmSetupOperation: async () => ok(operation('activate', { status: 'READY', phase: 'confirm', receiptPhase: 'activated' })) });
  await f.port.load(); assert.equal(f.port.view().canActivate, true); assert.equal(f.port.view().canStage, false);
  assert.equal(f.writes.length, 0); await f.port.activate(true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].key, key); assert.equal(f.writes[0].material, version);
  assert.equal(f.keysMinted(), 0); assert.equal(f.port.view().operation.receipt.phase, 'import_confirmed'); f.port.dispose();
});

test('READY receipt for an older configuration cannot authorize activation of the replacement', async () => {
  const f = fixture({ pending: pendingStore(locator('activate')), connection: snapshot({ configVersion: changedVersion, status: 'active' }).connection,
    crmSetupOperation: async () => ok(operation('activate', { status: 'READY', phase: 'confirm', receiptPhase: 'activated', current: { configVersion: changedVersion, matchesCurrentVersion: false } })) });
  await f.port.load(); assert.equal(f.port.view().canActivate, false);
  await f.port.activate(true); assert.equal(f.writes.length, 0); assert.deepEqual(f.pending.read(), locator('activate')); f.port.dispose();
});

test('UNAVAILABLE, unknown receipt read or malformed saved locator never permits a write', async () => {
  for (const [initial, receiptResult] of [
    ['invalid', ok(operation('install', { status: 'UNAVAILABLE' }))],
    [locator(), ok(operation('install', { status: 'UNAVAILABLE' }))],
    [locator(), fail('unavailable')], [locator(), fail('uncertain')],
  ]) {
    const f = fixture({ pending: pendingStore(initial), crmSetupOperation: async () => receiptResult });
    await f.port.load(); await f.port.stage(input, true); await f.port.activate(true);
    assert.equal(f.writes.length, 0); assert.equal(f.keysMinted(), 0); assert.equal(f.port.view().canStage, false);
    if (initial === 'invalid') assert.deepEqual(f.calls, []);
    f.port.dispose();
  }
});

test('URL locator save refusal or exception stops before POST', async () => {
  for (const throws of [false, true]) {
    const pending = pendingStore(); pending.save = () => { if (throws) throw Error('synthetic location failure'); return false; };
    const f = fixture({ pending }); await f.port.load(); await f.port.stage(input, true);
    assert.equal(f.writes.length, 0); assert.equal(f.port.view().canStage, false); f.port.dispose();
  }
});

test('failure clearing a completed locator preserves uncertainty and blocks a new operation', async () => {
  const pending = pendingStore(); pending.clear = () => false;
  const f = fixture({ pending }); await f.port.load(); await f.port.stage(input, true);
  assert.equal(f.port.view().phase, 'uncertain'); assert.equal(f.port.view().canStage, false);
  await f.port.stage(input, true); assert.equal(f.writes.length, 1); assert.deepEqual(pending.read(), locator()); f.port.dispose();
});

test('double submit is single flight; signout aborts and ignores a late completion, keeping recovery locator', async () => {
  let finish;
  const dispatched = new Promise(resolve => { finish = resolve; });
  let resolveResponse;
  const f = fixture({ crmSetupStage: async () => { finish(); return new Promise(resolve => { resolveResponse = resolve; }); } });
  await f.port.load(); const flight = f.port.stage(input, true); await dispatched;
  await f.port.stage(input, true); assert.equal(f.writes.length, 1);
  f.session(false); assert.equal(f.writes[0].signal.aborted, true);
  resolveResponse(ok(completed())); await flight;
  assert.equal(f.port.view().connection, null); assert.equal(f.port.view().canStage, false); assert.deepEqual(f.pending.read(), locator());
  await f.port.load(); assert.equal(f.writes.length, 1); f.port.dispose();
});

test('current owner revocation during preflight prevents dispatch', async () => {
  const f = fixture({ connection: snapshot().connection }); await f.port.load();
  f.transport.crmSetupStatus = async () => fail('forbidden'); await f.port.activate(true);
  assert.equal(f.port.view().phase, 'blocked'); assert.equal(f.port.view().connection, null);
  assert.equal(f.writes.length, 0); assert.equal(f.keysMinted(), 0); f.port.dispose();
});

test('close during the final preflight publication prevents a stale-generation write', async () => {
  for (const kind of ['stage', 'activate']) for (const scheduled of [false, true]) {
    const f = fixture({ connection: kind === 'activate' ? snapshot().connection : null }); await f.port.load();
    const stop = f.port.subscribe(view => {
      if (view.busy && view.branches.length && f.calls.length >= 4 && f.calls.at(-1) === 'branches') {
        if (scheduled) queueMicrotask(() => f.port.close()); else f.port.close();
      }
    });
    if (kind === 'stage') await f.port.stage(input, true); else await f.port.activate(true);
    assert.equal(f.writes.length, 0, `${kind}, deferred reset=${scheduled}`);
    assert.equal(f.pending.read(), null); stop(); f.port.dispose();
  }
});

test('signout while saving the recovery locator prevents dispatch but preserves that locator', async () => {
  const pending = pendingStore(); let revoke;
  const save = pending.save;
  pending.save = next => { const saved = save(next); revoke(); return saved; };
  const f = fixture({ pending }); revoke = () => f.session(false);
  await f.port.load(); await f.port.stage(input, true);
  assert.equal(f.writes.length, 0); assert.deepEqual(pending.read(), locator());
  assert.equal(f.port.view().canStage, false); f.port.dispose();
});
