# Package 5 B14 deployed remediation and fresh Final Gate STOP

Status: **B14 production remediation PASS; Package 5 Final Adversarial Verification FAIL at new B15 read-path mutation bypass**.

Accepted owner checkpoint: `c73134ea`.

Runtime commit: `7260a5a4860c925ab51abf6f2936e4eeec4fceab`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b14-7260a5a4`.

No schema or migration was added. The production Gate reported 78 repository
migrations, 81 accepted production migration records, pending migrations `0`
and independent schema drift `NONE` (`No difference detected`).

## B14 production result

The approved retirement contract is active on every published B14 surface.

1. `/api/god/billing` is a measured-cost read projection. Any action other
   than `view` returns the explicit `god_billing_controls_retired` outcome with
   `business_mutations: 0`. It no longer reads or writes `god_renewals` or
   `god_ai_budget_usd`.
2. The published PWA contains no renewal or editable AI-budget controls and
   reports actual measured AI spend without presenting false mutation success.
3. The published PHP edge rejects retired billing mutation modes before they
   reach the active PWA.
4. `/api/god/overview` no longer calls `list_maya_tenants` or uses the legacy
   registry as current subscriber authority. Until a canonical admin projection
   is available it returns an explicit read-only unavailable projection.
5. The GOD health path is read-only: it performs no probe write and invokes the
   dual-role audit with `repair=False`.

Historical legacy settings and `maya_tenants` rows were not changed. They grant
no current authority and no fake canonical history was created.

## Proof and deployment

- targeted B13/B14 Python proof: PASS — 24/24;
- exact merged production-candidate B14 boundary proof: PASS — 5/5;
- B14 architecture ratchet: PASS — 6/6;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 339 suites / 2793 tests;
- active Package 4 runtime guard: PASS;
- active Package 5 B13/B14 runtime guard: PASS;
- backend candidate startup and production health/readiness: PASS;
- active request-only PWA startup: PASS; Telegram polling/background jobs remain disabled;
- published PHP 8.1 syntax, edge markers and public app availability: PASS;
- backend and PWA error-priority logs after activation: `0`;
- candidate port 3199 after deployment: `CLOSED`;
- real production settings, tenant, value, provider or other business mutations
  used for proof: `0`.

The active PWA and published app candidates were built by applying only the
reviewed B14 changes to the exact previously deployed artifacts. This preserved
their independent accepted production additions instead of overwriting them
with unrelated local working-tree changes.

Published artifact hashes:

- app SHA-256: `fe804992306c50d5e8544a48d59d496c75664dd0af542b13b0e1f7810e59ebc7`;
- proxy SHA-256: `886ca639708a766996716fcb4b1a6b85690c1c61baca35d6b5959495df4e75f5`;
- active webhook SHA-256: `c997cb66271141a743a1efc9d5a31bdfc75b8f133d37873ea6127ccedd57d14a`;
- active B13/B14 guard SHA-256: `9e62cf60cebe3ac1b1d4b9dee871803dd8b880f1a306dcebf3015d8084933f48`.

## Fresh Package 5 Final Gate inventory

After structural production verification, the Final Gate restarted from the
beginning. It inspected the exact deployed backend release, 537 production
TypeScript files, 218 HTTP route decorators, 500 mutation-like TypeScript
calls, 89 active-root Python files, 69 non-test Python files, 94 active Python
HTTP route registrations, 93 distinct registered handlers, the request-only
PWA launcher, the inactive full-bot launcher and the exact published app and
proxy. All 13 Package 5 families remain present and Waves 1–6 remain accepted.

The inventory found B15 and stopped before final aggregate regression and
certification, as required.

## B15 / A18 — `/api/chat/history` mutates legacy chat state

The published app calls `chat_history`; the published proxy forwards it to
`POST /api/chat/history`; and the active request-only PWA registers
`chat_history_handler`.

Although the endpoint is a history read, its client-mode branch calls both:

- `_ensure_client_loyalty_chat_offer(chat_id)`;
- `_ensure_client_repeat_booking_offer(chat_id)`.

The repeat-booking helper resolves a legacy Client through raw `chat_id`, reads
provider history and then calls `_store_assistant_message_in_chat`. That writer
appends a newly generated assistant/recommendation message to legacy
conversation storage and calls `memory.save_conversations`. The read handler
also generates IDs for historical messages and writes the migrated history
when any item lacks a valid ID.

The Package 4 loyalty guard prevents the loyalty helper's old value backfill,
so this finding does not claim a new loyalty-value mutation. The proven bypass
is the creation/rewrite of durable chat/recommendation state by a read endpoint,
using legacy channel identity instead of a verified canonical Client and
without an approved Opportunity/outreach/Communication Delivery owner.

Exact deployed evidence:

- active route registration: `webhook_server.py:13015`;
- `chat_history_handler`: lines 8910–8954, SHA-256
  `eeaf76c889351a79eee80b672427c3b415007f7e15f61f331bf7a07d20d2eafd`;
- `_ensure_client_loyalty_chat_offer`: lines 8706–8750, SHA-256
  `07ee3da10c02a75366c2245935868a0661bc0720a2efbbc88bc7d0bf166e0934`;
- `_ensure_client_repeat_booking_offer`: lines 8753–8818, SHA-256
  `0f1866cd0439ef5a391dcd3466f1817bd9a7ec478c3ca3ca4653db27ad13067d`;
- `_store_assistant_message_in_chat`: lines 8640–8703, SHA-256
  `97fad51f5371e4faeba797af91d73c0ff7580c7fba4a57b106120bf0efd913a8`;
- published proxy action/mapping: lines 2491 and 2498;
- published PWA caller: line 15531.

An isolated reproduction used the exact deployed function text and disposable
in-memory state. One history read invoked both offer helpers and changed the
saved state hash with one `save_conversations` call. Production mutations were
zero.

Owner decisions are required before remediation: whether these automatic
loyalty/repeat suggestions are retired or become an explicit canonical
Opportunity/outreach action, which canonical owner may persist an in-app
recommendation, and whether read-time legacy message-ID migration is removed or
given a separately approved protocol migration boundary. Any retained path must
resolve a verified canonical Client and preserve Package 2 Communication
Delivery and Package 4 value authority.

## Verdict

`B14 GOD BILLING LEGACY MUTATION OWNERS: 0`

`B14 LEGACY RENEWAL TRACKER: RETIRED`

`B14 EDITABLE AI BUDGET: RETIRED`

`B14 GOD OVERVIEW LEGACY FALLBACKS: 0`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B15 / A18 — READ-ONLY CHAT HISTORY CREATES/REWRITES LEGACY COMMUNICATION STATE`

`READ PATH BUSINESS/PROJECTION MUTATIONS: PRESENT — /api/chat/history`

`LEGACY chat_id AS CLIENT/COMMUNICATION AUTHORITY: PRESENT — /api/chat/history`

`PRODUCTION DIRECT BUSINESS/VALUE MUTATION BYPASSES: PRESENT`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT`

`LEGACY FALLBACKS: PRESENT`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B15 BLOCKER`

`PACKAGE 4 CROSS-PACKAGE GUARDS: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 339 SUITES / 2793 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B15 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b14-deployed-final-recheck.json`.
