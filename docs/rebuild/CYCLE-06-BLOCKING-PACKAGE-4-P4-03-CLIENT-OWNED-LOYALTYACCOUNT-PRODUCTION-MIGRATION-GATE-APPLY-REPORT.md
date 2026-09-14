# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CLIENT-OWNED LOYALTYACCOUNT PRODUCTION MIGRATION GATE/APPLY REPORT

Status: **PASS — ONE APPROVED SCHEMA MIGRATION APPLIED; ACCOUNT ESTABLISHMENT REMAINS BLOCKED BY RUNTIME NULLABILITY ALIGNMENT**

Source checkpoint: `b4bc202a`

Apply date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and safety boundary

This step gated and applied only:

`20260831130000_client_owned_loyalty_account`

SHA-256:

`0349bacd34142ce231361f07a21fd7311c5a0d3ecabce37341bbabfcf8ae7b7e`

It did not create a guest LoyaltyAccount, bind the existing control account,
migrate FULL_LEDGER, modify a loyalty balance or transaction, change the live
P02/P03 hold, activate P4-03 runtime, switch the production release, restart
the service, or start Package 5 or Chapter 7.

## 2. Production preflight

All checks ran sequentially before the production schema write.

| Check | Result |
| --- | --- |
| Local HEAD | `b4bc202a0278d459e6d5f36ef5af5f3d7ab0c0f1` |
| Origin branch | same commit |
| Unpushed commits | `0` |
| Local migration directories | `63` |
| Active production release migrations | `62` |
| Successful production journal rows before apply | `65` |
| Incomplete production migrations | `0` |
| Approved migration checksum | exact committed checksum above |
| Pending set from inactive schema release | exactly `1` — approved migration |
| Current active-schema drift before apply | NONE |
| Production DB readiness | PASS |
| Non-idle / idle-in-transaction sessions | `0 / 0` |
| Existing LoyaltyAccounts | `1` |
| Aggregate existing account balance | `0` |
| Existing canonical LoyaltyTransactions | `0` |
| Canonical Clients / CrmClientLinks | `23 / 23` |
| Active unresolved identity holds | `1` |
| Service / health / readiness | active / HTTP `200 / 200` |

The inactive schema-only release was prepared at:

`/opt/maya-saas/releases/20260831-c06-p4-p403-client-owned-loyalty-schema-b4bc202a`

It contained exactly 63 migrations, matched the approved checksum, generated
the new Prisma Client, passed Prisma validation, and passed the project release
preflight with exactly one pending migration.

## 3. Structural production clone

A production schema-only dump and the non-business Prisma migration journal
were streamed into one disposable local PostgreSQL database. Production
business rows and PII copied to the clone: `0`.

The four acknowledged historical journal rows were excluded only from the
disposable clone, leaving the exact 62 repository migrations already applied
in production. Production migration history was not modified.

A synthetic control-shaped account with a non-zero sentinel balance proved
historical compatibility without copying production identity data. The clone
then applied exactly the approved migration.

| Clone check | Result |
| --- | --- |
| Pending migration applied | exactly the approved migration |
| Historical control-shaped account | preserved |
| Sentinel balance through migration | unchanged |
| Initial `NULL -> exact Client` binding | PASS; balance unchanged |
| Guest account without User | PASS |
| New guest account balance | `0` |
| Account creation ledger rows | `0` |
| Second account for same tenant/Client | REJECTED |
| Cross-tenant Client binding | REJECTED |
| Established binding clear | REJECTED |
| Established binding replacement | REJECTED |
| Tenant-qualified Client FK | present |
| Unique `(tenantId, clientId)` | present |
| Immutable binding trigger | present |
| Active unresolved hold | preserved |
| Resulting Prisma drift | NONE |
| Temporary clone databases remaining | `0` |

## 4. Production apply

Immediately before the write, the inactive release repeated the strict
checksum/pending preflight and a read-only data snapshot. The snapshot still
matched exactly:

