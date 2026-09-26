// K5 / S3 — the network client and the session (src/net/**).
//
//   node --test test/net.test.mjs
//
// Every response body below is transcribed inline from the cited backend source (so this suite does
// not wait on S7's dev/fixtures/api/**, which carry the same bodies for the mock server). `fetch` is
// replaced by a recorder; nothing leaves the process. The storage and document globals are trapped
// BEFORE the net modules load, and the last test asserts they were never touched (R1 memory-only, A6).

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(SH, rel), 'utf8');

// ── traps: installed before any net module is evaluated ────────────────────────────────────────
const touched = [];
for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'document', 'cookieStore']) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      touched.push(name);
      throw new Error(`src/net touched ${name}`);
    },
  });
}

// ── the wire recorder ──────────────────────────────────────────────────────────────────────────
const wire = [];
const everyUrl = new Set();
let route = () => {
  throw new Error('no route installed');
};
globalThis.fetch = async (url, init = {}) => {
  const req = {
    url: String(url),
    init,
    headers: { ...(init.headers ?? {}) },
    raw: init.body,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    signal: init.signal,
  };
  wire.push(req);
  everyUrl.add(req.url);
  return route(req);
};
const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const hang = (req) =>
  new Promise((_, reject) => {
    req.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
  });
const networkDown = () => {
  throw new TypeError('fetch failed');
};
/** Routes by path; each value is a response, a handler, or a queue (array) consumed in order. */
const serve = (table) => {
  wire.length = 0;
  route = async (req) => {
    const key = req.url;
    let entry = table[key];
    if (Array.isArray(entry)) {
      if (entry.length === 0) throw new Error(`no more responses queued for ${key}`);
      entry = entry.shift();
    }
    if (entry === undefined) throw new Error(`unexpected request ${key}`);
    return typeof entry === 'function' ? entry(req) : entry.clone();
  };
};
const calls = (url) => wire.filter((r) => r.url === url);
const gate = () => {
  let open;
  const opened = new Promise((resolve) => {
    open = resolve;
  });
  return { opened, open };
};

const U = {
  start: '/api/auth/email/start',
  verify: '/api/auth/email/verify',
  login: '/api/auth/login',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
  chat: '/api/ai/chat',
  transcribe: '/api/ai/transcribe',
  widgetIntent: '/api/widgets/intent',
  widgetResolve: '/api/widgets/resolve',
};

const client = await import('../src/net/client.ts');
const project = await import('../src/net/project.ts');
const sessionModule = await import('../src/net/session.ts');
const endpoint = await import('../src/net/endpoint.ts');
const { createNet } = sessionModule;

// ── backend bodies, transcribed ────────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-09-17T10:00:00.000Z');
const REFRESH_EXPIRES = '2026-10-17T10:00:00.000Z';
const TENANT_ID = 'c1a4f0de-0b8e-4a55-9d0e-7a1d2f3e4b5c';
const USER_ID = '9e8d7c6b-5a49-4f3e-8d2c-1b0a99887766';
const SESSION_ID = '4b3a2c1d-0e9f-48a7-b6c5-d4e3f2a1b0c9';
const refreshTokenOf = (n) => `maya_rt_00000000-0000-4000-8000-00000000000${n}.${'s'.repeat(42)}${n}`;
const accessTokenOf = (n) => `eyJhbGciOiJIUzI1NiJ9.access-${n}.sig`;
// auth-session.service.ts serializeSession (:507-536)
const SESSION = {
  id: SESSION_ID,
  device_name: 'Chrome on macOS',
  status: 'active',
  is_current: true,
  created_at: '2026-09-17T09:59:59.000Z',
  last_used_at: '2026-09-17T09:59:59.000Z',
  expires_at: REFRESH_EXPIRES,
  revoked_at: null,
  revoke_reason: null,
};
// auth-session.service.ts buildSessionTokens (:348-376)
const TOKENS = (n, over = {}) => ({
  access_token: accessTokenOf(n),
  refresh_token: refreshTokenOf(n),
  token_type: 'Bearer',
  expires_in: 900,
  refresh_expires_at: REFRESH_EXPIRES,
  session: SESSION,
  ...over,
});
// email-auth.service.ts serializeLoginTenant (:526-532)
const LOGIN_TENANT = { id: TENANT_ID, name: 'Мужская Эстетика', slug: 'male-esthetic' };
// users.service.ts serializeUser (:1059-1097)
const USER = (over = {}) => ({
  id: USER_ID,
  tenant_id: TENANT_ID,
  branch_id: null,
  email: 'owner@example.ru',
  phone: '+79990001122',
  name: 'Стас',
  role: 'owner',
  status: 'active',
  profile_completed: true,
  missing_profile_fields: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  tenant: { id: TENANT_ID, name: 'Мужская Эстетика', slug: 'male-esthetic', status: 'active' },
  branch: null,
  ...over,
});
// email-auth.service.ts start (:339-349 across tenants; debug delivery)
const EMAIL_START_OK = {
  ok: true,
  email: 'owner@example.ru',
  delivery: 'debug',
  expires_at: '2026-09-17T10:05:00.000Z',
  retry_after_seconds: 60,
  next_step: 'verify_email_code',
  debug_code: '482913',
};
// email-auth.service.ts verifyAcrossTenants, one business (:504-508): TOP-LEVEL tenant
const EMAIL_VERIFY_OK = { ...TOKENS(1), tenant: LOGIN_TENANT, user: USER() };
// email-auth.service.ts verifyAcrossTenants, several businesses (:471-481)
const SELECT_BUSINESS = {
  ok: true,
  next_step: 'select_business',
  businesses: [
    { name: 'Мужская Эстетика', role: 'owner', slug: 'male-esthetic' },
    { name: 'Второй салон', role: 'staff', slug: 'second-salon' },
  ],
};
// auth.service.ts login (:70-77): user with the tenant NESTED at user.tenant, no top-level tenant
const LOGIN_OK = { ...TOKENS(2), user: USER() };
// auth-session.service.ts refresh (:222-228): tokens + session ONLY
const REFRESH_OK = (n) => TOKENS(n);

// auth-rate-limit.exception.ts + auth-rate-limit.filter.ts:11 (Retry-After header)
const RATE_LIMITED = (seconds) => ({
  message: 'Too many authentication attempts. Try again later.',
  error: { code: 'auth_rate_limited', message: 'Too many authentication attempts. Try again later.', retry_after_seconds: seconds },
});
const emailError = (code, message, field, extra = {}) => ({ message, error: { code, message, ...(field ? { field } : {}), ...extra } }); // email-auth.service.ts:647-670
const TOO_MANY_CODE = emailError('email_too_many_attempts', 'Too many invalid email code attempts. Request a new code.', 'code'); // :639-645
const EMAIL_LOGIN_UNAVAILABLE = emailError('email_login_unavailable', 'Email code login is not enabled.'); // :534-543
const DELIVERY_UNAVAILABLE = emailError('email_delivery_unavailable', 'Email delivery is not configured.'); // :326-330
const DELIVERY_FAILED = emailError('email_delivery_failed', 'Email delivery failed.'); // :331-335
const CODE_INVALID = emailError('email_code_invalid', 'Invalid email verification code.', 'code', { remaining_attempts: 4 }); // :444-451
const CODE_EXPIRED = emailError('email_code_expired', 'The email verification code has expired.', 'code'); // :453-461
const CODE_MISSING = emailError('email_code_missing', 'Request a new email verification code and try again.', 'code'); // :462-468, :494-501
const EMAIL_LOGIN_INVALID = emailError('email_login_invalid', 'This email is not linked to a user in this business.', 'email'); // :257-264
// Nest's HttpException body for a string message
const nest = (statusCode, message, error) => ({ message, error, statusCode });
const INVALID_CREDENTIALS = nest(401, 'Invalid email or password', 'Unauthorized'); // auth.service.ts:425,439,450,459
const TENANT_NOT_FOUND = nest(404, 'Tenant not found', 'Not Found'); // tenants.service.ts:285-287
const USER_NOT_ACTIVE = nest(403, 'User is not active', 'Forbidden'); // auth.service.ts:66-68; email-auth.service.ts:266-268
const TENANT_NOT_ACCEPTING = nest(403, 'Tenant is not accepting client access', 'Forbidden'); // email-auth.service.ts:571-573
const CRM_ACCESS_DISABLED = { message: 'CRM staff access is no longer active.', error: { code: 'crm_staff_access_disabled', message: 'Доступ к MAYA отключён: сотрудник больше не активен в CRM.' } }; // crm.service.ts:4418-4427
// bootstrap/configure-http-app.ts exceptionFactory (validation pipe)
const VALIDATION = (field, message) => ({ message, error: { code: 'validation', message, field, details: [{ field, message }] } });
// maya-platform-api.php:150-155
const RELAY_502 = { message: 'MAYA server is temporarily unavailable' };
// auth-session.service.ts unauthorized (:569-574)
const SESSION_ERROR = (code, message) => ({ message, error: { code, message } });
// guards/jwt-auth.guard.ts handleRequest → new UnauthorizedException()
const JWT_401 = { message: 'Unauthorized', statusCode: 401 };

