# CYCLE 05 — PHASE B — CANONICAL OPPORTUNITY ENGINE

Статус: **IMPLEMENTED + VERIFIED IN READ-ONLY SHADOW**

Дата: 2026-08-21

Ветка: `codex/maya-brain-systemic-release-20260815`

Исходный проверенный HEAD: `bd8549dd122dc1e7f08d641903af5f130f5d90c0`

Production baseline: `20260820-c04-closure-final`

## 1. Scope и архитектурный результат

Реализован единственный deterministic owner для цепочки:

```text
WATCH + Business State
  → Opportunity
  → Agent Task
  → максимум proposed Action Intent
```

Canonical owner находится в:

```text
maya-saas-backend/src/opportunities
```

Движок pure и эфемерный. Он получает canonical signals, versioned tenant
policies и явный projection clock, после чего возвращает immutable projection.
У него нет Nest provider, Prisma, БД, очереди, сети, CRM, LLM, messaging или
action dependencies.

Архитектурная формула сохранена:

> Agent thinks. Capability computes or acts. Business State owns truth.
> Action Engine owns side effects.

Phase B не создаёт Maya Orchestrator runtime, специализированных агентов,
Action Engine, autopilot, prediction или attribution.

## 2. Implemented Opportunity Contract

Контракт: `maya.opportunity/1`.

Обязательные свойства:

| Поле                       | Гарантия                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `opportunityKey`           | детерминированный SHA-256 fingerprint tenant + type + entity + evidence/policy identity |
| `tenantId`                 | обязателен; cross-tenant evidence запрещён                                              |
| `type`                     | только типы из canonical registry Phase B                                               |
| `affectedEntity`           | только opaque tenant-scoped ref, без имени, телефона, email или provider token          |
| `evidence`                 | capability/fact refs, observation time, completeness и basis                            |
| `observedAt` / `expiresAt` | явный lifecycle и projection time                                                       |
| `priority`                 | только при named versioned policy или доказанном deadline                               |
| `recommendedAgentDomain`   | deterministic route к одному из четырёх approved domains                                |
| `allowedNextCapabilities`  | allowlist следующего безопасного шага, не разрешение на исполнение                      |
| `limitations`              | явные ограничения доказательств                                                         |

Реализованные типы:

| Opportunity type                    | Необходимое доказательство                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `client_reactivation_candidate`     | measured recency, proven attendance и versioned tenant recency policy                   |
| `appointment_cancellation_recovery` | canonical `appointment.removed` после WATCH cutover и будущий measured blocked interval |
| `business_metric_change`            | measured current/previous Business State facts и canonical change ref                   |
| `missing_business_input`            | incomplete/unknown Business State fact и explicit trusted tenant policy                 |
| `incoming_customer_request`         | opaque request ref; untrusted text не копируется в Opportunity                          |

Opportunity не пересчитывает canonical metrics, не владеет business truth и не
содержит придуманную денежную стоимость.

## 3. Implemented AgentTask Contract

Контракт: `maya.agent-task/1`.

Каждая Opportunity маршрутизируется в одну минимальную задачу со следующими
ограничениями:

```text
autonomy = L2_5_SHADOW
noSideEffects = true
noDirectAgentCalls = true
noTruthOwnership = true
noCanonicalMetricCalculation = true
```

Task содержит только deterministic `taskId`, tenant, domain, одну opportunity,
evidence refs, objective и allowlists чтения/action classes. Runtime агенты не
созданы: `agentDomain` в этой фазе является маршрутом, а не процессом или
владельцем данных.

## 4. ActionIntent Boundary

Контракт: `maya.action-intent/1`.

Допустимое состояние Chapter 5 строго одно:

```text
dryRun = true
state = proposed
```

Реализованы только три proposal classes:

| Action class                  | Назначение                                                | Что запрещено                                    |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `prepare_reactivation_review` | подготовить eligibility review по recency evidence        | контактировать с клиентом                        |
| `prepare_recovery_options`    | подготовить варианты для доказанного свободного интервала | записывать, переносить, отменять или писать      |
| `prepare_response_draft`      | подготовить draft по opaque request ref                   | отправлять ответ или исполнять инструкции текста |

