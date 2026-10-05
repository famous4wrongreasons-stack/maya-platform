// K5 — the session. Memory only (R1 default (a); owner ruling A6: memory-only stays the default).
//
// The session lives in the closure of `createNet()` and nowhere else: no browser store, no URL,
// nothing that survives a reload. A reload therefore shows the named signed-out state.
// The access token is never decoded (its `role` claim is never read): its expiry is
// `receivedAt + expires_in`. The tenant is the one the server bound at sign-in.
//
// `createNet()` hands out two objects and keeps the rest private:
//   session    — shaped as `shell/ports.ts` `SessionPort`: sign-in, sign-out, the signed-in view
//   transport  — shaped as `shell/ports.ts` `Transport`: `/ai/chat` and `/ai/transcribe`
// The bearer reaches `client.ts` through an internal `Authorizer`; no token is ever exposed.
//
// Refresh is single-flight: however many calls need a new access token at once (proactively, within
// 30 s of expiry, or after a 401), exactly one `/auth/refresh` is sent for the current grant.

import {
  REQUEST_TIMEOUT_MS,
  TRANSCRIBE_TIMEOUT_MS,
  createTransport,
  emailStart,
  emailVerify,
  logoutSession,
  passwordLogin,
  refreshSession,
  searchBusinesses,
  telegramComplete,
  telegramStart,
} from './client.ts';
import type { Authorization, Authorizer, RefreshResult, Timeouts } from './client.ts';
import type { BusinessChoice, BusinessMatch, FirstRunFailure, SessionGrant, SignedOutReason, SignInDisplay, SignInFailure, TelegramCallback } from './types.ts';

/** A refresh starts when the access token has less than this left. */
export const REFRESH_LEEWAY_MS = 30_000;

/** Structurally `shell/ports.ts` `SessionView` (net/ may not import ports). */
export type SessionSnapshot =
  | { readonly signedIn: false; readonly reason: SignedOutReason | null }
  | { readonly signedIn: true; readonly display: SignInDisplay };

/** Structurally `shell/ports.ts` `FinderStep` and `TelegramStep`. */
export type FinderOutcome =
  | { readonly step: 'matches'; readonly businesses: readonly BusinessMatch[] }
  | { readonly step: 'failed'; readonly failure: FirstRunFailure };

export type TelegramOutcome = { readonly step: 'handed_off' } | { readonly step: 'failed'; readonly failure: FirstRunFailure };

/**
 * Structurally `shell/ports.ts` `TelegramLanding`. The landing is a state of being SIGNED OUT — it
 * ends either in a session or in a sentence — so it is watched separately from the session view,
 * which says only whether there is one.
 */
export type TelegramLanding =
  | { readonly state: 'none' }
  | { readonly state: 'running' }
  | { readonly state: 'failed'; readonly failure: FirstRunFailure };

/** Whether the completed login was this identity's first in that business. */
export type TelegramLandingOutcome =
  | { readonly step: 'signed_in'; readonly display: SignInDisplay; readonly isNewUser: boolean }
  | { readonly step: 'failed'; readonly failure: FirstRunFailure };

/**
 * The WEB carrier hands over this page's fragment verbatim, because a fragment is the one part of a
 * URL no browser sends to a server — and until the server spends it, `state` + `code` together are
 * enough for anyone holding them to mint the session, since the PKCE verifier for this flow lives
 * server-side rather than here.
 *
 * Only the four names are read, each at most once: a repeated name is how a second value rides in
 * behind the first, so a duplicate voids the whole callback rather than letting either be chosen.
 * Without the `oauth=telegram` mark this is somebody's route fragment and not a callback at all.
 */
