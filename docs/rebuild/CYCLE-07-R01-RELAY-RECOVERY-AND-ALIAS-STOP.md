# B38/R01 regression: release protection prepared; unregistered live alias STOP

Incoming checkpoint `5163eb15`. Existing R01/B31–B33 contracts remain approved.
This work does not create a new booking owner, action, schema, Chapter 7
requirement or Bxx. Production replacement and Wave 3 have **not** run.

## Exact original regression and provenance

The main salon `/app/api-proxy.php` changed from certified SHA-256
`b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0`
to `d5eeaa82f69f6d72c366576797c2920fecd0d27f76262e2c5f4a342f363ddd05`.
The changed case and its 2026-09-12 13:56:21.327021 UTC timestamp are pinned by
the [previous exact diff](evidence/chapter7-wave3-relay-regression/production-relay.delta.diff)
and [provenance receipt](evidence/r01-relay-regression-remediation/provenance.json).
It restored phone/fullname → direct YClients `book_record` in place of the
certified R01 410 refusal. No new matching canonical commit was found.

The exact unsafe **artifact** is proven. The uploader/command/actor is not.
Targeted host-history and local-artifact checks did not establish who performed
the write. File time alone is not evidence of a particular deployment or person.
No assertion is made that a real booking was created via this regression.

Classification: **RUNTIME REGRESSION + RELEASE/RATCHET ESCAPE**. The escape is
the absence of mandatory live-artifact verification for separately changed Beget
PHP. The existing pure R01 guard rejects the unsafe source; the committed fixture
remained safe and unchanged. Thus local fixture tests could stay green after an
external live upload. Evidence does **not** prove the unsafe file passed the
documented gated backend deployment process.

## Prepared restoration and permanent release protection

- Preserve the already-correct sanitized fixture. Its full SHA-256 remains
  `5b5059f820b6337b59866fd6260f0b3fef87e65db8f969e7f4e7a9537619dd7e`.
  Mandatory R01 tests now inspect it semantically as well as checking its hash.
- Extend the existing PHP guard from the exact refusal to whole-file provider
  mutation call sites, including moved `yc_post`/mutating `yc_request` calls.
  The certified unused transport helper is unchanged; no writer call may use it.
- Recovery accepts only the exact incident input and reconstructs the original
  certified b100… bytes by replacing one bounded case. After the two pre-existing
  secret substitutions it must equal the committed fixture exactly. Unknown
  input, changed case semantics or additional bytes are rejected. No secrets
  are committed and the sanitized fixture cannot be deployed.
- Prepared atomic repair uses a host lock, exact pre-state checks, private
  outside-document-root evidence, compare-before-replace and post-state hashes.
  Retry converges on the same bytes. It may replace only the originally approved
  main relay; it cannot change maintenance pages or PWA backups. It was **not run**.
- The release manifest pins nine accepted aliases, two PWA backups and twelve
  already-denied archives. Candidate building rejects unsafe PHP/PWA inputs and
  archive promotion. Backend deployment verifies live aliases before upload,
  before activation and after activation. A recursive scan detects unknown copies.
- The same checks are ordinary mandatory Jest tests. The runbook and AGENTS.md
  require them for PHP/PWA recovery; existing ratchets/assertions are not weakened.
  This protects repository release paths and detects drift; it does not claim
  to revoke independent hosting credentials or prevent every out-of-band upload.

Runbook: `maya-saas-backend/deploy/platform/beget-edge/RELAY-RELEASE.md`.

## Additional live path found by required all-copy inspection

The initial root/app-level check accounted for sixteen PHP files/copies:
four active aliases and twelve archives returning 403/404/410. Recursive checking
then found a **seventeenth PHP copy**, not present in the certified alias manifest:

`/home/m/mocine3388/muzhskayaestetika.rf/public_html/app/backups/api-proxy-before-loyalty-20260721-2035.php`

| Evidence | Exact result |
| --- | --- |
| File SHA-256 | `8cc22eafdcefbaa620427c53e7c930c01bb72e0e51e2af45e7d9205edd3e4cb5` |
| Size / mtime | 144,766 bytes / 2026-07-21 17:39:00.144332 UTC |
| Existing handler | `create_record`, lines 839–907 |
| Handler behavior in source | phone/fullname inputs and direct `yc_post(...book_record...)`; no R01 refusal or Action Engine delegation in the case |
| Read-only HTTP proof | HEAD to the exact URL returns **200**, `application/json; charset=utf-8`, `PHP/8.2.28` |
| Hosting protection | No `backups/.htaccess`; current parent `.bak` denial does not match this filename ending in `.php` |
| Archive status | Not proven disabled; it is a publicly executable PHP path. Unlike the twelve denied copies it cannot be classified as an inaccessible backup. |
| Secret/config detail | `backups/tg-config.php` is absent. No secret was copied or fabricated. This does not establish an HTTP deny or canonical R01 refusal. No real booking request was attempted. |

[Read-only evidence](evidence/r01-relay-regression-remediation/unregistered-live-relay.json)
and [reproducer](evidence/r01-relay-regression-remediation/inspect-unregistered-relay.py).
The [manifest comparison](evidence/r01-relay-regression-remediation/manifest-comparison.json)
checks R01 aliases, completed remainder inventory, C7 surface manifest and the
previous nine-alias recovery receipt. None records this exact executable path.
The root/app scan was insufficient; the permanent scan is now recursive.

