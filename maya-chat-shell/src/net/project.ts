// K5 — allowlist projections of the verified backend responses (D12c).
//
// A projection builds a fresh object from the keys it lists and names no dropped key. Everything
// else a response carries (`session`, `token_type`, `user.role`, `user.id`, every `tenant.id`,
// `tenant.slug` and `tenant.status`, `businesses[].role`, `debug_code`, `action.approval`,
// `tools_used`, `grounding`, `brain`, `widget`, `widget_data`) never enters the shell.
//
// Reads use own data properties only: no prototype walk and no getter is ever invoked.
// A response that does not have the verified shape projects to null; the caller names that state.

import type {
  BusinessChoice,
  ChatProjection,
  ChatWidgetResolution,
  EmailStartProjection,
  EmailVerifyProjection,
  PasswordLoginProjection,
  RefreshProjection,
  SessionGrant,
  SignInDisplay,
  TranscribeProjection,
  WidgetIntentProjection,
  WidgetResolveProjection,
} from './types.ts';

/** One own data property of a parsed JSON value, or undefined. */
const own = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !('value' in descriptor)) return undefined;
  const held: unknown = descriptor.value;
  return held;
};

const isRecord = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const filled = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// ── error bodies ───────────────────────────────────────────────────────────────────────────────

/** `error.code` of a `{message, error: {code, …}}` body; null for Nest's `{message, error: 'Unauthorized'}`. */
export const errorCode = (body: unknown): string | null => text(own(own(body, 'error'), 'code'));

/** `error.field` of the global validation pipe's 400 body (`configure-http-app.ts`). */
export const errorField = (body: unknown): string | null => text(own(own(body, 'error'), 'field'));

