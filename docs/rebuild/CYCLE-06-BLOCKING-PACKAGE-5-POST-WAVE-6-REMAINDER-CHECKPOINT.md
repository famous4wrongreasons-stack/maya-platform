# CYCLE 06 — PACKAGE 5 POST-WAVE-6 REMAINDER CHECKPOINT

Status: **CURRENT — approved B5/B6 remediation deployed; fresh Final Gate FAIL;
STOP on new A18 bypasses B7/B8**.

Date: 2026-09-04. Owner accepted `cdd97012` and approved B5 Maya-local V1,
notification policy V1 and exactly three nullable schema fields. Schema source
`b152bf09`; current production runtime `fb820b3b` at
`/opt/maya-saas/releases/20260904-p5-b5-b6-fb820b3b`.

This supersedes the former B5/B6 proposal STOP. Those decisions, schema and
runtime are now implemented and verified. Do not request their approval again.
Package 5 is not complete; Chapter 6 completion is not declared.

Current reports:

- `CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-DEPLOYED-FINAL-GATE-STOP-REPORT.md`;
- `CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-REMEDIATION-REPORT.md`;
- `CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-SCHEMA-FOUNDATION-REPORT.md`;
- `evidence/package5-b5-b6-deployed-final-recheck.json`;
- `evidence/package5-b5-b6-runtime-remediation.json`;
- `evidence/package5-b7-b8-isolated-reproduction.json`.

## Accepted work preserved

| Wave | Families | Production baseline |
| --- | --- | --- |
| 1 | A22, A23 | COMPLETE |
| 2 | A16, A25, A26 | COMPLETE |
| 3 | A15, A17, A18 | COMPLETE |
| 4 | reduced A27, A28 | COMPLETE |
| 5 | A29, A31 | COMPLETE |
| 6 | A30 | COMPLETE; six AC6 coordinator/claim classes |

Waves 1–6 are not reopened. Final remediation is not Wave 7. Exact family set:
A15, A16, A17, A18, A22, A23, A25, A26, reduced A27, A28, A29, A30, A31.
Set inventory coverage is 13/13; global zero-bypass certification is incomplete.

The accepted A18 consent/channel-link/challenge, atomic public/admin/internal
TrialActivation and immutable AI confirmation receipt remain deployed. Challenge
TTL is 600 seconds. AI waits for actual CRM import and resumes the same receipt.
No tenant hard deletion, mock CRM staff identity or direct AI A28 owner is added.

B5/B6 production verification passed: Client-owned mood/preferences execute through
verified identity and two bounded canonical commands. Mood does not synchronize
CRM. Defaults are prospective, existing Appointment choices independent.
Preferences are sparse overrides, not consent. Zero reminder hours is invalid;
1–48 allowed, `reminder=false` disables, missing values inherit applicable policy.
No hidden three-hour Client default or no-op Client/profile/execution creation.
Read-only projections fail closed on missing/ambiguous Client binding.

Schema proof 37/37, runtime PostgreSQL proof 28/28; deployment regression 329
suites / 2742 tests PASS. Sequential typechecks/lint/build/server gates passed.
Published Python/PHP/app copies match candidate hashes; native mirror sync passed.
All 74 repository migrations applied, 77 production records including three
historical records, pending 0, drift NONE. Maya/PWA ready and zero error-priority
journal entries since activation at verification. Bot remains inactive.

## Current exact blockers

**B7 — A18 AI `remember_client_preference`.** Published `/api/chat` reaches the
live model tool dispatcher. The actual client tool policy permits this tool.
`claude_ai.py:2724–2737` calls `database.add_client_preference`, which creates a
legacy Client if missing and directly upserts SQLite `client_preferences.prefs`.
Sanitization/text deduplication does not establish canonical Client ownership,
expected generation or ActionExecution. The prior chat consent check is not
profile mutation authority. This is a separate habit/profile writer, not B6's
now-repaired notification-preference endpoint.

