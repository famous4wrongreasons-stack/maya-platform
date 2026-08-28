# CYCLE 06 — BLOCKING PACKAGE 2 — COMMUNICATION CONVERGENCE REPORT

Status: COMPLETE (release candidate; no production dispatch performed by this package)
Package order: 2 of 5
Next blocking package started: NO

## Exact Package From Remainder Review

**Communication remainder and bulk convergence**

Completion criterion from `CYCLE-06-REMAINDER-REVIEW.md`:

> Prove bulk audience identity-set equivalence; migrate bulk, reminders, reports, birthday/review/lead alerts, and required channel dispatches; remove direct sends and preserve UNKNOWN.

## Pre-Implementation Scope

| ID | Production action class | Current execution owner | Current direct bypass class |
|---|---|---|---:|
| A11 | Appointment reminders | Scheduler -> legacy Nest/Python communication code | 1 |
| A12 | Owner/staff reports and briefings | Scheduler -> legacy Nest/Python inbox/Telegram code | 1 |
| A13 | Review, birthday, and lead alerts | Scheduler/event handler -> legacy Python messaging code | 1 |
| A14 | Bulk/reactivation/campaign delivery | Scheduler/operator -> legacy campaign/messaging code | 1 |

Pre-implementation totals:

- production action classes in Package 2: **4**;
- current execution owners: **4 legacy/deferred owner classes**;
- current direct execution bypass classes: **4**.

## Why Package 2 Blocks Chapter 6

1. Active reminders, reports, alerts, and reactivation communication can still dispatch outside the Action Engine.
2. The durable recipient lifecycle proves per-recipient delivery identity, but the previously accepted proof did not establish equality of bulk audience identity sets.
3. Historical bulk proof was previously `NOT PROVABLE`; count equality alone is insufficient.
4. Bulk is a future paid MAYA capability and would remain a direct side-effect route around policy, approval, and durable execution if left legacy-owned.
5. A legacy code fence is not a canonical policy/execution boundary.

## Exact Completion Criteria

Bulk equivalence must compare:

- included and excluded recipient identity sets;
- tenant identity;
- eligibility;
- consent and opt-out state;
- selected channel;
- duplicate collapse and delivery identity;
- approval and risk classification.

After equivalence, Package 2 must prove:

- one execution owner per migrated communication capability;
- no runtime legacy fallback;
- durable recipient delivery lifecycle;
- `UNKNOWN != FAILED` and no blind retry after dispatch;
- restart and concurrency deduplication;
- tenant isolation and DB-level claim;
- preserved policy and approval boundary;
- zero dual sends.

## Schema Decision

The approved communication delivery schema is sufficient for this package. Existing `ActionExecution`, `MarketingAudience`/recipient evidence, and communication campaign/recipient/attempt lifecycle can represent the required execution and delivery identities.

`SCHEMA GATE REQUIRED: NO`

## Implementation Evidence

### Canonical execution ownership

The Action Engine registry now owns exactly one capability for each Package 2 action class:

| ID | Canonical capability | Execution owner after migration | Retry policy |
|---|---|---|---|
| A11 | `communication.appointment-reminders.execute.v1` | Action Engine -> Communication Delivery | one dispatch attempt; no blind retry |
| A12 | `communication.reports-briefings.execute.v1` | Action Engine -> Communication Delivery | one dispatch attempt; no blind retry |
| A13 | `communication.business-alerts.execute.v1` | Action Engine -> Communication Delivery | one dispatch attempt; no blind retry |
| A14 | `communication.bulk-campaign.execute.v1` | Action Engine -> Communication Delivery recipient lifecycle | one claimed attempt per recipient; no blind retry |

Registry tests prove that every capability resolves to one executor and that Package 2 capabilities cannot opt into a retry count greater than one.

### A11-A13 producer convergence

The production-reachable reminder, report, briefing, birthday, review, lead, cycle, and owner/staff notification producers now submit a canonical communication request instead of dispatching directly:

- Python producers call the protected Package 2 bridge and fail closed when it is unavailable;
- the bridge accepts only a tenant-scoped, normalized Package 2 request;
- Telegram dispatch is performed once by the canonical delivery executor;
- inbox and APNS delivery use the durable Communication Delivery lifecycle;
- the pre-existing direct inbox write and push announcement branches are unreachable for Package 2 message types;
- no producer contains `new path failed -> legacy send` fallback.

The Package 2 Python ratchet parses the migrated producer functions and rejects direct Telegram, push, or local-chat dispatch. It also proves that the protected Telegram executor invokes the channel send exactly once and contains no retry/fallback loop.

### A14 exact bulk audience equivalence

Bulk execution is guarded by an exact identity-set comparison, not a count comparison. The canonical proof compares, for every recipient identity:

- tenant;
- external recipient identity;
- included/excluded state;
- eligibility;
- consent and opt-out state;
- channel;
- deterministic delivery identity;
- approval and risk classification.

The proof rejects duplicate identities, a wrong tenant, a missing or unexpected recipient, and any semantic drift in the fields above. `MarketingService` constructs the legacy audience plan and canonical Shadow plan from the same campaign input and refuses dispatch unless the result is `EQUIVALENT`. Shadow construction sends zero external messages.

After equivalence, the exact proven recipient identities are passed to the canonical bulk executor. The executor creates one durable envelope and one deterministic recipient delivery per identity, claims each recipient at the database boundary, writes only through the canonical delivery owner, and verifies that the returned delivery identity set equals the proven set. The campaign cannot be marked sent before the complete canonical result is returned.

### Durable delivery and UNKNOWN

Package 2 delivery uses the existing approved schema; no schema or migration change was required.

- deterministic `ActionExecution` and delivery identities collapse a repeated initiator request;
- a database-level recipient claim prevents two workers from dispatching the same delivery;
- a timeout or uncertain response after dispatch becomes `UNKNOWN`, not `FAILED`;
- `UNKNOWN` is never blindly retried;
- inbox reconciliation reads the deterministic persisted inbox identity;
- channels without a trustworthy provider read-back remain `UNKNOWN` for explicit reconciliation/manual handling rather than being guessed;
- restart resumes from durable action/delivery state and cannot create a second logical delivery.

### Direct bypass inventory

The initial four class-level bypasses are removed in this release candidate:

| ID | Initial bypasses | Remaining direct bypasses | Result |
|---|---:|---:|---|
| A11 | 1 | 0 | migrated |
| A12 | 1 | 0 | migrated |
| A13 | 1 | 0 | migrated |
| A14 | 1 | 0 | migrated |

The producer-level ratchet covers twelve concrete Python communication producer sites behind those four class-level bypasses. All twelve now enter through the canonical bridge/delivery path.

### Safety boundary

- Production external messages sent by this Package 2 verification: **0**.
- Production bulk campaigns launched: **0**.
- Runtime legacy fallback introduced: **NO**.
- PWA/iOS changes: **NONE**.
- Package 3 work started: **NO**.

## Adversarial Verification

| Attempted falsification | Expected invariant | Result |
|---|---|---|
| Register a second owner for an A11-A14 capability | one capability -> one execution owner | blocked by registry tests |
| Increase retry count for Package 2 capability | no blind retry after dispatch | rejected |
| Repeat the same logical request | deterministic idempotency | converges to existing execution/delivery |
| Run two workers against one recipient | DB-level claim | one worker owns dispatch |
| Re-run after restart | restart safety | no second logical delivery |
| Treat timeout after dispatch as failure | `UNKNOWN != FAILED` | preserved as UNKNOWN |
| Retry an UNKNOWN recipient blindly | no duplicate external send | prohibited |
| Use a recipient from another tenant | tenant isolation | rejected |
| Duplicate a recipient in a bulk plan | one delivery identity | equivalence proof rejects plan |
| Match counts while changing one identity | exact identity-set equivalence | rejected |
| Change consent/opt-out eligibility | policy preservation | rejected as semantic drift |
| Change channel, approval, or risk | policy/approval preservation | rejected as semantic drift |
| Omit or add a bulk recipient | full set equality | rejected |
| Let migrated producer call Telegram/push directly | no direct bypass | ratchet fails |
| Fall back to legacy send after bridge failure | no runtime fallback | ratchet fails; producer fails closed |
| Run legacy inbox write plus canonical delivery | no dual send | Package 2 branch excludes legacy write/push |
| Mark campaign sent with a partial recipient result | complete canonical delivery required | rejected |
| Reconcile inbox using a non-deterministic lookup | trustworthy reconciliation | deterministic identity required |

Verification completed:

- TypeScript typecheck: passed;
- ESLint: passed;
- production build: passed;
- full Jest suite: **171 suites / 1746 tests passed**;
- Package 2 and accepted communication architectural ratchets: **6 tests passed**;
- Python syntax compilation for changed producers: passed;
- `git diff --check`: passed.

No production message, campaign, or customer side effect was generated for verification. Previously accepted Cycle 06 B3 organic/safe proofs remain the production equivalence basis for operational-single and transactional communication; A14 adds the exact fail-closed audience identity-set proof required by this package.

## Final Verdict

```text
PACKAGE 2 COMPLETE: YES
ACTION CLASSES MIGRATED: 4
DIRECT BYPASSES REMAINING FOR PACKAGE: 0
BLIND RETRY AFTER UNKNOWN: NO
NEXT BLOCKING PACKAGE STARTED: NO
CHAPTER 6 BLOCKING PACKAGES REMAINING: 3
```
