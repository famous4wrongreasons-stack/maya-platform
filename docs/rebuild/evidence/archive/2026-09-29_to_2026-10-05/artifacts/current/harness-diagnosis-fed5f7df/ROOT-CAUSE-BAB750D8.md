<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: b4011f8722697c6d0506e14c95a0e1f377aef83181e4c6bce2fb7e064f4b655f -->

# HTTP baseline diagnosis

**Harness defect proven. No product defect established.**

- Starting candidate: `fed5f7dfa0a5611dba24b40a8143b354c22151e5`.
- Current clean candidate: `bab750d8d43a61aeb1d994b0914fd396e2b527d3`.
- Scope: nine test/harness files, zero product or presentation files, no timeout changes.
- Full fresh certification is restarted separately in `../final-certification-bab750d8/`; this diagnosis is not a release certificate.

## Root cause

Supertest implicitly opened an IPv6 wildcard listener with `listen(0)`, then connected to IPv4 `127.0.0.1`. On this Darwin host, a specific IPv4 listener can coexist with the wildcard listener on the same port. The client then reaches the other process.

The unchanged stock mutation runner, under the original eight-worker mix, reproduced both failure classes:

| Failure | Directly observed destination | Receipt |
| --- | --- | --- |
| Timeout | IPv4 port 53800: existing Red Shield VPN PID 675. Intended Node PID 31748 listened on IPv6 `*:53800`; it received no connection/request. | `corpus-5/STALL-EVIDENCE.json`, port/process/socket traces |
| Socket reset in 3 ms | IPv4 port 55729: dedicated synthetic-proof PostgreSQL. The intended HTTP server listened on IPv6 at the same port. | `corpus-3/trace/events-31778.jsonl`, Jest and socket samples |

During the captured stall the event loop was responsive, there was no waiting backend database session, and the socket was new. Product latency/deadlock, connection reuse and an insufficient timeout budget do not explain these captured failures. Concurrency changes ephemeral-port selection frequency; deterministic reproduction does not require concurrency. Existing unrelated services were not stopped or reconfigured.

`collision-repro.json` independently reproduces this with two synthetic HTTP servers: the old wildcard setup returns `OTHER_LOCAL_PROCESS`; explicit IPv4 returns `INTENDED_HARNESS`.

**Causal boundary:** the original historical SV2-HTTP/F88-1/F88-2 failures had no retained port traces. Both failure classes were directly captured in other unmutated live tests under the stock runner. The three requested tests passed independently even before the fix. We do not claim that their original historical sockets were captured, or that every conceivable product defect is ruled out.

## Fix and before/after proofs

The shared live harness now awaits `app.listen(0, '127.0.0.1')` before the first request. All requests and `listenLoopback()` reuse that listener until normal `app.close()` teardown. Routes, authority, product behavior and timeouts are unchanged.

`HAR-LOOPBACK` fails on the old bootstrap and passes on the fixed bootstrap: readiness, IPv4 ownership, stable URL/port, repeated delivery to the correct server and teardown. Native mutant `H-LOOPBACK-1` restores the wildcard listener and must fail this test.

A subsequent fresh corpus run exposed the same latent issue in remaining implicit-listener unit fixtures. Controlled port selection, using an external diagnostic preload and a synthetic IPv4 receiver, proves:

| Fixture | Before | After |
| --- | --- | --- |
| R02 suite | 21 wrong-process requests; 0 pass / 21 fail | 0 wrong-process requests; 22 pass / 0 fail, including new regression |
| Exact failing R02 timeout case | Original 5000 ms timeout; 1 wrong-process request | Pass; 0 wrong-process requests |
| Admin + HTTP bootstrap | 9 wrong-process requests; 10 pass / 9 fail | 0 wrong-process requests; 19 pass / 0 fail |
| e2e | 1 wrong-process request; 0 pass / 1 fail | 0 wrong-process requests; 1 pass / 0 fail |

The injection affects only implicit wildcard ephemeral-port selection. It does not modify explicit IPv4 listeners, routes, guards, expectations or timeout values. Original historical R02 peers were not traced; these are controlled causal proofs. Full receipts and hashes are in `r02-followup/DIAGNOSIS.json`.

The four fixtures now use owned IPv4 listeners. `R02-LOOPBACK` plus existing Admin/bootstrap assertions have native regression mutants. The canonical corpus is **506 declarations: 341 build, 162 live, two existing HANDOFF pending, one existing equivalent**. Its actual complete result is pending; declarations are not successful kills.

## Provenance and certification admission

Harness commits after the untouched starting candidate:

1. `dac4072dd17ec222fe36cc603863965919039708` — live listener and regression.
2. `41906e0c0f48392cc0fef2dc199688d74aa8662d` — harness lint corrections.
3. `86044d2b5ce4800c277314ff39e849ece3e63acb` — exact mutation inventory correction.
4. `dc3a26806b273631e8c6150acfa3e9cacdde91a1` — remaining Supertest fixtures and regression mutations.
5. `bab750d8d43a61aeb1d994b0914fd396e2b527d3` — complete booking admission test double and non-vacuity regression.

