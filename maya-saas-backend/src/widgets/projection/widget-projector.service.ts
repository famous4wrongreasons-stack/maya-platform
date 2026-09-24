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

import { Inject, Injectable } from '@nestjs/common';

import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import { CANONICAL_READ } from '../di-tokens';
import type {
  CanonicalOwnerResponse,
  CanonicalReadPort,
  ProjectionPlan,
} from './canonical-read.port';
import {
  projectorRowFor,
  projectorRowForCompletedRead,
  ROWS_BLOCKED_BY,
  type ProjectorArgumentSource,
  type ProjectorRow,
} from './projector.registry';
import { projectC9Denial } from '../rendering/denial-projection';
import { validateLocalBusinessDate } from '../query-scalars/local-business-date';

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
  | 'port_unbound'
  /** The live actor and the resolved C9 principal do not describe the same tenant/user. */
  | 'authority_mismatch'
  /** The canonical owner omitted a field this registered row needs; B-16 renders a text turn. */
  | 'missing_source_field';

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
  constructor(
    @Inject(CANONICAL_READ)
    private readonly canonicalRead: CanonicalReadPort,
  ) {}

  /**
   * `REFINE` whose C9 subject is a `READ` (including `c9.no_action`). One registry lookup, then — in
   * U12b — exactly one port call. In U12a the lookup finds nothing and the answer degrades.
   */
  async compose(plan: ProjectionPlan): Promise<ProjectionOutcome> {
    if (!this.hasPrincipal(plan)) return degraded('no_principal');
    if (!this.sameAuthority(plan)) return degraded('authority_mismatch');
    const row = projectorRowFor(plan.widgetKind, subjectKeyOf(plan));
    if (row === null) return degraded('no_registered_row');
    if (row.composition !== 'canonical_read')
      return degraded('no_registered_row');
    const result = await this.canonicalRead.read({
      plan,
      row,
      ownerArguments: this.ownerArguments(plan, row),
    });
    if (result.kind === 'value' && !hasRequiredFields(result.value, row))
      return degraded('missing_source_field');
    const limitationCodes =
      result.kind === 'owner_exception'
        ? [projectC9Denial(result.denial_code).reason_code]
        : [];
    return this.outcome(
      plan,
      row,
      result.kind === 'value' ? result.value : null,
      result.fact,
      limitationCodes,
    );
  }

  /**
   * P-MT2a: project the result of the canonical READ that just completed.
   * This method never invokes the owner again. It applies the same principal,
   * row and required-field fences before allowing that already-authorized
   * result to enter the composer.
   */
  composeCompletedRead(
    plan: ProjectionPlan,
    ownerResponse: CanonicalOwnerResponse,
  ): ProjectionOutcome {
    if (!this.hasPrincipal(plan)) return degraded('no_principal');
    if (!this.sameAuthority(plan)) return degraded('authority_mismatch');
    const subject = subjectKeyOf(plan);
    if (subject === null) return degraded('no_registered_row');
    const row = projectorRowForCompletedRead(subject as `C9:${string}`);
    if (row === null || row.result_kind !== plan.widgetKind)
      return degraded('no_registered_row');
    if (!hasRequiredFields(ownerResponse.value, row))
      return degraded('missing_source_field');
    return this.outcome(
      plan,
      row,
      ownerResponse.value,
      ownerResponse.fact,
      ownerResponse.limitation_codes ?? [],
    );
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
    if (!this.hasPrincipal(plan)) return degraded('no_principal');
    if (!this.sameAuthority(plan)) return degraded('authority_mismatch');
    const row = projectorRowFor(plan.widgetKind, subjectKeyOf(plan));
    if (row === null || row.composition !== 'owner_response')
      return degraded('no_registered_row');
    if (!isCanonicalOwnerResponse(ownerResponse))
      return degraded('missing_source_field');
    if (!hasRequiredFields(ownerResponse.value, row))
      return degraded('missing_source_field');
    return this.outcome(
      plan,
      row,
      ownerResponse.value,
      ownerResponse.fact,
      ownerResponse.limitation_codes ?? [],
    );
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

  private sameAuthority(plan: ProjectionPlan): boolean {
    if (plan.authority === null || plan.actor === null) return false;
    if (plan.actor.tenantId !== plan.authority.tenantId) return false;
    return (
      plan.authority.userId === null ||
      plan.actor.userId === plan.authority.userId
    );
  }

  private ownerArguments(
    plan: ProjectionPlan,
    row: ProjectorRow,
  ): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [name, source] of Object.entries(row.arguments))
      out[name] = argumentValue(plan, source);
    return Object.freeze(out);
  }

  private outcome(
    plan: ProjectionPlan,
    row: ProjectorRow,
    source: unknown,
    fact: CanonicalOwnerResponse['fact'],
    limitationCodes: readonly string[],
  ): ProjectionOutcome {
    // `AdmissionFacts` also has a member named `facts`. Keep the composer boundary explicit so the
    // gate source fence does not mistake this unrelated provenance array for a slot fact write.
    const composerFactsKey: keyof WidgetComposerInput = 'facts';
    const input: WidgetComposerInput = {
      kind_proposal: row.result_kind,
      capability: row.subject_key.slice(3),
      capability_version: C9_REGISTRY_HASH,
      source:
        row.source_kind === 'orchestrator_state'
          ? {
              from: 'orchestrator_state',
              run_id: plan.runId as string,
              field: 'runStatus',
            }
          : {
              from: 'capability_envelope',
              capability: row.subject_key.slice(3),
              capability_version: C9_REGISTRY_HASH,
              fact_index: 0,
            },
      correlation_refs: {
        ...(plan.runId === null ? {} : { run_id: plan.runId }),
        parent_id: plan.widgetId,
      },
      origin: {
        trigger: 'system_reply',
        emitter:
          row.source_kind === 'orchestrator_state'
            ? 'orchestrator'
            : 'capability_read',
        moment_key: null,
        proactive_provenance: null,
      },
      [composerFactsKey]: [fact],
      facts_origin: [
        row.composition === 'owner_response' ? 'copied' : 'synthesised',
      ],
      slots: { ...row.slots },
      limitation_codes: [...limitationCodes],
      intent_proposals: [...row.intent_proposals],
      locale: 'ru-RU',
    };
    return { kind: 'composer_input', input, source };
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

const argumentValue = (
  plan: ProjectionPlan,
  source: ProjectorArgumentSource,
): unknown => {
  if (source.from === 'closed_input')
    return plan.closedInputs?.get(source.name) ?? null;
  if (source.from === 'retained_local_business_date')
    return plan.retainedLocalBusinessDate === null
      ? null
      : validateLocalBusinessDate(plan.retainedLocalBusinessDate);
  if (plan.resolvedNouns !== null)
    return plan.resolvedNouns.values.get(source.handle) ?? null;
  return null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasRequiredFields = (value: unknown, row: ProjectorRow): boolean =>
  isRecord(value) &&
  row.required_fields.every((field) =>
    Object.prototype.hasOwnProperty.call(value, field),
  );

const isCanonicalOwnerResponse = (
  value: unknown,
): value is CanonicalOwnerResponse =>
  isRecord(value) &&
  Object.prototype.hasOwnProperty.call(value, 'value') &&
  Object.prototype.hasOwnProperty.call(value, 'fact');
