// K5 dev — the mock API behind `dev/serve.mjs --mock` (§2.4).
//
// It stands where NestJS stands: it receives only what the relay forwards and answers with the
// backend's recorded bodies (`dev/fixtures/api/**`, each citing its source). It ENFORCES the real DTOs
// (D6): `AiCoreChatDto`, `LoginDto`, `StartEmailAuthDto`, `VerifyEmailAuthDto`, `RefreshSessionDto` and
// the `{audioBase64}` transcribe body, with class-validator's messages, their order and the shared
// 400 shape of `bootstrap/configure-http-app.ts`. The two value checks that are not trivial —
// `IsEmail` and the length checks — call the very `validator` package class-validator calls, resolved
// from `maya-saas-backend/node_modules` (the build already requires that tree); without it the mock
// refuses to start rather than approximate. `test/serve.test.mjs` compares these bodies with the
// backend's own ValidationPipe over a corpus.
//
// Order of a request, as in Nest: body parser (413, JSON syntax) → route (404) → JwtAuthGuard (401) →
// guard-stage scenario (402) → DTO validation (400) → handler (scenario, else the default behaviour).
//
// Scenarios are named; `POST /__dev/scenario {name}` switches them. There is one scenario per row of
// the §1.4 sign-in failure table (V2-16), plus `approval_required` (V2-5) and the §2.7 turn cases.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SHELL_DIR = path.resolve(DEV_DIR, '..');
export const BACKEND_DIR = path.resolve(SHELL_DIR, '..', 'maya-saas-backend');
export const API_FIXTURES_DIR = path.join(DEV_DIR, 'fixtures', 'api');

// ── the value checks class-validator uses ──────────────────────────────────────────────────────

function loadValidator() {
  try {
    const fromClassValidator = createRequire(createRequire(path.join(BACKEND_DIR, 'package.json')).resolve('class-validator/package.json'));
    return {
      isEmail: fromClassValidator('validator/lib/isEmail').default,
      isLength: fromClassValidator('validator/lib/isLength').default,
    };
  } catch (error) {
    throw new Error(
      `the DTO-enforcing mock needs maya-saas-backend/node_modules (class-validator's validator package): ${error.message}. ` +
        'Run `npm --prefix maya-saas-backend ci`.',
    );
  }
}
const { isEmail, isLength } = loadValidator();

// ── DTO schemas: properties in declaration order, constraints in class-validator's reporting order ──

const c = {
  isIn: (values) => ({ test: (v) => values.some((x) => x === v), message: (p) => `${p} must be one of the following values: ${values.join(', ')}` }),
  isString: () => ({ test: (v) => typeof v === 'string', message: (p) => `${p} must be a string` }),
  matches: (re) => ({ test: (v) => typeof v === 'string' && re.test(v), message: (p) => `${p} must match ${re} regular expression` }),
  minLength: (n) => ({ test: (v) => typeof v === 'string' && isLength(v, { min: n }), message: (p) => `${p} must be longer than or equal to ${n} characters` }),
  maxLength: (n) => ({ test: (v) => typeof v === 'string' && isLength(v, { min: 0, max: n }), message: (p) => `${p} must be shorter than or equal to ${n} characters` }),
  isEmail: () => ({ test: (v) => typeof v === 'string' && isEmail(v), message: (p) => `${p} must be an email` }),
  arrayMinSize: (n) => ({ test: (v) => Array.isArray(v) && v.length >= n, message: (p) => `${p} must contain at least ${n} elements` }),
  arrayMaxSize: (n) => ({ test: (v) => Array.isArray(v) && v.length <= n, message: (p) => `${p} must contain no more than ${n} elements` }),
};

/** `ai-tools/dto/ai-core-chat.dto.ts` */
export const AI_CORE_CHAT_MESSAGE_DTO = {
  name: 'AiCoreChatMessageDto',
  props: [
    { name: 'role', constraints: [c.isIn(['assistant', 'user'])] },
    { name: 'content', constraints: [c.maxLength(2000), c.minLength(1), c.isString()] },
  ],
};
export const AI_CORE_CHAT_DTO = {
  name: 'AiCoreChatDto',
  props: [
    { name: 'surface', constraints: [c.isIn(['native', 'web', 'telegram', 'voice'])] },
    { name: 'audience', optional: true, constraints: [c.isIn(['client', 'staff', 'owner'])] },
    { name: 'requestId', constraints: [c.matches(/^[A-Za-z0-9_-]{8,128}$/), c.isString()] },
    { name: 'messages', constraints: [c.arrayMaxSize(12), c.arrayMinSize(1)], nested: AI_CORE_CHAT_MESSAGE_DTO },
  ],
};
/** `auth/dto/login.dto.ts` */
export const LOGIN_DTO = {
  name: 'LoginDto',
  props: [
    { name: 'tenantSlug', optional: true, constraints: [c.isString()] },
    { name: 'email', constraints: [c.isEmail()] },
    { name: 'password', constraints: [c.minLength(8), c.isString()] },
  ],
};
/** `auth/dto/start-email-auth.dto.ts` */
export const START_EMAIL_AUTH_DTO = {
  name: 'StartEmailAuthDto',
  props: [
    { name: 'tenantSlug', optional: true, constraints: [c.isString()] },
    { name: 'email', constraints: [c.maxLength(254), c.isEmail()] },
  ],
};
/** `auth/dto/verify-email-auth.dto.ts` */
export const VERIFY_EMAIL_AUTH_DTO = {
  name: 'VerifyEmailAuthDto',
  props: [
    { name: 'tenantSlug', optional: true, constraints: [c.isString()] },
    { name: 'email', constraints: [c.maxLength(254), c.isEmail()] },
    { name: 'code', constraints: [c.matches(/^\d+$/), c.maxLength(8), c.minLength(4), c.isString()] },
  ],
};
/** `auth/dto/refresh-session.dto.ts` */
export const REFRESH_SESSION_DTO = {
  name: 'RefreshSessionDto',
  props: [{ name: 'refreshToken', constraints: [c.maxLength(512), c.minLength(64), c.isString()] }],
};