// /ai/chat
const CHAT_OK = (requestId, over = {}) => ({
  request_id: requestId,
  reply: 'Готово: ближайшее окно завтра в 09:00.',
  source: 'safe',
  redacted_input: false,
  tools_used: [],
  grounding: { status: 'not_required', domain: null, required_tools: [], evidence_tools: [] },
  brain: { persona: 'admin', intent: 'general' },
  ...over,
});
// ai-core.service.ts:1167-1182 (approval_required) + ai-tool-runtime.service.ts serializeApproval (:1308-1326)
const APPROVAL_ID = 'apr-7f3a9c1e-2b4d-4e6f-8a0b-1c2d3e4f5a6b';
const CHAT_APPROVAL = (requestId) =>
  CHAT_OK(requestId, {
    reply: 'Действие подготовлено и ждёт вашего подтверждения.',
    source: 'anthropic',
    action: {
      status: 'approval_required',
      approval: {
        id: APPROVAL_ID,
        tool_name: 'appointments.own.create',
        surface: 'web',
        risk_tier: 'medium',
        approval_policy: 'actor',
        status: 'pending',
        summary: 'Запись на стрижку 20.09 в 09:00',
        payload_hash: 'payload-hash-3e1d',
        payload_preview: { service: 'Стрижка', starts_at: '2026-09-20T09:00:00.000Z' },
        expires_at: '2026-09-17T10:15:00.000Z',
        decided_at: null,
        executed_at: null,
        error_code: null,
        created_at: '2026-09-17T10:00:00.000Z',
        updated_at: '2026-09-17T10:00:00.000Z',
      },
    },
    tools_used: [{ name: 'appointments.own.create', status: 'approval_required', execution_id: null }],
  });
// guards/subscription-access.guard.ts:47-60
const SUBSCRIPTION_REQUIRED = {
  message: 'The MAYA OS trial has ended. A subscription is required.',
  error: {
    code: 'subscription_required',
    trial_ended_at: '2026-09-10T00:00:00.000Z',
    past_due_at: null,
    grace_ended_at: null,
    plans_path: '/api/billing/plans',
    checkout_path: `/api/admin/tenants/${TENANT_ID}/billing/checkout`,
  },
};
const FEATURE_LOCKED = { message: 'Feature ai_core is not enabled for this tenant', error: { code: 'feature_locked', feature: 'ai_core' } }; // entitlements.service.ts:199-205
const TENANT_REQUIRED = { message: 'Tenant membership is required.', error: { code: 'tenant_required' } }; // ai-core.service.ts:4722-4729
const MODEL_FAILURE = (code) => ({ message: 'MAYA could not safely complete this turn.', error: { code } }); // ai-core.service.ts:4732-4737
const MODEL_UNAVAILABLE = { message: 'MAYA AI is temporarily unavailable.', error: { code: 'ai_model_unavailable', detail: 'Error' } }; // ai-core-model.service.ts:609-615
const APPROVAL_CONFLICT = { message: 'AI approval cannot be completed.', error: { code: 'ai_approval_idempotency_conflict' } }; // ai-tool-runtime.service.ts:1391-1396
const EXECUTION_CONFLICT = { message: 'AI tool execution cannot be completed.', error: { code: 'ai_tool_idempotency_conflict' } }; // :1398-1403
const INPUT_TOO_LARGE = { message: 'AI chat input is too large.', error: { code: 'ai_chat_input_too_large' } }; // ai-core.service.ts:4483-4486
// /ai/transcribe — ai-speech.service.ts
const NOT_RECOGNIZED = { message: 'Не удалось расслышать голос. Повторите ещё раз.', error: { code: 'speech_not_recognized' } }; // :111-114
const INVALID_AUDIO = { message: 'Голосовая запись пуста.', error: { code: 'invalid_speech_audio' } }; // :204-209
const PROVIDER_UNAVAILABLE = { message: 'Распознавание голоса временно недоступно.', error: { code: 'speech_provider_unavailable' } }; // :211-216

const REQUEST_ID = '6f1c2d3e-4b5a-4c6d-9e8f-0a1b2c3d4e5f';
const chatRequest = (requestId = REQUEST_ID) => ({ surface: 'web', requestId, messages: [{ role: 'user', content: 'Когда ближайшее окно?' }] });
const AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

const SIGN_IN_STATES = new Set([
  'rate_limited',
  'code_attempts_exhausted',
  'email_login_unavailable',
  'code_invalid',
  'code_expired',
  'email_not_linked',
  'credentials_invalid',
  'account_unavailable',
  'field_invalid',
  'no_connection',
  'unexpected_response',
]);

const keysDeep = (value, out = new Set()) => {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  return out;
};

/** A net instance signed in by password with a controllable clock. */
const signedIn = async (options = {}) => {
  let clock = options.clock ?? T0;
  const net = createNet({ now: () => clock, ...(options.timeouts ? { timeouts: options.timeouts } : {}) });
  serve({ [U.login]: json(201, options.login ?? LOGIN_OK) });
  const step = await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
  assert.equal(step.step, 'signed_in');
  wire.length = 0;
  return { net, advance: (ms) => (clock += ms), now: () => clock };
};

// ── 1. the module surface ──────────────────────────────────────────────────────────────────────

