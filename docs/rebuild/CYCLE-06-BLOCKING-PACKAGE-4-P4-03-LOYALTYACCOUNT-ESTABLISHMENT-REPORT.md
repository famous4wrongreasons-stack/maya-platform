# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 LOYALTYACCOUNT ESTABLISHMENT REPORT

Status: **PASS — 23 SAFE CLIENT-OWNED ACCOUNTS ESTABLISHED; SOURCE LEDGER MANIFEST MUST BE REFRESHED BEFORE FULL_LEDGER DRY-RUN**

Date: `2026-08-31`

Source code checkpoint: `94d587ca`

Resumed from blocked connectivity checkpoint: `f17e6127`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This step performed only the approved production account establishment:

- bind the one existing zero-balance control `LoyaltyAccount` to its exact
  canonical `Client`;
- create one empty, Client-owned `LoyaltyAccount` for each of the 22 exact
  guest Clients;
- preserve the live P02/P03 unresolved-identity hold;
- stop before any historical ledger migration or P4-03 runtime cutover.

It did not create a `Client`, `CrmClientLink`, fake User, Membership,
`LoyaltyTransaction`, grant, redemption, or `ActionExecution`. It did not call
the provider and did not correct the historical refund finding.

## 2. Connectivity recovery

The prior attempt stopped before preflight because both SSH and public HTTPS
were unreachable. On this resumed attempt SSH recovered intermittently. Every
failed connection process exited or was explicitly terminated before the next
attempt; no remote command from a timed-out connection ran.

The successful data operations used the production service environment and
the same PostgreSQL database as the active `maya-saas` unit. No secret or PII
was printed.

## 3. Immediate production preflight

A `SERIALIZABLE READ ONLY DEFERRABLE` PostgreSQL transaction rebuilt the
eligibility set immediately before apply.

| Required invariant | Required | Actual |
| --- | ---: | ---: |
| Safe active CRM links | `23` | `23` |
| Distinct safe Clients | `23` | `23` |
| Merged Clients in safe set | `0` | `0` |
| Exact control account/Client matches | `1` | `1` |
| Control balance | `0` | `0` |
| Guest Clients without account | `22` | `22` |
| Existing LoyaltyAccounts | `1` | `1` |
| Client-bound LoyaltyAccounts | `0` | `0` |
| Active unresolved holds | `1` | `1` |
| Principals represented by hold | `2` | `2` |
| CrmClientLinks for held provider identity | `0` | `0` |
| Duplicate `(tenantId, clientId)` accounts | `0` | `0` |
| Cross-tenant account bindings | `0` | `0` |
| Canonical LoyaltyTransactions | `0` | `0` |
| Grants / redemptions | `0 / 0` | `0 / 0` |

All mandatory account-establishment preconditions matched. The write gate was
therefore allowed to proceed.

## 4. Controlled production apply

One PostgreSQL `SERIALIZABLE` transaction:

1. acquired a transaction-scoped advisory lock for this establishment;
2. repeated the complete safe-set, hold, control-account, and value baseline
   checks inside the transaction;
3. locked the existing `LoyaltyAccount` row;
4. assigned its exact tenant-qualified `clientId` without changing balance,
   user, source, or history;
5. inserted exactly 22 guest accounts with `userId = NULL`, `source = internal`,
   and `balance = 0`;
6. proved every postcondition before `COMMIT`.

The new account identifiers are cryptographically random UUID strings. This is
valid because `LoyaltyAccount.id` is an opaque Prisma `String` primary key and
the database and application define no CUID-format invariant. No identity or
idempotency decision depends on the textual account-id format.

| Apply result | Value |
| --- | ---: |
| Control accounts linked | `1` |
| Guest accounts created | `22` |
| Control balance before / after | `0 / 0` |
| Guest aggregate opening balance | `0` |
| LoyaltyTransactions created | `0` |
| Grants created | `0` |
| Redemptions created | `0` |
| ActionExecutions created | `0` |

The account changes committed together at
`2026-08-31T14:59:21.944Z` (`17:59:21.944 MSK`).

## 5. Independent post-apply proof

An independent `SERIALIZABLE READ ONLY DEFERRABLE` transaction, started after
commit, returned:

| Postcondition | Result |
| --- | ---: |
| Safe Clients with LoyaltyAccount | `23/23` |
| Exact control account linked | `1/1` |
| Guest zero-balance accounts | `22/22` |
| Total LoyaltyAccounts | `23` |
| Aggregate canonical balance | `0` |
| P02/P03 held links | `0` |
| P02/P03 reachable accounts | `0` |
| Active hold / represented principals | `1 / 2` |
| Duplicate accounts | `0` |
| Cross-tenant conflicts | `0` |
| Canonical ledger / grants / redemptions | `0 / 0 / 0` |

The existing unique key and tenant-qualified foreign key remain the database
authority. The immutable-binding trigger now protects all 23 established
bindings from clear, replacement, or cross-tenant transfer.

## 6. Restart and idempotency proof

The post-commit rerun was plan-only and performed no writes:

`WOULD CREATE ACCOUNTS: 0`

`WOULD RELINK CONTROL ACCOUNT: NO`

It resolved all 23 safe Clients through their existing canonical CRM links and
found the already established account by `(tenantId, clientId)` every time.

## 7. Loyalty freeze and source-ledger drift

The production PostgreSQL proof shows that this step created no canonical
value fact and that the aggregate canonical balance remained zero.

The live legacy SQLite database was then read independently in URI read-only
mode. It currently contains:

`LEGACY LEDGER: 124 rows / 65,161 points`

This differs from the previously accepted immutable snapshot:

`PREVIOUS SNAPSHOT: 121 rows / 64,801 points`

The three additional source rows are ordinary legacy `earn` facts totaling
`+360` (`+160`, `+100`, `+100`) with source timestamps around `12:30 MSK`, more
than five hours before the account-establishment commit. No command in this
step opened legacy SQLite for writing; the legacy bot remained the current
execution owner because P4-03 cutover is explicitly not started.

Therefore:

- loyalty value mutations caused by this establishment: **0**;
- the old `121 / 64,801` source manifest is no longer current;
- the next safe FULL_LEDGER dry-run must first rebuild and reconcile its source
  manifest and partition classification from all 124 rows;
- no migration may silently assume that the three new rows belong to the old
  safe or hold partition.

The historical refund-800 finding remains unchanged and was not corrected.

## 8. Service verification

| Check | Result |
| --- | --- |
| Public health | `200` |
| Database-backed readiness | `200` |
| Priority service errors, last 30 minutes | `0` |
| Runtime deploy/restart | not performed |
| Provider writes | `0` |

## 9. Process hygiene

Twenty-three bounded operational helper process groups were started during
connectivity recovery, production reads/apply, health verification, and source
verification. One bounded reconnect loop exceeded its expected window and was
interrupted explicitly; all of its children terminated with it. Every other
helper exited in the foreground and was waited.

`TEMP PROCESSES STARTED: 23`

`TEMP PROCESSES TERMINATED: 23`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 10. Verdict

`LOYALTYACCOUNT ESTABLISHMENT COMPLETE: YES`

`SAFE ACCOUNTS RESOLVABLE: 23/23`

`CONTROL ACCOUNT LINKED: YES`

`CONTROL BALANCE CHANGED: NO`

`GUEST ACCOUNTS CREATED: 22/22`

`GUEST ACCOUNT INITIAL BALANCE: 0`

`P02/P03 ACCOUNTS CREATED: 0`

`P02/P03 HOLD PRESERVED: YES`

`DUPLICATE ACCOUNTS: 0`

`CROSS-TENANT VIOLATIONS: 0`

`RE-RUN CREATES DUPLICATES: NO`

`CANONICAL LEDGER MIGRATED: NO`

`LOYALTY VALUE MUTATIONS BY THIS STEP: 0`

`GRANTS CREATED: 0`

`PROVIDER WRITES: 0`

`REFUND 800 CORRECTED: NO`

`LEGACY SOURCE MANIFEST STILL 121/64801: NO — CURRENTLY 124/65161`

`READY TO RE-RUN SAFE FULL_LEDGER DRY-RUN: NO — SOURCE MANIFEST REFRESH REQUIRED`

`READY FOR P4-03 CUTOVER: NO`

STOP. FULL_LEDGER migration, P4-03 cutover, Package 5, and Chapter 7 were not
started.