Для `business_metric_change` и `missing_business_input` Action Intent не
создаётся: Agent Task может только объяснить уже вычисленный факт и его
ограничения.

Перехода из `proposed` нет. Создание/изменение записи, CRM write, loyalty write,
campaign, inbox, Telegram, email, SMS и любой иной side effect отсутствуют и
принадлежат Chapter 6.

## 5. Migrated Rules

Phase B централизовала следующие детерминированные правила в одном owner:

| Семья                  | Canonical rule                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Client recency         | порог не встроен в код как business truth; требуется enabled versioned tenant policy и proven attendance                               |
| Cancellation recovery  | только live webhook/reconciliation removal после effective WATCH cutover, canonical canceled mirror и ещё не истёкший blocked interval |
| Business metric change | только measured-to-measured change; направление принимается как canonical fact, денежное влияние не выводится                          |
| Missing business input | только явно critical fact из trusted versioned policy; `unknown` не превращается в ноль                                                |
| Incoming request       | request становится opaque evidence; пользовательский текст не может выбрать domain, permissions или autonomy                           |

Существующие legacy recommendations, campaign drafts, schedulers и recovery
side effects не переименованы в canonical Opportunity и не удалены. Phase B
создала безопасный owner и boundary, но не подключала старые action paths к
новому engine без Chapter 6.

## 6. Rejected / Deferred Rules

| Rule / family                                    | Решение              | Причина / целевая глава                                                   |
| ------------------------------------------------ | -------------------- | ------------------------------------------------------------------------- |
| `free_slot`, `schedule_gap`, `underloaded_staff` | deferred             | нет canonical capacity/utilization owner и completeness gate              |
| `no_show_risk`, churn risk                       | rejected from v1     | prediction требует versioned model, uncertainty и calibration в Chapter 8 |
| revenue / operational anomaly без policy         | rejected             | unnamed threshold или LLM-интерпретация не являются canonical rule        |
| `lost_revenue`, `expected_recovery`, CLV         | forbidden            | нет canonical valuation model; Chapter 8                                  |
| add-on / upsell candidate                        | deferred             | evidence owners расходятся, а recommendation смешана с valuation          |
| marketing audience / campaign                    | deferred             | eligibility и consent отделяются от candidate; execution только Chapter 6 |
| reputation opportunity                           | deferred             | canonical reputation truth отсутствует                                    |
| recovered revenue / filled window attribution    | deferred             | measured outcome и attribution принадлежат Chapter 7                      |
| generic LLM recommendation                       | rejected as detector | модель не владеет facts, policy, routing или opportunity truth            |

## 7. Routing Matrix

| Opportunity                         | Agent domain          | Allowed next step                                        |
| ----------------------------------- | --------------------- | -------------------------------------------------------- |
| `client_reactivation_candidate`     | Client Lifecycle      | read recency/eligibility; propose reactivation review    |
| `appointment_cancellation_recovery` | Occupancy             | read capacity/recovery options; propose recovery options |
| `business_metric_change`            | Business Intelligence | read and explain referenced Business State facts         |
| `missing_business_input`            | Business Intelligence | explain incomplete policy-critical fact                  |
| `incoming_customer_request`         | Admin                 | read opaque request; propose response draft              |

Direct agent-to-agent communication отсутствует. Loyalty остаётся
capability/policy. Marketing Agent не создан. Reputation не маршрутизируется.

## 8. Deduplication and Lifecycle

| Механизм           | Поведение                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Projection clock   | передаётся явно; engine не читает системные часы                                                                     |
| Evidence lifecycle | принимается только `active`; identity блокируется, если в projection присутствует `resolved` или `expired` companion |
| Expiry             | Opportunity с `expiresAt <= asOf` не создаётся и не маршрутизируется                                                 |
| Fingerprints       | opportunity/task keys детерминированы и tenant-scoped                                                                |
| Dedup              | одинаковые opportunity keys сворачиваются детерминированно независимо от порядка signals                             |
| Persistence        | отсутствует; lifecycle и dedup действуют внутри одной projection                                                     |

Durable Opportunity lifecycle/queue потребует отдельного persistence design и
Schema Gate. Скрытая Prisma-модель в этой фазе не добавлялась.

## 9. Shadow Production Results

