# Package 5 — B7/B8 deployed; fresh Final Gate stopped on B9/A18

Date: 2026-09-04. Accepted owner checkpoint `47454962`. Schema checkpoint
`5e3a8e7a`; deployed runtime `4b96b546`. Current production release:
`/opt/maya-saas/releases/20260904-p5-b7-b8-4b96b546`.

**Approved B7/B8 remediation is deployed; production structural/read-only
verification passed. The full Final Gate restarted from scratch and confirmed
another production-reachable A18 Client-creation bypass. Package 5 remains
incomplete. The owner's new-bypass STOP applies.** Waves 1–6 remain accepted.

Evidence: `evidence/package5-b7-b8-deployed-final-recheck.json`: fresh source and
live inventory, registrations, Python call edges/function hashes, published PHP
routes, launchers, isolated reproduction, deployment checks and hygiene.

## Approved remediation completed

One nullable field, `CustomerProfile.encryptedClientPreferences`, was added;
no new models, backfill or staff-note reuse. Client-owned V1 limits apply together:
12 entries, 200 Unicode code points per entry, 8192 complete plaintext JSON UTF-8
bytes and 10963 persisted ciphertext bytes. Overflow rejects atomically with
`CLIENT_PREFERENCES_LIMIT_EXCEEDED`, preserving prior ciphertext and generation.
No silent truncation/deletion or automatic LLM compression is used.

B7 now uses verified tenant-qualified ClientChannelLink authority and bounded
`package5.client-habits.add.execute.v1` through Canonical Action Ingress and
Action Engine. The executor serializes profile generations and atomically commits
encrypted state with durable execution/mutation evidence. Command material is
encrypted; audit fingerprints are keyed. Read/identical no-op creates no Client,
profile, execution or applied mutation fact. The old SQLite preference writer
fails closed. Original authenticated request context stays outside model arguments
across ordinary, streaming and realtime paths. Phone-only staff dossier access
fails explicitly rather than inventing new staff authority or empty history.

B8 `/api/cabinet/link-phone` treats SMS success as transient evidence only. It
requires verified canonical binding or consumes an approved server-bound challenge,
then checks Client eligibility. No legacy Client create/update, contact-phone
persistence, legacy session issuance or fallback. Missing/ambiguous Client fails
closed. The app presents an optional linking token and reports binding completion
without claiming that contact phone was saved. Native mirror/Capacitor sync match.

Schema PostgreSQL **19/19**, runtime PostgreSQL **20/20**, targeted ratchets
**39/39**, Python **28/28 PASS**. Checks include 12/13 entries, 200/201 code points,
8192/8193 plaintext bytes, 10963/10964 ciphertext bytes, unchanged overflow state,
concurrency, restart after admission, guest Client, forged identity and isolation.
PHP strict transport and HTML parsing PASS. Full candidate regression **331 suites
/ 2758 tests**, project lint, application/scripts typechecks, build/preflight PASS.

An existing architecture ratchet caught a contract import from CRM during
preparation. The pure policy module was moved into Action Engine; the ratchet
remained unchanged. No broad allowlist was introduced.

## Production boundary

Expected-only additive migration Gate/apply PASS. All 75 repository migrations
are applied; 78 production records include three recognized historical records.
Pending **0**, drift **NONE**, backfill **0**. Prior runtime stayed running during
schema apply. Sequential server gates passed: dependencies, Prisma generation,
preflight, migration/drift, 1693 artifact hashes and read-only startup on port
3199. The temporary candidate was terminated and reaped before cutover.

VPS runtime and Python/PHP/PWA assets were deployed only after those gates passed.
Live hashes match. Maya and PWA health/readiness PASS; error-priority journal
entries since activation **0** at verification. Bot remains inactive. Earlier
A18/A26/AI, B5/B6 and Waves 1–6 structural checks PASS. A30 retains canonical AC6
Run/ItemClaim ownership. No real business/provider mutation was used for smoke.

The first published-proxy verification helper expected inline URLs; routes
actually delegate to the approved fragment. It was corrected to check exact
delegation plus fragment routing. Hashes already matched; runtime/ratchets were
unchanged and the corrected structural check passed.

## Fresh complete family inventory

The new scan collected 911 backend/source/script TypeScript files, 282 route or
scheduler declarations, 980 lexical mutation-like calls, 82 live Python files,
all 93 published PHP cases, running service entry points and recursive system
launcher/maintenance inventory. Lexical counts include tests and non-business
operations; they are not bypass counts. Scripts/helpers/read surfaces were not
exempted by filename.

