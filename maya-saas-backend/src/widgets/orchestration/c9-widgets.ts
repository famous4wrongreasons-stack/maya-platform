// K11 — the three C9 widgets, and the rule that a widget may not recompute a risk.
//
//   `risk_tier`, `reversible` and `audience_size` are COPIED, NEVER RECOMPUTED.
//
// The reason is one sentence in the mapping and it is exact: "a widget that recomputes a risk tier
// is a widget that can lower one." So these fields arrive from C9 and are carried through unchanged.
// There is no arithmetic on them anywhere in this file, and the exit asserts that by reading the
// source rather than by trusting this comment.
//
// The second rule is about a person rather than a system: `NO_ACTION` must be EQUALLY SELECTABLE.
// Not present-but-styled-as-a-cancel, not a smaller button — an option with the same standing as
// the others. A strategy chooser where doing nothing is harder to pick than doing something is a
// chooser that manufactures consent.

export type RiskTier = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

/** Exactly as C9 published it. Every field here is carried, none derived. */
export interface C9StrategyOption {
  readonly optionRef: string;
  readonly label: string;
  /** COPIED from C9. */
  readonly risk_tier: RiskTier;
  /** COPIED from C9. */
  readonly reversible: boolean;
  /** COPIED from C9. */
  readonly audience_size: number;
}

/** The unique `resourceClass: 'LOCAL'` row. Verified by enumeration against the live registry. */
export const NO_ACTION_KEY = 'c9.no_action';

export interface StrategyOptionsBody {
  readonly kind: 'STRATEGY_OPTIONS';
  readonly options: readonly C9StrategyOption[];
  /** Which option is NO_ACTION. Present so "is it selectable?" is answerable without guessing. */
  readonly noActionRef: string;
}

export class OrchestrationRefusal extends Error {}

/**
 * Build a STRATEGY_OPTIONS body.
 *
 * Two refusals, and both are about the person in front of the screen:
 *   - no NO_ACTION option → refuse, because a chooser without "do nothing" is not a choice
 *   - NO_ACTION present but distinguishable in standing → refuse, for the same reason
 *
 * The options are frozen copies. A caller cannot later adjust a `risk_tier` on something this
 * function returned.
 */
export const strategyOptions = (
  fromC9: readonly C9StrategyOption[],
): StrategyOptionsBody => {
  const noAction = fromC9.find((o) => o.optionRef === NO_ACTION_KEY);
  if (!noAction)
    throw new OrchestrationRefusal(
      'STRATEGY_OPTIONS without a selectable NO_ACTION: doing nothing must always be an option',
    );

  // Equally selectable means structurally identical, not merely present: same shape, same fields,
  // no marker that a renderer could use to treat it differently.
  const shape = (o: C9StrategyOption) => Object.keys(o).sort().join(',');
  const others = fromC9.filter((o) => o.optionRef !== NO_ACTION_KEY);
  if (others.some((o) => shape(o) !== shape(noAction)))
    throw new OrchestrationRefusal(
      'NO_ACTION differs in shape from the other options',
    );

  return Object.freeze({
    kind: 'STRATEGY_OPTIONS' as const,
    // Copied, field for field. No map that touches risk_tier, reversible or audience_size.
    options: fromC9.map((o) => Object.freeze({ ...o })),
    noActionRef: NO_ACTION_KEY,
  });
};

export interface ApprovalBody {
  readonly kind: 'APPROVAL';
  readonly approvalRef: string;
  readonly summary: string;
  readonly risk_tier: RiskTier;
  readonly reversible: boolean;
  readonly expiresAt: string;
}

/** Approvals carry C9's risk verbatim, for the same reason the options do. */
export const approval = (from: Omit<ApprovalBody, 'kind'>): ApprovalBody =>
  Object.freeze({ kind: 'APPROVAL' as const, ...from });

export interface ProgressBody {
  readonly kind: 'PROGRESS';
  readonly runRef: string;
  readonly state: 'queued' | 'running' | 'done' | 'cancelled';
  /**
   * The run-cancel control. §3.4 gives it `CONTROL_FLOOR: BOUND_CLIENT` and F88.1 gives it
   * `role: 'control'` — it is the one affordance on a PROGRESS widget, and it is always present,
   * because a person watching something run must be able to stop it.
   */
  readonly cancelControl: 'control.run.cancel';
}

export const progress = (
  runRef: string,
  state: ProgressBody['state'],
): ProgressBody =>
  Object.freeze({
    kind: 'PROGRESS' as const,
    runRef,
    state,
    cancelControl: 'control.run.cancel',
  });

/**
 * A widget PRESENTS a strategy; it does not start one.
 *
 * The exit says "envelopes that initiate a strategy = 0". There is no function here that begins a
 * run, and that is the guarantee — a body is a description, and initiating belongs to C9 through
 * its own contract. Selecting an option mints a typed intent that C9 adjudicates; the widget layer
 * never calls an orchestrator.
 */
export const THE_THREE_WIDGETS = [
  'STRATEGY_OPTIONS',
  'APPROVAL',
  'PROGRESS',
] as const;
