# Package 5 — B9 deployed; fresh Final Gate stopped on new bypasses

Date: 2026-09-04. Accepted owner checkpoint `8ab9dcf3`. Schema commit
`0d640318`; runtime commit `9b483768`. Active production release:
`/opt/maya-saas/releases/20260904-p5-b9-9b483768`.

**The approved B9 remediation is deployed and structurally verified in
production. The required new Final Gate started from scratch and found new
production-reachable mutation owners. Package 5 therefore remains incomplete
and the mandatory new-bypass STOP applies.** Waves 1–6 remain accepted.

Machine-readable evidence:
`evidence/package5-b9-deployed-final-recheck.json`. It records the fresh source,
live runtime and published-proxy inventory, selected deployed function hashes,
an isolated reproduction and process hygiene. It contains no secrets or
customer data.

## Approved B9 remediation completed

`ClientChannelLink.deliveryAddressEncrypted` is nullable and carries only a
reversible encrypted delivery address for an already verified link. The HMAC
subject remains the identity/comparison authority. The write flow validates the
trusted authenticated subject against the link before encryption. Delivery
decrypts, recomputes the HMAC, compares it exactly and fails closed on missing,
invalid, revoked, cross-tenant or policy-ineligible links. Plaintext is absent
from persisted link identity, Action evidence, campaign identity and logs.

`ClientWantedSlotInterest` owns the exact-time intent. It enforces server-derived
expiry at slot start, at most ten active interests per Client, deterministic
same-request convergence, at most three earliest eligible matches and existing
communication consent/preferences. Matching resolves only the verified
encrypted Client endpoint and uses an HMAC recipient identity in Communication
Delivery.

The two original B9 AI branches are closed:

- `get_referral_link` returns unavailable as a read-only result and creates no
  Client, referral, relationship or value fact;
- `remember_wanted_slot` requires verified channel context and submits the
  canonical wanted-slot command; it has no SQLite Client/waitlist fallback.

The old wanted-slot lookup/delivery calls were removed from the matching part of
`freed_slot.py`. No historical link endpoint or wanted-slot row was fabricated.

Local evidence passed: delivery schema PostgreSQL 6 cases, wanted-slot schema
PostgreSQL 8 cases, runtime PostgreSQL 8 cases, targeted ratchets, Python static
checks, typechecks, project lint, build and release preflight. Candidate
regression passed **334 suites / 2768 tests**.

## Production migration and deployment

The first additive migration added the nullable encrypted endpoint with write
guards. The second updated only the wanted-slot eligible-order guard. Both
production migration gates saw an expected-only pending set and drift `NONE`.
The eligible-order migration changed zero historical wanted-slot rows.

After apply, the release has 78 repository migrations and production has 81
finished records, including the three accepted historical records. Pending is
`0`; drift is `NONE`. Read-only counts at verification were zero Client links,
zero encrypted endpoints and zero wanted-slot interests, so backfill remains
zero.

The server candidate passed a separate read-only startup and readiness gate.
The temporary candidate was then terminated and its port closed before cutover.
After cutover, backend and PWA health/readiness passed, all deployed B9 hashes
matched, release preflight passed and error-priority journal entries since
activation were zero. No real Client, referral, wanted-slot, Communication
Delivery or provider mutation was used as smoke evidence.

## Fresh 13-family inventory

The Final Gate restarted after production verification. It inspected the exact
deployed backend release, 528 production TypeScript files, 214 HTTP route
decorators, 499 lexical mutation-like calls, 84 active-root Python modules, 99
Python HTTP route registrations, recursive Python/launcher surfaces and the
published PHP proxy. Lexical counts include approved protocol/fact owners and
are inventory counts, not bypass counts.

The deployed registry still contains the accepted 6 / 13 / 8 / 12 / 1 Wave
1–5 action classes, all six AC6 Policy V1 classes, the three Client preference/
habit capabilities and both B9 wanted-slot capabilities.

| Family | Canonical foundation present | Fresh aggregate result before STOP |
| --- | --- | --- |
| A15 | Wave 3 AC2 staff-day executor | Registered; aggregate certification stopped |
| A16 | Wave 2 AC1 access commands and AC5 reducer | Registered; aggregate certification stopped |
| A17 | Wave 3 connection/import and AC3/AC4/AC5 facts | Registered; aggregate certification stopped |
| A18 | Client-owned profile, consent, preferences, channel and B9 foundations | **FAIL: two active routes create a legacy Client** |
| A22 | Wave 1 settings/preferences | Registered; aggregate certification stopped |
| A23 | Wave 1 OperationalWorkItem and approved protocol state | Registered; aggregate certification stopped |
| A25 | Wave 2 security commands and AC3 auth protocol | Registered; aggregate certification stopped |
| A26 | Canonical TrialActivation | Accepted baseline retained; aggregate certification stopped |
| reduced A27 | Wave 4 inventory and AC4 review ingestion | Registered; aggregate certification stopped |
| A28 | Wave 4 prospective calendar actions and immutable AI receipt children | Registered; aggregate certification stopped |
| A29 | Wave 5 correction and immutable recovery facts | **FAIL: record-delete path also performs legacy direct delivery** |
| A30 | AC6 coordinator, MaintenanceRun/ItemClaim, Policy V1 | Six classes present; aggregate certification stopped |
| A31 | AC4/AC5 event, ingestion and reconciliation facts | Classified; aggregate certification stopped |