const isObjectLike = (v) => v !== null && typeof v === 'object';

function validateObject(object, schema) {
  const errors = [];
  const known = new Set(schema.props.map((p) => p.name));
  for (const key of Object.keys(object)) {
    if (key === '__proto__' || known.has(key)) continue;
    errors.push({ property: key, constraints: [`property ${key} should not exist`], children: [] });
  }
  for (const prop of schema.props) {
    const value = object[prop.name];
    const error = { property: prop.name, constraints: [], children: [] };
    if (prop.optional && (value === null || value === undefined)) continue;
    for (const constraint of prop.constraints) if (!constraint.test(value)) error.constraints.push(constraint.message(prop.name));
    if (prop.nested) validateNested(value, prop, error);
    if (error.constraints.length || error.children.length) errors.push(error);
  }
  return errors;
}

function validateNested(value, prop, error) {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const child = { property: String(index), constraints: [], children: [] };
      validateNested(item, prop, child);
      if (child.constraints.length || child.children.length) error.children.push(child);
    });
  } else if (isObjectLike(value)) {
    error.children.push(...validateObject(value, prop.nested));
  } else {
    error.constraints.push(`each value in nested property ${prop.name} must be either object or array`);
  }
}

/** `common/validation-errors.ts` flattenValidationErrors */
function flatten(errors, parentPath = '') {
  return errors.flatMap((error) => {
    const field = [parentPath, error.property].filter(Boolean).join('.');
    return [...error.constraints.map((message) => ({ field, message })), ...flatten(error.children, field)];
  });
}

/** The 400 body of the global ValidationPipe, or null when the value passes the DTO. */
export function validateDto(value, schema) {
  // Nest's ValidationPipe turns a missing body into {} before validating.
  const object = value === undefined || value === null ? {} : value;
  const details = flatten(validateObject(object, schema));
  if (details.length === 0) return null;
  const first = details[0];
  const message = first?.message || 'Validation failed';
  return { message, error: { code: 'validation', message, field: first?.field, details } };
}

// ── body parsing, as express.json() in configure-http-app.ts ───────────────────────────────────

export const JSON_LIMIT_BYTES = 100 * 1024;
export const SPEECH_JSON_LIMIT_BYTES = 2 * 1024 * 1024;

/** body-parser 2.x json({strict: true}) error message for `text`. */
export function jsonParseFailure(text) {
  if (text.length === 0) return null;
  const match = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d])/.exec(text);
  const first = match ? match[1] : undefined;
  if (first !== '{' && first !== '[') {
    const index = text.indexOf(first);
    const partial = index !== -1 ? text.substring(0, index) + '#'.repeat(text.length - index) : '';
    try {
      JSON.parse(partial);
      return 'strict violation';
    } catch (e) {
      return e.message.replace(/#+/g, (placeholder) => text.substring(index, index + placeholder.length));
    }
  }
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e.message;
  }
}

/** { body } | { status, body } — undefined body when the content type is not JSON (as in Express). */
export function parseRequestBody(path_, headers, raw) {
  const limit = path_ === '/ai/transcribe' ? SPEECH_JSON_LIMIT_BYTES : JSON_LIMIT_BYTES;
  const type = String(headers['content-type'] ?? '').toLowerCase();
  const isJson = /^application\/(?:[^;]*\+)?json\s*(?:;|$)/.test(type);
  if (!raw || raw.length === 0) return { body: isJson ? {} : undefined };
  if (raw.length > limit) return { status: 413, fixture: 'common/payload-too-large.413.json' };
  if (!isJson) return { body: undefined };
  const text = raw.toString('utf8');
  const failure = jsonParseFailure(text);
  if (failure) return { status: 400, fixture: 'common/json-parse-failed.400.json', values: { parse_message: failure } };
  return { body: JSON.parse(text) };
}

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────

const fixtureCache = new Map();
export function loadApiFixture(rel, root = API_FIXTURES_DIR) {
  const file = path.join(root, rel);
  if (!fixtureCache.has(file)) fixtureCache.set(file, JSON.parse(fs.readFileSync(file, 'utf8')));
  return fixtureCache.get(file);
}

