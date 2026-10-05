<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 92d0af62810286e854d8573bd61725c0aafc3403ca0afd5dbb8ca8d563fa8e9a -->

# Certification STOP: native HTTP baseline instability

Candidate: `fed5f7dfa0a5611dba24b40a8143b354c22151e5`.

Two fresh unmutated native AR live controls failed before any AR mutation result could be admitted. This blocks certification. The underlying cause is unresolved; these observations do not establish a backend product defect, L27 regression, or a proven resource-contention explanation.

| Attempt | Result | Exact observed failure | Receipt |
| --- | --- | --- | --- |
| First isolated native AR control | 400 PASS / 5 FAIL | `SV2-HTTP registered authenticated route refuses caller authority and consumes real V2 coordinator`: 120000 ms timeout. Later PROFILE-INGRESS, E1-T2B-CLEAN, T-F11/B-1 and BS-SOURCE report `Cannot read properties of undefined (reading 'Socket')`. | `receipts/mutation-diagnostics/1-live-1790778318690.json` |
| Fresh native AR retry, fresh database | 403 PASS / 2 FAIL | `F88-1 [HTTP] every one of the 28 forbidden keys is refused at depth 0 and at depth 3, with the location named`: 120000 ms timeout. `F88-2`: `socket hang up`. | `receipts/mutation-diagnostics/1-live-1790779347865.json` |

The normal full live suite passed 405/405. A separate fresh unmodified full diagnostic also passed 405/405 (`receipts/ar-baseline-diagnostic-full-live.json`). Four independent native controls passed. These are intermittent failures, not a reproducible assertion showing weakened authority semantics. A green repeat cannot erase the red controls.

## Exact execution context

The stock command was `node scripts/widgets-mutation-battery.mjs --gate AR --out <external receipt path>`. No test filters, shortened step list, changed timeout, altered assertions or changed declaration were used. Native live baselines contain all 405 tests. Build controls use all 5598 backend tests plus typecheck and K3.

Node 22.23.2, Darwin arm64, loopback PostgreSQL on port 55729, public CI values from `test/widgets-live/support/environment.ts`; no provider keys. First isolated database: `maya_widget_gate_proof_finalfed5iso_worker1`. Retry: `maya_widget_gate_proof_finalfed5_ar_retry`. The retry ran while independent mutation workers were still active; resource interaction is an unproved hypothesis, not an established cause.

Inputs were materialized outside the candidate. `MUTATION-INPUT-PROVENANCE.json` records 2331 compared tracked source inputs per worker and zero mismatches. Two public `.env` example templates were omitted by configuration sanitization and are disclosed there. All executable source/tests/declarations were unchanged. Scripts and command receipts are hashed in `HARNESS-PROVENANCE.json` and the proof index. The local reproduction scripts require a fresh proof database and refuse to overwrite an existing database; they must not be pointed at production.

An earlier separate orchestration attempt had allowed K5's temporary source counterfactuals to overlap readers of the original runtime. It was invalidated, stopped, archived under `receipts/inadmissible-concurrent-attempt`, and replaced with independent runtime/carrier copies. The backend full suite was rerun successfully. That discarded attempt is not the evidence for the two failures above.

## Diagnostic limit

The extra HTTP lifecycle preloader run produced 404 PASS / 1 FAIL because its own required environment variable was scrubbed by an E2 child while the preload remained inherited. This is an external diagnostic-tool error and is excluded from candidate results. Its trace does not establish the root cause of the native failures. No third candidate failure is claimed.

## Consequence

All certification processes have stopped. Only the completed NS native part is admissible: 5/5 as declared with a green full control. The remaining native programme is incomplete. Eight additional L27 runtime counterfactuals were killed by their named tests after a green full runtime baseline, but cannot substitute for the 502-declaration backend corpus.

No complete mutation aggregate, CI-equivalent certificate, profile certificate or release authorization readiness is issued. The next required work is to establish and correct the cause of unreliable native HTTP controls, then run the complete fresh programme on the final candidate. No candidate source fix is included in this checkpoint. All red, interrupted and diagnostic receipts remain available; no retry is silently substituted.
