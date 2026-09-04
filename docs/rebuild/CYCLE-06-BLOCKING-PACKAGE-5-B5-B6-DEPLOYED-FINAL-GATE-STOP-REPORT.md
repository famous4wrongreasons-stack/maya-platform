# Package 5 — B5/B6 deployed; fresh final inventory stopped on B7/B8

Date: 2026-09-04. Accepted decision: `cdd97012`, B5 Maya-local V1 and the exact
three-field B5/B6 schema and preference policy. Schema source `b152bf09`;
runtime source `fb820b3b`. Production release:
`/opt/maya-saas/releases/20260904-p5-b5-b6-fb820b3b`.

**B5/B6 remediation is deployed and production structural/read-only verification
passed. Package 5 remains incomplete: the newly restarted inventory confirmed
two additional A18 legacy writers. The user's new-bypass STOP applies.**
Waves 1–6 remain accepted. Neither Wave 7 nor Chapter 7 was started.

Evidence: `evidence/package5-b5-b6-deployed-final-recheck.json`, including source
inventory, live registry, live Python hashes/call edges, published PHP routing,
selected deployed function bodies, reproduction results and deployment digests.

## Approved remediation completed

- Exactly `CustomerProfile.defaultVisitMood`,
  `Appointment.clientVisitMood`, and
  `CustomerProfile.notificationPreferencesJson` were added, all nullable.
  No new models or invented historical values. Schema proof 37/37, clean replay,
  schema ratchets and expected-only additive production migration/apply passed.
- B5 and B6 now use verified ClientChannelLink authority and two bounded
  Canonical Action Ingress/Action Engine commands. The executable rechecks Client
  identity holds, tenant access and generation under transaction locks. No-op
  requests create no Client, profile, consent, execution or applied mutation fact.
- Mood is Maya-local. One owned upcoming confirmed Appointment and the Client
  default change atomically; existing visit choices are not overwritten by later
  defaults. `/api/set-visit-mood` does not call CRM. A07 is still a separate
  capability, not an automatic mood side effect.
- Notification overrides are not consent. Absence inherits applicable policy;
  there is no hidden three-hour Client default. Hours must be integers 1–48;
  zero and contradictory patches fail validation. `reminder=false` disables.
  Legacy readers now read canonical state; missing/ambiguous Client fails closed.
- Python SQL mood/preference writer entry points fail closed. The notify handler
  cannot create a legacy Client. PHP and the app callers forward the authenticated
  channel, command identity and expected generation.

Runtime PostgreSQL proof **28/28** includes concurrent duplicate and competing
commands, restart after admission, rollback between profile/appointment writes,
retry after rollback, no-op, missing/ambiguous identity, cross-Client/tenant/provider
rejection, historical appointment rejection and no consent mutation. Full candidate
regression **329 suites / 2742 tests PASS**; application/scripts typechecks, lint,
build and preflight PASS. Python 18/18, synthesized live candidate 10/10 and PHP
13/13 checks passed. Native mirror sync passed; no native build/install occurred.

Sequential server gates passed before cutover, including dependency installation,
Prisma generation, release preflight, migration status/drift, artifact matching
and an isolated read-only candidate startup. All 74 repository migrations are
applied; 77 production records include three recognized historical records.
Pending migrations **0**, drift **NONE**. Live Maya and PWA services are ready;
error-priority journal entries since activation **0**. The bot stays inactive.
All candidate listeners were removed. No business/provider smoke command ran.

The first postdeploy helper expected a namespace-qualified Python call rather
than the actual explicit import. The helper was corrected to verify the exact
import and dispatch plus unchanged writer exclusions. All live hashes already
matched; no runtime or architectural ratchet was weakened to pass this check.

## Fresh inventory across the complete family set

The final gate started again from source and live state, rather than reusing the
B5/B6 targeted scan. It inventoried 903 backend/source/script TypeScript files,
277 route/scheduler declarations, 956 lexical mutation-like calls (including
test calls and cryptographic APIs), and 81 live Python files plus 93 published
PHP cases and system launchers. The narrower established model scan found 145
source write sites. These are inspection inventories, not counts of business
actions or proven bypasses. Crypto calls are not classified as DB writes.

| Family | Registered/classified canonical foundation | Fresh result before STOP |
| --- | --- | --- |
| A15 | Wave 3 AC2 staff-day executor | Registered; remaining alternate-path certification stopped |
| A16 | Wave 2 AC1 staff access/owner commands; exact AC5 CRM access reducer | Registered; certification stopped |
| A17 | Wave 3 connection/import commands; AC3 bootstrap; AC4/AC5 provider facts | Registered; prior AI continuation verified structurally |
| A18 | Wave 3 Client profile/consent/notes; verified channel/challenge; two new preference commands | B5/B6 PASS; **B7/B8 direct legacy Client writers** |
| A22 | Wave 1 settings/dashboard/appointment notification commands | Registered; B6 Client preferences now have their explicit A18 owner |
| A23 | Wave 1 OperationalWorkItem commands; exact inbox/transport protocols | Registered; certification stopped |
| A25 | Wave 2 security commands; AC3 auth lifecycle | Registered; certification stopped |
| A26 | Wave 2 commands and atomic TrialActivation | Prior trial/admin/internal bootstrap verified structurally |
| reduced A27 | Wave 4 inventory commands; AC4 review ingestion | Registered; certification stopped |
| A28 | Wave 4 calendar commands; immutable AI receipt children | Registered; no direct AI A28 writes in accepted remediation |
| A29 | Wave 5 attribution correction; immutable recovery facts/projections | Registered; certification stopped |
| A30 | AC6 coordinator → MaintenanceRun/ItemClaim → six Policy V1 classes | Compiled policy/ownership and launcher checks PASS |
| A31 | AC4/AC5 events, mirror/reconciliation and recovery fact plane | Classified; certification stopped |