/** Replace `{{name}}` placeholders. A string that is exactly one placeholder takes the value's type. */
export function fill(template, values) {
  if (typeof template === 'string') {
    const whole = /^\{\{([a-z_]+)\}\}$/.exec(template);
    if (whole) {
      if (!(whole[1] in values)) throw new Error(`fixture placeholder {{${whole[1]}}} has no value`);
      return values[whole[1]];
    }
    return template.replace(/\{\{([a-z_]+)\}\}/g, (_, name) => {
      if (!(name in values)) throw new Error(`fixture placeholder {{${name}}} has no value`);
      return String(values[name]);
    });
  }
  if (Array.isArray(template)) return template.map((item) => fill(item, values));
  if (isObjectLike(template)) return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, values)]));
  return template;
}

function respondFixture(rel, values = {}, root = API_FIXTURES_DIR) {
  const fixture = loadApiFixture(rel, root);
  return { status: fixture.status, headers: fill(fixture.headers ?? {}, values), body: fill(fixture.body, values), fixture: rel };
}

// ── mock identities (fictional) ────────────────────────────────────────────────────────────────

export const MOCK_ACCOUNT = Object.freeze({
  email: 'anna@example.test',
  password: 'mock-password-1',
  userName: 'Анна Смирнова',
  debugCode: '246810',
});
export const MOCK_TENANTS = Object.freeze([
  Object.freeze({ id: 'cmocktenant0000000000000001', slug: 'severny-veter', name: 'Салон «Северный ветер»' }),
  Object.freeze({ id: 'cmocktenant0000000000000002', slug: 'tikhaya-gavan', name: 'Студия «Тихая гавань»' }),
]);
export const MOCK_TRANSCRIPT = 'Запишите меня на стрижку в пятницу в 12:00';
export const ACCESS_TTL_SECONDS = 900;

// ── scenarios ──────────────────────────────────────────────────────────────────────────────────

const ANY_SIGN_IN = ['/auth/email/start', '/auth/email/verify', '/auth/login'];

/**
 * Each override: `paths` it applies to, `stage` ('guard' before DTO validation, 'handler' after it),
 * and what to answer: a `fixture` (+ `values`), `relayFailure` (the upstream is unreachable → the relay's
 * 502), or `hang` (never answers; the relay's 75 s timeout answers 502). `when` narrows it:
 * 'always' (default), 'first_attempt' (the first request per chat requestId; the retry succeeds),
 * or 'pre_refresh' (access tokens issued before the first successful refresh).
 */
