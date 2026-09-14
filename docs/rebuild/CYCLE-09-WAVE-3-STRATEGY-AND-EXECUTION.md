# Chapter 9 — Wave 3: P04 domain strategies, P05 approval and execution coordination

Date: 2026-09-14. Baseline: Wave 2 production release
[`20260914-c9-wave2-b7ae4ddc`](CYCLE-09-WAVE-2-ORCHESTRATOR-AND-TENANT-CONTEXT.md).
Authority: the approved D1–D16 and the combined mapping `cf05547b`. **No new product
decision was taken in this wave.**

## 1. Envelope — unchanged, measured

§15 allocates P04 and P05 `0/0/0/0/0`. That is what shipped: no model, no field, no
migration, no Action Engine class, no AC6 class, and the frozen 32 production surfaces are
untouched. Production still measures **123 physical fields** and the schema is byte-for-byte
the Wave 1 schema.

## 2. P04 — feasible strategies, honest unknowns

`c9.strategy.ts` turns resolved domain capability into a reviewable proposal, and
`c9.agents.ts` now reasons for all four canonical domains.

- **An option exists only because a capability resolved** for that domain. An unregistered
  or wrong-domain capability is omitted with a reason, never proposed.
- **Three is a ceiling, not a quota.** One feasible option yields one option plus the
  explicit `NO_ACTION` node. Padding is not possible: there is no code path that invents an
  alternative, and a duplicate option key is refused outright.
- **A paid component without a bound is ineligible.** An option touching recipients or
  messages needs either a provider quote or positive verified-zero-cost evidence; a missing
  quote is not read as free.
- **Unknowns are carried, not smoothed.** Every alternative repeats the same explicit
  unknown list in both `unknowns` and `costSummary.unavailableReasons`, and
  `knownBenefit.proposalText` stays empty — a benefit is a reference to a qualified fact,
  never generated prose or a number.
- **C8 disabled 0/8 still works.** An unavailable result yields `UNAVAILABLE`, the source's
  own reason codes, no finding and no number. There is no arithmetic and no
  predict/forecast/probability path anywhere in the agent or the strategy builder — this is
  asserted against the source, not merely intended.
- **A value or a rank is never consent.** The C8 projection strips members and states
  `membersIncluded/contactPermission/actionAuthority = false`.
- **BI still proposes nothing**, now enforced at four layers: the registry (every BI
  capability is `READ`), the agent, the `AgentResult@1` contract, and two database CHECKs.

## 3. P05 — approval and execution that own nothing

`c9.execution.ts` advances a reviewed plan and attaches receipts that source owners
produced. It performs no effect of its own and creates no receipt.

- **A coordination review is not a source approval.** An `EXECUTION` attachment is refused
  by the database unless it names a real, non-dry-run `ActionExecution` whose
  `identityFingerprint`, `normalizedInputHash` and `capability` all match, on an
  `OWNER_HANDOFF` step of the accepted option. C9 cannot manufacture one.
- **One canonical execution carries one owning attachment** (`C9StepBinding_one_execution_idx`),
  and an attachment is immutable once written — a retry returns the same row.
- **A material edit supersedes rather than inherits.** A new revision supersedes its parent,
  the root pointer moves, and eligibility is checked against the current revision, so work
  reviewed under the old plan cannot proceed.
- **A lost fence cannot act.** Bind and resolve require the exact lease generation and token,
  and the database refuses a regressed fence or a reopened terminal state.
- **`UNKNOWN != FAILED`.** An unproven outcome keeps the step bound on the same receipt,
  blocks only its dependents, and is reported as unknown — never as done, never as failed,
  never resent, and with no fabricated rollback. Independent branches keep their eligibility.
- **A deterministic stop closes its dependents** and substitutes nothing.
- **Restart resumes, never replans.** `continue` recovers unproven dispatches and re-derives
  eligibility from real terminal states; it contains no path to the strategy builder.

The A22 owner-draft adapter added in `c9.inputs.ts` is the one new write adapter, enabled by
its package rather than guessed from a name: it types exactly what an owner would confirm on
the existing `tenant_business_configuration` ingress.

## 4. Three mandatory executable scenarios

