# Gate-programme Wave 1 — Claude → Codex forensic recovery

**Intermediate preservation checkpoint: verification remains in progress.**

Recovery date: 2026-09-19. Canonical branch: `codex/maya-identity-consent-20260913`.

**WAVE 1 CODE RECOVERED: YES. WAVE 1 CERTIFIED: NO. WAVE 2 STARTED: NO.**

This is recovery and verification, not new implementation or production activation. Final executable results and hygiene evidence are linked below when collected. No historical green claim is inherited as a current test result.

## Preserved history

| Item | Recovered evidence |
|---|---|
| Remote before recovery | `a2f98a520768fedc65e54b4a19fc3931ddf34d48` |
| Local final Claude code | `df6c3a5a56819194c9df9d39b902f26dc6ea33c5` |
| Initial divergence | ahead 33 / behind 0; no merge/rebase needed |
| Initial canonical worktree | clean; no uncommitted/untracked runtime work |
| Recovered commits | 33 contiguous descendants: nine prerequisites, nine gate units, one U4 constructor correction, fourteen review corrections |
| Relation to “28 commits” | The first 28 end at `01240ce1`; five further review corrections are present through `df6c3a5a`. Identification is by content/history, not an assumed count. |
| Missing identified units | 0 of the recovered Wave 1 unit/review set; this does not claim knowledge of never-recorded work |
| Recovery publication | Normal fast-forward push of all 33 commits to the canonical branch; no force push |
| Other worktrees | 31 registrations, 22 existing paths inspected; other dirty work preserved. No additional Wave 1 descendant found. Missing registrations were not pruned. |

Every recovered commit was LOCAL COMMITTED / UNPUSHED initially and is now ALREADY REMOTE. The per-commit identity, parent, touched files and classification are in [recovered-commits.json](evidence/maya-chat-first-ux/recovery-20260919/recovered-commits.json). A verified Git bundle, pre-fetch refs/reflogs/status, expanded worktree inventory and evidence copies are preserved in the local recovery evidence directory. No reset, clean, rebase, stash, forced checkout, worktree deletion or pruning was used.

The main Desktop worktree actually had 25 default status entries at inspection, rather than the old prompt's historic 24. Recovery treats the observed pre-state as immutable, not as something to “correct” to a reported count.

## Reconstructed authority and programme

- [Widget Contract V1.1](MAYA-WIDGET-CONTRACT-V1.md), especially the gate table and applicability clauses, remains authoritative. Its unchanged SHA-256 is `606d7f99da5fe1977d5efe737dca91a04f2b11faecddbd666120d34a03e94a8a`.
- [V1.1 decision record](MAYA-WIDGET-CONTRACT-V1.1-DECISION-RECORD.md) D.1/D.4 supersedes the stale OPEN header of Decision Sheet 04: R-01 through R-04 are transferred; R-05 remains deferred. Four STOPs and two step-5 questions remain on Sheet 06.
- [Chat-First envelope](MAYA-CHAT-FIRST-IMPLEMENTATION-ENVELOPE.md) and [K1–K16 mapping](MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md) define the surrounding programme. Earlier Chat-First “Wave 1” K1/K2 completion is not the current gate-programme Wave 1.
- [Decision Sheet 05](DECISION-SHEET-05-RELAY-GATE-RECONCILIATION.md) S5-1/S5-2 remains open. Production deployment remains blocked; recovery does not resolve relay policy or move served aliases.
- [Decision Sheet 06](DECISION-SHEET-06-CONTRACT-V1.1-STOPS.md) S6-1–S6-4 and S6-5/S6-6 remain open within their stated scope.
- [Decision Sheet 07](DECISION-SHEET-07-GATES-LIVE-SCOPE.md) OD-1–OD-5 remains open. Its “What Waves 0–5 deliver with no answer” permits those gate waves without answering these questions; Wave 6 specifically waits for OD-1/OD-2. None is silently accepted here.

The [full recovered programme](evidence/maya-chat-first-ux/recovery-20260919/recovered-gates-programme-v11.md) is preserved with its provenance tags and an explicit warning that historical claims are not current certification. Later-wave material is archived, not implemented or newly approved. The programme’s artifact table identifies `G2-BACKLOG` as regenerable from repository evidence when step 5 starts; no fabricated recovered backlog or new step-5 work is introduced here.

The lost scratchpad was not wholly lost: durable programme reconstruction, surviving reports and original Claude transcript tool payloads were recovered. [Scope and exit duties](evidence/maya-chat-first-ux/recovery-20260919/recovered-wave1-scope-and-exit.md) retain the reconstruction provenance tags. [Original deviations](evidence/maya-chat-first-ux/recovery-20260919/original-deviations.md) recover all seven original DEV-W1 entries verbatim, with the source identity. Historic assertions of completed tests remain untrusted claims.

CKPT-W requires the full final-code regression, typechecks/lint/build, K3 and existing contract gates, live/BIN evidence, every declared mutation battery, e2e and seeded HTTP smoke, applicable canonical-owner PostgreSQL proofs, unchanged audit, publication/CI records, and cleanup. It does not mean production 15/15 gate conformance. The unchanged current audit remains **0/15**.

## Verification and independent review

See [verification protocol](evidence/maya-chat-first-ux/recovery-20260919/verification-protocol.md) and [independent review disposition](evidence/maya-chat-first-ux/recovery-20260919/review-disposition.md). No runtime, schema, dependency, contract or test expectation is rewritten in this recovery.

The formerly blind test had already been replaced in `5eb14456`; `df6c3a5a` additionally derives the transaction slot boundary. Recovery independently reintroduces only the original bad method-body read, retaining the transaction signature and call site, and requires D-1-TX-b itself to fail. A successful compiler failure would not be sufficient evidence for this check.

