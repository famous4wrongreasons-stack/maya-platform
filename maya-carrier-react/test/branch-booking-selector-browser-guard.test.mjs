import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, installGuard, localOrigin, PROMPTS, typedPrompt } from './branch-booking-selector-browser-guard.mjs';

const origin = 'http://127.0.0.1:45678';
const id = 'b1e8778e-4f22-4493-a2ec-f95e4a91483f';
const scenario = { branchName: 'Синтетический филиал', staffName: 'Синтетический мастер', serviceName: 'Синтетическая стрижка', day: '2026-10-10' };
const scope = { emails: ['synthetic@example.invalid'], branchIds: [id], days: [scenario.day], prompts: [PROMPTS.personal, typedPrompt(scenario)] };
const post = (path, body) => ({ url: origin + path, method: 'POST', postData: JSON.stringify(body) });
const chat = { surface: 'web', requestId: id, messages: [{ role: 'user', content: typedPrompt(scenario) }] };
test('guard admits exact owned UI login and fully scoped explicit chat, strips no authority checks', () => {
  assert.equal(admitted(post('/api/auth/email/start', { email: scope.emails[0] }), origin, scope), true);
  assert.equal(admitted(post('/api/auth/email/verify', { email: scope.emails[0], code: '123456' }), origin, scope), true);
  assert.equal(admitted(post('/api/auth/refresh', { refreshToken: 'synthetic-refresh' }), origin, scope), true);
  assert.equal(admitted(post('/api/ai/chat', chat), origin, scope), true);
  for (const body of [{ ...chat, tenantId: id }, { ...chat, role: 'admin' }, { ...chat, requestId: '' }, { ...chat, messages: [{ role: 'user', content: 'Покажи свободное время' }] }]) assert.equal(admitted(post('/api/ai/chat', body), origin, scope), false);
  assert.equal(admitted(post('/api/auth/email/start', { email: 'foreign@example.invalid' }), origin, scope), false);
  assert.equal(admitted(post('/api/auth/email/verify', { email: scope.emails[0], code: '123456', tenantSlug: 'foreign' }), origin, scope), false);
});
test('branch availability admits exact declared query and refuses missing, duplicate, foreign or raw authority', () => {
  const url = origin + `/api/available-slots?date=${scenario.day}&serviceIds=81&staffId=71&branchId=${id}`;
  assert.equal(admitted({ url, method: 'GET' }, origin, scope), true);
  for (const invalid of [url + '&tenantId=foreign', url + '&branchId=' + id, url.replace('&branchId=' + id, ''), url.replace('serviceIds=81', 'serviceIds=81%2C82'), url.replace('staffId=71', 'staffId=foreign'), url.replace('2026-10-10', '2026-10-11')]) assert.equal(admitted({ url: invalid, method: 'GET' }, origin, scope), false);
  for (const path of ['/api/branches', '/api/services', '/api/staff', '/api/personal-client/appointments/results']) assert.equal(admitted({ url: origin + path, method: 'GET' }, origin, scope), true);
  assert.equal(admitted({ url: origin + '/api/branches?tenantId=foreign', method: 'GET' }, origin, scope), false);
});
test('preview/create require selected owned branch and exact personal payload without raw identity', () => {
  const preview = { branchId: id, serviceIds: ['82'], staffId: '72', start: '2026-10-10T07:00:00.000Z' };
  assert.equal(admitted(post('/api/personal-client/appointments/preview', preview), origin, scope), true);
  assert.equal(admitted(post('/api/personal-client/appointments', { ...preview, previewFactsHash: 'a'.repeat(64) }), origin, scope), true);
  assert.equal(admitted(post('/api/personal-client/appointments', preview), origin, scope), false);
  for (const extra of [{ clientId: id }, { clientPhone: 'synthetic' }, { tenantId: id }, { role: 'admin' }]) assert.equal(admitted(post('/api/personal-client/appointments/preview', { ...preview, ...extra }), origin, scope), false);
  assert.equal(admitted(post('/api/personal-client/appointments/preview', { ...preview, branchId: 'foreign' }), origin, scope), false);
});
test('widget admission preserves sealed opaque controls and bounded observed/history read', () => {
  const intent = { contract: 'maya.widget.intent.submission/1', widget_id: id, intent_token: 'synthetic-sealed-token', inputs: { slot_ref: 'synthetic-opaque-slot' }, client_nonce: id, profile_id: 'pwa/1' };
  assert.equal(admitted(post('/api/widgets/intent', intent), origin, scope), true);
  assert.equal(admitted(post('/api/widgets/intent', { ...intent, inputs: null }), origin, scope), true);
  assert.equal(admitted(post('/api/widgets/intent', { ...intent, inputs: { branchId: id } }), origin, scope), false);
  assert.equal(admitted(post('/api/widgets/intent', { ...intent, readback_ack: {} }), origin, scope), false);
  const resolve = { thread_page: { limit: 30 } };
  assert.equal(admitted(post('/api/widgets/resolve', resolve), origin, scope), true);
  assert.equal(admitted(post('/api/widgets/resolve', { ...resolve, rendered: { widget_id: id, body_hash: 'a'.repeat(64), envelope_seal: 'synthetic-seal' } }), origin, scope), true);
  assert.equal(admitted(post('/api/widgets/resolve', { thread_page: { limit: 51 } }), origin, scope), false);
  assert.equal(admitted(post('/api/widgets/resolve', { ...resolve, tenantId: id }), origin, scope), false);
  assert.equal(admitted(post('/api/widgets/rendered', {}), origin, scope), false);
  assert.equal(admitted(post('/api/widgets/observe', {}), origin, scope), false);
});
test('external origins, unrelated effects, routes, cookies, unsafe local origins all refuse', () => {
  for (const url of ['https://mayaos.ru/api/ai/chat', 'http://127.0.0.1:45679/api/ai/chat', 'http://localhost:45678/api/ai/chat', origin + '/api/ai/transcribe', origin + '/api/integrations/crm/activate', origin + '/api/ai/chat?fixture=1', 'http://user:pass@127.0.0.1:45678/api/ai/chat']) assert.equal(admitted({ ...post('/api/ai/chat', chat), url }, origin, scope), false);
  assert.equal(admitted({ ...post('/api/ai/chat', chat), method: 'DELETE' }, origin, scope), false);
  for (const bad of ['https://127.0.0.1:45678', 'http://127.0.0.1:5432', 'http://127.0.0.1:55611', origin + '/api', origin + '?token=x']) assert.throws(() => localOrigin(bad));
});
test('guard operates at request stage and never fulfills a response or records body/query/auth', async () => {
  const calls = [], listeners = new Set();
  const page = { sessionId: 'owned', browser: { listeners }, send: async (...args) => { calls.push(args); } };
  const guard = await installGuard(page, origin, scope);
  const notify = [...listeners][0];
  notify({ sessionId: 'owned', method: 'Fetch.requestPaused', params: { requestId: '1', request: post('/api/ai/chat', chat) } });
  notify({ sessionId: 'owned', method: 'Fetch.requestPaused', params: { requestId: '2', request: { ...post('/api/ai/chat', chat), url: 'https://foreign.example/x?secret=hidden' } } });
  assert.deepEqual(guard.blocked, [{ method: 'POST', path: '/x' }]); assert.deepEqual(guard.errors, []);
  assert.deepEqual(calls.map(([method]) => method), ['Network.setBypassServiceWorker', 'Network.setBlockedURLs', 'Fetch.enable', 'Fetch.continueRequest', 'Fetch.failRequest']);
  assert.equal(calls[2][1].patterns[0].requestStage, 'Request');
});
