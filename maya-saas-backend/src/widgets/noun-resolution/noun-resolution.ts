// Gate 11's two VIEWS, and the applicability table (GATES-PLAN-V11 U11a; AREA-C §2.1.4).
//
// §0.4 F15 (C11:220-235) is the reason this file exists rather than Gate 11 reading the record:
//
// > The noun resolver's input is exactly `{ capability, frozen_nouns, requested_scope_hash,
// > principal_proof_hash, tenant_id, confirmation_of_ref, produced_by_intent_token_hash }` — every one
// > of them `AUDIT_RETAINED`.
//
// A gate handed the whole `IntentRecordRow` could read `utteranceTemplate` tomorrow and nothing would
// go red until someone read the diff. Handed `NounResolverInput`, it CANNOT: the seven are all there
// is, so F15's "exactly seven" is a type rather than a review note, and the build-time reachability
// test the clause mandates (G11-N15, `erasure-reachability.gate11.spec.ts`) has one small surface to
// check instead of a whole row. AMB-37/B-19 (C11:7214) settles that the limit binds record fields only:
// `actor`, `effect` and witness PRESENCE are legal extra inputs, and they arrive as the second and
// third parameters, never smuggled into the seven.
//
// The applicability table (AREA-C §2.1.4) is the other half. Row 11 is not "always read": it is a duty
// that applies to some records and not to others, and the difference has to be decidable from the two
// views alone. Six rows, total, no default:
//
//   W    a witness is present (`revisionId !== null`)  → compare it (R3.7.4). While the witness port is
//        unbound: `superseded/handle_stale` with ZERO owner calls (AMB-01a — a clause-level fail-closed
//        lane, never a whole-gate refusal). A witness that agrees falls through to the noun rows.
//   A1   a discharge-blocked effect, noun port bound   → fresh read
//   N1   frozen nouns present, noun port bound         → fresh read
//   A0   a discharge-blocked effect, no port bound     → J-1 invariant throw
//   N0   frozen nouns present, no port bound           → J-1 invariant throw
//   P    nothing to resolve                            → pass, with an empty `resolvedNouns`
//
// A0/N0 THROW rather than refuse, and that is deliberate — but ONLY because they are unreachable, and
// that is a claim about a SET, not a mood. Before P-01's discharge no record of an effect A2.2 names
// is minted at all (D-4, C11:6723), so the rows cannot be entered; after it, P-MINT-CORE's mint
// refusal guarantees every mintable subject has a port, so reaching them means the pipeline was built
// wrong. D-11 fixes that shape: "Only a pipeline construction defect throws". A refusal there would
// report a construction defect as drift and would let a missing port ship quietly.
//
// CKPT-W1 REVIEW FIX — which set "actuating" means. This file read `ACTUATING` from
// `gates/effect-sets.ts`, whose own comment says it "is the legacy set, `REFINE` included. Which set
// each gate should read is for those gates' specs to settle". Read here, it made a record owe a
// canonical read on `REFINE` and `CONTROL` too — and for those two the unreachability claim above is
// simply FALSE: D-4 and AREA-C F-3 block `DRAFT`, `REQUEST_APPROVAL` and `COMMIT` and nothing else,
// while `REFINE` and `CONTROL` are this cycle's non-actuating evidence backbone (plan §0.3: "10.R2 is
// not blocked: it is L via CONTROL records"; §3.2 Gate 11 reads SCHED.2 REFINE nouns). A
// `control.widget.dismiss` carries no runId, no revisionId and no frozen noun, so with the ports
// still `NOUN_RESOLUTION_PORTS_UNBOUND` it took row A0 and `gate11.ts` threw — an HTTP 500 raised
// after `T` had already committed Gate 9's durable USER turn, which is exactly the fault R3.9.3
// forbids ("only a genuine transport fault may look like a fault", C11:4902-4903). Slots 9 and 10 are
// refusing stubs today so nothing reaches slot 11 yet, but U9b (W2) and U10b (W3) open them and U11b,
// which binds these ports, is W4 — the window is three waves wide.
//
// So Gate 11 states its own set, HERE, rather than importing one two other gates share. Row 11's
// antecedent is "each frozen noun is resolved by a fresh read from its canonical owner" (C11:4731):
// on the contract's own words a record that froze no noun owes no read at all, whatever its effect.
// The three members below are kept as the fail-closed margin the applicability table was written
// around — and they are the three D-4 blocks, so the A0 throw is now honestly unreachable. Widening
// row 11's antecedent back to an effect-keyed read with no frozen nouns needs an owner citation, and
// A0/N0 would then have to answer `superseded/handle_stale` rather than throw, because an unbound
// port is a policy gap and not a transport fault.

import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import type { EffectClass } from '../../widget-contract/intent';
import type { IntentRecordRow } from '../gate.types';
import { asHandle, asWitness, type Handle, type Witness } from './noun-handles';
import type { NounResolutionPorts } from './noun-resolution.ports';

