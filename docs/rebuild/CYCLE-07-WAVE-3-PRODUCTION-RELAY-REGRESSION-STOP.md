# Chapter 7 — approved backend-only Wave 3: production R01 regression STOP

**Backend-only cutover approval is accepted. Maintenance is no longer the
operational approval blocker. Deployment has not started because current
production PHP reintroduced the known B38/R01 booking authority bypass.**

Date: 2026-09-12. Incoming checkpoint: `7ef0e29f`; canonical origin equal and
isolated worktree clean at entry. Fetch before and after inspection found no new
canonical commit. The owner's approval referring to `c5f1383e` applies after the
completed fixture reconciliation and documentation-only checkpoints; no prior
approval is requested again.

## Approved scope and successful preflight

The authorized operation is backend-only P03/P04 through the existing documented
release process, preserving both maintenance pages, their PWA backups and the
Python maintenance state. No restoration of `/app/` is authorized or attempted.

| Check | Result / exact evidence |
| --- | --- |
| Release independence | PASS. Unchanged `deploy/vps/deploy.sh` writes backend release inputs under `/opt/maya-saas/releases`; Beget is an SSH jump. It does not upload to `/app/`, restore PWA or alter Beget/Python maintenance configuration. [Script identities](evidence/chapter7-wave3-relay-regression/preflight.json). |
| Both maintenance pages | PASS. Both remain 2,247 bytes, SHA-256 `cb27000739b179ddea6546fb4dd169fc9f1f397abca998acdcacf4dc1162c249`. |
| Salon PWA backup | PASS. `app/index.html.pre-maintenance-20260908-211040`: SHA-256 `784b68630d659a5aceb9832d84f6ebd5c6519a1ecd0a15adcbe5e5dd029607b6`. |
| MayaOS PWA backup | PASS. Same backup filename: SHA-256 `b3278512ca71beee709b93c1de2892fa841ef0cb19ae965791d71dfcb2a65e6e`. |
| Backend release | PASS. Still `20260908-c7-wave2-4b03a29c`, 14 certified compiled artifacts match. |
| Schema / readiness | PASS. 37 MeasurementRevision columns, 16 checks, 8 FKs, 4 guard bodies/triggers and full indexes/constraints match. 94 repository migrations / 97 applied including approved historical entries, pending 0, drift NONE, health/readiness PASS. |

[All nine alias and two backup observations](evidence/chapter7-wave3-relay-regression/beget-preflight-observed.json)
were read-only. Eight aliases match the accepted preflight state (including the
two maintenance pages); only the main salon PHP alias changed. The same
[versioned Wave 2 structural probe](evidence/chapter7-wave2/production-structural.sh)
ran with a read-only database transaction; [current receipt](evidence/chapter7-wave3-relay-regression/backend-before.txt).
No bookings, provider writes, messages or source-business mutations were used.

## Exact production security regression

Affected existing file:
`/home/m/mocine3388/muzhskayaestetika.rf/public_html/app/api-proxy.php`.
Existing route: `?action=create_record`, case starting at line 433 in the
sanitized current artifact. This is the already inventoried **B38 / R01** public
PHP booking path (S05 proxy and S22/S31 provider path), not a new production
surface or a new inventory item.

| Identity | Value |
| --- | --- |
| Last certified production SHA-256 | `b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0` |
| Current production SHA-256 | `d5eeaa82f69f6d72c366576797c2920fecd0d27f76262e2c5f4a342f363ddd05` |
| Current file size | 119,193 bytes; previously 116,748 |
| Current mtime / ctime | `2026-09-12T13:56:21.327021Z` / same; 16:56:21 MSK |
| Last certified read | 2026-09-12 13:41 UTC alias receipt in the preceding checkpoint |
| Process/operator provenance | Not established. File timestamps identify when the artifact changed, not who changed it; no matching new canonical commit was found. |

The [exact sanitized diff](evidence/chapter7-wave3-relay-regression/production-relay.delta.diff)
contains one changed switch case:

- Removed the R01 `410` refusal with `verified_client_channel_required`,
  `accepted=false` and `retry_allowed=false`.
- Added validation of body company/staff/service/date/time/phone/fullname, then
  direct `yc_post(YC_API . "/book_record/{$company_id}", ...)` with those inputs.
- The existing unchanged `yc_post` helper delegates to `yc_request('POST', ...)`.
  These checks do not establish authenticated canonical Client provenance,
  exact Maya tenant/Client ownership, a confirmed B31/B33 booking intent or an
  ActionExecution. The route initiator performs the provider write itself.
