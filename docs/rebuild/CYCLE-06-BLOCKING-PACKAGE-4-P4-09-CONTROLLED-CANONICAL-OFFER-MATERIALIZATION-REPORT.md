# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 CONTROLLED CANONICAL OFFER MATERIALIZATION REPORT

Date: 2026-09-03  
Scope: controlled read-first establishment of the nine approved production
offers in `TenantCatalogItem` and immutable initial value versions  
Runtime cutover: **not performed**

## 1. Outcome

The approved production business tenant now has exactly six canonical
membership offers and three canonical gift-certificate offers. Every offer was
created through the owner-approved P4-09 Canonical Action Ingress and Action
Engine executor. Each offer has one immutable version `1`, an immutable Maya
internal offer identity, the exact approved template key and value, and no
replacement predecessor or external identity alias.

No checkout, payment, subscription, certificate, referral reward, loyalty
transaction, provider request, or customer-value fact was created or changed.
The active runtime release and service were not restarted or switched.

## 2. Exact production target

The read-only tenant topology preflight found exactly two active tenants:

| Anonymous tenant class | Durable production evidence |
| --- | --- |
| Platform shell | `platform_bootstrap=true`; no membership, branch, Client, CRM integration, entitlement, billing payment, or catalog row |
| Business tenant | one active owner membership, one branch, 23 Clients, one active CRM integration, three active entitlements, one plan, RUB currency |

There was therefore exactly one admissible materialization target. Its
non-PII fingerprint is `ac0ea136a752af85`. The runner fails closed if this
topology, owner authority, currency, branch/Client evidence, CRM evidence, or
entitlement evidence changes.

## 3. Deterministic source manifest

The source contract compares the complete exported P4-05 and P4-06 static
catalog keysets against the approved P4-09 template keysets before producing a
plan. Extra, missing, duplicate, wrong-kind, retired, or cross-tenant rows stop
the run.

- source manifest contract: `maya.p4-09-canonical-offer-materialization/1`;
- source manifest checksum:
  `1ebc28e10e97a2a1fb2e29289457220d786ea6a4264194c3a0257382842d1c68`;
- source rows: `9/9`;
- membership rows/value: `6 / 2,200,000 kopecks`;
- certificate rows/value: `3 / 1,000,000 kopecks`;
- currencies: RUB only;
- ambiguous mappings: `0`;
- external aliases used as identity: `0`.

| Kind | Canonical template | Exact value | Immutable offer identity | Immutable initial version identity |
| --- | --- | ---: | --- | --- |
| membership | `haircut.senior` | 330,000 RUB kopecks | `p409_offer_WCm60fB6F6hPkq2RRK7ReeJmDJBSQEF4DQ61` | `p409_ver_VMoza3tTwBev4zB4_eGjamAHufJZuA5EK4GHRGG7` |
| membership | `haircut.top` | 370,000 RUB kopecks | `p409_offer_pHSdiLMzzt3_ZTTAp3tEQ9nhspPIgzRuSCeh` | `p409_ver_5TYhjx4xxUGHvSbKXoqPq6YQlLqSxxdtAn5lSRhe` |
| membership | `complex.senior` | 520,000 RUB kopecks | `p409_offer_TOkv7YTvzXo9zeeYQnr4M-uGaESPV4lz2LVj` | `p409_ver__Db_Sj7KcWH_VgKdII4HBh4RNGWvUFzP_Hest-D6` |
| membership | `complex.top` | 600,000 RUB kopecks | `p409_offer_RBWCaIVI08Irfje-GpRxGsigjNnfqp4EGYEx` | `p409_ver_DK_6iWur31nA5A_TGWF79h0RYyTA6VlpzDmZ9dHR` |
| membership | `beard.senior` | 170,000 RUB kopecks | `p409_offer_t0BHZYbGqJmgbwdPSr35EfUrI2ef2-2-7g7E` | `p409_ver_1yREhvtH9vhu__lZjdtNjEdikHmzvGqAVAm7M6pw` |
| membership | `beard.top` | 210,000 RUB kopecks | `p409_offer_TWjFJZj_CE-R-oO1zMhnGGQUBLo-D5g6zlle` | `p409_ver_EAwU8Um5R01IGmtb9wWVGrC-vFhIqqcnxOcVB7jS` |
| certificate | `gift-certificate.2000` | 200,000 RUB kopecks | `p409_offer_2jA8-oUs5W-jtsOx_oUe4zzsE6J3KBIHQ4oG` | `p409_ver_bsZ1kp07RTKyniuWGxpC2Do78O4lK3cuoOSxhPxl` |
| certificate | `gift-certificate.3000` | 300,000 RUB kopecks | `p409_offer_P-javvhx4lG13m0e1rjJPdf5yQQ06L88voW5` | `p409_ver_FJOM5S7Ac1aC9WgGM5Y7K48uNGHNkmeZEr6tyztG` |
| certificate | `gift-certificate.5000` | 500,000 RUB kopecks | `p409_offer_wBKIunuWsBRhykrfnPMIDpX01E73I8Tk1OxU` | `p409_ver_tulOLmfohjx2nZoO5WfmijTC7LW7Ru96Vu6b9Uv1` |

