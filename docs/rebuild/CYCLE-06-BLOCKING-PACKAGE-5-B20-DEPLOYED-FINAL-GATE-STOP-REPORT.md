# Package 5 B20 deployed remediation and fresh Final Gate STOP

Status: **B20 production remediation PASS; Package 5 Final Adversarial
Verification FAIL at new B21 realtime voice identity/projection/history-owner
bypass**.

Accepted checkpoint: `171fcdc5`.

Runtime commits:

- `16c24bd1a49c9ae542ba79639c202946a511b4b6`;
- `9cc3b2f1d143ff132835d3bdb153d76a721b1758`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b20-16c24bd1`.

No schema or migration was added. Production has 78 repository migrations and
81 accepted migration records. Pending migrations are `0`; an independent
Prisma comparison reports `No difference detected`.

## B20 production result

All three cabinet projections now share one canonical boundary:

`authenticated channel/session -> trusted channel subject -> verified active
ClientChannelLink -> exact tenant-qualified Client -> permitted read-only
Client projection`.

`GET /api/cabinet/me`, `POST /api/cabinet/me-via-login` and
`POST /api/cabinet/me-via-session` call
`ClientChannelRuntimeService.cabinetProjection`. The boundary accepts the
existing verified Telegram init-data, Telegram Login Widget and Maya JWT
channel proofs. Maya JWT resolves a Client only through an active `maya_user`
`ClientChannelLink`; the account cannot select an arbitrary Client. A Client
without a Maya User remains supported through an exact verified channel link.

Raw `chat_id`, legacy web session, phone match and caller-supplied `clientId`
are not Client authority. Missing, revoked, ambiguous or cross-tenant bindings
return the unlinked projection and disclose no stored Client name, full phone,
profile, preferences or private facts. The encrypted delivery address remains
delivery-only and is not used as reverse identity evidence.

The shared boundary reads the canonical PostgreSQL Client, appointments,
loyalty, customer subscription and referral projections. It performs no
Client, link, profile, consent, history, conversation or business-fact write.
The legacy history cache, lazy backfill and referral get-or-create calls are no
longer reachable from the cabinet projection. The three endpoints have equal
identity and read-only behavior.

Production verification was structural/read-only. No production cabinet PII
endpoint was called for smoke proof, and no real Client, profile, consent,
history, provider or value mutation was performed.

## Proof and deployment

- targeted B20 Python proof: PASS — 7 tests;
- targeted B20 TypeScript proof: PASS — 2 suites / 10 tests;
- preserved B13–B20 Python proof: PASS — 56 tests;
- preserved B13–B20 TypeScript proof: PASS — 10 suites / 55 tests;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 349 suites / 2860 tests;
- source PWA inline-script parse: PASS — 28 blocks;
- exact active request-only PWA inline-script parse: PASS — 26 blocks;
- active Package 4 cross-package guard: PASS;
- active Package 5 B13–B20 runtime guard: PASS;
- backend and PWA health/readiness: PASS;
- production pending migrations: `0`;
- production schema drift: `NONE`;
- backend and PWA error-priority logs after successful activation: `0`;
- real production business/provider/value mutations used for proof: `0`.

The first VPS overlay attempt targeted the disabled `barbershop-bot.service`
while the request-only `barbershop-pwa.service` owned port 8080. The readiness
condition rejected that attempt, restored the prior files and left the active
PWA process available. The resulting owned restart loop was stopped. The
corrected cutover targeted `barbershop-pwa.service`, preserved its
request-only launcher contract and passed both runtime guards.

The first Beget publication check used the host's obsolete default PHP 5.6
CLI. That interpreter also rejects syntax already present in the active proxy,
so no file was switched. The exact active overlay passed PHP 7.4 through 8.4,
was then moved atomically and returned HTTP 200. Neither rejected attempt
crossed a business-mutation boundary.

Exact deployed B20 artifact hashes:

- backend Client channel authenticator JS:
  `0406331116899da51347fa2cfbb4b75a2373612a2d77b7f0eb11b7092e78ef47`;
- backend Client channel runtime JS:
  `39bb4ff22a14ebf4134e44e145aa9ac191982d4a625052e1b1bef88452f1c024`;
- backend Client channel controller JS:
  `41ac38896287ce0bf8cdc3ea0a1bde76be5c44e5abb8d18ad1d2fd606cc1e093`;
- active webhook:
  `73e2b1306f24113211993a54cda2749ed0ae9299cbbb82931c095ca10d1e9628`;
- active Client command bridge:
  `edb19cc97fbe7fbbf08a6ec3de8b6b5ee5573c9991c80b2c0b68255bc3b3c9d2`;
- active Package 5 guard:
  `5cacf39c128bc112c042ff966f6f300985a5f9f218aae98a38441103bcf8819c`;
- published proxy:
  `37d14444c195a7bfa5b035669a9add067795050bef945212a609a4b60cdb5fc6`;
- published application:
  `56fc2f1238f366d51ac975176207e5d1c89318b03aadf9c8738c21009a4bb861`.

## Fresh Package 5 Final Gate inventory

After B20 structural verification, the Final Gate restarted from the
beginning. It registered all 13 family foundations and inspected the exact
deployed backend release, 537 production TypeScript files, 218 HTTP
decorators, 502 mutation-like calls, 553 deployed JavaScript files, 89
active-root Python files, 69 non-test Python files, 94 non-OPTIONS Python HTTP
routes, 93 distinct handlers, the request-only PWA launcher, the published
proxy/application, active AI and voice tools, cabinet, chat/stream,
journal/history and background/event paths, identity/PII/read/provider/value
boundaries and Package 4 cross-package guards.

B20 passed its 3/3 endpoint authority and read-only parity scan. The inventory
then stopped at the first new production-reachable blocker, B21. Final
aggregate certification was not started after that finding.

## B21 / A18 — realtime voice trusts legacy identity and history owner

The published PWA opens `wss://rt.malesthetic.pro/api/realtime`. Its active
authentication message prefers Telegram init data or Login Widget data, but
still actively sends `web_session_token` when those values are absent. It does
not send the canonical Maya JWT used by the B20 cabinet boundary.

