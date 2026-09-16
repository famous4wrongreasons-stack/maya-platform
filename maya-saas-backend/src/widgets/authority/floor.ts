// K4 — the floor lookup over the four bound spaces, and the sensitive-destination test.
//
// Two functions, and both are TOTAL by construction rather than by a default branch. A default
// branch is where a floor goes to die: `default: return 'ANONYMOUS'` reads as tidy and means "any
// capability I have not thought about is public".

import type { VerificationLevel } from '../../widget-contract/envelope';
import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import {
  CONTROL_KEYS,
  type CapabilityRefLike,
  resolves,
} from './registry-binding';

/** The top rung: what an unresolvable subject gets, so that it cannot be acted on by anyone. */
const FAIL_CLOSED: VerificationLevel = 'STEP_UP_VERIFIED';

/**
 * §0.7 F27's per-key control floor, total over the three keys the space is closed at.
 *
 * Exported so the coincidence it relies on is asserted rather than assumed: this table's key set
 * must EQUAL `CONTROL_KEYS`. While they coincide the `?? FAIL_CLOSED` below is unreachable, which
 * is the correct state — a key in the space with no floor row is a defect to be caught at the
 * boundary, not softened by a default.
 */
export const CONTROL_FLOOR: Readonly<Record<string, VerificationLevel>> =
  Object.freeze({
    'control.widget.dismiss': 'ANONYMOUS',
    'control.run.cancel': 'BOUND_CLIENT',
    'control.delivery.resolve': 'BOUND_CLIENT',
  });

const c9ByKey = (): ReadonlyMap<string, (typeof C9_CAPABILITIES)[number]> =>
  new Map(C9_CAPABILITIES.map((c) => [c.capabilityKey, c]));

/**
 * The subject's OWN floor — the term FLOOR_EXEMPT never waives.
 *
 * C9 derives it from the capability's mode and resource class, which is where the orchestrator
 * already states how much authority a call needs. TOOL keys are C9 keys by spelling (F24), so they
 * resolve through the same row rather than through a parallel table that could disagree with it.
 * CONTROL is the contract's closed set. AE has no per-key floor of its own in K4 and takes the
 * family floor, which is the conservative reading until K11 binds the Action Engine's own policy.
 */
export const subjectFloorFor = (
  ref: CapabilityRefLike | null,
): VerificationLevel => {
  if (!ref || !resolves(ref)) return FAIL_CLOSED;

  switch (ref.space) {
    case 'C9':
    case 'TOOL': {
      const row = c9ByKey().get(ref.key);
      if (!row) return FAIL_CLOSED;
      // A capability that hands off to an owner, or writes through a proposal, needs a bound
      // client at minimum; a pure read of a source needs channel identity; the single LOCAL row
      // (c9.no_action) needs nothing, and is the one the contract names as keeping its own floor.
      if (row.resourceClass === 'LOCAL') return 'ANONYMOUS';
      if (row.mode === 'OWNER_HANDOFF' || row.mode === 'PROPOSE_ONLY')
        return 'BOUND_CLIENT';
      return 'CHANNEL_IDENTITY';
    }
    case 'CONTROL':
      // A TABLE over the three keys, not a test for one name. §0.7 F27 states a CONTROL_FLOOR per
      // key, and the ternary this replaces would have silently given ANONYMOUS to any key added
      // later — which is how a floor becomes a hole. `?? FAIL_CLOSED` keeps it total: a CONTROL
      // key that resolves in the space but has no floor row gets the top rung, not the bottom.
      //
      // control.run.cancel is BOUND_CLIENT per §3.4 and keeps that floor through FLOOR_EXEMPT;
      // dismiss is presentation and needs only that the caller is the principal the widget was
      // minted for, which Gate 3 has already established by the time a control is routed;
      // delivery.resolve decides who receives what, so it is BOUND_CLIENT.
      return CONTROL_FLOOR[ref.key] ?? FAIL_CLOSED;
    case 'AE':
      // Conservative until K11: an Action Engine capability is a business effect, and a business
      // effect is not reachable below a bound client.
      return 'BOUND_CLIENT';
    default:
      return FAIL_CLOSED;
  }
};

/**
 * Is this destination sensitive — money, personal data, or an identity binding?
 *
 * Fail-closed, and the asymmetry is deliberate: a false positive costs a confirmation, a false
 * negative costs an unconfirmed effect on someone's money or personal data. Those are not the same
 * mistake, so they do not get the same default.
 */
export const sensitiveDest = (ref: CapabilityRefLike | null): boolean => {
  if (!ref || !resolves(ref)) return true;

  if (ref.space === 'CONTROL') return !CONTROL_KEYS.has(ref.key);
  if (ref.space === 'AE') return true; // every Action Engine edge is a business effect

  const row = c9ByKey().get(ref.key);
  if (!row) return true;
  // A pure source read of non-personal data is the only thing that is not sensitive. Anything that
  // proposes, hands off, or touches an owner is.
  if (row.mode !== 'READ') return true;
  const SENSITIVE_MARKERS = [
    'client',
    'payment',
    'money',
    'finance',
    'consent',
    'identity',
    'contact',
  ];
  return SENSITIVE_MARKERS.some((m) => row.capabilityKey.includes(m));
};
