# Package 5 B19 deployed remediation and fresh Final Gate STOP

Status: **B19 production remediation PASS; Package 5 Final Adversarial
Verification FAIL at new B20 cabinet identity/PII/read-mutation bypass**.

Accepted checkpoint: `dd70c09b`.

Runtime commits:

- `0eb193b14ba017605e7409906c2b6b11bd65d988`;
- `e674b7433323f3377fd98f81c60ed4c735ce3598`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b19-e674b743`.

No schema or migration was added. Production has 78 repository migrations and
81 accepted migration records. Pending migrations are `0`; an independent
Prisma comparison reports `No difference detected`.

## B19 production result

The two published chat entry points now share one authority and execution
boundary:

`authenticated channel/session -> verified active ClientChannelLink -> exact
tenant-qualified Client -> canonical appointment command -> Action Engine ->
canonical provider executor`.

The active `/api/chat` and `/api/chat/stream` paths preserve the original
authenticated request proof outside model-controlled inputs. The canonical
Client, name, phone and privacy authority are resolved server-side. A missing,
revoked, ambiguous or cross-tenant binding fails closed. A Client without a
Maya User remains supported through an exact active CRM Client link.

The three reconstructed legacy mutation-capable sites are closed 3/3:

1. the active post-command `database.save_booking` cache/fact write is retired;
2. the pre-command legacy loyalty backfill branch is removed;
3. the post-command legacy loyalty redemption branch is removed.

Chat is an initiator only. `ActionExecution` and the canonical appointment
executor own the durable outcome. Retry identity is deterministic. The
authorization callback re-resolves the same verified channel evidence
immediately before provider dispatch. `UNKNOWN` remains non-terminal, cannot
be translated into failure and cannot trigger a blind retry or legacy
fallback. Normal and streaming chat have identical authority and mutation
ownership.

Production verification was structural/read-only. No real Client,
appointment, provider, booking-cache or loyalty mutation was performed for
smoke proof.

## Proof and deployment

- B19 flow/write-site inventory: PASS — 3/3;
- targeted B19 TypeScript proof: PASS — 2 suites / 11 tests;
- targeted B19 Python and active guard proof: PASS — 34 tests;
- legacy bridge and B18 preservation proof: PASS — 18 tests;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 347 suites / 2850 tests;
- active Package 4 cross-package guard: PASS;
- active Package 5 B13–B19 runtime guard: PASS;
- backend candidate startup and production health/readiness: PASS;
- production pending migrations: `0`;
- production schema drift: `NONE`;
- backend and PWA error-priority logs after successful activation: `0`;
- candidate port 3199 after deployment: closed;
- real production business/provider/value mutations used for proof: `0`.

The first PWA candidate used the repository webhook snapshot and omitted the
already-active request-only launcher parameter `start_background_tasks`. Its
readiness check failed and the exact B18 PWA files were restored; health
returned to green. The corrected candidate was assembled from the exact active
B18 webhook plus only the reviewed B19 diff. It preserved the launcher
contract, passed both guards and then deployed successfully. No unrelated
working-tree changes were deployed, and no business mutation occurred during
the failed activation or rollback.

Exact deployed B19 artifact hashes:

- backend Client channel runtime JS:
  `b1b2b97ccbd1e211356ff95a1fcd5a8a505fbb2c25e097e6a6a85254b88cbeac`;
- backend Client channel controller JS:
  `4f9eefef94937a957a2684852aa9ee63db80b442baaaa5e7afc68bc75d9ffa24`;
- backend CRM service JS:
  `09459e8d5624ca497fc16b9776f6a81ba96e62f2d78b7a233df14ee0143852a9`;
- active webhook:
  `91074718709d9d88dcf2064ea1a61d66950590c0d5097c09cce00dbd379a89ec`;
- active Client command bridge:
  `c8157dce73b11b3721d3539cc3ab3c823f587cd069301f7a1577bae9ee59f274`;
- active Package 5 guard:
  `7c4d82873fcb1adc12198ec30c02c6933f9402fc8b0c735b6752f4eefb87cf04`;
- published proxy:
  `1538ccf4aef8467a6af3ad4dab4ec17b0ea525d1334087464ef49f9d6043211e`;
- published application:
  `fe804992306c50d5e8544a48d59d496c75664dd0af542b13b0e1f7810e59ebc7`.

## Fresh Package 5 Final Gate inventory

After B19 structural verification, the Final Gate restarted from the
beginning. It registered all 13 family foundations and inspected the exact
deployed backend release, 537 production TypeScript files, 218 HTTP
decorators, 502 mutation-like calls, 89 active-root Python files, 69 non-test
Python files, 94 non-OPTIONS Python HTTP routes, 93 distinct handlers, the
request-only PWA launcher, the published proxy/application, active AI tools,
journal/history and background/event paths, identity/PII/read/provider/value
boundaries and Package 4 cross-package guards.

B19 passed its 3/3 write-site and chat/stream parity scan. The inventory then
stopped at the first new production-reachable blocker, B20. Final aggregate
certification was not started after that finding.

## B20 / A18 — cabinet projection trusts raw chat identity and mutates on read

Three published production paths reach the same legacy projection helper:

- `GET /api/cabinet/me`;
- `POST /api/cabinet/me-via-login`;
- `POST /api/cabinet/me-via-session`.

The public proxy exposes them as `cabinet_me`, `cabinet_me_login` and
`cabinet_session` at lines 877, 949 and 667. The active PWA registers the three
backend routes at lines 12733, 12748 and 12764.

All three reduce Telegram/Login/session identity to a raw `chat_id` and call
`_build_full_cabinet`. That helper:

1. selects a legacy SQLite Client with `database.get_client(chat_id)` at line
   2226;
2. treats the legacy `has_valid_consent_by_chat_id` row as the gate at line
   2240 instead of requiring a verified active `ClientChannelLink`;
3. uses the selected Client's full phone for YClients lookup and returns full
   `booking_phone`, Client name/note, appointment history, loyalty,
   subscription and referral projections;
4. calls the legacy loyalty backfill entry point at line 2257 (the current
   legacy function is tombstoned and fails closed, so this call produced no
   value mutation);
5. actively writes `database.set_client_history_cache` at line 2357 during the
   read projection;
6. calls the legacy referral get-or-create entry point at line 2383 (new
   issuance is currently tombstoned, so this call produced no new referral
   fact).

The active `_build_full_cabinet` function spans lines 2220–2458 and has
SHA-256
`f381e4c0bc1b04671e65675bd59ce9ba216361ab15f48e4a49726d34880fdac6`.
It contains no `ClientChannelLink` verification and no tenant-qualified
canonical Client resolution. A valid channel signature, legacy web session or
legacy consent row is not Client authority. The projection therefore exposes
Client PII/state through an unapproved identity fallback, and the nominal read
surface has an active legacy cache mutation.

This is outside B15's accepted `/api/chat/history` remediation and B16's
accepted `/api/booking/prefill` remediation. Those baselines remain closed.
B20 requires its own owner/contract reconstruction for cabinet projection
identity, permitted PII, canonical read models and removal of read-time legacy
writes. No B20 remediation was attempted after the Final Gate finding.

## Verdict

`B19 PRODUCTION REMEDIATION: PASS`

`B19 VERIFIED ClientChannelLink REQUIRED: YES`

`B19 RAW chat_id CLIENT AUTHORITY: 0`

`B19 LEGACY BOOKING FACT WRITERS: 0`

`B19 CHAT DIRECT LOYALTY MUTATIONS: 0`

`B19 CHAT BOOKING LEGACY WRITE SITES: 0 — COVERAGE 3/3`

`B19 CHAT/STREAM AUTHORITY PARITY: ENFORCED`

`B19 CHAT/STREAM MUTATION OWNER PARITY: ENFORCED`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B20 / A18 — CABINET RAW chat_id CLIENT/PII AUTHORITY AND READ-SURFACE LEGACY WRITE`

`B20 VERIFIED ClientChannelLink REQUIRED: NO`

`B20 LEGACY chat_id/SESSION CLIENT AUTHORITY: PRESENT`

`B20 UNVERIFIED CLIENT PII PROJECTION: PRESENT`

`B20 READ-SURFACE LEGACY WRITERS: PRESENT — client history cache`

`PRODUCTION DIRECT BUSINESS/PROVIDER/VALUE MUTATION BYPASSES: PRESENT — B20 read/projection path`

`LEGACY IDENTITY FALLBACKS: PRESENT — B20`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT — B20 read-time legacy cache writer`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B20 BLOCKER`

`PACKAGE 4 AUTOMATED CROSS-PACKAGE GUARD: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 347 SUITES / 2850 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B20 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b19-deployed-final-recheck.json`.
