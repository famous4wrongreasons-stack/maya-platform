# R14 — cash observation and immutable correction Decision Sheet

**PROPOSAL — NOT APPROVED. E3 Stage 1; documentation only.** Baseline `60e82664`, production runtime `42962475` after accepted Wave R-B. Scope is fixed by the [complete master inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md) and its [machine-readable package definitions](evidence/package5-remainder-inventory-final.json). No new discovery, runtime/schema/test implementation, DB access, production call or deployment occurred in this assessment. B36 remains applied schema / runtime not deployed, with its two known proof defects unchanged.

Counts below are **new persisted database columns, including columns in new models**. Prisma virtual relation properties are listed separately and are not counted as columns. New action totals include separately named AE and AC6 classes. Contract/enum additions to an existing class are explicit proposals, not implicit approval. Option B counts are all zero and require no migration/backfill; it retires the package's legacy behavior instead of preserving it.

## Options and recommendation

| Option | Contract | New models / DB columns / action classes | What user/business loses |
| --- | --- | --- | --- |
| **A — RECOMMENDED** | One append-only canonical human cash-count declaration per tenant/branch/day, with explicit replacement/withdrawal and canonical receipts. No automatic cash reconciliation claim. | **1 / 18 / 3**: 2 AE + 1 AC6 | Legacy second number (`day_cash`) and automatic discrepancy calculation disappear. Declarations no longer overwrite history or imply cash profit, sales attribution or till reconciliation. Authorized users must explicitly confirm the branch/time/count; administrators without the proposed finance roles lose native entry. |
| B | Retire `/kassa`, its SQLite writer and its owner-report input. Leave existing provider revenue reads under their current contracts. | **0 / 0 / 0** | Maya no longer captures human physical cash counts. Provider revenue is not a replacement for a physical count. |

**WHY A:** source code compares a number labelled cash received for the day against revenue minus expenses, while expenses have no payment-method attribution and opening cash, transfers, refunds and withdrawals are not a complete canonical ledger. That cannot truthfully become reconciliation. A bounded human observation is useful and can be governed without inventing a cash account/transaction subsystem. YClients/provider cashbox and revenue remain their own source of truth; the new record explicitly means **a person's declared observation**, never a replacement provider accounting fact. A full reconciliation option is intentionally not proposed without a proven opening-balance/movement/attribution contract.

## Exact contract proposed for approval

Canonical owner: a new **Cash Declaration** domain adapter under finance, using existing A16 principal/policy, actor confirmation and Action Engine execution primitives. It does not call `Expense.create`, create an ExpensePeriodDeclaration, book provider revenue, update cashbox balances or mutate YClients. New AE classes are `declare_cash_position` and `correct_cash_position`. No generic finance action or second execution lifecycle.

Authority: proposed v1 roles `tenant_owner`, `business_owner`, `accountant`, current active User and exact tenant Membership/access. Existing `expenses.core` is only the proposed finance-feature availability gate; the new cash-specific policy/confirmation governs this different action and does not borrow permission to write Expense. A raw chat/admin/founder projection or historical `entered_by` is insufficient. Native `/kassa` may initiate an exact canonical card; only its authenticated requester confirmation invokes the owner. Neither the scheduler nor a report reader can declare cash. This role/gate mapping is a new explicit decision; it is not already approved merely because expense policy exists.

Observation scope: the aggregate physical cash counted at **one exact existing canonical Branch**, not an invented drawer/account. Branch is required even for a one-branch tenant; the server may resolve one unambiguous current branch but must show it on the card. V1 is RUB only, integer kopecks `0..1000000000`; countedAt is an explicit non-future observation timestamp and businessDay is its local date in the frozen branch timezone (or canonical tenant timezone fallback). No current-day or old-message inference. Recording later must clearly show both countedAt and createdAt; it never proves historical balances.

First declaration: one immutable COUNT revision 1 for tenant/branch/businessDay, with actor, exact observation time, normalized intent, confirmed AE and generation. Correction: explicit expected current declaration ID/revision, same tenant/branch/day, then a new revision. A replacement is another COUNT with a mandatory bounded explanation; a withdrawal is WITHDRAWAL with a mandatory explanation and **null amount**, never fake zero. This is a subcase of `correct_cash_position`, not a third action. A withdrawn latest revision means no currently asserted count; a later replacement requires another explicit correction. Wrong-branch/day corrections withdraw the erroneous observation and require a separate first declaration for the correct scope; no hidden cross-scope move or atomic claim about both operations.

