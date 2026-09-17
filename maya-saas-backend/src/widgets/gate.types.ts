// K3 — the gate contract.
//
// §3.9 fixes fourteen gates and one readback gate in ONE order, and §0.3 fixes the mechanism: "the
// gateway pipeline is constructed from a single ordered array whose ... no branch that skips a
// gate". That sentence is the reason this file exists. A pipeline assembled from an array can be
// enumerated, counted and asserted; a pipeline assembled from nested ifs can only be read, and a
// reader is exactly what missed the last four defects in this programme.
//
// The type below makes the two failure modes unrepresentable rather than discouraged:
//   - a gate cannot let a submission through silently, because it returns a verdict, not void
//   - a gate cannot be skipped, because the runner walks the array and the array is the pipeline

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { C9Principal } from '../orchestration/c9.contract';
import type { C9Domain } from '../widget-contract/ambient';
import type { VerificationLevel } from '../widget-contract/envelope';
import type { ChannelId } from '../widget-contract/lifecycle';

/** Where a gate runs. §3.9's "Runs in" column, kept so the table and the code can be compared. */
export type GateHost =
  | 'IntentGateway'
  | 'HTTP middleware'
  | 'TenantResolver'
  // Gate 11's row, copied verbatim from §3.9 (C:4347).
  | 'IntentGateway + capability owner'
  | 'ChannelProfileRegistry + AuthorityResolver'
  | 'AuthorityResolver'
  | 'chat ingress'
  | 'intent router'
  | 'Projector'
  | 'effect router'
  | 'CanonicalActionIngressService';

/**
 * A refusal names a reason from a closed vocabulary. Free text would make the refusal a message
 * rather than a decision, and §3.9 gives every gate its own code — so the code is the contract and
 * the message is only for a person reading a log.
 */
export type RefusalCode =
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'unauthenticated'
  | 'widget_principal_mismatch'
  | 'tenant_mismatch'
  | 'policy_floor_changed'
  | 'needs_second_channel'
  | 'handoff_required'
  | 'insufficient_authority'
  | 'effect_not_admissible'
  | 'booking_confirmation_required'
  | 'selection_out_of_domain'
  | 'bound_violation'
  | 'use_secure_surface'
  | 'oversize_submission'
  | 'readback_missing'
  | 'readback_mismatch'
  | 'intent_divergence'
  | 'handle_stale'
  // Not a gate's own refusal: the fail-closed default a NORMATIVE-PENDING mechanism compels
  // (§0.1 F5). A gate whose mechanism a later package builds refuses with this rather than
  // passing, because "not built yet" and "allowed" must never be the same branch.
  | 'mechanism_absent';

/**
 * `LoweredUtterance` is Gate 9's product: a string only `renderUtterance` may brand (G9 §3.0). It is
 * stated here, with G9's brand, until the Gate 9 unit owns `lowering/lowering.ts`.
 */
export type LoweredUtterance = string & {
  readonly __brand: 'LoweredUtterance';
};

/** Gate 11's resolved nouns. Opaque on purpose: their shape is AMB-33's ruling, not this file's. */
export type ResolvedNouns = { readonly __brand: 'ResolvedNouns' };

/**
 * J-1 — what an earlier gate hands a later one. A `pass` verdict may carry some of these; the runner
 * merges them into a NEW context through `mergeFacts` (`gates/facts.ts`), which admits each fact only
 * from its one producer slot and only once. Which slots may READ each fact is declared beside the
 * producer in `FACT_SLOTS` and held at the source by `gates/facts.architecture.spec.ts`.
 *
 * Facts are never serialised: the controller's response has no member for them.
 */
export interface AdmissionFacts {
  /** The live principal (request state). Producer: the principal slot, which P-PRINCIPAL fixes. */
  readonly authority: C9Principal;
  /** Class A: validated closed-domain option ids per declared field; null for a null schema. */
  readonly validatedInputs: {
    readonly closed: ReadonlyMap<string, readonly string[]>;
  } | null;
  /** Class C: `null` = a validated member's label is unresolvable; `[]` = nothing was selected. */
  readonly selectedLabels: readonly string[] | null;
  /** Class C (template) / A: read once, inside slot 8, after validation passes (D-2). */
  readonly loweringSource: {
    readonly utteranceTemplate: string | null;
    readonly erasedAt: Date | null;
    readonly conversationId: string;
  };
  /** Class C: the lowered utterance. Its only reader is Gate 10 (D-11). */
  readonly lowering: { readonly renderedUtterance: LoweredUtterance };
  /** Class A: the USER turn Gate 9 appended (D-11). */
  readonly loweredTurn: {
    readonly turnId: string;
    readonly conversationId: string;
  };
  /** Class A: Gate 11's resolution. */
  readonly resolvedNouns: ResolvedNouns;
}

