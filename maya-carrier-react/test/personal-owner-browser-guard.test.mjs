import assert from 'node:assert/strict';
import test from 'node:test';
import { admitted, PROMPTS } from './personal-owner-browser-guard.mjs';

const origin = 'http://127.0.0.1:45678';
const scope = { branchId: '11111111-1111-4111-8111-111111111111', date: '2026-10-13', serviceId: 'synthetic-service', staffId: 'synthetic-staff' };
const slots = '/api/available-slots?' + new URLSearchParams({ branchId: scope.branchId, date: scope.date, serviceIds: scope.serviceId, staffId: scope.staffId });
const get = path => ({ method: 'GET', url: origin + path });

test('current personal flow admits exact loopback branch read and scoped availability', () => {
  assert.equal(admitted(get('/api/branches'), origin, scope), true);
  assert.equal(admitted(get(slots), origin, scope), true);
});

test('branch read refuses query, write, foreign origin and credential-bearing URL', () => {
  for (const request of [
    get('/api/branches?tenantId=foreign'), get('/api/branches/foreign'),
    { ...get('/api/branches'), method: 'POST' },
    { method: 'GET', url: 'https://mayaos.ru/api/branches' },
    { method: 'GET', url: 'http://127.0.0.1:45679/api/branches' },
    { method: 'GET', url: 'http://user:password@127.0.0.1:45678/api/branches' },
  ]) assert.equal(admitted(request, origin, scope), false);
});

test('availability refuses missing, substituted or repeated branch and extra authority', () => {
  for (const path of [
    slots.replace('branchId=' + scope.branchId + '&', ''),
    slots.replace(scope.branchId, '22222222-2222-4222-8222-222222222222'),
    slots + '&branchId=' + scope.branchId, slots + '&tenantId=foreign',
    slots.replace(scope.date, '2026-10-14'),
    slots.replace(scope.serviceId, 'foreign-service'), slots.replace(scope.staffId, 'foreign-staff'),
  ]) assert.equal(admitted(get(path), origin, scope), false);
  assert.equal(admitted(get(slots), origin), false);
});

test('new catalog admission cannot admit other external effects', () => {
  for (const path of ['/api/integrations/crm/activate', '/api/notifications/send', '/api/appointments']) {
    assert.equal(admitted({ method: 'POST', url: origin + path, postData: '{}' }, origin, scope), false);
  }
});

test('new self-booking and denied-confirmation probes remain finite and loopback-only', () => {
  const chat = (content) => ({ method: 'POST', url: origin + '/api/ai/chat', postData: JSON.stringify({ surface: 'web', messages: [{ role: 'user', content }] }) });
  for (const content of Object.values(PROMPTS)) assert.equal(admitted(chat(content), origin, scope), true);
  for (const content of ['Запиши другого клиента', 'Отправь сообщение', 'Импортируй клиентов']) assert.equal(admitted(chat(content), origin, scope), false);
  assert.equal(admitted({ ...chat(PROMPTS.prepare), url: 'https://phone-test.mayaos.ru/api/ai/chat' }, origin, scope), false);
});
