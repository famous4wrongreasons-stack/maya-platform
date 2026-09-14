# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CANONICAL IDENTITY ESTABLISHMENT REPORT

Status: **PASS — 23 SAFE PRINCIPALS ESTABLISHED; P02/P03 REMAIN UNDER LIVE HOLD**

Source checkpoint: `65678ff6`

Report date: 2026-08-30

## 1. Scope and stop condition

This step began with a read-only deterministic dry-run, as required. It did
not proceed to production identity writes because the dry-run found a mismatch
between the requested apply cardinality and the accepted Chapter 2 identity
contract.

No `Client`, `CrmClientLink`, `User`, `Membership`, `AuthIdentity`, loyalty,
grant, redemption, provider, or balance row was created or changed. No raw
personal identifier is included in this report.

The accepted Identity Continuity Gate remains valid:

- 25/25 source principals have one exact provider-card identity;
- one principal has an exact active canonical Telegram account principal;
- 24 principals have no accepted canonical account principal;
- no provider-card mapping is ambiguous or unresolvable;
- no new identity schema is required.

## 2. Current production state

A fresh read-only pre-apply inventory returned:

| Fact | Current value |
|---|---:|
| Legacy principals in ledger/code scope | 25 |
| Legacy ledger rows | 121 |
| Legacy total points | 64,801 |
| Active canonical CRM integrations | 1 |
| Canonical `Client` rows | 0 |
| Canonical `Client` rows with `userId` | 0 |
| Canonical `CrmClientLink` rows | 0 |
| Active canonical Telegram principals | 1 |
| Active Telegram principals with a `LoyaltyAccount` | 1 |
| Canonical loyalty transactions | 0 |
| Canonical grants / redemptions | 0 / 0 |

The source ledger and canonical value tables are unchanged from the accepted
Gates.

## 3. Deterministic dry-run plan

The dry-run used the accepted complete provider snapshot and the exact Chapter
2 keys only:

```text
legacy source principal
  -> exact provider + external company id
  -> exact active CrmIntegration
  -> tenantId
  -> exact provider client id
  -> CrmClientLink(tenantId, provider, externalId)
  -> Client
```

No name, fuzzy phone, balance, cross-tenant evidence, or loyalty-specific
identity rule participates in the plan.

| Plan group | Principals | Existing Client/link | Required Chapter 2 action |
|---|---:|---:|---|
| Exact control principal | 1 | 0 / 0 | register exact provider card and bind the already-proven `userId` |
| Exact provider identity, no account principal | 24 | 0 / 0 | register guest `Client(userId = NULL)` plus exact provider link |
| Ambiguous | 0 | — | fail closed |
| Unresolvable | 0 | — | fail closed |
| **Total registration calls required** | **25** | **0 / 0** | **25 Clients + 25 links** |

At the account-principal classification layer the requested numbers are still
true:

`EXISTING EXACT ACCOUNT PRINCIPAL: 1`

`WITHOUT CANONICAL ACCOUNT PRINCIPAL: 24`

`AMBIGUOUS: 0`

`UNRESOLVABLE: 0`

They are not the same as physical Chapter 2 registration cardinality. The one
existing account principal has no `Client` and no `CrmClientLink` today.

## 4. Why registering only 24 is unsafe

Canonical P4-03 runtime paths resolve a client through the unique
`(tenantId, provider, externalId) -> CrmClientLink -> Client` chain. An
`AuthIdentity` or `LoyaltyAccount` does not replace that provider link.

Applying exactly 24 registrations has only two possible outcomes:

1. exclude the control principal: 24 guest links exist, but the only
   account-bound principal remains unreachable through canonical provider
   identity;
2. include the control principal: one of the other exact provider principals
   remains without `Client + CrmClientLink`.

Either outcome yields at most 24/25 canonical Client mappings and violates the
required post-apply result:

`EXACTLY MAPPABLE AFTER ESTABLISHMENT: 25/25`.

Creating an unlinked shortcut from the legacy Telegram id or existing loyalty
account would be a loyalty-specific identity system and is forbidden by both
the Chapter 2 contract and this step.

## 5. Existing Chapter 2 path remains sufficient

No implementation or schema gap was found. The existing
`ClientIdentityService.registerCrmClient` path already provides:

- tenant-context enforcement;
- uniqueness of `(tenantId, provider, externalId)`;
- tenant-qualified foreign-key integrity;
- idempotent reuse of an existing link;
- concurrency-safe duplicate rejection;
- guest `Client` creation with `userId = NULL`;
- optional binding to an independently proven canonical `userId`.

The corrected apply contract would therefore be:

- one exact registration with the proven control `userId`;
- 24 exact guest registrations with `userId = NULL`;
- total new Clients: 25;
- total new CrmClientLinks: 25;
- a second dry-run: zero new Clients and zero new links.

That corrected cardinality is outside the explicit instruction to create
identities for exactly 24 principals, so it was not assumed or executed.

## 6. No-write verification

After the dry-run stopped, the production counts remained:

`CLIENT ROWS: 0`

`CRM CLIENT LINK ROWS: 0`

`LOYALTY TRANSACTIONS: 0`

`LOYALTY GRANTS: 0`

`LOYALTY REDEMPTIONS: 0`

The historical 800-point missing-refund fact was not changed. No provider API
write was made.

## 7. Prior dry-run verdict at `65678ff6` — superseded

`CANONICAL IDENTITIES ESTABLISHED: NO`

`LEGACY PRINCIPALS EXACTLY MAPPABLE: 1/25`

`NEW CLIENTS CREATED: 0`

`NEW CRM CLIENT LINKS CREATED: 0`

`AMBIGUOUS MAPPINGS: 0`

`CROSS-TENANT VIOLATIONS: 0`

`RE-RUN CREATES DUPLICATES: NOT TESTED — APPLY BLOCKED`

`LOYALTY VALUE MUTATIONS: 0`

`LOYALTY LEDGER MIGRATED: NO`

`LOYALTY BALANCE CHANGED: NO`

`GRANTS CREATED: 0`

`PROVIDER WRITES: 0`

`READY FOR FULL_LEDGER MIGRATION: NO`

`READY FOR P4-03 CUTOVER: NO`

STOP. Production identity establishment requires an amended authorization for
25 Chapter 2 registrations, not 24: one account-bound control registration and
24 guest registrations. No production write may occur until that exact scope
is accepted.

## 8. Authorized 25-scope pre-apply rerun

The owner accepted checkpoint `65678ff6` and explicitly authorized 25 Chapter
2 registrations: one account-bound control and 24 guests. That authorization
closed the earlier cardinality blocker, so the required dry-run was repeated
immediately before any transaction.

The rerun loaded all 29 provider-registry pages and required both:

1. exactly one provider-card result for each individual legacy source phone;
2. a one-to-one mapping across the complete 25-principal set, so one
   `(tenantId, provider, externalId)` could not silently represent two source
   principals.

The second invariant exposed a data collision that the earlier per-principal
classification did not detect:

| Required pre-apply fact | Required | Actual |
|---|---:|---:|
| Plan principals | 25 | 25 |
| Control with proven `userId` | 1 | 1 |
| Source principals without canonical `userId` | 24 | 24 |
| Individual source principals with no provider card | 0 | 0 |
| Cross-principal provider identity collisions | 0 | **1 group / 2 principals** |
| Unique provider external ids | 25 | **24** |
| Unresolvable source principals | 0 | 0 |

The bounded dry-run plan manifest was:

`f2f15d57497c42e6522d463312b5ce296bef068a342bde04573713c0c9bef67c`

No raw phone, provider id, Telegram id, name, or other personal identifier was
written to this report.

## 9. Collision classification

The collision is one exact legacy phone-key group containing report aliases
`P02` and `P03`. Both are guest principals; neither is the proven control.
Together they own three historical ledger rows and no legacy code row. The
complete provider snapshot resolves both source rows to the same provider
external client id.

This is not a missing provider result and not a fuzzy match. It is a canonical
cardinality conflict:

```text
P02 --\
       -> same (tenantId, yclients, externalId)
P03 --/
```

Chapter 2 intentionally enforces
`@@unique([tenantId, provider, externalId])`: one provider card may belong to
only one Maya `Client`. Creating two links would be rejected by the database.
Creating one Client for both source principals would be an implicit merge,
which the authorized scope explicitly forbids and which would erase the
distinction between their historical ledger ownership.

The safe pre-apply classification is therefore:

| Classification | Principals |
|---|---:|
| Exact singleton provider mapping, including control | 23 |
| Ambiguous because of shared canonical provider identity | 2 |
| Unresolvable | 0 |

No additional identity schema is justified by this finding. Resolution needs
new authoritative identity evidence or an explicit, separately proven merge
decision for `P02/P03`; it must not be guessed from phone, names, balances, or
ledger rows.

## 10. Apply decision and no-write proof

The explicit precondition `AMBIGUOUS: 0` was not met. Apply stopped before the
first call to `ClientIdentityService.registerCrmClient`.

The following forbidden alternatives were not attempted:

- create a 26th identity or duplicate provider link;
- register only the 23 singleton mappings as a partial apply;
- merge `P02` and `P03`;
- attach either source principal to the other's identity;
- create a guest `User` or change `AuthIdentity`;
- migrate or compensate loyalty value.

A post-stop read-only check remains the authority for unchanged production
state:

`CLIENT ROWS: 0`

`CRM CLIENT LINK ROWS: 0`

`LOYALTY TRANSACTIONS: 0`

`LOYALTY GRANTS: 0`

`LOYALTY REDEMPTIONS: 0`

`LEGACY LEDGER ROWS: 121`

`LEGACY TOTAL POINTS: 64801`

## 11. Final verdict

`CANONICAL IDENTITIES ESTABLISHED: NO`

`CLIENTS CREATED: 0/25`

`CRM CLIENT LINKS CREATED: 0/25`

`SAFE ONE-TO-ONE PROVIDER MAPPINGS IN PLAN: 23/25`

`LEGACY PRINCIPALS EXACTLY MAPPABLE AFTER ESTABLISHMENT: NOT ACHIEVED`

`AMBIGUOUS MAPPINGS: 2`

`PROVIDER IDENTITY COLLISION GROUPS: 1`

`UNRESOLVABLE MAPPINGS: 0`

`CROSS-TENANT VIOLATIONS: 0`

`RE-RUN CREATES DUPLICATES: NOT RUN — APPLY BLOCKED`

`LOYALTY VALUE MUTATIONS: 0`

`CANONICAL LOYALTY LEDGER MIGRATED: NO`

`LOYALTY BALANCE MUTATIONS: 0`

`GRANTS CREATED: 0`

`PROVIDER WRITES: 0`

`REFUND 800 CORRECTED: NO`

`READY FOR FULL_LEDGER MIGRATION: NO`

`READY FOR P4-03 CUTOVER: NO`

STOP. The 25-principal apply remains prohibited until the two-principal
provider-identity collision has authoritative resolution. No partial identity
establishment is permitted under this checkpoint.

## 12. Authorized safe-partition establishment at `0941a32a`

The owner accepted the durable P02/P03 continuity hold and explicitly
authorized Chapter 2 identity establishment for only the 23 exact singleton
provider mappings. The earlier all-25 apply remains correctly prohibited; this
step did not resolve, merge, register, link, or mutate either held principal.

Immediately before the first write, production source evidence was rebuilt
from the complete legacy principal set and a fresh complete provider registry
snapshot. Raw names, phones, Telegram identifiers, provider identifiers, and
other personal data were kept out of command output and this report.

| Pre-apply invariant | Required | Actual |
| --- | ---: | ---: |
| Legacy principals | `25` | `25` |
| Exact provider mappings | `25/25` | `25/25` |
| Unique provider identities | `24` | `24` |
| Live collision holds | `1` | `1` |
| Principals represented by live hold | `2` | `2` |
| Safe singleton principals | `23` | `23` |
| Collision groups inside safe set | `0` | `0` |
| Cross-tenant collisions | `0` | `0` |
| Safe provider identities under any unresolved hold | `0` | `0` |
| Exact active account-bound control in safe set | `1` | `1` |
| Safe guest principals without canonical account | `22` | `22` |
| Existing Client / CrmClientLink rows | `0 / 0` | `0 / 0` |

The live hold partition remained exactly `3 rows / 580 points`; the safe
partition remained exactly `118 rows / 64,221 points`. Together they still
reconciled to `121 rows / 64,801 points` before apply.

The non-PII plan manifest for this bounded run was:

`067bc1c65598dac2a73effb4950a2ba88021b836860a048576bae10661a771a3`

## 13. Canonical Chapter 2 apply