export const SCENARIOS = Object.freeze({
  happy: { description: 'Everything succeeds: email OTP (one business), password with a business address, refresh, typed and spoken turns.' },
  select_business: { description: 'Email OTP where the account belongs to two businesses: verify → select_business → re-verify with the chosen tenantSlug.', memberships: 2 },
  slow_reply: { description: 'Typed turn whose reply takes 2.5 s (the user bubble and one role=status appear first).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', delayMs: 2500 }] },
  long_reply: { description: 'Reply of 3 500 UTF-16 units; the next turn must carry history items of ≤ 2 000 (D6).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/chat.201.long-reply.json', when: 'first_turn' }] },
  approval_required: { description: 'An approval-gated tool: reply plus action {status: approval_required, approval} (ai-core.service.ts:1167-1180; V2-5).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/chat.201.approval-required.json', when: 'first_turn' }] },
  unbroken_token: { description: 'A reply with a 200-character unbroken token (§2.7 step 14 reflow at 320 px, text scale 2.0).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/chat.201.unbroken-token.json' }] },
  chat_with_envelopes: { description: 'A reply that also carries contract-typed envelopes from dev/fixtures/envelopes: P1 draws the reply and none of the envelopes (no consumer before B4).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/chat.201.with-envelopes.json', envelopes: true }] },
  reply_links: { description: 'A reply carrying https:, tel:, mailto:, javascript: and data: strings (§2.7 step 16).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/chat.201.reply-links.json' }] },
  chat_502: { description: 'The relay cannot reach the backend on the first attempt of each turn; the same-requestId retry succeeds.', overrides: [{ paths: ['/ai/chat'], stage: 'guard', relayFailure: true, when: 'first_attempt' }] },
  chat_hang: { description: 'The backend never answers; the relay times out (75 s, or --upstream-timeout-ms) and answers 502.', overrides: [{ paths: ['/ai/chat'], stage: 'guard', hang: true }] },
  chat_429: { description: 'ai_chat rate limit: 429 auth_rate_limited + Retry-After: 20 on the first attempt; the same-requestId retry succeeds.', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'auth/errors/auth-rate-limited.429.json', values: { retry_after_seconds: 20 }, when: 'first_attempt' }] },
  chat_402: { description: 'SubscriptionAccessGuard: 402 subscription_required.', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'guard', fixture: 'ai/errors/subscription-required.402.json' }] },
  chat_403_feature_locked: { description: '403 feature_locked on a turn.', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/errors/feature-locked.403.json' }] },
  chat_503_model_failure: { description: '503 ai_model_tool_step_limit on the first attempt; the same-requestId retry succeeds.', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/errors/model-failure.503.json', when: 'first_attempt' }] },
  chat_409_conflict: { description: '409 ai_approval_idempotency_conflict: terminal for that requestId.', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/errors/approval-idempotency-conflict.409.json' }] },
  chat_400_validation: { description: 'A recorded 400 validation body on every turn (the outdated-client notice).', overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/errors/validation.400.json' }] },
  chat_tenant_required: { description: 'Sign-in row 11: /ai/chat → 403 tenant_required (a session with no tenant).', signInRow: 11, overrides: [{ paths: ['/ai/chat'], stage: 'handler', fixture: 'ai/errors/tenant-required.403.json' }] },
  access_rejected_once: { description: 'Every access token issued before the first refresh gets 401; parallel 401s must produce exactly one /auth/refresh.', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'auth', fixture: 'auth/errors/unauthorized.401.json', when: 'pre_refresh' }] },
  access_rejected_parallel: { description: 'As access_rejected_once, with /auth/refresh taking 1.5 s: a transcribe and a chat request rejected together must share ONE refresh (§2.7 step 9).', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'auth', fixture: 'auth/errors/unauthorized.401.json', when: 'pre_refresh' }, { paths: ['/auth/refresh'], stage: 'handler', delayMs: 1500 }] },
  refresh_token_reused: { description: 'Existing access tokens get 401; /auth/refresh answers 401 refresh_token_reused (signed out with a reason).', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'auth', fixture: 'auth/errors/unauthorized.401.json' }, { paths: ['/auth/refresh'], stage: 'handler', fixture: 'auth/errors/refresh-token-reused.401.json' }] },
  refresh_token_invalid: { description: '401 on turns; /auth/refresh answers 401 refresh_token_invalid.', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'auth', fixture: 'auth/errors/unauthorized.401.json' }, { paths: ['/auth/refresh'], stage: 'handler', fixture: 'auth/errors/refresh-token-invalid.401.json' }] },
  session_expired: { description: '401 on turns; /auth/refresh answers 401 session_expired.', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'auth', fixture: 'auth/errors/unauthorized.401.json' }, { paths: ['/auth/refresh'], stage: 'handler', fixture: 'auth/errors/session-expired.401.json' }] },
  session_revoked: { description: '401 on turns; /auth/refresh answers 401 session_revoked.', overrides: [{ paths: ['/ai/chat', '/ai/transcribe'], stage: 'auth', fixture: 'auth/errors/unauthorized.401.json' }, { paths: ['/auth/refresh'], stage: 'handler', fixture: 'auth/errors/session-revoked.401.json' }] },
  transcribe_not_recognized: { description: '/ai/transcribe → 400 speech_not_recognized.', overrides: [{ paths: ['/ai/transcribe'], stage: 'handler', fixture: 'ai/errors/speech-not-recognized.400.json' }] },
  transcribe_provider_unavailable: { description: '/ai/transcribe → 503 speech_provider_unavailable (as the local binary without a provider key).', overrides: [{ paths: ['/ai/transcribe'], stage: 'handler', fixture: 'ai/errors/speech-provider-unavailable.503.json' }] },

  // ── §1.4 sign-in failure table, one scenario per row (V2-16) ──
  signin_rate_limited: { description: 'Row 1: any sign-in endpoint → 429 auth_rate_limited + Retry-After: 42.', signInRow: 1, overrides: [{ paths: ANY_SIGN_IN, stage: 'handler', fixture: 'auth/errors/auth-rate-limited.429.json', values: { retry_after_seconds: 42 } }] },
  signin_code_attempts_exhausted: { description: 'Row 2: /auth/email/verify → 429 email_too_many_attempts.', signInRow: 2, overrides: [{ paths: ['/auth/email/verify'], stage: 'handler', fixture: 'auth/errors/email-too-many-attempts.429.json' }] },
  signin_email_login_unavailable: { description: 'Row 3: /auth/email/start and /verify → 503 email_login_unavailable.', signInRow: 3, overrides: [{ paths: ['/auth/email/start', '/auth/email/verify'], stage: 'handler', fixture: 'auth/errors/email-login-unavailable.503.json' }] },
  signin_email_delivery_unavailable: { description: 'Row 3 (variant): /auth/email/start → 503 email_delivery_unavailable.', signInRow: 3, overrides: [{ paths: ['/auth/email/start'], stage: 'handler', fixture: 'auth/errors/email-delivery-unavailable.503.json' }] },
  signin_email_delivery_failed: { description: 'Row 3 (variant): /auth/email/start → 503 email_delivery_failed.', signInRow: 3, overrides: [{ paths: ['/auth/email/start'], stage: 'handler', fixture: 'auth/errors/email-delivery-failed.503.json' }] },
  signin_code_invalid: { description: 'Row 4: /auth/email/verify → 400 email_code_invalid.', signInRow: 4, overrides: [{ paths: ['/auth/email/verify'], stage: 'handler', fixture: 'auth/errors/email-code-invalid.400.json' }] },
  signin_code_expired: { description: 'Row 5: /auth/email/verify → 400 email_code_expired.', signInRow: 5, overrides: [{ paths: ['/auth/email/verify'], stage: 'handler', fixture: 'auth/errors/email-code-expired.400.json' }] },
  signin_code_missing: { description: 'Row 5 (variant): /auth/email/verify → 400 email_code_missing.', signInRow: 5, overrides: [{ paths: ['/auth/email/verify'], stage: 'handler', fixture: 'auth/errors/email-code-missing.400.json' }] },
  signin_email_not_linked: { description: 'Row 6: two businesses; the select_business re-verify (with tenantSlug) → 401 email_login_invalid.', signInRow: 6, memberships: 2, overrides: [{ paths: ['/auth/email/verify'], stage: 'handler', fixture: 'auth/errors/email-login-invalid.401.json', when: 'with_tenant_slug' }] },
  signin_credentials_invalid: { description: 'Row 7: /auth/login → 401 «Invalid email or password».', signInRow: 7, overrides: [{ paths: ['/auth/login'], stage: 'handler', fixture: 'auth/errors/login-invalid-credentials.401.json' }] },
  signin_account_unavailable: { description: 'Row 8: any sign-in endpoint → 403 «User is not active».', signInRow: 8, overrides: [{ paths: ['/auth/email/verify', '/auth/login'], stage: 'handler', fixture: 'auth/errors/user-not-active.403.json' }] },
  signin_tenant_not_accepting: { description: 'Row 8 (variant): → 403 «Tenant is not accepting client access».', signInRow: 8, overrides: [{ paths: ['/auth/email/verify', '/auth/login'], stage: 'handler', fixture: 'auth/errors/tenant-not-accepting-client-access.403.json' }] },
  signin_field_invalid: { description: 'Row 9: /auth/login → the recorded 400 validation body (password MinLength 8), whatever was sent.', signInRow: 9, overrides: [{ paths: ['/auth/login'], stage: 'guard', fixture: 'auth/errors/login-validation.400.json' }] },
  signin_no_connection: { description: 'Row 10: the relay cannot reach the backend for any sign-in endpoint → 502.', signInRow: 10, overrides: [{ paths: ANY_SIGN_IN, stage: 'guard', relayFailure: true }] },
  signin_unknown_business: { description: 'Not a §1.4 row (finding): /auth/login with a business address that names no tenant → 404 «Tenant not found».', overrides: [{ paths: ['/auth/login'], stage: 'handler', fixture: 'auth/errors/tenant-not-found.404.json' }] },
});

