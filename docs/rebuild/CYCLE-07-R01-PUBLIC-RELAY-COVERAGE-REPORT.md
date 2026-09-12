# B38/R01 public relay coverage — bounded inventory and release harness

Incoming checkpoint `6df459e8`; worktree `contour/c7-recovery-cd157b66`, canonical
remote `codex/maya-brain-systemic-release-20260815`. Fetch initially confirmed
HEAD = origin and a clean isolated worktree. No main-worktree reset/stash/clean.

## Verdict and exact operational blocker

**EXISTING R01 COVERAGE DEFECT.** No Q23/Bxx, new C7 requirement or new booking
contract is created. Production remediation/Wave 3 have NOT run.

The filesystem pass is complete for **three observed account `public_html`
directories**, but **effective public-root/rewrite coverage cannot yet be proved
complete**. SSH cannot read `/etc/nginx`, `/etc/apache2/virtdom` or
`/etc/apache2/conf-available` (PermissionError). Existing Chrome Beget session
redirected to login; the complete site/domain bindings were not obtained.
Normal saved-account login was attempted without reading/copying credentials;
a current authenticated panel was not recovered. No credentials or hosting
settings were changed. An asynchronous request for the missing panel access
was sent to the owner; it is not a new business/schema decision.

The mandatory user condition is therefore unmet: do NOT report unaccounted=0,
full inventory=YES, or repair/deploy even when local gates pass. The finite
boundary is the Beget account's effective Maya sites, document roots, aliases,
server rewrites/PHP handlers and their resolved targets, not an unrestricted
whole-server audit. The three on-disk directories are candidate roots, not a
substitute for effective vhost configuration.

**Minimal evidence needed:** complete Beget Sites/domain-binding list (including
technical/default/parked/additional hostnames), exact document-root mappings,
and effective server Alias/ScriptAlias/rewrite/handler overrides or authoritative
confirmation that none extend those roots. No passwords/tokens are requested.
This must establish whether any of the outside-root recovery paths is served.
Then finish/pin the finite manifest and use the already approved remediation;
Chapter 7 architecture and R01 refusal need no new approval.

## Inventory performed

[Exact artifact table](evidence/r01-public-relay-coverage/artifact-inventory.md)
contains all 26 observed PHP artifacts with path, hash, classification, HTTP
state, direct booking/phone-authority/refusal flags and required action.
[Coverage receipt](evidence/r01-public-relay-coverage/coverage-status.json).

- Roots: `mayaos.ru/public_html`, `muzhskayaestetika.rf/public_html`, and
  **`mocine3388.beget.tech/public_html`**, all under `/home/m/mocine3388/`.
- All three traversed recursively; zero filesystem read errors and zero symlinks
  observed within them. Parent `.htaccess` existence and every nested `.htaccess`
  were checked. Root-level domain redirects and MayaOS `/api` →
  `maya-platform-api.php` rewrite are recorded. Server-level overrides remain
  inaccessible and cannot be inferred from `.htaccess` alone.
- Filename-independent PHP candidate pass found 26 actual PHP artifacts; an
  initial broad byte-signature pass also surfaced eight binary-media false
  positives, retained in raw metadata. No PHP/application code was executed by
  source inspection. The permanent scanner ignores binary non-PHP assets only
  subject to a separately certified server handler contract; that contract is
  not yet certified here.
- 10 PHP URLs returned HEAD 200; canonical authenticated `yclients-webhook.php`
  returned 403; technical-domain relay returned HTTP 500 with PHP/5.6.40.
  These are 12 observed public application URLs, **not a certified complete
  total**. The 403 webhook is an application auth rejection, not archive denial.
  Fourteen other files (12 archives + 2 config copies) are denied by the observed
  server/archive rules and HTTP 403 at the tested hosts. Unknown host aliases
  cannot yet be declared denied.
