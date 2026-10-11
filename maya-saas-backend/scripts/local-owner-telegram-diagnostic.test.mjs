import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createReadTrace, projectReadTrace, traceHttpRequest } from './local-yclients-read-status.mjs';
import { createOwnerTelegramTransport } from './local-owner-telegram-transport.mjs';
import { createDiagnostic, runtimeObserver } from './local-yclients-read.mjs';

const express = createRequire(import.meta.url)('express');
const clientId = '123456789', companyId = '12345';
const tokenUrl = 'https://oauth.telegram.org/token';
const jwksUrl = 'https://oauth.telegram.org/.well-known/jwks.json';
const operation = () => ({ purpose: 'link', code: 'SYNTHETIC_PRIVATE_CODE', verifier: 'SYNTHETIC_PRIVATE_VERIFIER', redirectUri: 'http://127.0.0.1:56151/oauth-callback.html' });
const token = () => ({ method: 'POST', headers: { authorization: 'Basic SYNTHETIC_PRIVATE_HEADER' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: operation().code, code_verifier: operation().verifier, redirect_uri: operation().redirectUri }) });
function transport(nativeFetch, trace) {
  return createOwnerTelegramTransport({ clientId, companyId, nativeFetch, trace, assertCurrent() {}, verifyCurrent: async () => {} });
}
function httpFixture(route, status = 400) {
  const events = [], response = new EventEmitter(); let wire;
  response.statusCode = status; response.app = { get: () => undefined };
  response.get = () => null; response.set = () => response; response.json = express.response.json;
  response.send = function(body) { wire = body; this.emit('finish'); return this; };
  traceHttpRequest({ method: 'POST', originalUrl: route, headers: { authorization: 'SYNTHETIC_PRIVATE_HEADER' }, body: operation() }, response, createReadTrace(e => events.push(e)));
  return { events, response, wire: () => wire };
}
for (const route of ['/api/auth/oauth/telegram/link/complete', '/api/auth/oauth/telegram/complete']) {
  test('closed canonical HTTP failure on ' + route, () => {
    for (const code of ['social_exchange_failed', 'social_token_invalid', 'social_state_invalid', 'local_owner_telegram_scope_refused']) {
      const f = httpFixture(route), body = { error: { code, message: 'SYNTHETIC_PRIVATE_MESSAGE' }, other: 'SYNTHETIC_PRIVATE_VALUE' };
      assert.equal(f.response.json(body), f.response);
      assert.equal(f.wire(), JSON.stringify(body));
      assert.equal(f.events.length, 2); assert.equal(f.events[1].code, code);
      assert.equal(f.events[1].status, 400); assert.equal(f.events[1].stage, 'refused');
      assert.deepEqual(projectReadTrace(f.events[1]), f.events[1]);
      assert.equal(JSON.stringify(f.events).includes('SYNTHETIC_PRIVATE'), false);
    }
  });
}
test('Telegram diagnostic does not copy arbitrary codes, inherited fields, getters or success payloads', () => {
  let reads = 0;
  for (const body of [{ error: { code: 'SYNTHETIC_PRIVATE' } }, Object.create({ error: { code: 'social_exchange_failed' } }), { error: Object.create({ code: 'social_exchange_failed' }) }, { get error() { reads++; } }, { error: { get code() { reads++; } } }]) {
    const response = new EventEmitter(), events = []; response.statusCode = 400;
    response.json = function(value) { this.emit('finish'); return value; };
    traceHttpRequest({ method: 'POST', originalUrl: '/api/auth/oauth/telegram/link/complete' }, response, createReadTrace(e => events.push(e)));
    assert.equal(response.json(body), body); assert.equal(events[1].code, null);
  }
  assert.equal(reads, 0);
  const f = httpFixture('/api/auth/oauth/telegram/complete', 201);
  f.response.json({ error: { code: 'social_exchange_failed' }, access_token: 'SYNTHETIC_PRIVATE' });
  assert.equal(f.events[1].code, null); assert.equal(f.events[1].stage, 'completed');
});
test('token/JWKS HTTP status and exact successful response preserved without payload/header diagnostics', async () => {
  const events = [], payload = JSON.stringify({ id_token: 'SYNTHETIC_PRIVATE_TOKEN', phone: 'SYNTHETIC_PRIVATE_PHONE' });
  const t = transport(async () => new Response(payload), createReadTrace(e => events.push(e)));
  await t.run(operation(), async () => {
    assert.equal(await (await t.fetch(tokenUrl, token())).text(), payload);
    assert.equal(await (await t.fetch(jwksUrl, { method: 'GET' })).text(), payload);
  });
  assert.deepEqual(events.map(e => [e.route, e.stage, e.status, e.code]), [
    ['telegram_token', 'entered', null, null], ['telegram_token', 'completed', 200, 'provider_response_read'],
    ['telegram_jwks', 'entered', null, null], ['telegram_jwks', 'completed', 200, 'provider_response_read'],
  ]);
  assert.equal(JSON.stringify(events).includes('SYNTHETIC_PRIVATE'), false);
});
test('non-OK provider body remains unread/cancelled and erased; only HTTP status retained', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const events = []; let cancelled = 0;
    const t = transport(async () => ({ status, ok: false, redirected: false, url: tokenUrl, body: { cancel: async () => { cancelled++; }, getReader() { assert.fail('Must not read provider error body'); } } }), createReadTrace(e => events.push(e)));
    await t.run(operation(), async () => { const r = await t.fetch(tokenUrl, token()); assert.equal(r.status, status); assert.equal(await r.text(), '{}'); });
    assert.equal(cancelled, 1); assert.equal(events.length, 2);
    assert.equal(events[1].status, status); assert.equal(events[1].code, 'provider_http_error');
    assert.equal(events[1].stage, 'refused'); assert.equal(t.counters.refused, 0);
  }
});
test('observer failure cannot change provider result, guards or counters', async () => {
  const t = transport(async () => new Response('{}'), () => { throw Error('SYNTHETIC_PRIVATE_OBSERVER'); });
  await t.run(operation(), async () => {
    assert.equal(await (await t.fetch(tokenUrl, token())).text(), '{}');
    await assert.rejects(t.fetch(tokenUrl, token()), /local_telegram_transport_refused/);
  });
  assert.deepEqual(t.counters, { calls: 1, refused: 1, routes: { telegram_token: 1 } });
});
test('transport failure and unlisted URL cannot leak exception, URL or credentials', async () => {
  const events = []; let calls = 0;
  const t = transport(async () => { calls++; throw Error('SYNTHETIC_PRIVATE_ERROR'); }, createReadTrace(e => events.push(e)));
  await t.run(operation(), async () => assert.rejects(t.fetch(tokenUrl, token()), /local_telegram_transport_refused/));
  await t.run(operation(), async () => assert.rejects(t.fetch('https://foreign.invalid/SYNTHETIC_PRIVATE', token()), /local_telegram_transport_refused/));
  assert.equal(calls, 1); assert.equal(events.length, 2);
  assert.equal(events[1].code, 'provider_transport_unavailable'); assert.equal(events[1].status, null);
  assert.equal(JSON.stringify(events).includes('SYNTHETIC_PRIVATE'), false);
});
test('Telegram trace survives strict launcher IPC; raw additions are refused; 64-event cap unchanged', async () => {
  const events = [], trace = createReadTrace(e => events.push(e));
  for (let i = 0; i < 70; i++) trace({ surface: 'provider', route: 'telegram_token', method: 'POST', stage: 'refused', status: 401, code: 'provider_http_error' });
  assert.equal(events.length, 64);
  const diagnostic = createDiagnostic(false), expected = { origin: 'http://127.0.0.1:56151', providerAdmission: 'explicit_setup_reads_only' };
  const observer = runtimeObserver(diagnostic, expected, () => {});
  events.forEach(e => observer.accept(e));
  assert.equal(diagnostic.readTrace.length, 64); assert.equal(diagnostic.readTraceLimitReached, true);
  for (const extra of [{ raw: 'SYNTHETIC_PRIVATE' }, { code: 'SYNTHETIC_PRIVATE' }, { route: 'SYNTHETIC_PRIVATE' }, { status: 'SYNTHETIC_PRIVATE' }]) {
    const d = createDiagnostic(false), o = runtimeObserver(d, expected, () => {});
    o.accept({ ...events[0], ...extra });
    await assert.rejects(o.failure, { diagnosticCode: 'runtime_status_invalid' });
    assert.equal(d.readTrace.length, 0); assert.equal(JSON.stringify(d).includes('SYNTHETIC_PRIVATE'), false);
  }
});

