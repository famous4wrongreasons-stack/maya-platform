# CYCLE 05 - CHAPTER 5 COMPLETION REPORT

Дата проверки: 2026-08-21.

Ветка: `codex/maya-brain-systemic-release-20260815`.

Проверенный release: `20260821-c05-closure-final`.

Режим проверки: final adversarial verification, затем повторная closure
verification после CF1-CF6. Целью было опровергнуть реализацию, а не подтвердить
её по умолчанию.

Разделы 2-18 сохраняют исходный failing baseline и причины остановки. Раздел 19
фиксирует реализацию closure fixes, повторную PostgreSQL-матрицу, immutable
production invocation и итоговый статус, который заменяет pre-closure verdict.

## 1. Executive conclusion

Durable foundation Chapter 5 существует: tenant-scoped `Opportunity` и
`AgentTask`, fingerprint identity, database invariants, family expiry,
current-state resolution, supersession и zero-side-effect boundary реализованы.

Первый adversarial pass доказал четыре production-level blocker: stale current
state, недостаточное Occupancy evidence, параллельных semantic owners и
отсутствие воспроизводимого immutable invocation. CF1-CF6 закрыли все четыре
класса дефектов. Повторная проверка доказала complete current-state
reconciliation, lifecycle-coupled AgentTask, canonical capacity proof, одного
production computation owner и путь `built -> deployed -> invoked`.

Chapter 5 закрыт. Это не разрешение самостоятельно начинать Chapter 6: данный
цикл останавливается после completion report, без runtime agents и execution.

## 2. Production Opportunity truth

Read-only production verification выполнена без вывода tenant IDs, CRM IDs,
PII, raw events или evidence fingerprints.

Обе durable active production Opportunities имеют одинаковую доказательную
семантику, но относятся к двум разным opaque appointment refs:

| Property | Opportunity 1 | Opportunity 2 |
|---|---|---|
| Canonical source | WATCH `appointment.removed` после cutover + canonical appointment mirror | WATCH `appointment.removed` после cutover + canonical appointment mirror |
| Current evidence | removed appointment, положительный будущий blocked interval | removed appointment, положительный будущий blocked interval |
| Type | `appointment_cancellation_recovery` | `appointment_cancellation_recovery` |
| Policy | `occupancy.released_capacity@1` | `occupancy.released_capacity@1` |
| Affected entity | opaque tenant-scoped `appointment` | opaque tenant-scoped `appointment` |
| Agent domain | `occupancy` | `occupancy` |
| Outcome | `action_candidate` | `action_candidate` |
| Expiry | family-specific end of the referenced interval | family-specific end of the referenced interval |
| Exact evidence exists now | YES | YES |

На момент read-only снимка обе строки имели current factual basis. Это
подтверждает текущий production snapshot, но не доказывает, что lifecycle
закроет строку после исчезновения evidence.

## 3. Current-state revalidation

Production read-only recomputation из текущих WATCH + canonical appointment
state:

| Metric | Result |
|---|---:|
| Source rows read | 6 |
| Accepted current source rows | 2 |
| Rejected current source rows | 4 |
| Durable Opportunities total | 2 |
| Durable active | 2 |
| Durable resolved / expired / superseded | 0 / 0 / 0 |
| Detected now | 2 |
| Exact factual-basis matches | 2 |
| Semantic-basis matches | 2 |
| Active without exact current basis at snapshot time | 0 |
| AgentTasks total / current | 2 / 2 |
| Current tasks without exact current basis at snapshot time | 0 |
| ActionIntents proposed / persisted / executed | 2 / 0 / 0 |
| External side effects | 0 |

The production snapshot is internally consistent now. The persistence algorithm
is not safe when the factual basis disappears:

- the runner calls `expireDue()` and then `persistProjection()`;
- `persistProjection()` loops only over Opportunities present in the new
  projection;
- an active durable Opportunity absent from the new projection is never
  reconciled;
- `resolveCurrent()` exists, but the runner does not call it for disappeared
  conditions.

## 4. Restart and changed-evidence proof