/** `error.retry_after_seconds` of `AuthRateLimitException`'s body (`auth-rate-limit.exception.ts`). */
export const errorRetryAfter = (body: unknown): number | null => {
  const seconds = own(own(body, 'error'), 'retry_after_seconds');
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

// ── sign-in and session ────────────────────────────────────────────────────────────────────────

/** `POST /auth/email/start` → `{next_step}` only; `debug_code`, `email`, `delivery`, `expires_at` dropped. */
export const projectEmailStart = (body: unknown): EmailStartProjection | null =>
  own(body, 'next_step') === 'verify_email_code' ? { next_step: 'verify_email_code' } : null;

/** The token pair of `buildSessionTokens` (`auth-session.service.ts`); `token_type` and `session` dropped. */
export const projectGrant = (body: unknown): SessionGrant | null => {
  const accessToken = filled(own(body, 'access_token'));
  const refreshToken = filled(own(body, 'refresh_token'));
  const expiresIn = own(body, 'expires_in');
  const refreshExpiresAt = filled(own(body, 'refresh_expires_at'));
  if (accessToken === null || refreshToken === null || refreshExpiresAt === null) return null;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return { accessToken, expiresInSec: expiresIn, refreshToken, refreshExpiresAt };
};

/**
 * The identity bar: `user.name` and the tenant's `name`. `serializeUser` answers `name: null` for a
 * user without a stored name; that projects to '' (the frozen type holds a string), never to an id.
 */
const projectDisplay = (user: unknown, tenant: unknown): SignInDisplay => ({
  userName: text(own(user, 'name')) ?? '',
  tenantName: filled(own(tenant, 'name')),
});

/**
 * `POST /auth/email/verify`.
 *   one business  → tokens + TOP-LEVEL `tenant` + `user` (`email-auth.service.ts:504-508`, `:272-276`)
 *   several       → `{ok, next_step:'select_business', businesses:[{name, role, slug}]}` (`:472-479`);
 *                   `role` is dropped, `slug` kept as the opaque handle echoed at re-verify.
 */
export const projectEmailVerify = (body: unknown): EmailVerifyProjection | null => {
  if (own(body, 'next_step') === 'select_business') {
    const listed = own(body, 'businesses');
    if (!Array.isArray(listed) || listed.length === 0) return null;
    const businesses: BusinessChoice[] = [];
    for (const entry of listed) {
      const name = text(own(entry, 'name'));
      const slug = filled(own(entry, 'slug'));
      if (name === null || slug === null) return null;
      businesses.push({ name, slug });
    }
    return { next_step: 'select_business', businesses };
  }
  const grant = projectGrant(body);
  const user = own(body, 'user');
  if (grant === null || !isRecord(user)) return null;
  return { next_step: 'signed_in', grant, display: projectDisplay(user, own(body, 'tenant')) };
};

/**
 * `POST /auth/login` → tokens + `session` + `user`, the tenant NESTED at `user.tenant`
 * (`auth.service.ts:70-77`, `users.service.ts` `serializeUser`); there is no top-level tenant.
 */
export const projectPasswordLogin = (body: unknown): PasswordLoginProjection | null => {
  const grant = projectGrant(body);
  const user = own(body, 'user');
  if (grant === null || !isRecord(user)) return null;
  return { grant, display: projectDisplay(user, own(user, 'tenant')) };
};

/** `POST /auth/refresh` → tokens + `session` only (`auth-session.service.ts:222-228`); display stays. */
export const projectRefresh = (body: unknown): RefreshProjection | null => {
  const grant = projectGrant(body);
  return grant === null ? null : { grant };
};

// ── conversation ───────────────────────────────────────────────────────────────────────────────

/**
 * `POST /ai/chat` (`ai-core.service.ts` `complete`) → `{request_id, reply, action_status}`.
 * `action_status` copies `action.status` only — `action.approval` is never read (V2-5). A response
 * whose `request_id` is not the id this request sent is not this turn's reply.
 */
export const projectChat = (body: unknown, requestId: string): ChatProjection | null => {
  const echoed = text(own(body, 'request_id'));
  const reply = text(own(body, 'reply'));
  if (echoed === null || echoed !== requestId || reply === null) return null;
  const resolution = projectChatResolution(own(body, 'resolution'));
  if (resolution === INVALID_RESOLUTION) return null;
  return {
    request_id: echoed,
    reply,
    action_status: text(own(own(body, 'action'), 'status')),
    resolution,
  };
};

const INVALID_RESOLUTION = Symbol('invalid_chat_widget_resolution');

/**
 * B4's wire boundary. It does not validate business facts or the HMAC: H7 and the server verifier
 * retain those duties. It only proves enough of the certified envelope root to make ingestion total,
 * then keeps the exact server object so the shell cannot manufacture or repair authority bytes.
 */
const projectChatResolution = (
  value: unknown,
): ChatWidgetResolution | null | typeof INVALID_RESOLUTION => {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || own(value, 'matched') !== true) return INVALID_RESOLUTION;
  const receipt = own(value, 'receipt');
  const dismiss = own(value, 'dismiss_widget_id');
  if (!isRecord(receipt) || (dismiss !== null && typeof dismiss !== 'string'))
    return INVALID_RESOLUTION;
  const widgetId = filled(own(receipt, 'widget_id'));
  const envelopeSeal = filled(own(receipt, 'envelope_seal'));
  const envelope = own(receipt, 'envelope');
  if (
    widgetId === null ||
    envelopeSeal === null ||
    !isIngestibleEnvelope(envelope) ||
    own(envelope, 'widget_id') !== widgetId ||
    own(own(envelope, 'integrity'), 'envelope_seal') !== envelopeSeal
  )
    return INVALID_RESOLUTION;
  return {
    matched: true,
    receipt: {
      widget_id: widgetId,
      envelope_seal: envelopeSeal,
      envelope,
    },
    dismiss_widget_id: dismiss,
  };
};

export const isIngestibleEnvelope = (value: unknown): value is ChatWidgetResolution['receipt']['envelope'] => {
  if (!isRecord(value) || own(value, 'contract') !== 'maya.widget.envelope/1') return false;
  if (filled(own(value, 'widget_id')) === null || filled(own(value, 'tenant_id')) === null) return false;
  if (!Array.isArray(own(value, 'intents')) || !Array.isArray(own(value, 'limitations'))) return false;
  const requiredRecords = [
    'correlation',
    'source',
    'origin',
    'authority',
    'body',
    'provenance',
    'lifecycle',
    'presentation',
    'render',
    'integrity',
  ];
  if (requiredRecords.some((key) => !isRecord(own(value, key)))) return false;
  const lifecycle = own(value, 'lifecycle');
  const presentation = own(value, 'presentation');
  const render = own(value, 'render');
  const integrity = own(value, 'integrity');
  return (
    typeof own(value, 'kind') === 'string' &&
    Number.isInteger(own(value, 'body_version')) &&
    filled(own(lifecycle, 'state')) !== null &&
    filled(own(lifecycle, 'expires_at')) !== null &&
    filled(own(lifecycle, 'input_lock')) !== null &&
    filled(own(lifecycle, 'on_expiry')) !== null &&
    isRecord(own(presentation, 'a11y')) &&
    filled(own(presentation, 'density')) !== null &&
    Array.isArray(own(render, 'intents_withheld')) &&
    Array.isArray(own(render, 'body_reductions')) &&
    filled(own(render, 'render_tier')) !== null &&
    filled(own(integrity, 'body_hash')) !== null &&
    filled(own(integrity, 'envelope_seal')) !== null
  );
};

