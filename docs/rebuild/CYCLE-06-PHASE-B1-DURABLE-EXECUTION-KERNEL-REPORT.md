# CYCLE 06 - PHASE B1 DURABLE EXECUTION KERNEL REPORT

Дата завершения: 2026-08-22.

Ветка: `codex/maya-brain-systemic-release-20260815`.

Implementation commit: `09e6f62a`.

Release-verifier fix: `5f2d942d`.

Final production release: `20260822-c06-b1-execution-kernel-proof`.

## 1. Scope

Реализован только утверждённый Phase B1 durable execution kernel:

- tenant-scoped `ActionExecution` для одного логического действия;
- tenant-scoped `ActionAttempt` для execution/reconciliation attempt ledger;
- trusted normalization и deterministic action identity;
- database-level idempotency, single claim и one-open-attempt barrier;
- approval snapshot, policy snapshot, retry policy и reconciliation policy;
- exact execution lifecycle с отдельным состоянием `UNKNOWN`;
- crash recovery, reconciliation и безопасный retry только после доказательства;
- first-class durable shadow outcome без внешней попытки;
- audit reconstruction и минимальные безопасные outcome summaries.

Намеренно не реализовано и не начато:

- durable `ActionIntent` table;
- migration существующих execution owners;
- вызов CRM writers, campaign executors, messaging, billing или booking owners;
- provider-specific delivery implementation;
- runtime agents;
- Phase B2;
- Chapter 7.

Historical action rows не backfill'ились. Existing approval records не признаны
canonical approval Phase B1 и не переиспользованы.

## 2. Durable schema

Additive migration:

`maya-saas-backend/prisma/migrations/20260821190000_action_execution_kernel/migration.sql`

Добавлены:

- enums execution, policy, approval, reconciliation, attempt и dispatch state;
- `ActionExecution`;
- `ActionAttempt`;
- tenant relations для execution, attempt, actor, approver и optional AgentTask;
- CHECK constraints, composite foreign keys, partial uniqueness и transition
  guards.

`ActionExecution` хранит нормализованный trusted contract, policy/approval/retry/
reconciliation snapshots, durable lifecycle, lease, safe result и retention
clocks. Он не хранит unrestricted model output или raw provider payload.

`ActionAttempt` является append-oriented ledger одной execution или
reconciliation попытки. Retry создаёт следующий attempt того же
`ActionExecution`, а не новое логическое действие.

Таблица `ActionIntent` не создана, как и было утверждено Schema Gate.

## 3. Trusted normalization and identity

Свободный текст не владеет:

- action class;
- capability/executor;
- permission;
- approval requirement;
- autonomy level;
- retry/reconciliation policy.

Эти поля получаются только из trusted typed capability registry. Input
нормализуется до versioned contract и hash до создания durable execution.
Adversarial proof подтвердил, что untrusted text/payload не может изменить
action class.

Логическая identity включает tenant, trusted action contract, target/source и
нормализованный input. Для caller-provided idempotency действует отдельная
tenant-scoped uniqueness:

`tenantId + idempotencyScope + requestIdempotencyKeyHash`.

Одинаковое логическое действие в одном tenant collapse'ится в существующий
`ActionExecution`; такая же identity в другом tenant разрешена. Restart не
создаёт второй execution или attempt.

## 4. State machine

Реализованы только утверждённые состояния:

- `PENDING_APPROVAL`;
- `READY`;
- `EXECUTING`;
- `UNKNOWN`;
- `SUCCEEDED`;
- `FAILED`;
- `NOT_EXECUTED`.

Разрешённые переходы:

| From | To | Required proof |
|---|---|---|
| create | `PENDING_APPROVAL` | trusted policy требует approval |
| create | `READY` | policy allows и approval не требуется |
| create | `NOT_EXECUTED` | deny, shadow или invalid/expired intent |
| `PENDING_APPROVAL` | `READY` | approval текущего normalized input |
| `PENDING_APPROVAL` | `NOT_EXECUTED` | rejection или approval expiry |
| `READY` | `EXECUTING` | atomic claim и один open execution attempt |
| `EXECUTING` | `READY` | definitive pre-dispatch failure + safe retry policy |
| `EXECUTING` | `SUCCEEDED` | definitive succeeded attempt |
| `EXECUTING` | `FAILED` | definitive failed attempt |
| `EXECUTING` | `UNKNOWN` | attempt may have crossed dispatch boundary |
| `UNKNOWN` | `READY` | reconciliation proves not executed and safe retry |
| `UNKNOWN` | `SUCCEEDED` | reconciliation proves success |
| `UNKNOWN` | `FAILED` | reconciliation proves failure |
| `UNKNOWN` | `NOT_EXECUTED` | reconciliation proves not applied |

Terminal execution immutable. Unsupported transitions are rejected by database
trigger even if application code is bypassed.

## 5. UNKNOWN, retry and reconciliation

`UNKNOWN` is not an alias for `FAILED`. It means the request may have crossed
the external boundary and its outcome is not yet proven.

From `UNKNOWN`:

- ordinary execution claim is rejected;
- blind retry is rejected;
- reconciliation attempt is required;
- inconclusive reconciliation keeps `UNKNOWN`;
- repeated inconclusive reconciliation moves review state to
  `MANUAL_REQUIRED`;
- retry becomes possible only after `PROVEN_NOT_EXECUTED` and an explicit
  `SAFE_RETRY_ALLOWED` decision.

For a failure proven before dispatch, retry is additionally limited by the
trusted action-class retry policy and maximum attempt count. A no-retry class
cannot be retried.

## 6. Concurrency and crash safety

Claim is protected at two levels:

- compare-and-set lease/revision update on `ActionExecution`;
- partial unique database index allowing only one open attempt for one
  tenant-scoped execution.

Two workers racing for one action produce one owner and one open attempt. A
second open attempt is rejected by the database.

Crash proof covers a crash after dispatch may have crossed the boundary. After
lease expiry, recovery moves the action to `UNKNOWN`, preserves the single
attempt and requires reconciliation. It does not retry the action.

## 7. Approval and shadow semantics

Approval is bound to tenant membership and the exact normalized input hash.
Approval of another payload, expired approval, rejected approval or an old
approval surface cannot unlock execution.

Shadow is a durable first-class outcome:

- policy decision: `SHADOW_ONLY`;
- `dryRun = true`;
- terminal state: `NOT_EXECUTED`;
- reason: `shadow_only`;
- `ActionAttempt` count: 0;
- external success is structurally impossible.

## 8. Tenant isolation, privacy and audit

All execution/attempt relations and relevant uniqueness are tenant-qualified.
Database proof rejects:

- ActionAttempt linked to another tenant's execution;
- ActionExecution linked to another tenant's AgentTask;
- cross-tenant actor/approver membership;
- duplicate identity inside one tenant while allowing the same identity in
  another tenant.

Persistence uses opaque references, hashes, encrypted normalized input/provider
reference where required, safe result summaries and reason codes. The kernel
does not persist raw CRM payload, complete Business State, phone, name, e-mail,
credentials or unrestricted LLM text.

Audit reconstruction returns the immutable execution contract and ordered
attempt ledger. Retention clocks are constrained so audit retention cannot end
before payload retention.

## 9. No-side-effect architecture barrier

Phase B1 contains no production executor dispatcher. Static architecture proof
checks both source and immutable compiled release and rejects references to CRM,
marketing, billing, appointments, communications, BookingExecutor,
CampaignExecutor or other production execution owners.

Registry entries used by proof are synthetic or L2.5 Shadow only. No existing
owner was migrated and no real provider was called.

Result:

- ActionIntents executed: 0;
- external side effects: 0;
- production executors imported: false.

## 10. Migration validation

Completed before production rollout:

- Prisma schema validation: PASS;
- clean database built from all 50 repository migrations: PASS;
- second independent clean migration replay: PASS;
- normalized schema equality between both clean databases: PASS;
- normalized schema SHA-256:
  `1ef59cb462815d76607b7738f7744397634e3ac1fd542da856c85590b3d0c683`;
