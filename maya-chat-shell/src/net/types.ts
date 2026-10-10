// K5 — transport shapes. Frozen in S0.
//
// Only what crosses the wire in P1, and only in the form the shell keeps it:
//   * request bodies exactly as sent (the backend DTOs whitelist their keys, so these are closed);
//   * allowlist projections of each response (D12c) — a projection copies listed keys and never
//     names a dropped one;
//   * the named failure states every non-2xx outcome maps to (D9, D12d, V2-16). Nothing is silent.
//
// No contract type is redeclared here (D8). B4 retains the server-authorized envelope whole and
// hands it to the existing H7/vault/render owner; the transport never reconstructs business facts.
// Types only; this module emits no runtime bytes.

import type { HistorisedWidget, WidgetEnvelope, WidgetIntentSubmission } from '../contract.ts';

// ── requests ───────────────────────────────────────────────────────────────────────────────────

/** `POST /auth/email/start` — `StartEmailAuthDto`. */
export interface EmailStartRequest {
  readonly email: string;
}

/**
 * `POST /auth/email/verify` — `VerifyEmailAuthDto`. The second form is the `select_business`
 * re-verify, echoing the opaque `businesses[].slug` the server returned (sign-in exemption, V2-6).
 */
export type EmailVerifyRequest =
  | { readonly email: string; readonly code: string }
  | { readonly email: string; readonly code: string; readonly tenantSlug: string };

/**
 * `POST /auth/login` — `LoginDto`. `tenantSlug` is REQUIRED in the shell and typed by the user:
 * a slug-less login is the platform-owner path, which answers 401 to every business user (V2-6).
 */
export interface PasswordLoginRequest {
  readonly tenantSlug: string;
  readonly email: string;
  readonly password: string;
}

/** `POST /auth/refresh` — `RefreshSessionDto`. Built only by the session module. */
export interface RefreshRequest {
  readonly refreshToken: string;
}

/** One history item. `content` is 1..2000 UTF-16 code units (`AiCoreChatMessageDto`). */
export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * `POST /ai/chat` — `AiCoreChatDto`, exactly these three keys. The surface is the constant 'web';
 * no audience, tenant, role or mode value is ever part of this body.
 */
export interface ChatRequest {
  readonly surface: 'web';
  readonly requestId: string;
  readonly messages: readonly ChatMessage[];
  /** Opaque server-issued reference; only the backend validates its scope. */
  readonly conversationId?: string;
}

/** Exact current conversation; requestId remains fixed until its outcome is known. */
export interface HistoryErasureRequest {
  readonly conversationId: string;
  readonly requestId: string;
}

/** `POST /ai/transcribe` — JSON form: `data:audio/wav;base64,…` (WAV PCM16 mono 16 kHz). */
export interface TranscribeRequest {
  readonly audioBase64: string;
}

export type WidgetIntentRequest = WidgetIntentSubmission;

export interface WidgetResolveRequest {
  readonly rendered?: { readonly widget_id: string; readonly body_hash: string; readonly envelope_seal: string };
  /** Explicit status-button locator only; the backend resolves current principal and action authority. */
  readonly booking_receipt?: { readonly widget_id: string };
  readonly thread_page: { readonly limit: number; readonly before?: string };
}

// ── projections ────────────────────────────────────────────────────────────────────────────────

/** The session material a sign-in or refresh yields. The access token is never decoded. */
export interface SessionGrant {
  readonly accessToken: string;
  readonly expiresInSec: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: string;
}

/** What the identity bar shows. No role, no tenant id, no slug. */
export interface SignInDisplay {
  readonly userName: string;
  readonly tenantName: string | null;
}

/** One `businesses[]` entry of `select_business`. `role` is dropped; `slug` is an opaque handle. */
export interface BusinessChoice {
  readonly name: string;
  readonly slug: string;
}

/**
 * One row of the public business finder (`GET /mobile/pwa/search`). The server also sends a city, a
 * logo URL, an icon URL and a `smart_url`; none is projected. `slug` is an opaque handle the screen
 * never shows — it is what the Telegram hand-off is scoped to.
 */
export interface BusinessMatch {
  readonly name: string;
  readonly slug: string;
  readonly address: string | null;
}

export interface BusinessSearchProjection {
  readonly items: readonly BusinessMatch[];
}

/**
 * `POST /auth/oauth/telegram/start` → the provider URL the browser is handed, and the `state` that
 * names this login. The state is kept because it is the ONLY thing that proves a callback arriving
 * later belongs to a login this app started: without it a callback delivered by anything else would
 * be indistinguishable from the real one, and would sign this person into somebody else's account.
 */
