# CYCLE 06 BLOCKING PACKAGE 4 — FINAL ADVERSARIAL VERIFICATION BLOCKER REPORT

Status: **FAIL — production-reachable loyalty value bypass found**

Source checkpoint: `1af556f6`

Active production release:
`20260903-c06-p4-p410-final-cutover-8f4e113a`

Report date: 2026-09-03

## 1. Gate outcome and mandatory stop

The final Package 4 verification rebuilt the production write inventory from
the current source and deployed artifact instead of summing the P4-02 through
P4-10 completion reports. That scan found a production-reachable value writer
outside Action Engine:

`authenticated read surface`

→ `LoyaltyService.getForUser`

→ `getExternalAccount`

→ CRM or legacy-bridge balance snapshot

→ direct `LoyaltyAccount.upsert(balance=...)`.

This is an accepted STOP condition. The cycle did not change runtime or
schema, did not create a new family, and did not continue into clean migration
replay, the simultaneous ratchet run, full regression, build, or deployment.

## 2. Fresh production mutation inventory

The inventory covered Nest/TypeScript Prisma writes, raw SQL call sites,
legacy Python/database writers, scheduler/webhook/admin entry points, action
registrations, and the currently deployed compiled loyalty surface. The broad
TypeScript scan found `299` non-test Prisma write call sites across `42` files;
the value-model pass then classified the relevant sites by owner instead of
treating every database write as customer value.

| Package 4 slice | Current mutation owner found by the fresh scan | Result |
| --- | --- | --- |
| A08 appointment payment write | registry/provider tombstone | physically disabled |
| P4-02 internal loyalty adjustment | `LoyaltyService` → Action Engine → canonical transaction owner | canonical |
| P4-03 earn/expire/redeem/refund/import/backfill/grants | P4-03 canonical executor; guarded Python writers | canonical for the accepted eight classes |
| P4-04 referral/reward | P4-04 canonical executor | canonical |
| P4-05 subscription lifecycle/usage | P4-05 canonical executor | canonical |
| P4-06 certificate lifecycle/redemption | P4-06 canonical executor | canonical |
| P4-07 expense/declaration lifecycle | P4-07 canonical executor | canonical |
| P4-08 billing/payment-derived entitlement | P4-08 canonical executor | canonical |
| P4-09 value-bearing offers/referral policy | P4-09 canonical executor | canonical |
| P4-10 commerce credentials | P4-10 canonical executor | canonical |
| external CRM loyalty balance cache | `LoyaltyService.getExternalAccount` direct Prisma upsert | **bypass** |
| legacy Maya loyalty balance cache | `LoyaltyService.getLegacyMayaAccount` direct Prisma upsert | **bypass** |

The value-model scan also re-observed ordinary inventory catalog CRUD and
internal-calendar service price CRUD. The accepted Package 4 source Gate
places ordinary A27 inventory and A28 internal-calendar content in Package 5,
not in the frozen customer-value scope. They are recorded here so they do not
disappear from the later write-plane inventory, but they are not the blocker
reported by this Gate.

No additional raw-SQL monetary writer was found outside the known canonical
executors before the mandatory stop. Test/proof/migration scripts were not
counted as production owners; their isolation does not excuse the live
`LoyaltyService` writer.

## 3. Exact blocking implementation

### 3.1 CRM snapshot subgroup

For a tenant using an external calendar, `getForUser` calls
`getExternalAccount`. The method obtains a provider snapshot through
`CrmService.getClientLoyalty(tenantId, phone)` and directly upserts:

- `LoyaltyAccount.source`;
- `LoyaltyAccount.balance`;
- `LoyaltyAccount.externalReference`;
- `LoyaltyAccount.syncedAt`.

The write has no Canonical Action Ingress, no `ActionExecution`, no immutable
migration/claim identity, no `LoyaltyTransaction`, and no canonical executor.
It is an absolute-balance overwrite triggered by a read request.

The lookup is also weaker than the canonical P4-03 owner contract. It starts
from a User phone, enumerates provider clients with that phone, and returns the
first client with a loyalty card. The separate exact-external-id read helper
used by canonical P4-03 paths is not used here. The balance write therefore
does not prove the exact tenant-qualified `Client` owner or consult the
P02/P03 unresolved-identity hold at the mutation boundary.

### 3.2 Legacy bridge subgroup

Before CRM lookup, `getExternalAccount` invokes `getLegacyMayaAccount`. When
the loopback bridge and tenant allowlist are configured, this method fetches a
legacy balance and directly upserts the same canonical account with:

- `source = legacy_maya`;
- `balance = normalizedBalance`;
- `externalReference = NULL`;
- a new `syncedAt`.

This path also has no ActionExecution, canonical ledger row, deterministic
claim, policy/approval boundary, or P4-03 canonical executor. The legacy
bridge is therefore still a reachable value owner, despite the eight old
Python mutation classes being frozen.

### 3.3 Production reachability

The call is not dead compatibility code. Current non-test callers include:

- authenticated `GET /loyalty/me`;
- authenticated admin customer-loyalty read;
- customer portal overview;
- the AI read-own-loyalty tool;
- another shared loyalty read facade.