Read-only production verification выполнена относительно approved release
`20260820-c04-closure-final`.

| Параметр          | Результат                                     |
| ----------------- | --------------------------------------------- |
| Global cutover    | `2026-08-20T11:01:35.575Z`                    |
| Projection `asOf` | `2026-08-20T23:32:52.000Z`                    |
| Read limit        | 5000, limit не достигнут                      |
| WATCH rows read   | 4                                             |
| Accepted signals  | 1                                             |
| Rejected signals  | 3: `expired_capacity`                         |
| Opportunities     | 1 × `appointment_cancellation_recovery`       |
| Agent tasks       | 1 × Occupancy                                 |
| Action intents    | 1 × `prepare_recovery_options`, proposed only |
| Executed actions  | **0**                                         |
| Side effects      | **0**                                         |

Проверка читала только `appointment.removed`, использовала effective cutover как
максимум approved release cutover и tenant `watchStartedAt`, проверяла canonical
appointment mirror и принимала только будущий положительный blocked interval.

Business State changes не проверялись на production: их текущий change stream
transient и не replayed. Это ограничение зафиксировано, а не замаскировано
нулём.

Production deployment, service restart, migration и запись данных не
выполнялись.

## 10. Security Boundary

| Контроль             | Реализация                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tenant isolation     | tenant обязателен во всех signals/contracts; shadow join включает tenant                                      |
| Read-only production | PostgreSQL transaction начинает `SET TRANSACTION READ ONLY`                                                   |
| PII                  | contracts используют opaque refs; raw name/phone/email/token запрещены                                        |
| Untrusted input      | request text не переносится в evidence/task/intent и не влияет на routing                                     |
| Output minimization  | CLI выводит только агрегаты; raw tenant/event/appointment/client/staff/contact/payload/credential отсутствуют |
| Valuation guard      | forbidden fields для lost/recovered/expected revenue, CLV и churn probability отклоняются                     |
| Action guard         | intent только `dryRun/proposed`; execution API и side-effect dependency отсутствуют                           |
| Boundary tests       | запрещают Prisma mutation, campaign/message publish, booking mutation и action imports                        |

Read-only shadow edge намеренно не использует открытый tenant-unsafe
`EventStoreService.claimBatch()` path. Этот security debt остаётся в
carry-forward и не считается исправленным косвенно.

## 11. Carry-forward Updates

`CARRY-FORWARD-REGISTER.md` обновлён по следующим направлениям:

| Направление    | Перенесено                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------ |
| Chapter 5      | source adapters, capacity owner, client identity/policy, ephemeral lifecycle               |
| Chapter 6      | permissions/consent/entitlement, approval, idempotency, retry/reconcile и все side effects |
| Chapter 7      | outcome measurement, attribution и recovered revenue                                       |
| Chapter 8      | predictions, anomaly policy и valuation                                                    |
| Chapter 9      | Maya Orchestrator runtime, agent runtime/registry и response synthesis                     |
| Chapter 10     | scoped autonomy, kill switch, limits и autopilot boundary                                  |
| Security debt  | tenant-safe event consumption, PII minimization и action boundary                          |
| Technical debt | replayable Business State changes, durable Opportunity lifecycle и production consumer     |

## 12. Validation

| Проверка               | Результат                                       |
| ---------------------- | ----------------------------------------------- |
| Focused Jest           | 3 suites, 45 tests passed                       |
| TypeScript application | passed                                          |
| TypeScript scripts     | passed                                          |
| Full ESLint            | passed                                          |
| Full Jest              | 164 suites, 1636 tests passed                   |
| Production build       | `nest build` + release preflight passed         |
| Production shadow      | passed, 1 valid opportunity, 0 executed actions |

## 13. Final Status

```text
PHASE B COMPLETE: YES
CANONICAL OPPORTUNITY OWNER: maya-saas-backend/src/opportunities
AGENT TASK ROUTING IMPLEMENTED: YES
ACTION INTENTS EXECUTED: 0
SIDE EFFECTS INTRODUCED: NO
SCHEMA GATE REQUIRED: NO
READY FOR CYCLE 05 NEXT PHASE: YES
```

Chapter 6 не начат. Агентов, Action Engine, Autopilot и production action
consumer нет.