export interface TelegramStartProjection {
  readonly authUrl: string;
  readonly state: string;
}

/**
 * What the provider handed back, as it arrives — three opaque strings and nothing interpreted.
 * `code` and `error` are exclusive: the provider sends one or the other.
 */
export interface TelegramCallback {
  readonly state: string;
  readonly code: string | null;
  readonly error: string | null;
}

/**
 * `POST /auth/oauth/telegram/complete`. The body is the login response the password path already
 * returns — same tokens, same nested `user.tenant` — so it is read by the SAME projection, and
 * `is_new_user` is the server's own answer to whether this identity had signed in here before.
 */
export interface TelegramCompleteProjection {
  readonly grant: SessionGrant;
  readonly display: SignInDisplay;
  readonly isNewUser: boolean;
}

/**
 * The first-run screen's outcomes: finding a business, and being handed to Telegram. Separate from
 * `SignInFailure` because nothing here is a credential — no state may hint whether an account exists.
 */
export type FirstRunFailure =
  | { readonly state: 'term_too_short' }
  | { readonly state: 'rate_limited'; readonly retryAfterSec: number }
  | { readonly state: 'telegram_unavailable' }
  | { readonly state: 'business_unavailable' }
  // A callback that names no login this app started, or that names one already spent. Refused
  // before any request: this is the client's half of the state check, and the whole of the defence
  // against a callback somebody else delivered.
  | { readonly state: 'callback_unsolicited' }
  // The server no longer holds this login: never issued, expired, or already completed once.
  | { readonly state: 'login_expired' }
  // The person said no on the provider's own screen.
  | { readonly state: 'telegram_declined' }
  // The identity is known but cannot be used here: revoked staff access, or an identity already
  // bound elsewhere. Deliberately one state — naming which would confirm an account exists.
  | { readonly state: 'account_unavailable' }
  // The provider returned no phone number, which this business requires to know who arrived.
  | { readonly state: 'phone_required' }
  // A real identity, but this business is not taking new people right now.
  | { readonly state: 'registration_closed' }
  | { readonly state: 'no_connection' }
  | { readonly state: 'unexpected_response'; readonly status: number };

export interface EmailStartProjection {
  readonly next_step: 'verify_email_code';
}

export type EmailVerifyProjection =
  | { readonly next_step: 'signed_in'; readonly grant: SessionGrant; readonly display: SignInDisplay }
  | { readonly next_step: 'select_business'; readonly businesses: readonly BusinessChoice[] };

export interface PasswordLoginProjection {
  readonly grant: SessionGrant;
  readonly display: SignInDisplay;
}

/** Refresh returns tokens and a session only; `display` stays what sign-in set. */
export interface RefreshProjection {
  readonly grant: SessionGrant;
}

/**
 * `/ai/chat`, projected. `action_status` copies `action.status` only — never `action.approval`
 * (V2-5) — and is null when the response carries no action.
 */
export interface ChatProjection {
  readonly userTurn?: { readonly turnId: string; readonly conversationId: string };
  readonly request_id: string;
  readonly reply: string;
  readonly action_status: string | null;
  readonly resolution: ChatWidgetResolution | null;
}

/** Text-only continuation. It carries no reusable action or approval authority. */
export interface ConversationHistoryProjection {
  readonly conversationId: string | null;
  readonly truncated: boolean;
  readonly interrupted: boolean;
  readonly turns: readonly {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly text: string;
    readonly createdAt: string;
    readonly completed: boolean;
  }[];
}

/** Persisted historical completion, not a claim about content created afterwards. */
export interface HistoryErasureCompletion {
  readonly contract: 'maya.privacy.history-erasure/1';
  readonly outcome: 'COMPLETED';
  readonly requestId: string;
  readonly conversationId: string;
  readonly erasedAt: string;
}

export type HistoryErasureFailure =
  | { readonly reason: 'unknown' }
  | { readonly reason: 'forbidden' }
  | { readonly reason: 'unavailable' }
  | { readonly reason: 'conflict' }
  | { readonly reason: 'invalid_request' }
  | { readonly reason: 'signed_out'; readonly signedOut: SignedOutReason };

/** SH-19's additive chat member, projected without re-authoring the certified envelope. */
export interface ChatWidgetResolution {
  readonly matched: true;
  readonly receipt: {
    readonly widget_id: string;
    readonly envelope_seal: string;
    readonly envelope: WidgetEnvelope;
  };
  readonly dismiss_widget_id: string | null;
}