/** §1.4 sign-in failure table → scenario(s) and the frozen `SignInFailure` state (net/types.ts). */
export const SIGN_IN_FAILURE_ROWS = Object.freeze([
  { row: 1, response: 'any → 429 auth_rate_limited + Retry-After', state: 'rate_limited', scenarios: ['signin_rate_limited'] },
  { row: 2, response: '/auth/email/verify → 429 too many code attempts', state: 'code_attempts_exhausted', scenarios: ['signin_code_attempts_exhausted'] },
  { row: 3, response: '/auth/email/start|verify → 503 email_login_unavailable | email_delivery_unavailable | email_delivery_failed', state: 'email_login_unavailable', scenarios: ['signin_email_login_unavailable', 'signin_email_delivery_unavailable', 'signin_email_delivery_failed'] },
  { row: 4, response: '/auth/email/verify → 400 email_code_invalid', state: 'code_invalid', scenarios: ['signin_code_invalid'] },
  { row: 5, response: '/auth/email/verify → 400 email_code_expired | email_code_missing', state: 'code_expired', scenarios: ['signin_code_expired', 'signin_code_missing'] },
  { row: 6, response: '/auth/email/verify → 401 email_login_invalid', state: 'email_not_linked', scenarios: ['signin_email_not_linked'] },
  { row: 7, response: '/auth/login → 401 Invalid email or password', state: 'credentials_invalid', scenarios: ['signin_credentials_invalid'] },
  // Row 8 is reached on /auth/email/verify (after a proven code). The same 403 on /auth/login is row 7's
  // «never says which» state: the backend answers it for a known email before checking the password.
  { row: 8, response: '/auth/email/verify → 403 User is not active | Tenant is not accepting client access (on /auth/login: row 7)', state: 'account_unavailable', scenarios: ['signin_account_unavailable', 'signin_tenant_not_accepting'] },
  { row: 9, response: 'any → 400 validation', state: 'field_invalid', scenarios: ['signin_field_invalid'] },
  { row: 10, response: 'any → 502, network error, abort', state: 'no_connection', scenarios: ['signin_no_connection'] },
  { row: 11, response: '/ai/chat → 403 tenant_required', state: 'chat:tenant_required', scenarios: ['chat_tenant_required'] },
]);

// ── the mock API ───────────────────────────────────────────────────────────────────────────────

const ROUTES = new Map([
  ['POST /auth/email/start', { auth: false, dto: START_EMAIL_AUTH_DTO }],
  ['POST /auth/email/verify', { auth: false, dto: VERIFY_EMAIL_AUTH_DTO }],
  ['POST /auth/login', { auth: false, dto: LOGIN_DTO }],
  ['POST /auth/refresh', { auth: false, dto: REFRESH_SESSION_DTO }],
  ['POST /auth/logout', { auth: true, dto: null }],
  ['POST /ai/chat', { auth: true, dto: AI_CORE_CHAT_DTO }],
  ['POST /ai/transcribe', { auth: true, dto: null }],
  ['GET /health', { auth: false, dto: null }],
]);

const RIFF_MESSAGES = {
  empty: 'Голосовая запись пуста.',
  emptyOrLong: 'Голосовая запись пуста или слишком длинная.',
  tooLong: 'Голосовая запись слишком длинная.',
  format: 'Неподдерживаемый формат голосовой записи.',
  corrupt: 'Голосовая запись повреждена.',
  pcm: 'Нужна запись WAV: 16 кГц, mono, PCM16.',
};
const MAX_AUDIO_BYTES = 1024 * 1024;