test('token response category distinguishes closed OAuth errors without retaining response values', async () => {
  const cases = [
    [{ error: 'invalid_client' }, 'oauth_invalid_client'],
    [{ error: 'invalid_grant' }, 'oauth_invalid_grant'],
    [{ error: 'invalid_request' }, 'oauth_invalid_request'],
    [{ error: 'unauthorized_client' }, 'oauth_unauthorized_client'],
    [{ error: 'unsupported_grant_type' }, 'oauth_unsupported_grant_type'],
    [{ error: 'invalid_scope' }, 'oauth_invalid_scope'],
    [{ error: 'access_denied' }, 'oauth_access_denied'],
    [{ error: 'server_error' }, 'oauth_server_error'],
    [{ error: 'temporarily_unavailable' }, 'oauth_temporarily_unavailable'],
    [{ error: 'SYNTHETIC_PRIVATE' }, 'oauth_other_error'],
    [{ error: { message: 'SYNTHETIC_PRIVATE' } }, 'oauth_other_error'],
    [{ error: ['invalid_client'] }, 'oauth_other_error'],
    [{ error: ' invalid_client ' }, 'oauth_other_error'],
    [{ id_token: 'SYNTHETIC_PRIVATE_TOKEN' }, 'id_token_present'],
    [{ id_token: 'SYNTHETIC_PRIVATE_TOKEN', error: 'invalid_client' }, 'contradictory_token_error'],
    [{ id_token: '' }, 'missing_id_token'],
    [{ id_token: null }, 'missing_id_token'],
    [{ id_token: false }, 'missing_id_token'],
    [{ id_token: {} }, 'unexpected_shape'],
    [{ access_token: 'SYNTHETIC_PRIVATE_ACCESS' }, 'missing_id_token'],
    [{ data: { id_token: 'SYNTHETIC_PRIVATE_TOKEN' } }, 'missing_id_token'],
    [{}, 'missing_id_token'], [null, 'unexpected_shape'], [[], 'unexpected_shape'],
  ];
  for (const [value, expected] of cases) {
    const body = JSON.stringify(value && !Array.isArray(value) ? { ...value, error_description: 'SYNTHETIC_PRIVATE_DESCRIPTION', phone: 'SYNTHETIC_PRIVATE_PHONE' } : value);
    const events = [], t = transport(async () => new Response(body), createReadTrace(e => events.push(e)));
    await t.run(operation(), async () => assert.equal(await (await t.fetch(tokenUrl, token())).text(), body));
    assert.equal(events.length, 2);
    assert.equal(events[1].telegramTokenOutcome, expected);
    assert.equal(events[1].stage, 'completed'); assert.equal(events[1].code, 'provider_response_read');
    assert.equal(JSON.stringify(events).includes('SYNTHETIC_PRIVATE'), false);
    assert.deepEqual(t.counters, { calls: 1, refused: 0, routes: { telegram_token: 1 } });
  }
});
test('token response category is restricted to a completed successful token response through strict IPC', async () => {
  const events = [], t = transport(async () => new Response('{"error":"invalid_client"}'), createReadTrace(e => events.push(e)));
  await t.run(operation(), async () => { await t.fetch(tokenUrl, token()); });
  const event = events[1];
  assert.equal(event.telegramTokenOutcome, 'oauth_invalid_client');
  const d = createDiagnostic(false), expected = { origin: 'http://127.0.0.1:56151', providerAdmission: 'explicit_setup_reads_only' };
  const observer = runtimeObserver(d, expected, () => {}); events.forEach(e => observer.accept(e));
  assert.equal(d.readTrace[1].telegramTokenOutcome, 'oauth_invalid_client');
  for (const changed of [
    { telegramTokenOutcome: 'SYNTHETIC_PRIVATE' }, { telegramTokenOutcome: { secret: 'SYNTHETIC_PRIVATE' } },
    { telegramTokenOutcome: null }, { route: 'telegram_jwks' }, { surface: 'http' },
    { method: 'GET' }, { stage: 'entered' }, { stage: 'refused' }, { code: 'provider_http_error' },
    { status: null }, { status: 401 }, { raw: 'SYNTHETIC_PRIVATE' },
  ]) assert.equal(projectReadTrace({ ...event, ...changed }), null);
});
test('token response category never inspects non-OK bodies or adds a category to JWKS', async () => {
  const events = [], t = transport(async (url) => url === tokenUrl
    ? { status: 401, ok: false, redirected: false, url, body: { cancel: async () => {}, getReader() { assert.fail('Non-OK body must remain unread'); } } }
    : new Response('{"error":"invalid_client"}'), createReadTrace(e => events.push(e)));
  await t.run(operation(), async () => {
    assert.equal(await (await t.fetch(tokenUrl, token())).text(), '{}');
    assert.equal(await (await t.fetch(jwksUrl, { method: 'GET' })).text(), '{"error":"invalid_client"}');
  });
  assert.equal(events.length, 4);
  for (const e of events) assert.equal(Object.hasOwn(e, 'telegramTokenOutcome'), false);
});