### Same evidence

The official lifecycle proof and production same-snapshot rerun both preserve:

- one durable Opportunity per identity;
- one current AgentTask per Opportunity/domain identity;
- stable task identity;
- no persisted or executed ActionIntent;
- zero external side effects.

Same-evidence restart safety: **PASS**.

### Changed evidence that evolves the same condition

The repository-level proof demonstrates the approved supersession semantics:

- a new evidence fingerprint for the same semantic condition creates the next
  revision;
- the old revision becomes `superseded`;
- the old task becomes `invalidated`;
- exactly one new active Opportunity/current AgentTask remains;
- policy/version remains attached to the revision that created it.

Supersession primitive: **PASS**.

### Changed evidence that removes the condition

An isolated clean-database proof reproduced the exact production runner
sequence:

1. a removed appointment produces one Opportunity and one AgentTask;
2. canonical appointment evidence changes so the condition is no longer
   detected;
3. the new projection contains zero Opportunities;
4. `expireDue()` + `persistProjection(empty)` is run again as production does.

Observed result:

| Metric | Result |
|---|---:|
| Initial detected | 1 |
| Detected after evidence changed | 0 |
| Durable active after revalidation | 1 |
| Current AgentTasks after revalidation | 1 |
| Resumable tasks after revalidation | 1 |
| ActionIntents executed | 0 |
| External side effects | 0 |

Therefore:

`STALE OPPORTUNITY CAN PRODUCE CURRENT TASK: YES`.

## 5. Resolution, expiry and supersession

| Property | Primitive / isolated proof | Production runner proof | Verdict |
|---|---|---|---|
| Explicit resolution | `resolveCurrent()` invalidates task and resolves Opportunity | Not invoked for a condition absent from projection | BLOCKED |
| Restart after explicit resolution | Terminal duplicate is collapsed; no task revival | Not sufficient because production does not derive resolution | PASS WITH BLOCKER |
| Family expiry | Expired Opportunity invalidates task and remains auditable | `expireDue()` is invoked | PASS |
| Restart after expiry | No current task is recreated | Proven in official lifecycle proof | PASS |
| Supersession | Old revision/task invalidated; one new current revision/task | Primitive is available | PASS |
| Disappeared condition before expiry | Explicit proof contract exists | No complete reconciliation caller | FAIL |

The implementation report's `STALE OPPORTUNITY CAN PRODUCE CURRENT TASK: NO`
claim is therefore disproven for the actual production runner.

## 6. Tenant isolation and database invariants

Database-level adversarial matrix: **18/18 PASS**.

It proves, among other invariants:

- same identity in the same tenant is collapsed/rejected;
- the same identity in another tenant is allowed;
- cross-tenant supersession is rejected;
- cross-tenant AgentTask links are rejected;
- only one active Opportunity exists per tenant/semantic identity;
- only one current AgentTask exists per tenant/Opportunity/domain identity;
- terminal Opportunity cannot retain or regain a current task;
- `inform_only` Opportunity cannot create an AgentTask;
- no durable `ActionIntent` table exists.

Tenant isolation: **PASS**.

## 7. Policy version and historical events

Policy key and version are persisted on each Opportunity revision. A later
policy version does not rewrite the historical revision. Current-task reads
also require an explicit policy allowlist.

Bootstrap and historical protections are present and tested:

- `bootstrap` ingestion is rejected;
- non-live ingestion is rejected;
- observations before WATCH/cutover are rejected;
- pending historical DomainEvents are not replayed automatically;
- current appointment validation is required before projection.

Policy immutability: **PASS**.

Historical-event cutover: **PASS**.

## 8. Fact, Opportunity and prediction boundary

Static and runtime review found no independent calculation inside
`src/opportunities` of:

- revenue;
- attendance;
- recency;
- raw CRM meaning;
- invented monetary value;
- churn/no-show probability.

The layer consumes canonical signals and versioned trusted policy. Guards reject
invented valuation fields such as lost/recovered/expected revenue and CLV.

