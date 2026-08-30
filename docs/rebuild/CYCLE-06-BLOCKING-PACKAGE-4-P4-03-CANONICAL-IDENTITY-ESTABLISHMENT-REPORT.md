# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CANONICAL IDENTITY ESTABLISHMENT REPORT

Status: **BLOCKED AT DRY-RUN — requested 24-row scope cannot produce 25/25 canonical Client mappings**

Source checkpoint: `2deccf4a`

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

## 7. Verdict

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
