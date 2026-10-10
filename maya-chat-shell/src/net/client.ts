// K5 — the network client. The ONLY `fetch` in the bundle (N-1).
//
// Every request uses the closed PATHS allowlist. History erasure alone adds a validated UUID
// and the fixed /erasure suffix; its path construction is checked by the build ratchet.
//
// Typed methods only. Each builds its request body as a fresh literal of the DTO's keys, so no
// extra property (an audience, a tenant, a role or mode value) can ride along on the wire; each
// response passes through an allowlist projection (`project.ts`); every other outcome maps to a
// named failure of `types.ts` (§1.4, D9, D12d, V2-16). No method rejects for an HTTP or network
// outcome, and nothing here holds a session: the bearer arrives through an `Authorizer`, which
// only `session.ts` implements.

import { projectPersonalBranches, projectPersonalChoices, projectPersonalSlots, projectPersonalPreview, projectPersonalResults } from './personal.ts';
import type { PersonalSelection, PersonalFailure } from './types.ts';
import { goodsPhotoQuery, projectGoodsPhotoContext, projectGoodsPhotoPreview, projectGoodsPhotoSearch, projectGoodsPhotoItem, projectGoodsPhotoProposal, projectGoodsPhotoReview } from './goods-photo.ts';
import type { GoodsPhotoFile, GoodsPhotoFailure, GoodsPhotoProposal, GoodsPhotoRequestContext, GoodsPhotoResponse } from './types.ts';
import { crmSetupBody, crmSetupKey, crmConfigVersion, projectCrmSetup, projectCrmOperation } from './crm-setup.ts';
import type { CrmSetupBody, CrmSetupInstall, CrmSetupSnapshot, CrmSetupFailure, CrmOperationLocator, CrmOperationStatus, CrmSetupCompletion } from './types.ts';
import { projectTrialActivation, projectTrialSignup, trialSignupBody } from './onboarding.ts';
import type { OnboardingInput, OnboardingFailure, TrialActivationProjection, TrialSignupProjection } from './types.ts';
import { API_BASE } from './endpoint.ts';
import {
  errorCode,
  errorField,
  errorRetryAfter,
  projectBusinessSearch,
  projectChat,
  projectConversationHistory,
  projectHistoryErasure,
  projectHistoryErasureRequest,
  projectEmailStart,
  projectEmailVerify,
  projectPasswordLogin,
  projectRefresh,
  projectTelegramComplete,
  projectTelegramStart,
  projectTranscribe,
  projectWidgetIntent,
  projectWidgetResolve,
} from './project.ts';
import type {
  BusinessSearchProjection,
  ChatFailure,
  ChatProjection,
  ConversationHistoryProjection,
  HistoryErasureCompletion,
  HistoryErasureFailure,
  HistoryErasureRequest,
  ChatRequest,
  EmailStartProjection,
  EmailStartRequest,
  EmailVerifyProjection,
  EmailVerifyRequest,
  FirstRunFailure,
  Outcome,
  PasswordLoginProjection,
  PasswordLoginRequest,
  RefreshProjection,
  RefreshRequest,
  SignedOutReason,
  SignInFailure,
  TelegramCompleteProjection,
  TelegramStartProjection,
  TranscribeFailure,
  TranscribeProjection,
  TranscribeRequest,
  WidgetFailure,
  WidgetIntentRequest,
  WidgetResolveRequest,
} from './types.ts';

const PATHS = {
  businessSearch: '/mobile/pwa/search',
  telegramStart: '/auth/oauth/telegram/start',
  telegramComplete: '/auth/oauth/telegram/complete',
  emailStart: '/auth/email/start',
  emailVerify: '/auth/email/verify',
  login: '/auth/login',
  onboardingActivation: '/onboarding/trial-activations',
  onboardingSignup: '/onboarding/trial',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  chat: '/ai/chat',
  conversation: '/ai/conversation',
  historyErasure: '/privacy/conversations',
  transcribe: '/ai/transcribe',
  widgetIntent: '/widgets/intent',
  widgetResolve: '/widgets/resolve',
  crmSetupStatus: '/integrations/crm',
  crmSetupStage: '/integrations/crm/connect',
  crmSetupActivate: '/integrations/crm/activate',
  crmSetupOperation: '/integrations/crm/operation',
  personalBranches: '/branches',
  personalServices: '/services',
  personalStaff: '/staff',
  personalSlots: '/available-slots',
  personalPreview: '/personal-client/appointments/preview',
  personalResults: '/personal-client/appointments/results',
  personalCreate: '/personal-client/appointments',
  goodsPhotoPreview: '/ai/goods/photo-preview',
  goodsPhotoSearch: '/ai/goods/search',
  goodsPhotoItem: '/ai/goods/item-read',
  goodsPhotoReview: '/ai/goods/receipt-review',
} as const;