Unknown/incomplete behavior is conservative:

- client recency requires `measured` distance and proven canonical attendance;
- capacity requires `measured`, positive, future interval evidence;
- business metric change requires measured current and previous facts;
- `missing_business_input` is a separate trusted-policy-backed Opportunity and
  never substitutes zero/default for unknown.

Fact -> Opportunity boundary: **PASS**, except for the incomplete Occupancy
current-capacity proof described below.

## 9. Occupancy blocker

Production Occupancy projection proves:

- a canonical appointment was observed as removed after WATCH cutover;
- the removed appointment owned a positive future blocked interval.

It does not yet prove the complete current condition required by the final gate:

- that the staff member is currently scheduled/working for this interval;
- that no replacement/current appointment occupies the interval;
- that provider availability still considers the interval bookable;
- that capacity completeness covers the relevant branch/staff window.

An absent or removed Appointment is not itself proven current free capacity.
Until an authoritative current-capacity validator owns this negative proof, the
Occupancy Opportunity cannot be considered fully canonical/actionable.

Occupancy proof: **FAIL**.

## 10. Client Lifecycle and Business Intelligence

Client Lifecycle semantics are correctly bounded in the canonical engine:

- recency remains a canonical fact;
- thresholding requires an explicit tenant policy with `policyRef`, positive
  version, minimum days and `attendance_proven` basis;
- unknown/incomplete recency does not create a reactivation Opportunity;
- no churn probability is calculated.

Business Intelligence supports `inform_only` Opportunities with no AgentTask or
ActionIntent. The engine does not force every measured change into an action.

These contracts pass, but production source coverage for these families remains
limited and does not repair the canonical-owner blocker.

## 11. AgentTask and four-domain routing

AgentTask is a structured assignment. It contains domain, objective, opaque
evidence refs, read/action allowlists, expiry and L2.5 constraints. It does not:

- recalculate the Opportunity;
- own business truth;
- persist raw tenant state or PII;
- grant permissions;
- execute an action.

Static routing is closed over exactly four domains:

| Agent domain | Allowed Opportunity families | Required evidence | Possible ActionIntent class | Forbidden |
|---|---|---|---|---|
| Admin | `incoming_customer_request` | authenticated tenant-scoped request ref and trusted scope | response draft preparation | permissions, execution, CRM mutation |
| Client Lifecycle | `client_reactivation_candidate` | canonical attendance + measured recency + versioned tenant threshold | reactivation review preparation | churn prediction, direct outreach |
| Occupancy | `appointment_cancellation_recovery` | canonical removed event + complete current capacity proof | recovery options preparation | booking/contact/campaign execution |
| Business Intelligence | `business_metric_change`, `missing_business_input` | canonical facts/changes + trusted versioned policy | none required | metric recalculation, invented valuation |

Runtime agents were not created.

## 12. ActionIntent and side-effect boundary

`src/opportunities` imports no CRM writer, messaging sender, campaign executor,
booking mutation, loyalty writer or billing mutation owner. Boundary tests scan
the module for forbidden imports/calls.

All Chapter 5 ActionIntents remain runtime structured output with:

- `dryRun: true`;
- `state: proposed`;
- persisted: 0;
- executed: 0.

No Chapter 5 path executes an ActionIntent. External side effects: 0.

Action boundary: **PASS**.

## 13. Security

Untrusted external text cannot select the agent domain, action capability,
policy version, autonomy or permissions. Routing and capabilities are static
trusted allowlists, and untrusted request text is not copied to persisted
evidence/task/intent fields.

Persisted lifecycle records contain minimal metadata and opaque tenant-scoped
refs, not raw CRM payload, complete Business State, names, phones, e-mails or
credentials.

Open future blocker remains correctly carried forward: indirect prompt
injection must be closed before runtime/autonomous agents. The known
tenant-safety debt in the generic DomainEvent claim path also remains open; the
Chapter 5 shadow read intentionally does not use that path.

## 14. Canonical production owner blocker

The canonical engine is the deterministic owner inside `src/opportunities`, but
it is not the only production semantic owner. Independent legacy logic remains
active in:

- `master-money-motivation.ts` (`UpsellOpportunity` and collection/scoring);
- `ai-tool-handler.service.ts` (legacy opportunity/tool routing);
- `ai-core.service.ts` (analytics recommendation generation);
- `marketing.service.ts` (audience, preview and campaign/recovery candidate
  logic).

These paths are not proven consumers of the durable canonical Opportunity
lifecycle. The required explicit cutover/deprecation from the Architecture Gate
and Carry-forward Register has not happened.

`CANONICAL OPPORTUNITY OWNER: NO`.

## 15. Immutable release blocker

The release contains compiled lifecycle library modules under
`dist/src/opportunities`, but it does not contain the production lifecycle
runner under `dist/scripts`.

Cause:

- `tsconfig.build.json` excludes `scripts`;
- deploy uploads `dist`, package metadata and Prisma assets, but not source
  `scripts`;
- the deployed release has no
  `dist/scripts/opportunity-lifecycle-shadow.js`.

Therefore the exact documented production lifecycle process is not runnable
from the immutable deployed artifact. One-off verification can inspect the
database, but that is not equivalent to a packaged restart-safe production
consumer.

## 16. Validation evidence

The following checks were rerun during this final verification rather than
trusted from the implementation report:

| Check | Result |
|---|---|
| Full Jest | 164 suites / 1640 tests PASS |
| Lint | PASS |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Build | PASS |
| Prisma validate | PASS |
| Clean DB from all migrations | 49 migrations PASS |
| Fresh clean DB schema drift | no diff |
| Production structural clone schema drift | no diff |
| Production `migrate status` | up to date |
| Compiled production preflight | PASS; DB ready, zero pending |
| Production health | OK |
| Production readiness | database ready |
| Production error journal | no entries in checked window |
| DB invariant matrix | 18/18 PASS |
| Official lifecycle proof | restart/supersession/expiry/cutover PASS |
| Production same-evidence rerun | no duplicates |
| Production-sequence disappeared-evidence proof | FAIL: stale active Opportunity/current task remains |

The production structural clone intentionally has no Prisma migration journal;
its structural schema nevertheless has no diff from the current Prisma schema.

The official resolution proof calls `resolveCurrent()` explicitly. It therefore
does not cover the failing production behavior where a condition disappears
from a new complete projection and no caller derives or applies the resolution.

## 17. Carry-forward audit

The Architecture Gate and Chapter 5 findings remain explicitly mapped:

| Destination | Preserved findings |
|---|---|
| Chapter 6 | Action Engine, permissions/consent/ownership, idempotency, confirmation, retry/reconcile/unknown outcome, campaigns/delivery |
| Chapter 7 | outcome measurement and attribution from Opportunity through observed result |
| Chapter 8 | prediction, churn/no-show probability, anomaly calibration and valuation |
| Chapter 9 | Maya Orchestrator, runtime agents and prompt-injection boundary |
| Chapter 10 | tenant x agent domain x action class autonomy, shadow-before-L3, limits, kill switch and escalation |
| Security debt | tenant constraints, no raw PII/payload, untrusted text cannot route/escalate, tenant-unsafe event claim |
| Technical debt | transient Business State changes, missing capacity episode owner, client identity gap, legacy cutover and release packaging |

No later-chapter responsibility was moved into Chapter 5.

## 18. Necessary closure fixes only

1. Implement family-aware complete current-state reconciliation. For each
   complete tenant/family scan, atomically compare durable active semantic keys
   with the fully validated current projection, resolve/invalidate conditions
   that are proven absent, and never infer absence from a partial scan.
2. Define and automatically invoke canonical negative/resolution proof for each
   supported Opportunity family. Explicit `resolveCurrent()` remains the
   transition primitive, but production must derive its proof from complete
   current evidence.
3. Strengthen Occupancy evidence with an authoritative current-capacity
   validator: current staff schedule/working interval, current occupation or
   replacement state, provider availability and completeness. Removed
   appointment + prior blocked interval is insufficient.
