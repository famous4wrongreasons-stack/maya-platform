# Chapter 7 P04 — confirmed staff salary and private revenue goals

Status: package implementation and local validation passed in the isolated Wave 3 worktree. Coordinated regression and production acceptance remain with the parent wave.

Authority: Q08/Q09 and D06 Option A, with D09 access boundaries and the existing P01/P02 foundation. No schema, action, salary, goal, publication or retention owner is added.

## Integration and authority

`MeasurementStaffGoalReader(prisma, crm, context)` exposes `supports`, `authorize`, `read` and `assertPreparedCurrent` for the existing `staff_goal` intent/result. Shared `MeasurementSources` performs the remote read before the publication transaction and rechecks the prepared result inside it. The existing `MeasurementService` remains the sole publisher.

The query contract is `c7.staff-goal.read.v1`, with exact `Staff`, `configurationUserId`, tenant-local calendar month, provider and stored integration ID. Unsupported dimensions, branches, Client selectors and query additions are rejected before admission. An external source requires the active tenant-bound YClients integration and exactly one active `StaffProviderLink`; there is no global credential or inferred identity fallback.

- `analytics.employee.read` requires the current configuration owner's active User/Membership, exact own Staff, and current matching `CrmStaffAccess`/provider link. It never synchronizes staff access.
- `analytics.business.finance.read` uses the existing owner/business-owner/tenant-admin/administrator/accountant finance role set. Manager and branch-manager roles do not receive implicit business finance access. A finance owner can measure an exact active Staff without a Maya User; the owner's private configuration remains private.
- Internal-calendar scope explicitly uses `provider: internal` and no external integration selector. Without a verified payroll source/provider staff goal binding, monetary values remain unavailable.

## Salary and goal facts

The canonical `CrmService.getFinancialSummary` return type is reused through P02's exported type. An exact staff payroll row may be measured when that row is available and verified even if the company payroll aggregate is partial. Accrued and paid salary remain separate minor-unit facts, with source currency. Missing/duplicate/unverified rows, invalid money and unknown currency are not measured; no revenue percentage, default 0.5, forecast, upside or salary target is introduced.

The private revenue target is read only from `DashboardPreference(section=finance).configJson.staff_targets_rub[exactExternalStaffId]`. It requires schema version 1, representable RUB minor units, the latest target mutation for that exact user/tenant finance preference, its exact generation/hash, and a successful non-dry-run allowed A22 execution by that same user. Hash normalization reuses the existing pure `package5Wave1Hash`; the reader never constructs or invokes the A22 executor. Missing staff target never falls back to the company monthly target or another user's preference.

Observed revenue progress requires the exact calendar-month observation window, complete local-day coverage, verified provider-transaction revenue, one exact staff row, complete staff attribution, no untyped/negative discarded-operation gap, and currency compatible with the RUB target. The ratio records numerator, denominator and deterministic half-away-from-zero rounding to two decimal places. A zero target has no ratio. Revenue remains provider transaction revenue, separate from cash, net and salary. Progress is an observation against the private monthly plan, not a forecast or causal uplift.

MTD reads use only the exact completed local-day window through `asOf`; intraday requests are not widened. Current source/configuration observations are explicitly labelled as observations, not historical reconstruction. Configuration evidence newer than the requested `asOf` cannot prove a goal for that receipt. If no substantive salary/revenue/goal fact is measurable, the result is explicitly unavailable.

## Publication and evidence

Receipts retain at most nine typed source references and ten metrics, with hashes of selected source facts. Payroll names, raw provider responses and private configuration bodies are not retained. Each receipt preserves observed time, qualification, currency/basis and canonical period bounds. No remote call occurs inside publication.

The publisher shares the existing A22 advisory target lock, preventing a concurrent generation/preference change, including an absent-preference insertion. Current configuration, execution/mutation and tenant/viewer/staff/integration/access/link rows are rechecked under locks. A Staff `FOR UPDATE` read lock also prevents insertion of a second provider link through the Staff foreign key during publication. Authority or configuration changed while payroll was being read rejects stale publication; provider monetary facts retain explicit observed-at semantics. Shared lease fencing prevents an expired worker from publishing.

## Validation

- P04 unit and permanent architecture tests: **38 passed across 2 suites**, Node 22.23.2.
- P04 plus relevant P02 period/finance and shared identity/domain/action-ingress/wave guards: **106 passed across 9 suites**.
- Backend TypeScript build check, typed PostgreSQL proof execution, targeted ESLint and owned-file Prettier passed.
- `scripts/chapter7-staff-goal-proof.ts`: **9/9 PostgreSQL scenarios passed** against the exact owned `127.0.0.1:55517/maya_c7_replay`, user `maya_c7`. The script checks these coordinates before constructing Prisma and never loads application `.env`.
- Positive configuration evidence is created by the actual canonical A22 planner/executor and measured by the actual shared publisher. The proof covers Staff without User, private configuration isolation, independent salary qualification, source-owner byte equality, denied admission with zero new revisions, changed A22/link/access during remote reads, lease expiry plus same-receipt retry, and explicit unknown salary. Source transport is synthetic; no provider/production/old-database effect or teardown occurs.

The parent wave owns shared wiring, the combined gate, release and production verification. P06 owns consumer access/facade integration; this package does not replace current product salary/goal consumers itself.
