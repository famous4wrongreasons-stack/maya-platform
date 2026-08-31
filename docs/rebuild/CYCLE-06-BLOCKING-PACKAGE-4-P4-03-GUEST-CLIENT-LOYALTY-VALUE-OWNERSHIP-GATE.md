# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 GUEST CLIENT LOYALTY VALUE OWNERSHIP GATE

Status: **CONTRACT DECIDED — CLIENT IS THE CANONICAL OWNER; MINIMAL SCHEMA CHANGE REQUIRED**

Source checkpoint: `5f0c63f1`

Date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and safety boundary

This Gate performed only code/schema review and an aggregate read-only
production inventory. It did not create or modify a LoyaltyAccount, Client,
CrmClientLink, User, Membership, AuthIdentity, loyalty transaction, hold,
ActionExecution, grant, redemption, provider record, or legacy ledger row.

No schema, migration, runtime resolver, executor, or deployment was changed.
P4-03 cutover, Package 5, and Chapter 7 were not started. No raw personal or
provider identity is included in this report.

## 2. Current ownership semantics

The current `LoyaltyAccount` is auth-account-owned, not business-client-owned:

- `tenantId` is required and references Tenant;
- `userId` is required and references User;
- the composite Membership relation on `(userId, tenantId)` is required;
- `(userId, tenantId)` is unique, so one Maya User has at most one account in
  one tenant;
- no `clientId` column or relation exists;
- there is no `(tenantId, clientId)` uniqueness or tenant-qualified Client FK;
- `balance` defaults to `0`.

The live PostgreSQL catalog confirms `tenantId` and `userId` are both `NOT
NULL`, the user/tenant unique index exists, and no client/tenant account index
exists.

Consequently, the current schema cannot represent loyalty value for a guest
Client without manufacturing a User and Membership.

## 3. Runtime assumptions tied to User

The same historical ownership axis is embedded in current runtime code:

- `LoyaltyService.getForUser`, transaction listing, external/legacy cache,
  and internal adjustments find or upsert by `userId_tenantId`;
- the P4-03 executable `resolveAccount` rejects a Client without `userId` and
  upserts the account by `userId_tenantId`;
- grant consume rejects `grant.client.userId = NULL` and then finds the
  account by that user;
- earn/import/backfill/expiry/redeem/refund/grant Shadow plans treat a guest
  Client as `identity_unresolved` even when its Client and provider link are
  exact.

Requester authority and target ownership must remain separate. An actor or
approver may still require a User/Membership, but the customer whose business
value changes does not become an application user merely because an action
targets them.

No runtime path is changed by this Gate.

## 4. Desired canonical ownership invariant

The canonical loyalty value owner is:

```text
tenantId + Client.id
```

`Client` is the tenant-qualified business identity. `User` is an optional
application-access association on that Client, not the identity that creates
the customer's salon loyalty value.

This directly matches the approved Chapter 2 model:

- Client exists for a salon guest without a Maya account;
- Client survives changes in phone, CRM card, and login availability;
- CrmClientLink binds external provider identities to that Client;
- `Client.userId` is explicitly optional;
- tenant-qualified Client relations prevent cross-tenant ownership.

Therefore a guest Client can canonically own loyalty value without any fake
AuthIdentity, User, or Membership.

## 5. Existing control account

Production currently contains one LoyaltyAccount with balance `0` and zero
LoyaltyTransaction rows. It resolves because its required `userId` belongs to
the one active account-bound control Client in the same tenant.

The match is exact:

- exactly one account-bound Client exists;
- exactly one LoyaltyAccount exists;
- `LoyaltyAccount.userId = Client.userId` under the same tenant;
- the Client is unmerged and has its exact active provider link;
- there is no second candidate Client or account.

The row itself is legitimate; the user-owned key is an auth-centric historical
architecture choice. It is not evidence that all business clients need a Maya
login.

After the proposed schema foundation, a separately approved binding step can
attach this same row to the exact control Client. It must not create a second
account, change its zero balance, or rewrite its history. Nothing was bound or
changed in this Gate.

## 6. Production eligibility of the 22 guests

The read-only inventory returned:

| Eligibility fact | Result |
| --- | ---: |
| Canonical Clients | `23` |
| Account-bound control Clients | `1` |
| Guest Clients with `userId = NULL` | `22` |
| Unmerged guest Clients | `22/22` |
| Exact active provider links for guests | `22/22` |
| Guest provider identities under active hold | `0` |
| Cross-tenant link violations | `0` |
| Existing LoyaltyAccounts | `1` |
| Existing LoyaltyTransaction rows | `0` |
| P02/P03 active holds / principals | `1 / 2` |
| P02/P03 canonical links | `0` |

All 22 guest Clients are exact and independently account-eligible once the
schema supports Client ownership. No fuzzy identity, phone inference, merge,
or account principal is required.

P02/P03 remain ineligible: they have no canonical Client or CrmClientLink and
their shared provider identity remains under the active unresolved hold.

## 7. Minimal schema decision

The existing schema is insufficient. The minimal end-state change is to
modify `LoyaltyAccount`, not create a second loyalty system:

