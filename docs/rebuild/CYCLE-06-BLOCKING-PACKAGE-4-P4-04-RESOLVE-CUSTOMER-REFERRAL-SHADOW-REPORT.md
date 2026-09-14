# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 RESOLVE_CUSTOMER_REFERRAL SHADOW REPORT

Status: second P4-04 canonical Shadow slice complete; no executable cutover
Source checkpoint: `9cc3478c`
Report date: 2026-09-01

## 1. Exact Gate-ordered slice

The second action class in the approved P4-04 Runtime Contract Gate is:

`resolve_customer_referral`.

This step implements only its non-executable canonical Shadow. The first
`create_customer_referral` slice is unchanged. `issue_referral_rewards` and
`fulfill_referral_reward` were not started.

The required pre-implementation contract is:

| Contract item | Decision |
|---|---|
| Initiators | daily scheduler, authorized admin command, or owner job panel; the initiator is evidence source only |
| Legacy execution owner | `run_referral_resolver_job` in `ai администратор/referral.py`, including direct legacy identity/status writes |
| Canonical target | one existing tenant-qualified `pending` `CustomerReferral`, found by the exact relationship identity derived from two canonical Clients |
| Idempotency | tenant + immutable referral id + `p4-04.referral-resolve.shadow-policy.v1` + UTC evidence evaluation window |
| Durable model/binding | `CustomerReferral.resolutionExecutionId`, prepared as an immutable 1:1 binding; Shadow does not populate it |
| Policy / approval | enabled server-side `ReferralProgram`; exact evidence; server-owned `NONE` approval for the single non-value resolution plan; L2.5 stays non-executable |
| Provider boundary | YClients is read-only evidence; qualification requires an exact attended visit/record identity after referral creation |
| UNKNOWN | not applicable: no external mutation dispatch occurs; provider-read failure fails closed before planning |
| Reconciliation | Shadow needs none; a later executable local mutation can reconcile from the exact execution-bound referral row |

The terminal outcome is derived server-side and is exactly one of
`qualified`, `expired`, or `self_blocked`. The legacy claimed outcome is
comparison evidence only and cannot choose the canonical result.

## 2. Canonical implementation

The Action Engine registry now includes the isolated capability
`referrals.customer-referral-resolve.shadow.v1`:

- `actionClass = resolve_customer_referral`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt, no dispatch retry, and no reconciliation retry;
- tenant and entitlement remain server-derived by Canonical Action Ingress.

`ReferralResolveShadowService` performs only read and planning operations:

1. authenticates the internal bridge and binds provider/company to its
   server configuration;
2. derives tenant from that integration;
3. checks both exact provider identities through the canonical unresolved
   identity hold guard;
4. resolves two active, unmerged, tenant-qualified `CrmClientLink` rows;
5. derives the same relationship identity used by referral creation and
   requires the exact existing referral to remain `pending`;
6. reads the enabled server-side `ReferralProgram` and fixes a 60-day
   versioned evaluation policy;
7. derives self-block, expiry, or qualification from canonical identity,
   evaluation window, and exact attended-visit evidence;
8. creates only a normalized Shadow `ActionExecution` plan and stops.

Scheduler, admin, and owner-panel initiators are deliberately excluded from
the logical identity. Retry, restart, and two initiators describing the same
referral and evidence window converge to the same request.

The local Python bridge is not imported by production `referral.py`. It has no
database, referral, reward, provider-write, or messaging authority. Production
Shadow was not deployed for this isolated proof.

## 3. Fail-closed and zero-side-effect proof

Targeted verification proves:

1. exact attended-visit evidence produces a `qualified` plan;
2. the server policy window produces an `expired` plan without inventing a
   provider visit;
3. two exact provider identities resolving to one Client produce a
   `self_blocked` plan;
4. retry, service restart, and distinct initiators converge;
5. cross-tenant, missing, merged, held, or guard-unavailable Client identity
   fails closed;
6. absent, non-pending, mismatched, or already terminal referral state fails
   closed;
7. provider read failure, stale evaluation window, missing stable visit id,
   non-attendance, or a visit before `joinedAt` creates no plan;
8. forged tenant, entitlement, eligibility, approval, autonomy, policy,
   executor, binding, or caller-selected terminal outcome is rejected;
9. a mismatched legacy claimed outcome is recorded as a divergence while the
   server-derived outcome remains unchanged;
10. no new referral, reward, value, provider, or communication mutation is
    reachable from the Shadow path.

The clean canonical fixtures produced zero divergences. A dedicated negative
test proves that a legacy/canonical mismatch increments the divergence signal
without granting mutation authority.

## 4. Targeted verification

All commands ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-04 resolve contract/service/architecture Jest suites | PASS — 3 suites / 17 tests |
| Existing Action Engine registry suite | PASS — 1 suite / 15 tests |
| Combined targeted Jest set | PASS — 4 suites / 32 tests |
| Python bridge unittest | PASS — 2 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider client, temporary database,
or production endpoint was run.

## 5. Scope boundary

- The production legacy resolver remains the actual execution owner.
- No `CustomerReferral` row or field was created or changed by the new path.
- No reward issuance, reward, or fulfillment row was created.
- No loyalty/value balance changed.
- No provider write or notification occurred.
- No production Shadow deployment or executable cutover occurred.
- P4-02, immutable P4-03, and the completed first P4-04 Shadow slice were not
  changed.
- A08 payment write remains disabled.
- The third P4-04 action, Package 5, and Chapter 7 were not started.

## 6. Verdict

`P4-04 SHADOW ACTION CLASS: resolve_customer_referral`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`REFERRAL MUTATIONS BY NEW PATH: 0`

`REWARD/VALUE MUTATIONS BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-04 ACTION CLASSES SHADOW-MIGRATED: 2/4`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-04 ACTION STARTED: NO`

## 7. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The third P4-04 action class requires a separate explicit instruction.