- 67 PHP recovery/deployment copies outside the three observed roots were
  enumerated in an explicit bounded directory list. Their hashes are retained;
  absence of server alias exposure is **unproven**, not guessed from names.
- Repository deployment/root references and existing fixture/patch/alias
  manifests were compared. The technical-domain relay is absent from the prior
  nine-alias certification and the old two-root live scanner.

### Unsafe observations

1. Main salon `/app/api-proxy.php`: unchanged unsafe d5eeaa82… artifact.
   Prepared exact restoration remains b1006160… and passes the canonical
   fixture/semantic comparison. No replacement occurred.
2. Salon `/app/backups/api-proxy-before-loyalty-20260721-2035.php`: unchanged
   8cc22eaf… artifact, HEAD 200, direct provider booking and phone/fullname
   authority. Historical HTTP exposure should be retired, preserving evidence.
3. Technical-domain `/api-proxy.php`: SHA-256
   `5904e859bfdd9c78f841f6ee0b7971cea93b924011619cc8c0ab6f41e3b54d81`.
   Its `create_record` case starts at line 145, hash
   `a55941352db4f1d82b021929157c577cf48157a811b0ae87ffa444d61b04e880`;
   phone/fullname → `yc_post` to `/records`, with no canonical refusal.
   Literal `book_record` is absent. HTTP 500 is **not** proof of access denial
   or a safe canonical contract; it also does not prove successful provider
   execution. No action-bearing booking/SMS request was sent.

There are 13 literal `book_record` source artifacts across the observed roots,
including 11 denied historical copies; **two are confirmed HEAD-200**. The
technical-domain `/records` writer is an additional equivalent booking path.
Do not reduce the invariant to searching one provider endpoint string.
No new C7 requirement or successful provider effect is asserted.

## Permanent release protection

`public-relay-inventory.cjs` replaces the `*api*.php*` search in the live release
gate. It enumerates account site roots and recursively discovers PHP extensions,
archives, phtml/phar, text PHP under other names, nested backup paths and symlink
targets. Unexpected roots, links, artifacts and read errors fail closed.
Known aliases still require pinned hashes and the existing whole-source R01
provider-writer/refusal guard. The old 23-entry manifest is preserved as accepted
history; discovered files are NOT blindly added to its allowlist.

Mandatory tests execute the actual scanner against disposable synthetic roots,
including a same-root unknown renamed handler, alternate technical root, nested
backup, changed extension, both directory/root symlinks, source with `/records`
without `book_record`, and scan failures. No PHP program is executed. Existing
R01 assertions and fixtures remain unchanged. Release still verifies before
upload, before activation and after activation; it currently correctly refuses
live coverage. These gates detect out-of-band uploads; they do not revoke
independent Beget credentials or claim such uploads are impossible.

## Exact stdin diagnosis and harness repair

The original wait was in `p4-05-all8-cutover-ratchet.spec.ts`, Python
`json.load(sys.stdin)` → unbounded TextIO/FileIO read; Node synchronously waited
for that child. The isolated original suite passes 9/9. Two plain Node 22.23.2
reproducers **without Jest, Maya imports, DB or provider calls** stalled on
trials 85 and 64 with the same 183,648-byte JSON payload. Diagnostics with
chunked reads (150/150) and length-framed reads (300/300) complete.

This identifies the fragile EOF-dependent synchronous-pipe transport, not a
business/runtime hang or evidence of leaked Maya workers. The stalled protocol
requires the pipe writer's completion/close before Python read-all can finish,
while the synchronous parent waits on its child. The precise kernel/libuv
internal defect is **not proven** and is not invented in this report.
Standalone reproductions use bounded diagnostic deadlines; they are not release
passes and do not alter the suite timeout. No real test was excluded.

