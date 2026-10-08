import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, installGuard, localOrigin, PROMPTS, publicRequest } from './client-value-browser-guard.mjs';

const origin = 'http://127.0.0.1:45678';
const scope = { emails: ['synthetic-client-value@example.invalid'] };
const id = '12345678-1234-4234-8234-123456789012';
const request = (route, body, method = 'POST') => ({ method, url: origin + route, ...(body === undefined ? {} : { postData: JSON.stringify(body) }) });
const chat = (prompt = PROMPTS.overview) => ({ surface: 'web', requestId: id, messages: [{ role: 'user', content: prompt }] });

test('admits only exact loopback static/history reads; queries and external origins fail', () => {
  assert.equal(localOrigin(origin), origin);
  for (const other of ['https://127.0.0.1:45678', 'http://localhost:45678', 'http://127.0.0.1:5432', 'http://127.0.0.1:55611', origin + '/other', origin + '?tenant=foreign', 'http://user@127.0.0.1:45678']) assert.throws(() => localOrigin(other));
  for (const route of ['/', '/index.html', '/styles.css', '/manifest.webmanifest', '/favicon.ico', '/m/abc123/main.js', '/icons/maya-192.png', '/api/ai/conversation']) assert.equal(admitted(request(route, undefined, 'GET'), origin, scope), true);
  for (const route of ['/api/ai/conversation?tenant=other', '/api/branches', '/api/services', '/api/available-slots', '/api/analytics', '/api/ai/tools', '/api/clients', '/__dev/scenario']) assert.equal(admitted(request(route, undefined, 'GET'), origin, scope), false);
  for (const url of ['https://external.invalid/api/ai/chat', 'http://127.0.0.1:45679/api/ai/chat', origin + '/api/ai/chat#other']) assert.equal(admitted({ ...request('/api/ai/chat', chat()), url }, origin, scope), false);
});

test('auth requires the assigned email and closed fields without tenant/role injection', () => {
  assert.equal(admitted(request('/api/auth/email/start', { email: scope.emails[0] }), origin, scope), true);
  assert.equal(admitted(request('/api/auth/email/verify', { email: scope.emails[0], code: '123456' }), origin, scope), true);
  assert.equal(admitted(request('/api/auth/refresh', { refreshToken: 'synthetic-opaque-refresh' }), origin, scope), true);
  for (const body of [{ email: 'foreign@example.invalid' }, { email: scope.emails[0], tenantId: id }, { email: scope.emails[0], role: 'owner' }]) assert.equal(admitted(request('/api/auth/email/start', body), origin, scope), false);
  for (const body of [{ email: scope.emails[0], code: 123456 }, { email: scope.emails[0], code: '123456', tenantSlug: 'foreign' }, { email: scope.emails[0], code: 'bad-code' }]) assert.equal(admitted(request('/api/auth/email/verify', body), origin, scope), false);
  for (const body of [{ refreshToken: '' }, { refreshToken: 'opaque', tenantId: id }]) assert.equal(admitted(request('/api/auth/refresh', body), origin, scope), false);
});

test('admits finite explicit prompts and inert retained assistant text only', () => {
  assert.equal(PROMPTS.single, 'Проверь, кого пора вернуть');
  for (const prompt of Object.values(PROMPTS)) assert.equal(admitted(request('/api/ai/chat', chat(prompt)), origin, scope), true);
  const history = [...chat().messages, { role: 'assistant', content: 'Synthetic retained bounded review clarification.' }, ...chat(PROMPTS.accept).messages];
  assert.equal(admitted(request('/api/ai/chat', { ...chat(), conversationId: id, messages: history }), origin, scope), true);
  for (const body of [
    chat('Отправь рассылку клиентам'),
    chat('Проверь, кого пора вернуть и отправь им сообщения'),
    { ...chat(), tenantId: id }, { ...chat(), audience: 'business' },
    { ...chat(), toolCall: { name: 'clients.dormant.list' } },
    { ...chat(), conversationId: 'raw-foreign-reference' },
    { ...chat(), requestId: 'not-a-uuid' },
    { ...chat(), messages: [{ role: 'system', content: PROMPTS.overview }, ...chat().messages] },
    { ...chat(), messages: [{ role: 'user', content: 'foreign earlier authority' }, ...chat().messages] },
    { ...chat(), messages: [{ role: 'assistant', content: 'x'.repeat(2001) }, ...chat().messages] },
    { ...chat(), messages: [{ role: 'assistant', content: 'No explicit user action.' }] },
    { ...chat(), messages: Array(41).fill(chat().messages[0]) },
  ]) assert.equal(admitted(request('/api/ai/chat', body), origin, scope), false);
  assert.equal(admitted({ ...request('/api/ai/chat', chat()), postData: '{bad-json' }, origin, scope), false);
});

