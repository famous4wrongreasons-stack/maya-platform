// K13 — PR1, PR2 and PR3: what a proactive envelope may carry, and where its words came from.
//
// The first edition wrote `authority_basis: 'pre_authorized_presentation'` as a literal and checked
// that the string was that string. A scheduler could read live data, compose a growth plan nobody
// asked for, and emit it under a literal asserting it was pre-authorised. `ProactiveProvenance` is
// the structural carrier that replaces the literal: the artefact must exist, must predate the
// emission, and the words must be either a frozen template render or a verbatim copy of a stored
// field. There is no third source, so newly-composed strategy is not expressible.

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import type { ProactiveProvenance } from '../../widget-contract/lifecycle';
import type { CapabilityRefLike } from '../authority/registry-binding';
import { MOMENT_REGISTRY, momentTemplateFor } from './moments';
import { sha256Hex } from '../token.util';

export class ProactiveRefusal extends Error {}

/**
 * `authority_basis` has exactly one legal value, and it is a type with one member rather than a
 * string that happens to hold one. G22's exit is "`authority_basis` legal values = 1"; a union of
 * one is how that becomes unfalsifiable rather than merely true today.
 */
export const AUTHORITY_BASIS = 'pre_authorized_presentation' as const;
export type AuthorityBasis = typeof AUTHORITY_BASIS;

// ── PR1 — the effect ceiling, stated once ────────────────────────────────────────────────────────

/**
 * `origin.trigger === 'proactive'` ⟹ every intent's effect ∈ {NONE, NAVIGATE, REFINE, HANDOFF}.
 *
 * No DRAFT. The first edition capped proactive at DRAFT while two sibling documents capped it at
 * REFINE, and the loosest of the three was normative. A scheduled DRAFT is a server-owned booking
 * or settings draft created with no human in the loop — that is the line between presenting
 * information and starting work.
 */
export const PROACTIVE_EFFECT_CEILING = [
  'NONE',
  'NAVIGATE',
  'REFINE',
  'HANDOFF',
] as const;

export const assertProactiveCeiling = (effects: readonly string[]): void => {
  const over = effects.filter(
    (e) => !(PROACTIVE_EFFECT_CEILING as readonly string[]).includes(e),
  );
  if (over.length)
    throw new ProactiveRefusal(
      `proactive envelope carries ${over.join(', ')}; the ceiling is ${PROACTIVE_EFFECT_CEILING.join('/')}`,
    );
};

// ── PR2 — no autonomous loop through the proactive door ──────────────────────────────────────────

const c9Mode = (key: string): string | undefined =>
  (
    C9_CAPABILITIES as readonly {
      capabilityKey: string;
      mode?: string;
    }[]
  ).find((c) => c.capabilityKey === key)?.mode;

/**
 * `RUN_OPENING(ref)` — does this capability open or continue a C9 run?
 *
 * Stated ref-NULLABLY on purpose. `subjectCapability(i)` returns null for a NONE effect and for
 * every `w`/`i`/`s`/`detail` NAVIGATE, and on a proactive envelope a null subject is the normal
 * case, not the edge case — a certification round caught exactly this: a predicate that read
 * `ref.space` off null would have made every proactive announcement unmintable.
 *
 * The `?? 'PROPOSE_ONLY'` default is the fail-closed direction: an UNREGISTERED C9 key satisfies
 * RUN_OPENING and is therefore refused on a proactive envelope.
 */
export const isRunOpening = (ref: CapabilityRefLike | null): boolean => {
  if (ref === null) return false; // no capability exercised: nothing to open a run with
  if (ref.space !== 'C9') return false;
  return (c9Mode(ref.key) ?? 'PROPOSE_ONLY') !== 'READ';
};

export const assertNoRunOpening = (
  refs: readonly (CapabilityRefLike | null)[],
): void => {
  const opener = refs.find(isRunOpening);
  if (opener)
    throw new ProactiveRefusal(
      `${opener.key} opens or continues a run; a proactive envelope may not carry it`,
    );
};

/** PR2's second half: an IntentRecord minted from a proactive envelope has a null `run_ref`. */
export const assertNoRunRef = (
  records: readonly { run_ref: string | null }[],
): void => {
  const leaked = records.filter((r) => r.run_ref !== null);
  if (leaked.length)
    throw new ProactiveRefusal(
      `${leaked.length} proactive intent records carry a run_ref; PR2 requires null`,
    );
};

// ── PR3 — provenance ─────────────────────────────────────────────────────────────────────────────

export const sha256 = (s: string): string => sha256Hex(s);

export interface CanonicalArtefact {
  readonly artefact_ref: string;
  readonly artefact_kind: ProactiveProvenance['artefact_kind'];
  readonly created_at: string;
  /** The stored narrative field, when there is one. `narrative_source: 'stored_artefact'` copies it. */
  readonly narrative?: string | null;
}

/**
 * PR3a — the referenced artefact must predate the emission.
 *
 * The timestamps are read from the canonical row handed in, not from the provenance the emitter
 * wrote: a validator that compared the emitter's claim against the emitter's claim would compare
 * nothing. The caller re-reads the row by `artefact_ref`; this function is given what came back.
 */