4. Package the lifecycle runner/verifier into the immutable production release
   and prove same-evidence restart plus disappeared/changed-evidence
   reconciliation by executing that deployed artifact.
5. Explicitly cut over or deprecate legacy `UpsellOpportunity`, analytics
   recommendation and marketing/recovery candidate paths, or make them consume
   canonical lifecycle output. Prove one production semantic owner.
6. After these fixes, rerun read-only production verification across time,
   including evidence disappearance and evolution, not only identical-evidence
   replay.

No Chapter 6 work is part of these fixes.

## 18.1 Pre-closure status (superseded)

Этот verdict был корректным для failing baseline и сохранён как audit trail.
Итог после CF1-CF6 находится в разделе 19.

| Pre-closure field | Value |
|---|---|
| Chapter 5 complete | NO |
| Opportunity foundation complete | YES |
| Canonical Opportunity owner | NO |
| Durable lifecycle proven | NO |
| Stale Opportunity could produce current task | YES |
| Action Intents executed | 0 |
| External side effects | 0 |
| Ready for Chapter 6 | NO |
| Chapter 6 started | NO |
| Runtime agents created | NO |

## 19. CYCLE 05 final closure fixes verification

### 19.1 CF1-CF6 checklist

| Fix | Реализация | Доказательство | Result |
|---|---|---|---|
| CF1 - current-state reconciliation | Complete family scan сопоставляет durable active semantic keys с current canonical projection; `partial`, `unknown` и `provider_failure` не доказывают исчезновение | disappearance, incomplete-read и provider-failure PostgreSQL scenarios | PASS |
| CF2 - AgentTask follows Opportunity | `resolved`, `expired` и `superseded` атомарно инвалидируют current task; terminal task не открывается повторно | terminal/restart, expiry и supersession DB invariants | PASS |
| CF3 - production lifecycle runner | Existing reconciliation scheduler вызывает `detect -> reconcile -> route task` после successful canonical reconciliation и затем останавливается | production scheduler journal после deploy | PASS |
| CF4 - Occupancy evidence | Opportunity требует canonical working schedule и provider-confirmed available slot; отсутствие Appointment само по себе недостаточно | capacity absent/present matrix | PASS |
| CF5 - canonical owner bypasses | Legacy upsell/marketing recommendation producers удалены из production-reachable graph либо перестали принимать independent opportunity decision | source boundary inventory/test | PASS |
| CF6 - artifact and invocation proof | Runner собирается в `dist`, проверяется deploy preflight, вызывается из immutable release и штатного scheduler path | release `20260821-c05-closure-final`, manual compiled invocation и scheduler invocation | PASS |

### 19.2 PostgreSQL lifecycle matrix

Проверка выполнена на настоящем PostgreSQL, поднятом из всех 49 migrations.
Production data в proof database не копировались. Все 34 DB invariants и вся
обязательная lifecycle matrix прошли.

| Scenario | Result |
|---|---|
| detect -> active | PASS |
| same evidence -> same Opportunity | PASS |
| same evidence after restart -> no duplicate | PASS |
| concurrent same evidence -> one Opportunity and one current task | PASS |
| condition disappears -> resolved | PASS |
| resolved + restart -> remains resolved | PASS |
| resolved Opportunity -> no current AgentTask | PASS |
| expired Opportunity -> no current AgentTask | PASS |
| superseded Opportunity -> old task not current | PASS |
| changed evolving evidence -> one successor revision | PASS |
| incomplete read -> no false resolution | PASS |
| provider failure -> no false resolution | PASS |
| same identity in another tenant -> independent | PASS |
| cross-tenant supersession/task reference -> DB rejected | PASS |
| historical/bootstrap DomainEvent -> no current Opportunity | PASS |
| Occupancy without canonical capacity -> no Opportunity/task | PASS |
| Occupancy with proven schedule and availability -> Opportunity/task | PASS |
| rerun after terminal state -> stale task not resurrected | PASS |
| ActionIntent table/execution | absent / 0 |

