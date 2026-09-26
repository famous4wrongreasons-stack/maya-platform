// K5 — the network client. The ONLY `fetch` in the bundle (N-1).
//
// Every request goes to `API_BASE + PATHS.<endpoint>`, and PATHS holds exactly the seven P1
// endpoints. The widget intent and resolve endpoints are not among them: their wire shapes wait on
// R7-E1/E2 and B3, so this module has no intent submission and no resolve.
//
// Typed methods only. Each builds its request body as a fresh literal of the DTO's keys, so no
// extra property (an audience, a tenant, a role or mode value) can ride along on the wire; each
// response passes through an allowlist projection (`project.ts`); every other outcome maps to a
// named failure of `types.ts` (§1.4, D9, D12d, V2-16). No method rejects for an HTTP or network
// outcome, and nothing here holds a session: the bearer arrives through an `Authorizer`, which
// only `session.ts` implements.

import { API_BASE } from './endpoint.ts';
import {
  errorCode,
  errorField,
  errorRetryAfter,
  projectChat,
  projectEmailStart,
  projectEmailVerify,
  projectPasswordLogin,
  projectRefresh,
  projectTranscribe,
  projectWidgetIntent,
  projectWidgetResolve,
} from './project.ts';
import type {
  ChatFailure,
  ChatProjection,
  ChatRequest,
  EmailStartProjection,
  EmailStartRequest,
  EmailVerifyProjection,
  EmailVerifyRequest,
  Outcome,
  PasswordLoginProjection,
  PasswordLoginRequest,
  RefreshProjection,
  RefreshRequest,
  SignedOutReason,
  SignInFailure,
  TranscribeFailure,
  TranscribeProjection,
  TranscribeRequest,
  WidgetFailure,
  WidgetIntentRequest,
  WidgetResolveRequest,
} from './types.ts';

const PATHS = {
  emailStart: '/auth/email/start',
  emailVerify: '/auth/email/verify',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  chat: '/ai/chat',
  transcribe: '/ai/transcribe',
  widgetIntent: '/widgets/intent',
  widgetResolve: '/widgets/resolve',
} as const;

type Endpoint = keyof typeof PATHS;

/** A turn is abandoned 5 s after the relay's own 75 s upstream timeout (`maya-platform-api.php`). */
export const REQUEST_TIMEOUT_MS = 80_000;
/** The voice hook's wire timeout (§1.9). */
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
/** Used only when a 429 carries neither `Retry-After` nor `error.retry_after_seconds`. */
export const DEFAULT_RETRY_AFTER_SEC = 60;

type RequestBody =
  | EmailStartRequest
  | EmailVerifyRequest
  | PasswordLoginRequest
  | RefreshRequest
  | ChatRequest
  | TranscribeRequest
  | WidgetIntentRequest
  | WidgetResolveRequest
  | Readonly<Record<string, never>>;

/** What one request produced, before any endpoint reads it. */
export type Exchange =
  | { readonly kind: 'response'; readonly status: number; readonly retryAfterSec: number | null; readonly body: unknown }
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'aborted' };

const parseBody = (raw: string): unknown => {
  if (raw === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch {
    return undefined;
  }
};

/** `Retry-After` as delta-seconds or an HTTP-date; null when absent or unreadable. */
const parseRetryAfter = (value: string | null): number | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.max(1, Number.parseInt(trimmed, 10));
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? Math.max(1, Math.ceil((at - Date.now()) / 1000)) : null;
};

/**
 * The one request site. A caller's abort and the timeout both abort the fetch; they are told apart,
 * because an abort is the shell's own decision and a timeout is a lost connection.
 */