const parseFragment = (fragment: string): TelegramCallback | null => {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw.length === 0 || raw.length > 4_096) return null;
  let marked = false;
  let state: string | null = null;
  let code: string | null = null;
  let error: string | null = null;
  for (const pair of raw.split('&')) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    const key = pair.slice(0, at);
    let value: string;
    try {
      value = decodeURIComponent(pair.slice(at + 1));
    } catch {
      // A malformed escape is a malformed callback, not a callback with one bad field.
      return null;
    }
    if (key === 'oauth') {
      if (marked || value !== 'telegram') return null;
      marked = true;
    } else if (key === 'state') {
      if (state !== null) return null;
      state = value;
    } else if (key === 'code') {
      if (code !== null) return null;
      code = value;
    } else if (key === 'error') {
      if (error !== null) return null;
      error = value;
    }
  }
  if (!marked || state === null || state === '') return null;
  return { state, code: code === '' ? null : code, error: error === '' ? null : error };
};

/** A callback is three opaque strings; anything else shaped is not a callback at all. */
const readCallback = (value: unknown): TelegramCallback | null => {
  if (typeof value === 'string') return parseFragment(value);
  if (typeof value !== 'object' || value === null) return null;
  const state: unknown = (value as { state?: unknown }).state;
  const code: unknown = (value as { code?: unknown }).code;
  const error: unknown = (value as { error?: unknown }).error;
  if (typeof state !== 'string' || state === '') return null;
  return {
    state,
    code: typeof code === 'string' && code !== '' ? code : null,
    error: typeof error === 'string' && error !== '' ? error : null,
  };
};

/** Structurally `shell/ports.ts` `SignInStep`. */
export type SignInOutcome =
  | { readonly step: 'code_sent' }
  | { readonly step: 'select_business'; readonly businesses: readonly BusinessChoice[] }
  | { readonly step: 'signed_in'; readonly display: SignInDisplay }
  | { readonly step: 'failed'; readonly failure: SignInFailure };

export interface NetOptions {
  /** Epoch milliseconds. */
  readonly now?: () => number;
  readonly timeouts?: Timeouts;
  /**
   * Where the provider returns a WEB browser — this page's own origin plus the callback file,
   * computed by `entry/` from `location`, so no origin is written into the bundle. Null when the
   * page is not on http(s) — the native carrier — and the server then owns the callback.
   */
  readonly webCallbackUrl?: string | null;
  /** Hand this browser to an external URL. `entry/` supplies it; nothing in `net/` touches `location`. */
  readonly navigate?: (url: string) => void;
}

interface Grant {
  readonly accessToken: string;
  readonly accessExpiresAt: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: number | null;
  readonly display: SignInDisplay;
  /** One sign-in; refreshes keep it. */
  readonly epoch: number;
  /** One grant; every sign-in and every refresh issues a new one. */
  readonly serial: number;
}

interface RefreshFlight {
  readonly serial: number;
  readonly result: Promise<RefreshResult>;
}

/** `IsEmail` itself is the server's; this refuses only what cannot be an address, before sending. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
/** `VerifyEmailAuthDto.code`: 4..8 digits. */
const CODE_SHAPE = /^\d{4,8}$/;
/** `LoginDto.password`: `MinLength(8)`. */
const PASSWORD_MIN = 8;

const failed = (failure: SignInFailure): SignInOutcome => ({ step: 'failed', failure });

