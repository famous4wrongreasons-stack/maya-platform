# CYCLE 05 — OPPORTUNITY LIFECYCLE SCHEMA GATE

> Gate approved on 2026-08-21. Approved decisions: durable Opportunity —
> required; durable AgentTask — required; durable ActionIntent — not required
> in Chapter 5.

Дата: 2026-08-21.

Ветка: `codex/maya-brain-systemic-release-20260815`.

Проверенный HEAD до подготовки документа: `bd8549dd`.

Production baseline: `20260820-c04-closure-final`.

Статус документа: предложение схемы для отдельного утверждения. Prisma schema,
миграции, application runtime и production database этим шагом не изменяются.

## 1. Scope and non-goals

Этот Schema Gate закрывает только архитектурное решение, найденное в Cycle 05
Phase C: current Opportunity lifecycle не переживает restart и потому не может
гарантировать, что resolved, expired или superseded Opportunity не породит
устаревший AgentTask повторно.

Цель gate:

1. определить минимального durable owner для Opportunity lifecycle;
2. определить минимальную durable связь Opportunity с AgentTask;
3. зафиксировать tenant, identity, deduplication, lifecycle, expiry,
   supersession и restart invariants;
4. описать безопасную additive migration и adversarial DB proof plan;
5. не вводить execution semantics и не начинать Chapter 6.

Вне scope:

- runtime specialized agents;
- Maya Orchestrator runtime;
- Action Engine;
- отправка сообщений, кампании и CRM mutations;
- booking, reschedule или cancellation execution;
- autonomy выше `L2.5 Shadow`;
- outcome attribution и recovered revenue;
- predictive churn, no-show, CLV или monetary valuation;
- перенос legacy recommendation logic в production;
- изменение production data.

## 2. Why persistence is required

Opportunity не является новым источником бизнес-истины. Истиной остаются
canonical Business State и его evidence owners. Opportunity хранит только
состояние решения Maya о том, что доказанная business condition **сейчас**
заслуживает внимания.

Разделение владельцев:

| Layer | Owns | Does not own |
|---|---|---|
| WATCH / `DomainEvent` | доказанный исторический факт изменения | current Opportunity |
| Business State | текущую canonical business truth | решение Maya обратить внимание |
| Opportunity | current attention state и ссылку на доказательства | CRM snapshot, canonical metric, action result |
| AgentTask | deterministic assignment current Opportunity одному domain | truth, permissions, execution |
| ActionIntent | будущий proposed action contract | execution |
| Chapter 6 Action Engine | side effects и их lifecycle | business truth |

In-memory lifecycle недостаточен по четырём причинам:

1. после restart Maya забывает terminal status;
2. два параллельных projector могут создать две current revisions;
3. supersession Opportunity и invalidation старого AgentTask должны быть
   атомарны;
4. historical DomainEvent остаётся истинным после исчезновения current
   condition и не может заменить lifecycle owner.

Существующие таблицы нельзя переиспользовать:

| Existing owner | Почему не подходит |
|---|---|
| `DomainEvent` | immutable history; событие не становится resolved |
| `InboxItem` | presentation/message record, а не domain decision state |
| `MarketingCampaign` | action/delivery artifact, уже содержит side-effect semantics |
| `ReconciliationRun` | completeness/lease одного CRM scan, а не Opportunity state |

Следовательно, durable persistence обязательна. При этом она должна хранить
refs и decision metadata, а не дублировать Business State.

## 3. Minimal tables decision

Минимум сейчас: **две таблицы**.

| Table | Required | Reason |
|---|---:|---|
| `Opportunity` | YES | restart-safe identity, lifecycle, expiry, supersession и audit refs |
| `AgentTask` | YES | restart-safe current assignment и атомарная invalidation stale task |
| `ActionIntent` | NO | Chapter 5 только вычисляет ephemeral `proposed + dryRun`; durable action lifecycle принадлежит Chapter 6 |
| `OpportunityTransition` | NO | current gate не требует отдельного event log; terminal timestamps, reason codes и successor link достаточны для v1 |
| `OpportunityPolicy` | NO | gate хранит обязательные `policyKey/version`; policy registry остаётся versioned code/config owner до отдельного решения |

Отдельная transition table сейчас добавила бы третий lifecycle owner и
неоправданную сложность. Если Chapter 7 потребует полный immutable transition
audit, это отдельный additive gate, а не скрытое расширение Cycle 05.