`scripts/chapter9-wave3-proof.ts`, against the owned synthetic cluster, **15/15 PASS**,
`businessProviderMessageMutations: 0`, `productionEffects: 0`.

| Scenario | What it proves |
|---|---|
| **1 — ADMIN operational support** | Propose → review → the **owner** confirms on the existing A22 ingress → C9 attaches to the `ActionExecution` that owner produced, and only then resolves. An unreviewed plan cannot run; an accepted review still cannot fabricate an effect (`c9_exact_source_required`); replaying the attachment returns the same row. |
| **2 — CLIENT_LIFECYCLE with C8 disabled** | An honest proposal with explicit unknowns and no number; a declined review stops the plan, leaves no binding and admits no work. |
| **3 — OCCUPANCY dependency graph** | A dependent waits while an independent branch proceeds; `UNKNOWN` holds the step and keeps blocking its dependent across a restart; a stale fence is refused; a deterministic stop closes dependents with no substitute; a restart resumes the same revision without replanning. |

The only canonical operation performed anywhere in the proof is the owner's own A22
configuration confirmation. No appointment, client, campaign, message or provider call
occurs, and the counts are asserted before and after.

## 5. Local gates

| Gate | Result |
|---|---|
| `prisma validate` | PASS |
| `npm run typecheck` / `typecheck:scripts` | PASS / PASS |
| `npm run lint` | PASS (0 errors) |
| `npm run build` | PASS |
| Mandatory backend regression (`jest --runInBand`, unfiltered) | **459 suites / 3864 tests PASS** (Wave 2 456/3837 + 3 new suites / 27 tests) |
| Gate runtime | certified Node **22.23.2**; production Node unchanged |
| P01 PostgreSQL proof | **27/27**, `productionEffects: 0` |
| P02 PostgreSQL proof | **13/13**, paid reasoning DISABLED |
| Wave 3 three-scenario proof | **15/15**, 0 business/provider/message mutations |

New permanent ratchets: `c9.limited-data-and-strategy.spec.ts` (P04),
`c9.approval.spec.ts` (P05), `c9.resume.spec.ts` (P05).

## 6. Production deployment and read-only verification

Release **`20260914-c9-wave3-78ad0247`**, all ten deploy steps, exit 0.
[Transcript](evidence/chapter9-wave3/deployment.txt) ·
[release acceptance](evidence/chapter9-wave3/release-acceptance.json) ·
[verification](evidence/chapter9-wave3/production-verification.txt).

| Production gate | Result |
|---|---|
| `migrate deploy` | `No pending migrations to apply.` |
| Applied / pending migrations | 99 / **0**, unchanged by this wave |
| Drift | **NONE** |
| Strict preflight, both PWA runtime guards | PASS |
| Port-3199 smoke, then health and readiness after cutover | PASS / `ok` / `ready` |
| R01 relay verification before preflight and after cutover | PASS |
| Structural probe vs Wave 1 | **byte-for-byte identical**: 123 fields, 8 functions, 10 triggers, 74 validated constraints, 11 RESTRICT, 0 CASCADE |
| Rows in the five C9 tables | **0** → production proof effects **0** |
| Coordination routes, unauthenticated | 401 |

## 7. What this wave does **not** claim

- Paid reasoning remains closed; no price basis or cap is configured in production.
- The C7/C8 reader boundary is still unwired in the executable proofs. Domain reasoning over
  qualified projections is proved deterministically by the permanent specs against the same
  production code; the projections themselves stay certified by C7 and C8.
- No agent calls another agent, and no agent writes to a source. Delegation is hub-and-spoke
  through the single Orchestrator.

```text
C9 WAVE 3 ENVELOPE CONFORMANCE: EXACT (0 models / 0 fields / 0 migrations / 0 actions / 0 AC6)
LOCAL GATES: PASS
POSTGRESQL PROOFS: P01 27/27, P02 13/13, WAVE 3 SCENARIOS 15/15
BUSINESS/PROVIDER/MESSAGE MUTATIONS FOR PROOF: 0
PRODUCTION RELEASE: 20260914-c9-wave3-78ad0247
PENDING MIGRATIONS: 0
DRIFT: NONE
HEALTH: PASS
READINESS: PASS
PAID REASONING: DISABLED
PRODUCTION EFFECTS: 0
WAVE 3: COMPLETE
```