type Endpoint = keyof typeof PATHS;

/** A turn is abandoned 5 s after the relay's own 75 s upstream timeout (`maya-platform-api.php`). */
export const REQUEST_TIMEOUT_MS = 80_000;
/** The voice hook's wire timeout (§1.9). */
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
/** Used only when a 429 carries neither `Retry-After` nor `error.retry_after_seconds`. */
export const DEFAULT_RETRY_AFTER_SEC = 60;

type RequestBody =
  | { readonly source: 'web' }
  | { readonly trialActivationToken: string; readonly name: string; readonly slug: string; readonly ownerEmail: string; readonly password: string; readonly branchName: string; readonly branchTimezone: string; readonly calendarSource: 'external' }
  | FormData
  | (GoodsPhotoRequestContext & { readonly query: string })
  | (GoodsPhotoRequestContext & { readonly goods_id: string })
  | (GoodsPhotoRequestContext & { readonly proposal: GoodsPhotoProposal })
  | PersonalSelection
  | CrmSetupBody
  | { readonly expectedVersion: string }
  | EmailStartRequest
  | EmailVerifyRequest
  | PasswordLoginRequest
  | RefreshRequest
  | ChatRequest
  | Pick<HistoryErasureRequest, 'requestId'>
  | TranscribeRequest
  | WidgetIntentRequest
  | WidgetResolveRequest
  | TelegramStartRequest
  | TelegramCompleteRequest
  | Readonly<Record<string, never>>;

/** `CompleteOauthLoginDto`, minus `branchId`: the shell has no branch to name and never invents one. */
interface TelegramCompleteRequest {
  readonly state: string;
  readonly code: string;
}