## 4. Prisma proposal

Ниже conceptual Prisma proposal. Он **не применён**. Имена enum и raw SQL
constraints должны быть подтверждены отдельным schema approval. Частичные
индексы, transition guards и deferred cross-row invariants не выражаются Prisma
полностью и поэтому перечислены отдельно в разделе 13.

```prisma
enum OpportunityLifecycleStatus {
  active
  resolved
  expired
  superseded
}

enum OpportunityOutcome {
  inform_only
  investigation_required
  action_candidate
}

enum OpportunityAgentDomain {
  admin
  client_lifecycle
  occupancy
  business_intelligence
}

enum AgentTaskLifecycleStatus {
  current
  invalidated
}

model Opportunity {
  id                          String                     @id @default(cuid())
  tenantId                    String

  type                        String
  identityVersion             Int                        @default(1)
  semanticKey                 String
  identityFingerprint         String
  revision                    Int

  affectedEntityKind          String?
  affectedEntityRef           String?

  evidenceFingerprint         String
  evidenceRefsJson            Json
  evidenceObservedAt          DateTime
  limitationsJson             Json

  policyKey                   String
  policyVersion               Int
  recommendedAgentDomain      OpportunityAgentDomain
  outcome                     OpportunityOutcome

  status                      OpportunityLifecycleStatus @default(active)
  firstDetectedAt             DateTime
  lastValidatedAt             DateTime
  expiresAt                   DateTime
  terminalAt                  DateTime?
  terminalReasonCode          String?
  terminalEvidenceFingerprint String?
  terminalEvidenceRefsJson    Json?

  // Direction is successor -> predecessor. This avoids an immediate FK to a
  // row that does not exist yet while superseding atomically.
  supersedesOpportunityId     String?

  createdAt                   DateTime                   @default(now())
  updatedAt                   DateTime                   @updatedAt

  tenant                      Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  supersedes                  Opportunity?               @relation(
    "OpportunitySupersession",
    fields: [supersedesOpportunityId, tenantId, semanticKey],
    references: [id, tenantId, semanticKey],
    onDelete: Restrict
  )
  supersededBy                Opportunity[]              @relation("OpportunitySupersession")
  agentTasks                  AgentTask[]

  @@unique([id, tenantId])
  @@unique([id, tenantId, semanticKey])
  @@unique([tenantId, identityFingerprint])
  @@unique([tenantId, semanticKey, revision])
  @@unique([tenantId, supersedesOpportunityId])
  @@index([tenantId, status, expiresAt])
  @@index([tenantId, type, status])
  @@index([tenantId, semanticKey, revision])
}

model AgentTask {
  id                       String                   @id @default(cuid())
  tenantId                 String
  opportunityId            String
  semanticKey              String
  taskFingerprint          String

  agentDomain              OpportunityAgentDomain
  objectiveKey             String
  allowedReadCapabilities  Json
  allowedActionClasses     Json
  autonomyLevel            String                   @default("L2_5_SHADOW")

  status                   AgentTaskLifecycleStatus @default(current)
  requestedAt              DateTime
  expiresAt                DateTime
  invalidatedAt            DateTime?
  invalidationReasonCode   String?

  createdAt                DateTime                 @default(now())
  updatedAt                DateTime                 @updatedAt

  tenant                   Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  opportunity              Opportunity              @relation(
    fields: [opportunityId, tenantId, semanticKey],
    references: [id, tenantId, semanticKey],
    onDelete: Restrict
  )

  @@unique([id, tenantId])
  @@unique([tenantId, taskFingerprint])
  @@unique([tenantId, opportunityId, agentDomain])
  @@index([tenantId, status, expiresAt])
  @@index([tenantId, semanticKey, agentDomain, status])
}
```

`Tenant` получит только две обратные relation collections:

```prisma
opportunities Opportunity[]
agentTasks    AgentTask[]
```

### 4.1 Why some fields are intentionally absent

В `Opportunity` нет:

- raw CRM payload;
- copied Business State values;
- names, phones, emails, message text или tokens;
- invented monetary value;
- LLM rationale;
- provider delivery state;
- retry/lease fields;
- execution result.

В `AgentTask` нет:

- prompt/response transcript;
- proposed target and arguments;
- provider/campaign/message identifiers;
- `running`, `sent`, `succeeded` или `failed`;
- retry count, lease или worker ownership;
- canonical metric values.

Последние поля были бы скрытым Action Engine и нарушили бы Chapter 5 boundary.

## 5. Identity and deduplication model

Нужны три разных детерминированных ключа. Они не взаимозаменяемы.

### 5.1 `semanticKey`

`semanticKey` отвечает на вопрос: «это тот же бизнес-смысл, который может
получить более новую revision?»

Canonical input:

```text
identityVersion
tenantId
opportunityType
family-specific semantic scope
policyKey
```

Не входят:

- detection timestamp;
- `observedAt`;
- evidence version;
- policy version;
- LLM text;
- current priority.

Family-specific scope:

| Domain | Semantic scope |
|---|---|
| Client Lifecycle | internal client ref + lifecycle family/policy scope |
| Occupancy | canonical capacity/recovery episode ref |
| Business Intelligence | affected entity + metric + attention-policy scope |
| Admin | canonical request/work-item ref |

`semanticKey` не строится из имени, телефона, email или внешнего CRM id.

### 5.2 `evidenceFingerprint`

`evidenceFingerprint` отвечает на вопрос: «это ровно та же версия доказательств?»

Canonical input:

```text
sorted evidence items:
  evidence owner
  opaque internal ref
  contract/version
  observedAt/asOf
  completeness
sorted limitation codes
```

Порядок входных массивов нормализуется. JSON сериализуется canonical serializer,
а не runtime-dependent `JSON.stringify` над произвольным объектом.

### 5.3 `identityFingerprint`

`identityFingerprint` является exact durable dedup key:

```text
identityVersion
tenantId
opportunityType
semanticKey
evidence identities and versions
evidenceFingerprint
policyKey
policyVersion
```

Detection timestamp исключён. Два projector, увидевшие одинаковую truth version,
обязаны получить одинаковый fingerprint независимо от времени запуска.

Fingerprint вычисляется SHA-256 над canonical representation. Это допустимо,
потому что input состоит только из opaque Maya refs и version codes, а не из
PII. Если в input когда-либо появится угадываемый внешний identifier, gate
пересматривается: такой identifier сначала заменяется внутренним ref, а не
«защищается» hash.

### 5.4 Revision and recurrence

- `revision` возрастает внутри `tenantId + semanticKey`.
- Same identity fingerprint означает idempotent revalidation существующей row.
- New evidence или policy version при том же semantic key создают новую
  revision и supersede прежнюю active row.
- Terminal row никогда не открывается повторно.
- Повторное возникновение condition создаёт новую revision/episode только при
  наличии новой canonical evidence version.
- Если projector пытается воскресить terminal row с тем же exact evidence,
  operation fail closed: stale evidence не становится current.

## 6. Lifecycle state machine

Минимальные durable statuses:

| Status | Meaning |
|---|---|
| `active` | current canonical evidence подтверждает attention condition |
| `resolved` | current-state revalidation доказала, что condition false |
| `expired` | family-specific deadline/freshness закончились |
| `superseded` | новая revision того же semantic scope атомарно заменила старую |

`detected` и `still_valid` являются observations, а не дополнительными statuses.

```text
absent --detect--> active
active --same evidence revalidate--> active
active --condition false--> resolved
active --deadline elapsed--> expired
active --new evidence/policy revision--> superseded + new active revision

resolved   --X--> active
expired    --X--> active
superseded --X--> active
```

Terminal statuses: `resolved`, `expired`, `superseded`.

### 6.1 Allowed transitions

| From | To | Allowed | Required proof |
|---|---|---:|---|
| absent | active | YES | current canonical evidence + approved policy |
| active | active | YES | same identity fingerprint, current revalidation |
| active | resolved | YES | current canonical state proves condition false |
| active | expired | YES | database/application clock >= approved `expiresAt` |
| active | superseded | YES | successor with same tenant + semanticKey and new identity |
| terminal | same terminal | idempotent only | no semantic mutation |
| terminal | active/other terminal | NO | create a new revision instead |

### 6.2 Resolution rule

Opportunity может стать `resolved` только из canonical current-state proof.

Не являются resolution:

- создание AgentTask;
- создание proposed ActionIntent;
- попытка отправки сообщения;
- LLM statement «проблема решена»;
- обещание пользователя;
- успешный HTTP response без canonical reconciliation;
- оптимистическое изменение local UI.

Примеры valid resolution:

| Family | Canonical resolution proof |
|---|---|
| Client reactivation | новый доказанный attended visit или invalidated identity/policy |
| Occupancy | capacity заполнена/исчезла, schedule changed или interval ended |
| BI attention | current facts больше не удовлетворяют versioned attention policy |
| Missing input | canonical input стал measured/complete |
| Admin request | trusted request owner подтверждает closed/handled state |

### 6.3 Expiry rule

`expiresAt` обязателен для каждой durable Opportunity. Timeless current decision
state запрещён. Expiry определяется domain policy, а не generic TTL:

| Family | Expiry source |
|---|---|
| Occupancy | конец доказанного capacity interval или более ранняя invalidation |
| Client Lifecycle | versioned tenant recency/freshness policy |
| BI | конец comparison/evaluation window или attention freshness |
| Admin | trusted request review/deadline policy |
| Missing input | bounded review window; затем обязательная current revalidation |

После expiry condition не продлевается update существующей row. Если она всё ещё
истинна после новой проверки, создаётся новая revision с новым evidence/policy
version. Это не позволяет бессрочно сохранять stale task.

## 7. Supersession model

Связь хранится на successor row через `supersedesOpportunityId`.

Почему направление successor -> predecessor:

1. predecessor уже существует и доступен immediate FK check;
2. в одной transaction predecessor переводится в `superseded`, затем вставляется
   successor;
3. partial unique index освобождает active semantic scope после первого шага;
4. deferred invariant в конце transaction требует ровно одного successor;
5. не нужен FK на ещё не существующую row.

Invariants:

- successor и predecessor имеют один `tenantId`;
- successor и predecessor имеют один `semanticKey`;
- successor не может ссылаться на себя;
- у predecessor не более одного direct successor;
- `revision(successor) = revision(predecessor) + 1`;
- predecessor status равен `superseded`;
- successor при создании равен `active`;
- supersession и invalidation predecessor tasks проходят в одной transaction.

История может быть цепочкой revisions. Current query никогда не обходит цепочку:
она читает единственную `active` row по partial unique index.

## 8. Opportunity and AgentTask relationship

### 8.1 Why AgentTask is durable now

AgentTask обязан быть durable, потому что иначе после restart невозможно
доказать:

- какой domain получил current Opportunity;
- что task старой revision invalidated;
- что два projector не выдали duplicate current task;
- что task capability allowlist соответствует конкретной policy revision;
- что task истекла вместе с Opportunity.

AgentTask остаётся assignment record, а не execution job.

### 8.2 Cardinality

В v1 каждая Opportunity маршрутизируется максимум в один из четырёх domains.

| Opportunity outcome | Durable AgentTask |
|---|---|
| `inform_only` | NO по умолчанию; presentation может читать Opportunity напрямую |
| `investigation_required` | YES |
| `action_candidate` | YES |

`@@unique([tenantId, opportunityId, agentDomain])` не позволяет duplicate task
для одной revision. Partial unique current index по
`tenantId + semanticKey + agentDomain` не позволяет старой и новой revisions
одновременно иметь current task.

### 8.3 Task lifecycle

Минимальные statuses:

| Status | Meaning |
|---|---|
| `current` | assignment допустим для чтения Orchestrator/agent domain |
| `invalidated` | Opportunity terminal, expired, superseded или policy revoked |

`completed`, `failed`, `sent`, `executed`, `retrying` не вводятся. Они относятся
к future work/execution, а не к assignment.

Current task читается только если одновременно:

1. task status = `current`;
2. linked Opportunity status = `active`;
3. `now < task.expiresAt <= opportunity.expiresAt`;
4. tenant и semantic key подтверждены composite FK;
5. policy version всё ещё разрешена;
6. requested capabilities являются подмножеством approved route policy;
7. autonomy остаётся `L2_5_SHADOW`.

Любая недоказанность приводит к fail closed.

## 9. ActionIntent persistence decision

`DURABLE ACTION INTENT REQUIRED NOW: NO`.

В Chapter 5 ActionIntent остаётся ephemeral deterministic projection:

- `state = proposed`;
- `dryRun = true`;
- no execution;
- no provider target ownership;
- no retry/delivery lifecycle.

Intent может быть повторно вычислен только из **current** AgentTask после полной
revalidation. Его нельзя восстанавливать из terminal task.

Сохранять target/arguments/rationale в `AgentTask` запрещено: это было бы скрытым
durable ActionIntent и преждевременно зафиксировало бы Chapter 6 contract.

Chapter 6 обязан пройти отдельный gate и определить:

- idempotency key;
- permission/consent/ownership proof;
- confirmation state;
- lease/retry/unknown outcome;
- provider reconciliation;
- audit и rollback;
- единственную execution boundary.

## 10. Evidence model

Opportunity хранит ссылки на доказательства, а не сами бизнес-данные.

Минимальная форма `evidenceRefsJson`:

```json
{
  "contract": "maya.opportunity-evidence-refs/1",
  "items": [
    {
      "owner": "business_state_fact",
      "ref": "opaque-internal-ref",
      "version": 3,
      "observedAt": "2026-08-21T08:00:00.000Z",
      "completeness": "complete"
    }
  ]
}
```

Разрешено:

- internal opaque refs;
- contract/version;
- observedAt/asOf;
- completeness;
- deterministic limitation codes;
- source capability code.

Запрещено:

- raw CRM response;
- Business State snapshot;
- person name, phone, email, message text;
- external access token или provider credentials;
- arbitrary LLM rationale;
- monetary estimate без canonical valuation owner.

`limitationsJson` содержит только versioned codes, например
`capacity_completeness_partial`, а не свободный текст. Human-readable copy
строится presentation layer.

Terminal proof:

- `resolved` требует `terminalEvidenceFingerprint` и terminal evidence refs;
- `expired` использует approved `expiresAt` + reason code;
- `superseded` использует successor relation и successor evidence;
- raw resolution payload не сохраняется.

## 11. Policy versioning

Каждая Opportunity обязана иметь `policyKey` и положительный `policyVersion`.

Policy определяет:

- eligibility;
- semantic scope version;
- required evidence and completeness;
- expiry/revalidation window;
- outcome;
- recommended agent domain;
- allowed capabilities/action classes;
- deterministic urgency, если она доказуема.

Policy version не является Business State. Это reproducibility metadata решения
Maya.

Rules:

1. смена `policyVersion` меняет `identityFingerprint`;
2. при том же `policyKey + semanticKey` новая policy version supersede current
   revision, если condition остаётся valid;
3. revoked policy invalidates current tasks;
4. неизвестная/недоступная policy version означает fail closed;
5. LLM не выбирает policy, domain, expiry или capability allowlist;
6. tenant-editable policy не вводится этим gate; если она понадобится, нужен
   отдельный durable policy owner/schema gate.

Generic `low/medium/high` не сохраняется как canonical priority. Deadline-derived
urgency может вычисляться из `expiresAt`; orchestration priority принадлежит
будущему Orchestrator policy.

## 12. Tenant invariants

Все uniqueness, relations и reads tenant-qualified by construction.

Обязательные правила:

1. `Opportunity.tenantId` имеет FK на `Tenant` с `ON DELETE CASCADE`.
2. `AgentTask.tenantId` имеет FK на `Tenant` с `ON DELETE CASCADE`.
3. Task -> Opportunity использует composite FK
   `(opportunityId, tenantId, semanticKey)`.
4. Supersession использует composite FK
   `(supersedesOpportunityId, tenantId, semanticKey)`.
5. Exact dedup unique: `(tenantId, identityFingerprint)`.
6. Revision unique: `(tenantId, semanticKey, revision)`.
7. Active/current partial uniques включают tenant.
8. Repository methods не принимают tenant из untrusted payload; tenant берётся
   из authenticated execution context.
9. Cross-tenant ref отклоняется самой database, даже если service layer ошибся.
10. Opaque affected entity ref намеренно не является polymorphic FK: удаление
    client/appointment/staff не стирает decision audit и не вызывает cascade из
    другого domain owner.

## 13. Database invariants

Prisma declarations недостаточно. Additive SQL migration должна добавить
следующие database-owned invariants.

### 13.1 Partial unique indexes