/**
 * The four receipt outcomes D12's CHECK `WidgetIntentReceipt_outcome_check` admits. Not a new
 * vocabulary: the column's own, which G13 A14 (AMB-56) may widen.
 */
export type IntentReceiptOutcome =
  'ACCEPTED' | 'REFUSED' | 'NEEDS_CONFIRMATION' | 'NEEDS_VERIFICATION';

/** What Gate 13's routing returns inside a `terminate` (G13 §6). Each `unknown` is `null` when absent. */
export interface RouteResult {
  /** `null` exactly when no D12 member fits (G13 A14). */
  readonly receipt_outcome: IntentReceiptOutcome | null;
  readonly next_envelope: unknown;
  readonly resolved_widget: unknown;
  readonly owner_decision: unknown;
}

export type GateVerdict =
  | {
      readonly outcome: 'pass';
      /** J-1: merged by the runner through `mergeFacts`; never returned to a client. */
      readonly facts?: Partial<AdmissionFacts>;
    }
  | {
      readonly outcome: 'refuse';
      readonly code: RefusalCode;
      readonly detail?: string;
    }
  | {
      readonly outcome: 'superseded';
      readonly code: RefusalCode;
      readonly detail?: string;
    }
  /**
   * Ends the pipeline by design rather than by refusal: Gate 13 once it has routed, and Gate 14's
   * pointer. Gate 9 does not terminate — on success it passes, carrying its facts.
   */
  | {
      readonly outcome: 'terminate';
      readonly why: string;
      readonly route?: RouteResult;
    };

/**
 * What a gate may read. Deliberately narrow: a gate that could reach the request object could
 * reach a header, and a credential arriving from the widget is the thing §3.9 Gate 2 forbids.
 */
export interface GateContext {
  /** The hash of the presented token. The token itself is never stored, only compared. */
  readonly intentTokenHash: string;
  readonly tenantId: string;
  /**
   * The JWT-validated user, exactly as `@CurrentUser()` delivers it (`JwtStrategy.validate`). Passing
   * the validated actor constructs no principal (K5). Its `role` is read by no gate until AMB-03
   * rules which read supplies the live principal's role (`gate-context.source.spec.ts`).
   */
  readonly actor: Readonly<AuthenticatedUser>;
  readonly principalProofHash: string;
  readonly now: Date;
  /** The stored record, once Gate 1 has found one. Null before that, and after a refusal. */
  readonly record: IntentRecordRow | null;
  readonly submission: SubmissionShape;
  /**
   * `v` — the LIVE verification level of the principal presenting this token, derived server-side
   * on THIS request. Gate 5 has no meaning without it: a floor with nothing to compare against is
   * a number in a column. It is derived by the AuthorityResolver, never sent by a client, and
   * never read from the record — a level stored at mint is a level that has aged.
   */
  readonly verificationLevel: VerificationLevel;
  /**
   * §3.4 R3.4.6's channel ceiling: the highest rung THIS carrier can establish, whatever the
   * session claims. A first-party session replayed over SMS is capped by the carrier.
   */
  readonly channelMaxLevel: VerificationLevel;
  /**
   * Which carrier the submission arrived on — the answering channel, in the contract's one channel
   * vocabulary (`ChannelId`), which is also the key of the channel ceiling. Presentation elsewhere;
   * a ceiling here.
   */
  readonly carrier: ChannelId;
  /**
   * J-1: facts earlier slots produced, `{}` before the first. Grown only by the runner, through
   * `mergeFacts`; a gate never writes it.
   */
  readonly facts: Readonly<Partial<AdmissionFacts>>;
}

