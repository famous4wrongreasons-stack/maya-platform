# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 IMMUTABLE OFFER VALUE VERSION SCHEMA FOUNDATION REPORT

Status: **COMPLETE — production migration not applied; runtime unchanged**

Source checkpoint: `99e036ab`

Report date: 2026-09-02

## 1. Scope

This cycle implements only the durable offer-version gap approved in:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-IMMUTABLE-OFFER-VALUE-VERSION-SCHEMA-PROPOSAL.md`.

The additive foundation consists of:

- append-only `TenantCatalogItemValueVersion` rows for membership and gift
  certificate offers;
- append-only `ReferralProgramValueVersion` rows for future referral value;
- nullable-for-history current-version pointers on the existing authority
  records;
- tenant-qualified offer/program, predecessor and ActionExecution bindings;
- database-enforced contiguous versions, immutable history, owner approval and
  current-projection consistency.

No P4-09 Shadow or executable runtime was started. Existing P4-02 through P4-08
runtime, issued customer value and production execution owners were not
changed.

## 2. Canonical offer identity and version contract

`TenantCatalogItem.id` is the immutable internal Maya offer identity. A new
server-owned `canonicalTemplateKey` classifies the supported offer, while
`externalRef` remains only an optional integration alias. It is deliberately
absent from value-version identities, foreign keys, predecessor claims and
snapshot uniqueness.

A value-bearing change appends one direct successor version. PostgreSQL
requires:

- version `1` with no predecessor, or the exact contiguous successor of the
  current version;
- the same tenant, offer, kind and canonical template across the chain;
- one successor per predecessor;
- one value version per exact owner-approved ActionExecution;
- a matching current-version pointer and projection update in the same
  transaction.

The current catalog row cannot change value-bearing projection fields without
the matching immutable version. An established internal identity, tenant,
kind, template, predecessor or historical version cannot be replaced or
deleted. Changing `externalRef` neither creates nor changes canonical identity.

## 3. Referral value versions and safety policy

`ReferralProgramValueVersion` applies the same append-only, contiguous and
tenant-qualified contract to future referral issuance. Each recipient slot is
absent, fixed money, or percentage with an explicit maximum liability. Mixed
denominations are rejected.

The approved safety policy is enforced at the durable boundary:

- membership value: at most `600000` kopecks;
- certificate value: at most `500000` kopecks;
- referral value: at most `50000` kopecks per recipient slot;
- referral aggregate liability: at most `100000` kopecks;
- referral recipients: at most two defined slots;
- one offer or referral program target per configuration mutation;
- every non-no-op value version requires an active same-tenant owner approval
  bound to the exact normalized input and target.

These limits are safety caps, not tariffs. No implicit denomination or points
conversion was introduced.

## 4. Frozen issued-value protection

The adversarial proof created historical customer-value facts from version 1,
then advanced their configuration to version 2. The original values remained
unchanged for:

- a customer subscription term;
- an issued gift certificate;
- a referral reward issuance and its reward.

Existing downstream immutable snapshot/value columns remain the source of
truth for already issued value. New configuration versions affect only future
issuance. The migration contains no UPDATE, fake version creation or invented
ActionExecution for historical rows.

## 5. PostgreSQL adversarial proof

All database work ran against explicitly named disposable local PostgreSQL
databases. Each database was removed on success or failure and independently
verified absent before completion.

| Check | Result |
| --- | --- |
| Targeted schema ratchet | PASS — `1/1` suite, `8/8` assertions |
| Clean replay | PASS — `67/67` migrations |
| Prisma migration status | UP TO DATE |
| Migrated database vs Prisma schema drift | NONE |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Application TypeScript check | PASS |
| Scripts TypeScript check | PASS |
| Historical null pointers | COMPATIBLE |
| Immutable internal offer identity | ENFORCED |
| `externalRef` changes canonical identity | NO |
| Contiguous offer versions | `1 -> 2 -> 3` |
| Concurrent successor creation | ONE WINNER |
| Duplicate/retry version creation | CONVERGED / NO SECOND VERSION |
| Historical version update/delete | REJECTED |
| Unversioned value projection change | REJECTED |
| Non-owner approval | REJECTED |
| Forged generation | REJECTED |
| Cross-tenant offer/version binding | REJECTED |
| Subscription frozen snapshot preserved | YES |
| Certificate frozen snapshot preserved | YES |
| Referral issuance/reward snapshot preserved | YES |
| Fake historical version backfill | `0` |
| Production writes | `0` |

## 6. Safety boundary

- production migration applied: `NO`;
- production configuration/value mutations: `0`;
- provider writes: `0`;
- P4-09 Shadow action classes started: `0/7`;
- P4-09 executable proof started: `NO`;
- Package 5 and Chapter 7 started: `NO`.

The next step is a separately approved production migration Gate. This cycle
does not authorize migration apply, historical materialization, runtime
alignment, Shadow, executable proof or production cutover.

## 7. Verdict

`IMMUTABLE OFFER IDENTITY DURABLE: YES`

`VERSIONED OFFER VALUE DURABLE: YES`

`HISTORICAL OFFER VERSION IMMUTABLE: YES`

`ISSUED/FROZEN VALUE RETROACTIVELY MUTABLE: NO`

`externalRef PRIMARY IDENTITY: NO`

`ACTIONEXECUTION OFFER-VERSION BINDING DURABLE: YES`

`CROSS-TENANT OFFER VERSION BINDING POSSIBLE: NO`

`FAKE HISTORICAL VERSION BACKFILL: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`READY FOR P4-09 OFFER VERSION PRODUCTION MIGRATION GATE: YES`

## 8. Permanent process hygiene

All verification commands ran sequentially. No watcher, application server,
browser, Playwright, Chrome or background worker was started. Every foreground
command was waited to completion before the next heavy stage.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES CREATED: 4`

`TEMP DATABASES REMOVED: 4`

`TEMP DATABASES REMAINING: 0`

STOP. Production migration, Shadow, executable proof, production cutover,
Package 5 and Chapter 7 were not started.