The active `GET /api/realtime` WebSocket handler is registered at line 12582
of `webhook_server.py`; `realtime_handler` spans lines 9966–10036 and has
SHA-256
`bb878292dc3bd3c5eb1a457725de74d1114c43dc9be75999973394f7535262c5`.
It:

1. resolves a legacy web session into a Telegram-shaped identity at line
   10007 and reduces every accepted channel to raw `chat_id` at line 10010;
2. treats `database.has_valid_consent_by_chat_id(chat_id)` as its Client gate
   at line 10015;
3. catches failure to construct canonical channel proof and sets
   `verified_channel_proof = None` at lines 10026–10030;
4. still sends `ready` and calls `realtime_bridge.run_session` at line 10031
   without requiring a verified active `ClientChannelLink`, exact canonical
   Client or tenant-qualified binding.

`realtime_bridge.run_session` spans lines 375–710 and has SHA-256
`b8b8df0c4b8df4ae5a31d3164162bdeb3c6d2b2774231a83a652c60053666b70`.
It resolves the AI role from raw `chat_id`, reads conversation history by that
same global key, passes `user_id=chat_id` to the AI tool loop and creates a
canonical `ClientCommandContext` only when optional proof happens to exist.
The client voice surface disables only `barber_knowledge`, so the active AI
tools can still select a legacy SQLite Client by raw `user_id` and return
Client-specific appointment, loyalty and visit-history facts through direct
provider reads.

The voice loop writes the new transcript and reply back under raw `chat_id`.
`memory.py:save_conversations` spans lines 565–574, has SHA-256
`e8bf73886b4ee39edcb89d82b7e72ea7c98065cc714ef38848dc0ff0b90e2c85`
and atomically replaces the durable legacy conversation file. A valid legacy
session or signed Telegram channel therefore becomes Client/role/projection
and history-write authority without the verified Client binding required by
D2-A and B8–B20.

No production realtime endpoint was invoked, no runtime/schema remediation
was attempted for B21 and no production mutation was created for this proof.

## Verdict

`B20 PRODUCTION REMEDIATION: PASS`

`B20 VERIFIED CLIENT PROJECTION AUTHORITY: ENFORCED`

`B20 RAW chat_id/LEGACY SESSION CLIENT AUTHORITY: 0`

`B20 UNVERIFIED CLIENT PII PROJECTION: 0`

`B20 READ-SURFACE LEGACY WRITES: 0`

`B20 CABINET ENDPOINT IDENTITY PARITY: ENFORCED`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B21 / A18 — REALTIME VOICE LEGACY CLIENT/ROLE/PROJECTION AND HISTORY-WRITE AUTHORITY`

`B21 VERIFIED ClientChannelLink REQUIRED BEFORE READY: NO`

`B21 LEGACY SESSION/RAW chat_id AUTHORITY: PRESENT`

`B21 LEGACY CONSENT AS IDENTITY GATE: PRESENT`

`B21 UNVERIFIED CLIENT PRIVATE PROJECTIONS: PRESENT`

`B21 RAW chat_id CONVERSATION/HISTORY WRITER: PRESENT`

`READ-SURFACE BUSINESS MUTATION BYPASSES: 0 AFTER B20; B21 IS AN INTERACTIVE LEGACY HISTORY OWNER`

`PRODUCTION DIRECT BUSINESS/PROVIDER/VALUE MUTATION BYPASSES: PRESENT — B21 LEGACY HISTORY OWNER`

`LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B21`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT — B21 CONVERSATION/HISTORY WRITER`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B21 BLOCKER`

`PACKAGE 4 CROSS-PACKAGE GUARDS: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 349 SUITES / 2860 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B21 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b20-deployed-final-recheck.json`.
