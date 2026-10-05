<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 52329b5dfd4e85cf93b40279280ca95a89f5055f1ec122a7edf1866de3cfba33 -->

# Certification harness diagnosis

**Harness defects proven. No product defect established.**

Current clean candidate: `2915ab8e7c089e2c1f39848cb795940e5267c119`, based on the requested `fed5f7dfa0a5611dba24b40a8143b354c22151e5`. Fourteen changed files are test/harness files only. Product, presentation and timeout changes: zero.

The investigation reproduced Darwin IPv6-wildcard/IPv4-loopback port shadowing under the unchanged stock eight-worker runner. Captured requests reached an unrelated listener, not the intended backend, producing both timeout and socket-reset failure classes. The repair explicitly owns an IPv4 listener. The historical requested SV2/F88 sockets were not captured, so the individual causes of those three past incidents cannot be asserted from a trace. The proven diagnosis is the reproduced harness defect and its before/after regression, together with fresh SV2/F88 controls on the repaired candidate. See `ROOT-CAUSE-BAB750D8.md` and retained process/port/socket evidence for the causal limits and full receipts.

Subsequent fresh full-corpus runs exposed two additional test defects: an incomplete booking admission double could mask a removed guard (`m13-followup/DIAGNOSIS.json`); fixed-date billing fixtures depended on the real date (below). These repairs change tests only. Previous partial runs are diagnostic, not final certificates.

## UTC date-boundary defect

At 2026-10-01 00:00 UTC, two billing negatives failed in unrelated native mutation workers. The exact unmutated bab750d8 spec reproduced 2 PASS / 2 FAIL independently. It declared an active/not-yet-due window ending at that exact timestamp while product code correctly compared the window with `new Date()`.

Controlled clock on unchanged source:

| Clock | Result |
| --- | --- |
| Existing fixture NOW: September 2 | 4 PASS / 0 FAIL |
| One millisecond before deadline | 4 PASS / 0 FAIL |
| Exact deadline | 2 PASS / 2 FAIL |
| One millisecond after deadline | 2 PASS / 2 FAIL |

The fixtures use mocked persistence and provider execution. No real billing or provider call occurred. This proves an expired test premise, not a backend latency/deadlock or billing defect. Receipt: `clock-followup/CLOCK-BOUNDARY-REPRODUCTION.json`.

Repair: this describe alone uses its existing NOW as Jest's clock and restores real timers after each test. A load-bearing clock regression fails before the repair and when the clock pin is removed. The fixed five-test suite passes with each of the four controlled ambient times. No timeout was changed. Receipts: `clock-followup/REPAIR-REGRESSION.json`, `PRECOMMIT-FORMATTED-CHECKS.json`, `canonical-formatted-clock-spec.json`.

Commit `2141e24544b5157c6341b649661d0cd3a2c21c48` adds this narrowly scoped repair, H-P408-CLOCK-1 and the exact 507-declaration inventory. The previous bab750d8 native corpus was interrupted; all eight owned process groups were stopped and post-stop inspection found no remaining group members. Unrelated services were untouched.

## Mutation target drift

The fresh 2141e245 run then correctly refused certification because M9-28 survived with green baseline controls. Its old single-line source anchor, originally the USER index lookup, matched an assistant lookup after the 9.6 refactor. The unchanged USER writer still had the correct conversation predicate, and its named T9-WRITE-1 test could not see a mutation in another method.

Commit `30fa24698f3ae277c22209e8edfd448c29e4f872` narrows the declaration to the canonical USER aggregate and adds an AST method-boundary guard. That guard fails with the old declaration and passes after the repair; the same focused T9-WRITE-1 comparison records old SURVIVED versus repaired build-killed with green controls. All 36 harness-integrity tests pass. Product and timeout changes remain zero. Proof: `m9-followup/DIAGNOSIS.json` and `FOCUSED-REPRODUCTION.json`. All 2141e245 partial receipts are diagnostic only; a complete fresh programme is mandatory.

The targeted preflight on 30fa2469 also found the paired M9-27 tenant-qualification declaration at the same wrong assistant query. Commit `5230bd9e23903941b8f7c4b814c2a326d14a3cbf` repairs that anchor and guards all seven M9-27…M9-33 USER mutations. The family guard reports six passes/one failure before this repair and seven passes afterward; full harness integrity is 42/42. M9-27 independently reproduces old SURVIVED versus repaired build-killed with green controls. The full native 30fa2469 corpus never started; all its receipts are excluded from the next exact-candidate certification.

Commit `705d57cd787e24d8944dbe764789e27fd9af3708` also preserves coverage of the assistant branch that the old anchors accidentally changed. A dedicated foreign-tenant/foreign-conversation index test and TURN-M13/M14 prove both predicates. With the previous tests, both edits survive; with the new assertion, both are build-killed and healthy controls stay green. The runner has 44 passing integrity checks. Receipt: `assistant-index/REPAIR-REGRESSION.json`. Product files remain unchanged.