The mapping manifest checksum, including exact source facts and deterministic
target identities, is:

`0f7d188971cd368014d15515f71d6433303cee6fc01dfb5ec3c18b29890fb75f`.

## 4. Guarded runner and local proof

Commit `5023392a` added a narrow operational runner and immutable source
contract. Apply is impossible unless all three controls are present:

1. explicit `--apply` mode and the exact confirmation phrase;
2. the exact mapping manifest checksum from the production dry-run;
3. the exact production-state checksum from the same dry-run.

The runner derives the one active owner from tenant-scoped durable membership
state, requires owner approval in the Action Engine, and never constructs a
provider adapter. Customer-value and payment tables are hashed before and
after apply; any change aborts the run.

A disposable PostgreSQL replay exercised the whole sequence:

`all migrations → exact topology → dry-run 9/9 → apply 9/9 → dry-run 0/0`.

The proof confirmed P4-05 and P4-06 canonical resolver coverage at `100%`, no
duplicate rows, no replacement lineage, unchanged customer/payment state, and
no external dispatch. Seven targeted P4-09 Jest suites passed (`35/35` tests),
as did targeted ESLint, application typecheck, scripts typecheck, and build.

## 5. Production dry-run and apply

Before apply:

| Check | Result |
| --- | --- |
| Tool commit / origin | `5023392a` / exact match |
| Strict production preflight | PASS |
| Pending migrations | `0` |
| Production health/readiness | HTTP `200 / 200` |
| Exact mappings | `9/9` |
| Would create offers / versions | `9 / 9` |
| Duplicate or ambiguous mappings | `0` |
| Replacement lineage | `0` |
| Production configuration writes during dry-run | `0` |
| Customer value / payment / provider writes during dry-run | `0 / 0 / 0` |

The accepted pre-apply state checksum was
`7e02f989134ecbccb6da625d151b8926545dc3db4601b9de5481f404c58cc661`.
The apply process recomputed both checksums immediately before its first write
and received an exact match.

The canonical executor then committed nine independent, restart-safe local
PostgreSQL actions. Production contains:

- `9` owner-approved, non-dry-run `SUCCEEDED` ActionExecutions;
- `9` `SUCCEEDED` ActionAttempts with `externalDispatchState=NOT_CROSSED`;
- `9` exact ActionExecution-to-version bindings;
- `9` offer-version audit facts;
- `9` TenantCatalogItems and `9` immutable initial versions.

All nine actions finalized between `2026-09-03 06:19:28.585 UTC` and
`2026-09-03 06:19:29.153 UTC`.

## 6. Independent post-apply reconciliation

| Check | Result |
| --- | --- |
| Exact canonical offers / initial versions | `9 / 9` |
| Membership offers / aggregate | `6 / 2,200,000 kopecks` |
| Certificate offers / aggregate | `3 / 1,000,000 kopecks` |
| Initial active version facts | `9/9` |
| Duplicate template authorities | `0` |
| Fabricated replacement lineage | `0` |
| Non-null external aliases | `0` |
| P4-05 canonical offer resolution | `6/6 = 100%` |
| P4-06 canonical offer resolution | `3/3 = 100%` |
| Re-run would create offers / versions | `0 / 0` |
| Re-run mapping checksum | exact original checksum |
| CustomerSubscription / GiftCertificate / ReferralReward | unchanged at `0 / 0 / 0` |
| LoyaltyAccount / LoyaltyTransaction | unchanged at `23 / 121` |
| BillingPayment | unchanged at `1` |
| Exact customer-value digest before/after | unchanged |
| Exact payment digest before/after | unchanged |
| Pending migrations | `0` |
| Prisma schema drift | NONE (`No difference detected`) |
| Priority service errors after apply | `0` |
| Production health/readiness | HTTP `200 / 200` |
| Active release | unchanged: `20260903-telegram-reports-c1fccfcc` |

No production runtime cutover, service restart, checkout, payment, certificate
issuance, subscription activation, referral issuance, loyalty mutation,
provider write, or customer communication was performed.

## 7. Process hygiene

Five disposable local PostgreSQL clusters were created during runner proof and
fixture correction. Every cluster had an owned postmaster PID, was stopped and
waited, and its directory was removed. The production runner used one isolated
staging bundle; no process remained attached to it, and the bundle was removed
after reconciliation. No browser, Playwright, Chrome, watcher, or temporary
application server was started.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

## 8. Verdict

`CANONICAL OFFERS MATERIALIZED: 9/9`

`INITIAL OFFER VERSIONS MATERIALIZED: 9/9`

`DUPLICATES: 0`

`RE-RUN CREATES NEW ROWS: 0`

`P4-05 OFFER COVERAGE: 100%`

`P4-06 OFFER COVERAGE: 100%`

`HISTORICAL/FROZEN VALUE CHANGED: NO`

`REPLACEMENT LINEAGE FABRICATED: NO`

`CUSTOMER VALUE CREATED: 0`

`PAYMENTS/PROVIDER WRITES: 0`

`READY FOR P4-09 PRODUCTION CUTOVER: YES`

STOP. P4-09 production runtime cutover was not started.