The family inventory set is exactly 13/13 and accepted waves remain 6/6.
Production-wide canonical-only ownership is not proven.

## B10 / A18 — two active HTTP routes create a legacy Client

The live `barbershop-pwa.service` starts `pwa_api.py`, which starts the deployed
webhook application. The published proxy still exposes both actions and its
hash matches the previously deployed proxy.

### `promo_gift`

Production chain:

`published action=promo_gift`
→ `POST /api/promo_gift`
→ `promo_gift_handler`
→ `database.get_or_create_client(chat_id)`
→ direct SQLite `INSERT INTO clients` when absent.

The handler is lines 2585–2620 of the deployed file; the writer call is line
2614. It uses authenticated Telegram channel identity directly as legacy Client
authority. There is no ClientChannelLink or canonical Client command in the
handler. After creating the Client it directly creates a birthday-promo fact and
can send the promo through Telegram. Those later value/delivery effects are also
outside the B9 approval and require classification against the accepted Package
2/4 baselines.

### `sub_create`

Production chain:

`published action=sub_create`
→ `POST /api/sub/create`
→ `sub_create_handler`
→ `database.get_or_create_client(chat_id)`
→ direct SQLite `INSERT INTO clients` when absent.

The handler is lines 7347–7476; the writer call is line 7379. The Client is
created before the handler checks whether a receipt phone exists. Consequently,
an authenticated request that returns `no_phone` has already created the legacy
Client. On the success path the same handler directly creates legacy subscription
state, calls YooKassa `create_payment`, and directly records subscription status
and payment identity. These are existing canonical value/provider-boundary
contracts, not authority granted to a legacy PWA route.

The common writer is deployed `database.py:get_or_create_client`, lines 745–759.
It selects by `telegram_chat_id` and directly inserts a `clients` row. It has no
tenant-qualified ClientChannelLink, linking challenge, canonical execution or
server-bound Client identity.

An isolated four-check reproduction executed those exact hash-matched function
bodies with an authenticated synthetic channel and SQLite `:memory:`. The promo
route created a Client before a forced downstream promo failure; the subscription
route created another Client before the real `no_phone` rejection. Repeats
retained the hidden rows. The reproduction used no network, provider, production
database or imported application.

## B11 — record-delete initiator still owns a direct legacy delivery branch

Fresh inspection of the deployed B9 trigger path also found:

`POST /yclients-webhook`
→ `handle_yclients_webhook`
→ `_process_record_delete`
→ `offer_freed_slot`
→ separate legacy cycle-scoring branch
→ `app.bot.send_message(legacy chat_id)`
and `database.log_freed_slot_offer`.

The canonical B9 wanted-slot match runs first and remains correct. The later
cycle-scoring branch is separate: it enumerates legacy SQLite Clients, evaluates
legacy preferences/consent and YClients history, sends directly to a raw
`chat_id`, and writes a legacy offer fact. It does not resolve a verified Client
delivery endpoint or submit Communication Delivery. A source-event/webhook may
initiate work, but it is not approved as a direct provider-delivery owner.

This is an A29-adjacent recovery initiator and also violates the accepted
Package 2 Communication Delivery baseline. B9 did not authorize deleting this
product behavior or silently changing its audience rules, so it was not altered
after discovery.

## Why the B9 gates did not prove aggregate completion

The B9 ratchets correctly cover the two AI tool branches, canonical wanted-slot
matching and the legacy wanted-slot waitlist calls. They do not scan the separate
`promo_gift` and `sub_create` HTTP handlers. They also intentionally treated the
pre-existing cycle scorer as separate from wanted-slot semantics; the aggregate
Final Gate is the stage that must classify and reject that direct delivery owner.

No existing ratchet was weakened. These findings do not invalidate the B9 proof,
but they prevent the global no-bypass verdict required for Package 5 completion.

## Closure

Mandatory STOP was applied at the fresh production inventory. Aggregate
regression and the remaining final family certifications were not relabelled
from the candidate regression. No B10/B11 runtime, schema, policy, value or
delivery change was made. A separate owner-approved remediation cycle must close
or explicitly classify these exact surfaces, then restart the full 13-family
Final Gate again.

```text
B9 PRODUCTION REMEDIATION: PASS
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
B9 VERIFIED CLIENT DELIVERY ENDPOINT: DURABLE
B9 PLAINTEXT DELIVERY ADDRESS PERSISTED: NO
B9 DELIVERY ENDPOINT HMAC VERIFIED BEFORE SEND: YES
B9 LEGACY WANTED-SLOT SQLITE FALLBACK: NO
B9 AI TOOL HIDDEN CLIENT CREATION PATHS: 0
B9 get_referral_link BUSINESS MUTATIONS: 0
NEW BLOCKER B10: A18 — promo_gift AND sub_create DIRECT LEGACY CLIENT CREATION
NEW BLOCKER B11: RECORD-DELETE CYCLE SCORER DIRECT LEGACY COMMUNICATION DELIVERY
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT
LEGACY MUTATING OWNERS ACTIVE: PRESENT
D1-A…D7-A GLOBAL ENFORCEMENT: NOT PROVEN — NEW AGGREGATE BYPASSES
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 334 SUITES / 2768 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW INVENTORY BLOCKERS
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
