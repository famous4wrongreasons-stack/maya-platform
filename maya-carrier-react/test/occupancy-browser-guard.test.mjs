import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, installGuard, localOrigin, OWNER_REQUEST, COMPOUND_PROMPTS } from './occupancy-browser-guard.mjs';

const origin = 'http://127.0.0.1:45678';
const chat = { url: origin + '/api/ai/chat', method: 'POST', postData: JSON.stringify({ surface: 'web', messages: [{ role: 'user', content: OWNER_REQUEST }] }) };
test('guard permits actual login/history/exact explicit chat and bundle reads only', () => {
  assert.equal(admitted(chat, origin), true);
  for (const pathname of ['/', '/m/ABCDEFG1/main.js', '/styles.css', '/api/ai/conversation'])
    assert.equal(admitted({ url: origin + pathname, method: 'GET' }, origin), true);
  for (const pathname of ['/api/auth/email/start', '/api/auth/email/verify', '/api/auth/refresh'])
    assert.equal(admitted({ url: origin + pathname, method: 'POST' }, origin), true);
});
test('guard refuses outside origins, mutation/voice/provider routes, unexpected requests and credentials', () => {
  for (const url of ['https://mayaos.ru/api/ai/chat', 'http://127.0.0.1:45679/api/ai/chat', 'http://localhost:45678/api/ai/chat', origin + '/api/widgets/intent', origin + '/api/ai/transcribe', origin + '/__dev/scenario', origin + '/api/ai/chat?fixture=1', 'http://user:pass@127.0.0.1:45678/api/ai/chat'])
    assert.equal(admitted({ ...chat, url }, origin), false);
  assert.equal(admitted({ ...chat, postData: '{}' }, origin), false);
  assert.equal(admitted({ ...chat, postData: chat.postData.replace(OWNER_REQUEST, 'Запиши клиента') }, origin), false);
  assert.equal(admitted({ ...chat, method: 'DELETE' }, origin), false);
  for (const bad of ['https://127.0.0.1:45678', 'http://127.0.0.1:5432', 'http://127.0.0.1:55611', origin + '/api', origin + '?token=x']) assert.throws(() => localOrigin(bad));
});
test('request-stage guard continues admitted HTTP, blocks forbidden HTTP, never fulfills a response', async () => {
  const calls = [], listeners = new Set();
  const page = { sessionId: 'owned', browser: { listeners }, send: async (...args) => { calls.push(args); } };
  const guard = await installGuard(page, origin);
  const notify = [...listeners][0];
  notify({ sessionId: 'owned', method: 'Fetch.requestPaused', params: { requestId: '1', request: chat } });
  notify({ sessionId: 'owned', method: 'Fetch.requestPaused', params: { requestId: '2', request: { ...chat, url: 'https://foreign.example/x?secret=hidden' } } });
  assert.deepEqual(guard.blocked, [{ method: 'POST', path: '/x' }]);
  assert.deepEqual(guard.errors, []);
  assert.deepEqual(calls.map(([method]) => method), ['Network.setBypassServiceWorker', 'Network.setBlockedURLs', 'Fetch.enable', 'Fetch.continueRequest', 'Fetch.failRequest']);
  assert.equal(calls[2][1].patterns[0].requestStage, 'Request');
});

test('guard admits only bounded read-only widget history, never render observations or intents', () => {
  const resolve = (body) => admitted({ url: origin + '/api/widgets/resolve', method: 'POST', postData: JSON.stringify(body) }, origin);
  assert.equal(resolve({ thread_page: { limit: 30 } }), true);
  assert.equal(resolve({ thread_page: { limit: 51 } }), false);
  assert.equal(resolve({ thread_page: { limit: 30, tenantId: 'foreign' } }), false);
  assert.equal(resolve({ thread_page: { limit: 30 }, rendered: {} }), false);
  assert.equal(resolve({ thread_page: { limit: 30, before: 'bad' } }), false);
});


test('compound browser admits only its three exact owner prompts, isolated from the occupancy mode', () => {
  for (const content of Object.values(COMPOUND_PROMPTS)) {
    const req = { ...chat, postData: JSON.stringify({ surface: 'web', messages: [{ role: 'user', content }] }) };
    assert.equal(admitted(req, origin, 'compound'), true);
    assert.equal(admitted(req, origin), false);
    for (const invalid of [content + ' и запиши клиента', [content], { text: content }]) {
      assert.equal(admitted({ ...chat, postData: JSON.stringify({ surface: 'web', messages: [{ role: 'user', content: invalid }] }) }, origin, 'compound'), false);
    }
    for (const url of ['https://foreign.invalid/api/ai/chat', origin + '/api/widgets/intent', origin + '/api/ai/tools/booking.create/execute']) assert.equal(admitted({ ...req, url }, origin, 'compound'), false);
  }
  assert.equal(admitted(chat, origin, 'compound'), false);
  assert.equal(admitted(chat, origin, 'unknown'), false);
});