/**
 * Gate 11's own effect set: the three A2.2 (C11:6723) forbids minting until P-01 discharges. It is
 * deliberately NOT `gates/effect-sets.ts#ACTUATING` — that set is Gate 7's and Gate 8-R's, carries
 * `REFINE` and `CONTROL`, and a change made for one of those gates must not silently widen row 11's
 * antecedent. `satisfies EffectClass[]` keeps the members spellings the contract knows.
 */
export const GATE11_DISCHARGE_BLOCKED_EFFECTS: readonly string[] =
  Object.freeze([
    'COMMIT',
    'DRAFT',
    'REQUEST_APPROVAL',
  ] satisfies EffectClass[]);

// ── the seven, and the two legal extras ──────────────────────────────────────────────────────────

/** §3.7's `CapabilityRef`, as the resolver reads it: the pair, or nothing. */
export interface CapabilityView {
  readonly space: string;
  readonly key: string;
}

/** §3.7's `confirmation_of_ref`: `{ kind, ref }`, non-null iff `effect === 'COMMIT'` (§3.10). */
export interface ConfirmationOfRefView {
  readonly kind: string;
  readonly ref: string;
}

/**
 * F15's seven record fields, and NOTHING else. Adding a member here is adding a field to the decision
 * path, which is what F15 forbids and what G11-N15 fails the build over.
 */
export interface NounResolverInput {
  readonly capability: CapabilityView | null;
  /** The handles, by noun name. Empty when the record froze none. */
  readonly frozenNouns: ReadonlyMap<string, Handle>;
  readonly requestedScopeHash: string;
  readonly principalProofHash: string;
  readonly tenantId: string;
  readonly confirmationOfRef: ConfirmationOfRefView | null;
  readonly producedByIntentTokenHash: string | null;
}

/**
 * R3.7.4's witness, as the applicability view carries it. B-19 says "witness presence"; a bare boolean
 * cannot be compared, so presence is carried as the two values the comparison is made of — the run the
 * witness belongs to, and the frozen revision itself. `run === null` with a revision present is a
 * malformed record (§3.7 `run_ref` is one object), and the witness lane refuses it rather than
 * skipping the comparison.
 */
export interface WitnessView {
  readonly run: Handle | null;
  readonly revision: Witness;
}

/** B-19's second input: the effect, and whether a witness is present. Never a record. */
export interface Gate11Applicability {
  readonly effect: string;
  readonly witness: WitnessView | null;
}

/** B-19's third input: the actor the canonical owner reads as. Two members, both non-conversational. */
export interface NounActor {
  readonly tenantId: string | null;
  readonly userId: string;
}

// ── the fact Gate 11 produces (AMB-43b) ──────────────────────────────────────────────────────────

/** One line of B-23's rendered diff: an AUDIT_RETAINED fact beside the fresh owner value. */
export interface ResolvedNounDiff {
  readonly noun: string;
  readonly frozen: string;
  readonly fresh: string;
}

/**
 * `AdmissionFacts.resolvedNouns`, concretely. `gate.types.ts` still declares it as an opaque brand
 * (`ResolvedNouns`), and replacing that brand with this type is IR-11a-2: AMB-43b needs `diverged` and
 * `diff` at slots 12 and 13, and an opaque brand cannot carry them.
 */
export interface ResolvedNounsValue {
  /** Which row of the applicability table decided. Readable at 12/13 as the shape of the decision. */
  readonly row: ApplicabilityRow;
  readonly diverged: boolean;
  readonly diff: readonly ResolvedNounDiff[];
  /** The owner's fresh values, by noun name. Empty on row P: nothing was owed, so nothing was read. */
  readonly values: ReadonlyMap<string, string>;
}

/** Row P's fact, and the base every other row builds on: nothing read, nothing diverged. */
export const resolvedNothing = (row: ApplicabilityRow): ResolvedNounsValue =>
  Object.freeze({
    row,
    diverged: false,
    diff: Object.freeze([]),
    values: new Map<string, string>(),
  });

// ── the applicability table ──────────────────────────────────────────────────────────────────────

export type ApplicabilityRow = 'W' | 'A1' | 'N1' | 'A0' | 'N0' | 'P';

/** Every row, in the order the table is read. Total: `applicabilityRow` returns one of exactly these. */
export const APPLICABILITY_ROWS: readonly ApplicabilityRow[] = Object.freeze([
  'W',
  'A1',
  'N1',
  'A0',
  'N0',
  'P',
]);

/**
 * The table with the witness lane already decided (a witness that AGREED falls through to here, and a
 * record with no witness starts here). Never returns `'W'`.
 */
export const nounRow = (
  input: NounResolverInput,
  applicability: Gate11Applicability,
  ports: NounResolutionPorts | null,
): Exclude<ApplicabilityRow, 'W'> => {
  const actuating = GATE11_DISCHARGE_BLOCKED_EFFECTS.includes(
    applicability.effect,
  );
  const nouns = input.frozenNouns.size > 0;
  if (!actuating && !nouns) return 'P';
  const bound = ports !== null && ports.nouns !== null;
  if (actuating) return bound ? 'A1' : 'A0';
  return bound ? 'N1' : 'N0';
};