Controlled process experiments distinguish assertions from infrastructure crashes. Node 24.15.0 crashes with four and two workers; both runs remain FAIL even though all assertions that ran passed. Node 22.23.2 is the repository CI runtime. Matching code/test expectations are used in all comparisons. Earlier OS diagnostic reports show native EXC_BAD_ACCESS/SIGSEGV in V8 root iteration/garbage collection; that supports a runtime-level diagnosis, not a proven upstream root-cause fix or an external-kill claim.

The 19 declared batteries run as CI-style independent shards, each against the complete final code and its own newly created proof database. All mutants and full default steps remain enabled. Neither a crashed control nor an unreadable Jest report counts as a successful mutation kill. Entry-level HTTP flags are not promoted to L/L-T: production mint provenance and paired BIN evidence remain separately required.

## Certification limits

Known CI failures already present at `a2f98a52` reproduce after the recovery push: production dependency audit (12 vulnerabilities: one moderate, eleven high) and the frontend `missing isolated SaaS chat storage` check. Their pre-existence does not make CKPT-W green. The Widgets Mutation workflow file exists on this branch but is absent from the remote workflow registry; dispatch returns HTTP 404. No default-branch or repository-settings change is made to bypass that gap.

The conditional CKPT-W owner-proof duty applies: the recovered diff changes `src/appointments/client-appointment-create.service.ts`, CRM client cancellation/rescheduling/quote owners, `src/tenancy/memberships.service.ts` and `src/orchestration/c9.module.ts`. It is not inferred merely from changes inside widget tests.

Independent clean-export comparison also reproduces all three owner/HTTP failures on `a2f98a52`, with identical assertions: HTTP smoke gets `validation` instead of `trial_activation_token_required`; appointment creation is denied by policy/approval; kernel architecture barrier rejects `/crm/`. See [baseline proof comparison](evidence/maya-chat-first-ux/recovery-20260919/baseline-owner-proof-comparison.json). These are pre-existing but still red CKPT-W obligations; no assertion or authority rule is weakened to pass them.

Legacy Python CI independently reports the same 64 failing/error test identifiers on both checkpoints (34 failures, 30 errors). [CI comparison](evidence/maya-chat-first-ux/recovery-20260919/ci-baseline-comparison.json) distinguishes these from Wave 1 changes.

Further executable results and final publication/hygiene checks are recorded below. This report is not a waiver of any failing exit requirement. Gate Wave 2 is not started.

## Executed checks on recovered code

| Check | Independent result |
|---|---|
| Closing regression, whole-commit export / Node 22 | **PASS — 530 suites / 5022 tests**, no skipped assertions substituted for missing suites |
| Controlled Node 22 comparison | Four workers and in-band each **530 suites / 5022 tests PASS** |
| Controlled Node 24 comparison | **FAIL** with both four and two workers: one suite failed to run due to SIGSEGV in each experiment; 0 failing assertions does not make either run PASS |
| Blind transaction-read negative | **PASS**: unchanged control exit 0; exact body-only defect exit 1, killed specifically by **D-1-TX-b** |
| Widgets live | **PASS — 12 suites / 244 tests** |
| Production-binary proof, local built artifact / synthetic DB | **PASS — 10/10**, health 200; production runtime was not contacted |
| Evidence verifier | **PASS — 0 violations**; 2 manifest lines, **0 L/L-T claims**, HTTP/BIN production mints captured **0/0** |
| E2E | **PASS — 1 suite / 1 test** |
| Application / scripts / widgets-live typechecks | **PASS / PASS / PASS** |
| Lint | **PASS — 0 errors, 9 warnings**; no auto-fix or configuration change |
| Build / Prisma validate | **PASS / PASS** |
| K3 structural check | **PASS — 10/10** |
| Contract checks / conformance audit checker | **PASS**; 15 gates, 165 clause keys exactly equal to the unchanged inventory |
| Audit-check self-test | **PASS — 4 positives / 14 negatives**, each negative fails its own rule |
| Existing contract/package check script | **PASS**, including K3–K6 and F88; four widget-contract items remain explicitly pending on later packages |
| Historical Chat-First Waves 2–5 gates | **PASS** rechecks of existing work; this is not implementation or commencement of Gate-programme Wave 2 |
| Full battery loading | **PASS — 19 declared batteries / 203 mutants**, no dead find anchors or killer IDs |
| Mutation-runner self-test | **PASS — 16 checks** |
| Seeded HTTP smoke | **FAIL**, exact same assertion reproduced on `a2f98a52` |
| Appointment owner PostgreSQL proof | **FAIL**, exact same assertion reproduced on `a2f98a52` |
| Action Engine kernel PostgreSQL proof | **FAIL**, exact same assertion reproduced on `a2f98a52` |

[Regression summaries](evidence/maya-chat-first-ux/recovery-20260919/regression-results.json), [live/BIN evidence](evidence/maya-chat-first-ux/recovery-20260919/live-and-binary-results.json), [counterfactual report](evidence/maya-chat-first-ux/recovery-20260919/independent-tx-negative.json), and [completed pre-mutation commands](evidence/maya-chat-first-ux/recovery-20260919/pre-mutation-gate-results.json) preserve the distinction between these checks.

CI on the recovered code: Widgets Live run `35433039510` PASS; Widget Contract run `35433039583` PASS; Platform CI run `35433039533` FAIL. Baseline comparison is run `35269541157`. No Widgets Mutation CI run was created: the workflow is absent from the remote workflow registry and dispatch returns 404. No CI failure is waived by this recovery.