```sql
CREATE UNIQUE INDEX "Opportunity_one_active_semantic_key"
  ON "Opportunity" ("tenantId", "semanticKey")
  WHERE "status" = 'active';

CREATE UNIQUE INDEX "AgentTask_one_current_semantic_domain"
  ON "AgentTask" ("tenantId", "semanticKey", "agentDomain")
  WHERE "status" = 'current';
```

Prisma не выражает partial indexes. В проекте уже есть проверенный precedent
`ReconciliationRun_live_run_unique`; drift проверяется `migrate diff`.

### 13.2 Row CHECK constraints

Opportunity:

- `identityVersion > 0`;
- `revision > 0`;
- `policyVersion > 0`;
- affected entity kind/ref либо оба NULL, либо оба non-NULL;
- `lastValidatedAt >= firstDetectedAt`;
- `evidenceObservedAt <= lastValidatedAt`;
- `expiresAt > firstDetectedAt`;
- active: terminal fields NULL;
- resolved: terminal timestamp/reason/evidence fingerprint non-NULL;
- expired: terminal timestamp/reason non-NULL;
- superseded: terminal timestamp/reason non-NULL;
- `supersedesOpportunityId <> id`;
- terminal timestamp не раньше first detection.

AgentTask:

- `expiresAt > requestedAt`;
- autonomy exactly `L2_5_SHADOW`;
- current: invalidation fields NULL;
- invalidated: invalidation timestamp/reason non-NULL;
- invalidation timestamp не раньше requestedAt.

JSON shape дополнительно валидируется application contract parser до write.
Migration не пытается реализовать сложную JSON Schema внутри CHECK.

### 13.3 Monotonic transition triggers

CHECK не видит `OLD`, поэтому нужны narrow PostgreSQL guards:

- Opportunity identity/evidence/policy/revision fields immutable after insert;
- разрешены только `active -> active|resolved|expired|superseded`;
- terminal status нельзя изменить;
- terminal row нельзя «переоткрыть»;
- AgentTask разрешает только `current -> current|invalidated`;
- invalidated task нельзя вернуть в current.

`active -> active` может менять только `lastValidatedAt` и `updatedAt`. New
evidence всегда создаёт новую revision.

### 13.4 Deferred cross-row invariants

Constraint triggers, проверяемые в конце transaction, должны гарантировать:

1. каждая superseded Opportunity имеет ровно одного direct successor;
2. successor имеет тот же tenant/semantic key и revision + 1;
3. terminal/expired Opportunity не имеет current AgentTask;
4. current AgentTask ссылается только на active Opportunity;
5. `task.expiresAt <= opportunity.expiresAt`.

Это не execution logic. Это integrity lifecycle state.

## 14. Race safety proof plan

Все detect/revalidate/supersede operations выполняются transactionally с
`SERIALIZABLE` isolation либо эквивалентным row-lock protocol.

### 14.1 Exact duplicate detection

Два workers одновременно видят одну evidence version:

1. оба вычисляют одинаковый `identityFingerprint`;
2. один insert выигрывает unique constraint;
3. второй получает conflict, перечитывает row;
4. если row active, обновляет только monotonic `lastValidatedAt`;
5. AgentTask upsert также сходится по tenant-qualified unique key.

Результат: одна Opportunity, максимум одна current AgentTask.

### 14.2 Concurrent supersession

Два workers видят новую evidence version:

1. lock current active row по tenant + semanticKey;
2. сверяют expected identity/revision;
3. переводят predecessor в superseded;
4. invalidated predecessor task;
5. insert successor revision;
6. insert current task, если outcome требует task;
7. commit только после deferred invariant checks.

Serialization/unique conflict повторяется ограниченно: retry перечитывает
current row и сходится к уже записанной revision. Любая другая DB error не
ретраится вслепую.

### 14.3 Concurrent resolution versus supersession

Обе операции lock одну current row. Победившая transaction terminalizes её.
Проигравшая после retry обязана заново прочитать current canonical evidence:

- terminal row не мутируется;
- stale successor не создаётся;
- при новой доказанной condition создаётся отдельная revision только после
  current-state validation.

## 15. Restart safety proof plan

Проверяемый сценарий:

1. detect Opportunity and current AgentTask;
2. restart process;
3. same evidence projection не создаёт duplicate;
4. canonical state resolves Opportunity;
5. task атомарно invalidated;
6. restart process;
7. replay old DomainEvent не открывает Opportunity;
8. new evidence version создаёт новую revision только после current-state
   validation;
