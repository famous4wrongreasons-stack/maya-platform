# CYCLE 05 - OPPORTUNITY LIFECYCLE IMPLEMENTATION REPORT

Дата завершения: 2026-08-21.

Ветка: `codex/maya-brain-systemic-release-20260815`.

Архитектурное одобрение: `9ea89dcc`.

Lifecycle implementation: `a6a8baa8`.

Production release: `20260821-c05-opportunity-lifecycle`.

## 1. Scope

Реализован только утверждённый Chapter 5 durable lifecycle:

- tenant-scoped `Opportunity`;
- tenant-scoped `AgentTask`;
- deterministic identity, deduplication и restart continuity;
- resolution, family-specific expiry и supersession;
- L2.5 Shadow production projection;
- additive migration и database-level invariants.

За пределами scope и намеренно не реализовано:

- durable `ActionIntent`;
- Action Engine;
- approvals, retries, delivery state и provider outcome;
- CRM writes, appointment mutations, campaigns и messaging;
- runtime agents и direct agent-to-agent communication;
- Chapter 6 execution semantics.

## 2. Durable schema

Additive migration:

`prisma/migrations/20260821120000_opportunity_lifecycle/migration.sql`

Добавлены только две lifecycle-модели:

- `Opportunity` со статусами `active`, `resolved`, `expired`, `superseded`;
- `AgentTask` со статусами `current`, `invalidated`.

Таблица `ActionIntent` не создана. Historical Opportunities не backfill'ились.

`AgentTask` хранит structured work item: domain, objective, разрешённые read
capabilities, допустимые action classes, expiry и lifecycle link. Он не хранит
execution state, attempt count, retry state, approvals, delivery или provider
result.

## 3. Identity and deduplication

Identity разделена на два уровня:

- `semanticKey` — стабильная tenant-scoped identity одного business condition;
- `evidenceFingerprint` / `identityFingerprint` — версия доказательств и durable
  identity конкретного состояния.

Время обнаружения не входит в durable identity. Повторное вычисление одного
состояния revalidate существующую Opportunity и существующий current AgentTask,
а не создаёт новые строки.

Concurrency защищена serializable transaction и database uniqueness. Retry в
repository применяется только к конфликту сериализации БД; это не retry
внешнего действия и не Chapter 6 execution state.

## 4. Tenant isolation and database invariants

Все relation и uniqueness, которые связывают lifecycle entities, tenant-qualified.
Миграция добавляет composite foreign keys, partial unique indexes, CHECK
constraints, transition guards и deferred cross-row invariant triggers.

Полная adversarial DB matrix: **18/18 PASS**.

| Invariant | Result |
|---|---|
| Same identity in same tenant is rejected/collapsed | PASS |
| Same identity in another tenant is allowed | PASS |
| Cross-tenant supersession is rejected | PASS |
| Cross-tenant AgentTask is rejected | PASS |
| One active Opportunity per semantic identity | PASS |
| One current AgentTask per semantic/domain identity | PASS |
| AgentTask domain must match Opportunity route | PASS |
| Affected entity kind/ref must be a valid pair | PASS |
| Opportunity expiry clock must be valid | PASS |
| Identity/policy/revision versions must be positive | PASS |
| Terminal Opportunity cannot retain a current task | PASS |
| Terminal Opportunity cannot reopen | PASS |
| Invalidated AgentTask cannot reopen | PASS |
| Superseded Opportunity requires a valid successor | PASS |
| AgentTask cannot outlive Opportunity | PASS |
| `inform_only` Opportunity cannot create AgentTask | PASS |
| `ActionIntent` table does not exist | PASS |
| Revoked policy cannot resume a task | PASS |

## 5. Lifecycle proofs

### Restart

Proof sequence:

1. detect Opportunity;
2. persist Opportunity;
3. create AgentTask;
4. instantiate a new repository/process;
5. project the same canonical evidence again.

Result: Opportunity count and current AgentTask count remain unchanged. A
concurrent same-evidence run also collapses to one durable Opportunity and one
current task.

### Resolution

Resolution uses newer current canonical evidence proving that the condition is
no longer true. Task creation is not resolution. Replaying old evidence after
resolution is collapsed against the terminal Opportunity and cannot recreate a
current task.

### Supersession

Evolving evidence for the same semantic condition atomically creates a new
revision, marks the old revision `superseded`, invalidates its task and leaves
exactly one active Opportunity/current AgentTask. Restart with the same new
evidence only revalidates that revision.

### Expiry