test('PATHS holds exactly the nine approved literals; one fetch call site; API_BASE is the one endpoint line', async () => {
  const src = read('src/net/client.ts');
  const block = src.match(/const PATHS = \{([\s\S]*?)\} as const;/);
  assert.ok(block, 'const PATHS = {…} as const');
  const values = [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(values, ['/ai/chat', '/ai/transcribe', '/auth/email/start', '/auth/email/verify', '/auth/login', '/auth/logout', '/auth/refresh', '/widgets/intent', '/widgets/resolve']);
  const { P1_PATHS } = await import('../build.mjs');
  assert.deepEqual(values, [...P1_PATHS].sort());

  const netSources = ['client.ts', 'session.ts', 'project.ts', 'endpoint.ts'].map((f) => [f, read(`src/net/${f}`)]);
  const fetchCalls = netSources.flatMap(([f, s]) => [...s.matchAll(/\bfetch\s*\(/g)].map(() => f));
  assert.deepEqual(fetchCalls, ['client.ts'], 'exactly one fetch( call, in client.ts');
  assert.equal((src.match(/\/widgets\/intent/g) ?? []).length, 1, 'one approved widget intent literal');
  assert.equal((src.match(/\/widgets\/resolve/g) ?? []).length, 1, 'one approved widget resolve literal');
  assert.equal(read('src/net/endpoint.ts').split('\n').filter((l) => !l.startsWith('//') && l.trim() !== '').join('\n'), "export const API_BASE = '/api';");
  assert.equal(endpoint.API_BASE, '/api');
});

test('typed methods only: the two widget methods are explicit; no generic request or token accessor', () => {
  const surface = [...Object.keys(client), ...Object.keys(sessionModule), ...Object.keys(project)];
  const approvedWidgetExports = new Set(['isIngestibleEnvelope', 'projectWidgetIntent', 'projectWidgetResolve']);
  for (const name of surface)
    assert.ok(
      !/fetch|token|^request$|^send$|^post$|submit/i.test(name) &&
        (!/resolve|intent|widget/i.test(name) || approvedWidgetExports.has(name)),
      `exported "${name}"`,
    );
  const net = createNet();
  assert.deepEqual(Object.keys(net).sort(), ['session', 'transport']);
  assert.deepEqual(Object.keys(net.session).sort(), ['signInPassword', 'signOut', 'startEmail', 'subscribe', 'verifyEmail', 'view']);
  assert.deepEqual(Object.keys(net.transport).sort(), ['chat', 'resolveWidgets', 'transcribe', 'widgetIntent']);
});

test('widget transport sends only typed bodies and retains only authorized response members', async () => {
  const { net } = await signedIn();
  const submission = {
    contract: 'maya.widget.intent.submission/1',
    widget_id: 'widget-00000001',
    intent_token: 'opaque-intent-token',
    inputs: { service_ref: 'opaque-service-option' },
    client_nonce: 'client-00000001',
    profile_id: 'profile-owner-web',
  };
  serve({
    [U.widgetIntent]: json(200, {
      contract: 'maya.widget.intent/1',
      outcome: 'terminate',
      code: null,
      next_envelope: null,
      receipt_outcome: 'ACCEPTED',
      ignored_authority: 'must-not-survive',
    }),
  });
  const intent = await net.transport.widgetIntent(submission, new AbortController().signal);
  assert.deepEqual(intent, {
    ok: true,
    value: { outcome: 'terminate', code: null, next_envelope: null, receipt_outcome: 'ACCEPTED' },
  });
  assert.deepEqual(calls(U.widgetIntent)[0].body, submission);

  serve({
    [U.widgetResolve]: json(200, {
      contract: 'maya.widget.resolve/1',
      widgets: [],
      tenant_bound: true,
      ignored_platform_rows: ['must-not-survive'],
    }),
  });
  const resolved = await net.transport.resolveWidgets(
    { thread_page: { limit: 20, before: 'opaque-cursor' } },
    new AbortController().signal,
  );
  assert.deepEqual(resolved, { ok: true, value: { widgets: [], tenant_bound: true } });
  assert.deepEqual(calls(U.widgetResolve)[0].body, {
    thread_page: { limit: 20, before: 'opaque-cursor' },
  });
});

// ── 2. projections fed the verified full responses (D12c) ──────────────────────────────────────

const DROPPED_KEYS = ['role', 'session', 'token_type', 'id', 'status', 'tenant_id', 'tenant', 'user', 'debug_code', 'approval', 'action', 'tools_used', 'grounding', 'brain', 'email', 'phone', 'branch', 'delivery', 'expires_at', 'ok'];

test('email start keeps {next_step} only — debug_code never survives', async () => {
  serve({ [U.start]: json(201, EMAIL_START_OK) });
  const r = await client.emailStart({ email: 'owner@example.ru' });
  assert.deepEqual(r, { ok: true, value: { next_step: 'verify_email_code' } });
  assert.deepEqual(Object.keys(calls(U.start)[0].body), ['email']);
  const net = createNet();
  serve({ [U.start]: json(201, EMAIL_START_OK) });
  const step = await net.session.startEmail('  owner@example.ru ');
  assert.deepEqual(step, { step: 'code_sent' });
  assert.deepEqual(calls(U.start)[0].body, { email: 'owner@example.ru' });
  assert.ok(!JSON.stringify(step).includes('482913'));
});

test('email verify (one business): tokens + TOP-LEVEL tenant.name + user.name; every other key dropped', async () => {
  serve({ [U.verify]: json(201, EMAIL_VERIFY_OK) });
  const r = await client.emailVerify({ email: 'owner@example.ru', code: '482913' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    next_step: 'signed_in',
    grant: { accessToken: accessTokenOf(1), expiresInSec: 900, refreshToken: refreshTokenOf(1), refreshExpiresAt: REFRESH_EXPIRES },
    display: { userName: 'Стас', tenantName: 'Мужская Эстетика' },
  });
  const keys = keysDeep(r.value);
  for (const k of DROPPED_KEYS) assert.ok(!keys.has(k), `projection has no "${k}" key`);
  for (const v of [TENANT_ID, USER_ID, SESSION_ID, 'male-esthetic', 'owner', '+79990001122']) assert.ok(!JSON.stringify(r.value).includes(v), `projection holds no "${v}"`);
  // top-level tenant is the source: a body whose user.tenant differs must still show the top-level name
  serve({ [U.verify]: json(201, { ...EMAIL_VERIFY_OK, user: USER({ tenant: null }) }) });
  const r2 = await client.emailVerify({ email: 'owner@example.ru', code: '482913' });
  assert.equal(r2.value.display.tenantName, 'Мужская Эстетика');
  // the DOM-facing outcome carries the display only, never a token
  const net = createNet();
  serve({ [U.verify]: json(201, EMAIL_VERIFY_OK) });
  const step = await net.session.verifyEmail('owner@example.ru', '482913', null);
  assert.deepEqual(step, { step: 'signed_in', display: { userName: 'Стас', tenantName: 'Мужская Эстетика' } });
  assert.deepEqual(calls(U.verify)[0].body, { email: 'owner@example.ru', code: '482913' });
  assert.deepEqual(net.session.view(), { signedIn: true, display: { userName: 'Стас', tenantName: 'Мужская Эстетика' } });
  for (const t of [accessTokenOf(1), refreshTokenOf(1)]) {
    assert.ok(!JSON.stringify(step).includes(t));
    assert.ok(!JSON.stringify(net.session.view()).includes(t));
  }
});

test('email verify (select_business): businesses[].role dropped, slug echoed verbatim at re-verify', async () => {
  const net = createNet();
  serve({ [U.verify]: [json(201, SELECT_BUSINESS), json(201, EMAIL_VERIFY_OK)] });
  const step = await net.session.verifyEmail('owner@example.ru', '482913', null);
  assert.deepEqual(step, {
    step: 'select_business',
    businesses: [
      { name: 'Мужская Эстетика', slug: 'male-esthetic' },
      { name: 'Второй салон', slug: 'second-salon' },
    ],
  });
  assert.ok(!keysDeep(step).has('role'));
  assert.equal(net.session.view().signedIn, false);
  const done = await net.session.verifyEmail('owner@example.ru', '482913', 'second-salon');
  assert.equal(done.step, 'signed_in');
  assert.deepEqual(calls(U.verify)[1].body, { email: 'owner@example.ru', code: '482913', tenantSlug: 'second-salon' });
});

test('password login: body keys exactly {tenantSlug, email, password}; tenant NESTED at user.tenant; null name → ""', async () => {
  serve({ [U.login]: json(201, LOGIN_OK) });
  const r = await client.passwordLogin({ tenantSlug: 'male-esthetic', email: 'owner@example.ru', password: 'correct-horse-9' });
  assert.deepEqual(r.value.display, { userName: 'Стас', tenantName: 'Мужская Эстетика' });
  assert.deepEqual(Object.keys(r.value).sort(), ['display', 'grant']);
  for (const k of DROPPED_KEYS) assert.ok(!keysDeep(r.value).has(k), `projection has no "${k}" key`);
  assert.deepEqual(Object.keys(calls(U.login)[0].body).sort(), ['email', 'password', 'tenantSlug']);

  serve({ [U.login]: json(201, { ...LOGIN_OK, user: USER({ tenant: null, name: null }) }) });
  const r2 = await client.passwordLogin({ tenantSlug: 'male-esthetic', email: 'owner@example.ru', password: 'correct-horse-9' });
  assert.deepEqual(r2.value.display, { userName: '', tenantName: null });

  // a top-level tenant is NOT what login returns; were one present, it is not read
  serve({ [U.login]: json(201, { ...LOGIN_OK, tenant: { id: 'x', name: 'Чужой', slug: 'x' }, user: USER({ tenant: null }) }) });
  const r3 = await client.passwordLogin({ tenantSlug: 'male-esthetic', email: 'owner@example.ru', password: 'correct-horse-9' });
  assert.equal(r3.value.display.tenantName, null);

  const net = createNet();
  serve({ [U.login]: json(201, LOGIN_OK) });
  const step = await net.session.signInPassword('  male-esthetic ', ' owner@example.ru', 'correct-horse-9');
  assert.deepEqual(calls(U.login)[0].body, { tenantSlug: 'male-esthetic', email: 'owner@example.ru', password: 'correct-horse-9' });
  assert.deepEqual(step, { step: 'signed_in', display: { userName: 'Стас', tenantName: 'Мужская Эстетика' } });
});

test('signInPassword refuses an empty business address before any request (V2-6)', async () => {
  const net = createNet();
  serve({});
  for (const slug of ['', '   ', '\t\n']) {
    const step = await net.session.signInPassword(slug, 'owner@example.ru', 'correct-horse-9');
    assert.deepEqual(step, { step: 'failed', failure: { state: 'field_invalid', field: 'business' } });
  }
  const direct = await client.passwordLogin({ tenantSlug: ' ', email: 'owner@example.ru', password: 'correct-horse-9' });
  assert.deepEqual(direct, { ok: false, failure: { state: 'field_invalid', field: 'business' } });
  assert.equal(wire.length, 0, '0 requests');
  assert.equal(net.session.view().signedIn, false);
});

test('refresh: tokens + session only → grant; display stays what sign-in set', async () => {
  const r = project.projectRefresh(REFRESH_OK(3));
  assert.deepEqual(r, { grant: { accessToken: accessTokenOf(3), expiresInSec: 900, refreshToken: refreshTokenOf(3), refreshExpiresAt: REFRESH_EXPIRES } });
  const { net, advance } = await signedIn();
  const display = net.session.view();
  advance(900_000 - 10_000);
  serve({ [U.refresh]: json(201, REFRESH_OK(3)), [U.chat]: (req) => json(201, CHAT_OK(req.body.requestId)) });
  const out = await net.transport.chat(chatRequest(), new AbortController().signal);
  assert.equal(out.ok, true);
  assert.deepEqual(calls(U.refresh)[0].body, { refreshToken: refreshTokenOf(2) });
  assert.equal(calls(U.chat)[0].headers.Authorization, `Bearer ${accessTokenOf(3)}`);
  assert.equal(net.session.view(), display, 'the same snapshot: display unchanged, no notification');
});

test('malformed success bodies are unexpected_response, never a partial sign-in', async () => {
  const net = createNet();
  for (const body of [{ ...LOGIN_OK, access_token: '' }, { ...LOGIN_OK, expires_in: '900' }, { ...LOGIN_OK, user: undefined }, 'not json at all']) {
    serve({ [U.login]: body === 'not json at all' ? new Response('<html>', { status: 200 }) : json(201, body) });
    const step = await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
    assert.equal(step.step, 'failed');
    assert.equal(step.failure.state, 'unexpected_response');
  }
  assert.equal(net.session.view().signedIn, false);
});

// ── 3. the §1.4 sign-in failure table, row by row (V2-16) ───────────────────────────────────────

const SIGN_IN_ROWS = [
  // row 1 — any → 429 auth_rate_limited + Retry-After
  { row: 1, via: 'start', res: () => json(429, RATE_LIMITED(17), { 'Retry-After': '17' }), want: { state: 'rate_limited', retryAfterSec: 17 } },
  { row: 1, via: 'verify', res: () => json(429, RATE_LIMITED(42), { 'Retry-After': '42' }), want: { state: 'rate_limited', retryAfterSec: 42 } },
  { row: 1, via: 'login', res: () => json(429, RATE_LIMITED(5), { 'Retry-After': '5' }), want: { state: 'rate_limited', retryAfterSec: 5 } },
  // row 2 — verify → 429 too many code attempts
  { row: 2, via: 'verify', res: () => json(429, TOO_MANY_CODE), want: { state: 'code_attempts_exhausted' } },
  // row 3 — start/verify → 503 email_login_unavailable / email_delivery_unavailable / email_delivery_failed
  { row: 3, via: 'start', res: () => json(503, EMAIL_LOGIN_UNAVAILABLE), want: { state: 'email_login_unavailable' } },
  { row: 3, via: 'verify', res: () => json(503, EMAIL_LOGIN_UNAVAILABLE), want: { state: 'email_login_unavailable' } },
  { row: 3, via: 'start', res: () => json(503, DELIVERY_UNAVAILABLE), want: { state: 'email_login_unavailable' } },
  { row: 3, via: 'start', res: () => json(503, DELIVERY_FAILED), want: { state: 'email_login_unavailable' } },
  // row 4 — verify → 400 email_code_invalid
  { row: 4, via: 'verify', res: () => json(400, CODE_INVALID), want: { state: 'code_invalid' } },
  // row 5 — verify → 400 email_code_expired / email_code_missing
  { row: 5, via: 'verify', res: () => json(400, CODE_EXPIRED), want: { state: 'code_expired' } },
  { row: 5, via: 'verify', res: () => json(400, CODE_MISSING), want: { state: 'code_expired' } },
  // row 6 — verify → 401 email_login_invalid
  { row: 6, via: 'verify', res: () => json(401, EMAIL_LOGIN_INVALID), want: { state: 'email_not_linked' } },
  // row 7 — login → 401 «Invalid email or password»; a mistyped business address (404) says the same
  { row: 7, via: 'login', res: () => json(401, INVALID_CREDENTIALS), want: { state: 'credentials_invalid' } },
  { row: 7, via: 'login', res: () => json(404, TENANT_NOT_FOUND), want: { state: 'credentials_invalid' } },
  // row 8 — any → 403 «User is not active» / «Tenant is not accepting client access». On the PASSWORD path
  // the backend answers «Tenant is not accepting client access» for a known email BEFORE it checks the
  // password (auth.service.ts loginTenantUser), so a distinct sentence would confirm the account exists:
  // /auth/login 403 is the same «never says which» state as 401 and 404 (integration finding).
  { row: 8, via: 'login', res: () => json(403, USER_NOT_ACTIVE), want: { state: 'credentials_invalid' } },
  { row: 8, via: 'login', res: () => json(403, TENANT_NOT_ACCEPTING), want: { state: 'credentials_invalid' } },
  { row: 8, via: 'verify', res: () => json(403, USER_NOT_ACTIVE), want: { state: 'account_unavailable' } },
  { row: 8, via: 'verify', res: () => json(403, TENANT_NOT_ACCEPTING), want: { state: 'account_unavailable' } },
  { row: 8, via: 'login', res: () => json(401, CRM_ACCESS_DISABLED), want: { state: 'account_unavailable' } },
  // row 9 — any → 400 validation (the same field state the client-side check shows)
  { row: 9, via: 'start', res: () => json(400, VALIDATION('email', 'email must be an email')), want: { state: 'field_invalid', field: 'email' } },
  { row: 9, via: 'verify', res: () => json(400, VALIDATION('code', 'code must match /^\\d+$/ regular expression')), want: { state: 'field_invalid', field: 'code' } },
  { row: 9, via: 'login', res: () => json(400, VALIDATION('password', 'password must be longer than or equal to 8 characters')), want: { state: 'field_invalid', field: 'password' } },
  { row: 9, via: 'login', res: () => json(400, VALIDATION('tenantSlug', 'tenantSlug must be a string')), want: { state: 'field_invalid', field: 'business' } },
  { row: 9, via: 'login', res: () => json(400, VALIDATION('__proto__', 'x')), want: { state: 'unexpected_response', status: 400 } },
  // row 10 — any → 502, network error, abort/timeout
  { row: 10, via: 'start', res: () => json(502, RELAY_502), want: { state: 'no_connection' } },
  { row: 10, via: 'verify', res: networkDown, want: { state: 'no_connection' } },
  { row: 10, via: 'login', res: networkDown, want: { state: 'no_connection' } },
  // unmapped responses are still a named state
  { row: 0, via: 'login', res: () => json(500, nest(500, 'Internal server error')), want: { state: 'unexpected_response', status: 500 } },
];

test('the password path never tells an existing account from a wrong password: /auth/login 401, 403 (either body) and 404 are one state', () => {
  const exchange = (status, body) => ({ kind: 'response', status, retryAfterSec: null, body });
  const states = [[401, INVALID_CREDENTIALS], [403, USER_NOT_ACTIVE], [403, TENANT_NOT_ACCEPTING], [404, TENANT_NOT_FOUND]].map(([status, body]) =>
    JSON.stringify(client.signInFailure('login', exchange(status, body))),
  );
  assert.equal(new Set(states).size, 1, states.join(' | '));
  assert.equal(states[0], JSON.stringify({ state: 'credentials_invalid' }));
  // after a proven code, the email path may name the account state
  assert.deepEqual(client.signInFailure('emailVerify', exchange(403, TENANT_NOT_ACCEPTING)), { state: 'account_unavailable' });
});

const attempt = async (net, via) => {
  if (via === 'start') return net.session.startEmail('owner@example.ru');
  if (via === 'verify') return net.session.verifyEmail('owner@example.ru', '482913', null);
  return net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
};

test('§1.4 sign-in failure table: every row maps to its named state; silent login outcomes = 0', async () => {
  let attempts = 0;
  let named = 0;
  let signedInCount = 0;
  const rowsSeen = new Set();
  for (const r of SIGN_IN_ROWS) {
    const net = createNet();
    serve({ [U.start]: r.res, [U.verify]: r.res, [U.login]: r.res });
    const step = await attempt(net, r.via);
    attempts += 1;
    assert.equal(step.step, 'failed', `row ${r.row} via ${r.via}`);
    assert.deepEqual(step.failure, r.want, `row ${r.row} via ${r.via}`);
    assert.ok(SIGN_IN_STATES.has(step.failure.state));
    assert.equal(net.session.view().signedIn, false);
    assert.equal(wire.length, 1, 'one request per attempt');
    if (step.step === 'failed' && SIGN_IN_STATES.has(step.failure.state)) named += 1;
    rowsSeen.add(r.row);
  }
  // row 3's promise: the password path stays available after email login is unavailable
  const net = createNet();
  serve({ [U.start]: json(503, EMAIL_LOGIN_UNAVAILABLE), [U.login]: json(201, LOGIN_OK) });
  assert.equal((await net.session.startEmail('owner@example.ru')).failure.state, 'email_login_unavailable');
  attempts += 1;
  named += 1;
  const ok = await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
  attempts += 1;
  if (ok.step === 'signed_in') signedInCount += 1;
  assert.deepEqual([...rowsSeen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(attempts - (signedInCount + named), 0, 'silent login outcomes');
});

test('row 9 client-side: the same field state before sending, 0 requests (IsEmail shape, 4..8 digits, MinLength 8)', async () => {
  const net = createNet();
  serve({});
  assert.deepEqual(await net.session.startEmail(''), { step: 'failed', failure: { state: 'field_invalid', field: 'email' } });
  assert.deepEqual(await net.session.startEmail('not an email'), { step: 'failed', failure: { state: 'field_invalid', field: 'email' } });
  assert.deepEqual(await net.session.verifyEmail('owner@example.ru', '12', null), { step: 'failed', failure: { state: 'field_invalid', field: 'code' } });
  assert.deepEqual(await net.session.verifyEmail('owner@example.ru', '12ab56', null), { step: 'failed', failure: { state: 'field_invalid', field: 'code' } });
  assert.deepEqual(await net.session.verifyEmail('owner@example.ru', '123456', '  '), { step: 'failed', failure: { state: 'field_invalid', field: 'business' } });
  assert.deepEqual(await net.session.signInPassword('male-esthetic', 'owner', 'correct-horse-9'), { step: 'failed', failure: { state: 'field_invalid', field: 'email' } });
  assert.deepEqual(await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'short'), { step: 'failed', failure: { state: 'field_invalid', field: 'password' } });
  assert.equal(wire.length, 0);
});

test('row 10: a sign-in request that times out is no_connection', async () => {
  serve({ [U.login]: hang });
  const r = await client.passwordLogin({ tenantSlug: 'male-esthetic', email: 'owner@example.ru', password: 'correct-horse-9' }, 25);
  assert.deepEqual(r, { ok: false, failure: { state: 'no_connection' } });
});

test('row 11: /ai/chat → 403 tenant_required is its own named failure', async () => {
  const { net } = await signedIn();
  serve({ [U.chat]: json(403, TENANT_REQUIRED) });
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'tenant_required' } });
  assert.equal(net.session.view().signedIn, true, 'the session stays; the composer is disabled by the shell');
});

