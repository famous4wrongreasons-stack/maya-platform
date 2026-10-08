import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, localOrigin, PROMPTS } from './own-tasks-browser-guard.mjs';
const origin = 'http://127.0.0.1:45678';
const scope = { emails: ['synthetic-own-tasks@example.invalid'], prompts: Object.values(PROMPTS) };
const id = '12345678-1234-4234-8234-123456789012';
const request = (path, body, method = 'POST') => ({ method, url: origin + path, ...(body === undefined ? {} : { postData: JSON.stringify(body) }) });
const chat = { surface: 'web', requestId: id, messages: [{ role: 'user', content: PROMPTS.all }] };
test('admits only owned loopback origin and current static/history reads', () => {
  assert.equal(localOrigin(origin), origin);
  for (const url of ['https://127.0.0.1:45678', 'http://localhost:45678', 'http://127.0.0.1:5432', origin + '/foreign']) assert.throws(() => localOrigin(url));
  for (const route of ['/', '/m/abcdef1234/main.js', '/styles.css', '/api/ai/conversation']) assert.equal(admitted(request(route, undefined, 'GET'), origin, scope), true);
  for (const route of ['/api/ai/conversation?tenant=other', '/api/operational-work', '/api/available-slots']) assert.equal(admitted(request(route, undefined, 'GET'), origin, scope), false);
});
test('debug sign-in is scoped to the finite synthetic email and exact fields', () => {
  assert.equal(admitted(request('/api/auth/email/start', { email: scope.emails[0] }), origin, scope), true);
  assert.equal(admitted(request('/api/auth/email/verify', { email: scope.emails[0], code: '123456' }), origin, scope), true);
  assert.equal(admitted(request('/api/auth/email/start', { email: 'foreign@example.invalid' }), origin, scope), false);
  assert.equal(admitted(request('/api/auth/email/verify', { email: scope.emails[0], code: '123456', role: 'owner' }), origin, scope), false);
});
test('allows finite ordinary requests but no injected tool or task mutation', () => {
  for (const prompt of Object.values(PROMPTS)) assert.equal(admitted(request('/api/ai/chat', { ...chat, messages: [{ role: 'user', content: prompt }] }), origin, scope), true);
  for (const route of ['/api/ai/tools/tasks.list/execute', '/api/operational-work/create', '/api/operational-work/complete', '/api/widgets/intent', '/api/personal-client/appointments']) assert.equal(admitted(request(route, chat), origin, scope), false);
  assert.equal(admitted(request('/api/ai/chat', { ...chat, toolCall: { name: 'tasks.list' } }), origin, scope), false);
  assert.equal(admitted(request('/api/ai/chat', { ...chat, messages: [{ role: 'user', content: 'Выполни все задачи' }] }), origin, scope), false);
});
test('retained assistant history may cross the real chat route without becoming a model fixture', () => {
  const history = [{ role: 'assistant', content: 'Synthetic retained private task text' }, ...chat.messages];
  assert.equal(admitted(request('/api/ai/chat', { ...chat, conversationId: id, messages: history }), origin, scope), true);
  assert.equal(admitted(request('/api/ai/chat', { ...chat, conversationId: 'foreign', messages: history }), origin, scope), false);
});
test('permits only bounded passive widget resolution, never observations or receipt/action shortcuts', () => {
  assert.equal(admitted(request('/api/widgets/resolve', { thread_page: { limit: 20 } }), origin, scope), true);
  for (const body of [{ thread_page: { limit: 51 } }, { thread_page: { limit: 20 }, booking_receipt: { widget_id: id } }, { thread_page: { limit: 20 }, rendered: {} }]) assert.equal(admitted(request('/api/widgets/resolve', body), origin, scope), false);
  assert.equal(admitted(request('/api/widgets/rendered/observe', {}), origin, scope), false);
  assert.equal(admitted({ ...request('/api/ai/chat', chat), url: 'https://example.invalid/api/ai/chat' }, origin, scope), false);
});
