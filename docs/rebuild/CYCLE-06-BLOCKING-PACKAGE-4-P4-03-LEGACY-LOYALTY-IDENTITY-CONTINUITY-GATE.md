# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 LEGACY LOYALTY IDENTITY CONTINUITY GATE

Status: **CONTRACT COMPLETE — canonical Client identity can be established; loyalty migration remains blocked**

Source checkpoint: `aaa4bf5e`

Report date: 2026-08-30

## 1. Scope and safety boundary

This Gate performed only read-only analysis of the accepted P4-03 Production
Data Continuity evidence, the live legacy SQLite identity/ledger aggregates,
the live canonical PostgreSQL identity aggregates, and the existing Chapter 2
client-identity implementation.

It did not create or update `Client`, `CrmClientLink`, `User`, `Membership`,
`AuthIdentity`, `LoyaltyAccount`, or loyalty rows. It did not migrate the
ledger, correct the historical 800-point exception, resume P4-03 cutover, or
start another Package 4 family, Package 5, or Chapter 7.

No name, phone, Telegram id, provider client id, bearer code, or other raw
personal identifier is included below. `P01` through `P25` are report-local,
non-authoritative aliases assigned to the 25 source principals in stable
legacy-row order. They must never be used as migration identity.

The accepted 29-page provider snapshot and immutable 121-row ledger manifest
from the Production Data Continuity Gate remain the evidence source for exact
provider-card matches. A current read-only aggregate check reconfirmed:

| Source | Current read-only result |
|---|---:|
| Legacy ledger rows | 121 |
| Legacy principals in ledger/code scope | 25 |
| Legacy non-zero balances | 22 |
| Legacy total points | 64,801 |
| Legacy unconsumed code rows | 3 |
| Canonical `Client` rows | 0 |
| Canonical `CrmClientLink` rows | 0 |
| Active canonical Telegram principals | 1 |
| Canonical `LoyaltyAccount` rows / points | 1 / 0 |
| Active Telegram principals with that account | 1 |
| Canonical ledger/grant/redemption rows | 0 / 0 / 0 |

`PRODUCTION IDENTITY WRITES: 0`

## 2. What identified a principal in the legacy system

Legacy loyalty did not have one durable tenant-qualified client key. Its
actual identity chain was:

1. `loyalty_transactions.client_id` and `loyalty_redeem_codes.client_id`
   referenced the process-local SQLite `clients.id`;
2. that local client row was anchored to a unique `telegram_chat_id` when the
   person used the bot;
3. tenant was implicit in the single deployed bot/company configuration, not
   stored on ledger rows;
4. provider-card discovery used an exact normalized phone lookup;
5. the resulting YClients client id was used at runtime but was not persisted
   on the legacy client or ledger row.

Therefore neither the local SQLite id nor the phone is a portable canonical
identity. The stable external facts available for continuity are:

- exact deployment source: `provider + external company id`;
- exact provider client id returned by the complete provider registry;
- exact Telegram external principal id, but only when the same id already
  exists in canonical `AuthIdentity` under the resolved tenant.

Names, similar phone numbers, balance values, and source-row proximity are not
identity evidence.

## 3. Canonical Chapter 2 authority

The existing Chapter 2 contract is sufficient and must remain the only client
identity system:

```text
provider + external company id
  -> exact active CrmIntegration
  -> tenantId

tenantId + provider + provider client id
  -> CrmClientLink
  -> Client

tenantId + auth provider + provider principal id
  -> AuthIdentity
  -> User + Membership
```

The live implementation provides the required invariants:

- mutation-capable bridges resolve tenant only through an exact active
  `CrmIntegration`; mutable tenant slug fallback is forbidden;
- `CrmClientLink` uniquely owns `(tenantId, provider, externalId)`;
- its composite foreign key prevents a link to another tenant's `Client`;
- `ClientIdentityService.registerCrmClient` is idempotent and handles a
  concurrent duplicate through the database unique constraint;
