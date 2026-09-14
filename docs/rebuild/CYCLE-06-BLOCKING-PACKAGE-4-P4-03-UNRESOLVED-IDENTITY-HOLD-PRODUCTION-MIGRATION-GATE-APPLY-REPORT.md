# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 UNRESOLVED IDENTITY HOLD PRODUCTION MIGRATION GATE/APPLY REPORT

Status: **PASS — ONE APPROVED HOLD MIGRATION APPLIED**

Source checkpoint: `6058ca40`

Apply date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and safety boundary

This step gated and applied only:

`20260831110000_unresolved_client_identity_hold`

SHA-256:

`669b7212e5c74c7f2c2aa9941bbfd3c9ccae24ff2ff2bcb30792a6675ce9553e`

It did not create a hold row, connect the Chapter 2 registration guard,
register a Client, create a CrmClientLink, migrate FULL_LEDGER, change loyalty
value, resolve or merge P02/P03, switch the active runtime release, restart the
service, or start P4-03 cutover.

## 2. Production preflight

All checks ran sequentially before the production schema write.

| Check | Result |
| --- | --- |
| Local HEAD | `6058ca4092491a412d9fe827b675d18b4bfaef22` |
| Origin branch | same commit |
| Unpushed commits | `0` |
| Local migration directories | `62` |
| Successful production migration journal rows | `64` |
| Repository migrations already applied | `61` |
| Acknowledged historical migration rows | `3` |
| Applied repository checksum mismatches | `0` |
| Unacknowledged production migrations | `0` |
| Pending migration set | exactly `1` — the approved hold migration |
| Hold migration checksum | exact committed checksum above |
| Incomplete production migrations | `0` |
| Hold table before apply | absent |
| Production database readiness | PASS |
| Non-idle sessions | `0` |
| Sessions idle in transaction | `0` |
| Client rows | `0` |
| CrmClientLink rows | `0` |
| Canonical LoyaltyTransaction rows | `0` |
| Service state | active |
| `/api/health` | HTTP `200` |
| `/api/health/ready` | HTTP `200` |

An inactive schema-only release was prepared at:

`/opt/maya-saas/releases/20260831-c06-p4-p403-unresolved-hold-schema-6058ca40`

It contained exactly 62 migration directories, matched the approved hold
checksum, passed Prisma validation, and passed the project release preflight
with exactly one pending migration.

## 3. Read-only continuity confirmation

Immediately before the clone/apply decision, the complete read-only provider
registry snapshot and legacy ledger were recomputed without emitting PII.

| Continuity fact | Result |
| --- | ---: |
| Provider snapshot complete | yes |
| Provider pages loaded | `29` |
| Legacy principals | `25` |
| Individually exact provider mappings | `25` |
| Missing / individually ambiguous | `0 / 0` |
| Unique provider identities | `24` |
| Provider collision groups | `1` |
| Principals in collision | `2` |
| Collision ledger | `3` rows / `580` points |
| Complete legacy ledger | `121` rows / `64,801` points |

The accepted P02/P03 collision therefore still existed and remained
unresolved. No provider write was made; the provider operation was the
existing read-only registry-search contract.

## 4. Structural production clone

A production schema-only dump and the non-business Prisma journal were
streamed to a disposable local PostgreSQL database. Production business rows
and PII copied to the clone: `0`.

Prisma CLI does not understand the project's three separately acknowledged
historical migration rows. The first clone status check therefore stopped
before applying anything. That clone was removed. The final clone retained
the complete production schema and only repository-known migration journal
rows; the historical rows were excluded in the disposable clone only.
Production migration history was never modified.

The final clone proved:

| Clone check | Result |
| --- | --- |
| Pre-apply drift | only `UnresolvedClientIdentityHold` foundation |
| Pending migration applied | exactly the approved hold migration |
| Hold table | present |
| Hold foreign keys | `2` |
| Hold unique indexes | `2` |
| Hold indexes total | `3` |
| Hold lifecycle triggers | `2` |
| Deterministic tenant/provider/external lookup | PASS |
| Two principals in one collision group | PASS |
| Duplicate collision identity | REJECTED |
| Cross-tenant resolution execution | REJECTED |
| Provider identity rebind | REJECTED |
| Active hold deletion | REJECTED |
| Resolution execution replacement | REJECTED |
| Client rows created | `0` |
| CrmClientLink rows created | `0` |
| LoyaltyTransaction rows created | `0` |
| Post-apply Prisma drift | NONE |
| Temporary clone databases remaining | `0` |

All clone fixtures used synthetic opaque references and disappeared with the
clone.

## 5. Production apply

Immediately before the write, production was rechecked:

- the hold migration was not applied;
- no migration was incomplete;
- the hold table was absent;
- non-idle and idle-in-transaction session counts were both zero;
- Client, CrmClientLink, and canonical LoyaltyTransaction counts were zero.

The standard project command `prisma migrate deploy`, with bounded statement
and lock timeouts, applied only
`20260831110000_unresolved_client_identity_hold`.

Prisma concluded:

`All migrations have been successfully applied.`

No manual production SQL schema change accompanied the migration. The active
runtime remained:

`/opt/maya-saas/releases/20260829-c06-p4-p402-loyalty-cutover-789a799a`

No symlink switch or service restart occurred.

## 6. Production post-apply verification

| Check | Result |
| --- | --- |
| Strict release preflight | PASS — database `ready` |
| Successful production journal rows | `65` |
| Pending migrations | `0` |
| Incomplete migrations | `0` |
| Applied hold checksum | exact committed checksum |
| Post-apply Prisma drift | NONE |
| Hold table | present |
| Hold rows | `0` |
| Hold foreign keys / unique indexes / total indexes | `2 / 2 / 3` |
| Hold lifecycle triggers | `2` |
| Client rows | `0` |
| CrmClientLink rows | `0` |
| Canonical LoyaltyTransaction rows | `0` |
| Grant / redemption / revocation rows | `0 / 0 / 0` |
| Legacy ledger | unchanged — `121 / 64,801` |
| Non-idle / idle-in-transaction sessions | `0 / 0` |
| Service state | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Priority service error lines in observation window | `0` |

No P02/P03 hold row was fabricated. The schema is now available for a later
separately approved runtime registration guard and later explicit hold-row
creation.

## 7. Process hygiene

All checks and production commands ran sequentially. No browser, Playwright,
watch mode, development server, spare-port runtime, or parallel heavy suite
was started.

One schema-release installation SSH process exceeded the first tool-yield
window. Its exact local PID/process group was recorded, it was allowed to
finish normally, and its termination was verified before the next heavy step.
No broad process termination command was used.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 2`

`TEMP DATABASES REMAINING: 0`

## 8. Verdict

`HOLD MIGRATION APPLIED: YES`

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HOLD TABLE/CONSTRAINTS PRESENT: YES`

`P02/P03 HOLD ROWS CREATED: 0`

`CLIENT/CRMCLIENTLINK CREATED: 0`

`LOYALTY VALUE MUTATIONS: 0`

`PRODUCTION HEALTH/READINESS: PASS`

`READY FOR RUNTIME REGISTRATION GUARD: YES`

`RUNTIME REGISTRATION GUARD WIRED: NO`

`IDENTITY ESTABLISHMENT STARTED: NO`

`FULL_LEDGER MIGRATION STARTED: NO`

`P4-03 CUTOVER STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. Runtime guard wiring, hold-row creation, safe identity establishment,
FULL_LEDGER migration, and P4-03 cutover remain separately approved steps.