Set inventory **13/13**, accepted waves **6/6**. Global no-bypass coverage is
**not proven**. AC6 remains approved canonical ownership without an artificial
Action Engine route. The 40 accepted Wave 1–5 registrations are unchanged.

The scan also collected administrative scripts and live helper definitions;
it does not exempt them by filename. Their complete provenance/reachability
certification remains unfinished after STOP. In particular, the old live
`append_record_comment` direct-PUT definition has no call edge in the newly
captured live Python inventory after B5 removal; its mere existence was not
reported as a new reachable bypass. No broad legacy-file exclusion was used.

## B7 — AI `remember_client_preference` writes Client preferences directly

Actual active route:

`published api-proxy.php case chat` → `POST /api/chat`
→ live `webhook_server.py:9747` `chat_handler`
→ `claude_ai.get_ai_response`
→ `claude_ai.py:5171` `_run_tool_uses`
→ `claude_ai.py:4938` `_execute_tool`
→ `remember_client_preference` branch at **2724–2737**
→ `database.py:925–949` `add_client_preference`.

The handler's route is registered at live `webhook_server.py:13721`; the active
PWA entry point calls `start_webhook_server` at `pwa_api.py:35`. The actual tool
policy allows this tool on the client surface. A prior valid-consent check on
chat is not authority for an unrelated profile mutation.

The tool sanitizes free-text preferences and passes the channel's `user_id`
directly to a SQLite writer. That writer calls `get_or_create_client`, then
upserts `client_preferences.prefs`. It has no verified canonical Client target,
expected generation, ActionExecution or immutable canonical mutation outcome.
Case-insensitive text deduplication is not a canonical retry/authority boundary.
This is a customer habit/profile command under A18 AC1, not a provider source
fact, notification transport or auth protocol. No new schema decision is inferred
here; exact canonical field/semantics must be examined in its remediation cycle.

## B8 — phone linking still creates/updates the legacy Client profile

`published api-proxy.php case cabinet_link_phone`
→ `POST /api/cabinet/link-phone`
→ live `webhook_server.py:11116–11150` `cabinet_link_phone_handler`
→ `database.py:745–759` `get_or_create_client`
→ `database.py:762–783` `update_client`.

The endpoint is registered at live `webhook_server.py:13689` in the active PWA
server. It authenticates the channel and verifies a YClients SMS code, then
creates a SQLite Client if absent and directly replaces its encrypted phone
and phone hash. It does not consume ClientLinkChallenge, resolve the verified
ClientChannelLink or dispatch a canonical Client profile command.

SMS verifies phone control; this report does **not** claim that the SMS check is
bypassed or that this route writes ClientChannelLink/ClientConsentFact. The
failure is the separate direct legacy Client creation/profile owner after SMS,
which the cabinet uses for customer resolution. A narrow auth-protocol exception
does not authorize that separate Client business write. Repair must explicitly
separate phone authentication from canonical Client linking/profile authority.

## Safe reproduction and closure

Four checks used selected deployed ASTs, synthetic authenticated channels/SMS
results and SQLite `:memory:`. They verified actual client-tool authorization,
direct preference insertion with hidden legacy Client creation, duplicate text
deduplication still outside canonical execution, and direct legacy Client phone
creation/update after successful SMS. Local AI source hash exactly matched live
before using its static policy. Production application modules/configuration were
not imported; no model, SMS or provider network call occurred.

The new bypasses trigger the user's STOP. No B7/B8 runtime/schema change was made.
Fresh final aggregate replay/regression stages were not continued after the
inventory failure. Candidate regression PASS remains evidence of deployment,
not a substituted final completion verdict. The current remainder names the
new exact paths; after their separately authorized remediation, restart the
entire 13-family final gate again.

All 30 pre-existing dirty platform files were preserved, with only task deltas
in the three mixed files. The 17 pre-existing test databases were untouched.
The owned isolated PostgreSQL clusters, sockets and listeners were removed;
no owned browser, watcher or temporary process remains.

```text
B5/B6 REMEDIATION DEPLOYED: YES
B5/B6 PRODUCTION STRUCTURAL/READ-ONLY VERIFICATION: PASS
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
B5 DIRECT CLIENT PROFILE BYPASSES: 0
B5 AUTOMATIC CRM PROVIDER WRITES: 0
B6 DIRECT NOTIFICATION PREFERENCE BYPASSES: 0
B6 HIDDEN CLIENT CREATION PATHS: 0
PREFERENCE ROW IMPLIES CONSENT: NO
NEW BLOCKERS: B7 AI remember_client_preference; B8 /api/cabinet/link-phone
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B7/B8
LEGACY MUTATING OWNERS ACTIVE: PRESENT — A18 LEGACY CLIENT WRITERS
D1-A…D7-A AGGREGATE VERDICT: NOT PROVEN
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 329 SUITES / 2742 TESTS
FINAL FULL REGRESSION GATE: NOT RUN — STOP AT NEW INVENTORY BLOCKERS
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