9. old task никогда не возвращается current.

Read path всегда делает join AgentTask -> Opportunity и проверяет status/expiry.
Чтение одной task row без Opportunity запрещено. Cache не является authority и
после restart восстанавливается только из validated DB query.

## 16. Bootstrap and cutover policy

Historical DomainEvent replay запрещён без current-state validation.

Effective lower bound для source family:

```text
max(
  approved global release cutover,
  CrmIntegration.watchStartedAt,
  family policy effectiveFrom
)
```

`CrmIntegration.watchStartedAt` уже существует и остаётся tenant WATCH baseline.
Отдельное поле `Tenant.watchStartedAt` не добавляется.

| Source | Policy |
|---|---|
| bootstrap / observed_existing | только seed current Business State; не создаёт recovery Opportunity само по себе |
| pre-cutover appointment event | не replay как recovery; сначала current capacity revalidation |
| post-cutover removal | candidate input только если current capacity всё ещё measured и open |
| historical visits | recency вычисляется из current canonical attendance facts/asOf |
| historical BI changes | игнорируются; BI пересчитывается из current Business State + current window/policy |
| incoming request | eligible только если trusted request owner подтверждает open + unexpired |

Отдельная checkpoint table сейчас не добавляется. Global cutover и family
`effectiveFrom` принадлежат immutable release/policy registry; tenant baseline
принадлежит `CrmIntegration.watchStartedAt`.

Если для family нет утверждённого `effectiveFrom` или current-state validator,
family остаётся disabled. Нельзя заменять отсутствие policy текущей датой worker.

## 17. Retention and privacy

### 17.1 Data minimization

Opportunity/AgentTask не содержат PII, raw provider data или prompts. Opaque refs
разрешены только внутри tenant boundary. Любая презентация имени/телефона читает
authorized canonical owner отдельно и не копирует их в lifecycle tables.

### 17.2 Retention proposal

- active Opportunity/current Task не удаляются по возрасту;
- invalidated tasks и terminal opportunities хранятся bounded audit window;
- initial proposal: 180 дней, но final duration утверждается privacy/legal policy;
- после окна rows удаляются tenant-scoped batch process либо агрегируются только
  в неперсональные Chapter 7 metrics;
- raw evidence никогда не появляется даже временно;
- tenant erasure удаляет tenant-owned rows в рамках общего legal deletion flow;
- affected entity deletion не каскадит lifecycle audit через polymorphic ref;
- reason fields являются finite codes, не human free text.

Retention job является technical maintenance, не Action Engine. До утверждения
retention policy production writer не включается.

## 18. Migration plan

Только после отдельного schema approval.

### Package M1 - schema only

1. добавить enums/models и Tenant relations;
2. создать additive tables;
3. добавить tenant-qualified FKs/uniques/indexes;
4. добавить raw SQL partial indexes;
5. добавить CHECK/transition/deferred constraint triggers;
6. не делать backfill;
7. не включать runtime writer.

### Package M2 - repository behind disabled flag

1. typed contract parsers;
2. transaction service;
3. tenant-scoped reads;
4. no production projection write by default;
5. no ActionIntent persistence;
6. no Chapter 6 execution.

### Package M3 - shadow cutover

1. enable one tenant/family in read-only L2.5 shadow;
2. seed only from current-state revalidation after effective cutover;
3. compare cross-run lifecycle outcomes;
4. execute zero actions;
5. expand only after restart/race proof.

### Required validation environments

| Environment | Required proof |
|---|---|
| clean database | migrations apply from zero; Prisma validate/generate; tests/build |
| current development DB | additive migration applies without destructive warning |
| production structural clone | schema-only/no-PII clone applies; constraints/indexes valid |
| migration drift check | `prisma migrate diff` reports no unintended drift, including raw SQL objects |
| production | migration first, runtime flag still off; no data backfill |

Production clone must be structural only or sanitized. Credentials and PII are
never copied into local/test output.

## 19. Adversarial database test matrix

