# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 PRODUCTION DATA CONTINUITY GATE

Status: **CONTRACT COMPLETE — production data migration blocked by identity and one historical value exception**

Source checkpoint: `539211ac`

Report date: 2026-08-30

## 1. Scope and safety boundary

This Gate performed only read-only reconciliation of the production legacy
SQLite ledger, the canonical PostgreSQL identity/value structures, and a
complete read-only YClients client-registry snapshot. It defines the migration
contract but does not authorize or perform the migration.

No production row, balance, code, grant, execution, environment, release, or
provider state was changed. P4-03 cutover was not resumed. P4-02, A08, the next
Package 4 family, Package 5, and Chapter 7 were not changed or started.

No personal data or raw bearer code was emitted into the audit output or this
report. Code and source-row evidence is represented only by bounded hashes and
aggregates.

A final post-audit read confirmed unchanged state: legacy ledger `121 / 64801`
with three unconsumed code rows; canonical ledger, grants, and redemptions all
remain `0`.

## 2. Snapshot completeness and ledger reconciliation

The provider registry snapshot completed all 29 pages. Exactly one active
YClients company integration mapped the legacy deployment to one active Maya
tenant. The immutable audit manifest for the 121 source rows is:

`22a9976fab5e739c70089c41862ccf7b3e90382d1bcd9383e6aea9c436689676`

Two independent calculations agreed:

1. direct sum of all 121 `points` values;
2. sum of independently grouped per-client balances.

Both equal `64,801`. Grouping produces exactly 22 non-zero balances. All row
ids are unique, every row resolves to an existing legacy client row, and an
ordered replay by source row id never produces a negative intermediate
balance.

| Legacy kind | Rows | Net points |
|---|---:|---:|
| `earn` | 74 | 8,125 |
| `backfill` | 11 | 32,890 |
| `yc_import` | 21 | 48,296 |
| `redeem` | 4 | -1,800 |
| `refund` | 3 | 1,000 |
| `welcome_cap_adjust` | 8 | -23,710 |
| **Total** | **121** | **64,801** |

`LEGACY LEDGER RECONCILED: 121/121`

`INDEPENDENT BALANCE RECOMPUTE: PASS — 22 / 64801`

## 3. Tenant and client identity classification

The classification applies the accepted P4-03 authority boundary:

- tenant must resolve from the exact active provider/company integration;
- the provider registry must return one exact external client card;
- an existing canonical Telegram principal or another separately approved
  principal-import attestation must identify the ledger account owner;
- a phone, local SQLite client id, or Telegram id by itself may not silently
  become a canonical `CrmClientLink` or `User`.

Provider evidence itself is complete and non-ambiguous: all 25 legacy clients
in ledger/code scope resolve to exactly one YClients external client card;
zero phone keys resolve to multiple provider cards. However, production
PostgreSQL currently contains zero `Client` rows and zero `CrmClientLink`
rows. Only one of the 25 legacy Telegram principals already exists as an
active canonical `AuthIdentity`/membership.

| Classification | Clients | Ledger rows | Net points | Non-zero balances |
|---|---:|---:|---:|---:|
| `EXACTLY_MAPPABLE` | 1 | 11 | 0 | 0 |
| `AMBIGUOUS` | 0 | 0 | 0 | 0 |
| `UNMAPPABLE` | 24 | 110 | 64,801 | 22 |
| **Total** | **25** | **121** | **64,801** | **22** |

The one exactly mappable client has both a unique provider card and an active
canonical principal; creating the missing tenant-qualified `Client`,
`CrmClientLink`, and zero/new account is deterministic. The remaining 24 have
unique provider cards but no canonical principal or link. They are
`UNMAPPABLE` under the currently accepted authority contract, not ambiguous.
All real non-zero production value is in that class.

This is an identity-data gap, not a provider-data ambiguity. Closing it
requires a separately approved principal-import/attestation rule or organic
canonical login/linking. The migration must not manufacture 24 users from
phone numbers or silently treat the legacy SQLite id as tenant authority.

## 4. Historical redeem/refund exception

The four legacy redeem rows debit 1,800 points. Three exact
`client + provider-record` pairs have refund facts totalling 1,000 points.
One debit of 800 points has no refund fact.

A read-only provider check classifies that remaining record as past, deleted,
and not attended. This is a historical value exception, not an unresolved
future booking. The migration must not silently add an 800-point refund and
must not hide the discrepancy inside an opening balance.

Before migration apply, an explicit decision is required:

1. preserve the current ledger exactly at 64,801 points; or
2. authorize a separate canonical compensating action after identity is
   established.

Any compensation must be a real, separately approved value action. It is not
part of data-copy semantics.

## 5. Migration strategy decision

`MIGRATION STRATEGY: FULL_LEDGER`

`OPENING_BALANCE` is rejected. A 22-row opening import would reproduce the
current total but discard the exact evidence for 74 earns, 21 provider-card
imports, 11 backfills, four redemptions, three refunds, and eight cap
adjustments. It could not satisfy the required 121/121 reconciliation or
explain the historical 800-point exception.