const INTENT_OUTCOMES = new Set(['terminate', 'refuse', 'expired', 'superseded']);
const RECEIPT_OUTCOMES = new Set(['ACCEPTED', 'REFUSED', 'NEEDS_CONFIRMATION', 'NEEDS_VERIFICATION']);

export const projectWidgetIntent = (body: unknown): WidgetIntentProjection | null => {
  if (!isRecord(body) || own(body, 'contract') !== 'maya.widget.intent/1') return null;
  const outcome = own(body, 'outcome');
  const code = own(body, 'code');
  const next = own(body, 'next_envelope');
  const receipt = own(body, 'receipt_outcome');
  if (typeof outcome !== 'string' || !INTENT_OUTCOMES.has(outcome)) return null;
  if (code !== null && typeof code !== 'string') return null;
  if (next !== null && !isIngestibleEnvelope(next)) return null;
  if (receipt !== null && (typeof receipt !== 'string' || !RECEIPT_OUTCOMES.has(receipt))) return null;
  return {
    outcome: outcome as WidgetIntentProjection['outcome'],
    code: code as string | null,
    next_envelope: next as WidgetIntentProjection['next_envelope'],
    receipt_outcome: receipt as WidgetIntentProjection['receipt_outcome'],
  };
};

const TERMINAL_OUTCOMES = new Set([
  'SUBMITTED', 'CONFIRMED', 'NOT_CONFIRMED', 'EXPIRED_UNUSED', 'SUPERSEDED', 'CANCELLED', 'DELIVERED_ONLY',
]);

export const projectWidgetResolve = (body: unknown): WidgetResolveProjection | null => {
  if (!isRecord(body) || own(body, 'contract') !== 'maya.widget.resolve/1') return null;
  const raw = own(body, 'widgets');
  const tenantBound = own(body, 'tenant_bound');
  if (!Array.isArray(raw) || typeof tenantBound !== 'boolean') return null;
  const widgets: WidgetResolveProjection['widgets'][number][] = [];
  for (const item of raw) {
    if (!isRecord(item) || !isIngestibleEnvelope(own(item, 'envelope'))) return null;
    const lines = own(item, 'terminal_lines');
    if (!Array.isArray(lines)) return null;
    const terminalLines = [] as Array<{ outcome: WidgetResolveProjection['widgets'][number]['terminal_lines'][number]['outcome']; text: string; action_receipt_ref: string | null }>;
    for (const line of lines) {
      if (!isRecord(line)) return null;
      const terminalOutcome = own(line, 'outcome');
      const textValue = own(line, 'text');
      const actionRef = own(line, 'action_receipt_ref');
      if (typeof terminalOutcome !== 'string' || !TERMINAL_OUTCOMES.has(terminalOutcome) || typeof textValue !== 'string') return null;
      if (actionRef !== null && typeof actionRef !== 'string') return null;
      if ((terminalOutcome === 'CONFIRMED') !== (typeof actionRef === 'string' && actionRef.length > 0)) return null;
      terminalLines.push({ outcome: terminalOutcome as typeof terminalLines[number]['outcome'], text: textValue, action_receipt_ref: actionRef as string | null });
    }
    widgets.push({
      envelope: own(item, 'envelope') as WidgetResolveProjection['widgets'][number]['envelope'],
      terminal_lines: terminalLines,
      reread_intent: null,
    });
  }
  return { widgets, tenant_bound: tenantBound };
};

/** `POST /ai/transcribe` → `{transcript}` (`ai-speech.service.ts:120`). */
export const projectTranscribe = (body: unknown): TranscribeProjection | null => {
  const transcript = text(own(body, 'transcript'));
  return transcript === null ? null : { transcript };
};
