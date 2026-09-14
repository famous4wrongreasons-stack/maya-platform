# Combined native-consent baseline restored; R-C resumes

2026-09-08. The [controlled production correction](CYCLE-06-NATIVE-CONSENT-SECURITY-INVALIDATION-PRODUCTION.md)
completed the exact approved A18 security incident. G1/G2 and invalidation-aware
readers are active in `20260908-a18-security-consent-0867ecea`; health/readiness
PASS, 607 compiled/schema artifacts match, 9/9 aliases match the bounded cutover.
No new production path or schema/business contradiction was found.

## Preserved WIP and exact integration

Merge `23d623a2` retains both the complete original R-C ancestry through
`ed13d57f` and the certified consent ancestry through `b15cf282`. No rebase/reset,
force push, deleted WIP, regenerated prior migration, or rewritten dump. Conflicts
were only additive declarations in Prisma, action registry and CrmModule; both
approved owners were retained. Eight package WIP scopes apply with these shared
unions. The composed PWA preserves the four certified consent functions exactly.

R08 now uses the common effective-consent resolver and consent lock. Its internal
profile query selects only privacy/marketing timestamps and notification preferences;
exact Client eligibility and the invalidation reader are permanent ratchet checks.
The first shared test run correctly rejected its previous whole-profile query;
that owned integration defect was fixed and the affected guard rerun. R06/R08 proof
fixtures now obtain privacy/marketing facts through actual keyed A18/AE rather than
using a profile timestamp as synthetic consent. A pre-existing unfinished R14 type
narrowing defect was corrected without changing its terminal rejection behavior.

## Required restored proof

Evidence: [native-consent-rc-restoration](evidence/native-consent-rc-restoration/).

- Clean replay **93 migrations PASS**; the nine approved R-C migrations also apply
  after the already-applied security schema on a separate owned synthetic database.
- Combined R-C PostgreSQL constraint proof PASS: 11 models / 197 fields unchanged,
  shared tenant/FK/identity/receipt/AC6 interactions and transaction-local UTC.
- Security/provenance/lifecycle proof **36 cases PASS** against combined schema,
  including R08 invalidated-consent denial with a deliberately stale profile,
  unrelated consent allowed, fresh independent grants allowed.
- R06 actual canonical event/B9/CRM-authority/UNKNOWN proof PASS.
- R08 PostgreSQL business authority/concurrency/revision proof and CD delivery
  consent/revocation/UNKNOWN/partial-resume proof PASS.
- Shared consent/identity/CD/AE test pass: 30 suites / 259 tests on the first run;
  its one profile-guard failure was repaired, then both affected suites / 22 tests
  PASS. Additional four security/R06/R08 ratchet suites / 21 tests PASS.
- Both typechecks PASS; composed PWA 28 inline scripts parse, four consent functions
  equal certified baseline, R08 actual PWA handler proof PASS.

These restore invalidated/shared baseline proof, not the still-outstanding eight
package local acceptance or the final wave aggregate gate. Historical unchanged
mechanism proofs remain evidence at their own checkpoints. The exact unfinished
package reviews in the R-C WIP handoff still must be completed.

```text
SECURITY INVALIDATION FOUNDATION: PASS
ADMITTED BAD AUTHORITY REMEDIATED: YES
G1 A18 PROVENANCE: PASS
G2 CONSENT IDEMPOTENCY: PASS
COMBINED BASELINE CERTIFIED: YES
R06/R08 INVALIDATED PROOFS RESTORED: YES
R-C BUSINESS/SCHEMA DECISIONS: STILL VALID
WAVE R-C READY TO RESUME: YES
WAVE R-C RESUMED: YES
R05/R06/R08/R09/R11/R12/R13/R14 LOCAL ACCEPTANCE: PENDING COMPLETION
R-C PRODUCTION CUTOVER: NO
PACKAGES PRODUCTION COMPLETE: 6/14
BLOCKERS PRODUCTION REMEDIATED: 10/24
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CONTROLLED SECURITY REMEDIATION OPERATIONS: 1
OTHER PRODUCTION PROOF BUSINESS/PROVIDER/MESSAGE EFFECTS: 0
```

Continuation, not STOP. No additional owner approval is needed. Complete owned
implementation defects, package-local proofs, aggregate gate, coordinated R-C
cutover and then the one final Package 5 gate. Main 24 dirty entries and 17 old
databases remain untouched. Two owned isolated PostgreSQL clusters are active
for this continuing proof phase; final cleanup has not yet been claimed.
