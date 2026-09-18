// U12a — L1(2), the composer service. In this unit it answers `degraded` and reads NOTHING.
//
// Row 12 (C11:4732) hosts the data fence in "Projector", and F7 (C11:136) fixes what a projector is:
// "the registered projector builds `body` from one capability read or one orchestrator-state read …
// the body is never offered to the minter; the answer degrades to plain text". Two sentences, and the
// second one is the whole of U12a: WITH NO REGISTERED ROW THERE IS NO READ, AND THE ANSWER DEGRADES.
//
// That is why the skeleton is worth landing before the rows. `degraded` here is not "not built yet
// therefore allowed": there is no branch in this file that can answer from an owner, so nothing can
// leak through it. The unit that adds the rows (U12b) adds the port call at ONE site, and every fence
// that governs it — ARCH-12-1 (the reference list), -5 (what may bind an argument), -6 (what the
// outcome may carry), -8 (whose authority a read runs under), -12 (NAVIGATE reads nothing), -13 (no
// row without its blocker gone) — is already standing and already tested when it does.
//
// DEV-1 (GATES-PLAN-V11 §0.4), stated here because this file is where it lives: `composeNavigate`
// answers `degraded` with ZERO reads for every NAVIGATE class. That DEPARTS from certified row 13
// ("`NAVIGATE` / `REFINE` -> projector -> `next_envelope`", C11:4733) and from row 12's NAVIGATE body
// (C11:4732). It is the plan's fail-closed interim, not a STOP and not a reading of the text: a
// within-text re-projection of a `detail` or `w` target must read `provenance.source_capability`,
// which §0.4 F15 fails (C11:7373). G12-R1b, G12-I11 and G13-R2 are therefore `false` with
// `reason: "not built (DEV-1; OD-1)"`, and the owner is asked to accept DEV-1 or direct otherwise
// (OD-1 (ii)). NOTHING HERE DECIDES THAT QUESTION, and no test in this unit flips those clauses.

import { Injectable } from '@nestjs/common';

import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { ProjectionPlan } from './canonical-read.port';
import { projectorRowFor, ROWS_BLOCKED_BY } from './projector.registry';

/**
 * Why a composition produced no body. A CLOSED set of literals, authored here and derived from nothing
 * the owner said — the projector makes no port call in this unit, so it holds no owner byte to leak
 * into one. It is not a `reason_code`, a Cell `state` or a label: those are the minter's and the reason
 * table's, and ARCH-12-6 keeps them out of this file.
 */
export type DegradedReason =
  /** No row answers `(tapped_kind, subject_key)` — in U12a, no row answers anything. */
  | 'no_registered_row'
  /** DEV-1: every `NAVIGATE`, whatever its target class. Zero reads, by absence. */
  | 'navigate_interim'
  /** I47: no live principal or no actor. A read under nobody's authority is not a read we make. */
  | 'no_principal'
  /**
   * A row is registered and `CanonicalReadPort` has no binding in this unit. Unreachable while
   * ARCH-12-13 holds; it exists so that a row landing without its port is a degrade rather than a
   * composition made up from somewhere else.
   */
  | 'port_unbound';

/**
 * What Gate 13's edges consume (PLAN G12 §5.2). `composer_input` is the ONLY type a projector may hand
 * the minter (C11:2143), and `source` is the in-memory owner artefact P3/P5 are checked against at
 * `EP-MINT` — it is never persisted by this service and never returned to a client.
 *
 * ARCH-12-6: the input member is typed `WidgetComposerInput` exactly, so it cannot carry
 * `masked_fields`, `presentation_mode`, `pii_class`, a Cell `state`, a `reason_code` or a `label`. Those
 * are D- and M-class members of the envelope, produced by `AuthorityResolver`, the minter and the
 * formatter. A projector that authored one would be deciding presentation from inside a read.
 */
export type ProjectionOutcome =
  | {
      readonly kind: 'composer_input';
      readonly input: WidgetComposerInput;
      readonly source: unknown;
    }
  | { readonly kind: 'degraded'; readonly why: DegradedReason };

@Injectable()
export class WidgetProjectorService {
  /**
   * `REFINE` whose C9 subject is a `READ` (including `c9.no_action`). One registry lookup, then — in
   * U12b — exactly one port call. In U12a the lookup finds nothing and the answer degrades.
   */
  compose(plan: ProjectionPlan): ProjectionOutcome {
    if (!this.hasPrincipal(plan)) return degraded('no_principal');
    const row = projectorRowFor(plan.widgetKind, subjectKeyOf(plan));
    if (row === null) return degraded('no_registered_row');
    // Unreachable while `PROJECTOR_REGISTRY` is empty (ARCH-12-13). It stays honest rather than
    // becoming a stub that answers: a registered row with no bound port has no answer to give.
    return degraded('port_unbound');
  }

  /**
   * `REFINE` routed to a canonical propose owner (F78, R3.10.6): Gate 13 calls the owner, and the
   * projector composes FROM the owner's response through the row's static slot map.
   *
   * In U12a the response is NEVER READ. With no row there is no slot map to bind it through, and a byte
   * copied without a map is a leak with no fence — so the parameter is named, to fix the signature U12b
   * implements, and discarded.
   */
  composeFromOwnerResponse(
    plan: ProjectionPlan,
    ownerResponse: unknown,
  ): ProjectionOutcome {
    void ownerResponse;
    if (!this.hasPrincipal(plan)) return degraded('no_principal');
    return degraded('no_registered_row');
  }

  /**
   * `NAVIGATE`, any target class — DEV-1. It looks NOTHING up: no registry read, no port call, no
   * branch on the target's class. ARCH-12-12 holds that at the source, so "zero reads" is a property of
   * this method's shape rather than a consequence of the registry happening to be empty.
   *
   * Class `c` is permitted on no kind in this contract version (C11:2801), and `detail`/`w` need the
   * F15-failing `provenance.source_capability` (C11:7373); so every class lands here, and the answer is
   * the same for all of them.
   */
  composeNavigate(plan: ProjectionPlan): ProjectionOutcome {
    if (!this.hasPrincipal(plan)) return degraded('no_principal');
    return degraded('navigate_interim');
  }

  /**
   * I47 / ARCH-12-8: the precondition every read is dominated by. A guest session Gate 2 admits has no
   * live C9 principal, and the answer to that is `degraded` — never a read made under an actor the
   * projector chose, and never a principal this directory constructed.
   */
  private hasPrincipal(plan: ProjectionPlan): boolean {
    return plan.authority !== null && plan.actor !== null;
  }
}

/** `(space, key)` as the C9 canon spells it. `null` when the record names no subject. */
export const subjectKeyOf = (plan: ProjectionPlan): string | null =>
  plan.capabilitySpace === null || plan.capabilityKey === null
    ? null
    : `${plan.capabilitySpace}:${plan.capabilityKey}`;

const degraded = (why: DegradedReason): ProjectionOutcome => ({
  kind: 'degraded',
  why,
});

/** Read by ARCH-12-13's live half: the skeleton shipped dark, and it says why. */
export const projectorRowsBlockedBy = (): readonly string[] => ROWS_BLOCKED_BY;
