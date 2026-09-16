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

import type { VerificationLevel } from '../widget-contract/envelope';

/** Where a gate runs. §3.9's "Runs in" column, kept so the table and the code can be compared. */
export type GateHost =
  | 'IntentGateway'
  | 'HTTP middleware'
  | 'TenantResolver'
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

export type GateVerdict =
  | { readonly outcome: 'pass' }
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
  /** Gates 9 and 13 terminate the pipeline by design rather than by refusal. */
  | { readonly outcome: 'terminate'; readonly why: string };

/**
 * What a gate may read. Deliberately narrow: a gate that could reach the request object could
 * reach a header, and a credential arriving from the widget is the thing §3.9 Gate 2 forbids.
 */
export interface GateContext {
  /** The hash of the presented token. The token itself is never stored, only compared. */
  readonly intentTokenHash: string;
  readonly tenantId: string;
  readonly principalProofHash: string;
  readonly now: Date;
  /** The stored record, once Gate 1 has found one. Null before that, and after a refusal. */
  readonly record: IntentRecordRow | null;
  readonly submission: SubmissionShape;
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