export interface TranscribeProjection {
  readonly transcript: string;
}

/** Display evidence from the existing canonical owner response; never client authority. */
export interface WidgetOwnerDecisionProjection {
  readonly decision: string | null;
  readonly status: string | null;
  readonly state: string | null;
  readonly outcome: {
    readonly verified: boolean;
    readonly source: string | null;
    readonly currency: string | null;
    readonly service_id: string | null;
    readonly price_rubles: number | null;
    readonly action_execution_id: string | null;
    readonly goods_receipt?: {
      readonly receipt_id: string | null;
      readonly company_id: string | null;
      readonly goods_id: string | null;
      readonly store_id: string | null;
      readonly quantity: string | null;
      readonly unit_id: string | null;
      readonly unit_cost: string | null;
      readonly line_total: string | null;
      readonly received_at: string | null;
      readonly no_catalog_price_change: boolean;
      readonly no_absolute_stock_assignment: boolean;
    };
  } | null;
}

export interface WidgetIntentProjection {
  /** Closed preference-selection acknowledgement; never a booking/action result. */
  readonly booking_selection_pending?: 'date';
  readonly reason_text?: { readonly phrase_key: string; readonly rendered: string };
  readonly schedule_outcome?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | null;
  readonly outcome: 'terminate' | 'refuse' | 'expired' | 'superseded';
  readonly code: string | null;
  readonly next_envelope: WidgetEnvelope | null;
  /**
   * NS-1: the widget the server RE-RESOLVED for this intent, and the only admissible source of a
   * parent return. Server-side this member is a union — a re-resolved envelope, a signed HANDOFF
   * target, or a control acknowledgement — and only the envelope shape crosses this boundary.
   */
  readonly resolved_widget: WidgetEnvelope | null;
  readonly receipt_outcome: 'ACCEPTED' | 'REFUSED' | 'NEEDS_CONFIRMATION' | 'NEEDS_VERIFICATION' | null;
  readonly owner_decision?: WidgetOwnerDecisionProjection;
}

export interface WidgetResolveProjection {
  readonly widgets: readonly HistorisedWidget[];
  readonly tenant_bound: boolean;
}

export type WidgetFailure =
  | { readonly reason: 'signed_out'; readonly signedOut: SignedOutReason }
  | { readonly reason: 'forbidden' }
  | { readonly reason: 'no_connection' }
  | { readonly reason: 'server_error' }
  | { readonly reason: 'unexpected_response' };

// ── failures ───────────────────────────────────────────────────────────────────────────────────

/** Why a session ended. Every one is shown as a named signed-out state. */
export type SignedOutReason =
  | 'refresh_token_invalid'
  | 'refresh_token_reused'
  | 'session_expired'
  | 'session_revoked'
  | 'signed_out';

/** The §1.4 sign-in failure table, one member per row (V2-16), plus an unmapped-response row. */
export type SignInFailure =
  | { readonly state: 'rate_limited'; readonly retryAfterSec: number } // 429 auth_rate_limited
  | { readonly state: 'code_attempts_exhausted' } // 429 on /auth/email/verify
  | { readonly state: 'email_login_unavailable' } // 503 email_login_unavailable / email_delivery_*
  | { readonly state: 'code_invalid' } // 400 email_code_invalid
  | { readonly state: 'code_expired' } // 400 email_code_expired / email_code_missing
  | { readonly state: 'email_not_linked' } // 401 email_login_invalid
  | { readonly state: 'credentials_invalid' } // /auth/login 401
  | { readonly state: 'account_unavailable' } // 403 user not active / tenant not accepting access
  | { readonly state: 'field_invalid'; readonly field: 'email' | 'password' | 'code' | 'business' } // 400 validation
  | { readonly state: 'no_connection' } // 502, network error, abort
  | { readonly state: 'unexpected_response'; readonly status: number }; // any other status or body

/** The §1.4 turn taxonomy for `/ai/chat` (D9, D12d). Retry policy belongs to the conversation. */
export type ChatFailure =
  | { readonly reason: 'signed_out'; readonly signedOut: SignedOutReason } // 401 after a failed refresh
  | { readonly reason: 'subscription_required' } // 402
  | { readonly reason: 'feature_locked' } // 403 feature_locked
  | { readonly reason: 'tenant_required' } // 403 tenant_required
  | { readonly reason: 'forbidden' } // any other 403
  | { readonly reason: 'rate_limited'; readonly retryAfterSec: number } // 429 + Retry-After
  | { readonly reason: 'outdated_client' } // 400 validation
  | { readonly reason: 'model_failure' } // 503 ai_model_* / ai_tool_result_unavailable
  | { readonly reason: 'conflict' } // 409 — terminal for that requestId
  | { readonly reason: 'no_connection' } // 502 relay, network error, 80 s timeout
  | { readonly reason: 'aborted' } // cancelled by the shell (sign-out, route change)
  | { readonly reason: 'server_error'; readonly status: number } // any other 5xx
  | { readonly reason: 'unexpected_response'; readonly status: number }; // unparseable or unmapped

