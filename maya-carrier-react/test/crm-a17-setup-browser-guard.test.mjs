import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted } from './crm-a17-setup-browser-guard.mjs';
const origin = 'http://127.0.0.1:45678';
const scope = { email: 'synthetic@example.invalid', companyId: 424242, branchId: 'fixture-branch' };
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
test('email code arrays and foreign routes fail closed', () => {
  assert.equal(admitted(call('/api/auth/email/verify', { email: scope.email, code: '123456' }), origin, scope), true);
  assert.equal(admitted(call('/api/auth/email/verify', { email: scope.email, code: [123456] }), origin, scope), false);
  assert.equal(admitted({ url: 'https://example.invalid/', method: 'GET' }, origin, scope), false);
});
test('same URL locator reload and exact recovery read are admitted', () => {
  for (const path of ['/?local_crm_setup=1', '/?local_crm_setup=1&crm_operation=activate&crm_request=' + key, '/api/integrations/crm/operation?operation=activate&requestId=' + key]) assert.equal(admitted({ url: origin + path, method: 'GET' }, origin, scope), true);
  assert.equal(admitted({ url: origin + '/?local_crm_setup=1&token=secret', method: 'GET' }, origin, scope), false);
});