Report projection: expose latest declared count or withdrawn/unavailable state, observation/recording times, exact branch, canonical declarer and revision. Historical canonical revisions remain auditable. Do not subtract all Expense rows as cash expenses, infer daily retained cash from gross receipts, compare across unknown scopes, infer opening float, or label a difference reconciled. `day_cash` is not imported or silently renamed. Legacy raw actor IDs never become verified declarers. Current provider analytics may be displayed separately with its existing coverage/unavailable qualifiers; it cannot resolve a missing human cash observation or classify every expense's payment method. B55-owned report inputs can be remediated without changing B36's unrelated daily-report WIP.

Identity: exact tenant + actor + action + caller UUID in existing AE `idempotencyScope`/`requestIdempotencyKeyHash` with tenant uniqueness, independent of requested amount. Trusted normalized-input comparison makes same key/same intent resume the same AE and declaration; changed amount, countedAt, branch, day, predecessor, kind or reason is `IDEMPOTENCY_CONFLICT`. B31's Client-qualified alias model is not reused. Separate keys for an initial count still converge on the business unique tenant/branch/day/revision boundary: one accepted revision, other first requests receive an explicit already-declared/stale-version conflict; no duplicate policy is invented. Concurrent corrections to one predecessor have one successor. A subsequent correction must target the actual newly current predecessor and receive fresh confirmation.

The canonical executor locks that tenant/branch/day target and atomically writes the immutable declaration, ActionTargetMutation generation, audit and AE success. New-row execution FK is unique. Restart/ambiguous commit reconstructs the same execution and record; it cannot choose a new key or convert uncertainty into a second observation. No provider dispatch exists in this operation, so provider UNKNOWN is not applicable. A lost local DB response requires readback of the same canonical transaction outcome; no blind write. Distinct branch/day declarations are independent; no partially completed broadcast, batch receipt or cross-channel retry is introduced.

Fingerprint: domain-prefixed SHA-256 over a versioned typed canonical encoding of tenant, branch, actor/current membership, businessDay, IANA timezone, exact UTC countedAt, RUB, integer kopecks/null, COUNT/WITHDRAWAL, expected predecessor ID/revision and NFC normalized bounded reason. Explicit field/key/null/date/unit normalization, never raw JSON serialization, chat IDs, request metadata or random transport timestamps. Source/caller identity and canonical intent are separate. Persisted intentHash must agree with the associated AE normalized intent.

## Exact schema mapping — Option A

**New model `CashDeclaration` — 18 persisted columns.**

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `String / text` | UUID primary key |
| `tenantId` | `String / text` | Exact canonical tenant |
| `branchId` | `String / text` | Exact existing Branch; aggregate physical cash at this branch |
| `businessDay` | `String / char(10)` | Local YYYY-MM-DD matching countedAt |
| `timezone` | `String / text` | Frozen branch timezone or canonical tenant fallback |
| `countedAt` | `DateTime / timestamptz` | Explicit observation time; no inferred historical count |
| `currency` | `String / char(3)` | RUB only in v1 |
| `countedCashKopecks` | `Int? / integer` | COUNT: 0..1000000000; WITHDRAWAL: null, never fake zero |
| `declarationKind` | `String / text` | COUNT \| WITHDRAWAL |
| `revision` | `Int / integer` | 1 for first count; predecessor +1 for correction/withdrawal |
| `previousDeclarationId` | `String? / text` | Exact preceding declaration, same tenant/branch/day |
| `actionExecutionId` | `String / text` | Exact canonical declaration/correction execution |
| `declaredByUserId` | `String / text` | Canonical actor, checked against membership/execution |
| `declaredByMembershipId` | `String / text` | Exact current admitted membership |
| `contractVersion` | `Int / integer` | 1; immutable interpretation/normalization |
| `intentHash` | `String / char(64)` | Canonical declaration intent hash |
| `encryptedReason` | `String? / text` | Mandatory bounded correction/withdrawal explanation; retention may erase ciphertext |
| `createdAt` | `DateTime / timestamptz` | Server commit time |

**Total: 1 new models; 18 new DB columns.** New Prisma virtual relations (10, zero columns): `CashDeclaration.tenant`, `Tenant.cashDeclarations`, `CashDeclaration.branch`, `Branch.cashDeclarations`, `CashDeclaration.declarerMembership`, `Membership.cashDeclarations`, `CashDeclaration.execution`, `ActionExecution.cashDeclaration`, `CashDeclaration.previousDeclaration`, `CashDeclaration.nextDeclarations`.

Uniques: `(id,tenantId)`, `(tenantId,branchId,businessDay,revision)`, `(tenantId,actionExecutionId)`. Exact composite Branch, Membership and ActionExecution FKs, RESTRICT; predecessor FK `(previousDeclarationId,tenantId)` plus same branch/day and predecessor+1/current-generation checks. Add shared `Membership @@unique([id,tenantId])` constraint once (no field). Actor must match the linked membership and execution. SQL checks enforce amount/kind/nullability, version/currency, first COUNT, required correction reason at admission and valid date/time relation. Append-only guard blocks update/delete; only the proposed bounded retention action may erase reason ciphertext. No mutable latest pointer or new state/counter/lease columns; current revision is an indexed projection. The actor's historical role/confirmation evidence remains in the existing immutable AE contract.

