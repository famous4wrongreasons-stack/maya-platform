import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, installGuard, localOrigin, INITIAL_REQUESTS, ordinaryPrompts } from './ordinary-booking-selector-browser-guard.mjs';

const origin = 'http://127.0.0.1:45678', id = 'b1e8778e-4f22-4493-a2ec-f95e4a91483f';
const prompts = ordinaryPrompts({ day: '2026-10-10', alternateDay: '2026-10-11', otherStaffName: 'Другой синтетический мастер', otherServiceName: 'Синтетическая борода' });
const scope = { emails: ['synthetic@example.invalid'], prompts: [...INITIAL_REQUESTS, ...Object.values(prompts)] };
const post = (path, body) => ({ url: origin + path, method: 'POST', postData: JSON.stringify(body) });
const chat = content => ({ surface: 'web', requestId: id, messages: [{ role: 'user', content }] });
test('ordinary guard admits exact ordinary/paraphrase, finite correction and explicit resume chat', () => {
  assert.equal(prompts.exactTime, 'В 14:30');
  assert.equal(prompts.timeCorrection, 'Нет, в 15:00');
  for (const prompt of scope.prompts) assert.equal(admitted(post('/api/ai/chat', chat(prompt)), origin, scope), true);
  for (const prompt of ['Запиши другого клиента', 'Покажи свободное время', 'Повтори оплату']) assert.equal(admitted(post('/api/ai/chat', chat(prompt)), origin, scope), false);
  for (const extra of [{ tenantId: id }, { role: 'admin' }, { staff_id: '72' }, { service_ids: ['82'] }, { branchId: id }]) assert.equal(admitted(post('/api/ai/chat', { ...chat(prompts.initial), ...extra }), origin, scope), false);
});
test('ordinary guard allows real owned email login and bounded history without raw route authority', () => {
  assert.equal(admitted(post('/api/auth/email/start', { email: scope.emails[0] }), origin, scope), true);
  assert.equal(admitted(post('/api/auth/email/verify', { email: scope.emails[0], code: '123456' }), origin, scope), true);
  assert.equal(admitted(post('/api/auth/refresh', { refreshToken: 'synthetic-refresh' }), origin, scope), true);
  assert.equal(admitted(post('/api/auth/email/start', { email: 'foreign@example.invalid' }), origin, scope), false);
  assert.equal(admitted(post('/api/auth/email/verify', { email: scope.emails[0], code: '123456', tenantSlug: 'foreign' }), origin, scope), false);
  assert.equal(admitted({ url: origin + '/api/ai/conversation', method: 'GET' }, origin, scope), true);
  assert.equal(admitted({ url: origin + '/api/ai/conversation?tenantId=foreign', method: 'GET' }, origin, scope), false);
  assert.equal(admitted(post('/api/widgets/resolve', { thread_page: { limit: 30 } }), origin, scope), true);
  assert.equal(admitted(post('/api/widgets/resolve', { thread_page: { limit: 51 } }), origin, scope), false);
});
test('ordinary guard admits only existing sealed selector/confirmation control input shapes', () => {
  const intent = { contract: 'maya.widget.intent.submission/1', widget_id: id, intent_token: 'synthetic-token', inputs: null, client_nonce: id, profile_id: 'pwa/1' };
  assert.equal(admitted(post('/api/widgets/intent', intent), origin, scope), true);
  for (const key of ['service_ref', 'staff_ref', 'slot_ref']) assert.equal(admitted(post('/api/widgets/intent', { ...intent, inputs: { [key]: 'synthetic-opaque-ref' } }), origin, scope), true);
  for (const inputs of [{ date: '2026-10-10' }, { service_id: '81' }, { branchId: id }, { service_ref: 'a', staff_ref: 'b' }]) assert.equal(admitted(post('/api/widgets/intent', { ...intent, inputs }), origin, scope), false);
  assert.equal(admitted(post('/api/widgets/intent', { ...intent, authority: 'synthetic' }), origin, scope), false);
  assert.equal(admitted(post('/api/widgets/resolve', { thread_page: { limit: 1 }, rendered: { widget_id: id, body_hash: 'a'.repeat(64), envelope_seal: 'synthetic-seal' } }), origin, scope), true);
});
test('ordinary guard admits only an explicit bounded booking receipt locator without observation or authority fields', () => {
  const receipt = { thread_page: { limit: 20 }, booking_receipt: { widget_id: id } };
  const allowed = body => admitted(post('/api/widgets/resolve', body), origin, scope);
  assert.equal(allowed(receipt), true);
  for (const body of [
    { ...receipt, rendered: { widget_id: id, body_hash: 'a'.repeat(64), envelope_seal: 'synthetic-seal' } },
    { ...receipt, rendered: null },
    { ...receipt, tenant_id: id },
    { ...receipt, action_id: id },
    { ...receipt, actor_id: id },
    { ...receipt, booking_receipt: null },
    { ...receipt, booking_receipt: [] },
    { ...receipt, booking_receipt: {} },
    { ...receipt, booking_receipt: { widget_id: 'not-a-uuid' } },
    { ...receipt, booking_receipt: { widget_id: id, action_id: id } },
    { ...receipt, thread_page: { limit: 1 } },
    { ...receipt, thread_page: { limit: 21 } },
    { ...receipt, thread_page: { limit: 20, before: id } },
  ]) assert.equal(allowed(body), false);
});
test('ordinary guard refuses personal form, availability/API tools shortcuts and every external origin', () => {
  for (const path of ['/api/branches', '/api/services', '/api/staff', '/api/available-slots', '/api/personal-client/appointments/results']) assert.equal(admitted({ url: origin + path, method: 'GET' }, origin, scope), false);
  for (const path of ['/api/ai/tools/execute', '/api/personal-client/appointments/preview', '/api/personal-client/appointments', '/api/widgets/rendered', '/api/widgets/observe', '/api/ai/transcribe', '/api/integrations/crm/activate']) assert.equal(admitted(post(path, {}), origin, scope), false);
  for (const url of ['https://mayaos.ru/api/ai/chat', 'http://127.0.0.1:45679/api/ai/chat', 'http://localhost:45678/api/ai/chat', 'http://user:pass@127.0.0.1:45678/api/ai/chat']) assert.equal(admitted({ ...post('/api/ai/chat', chat(prompts.initial)), url }, origin, scope), false);
  for (const bad of ['https://127.0.0.1:45678', 'http://127.0.0.1:5432', 'http://127.0.0.1:55611', origin + '/api', origin + '?token=x']) assert.throws(() => localOrigin(bad));
});
test('ordinary guard only continues or blocks actual requests and never records bodies or credentials', async () => {
  const calls = [], listeners = new Set();
  const page = { sessionId: 'owned', browser: { listeners }, send: async (...args) => { calls.push(args); } };
  const guard = await installGuard(page, origin, scope);
  const notify = [...listeners][0];
  notify({ sessionId: 'owned', method: 'Fetch.requestPaused', params: { requestId: '1', request: post('/api/ai/chat', chat(prompts.initial)) } });
  notify({ sessionId: 'owned', method: 'Fetch.requestPaused', params: { requestId: '2', request: { ...post('/api/ai/chat', chat(prompts.initial)), url: 'https://foreign.example/x?secret=hidden' } } });
  assert.deepEqual(guard.blocked, [{ method: 'POST', path: '/x' }]); assert.deepEqual(guard.errors, []);
  assert.deepEqual(calls.map(([method]) => method), ['Network.setBypassServiceWorker', 'Network.setBlockedURLs', 'Fetch.enable', 'Fetch.continueRequest', 'Fetch.failRequest']);
  assert.equal(calls[2][1].patterns[0].requestStage, 'Request');
});