Earlier interrupted certification attempts are retained but excluded. Every final receipt must bind bab750d8 and pass the canonical complete assembler. Independent targeted diagnostics and earlier triple full AR controls establish the repair but do not replace that programme. Every ordinary/component suite has now passed freshly on bab750d8; the full native corpus is still in progress.

The original corpus comparison retains process trees, listening ports, request/startup timing, open handles/sockets, CPU/memory, PostgreSQL wait state, stdout/stderr, order/concurrency and exit information. Unit controls in that diagnostic comparison were stopped after capturing the cause and are not completed certification.

`PROVENANCE-NOTES.json` preserves an initial selector that matched zero tests, pre-commit harness status and an early observer-hash timing issue. Those runs are never silently admitted. `ROOT-CAUSE-HISTORY.md` preserves earlier report revisions; this file is the current diagnosis.

No production migration, deploy, entitlement grant, real OTP/YCLIENTS effect, iPhone reinstall or Chapter 10 work occurred. HANDOFF remains globally STOP and the approved restricted profile remains unchanged.

## Prior native repair verification on dc3a2680 (diagnostic after restart)

The complete H-harness battery finished with **25/25 as declared**, including all four new listener regression mutants. All full native baseline steps were green; zero mismatches and zero red baselines. The exact receipt and hash are in `ROOT-CAUSE.json.nativeRepairProof`. This closes native verification of the harness repair; the complete 506-declaration release corpus is still running.

## Subsequent test-double defect: M13-U13C-11

The complete native run on dc3a2680 stopped on one survivor, with green unrestricted unit/live/typecheck/K3 controls. `M13-U13C-11` removes the booking receipt seam's authenticated source and confirmation-key check. All 5599 unit tests still passed. This was a test defect, not evidence that the source guard was absent in Maya.

The AR-1 change `f69f693ab293e4cafec2ee4b579069c5b9895d5a` added two entitlement admission paths. The test double implemented only `assertWidgetRuntimeAdmission`. Its happy owner calls supplied an existing transaction, while N11 and WR-F33 called without one. Removing the guard therefore reached an absent `withWidgetRuntimeAdmission` method. The adapter caught that unrelated TypeError and returned REFUSED, falsely satisfying the negative test.

Controlled diagnostic copies record the actual rejection: original guard → `WIDGET_CANONICAL_INVOCATION_MISMATCH`; removed guard with old double → `this.entitlements.withWidgetRuntimeAdmission is not a function`. The new healthy non-transaction invocation regression fails before the double repair and passes after it. On the final test repair, the unmutated spec passes 13/13, while the exact existing mutant causes seven named failures, including correct source with a substituted confirmation key. Lint and typecheck pass. These targeted diagnostics do not substitute for a complete native receipt.

Commit `bab750d8d43a61aeb1d994b0914fd396e2b527d3` changes only `commit-booking.adapter.spec.ts`: a working entitlement double, a positive non-transaction control, and an independent key-substitution refusal. No product guard, owner contract, timer or mutation expectation was changed. The corpus remains 506 declarations; the full unit suite now contains 5601 tests. Exact before/after reports, mutation trace and repair patch are under `m13-followup/`.

The dc3a2680 corpus is interrupted and excluded from final certification. Its native H-harness and AR successes remain diagnostic receipts only after the candidate change. Every component and all 65 native mutation parts restart on bab750d8. No release certificate has been issued.

## Fresh native M13 regression on bab750d8

All four unrestricted Gate 13 parts completed AS-DECLARED (25 declarations), with green live/unit/typecheck/K3 baselines. The exact M13-U13C-11 mutation is now `build-killed` by the declared N11 killer; unit exits 1, typecheck and K3 exit 0. The receipt and immutable hash are indexed in `../final-certification-bab750d8/M13-NATIVE-REPAIR-PROOF.json`. This is fresh native repair verification, not admission of the still-running complete corpus.

## Fresh native HTTP harness repair on bab750d8

The unrestricted H-harness battery completed 25/25 AS-DECLARED on the current candidate, with all full baseline controls green. All four explicit IPv4 regression mutations were killed by their declared tests. Fresh receipt/hash: `../final-certification-bab750d8/HTTP-HARNESS-NATIVE-REPAIR-PROOF.json`. No previous-candidate receipt is substituted. The full 65-part corpus remains in progress.

## Fresh complete AR battery on bab750d8

The unrestricted native AR battery completed 19/19 AS-DECLARED, with green full live/unit/typecheck/K3 controls, no red baseline and no mismatch. Its complete receipt and the first native full control report hashes are in `../final-certification-bab750d8/BASELINE-ADMISSION.json`; individual fresh ordinary-control timings are SV2-HTTP 546 ms, F88-1 649 ms, F88-2 53 ms. No timeout changed. This resolves the requested AR baseline blocker in the current run, while the rest of the complete mutation programme must still finish.
