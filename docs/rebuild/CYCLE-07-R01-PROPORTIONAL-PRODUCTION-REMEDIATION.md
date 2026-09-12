# R01 production restoration — canonical scope

2026-09-12. Code/release protection: `27d9d834`. [Independent review](CYCLE-07-R01-INDEPENDENT-CANONICAL-REVIEW.md) supersedes the full-private-vhost operational STOP in the four earlier Contour reports. Those reports' concrete unsafe-source evidence remains valid.

## Verified outcome

- Main salon `app/api-proxy.php`: exact certified `b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0`, restored from pinned `d5eeaa82…` by one bounded R01 refusal replacement. Syntax, whole-source no-provider-write guard and exact sanitized-fixture equivalence PASS.
- Technical `api-proxy.php` and salon `app/backups/api-proxy-before-loyalty-20260721-2035.php`: HTTP retired by two exact filename-denial rules. Both historical PHP hashes unchanged. No new PHP implementation or binding authority.
- **128/128 HEAD probes return 403**, covering 16 denied PHP/config/archive artifacts, all eight known host aliases and both retired writers' PATH_INFO variants, with redirects followed to reviewed hosts only. No action/body/booking request was used.
- All 42 pinned artifacts pass final source/hash validation: 10 active PHP, 16 denied PHP artifacts, five HTML files, two PWA backups and nine local routing files. Three bound public roots, zero unknown PHP/symlink/scan errors in that bounded manifest. The CLI's `localRoutingFiles: 8` is its initial pre-repair inventory; final validation requires all nine, including the newly created backup-directory rule.
- Exactly **3 production security files changed**: main relay and two `.htaccess` files. Maintenance pages, both PWA backups and other protected artifact bytes unchanged. Private before-state evidence retained outside public roots. Retry never re-enables the historical writers.

[Machine-readable production receipt](evidence/r01-proportional-remediation/production-repair.json).

## Gates and readiness

- Mandatory backend: **431 suites / 3609 tests PASS**, normal exit.
- Affected R01/fixture/B31–B33/auth/PWA/P03/P04: **37 suites / 345 tests PASS**.
- Exact retirement/atomic repair/scanner tests: **3 suites / 14 tests PASS**; wrong pre-state, partial restart, concurrent retry and preserved evidence covered.
- Architecture-only filename selection: **94 / 517 tests PASS** within mandatory; broader architecture-or-ratchet filename selection: **102 / 573 PASS**. Selection is explicit in the [gate receipt](evidence/r01-proportional-remediation/mandatory-summary.json); no test excluded or weakened.
- Lint, application typecheck, scripts typecheck, build, Prisma: PASS. New migrations/schema changes: 0.
- Incoming backend `20260908-c7-wave2-4b03a29c`: health/readiness PASS, repository migrations 94 / applied 97 with the existing three recognized historical migrations, pending 0, drift NONE; 37 MeasurementRevision columns and all canonical constraints/guard bodies match. [Read-only receipt](evidence/r01-proportional-remediation/backend-preflight.txt).
- Main worktree status and all 23 recorded file hashes match the prior baseline (24 original dirty entries plus the previously documented external 25th entry). No main edits; 17 old DB untouched.

```
B38/R01 PRODUCTION REGRESSION: REMEDIATED
KNOWN PUBLIC DIRECT BOOKING BYPASSES: 0
R01 RATCHET: PASS
CHAPTER 6 CONTRACT: RESTORED
FULL PRIVATE PROVIDER VHOST EXPORT REQUIRED: NO
C7 MANIFEST: UNCHANGED — 22 / 6 / 4 / 32
P03/P04 LOCAL: PASS
BACKEND-ONLY WAVE 3 CUTOVER: READY / ALREADY OWNER APPROVED
PRODUCTION BOOKING/PROVIDER/MESSAGE PROOF EFFECTS: 0
```

Next: the unchanged documented backend deployment gate, read-only Wave 3 artifact/schema verification, then P06. This report does not declare Wave 3 production PASS or Chapter 7 complete before those steps occur.