**B8 — A18 `/api/cabinet/link-phone`.** The active, published handler verifies
channel/SMS, then directly calls `get_or_create_client` and `update_client` to
write the legacy Client's encrypted phone/hash. SMS phone ownership is not a
canonical Client linking/profile command. This report does not claim the SMS
verification is bypassed or that this endpoint mutates ClientChannelLink or
consent. Its separate legacy Client creation/profile owner remains ungoverned.

Exact live source/route lines, hashes and four isolated checks are in the report
and evidence. No real profile, SMS, model or provider request was used for proof.
SQLite was `:memory:`; no production application/configuration was imported.

The full Final Gate was restarted from source/live state: all 13 canonical
families, 903 backend/script TypeScript files, 81 live Python files, 93 PHP cases
and launcher inventory were collected. The user-required new-bypass STOP applies
before completing alternate-writer/provenance certification and the fresh final
aggregate replay/regression sequence. Lexical inventories and accepted deployment
PASS results are not relabeled as aggregate completeness. Remaining administrative
script/helper candidates are unclassified until that full gate can continue.

## Remaining work, in order

1. Obtain authorization for bounded **B7/B8 A18 remediation**. Reconstruct exact
   Client habit/profile and verified-phone/linking semantics against D2-A, the
   accepted ClientChannelLink/ClientLinkChallenge contract and existing Wave 3
   commands. Do not infer a new schema field or phone-based Client authority.
   Preserve the approved B5/B6 runtime and all accepted waves.
2. After authorization, implement only the established contract, with targeted
   authority/idempotency/concurrency proof and architectural protection. Any new
   business/schema decision requires its own proposal/STOP. Pass mandatory
   deployment gates, then verify production structurally/read-only without
   real customer/provider mutations for smoke.
3. Restart **PACKAGE 5 FINAL ADVERSARIAL VERIFICATION / COMPLETION GATE** from
   the beginning for all 13 families and production-reachable controllers,
   scripts, legacy writers, callbacks, schedulers, read paths and exact protocol
   exceptions. A filename alone never proves test/migration isolation. Perform
   the complete required final sequence and Packages 1–4 baseline certification
   only if inventory is green. Another confirmed bypass means STOP.
4. Only after `PACKAGE 5 COMPLETE: YES`, a separately authorized
   **CHAPTER 6 FINAL COMPLETION / ACCEPTANCE GATE** may begin. Do not declare
   Chapter 6 complete automatically or start Chapter 7.

Permanent boundaries: D1-A…D7-A, P02/P03 hold, no tenant hard delete,
Client-owned profile/consent, prospective configuration, immutable recovery
facts, central/versioned/allowlisted retention and no legacy mutation fallback.
A30 retains AC6 coordinator → MaintenanceRun/ItemClaim, Policy V1 30 days / 24
hours. No artificial Action Engine route or new provider-write contract.

```text
B5/B6 REMEDIATION DEPLOYED: YES
B5/B6 PRODUCTION VERIFICATION: PASS
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
CURRENT BLOCKERS: B7 AI remember_client_preference; B8 /api/cabinet/link-phone
B5 DIRECT CLIENT PROFILE BYPASSES: 0
B5 AUTOMATIC CRM PROVIDER WRITES: 0
B6 DIRECT NOTIFICATION PREFERENCE BYPASSES: 0
B6 HIDDEN CLIENT CREATION PATHS: 0
PREFERENCE ROW IMPLIES CONSENT: NO
PACKAGE 5 GLOBAL CANONICAL COVERAGE: NOT PROVEN
REMEDIATION FULL REGRESSION: PASS — 329 SUITES / 2742 TESTS
FINAL FULL REGRESSION: NOT RUN — STOP AT NEW INVENTORY BLOCKERS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

All 17 historical local test databases remain untouched. Their separate
provenance/cleanup audit stays deferred until after Chapter 6. No owned temporary
process, watcher, browser or database remains from this cycle.
