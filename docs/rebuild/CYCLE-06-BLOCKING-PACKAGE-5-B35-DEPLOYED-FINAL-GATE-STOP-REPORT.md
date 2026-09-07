# Package 5 — B35 production PASS; fresh Final Gate STOP at B36

Approved exact Option A: checkpoint `c3641411`. Schema implementation `82816b26`,
production migration checkpoint `4b13b9f1`, runtime `c8c7a8eb`, portable Python
ratchet `be4fe563`. Active backend release:
`/opt/maya-saas/releases/20260907-p5-b35-c8c7a8eb`.
Verification: 2026-09-07. B29–B34 accepted boundaries remain preserved.

## B35 implemented and published

MarketingCampaign owns the immutable approved bulk intent; MarketingAudience
freezes the exact tenant's canonical Client set. Deterministic Client children,
fixed verified route plans, encrypted content and approval evidence precede the
first effect. Root/slot Action Engine admission commits atomically with its
durable graph. Communication Delivery is the sole transport owner.

Clients without Maya User use an eligible verified Telegram or B24 Web Push-only
route. No fake User is created. Inbox takes priority when eligible. Device
fan-out is bounded to five Web Push endpoints under one logical Client;
supplemental delivery requires actual primary acceptance. Consent/preferences,
tenant/category authority, quiet hours and frequency are rechecked at dispatch.
Audience membership and owner approval never substitute for consent.

Retries load the original graph. Success is skipped, definitive failure/denial
is terminal, unstarted work rechecks current policy, and UNKNOWN only reconciles.
Independent pending siblings progress; no route reselection or alternate-channel
retry is allowed. Changed content/audience under the same identity conflicts.
The panel, PHP bridge and bot bulk callback cannot send directly. The old bulk
sender/selector and dormant User-based backend sender are retired.

The exact approved schema delta is **0 new models, 12 fields, 2 nullability
changes, 3 uniques, 2 indexes, 3 foreign keys, 0 action classes**. One migration,
no historical backfill. No additional schema was introduced during runtime work.
[Implementation and test limits](CYCLE-06-BLOCKING-PACKAGE-5-B35-RUNTIME-LOCAL-GATE.md).

## Verification and production evidence

Final local checks PASS: targeted **12 suites / 101 tests**, architecture
**83 / 469**, lint, both typechecks, build, Prisma validation/status/drift and
mandatory backend **382 / 3130**. Real isolated PostgreSQL ownership, transport,
concurrency and restart proofs passed. Five Python tests, six pure PHP checks,
PWA/iOS inline-script parsing and scoped iOS sync passed. Provider transports in
executable proofs were explicit synthetic doubles; no live provider proof ran.

The documented backend deployment repeated all **382 / 3130** tests, lint/types,
build, fresh dependency installation, preflight, drift and spare-port readiness.
It activated the release successfully. Before Python publication, a candidate
ratchet failed because Python 3.14 and 3.10 serialize ASTs differently. That
attempt replaced no Python/PWA file. Exact source-segment pins fixed portability;
all mandatory local stages were repeated and passed (final mandatory 267.425 s).
All **587 backend artifacts remained identical**, so only the reviewed Python
and frontend overlays required subsequent publication. No check was waived.

Independent structural verification matched [587 compiled artifacts](evidence/package5-b35-compiled-manifest.json)
and all five Python artifacts. Both PWA variants and the narrow PHP helper/proxy
match their manifests; public pages return 200. Backend health/readiness return
200; backend and the existing `barbershop-bot` service are active, error-priority
entries are zero and spare port 3199 is closed. The Python health route correctly
returns 403 without its secret. Existing Package 4/5 active guards pass, including
`b34LegacyReviewOwners: 0` and `b35LegacyBulkOwners: 0`.

Fresh pre-publication inspection had already found the full `barbershop-bot`
active since 13:17 MSK, while the historical B34 request-only unit was absent.
B35 used the existing AGENTS.md restart command for that actual active service;
it did not start a new launcher or alter background-job configuration.
[Runtime](evidence/package5-b35-production-runtime.json),
[frontend](evidence/package5-b35-production-frontend.json).

