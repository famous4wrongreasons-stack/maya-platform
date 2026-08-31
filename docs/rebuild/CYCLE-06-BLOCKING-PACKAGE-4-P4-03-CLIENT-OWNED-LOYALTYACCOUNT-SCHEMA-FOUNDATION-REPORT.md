# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CLIENT-OWNED LOYALTYACCOUNT SCHEMA FOUNDATION REPORT

Status: **SCHEMA FOUNDATION COMPLETE; PRODUCTION MIGRATION NOT APPLIED**

Source checkpoint: `6d8d1510`

Report date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This step implements only the minimal schema foundation approved by the Guest
Client Loyalty Value Ownership Gate. It makes `tenantId + Client.id`
representable as the canonical LoyaltyAccount owner without manufacturing a
User, Membership, or AuthIdentity for a guest.

No LoyaltyAccount was created in production. No existing account was bound,
no ledger row was migrated, no balance was changed, and no P4-03 runtime path
was modified. P02/P03 remain excluded by their live unresolved-identity hold.

## 2. Implemented schema contract

Migration:
`prisma/migrations/20260831130000_client_owned_loyalty_account/migration.sql`.

The migration performs only the approved transition:

- adds nullable `LoyaltyAccount.clientId` for historical compatibility;
- makes `userId` nullable so a guest Client does not require a fake user;
- adds the tenant-qualified composite FK
  `(clientId, tenantId) -> Client(id, tenantId)` with restrict semantics;
- adds the unique `(tenantId, clientId)` key, so a non-null Client binding can
  own at most one account;
- changes optional User deletion to `SET NULL` and retains the optional
  Membership boundary with restrict semantics;
- adds an immutable binding trigger that permits the one transitional
  `NULL -> exact Client` assignment, then rejects clear, replacement, or
  tenant move;
- preserves the existing `(userId, tenantId)` compatibility key;
- preserves `balance Int @default(0)` and every existing ledger relation.

PostgreSQL treats null values in the tenant/client unique key as distinct, so
historical unbound rows remain compatible while every established non-null
binding is one-to-one. The migration contains no `INSERT`, data `UPDATE`,
`DELETE`, backfill, balance rewrite, or generic value workflow.

## 3. PostgreSQL structural proof

The complete repository history was replayed sequentially into one disposable
local PostgreSQL database. All `63/63` migrations applied successfully.

| Invariant | Result |
| --- | --- |
| Guest Client owns account without `userId` | PASS |
| New guest account defaults to balance `0` | PASS |
| Account creation emits no LoyaltyTransaction | PASS — `0` rows |
| Second account for the same tenant/Client | REJECTED by unique key |
| Cross-tenant Client binding | REJECTED by composite FK |
| Initial historical `NULL -> exact Client` binding | PASS |
| Clear established Client binding | REJECTED by immutable trigger |
| Replace established Client binding | REJECTED by immutable trigger |
| Move established binding to another tenant | REJECTED by immutable trigger |
| Existing user-owned control shape | COMPATIBLE |
| Exact control binding changes balance | NO — proof balance remained unchanged |
| Active unresolved hold creates Client/account | NO |
| Active unresolved hold creates ledger/value | NO |

The disposable database contained only synthetic non-production fixtures. It
was removed immediately after the proof.

## 4. Verification

| Check | Result |
| --- | --- |
| Targeted schema ratchet | PASS — `1` suite / `6` tests |
| Targeted ESLint | PASS |
| Prisma validate | PASS |
| Clean replay | PASS — `63/63` migrations |
| Migration status after replay | up to date |
| Schema drift after replay | NONE |
| `git diff --check` | PASS |
| Temporary databases created / removed | `2 / 2` |
| Temporary databases remaining | `0` |

The full backend suite, build, production migration, runtime proof, and P4-03
cutover were intentionally not run. They are outside this schema-only step.

## 5. Safety boundary

- Production migration applied: **NO**.
- Production account writes: **0**.
- Production identity writes: **0**.
- Loyalty ledger rows migrated: **0**.
- Loyalty balance mutations: **0**.
- Provider writes: **0**.
- P02/P03 accounts created: **0**.
- Runtime P4-03 changed: **NO**.
- Package 5 and Chapter 7 started: **NO**.

The existing control account remains unbound and unchanged until a separately
approved production data step. The 22 guest accounts were not established in
this step. The safe FULL_LEDGER migration remains blocked until schema apply,
exact account establishment, and a renewed migration Gate.

## 6. Process hygiene

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

All validation commands ran in the foreground and exited before the next
command. No server, watcher, browser, worker, or background test process was
started.

## 7. Verdict

`CLIENT-OWNED LOYALTYACCOUNT DURABLE: YES`

`GUEST ACCOUNT WITHOUT USER SUPPORTED: YES`

`UNIQUE ACCOUNT PER TENANT/CLIENT: YES`

`CROSS-TENANT ACCOUNT BINDING POSSIBLE: NO`

`ACCOUNT CREATION CHANGES VALUE: NO`

`CONTROL ACCOUNT COMPATIBLE: YES`

`PRODUCTION MIGRATION APPLIED: NO`

`READY FOR LOYALTYACCOUNT PRODUCTION MIGRATION GATE: YES`

STOP. Production migration, account establishment, FULL_LEDGER migration,
runtime changes, and P4-03 cutover require separate explicit authorization.
