# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 PROVIDER IDENTITY COLLISION RESOLUTION GATE

Status: **COMPLETE — collision remains unresolved; no automatic identity action is safe**

Source checkpoint: `684ef02e`

Report date: 2026-08-30

## 1. Scope and safety boundary

This Gate performed only read-only analysis of the `P02/P03` provider identity
collision. It inspected the exact tenant/provider binding, bounded legacy
principal evidence, legacy phone-hash equality, principal origin timestamps,
consent chronology, loyalty ledger chronology, legacy booking references,
exact provider records, and available provider-card history.

It did not create a `Client` or `CrmClientLink`, merge or reassign a principal,
modify `AuthIdentity`, migrate loyalty, change a balance, create a grant,
correct the historical 800-point refund exception, or write to the provider.
The 23 non-colliding identities were not registered separately.

No raw name, phone, Telegram id, provider client id, provider record id, or
other personal identifier appears below. Bounded references are report-only
evidence labels and must not become runtime identity.

## 2. Tenant and canonical identity evidence

The collision is contained within the one exact active tenant integration:

```text
same tenant
same provider = yclients
same provider external client id
two distinct legacy principals = P02 + P03
```

The complete 29-page provider registry contains no second exact provider card
for either source principal. The shared provider identity has bounded evidence
reference `9a1758623ec8`.

Neither `P02` nor `P03` has an exact canonical `AuthIdentity`, `Client`, or
`CrmClientLink`. Their legacy stable Telegram principals are distinct:

| Principal | Stable legacy principal ref | Canonical account match | Origin time | Consent history |
|---|---|---|---|---:|
| `P02` | `411579fc1a57` | none | 2026-05-23 12:11:21 | 1 event |
| `P03` | `beff94ddec3e` | none | 2026-05-23 12:26:31 | 3 events |

Their legacy phone hashes are exactly equal. Production has no canonical
`Client.phoneHash` rows to compare. Chapter 2 explicitly defines phone hash as
a non-unique candidate index, not identity; the equality therefore proves the
collision's discovery path but does not prove that the two principals are the
same person.

`EXACT CANONICAL ACCOUNT LINKS FOR COLLISION: 0/2`

`ALTERNATE EXACT PROVIDER IDENTITIES: 0`

## 3. Provider card and appointment/history linkage

The two legacy principals created distinct provider appointment records for
the same provider client card:

| Evidence | `P02` | `P03` |
|---|---|---|
| Provider record ref | `56382e4f3ed2` | `28f4a2dd3a8b` |
| Start | 2026-05-24 15:00 +03:00 | 2026-05-24 16:00 +03:00 |
| Duration | 60 minutes | 60 minutes |
| Provider client matches shared card | yes | yes |
| Staff/service evidence | same exact refs | same exact refs |
| Attendance | 0 | 0 |
| Deleted | yes | yes |

The appointment intervals are consecutive and do not overlap. The distinct
records prove that two separate legacy sessions/actions existed, but they do
not prove two real people: one person could have used two Telegram accounts or
created two bookings, while two people sharing one contact channel could also
have created them.

The provider card's available list history also contains two attended,
non-deleted records from 2021. Those records predate both legacy principals by
almost five years and are not linked to either legacy source account. The
provider API exposes current card ownership and record facts, but no immutable
card-owner/change audit capable of proving whether the external id was reused,
overwritten, or continuously owned by one person.

Therefore:

- current provider identity continuity is exact;
- historical provider identity ownership is not attributable to `P02` or
  `P03`;
- provider-card reuse/overwrite is possible but not proven;
- no exact alternate provider id is available for reassignment.

## 4. Loyalty ledger comparison

The two ledger partitions are independent and must remain separate while the
identity is unresolved:

| Principal | Balance | Rows | Operation chronology | Provider record reference in ledger |
|---|---:|---:|---|---|
| `P02` | 490 | 2 | `backfill +90` at 2026-05-28 00:02:40; `yc_import +400` at 2026-07-27 13:44:56 | none |
| `P03` | 90 | 1 | `backfill +90` at 2026-05-28 00:02:40 | none |

The simultaneous backfills came from a batch process and are not overlapping
customer activity. The later 400-point import affected only `P02`, but because
the source derived provider identity through the shared phone/card path, it
does not independently prove that `P02` exclusively owns the provider card.