Only after verified cutover, the approved operational script established the
prospective history epoch for **two tenants**, with two AuditLog receipts.
UTC epochs: `2026-09-07T12:23:47.223Z` and `.298Z`. No timestamp was backdated or
historical delivery invented. Pending migrations **0**, drift **NONE**, all
**11 SQL guards** present. B35 campaigns, dispatch attempts and inbox outcomes
observed at this check: **0 / 0 / 0**. This epoch/audit establishment is authorized
cutover metadata, not a business/provider smoke or backfill.
[Schema/epoch](evidence/package5-b35-production-schema-epoch.json),
[verified receipt](evidence/package5-b35-history-cutover-evidence.json),
[apply result](evidence/package5-b35-history-cutover-result.json).

## Fresh full Package 5 Final Gate

The gate restarted after B35 production PASS. It inventoried **13/13 families**
across 570 non-spec backend modules, 226 HTTP sites and 1,365 mutation-like AST
calls. All 46 wave registrations were derived from current pure contract exports,
including factory-built definitions. Scanner counts are an inventory, not a count
of active business writers or a certification of every call.

| Family | Current boundary covered by inventory and fresh wave proofs |
| --- | --- |
| A15 | Wave 3 staff-day intent, provider UNKNOWN and reconciliation |
| A16 | Wave 2 CRM access, exact membership/target and AC5 reducers |
| A17 | CRM credentials, activation, import, disconnect and source facts |
| A18 | Verified Client profile/consent/appointment boundaries, B29–B33 |
| A22 | Settings/preferences and server-derived authority |
| A23 | Operational work commands and bounded inbox projections |
| A25 | Security actions and exact AC3 authentication protocols |
| A26 | Governed administration, tenant lifecycle and atomic trial bootstrap |
| reduced A27 | Inventory/archive, sole AC4 review owner and B34 retirement |
| A28 | Internal calendar configuration, frozen appointments and objects |
| A29 | Recovery corrections preserving original source evidence |
| A30 | Six approved AC6 classes, policy/caps/fences and maintenance |
| A31 | Deduplicated event/recovery/mirror facts and reconciliation leases |

All six existing PostgreSQL wave proofs ran in fresh owned databases on port
55505, each after a clean **82-migration replay**. Results:
**6/6, 13/13, 8/8, 12/12, 1/1, 6/6 PASS**. Wave 6 includes 53 negative assertions,
concurrency, crash rollback, restart fences, cascade bounds and immutable audit.
[Fresh gate results](evidence/package5-b35-final-gate-stop.json),
[source inventory](evidence/package5-b35-fresh-final-inventory.json).

Fresh production Python inventory covers 73 non-test root modules (93 root
Python files), 100 route-registration sites, 795 mutation-like calls and 117
SQL-like literals. Exactly the five reviewed B35 artifacts differ from B34's
module manifest. Chat/stream, realtime/voice, cabinet, jobs/startup, read helpers,
bootstrap and cross-package producers were included in the inventory.
[Active source/unit metadata](evidence/package5-b35-final-production-python-inventory.json),
[route/call/SQL inventory](evidence/package5-b35-final-python-surface-inventory.json).

The active-source pass found the first confirmed new blocker below. Under the
user's STOP rule, subsequent fresh cross-boundary Jest and aggregate
lint/types/build/schema/full-mandatory stages were **not run**. Earlier B35
successful gates are not relabelled as a fresh full Final Gate PASS.

## B36 — active daily report sends before canonical admission

The accepted [Package 2 contract](CYCLE-06-BLOCKING-PACKAGE-2-COMMUNICATION-CONVERGENCE-REPORT.md)
requires A12 reports/briefings to use
`communication.reports-briefings.execute.v1` → Action Engine → Communication
Delivery, with no producer-side Telegram dispatch or fallback.

The active production path is:

`barbershop-bot.service` → `bot.main` → `_run_polling_resilient` → `post_init`
→ cron job `daily_report` at 21:00 MSK → `_daily_report_job`
→ `database.list_admins` → **direct `app.bot.send_message`**
→ only later `maya_inbox_bridge.publish_inbox_item`.

Exact active anchors in `/home/botadmin/barbershop-bot/`:

- `bot.py:6208`: scheduler registration; `:6761` report producer;
  `:6879` direct Telegram send; `:6892` later canonical bridge call.
- `database.py:1588`: legacy admin selector reads Telegram IDs from SQLite.
  The read-only production count is two; no identities were copied.
- `webhook_server.py:8088`: installed mirror invokes the original provider first
  (`:8102`), then schedules a shadow observation. It is not prior admission.
- `_send_client_push` is already retired by B24 and returns zero. The observed
  violation is the Telegram effect; no live Web Push bypass is claimed here.

Current-start journal metadata confirms the scheduler, daily-report job and
Telegram application are running; this is not a dormant file or degraded-only
launcher. The report body's hash is
`0d39b5fa6730e1d8a18d045e56584bdc86c13a15d14b8e02fbb1253fdbadc533`.
The repository's version already calls the canonical bridge without direct
sends. The **existing Package 2 producer ratchet passes repository source and
fails this active production producer**, even though the later bridge call is
present. Existing deployment active-root guards did not detect that source
parity gap.

### Exact-source executable proof

[Probe](evidence/package5-b36-daily-report.probe.py),
[self-contained source slices](evidence/package5-b36-production-source.json),
[result](evidence/package5-b36-daily-report.proof.json),
[production match/ratchet confirmation](evidence/package5-b36-confirmed.json).

All four executed functions match fresh production source hashes and their
pre-B35 bodies. B35's narrow overlays did not change them. The probe runs the
actual daily report producer, formatter, installed post-send mirror and retired
push helper. Report data, one recipient, the canonical bridge and provider are
explicit synthetic fixtures; no runtime module, production database or real SDK
is used. The canonical bridge is deliberately unavailable in every case.

| Case | Synthetic provider operations |
| --- | ---: |
| First invocation | 1, before any canonical bridge call |
| Identical repeat | 1 additional |
| Four concurrent invocations for the same date | 4 additional |
| Provider accepts, response lost | 1; no canonical UNKNOWN execution |
| Repeat after lost response | 1 additional |

Total **8**; canonical admissions before first send **0**. The post-send mirror
cannot reverse or govern the earlier provider effect. This proves a reachable
owner bypass and replay/UNKNOWN gap; it does not assert actual production
recipient duplication or that a live report was generated during this check.

Reproduce offline from the repository evidence directory:

```bash
python3 package5-b36-daily-report.probe.py package5-b36-production-source.json
```

B36 is not fixed in this cycle. A separately authorized continuation must reconcile
this active producer with the existing canonical A12 owner and verify actual
launcher/producer parity. No new business contract, schema or action is selected
here. B35 and B34 are not reopened.

## STOP and hygiene

All eight owned PostgreSQL databases and the dedicated port-55505 cluster/socket
were removed. Owned VPS/Beget staging and the synthetic restart fixture were
removed. No watcher, proof process or browser was left running. Main worktree:
all **24 dirty entries and original file hashes preserved**. The **17 old DBs**
were untouched. [Hygiene evidence](evidence/package5-b35-final-hygiene.json).

```text
B35 PRODUCTION REMEDIATION: PASS
B35 CANONICAL MARKETING BULK: ENFORCED
B35 IMMUTABLE APPROVAL/AUDIENCE: ENFORCED
B35 DURABLE PARTIAL RESUME: ENFORCED
B35 CLIENT WITHOUT MAYA USER: SUPPORTED
B35 PANEL DIRECT TELEGRAM: 0
B35 COMMUNICATION DELIVERY OWNER: ENFORCED
B35 CROSS-CHANNEL RETRY AFTER UNKNOWN: NO
B35 DUPLICATE LOGICAL RECIPIENT CHILD: PREVENTED BY UNIQUE CONSTRAINT AND CLAIM
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY: 13/13
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B36
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B36
B36 IMPLEMENTATION: NOT STARTED
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: DO NOT DECLARE
PRODUCTION MESSAGES / BUSINESS / PROVIDER MUTATIONS FOR PROOF: 0 / 0 / 0
PROCESS HYGIENE: 0
```

Report/evidence/remainder → commit/push → STOP.