The approved `FULL_LEDGER` contract is:

1. acquire one consistent, read-only source snapshot and require its manifest
   hash and row count to match the approved migration input;
2. freeze legacy loyalty writers only during a later separately approved apply
   window, then recompute the manifest before any target write;
3. refuse every row whose tenant/client/principal mapping is not
   `EXACTLY_MAPPABLE` under the accepted identity map;
4. create/reuse the tenant-qualified account and insert all source rows in
   deterministic source-row-id order while preserving the source timestamp;
5. keep `actionExecutionId = NULL` for imported historical ledger facts — no
   fake `ActionExecution` backfill;
6. preserve source time, delta, visit reference where present, encrypted
   reason, and the replayed `balanceAfter`;
7. map kinds explicitly:
   `earn -> earn`, `backfill -> backfill`, `yc_import -> import`,
   `redeem -> redeem`, `refund -> refund`, and
   `welcome_cap_adjust -> legacy_cap_adjustment`;
8. update the final account balance and its historical rows in the same target
   transaction;
9. assert after apply that row count, per-kind counts/sums, per-client ending
   balances, total 64,801, and the source-to-target manifest all match;
10. leave the legacy owner enabled until the separately approved coordinated
    cutover proves the canonical read path and these totals.

## 6. Idempotent migration identity

The durable source namespace is:

`legacy-sqlite:barbershop-bot-production:v1`

For each source row:

```text
row identity = SHA-256(
  "p4-03.full-ledger.v1",
  source namespace,
  legacy loyalty_transactions.id
)
```

The row identity becomes the tenant-scoped `LoyaltyTransaction.idempotencyKey`.
A separate canonical row digest binds client mapping, kind, delta,
provider/visit reference, source time, and a hash of the reason. On replay:

- absent idempotency key -> insert once;
- existing key with the same digest -> exact no-op;
- existing key with a different digest -> fail the entire migration;
- partial totals or missing source rows -> fail closed.

The source row id, not a mutable file checksum, owns idempotency. The complete
manifest hash owns snapshot approval. This distinction prevents both duplicate
value and silent acceptance of a changed source row.

## 7. Three unconsumed legacy codes

All three rows marked unconsumed in SQLite are already expired. Individually:

- raw bearer format is compatible with the canonical normalized HMAC lookup;
- each service title maps to exactly one current provider service;
- one code owner is `EXACTLY_MAPPABLE` and two are `UNMAPPABLE`;
- all three are `NOT_MIGRATABLE` as active claims because expiry is terminal.

They must not be revived, reissued, or imported as active grants. Possession of
one of these expired bearer strings after cutover must fail closed. Because
there is no active legacy claim to honor, no runtime compatibility reader is
required. The raw strings must never be copied into PostgreSQL or a report.

`LEGACY CODES CLASSIFIED: 3/3`

`ACTIVE LEGACY CODES: 0`

`EXISTING LEGACY CODES CONTINUE AFTER MIGRATION: NO — EXPIRED`

`COMPATIBILITY READER REQUIRED: NO`

## 8. Schema decision

The current schema can represent the selected contract:

- `Client` and `CrmClientLink` provide tenant-qualified provider identity;
- `User`, `Membership`, and `AuthIdentity` provide an account principal once
  separately attested;
- `LoyaltyAccount` stores the resulting balance;
- `LoyaltyTransaction` supports deterministic tenant idempotency and nullable
  historical `actionExecutionId`;
- grant/redemption schema requires no extension because no active legacy code
  remains to migrate.

Therefore no additive field/table is justified by this Gate. The blocker is
missing canonical identity data and the explicit 800-point exception decision,
not missing durable representation.

`ADDITIONAL SCHEMA REQUIRED: NO`

`PRINCIPAL/IDENTITY IMPORT CONTRACT REQUIRED: YES`

## 9. Verdict

`PRODUCTION DATA CONTINUITY GATE: COMPLETE`

`LEGACY LEDGER RECONCILED: 121/121`

`NON-ZERO BALANCES RECOMPUTED: 22`

`TOTAL POINTS RECOMPUTED: 64801`

`EXACTLY MAPPABLE CLIENTS: 1/25`

`AMBIGUOUS CLIENTS: 0/25`

`UNMAPPABLE CLIENTS: 24/25`

`SELECTED MIGRATION STRATEGY: FULL_LEDGER`

`IDEMPOTENT MIGRATION CONTRACT: DEFINED`

`LEGACY CODES CLASSIFIED: 3/3 — ALL EXPIRED`

`COMPATIBILITY READER REQUIRED: NO`

`ADDITIONAL SCHEMA REQUIRED: NO`

`HISTORICAL VALUE EXCEPTIONS: 1 / 800 POINTS`

`READY FOR PRODUCTION DATA MIGRATION APPLY: NO`

`PRODUCTION DATA WRITES: 0`

`PRODUCTION LOYALTY MUTATIONS: 0`

`P4-03 CUTOVER: NO`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

STOP. The next separately approved step must close the canonical principal
mapping for the 24 currently unmappable clients and decide the single
800-point historical exception before any production data migration apply.
