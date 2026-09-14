# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 GIFT CERTIFICATE PRESENTATION KEY VERSION SCHEMA FOUNDATION REPORT

Status: **COMPLETE — production migration not applied; runtime unchanged**

Source checkpoint: `ace2fe9d`

Report date: 2026-09-02

## 1. Scope

This step implements only the durable schema gap authorized by the accepted
P4-06 Gift Certificate Runtime Contract Gate:

`GiftCertificate.presentationKeyVersion`.

The field stores a non-secret identifier selecting the server-side
presentation key version. It is not a key, bearer, certificate code, provider
reference, or value. Together with the existing immutable certificate facts
and `codeHash`, it allows a later approved runtime to re-derive and verify the
same bearer after crash, restart, or key rotation without persisting raw
bearer material or creating another certificate.

Migration:

`prisma/migrations/20260902150000_gift_certificate_presentation_key_version/migration.sql`.

No runtime, Canonical Ingress capability, Shadow, provider adapter, payment,
certificate issue/redemption, communication path, or other domain schema was
added or changed.

## 2. Additive Durable Contract

The Prisma model adds only:

```prisma
presentationKeyVersion String?
```

The column is nullable for historical compatibility and has no default. The
migration performs no `INSERT`, `UPDATE`, `DELETE`, or backfill.

Database enforcement is split deliberately:

- a shape constraint accepts only a non-empty bounded key-version identifier
  when the field is present;
- a new insert guard requires the field for every new canonical certificate
  carrying `issueExecutionId`;
- a historical certificate with null execution binding and explicit
  `legacySourceRef` may remain `NULL`;
- the existing immutable certificate function is extended so a non-null
  version can never be cleared or replaced;
- a controlled historical row may establish one exact version from `NULL`
  once, after which the same immutability rule applies.

The version identifier contains no key material. The presentation key and the
raw bearer remain outside the database. The existing `codeHash` remains the
only bearer lookup.

## 3. Existing Integrity Preserved

The migration does not replace or weaken any existing Gift Certificate
constraint:

- issue execution remains tenant-qualified and one-to-one;
- issuance identity, code hash, and provider-payment identity remain unique;
- established certificate/value/provider facts remain immutable;
- certificate redemption remains a tenant-qualified, append-only, one-time
  claim;
- paid/unexpired redemption checks and parent locking remain active;
- historical null ActionExecution bindings continue to require explicit
  legacy correlation.

Duplicate/restart issuance under the same `issueExecutionId` cannot allocate a
second certificate or another key-version identity. The existing unique
execution claim rejects it independently of the proposed version string.

## 4. PostgreSQL Verification

All database work ran sequentially against explicitly named disposable local
PostgreSQL databases. Every database was owned by the invoking bounded command,
dropped by its cleanup trap, and verified absent before the next step.

| Check | Result |
| --- | --- |
| Targeted Gift Certificate schema ratchets | PASS — `2/2` suites, `14/14` tests |
| Historical pre-migration certificate fixture | PASS |
| Historical pre-migration redemption fixture | PASS |
| Historical certificate after migration | PRESERVED |
| Historical redemption after migration | PRESERVED |
| Historical `presentationKeyVersion` | `NULL` |
| Fake historical backfill | NONE |
| Clean migration replay | PASS — `65/65` migrations |
| Prisma migration status on replay database | UP TO DATE |
| New canonical certificate with exact version | PASS |
| New canonical certificate without version | REJECTED |
| Blank/invalid version identifier | REJECTED |
| Established version cleared | REJECTED |
| Established version replaced | REJECTED |
| Cross-tenant issue execution | REJECTED |
| Same issue execution reused with another version | REJECTED |
| Existing certificate redemption after migration | PASS |
| Existing nominal value changed | NO |
| Raw bearer/code/key column added | NO |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs Prisma schema drift | NONE |
| Temporary P4-06 databases remaining | `0` |

The first structural fixture replay completed all 65 migrations but stopped
before certificate assertions because the fixture used an invalid test-only
`ActionExecution.sourceType`. The disposable database was removed by its trap.
Only the fixture was corrected to the existing allowed
`authenticated_request` source contract; schema and migration constraints were
not weakened. The complete clean replay and structural proof then passed on a
new disposable database.

The full backend suite, full lint, typecheck, build, Shadow, executable proof,
and production checks were intentionally not run. This is an additive
schema-foundation step with a targeted structural test surface only.

## 5. Safety Boundary

- production migration applied: `NO`;
- production/persistent database writes: `0`;
- certificate issuance/redemption mutations: `0`;
- payment/provider writes: `0`;
- raw bearer, code, key, or key material persisted: `NO`;
- P4-06 runtime started: `NO`;
- P4-06 Shadow started: `NO`;
- P4-02 through P4-05 changed: `NO`;
- A08 payment write remains disabled;
- Package 5 and Chapter 7 were not started.

Shadow remains blocked until this exact migration passes its separately
authorized production migration Gate/apply step.

## 6. Verdict

`PRESENTATION KEY VERSION DURABLE: YES`

`HISTORICAL NULL COMPATIBLE: YES`

`ESTABLISHED KEY VERSION IMMUTABLE: YES`

`RAW BEARER/CODE/KEY PERSISTED: NO`

`FAKE HISTORICAL BACKFILL: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`P4-06 SHADOW CAN START: NO`

`READY FOR P4-06 PRODUCTION MIGRATION GATE: YES`

`PRODUCTION CERTIFICATE/PAYMENT/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`P4-06 RUNTIME STARTED: NO`

`P4-07 STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 7. Permanent Process Hygiene

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 4`

`TEMP DATABASES REMOVED: 4`

`TEMP DATABASES REMAINING: 0`

STOP. No production migration, runtime, Shadow, executable proof, next Package
4 family, Package 5, or Chapter 7 work was started by this foundation step.
