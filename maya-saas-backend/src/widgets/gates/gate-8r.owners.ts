// Gate 8-R's owner set: the server-published closed affirmation vocabulary, and nothing else.
//
// WHY THIS FILE HOLDS A NULL. Row 8-R (C11:4728) requires the affirmation to be "an exact member of
// the server-published closed affirmation vocabulary for the envelope's locale". Nothing in V1.1
// states that vocabulary's members, its owner, its publication or the locale source (G8R A1/A2), and
// the ruling packet settles the question out of this cycle: "The readback vocabulary waits for a
// SPOKEN carrier; voice uses the typed path" (PKT:471). Which spoken words commit a booking is a
// security decision, so it is the owner's to make and not an implementer's to guess.
//
// So the port is DECLARED and BOUND TO NULL. A required readback then refuses, every time, and the
// refusal is the honest answer: an unruled vocabulary admits no member. The alternative — accepting
// any non-empty string until the ruling lands — is the branch where "not built yet" and "allowed"
// are the same, which F5 forbids. GATES-PLAN-V11 §0.5's U class exists for exactly this shape, and its
// third duty is what this file serves: the mechanism is complete against its owner interface, and only
// its content is missing.
//
// `Gate8ROwners` is declared HERE rather than in `gate.types.ts` because that file is integrator-only
// (GATES-PLAN-V11 §2.1) and U8R may not edit it. Nothing else needs it: slot 8-R passes the value to
// `gate8R`, and the gateway names it only through `GATE_8R_OWNERS` (`di-tokens.ts`, I-CTX).

import type { IntentRecordRow } from '../gate.types';

/**
 * The one owner Gate 8-R may ask anything of.
 *
 * `isReadbackAffirmation` receives the affirmation EXACTLY as the client submitted it — no trim, no
 * case fold, no Unicode normalisation. "Exact member" is the clause, and a gate that normalised
 * first would decide membership itself while appearing to ask. The owner resolves the envelope's
 * locale from the record it is handed (A2); no locale, header or profile is passed, because none of
 * them is an input of this gate's antecedent (R3.8.3, INV-30, C3).
 *
 * `null` is the production value until A1/A2 are ruled: the vocabulary has no members, so no
 * affirmation is one.
 */
export interface Gate8ROwners {
  readonly isReadbackAffirmation:
    | null
    | ((input: {
        readonly affirmation: string;
        readonly record: IntentRecordRow;
      }) => boolean);
}

/**
 * The production binding (R8R-1), and the default `gate8R` uses until the gateway injects the token.
 * Frozen, so a test or a later module cannot quietly give the gate a vocabulary by assignment.
 *
 * T-BIND asserts that what the real `WidgetsModule` resolves for `GATE_8R_OWNERS` is this value, so
 * the day a vocabulary is ruled the binding changes in one commit, beside the test that pins it.
 */
export const GATE_8R_OWNERS_UNRULED: Gate8ROwners = Object.freeze({
  isReadbackAffirmation: null,
});
