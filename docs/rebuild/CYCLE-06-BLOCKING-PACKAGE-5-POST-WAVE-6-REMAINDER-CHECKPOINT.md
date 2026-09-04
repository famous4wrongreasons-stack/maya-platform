# CYCLE 06 — PACKAGE 5 POST-WAVE-6 REMAINDER CHECKPOINT

Status: **CURRENT — B5/B6 production accepted; B7/B8 reconstruction completed;
STOP on B7 schema proposal and B8 phone/linking decision**.

Date: 2026-09-04. Latest accepted checkpoint `2a6d645d` authorizes conditional
B7/B8 Final Remediation. Previously approved B5 Maya-local V1, notification policy
V1 and the exact three nullable fields remain the accepted production baseline. Schema source
`b152bf09`; current production runtime `fb820b3b` at
`/opt/maya-saas/releases/20260904-p5-b5-b6-fb820b3b`.

This supersedes the former B5/B6 proposal STOP. Those decisions, schema and
runtime are now implemented and verified. Do not request their approval again.
Package 5 is not complete; Chapter 6 completion is not declared.

Current reports:

- `CYCLE-06-BLOCKING-PACKAGE-5-B7-B8-CONTRACT-RECONSTRUCTION-STOP-REPORT.md`;
- `package5-b7-client-habits-schema-v1-proposal.md`;
- `package5-b8-phone-client-linking-v1-decision-proposal.md`;
- `evidence/package5-b7-b8-contract-reconstruction.json`;

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

## Current B7/B8 reconstruction and remaining work

The user has authorized B7/B8 remediation conditionally. Do not request that
same general authorization again. Implementation is stopped at the user's
explicit new schema/business decision boundary:

- **B7:** Client-stated free-text habits cannot use locale, staff notes, mood,
  notification JSON or consent/identity evidence. Production CustomerProfile has
  no equivalent field. The minimum proposal is one nullable encrypted
  `CustomerProfile.encryptedClientPreferences` field with existing Client ownership,
  encryption and execution/audit foundation. No new model or backfill. V1 bounded
  append/no-op and rejection rather than silent truncation/eviction are proposed
  explicitly; they are not already approved policy.
- **B8:** SMS proves phone possession only. The existing legacy helper also issues
  a phone-derived session; it cannot establish canonical channel/Client authority.
  Current ClientChannelLink/challenge schema can link an already proven Client,
  but there is no approved canonical Client contact-phone update command.
  Recommend linking-only V1 using existing verified authority, without saving a
  phone or creating a Client. If contact-phone persistence is required, its
  command/storage/proof contract needs a decision. The product need for first
  Client creation from SMS was not established, and no such authority is proposed.

1. Obtain owner decisions on the two concrete proposals above. B5/B6, D2-A,
   optional Maya User and the accepted 600-second Client linking foundation
   remain approved; do not repeat those decisions or reopen Waves 1–6.
2. Once contracts are sufficient, continue the same remediation: bounded schema
   foundation if approved, local adversarial/concurrency/restart/no-op proofs,
   clean replay and expected-only production migration gate/apply; canonical
   runtime/readers/ratchets and mandatory deployment gates. No real customer,
   phone or provider business mutations for smoke. New ambiguity still means STOP.
3. After production remediation verification PASS, restart the **entire 13-family
   Package 5 Final Adversarial Verification** from the beginning, including
   scripts, legacy callers, callbacks, schedulers, reads and narrow protocol
   exceptions. A filename alone does not prove isolation. Any new bypass means
   STOP with exact evidence. This proposal-only cycle did not rerun that Gate.
4. Only after Package 5 COMPLETE: YES may a separately authorized **CHAPTER 6
   FINAL COMPLETION / ACCEPTANCE GATE** begin. No automatic Chapter 6 completion
   and no Chapter 7.

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
CURRENT BLOCKERS: B7 SCHEMA PROPOSAL; B8 PHONE/LINKING DECISION
B7/B8 CONTRACT RECONSTRUCTION: COMPLETE
B7/B8 RUNTIME/SCHEMA IMPLEMENTATION: NOT STARTED
B7/B8 PRODUCTION REMEDIATION: NOT PERFORMED
B5 DIRECT CLIENT PROFILE BYPASSES: 0
B5 AUTOMATIC CRM PROVIDER WRITES: 0
B6 DIRECT NOTIFICATION PREFERENCE BYPASSES: 0
B6 HIDDEN CLIENT CREATION PATHS: 0
PREFERENCE ROW IMPLIES CONSENT: NO
PACKAGE 5 GLOBAL CANONICAL COVERAGE: NOT PROVEN
REMEDIATION FULL REGRESSION: PASS — 329 SUITES / 2742 TESTS
FINAL FULL REGRESSION: NOT RUN — STOP AT NEW INVENTORY BLOCKERS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE — RECONFIRMED READ-ONLY
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