/** `/ai/transcribe` outcomes (lens-voice §6.4). */
export type TranscribeFailure =
  | { readonly reason: 'signed_out'; readonly signedOut: SignedOutReason }
  | { readonly reason: 'not_recognized' } // 400 speech_not_recognized
  | { readonly reason: 'audio_rejected' } // 400 invalid_speech_audio / validation, 413
  | { readonly reason: 'provider_unavailable' } // 503 speech_provider_unavailable
  | { readonly reason: 'rate_limited'; readonly retryAfterSec: number }
  | { readonly reason: 'no_connection' }
  | { readonly reason: 'aborted' }
  | { readonly reason: 'unexpected_response'; readonly status: number };

/** Every typed client method resolves to this; it never rejects for an HTTP or network outcome. */
export type Outcome<T, F> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: F };

// Explicit personal booking: request-local, already verified profile.
export interface PersonalChoice { readonly id: string; readonly name: string }
export interface PersonalBranch extends PersonalChoice { readonly timezone: string | null }

// Local owner setup: only public connection metadata crosses the network boundary.
export interface CrmSetupConnection {
  readonly id: string; readonly tenantId: string; readonly updatedAt: string;
  readonly provider: 'yclients' | 'other'; readonly status: 'pending_activation' | 'active' | 'other';
  readonly hasCredentials: boolean; readonly companyId: string | null; readonly branchId: string | null;
}
export interface CrmSetupSnapshot {
  readonly connection: CrmSetupConnection | null;
  readonly counts: { readonly services: number | null; readonly staff: number | null } | null;
}
export interface CrmSetupInput { readonly apiToken: string; readonly companyId: string; readonly branchId: string }
export interface CrmSetupBody {
  readonly provider: 'yclients'; readonly apiToken: string;
  readonly settingsJson: { readonly companyId: number; readonly branchBinding: {
    readonly contract: 'maya.crm-branch-binding/1'; readonly companyId: number; readonly branchId: string;
  } };
}
export interface CrmSetupFailure { readonly reason: 'forbidden' | 'invalid' | 'unavailable' | 'uncertain' }
export interface CrmSetupTransport {
  crmSetupStatus(signal: AbortSignal): Promise<Outcome<CrmSetupSnapshot, CrmSetupFailure>>;
  crmSetupStage(input: CrmSetupInput, key: string, signal: AbortSignal): Promise<Outcome<CrmSetupSnapshot, CrmSetupFailure>>;
  personalBranches(signal: AbortSignal): Promise<Outcome<readonly PersonalBranch[], PersonalFailure>>;
}
export interface PersonalSlot { readonly start: string; readonly staffId: string; readonly branchId: string | null }
export interface PersonalSelection { readonly staffId: string; readonly serviceIds: readonly string[]; readonly start: string; readonly branchId?: string; readonly previewFactsHash?: string }
export interface PersonalPreview {
  readonly factsHash: string | null;
  readonly services: readonly { readonly name: string; readonly price: number | null; readonly currency: string | null; readonly durationMinutes: number | null }[];
  readonly staff: string; readonly start: string; readonly timezone: string | null;
  readonly source: string; readonly asOf: string; readonly existing: boolean; readonly requestState: string | null;
}
export interface PersonalResults {
  readonly results: readonly { readonly id: string; readonly state: string; readonly recordedAt: string }[];
  readonly hasPending: boolean; readonly hasMore: boolean;
}
export type PersonalFailure = { readonly reason: 'forbidden' | 'unavailable' | 'branch_unavailable' | 'facts_unavailable' | 'unknown' | 'conflict' | 'aborted' };
export interface PersonalTransport {
  personalBranches(signal: AbortSignal): Promise<Outcome<readonly PersonalBranch[], PersonalFailure>>;
  personalServices(signal: AbortSignal): Promise<Outcome<readonly PersonalChoice[], PersonalFailure>>;
  personalStaff(signal: AbortSignal): Promise<Outcome<readonly PersonalChoice[], PersonalFailure>>;
  personalSlots(date: string, serviceId: string, staffId: string, signal: AbortSignal, branchId?: string): Promise<Outcome<readonly PersonalSlot[], PersonalFailure>>;
  personalPreview(selection: PersonalSelection, signal: AbortSignal): Promise<Outcome<PersonalPreview, PersonalFailure>>;
  personalResults(signal: AbortSignal): Promise<Outcome<PersonalResults, PersonalFailure>>;
  personalCreate(selection: PersonalSelection, signal: AbortSignal): Promise<Outcome<true, PersonalFailure>>;
}

