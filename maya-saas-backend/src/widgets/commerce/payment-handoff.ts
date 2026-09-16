// K9 — `PAYMENT_HANDOFF`, `shell.pay`, and the finance fence.
//
// The package's honest position: the commerce keys are NOT registered, so `PAYMENT_HANDOFF` is not
// emittable. The correct emission is a `LIMITATION` carrying the mapped `capability_gap_ref` and
// NO INTENT — a widget that says "payment is not available here, and here is why" rather than one
// that offers a button which cannot work.
//
// That is the whole design decision, and it is deliberate: all 92 MONEY capabilities are gap-keyed,
// `crm.visit.payment.v1` is DENY, and nothing in this file can mint a commit for any of them.
//
// What `shell.pay` carries is one opaque server-minted `session_ref` and NOTHING ELSE. The wire
// format has no member able to hold a provider URL, a checkout id or a card token — which is the
// same guarantee as BUTTON → ENDPOINT, applied where the stakes are money.

import { randomBytes } from 'node:crypto';

/** The shape the contract fixes. One field, and its own pattern. */
export const SESSION_REF_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface ShellPaySession {
  readonly session_ref: string;
}

/**
 * Mint a `shell.pay` session.
 *
 * Returns a bare object with exactly one key. It is built by literal rather than by spreading
 * anything, so a caller cannot widen it by passing extra fields — the absence of a URL member is
 * structural, not a matter of remembering to strip one.
 */
export const mintShellPaySession = (): ShellPaySession => ({
  session_ref: randomBytes(24).toString('base64url').slice(0, 32),
});

export const isValidSessionRef = (ref: string): boolean =>
  SESSION_REF_PATTERN.test(ref);

export interface LimitationBody {
  readonly kind: 'LIMITATION';
  readonly reason: string;
  readonly capability_gap_ref: string;
  /** Always empty. A LIMITATION that carried an intent would be an offer, not a limitation. */
  readonly intents: readonly never[];
}

/**
 * What K9 emits instead of a payment widget, while the owner is unregistered.
 *
 * `commit_intent` is not merely null here — the returned body has no such member at all, and the
 * exit criterion is "PAYMENT_HANDOFF bodies emitted with a non-null commit_intent while the owner
 * is unregistered = 0". Zero is easiest to guarantee when the field does not exist.
 */
export const paymentUnavailable = (gapRef: string): LimitationBody => ({
  kind: 'LIMITATION',
  reason:
    'payment is not reachable from chat: the commerce capability is not registered',
  capability_gap_ref: gapRef,
  intents: [],
});

/**
 * The registration gate. While this returns false — which it does, and the mapping says it should —
 * `PAYMENT_HANDOFF` is not emittable and `paymentUnavailable()` is the correct emission.
 *
 * It is a function rather than a constant so that the day the owner IS registered, one place
 * changes and every caller follows. It is not a feature flag: flipping it without registering the
 * capability would produce a widget whose commit has no owner to reach.
 */
export const commerceOwnerRegistered = (): boolean => false;

export class FinanceFenceRefusal extends Error {}

/**
 * The fence every commerce emission passes through.
 *
 * It refuses rather than degrades. A payment affordance that half-works is worse than one that is
 * absent, because a person will try it.
 */
export const assertEmittable = (kind: string): void => {
  if (kind === 'PAYMENT_HANDOFF' && !commerceOwnerRegistered())
    throw new FinanceFenceRefusal(
      'PAYMENT_HANDOFF is blocked on capability registration; emit a LIMITATION with its gap ref',
    );
};