// ── 4. the §1.4 turn taxonomy (D9, D12d) ───────────────────────────────────────────────────────

test('/ai/chat request: exactly {surface, requestId, messages}, surface "web", Bearer, omit, no-store; no audience or tenant on the wire', async () => {
  const { net } = await signedIn();
  serve({ [U.chat]: (req) => json(201, CHAT_OK(req.body.requestId)) });
  const hostile = {
    ...chatRequest(),
    surface: 'voice',
    audience: 'owner',
    tenantSlug: 'male-esthetic',
    tenant_id: TENANT_ID,
    messages: [{ role: 'user', content: 'Когда ближайшее окно?', audience: 'owner', tenant: TENANT_ID }],
  };
  const out = await net.transport.chat(hostile, new AbortController().signal);
  assert.deepEqual(out, { ok: true, value: { request_id: REQUEST_ID, reply: CHAT_OK(REQUEST_ID).reply, action_status: null, resolution: null } });
  const [req] = calls(U.chat);
  assert.deepEqual(req.body, { surface: 'web', requestId: REQUEST_ID, messages: [{ role: 'user', content: 'Когда ближайшее окно?' }] });
  assert.deepEqual(Object.keys(req.headers).sort(), ['Authorization', 'Content-Type']);
  assert.equal(req.headers.Authorization, `Bearer ${accessTokenOf(2)}`);
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.equal(req.init.method, 'POST');
  assert.equal(req.init.credentials, 'omit');
  assert.equal(req.init.cache, 'no-store');
  assert.equal(req.init.redirect, 'error');
  for (const v of ['audience', 'owner', 'male-esthetic', TENANT_ID, 'Мужская Эстетика']) assert.ok(!req.raw.includes(v), `chat wire holds no "${v}"`);
});