## Canonical assembly mismatch

The 705d57cd full programme completed all 65 parts with 509 declarations and zero declared mismatches. A host clamshell sleep during that campaign invalidated nine whole parts; all nine were reexecuted completely on that same candidate with new proof databases, full default suites and unchanged timeouts. Those repeated parts passed and did not overlap further sleep. The original receipts remain retained. This Oct 1 event is separate from the original Sep 30 SV2/F88 failures: the retained power log has no Sleep/Wake event near those historical failure windows (`HISTORICAL-POWER-CORRELATION.json`).

Canonical assembly then failed at Gate 4: the runner correctly writes a mandatory plain `baseline|live` even when all live killers use neutralisers, but the collector expected plain baselines only when directly referenced by a plain killer. It therefore rejected the required healthy live reference as an extra control. Its synthetic fixture shared that mistaken assumption; deleting the required live control could consequently pass its old expected-coverage check.

Commit `2915ab8e7c089e2c1f39848cb795940e5267c119` changes only the collector and its test. The expected set now matches the runner's required unmutated live measurement. It validates the complete control shape, step exits, failed assertions and process problems, and continues to reject arbitrary extras. No raw receipt is edited and no red control is waived.

Regression: 50 PASS / 4 FAIL before; 54 PASS / 0 FAIL after. Negative cases cover missing control, missing exit/steps/assertion/problem lists, a substituted neutraliser, red exit, failed assertion and extra control. The corrected collector also accepts all 44 batteries / 509 declarations in the retained actual 705d receipts as a diagnostic only. Those receipts are not retagged or admitted to the new candidate. See `assembly-mandatory-live-before.json`, `assembly-mandatory-live-after.json`, `assembly-real-receipts-after.json` and their logs.

## Fresh certification admission

A complete new programme has finished in `../final-certification-2915ab8e/`, using new synthetic databases and fresh receipts. Canonical assembly passed all 44 batteries / 65 parts / 509 declarations: 344 build-killed, 162 live-killed, two existing HANDOFF pending and one existing equivalent. Applicable kills: 506/506; red baselines and mismatches: zero. Eight additional L27 runtime mutations were killed. The previous candidate's completed parts and diagnostic assembly were not admitted to this run.

The current candidate's SV2-HTTP, F88-1 and F88-2 each pass three independent repeats, the unfiltered live suite and final unrestricted native controls. Backend: 5603 PASS; widgets-live: 406 PASS; runtime on Node 22 and 24: 422 PASS / 7 SKIP each; carrier: 93 PASS; legacy Python: 613 PASS. HTTP/BIN, all six safe FBE2E probes, NS-1, L27, 9.6, BS-1, successor, profile/revocation and artifact parity checks pass. Local CI-equivalent execution is complete; a remote GitHub/Linux run is not claimed.

During this campaign the host entered clamshell/maintenance sleep on October 2 from 06:35:59 to 06:55:23 UTC. Only WR parts 3/4 and 4/4 overlapped it. Both original parts reported green but were withheld regardless, retained with hashes, and fully reexecuted on the same candidate in two new proof databases. Both repetitions passed without another sleep overlap, transport failure, red baseline or mismatch. The other 63 fresh parts remained byte-identical. No timeout or power setting changed. Final inspection found zero owned test processes and zero remaining sessions in the campaign's proof databases; the dedicated fixture PostgreSQL server is intentionally retained.

Profile-applicable false clauses: 0. Global false clauses: 2, the preserved HANDOFF STOP duties. FBE2E disposition is 21 CLOSED / 3 PARTIAL / 4 OPEN. L2, L5, L20, L23, L24, L25 and L26 still lack named owner acceptance or complete closure. The approved AR-1 threshold therefore remains unsatisfied: CERTIFIED_FOR_PROFILE = NO and READY FOR RELEASE AUTHORIZATION = NO. This is an evidence/decision boundary, not a new product defect or incomplete mutation run.

Final records: [report](../final-certification-2915ab8e/REPORT.md), [certification receipts](../final-certification-2915ab8e/CERTIFICATION-RECEIPTS.json), [complete mutations](../final-certification-2915ab8e/COMPLETE-MUTATIONS.json), [baseline admission](../final-certification-2915ab8e/BASELINE-ADMISSION.json), [sleep recovery](../final-certification-2915ab8e/SUSPEND-REEXECUTION.json), and [FBE2E disposition](../final-certification-2915ab8e/FBE2E-DISPOSITION.json).

HANDOFF remains globally STOP; `closed-input.no-handoff@1` is unchanged. Full-contract certification remains false. No production migration, deploy, entitlement grant, real OTP/YCLIENTS effect, iPhone reinstall or Chapter 10 work is authorized or performed.
