# Package 5 B12 deployed remediation and fresh Final Gate STOP

Status: **B12 production remediation PASS; Package 5 Final Adversarial Verification FAIL at new B13 active control-plane owners**

Accepted owner checkpoint: `14738ce3`.

Runtime commit: `3ea401a508045c96aedb94844c075c1ff8a21f2a`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b12-3ea401a5`.

No schema or migration was added. The production gate reported 78 repository
migrations, 81 accepted production migration records, pending migrations `0`
and drift `NONE`.

## B12 contract mapping and production result

All four B12 paths were already covered by accepted Package 4 contracts, so no
new action, schema or business decision was introduced.

- `/api/client/book-with-loyalty` maps to P4-03/A20-L
  `redeem_legacy_loyalty`, owned by
  `P403LegacyLoyaltyExecutableService` and its execution-bound loyalty ledger.
- `/api/cert/create` maps to P4-06
  `initiate_gift_certificate_purchase` followed by
  `activate_gift_certificate`, owned by
  `P406GiftCertificateExecutableService`. Its provider request identity and
  existing UNKNOWN/reconciliation contract are unchanged.
- `/api/panel/redeem` maps to P4-06 `redeem_gift_certificate` or P4-03
  `consume_loyalty_redemption_grant`. Lookup remains read-only; legacy confirm
  now fails closed.
- YClients record-delete remains external evidence for P4-03
  `refund_legacy_loyalty`. It no longer invokes the SQLite refund writer.

The active PWA performs zero direct loyalty/certificate value writes from these
paths. The two purchase/booking compatibility routes fail closed, redemption
lookup remains read-only, and record-delete only records that canonical refund
processing is required. P02/P03 holds, tenant identity, ledger claims,
idempotency and the accepted provider UNKNOWN boundaries remain with the
canonical P4 owners.

The initial production candidate gate also found that the active `database.py`
was stale and lacked the accepted P4-06 fail-closed guards. The gate stopped
before restart. The same approved guarded baseline was added to the candidate,
which then passed. This was the same deployment-drift class, not a new contract.

## Permanent cross-package ratchet

A versioned validator now checks the exact active PWA directory as well as the
repository source. It verifies the relevant route bodies, the legacy loyalty
barriers, the SQLite certificate barriers, and later top-level PWA modules.
The standard backend deployment fails before migration if the active PWA does
not pass this validator.

Regression tests prove that a later direct PWA loyalty write, gift-certificate
write, refund call, or direct write inserted into a guarded handler fails the
gate. The existing P4-03/P4-06 source ratchets remain active and recognize a
fully removed legacy writer as fail closed.

`ACTIVE PWA INCLUDED IN PACKAGE 4 FINAL PROTECTION: YES`

`PACKAGE 4 GUARDS APPLY TO LATER PACKAGE CHANGES: YES`

`SYNTHETIC DIRECT PWA LOYALTY/GIFT/REFUND WRITES BREAK GATE: YES`

`ARCHITECTURAL BYPASS PROTECTION WEAKENED: NO`

## Proof and deployment

- targeted P4-03/P4-06 proof: PASS — 41 Jest suites / 275 tests;
- active-PWA guard regression: PASS — 5/5;
- Prisma validate, lint, application and script typechecks: PASS;
- build: PASS;
- mandatory deployment regression: PASS — 337 suites / 2781 tests;
- cross-package Package 5/P4 ratchets after production switch: PASS — 14 suites / 96 tests;
- candidate startup and production health/readiness: PASS;
- active PWA runtime guard after restart: PASS;
- backend and PWA error-priority logs: `0`;
- real production loyalty, gift-certificate, payment or provider mutations used
  for proof: `0`.

The backend release preflight ran before and after the no-op migration step.
The candidate-port process was terminated and reaped; port 3199 is closed.

## Fresh Package 5 Final Gate inventory

After production verification, the Final Gate restarted from the beginning. It
inspected the exact deployed release, 537 production TypeScript files, 218 HTTP
route decorators, 500 mutation-like TypeScript calls, 86 active-root Python
files, 99 active Python route registrations, the request-only PWA launcher and
the exact published PHP proxy (`df2749fb...`). All 13 family foundations remain
registered and Waves 1–6 remain accepted.

Aggregate certification stopped when the fresh production-reachable inventory
found B13.

## B13 — active legacy A16/A22/A26 control-plane owners

The published proxy and active PWA expose four direct SQLite mutation paths
outside their accepted Package 5 owners:

1. **A16 `/api/panel/team`** calls
   `create_master_with_bind_code`, `reset_master_bind_code` and
   `set_cashier_role`. It can create/reset a legacy staff-channel binding,
   clear an existing binding, reactivate the row and change cashier authority
   without the canonical A16 command/result boundary.
2. **A16 `/api/panel/managers`** updates the manager authority list through the
   tenant-unqualified legacy `settings` table. It does not use the canonical
   access/role command.
3. **A22 `/api/panel/plan_target`** directly upserts
   `owner_daily_target_rub` through `database.set_setting`, bypassing the
   accepted governed settings owner and Action Engine outcome.
4. **A26 `/api/god/subscribers`** directly inserts a legacy
   `maya_tenants` subscriber fact and changes its active/suspended/pending
   lifecycle state. It is an independent admin mutation owner outside
   TrialActivation and the canonical tenant lifecycle authority.

All four are production-reachable through the published proxy and registered
in the active PWA. The evidence was established by source and route inspection;
none of the POST endpoints was invoked. No B13 implementation was attempted.
The Final Gate stops here as required.

## Verdict

`B12 PRODUCTION REMEDIATION: PASS`

`B12 P4-03/P4-06 DIRECT VALUE BYPASSES: 0`

`ACTIVE PWA INCLUDED IN PACKAGE 4 FINAL PROTECTION: YES`

`PACKAGE 4 GUARDS APPLY TO LATER PACKAGE CHANGES: YES`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B13 — A16/A22/A26 LEGACY CONTROL-PLANE MUTATION OWNERS`

`PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 337 SUITES / 2781 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B13`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b12-deployed-final-recheck.json`.
