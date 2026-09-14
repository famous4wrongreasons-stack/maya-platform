# Wave R-B — late independent edge baseline change / STOP

**STOP: production baseline changed after successful R-B cutover verification and E3 Stage 1 assessment.** No further implementation, production publication, retry or Final Gate was performed after detecting the change. R03/R04/R07 PASS remains the historical result of the verified R-B cutover; this report does not certify the later combined production state as the same tested baseline.

The canonical branch independently advanced from `60e82664` to **`7ee1e670ed4fc503c632d2fc200c34dccd1561f8`**, `fix(edge): restore PHP 5.6 API relay compatibility`. It changes two R01 relay sources, their overlay patches and an architectural test. The wave's report commits `e2279392` and `1c58e651` were already local when the final ancestry check exposed the divergence. No forced push, reset, stash, cleanup of user files or replacement of that upstream change was attempted.

A bounded read-only reread of the same nine already inventoried Beget aliases found **8 unchanged, 1 changed**:

| Known production target | Verified R-B cutover SHA-256 | Later observed SHA-256 |
| --- | --- | --- |
| `mayaos/maya-platform-api.php` | `ca9e7bd28fd62822816cc9eacf21f06db401740e376dd03c2c5f594799c40d46` | `0f33e067495b40ab64b91e4aa1eb179f7403903ccc404bac1872e025671dfb50` |

The later full-file hash exactly equals that relay source in upstream `7ee1e670`; the old hash equals `60e82664`. This is an existing R01 relay path, **not a new production surface or Bxx**. The R-B publisher did not write any PHP file. No rollback of the independent change is authorized or performed here.

Upstream history was preserved with a conflict-free Git merge **`246a32e8`**, solely to publish both sets of commits and this STOP evidence without overwriting another change. This does not deploy or endorse a new runtime baseline. R-B's successful canonical/release regression counts and exact source/release fingerprints remain those recorded before the independent commit; no full mandatory gate on the merged head is claimed.

The [production report](CYCLE-06-PACKAGE-5-WAVE-R-B-IMPLEMENTATION-PRODUCTION-REPORT.md) and [eight E3 Decision Sheets](CYCLE-06-PACKAGE-5-REMAINDER-E3-STAGE-1-ASSESSMENT.md) are complete. Progress remains **10/24 blockers, 6/14 packages** at the verified cutover. Historical inventory is unchanged. Next work must first acknowledge the changed edge baseline, then follow the existing package approval/dependency process. B36 schema APPLIED / runtime NOT DEPLOYED and its two known defects are preserved.

[Exact readback and Git evidence](evidence/package5-wave-rb-late-baseline-stop.json) records the difference. Production business/provider/messages for proof remain **0**; no new mutation was used to diagnose it. Main 24 dirty entries and 17 old databases remain untouched. Owned databases/staging/processes were already cleaned up; process hygiene remains **0**.

```text
R03/R04/R07 VERIFIED CUTOVER: PASS
LATER PRODUCTION BASELINE: CHANGED
LATE EDGE ALIASES MATCHING VERIFIED CUTOVER: 8/9
UPSTREAM CHANGE PRESERVED: YES
NEW INVENTORY SURFACE / BXX: NO / 0
FURTHER IMPLEMENTATION / DEPLOYMENT: NO / NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
PROCESS HYGIENE: 0
STOP: PRODUCTION BASELINE DIVERGENCE
```

Commit/push this evidence, then STOP. Do not reopen the inventory or repeat the already-approved B36 owner/schema/channel-order decision.
