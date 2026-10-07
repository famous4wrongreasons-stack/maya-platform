import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted } from './history-erasure-browser-guard.mjs';
const origin = 'http://127.0.0.1:49121';
const conversation = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const request = { method: 'POST', url: `${origin}/api/privacy/conversations/${conversation}/erasure`, postData: JSON.stringify({ requestId }) };
test('admits only the exact explicit privacy scope and closed request ID', () => {
  assert.equal(admitted(request, origin, conversation), true);
  for (const patch of [
    { postData: JSON.stringify({ requestId, tenantId: 'foreign' }) },
    { postData: JSON.stringify({ requestId: 'guessed' }) },
    { postData: JSON.stringify({ requestId: [requestId] }) },
    { postData: JSON.stringify({ requestId: [[requestId]] }) },
    { url: `${origin}/api/privacy/conversations/${requestId}/erasure` },
    { url: request.url + '?tenant=foreign' },
    { method: 'GET', url: request.url },
    { url: `${origin}/api/widgets/intent`, postData: '{}' },
    { url: 'https://example.com/api/privacy' },
  ]) assert.equal(admitted({ ...request, ...patch }, origin, conversation), false);
  assert.equal(admitted(request, origin, [conversation]), false);
  assert.equal(admitted(request, origin, [[conversation]]), false);
});
test('admits current assets, real login and read-only history without booking/model routes', () => {
  for (const p of ['/', '/styles.css', '/m/abc123/main.js', '/api/ai/conversation']) assert.equal(admitted({ method: 'GET', url: origin + p }, origin, conversation), true);
  for (const p of ['/api/auth/email/start', '/api/auth/email/verify', '/api/auth/refresh']) assert.equal(admitted({ method: 'POST', url: origin + p }, origin, conversation), true);
  for (const p of ['/api/ai/chat', '/api/personal-client/appointments', '/api/widgets/resolve']) assert.equal(admitted({ method: 'POST', url: origin + p }, origin, conversation), false);
});
test('admits only the existing bounded thread receipt read', () => {
  const read = { method: 'POST', url: origin + '/api/widgets/resolve', postData: JSON.stringify({ thread_page: { limit: 20 } }) };
  assert.equal(admitted(read, origin, conversation), true);
  for (const body of [{ thread_page: { limit: 21 } }, { thread_page: { limit: 20, cursor: 'other' } }, { thread_page: { limit: 20 }, widget_id: 'other' }, { widget_id: 'other' }]) {
    assert.equal(admitted({ ...read, postData: JSON.stringify(body) }, origin, conversation), false);
  }
});