- production structural clone, without business rows or PII: PASS;
- structural clone table count: 67 before, 69 after;
- clean/replay/production-structure Prisma drift: no diff;
- full database invariant matrix: PASS;
- migration reproducibility: PASS;
- historical backfill: none;
- guessed drift fixes: none.

Migration is additive. Rollback of application code is performed by switching
the immutable release symlink back; the additive schema remains in place. A
destructive down migration is neither required nor approved.

## 11. Test and build gate

Final release gate:

- lint: PASS;
- application typecheck: PASS;
- scripts typecheck: PASS;
- tests: **167 suites / 1664 tests PASS**;
- production build: PASS;
- release preflight: PASS;
- migrations after rollout: 0 pending;
- spare-port smoke: PASS;
- post-switch health/readiness: PASS;
- service errors after switch: none.

Local compiled kernel proof on clean database:

- adversarial assertions: **26/26 PASS**;
- ActionExecution total/active/unknown/succeeded/failed/not-executed:
  `18/3/2/6/2/5`;
- attempts: 19;
- duplicate attempts collapsed: 3;
- external side effects: 0;
- production executors imported: false.

## 12. Production synthetic/shadow verification

The additive migration was first deployed in release
`20260822-c06-b1-execution-kernel`. Its health/readiness and migration checks
passed.

The first production verifier run stopped at its static architecture check
because the immutable release intentionally contains compiled `dist` but not
the TypeScript `src` directory. The verifier's `finally` cleanup still ran. No
kernel invariant failed and no external action was possible. The verifier was
made release-portable, revalidated locally and deployed as
`20260822-c06-b1-execution-kernel-proof`.

Final production proof used only synthetic tenants, opaque inputs and shadow/
synthetic capabilities. Result:

- adversarial assertions: **26/26 PASS**;
- ActionExecution total/active/unknown/succeeded/failed/not-executed during
  isolated proof: `18/3/2/6/2/5`;
- attempts during proof: 19;
- duplicate attempts collapsed: 3;
- external side effects: 0;
- production executors imported: false.

Post-proof cleanup query:

- migration applied and finished: true;
- remaining `ActionExecution`: 0;
- remaining `ActionAttempt`: 0;
- remaining Cycle 06 proof tenants: 0.

Production verification therefore left no synthetic lifecycle data behind and
did not invoke a production owner.

## 13. Adversarial matrix

All required proofs passed:

- trusted text cannot alter action class;
- same logical action collapses inside tenant;
- same identity is allowed in another tenant;
- restart identity remains stable;
- two workers produce one execution owner;
- database rejects a second open attempt;
- terminal action cannot execute twice;
- approval/rejection/expiry paths are enforced;
- policy deny and shadow create no execution attempt;
- no-retry and safe-retry classes follow their policies;
- timeout after dispatch becomes `UNKNOWN`;
- `UNKNOWN` cannot blind retry;
- reconciliation proves success, failure or non-execution;
- reconciliation gates the only safe retry from `UNKNOWN`;
- inconclusive reconciliation requires manual review;
- crash after dispatch requires reconciliation;
- expired intent cannot execute;
- tenant boundaries reject cross-tenant task and attempt links;
- audit reconstructs execution;
- no production executor is imported;
- external side effects remain zero.

## 14. Conclusion and boundary

Phase B1 durable execution kernel is implemented and proven locally and in
production synthetic/shadow mode. It is ready for a separately approved
execution-owner migration package.

This report does not start Phase B2, does not migrate CRM/campaign/booking/
messaging/billing owners, does not create runtime agents and does not start
Chapter 7.

## Final status

PHASE B1 COMPLETE: YES

DURABLE EXECUTION KERNEL: YES

UNKNOWN != FAILED: YES

BLIND RETRY FROM UNKNOWN POSSIBLE: NO

DB-LEVEL SINGLE EXECUTION CLAIM: YES

RECONCILIATION CONTRACT IMPLEMENTED: YES

EXTERNAL SIDE EFFECTS: 0

READY FOR EXECUTION OWNER MIGRATION: YES

PHASE B2 STARTED: NO

RUNTIME AGENTS CREATED: NO

CHAPTER 7 STARTED: NO
