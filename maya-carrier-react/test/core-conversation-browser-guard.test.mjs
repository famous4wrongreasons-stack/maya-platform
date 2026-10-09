import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoreBrowserGuard } from './core-conversation-browser-guard.mjs';
const origin = 'http://127.0.0.1:49101';
const uuid = '11111111-1111-4111-8111-111111111111';
const messages = [{ role: 'user', content: 'Есть время к Артёму завтра на мужскую стрижку?' }];
const req = (route, body, method = 'POST') => ({ url: origin + route, method, postData: JSON.stringify(body) });
const chat = patch => req('/api/ai/chat', { surface: 'web', requestId: uuid, messages, ...patch });
test('chat requires the current exact turn and admits at most one POST even if its response is lost', () => {
  const g = createCoreBrowserGuard(origin, 'synthetic@example.test');
  assert.equal(g.admit(chat()), false);
  g.expectTurn(messages);
  assert.equal(g.admit(chat({ messages: [{ role: 'user', content: 'another request' }] })), false);
  assert.equal(g.admit(chat()), true);
  assert.equal(g.admit(chat()), false);
});
test('continuation uses actual history and exact conversation; source or role injection refuses', () => {
  const g = createCoreBrowserGuard(origin, 'synthetic@example.test');
  const next = [...messages, { role: 'assistant', content: 'Actual source reply' }, { role: 'user', content: 'Запиши меня на 17:00' }];
  g.expectTurn(next, uuid);
  for (const patch of [{ messages: next }, { messages: next, conversationId: uuid, audience: 'owner' }, { messages: next, conversationId: uuid, tenantId: uuid }, { messages: [...messages], conversationId: uuid }]) assert.equal(g.admit(chat(patch)), false);
  assert.equal(g.admit(chat({ messages: next, conversationId: uuid })), true);
});
test('mutation, arbitrary tool, telemetry and external calls are refused while canonical auth/history remain available', () => {
  const g = createCoreBrowserGuard(origin, 'synthetic@example.test');
  for (const route of ['/api/widgets/intent', '/api/ai/tools/booking.create', '/api/ai/transcribe', '/api/crm/integrations', '/api/privacy/conversations/x/erasure']) assert.equal(g.admit(req(route, {})), false);
  assert.equal(g.admit({ ...req('/api/auth/email/start', { email: 'synthetic@example.test' }), url: 'https://mayaos.ru/api/auth/email/start' }), false);
  assert.equal(g.admit(req('/api/auth/email/start', { email: 'foreign@example.test' })), false);
  assert.equal(g.admit(req('/api/auth/email/start', { email: 'synthetic@example.test' })), true);
  assert.equal(g.admit(req('/api/ai/conversation', undefined, 'GET')), true);
  assert.equal(g.admit(req('/api/widgets/resolve', { thread_page: { limit: 20 } })), true);
});