test('approval_required: action_status copies action.status only — never action.approval (V2-5)', async () => {
  const { net } = await signedIn();
  serve({ [U.chat]: (req) => json(201, CHAT_APPROVAL(req.body.requestId)) });
  const out = await net.transport.chat(chatRequest(), new AbortController().signal);
  assert.deepEqual(out, { ok: true, value: { request_id: REQUEST_ID, reply: 'Действие подготовлено и ждёт вашего подтверждения.', action_status: 'approval_required', resolution: null } });
  assert.ok(!keysDeep(out).has('approval'));
  for (const v of [APPROVAL_ID, 'appointments.own.create', 'payload-hash-3e1d']) assert.ok(!JSON.stringify(out).includes(v));
  assert.deepEqual(Object.keys(out.value).sort(), ['action_status', 'reply', 'request_id', 'resolution']);
});

test('B4: /ai/chat retains one exact SH-19 authorized envelope and rejects an incomplete substitute', async () => {
  const { net } = await signedIn();
  const envelope = JSON.parse(read('dev/fixtures/envelopes/h7/invariant/kind-schedule.json'));
  const resolution = {
    matched: true,
    receipt: {
      widget_id: envelope.widget_id,
      envelope_seal: envelope.integrity.envelope_seal,
      envelope,
    },
    dismiss_widget_id: null,
  };
  serve({ [U.chat]: (req) => json(201, { ...CHAT_OK(req.body.requestId), resolution }) });
  const accepted = await net.transport.chat(chatRequest(), new AbortController().signal);
  assert.deepEqual(accepted.ok && accepted.value.resolution, resolution);

  serve({
    [U.chat]: (req) =>
      json(201, {
        ...CHAT_OK(req.body.requestId),
        resolution: {
          matched: true,
          receipt: {
            widget_id: 'w-incomplete',
            envelope_seal: 'not-authorized',
            envelope: { contract: 'maya.widget.envelope/1', widget_id: 'w-incomplete' },
          },
          dismiss_widget_id: null,
        },
      }),
  });
  assert.deepEqual(
    await net.transport.chat(chatRequest(), new AbortController().signal),
    { ok: false, failure: { reason: 'unexpected_response', status: 201 } },
  );
});

const CHAT_ROWS = [
  { name: '402 subscription_required', res: () => json(402, SUBSCRIPTION_REQUIRED), want: { reason: 'subscription_required' } },
  { name: '403 feature_locked', res: () => json(403, FEATURE_LOCKED), want: { reason: 'feature_locked' } },
  { name: '403 tenant_required', res: () => json(403, TENANT_REQUIRED), want: { reason: 'tenant_required' } },
  { name: '403 other', res: () => json(403, nest(403, 'Insufficient role permissions', 'Forbidden')), want: { reason: 'forbidden' } },
  { name: '429 + Retry-After', res: () => json(429, RATE_LIMITED(9), { 'Retry-After': '9' }), want: { reason: 'rate_limited', retryAfterSec: 9 } },
  { name: '429 body seconds only', res: () => json(429, RATE_LIMITED(12)), want: { reason: 'rate_limited', retryAfterSec: 12 } },
  { name: '429 no hint', res: () => json(429, { message: 'Too Many Requests' }), want: { reason: 'rate_limited', retryAfterSec: client.DEFAULT_RETRY_AFTER_SEC } },
  { name: '400 validation', res: () => json(400, VALIDATION('messages.0.content', 'content must be shorter than or equal to 2000 characters')), want: { reason: 'outdated_client' } },
  { name: '400 input too large', res: () => json(400, INPUT_TOO_LARGE), want: { reason: 'outdated_client' } },
  { name: '503 ai_model_tool_step_limit', res: () => json(503, MODEL_FAILURE('ai_model_tool_step_limit')), want: { reason: 'model_failure' } },
  { name: '503 ai_model_tool_not_allowed', res: () => json(503, MODEL_FAILURE('ai_model_tool_not_allowed')), want: { reason: 'model_failure' } },
  { name: '503 ai_model_tool_arguments_invalid', res: () => json(503, MODEL_FAILURE('ai_model_tool_arguments_invalid')), want: { reason: 'model_failure' } },
  { name: '503 ai_tool_result_unavailable', res: () => json(503, MODEL_FAILURE('ai_tool_result_unavailable')), want: { reason: 'model_failure' } },
  { name: '503 ai_model_unavailable', res: () => json(503, MODEL_UNAVAILABLE), want: { reason: 'model_failure' } },
  { name: '503 without a code', res: () => json(503, { message: 'Service Unavailable' }), want: { reason: 'server_error', status: 503 } },
  { name: '409 ai_approval_idempotency_conflict', res: () => json(409, APPROVAL_CONFLICT), want: { reason: 'conflict' } },
  { name: '409 other', res: () => json(409, EXECUTION_CONFLICT), want: { reason: 'conflict' } },
  { name: '502 relay', res: () => json(502, RELAY_502), want: { reason: 'no_connection' } },
  { name: 'network error', res: networkDown, want: { reason: 'no_connection' } },
  { name: '500', res: () => json(500, nest(500, 'Internal server error')), want: { reason: 'server_error', status: 500 } },
  { name: '404', res: () => json(404, nest(404, 'Cannot POST /api/ai/chat', 'Not Found')), want: { reason: 'unexpected_response', status: 404 } },
  { name: '200 not JSON', res: () => new Response('<html>', { status: 200 }), want: { reason: 'unexpected_response', status: 200 } },
  { name: '200 another request_id', res: () => json(201, CHAT_OK('another-request-id')), want: { reason: 'unexpected_response', status: 201 } },
];

