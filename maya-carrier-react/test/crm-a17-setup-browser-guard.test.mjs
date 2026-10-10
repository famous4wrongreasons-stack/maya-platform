import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, installGuard } from './crm-a17-setup-browser-guard.mjs';
const origin = 'http://127.0.0.1:45678';
const scope = { email: 'wl-11111111@widgets-live.test', tenantSlug: 'widgets-live-11111111111141118111111111111111', password: 'wl-22222222-2222-4222-8222-222222222222', companyId: 424242, branchId: 'fixture-branch' };
const key = '11111111-1111-4111-8111-111111111111';
const call = (path, body, headers = {}) => ({ url: origin + path, method: 'POST', headers, postData: JSON.stringify(body) });
test('only exact synthetic setup material is admitted', () => {
  const body = { provider: 'yclients', apiToken: 'SYNTHETIC_A17_V1', expectedVersion: null, settingsJson: { companyId: scope.companyId, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: scope.companyId, branchId: scope.branchId } } };
  const request = call('/api/integrations/crm/connect', body, { 'Idempotency-Key': key });
  assert.equal(admitted(request, origin, scope), true);
  for (const altered of [{ ...body, apiToken: 'other' }, { ...body, expectedVersion: 'f'.repeat(64) }, { ...body, extra: true }]) assert.equal(admitted(call('/api/integrations/crm/connect', altered, request.headers), origin, scope), false);
  assert.equal(admitted({ ...request, headers: {} }, origin, scope), false);
  assert.equal(admitted(call('/api/ai/chat', { messages: [] }), origin, scope), false);
});
test('only the exact private synthetic password login is admitted; OTP stays closed', () => {
  const body = { tenantSlug: scope.tenantSlug, email: scope.email, password: scope.password };
  assert.equal(admitted(call('/api/auth/login', body), origin, scope), true);
  for (const altered of [{ ...body, tenantSlug: 'foreign' }, { ...body, email: 'foreign@example.invalid' }, { ...body, password: 'wrong' }, { ...body, password: [scope.password] }, { ...body, extra: true }]) assert.equal(admitted(call('/api/auth/login', altered), origin, scope), false);
  assert.equal(admitted(call('/api/auth/login', body), origin, { ...scope, password: undefined }), false);
  for (const route of ['/api/auth/email/start', '/api/auth/email/verify']) assert.equal(admitted(call(route, { email: scope.email, code: '123456' }), origin, scope), false);
  assert.equal(admitted({ url: 'https://example.invalid/', method: 'GET' }, origin, scope), false);
});
test('chat and widget routes remain outside the actual setup-read profile', () => {
  assert.equal(admitted({ url: origin + '/api/ai/conversation', method: 'GET' }, origin, scope), false);
  assert.equal(admitted(call('/api/widgets/resolve', { thread_page: { limit: 20 } }), origin, scope), false);
});
test('negative provider cases accept only their explicitly selected synthetic material', () => {
  for (const apiToken of ['SYNTHETIC_A17_DENIED', 'SYNTHETIC_A17_COMPANY_MISSING']) {
    const specific = { ...scope, apiToken };
    const body = { provider: 'yclients', apiToken, expectedVersion: null, settingsJson: { companyId: scope.companyId, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: scope.companyId, branchId: scope.branchId } } };
    assert.equal(admitted(call('/api/integrations/crm/connect', body, { 'Idempotency-Key': key }), origin, specific), true);
    assert.equal(admitted(call('/api/integrations/crm/connect', { ...body, apiToken: 'SYNTHETIC_A17_V1' }, { 'Idempotency-Key': key }), origin, specific), false);
    assert.equal(admitted(call('/api/integrations/crm/activate', { expectedVersion: 'a'.repeat(64) }, { 'Idempotency-Key': key }), origin, specific), false);
  }
});
test('same URL locator reload and exact recovery read are admitted', () => {
  for (const path of ['/?local_crm_setup=1', '/?local_crm_setup=1&crm_operation=install&crm_request=' + key, '/?local_crm_setup=1&crm_operation=activate&crm_request=' + key, '/api/integrations/crm/operation?operation=activate&requestId=' + key, '/api/integrations/crm/operation?operation=install&requestId=' + key]) assert.equal(admitted({ url: origin + path, method: 'GET' }, origin, scope), true);
  assert.equal(admitted({ url: origin + '/?local_crm_setup=1&token=secret', method: 'GET' }, origin, scope), false);
});

test('refusal page observes the real response and disposal leaves no interception listener', async () => {
  const sends = [];
  const page = { sessionId: 'synthetic', browser: { listeners: new Set() }, send: async (method, params) => { sends.push({ method, params }); } };
  const scoped = { ...scope, apiToken: 'SYNTHETIC_A17_DENIED' };
  const guard = await installGuard(page, origin, scoped, { lossInjection: false });
  const request = call('/api/integrations/crm/connect', { provider: 'yclients', apiToken: scoped.apiToken, expectedVersion: null, settingsJson: { companyId: scope.companyId, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: scope.companyId, branchId: scope.branchId } } }, { 'Idempotency-Key': key });
  const listener = [...page.browser.listeners][0];
  for (const response of [undefined, 400]) listener({ sessionId: page.sessionId, method: 'Fetch.requestPaused', params: { requestId: 'synthetic-only', request, ...(response ? { responseStatusCode: response } : {}) } });
  assert.deepEqual(sends.slice(-2).map(row => row.method), ['Fetch.continueRequest', 'Fetch.continueRequest']);
  assert.equal(guard.droppedUnregisteredRequests, 0);
  assert.equal(guard.droppedCommittedResponses, 0);
  assert.deepEqual(guard.blocked, []);
  assert.equal(JSON.stringify(guard).includes('dispose'), false);
  guard.dispose();
  assert.equal(page.browser.listeners.size, 0);
  await assert.rejects(installGuard(page, origin, scope, { lossInjection: 'false' }));
  await assert.rejects(installGuard(page, origin, scope, { wider: true }));
});
