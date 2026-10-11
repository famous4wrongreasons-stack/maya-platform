# Full-backend findings, not waived

The fresh full backend run on `d27699c2` is not green: 9,562 passed / 37 failed,
704 passed suites / 13 failed suites. All 37 exact failing case names also fail
on the unchanged original checkpoint (`baseline-failure-equivalence.json`). The isolated copies below
are extracted with `git archive` from the original checkpoint
`20a543840eb75b58d649c44517f8e071b04865fc`; they are not a new working branch.
No source edits, weakened assertions or larger budgets were used in that copy.
Dependencies are the same installed node_modules. The original shell is rebuilt
inside that private copy for the R01 integration-only case.

| Surface | Actual finding | Initial classification |
| --- | --- | --- |
| crm-branch-binding / client-appointment-status | Tests call removed `assertRescheduleBranchWitness`; existing current guard is `assertAppointmentBranchWitness`. | Stale test references; canonical guard semantics must still be checked before updating them. |
| projector-fences / proactive / consent | Pinned registry hash/cardinalities no longer match the existing registry/tool catalog. | Contract/evidence drift from earlier capabilities; no automatic re-pin or expanded release scope. |
| routing-regression | A role previously expected to have no data tools now reaches the planner. | Requires comparison with current approved personal-read catalog, not removing the refusal assertion blindly. |
| planner-wire-context | Recorded planner request is 98,702 / 99,228 bytes against the current 98,304-byte proof-broker limit; additional catalog/prompt expectations differ. | Real local-launch budget blocker plus stale catalog expectations. Do not increase the budget just to pass. |
| ai-core.development-integration | Three existing turns finish with `ServiceUnavailableException`. | Reproduced pre-existing failure; cause still requires diagnosis. |
| beget-relay-release | Integration-only emitted shell census expects 42 files, actual canonical build has 47. | Packaging evidence drift. Rebuilt original checkpoint reproduces it. |
| widget-release-profile.contract | Existing fixed profile and registry capability sets disagree for two previously added tools. | Release contract/evidence drift; no scope is silently enlarged. |
| denial-projection.ratchet | `lifecycle_request` has no canonical denial projection; code count is 128 versus 127. | Missing projection/evidence needs its own narrowly owned fix. |
| package5-wave3-bypass-ratchet | Static check expects the old direct `installCrmCredentials` initiator call. | Ownership ratchet drift to diagnose against current A17 route, not waive. |

| client-identity-registration-guard | Prior Telegram binding calls the canonical registration owner, while the historical static ratchet expects zero callers. | Pre-existing authority/ratchet disagreement; compare against the approved Telegram initial-binding contract before narrowing the ratchet. |

Baseline receipts, all with unchanged original product sources:

- `complete-result.json`: eight suites, 30 failures / 277 passes.
- `profile-result.json`: exact profile case, one failure.
- `r01-result.json`: exact integration-only case, one failure.
- `remaining-result.json`: four failures for denial projection / Wave 3.
- `identity-guard-complete-result.json`: one failure / 16 passes.
- `failed-case-equivalence.json`: the 37 names and suites match the full run exactly.

The initial baseline extraction omitted two fixture dependencies and produced two
extra missing-file failures; those are excluded from the counts above. They
were rerun with the exact original fixture files. The first baseline shell build
also lacked its original tsconfig; the subsequent complete build passed before
running the R01 case. The identity-guard extraction initially lacked the original scripts directory;
that collection error is also excluded. Its complete rerun used the exact
original scripts. No missing-file failure is represented as product evidence.

All counts refer to executed local receipts. This document does not turn any
release gate green. The new Telegram linking unit is independently verified;
FULL BACKEND / RELEASE READINESS remain NOT GREEN until these findings are closed.