test('allows bounded passive history resolution but no receipt, intent or observation authority', () => {
  assert.equal(admitted(request('/api/widgets/resolve', { thread_page: { limit: 20 } }), origin, scope), true);
  assert.equal(admitted(request('/api/widgets/resolve', { thread_page: { limit: 50, before: id } }), origin, scope), true);
  for (const body of [
    { thread_page: { limit: 0 } }, { thread_page: { limit: 51 } },
    { thread_page: { limit: 20, before: 'foreign' } },
    { thread_page: { limit: 20 }, rendered: { widget_id: id } },
    { thread_page: { limit: 20 }, booking_receipt: { widget_id: id } },
    { thread_page: { limit: 20, tenantId: id } },
  ]) assert.equal(admitted(request('/api/widgets/resolve', body), origin, scope), false);
  for (const route of [
    '/api/widgets/intent', '/api/widgets/observe', '/api/widgets/rendered',
    '/api/ai/tools/clients.dormant.list/execute', '/api/orchestration/runs',
    '/api/personal-client/appointments', '/api/records', '/api/notifications',
    '/api/ai/goods/receipt-review', '/api/privacy/conversations/' + id,
  ]) for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(admitted(request(route, chat(), method), origin, scope), false);
});

test('public request evidence drops credentials, email, OTP, body and arbitrary URL segments', () => {
  const raw = { method: 'POST', url: origin + '/private/secret@example.invalid?token=PRIVATE_TOKEN', postData: '{"code":"123456"}', headers: { Authorization: 'Bearer PRIVATE_TOKEN' } };
  assert.deepEqual(publicRequest(raw), { method: 'POST', path: '[unlisted-path]' });
  assert.deepEqual(publicRequest({ ...raw, url: origin + '/api/auth/email/verify?secret=PRIVATE_TOKEN' }), { method: 'POST', path: '/api/auth/email/verify' });
  assert.deepEqual(publicRequest({ ...raw, url: 'not-a-url' }), { method: 'POST', path: '[unlisted-path]' });
});

test('request interception continues actual allowed HTTP and blocks effects without any response fulfillment', async () => {
  const calls = [], listeners = new Set();
  const page = { sessionId: 'synthetic-session', browser: { listeners }, async send(method, params) { calls.push({ method, params }); } };
  const guard = await installGuard(page, origin, scope);
  const listener = [...listeners][0];
  listener({ sessionId: page.sessionId, method: 'Fetch.requestPaused', params: { requestId: 'read', request: request('/api/ai/chat', chat()) } });
  listener({ sessionId: page.sessionId, method: 'Fetch.requestPaused', params: { requestId: 'effect', request: request('/api/widgets/intent', { token: 'PRIVATE' }) } });
  await Promise.resolve();
  assert.deepEqual(calls.slice(-2), [
    { method: 'Fetch.continueRequest', params: { requestId: 'read' } },
    { method: 'Fetch.failRequest', params: { requestId: 'effect', errorReason: 'BlockedByClient' } },
  ]);
  assert.equal(calls.some((call) => /fulfill|response/i.test(call.method)), false);
  assert.deepEqual(guard, { blocked: [{ method: 'POST', path: '[unlisted-path]' }], errors: [] });
});
