# Chapter 7 P02 — financial, expense, period and value facts

Status: implemented in the isolated Wave 2 worktree; package unit/architecture checks and disposable PostgreSQL proof passed. Combined gate and production acceptance remain with the parent wave. This document does not claim a P02 production cutover.

Authority: Q05/Q06/Q07/Q11, D01/D04/D05/D06/D07 Option A, the approved combined schema/action mapping, and the shared P01 `MeasurementRevision` foundation. P02 adds zero source models, fields, migrations, actions, publishers or retention owners.

## Integration

`MeasurementFinanceReader(prisma, crm, context)` exports `supports`, `authorize`, `read` and `assertPreparedCurrent`. It accepts the existing normalized measurement intent and returns the existing `MeasurementResult`. The shared `MeasurementSources` calls `read` before entering the publication transaction; the shared publisher invokes `assertPreparedCurrent` inside that transaction. P02 never publishes a revision itself.

- `business_period`: existing capability `analytics.business.finance.read`, query contract `c7.finance.read.v1`; exact tenant-wide scope. Staff/branch/service/caller coverage filters are rejected before admission because the canonical financial reader cannot honor them.
- `value_discrepancy`: existing capability `clients.dossier.read`, query contract `c7.value.read.v1`; exact canonical Client, optional exact canonical account ID. Active provider link, unresolved identity holds and account ownership are checked before admission and again before publication. Client without Maya User is supported.
- External reads require the active stored YClients integration's exact tenant, integration ID and provider. Internal-calendar business reads require explicit `provider: internal` and no external integration selector. Unsupported/missing authority is rejected; it never widens to tenant-wide or a global credential.
- Tenant/integration and value Client/link/account locks fence publication against authority changes. Financial/expense/booked values remain explicit observation snapshots with separate `asOf` and receipt `observedAt`; they do not claim reconstruction of historical source state.

## Financial facts (Q05)

The reader reuses `CrmService.getFinancialSummary` and the canonical revenue-basis contract. YClients returns inclusive local-day ranges, so the adapter call receives the last millisecond before C7's exclusive end. Only exact complete local-day windows use that reader. Intraday windows retain explicit unavailable finance rather than retrieving a wider day and presenting it as the requested interval.

Provider-reported gross, canonical booked prices, provider salary accrued, provider salary paid, cash, refunds and net remain separate. Gross has `provider_transactions` basis and is source-labelled/partial; it is not fiscal cash. Negative/zero/untyped discarded-operation counts and staff/service coverage retain their limitations. Missing refunds, cash and net are null even when discarded negative count is zero. Unknown salary/currency is never zero or implicit RUB. Currencies remain separate; no FX or valuation is introduced.

`measurementSalaryFacts` is a reusable normalization helper for later P04. It only exposes available/verified canonical payroll DTO totals; it never infers salary from revenue or a percentage.

## Expenses (Q06)

Expense rows retain exact source identities and use the existing canonical `foldExpenseRows`/`resolveExpenseCategory` arithmetic and aliases. Matching dates/amounts do not deduplicate rows. Mixed source sets retain unresolved overlap; recorded payroll is not combined with provider salary. The current existing declaration and invalidation epoch are read for the exact local-day window, but their presence does not manufacture complete refund/cash evidence.

Accepted `Expense.category` values are preserved verbatim as raw-category evidence, alongside canonical category, source and amount. Hash dimensions join that evidence without exposing provider operation identifiers. Notes, contacts and provider payloads are not selected or retained.

Bounds are explicit and fail closed:

- At most 10,000 expense rows plus one overflow sentinel are read. Overflow makes the entire expense total/count unavailable; the first 10,000 are never labelled a period total.
- At most 24 raw source/category/currency groups and 240 characters per retained label. An oversized raw breakdown is unavailable as a whole while representable canonical totals remain exact.
- More than eight currency groups or more than the shared 256 metrics closes the financial result unavailable. Malformed source currency/money and exact identity conflicts close that source's values unavailable; implementation and authority errors are not swallowed.
- Receipts are bounded normalized query hashes, not copied row payloads. Expiration remains the existing shared 365-day derived-artifact policy.

## Period comparisons (Q07)

Pure helpers preserve canonical half-open bounds and tenant-local month/day boundaries, including DST. A main comparison requires identical basis, currency, unit and timezone, complete evidence over both exact windows and no overlapping windows. Equal-elapsed comparison refuses current MTD versus a complete prior month. Complete calendar months with different lengths require the explicit complete-month mode. The previous-month helper returns equivalent elapsed bounds only when they fit in the prior month.

Ratios retain delta numerator, previous-period denominator and deterministic half-away-from-zero rounding to two decimals. Zero/negative baselines have no percentage. Missing currency, malformed times, unknown values and partial windows have no growth/decline claim.

## Value discrepancy (Q11)

The package reuses exact `CrmClientLink` identity and `getClientLoyaltyEvidenceByExternalIdReadOnly`, plus canonical `LoyaltyAccount` and a bounded latest-ledger query/count. A wrong/absent provider Client or card produces unknown provider value. Account and provider balances stay in points with no currency valuation. A measured difference is explicitly between source observations and remains partial; the provider lacks a common source timestamp. A canonical account changed after the requested cutoff cannot support a historical discrepancy. Missing or timestamp-tied latest ledger rows do not cause ledger reconstruction. No mint, import, correction, settlement or value mutation is invoked.

## Validation

- Targeted P02 unit and permanent architecture suites: **41/41 passed** under Node 22.23.2.
- Backend and script TypeScript checks passed. All owned TypeScript files passed targeted ESLint and Prettier; the parent runs the combined final checks.
- `scripts/chapter7-finance-proof.ts`: **9/9 passed** on the parent-owned disposable `127.0.0.1:55517/maya_c7_replay` using user `maya_c7`. The script hard-refuses other host/port/database/user combinations and never loads application `.env`.
- PostgreSQL proof exercised the actual shared publisher, pre-admission cross-client/account/link denial with zero revisions, exact end exclusion, raw labels/currency separation, unavailable cash/refund/net, Client without Maya User, immutable prior publication, integration/link changes during remote reads, lease expiration and same-row resume, and zero source/action creation by measurement. A short initial lease passed the real SQL claim guard to avoid a 60-second fixture delay.
- Proof source transport is deterministic synthetic data, not a live provider call. No production, old-database, provider or delivery effect occurred. No database cleanup is performed by the proof.

Permanent ratchets cover all P02 classes for source/value writes, SQL mutations, parallel publication, raw payload/secret/PII retention, legacy User authority, noncanonical provider methods, fuzzy expense matching and loss of bounded query protection. The shared parent gate remains responsible for whole-repository checks and final production evidence.