export function createNet(options: NetOptions = {}) {
  const now = options.now ?? ((): number => Date.now());
  const webCallbackUrl = options.webCallbackUrl ?? null;
  const navigate = options.navigate ?? ((): void => undefined);
  const timeouts: Timeouts = options.timeouts ?? { requestMs: REQUEST_TIMEOUT_MS, transcribeMs: TRANSCRIBE_TIMEOUT_MS };

  let grant: Grant | null = null;
  let reason: SignedOutReason | null = null;
  let epoch = 0;
  let serial = 0;
  /** The serial of the current sign-in's first grant. */
  let epochFirstSerial = 0;
  let flight: RefreshFlight | null = null;
  /**
   * The `state` of the login THIS app started, held in memory only (A6) and spent on first use.
   *
   * It is the entire defence against a callback nobody here asked for. On iOS anything can open
   * `mayaos://oauth-callback?state=…&code=…`; an attacker who runs a Telegram login of their OWN
   * has a genuine state and code, and delivering that pair to this phone would — without this check
   * — sign the owner into the ATTACKER'S account, where everything they then did would be visible
   * to the attacker. The server cannot catch that: the pair is real. Only the client knows whether
   * it asked. A callback arriving after a restart therefore finds nothing pending and is refused,
   * which is correct rather than unfortunate.
   */
  let pendingTelegram: string | null = null;
  let landing: TelegramLanding = { state: 'none' };
  const landingListeners = new Set<(view: TelegramLanding) => void>();
  let snapshot: SessionSnapshot = { signedIn: false, reason: null };
  const listeners = new Set<(view: SessionSnapshot) => void>();

  const setLanding = (next: TelegramLanding): void => {
    landing = next;
    for (const listener of [...landingListeners]) {
      try {
        listener(next);
      } catch (error) {
        setTimeout(() => {
          throw error;
        }, 0);
      }
    }
  };

  const notify = (): void => {
    snapshot = grant === null ? { signedIn: false, reason } : { signedIn: true, display: grant.display };
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        // One failing subscriber never stops the others; the error still surfaces.
        setTimeout(() => {
          throw error;
        }, 0);
      }
    }
  };

  const expiresAtOf = (iso: string): number | null => {
    const at = Date.parse(iso);
    return Number.isFinite(at) ? at : null;
  };

  const install = (issued: SessionGrant, display: SignInDisplay, sameEpoch: number | null): Grant => {
    serial += 1;
    if (sameEpoch === null) {
      epoch += 1;
      epochFirstSerial = serial;
    }
    grant = {
      accessToken: issued.accessToken,
      accessExpiresAt: now() + issued.expiresInSec * 1000,
      refreshToken: issued.refreshToken,
      refreshExpiresAt: expiresAtOf(issued.refreshExpiresAt),
      display,
      epoch: sameEpoch ?? epoch,
      serial,
    };
    return grant;
  };

  const signIn = (issued: SessionGrant, display: SignInDisplay): void => {
    // Every new login ends the previous local epoch, even when display names
    // happen to match. All carriers clear old context before the new grant.
    if (grant !== null) {
      grant = null;
      reason = 'signed_out';
      notify();
    }
    install(issued, display, null);
    reason = null;
    flight = null;
    notify();
  };

  const end = (why: SignedOutReason): void => {
    if (grant === null) return;
    grant = null;
    serial += 1;
    flight = null;
    reason = why;
    notify();
  };

  const bearer = (current: Grant): Authorization => ({ kind: 'bearer', bearer: current.accessToken, serial: current.serial });
  const signedOut = (): Authorization => ({ kind: 'signed_out', reason: reason ?? 'signed_out' });

  /** Exactly one `/auth/refresh` per grant, however many callers ask. */
  const refreshOnce = (current: Grant): Promise<RefreshResult> => {
    if (flight !== null && flight.serial === current.serial) return flight.result;
    const result = refreshSession({ refreshToken: current.refreshToken }, timeouts.requestMs).then((settled) => {
      if (grant === current) {
        if (settled.outcome === 'granted') install(settled.value.grant, current.display, current.epoch);
        else if (settled.outcome === 'ended') end(settled.reason);
      }
      return settled;
    });
    const entry: RefreshFlight = { serial: current.serial, result };
    flight = entry;
    void result.then(() => {
      if (flight === entry) flight = null;
    });
    return result;
  };

  const refreshed = async (current: Grant): Promise<Authorization> => {
    if (current.refreshExpiresAt !== null && current.refreshExpiresAt <= now()) {
      // The refresh token has lapsed: the server would answer `session_expired`. Nothing is sent.
      if (grant === current) end('session_expired');
      return signedOut();
    }
    const settled = await refreshOnce(current);
    if (settled.outcome === 'ended') return { kind: 'signed_out', reason: settled.reason };
    // A grant from another sign-in is never handed to a call made under this one.
    if (grant === null || grant.epoch !== current.epoch) return signedOut();
    if (settled.outcome === 'unavailable') return { kind: 'unavailable', exchange: settled.exchange };
    return bearer(grant);
  };

  const authorizer: Authorizer = {
    authorize(): Promise<Authorization> {
      const current = grant;
      if (current === null) return Promise.resolve(signedOut());
      if (current.accessExpiresAt - now() < REFRESH_LEEWAY_MS) return refreshed(current);
      return Promise.resolve(bearer(current));
    },
    reauthorize(rejected: number): Promise<Authorization> {
      const current = grant;
      if (current === null) return Promise.resolve(signedOut());
      if (current.serial !== rejected) {
        // A newer grant of the same sign-in exists (another call refreshed first). Serials only grow,
        // so a rejected serial below this sign-in's first one belongs to an earlier sign-in.
        return Promise.resolve(rejected >= epochFirstSerial && rejected < current.serial ? bearer(current) : signedOut());
      }
      return refreshed(current);
    },
    refused(rejected: number): void {
      if (grant !== null && grant.serial === rejected) end('session_revoked');
    },
  };

  const session = {
    view(): SessionSnapshot {
      return snapshot;
    },

    subscribe(listener: (view: SessionSnapshot) => void): () => void {
      const own = (view: SessionSnapshot): void => listener(view);
      listeners.add(own);
      return () => {
        listeners.delete(own);
      };
    },

    /** The canonical public finder. A term under two characters is refused before any request. */
    async findBusinesses(term: string): Promise<FinderOutcome> {
      const r = await searchBusinesses(term, null, timeouts.requestMs);
      return r.ok ? { step: 'matches', businesses: r.value.items } : { step: 'failed', failure: r.failure };
    },

    /**
     * Start Telegram for the chosen business and hand the browser over. `navigate` is the last thing
     * that runs here: on success this page is leaving, so no session is installed on this side.
     */
    async startTelegram(tenantSlug: string): Promise<TelegramOutcome> {
      const business = tenantSlug.trim();
      if (business === '') return { step: 'failed', failure: { state: 'business_unavailable' } };
      const r = await telegramStart(business, webCallbackUrl, timeouts.requestMs);
      if (!r.ok) return { step: 'failed', failure: r.failure };
      // Recorded BEFORE the browser goes anywhere: on iOS the provider's page opens outside this
      // web view and the callback can arrive the moment it closes.
      pendingTelegram = r.value.state;
      setLanding({ state: 'none' });
      navigate(r.value.authUrl);
      return { step: 'handed_off' };
    },

    /** The landing's own state, for the screen that has to show it. */
    landing: (): TelegramLanding => landing,
    onLanding(listener: (view: TelegramLanding) => void): () => void {
      const own = (view: TelegramLanding): void => listener(view);
      landingListeners.add(own);
      return () => {
        landingListeners.delete(own);
      };
    },

    /**
     * Land the provider's callback: the ONE place a Telegram login becomes a session, for the web
     * and the native carrier alike. Whatever carried the callback here — a deep link the carrier
     * validated, or this page's own URL — it is the same three strings and the same path from here.
     */
    async completeTelegram(payload: unknown): Promise<TelegramLandingOutcome> {
      const callback = readCallback(payload);
      const expected = pendingTelegram;
      // Spent on sight, before anything can fail: whatever happens next, a second delivery of the
      // same callback finds nothing pending. The server refuses a replay too (`claimFlowState` is a
      // conditional update); this refuses it without spending a request.
      pendingTelegram = null;
      const refuse = (failure: FirstRunFailure): TelegramLandingOutcome => {
        setLanding({ state: 'failed', failure });
        return { step: 'failed', failure };
      };
      if (callback === null || expected === null || callback.state !== expected) return refuse({ state: 'callback_unsolicited' });
      // The provider's own refusal is not an error of ours, and it has its own sentence.
      if (callback.code === null) return refuse({ state: 'telegram_declined' });
      setLanding({ state: 'running' });
      const r = await telegramComplete(expected, callback.code, timeouts.requestMs);
      if (!r.ok) return refuse(r.failure);
      signIn(r.value.grant, r.value.display);
      setLanding({ state: 'none' });
      return { step: 'signed_in', display: r.value.display, isNewUser: r.value.isNewUser };
    },

    async startEmail(email: string): Promise<SignInOutcome> {
      const address = email.trim();
      if (!EMAIL_SHAPE.test(address)) return failed({ state: 'field_invalid', field: 'email' });
      const r = await emailStart({ email: address }, timeouts.requestMs);
      return r.ok ? { step: 'code_sent' } : failed(r.failure);
    },

    /** `tenantSlug` is null on first verify and the chosen `businesses[].slug` on re-verify (echoed as is). */
    async verifyEmail(email: string, code: string, tenantSlug: string | null): Promise<SignInOutcome> {
      const address = email.trim();
      const digits = code.trim();
      if (!EMAIL_SHAPE.test(address)) return failed({ state: 'field_invalid', field: 'email' });
      if (!CODE_SHAPE.test(digits)) return failed({ state: 'field_invalid', field: 'code' });
      if (tenantSlug !== null && tenantSlug.trim() === '') return failed({ state: 'field_invalid', field: 'business' });
      const r = await emailVerify(
        tenantSlug === null ? { email: address, code: digits } : { email: address, code: digits, tenantSlug },
        timeouts.requestMs,
      );
      if (!r.ok) return failed(r.failure);
      if (r.value.next_step === 'select_business') return { step: 'select_business', businesses: r.value.businesses };
      signIn(r.value.grant, r.value.display);
      return { step: 'signed_in', display: r.value.display };
    },

    /**
     * The business address is typed by the user and REQUIRED: an empty one is refused before any
     * request (V2-6), then the email shape and the password length, in form order.
     */
    async signInPassword(tenantSlug: string, email: string, password: string): Promise<SignInOutcome> {
      const business = tenantSlug.trim();
      if (business === '') return failed({ state: 'field_invalid', field: 'business' });
      const address = email.trim();
      if (!EMAIL_SHAPE.test(address)) return failed({ state: 'field_invalid', field: 'email' });
      if (password.length < PASSWORD_MIN) return failed({ state: 'field_invalid', field: 'password' });
      const r = await passwordLogin({ tenantSlug: business, email: address, password }, timeouts.requestMs);
      if (!r.ok) return failed(r.failure);
      signIn(r.value.grant, r.value.display);
      return { step: 'signed_in', display: r.value.display };
    },

    /**
     * Signed out locally at once (reason `signed_out`), then the server session is revoked, best
     * effort: with the current access token, or with the one an in-flight or needed refresh yields.
     */
    async signOut(): Promise<void> {
      const current = grant;
      if (current === null) return;
      const pending = flight !== null && flight.serial === current.serial ? flight.result : null;
      end('signed_out');
      let accessToken = current.accessToken;
      if (pending !== null || current.accessExpiresAt - now() < REFRESH_LEEWAY_MS) {
        // A lapsed refresh token cannot revoke anything; the server session has already expired.
        if (pending === null && current.refreshExpiresAt !== null && current.refreshExpiresAt <= now()) return;
        const settled = await (pending ?? refreshSession({ refreshToken: current.refreshToken }, timeouts.requestMs));
        if (settled.outcome !== 'granted') return;
        accessToken = settled.value.grant.accessToken;
      }
      await logoutSession(accessToken, timeouts.requestMs);
    },
  };

  return { session, transport: createTransport(authorizer, timeouts) };
}