/** `ai-speech.service.ts` fromBase64 + extractPcm: null when the audio is accepted, else the message. */
export function checkSpeechAudio(raw) {
  if (!raw || typeof raw !== 'string') return RIFF_MESSAGES.empty;
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(',');
  const payload = /^data:/i.test(trimmed) && comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  if (!payload || payload.length > MAX_AUDIO_BYTES * 2) return RIFF_MESSAGES.emptyOrLong;
  const wav = Buffer.from(payload, 'base64');
  if (!wav.length) return RIFF_MESSAGES.empty;
  if (wav.length > MAX_AUDIO_BYTES) return RIFF_MESSAGES.tooLong;
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return RIFF_MESSAGES.format;
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let pcm = null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > wav.length) return RIFF_MESSAGES.corrupt;
    if (id === 'fmt ') {
      if (length < 16) return RIFF_MESSAGES.corrupt;
      format = wav.readUInt16LE(start);
      channels = wav.readUInt16LE(start + 2);
      rate = wav.readUInt32LE(start + 4);
      bits = wav.readUInt16LE(start + 14);
    } else if (id === 'data') {
      pcm = wav.subarray(start, end);
    }
    offset = end + (length % 2);
  }
  if (format !== 1 || channels !== 1 || rate !== 16000 || bits !== 16 || !pcm?.length) return RIFF_MESSAGES.pcm;
  return null;
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

/**
 * The mock backend. `handle({method, path, headers, rawBody, signal})` answers
 * `{status, headers, body}` (body a JSON value), `{relayFailure: true}` or never (hang, until `signal`).
 */