**Retention/lifecycle.** Proposed AC6 class `purge_cash_declaration_reason_payloads` may erase only new-model encryptedReason after seven calendar years from createdAt, with no live execution/reconciliation reference. Amount, canonical references, versions, intent/idempotency hashes and withdrawal history remain; no automatic row deletion is authorized. This retention horizon is a proposed product choice, not a legal assertion. Pure read expiry never mutates the ledger. Provider data, Expense, existing retention classes and old SQLite data are outside this purge permission.

**Migration/backfill.** One new table with the exact columns/constraints, and shared exact-Membership constraint; no new columns in old models. **Migration YES; backfill NO.** Legacy cash_log is retained only as non-authoritative historical source, not converted into a verified declaration or opening balance. A future human can submit a new explicit observation with its own authority/time; migration cannot manufacture that evidence.

## Acceptance and permanent ratchet

After approval prove exact current actor/tenant/branch/feature/confirmation; raw admin or other-tenant requests rejected before execution; amount/time/currency and missing branch rejected; first/concurrent declaration; same/changed key; duplicate business identity under different keys; stale/concurrent correction; withdrawal is not zero; wrong-scope correction cannot move a record; DB restart/uncertain response returns same declaration/AE; immutable history and exact canonical declarer; no Expense/provider mutation; pure read report projection with honest unavailable/unreconciled status; legacy rows never imported or used as current cash authority.

Permanent AST/call-graph ratchet covers `/kassa`, `database.set_cash_log/get_cash_log`, daily/owner report input consumers and new cash declaration adapter/executor. Only the exact canonical executor and scoped AC6 leaf may write the new table. Direct/aliased SQLite upsert, route-level declaration write, raw actor fallback, invocation of Expense.create as cash, direct provider mutation and read-time repair must fail. Negative fixtures mutate actual producer bodies to insert writes before/after valid delegation and to reintroduce the false cash-minus-all-expenses calculation. Existing A16/R02/R10/AE and finance projection regressions remain package proof; none were run in this documentation-only stage.

## Evidence and assessment

This assessment uses accepted local source captures, not a new production scan. R-B verification: [production proof](evidence/package5-wave-rb-production-proof.json). Exact per-file hashes and source-view distinction are in [package assessment](evidence/package5-remainder-e3-r14-assessment.json). Current R02 principal checks are acknowledged; legacy raw-principal descriptions in old inventory are not claimed to be unchanged. The remaining owner/write gap is still the same inventoried blocker.

- Captured production `bot.py:4853` — /kassa current R02 authority followed by direct mutable declaration.
- Captured production `database.py:2195` — cash_log per-date mutable upsert and reader.
- Captured production `webhook_server.py:4511` — Legacy report compares gross cash input with revenue minus all expenses.
- Repository `maya-saas-backend/prisma/schema.prisma:1681` — Expense lacks cash payment, account, float/transfer attribution.
- Repository `maya-saas-backend/src/crm/adapters/yclients-crm.adapter.ts:2930` — Provider cash-account aggregation and discarded negative-transaction evidence.
- Repository `maya-saas-backend/src/analytics/operations-analytics.service.ts:160` — Existing scope/coverage reasons for finance unavailability.
- Repository `maya-saas-backend/prisma/schema.prisma:629` — Existing exact canonical Branch.
- Repository `maya-saas-backend/prisma/schema.prisma:375` — Existing tenant-qualified AE caller idempotency binding columns.

```text
PACKAGE: R14
BLOCKERS INCLUDED: [B55]
CANONICAL OWNER: Proposed Cash Declaration owner over human observations; existing AE, separate from Expense/provider accounting
RECOMMENDED OPTION: A
EXISTING FOUNDATION SUFFICIENT: NO
BUSINESS DECISION REQUIRED: YES
SCHEMA REQUIRED: YES
NEW MODELS: 1
NEW FIELDS: 18
NEW ACTION CLASSES: 3 (2 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
RUNTIME-ONLY: NO
TECHNICAL PREREQUISITES SATISFIED: YES (R02 production PASS; existing AE/owner primitives available)
DEPENDENCIES SATISFIED: NO (the package's explicit owner/schema approval is pending)
IMPLEMENTATION READY AFTER APPROVAL: YES
IMPLEMENTATION STARTED: NO
PRODUCTION READY: NO
PRODUCTION MUTATIONS/MESSAGES: 0
DATABASE CONNECTIONS: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
