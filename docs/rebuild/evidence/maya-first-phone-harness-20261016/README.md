# First-phone certification harness repair — 2026-10-16

Scope: local synthetic evidence work after the approved first-phone Option B.
No application source, role, schema, booking rule, UI design, server deployment,
real grant, provider/model call or phone installation is changed here.

## Preserved baseline and findings

Parent candidate: `7d6aac8c1a46ca86aaac2b51025b1eb04adbaa56`.
Its fresh local Platform CI equivalent passed all 40 stages (backend 9,997 tests,
732 suites; carrier 200; release packaging 18; unsigned simulator build/byte
verification). The separate surface run passed runtime on Node 22 and Node 24
(846 PASS / 7 disclosed SKIP each), Widgets Live 711, HTTP/BIN 21, and release
binary 5. NS-1 was 16/16. These are parent results, **not final-SHA certification**.
The parent supplemental programme and complete surface programme stopped as below.
No full mutation worker started; the waiting coordinator was explicitly cancelled.

### L27 standalone probe drift

The standalone probe still expected COMMIT followed by two accepted tokened
Dismiss operations. It failed 5/17 assertions; the canonical booking/receipt count
and single visible result already passed. This was not a discovered booking defect.

Provenance: `fed5f7df` introduced that probe; `3135cafb` froze submitted booking
confirmations. `97bab7ab` and `59d6e46c` established explicit receipt READ. The
[2026-10-08 checkpoint](../../MAYA-HISTORY-RETENTION-CHECKPOINT-20261008.md)
records the same correction in the regular runtime tests; the standalone probe
had been missed.

The corrected probe uses the existing fixture without an invented tokened
terminal CONTROL. It checks COMMIT, refusal of spent Dismiss/COMMIT, accessibility
rerender, and two explicit receipt READs through real transport/projection/runtime.
A new regular `.test.mjs` wrapper executes the standalone probe in the normal suite.
A disposable-source mutation removes canonical outcome deduplication: the wrapper
fails. The restored runtime passes. No product source is edited in the worktree.
The backend in this probe remains a synthetic store double, not a real-provider proof.

### Fixed-profile evidence selector lost by test environment cleanup

The parent surface run offered zero `FP-` claims. The strict collector accepted
existing global-format claims, then the runner's expected global refusal failed.
The strict collector is a provenance/format checker, not proof of complete coverage;
its zero violations were therefore insufficient. No certificate was issued.

`applyWidgetsLiveEnvironment` had removed the newly introduced
`WIDGETS_EVIDENCE_PROFILE` variable in both Jest and BIN harnesses. The narrow repair
adds it to the existing harness-only list. The same list is removed before a compiled
application child starts; no new environment-based application authority is created.
The regression fails before the repair and passes after, including child scrubbing.
The existing fixed source census, separate eight IDs, U duties and collector rules
are unchanged. The final runner must require the eight exact `FP-` IDs and the
HTTP/BIN L pair, then prove the unchanged global inventory refuses those claims.

## Evidence status

`DIAGNOSTIC-ARTIFACTS.json` preserves paths, sizes and hashes of original failures
and repair checks. They are diagnostic receipts, not final release admission.
The complete programme must run anew on the new committed candidate, including
unfiltered mutation jobs with green baselines and the existing strict admission.
Global HANDOFF STOP and the original no-HANDOFF profile remain unchanged.

Focused repaired-chain result: 15 live tests and 21 HTTP/BIN cases pass.
The eight exact branch IDs are present (seven U duties plus one L HTTP/BIN pair);
strict collector: zero violations; unchanged global inventory: explicit refusal.
The owned artificial database was stopped. See [REPAIR-RESULT.json](REPAIR-RESULT.json).
