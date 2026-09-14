# Package 5 B10/B11 deployed remediation and fresh Final Gate STOP

Status: **B10/B11 production remediation PASS; Package 5 Final Adversarial Verification FAIL at new B12 production baseline drift**

Accepted owner checkpoint: `b932f86f`.

Runtime commit: `ce08e9313f6039ef50f09c508777170f37ecec8d`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b10-b11-ce08e931`.

No schema was added. The production migration gate reported 78 repository
migrations, 81 accepted production records, pending migrations `0` and drift
`NONE`.

## B10 production result

The active `/api/sub/create` route no longer resolves or creates a Client in
SQLite. It accepts only a verified channel proof, sends a server-derived
purchase identity to the protected Nest bridge, resolves the tenant-qualified
`ClientChannelLink`, and invokes the existing P4-05
`initiate_customer_subscription_purchase` executor. Missing, ambiguous or
cross-tenant Client authority fails closed.

The active `/api/promo_gift` compatibility route returns HTTP 410 with
`legacy_promo_issuance_retired` and `business_mutations: 0`. It does not resolve
a Client, issue value, persist a promo fact or attempt delivery. Historical
promo rows are unchanged.

Static inspection of the exact deployed handler hashes found zero
`get_or_create_client` calls, zero direct subscription writers and zero promo
value/delivery writers in these routes. Remaining `get_or_create_client` calls
are definitions or handlers of the inactive full Telegram bot; the production
PWA launcher does not register or run that bot.

## B11 production result

The active record-delete path gives `offer_freed_slot` a durable provider-event
identity. The function retains the separate B9 exact wanted-slot matcher, then
returns an explicit `cycle_scored_outreach: disabled` result. Its deployed body
contains no Telegram send, legacy `chat_id` lookup, cycle candidate selection,
`freed_slot_offers` write or recovery-touchpoint write.

Therefore the scorer creates no communication authority, owns no delivery and
writes no legacy offer/value fact. The approved future Opportunity → authority
→ Communication Delivery boundary remains available; V1 does not perform that
transition automatically.

## Deployment gates and read-only verification

- targeted B10/B11 proof: PASS — 5 Jest suites / 35 tests and 2 Python bridge tests;
- Prisma validate, lint, application and script typechecks: PASS;
- build: PASS;
- full deployment regression: PASS — 336 suites / 2779 tests;
- production preflight and candidate-port readiness: PASS;
- backend health/readiness after switch: PASS;
- PWA request-only service after atomic file cutover: active and ready;
- error-priority logs after both service starts: `0`;
- real production promo, subscription, Telegram or provider mutations used as proof: `0`.

The PWA file cutover was applied to the exact previously running source so its
already deployed request-only `start_background_tasks` contract and public
community routes remained intact. Only the reviewed B10/B11 hunks plus the new
bridge module were installed. The first clean-commit candidate omitted that
runtime-only compatibility signature, failed before opening the port and was
automatically rolled back; it performed no business/provider mutation. The
corrected candidate then started successfully.

## Fresh Final Gate inventory

After production verification, the Final Gate restarted from the beginning. It
inspected the exact deployed backend release, 537 production TypeScript files,
218 HTTP route decorators, 500 Prisma mutation-like calls, 85 active-root Python
modules, 99 active Python HTTP routes, the request-only PWA launcher, the
inactive full-bot launcher and the published PHP proxy.

All 13 Package 5 family foundations remain registered and Waves 1–6 remain
accepted. Aggregate no-bypass certification stopped when the inventory found
the following new production-reachable baseline failure.

## B12 — accepted Package 4 fail-closed guards absent from production

The published proxy still exposes three relevant actions and the active PWA
implements them with legacy mutation owners:

1. `client_book_loyalty` → `POST /api/client/book-with-loyalty` → direct SQLite
   loyalty reservation/finalization, direct YClients booking and a legacy
   booking fact.
2. `cert_create` → `POST /api/cert/create` → direct legacy gift-certificate
   creation, direct YooKassa payment creation, direct payment-id persistence and
   a legacy poller continuation.
3. `panel_redeem` → `POST /api/panel/redeem` → direct legacy certificate
   consumption; its loyalty branch reaches the live legacy loyalty consumer.

The record-delete endpoint also still invokes the live
`loyalty.refund_for_cancelled_record`, which writes a direct legacy loyalty
refund outside the canonical P4-03 owner. B11 scorer outreach is disabled, but
that independent Package 4 value effect remains.

This is deployment/source drift against the accepted Package 4 baseline. The
repository HEAD contains fail-closed P4-03 and P4-06 guards in
`webhook_server.py` and ten legacy-loyalty guard uses in `loyalty.py`; the exact
deployed files contain none of those guards. The routes are production-reachable
through the hash-matched published proxy and the active `barbershop-pwa`
service. No endpoint was invoked and no production state was changed to prove
the blocker.

The Final Gate stops here as required. No B12 remediation was attempted, the
final aggregate regression was not substituted for the stopped inventory, and
Package 5 remains incomplete.

## Verdict

`B10/B11 PRODUCTION REMEDIATION: PASS`

`B10 HIDDEN CLIENT CREATION PATHS: 0`

`B10 LEGACY PROMO ISSUANCE: 0`

`B11 AUTOMATIC SCORER OUTREACH: 0`

`B11 LEGACY chat_id DELIVERY: 0`

`B11 LEGACY OFFER FACT WRITERS: 0`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B12 — PACKAGE 4 PRODUCTION GUARD DRIFT`

`PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 336 SUITES / 2779 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B12`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

The 17 pre-existing local test databases were not modified or deleted. Owned
temporary processes, watchers, browser processes and temporary databases are
zero.

Machine-readable evidence:
`evidence/package5-b10-b11-deployed-final-recheck.json`.