- account rows `1`;
- aggregate balance `0`;
- canonical ledger rows `0`;
- canonical Clients/links `23 / 23`;
- active unresolved holds `1`;
- target migration rows `0`;
- incomplete migrations and active competing sessions `0`.

The standard project `prisma migrate deploy` mechanism, with bounded lock and
statement timeouts, applied only
`20260831130000_client_owned_loyalty_account`.

Prisma concluded:

`All migrations have been successfully applied.`

No manual production SQL change accompanied the migration. The active runtime
release remained:

`20260831-c06-p4-p403-identity-hold-guard-bdcd0aec`

No symlink switch or service restart occurred.

## 5. Production post-apply verification

| Check | Result |
| --- | --- |
| Strict schema-release preflight | PASS — database ready |
| Successful production journal rows after apply | `66` |
| Pending migrations | `0` |
| Incomplete migrations | `0` |
| Applied migration checksum | exact committed checksum |
| Post-apply Prisma drift | NONE |
| Historical LoyaltyAccounts | `1 -> 1`, preserved |
| Aggregate balances | `0 -> 0`, unchanged |
| Accounts with Client binding | `0` |
| New LoyaltyAccounts | `0` |
| Canonical LoyaltyTransactions | `0` |
| Canonical Clients / CrmClientLinks | `23 / 23`, unchanged |
| Active P02/P03 hold | `1`, still active |
| Client FK / unique key / immutable trigger | present / present / present |
| Non-idle / idle-in-transaction sessions | `0 / 0` |
| Service state | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Priority service errors in ten-minute observation | `0` |

The failed first log-only observation used a timestamp form unsupported by the
server's `journalctl`; it occurred after the migration and all database checks.
The read-only log verification was repeated with a relative window and passed.
The migration was not replayed.

## 6. Account-establishment runtime blocker

An additional local build check generated the Prisma Client from the approved
nullable-owner schema and found five compile errors in existing P4-03 runtime
code:

- grant issue Shadow still assumes `account.membership` is non-null;
- grant consume Shadow still assumes `account.membership` is non-null;
- three loyalty adjustment comparisons still type `account.userId` as always
  non-null.

No runtime code was changed in this schema-only step. This does not make the
applied schema unsafe for the currently active runtime because:

- no guest account was created;
- the single historical account still has its User/Membership;
- the control account remains unbound;
- the active runtime artifact was not rebuilt or switched.

It does prevent the next guest-account establishment step from being declared
ready. Before creating the 22 guest accounts, a separately approved minimal
runtime alignment must make Client ownership explicit and fail closed where a
requester Membership is genuinely required.

## 7. Safety boundary

- Production schema migrations applied: **1**.
- Production LoyaltyAccounts created: **0**.
- Production control bindings written: **0**.
- Production balance mutations: **0**.
- Production ledger mutations: **0**.
- Production identity writes: **0**.
- Production provider writes: **0**.
- P02/P03 hold changes: **0**.
- FULL_LEDGER migration started: **NO**.
- P4-03 cutover started: **NO**.
- Package 5 / Chapter 7 started: **NO / NO**.

## 8. Process hygiene

One bounded SSH installation/preflight command exceeded its initial tool-yield
window. Its owned session `50239` was recorded, waited to normal completion,
and closed before the production apply began. No broad process termination was
used.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 1`

`TEMP DATABASES REMAINING: 0`

## 9. Verdict

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HISTORICAL LOYALTY ACCOUNTS PRESERVED: YES`

`EXISTING BALANCES CHANGED: NO`

`NEW LOYALTY ACCOUNTS CREATED: 0`

`LOYALTY LEDGER MUTATIONS: 0`

`P02/P03 HOLD STILL ACTIVE: YES`

`PRODUCTION HEALTH/READINESS: PASS`

`READY FOR LOYALTYACCOUNT ESTABLISHMENT: NO — RUNTIME NULLABILITY ALIGNMENT REQUIRED`

STOP. Guest-account establishment, control binding, FULL_LEDGER migration,
P4-03 runtime changes, and cutover require separate explicit authorization.