export const assertArtefactPredates = (
  provenance: ProactiveProvenance,
  row: CanonicalArtefact,
  issuedAt: string,
): void => {
  if (row.artefact_ref !== provenance.artefact_ref)
    throw new ProactiveRefusal(
      'the re-read row is not the row the provenance names',
    );
  if (row.artefact_kind !== provenance.artefact_kind)
    throw new ProactiveRefusal(
      `artefact_kind claimed ${provenance.artefact_kind}, canonical row says ${row.artefact_kind}`,
    );
  if (row.created_at !== provenance.artefact_created_at)
    throw new ProactiveRefusal(
      'artefact_created_at was authored rather than copied from the canonical row',
    );
  if (!(new Date(row.created_at).getTime() < new Date(issuedAt).getTime()))
    throw new ProactiveRefusal(
      `artefact ${row.artefact_ref} does not predate the emission`,
    );
};

/** Every Cell must be as-of the artefact or earlier — a number newer than its story is a new story. */
export const assertCellsNotNewerThanArtefact = (
  cells: readonly { as_of: string | null }[],
  artefactCreatedAt: string,
): void => {
  const at = new Date(artefactCreatedAt).getTime();
  const newer = cells.filter(
    (c) => c.as_of !== null && new Date(c.as_of).getTime() > at,
  );
  if (newer.length)
    throw new ProactiveRefusal(
      `${newer.length} cells are newer than the artefact they are presented with`,
    );
};

export interface NarrativeRender {
  /** What a template render produced, when `narrative_source === 'moment_template'`. */
  readonly rendered: string;
}

/**
 * PR3b — narrative text has exactly two legal sources, and composition is not one of them.
 *
 * The hash is RECOMPUTED against the source and compared, rather than trusted. Both branches are
 * required to name their side: a `moment_template` with no template id cannot resolve a catalogue,
 * and a `stored_artefact` with no stored field has nothing to have copied.
 */
export const assertNarrativeProvenance = (
  provenance: ProactiveProvenance,
  momentKey: string,
  render: NarrativeRender | null,
  row: CanonicalArtefact,
): void => {
  if (provenance.narrative_source === 'moment_template') {
    if (
      !provenance.moment_template_id ||
      provenance.moment_template_version === null
    )
      throw new ProactiveRefusal(
        'narrative_source is moment_template but the composed catalogue key is incomplete',
      );
    const template = momentTemplateFor(momentKey);
    if (
      template.moment_template_id !== provenance.moment_template_id ||
      template.version !== provenance.moment_template_version
    )
      throw new ProactiveRefusal(
        `${momentKey} resolves ${template.moment_template_id}@${template.version}, provenance claims ${provenance.moment_template_id}@${String(provenance.moment_template_version)}`,
      );
    if (!render)
      throw new ProactiveRefusal(
        'no render to recompute the narrative hash against',
      );
    if (sha256(render.rendered) !== provenance.narrative_hash)
      throw new ProactiveRefusal(
        'narrative_hash does not match the template render',
      );
    return;
  }

  if (provenance.narrative_source === 'stored_artefact') {
    if (
      provenance.moment_template_id !== null ||
      provenance.moment_template_version !== null
    )
      throw new ProactiveRefusal(
        'a stored_artefact narrative may not also claim a moment template',
      );
    if (typeof row.narrative !== 'string')
      throw new ProactiveRefusal(
        'narrative_source is stored_artefact but the canonical row stores no narrative',
      );
    if (sha256(row.narrative) !== provenance.narrative_hash)
      throw new ProactiveRefusal(
        'narrative_hash does not match the stored field re-read from the canonical row',
      );
    return;
  }

  // There is no third source. Newly-composed strategy is not expressible, and this is where that
  // becomes a refusal rather than a claim.
  throw new ProactiveRefusal(
    `narrative_source '${String(provenance.narrative_source)}' is not one of the two legal sources`,
  );
};

/**
 * PR5c / DR4 — a proactive emission carries no acknowledgement affordance without a canonical owner.
 *
 * `GAP-ATTENDANCE-CONFIRM` is open. A «Приду» control that writes nothing is not emitted, and
 * «клиент подтвердил» is not a claim any surface may make.
 */
export const assertNoAcknowledgementAffordance = (
  momentKey: string,
  intents: readonly { effect: string }[],
  gapRefs: readonly string[],
): void => {
  const gapped = MOMENT_REGISTRY[momentKey];
  if (!gapped) return;
  const ACK_PERMITTED = ['NONE', 'NAVIGATE', 'HANDOFF'];
  if (gapRefs.includes('GAP-ATTENDANCE-CONFIRM')) {
    const over = intents.filter((i) => !ACK_PERMITTED.includes(i.effect));
    if (over.length)
      throw new ProactiveRefusal(
        'GAP-ATTENDANCE-CONFIRM is open: this emission may carry NONE, NAVIGATE or HANDOFF only',
      );
  }
};

/** The one sentence no surface may render while the gap is open. */
export const ATTENDANCE_CLAIM_FORBIDDEN = 'клиент подтвердил';