async function exchange(endpoint: Endpoint, body: RequestBody, bearer: string | null, signal: AbortSignal | null, timeoutMs: number): Promise<Exchange> {
  if (signal !== null && signal.aborted) return { kind: 'aborted' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = (): void => controller.abort();
  if (signal !== null) signal.addEventListener('abort', onAbort, { once: true });
  const headers: Readonly<Record<string, string>> =
    bearer === null ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer };
  const path = PATHS[endpoint];
  try {
    const response = await fetch(API_BASE + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
    const raw = await response.text();
    return { kind: 'response', status: response.status, retryAfterSec: parseRetryAfter(response.headers.get('Retry-After')), body: parseBody(raw) };
  } catch {
    if (timedOut) return { kind: 'timeout' };
    if (signal !== null && signal.aborted) return { kind: 'aborted' };
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
    if (signal !== null) signal.removeEventListener('abort', onAbort);
  }
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;
const retryAfterOf = (ex: { readonly retryAfterSec: number | null; readonly body: unknown }): number =>
  ex.retryAfterSec ?? errorRetryAfter(ex.body) ?? DEFAULT_RETRY_AFTER_SEC;
const fail = <F>(failure: F): { readonly ok: false; readonly failure: F } => ({ ok: false, failure });

// ── sign-in (public endpoints) ─────────────────────────────────────────────────────────────────

type SignInEndpoint = 'emailStart' | 'emailVerify' | 'login';

/** The validation pipe's `error.field` → the sign-in form's field. A switch, so no prototype key can match. */
const signInField = (field: string | null): 'email' | 'password' | 'code' | 'business' | null => {
  switch (field) {
    case 'email':
      return 'email';
    case 'password':
      return 'password';
    case 'code':
      return 'code';
    case 'tenantSlug':
      return 'business';
    default:
      return null;
  }
};

/** The §1.4 sign-in failure table, row by row (V2-16). Every outcome is a named state. */
export function signInFailure(endpoint: SignInEndpoint, ex: Exchange): SignInFailure {
  if (ex.kind !== 'response') return { state: 'no_connection' };
  const code = errorCode(ex.body);
  switch (ex.status) {
    case 429:
      // `email_too_many_attempts` (email-auth.service.ts:200-203, :433-437) carries no Retry-After.
      if (code === 'email_too_many_attempts') return { state: 'code_attempts_exhausted' };
      return { state: 'rate_limited', retryAfterSec: retryAfterOf(ex) };
    case 503:
      if (code === 'email_login_unavailable' || code === 'email_delivery_unavailable' || code === 'email_delivery_failed')
        return { state: 'email_login_unavailable' };
      return { state: 'unexpected_response', status: ex.status };
    case 400: {
      if (code === 'email_code_invalid') return { state: 'code_invalid' };
      if (code === 'email_code_expired' || code === 'email_code_missing') return { state: 'code_expired' };
      if (code === 'validation') {
        const named = signInField(errorField(ex.body));
        if (named !== null) return { state: 'field_invalid', field: named };
      }
      return { state: 'unexpected_response', status: ex.status };
    }
    case 401:
      if (code === 'crm_staff_access_disabled') return { state: 'account_unavailable' };
      if (endpoint === 'login') return { state: 'credentials_invalid' }; // never says which of the three
      if (endpoint === 'emailVerify') return code === 'email_login_invalid' ? { state: 'email_not_linked' } : { state: 'account_unavailable' };
      return { state: 'unexpected_response', status: ex.status };
    case 403:
      // The password path answers «Tenant is not accepting client access» for a KNOWN email before it
      // checks the password (auth.service.ts loginTenantUser): a distinct state would confirm that the
      // account exists. On /auth/login a 403 is therefore the same state as 401 and 404. After a proven
      // email code the account state may be named.
      if (endpoint === 'login') return { state: 'credentials_invalid' };
      return { state: 'account_unavailable' };
    case 404:
      // A mistyped business address: `getTenantBySlugOrThrow` answers 404 «Tenant not found».
      if (endpoint === 'login') return { state: 'credentials_invalid' };
      return { state: 'unexpected_response', status: ex.status };
    case 502:
      return { state: 'no_connection' };
    default:
      return { state: 'unexpected_response', status: ex.status };
  }
}

type SignInResult<T> = Promise<Outcome<T, SignInFailure>>;

export async function emailStart(request: EmailStartRequest, timeoutMs: number = REQUEST_TIMEOUT_MS): SignInResult<EmailStartProjection> {
  const ex = await exchange('emailStart', { email: request.email }, null, null, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectEmailStart(ex.body);
    return value === null ? fail({ state: 'unexpected_response', status: ex.status }) : { ok: true, value };
  }
  return fail(signInFailure('emailStart', ex));
}

/** First verify `{email, code}`; the `select_business` re-verify adds the echoed `tenantSlug`. */
export async function emailVerify(request: EmailVerifyRequest, timeoutMs: number = REQUEST_TIMEOUT_MS): SignInResult<EmailVerifyProjection> {
  const body: EmailVerifyRequest =
    'tenantSlug' in request
      ? { email: request.email, code: request.code, tenantSlug: request.tenantSlug }
      : { email: request.email, code: request.code };
  const ex = await exchange('emailVerify', body, null, null, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectEmailVerify(ex.body);
    return value === null ? fail({ state: 'unexpected_response', status: ex.status }) : { ok: true, value };
  }
  return fail(signInFailure('emailVerify', ex));
}

/**
 * `{tenantSlug, email, password}`, exactly. An empty business address is refused before any
 * request: a slug-less login is the platform-owner path and answers 401 to every business user (V2-6).
 */
export async function passwordLogin(request: PasswordLoginRequest, timeoutMs: number = REQUEST_TIMEOUT_MS): SignInResult<PasswordLoginProjection> {
  if (request.tenantSlug.trim() === '') return fail({ state: 'field_invalid', field: 'business' });
  const ex = await exchange('login', { tenantSlug: request.tenantSlug, email: request.email, password: request.password }, null, null, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectPasswordLogin(ex.body);
    return value === null ? fail({ state: 'unexpected_response', status: ex.status }) : { ok: true, value };
  }
  return fail(signInFailure('login', ex));
}

// ── session upkeep ─────────────────────────────────────────────────────────────────────────────

const SESSION_END_CODES: ReadonlySet<string> = new Set(['refresh_token_invalid', 'refresh_token_reused', 'session_expired', 'session_revoked']);

/**
 * A refresh either grants, ends the session with a named reason, or cannot be completed now.
 * Ended: 400/401/403/404 (the refresh token cannot work again) and a 2xx that is not a grant (the
 * token may already be spent). Unavailable: 429, 5xx, no connection — the session is kept.
 */
export type RefreshResult =
  | { readonly outcome: 'granted'; readonly value: RefreshProjection }
  | { readonly outcome: 'ended'; readonly reason: SignedOutReason }
  | { readonly outcome: 'unavailable'; readonly exchange: Exchange };

export async function refreshSession(request: RefreshRequest, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<RefreshResult> {
  const ex = await exchange('refresh', { refreshToken: request.refreshToken }, null, null, timeoutMs);
  if (ex.kind !== 'response') return { outcome: 'unavailable', exchange: ex };
  if (isSuccess(ex.status)) {
    const value = projectRefresh(ex.body);
    return value === null ? { outcome: 'ended', reason: 'refresh_token_invalid' } : { outcome: 'granted', value };
  }
  if (ex.status === 400 || ex.status === 401 || ex.status === 403 || ex.status === 404) {
    const code = errorCode(ex.body);
    if (code !== null && SESSION_END_CODES.has(code)) {
      const reason: SignedOutReason =
        code === 'refresh_token_reused' ? 'refresh_token_reused' : code === 'session_expired' ? 'session_expired' : code === 'session_revoked' ? 'session_revoked' : 'refresh_token_invalid';
      return { outcome: 'ended', reason };
    }
    return { outcome: 'ended', reason: ex.status === 400 ? 'refresh_token_invalid' : 'session_revoked' };
  }
  return { outcome: 'unavailable', exchange: ex };
}

/** Best effort: revoke the server session. Resolves true when the server answered 2xx. */
export async function logoutSession(bearer: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<boolean> {
  const ex = await exchange('logout', {}, bearer, null, timeoutMs);
  return ex.kind === 'response' && isSuccess(ex.status);
}

// ── authenticated calls ────────────────────────────────────────────────────────────────────────

/** A bearer for one request. `serial` names the grant it came from, so a 401 is matched to it. */
export type Authorization =
  | { readonly kind: 'bearer'; readonly bearer: string; readonly serial: number }
  | { readonly kind: 'signed_out'; readonly reason: SignedOutReason }
  | { readonly kind: 'unavailable'; readonly exchange: Exchange };

/** The session's side of an authenticated call. Implemented by `session.ts`; never leaves `net/`. */
export interface Authorizer {
  /** A bearer valid beyond the refresh leeway, refreshing first when needed (single flight). */
  authorize(): Promise<Authorization>;
  /** The server refused grant `serial`: refresh once (single flight) unless a newer grant exists. */
  reauthorize(serial: number): Promise<Authorization>;
  /** The server refused a grant a refresh had just issued: the session is over. */
  refused(serial: number): void;
}

export interface Timeouts {
  readonly requestMs: number;
  readonly transcribeMs: number;
}

type AuthorizedExchange =
  | Exchange
  | { readonly kind: 'signed_out'; readonly reason: SignedOutReason }
  | { readonly kind: 'unavailable'; readonly exchange: Exchange };

/** Resolves null as soon as `signal` aborts; the work itself is shared and is not cancelled. */
const unlessAborted = <T>(work: Promise<T>, signal: AbortSignal): Promise<T | null> => {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((resolve, reject) => {
    const onAbort = (): void => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
};

/** 401 → refresh once → retry once (§1.4). A second 401 ends the session; it never loops. */
async function authorizedExchange(auth: Authorizer, endpoint: 'chat' | 'transcribe' | 'widgetIntent' | 'widgetResolve', body: RequestBody, signal: AbortSignal, timeoutMs: number): Promise<AuthorizedExchange> {
  const first = await unlessAborted(auth.authorize(), signal);
  if (first === null) return { kind: 'aborted' };
  if (first.kind !== 'bearer') return first;
  const ex = await exchange(endpoint, body, first.bearer, signal, timeoutMs);
  if (ex.kind !== 'response' || ex.status !== 401) return ex;
  const second = await unlessAborted(auth.reauthorize(first.serial), signal);
  if (second === null) return { kind: 'aborted' };
  if (second.kind !== 'bearer') return second;
  const retried = await exchange(endpoint, body, second.bearer, signal, timeoutMs);
  if (retried.kind === 'response' && retried.status === 401) {
    auth.refused(second.serial);
    return { kind: 'signed_out', reason: 'session_revoked' };
  }
  return retried;
}

/** A refresh that could not be completed now, as a turn failure. The turn itself was never sent. */
const chatUnavailable = (ex: Exchange): ChatFailure => {
  if (ex.kind === 'aborted') return { reason: 'aborted' };
  if (ex.kind !== 'response' || ex.status === 502) return { reason: 'no_connection' };
  if (ex.status === 429) return { reason: 'rate_limited', retryAfterSec: retryAfterOf(ex) };
  if (ex.status >= 500) return { reason: 'server_error', status: ex.status };
  return { reason: 'unexpected_response', status: ex.status };
};

/** The §1.4 turn taxonomy for `/ai/chat` (D9, D12d). Retry policy belongs to the conversation. */
export function chatFailure(ex: Exchange): ChatFailure {
  if (ex.kind === 'aborted') return { reason: 'aborted' };
  if (ex.kind !== 'response') return { reason: 'no_connection' };
  const code = errorCode(ex.body);
  switch (ex.status) {
    case 400:
      return { reason: 'outdated_client' };
    case 402:
      return { reason: 'subscription_required' };
    case 403:
      if (code === 'feature_locked') return { reason: 'feature_locked' };
      if (code === 'tenant_required') return { reason: 'tenant_required' };
      return { reason: 'forbidden' };
    case 409:
      return { reason: 'conflict' };
    case 429:
      return { reason: 'rate_limited', retryAfterSec: retryAfterOf(ex) };
    case 502:
      return { reason: 'no_connection' };
    case 503:
      // `modelFailure` (ai-core.service.ts:4732-4737) and `ai_model_unavailable` (ai-core-model.service.ts:609-615).
      if (code !== null && (code.startsWith('ai_model_') || code === 'ai_tool_result_unavailable')) return { reason: 'model_failure' };
      return { reason: 'server_error', status: ex.status };
    default:
      return ex.status >= 500 ? { reason: 'server_error', status: ex.status } : { reason: 'unexpected_response', status: ex.status };
  }
}

const transcribeUnavailable = (ex: Exchange): TranscribeFailure => {
  if (ex.kind === 'aborted') return { reason: 'aborted' };
  if (ex.kind !== 'response' || ex.status === 502) return { reason: 'no_connection' };
  if (ex.status === 429) return { reason: 'rate_limited', retryAfterSec: retryAfterOf(ex) };
  return { reason: 'unexpected_response', status: ex.status };
};

/** `/ai/transcribe` outcomes (§1.9; `ai-speech.service.ts`). */
export function transcribeFailure(ex: Exchange): TranscribeFailure {
  if (ex.kind === 'aborted') return { reason: 'aborted' };
  if (ex.kind !== 'response') return { reason: 'no_connection' };
  const code = errorCode(ex.body);
  switch (ex.status) {
    case 400:
      return code === 'speech_not_recognized' ? { reason: 'not_recognized' } : { reason: 'audio_rejected' };
    case 413:
      return { reason: 'audio_rejected' };
    case 429:
      return { reason: 'rate_limited', retryAfterSec: retryAfterOf(ex) };
    case 502:
      return { reason: 'no_connection' };
    case 503:
      if (code === 'speech_provider_unavailable') return { reason: 'provider_unavailable' };
      return { reason: 'unexpected_response', status: ex.status };
    default:
      return { reason: 'unexpected_response', status: ex.status };
  }
}

/** The two authenticated calls of P1, shaped as `shell/ports.ts` `Transport`. */
export function createTransport(auth: Authorizer, timeouts: Timeouts = { requestMs: REQUEST_TIMEOUT_MS, transcribeMs: TRANSCRIBE_TIMEOUT_MS }) {
  return {
    /** Body keys exactly `{surface, requestId, messages}`, `surface` the constant 'web' (NT3). */
    async chat(request: ChatRequest, signal: AbortSignal): Promise<Outcome<ChatProjection, ChatFailure>> {
      const body: ChatRequest = {
        surface: 'web',
        requestId: request.requestId,
        messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
      };
      const ex = await authorizedExchange(auth, 'chat', body, signal, timeouts.requestMs);
      if (ex.kind === 'signed_out') return fail({ reason: 'signed_out', signedOut: ex.reason });
      if (ex.kind === 'unavailable') return fail(chatUnavailable(ex.exchange));
      if (ex.kind === 'response' && isSuccess(ex.status)) {
        const value = projectChat(ex.body, body.requestId);
        return value === null ? fail({ reason: 'unexpected_response', status: ex.status }) : { ok: true, value };
      }
      return fail(chatFailure(ex));
    },

    /** Body `{audioBase64}` only; no automatic retry beyond the one 401 refresh (§1.9). */
    async transcribe(request: TranscribeRequest, signal: AbortSignal): Promise<Outcome<TranscribeProjection, TranscribeFailure>> {
      const ex = await authorizedExchange(auth, 'transcribe', { audioBase64: request.audioBase64 }, signal, timeouts.transcribeMs);
      if (ex.kind === 'signed_out') return fail({ reason: 'signed_out', signedOut: ex.reason });
      if (ex.kind === 'unavailable') return fail(transcribeUnavailable(ex.exchange));
      if (ex.kind === 'response' && isSuccess(ex.status)) {
        const value = projectTranscribe(ex.body);
        if (value === null) return fail({ reason: 'unexpected_response', status: ex.status });
        return value.transcript.trim() === '' ? fail({ reason: 'not_recognized' }) : { ok: true, value };
      }
      return fail(transcribeFailure(ex));
    },

    async widgetIntent(request: WidgetIntentRequest, signal: AbortSignal) {
      const body: WidgetIntentRequest = {
        contract: 'maya.widget.intent.submission/1',
        widget_id: request.widget_id,
        intent_token: request.intent_token,
        inputs: request.inputs,
        client_nonce: request.client_nonce,
        profile_id: request.profile_id,
        ...(request.client_emitted_at === undefined ? {} : { client_emitted_at: request.client_emitted_at }),
      };
      const ex = await authorizedExchange(auth, 'widgetIntent', body, signal, timeouts.requestMs);
      return widgetOutcome(ex, projectWidgetIntent);
    },

    async resolveWidgets(request: WidgetResolveRequest, signal: AbortSignal) {
      const body: WidgetResolveRequest = {
        thread_page: {
          limit: request.thread_page.limit,
          ...(request.thread_page.before === undefined ? {} : { before: request.thread_page.before }),
        },
      };
      const ex = await authorizedExchange(auth, 'widgetResolve', body, signal, timeouts.requestMs);
      return widgetOutcome(ex, projectWidgetResolve);
    },
  };
}

const widgetOutcome = <T>(ex: AuthorizedExchange, project: (body: unknown) => T | null): Outcome<T, WidgetFailure> => {
  if (ex.kind === 'signed_out') return fail({ reason: 'signed_out', signedOut: ex.reason });
  if (ex.kind === 'unavailable') return fail({ reason: 'no_connection' });
  if (ex.kind !== 'response') return fail({ reason: 'no_connection' });
  if (isSuccess(ex.status)) {
    const value = project(ex.body);
    return value === null ? fail({ reason: 'unexpected_response' }) : { ok: true, value };
  }
  if (ex.status === 401 || ex.status === 403) return fail({ reason: 'forbidden' });
  if (ex.status >= 500) return fail({ reason: 'server_error' });
  return fail({ reason: 'unexpected_response' });
};
