// K12 — `CONSENT_STATE` and `IDENTITY_BINDING`.
//
// Two kinds whose whole job is to SHOW a decision and name where it can be changed. The accept /
// decline control is not "omitted for now" — it is not expressible: `permitted_effects` are NONE,
// CONTROL and HANDOFF, and CONSENT.1 rejects any intent whose role is not `handoff` or `escape`.
// There is no code path here that could produce a decision-carrying intent, which is what the exit
// «consent records written on channel identity alone = 0» rests on. It is zero because the widget
// layer writes no consent record at all, on any identity.
//
// Both kinds are BLOCKED ON CAPABILITY REGISTRATION today: `MAYA_AI_TOOL_CATALOG` has 47 names and
// none contains `consent`, `identity` or `privacy`, so `ownerClassKeys(kind) ∩ REGISTERED_KEYS = ∅`
// and K20 derives `emittable = false`. The correct emission is then a LIMITATION carrying the
// mapped `capability_gap_ref` and NO intent — which is what `composeConsentState` returns.

import { MAYA_AI_TOOL_CATALOG } from '../../ai-tools/ai-tool.catalog';
import type {
  ConsentStateBody,
  IdentityBindingBody,
} from '../../widget-contract/kinds';
import { meets } from '../authority/ladder';
import {
  ConsentFenceRefusal,
  assertSensitiveSubjectAdmissible,
  type MintedIntentLike,
} from './data-subject-acts';

/**
 * The class-`s` destinations these kinds may hand off to, and the shell route each resolves to.
 *
 * Two spellings for one place is how destination lists drift, so the mapping is declared rather
 * than assumed: the contract names `shell.privacy`, the shell's route registry names
 * `privacy-and-data`, and the spec asserts every value here is a live route in that registry.
 */
export const SENSITIVE_DESTINATIONS: Readonly<Record<string, string>> =
  Object.freeze({
    'shell.privacy': 'privacy-and-data',
    'shell.connections': 'connections',
  });

export const resolvesToLiveShellRoute = (destination: string): boolean =>
  Object.prototype.hasOwnProperty.call(SENSITIVE_DESTINATIONS, destination);

// ── K23 — emittability, derived at registry load, never authored ─────────────────────────────────

const READ_OWNER_MARKERS = ['consent', 'identity', 'privacy'];

/**
 * Is a consent- or identity-READ owner registered?
 *
 * Derived by executing the catalogue, not by a flag. It returns false today and the count is
 * asserted in the spec, so the day a read key IS registered this flips on its own rather than
 * waiting for someone to remember a boolean.
 */
export const consentReadOwnerRegistered = (): boolean =>
  MAYA_AI_TOOL_CATALOG.some((t: { name: string }) =>
    READ_OWNER_MARKERS.some((m) => t.name.includes(m)),
  );

export interface LimitationBody {
  readonly kind: 'LIMITATION';
  readonly reason: string;
  readonly capability_gap_ref: string;
  /** Always empty. A LIMITATION carrying an intent would be an offer, not a limitation. */
  readonly intents: readonly never[];
}

// ── CONSENT.1 … CONSENT.6, applied to every intent on either kind ────────────────────────────────

export interface ConsentIntentLike extends MintedIntentLike {
  readonly role: string;
  readonly destination?: string | null;
  /** Derived server-side. There is no emitter-supplied floor field anywhere — CONSENT.3. */
  readonly derived_floor?: string | null;
}

const ROLES_PERMITTED = ['handoff', 'escape'];

/**
 * The kind-level clause, evaluated before the seal is computed.
 *
 * The escape is excluded from the floor and destination checks for the reason the contract gives
 * and it is worth restating: it carries no capability, no target and no consent decision — and a
 * rule that refused it would make the kind unmintable outright, which is a fence no envelope can
 * satisfy, which is not a fence.
 */
