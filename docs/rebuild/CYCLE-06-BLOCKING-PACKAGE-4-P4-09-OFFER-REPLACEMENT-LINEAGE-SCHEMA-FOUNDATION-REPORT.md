# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 OFFER REPLACEMENT LINEAGE SCHEMA FOUNDATION REPORT

Status: **COMPLETE LOCALLY — PRODUCTION MIGRATION NOT APPLIED**

Date: `2026-09-03`

Source checkpoint: `762871ad`

Approved source of truth:
`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-OFFER-REPLACEMENT-LINEAGE-SCHEMA-PROPOSAL.md`

## 1. Scope delivered

The minimal approved lineage gap is now represented durably:

- `TenantCatalogItem.supersedesOfferId` is nullable for the first identity and
  historical compatibility;
- the predecessor relation is tenant-qualified and uses the immutable
  internal `TenantCatalogItem.id`;
- one predecessor has at most one direct successor;
- established lineage is immutable;
- the retired predecessor remains a durable historical row;
- the replacement starts its own value-version chain at version `1` and has a
  different immutable internal id;
- `externalRef` remains an integration alias and does not participate in
  canonical identity or lineage.

The former unconditional unique index on
`(tenantId, kind, canonicalTemplateKey)` was removed. It was replaced by:

- a non-unique tenant/kind/template lookup index;
- a deferred constraint guard requiring exactly one lineage root;
- a deferred constraint guard allowing at most one non-retired authority for
  a tenant/kind/template;
- exact retired-predecessor validation;
- a template-qualified advisory transaction lock for first-identity and
  replacement concurrency.

`INACTIVE` remains a non-retired authority and does not release the template
slot. Only a durable `RETIRED` current version permits the exact successor.

## 2. Migration artifact

Migration:
`20260903010000_p4_09_offer_replacement_lineage`

SHA-256:
`1c273ff3526726a308cbd65904c6d91bd3517dd3f5a61c9555eaf135b5cf431f`

The migration is additive except for replacing the conflicting unconditional
template unique index with the approved conditional/deferred authority guard.
It contains no `UPDATE` or `INSERT` backfill and does not reference issued
subscription, certificate, referral, loyalty, billing, or expense value
tables.

## 3. PostgreSQL adversarial proof

The disposable PostgreSQL proof established:

| Invariant | Result |
|---|---|
| Active offer internal identity cannot be rewritten | PASS |
| Retired predecessor remains present | PASS |
| Replacement receives a different internal id | PASS |
| `A → B → C` lineage is tenant-qualified and contiguous | PASS |
| Replacement before predecessor retirement | REJECTED |
| Replacement of an inactive authority | REJECTED |
| Second successor for one retired predecessor | REJECTED |
| Second live/root identity for one template | REJECTED |
| Clearing or changing established lineage | REJECTED |
| Cross-tenant predecessor binding | REJECTED |
| Concurrent replacement creation | ONE WINNER |
| Concurrent first canonical identity creation | ONE WINNER |
| Restart lookup of the replacement | SAME IDENTITY |
| Historical predecessor value-version rewrite | REJECTED |
| `externalRef` change affects identity or lineage | NO |
| Live authority count after replacement | `1` |
| Fake historical replacement backfill | `0` |

## 4. Frozen value preservation

The proof retained immutable snapshots across retirement and replacement:

- the existing subscription term kept its original plan snapshot and
  `520000` kopeck price;
- the issued gift certificate kept its original offer snapshot and nominal
  value;
- the issued referral reward kept its original policy snapshot and frozen
  reward value;
- no historical/frozen fact was rebound to offer B or offer C.

The previous immutable-offer foundation proof was also replayed against the
new migration and remained green, including owner approval, concurrent version
creation, cross-tenant rejection, and frozen-value preservation.

## 5. Verification

| Check | Result |
|---|---|
| Targeted schema ratchets | `2/2` suites, `14/14` tests PASS |
| New lineage adversarial/concurrency proof | PASS |
| Previous P4-09 immutable-version proof | PASS |
| Clean replay of all migrations | `68/68` PASS |
| Prisma migration status on replay DB | up to date |
| Migrated DB vs Prisma schema drift | NONE |
| Prisma validate | PASS |
| Targeted ESLint | PASS |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Production migration apply | NOT RUN |
| Production configuration/value writes | `0` |

## 6. Scope boundaries preserved

This foundation did not:

- apply the migration in production;
- resume P4-09 runtime alignment;
- start any of the seven P4-09 Shadow actions;
- run the P4-09 executable proof;
- change P4-02 through P4-08 runtime;
- mutate production offer configuration or customer value;
- perform provider writes;
- start Package 5 or Chapter 7.

## 7. Verdict

`OFFER REPLACEMENT LINEAGE DURABLE: YES`

`RETIRED OFFER PRESERVED: YES`

`REPLACEMENT GETS NEW IMMUTABLE IDENTITY: YES`

`ACTIVE TEMPLATE UNIQUENESS PRESERVED: YES`

`CONCURRENT REPLACEMENT DUPLICATION POSSIBLE: NO`

`HISTORICAL/FROZEN VALUE REBOUND TO REPLACEMENT: NO`

`CROSS-TENANT LINEAGE POSSIBLE: NO`

`FAKE HISTORICAL REPLACEMENT BACKFILL: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`READY FOR P4-09 REPLACEMENT LINEAGE PRODUCTION MIGRATION GATE: YES`

## 8. Process hygiene

All commands ran sequentially. No background service, watcher, browser,
Playwright, or Chrome process was started by this task. Every disposable
database was removed by an explicit trap, including failed diagnostic runs.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`DISPOSABLE DATABASES CREATED: 6`

`DISPOSABLE DATABASES REMOVED: 6`

`TEMP DATABASES REMAINING: 0`