export function createMockApi({ scenario = 'happy', fixturesRoot = API_FIXTURES_DIR, now = () => Date.now() } = {}) {
  if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error(`unknown scenario ${scenario}`);
  let current = scenario;
  let state;
  const requests = [];

  const reset = () => {
    state = {
      challenges: new Map(), // email → { code, consumed, attemptsLeft }
      sessions: new Map(), // sessionId → { tenantSlug, revoked, refreshToken, used:Set, refreshed:boolean }
      access: new Map(), // token → { sessionId, expiresAt, issuedBeforeRefresh }
      refreshIndex: new Map(), // refresh token → sessionId
      seenRequestIds: new Set(),
      turns: 0,
      refreshes: 0,
    };
  };
  reset();

  const def = () => SCENARIOS[current];
  const memberships = () => MOCK_TENANTS.slice(0, def().memberships ?? 1);

  const overrideFor = (apiPath, stage, ctx) => {
    for (const o of def().overrides ?? []) {
      if (o.stage !== stage || !o.paths.includes(apiPath)) continue;
      if (o.when === 'first_attempt' && ctx.requestId && state.seenRequestIds.has(ctx.requestId)) continue;
      if (o.when === 'first_attempt' && !ctx.requestId && apiPath === '/ai/chat') continue;
      if (o.when === 'pre_refresh' && !(ctx.tokenRecord && ctx.tokenRecord.issuedBeforeRefresh)) continue;
      if (o.when === 'with_tenant_slug' && !ctx.tenantSlug) continue;
      if (o.when === 'first_turn' && state.turns > 0) continue;
      return o;
    }
    return null;
  };

  const baseValues = () => {
    const t = now();
    return {
      now: new Date(t).toISOString(),
      expires_at: new Date(t + 300_000).toISOString(),
      refresh_expires_at: new Date(t + 30 * 86_400_000).toISOString(),
      approval_expires_at: new Date(t + 900_000).toISOString(),
      expires_in: ACCESS_TTL_SECONDS,
    };
  };

  const issueSession = (tenant) => {
    const sessionId = randomUUID();
    const accessToken = `mock-at-${randomBytes(24).toString('hex')}`;
    const refreshToken = `maya_rt_${randomUUID()}.${randomBytes(24).toString('hex')}`;
    state.sessions.set(sessionId, { tenantSlug: tenant.slug, revoked: false, refreshToken, used: new Set() });
    state.refreshIndex.set(refreshToken, sessionId);
    state.access.set(accessToken, { sessionId, expiresAt: now() + ACCESS_TTL_SECONDS * 1000, issuedBeforeRefresh: state.refreshes === 0 });
    return {
      ...baseValues(),
      access_token: accessToken,
      refresh_token: refreshToken,
      session_id: sessionId,
      user_id: 'cmockuser00000000000000001',
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      user_name: MOCK_ACCOUNT.userName,
      email: MOCK_ACCOUNT.email,
    };
  };

  /** Values an override fixture may name: the turn's request id, the session's tenant, a fresh approval id. */
  const contextValues = (tokenRecord, requestId) => {
    const session = tokenRecord ? state.sessions.get(tokenRecord.sessionId) : null;
    const tenant = MOCK_TENANTS.find((t) => t.slug === session?.tenantSlug) ?? MOCK_TENANTS[0];
    return { request_id: requestId ?? '', tenant_id: tenant.id, approval_id: `cmockapproval${randomBytes(6).toString('hex')}` };
  };

  const fixture = (rel, values = {}) => respondFixture(rel, { ...baseValues(), ...values }, fixturesRoot);

  const fromOverride = (o, extraValues = {}) => {
    if (o.relayFailure) return { relayFailure: true };
    if (o.hang) return { hang: true };
    if (o.envelopes) extraValues = { ...extraValues, reply: 'Тестовый ответ MAYA (mock) с конвертами виджетов.', envelopes: corpusEnvelopes(fixturesRoot) };
    if (o.fixture) return fixture(o.fixture, { ...extraValues, ...(o.values ?? {}) });
    return null;
  };

  async function handle({ method, path: apiPath, headers = {}, rawBody = null, signal } = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const entry = { seq: requests.length + 1, at: new Date(now()).toISOString(), scenario: current, method, path: apiPath, headerNames: Object.keys(lower).sort() };
    requests.push(entry);
    if (requests.length > 1000) requests.shift();
    const done = (response) => {
      entry.status = response.relayFailure ? 'relay_failure' : response.hang ? 'hang' : response.status;
      entry.fixture = response.fixture ?? null;
      return response;
    };

    // body parser
    const parsed = parseRequestBody(apiPath, lower, rawBody);
    if (parsed.status) return done(fixture(parsed.fixture, parsed.values ?? {}));
    const body = parsed.body;
    entry.body = summarizeBody(body);

    // route
    const route = ROUTES.get(`${method} ${apiPath}`);
    if (!route) return done(fixture('common/route-not-found.404.json', { method, path: `/api${apiPath}` }));
    if (apiPath === '/health') return done({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: { status: 'ok', service: 'maya-chat-shell-mock' } });

    const requestId = isObjectLike(body) && typeof body.requestId === 'string' ? body.requestId : null;
    const tenantSlug = isObjectLike(body) && typeof body.tenantSlug === 'string' ? body.tenantSlug : null;

    // JwtAuthGuard
    let tokenRecord = null;
    if (route.auth) {
      const header = String(lower.authorization ?? '');
      const m = /^Bearer (\S+)$/.exec(header);
      tokenRecord = m ? state.access.get(m[1]) ?? null : null;
      const authOverride = overrideFor(apiPath, 'auth', { tokenRecord, requestId });
      if (authOverride && tokenRecord) return done(fromOverride(authOverride));
      if (!tokenRecord || tokenRecord.expiresAt <= now()) return done(fixture('auth/errors/unauthorized.401.json'));
      const session = state.sessions.get(tokenRecord.sessionId);
      if (!session || session.revoked) return done(fixture('auth/errors/session-not-active.401.json'));
      entry.session = tokenRecord.sessionId.slice(0, 8);
    }

    // guard-stage scenario
    const guard = overrideFor(apiPath, 'guard', { tokenRecord, requestId, tenantSlug });
    if (guard) {
      if (requestId) state.seenRequestIds.add(requestId);
      return done(fromOverride(guard, contextValues(tokenRecord, requestId)));
    }

    // DTO validation
    if (route.dto) {
      const invalid = validateDto(body, route.dto);
      if (invalid) return done({ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: invalid, fixture: null });
    }

    // handler-stage scenario
    const handlerOverride = overrideFor(apiPath, 'handler', { tokenRecord, requestId, tenantSlug });
    if (handlerOverride?.delayMs) await sleep(handlerOverride.delayMs, signal);
    if (handlerOverride && !handlerOverride.delayMs) {
      if (requestId) state.seenRequestIds.add(requestId);
      const response = fromOverride(handlerOverride, contextValues(tokenRecord, requestId));
      if (apiPath === '/ai/chat' && response.status && response.status < 300) state.turns += 1;
      if (response) return done(response);
    }
    if (requestId) state.seenRequestIds.add(requestId);

    return done(defaultHandler(apiPath, body, tokenRecord));
  }

  function defaultHandler(apiPath, body, tokenRecord) {
    switch (apiPath) {
      case '/auth/email/start': {
        const email = body.email.trim().toLowerCase();
        state.challenges.set(email, { code: MOCK_ACCOUNT.debugCode, consumed: false, attemptsLeft: 5 });
        return fixture('auth/email-start.201.json', { email, debug_code: MOCK_ACCOUNT.debugCode });
      }
      case '/auth/email/verify': {
        const email = body.email.trim().toLowerCase();
        const slug = typeof body.tenantSlug === 'string' ? body.tenantSlug.trim().toLowerCase() : '';
        const known = email === MOCK_ACCOUNT.email;
        const challenge = state.challenges.get(email);
        if (slug && !MOCK_TENANTS.some((t) => t.slug === slug))
          return { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: { message: 'Tenant not found', error: 'Not Found', statusCode: 404 }, fixture: null };
        if (!slug && !known) return fixture('auth/errors/email-code-invalid.400.json');
        if (!challenge || challenge.consumed) return fixture('auth/errors/email-code-missing.400.json');
        if (challenge.attemptsLeft <= 0) return fixture('auth/errors/email-too-many-attempts.429.json');
        if (body.code !== challenge.code) {
          challenge.attemptsLeft -= 1;
          if (challenge.attemptsLeft <= 0) return fixture('auth/errors/email-too-many-attempts.429.json');
          const invalid = fixture('auth/errors/email-code-invalid.400.json');
          invalid.body.error.remaining_attempts = challenge.attemptsLeft;
          return invalid;
        }
        const tenants = memberships();
        if (!slug) {
          if (tenants.length > 1)
            return fixture('auth/email-verify.201.select-business.json', { businesses: tenants.map((t) => ({ name: t.name, role: 'business_owner', slug: t.slug })) });
          challenge.consumed = true;
          return fixture('auth/email-verify.201.session.json', issueSession(tenants[0]));
        }
        const tenant = tenants.find((t) => t.slug === slug);
        if (!tenant || !known) return fixture('auth/errors/email-login-invalid.401.json');
        challenge.consumed = true;
        return fixture('auth/email-verify.201.session.json', issueSession(tenant));
      }
      case '/auth/login': {
        const slug = body.tenantSlug ? String(body.tenantSlug).trim().toLowerCase() : '';
        // A slug-less login is the platform-owner path (auth.service.ts:62-64); no mock platform owner exists.
        if (!body.tenantSlug) return fixture('auth/errors/login-invalid-credentials.401.json');
        const tenant = MOCK_TENANTS.find((t) => t.slug === slug);
        if (!tenant) return fixture('auth/errors/tenant-not-found.404.json');
        const member = memberships().some((t) => t.slug === slug);
        if (!member || body.email.toLowerCase() !== MOCK_ACCOUNT.email || body.password !== MOCK_ACCOUNT.password)
          return fixture('auth/errors/login-invalid-credentials.401.json');
        return fixture('auth/login.201.json', issueSession(tenant));
      }
      case '/auth/refresh': {
        const sessionId = state.refreshIndex.get(body.refreshToken);
        const session = sessionId ? state.sessions.get(sessionId) : null;
        if (!session) return fixture('auth/errors/refresh-token-invalid.401.json');
        if (session.revoked) return fixture('auth/errors/session-revoked.401.json');
        if (session.refreshToken !== body.refreshToken) {
          session.revoked = true;
          return fixture('auth/errors/refresh-token-reused.401.json');
        }
        state.refreshes += 1;
        const accessToken = `mock-at-${randomBytes(24).toString('hex')}`;
        const refreshToken = `maya_rt_${randomUUID()}.${randomBytes(24).toString('hex')}`;
        session.refreshToken = refreshToken;
        state.refreshIndex.set(refreshToken, sessionId);
        state.access.set(accessToken, { sessionId, expiresAt: now() + ACCESS_TTL_SECONDS * 1000, issuedBeforeRefresh: false });
        const tenant = MOCK_TENANTS.find((t) => t.slug === session.tenantSlug);
        return fixture('auth/refresh.201.json', { access_token: accessToken, refresh_token: refreshToken, session_id: sessionId, tenant_id: tenant.id });
      }
      case '/auth/logout': {
        const session = state.sessions.get(tokenRecord.sessionId);
        const revoked = session && !session.revoked;
        if (session) session.revoked = true;
        const out = fixture('auth/logout.201.json');
        out.body.revoked = Boolean(revoked);
        return out;
      }
      case '/ai/chat': {
        state.turns += 1;
        return fixture('ai/chat.201.reply.json', { request_id: body.requestId, reply: `Тестовый ответ MAYA (mock), ход ${state.turns}.` });
      }
      case '/ai/transcribe': {
        const message = checkSpeechAudio(isObjectLike(body) ? body.audioBase64 : undefined);
        if (message) return fixture('ai/errors/invalid-speech-audio.400.json', { audio_message: message });
        return fixture('ai/transcribe.201.json', { transcript: MOCK_TRANSCRIPT });
      }
      default:
        throw new Error(`no default handler for ${apiPath}`);
    }
  }

  return {
    handle,
    get scenario() {
      return current;
    },
    setScenario(name) {
      if (!Object.hasOwn(SCENARIOS, name)) throw new Error(`unknown scenario ${name}`);
      current = name;
      state.seenRequestIds.clear();
      state.turns = 0;
    },
    reset() {
      reset();
      requests.length = 0;
    },
    requests: () => requests.slice(),
    stats: () => ({ refreshes: state.refreshes, turns: state.turns, sessions: state.sessions.size }),
  };
}

/** Up to three envelopes of the dev corpus (dev/make-envelopes.mjs); [] when the corpus is absent. */
function corpusEnvelopes(fixturesRoot) {
  const dir = path.join(path.dirname(fixturesRoot), 'envelopes', 'h7', 'invariant');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('kind-') && f.endsWith('.json'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, 3)
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** What the request log keeps of a body: keys, and lengths instead of long strings. */
function summarizeBody(body) {
  if (!isObjectLike(body)) return body === undefined ? null : body;
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  const shrink = (v) => (typeof v === 'string' && v.length > 200 ? { length: v.length, prefix: v.slice(0, 32) } : v);
  if (Array.isArray(body)) return { array: body.length, sha256_16: digest };
  const out = { keys: Object.keys(body), sha256_16: digest };
  for (const [k, v] of Object.entries(body)) {
    if (k === 'password' || k === 'refreshToken') out[k] = { length: String(v).length };
    else if (k === 'messages' && Array.isArray(v)) out.messages = v.map((m) => (isObjectLike(m) ? { role: m.role, length: typeof m.content === 'string' ? m.content.length : null, content: shrink(m.content) } : m));
    else out[k] = shrink(v);
  }
  return out;
}