/** The whole table. The witness lane is first: a stale world is stale whatever the nouns say. */
export const applicabilityRow = (
  input: NounResolverInput,
  applicability: Gate11Applicability,
  ports: NounResolutionPorts | null,
): ApplicabilityRow =>
  applicability.witness !== null ? 'W' : nounRow(input, applicability, ports);

// ── the slot-11 projection (IR-11a-1 calls these) ────────────────────────────────────────────────

/**
 * The WidgetIntentRecord columns each member of the two views is projected from, stated here so the
 * build-time reachability test (G11-N15) can check every one of them against `schema.prisma`'s own
 * `// A|C|D|X` marker instead of against a list somebody kept by hand.
 */
export const NOUN_RESOLVER_INPUT_COLUMNS: Readonly<
  Record<keyof NounResolverInput, readonly string[]>
> = Object.freeze({
  capability: Object.freeze(['capabilitySpace', 'capabilityKey']),
  frozenNouns: Object.freeze(['frozenNounsJson']),
  requestedScopeHash: Object.freeze(['requestedScopeHash']),
  principalProofHash: Object.freeze(['principalProofHash']),
  tenantId: Object.freeze(['tenantId']),
  confirmationOfRef: Object.freeze(['confirmationOfKind', 'confirmationOfRef']),
  producedByIntentTokenHash: Object.freeze(['producedByIntentTokenHash']),
});

/** The same, for B-19's legal extras. `runId`/`revisionId` are §3.7's `run_ref`, both AUDIT_RETAINED. */
export const APPLICABILITY_COLUMNS: Readonly<
  Record<keyof Gate11Applicability, readonly string[]>
> = Object.freeze({
  effect: Object.freeze(['effect']),
  witness: Object.freeze(['runId', 'revisionId']),
});

/** F15's seven, spelled as the contract spells them, for the audit row and G11-N15. */
export const F15_SEVEN: readonly string[] = Object.freeze([
  'capability',
  'frozen_nouns',
  'requested_scope_hash',
  'principal_proof_hash',
  'tenant_id',
  'confirmation_of_ref',
  'produced_by_intent_token_hash',
]);

/**
 * J-1: slot 11 runs only after Gate 1 found a record. A null here is a pipeline construction defect,
 * not drift, so it throws (D-11) instead of refusing `handle_stale` and looking like a stale handle.
 */
const requireRecord = (record: IntentRecordRow | null): IntentRecordRow => {
  if (record === null)
    throw new Error(
      'J-1: slot 11 ran with no record; Gate 1 refuses before it, so this is a pipeline construction defect',
    );
  return record;
};

/**
 * §3.7 stores `frozen_nouns` as `Record<string, string>`. Anything else in the column — an array, a
 * scalar, SQL null, a member that is not a string — projects to NO noun rather than to a guessed one:
 * a handle invented here would be read from the canonical owner as if the widget had frozen it.
 */
const frozenNounsOf = (value: unknown): ReadonlyMap<string, Handle> => {
  const out = new Map<string, Handle>();
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return out;
  for (const [noun, handle] of Object.entries(value as Record<string, unknown>))
    if (typeof handle === 'string' && handle.length > 0)
      out.set(noun, asHandle(handle));
  return out;
};

/** IR-11a-1, half one: the seven, projected from the record and from nothing else. */
export const nounResolverInput = (
  record: IntentRecordRow | null,
): NounResolverInput => {
  const r = requireRecord(record);
  return Object.freeze({
    capability:
      r.capabilitySpace !== null && r.capabilityKey !== null
        ? Object.freeze({ space: r.capabilitySpace, key: r.capabilityKey })
        : null,
    frozenNouns: frozenNounsOf(r.frozenNounsJson),
    requestedScopeHash: r.requestedScopeHash,
    principalProofHash: r.principalProofHash,
    tenantId: r.tenantId,
    confirmationOfRef:
      r.confirmationOfKind !== null && r.confirmationOfRef !== null
        ? Object.freeze({
            kind: r.confirmationOfKind,
            ref: r.confirmationOfRef,
          })
        : null,
    producedByIntentTokenHash: r.producedByIntentTokenHash,
  });
};

/** IR-11a-1, half two: the effect and the witness, and nothing else. */
export const gate11ApplicabilityOf = (
  record: IntentRecordRow | null,
): Gate11Applicability => {
  const r = requireRecord(record);
  return Object.freeze({
    effect: r.effect,
    witness:
      r.revisionId !== null
        ? Object.freeze({
            run: r.runId !== null ? asHandle(r.runId) : null,
            revision: asWitness(r.revisionId),
          })
        : null,
  });
};

/** IR-11a-1, half three: the actor, narrowed to what a canonical owner reads as. */
export const nounActor = (actor: Readonly<AuthenticatedUser>): NounActor =>
  Object.freeze({ tenantId: actor.tenantId, userId: actor.userId });
