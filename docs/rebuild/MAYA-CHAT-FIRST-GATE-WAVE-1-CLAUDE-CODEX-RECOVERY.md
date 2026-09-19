# Gate-programme Wave 1 — Claude → Codex forensic recovery

**Final forensic recovery verdict: code recovered; Wave 1 NOT CERTIFIED.**

Recovery date: 2026-09-19. Canonical branch: `codex/maya-identity-consent-20260913`.

**WAVE 1 CODE RECOVERED: YES. WAVE 1 CERTIFIED: NO. WAVE 2 STARTED: NO.**

This is recovery and verification, not new implementation or production activation. Final executable results and hygiene evidence are linked below. No historical green claim is inherited as a current test result.

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

Executable results and publication/hygiene evidence are recorded below. This report is not a waiver of any failing exit requirement. Gate Wave 2 is not started.

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

Intermediate preservation checkpoint `31c74663` publishes recovery documentation only; it does not certify Wave 1. Its independent CI receipts are Widgets Live `35438957495` PASS, Widget Contract `35438957518` PASS, MAYA Chat Shell `35438957531` PASS, and Platform CI `35438957498` FAIL. The failed log again reports exactly 12 dependency vulnerabilities (1 moderate / 11 high), the isolated SaaS chat-storage assertion, and legacy Python 613 tests with 34 failures / 30 errors. See [checkpoint CI runs](evidence/maya-chat-first-ux/recovery-20260919/ci-recovery-checkpoint-runs.json).


## Final complete mutation verification

All **19/19 declared batteries completed** on the recovered final code. All **203/203 declarations matched**: **113 build-killed + 87 live-killed = 200 killed**, and **3 explicitly declared pending**. There are **0 survivors, 0 unexpected classifications, 0 vacuous kills, 0 control/mutant diagnostics and 0 null process exits** in the final reports. Pending is not called killed or live-conformant.

| Battery | Build killed | Live killed | Declared pending | Total | Result |
|---|---:|---:|---:|---:|---|
| 10a | 5 | 0 | 0 | 5 | AS-DECLARED |
| 11 | 7 | 0 | 0 | 7 | AS-DECLARED |
| 12 | 5 | 0 | 0 | 5 | AS-DECLARED |
| 12k | 3 | 0 | 0 | 3 | AS-DECLARED |
| 4 | 2 | 2 | 0 | 4 | AS-DECLARED |
| 6 | 7 | 12 | 2 | 21 | AS-DECLARED |
| 7 | 27 | 8 | 0 | 35 | AS-DECLARED |
| 8 | 0 | 5 | 0 | 5 | AS-DECLARED |
| 8c | 8 | 0 | 0 | 8 | AS-DECLARED |
| 8r | 4 | 25 | 0 | 29 | AS-DECLARED |
| 9a | 2 | 0 | 0 | 2 | AS-DECLARED |
| H-harness | 0 | 19 | 0 | 19 | AS-DECLARED |
| P-f88 | 6 | 8 | 0 | 14 | AS-DECLARED |
| P-ledger | 7 | 0 | 0 | 7 | AS-DECLARED |
| P-pairing | 6 | 0 | 0 | 6 | AS-DECLARED |
| P-principal | 3 | 8 | 1 | 12 | AS-DECLARED |
| P-render | 8 | 0 | 0 | 8 | AS-DECLARED |
| P-seal | 6 | 0 | 0 | 6 | AS-DECLARED |
| T-tables | 7 | 0 | 0 | 7 | AS-DECLARED |

Pending items are Gate 6 `M17b` / `M18b` (held clauses 6(d)/6(e), pending U6-L3) and P-principal `P-M11`. Their existing later-wave boundaries are preserved. These are distinct from the unimplemented Gate 7 counterfactual recorded in original DEV-W1-6 / review §4.1.

[Final battery summary](evidence/maya-chat-first-ux/recovery-20260919/mutation-results.json) and [complete compressed runner reports](evidence/maya-chat-first-ux/recovery-20260919/mutation-reports.json.gz) preserve every mutant and control result. These supersede the explicitly intermediate `mutation-checkpoint.json`; that checkpoint is retained as history. [Complete command results](evidence/maya-chat-first-ux/recovery-20260919/verification-results.json) include all 19, not just the earlier partial run. [Actual runner executable](evidence/maya-chat-first-ux/recovery-20260919/mutation-runner-executable.json) verifies Node 22.23.2 at runtime.