| # | Adversarial case | Expected database/result |
|---:|---|---|
| 1 | same exact identity, same tenant, sequential insert | one row; duplicate rejected/upserted |
| 2 | same exact identity, same tenant, concurrent insert | one Opportunity and at most one task |
| 3 | same fingerprint, different tenants | both allowed |
| 4 | task references Opportunity of another tenant | composite FK rejection |
| 5 | successor references predecessor of another tenant | composite FK rejection |
| 6 | successor changes semanticKey | composite FK rejection |
| 7 | two active rows for same tenant + semanticKey | partial unique rejection |
| 8 | two current tasks for semanticKey + domain | partial unique rejection |
| 9 | second successor for one predecessor | tenant-qualified unique rejection |
| 10 | revision <= 0 or policyVersion <= 0 | CHECK rejection |
| 11 | entity kind without ref or ref without kind | CHECK rejection |
| 12 | expiry <= firstDetectedAt/requestedAt | CHECK rejection |
| 13 | active row with terminal fields | CHECK rejection |
| 14 | resolved row without terminal evidence fingerprint | CHECK rejection |
| 15 | terminal -> active update | transition trigger rejection |
| 16 | invalidated task -> current | transition trigger rejection |
| 17 | current task for terminal Opportunity | deferred invariant rejection |
| 18 | task expiry later than Opportunity expiry | deferred invariant rejection |
| 19 | superseded row without successor by commit | deferred invariant rejection |
| 20 | concurrent resolve and supersede | one serializable winner; loser revalidates |
| 21 | restart + same evidence | no duplicate/reopened row |
| 22 | restart + old DomainEvent replay | no Opportunity without current validation |
| 23 | policy version change, same semantic scope | old superseded, one new active revision |
| 24 | current condition becomes false | resolved + task invalidated atomically |
| 25 | clock passes domain expiry | expired + task invalidated atomically |
| 26 | affected Client/Appointment deleted | lifecycle audit remains; no cascade from opaque ref |
| 27 | tenant deleted by legal flow | all Opportunity/AgentTask rows cascade for tenant |
| 28 | JSON contains raw provider payload/PII shape | contract validator rejects before DB write |
| 29 | inform-only Opportunity | no AgentTask created |
| 30 | action candidate in Chapter 5 | task may exist; durable ActionIntent/execution absent |

Tests 2, 7, 8, 17, 19, 20 and 21 являются release blockers. Unit tests service
layer без реальной PostgreSQL concurrency не заменяют эти proofs.

## 20. Rollback and recovery

### Before runtime enablement

Если migration применена, но writer не включён:

- application rollback безопасен;
- новые tables inert;
- физический rollback допустим только если tables пусты и проверен downgrade
  script;
- production data не backfill, поэтому recovery не требует преобразования
  Business State.

### After shadow rows exist

- сначала выключить feature flag/writer;
- не откатывать Prisma migration destructive DROP;
- сохранить rows для incident analysis;
- исправлять forward-only additive migration;
- пересоздавать current state только через canonical revalidation, не replay
  historical events;
- terminal rows не переписывать вручную;
- при ошибке policy отключить family и invalidated affected current tasks
  tenant-scoped transaction.

### Disaster recovery

- restore database из штатного backup;
- держать Opportunity/AgentTask writer выключенным;
- проверить migration level и constraint presence;
- revalidate current Business State after effective cutover;
- не считать restored task current до join/status/expiry/policy verification;
- side effects отсутствуют, поэтому external compensation в Chapter 5 не нужна.

## 21. Dependencies on Chapter 6

Этот gate намеренно не решает:

- durable ActionIntent contract;
- action idempotency;
- permission/consent/ownership check;
- human confirmation;
- retries, leases и unknown outcome;
- external provider delivery;
- CRM reconciliation after mutation;
- outcome attribution.

Chapter 6 может ссылаться только на current AgentTask. Оно не имеет права
переопределять Opportunity truth или делать task current.

## 22. Approval decision

Предлагаемое минимальное решение:

1. durable `Opportunity` обязателен;
2. durable `AgentTask` обязателен;
3. durable `ActionIntent` сейчас запрещён;
4. schema additive, без backfill;
5. production writer остаётся выключенным до DB race/restart proof;
6. Chapter 6 не начинается этим gate.

SCHEMA GATE READY: YES

DURABLE OPPORTUNITY REQUIRED: YES

DURABLE AGENT TASK REQUIRED: YES

DURABLE ACTION INTENT REQUIRED NOW: NO

PRODUCTION DATABASE CHANGED: NO

SCHEMA GATE APPROVED: YES