test('/ai/chat taxonomy: 402, 403×3, 429, 400, 503 modelFailure, 409, 502/network, 5xx, unexpected — one named failure each', async () => {
  const { net } = await signedIn();
  for (const row of CHAT_ROWS) {
    serve({ [U.chat]: row.res });
    const out = await net.transport.chat(chatRequest(), new AbortController().signal);
    assert.deepEqual(out, { ok: false, failure: row.want }, row.name);
    assert.equal(calls(U.chat).length, 1, `${row.name}: exactly one request, no automatic retry`);
    assert.equal(net.session.view().signedIn, true, `${row.name}: session kept`);
  }
  // 402 keeps nothing of the paywall
  serve({ [U.chat]: () => json(402, SUBSCRIPTION_REQUIRED) });
  const paywall = await net.transport.chat(chatRequest(), new AbortController().signal);
  assert.ok(!JSON.stringify(paywall).includes('/billing/'));
});

test('/ai/chat timeout (80 s in production) is no_connection; a caller abort is aborted', async () => {
  const { net } = await signedIn({ timeouts: { requestMs: 25, transcribeMs: 25 } });
  serve({ [U.chat]: hang });
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'no_connection' } });
  serve({ [U.chat]: hang });
  const controller = new AbortController();
  const pending = net.transport.chat(chatRequest(), controller.signal);
  setTimeout(() => controller.abort(), 5);
  assert.deepEqual(await pending, { ok: false, failure: { reason: 'aborted' } });
  serve({});
  const early = new AbortController();
  early.abort();
  assert.deepEqual(await net.transport.chat(chatRequest(), early.signal), { ok: false, failure: { reason: 'aborted' } });
  assert.equal(wire.length, 0, 'an already-aborted call sends nothing');
  assert.equal(client.REQUEST_TIMEOUT_MS, 80_000);
  assert.equal(client.TRANSCRIBE_TIMEOUT_MS, 30_000);
});

// ── 5. 401 → refresh → retry once; single flight; terminal codes ────────────────────────────────

test('401 → one refresh → one retry with the new bearer', async () => {
  const { net } = await signedIn();
  serve({
    [U.chat]: [() => json(401, JWT_401), (req) => json(201, CHAT_OK(req.body.requestId))],
    [U.refresh]: json(201, REFRESH_OK(3)),
  });
  const out = await net.transport.chat(chatRequest(), new AbortController().signal);
  assert.equal(out.ok, true);
  assert.deepEqual(wire.map((r) => r.url), [U.chat, U.refresh, U.chat]);
  assert.deepEqual(calls(U.refresh)[0].body, { refreshToken: refreshTokenOf(2) });
  assert.equal(calls(U.refresh)[0].headers.Authorization, undefined);
  assert.deepEqual(calls(U.chat).map((r) => r.headers.Authorization), [`Bearer ${accessTokenOf(2)}`, `Bearer ${accessTokenOf(3)}`]);
  assert.equal(calls(U.chat)[0].raw, calls(U.chat)[1].raw, 'the retry is byte-identical (same requestId)');
});

test('two or more parallel 401s produce exactly one /auth/refresh (single flight); every call retried with the new bearer', async () => {
  const { net } = await signedIn();
  const refreshGate = gate();
  let refreshes = 0;
  serve({
    [U.chat]: (req) =>
      req.headers.Authorization === `Bearer ${accessTokenOf(2)}` ? json(401, JWT_401) : json(201, CHAT_OK(req.body.requestId)),
    [U.transcribe]: (req) =>
      req.headers.Authorization === `Bearer ${accessTokenOf(2)}` ? json(401, JWT_401) : json(201, { transcript: 'Запиши меня на завтра' }),
    [U.refresh]: async () => {
      refreshes += 1;
      await refreshGate.opened;
      return json(201, REFRESH_OK(3));
    },
  });
  const turns = [1, 2, 3].map((n) => net.transport.chat(chatRequest(`request-par-000${n}`), new AbortController().signal));
  const voice = net.transport.transcribe({ audioBase64: AUDIO }, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 20));
  refreshGate.open();
  const results = await Promise.all([...turns, voice]);
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  assert.equal(refreshes, 1);
  assert.equal(calls(U.refresh).length, 1);
  assert.equal(calls(U.chat).length, 6);
  assert.equal(calls(U.transcribe).length, 2);
  assert.deepEqual(calls(U.chat).slice(3).map((r) => r.headers.Authorization), Array(3).fill(`Bearer ${accessTokenOf(3)}`));
});

test('a 401 that arrives after another call already refreshed reuses the new grant (no second refresh)', async () => {
  const { net } = await signedIn();
  const slow = gate();
  let slowSent = false;
  serve({
    [U.chat]: async (req) => {
      if (req.headers.Authorization === `Bearer ${accessTokenOf(3)}`) return json(201, CHAT_OK(req.body.requestId));
      if (req.body.requestId === 'request-slow-001' && !slowSent) {
        slowSent = true;
        await slow.opened;
      }
      return json(401, JWT_401);
    },
    [U.refresh]: json(201, REFRESH_OK(3)),
  });
  const slowTurn = net.transport.chat(chatRequest('request-slow-001'), new AbortController().signal);
  await new Promise((r) => setTimeout(r, 5));
  const fastTurn = await net.transport.chat(chatRequest('request-fast-001'), new AbortController().signal);
  assert.equal(fastTurn.ok, true);
  slow.open();
  assert.equal((await slowTurn).ok, true);
  assert.equal(calls(U.refresh).length, 1);
});

test('proactive refresh within 30 s of expiry: parallel calls share one refresh', async () => {
  const { net, advance } = await signedIn();
  advance(900_000 - 29_000);
  const refreshGate = gate();
  serve({
    [U.refresh]: async () => {
      await refreshGate.opened;
      return json(201, REFRESH_OK(4));
    },
    [U.chat]: (req) => json(201, CHAT_OK(req.body.requestId)),
  });
  const turns = [1, 2].map((n) => net.transport.chat(chatRequest(`request-pro-000${n}`), new AbortController().signal));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls(U.chat).length, 0, 'nothing is sent with a token about to expire');
  refreshGate.open();
  assert.ok((await Promise.all(turns)).every((r) => r.ok));
  assert.equal(calls(U.refresh).length, 1);
  assert.deepEqual(calls(U.chat).map((r) => r.headers.Authorization), Array(2).fill(`Bearer ${accessTokenOf(4)}`));
  assert.equal(sessionModule.REFRESH_LEEWAY_MS, 30_000);
});

test('terminal refresh codes end the session with that reason, notify once, and send no retry', async () => {
  for (const [code, message] of [
    ['refresh_token_invalid', 'Refresh token is invalid.'],
    ['refresh_token_reused', 'Refresh token was already used. The session has been revoked.'],
    ['session_expired', 'Session has expired.'],
    ['session_revoked', 'Session has been revoked.'],
  ]) {
    const { net } = await signedIn();
    const seen = [];
    net.session.subscribe((v) => seen.push(v));
    serve({ [U.chat]: json(401, JWT_401), [U.refresh]: json(401, SESSION_ERROR(code, message)) });
    const out = await net.transport.chat(chatRequest(), new AbortController().signal);
    assert.deepEqual(out, { ok: false, failure: { reason: 'signed_out', signedOut: code } }, code);
    assert.deepEqual(net.session.view(), { signedIn: false, reason: code });
    assert.deepEqual(seen, [{ signedIn: false, reason: code }]);
    assert.deepEqual(wire.map((r) => r.url), [U.chat, U.refresh]);
    serve({});
    assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'signed_out', signedOut: code } });
    assert.equal(wire.length, 0, 'signed out: nothing is sent');
  }
});

