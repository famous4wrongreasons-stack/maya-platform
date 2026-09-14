# CYCLE 06 — PHASE B3.1 COMMUNICATION DELIVERY FOUNDATION REPORT

Date: 2026-08-23

Branch: `codex/maya-brain-systemic-release-20260815`

Implementation commits:

- `adb49407` — durable communication-delivery foundation;
- `2aa7eeeb` — immutable-release-safe proof runner.

Production release:
`20260823-c06-b31-communication-delivery-foundation-r2`

## 1. Scope and boundary

B3.1 is complete as a durable communication-delivery foundation. It provides
the canonical recipient-level lifecycle:

```text
ActionExecution
  -> Campaign / Communication
  -> Recipient
  -> Attempt
  -> Outcome or UNKNOWN
  -> Reconciliation
```

The new path did not send any external message. Production communication paths
were not switched. Attendance, runtime agents and Chapter 7 were not started.

## 2. Existing schema reused

The implementation extends the existing structures:

- `MarketingCampaign` is the shared `SINGLE` / `BULK` communication envelope;
- `MarketingCampaignRecipient` owns canonical recipient delivery truth;
- `MarketingDeliveryAttempt` records claim, dispatch boundary, normalized
  outcome and reconciliation evidence;
- `ActionExecution` is linked tenant-safely to the communication envelope.

No table was added. Migration
`20260822120000_communication_delivery_foundation` is additive.

Existing rows remain at `lifecycleVersion = 0`. No historical row was
backfilled or reinterpreted as sent, delivered or failed. New lifecycle rows
use version `1` and must satisfy the new database invariants.

## 3. Canonical recipient lifecycle

The canonical recipient states are:

- `NOT_SENT`;
- `ACCEPTED`;
- `DELIVERED`;
- `FAILED`;
- `UNKNOWN`;
- `SKIPPED`.

`UNKNOWN` is not `FAILED`. A post-dispatch crash moves the recipient to
`UNKNOWN`, marks reconciliation as required and clears ordinary retry timing.
The database rejects a lifecycle-v1 `UNKNOWN` row unless the external dispatch
may have crossed, reconciliation is required, blind retry is absent and no
terminal timestamp is present.

A pre-dispatch crash or expired pre-dispatch lease is safely reclaimable. A
post-dispatch unknown outcome is not sendable again until reconciliation proves
that the first dispatch was not sent.

## 4. Delivery identity and claims

Logical delivery identity is stable and tenant-scoped. Discovery time, worker
identity and lease time are not part of it.

The database and kernel prove that:

- the same logical communication and recipient in one tenant converge to one
  recipient delivery identity;
- the same recipient in another communication is allowed;
- the same identity in another tenant is allowed;
- restart preserves the existing identity;
- two workers cannot dispatch one recipient;
- stale workers cannot reuse an expired claim revision.

Recipient claims use database row locking with `FOR UPDATE SKIP LOCKED`, lease
tokens and compare-and-set revisions. In-memory locks are not used as the
correctness boundary.

## 5. Attempts, retries and reconciliation

Attempts preserve:

- attempt kind and number;
- claim ownership;
- dispatch boundary;
- provider idempotency identity hash;
- encrypted/hash-only provider reference where available;
- normalized outcome code;
- retry decision;
- reconciliation requirement.

Retry eligibility is deterministic. It depends on the dispatch boundary,
normalized outcome and the selected test capability policy; it is not a blind
`retryCount < N` loop.

The channel-neutral reconciliation kernel supports:

```text
UNKNOWN -> PROVEN_ACCEPTED
UNKNOWN -> PROVEN_DELIVERED
UNKNOWN -> PROVEN_FAILED
UNKNOWN -> PROVEN_NOT_SENT
UNKNOWN -> STILL_UNKNOWN
```

`STILL_UNKNOWN` remains unresolved. `PROVEN_NOT_SENT` is the only reconciliation
result that can make a safe retry eligible. The B3.1 capability registry
contains test-only adapters; every capability explicitly declares provider
idempotency, provider reference, reconciliation and retry semantics. All of
them have `externalDispatchEnabled = false`.

## 6. Campaign aggregation and stuck-sending recovery

Campaign aggregate state is derived deterministically from recipient truth.

- an unresolved recipient prevents false completion;
- mixed terminal outcomes remain visible as partial delivery;
- all terminal recipients close the campaign deterministically;
- an expired campaign cannot dispatch;
- expired claims are recovered according to whether dispatch was crossed;
- a campaign with mixed recipient states does not remain in `RUNNING` forever
  after a worker crash.

`ActionExecution` success means that the communication work item was accepted
by the execution layer. It does not mean that every recipient was delivered.
Recipient truth remains the source for campaign delivery aggregation.

## 7. Single and bulk communication

`SINGLE` and `BULK` envelopes use the same recipient delivery primitive,
attempt lifecycle, retry decisions and reconciliation kernel. No separate
single-message queue was introduced.

## 8. Tenant isolation, policy and privacy

Database barriers reject:

- cross-tenant `ActionExecution` linkage;
- cross-tenant campaign/recipient linkage;
- cross-tenant recipient/attempt linkage;
- cross-tenant membership and consent references for new lifecycle rows.

Legacy tenant-unqualified foreign-key history is preserved with PostgreSQL
`NOT VALID` constraints: old evidence is not fabricated, while every new or
changed reference is enforced.

The delivery layer does not create a new approval or consent subsystem.
Normalized policy/approval belongs to `ActionExecution`; recipient eligibility
is a pre-dispatch input. The kernel stores opaque references, hashes, minimal
metadata and retention timestamps. It does not persist raw recipient data,
provider credentials, raw CRM payloads or full message bodies.