| Family | Canonical foundation in fresh inventory | Result before STOP |
| --- | --- | --- |
| A15 | Wave 3 AC2 staff-day executor | Registered; alternate-path certification stopped |
| A16 | Wave 2 AC1 access/owner commands; exact AC5 reducer | Registered; certification stopped |
| A17 | Wave 3 connection/import; AC3 bootstrap; AC4/AC5 facts | Registered; prior AI continuation structurally preserved |
| A18 | Wave 3 profile/consent/notes, channel/challenge, B5/B6 and B7 | B7/B8 PASS; **B9 hidden legacy Client creation** |
| A22 | Wave 1 settings/dashboard/appointment notifications | Registered; certification stopped |
| A23 | Wave 1 OperationalWorkItem; exact transport protocols | Registered; certification stopped |
| A25 | Wave 2 security and AC3 auth lifecycle | Registered; certification stopped |
| A26 | Wave 2 and atomic TrialActivation | Accepted trial/admin/internal bootstrap structurally preserved |
| reduced A27 | Wave 4 inventory; AC4 review ingestion | Registered; certification stopped |
| A28 | Wave 4 calendar; immutable AI receipt children | Registered; accepted continuation structurally preserved |
| A29 | Wave 5 correction; immutable recovery facts/projections | Registered; certification stopped |
| A30 | AC6 coordinator → Run/ItemClaim → six Policy V1 classes | Compiled ownership/policy and launcher checks PASS |
| A31 | AC4/AC5 events, reconciliation and recovery facts | Classified; certification stopped |

Family set **13/13**, accepted waves **6/6**. The 40 accepted Wave 1–5 registrations
and six A30 classes remain intact. Global canonical-only ownership is **not
proven**. Other collected scripts/helpers still need full reachability
classification after resume. Inactive bot/backup definitions were not automatically
classified as active bypasses. B9 is not asserted to be the last remaining bypass.

## B9 — two AI tools create a legacy Client

Active route: published `api-proxy.php case chat` → `POST /api/chat` → live
`webhook_server.py:9747` `chat_handler` → `get_ai_response` at live **10144** →
`claude_ai.py:5175` `_run_tool_uses` → **4941** `_execute_tool`.
The HTTP route is registered at live `webhook_server.py:13725`; active PWA runs
`pwa_api.py`, which starts the webhook server. Webhook line numbers refer to live
artifacts; unrelated local edits shift local lines and were not deployed.

- `remember_wanted_slot` branch at **claude_ai.py:2072**: after staff discovery,
  **2082** calls `database.get_or_create_client(user_id)` before slot continuation.
- `get_referral_link` branch at **claude_ai.py:2171**: **2178** calls the same
  writer before referral continuation. Actual tool risk policy classifies it
  as **read**.

`database.py:745–759` selects by `telegram_chat_id`, then directly INSERTs into
SQLite `clients` if absent. The insertion has no tenant-qualified canonical
Client target, verified linking operation, canonical Client command,
ActionExecution or canonical creation outcome. This is A18 Client business
creation, not an auth/transport fact or projection rebuild.

This is not an unauthenticated HTTP/consent bypass claim. Chat authenticates the
channel and checks consent. Current `has_valid_consent_by_chat_id` calls canonical
delivery-consent and can succeed without a legacy Client row; that read neither
creates the row nor authorizes a separate Client creator. Verified channel
identity alone is not Client-creation authority.

Seven isolated checks executed hash-matched deployed dispatcher, policy and
SQLite writer with synthetic authenticated context and `:memory:`. Both tools
are client-authorized and staff-denied. Referral read created a legacy Client
before a synthetic downstream rejection; retry retained it. Slot continuation
also created a Client before downstream failure. Unauthenticated tool invocation
created nothing. No production DB/configuration, LLM, SMS or provider call was
used. This is selected-code reproduction, not an end-to-end HTTP auth test.
Only hidden Client creation is classified; downstream referral/slot semantics
were not redesigned or implicitly approved.

## Closure

STOP at new bypass; no B9 runtime/schema fix or further final aggregate gates.
Deployment regression PASS does not substitute for Package 5 completion. After
separate B9 remediation authorization, preserve the deployed baseline and restart
the entire 13-family Final Gate. Chapter 6 completion requires its separate gate.

```text
B7/B8 PRODUCTION REMEDIATION: PASS
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
B7 DIRECT CLIENT PREFERENCE BYPASSES: 0
B7 HIDDEN CLIENT CREATION PATHS: 0
B7 LIMIT POLICY: ENFORCED
B8 DIRECT LEGACY CLIENT MUTATION BYPASSES: 0
PHONE MATCH AS CLIENT AUTHORITY: NO
NEW BLOCKER: B9 / A18 — TWO AI TOOL PATHS TO DIRECT LEGACY CLIENT CREATION
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B9 CONFIRMED
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B9 CLIENT WRITER
D1-A…D7-A GLOBAL ENFORCEMENT: NOT PROVEN — A18 BYPASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 331 SUITES / 2758 TESTS
FINAL FULL REGRESSION GATE: NOT RUN — STOP AT NEW INVENTORY BLOCKER
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Hygiene verified no owned temporary processes/watchers/browsers/databases, local
proof port 55487 and server candidate port 3199 closed, and all 17 old databases
untouched. All 30 pre-existing dirty file hashes/mixed-file task deltas were
checked; unrelated changes remain preserved. Native generated web assets match.