/** The stored record, as the widget layer holds it. A subset of §3.7 — K3 reads only this much. */
export interface IntentRecordRow {
  readonly intentTokenHash: string;
  readonly tenantId: string;
  readonly widgetId: string;
  readonly widgetKind: string;
  readonly effect: string;
  readonly principalProofHash: string;
  readonly verificationFloor: VerificationLevel;
  readonly singleUse: boolean;
  readonly consumedAt: Date | null;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly supersededByWidgetId: string | null;

  // ── what the RECOMPUTE reads (F42) ──────────────────────────────────────────────────────────
  // Every one of these already existed as a column and none was selected. Gate 5 cannot recompute
  // a floor from a row that omits the terms the floor is made of, so the select was widened rather
  // than the comparison weakened.
  readonly priority: number;
  readonly capabilitySpace: string | null;
  readonly capabilityKey: string | null;
  readonly handoffSpace: string | null;
  readonly handoffKey: string | null;
  readonly targetJson: unknown;
  /** Gate 8-R compares the affirmation against THIS, and the SUPERSEDED comparison reads it. */
  readonly bodyHash: string;
  /** Gate 8's closed domain: the option ids the server declared. Labels are separate by design. */
  readonly selectionDomain: string;
  readonly inputSchemaHash: string | null;
  /** Gate 7 reads both; F74's pairing check compares them. */
  readonly confirmationOfKind: string | null;
  readonly confirmationOfRef: string | null;
  readonly producedByIntentTokenHash: string | null;

  // ── the union select of the Gates 6–13 plan (§2.4) ─────────────────────────────────────────────
  // Every member below is an AUDIT_RETAINED (class A) column or a projection of one. No class C or X
  // column is on this row (S-ROW, `gate-context.source.spec.ts`): the lowering source is read lazily
  // inside slot 8 (D-2), and `renderedUtterance` left with legacy Gate 10 (D-12).
  readonly c9Domain: C9Domain | null;
  /** `WidgetEmission.deliveryChannel`, flattened: the channel the envelope was fitted for. */
  readonly deliveryChannel: ChannelId;
  /** `WidgetEmission.lifecycleState`, flattened. */
  readonly emissionLifecycleState: string;
  /**
   * D-3: `confirmationJson`, projected to the two members Gate 8-R reads. The values are copied
   * verbatim — no coercion — so a stored `'true'` stays the string. A member the stored object lacks
   * is `undefined`; a column that holds no plain object (SQL null, an array, a scalar) projects to
   * `null`. The raw object is never placed on this row: `readback_text` and `approval_policy` do not
   * reach a gate.
   */
  readonly confirmation: {
    readonly requires_readback: unknown;
    readonly readback_ref: unknown;
  } | null;
  /**
   * D-3: `confirmationJson.idempotency_key` alone, verbatim (G13 A19); `null` when the column holds no
   * plain object, `undefined` when the object lacks the member.
   */
  readonly confirmationIdempotencyKey: unknown;
  readonly frozenNounsJson: unknown;
  readonly requestedScopeHash: string;
  readonly runId: string | null;
  readonly revisionId: string | null;
  readonly approvalOfIntentRef: string | null;
}

/**
 * What a client may send. §3.8: an opaque token it did not author, plus values from a
 * server-declared closed domain. There is no field here for an endpoint, a URL, a capability name,
 * a table, a provider, a tenant or a role — and that absence IS the guarantee, which is why this
 * shape is asserted by a test rather than merely written carefully.
 */
export interface SubmissionShape {
  readonly intent_token: string;
  readonly inputs?: Readonly<Record<string, unknown>> | null;
  readonly readback_ack?: {
    readonly readback_ref: string;
    readonly body_hash: string;
    readonly affirmation: string;
  } | null;
}

export interface Gate {
  /** §3.9's number. `'8-R'` is the readback gate, which sits between 8 and 9. */
  readonly n: string;
  readonly name: string;
  readonly host: GateHost;
  /**
   * True when a later package owns this gate's mechanism. Such a gate still RUNS and still refuses
   * — see `mechanism_absent`. Marking it lets the pipeline report honestly how much of itself is
   * real, instead of counting an unbuilt gate as a passing one.
   */
  readonly pendingOn?: string;
  run(ctx: GateContext): Promise<GateVerdict> | GateVerdict;
}
