# Package 5 B13 deployed remediation and fresh Final Gate STOP

Status: **B13 target remediation PASS; Package 5 Final Adversarial Verification FAIL at new B14 GOD control-plane bypasses**.

Accepted owner checkpoint: `a9a5ff24`.

Runtime commits:

- `e3aec34abf0e4c7777fe3346c86276d382170bcd` — B13 control-plane runtime, UI and ratchets;
- `031977e4` — active-root legacy staff bind-code CLI retirement and runtime-guard synchronization.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b13-031977e4`.

No schema or migration was added. The production gate reported 78 repository
migrations, 81 accepted production migration records, pending migrations `0`
and independent schema drift `NONE` (`No difference detected`).

## B13 owner decisions and production result

The four approved B13 control-plane paths no longer own business mutations.

1. `/api/panel/team` and `/api/panel/managers` retain compatibility reads and
   return an explicit retired/canonical-A16 outcome for legacy mutation modes.
   Raw Telegram IDs, bind codes, `panel_manager_ids` and the legacy cashier flag
   no longer grant staff, administrator or Package 4 value authority.
2. The active-root `generate_bind_codes.py` helper discovered during deployment
   was part of the same approved D1 scope. It is now a mutation-free tombstone;
   the permanent deployment guard rejects reintroduced create/reset/raw-delete
   behavior in that helper.
3. `/api/panel/plan_target` no longer writes daily, dated-growth or workstation
   goals. It points callers to the existing A22 monthly finance target command.
4. `/api/god/subscribers` is a read-only projection of canonical tenants and
   forwards platform Bearer authority. Add, plan/MRR and lifecycle mutations
   return an explicit retired outcome. TrialActivation, A26 and Package 4 remain
   the canonical owners.

Both published app copies removed the four B13 mutation controls. Historical
SQLite rows remain untouched and do not grant current authority. No fake
canonical history was created.

## Proof and deployment

- targeted Python B13 boundary and runtime-guard proof: PASS — 13/13;
- B13 architecture ratchet: PASS — 6/6;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 338 suites / 2787 tests;
- active Package 4 runtime guard: PASS;
- active B13 runtime guard after switch: PASS;
- backend candidate startup and production health/readiness: PASS;
- active PWA read-only health check: PASS;
- published PHP syntax and app availability: PASS;
- backend and PWA error-priority logs after activation: `0`;
- candidate port 3199 after deployment: `CLOSED`;
- real production staff, tenant, value or settings mutations used for proof: `0`.

Published artifacts are exact bounded candidates:

- app SHA-256: `b8d011fa54977013fc2f6def2b9015115e22507be4de4405923bdcd028d0c3ca`;
- proxy SHA-256: `984a5d383c6412a3143f5a921c0079044e1f43e4acee21bf0efdd163b735f224`;
- active webhook SHA-256: `3f224f6fe4251a879bcf95c07266b48d5989a14add21fa0431e8c06f15803757c3`;
- active B13 guard SHA-256: `16212ea064572b0f6ed6f0d47ed74e185385ff09a411e9bb070d6242facc3af4`.

## Fresh Package 5 Final Gate inventory

After the production structural verification, the Final Gate restarted from
the beginning. It inspected the source corresponding to the exact deployed
backend release, 537 production TypeScript files, 218 HTTP route decorators,
500 mutation-like TypeScript calls, 88 exact active-root Python files, 68
non-test Python files, 99 active Python route registrations, the request-only
PWA launcher, background/event entry points and the exact published proxy.
All 13 Package 5 families remain registered and Waves 1–6 remain accepted.

The inventory then found B14 and stopped before aggregate certification, as
required.

## B14 — GOD billing settings and legacy subscriber projection

Two additional published, production-reachable GOD paths remain outside the
approved canonical boundaries.

### 1. `/api/god/billing` is a direct business-settings writer

The published UI sends caller-supplied mutation modes:

- `set_renewal {key,label,due_date,amount}`;
- `set_budget {usd}`.

The published PHP proxy forwards `god_billing` to the active PWA. In the active
runtime, `god_billing_handler` accepts those values and directly calls the
global SQLite `settings` UPSERT through:

- `_god_set_renewals` → `database.set_setting("god_renewals", ...)`;
- `database.set_setting("god_ai_budget_usd", ...)`.

This is a current business/configuration mutation owner outside the accepted
A22 command and without a defined canonical platform-budget or renewal-tracker
contract. Founder/GOD actor status does not by itself establish mutation
authority. The existing A22 monthly tenant finance target does not define the
semantics of these global renewal and AI-budget values.

### 2. `/api/god/overview` uses legacy subscriber state as current truth

`god_overview_handler` calls `database.list_maya_tenants()` and derives current
subscriber totals plus active/pending status from the historical legacy table.
That bypasses the approved D4 canonical Tenant/TrialActivation/subscription
projection and keeps legacy compatibility data as current authority. The path
is read-only, but it is a current legacy projection fallback and therefore
cannot satisfy `LEGACY FALLBACKS: 0`.

Exact active evidence:

- `god_overview_handler`: lines 5348–5397, legacy read at line 5380, function
  SHA-256 `287fd0cd9e1456ea2c6dd4e92d2a0b06db01a8282cfb13a38c544bc94e6bc878`;
- `god_billing_handler`: lines 5413–5467, mutation branches at 5424 and 5448,
  writes at 5447 and 5450, function SHA-256
  `ac1d51f9d417acd061aaf2682ecb95efbaa89117b5e1e87a08d06108e4e84be3`;
- `_god_set_renewals`: lines 5134–5135, function SHA-256
  `ac2222cc04e62bb33a890d27df6b867957a3da7114231dcad1df07c879fd008f`;
- published proxy route: line 1327;
- published UI mutation controls: lines 23800 and 23803.

No B14 endpoint was invoked and no implementation was attempted. Before
runtime work, owner decisions are required for the canonical owner and meaning
of the platform AI budget and renewal records, including whether either feature
should remain mutable in Chapter 6. The already-approved D4 boundary is enough
to replace or retire the legacy subscriber summary after that STOP is lifted.

## Verdict

`B13 TARGET PRODUCTION REMEDIATION: PASS`

`B13 LEGACY CONTROL-PLANE OWNERS IN TARGET PATHS: 0`

`A16 DIRECT STAFF/ROLE BYPASSES IN B13 PATHS: 0`

`RAW TELEGRAM STAFF/MANAGER AUTHORITY BYPASSES: 0`

`A26 DIRECT TENANT/SUBSCRIBER MUTATIONS IN /api/god/subscribers: 0`

`GOD SUBSCRIBERS MUTATION OWNER: NO`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B14 — GOD BILLING DIRECT SETTINGS WRITER + LEGACY SUBSCRIBER PROJECTION`

`A22 DIRECT BUSINESS-SETTING BYPASSES: PRESENT — /api/god/billing`

`A26 LEGACY SUBSCRIBER PROJECTION FALLBACK: PRESENT — /api/god/overview`

`PRODUCTION DIRECT BUSINESS/VALUE MUTATION BYPASSES: PRESENT`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT`

`LEGACY FALLBACKS: PRESENT`

`PACKAGE 4 CROSS-PACKAGE GUARDS: PASS`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 338 SUITES / 2787 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B14 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b13-deployed-final-recheck.json`.