None of the three ledger rows has `visit_record_id`. Consequently the two
distinct provider booking records cannot bind either loyalty partition to a
different provider customer identity. Merging balances to 580 would preserve
the arithmetic total but could combine value belonging to two people and could
also preserve a duplicated welcome backfill. Dropping either 90-point row
would rewrite historical truth. Neither operation is authorized by evidence.

`P02 LEDGER BALANCE: 490`

`P03 LEDGER BALANCE: 90`

`COLLISION VALUE TOTAL: 580`

`LEDGER ROWS WITH PROVIDER RECORD IDENTITY: 0/3`

## 5. Resolution classification

### `SAFE MERGE` — not proven

Evidence against an automatic merge includes two distinct stable Telegram
principals, separate consent histories, separate source creation events, and
separate provider booking records. The common phone hash and provider card are
explicitly insufficient under Chapter 2.

### `SAFE REASSIGN ONE PRINCIPAL` — not proven

The complete provider registry and exact provider records expose no alternate
external client id for either principal. Inventing a second card or choosing a
similar provider record would be fuzzy identity creation.

### `KEEP SEPARATE — PROVIDER LINK CANNOT REPRESENT BOTH` — necessary source-state rule, but not a final real-person resolution

The legacy partitions must remain separate so no value or consent history is
lost. However, the available evidence cannot prove whether they represent one
real person or two. A permanent `KEEP_SEPARATE` canonical decision would still
need a distinct exact provider/account identity for each side.

### Final classification: `UNRESOLVED`

The evidence proves two source principals and one provider identity. It does
not prove one real client, two real clients, or historical provider-card
reassignment. Automatic merge and reassignment are both forbidden.

## 6. Chapter 2 merge preconditions

A future `SAFE_MERGE` finding would require a separate Gate proving at least:

1. authoritative evidence that both stable legacy principals belong to the
   same real person;
2. no conflicting canonical account or provider identity;
3. explicit surviving `Client` identity and tenant-qualified link ownership;
4. immutable preservation of all three source ledger rows and idempotency
   identities;
5. an explicit value decision for the two 90-point backfills rather than a
   silent deduplication;
6. merge audit, restart safety, and no cross-tenant relationship;
7. owner approval for the merge itself.

None of those merge actions or approvals is inferred by this Gate.

## 7. Non-loss continuity strategy

Until authoritative identity evidence exists:

1. keep `P02` and `P03` as two immutable legacy source partitions;
2. preserve their three ledger rows and balances 490 / 90 in the approved
   source manifest without copying them into canonical loyalty;
3. do not assign the shared provider card to either source principal;
4. do not register the other 23 principals as a partial establishment, per the
   accepted all-or-none checkpoint;
5. accept only one of two future resolution paths:
   - exact organic/canonical account verification plus distinct provider-card
     evidence for `SAFE_REASSIGN`, or
   - separately approved Chapter 2 merge proof for `SAFE_MERGE`;
6. after resolution, rerun the complete 25-principal plan and require 25
   unique, tenant-qualified canonical mappings before FULL_LEDGER migration.

This strategy loses no loyalty value: all 580 collision points remain in the
unchanged 121-row legacy ledger and neither source partition is overwritten.

## 8. No-write verification

The production state remained:

`CLIENT ROWS: 0`

`CRM CLIENT LINK ROWS: 0`

`CANONICAL LOYALTY TRANSACTIONS: 0`

`CANONICAL GRANTS: 0`

`CANONICAL REDEMPTIONS: 0`

`LEGACY LEDGER ROWS: 121`

`LEGACY TOTAL POINTS: 64801`

`REFUND 800 CORRECTED: NO`

## 9. Verdict

`COLLISION PRINCIPALS ANALYZED: 2/2`

`COLLISION RESOLUTION: UNRESOLVED`

`AUTOMATIC MERGE ALLOWED: NO`

`ALTERNATE EXACT PROVIDER ID FOUND: NO`

`23 SAFE IDENTITIES STILL VALID: YES`

`READY FOR CANONICAL IDENTITY ESTABLISHMENT: NO`

`READY FOR FULL_LEDGER MIGRATION: NO`

`PRODUCTION WRITES: 0`

STOP. The next step must obtain authoritative identity evidence for `P02/P03`
or separately authorize and prove Chapter 2 merge semantics. No identity or
loyalty write may proceed from this Gate alone.
