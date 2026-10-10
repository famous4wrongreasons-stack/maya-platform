// Additional restrictions for one local owner READ qualification. These are not
// product permissions: canonical auth/tool/source owners must still authorize.
import assert from 'node:assert/strict';
import { ingressDecision } from './local-onboarding-profile.mjs';

export { CORE_OWNER_READ_PROFILE as OWNER_CHAT_PROFILE } from './conversation-qualification/current-candidate-budget.mjs';
export const OWNER_CHAT_TOOLS = Object.freeze([
  'catalog.services.read', 'catalog.staff.read', 'company.business-hours.read',
]);
export const OWNER_CHAT_QUESTIONS = Object.freeze([
  'Какие услуги есть в нашем салоне и сколько они стоят?',
  'Какие мастера работают в нашем салоне?',
  'Какой адрес и часы работы у нашего салона?',
]);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function assertOwnerChatScope(scope) {
  assert.ok(exact(scope, ['stateDirectory', 'initialManifestSha256', 'privateStateSha256',
    'restartReceiptPath', 'restartReceiptSha256', 'tenantId', 'userId', 'branchId', 'tenantSlug', 'companyId']), 'owner_chat_scope_shape');
  assert.ok(typeof scope.stateDirectory === 'string' && /^\/private\/tmp\/[a-zA-Z0-9_-]+$/.test(scope.stateDirectory), 'owner_chat_state');
  assert.ok(typeof scope.restartReceiptPath === 'string' && /^\/private\/tmp\/[a-zA-Z0-9_-]+\/restart.json$/.test(scope.restartReceiptPath), 'owner_chat_restart');
  for (const key of ['initialManifestSha256', 'privateStateSha256', 'restartReceiptSha256']) assert.ok(hash(scope[key]), 'owner_chat_state_pin');
  for (const key of ['tenantId', 'userId', 'branchId']) assert.ok(opaque(scope[key]), 'owner_chat_identity');
  assert.ok(typeof scope.tenantSlug === 'string' && /^[a-z0-9-]{1,80}$/.test(scope.tenantSlug), 'owner_chat_slug');
  assert.ok(typeof scope.companyId === 'string' && /^[1-9][0-9]{0,14}$/.test(scope.companyId), 'owner_chat_company');
}

export function assertOwnerChatActor(user, scope) {
  assertOwnerChatScope(scope);
  assert.ok(user?.userId === scope.userId && user?.tenantId === scope.tenantId
    && user.role === 'tenant_owner' && user.membershipStatus === 'active', 'owner_chat_actor_refused');
}

export function ownerChatIngress(method, rawPath, headers, body, origin, scope) {
  assertOwnerChatScope(scope);
  if (headers.origin && headers.origin !== origin) return 'local_owner_chat_origin_refused';
  if (method === 'POST' && ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(rawPath)) {
    if (rawPath === '/api/auth/login' && body?.tenantSlug !== scope.tenantSlug) return 'local_owner_chat_tenant_refused';
    return ingressDecision(method, rawPath, headers.origin, origin, body);
  }
  if (method === 'GET' && ['/api/health', '/api/health/ready', '/api/branches', '/api/integrations/crm', '/api/ai/conversation'].includes(rawPath)) return null;
  if (method !== 'POST' || rawPath !== '/api/ai/chat') return 'local_owner_chat_route_refused';
  if (!body || Object.keys(body).some(key => !['surface', 'audience', 'requestId', 'conversationId', 'messages'].includes(key))
    || body.surface !== 'web' || ![undefined, 'owner'].includes(body.audience)
    || !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId ?? '')
    || (body.conversationId !== undefined && !/^[a-f0-9-]{36}$/i.test(body.conversationId))
    || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12
    || body.messages.some(message => !exact(message, ['role', 'content']) || !['user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string' || message.content.length < 1 || message.content.length > 2000)) return 'local_owner_chat_body_refused';
  const last = body.messages.at(-1);
  if (last.role !== 'user' || !OWNER_CHAT_QUESTIONS.includes(last.content)) return 'local_owner_chat_question_refused';
  // This first bounded live probe admits these public-fact questions only.
  // Historical user text cannot smuggle an unrelated mutation into the planner.
  if (body.messages.some(message => message.role === 'user' && !OWNER_CHAT_QUESTIONS.includes(message.content))) return 'local_owner_chat_history_refused';
  return null;
}

export function assertOwnerChatTool(user, name, scope) {
  assertOwnerChatActor(user, scope);
  assert.ok(OWNER_CHAT_TOOLS.includes(name), 'owner_chat_tool_refused');
}

// One serialized request; no hidden retries/new question IDs can expand this
// fixed window. Replays are refused here, never silently dispatched twice.
export function createOwnerChatWindow(scope, { now = Date.now, durationMs = 600000 } = {}) {
  assertOwnerChatScope(scope);
  assert.ok(Number.isSafeInteger(durationMs) && durationMs > 0 && durationMs <= 600000);
  const expires = now() + durationMs, seen = new Set();
  let busy = false, index = 0, closed = false;
  return {
    begin(request) {
      assert.ok(!closed && !busy && now() < expires, 'owner_chat_window_closed');
      assertOwnerChatActor(request.user, scope);
      assert.ok(!seen.has(request.body.requestId) && index < OWNER_CHAT_QUESTIONS.length
        && request.body.messages.at(-1)?.content === OWNER_CHAT_QUESTIONS[index], 'owner_chat_sequence_refused');
      seen.add(request.body.requestId); busy = true;
      const caseId = ['owner-salon-services', 'owner-salon-staff', 'owner-salon-company'][index++];
      let done = false;
      return Object.freeze({ caseId, turn: 1,
        assertCurrent(user) { assert.ok(!done && !closed && now() < expires, 'owner_chat_request_closed'); assertOwnerChatActor(user, scope); },
        finish() { if (!done) { done = true; busy = false; } },
      });
    },
    close() { closed = true; },
    get state() { return { attemptedTurns: index, busy, closed, expiresAt: new Date(expires).toISOString() }; },
  };
}