An architectural barrier confirms that `src/communication-delivery` imports no
production provider, CRM writer, messaging sender, campaign executor or other
side-effect owner.

## 9. Migration validation

Validation used PostgreSQL 16.14 and completed before production deployment.

### Clean database and reproducibility

The complete migration history was applied independently to:

- `maya_c06_delivery_clean_v2`;
- `maya_c06_delivery_repro_v2`.

Normalized schema SHA-256 was identical:

```text
913c10dfeff2e271de1cb38c9cebfdd3f221196e8c9358db4da37609cd4df208
```

### Legacy preservation fixture

`maya_c06_delivery_legacy_v2` contained a synthetic pre-B3.1 campaign,
recipient and attempt, including historical references without a matching
membership. The migration completed without inventing outcomes.

The legacy business-data digest before and after migration was identical:

```text
b2c3670737e22906f6e99f1d796bacc5
```

All three legacy rows remained `lifecycleVersion = 0` with nullable canonical
delivery truth.

### Structural production clone

A schema-only production clone, containing no PII or business rows, was loaded
into `maya_c06_delivery_prodclone_v2`. The migration applied successfully.

- public table count before and after: `69`;
- new tables: `0`;
- canonical catalog SHA-256 matched the clean database:
  `bc08eb07fb324e359f3b8f5db0dd1627dcfa170075708ab6c6663e6cabbccf4a`;
- Prisma drift on clean database: none;
- Prisma drift on structural production clone: none.

Before deployment, production had zero campaign, recipient and attempt rows in
these reused tables and zero dangling legacy campaign-reference conditions.

## 10. Verification

Static and application verification:

- lint: passed;
- application typecheck: passed;
- scripts typecheck: passed;
- Prisma validation: passed;
- production build: passed;
- full NestJS suite: `169` suites / `1689` tests passed;
- delivery architecture barrier: passed;
- `git diff --check`: passed for the implementation scope.

The adversarial database/kernel proof passed all `31/31` checks:

1. same logical delivery deduplicated;
2. same recipient in another communication allowed;
3. same identity in another tenant allowed;
4. cross-tenant `ActionExecution` rejected;
5. cross-tenant campaign/recipient rejected;
6. cross-tenant recipient/attempt rejected;
7. two workers converge to one recipient claim;
8. stale worker revision rejected;
9. expired pre-dispatch lease safely reclaimable;
10. crash before dispatch recoverable;
11. crash after dispatch becomes `UNKNOWN`;
12. `UNKNOWN` cannot blind retry;
13. reconciliation proves accepted;
14. reconciliation proves delivered;
15. reconciliation proves failed;
16. reconciliation proves not sent before retry;
17. reconciliation can remain still unknown;
18. deterministic provider rejection is terminal;
19. retryable pre-dispatch failure is deterministic;
20. partial aggregate is deterministic;
21. unresolved recipient blocks false completion;
22. all terminal recipients close a campaign;
23. stuck-sending recovery is explainable;
24. restart identity is stable;
25. single and bulk share one primitive;
26. ActionExecution success does not imply delivery;
27. expired campaign cannot dispatch;
28. raw recipient/provider payload is not persisted;
29. provider capabilities are explicit and test-only;
30. legacy truth is not reinterpreted;
31. no side-effect owner or production provider is imported.

The proof generated only synthetic internal rows and reported:

```text
campaigns: 18
recipients: 19
attempts: 22
externalMessagesSent: 0
productionProvidersImported: false
```

Dedup was proven by concurrent creation converging to the same database row and
identifier. No duplicate delivery row was materialized; therefore the final
persisted duplicate-row count remained zero.

## 11. Production deployment and adversarial verification

The first immutable release,
`20260823-c06-b31-communication-delivery-foundation`, deployed the schema and
kernel successfully. Its post-deploy proof exposed one release-packaging issue:
the proof runner looked for TypeScript source files that are intentionally not
present in an immutable release. The failure occurred before any provider use,
all synthetic rows were removed by `finally`, and external sends remained zero.

Commit `2aa7eeeb` made the architecture scan release-safe without changing the
schema, lifecycle or delivery semantics. The corrected release
`20260823-c06-b31-communication-delivery-foundation-r2` then passed:

- deployment preflight;
- no-pending-migration check;
- spare-port smoke test;
- `/api/health` with the expected release stamp;
- `/api/health/ready` with database `ready`;
- production adversarial proof `31/31`;
- service error-log check with no entries.

After the production proof, cleanup was verified explicitly:

```text
syntheticTenants: 0
lifecycleCampaigns: 0
lifecycleRecipients: 0
lifecycleAttempts: 0
```

No real tenant communication was created. No SMS, push notification, email,
chat message or campaign delivery was sent by the new path.

## 12. Stop boundary

B3.1 ends at the durable delivery and reconciliation foundation. Production
communication cutover remains forbidden until a separately approved shadow
migration proves the existing send paths against this kernel.

Attendance was not changed. Runtime agents were not created. Chapter 7 was not
started.

## Final status

PHASE B3.1 COMPLETE: YES

RECIPIENT DELIVERY LIFECYCLE DURABLE: YES

DELIVERY DEDUP PROVEN: YES

UNKNOWN DELIVERY PRESERVED: YES

BLIND RETRY AFTER DISPATCH POSSIBLE: NO

STUCK-SENDING RECOVERABLE: YES

SINGLE/BULK SHARE DELIVERY PRIMITIVE: YES

EXTERNAL MESSAGES SENT BY NEW PATH: 0

READY FOR COMMUNICATION SHADOW MIGRATION: YES