test('refresh that cannot complete now keeps the session: 429 → rate_limited, network → no_connection', async () => {
  const { net } = await signedIn();
  serve({ [U.chat]: json(401, JWT_401), [U.refresh]: json(429, RATE_LIMITED(20), { 'Retry-After': '20' }) });
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'rate_limited', retryAfterSec: 20 } });
  assert.equal(net.session.view().signedIn, true);
  serve({ [U.chat]: json(401, JWT_401), [U.refresh]: networkDown });
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'no_connection' } });
  serve({ [U.transcribe]: json(401, JWT_401), [U.refresh]: json(500, nest(500, 'Internal server error')) });
  assert.deepEqual(await net.transport.transcribe({ audioBase64: AUDIO }, new AbortController().signal), { ok: false, failure: { reason: 'unexpected_response', status: 500 } });
  assert.equal(net.session.view().signedIn, true);
});

test('refresh 400 validation, 401 without a code and a malformed 2xx each end the session (no silent loop)', async () => {
  for (const [res, reason] of [
    [() => json(400, VALIDATION('refreshToken', 'refreshToken must be longer than or equal to 64 characters')), 'refresh_token_invalid'],
    [() => json(401, nest(401, 'User is not active', 'Unauthorized')), 'session_revoked'],
    [() => json(401, CRM_ACCESS_DISABLED), 'session_revoked'],
    [() => json(201, { ...REFRESH_OK(3), access_token: null }), 'refresh_token_invalid'],
  ]) {
    const { net } = await signedIn();
    serve({ [U.chat]: json(401, JWT_401), [U.refresh]: res });
    assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'signed_out', signedOut: reason } });
    assert.deepEqual(net.session.view(), { signedIn: false, reason });
  }
});

test('a 401 on the retry after a successful refresh ends the session (session_revoked); never a loop', async () => {
  const { net } = await signedIn();
  serve({ [U.chat]: json(401, JWT_401), [U.refresh]: json(201, REFRESH_OK(3)) });
  const out = await net.transport.chat(chatRequest(), new AbortController().signal);
  assert.deepEqual(out, { ok: false, failure: { reason: 'signed_out', signedOut: 'session_revoked' } });
  assert.deepEqual(wire.map((r) => r.url), [U.chat, U.refresh, U.chat]);
  assert.deepEqual(net.session.view(), { signedIn: false, reason: 'session_revoked' });
});

test('a lapsed refresh token ends the session as session_expired with 0 requests', async () => {
  const { net, advance } = await signedIn();
  advance(Date.parse(REFRESH_EXPIRES) - T0 + 1);
  serve({});
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'signed_out', signedOut: 'session_expired' } });
  assert.equal(wire.length, 0);
  assert.deepEqual(net.session.view(), { signedIn: false, reason: 'session_expired' });
});

test('aborting a turn while it waits on a shared refresh returns aborted at once; the refresh still lands', async () => {
  const { net, advance } = await signedIn();
  advance(900_000);
  const refreshGate = gate();
  serve({
    [U.refresh]: async () => {
      await refreshGate.opened;
      return json(201, REFRESH_OK(5));
    },
    [U.chat]: (req) => json(201, CHAT_OK(req.body.requestId)),
  });
  const controller = new AbortController();
  const pending = net.transport.chat(chatRequest(), controller.signal);
  await new Promise((r) => setTimeout(r, 5));
  controller.abort();
  assert.deepEqual(await pending, { ok: false, failure: { reason: 'aborted' } });
  refreshGate.open();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls(U.chat).length, 0);
  const next = await net.transport.chat(chatRequest('request-after-01'), new AbortController().signal);
  assert.equal(next.ok, true);
  assert.equal(calls(U.refresh).length, 1);
  assert.equal(calls(U.chat)[0].headers.Authorization, `Bearer ${accessTokenOf(5)}`);
});

// ── 6. transcribe ──────────────────────────────────────────────────────────────────────────────

test('/ai/transcribe: body exactly {audioBase64}; {transcript} kept; failures mapped (§1.9)', async () => {
  const { net } = await signedIn({ timeouts: { requestMs: 1000, transcribeMs: 25 } });
  serve({ [U.transcribe]: json(201, { transcript: 'Запиши меня на завтра', provider: 'yandex', duration_ms: 812 }) });
  const out = await net.transport.transcribe({ audioBase64: AUDIO, modality: 'spoken', surface: 'voice' }, new AbortController().signal);
  assert.deepEqual(out, { ok: true, value: { transcript: 'Запиши меня на завтра' } });
  assert.deepEqual(calls(U.transcribe)[0].body, { audioBase64: AUDIO });
  assert.deepEqual(Object.keys(calls(U.transcribe)[0].headers).sort(), ['Authorization', 'Content-Type']);
  const rows = [
    [() => json(400, NOT_RECOGNIZED), { reason: 'not_recognized' }],
    [() => json(201, { transcript: '   ' }), { reason: 'not_recognized' }],
    [() => json(400, INVALID_AUDIO), { reason: 'audio_rejected' }],
    [() => json(413, { message: 'request entity too large' }), { reason: 'audio_rejected' }],
    [() => json(503, PROVIDER_UNAVAILABLE), { reason: 'provider_unavailable' }],
    [() => json(429, RATE_LIMITED(8), { 'Retry-After': '8' }), { reason: 'rate_limited', retryAfterSec: 8 }],
    [() => json(502, RELAY_502), { reason: 'no_connection' }],
    [networkDown, { reason: 'no_connection' }],
    [hang, { reason: 'no_connection' }],
    [() => json(402, SUBSCRIPTION_REQUIRED), { reason: 'unexpected_response', status: 402 }],
    [() => json(201, { text: 'x' }), { reason: 'unexpected_response', status: 201 }],
  ];
  for (const [res, want] of rows) {
    serve({ [U.transcribe]: res });
    assert.deepEqual(await net.transport.transcribe({ audioBase64: AUDIO }, new AbortController().signal), { ok: false, failure: want }, JSON.stringify(want));
    assert.equal(calls(U.transcribe).length, 1, 'no automatic retry');
  }
  const controller = new AbortController();
  serve({ [U.transcribe]: hang });
  const pending = net.transport.transcribe({ audioBase64: AUDIO }, controller.signal);
  controller.abort();
  assert.deepEqual(await pending, { ok: false, failure: { reason: 'aborted' } });
});

// ── 7. sign-out and the signed-out state ───────────────────────────────────────────────────────

test('never signed in: view reason null; chat and transcribe answer signed_out with 0 requests', async () => {
  const net = createNet();
  serve({});
  assert.deepEqual(net.session.view(), { signedIn: false, reason: null });
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'signed_out', signedOut: 'signed_out' } });
  assert.deepEqual(await net.transport.transcribe({ audioBase64: AUDIO }, new AbortController().signal), { ok: false, failure: { reason: 'signed_out', signedOut: 'signed_out' } });
  await net.session.signOut();
  assert.equal(wire.length, 0);
  assert.deepEqual(net.session.view(), { signedIn: false, reason: null });
});

test('signOut: signed out locally at once, then /auth/logout with the bearer; later calls send nothing', async () => {
  const { net } = await signedIn();
  const seen = [];
  const cancel = net.session.subscribe((v) => seen.push(v));
  serve({ [U.logout]: json(201, { ok: true, revoked: true }) });
  const done = net.session.signOut();
  assert.deepEqual(net.session.view(), { signedIn: false, reason: 'signed_out' }, 'synchronously signed out');
  await done;
  assert.deepEqual(seen, [{ signedIn: false, reason: 'signed_out' }]);
  assert.equal(calls(U.logout).length, 1);
  assert.equal(calls(U.logout)[0].headers.Authorization, `Bearer ${accessTokenOf(2)}`);
  assert.deepEqual(calls(U.logout)[0].body, {});
  serve({});
  assert.deepEqual(await net.transport.chat(chatRequest(), new AbortController().signal), { ok: false, failure: { reason: 'signed_out', signedOut: 'signed_out' } });
  assert.equal(wire.length, 0);
  cancel();
  cancel();
  serve({ [U.login]: json(201, LOGIN_OK) });
  await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
  assert.equal(seen.length, 1, 'a cancelled subscription hears nothing');
});