All 23 safe registrations ran sequentially through the deployed
`ClientIdentityService.registerCrmClient` under a tenant-qualified system
context. No loyalty-specific registration implementation or direct database
identity writer was introduced.

- the one exact control principal was bound to its independently proven active
  `AuthIdentity`/`Membership` user;
- the other 22 Clients were created as guests with `userId = NULL`;
- phone/profile data was not copied because the exact provider identity was
  sufficient;
- no merge, `AuthIdentity` update, guest User creation, ActionExecution, or
  provider mutation occurred;
- each registration rechecked the live hold inside the existing serializable
  Chapter 2 transaction before creating its Client and CrmClientLink.

| Apply result | Value |
| --- | ---: |
| New Client rows | `23` |
| New CrmClientLink rows | `23` |
| Control Clients with proven `userId` | `1` |
| Guest Clients with `userId = NULL` | `22/22` |
| P02/P03 links created | `0` |
| Ambiguous safe mappings | `0` |
| Duplicate provider links | `0` |
| Cross-tenant link violations | `0` |
| Active live holds after apply | `1` |

## 14. Post-apply and restart/idempotency proof

An independent production read verified `23 Client` rows and `23
CrmClientLink` rows, with exactly one account-bound Client and 22 guest
Clients. The live hold still had no matching CrmClientLink and still blocked
the collision identity.

A second read-only establishment plan used the same deployed hold guard and
the canonical `(tenantId, provider, externalId)` lookup for every safe
principal. It converged to:

`WOULD CREATE CLIENTS: 0`

`WOULD CREATE CRMCLIENTLINKS: 0`

No registration method was called during this rerun, so the idempotency proof
did not update `syncedAt` or perform any other production write.

The registration guard and owner ratchet were also rerun locally:

`TARGETED SUITES: 2/2`

`TARGETED ASSERTIONS: 21/21`

Production health/readiness remained `200/200`, and the bounded post-apply
service-log check found zero priority error entries.

## 15. Loyalty freeze and continuity

| Continuity fact | Post-apply result |
| --- | ---: |
| Legacy ledger | unchanged — `121 rows / 64,801 points` |
| Safe ledger partition | unchanged — `118 rows / 64,221 points` |
| Held P02/P03 partition | unchanged — `3 rows / 580 points` |
| Canonical LoyaltyTransaction rows | `0` |
| LoyaltyRedemptionGrant rows | `0` |
| LoyaltyRedemption rows | `0` |
| ActionExecution rows | unchanged — `509` |
| Loyalty value mutations | `0` |
| Grants created | `0` |
| Provider writes | `0` |
| Historical refund 800 correction | `NO` |

FULL_LEDGER migration and P4-03 production cutover were not started. The two
unresolved principals remain read-only under the live continuity hold.

## 16. Process hygiene

All helper commands ran sequentially and completed in the foreground. The
provider snapshot/apply orchestrator, its single database child, independent
database verification, health/legacy verification, and targeted test process
all exited and were waited. No watch mode, browser, Playwright, background
server, or temporary database was used.

`TEMP PROCESSES STARTED: 6`

`TEMP PROCESSES TERMINATED: 6`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 17. Final verdict at `0941a32a`

`SAFE CANONICAL IDENTITIES ESTABLISHED: YES`

`SAFE PRINCIPALS EXACTLY MAPPABLE AFTER ESTABLISHMENT: 23/23`

`NEW CLIENTS CREATED: 23`

`NEW CRMCLIENTLINKS CREATED: 23`

`P02/P03 CLIENTS CREATED: 0`

`P02/P03 CRMCLIENTLINKS CREATED: 0`

`UNRESOLVED PRINCIPALS REMAIN: 2`

`UNRESOLVED VALUE PRESERVED: 580`

`AMBIGUOUS SAFE MAPPINGS: 0`

`CROSS-TENANT VIOLATIONS: 0`

`DUPLICATE PROVIDER LINKS: 0`

`LIVE HOLD STILL ACTIVE: YES`

`RE-RUN CREATES DUPLICATES: NO`

`LOYALTY VALUE MUTATIONS: 0`

`READY FOR SAFE FULL_LEDGER MIGRATION: YES`

`READY FOR P4-03 CUTOVER: NO`

STOP. Safe FULL_LEDGER migration is the next separately authorized step; it
was not started. Package 5 and Chapter 7 were not started.