```prisma
model LoyaltyAccount {
  id       String @id @default(cuid())
  tenantId String
  clientId String
  userId   String?

  balance  Int @default(0)
  // existing source/externalReference/syncedAt/timestamps remain unchanged

  tenant     Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client     Client  @relation(fields: [clientId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)
  user       User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  membership Membership? @relation("LoyaltyAccountMembership", fields: [userId, tenantId], references: [userId, tenantId], onDelete: Restrict, onUpdate: Restrict)

  @@unique([id, tenantId])
  @@unique([tenantId, clientId])
  // existing user uniqueness may remain during compatibility cutover
}
```

Required database invariants:

1. `(clientId, tenantId)` references `Client(id, tenantId)`;
2. `(tenantId, clientId)` is unique: one account per business Client;
3. `userId` is nullable and never synthesized for a guest;
4. once set, `clientId` cannot be cleared or replaced; the one transitional
   `NULL -> exact Client` binding is allowed only for the historical control;
5. Client deletion, merge, or rebinding cannot silently delete or move loyalty
   history;
6. an account starts at `balance = 0` and creation emits no transaction;
7. account establishment converges through the database unique key;
8. production creation requires an unmerged canonical Client and no active
   unresolved provider-identity hold;
9. P02/P03 cannot obtain an account while their hold is active and no Client
   exists;
10. `LoyaltyTransaction` and its historical nullable `actionExecutionId`
   contract do not change.

## 8. Historical compatibility and staging

A single destructive rewrite is not justified. The schema/data transition
must be staged and separately approved:

1. add nullable `clientId`, its tenant-qualified FK, lookup, unique key, and
   an owner-binding trigger that permits only the initial `NULL -> value`
   transition;
2. relax `userId`/User/Membership to optional without deleting the existing
   user association;
3. bind the one existing control account to its exact Client in a separately
   verified data step, with balance and ledger unchanged;
4. prove every account has a Client owner, then make `clientId` required;
5. establish 22 empty guest accounts idempotently by
   `(tenantId, clientId)`;
6. only afterward rerun the 118-row FULL_LEDGER Gate;
7. switch runtime lookups in a separate cutover from user-owned to
   Client-owned resolution.

During transition, the existing `(userId, tenantId)` uniqueness can remain for
compatibility with old user-facing paths. It is not the canonical ownership
key and must not be used by new Client-owned paths. Whether it is later
replaced by a non-unique lookup belongs to runtime/account-access cutover, not
this minimal schema foundation.

No existing row receives a guessed Client. Production currently has one exact
control binding, but this Gate does not perform it.

## 9. Account establishment and opening state

After schema and exact control binding are separately approved, the account
establishment contract is:

```text
exact unmerged tenant Client
  -> no active unresolved identity hold
  -> INSERT/CONVERGE LoyaltyAccount(tenantId, clientId, userId?, balance=0)
```

For the 22 guests:

- `userId = NULL`;
- initial `balance = 0`;
- no LoyaltyTransaction row;
- no ActionExecution;
- no provider write;
- no portion of the 64,221 points is added during establishment.

The historical 107 rows / 64,221 points arrive only through a later approved
FULL_LEDGER migration. A repeated establishment resolves the same account by
the DB unique key and creates no duplicate.

## 10. Required resolver direction after establishment

The canonical target resolver must eventually use:

```text
tenant + provider identity
  -> CrmClientLink
  -> unmerged Client
  -> LoyaltyAccount by (tenantId, clientId)
```

It must not require `Client.userId` merely to find the target account.
Authenticated User/Membership remains relevant to requester policy, approval,
and user-facing access, but not to ownership of the customer's value.

User-facing `getForUser` paths must first resolve an exact Client rather than
blindly replacing their current lookup with a non-unique user query. Grant
consume and all eight P4-03 actions must resolve the account from their exact
canonical Client. These runtime changes are explicitly outside this Gate.

## 11. Rejected alternatives

The following are not acceptable:

- fabricate 22 Users, Memberships, or AuthIdentities;
- attach guest value to the owner/admin User;
- use phone, Telegram id, legacy SQLite id, or provider card as the account
  owner;
- create a parallel `GuestLoyaltyAccount` table;
- duplicate the existing control account;
- give P02/P03 a shared or guessed account;
- seed 64,221 points during account creation;
- combine schema, account establishment, FULL_LEDGER migration, and runtime
  cutover into one step.

## 12. Process hygiene

All inspection commands ran sequentially. The only production helper was one
bounded foreground read-only database process; it completed and was waited.
No browser, Playwright, watcher, background server, or temporary database was
started.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 13. Verdict

`GUEST CLIENT CAN OWN LOYALTY VALUE: YES`

`CANONICAL OWNER: CLIENT`

`EXISTING LOYALTYACCOUNT SCHEMA SUFFICIENT: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

`22 GUEST CLIENTS EXACTLY ACCOUNT-ELIGIBLE: YES`

`P02/P03 ACCOUNT CREATION ALLOWED: NO`

`FAKE USER PRINCIPALS REQUIRED: NO`

`LOYALTY VALUE MUTATIONS: 0`

`PRODUCTION ACCOUNT WRITES: 0`

`READY FOR LOYALTY ACCOUNT ESTABLISHMENT: NO — SCHEMA FOUNDATION REQUIRED`

`READY FOR FULL_LEDGER MIGRATION: NO`

`P4-03 RUNTIME CHANGED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The next separately approved step is the minimal Client-owned
LoyaltyAccount schema foundation; it was not started.