The owned harness now sends the **same JSON** via a private regular-file stdin,
with a finite file EOF independent of pipe completion. It closes the descriptor
and removes the owned directory in `finally`, including failure. Python guard,
source overrides and assertions are byte/semantically unchanged. No timeout,
expectation, lint rule or runtime code was weakened. Regular-file stress:
**300/300 PASS**, zero remaining temporary directories. Original full mandatory
run after this repair: **429 suites / 3604 tests PASS**, normal exit 0 in
345.783 seconds. The newer scanner tests are accepted separately and in the
final mandatory run below.

## Verification and preserved baseline

- R01/B38, four fixture/recovery suites, B31/B32/B33, auth/PWA and P03/P04:
  **37 suites / 344 tests PASS**. The added scanner assertion subsequently
  passes with all owned tests (**3 suites / 21 tests**).
- Final mandatory, including new class coverage: **PASS — 430 suites / 3607 tests**.
- Final lint/application typecheck/scripts typecheck/build/Prisma: **PASS**. See the [final receipt](evidence/r01-public-relay-coverage/verification.json).
  A formatting-only lint defect in the new test was fixed; rules were unchanged.
- Production structural/read-only probe: 14 compiled artifacts match
  `20260908-c7-wave2-4b03a29c`; health/readiness PASS, pending 0, drift NONE,
  MeasurementRevision 37 columns/16 CHECK/8 FK/4 triggers, rows/backfill 0.
- Both maintenance pages, both PWA backups and all other 23 previously pinned
  artifacts retain their pre-state hashes. Main PHP stays at the known unsafe
  incident hash because production mutation prerequisites are unmet.

## Status / safe continuation

```text
EXISTING R01 COVERAGE DEFECT: YES
NEW CHAPTER 7 REQUIREMENTS / BUSINESS CONTRACTS / Q23/Bxx: 0
OBSERVED WEB ROOTS SCANNED: 3/3
EFFECTIVE PUBLIC ROOT / REWRITE COVERAGE: NOT CERTIFIED
HTTP-REACHABLE RELAY ARTIFACTS: 12 OBSERVED; COMPLETE TOTAL UNPROVEN
UNACCOUNTED PUBLIC RELAY ARTIFACTS: UNKNOWN — NOT 0
CONFIRMED PUBLIC book_record ARTIFACTS BEFORE REMEDIATION: 2
ADDITIONAL TECHNICAL-DOMAIN /records WRITER: 1
EXPECTED PUBLIC PROVIDER WRITERS AFTER REMEDIATION: 0
R01 COVERAGE MANIFEST COMPLETE: NO
R01 LIVE RELEASE GATE: FAIL CLOSED
PRODUCTION RELAY REMEDIATION: NOT PERFORMED
WAVE 3 CUTOVER: NO
P01/P02/P05 PRODUCTION: PASS — PRESERVED
P03/P04 LOCAL: PASS — PRESERVED
CHAPTER 7 REQUIREMENTS COMPLETE: 10/22
CHAPTER 7 PACKAGES COMPLETE: 3/6
CHAPTER 7 WAVES COMPLETE: 2/4
P06 IMPLEMENTATION STARTED: NO
CHAPTER 7 FINAL GATE RUN: NO
CHAPTER 7 COMPLETE: NO
CHAPTER 8 STARTED: NO
PRODUCTION FILE/BUSINESS/BOOKING/PROVIDER/MESSAGE MUTATIONS: 0
```

After authoritative hosting evidence closes the finite manifest, continue the
already approved exact R01 active relay restoration / historical HTTP retirement,
then backend-only Wave 3 and P06/Wave 4. Preserve maintenance pages and PWA copies.
Do not reopen C7 schema/product decisions. Main original 24 dirty entries plus
the previously documented external 25th entry and all 17 old DBs are untouched.
Final owned-process/temp/hygiene receipt is recorded separately after gates exit.

Final hygiene: main original 24 + known external 25th entry unchanged; old DBs touched 0; owned temp processes/watchers/browsers/databases/directories 0. PROCESS HYGIENE: 0.

Architectural suites executed inside mandatory regression: **95 suites / 523 tests PASS**. Full suite index is retained with per-suite status.