- It returns provider results directly. Canonical immutable idempotency and
  UNKNOWN/reconciliation are bypassed at this entry; no claim is made that a
  real request or affected booking actually occurred during this inspection.

This contradicts the approved R01 contract and the permanent rule against raw
phone authority/direct provider mutation outside the canonical executor. A
maintenance HTML page does not disable this separate PHP entry. It is not a
configuration-only/credential-only hash change and cannot be certified by leaving
the previously repaired fixture green.

## Existing ratchet proof; no fixture or guard weakening

The unchanged existing
`maya-saas-backend/deploy/platform/beget-edge/client-initiator-boundary.cjs`
`assertRetiredPhp` was run as **pure source inspection** on both inputs:

```text
CERTIFIED SANITIZED FIXTURE: PASS
CURRENT PRODUCTION PHP: FAIL
Retired PHP entry changed: no writer, authority lookup, or delegation allowed before refusal
```

[Ratchet receipt](evidence/chapter7-wave3-relay-regression/r01-ratchet.json).
[Offline evidence replay](evidence/chapter7-wave3-relay-regression/reproduce.py)
reconstructs current sanitized bytes from the committed certified fixture and
the bounded diff, checks both hashes and reproduces this exact rejection. It
does not execute PHP, edit the fixture, write production or call a provider.

The fetched original existed only in memory; the two documented config literals
were sanitized using the existing fixture convention. Credential signature and
mixed-entropy literal scans passed before diff output. Only the safe bounded
diff is versioned; the live source is not committed or substituted into the
canonical test fixture. Other bytes in the reconstructed sanitized source match
the observed current artifact after those same two substitutions.

The last full mandatory **428 suites / 3595 tests PASS**, lint, both typechecks,
build and Prisma remain historical local evidence for P03/P04. They are not a
certification of this subsequently changed production PHP. No full mandatory
rerun or release script was started after the failing production preflight.

## STOP boundary and continuation

This satisfies the owner's explicit **new contract/security blocker** STOP
condition. It is separate from the resolved maintenance acceptance decision.
Do not deploy, overwrite production PHP, restore an older relay, weaken R01,
replace the canonical fixture with the regressed case or begin P06 as though
Wave 3 were production PASS. No new Bxx or unrestricted inventory is opened.

Next scope is exact reconciliation of this independent production change with
the existing R01 owner contract, including its writer/deployment provenance.
The approved backend-only cutover and preservation of maintenance remain valid;
after the security baseline is restored/certified, resume the same P03/P04
release gate, then P06/Wave 4. C7 architecture/schema decisions are unchanged.

```text
BACKEND-ONLY WAVE 3 CUTOVER: APPROVED
MAINTENANCE OPERATIONAL APPROVAL BLOCKER: RESOLVED
BACKEND RELEASE INDEPENDENT FROM PWA: YES
MAINTENANCE PAGES UNCHANGED: 2/2
CERTIFIED PWA BACKUPS PRESERVED: 2/2
CURRENT PRODUCTION PHP R01 RATCHET: FAIL
ACTIVE BASELINE BLOCKER: B38/R01 REGRESSION
NEW PRODUCTION SURFACE: NO
INVENTORY DEFECT: NO
COMBINED BASELINE CERTIFIED: NO
P03 LOCAL: PASS
P04 LOCAL: PASS
P03 PRODUCTION: NOT DEPLOYED
P04 PRODUCTION: NOT DEPLOYED
WAVE 3 COMPLETE: NO
CHAPTER 7 REQUIREMENTS COMPLETE: 10/22
CHAPTER 7 PACKAGES COMPLETE: 3/6
CHAPTER 7 WAVES COMPLETE: 2/4
P06 IMPLEMENTATION STARTED: NO
CHAPTER 7 FINAL GATE RUN: NO
CHAPTER 7 COMPLETE: NO
CHAPTER 8 STARTED: NO
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PRODUCTION MUTATIONS/MESSAGES/PROVIDER EFFECTS: 0
```

Protected main state (including the previously recorded external 25th entry)
and original file hashes remain unchanged; the 17 old databases were not used.
[Hygiene receipt](evidence/chapter7-wave3-relay-regression/hygiene.json).
Evidence/report → commit/push → STOP. No owned process, watcher, browser or
temporary database remains.
