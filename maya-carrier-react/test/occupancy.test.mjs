import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { assertOwnedLoopback, observeOccupancy } from './occupancy-probe.mjs';

test('synthetic HTTP boundary: current runtime and React text preserve one response and no authority', async () => {
  const requestId = randomUUID();
  const reply = 'После снятия записи сохранилось окно 07.10.2026, 12:00 — 07.10.2026, 13:00 (Europe/Moscow). Предложение сохранено, версия 1. Записи и цены не менялись, сообщения клиентам не отправлялись.';
  const seen = [];
  const result = await observeOccupancy({ requestId, exchange: async (method, route, body) => {
    seen.push({ method, route, body });
    return { status: 201, body: { request_id: body.requestId, reply, coordination: { revision: 1 }, recommendation: { executionAuthority: false }, user_turn: { turnId: randomUUID(), conversationId: randomUUID() } } };
  } });
  assert.deepEqual(result.replies, [reply]);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].body.messages, [{ role: 'user', content: 'Проверь окна после отмен' }]);
  assert.equal(seen[0].body.surface, 'web');
  assert.equal(seen[0].body.requestId, requestId);
});

test('synthetic persisted history passes current projector and remains display-only', async () => {
  const conversationId = randomUUID();
  const turns = ['Проверь окна после отмен', 'Это сохранённый результат предыдущей проверки. Предложение сохранено, версия 1.'].map((text, i) => ({ id: randomUUID(), role: i ? 'assistant' : 'user', text, createdAt: new Date().toISOString(), completed: true }));
  const result = await observeOccupancy({ mode: 'history', exchange: async (method, route, body) => {
    assert.equal(method, 'GET'); assert.equal(route, '/api/ai/conversation'); assert.equal(body, undefined);
    return { status: 200, body: { contract: 'maya.conversation-history/1', conversationId, turns, truncated: false, interrupted: false } };
  } });
  assert.deepEqual(result.replies, [turns[1].text]);
});

test('probe refuses external, redirected and credential-bearing targets before fetch', () => {
  assert.equal(assertOwnedLoopback('http://127.0.0.1:45678'), 'http://127.0.0.1:45678');
  for (const target of ['https://127.0.0.1:443', 'http://localhost:1234', 'http://example.test:1234', 'http://127.0.0.1', 'http://user:secret@127.0.0.1:1234', 'http://127.0.0.1:1234/elsewhere']) assert.throws(() => assertOwnedLoopback(target));
});