- the path can create a guest `Client` with `userId = NULL`;
- it can bind an already-proven canonical `userId`, but does not invent one;
- `phoneHash` is explicitly non-unique and never merges or joins clients.

`phoneHash` is only a candidate-search aid. Production has zero `Client` rows,
so there are no canonical hashes to match; even if hashes existed, an exact
hash equality would not be sufficient authority because family members may
share a phone.

`EXACT CANONICAL HASH MATCHES USED AS AUTHORITY: 0`

## 4. Exact classification of all 25 principals

The accepted complete provider snapshot found exactly one provider card for
every source principal and zero duplicate-card ambiguities. The source
footprint below is included only to prove coverage; it is not identity.

| Alias | Source footprint | Exact provider id | Existing canonical principal | Continuity classification |
|---|---:|---|---|---|
| `P01` | 11 ledger rows, 1 expired code | yes | exact active Telegram identity | `EXACTLY MAPPABLE NOW` |
| `P02` | 2 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P03` | 1 ledger row | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P04` | 10 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P05` | 1 ledger row | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P06` | 1 ledger row | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P07` | 5 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P08` | 6 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P09` | 5 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P10` | 8 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P11` | 7 ledger rows, 2 expired codes | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P12` | 7 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P13` | 7 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P14` | 1 ledger row | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P15` | 10 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P16` | 4 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P17` | 5 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P18` | 6 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P19` | 5 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P20` | 3 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P21` | 2 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P22` | 2 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P23` | 7 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P24` | 1 ledger row | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| `P25` | 4 ledger rows | yes | none | `REQUIRES CANONICAL CLIENT REGISTRATION` |
| **Total** | **121 ledger rows, 3 expired codes** | **25/25** | **1/25** | **1 exact, 24 registration, 0 unresolvable** |

The four requested evidence classes resolve as follows:

| Evidence/outcome class | Result | Meaning |
|---|---:|---|
| `EXACT PROVIDER ID MATCH` | 25/25 | one exact card in the complete tenant/provider registry |
| `EXACT CANONICAL HASH MATCH` | 0/25 | no canonical Client rows; hash is not authority anyway |
| `REQUIRES CANONICAL CLIENT REGISTRATION` | 24/25 | exact provider identity exists, but no canonical account principal exists |
| `UNRESOLVABLE` | 0/25 | no missing or ambiguous provider-card identity remains |

These outcome classes distinguish decision readiness from physical row
materialization. Because production currently has zero `Client` and
`CrmClientLink` rows, all 25 still require a later authorized invocation of
the Chapter 2 registration path. `P01` is nevertheless exactly mappable now
because both its provider-card target and canonical `User` target are already
proven. For `P02`-`P25`, registration must create only guest clients with
`userId = NULL`.

## 5. Why the existing 1/25 match is exact

`P01` is the control case because four independent boundaries agree:

1. the legacy deployment maps to exactly one active tenant through the exact
   provider/company integration;
2. its exact phone discovery returned one and only one provider client card in
   the complete registry snapshot;
3. its legacy Telegram external principal equals one active canonical
   tenant-scoped `AuthIdentity(provider = telegram, providerUserId = ...)`;
4. that identity has the required canonical `User + Membership` target and
   owns the one existing zero-balance canonical `LoyaltyAccount`.

No name, balance, fuzzy phone comparison, or cross-tenant lookup participates
in this match. A later authorized registration may therefore call the existing
Chapter 2 method with the exact tenant/provider/external client id and the
already-proven `userId`.

The control does not authorize writes in this Gate. It only proves the contract
that future establishment must reproduce for an account-bound client.

## 6. Safe use of the existing registration path

The Chapter 2 path is reusable without a loyalty-specific identity table or
field.

For a separately approved establishment step:

1. freeze one approved input manifest containing only exact source-to-provider
   mappings and bounded evidence digests;