Expiry is taken from family evidence/policy. No global TTL was introduced.
Expired evidence cannot become a current task after restart, and a task cannot
outlive its Opportunity.

### Bootstrap and cutover

Pending `DomainEvent` rows are not replayed automatically. Production projection
requires an explicit cutover and validates current canonical appointment state.
Bootstrap ingestion and pre-cutover historical events produce no Opportunity.

## 6. Privacy and action boundary

Persisted evidence is limited to opaque references and minimal deterministic
metadata. Raw CRM payload, complete Business State, names, phones, e-mail and
credentials are not persisted in lifecycle records or emitted by verification.

Static boundary tests fail if `src/opportunities` imports CRM writers, messaging,
campaign executors, billing writers or other side-effect owners. Production
shadow additionally verifies that source projection is read-only and that the
only writes are `Opportunity` and `AgentTask`.

`ActionIntent` remains a runtime structured output only:

- persisted: 0;
- executed: 0;
- external actions executed: 0.

## 7. Migration validation

Completed before production rollout:

- Prisma schema validation: PASS;
- clean database built from all 49 migrations: PASS;
- migration replay on a second clean database: PASS;
- normalized clean/replay schema equality: PASS;
- production structural clone migration: PASS;
- clean/replay/production-structure Prisma drift: no diff;
- full database invariant matrix: 18/18 PASS;
- migration reproducibility: PASS;
- no guessed drift fix applied.

## 8. Test and build gate

Final release gate:

- lint: PASS;
- application typecheck: PASS;
- scripts typecheck: PASS;
- tests: **164 suites / 1640 tests PASS**;
- targeted Opportunity tests: **3 suites / 49 tests PASS**;
- production build: PASS;
- migration preflight before deploy: one expected pending migration;
- migration preflight after deploy: zero pending migrations;
- spare-port readiness smoke: PASS;
- post-switch production readiness: PASS.

Local lifecycle proof aggregate:

- opportunities: 6 total, 3 active, 1 resolved, 1 expired, 1 superseded;
- AgentTasks: 6 total, 3 current, 3 invalidated;
- duplicate attempts collapsed: 8;
- ActionIntents executed: 0;
- side effects executed: 0.

## 9. Production shadow verification

Release `20260821-c05-opportunity-lifecycle` was deployed and the additive
migration was applied successfully. Verification used one current tenant source
without emitting its identifier, raw events or CRM payloads.

Fixed inputs for both independent runs:

- explicit Chapter 5 cutover: `2026-08-20T11:01:35.575Z`;
- identical `asOf` snapshot;
- source read in a repeatable, read-only transaction;
- mode: `L2_5_SHADOW`.

First process:

- source rows read: 6;
- accepted current conditions: 2;
- rejected expired capacity rows: 4;
- Opportunity created: 2;
- AgentTask current: 2;
- Opportunity total/active/resolved/expired/superseded: `2/2/0/0/0`;
- AgentTask total/current/invalidated: `2/2/0`;
- ActionIntent proposed/persisted/executed: `2/0/0`;
- external actions executed: 0.

Second fresh process with the same evidence:

- Opportunity created: 0;
- Opportunity revalidated: 2;
- duplicate attempts collapsed: 2;
- Opportunity total/active/resolved/expired/superseded remained `2/2/0/0/0`;
- AgentTask total/current/invalidated remained `2/2/0`;
- ActionIntent persisted/executed remained `0/0`;
- external actions executed remained 0.

This is the production restart proof: rerun did not increase Opportunity count
or current AgentTask count. The one-off verifier artifact was removed from the
server after the check.

## 10. Adversarial conclusion

Attempts to disprove restart safety, concurrent dedup, tenant isolation,
resolution, supersession, family expiry, historical-event cutover, one-current-
task and no-side-effect boundaries did not reveal an invariant failure.

Chapter 5 durable lifecycle is ready for its separate final verification. This
report does not approve or start Chapter 6.

## Final status

LIFECYCLE IMPLEMENTED: YES

DURABLE OPPORTUNITY: YES

DURABLE AGENT TASK: YES

RESTART DUPLICATES POSSIBLE: NO

STALE OPPORTUNITY CAN PRODUCE CURRENT TASK: NO

ACTION INTENTS EXECUTED: 0

SIDE EFFECTS INTRODUCED: NO

READY FOR CHAPTER 5 FINAL VERIFICATION: YES

CHAPTER 6 STARTED: NO

RUNTIME AGENTS CREATED: NO

STOP.
