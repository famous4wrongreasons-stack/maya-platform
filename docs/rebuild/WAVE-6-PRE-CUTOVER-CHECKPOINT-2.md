# WAVE 6 — PRE-CUTOVER CHECKPOINT 2 (after rulings R1–R3 of 2026-09-17)

```
GATES LIVE CONTRACT-COMPLETE:     6/15
G2 SUCCESSORS:                    111/437
PUBLIC LEGACY BUNDLES EXPOSED:    0          (was 44)
SERVED MAYA WEB SHELL:            NO         (plan v2.1 ready; not built)

K14 READINESS:                    FAIL
K15 READINESS:                    FAIL
K16 DELETION READINESS:           FAIL       (0/437 retirable)

THREE-BUNDLE PROBE:               FAIL       (2 of 4 checks now PASS)
ROLLBACK READINESS:               PASS
NATIVE/PWA:                       NOT PROVEN

PACKAGES COMPLETE:                13/16
WAVES COMPLETE:                   5/6
MAYA CHAT-FIRST COMPLETE:         NO
CHAPTER 10 STARTED:               NO

PRODUCTION MUTATIONS:             LEGACY BUNDLE REMEDIATION ONLY
```

**Stopped on:** DECISION-SHEET-04 — four owner rulings, thirteen recorded yeses (Block A) and a blanket confirmation
(Block B). Gates 8-R to 13 cannot become live, G2 cannot close its capability rows, and K14 cannot pass its exit
without them.

---

## What was done

| item | result | evidence |
|---|---|---|
| **R3 remediation** | 44 publicly served legacy bundles moved to a non-public archive, not deleted. SHA-256 equal 44/44, mtime kept 44/44, former URLs 404 44/44, canonical entries byte-identical 7/7. The post-remediation sweep of all three served docroots finds 0 served legacy copies (48 private backups, all 403). | `evidence/…/legacy-bundle-remediation-r3.json`, `three-bundle-probe.json` `postRemediation` |
| **`widgets.runtime` trial leak** | Closed. A full-access trial no longer grants a `planned` feature; an explicit grant still does. The K3 check now proves it. | `1991f867` |
| **Approved bot copy fix (D9-bis step B)** | Applied as a clean 3-hunk patch, byte-identical to the approved edit and not deployed. F-UNSUBSCRIBE stays OPEN. | `4f2914f5` |
| **K14 evidence corrected** | The ledger read the owner's Desktop copy. On the canonical tree, **28 of 45** commands execute into an unreachable body (published: 0), and 7 of 7 fences hold (published: 4 of 6). | `ce2d6c00`, `k14-telegram-probe.py` |
| **Gate pipeline spine (U0, Phase A)** | Per-gate files; typed refusal codes; J-1 facts; JWT-validated actor; union record select; slots 8 and 10 are refusing stubs (the legacy code failed open); owner-ports boundary; configureHttpApp extraction pinned; K3 checks 4 and 9 stricter; live harness on an isolated proof database; CI workflows. Full regression 490 suites / 4,366 tests / 0 failed; wave gates 2–5 COMPLETE; 13 of 14 mutants killed, the survivor fixed. | `c751709d..da9932aa` |
| **K3 constant-time test** | The timing test was vacuous: it passed with `===`. A structural detector now kills the mutant, and the timing check is an honest noise bound. | `657fbc4f` |
| **Decision sheets** | Sheet 03 answered (Option A). Sheet 04: 173 candidates screened and refuted down to what is genuinely open. | `DECISION-SHEET-04-RULING-PACKET.md` |

## Why each readiness line is what it is

- **Gates 6/15.** 1, 2, 3, 4, 5 and 14 are complete on the live path. 6 and 7 are partial. 8, 9 and 10 are
  refusing stubs, and 8-R, 11, 12 and 13 are not live. The clause specs, integration plan and harness exist.
  Gates 8-R to 13 need Block A items A1–A4 and the principal and minting prerequisites the integration plan names.
- **G2 111/437.** The triage of the 326 open rows is complete:
  - 108 rows expose existing owners. They reduce to 52 capabilities and need R-01 for new C9 keys.
  - 57 are scope contradictions: 24 not needed, 33 recorded as decided or needing a recorded yes.
  - 88 are fence work, 49 per-row proofs and 11 native-blocked.
  - No fictitious capability was created.
- **Three-bundle probe.** No legacy bundle is reachable, and no role-mode build is served: both PASS. Older legacy
  relay copies with an executable `.php` extension are still present on two hosts: FAIL. They are outside R3's
  bundle scope and were not requested. No Maya shell bundle is served: FAIL.
- **K14.** 28 commands are unreachable. The command door (R-03) and the withdrawal recording (R-04) need rulings.
- **K15.** Production serves 0 legacy copies, and maya-os-site unreachability is now PROVEN. The one remaining
  condition is the successor: no Maya shell bundle is served.
- **K16.** No row has a served successor, parity fixtures, an exercised rollback or a production observation.
- **Native/PWA.** No native source is in the repository. The wrapper question is R-05, deferred until native cutover
  is scheduled.

## Next, once the rulings arrive

1. Contract V1.1: the Block A amendments and the errata bundle, one version, signed with R-01.
2. Gates Phase A units U6, U7, U8R, U10a, U11a, U12a and U13a (ruling-independent), then U8a, U9 and U10b.
3. The served shell's P1 units, built and verified locally on the isolated proof database.
4. G2 capability exposure per R-01, fence tests and proofs.
5. K14 Phase B per R-03 and R-04.
6. Pre-cutover determination re-run. No K16 deletion before readiness.