/** `StartOauthLoginDto`, web or native. `redirectUri` is omitted for iOS: the server owns that one. */
type TelegramStartRequest =
  | { readonly tenantSlug: string; readonly platform: 'ios' }
  | { readonly tenantSlug: string; readonly platform: 'web'; readonly redirectUri: string };

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
async function exchange(endpoint: Endpoint, body: RequestBody, bearer: string | null, signal: AbortSignal | null, timeoutMs: number, search: string | null = null, slots: { date: string; serviceId: string; staffId: string; branchId?: string } | null = null, erasureConversationId: string = '', idempotencyKey: string = '', crmLocator: CrmOperationLocator | null = null): Promise<Exchange> {
  if (endpoint === 'historyErasure' && (erasureConversationId.length !== 36 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(erasureConversationId))) return { kind: 'aborted' };
  if (signal !== null && signal.aborted) return { kind: 'aborted' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = (): void => controller.abort();
  if (signal !== null) signal.addEventListener('abort', onAbort, { once: true });
  // A `search` term makes this a GET that carries the term in the query string, and a GET sends no
  // body and declares no content type — which also keeps it a simple request, with no preflight.
  const reading = endpoint === 'crmSetupStatus' || endpoint === 'crmSetupOperation' || search !== null || endpoint === 'conversation' || endpoint === 'personalBranches' || endpoint === 'personalServices' || endpoint === 'personalStaff' || endpoint === 'personalSlots' || endpoint === 'personalResults';
  const auth: Readonly<Record<string, string>> = bearer === null ? {} : { Authorization: 'Bearer ' + bearer };
  const personal = endpoint === 'personalPreview' || endpoint === 'personalResults' || endpoint === 'personalCreate';
  const context = personal ? { 'X-Maya-Authority-Context': 'personal_client' } : {};
  const multipart = endpoint === 'goodsPhotoPreview' && body instanceof FormData;
  const idempotency = endpoint === 'crmSetupStage' || endpoint === 'crmSetupActivate' ? { 'Idempotency-Key': idempotencyKey } : {};
  const headers: Readonly<Record<string, string>> = { ...auth, ...context, ...idempotency, ...(reading || multipart ? {} : { 'Content-Type': 'application/json' }) };
  const path = endpoint === 'historyErasure' ? `${PATHS.historyErasure}/${encodeURIComponent(erasureConversationId)}/erasure` : PATHS[endpoint];
  try {
    const response = await fetch(API_BASE + path + (crmLocator !== null ? `?operation=${encodeURIComponent(crmLocator.operation)}&requestId=${encodeURIComponent(crmLocator.requestId)}` : slots !== null ? slots.branchId === undefined ? `?date=${encodeURIComponent(slots.date)}&serviceIds=${encodeURIComponent(slots.serviceId)}&staffId=${encodeURIComponent(slots.staffId)}` : `?date=${encodeURIComponent(slots.date)}&serviceIds=${encodeURIComponent(slots.serviceId)}&staffId=${encodeURIComponent(slots.staffId)}&branchId=${encodeURIComponent(slots.branchId)}` : search === null ? '' : `?q=${encodeURIComponent(search)}`), {
      method: reading ? 'GET' : 'POST',
      headers,
      body: reading ? null : multipart ? body as FormData : JSON.stringify(body),
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

/** Public canonical onboarding; no auth refresh, automatic retry, provider or feature grants. */
export async function createTrialActivation(signal: AbortSignal, timeoutMs: number): Promise<Outcome<TrialActivationProjection, OnboardingFailure>> {
  const ex = await exchange('onboardingActivation', { source: 'web' }, null, signal, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectTrialActivation(ex.body);
    return value === null ? fail({ reason: 'unavailable' }) : { ok: true, value };
  }
  if (ex.kind === 'response' && ex.status === 403 && errorCode(ex.body) === 'self_serve_signup_disabled') return fail({ reason: 'closed' });
  if (ex.kind === 'response' && ex.status === 429) return fail({ reason: 'rate_limited', retryAfterSec: ex.retryAfterSec ?? errorRetryAfter(ex.body) ?? DEFAULT_RETRY_AFTER_SEC });
  return fail({ reason: 'unavailable' });
}

export async function createTrialSignup(input: OnboardingInput, activation: TrialActivationProjection, signal: AbortSignal, timeoutMs: number): Promise<Outcome<TrialSignupProjection, OnboardingFailure>> {
  const body = trialSignupBody(input, activation.token);
  if (body === null) return fail({ reason: 'uncertain' });
  const ex = await exchange('onboardingSignup', body, null, signal, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectTrialSignup(ex.body, input, activation);
    if (value !== null) return { ok: true, value };
  }
  // Bootstrap commits before session issuance. Even a failure can mean the business exists.
  return fail({ reason: 'uncertain' });
}

// ── the first run: find a business, then hand the browser to Telegram ─────────────────────

/** The server's minimum (`public_business_search_invalid`); refused here so a 400 is never spent on it. */
export const SEARCH_MIN_CHARS = 2;

/** Both first-run endpoints are public, so no outcome may distinguish an account that exists. */
function firstRunFailure(ex: Exchange): FirstRunFailure {
  if (ex.kind !== 'response') return { state: 'no_connection' };
  const code = errorCode(ex.body);
  switch (ex.status) {
    case 429:
      return { state: 'rate_limited', retryAfterSec: retryAfterOf(ex) };
    case 400:
      if (code === 'public_business_search_invalid') return { state: 'term_too_short' };
      // `social_state_invalid` covers all four ways the server can no longer honour a login: never
      // issued, wrong provider, expired, or ALREADY CONSUMED. The last is the server's own replay
      // refusal — `claimFlowState` is a conditional update, so a second completion of one login
      // loses the race by construction and arrives here.
      // `social_exchange_failed` / `social_token_invalid`: the provider would not honour the code.
      // Every one of these restarts the login, because the state was spent before the exchange ran.
      if (code === 'social_state_invalid' || code === 'social_exchange_failed' || code === 'social_token_invalid') return { state: 'login_expired' };
      return { state: 'unexpected_response', status: ex.status };
    case 401:
      if (code === 'crm_staff_access_disabled') return { state: 'account_unavailable' };
      // The provider would not exchange the code. Nothing here can be retried; the login restarts.
      return { state: 'login_expired' };
    case 403:
      if (code === 'social_phone_required') return { state: 'phone_required' };
      if (code === 'self_registration_disabled' || code === 'trial_client_registration_disabled' || code === 'platform_tenant_not_bookable')
        return { state: 'registration_closed' };
      return { state: 'business_unavailable' };
    case 409:
      // `social_identity_conflict`, `social_business_link_required`, `social_business_access_suspended`:
      // all three mean this identity cannot become a session here, and telling them apart would
      // confirm which accounts exist.
      return { state: 'account_unavailable' };
    case 404:
      // A business that stopped accepting client access, and one that never existed, are one state.
      return { state: 'business_unavailable' };
    case 502:
      return { state: 'no_connection' };
    case 503:
      if (code === 'social_native_callback_unavailable' || code === 'social_login_unavailable' || code === 'social_provider_disabled' || code === 'social_provider_unavailable')
        return { state: 'telegram_unavailable' };
      return { state: 'unexpected_response', status: ex.status };
    default:
      return { state: 'unexpected_response', status: ex.status };
  }
}

type FirstRunResult<T> = Promise<Outcome<T, FirstRunFailure>>;

/** `GET /mobile/pwa/search?q=` — the canonical public finder. No bearer: nothing here is a session. */
export async function searchBusinesses(term: string, signal: AbortSignal | null = null, timeoutMs: number = REQUEST_TIMEOUT_MS): FirstRunResult<BusinessSearchProjection> {
  const trimmed = term.trim();
  if (trimmed.length < SEARCH_MIN_CHARS) return fail({ state: 'term_too_short' });
  const ex = await exchange('businessSearch', {}, null, signal, timeoutMs, trimmed);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectBusinessSearch(ex.body);
    return value === null ? fail({ state: 'unexpected_response', status: ex.status }) : { ok: true, value };
  }
  return fail(firstRunFailure(ex));
}

/**
 * `POST /auth/oauth/telegram/start`. The web client must name its own callback and the server
 * checks it against `OAUTH_ALLOWED_REDIRECT_URIS`; the native client names none, because
 * `OAUTH_NATIVE_REDIRECT_URI` is the server's to choose. The returned URL is Telegram's own
 * (`projectTelegramStart` proves it) and the caller navigates to it.
 */
export async function telegramStart(tenantSlug: string, webCallbackUrl: string | null, timeoutMs: number = REQUEST_TIMEOUT_MS): FirstRunResult<TelegramStartProjection> {
  const body: TelegramStartRequest =
    webCallbackUrl === null ? { tenantSlug, platform: 'ios' } : { tenantSlug, platform: 'web', redirectUri: webCallbackUrl };
  const ex = await exchange('telegramStart', body, null, null, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectTelegramStart(ex.body);
    return value === null ? fail({ state: 'unexpected_response', status: ex.status }) : { ok: true, value };
  }
  return fail(firstRunFailure(ex));
}

/**
 * `POST /auth/oauth/telegram/complete`, body exactly `{state, code}`. The tenant is NOT sent and
 * cannot be: the server reads it from the flow the state names (`flow.tenant.id`), so no client —
 * honest or otherwise — can land a session in a business other than the one the login was started
 * for. This is the whole of the client's part in completing a login.
 */
export async function telegramComplete(state: string, code: string, timeoutMs: number = REQUEST_TIMEOUT_MS): FirstRunResult<TelegramCompleteProjection> {
  const ex = await exchange('telegramComplete', { state, code }, null, null, timeoutMs);
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectTelegramComplete(ex.body);
    return value === null ? fail({ state: 'unexpected_response', status: ex.status }) : { ok: true, value };
  }
  return fail(firstRunFailure(ex));
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
async function authorizedExchange(auth: Authorizer, endpoint: 'crmSetupStatus' | 'crmSetupStage' | 'crmSetupActivate' | 'crmSetupOperation' | 'chat' | 'conversation' | 'historyErasure' | 'transcribe' | 'widgetIntent' | 'widgetResolve' | 'personalBranches' | 'personalServices' | 'personalStaff' | 'personalSlots' | 'personalPreview' | 'personalResults' | 'personalCreate' | 'goodsPhotoPreview' | 'goodsPhotoSearch' | 'goodsPhotoItem' | 'goodsPhotoReview', body: RequestBody, signal: AbortSignal, timeoutMs: number, slots: { date: string; serviceId: string; staffId: string; branchId?: string } | null = null, erasureConversationId: string = '', idempotencyKey: string = '', crmLocator: CrmOperationLocator | null = null): Promise<AuthorizedExchange> {
  const first = await unlessAborted(auth.authorize(), signal);
  if (first === null) return { kind: 'aborted' };
  if (first.kind !== 'bearer') return first;
  const ex = await exchange(endpoint, body, first.bearer, signal, timeoutMs, null, slots, erasureConversationId, idempotencyKey, crmLocator);
  if (ex.kind !== 'response' || ex.status !== 401) return ex;
  const second = await unlessAborted(auth.reauthorize(first.serial), signal);
  if (second === null) return { kind: 'aborted' };
  if (second.kind !== 'bearer') return second;
  const retried = await exchange(endpoint, body, second.bearer, signal, timeoutMs, null, slots, erasureConversationId, idempotencyKey, crmLocator);
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

const personalBody = (s: PersonalSelection): PersonalSelection => ({ staffId: s.staffId, serviceIds: [...s.serviceIds], start: s.start, ...(s.branchId === undefined ? {} : { branchId: s.branchId }) });
const personalOutcome = <T>(ex: AuthorizedExchange, project: (raw: unknown) => T | null): Outcome<T, PersonalFailure> => {
  if (ex.kind === 'response' && isSuccess(ex.status)) { const value = project(ex.body); return value === null ? fail({ reason: 'unavailable' }) : { ok: true, value }; }
  if (ex.kind === 'aborted') return fail({ reason: 'aborted' });
  if (ex.kind === 'signed_out' || (ex.kind === 'response' && [401, 403].includes(ex.status))) return fail({ reason: 'forbidden' });
  if (ex.kind === 'response' && errorCode(ex.body) === 'booking_service_facts_unavailable') return fail({ reason: 'facts_unavailable' });
  if (ex.kind === 'response' && errorCode(ex.body) === 'booking_branch_source_unavailable') return fail({ reason: 'branch_unavailable' });
  if (ex.kind === 'response' && ex.status === 409) return fail({ reason: 'conflict' });
  return fail({ reason: 'unavailable' });
};

// Failed writes may have committed. Recovery reads the exact existing operation;
// a current connection snapshot alone cannot establish the write's outcome.
const crmSetupOutcome = (ex: AuthorizedExchange, writing: boolean): Outcome<CrmSetupSnapshot, CrmSetupFailure> => {
  if (ex.kind === 'signed_out' || (ex.kind === 'response' && [401, 403].includes(ex.status))) return fail({ reason: 'forbidden' });
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const value = projectCrmSetup(ex.body);
    if (value !== null && (!writing || value.connection !== null)) return { ok: true, value };
  }
  return fail({ reason: writing ? 'uncertain' : 'unavailable' });
};

const crmSetupCompletion = (ex: AuthorizedExchange, locator: CrmOperationLocator): Outcome<CrmSetupCompletion, CrmSetupFailure> => {
  if (ex.kind === 'signed_out' || (ex.kind === 'response' && [401, 403].includes(ex.status))) return fail({ reason: 'forbidden' });
  if (ex.kind === 'response' && isSuccess(ex.status)) {
    const snapshot = projectCrmSetup(ex.body), operation = projectCrmOperation(ex.body, locator);
    if (snapshot && operation?.status === 'SUCCEEDED') return { ok: true, value: { snapshot, operation } };
  }
  return fail({ reason: 'uncertain' });
};

/** The two authenticated calls of P1, shaped as `shell/ports.ts` `Transport`. */
export function createTransport(auth: Authorizer, timeouts: Timeouts = { requestMs: REQUEST_TIMEOUT_MS, transcribeMs: TRANSCRIBE_TIMEOUT_MS }) {
  return {
    async goodsPhotoPreview(photo: GoodsPhotoFile, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>> {
      if (!(photo instanceof Blob) || photo.size < 12 || photo.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(photo.type)) return fail({ reason: 'invalid_photo' });
      const body = new FormData();
      body.append('photo', photo, photo.type === 'image/png' ? 'invoice.png' : photo.type === 'image/jpeg' ? 'invoice.jpg' : 'invoice.webp');
      const ex = await authorizedExchange(auth, 'goodsPhotoPreview', body, signal, timeouts.requestMs);
      return goodsPhotoOutcome(ex, projectGoodsPhotoPreview, 'preview');
    },
    async goodsPhotoSearch(request: GoodsPhotoRequestContext & { readonly query: string }, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>> {
      const context = projectGoodsPhotoContext(request), query = goodsPhotoQuery(request.query);
      if (!context || query === null) return fail({ reason: 'invalid_request' });
      const body = { ...context, query };
      const ex = await authorizedExchange(auth, 'goodsPhotoSearch', body, signal, timeouts.requestMs);
      return goodsPhotoOutcome(ex, raw => projectGoodsPhotoSearch(raw, body), 'read');
    },
    async goodsPhotoItem(request: GoodsPhotoRequestContext & { readonly goods_id: string }, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>> {
      const context = projectGoodsPhotoContext(request);
      if (!context || typeof request.goods_id !== 'string' || !/^[1-9]\d{0,14}$/.test(request.goods_id)) return fail({ reason: 'invalid_request' });
      const body = { ...context, goods_id: request.goods_id };
      const ex = await authorizedExchange(auth, 'goodsPhotoItem', body, signal, timeouts.requestMs);
      return goodsPhotoOutcome(ex, raw => projectGoodsPhotoItem(raw, body), 'read');
    },
    async goodsPhotoReview(request: GoodsPhotoRequestContext & { readonly proposal: GoodsPhotoProposal }, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>> {
      const context = projectGoodsPhotoContext(request), proposal = projectGoodsPhotoProposal(request.proposal);
      if (!context || !proposal) return fail({ reason: 'invalid_request' });
      const body = { ...context, proposal };
      const ex = await authorizedExchange(auth, 'goodsPhotoReview', body, signal, timeouts.requestMs);
      return goodsPhotoOutcome(ex, raw => projectGoodsPhotoReview(raw, body), 'review');
    },
    async crmSetupStatus(signal: AbortSignal): Promise<Outcome<CrmSetupSnapshot, CrmSetupFailure>> {
      return crmSetupOutcome(await authorizedExchange(auth, 'crmSetupStatus', {}, signal, timeouts.requestMs), false);
    },
    async crmSetupStage(input: CrmSetupInstall, key: string, signal: AbortSignal): Promise<Outcome<CrmSetupCompletion, CrmSetupFailure>> {
      const body = crmSetupBody(input);
      if (body === null || !crmSetupKey(key)) return fail({ reason: 'invalid' });
      const ex = await authorizedExchange(auth, 'crmSetupStage', body, signal, timeouts.requestMs, null, '', key);
      return crmSetupCompletion(ex, { operation: 'install', requestId: key });
    },
    async crmSetupActivate(expectedVersion: string, key: string, signal: AbortSignal): Promise<Outcome<CrmSetupCompletion, CrmSetupFailure>> {
      if (!crmConfigVersion(expectedVersion) || !crmSetupKey(key)) return fail({ reason: 'invalid' });
      const ex = await authorizedExchange(auth, 'crmSetupActivate', { expectedVersion }, signal, timeouts.requestMs, null, '', key);
      return crmSetupCompletion(ex, { operation: 'activate', requestId: key });
    },
    async crmSetupOperation(locator: CrmOperationLocator, signal: AbortSignal): Promise<Outcome<CrmOperationStatus, CrmSetupFailure>> {
      if (!locator || !['install', 'activate'].includes(locator.operation) || !crmSetupKey(locator.requestId)) return fail({ reason: 'invalid' });
      const exact = { operation: locator.operation, requestId: locator.requestId };
      const ex = await authorizedExchange(auth, 'crmSetupOperation', {}, signal, timeouts.requestMs, null, '', '', exact);
      if (ex.kind === 'signed_out' || (ex.kind === 'response' && [401, 403].includes(ex.status))) return fail({ reason: 'forbidden' });
      if (ex.kind === 'response' && isSuccess(ex.status)) {
        const value = projectCrmOperation(ex.body, exact);
        if (value !== null) return { ok: true, value };
      }
      return fail({ reason: 'unavailable' });
    },
    async personalBranches(signal: AbortSignal) { return personalOutcome(await authorizedExchange(auth, 'personalBranches', {}, signal, timeouts.requestMs), projectPersonalBranches); },
    async personalServices(signal: AbortSignal) { return personalOutcome(await authorizedExchange(auth, 'personalServices', {}, signal, timeouts.requestMs), projectPersonalChoices); },
    async personalStaff(signal: AbortSignal) { return personalOutcome(await authorizedExchange(auth, 'personalStaff', {}, signal, timeouts.requestMs), projectPersonalChoices); },
    async personalSlots(date: string, serviceId: string, staffId: string, signal: AbortSignal, branchId?: string) {
      return personalOutcome(await authorizedExchange(auth, 'personalSlots', {}, signal, timeouts.requestMs, { date, serviceId, staffId, ...(branchId === undefined ? {} : { branchId }) }), projectPersonalSlots);
    },
    async personalPreview(selection: PersonalSelection, signal: AbortSignal) { return personalOutcome(await authorizedExchange(auth, 'personalPreview', personalBody(selection), signal, timeouts.requestMs), projectPersonalPreview); },
    async personalResults(signal: AbortSignal) { return personalOutcome(await authorizedExchange(auth, 'personalResults', {}, signal, timeouts.requestMs), projectPersonalResults); },
    async personalCreate(selection: PersonalSelection, signal: AbortSignal): Promise<Outcome<true, PersonalFailure>> {
      // No network/timeout retry. Only the shared pre-dispatch 401 refresh is eligible.
      const ex = await authorizedExchange(auth, 'personalCreate', { ...personalBody(selection), ...(selection.previewFactsHash === undefined ? {} : { previewFactsHash: selection.previewFactsHash }) }, signal, timeouts.requestMs);
      if (ex.kind === 'response' && isSuccess(ex.status)) return { ok: true, value: true };
      if (ex.kind === 'signed_out' || (ex.kind === 'response' && ([400, 401, 403, 409].includes(ex.status) || ['booking_service_facts_unavailable', 'booking_branch_source_unavailable'].includes(errorCode(ex.body) ?? '')))) return personalOutcome(ex, () => true as const);
      return fail({ reason: 'unknown' });
    },
    async conversation(signal: AbortSignal): Promise<Outcome<ConversationHistoryProjection, ChatFailure>> {
      const ex = await authorizedExchange(auth, 'conversation', {}, signal, timeouts.requestMs);
      if (ex.kind === 'signed_out') return fail({ reason: 'signed_out', signedOut: ex.reason });
      if (ex.kind === 'unavailable') return fail(chatUnavailable(ex.exchange));
      if (ex.kind === 'response' && isSuccess(ex.status)) {
        const value = projectConversationHistory(ex.body);
        return value === null ? fail({ reason: 'unexpected_response', status: ex.status }) : { ok: true, value };
      }
      return fail(chatFailure(ex));
    },
    async eraseConversation(request: HistoryErasureRequest, signal: AbortSignal): Promise<Outcome<HistoryErasureCompletion, HistoryErasureFailure>> {
      const canonical = projectHistoryErasureRequest(request);
      if (canonical === null) return fail({ reason: 'invalid_request' });
      // Only the shared 401 refresh can resend. A lost result requires explicit same-request retry.
      const ex = await authorizedExchange(auth, 'historyErasure', { requestId: canonical.requestId }, signal, timeouts.requestMs, null, canonical.conversationId);
      if (ex.kind === 'signed_out') return fail({ reason: 'signed_out', signedOut: ex.reason });
      if (ex.kind !== 'response') return fail({ reason: 'unknown' });
      if (isSuccess(ex.status)) {
        const value = projectHistoryErasure(ex.body, canonical);
        return value === null ? fail({ reason: 'unknown' }) : { ok: true, value };
      }
      if (ex.status === 400) return fail({ reason: 'invalid_request' });
      if (ex.status === 403) return fail({ reason: 'forbidden' });
      if (ex.status === 404) return fail({ reason: 'unavailable' });
      if (ex.status === 409) return fail({ reason: 'conflict' });
      return fail({ reason: 'unknown' });
    },
    /** Body keys `{surface, requestId, messages}` plus an optional server-issued `conversationId`, `surface` the constant 'web' (NT3). */
    async chat(request: ChatRequest, signal: AbortSignal): Promise<Outcome<ChatProjection, ChatFailure>> {
      const body: ChatRequest = {
        surface: 'web',
        requestId: request.requestId,
        ...(request.conversationId === undefined ? {} : { conversationId: request.conversationId }),
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
        ...(request.booking_receipt === undefined ? {} : { booking_receipt: {
          widget_id: request.booking_receipt.widget_id,
        } }),
        ...(request.rendered === undefined ? {} : { rendered: {
          widget_id: request.rendered.widget_id, body_hash: request.rendered.body_hash,
          envelope_seal: request.rendered.envelope_seal,
        } }),
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

const goodsPhotoOutcome = (
  ex: AuthorizedExchange,
  project: (body: unknown) => GoodsPhotoResponse | null,
  mode: 'preview' | 'read' | 'review',
): Outcome<GoodsPhotoResponse, GoodsPhotoFailure> => {
  if (ex.kind === 'signed_out') return fail({ reason: 'signed_out' });
  // A failed authorization refresh never dispatched the owner action.
  if (ex.kind === 'unavailable') return fail({ reason: 'unavailable' });
  if (ex.kind !== 'response')
    return fail({ reason: mode === 'review' ? 'unknown' : 'unavailable' });
  if (isSuccess(ex.status)) {
    const value = project(ex.body);
    return value === null
      ? fail({ reason: mode === 'review' ? 'unknown' : 'unavailable' })
      : { ok: true, value };
  }
  if (mode === 'preview' && (ex.status === 400 || ex.status === 503)) {
    const descriptor =
      ex.body && typeof ex.body === 'object'
        ? Object.getOwnPropertyDescriptor(ex.body, 'message')
        : undefined;
    const message: unknown =
      descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (ex.status === 400 && message === 'goods_photo_ocr_table_unsupported')
      return fail({ reason: 'unsupported_table' });
    if (ex.status === 503) {
      if (message === 'goods_photo_parser_not_configured')
        return fail({ reason: 'recognition_unavailable' });
      if (message === 'goods_photo_ocr_busy')
        return fail({ reason: 'recognition_busy' });
      if (
        message === 'goods_photo_ocr_timeout' ||
        message === 'goods_photo_ocr_unavailable' ||
        message === 'goods_photo_ocr_output_limit' ||
        message === 'goods_photo_ocr_output_invalid'
      )
        return fail({ reason: 'recognition_failed' });
    }
  }
  if (ex.status === 400 || ex.status === 413)
    return fail({
      reason: mode === 'preview' ? 'invalid_photo' : 'invalid_request',
    });
  if (ex.status === 403) return fail({ reason: 'forbidden' });
  if (ex.status === 409) return fail({ reason: 'conflict' });
  if (ex.status === 404) return fail({ reason: 'unavailable' });
  if (ex.status === 503 && mode !== 'review')
    return fail({ reason: 'source_unavailable' });
  return fail({ reason: mode === 'review' ? 'unknown' : 'unavailable' });
};

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
