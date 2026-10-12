// Fixed local acceptance window. These restrictions never grant Client authority.
import assert from 'node:assert/strict';
import { OWNER_CHAT_QUESTIONS } from './local-owner-chat-policy.mjs';
import { ownerHistoryIngress } from './local-owner-history-policy.mjs';
import { assertOwnerChatScope, assertOwnerChatActor } from './local-owner-scope.mjs';
export { CORE_OWNER_HISTORY_PROFILE as OWNER_HISTORY_REVIEW_PROFILE } from './conversation-qualification/current-candidate-budget.mjs';
export const OWNER_HISTORY_REVIEW_ADMISSION = 'explicit_existing_personal_history_and_bounded_planner';
export const HISTORY_REVIEW_QUESTIONS = Object.freeze(['Покажи историю моих визитов', 'Когда я был у вас последний раз?']);
export const HISTORY_REVIEW_TOOLS = Object.freeze(['appointments.own.list']);
const historyQuestions = [...OWNER_CHAT_QUESTIONS, ...HISTORY_REVIEW_QUESTIONS];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));

export function historyReviewIngress(method, route, headers, body, origin, scope) {
  assertOwnerChatScope(scope);
  if (headers.origin && headers.origin !== origin) return 'history_review_origin_refused';
  if (method !== 'POST' || route !== '/api/ai/chat') return ownerHistoryIngress(method, route, headers, body, origin, scope);
  if (!body || Object.keys(body).some(k => !['surface','audience','requestId','conversationId','messages'].includes(k))
    || body.surface !== 'web' || ![undefined, 'owner'].includes(body.audience)
    || !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId ?? '')
    || (body.conversationId !== undefined && !/^[a-f0-9-]{36}$/i.test(body.conversationId))
    || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12
    || body.messages.some(m => !exact(m, ['role','content']) || !['user','assistant'].includes(m.role)
      || typeof m.content !== 'string' || m.content.length < 1 || m.content.length > 2000)
    || body.messages.at(-1).role !== 'user' || !HISTORY_REVIEW_QUESTIONS.includes(body.messages.at(-1).content)
    || body.messages.some(m => m.role === 'user' && !historyQuestions.includes(m.content))) return 'history_review_body_refused';
  return null;
}

export function createHistoryReviewWindow(scope, { now = Date.now, durationMs = 1800000 } = {}) {
  assertOwnerChatScope(scope);
  assert.ok(Number.isSafeInteger(durationMs) && durationMs > 0 && durationMs <= 1800000);
  const expires = now() + durationMs, seen = new Set();
  let busy = false, index = 0, closed = false;
  return {
    begin({ user, body }) {
      assertOwnerChatActor(user, scope);
      assert.ok(!closed && !busy && now() < expires && !seen.has(body.requestId)
        && index < HISTORY_REVIEW_QUESTIONS.length && body.messages.at(-1)?.content === HISTORY_REVIEW_QUESTIONS[index], 'history_review_sequence_refused');
      seen.add(body.requestId); busy = true;
      const caseId = ['owner-personal-history','owner-personal-last-visit'][index++];
      let done = false;
      return Object.freeze({ caseId, turn: 1,
        assertCurrent(actor) { assertOwnerChatActor(actor, scope); assert.ok(!done && !closed && now() < expires, 'history_review_closed'); },
        finish() { if (!done) { done = true; busy = false; } },
      });
    },
    close() { closed = true; },
    get state() { return { attemptedTurns: index, busy, closed, expiresAt: new Date(expires).toISOString() }; },
  };
}

// Inspect the actual serialized DeepSeek request before the broker receives it.
// Refuse rather than redact/substitute private results or change product prompts.
export function assertHistoryPlanningRequest(init) {
  const outer = JSON.parse(init.body);
  assert.ok(outer.messages?.length === 2 && outer.messages[0].role === 'system' && outer.messages[1].role === 'user', 'history_review_wire_shape');
  const input = JSON.parse(outer.messages[1].content);
  assert.ok(input.phase === 'tool_planning' && Array.isArray(input.tool_results) && input.tool_results.length === 0
    && Array.isArray(input.remembered_notes) && input.remembered_notes.length === 0 && input.semantic_plan === null
    && !Object.hasOwn(input, 'pending_owner_review') && !Object.hasOwn(input, 'grounding_corrections')
    && Array.isArray(input.conversation) && input.conversation.length > 0
    && input.conversation.every(m => exact(m, ['role','content']) && m.role === 'user' && historyQuestions.includes(m.content))
    && HISTORY_REVIEW_QUESTIONS.includes(input.conversation.at(-1).content), 'history_review_private_model_input_refused');
}