Read-only production inspection established:

- active release contains the same `LoyaltyService` implementation;
- the compiled artifact contains four `loyaltyAccount.upsert` sites and six
  direct balance-write occurrences;
- two production tenants use the external calendar source;
- one active YClients CRM integration exists;
- the legacy bridge token and tenant allowlist are configured;
- current accounts are `22` internal plus `1` `legacy_maya` account;
- current canonical balance/ledger aggregates still reconcile at
  `64581 / 64581` points.

No read endpoint was invoked to force a provider refresh, so this verification
caused no production value mutation.

## 4. Existing tests and ratchet gap

The focused loyalty suite passed `1/1` suite and `9/9` tests. It does not deny
the bypass: it explicitly asserts that an external CRM value is stored in the
account and that a legacy-bridge value is returned after the direct upsert.
The test named “keeps external CRM balances read-only” protects only the admin
adjustment command; it does not make the read-time snapshot sync read-only.

The P4-03 cutover ratchet enumerates the accepted eight Python subgroups. It
does not scan `src/loyalty/loyalty.service.ts` for compatibility balance
writers. Consequently all family ratchets can be green while this direct
production writer remains reachable. Adding this filename to an allowlist or
broadly excluding compatibility/read services would weaken the architecture
and is not an acceptable correction.

## 5. Contract decision required before a fix

This report does not choose a new business rule. A separate approved closure
must decide how externally authoritative CRM/legacy balances coexist with the
P4-03 canonical client-owned ledger. At minimum it must select and prove one
of these boundaries:

1. make provider/legacy balance reads genuinely read-only views and never
   overwrite canonical account value; or
2. model an explicit canonical snapshot/import action with exact Client
   identity, hold enforcement, deterministic claims, ledger/reconciliation
   semantics, and Action Engine ownership.

After that decision, the Package-level ratchet must narrowly forbid any
production-reachable write to `LoyaltyAccount.balance` or
`LoyaltyTransaction` outside the approved canonical executors while retaining
proof/migration isolation. No correction was implemented automatically.

## 6. Verification completed before STOP

| Check | Result |
| --- | --- |
| Git source | `HEAD = origin = 1af556f6`; unpushed commits `0` before this report |
| Active production release | `20260903-c06-p4-p410-final-cutover-8f4e113a` |
| Production strict release preflight | PASS; `69` local / `72` recognized applied migrations; pending `0` |
| Prisma production migration status | up to date |
| Production schema drift | `NONE` (`No difference detected`) |
| Production health/readiness | PASS |
| Production service restarts | `0` |
| Priority service errors since release | `0` |
| Focused loyalty suite | PASS, `1/1` suite and `9/9` tests |
| Clean migration replay | NOT RUN — mandatory blocker STOP |
| Simultaneous Package 4 ratchet gate | NOT RUN — mandatory blocker STOP |
| Full backend regression | NOT RUN — mandatory blocker STOP |
| Typecheck / ESLint / build | NOT RUN — mandatory blocker STOP |
| Deployment | NOT RUN |

## 7. Final verdict

`PACKAGE 4 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 4 COMPLETE: NO`

`PACKAGE 4 FAMILIES COMPLETED: ALL INDIVIDUAL REPORTS; AGGREGATE COMPLETION REJECTED`

`PRODUCTION VALUE EXECUTION OWNER: MIXED — ACTION ENGINE + LOYALTYSERVICE COMPATIBILITY SYNC`

`PRODUCTION VALUE EXECUTION OWNERS OUTSIDE ACTION ENGINE: 1`

`PRODUCTION DIRECT VALUE MUTATION BYPASSES: 2`

`LEGACY VALUE FALLBACKS: 1`

`DUPLICATE VALUE MUTATION POSSIBLE: YES — SNAPSHOT APPLICATION HAS NO CANONICAL CLAIM`

`BLIND RETRY AFTER UNKNOWN: NOT RE-PROVEN — GATE STOPPED AT BYPASS`

`RECONCILIATION REQUIRED PATHS COVERED: NOT RE-PROVEN`

`TENANT ISOLATION: INCOMPLETE — EXACT CLIENT OWNER NOT ENFORCED BY BLOCKING PATH`

`POLICY/APPROVAL/BLAST-RADIUS: NOT ENFORCED BY BLOCKING PATH`

`HISTORICAL/FROZEN VALUE PRESERVED: NOT GUARANTEED BY BLOCKING PATH`

`P02/P03 HOLD PRESERVED: NOT GUARANTEED BY BLOCKING PATH`

`RAW PAYMENT CREDENTIAL LEAKAGE: NO NEW FINDING BEFORE STOP`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`FULL REGRESSION GATE: NOT RUN — BLOCKER STOP`

`REAL PRODUCTION VALUE MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 8. Process hygiene

All commands were foreground and self-terminating. No test server, watcher,
browser, Playwright process, or temporary database was started.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Package 4 remains incomplete until the exact compatibility balance
writer contract is approved, implemented, ratcheted, and the final aggregate
Gate is rerun.