This is a newly discovered production entrypoint inside the existing relay
violation class, **not** a newly invented C7 feature or booking contract. It is
an alias/inventory coverage defect. No new Bxx/Q23 or unrestricted discovery loop
is opened. The user's explicit new-production-surface STOP applies before any
replacement/cutover. The unsafe copy is not whitelisted into the accepted manifest.
The live gate now correctly fails even in `prepare`, blocking both `repair` and
backend deployment until this additional production scope is reconciled.

Minimal next operational scope: retire public execution of this exact historical
backup while preserving its evidence, then perform the already-approved main
relay repair and prove the complete relay set. That is not a new schema/business
architecture decision. Neither operation has been performed in this checkpoint.

## Verification

- Targeted: **35 suites / 333 tests PASS** (four fixture suites, R01, B31–B33
  Client/channel/booking authority/idempotency and P03/P04 regression cases).
- Complete architecture selection: **94 suites / 520 tests PASS** on the existing
  verified local Node 22.23.2. The initial Node 24.15.0 run ended with SIGSEGV in
  V8 `ClearStaleLeftTrimmedPointerVisitor`; it is not counted as a PASS or a
  failed assertion. No timeout, suite or assertion was changed. See the
  [crash receipt](evidence/r01-relay-regression-remediation/node24-crash.json).
- Pure main candidate proof: exact b100… result, zero direct `book_record`, exact
  sanitized fixture equivalence, zero production writes. This is local source
  verification, not whole-live-baseline acceptance.
- Production backend read-only check: Wave 2 release still matches; pending 0,
  drift NONE, 37 MeasurementRevision columns, health/readiness PASS.

- Full mandatory regression: **NOT COMPLETE / NOT PASS**. On Node 22 the
  run reached the existing P4 all-eight retention-closure proof, then its Python
  subprocess remained in `json.load(sys.stdin)`/read while the parent waited in
  synchronous child execution. No failing assertion or successful completion was
  observed. After preserving stack/process evidence, the agent explicitly sent
  SIGTERM to **only** this owned process group because the new-surface STOP had
  already prohibited cutover. This is not an unexplained external SIGTERM. See
  [interruption receipt](evidence/r01-relay-regression-remediation/mandatory-interruption.json).
  The full mandatory run must be completed successfully before any future
  production replacement/deployment; the earlier 428/3595 historical PASS is not
  substituted for this checkpoint. Root cause of the stdin wait is not proven.

- Lint, application typecheck, scripts typecheck, build, Prisma validate and both
  deployment shell syntax checks: **PASS**. The one unnecessary type assertion
  in the new test was removed; its final **9/9** checks pass. No lint rule was
  weakened. [Gate receipts](evidence/r01-relay-regression-remediation/remaining-gates.json).
- Live `prepare`: **FAIL CLOSED** on the unregistered executable alias. This is
  the required protection working, not authorization to omit the unknown path.
  The initial nonrecursive 23-entry prepare is superseded by this complete scan.
- Final protected artifact read: all 23 previously registered hashes unchanged
  (the main PHP remains the known unsafe d5ee…); both maintenance pages and both
  PWA backups unchanged. Recursive scan finds 17 PHP copies. No source secrets
  or full production PHP were versioned.

[Consolidated verification](evidence/r01-relay-regression-remediation/verification.json).
No production write is authorized by a local PASS while the live
manifest gate is failing. The original main relay remains unsafe; do not report
`B38/R01 PRODUCTION REMEDIATED` or `CHAPTER 6 CONTRACT RESTORED` yet.

## Progress and boundary

```text
RUNTIME REGRESSION: YES — original main relay
RELEASE/RATCHET ESCAPE: YES — live-artifact enforcement gap
ADDITIONAL UNREGISTERED PRODUCTION ENTRYPOINTS: 1
ALIAS/INVENTORY COVERAGE DEFECT: YES
NEW CHAPTER 7 REQUIREMENTS / ACTIONS / SCHEMA: 0
B38/R01 MAIN REPAIR: PREPARED, NOT EXECUTED
B38/R01 PRODUCTION REMEDIATION: NOT COMPLETE
LIVE RELAY RELEASE GATE: FAIL CLOSED
MANDATORY REGRESSION: NOT COMPLETE — rerun required before cutover
WAVE 3 PRODUCTION CUTOVER: NO
P01/P02/P05 PRODUCTION: PASS — preserved
P03/P04 LOCAL: PASS — preserved and targeted regressions rerun
P03/P04 PRODUCTION: NOT DEPLOYED
CHAPTER 7 REQUIREMENTS COMPLETE: 10/22
CHAPTER 7 PACKAGES COMPLETE: 3/6
CHAPTER 7 WAVES COMPLETE: 2/4
P06 IMPLEMENTATION STARTED: NO
CHAPTER 7 FINAL GATE RUN: NO
CHAPTER 7 COMPLETE: NO
CHAPTER 8 STARTED: NO
PRODUCTION FILE / BOOKING / PROVIDER / MESSAGE MUTATIONS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES / WATCHERS / BROWSERS / DATABASES: 0
PROCESS HYGIENE: 0
```

Both maintenance pages and PWA backups are preserved. Main dirty worktree and
the 17 pre-existing databases are untouched. Report/evidence/code are committed
for safe continuation; STOP is the new unregistered executable alias, not a
request to reapprove Chapter 7 architecture.