export const assertConsentIntentAdmissible = (
  intent: ConsentIntentLike,
): void => {
  // CONSENT.1 — the accept/decline control is not expressible on this kind.
  if (!ROLES_PERMITTED.includes(intent.role))
    throw new ConsentFenceRefusal(
      `role '${intent.role}' is not expressible on a consent or identity kind`,
    );

  // CONSENT.4 — nothing here is collected. Applies to the escape too: an escape that collected
  // input would be a form wearing an escape's name.
  if (intent.input_schema !== undefined && intent.input_schema !== null)
    throw new ConsentFenceRefusal(
      'no intent on a consent or identity kind may carry an input_schema',
    );

  if (intent.role === 'escape') return;

  // CONSENT.2 — a derived floor, a named destination, and a live route. All three.
  assertSensitiveSubjectAdmissible(intent);

  // CONSENT.3 — the floor is server-derived and compared on K4's ladder. There is one ladder.
  if (
    !intent.derived_floor ||
    !meets(intent.derived_floor as never, 'SESSION_VERIFIED')
  )
    throw new ConsentFenceRefusal(
      `derived floor ${String(intent.derived_floor)} is below SESSION_VERIFIED`,
    );

  if (!intent.destination || !resolvesToLiveShellRoute(intent.destination))
    throw new ConsentFenceRefusal(
      `destination ${String(intent.destination)} does not resolve to a live shell route`,
    );
};

// ── Composition ──────────────────────────────────────────────────────────────────────────────────

export interface ConsentStateInput {
  readonly consent_kind: ConsentStateBody['consent_kind'];
  readonly body: Omit<
    ConsentStateBody,
    'change_handoff_intent' | 'capability_gap_ref'
  >;
  readonly gapRef: string;
  readonly handoff?: ConsentIntentLike | null;
}

/**
 * Compose a `CONSENT_STATE` emission, or the LIMITATION that stands in for it.
 *
 * CONSENT.5 is the branch: when the change owner is absent, `capability_gap_ref` is set and
 * `change_handoff_intent` is null, and the text says plainly that the change cannot be made here
 * yet. A gap-blocked control is prose, never a disabled-styled button — there is no member on the
 * returned body that a renderer could style into one.
 */
export const composeConsentState = (
  input: ConsentStateInput,
): ConsentStateBody | LimitationBody => {
  if (!consentReadOwnerRegistered())
    return Object.freeze({
      kind: 'LIMITATION' as const,
      reason:
        'your consent record cannot be shown here yet: the consent-register read capability is not registered',
      capability_gap_ref: input.gapRef,
      intents: [],
    });

  if (input.handoff) assertConsentIntentAdmissible(input.handoff);

  return Object.freeze({
    ...input.body,
    consent_kind: input.consent_kind,
    change_handoff_intent: input.handoff ? 'i1' : null,
    capability_gap_ref: input.handoff ? null : input.gapRef,
  });
};

export interface IdentityBindingInput {
  readonly body: Omit<IdentityBindingBody, 'capability_gap_ref'>;
  readonly gapRef: string;
  readonly handoffs?: readonly ConsentIntentLike[];
}

/** IDENTITY.1–IDENTITY.6 are CONSENT.1–CONSENT.6 verbatim, so they are the same function. */
export const composeIdentityBinding = (
  input: IdentityBindingInput,
): IdentityBindingBody | LimitationBody => {
  if (!consentReadOwnerRegistered())
    return Object.freeze({
      kind: 'LIMITATION' as const,
      reason:
        'your linked channels cannot be shown here yet: the identity-binding read capability is not registered',
      capability_gap_ref: input.gapRef,
      intents: [],
    });

  for (const h of input.handoffs ?? []) assertConsentIntentAdmissible(h);

  return Object.freeze({
    ...input.body,
    capability_gap_ref: (input.handoffs ?? []).length ? null : input.gapRef,
  });
};

/**
 * CONSENT.6 — content is mode-invariant.
 *
 * "An owner cannot change a client's consent from chat any more than a client can." The check is
 * over the intent SET, not over the rendering: if two presentation modes produce different intent
 * sets on this kind, one of them added an affordance, and which mode did it is not interesting.
 */
export const intentSetsAgreeAcrossModes = (
  perMode: readonly (readonly string[])[],
): boolean => {
  if (!perMode.length) return true;
  const key = (s: readonly string[]) => [...s].sort().join('|');
  const first = key(perMode[0]);
  return perMode.every((s) => key(s) === first);
};