test('signOut never throws when logout fails, and a failing subscriber does not stop the others', async () => {
  const { net } = await signedIn();
  const heard = [];
  net.session.subscribe(() => {
    throw new Error('subscriber bug');
  });
  net.session.subscribe((v) => heard.push(v));
  // The session reports a subscriber's error asynchronously (as an event dispatch would); capture it
  // here instead of letting the test runner's own handler claim it.
  const uncaught = [];
  const runnerHandlers = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  const onUncaught = (e) => uncaught.push(e.message);
  process.on('uncaughtException', onUncaught);
  try {
    serve({ [U.logout]: networkDown });
    await net.session.signOut();
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    process.off('uncaughtException', onUncaught);
    for (const h of runnerHandlers) process.on('uncaughtException', h);
  }
  assert.deepEqual(heard, [{ signedIn: false, reason: 'signed_out' }]);
  assert.deepEqual(uncaught, ['subscriber bug'], 'the subscriber error still surfaces');
});

test('signOut with an expired access token refreshes once to revoke; the refreshed grant is never installed', async () => {
  const { net, advance } = await signedIn();
  advance(900_000);
  serve({ [U.refresh]: json(201, REFRESH_OK(6)), [U.logout]: json(201, { ok: true, revoked: true }) });
  await net.session.signOut();
  assert.deepEqual(wire.map((r) => r.url), [U.refresh, U.logout]);
  assert.equal(calls(U.logout)[0].headers.Authorization, `Bearer ${accessTokenOf(6)}`);
  assert.deepEqual(net.session.view(), { signedIn: false, reason: 'signed_out' });
  serve({});
  assert.equal((await net.transport.chat(chatRequest(), new AbortController().signal)).failure.reason, 'signed_out');
  assert.equal(wire.length, 0);
});

test('signOut after the refresh token lapsed sends nothing: there is no server session left to revoke', async () => {
  const { net, advance } = await signedIn();
  advance(Date.parse(REFRESH_EXPIRES) - T0 + 1);
  serve({});
  await net.session.signOut();
  assert.equal(wire.length, 0);
  assert.deepEqual(net.session.view(), { signedIn: false, reason: 'signed_out' });
});

test('signOut during an in-flight refresh: logout uses the refreshed bearer; the waiting turn ends signed_out', async () => {
  const { net, advance } = await signedIn();
  advance(900_000);
  const refreshGate = gate();
  serve({
    [U.refresh]: async () => {
      await refreshGate.opened;
      return json(201, REFRESH_OK(7));
    },
    [U.logout]: json(201, { ok: true, revoked: true }),
  });
  const turn = net.transport.chat(chatRequest(), new AbortController().signal);
  await new Promise((r) => setTimeout(r, 5));
  const out = net.session.signOut();
  refreshGate.open();
  await out;
  assert.deepEqual(await turn, { ok: false, failure: { reason: 'signed_out', signedOut: 'signed_out' } });
  assert.deepEqual(wire.map((r) => r.url), [U.refresh, U.logout]);
  assert.equal(calls(U.logout)[0].headers.Authorization, `Bearer ${accessTokenOf(7)}`);
  assert.deepEqual(net.session.view(), { signedIn: false, reason: 'signed_out' });
});

test('a grant from a later sign-in is never handed to a call made under the earlier one', async () => {
  const { net } = await signedIn();
  const refreshGate = gate();
  serve({
    [U.chat]: (req) => (req.headers.Authorization === `Bearer ${accessTokenOf(2)}` ? json(401, JWT_401) : json(201, CHAT_OK(req.body.requestId))),
    [U.refresh]: async () => {
      await refreshGate.opened;
      return json(201, REFRESH_OK(8));
    },
    [U.logout]: json(201, { ok: true, revoked: true }),
    [U.login]: json(201, { ...LOGIN_OK, access_token: accessTokenOf(9), refresh_token: refreshTokenOf(9) }),
  });
  const turn = net.transport.chat(chatRequest(), new AbortController().signal);
  await new Promise((r) => setTimeout(r, 5));
  const out = net.session.signOut();
  await net.session.signInPassword('second-salon', 'owner@example.ru', 'correct-horse-9');
  refreshGate.open();
  await out;
  assert.deepEqual(await turn, { ok: false, failure: { reason: 'signed_out', signedOut: 'signed_out' } });
  assert.equal(calls(U.chat).length, 1, 'the earlier turn is not retried with the later sign-in');
  assert.equal(net.session.view().signedIn, true);
});

// ── 8. the build gates over these files, and the frozen ports ──────────────────────────────────

const { loadTypeScript, emitContract, runFixture, sharedDirs } = await import('../build.mjs');
const ts = loadTypeScript();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-net-test-'));
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
let contract;
const contractOnce = () => (contract ??= emitContract(ts, tmpRoot));
const NET_FILES = ['src/net/endpoint.ts', 'src/net/project.ts', 'src/net/client.ts', 'src/net/session.ts'];
const netFixture = (id, direction, edit = (files) => files) => {
  const files = new Map(NET_FILES.map((rel) => [rel, read(rel)]));
  return { id, direction, row: 'net', files: edit(files), expect: new Set(), probes: false, typecheck: null };
};

test('the purity gates admit src/net/** as written (fetch shape, PATHS, surface, audience, globals, imports, collisions)', () => {
  const c = contractOnce();
  const r = runFixture(ts, c, netFixture('net-admit', 'admit'), sharedDirs(ts, c));
  assert.deepEqual(r.refusals, []);
  assert.equal(r.ok, true);
});

test('the gates are not vacuous over these files: a tenth path, a second fetch, a storage read and surface "voice" are refused', () => {
  const c = contractOnce();
  const shared = sharedDirs(ts, c);
  const mutate = (id, rel, fn, rule) => {
    const r = runFixture(ts, c, netFixture(id, 'refuse', (files) => files.set(rel, fn(files.get(rel)))), shared);
    assert.ok(r.got.includes(rule), `${id}: got {${r.got.join(', ')}}, want ${rule}`);
  };
  mutate('tenth-path', 'src/net/client.ts', (s) => s.replace("widgetResolve: '/widgets/resolve',", "widgetResolve: '/widgets/resolve',\n  widgetAdmin: '/widgets/admin',"), 'fetch-shape');
  mutate('second-fetch', 'src/net/client.ts', (s) => `${s}\nexport const leak = () => fetch(API_BASE + PATHS.chat);\n`, 'fetch-shape');
  mutate('storage', 'src/net/session.ts', (s) => `${s}\nexport const leak = (): unknown => globalThis['local' + 'Storage'];\n`, 'identifier-ban');
  mutate('surface', 'src/net/client.ts', (s) => s.replace("surface: 'web',", "surface: 'voice',"), 'surface');
  mutate('audience', 'src/net/client.ts', (s) => s.replace("surface: 'web',", "surface: 'web',\n        audience: 'owner',"), 'audience');
});

test('createNet() is structurally SessionPort + Transport (shell/ports.ts, frozen in S0) with no adapter', () => {
  const c = contractOnce();
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'ports-'));
  const check = path.join(dir, 'net-ports-check.ts');
  fs.writeFileSync(
    check,
    [
      `import type { SessionPort, Transport } from ${JSON.stringify(path.join(SH, 'src/shell/ports.ts'))};`,
      `import { createNet } from ${JSON.stringify(path.join(SH, 'src/net/session.ts'))};`,
      'const net = createNet();',
      'export const session: SessionPort = net.session;',
      'export const transport: Transport = net.transport;',
      '',
    ].join('\n'),
  );
  const configPath = path.join(SH, 'tsconfig.json');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, SH, undefined, configPath);
  const options = { ...parsed.options, noEmit: true, types: [], paths: { '#contract': [c.index] } };
  const program = ts.createProgram({ rootNames: [check], options });
  const mine = (file) => !!file && (file.fileName === check || file.fileName.includes('/src/net/') || file.fileName.endsWith('/src/shell/ports.ts'));
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => mine(d.file));
  assert.deepEqual(diagnostics.map((d) => `${d.file ? path.basename(d.file.fileName) : ''}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`), []);
});

test('no storage, no document, no cookie: never touched at runtime, never named in src/net', () => {
  assert.deepEqual(touched, []);
  for (const f of NET_FILES) {
    const s = read(f);
    for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookie', 'document', 'IDB', 'serviceWorker']) assert.ok(!s.includes(word), `${f} names ${word}`);
  }
});

test('every request of this suite went to one of the nine approved URLs, and all nine were exercised', () => {
  const allowed = Object.values(U).sort();
  assert.deepEqual([...everyUrl].sort(), allowed);
});