// Explicit goods-photo workflow. Decimal source facts remain exact text.
export type GoodsPhotoFile = Blob;
export type GoodsPhotoFailureReason =
  | 'invalid_photo'
  | 'recognition_unavailable'
  | 'recognition_busy'
  | 'recognition_failed'
  | 'unsupported_table'
  | 'invalid_request'
  | 'forbidden'
  | 'signed_out'
  | 'source_unavailable'
  | 'conflict'
  | 'unavailable'
  | 'unknown';
export interface GoodsPhotoFailure { readonly reason: GoodsPhotoFailureReason }
export interface GoodsPhotoLine {
  readonly sourceLine: number; readonly name: string | null; readonly quantity: string | null;
  readonly unitLabel: string | null; readonly unitPrice: string | null; readonly lineTotal: string | null;
  readonly priceKind: 'purchase_unit' | 'sale_unit' | 'line_total' | null;
  readonly parserConfidence: number | null;
}
export interface GoodsSearchMatch { readonly kind: 'item' | 'category'; readonly id: string; readonly title: string }
export interface GoodsPhotoItem {
  readonly id: string; readonly name: string; readonly article: string | null; readonly barcode: string | null;
  readonly asOf: string; readonly currency: string | null; readonly itemKind: 'physical' | 'loyalty' | 'unknown';
  readonly salePrice: string | null; readonly costPrice: string | null; readonly unitCostPrice: string | null;
  readonly saleUnitId: string | null; readonly saleUnitLabel: string | null;
  readonly writeOffUnitId: string | null; readonly writeOffUnitLabel: string | null; readonly unitRatio: string | null;
  readonly stock: { readonly status: 'observed' | 'unavailable'; readonly rows: readonly { readonly storeId: string; readonly quantity: string }[]; readonly unitBasis: 'not_provided'; readonly exhaustive: false };
}
export interface GoodsPhotoReviewFields {
  readonly storeId: string; readonly quantity: string; readonly unitId: string; readonly unitCost: string;
  readonly currency: string; readonly receivedAt: string; readonly priceKind: '' | 'receipt_purchase_unit';
}
export interface GoodsPhotoProposal {
  readonly goods_id: string; readonly store_id: string; readonly quantity: string; readonly unit_id: string;
  readonly unit_cost: string; readonly currency: string; readonly price_kind: 'receipt_purchase_unit'; readonly received_at: string;
  readonly photo_sha256: string; readonly source_line: number; readonly review_version: number;
}
export interface GoodsPhotoTurn {
  readonly conversationId: string; readonly userTurn: { readonly turnId: string; readonly conversationId: string };
  readonly userText: string; readonly reply: string;
}
export type GoodsPhotoResponse =
  | { readonly kind: 'preview'; readonly sourceRevision: string; readonly photoSha256: string; readonly lines: readonly GoodsPhotoLine[] }
  | { readonly kind: 'search'; readonly sourceRevision: string; readonly turn: GoodsPhotoTurn; readonly query: string; readonly matches: readonly GoodsSearchMatch[]; readonly mayHaveMore: boolean }
  | { readonly kind: 'item'; readonly sourceRevision: string; readonly turn: GoodsPhotoTurn; readonly item: GoodsPhotoItem }
  | { readonly kind: 'review'; readonly turn: GoodsPhotoTurn; readonly status: 'approval_required' | 'completed' | 'held'; readonly resolution: ChatWidgetResolution | null };
export interface GoodsPhotoRequestContext { readonly requestId: string; readonly conversationId?: string; readonly source_revision: string }
export interface GoodsPhotoTransport {
  goodsPhotoPreview(photo: GoodsPhotoFile, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>>;
  goodsPhotoSearch(request: GoodsPhotoRequestContext & { readonly query: string }, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>>;
  goodsPhotoItem(request: GoodsPhotoRequestContext & { readonly goods_id: string }, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>>;
  goodsPhotoReview(request: GoodsPhotoRequestContext & { readonly proposal: GoodsPhotoProposal }, signal: AbortSignal): Promise<Outcome<GoodsPhotoResponse, GoodsPhotoFailure>>;
}