The longest local shard was Gate 7: 12824.21 seconds. This is local evidence, not proof that the unchanged GitHub job timeout will accommodate the run. The repository's 180-minute mutation job limit was not increased, and no mutation CI receipt is invented. No failed assertion, crashed control or unreadable report was retried into a claimed green result.

## Exact unresolved Wave 1 exit requirements

1. **Seeded HTTP smoke:** `npm run test:http` returns `validation` where its assertion requires `trial_activation_token_required`.
2. **Appointment owner PostgreSQL proof:** `npm run action-engine:appointment-proof:ts` terminates with `ActionExecutionTerminalError: Action policy or approval did not allow execution` on create.
3. **Kernel PostgreSQL proof:** `npm run action-engine:proof:ts` fails the `architecture_barrier` assertion for `/crm/` (actual true, expected false).
4. **Platform CI is red:** dependency audit has 12 vulnerabilities (1 moderate, 11 high); frontend app fails `missing isolated SaaS chat storage`; legacy Python has 34 failures / 30 errors in 613 tests. All three reproduce at the original remote baseline; pre-existence is not a waiver. [Exact Python failure/error identifiers](evidence/maya-chat-first-ux/recovery-20260919/ci-python-failure-identifiers.json) preserve the identical set across baseline, recovered code and intermediate documentation checkpoint.
5. **Required mutation CI receipt is missing:** the branch workflow cannot be dispatched through the current registry (HTTP 404). Local 19/19 execution does not replace the required CI receipt.
6. **Disclosed review coverage debt:** original DEV-W1-6 / review §4.1 calls for the Gate 7 `T-SRC-INV30` counterfactual; it is absent from the recovered Gate 7 declarations. Its Gate 8R counterpart exists, but is not silently treated as completion of the separate review duty.

The native Node 24 SIGSEGV remains reproducible and unresolved at root-cause level. The verified CI-matching Node 22 mitigation produced three full passing regressions, including the final whole-commit export. Node 24 crash runs remain FAIL in the evidence. No production mutation or production test was performed.

## Preservation, cleanup and publication

Runtime/source/schema/test expectations remain exactly those of recovered `df6c3a5a`. Recovery adds only documentation and evidence. The independent blind-test check verifies Claude's existing correction; it does not claim Codex wrote a replacement that was already present.

All 26 owned temporary proof databases were dumped before being dropped; the separate owned cluster on port 55619 was stopped. Dumps remain private recovery evidence, with [dump hashes](evidence/maya-chat-first-ux/recovery-20260919/owned-proof-dump-hashes.json) in the repository. No pre-existing database or cluster was accessed. The user's protected main worktree retains its exact original status bytes and all 23 recorded file hashes, including the observed 25 default dirty entries.

[Database hygiene](evidence/maya-chat-first-ux/recovery-20260919/database-hygiene.json) and [final process/main-worktree check](evidence/maya-chat-first-ux/recovery-20260919/final-hygiene.json) record: main worktree touched **NO**; pre-existing databases touched **0**; owned processes/watchers/browsers/databases **0**. The active worktree for this report is the isolated `work/maya-identity-consent` worktree. Existing unrelated worktrees and their dirt were never reset, cleaned or deleted.

The 33 source commits were already fast-forward published, followed by documentation preservation checkpoint `31c74663`. The final documentation/evidence update is published by another normal fast-forward push, with post-push SHA equality and clean-worktree verification recorded in the final recovery response and private `final-publication.json`. No force push is used; no dirty main worktree is made clean.

**WAVE 1 CODE MERGED: YES. WAVE 1 CERTIFIED: NO. WAVE 2 STARTED: NO.**

**Exact next step:** remain in Wave 1 and resolve the six explicit exit/review gaps above through the appropriate owned remediation/release process, then rerun affected proofs and obtain the required CI receipts. This recovery does not implement those fixes, alter the contract, or begin Wave 2.