2. resolve tenant again from exact provider/company integration;
3. invoke `ClientIdentityService.registerCrmClient` with the exact
   `tenantId + provider + externalId`;
4. pass the proven existing `userId` only for `P01`;
5. pass `userId = NULL` for `P02`-`P25` — never manufacture `User`,
   `Membership`, or `AuthIdentity` from a phone or legacy Telegram id;
6. verify 25 tenant-qualified links, zero duplicate external ids, zero
   cross-tenant links, and an unchanged mapping manifest;
7. separately establish/attest an account principal for a guest before any
   loyalty rows are assigned to a `LoyaltyAccount` for that person.

The normal `CrmService.getClientLoyalty` shadow write does not pass a `userId`
and is not an account-linking mechanism. The read-only
`getClientLoyaltyEvidenceReadOnly` boundary must remain write-free.

This distinction matters because `LoyaltyAccount` is owned by
`userId + tenantId`, and the canonical P4-03 runtime paths fail closed when a
`CrmClientLink` resolves to a guest `Client` without `userId`. Creating 24 guest
clients closes provider identity continuity but does not yet authorize the
FULL_LEDGER value migration.

`EXISTING CHAPTER 2 IDENTITY PATH REUSABLE: YES`

`NEW IDENTITY SCHEMA REQUIRED: NO`

## 7. Historical 800-point anomaly

The unmatched historical debit of 800 points belongs to `P01`, the exact
control principal. It is one `redeem` fact whose exact
`client + provider-record` pair has no corresponding legacy `refund` fact.
This identification is exact; it does not make a refund inferable.

The canonical historical representation under `FULL_LEDGER` is:

- preserve the original `redeem` row as an imported historical
  `LoyaltyTransaction`;
- retain its provider record reference and source timestamp;
- keep historical `actionExecutionId = NULL` rather than fabricate an
  execution;
- do not invent a missing refund during copy.

The source ledger truth therefore remains 64,801 points. If the owner later
chooses to compensate the deleted/non-attended provider record, that must be a
separate approved canonical correction action after identity establishment
and migration. It must not alter source history or migration idempotency.

`HISTORICAL 800-POINT PRINCIPAL: EXACTLY MAPPABLE CONTROL`

`HISTORICAL VALUE CORRECTION PERFORMED: NO`

## 8. Required ordering and stop conditions

The only safe order is:

```text
canonical Client / CrmClientLink establishment
  -> exact identity verification
  -> account-principal establishment/attestation where still absent
  -> FULL_LEDGER migration
  -> independent per-client and aggregate balance reconciliation
  -> P4-03 production cutover
```

The future establishment step must stop before any loyalty write if:

- provider/company no longer resolves to exactly one tenant;
- a provider client id is absent, duplicated, or changes from the approved
  manifest;
- a canonical link already points to a different client;
- a proposed `userId` is not backed by an exact tenant-scoped canonical
  principal;
- any match requires a name, fuzzy phone, balance, or cross-tenant guess.

The loyalty migration remains forbidden until every value-bearing principal
has both an exact canonical `Client` mapping and an accepted account principal.

## 9. Verdict

`LEGACY PRINCIPALS ANALYZED: 25/25`

`EXACTLY MAPPABLE NOW: 1/25`

`REQUIRES CANONICAL REGISTRATION: 24/25`

`UNRESOLVABLE: 0/25`

`FUZZY/PII GUESSING REQUIRED: NO`

`EXISTING CHAPTER 2 IDENTITY PATH REUSABLE: YES`

`NEW IDENTITY SCHEMA REQUIRED: NO`

`PRODUCTION IDENTITY WRITES: 0`

`READY FOR CANONICAL IDENTITY ESTABLISHMENT: YES`

`READY FOR LOYALTY DATA MIGRATION: NO`

`READY FOR P4-03 CUTOVER: NO`

STOP. The next step, if separately approved, is canonical identity
establishment through the existing Chapter 2 path. It is not a loyalty data
migration and must not synthesize the 24 missing account principals.
