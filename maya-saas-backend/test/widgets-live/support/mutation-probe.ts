// HAR-11 — the mutation runner's self-test target (GATES-PLAN-V11 I-HAR). Not a gate, not evidence.
//
// `harness.live-spec.ts` asserts that these three switches are never all on. The runner's self-test battery
// (`test/widgets-live/mutations/selftest/`) turns `neutraliser` on through the neutraliser set NH and `first` and
// `second` through a two-edit mutant: only the three together turn the probe red, so a kill shows that the runner
// applied the set before both edits, and the probe's `[GW]` tag shows that such a kill is not live evidence.
export const MUTATION_PROBE = Object.freeze({
  neutraliser: false,
  first: false,
  second: false,
});