Proof totals before cleanup: 8 Opportunities (`active=5`, `resolved=1`,
`expired=1`, `superseded=1`) and 8 AgentTasks (`current=5`,
`invalidated=3`). `duplicateAttemptsCollapsed=8`, raw CRM payload persisted:
NO, full Business State persisted: NO, external side effects: 0.

### 19.3 Migration and release validation

| Gate | Result |
|---|---|
| Prisma validate | PASS |
| Clean DB from all migrations | 49 migrations PASS |
| Migration reproducibility | PASS |
| Production structural clone | 67 public tables; no production rows copied |
| Prisma drift on clean DB | no difference detected |
| Prisma drift on production structural clone | no difference detected |
| Lint | PASS |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Build | PASS |
| Full Jest | 165 suites / 1659 tests PASS |
| Immutable deploy preflight | PASS; database ready; zero pending migrations |
| Smoke before switch | PASS on isolated port |
| Atomic switch | `20260821-c05-closure-final` active |
| Health / readiness | PASS / PASS |
| Error journal after deploy | no errors in checked window |

### 19.4 Production shadow proof

Lifecycle writes were limited to internal `Opportunity`/`AgentTask` state.
No CRM write, message, campaign, booking mutation, loyalty write, approval,
execution retry or provider outcome path was invoked.

| Metric | Result |
|---|---:|
| `detected_now` | 2 |
| `durable_active_before` | 2 |
| `resolved` | 0 |
| `expired` | 0 |
| `superseded` | 2 |
| `durable_active_after` | 2 |
| `current_tasks` | 2 |
| `stale_tasks` | 0 |
| `duplicate_attempts_collapsed` on same-evidence rerun | 2 |
| `action_intents_proposed` | 2 |
| `action_intents_executed` | 0 |
| `external_side_effects` | 0 |

The two pre-existing production Opportunities are explained without IDs, PII
or raw evidence:

1. The first old condition became `superseded` because the complete current
   canonical evidence produced a newer evidence fingerprint. Its old task is
   `invalidated`; the successor is `active` because current schedule and
   provider availability were validated.
2. The second old condition followed the same lifecycle independently for a
   different opaque appointment reference: old row `superseded`, old task
   `invalidated`, one current successor validated by canonical capacity.

Final production aggregate after closure and restart proof: 4 Opportunities
(`active=2`, `superseded=2`) and 4 AgentTasks (`current=2`, `invalidated=2`),
with `stale_tasks=0`. A second compiled invocation preserved these counts. The
enabled production scheduler then completed reconciliation and logged:
`detected=2`, `active=2`, `tasks=2`, `duplicates=2`, `executed=0`.

### 19.5 Canonical owner and Chapter 6 boundary

`src/opportunities` is the only production-reachable computation owner for
Chapter 5 Opportunity semantics. Legitimate WATCH and Business State readers
remain evidence owners, not decision owners. The boundary test verifies that
the Opportunity graph cannot import CRM writes, messaging/campaign executors,
billing/loyalty writes or other side-effect owners.

`ActionIntent` remains runtime structured output only. There is no durable
ActionIntent table, no approvals, retries, delivery state, provider outcome or
execution attempt. Runtime agents were not created.

## Final status after CF1-CF6

CHAPTER 5 COMPLETE: YES

OPPORTUNITY FOUNDATION COMPLETE: YES

CANONICAL OPPORTUNITY OWNER: YES

DURABLE LIFECYCLE PROVEN: YES

STALE OPPORTUNITY CAN PRODUCE CURRENT TASK: NO

ACTION INTENTS EXECUTED: 0

EXTERNAL SIDE EFFECTS: 0

READY FOR CHAPTER 6 ACTION ENGINE: YES

APPLICATION CODE CHANGED: YES

DATABASE SCHEMA CHANGED IN CLOSURE: NO

PRODUCTION LIFECYCLE DATA CHANGED: YES - `Opportunity`/`AgentTask` only

CHAPTER 6 STARTED: NO

RUNTIME AGENTS CREATED: NO
