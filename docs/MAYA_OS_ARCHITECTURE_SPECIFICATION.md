# MAYA OS ARCHITECTURE SPECIFICATION

<!-- markdownlint-configure-file {"MD013": {"line_length": 100, "tables": false}} -->

> Живая инженерная спецификация универсальной AI Operating System для
> сервисного бизнеса.

| Поле | Значение |
| --- | --- |
| Статус | Draft for architecture review |
| Версия | 0.1.0 |
| Последнее обновление | 2026-08-05 |
| Область | Maya OS, Maya Brain, data platform, integrations, actions |
| Первая вертикаль | Beauty / «Мужская Эстетика» |
| Целевые вертикали | Любой сервисный бизнес |
| Основной язык | Русский; имена контрактов и сущностей — English |

## Содержание

1. [Статус и правила документа](#0-статус-и-правила-документа)
2. [Vision](#1-vision)
3. [Philosophy of Data](#2-philosophy-of-data)
4. [System Architecture](#3-system-architecture)
5. [Canonical Business Model and MBL](#4-canonical-business-model-and-maya-business-language)
6. [Adapter and Capability Framework](#5-adapter-and-capability-framework)
7. [Business Knowledge Graph](#6-business-knowledge-graph)
8. [Universal Metrics Engine](#7-universal-metrics-engine)
9. [Query Understanding Engine](#8-query-understanding-engine)
10. [Planning and Reasoning Engines](#9-planning-and-reasoning-engines)
11. [Tool API and Execution Framework](#10-tool-api-and-execution-framework)
12. [Action System and Agent Framework](#11-action-system-and-agent-framework)
13. [Context, Memory and Knowledge](#12-context-memory-and-knowledge)
14. [Data Platform and Persistence](#13-data-platform-and-persistence)
15. [Security, Privacy and Multi-Tenancy](#14-security-privacy-and-multi-tenancy)
16. [API and Event Contracts](#15-api-and-event-contracts)
17. [Reliability, Observability and Cost](#16-reliability-observability-and-cost)
18. [Testing and Evaluation Strategy](#17-testing-and-evaluation-strategy)
19. [Deployment and Evolution](#18-deployment-and-evolution)
20. [Implementation Roadmap](#19-implementation-roadmap)
21. [Codex Implementation Contract](#20-codex-implementation-contract)
22. [End-to-End Reference Scenario](#21-end-to-end-reference-scenario)
23. [Initial Contract Registry](#22-initial-contract-registry)
24. [Open Decisions and ADR Backlog](#23-open-decisions-and-adr-backlog)
25. [Glossary](#24-glossary)
26. [Change Log](#25-change-log)

---

## 0. Статус и правила документа

### 0.1 Назначение

Этот документ определяет целевую архитектуру Maya OS. Это не описание
сегодняшнего кода и не список пожеланий. Спецификация задаёт:

- системные границы Maya OS;
- архитектурные законы и запрещённые зависимости;
- канонический язык бизнеса;
- контракты данных, метрик, запросов, tools и действий;
- границы ответственности LLM и deterministic backend;
- требования к безопасности, multi-tenancy и аудиту;
- порядок реализации и критерии готовности.

Maya Brain является крупной подсистемой Maya OS, но не всей системой. Каналы,
идентификация, данные, CRM-адаптеры, платежи, действия, уведомления и
наблюдаемость остаются самостоятельными частями платформы.

### 0.2 Нормативность

Термины **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** и **MAY** трактуются
как обязательное требование, запрет, рекомендация, нежелательное решение и
допустимый вариант соответственно.

При конфликте источников действует следующий порядок:

1. принятые ADR;
2. эта спецификация;
3. тематические документы в docs/architecture, docs/domain и docs/AI;
4. runbooks;
5. текущая реализация.

Код, противоречащий уровням 1–3, считается legacy или архитектурным долгом, а
не новой нормой.

### 0.3 Как документ живёт

Каждое архитектурное изменение MUST:

1. указать затронутые главы и контракты;
2. обновить версию документа;
3. добавить ADR, если решение меняет архитектурный закон, ownership данных,
   trust boundary или публичный контракт;
4. описать миграцию и обратную совместимость;
5. добавить проверяемые acceptance criteria.

Статусы решений:

- **Accepted** — правило обязательно для новой реализации;
- **Proposed** — направление согласовано концептуально, детали требуют ADR;
- **TBD** — решение не принято и не должно молча фиксироваться в коде;
- **Legacy** — существует сегодня, но не является целевой архитектурой.

### 0.4 Связанные спецификации

- [Target Architecture](architecture/target-architecture.md)
- [Module Boundaries](architecture/module-boundaries.md)
- [Domain Model](domain/domain-model.md)
- [Analytics Definitions](domain/analytics-definitions.md)
- [Maya AI Core](architecture/ai-core.md)
- [CRM Integration Architecture](architecture/crm-integration.md)
- [Security Model](security/security-model.md)
- [Roadmap](Roadmap/README.md)
- [ADR index](ADR/README.md)

Тематические документы могут раскрывать детали, но MUST NOT переопределять
законы этой спецификации без изменения самой спецификации и соответствующего
ADR.

---

## 1. Vision

### 1.1 Определение

**Maya OS — это AI-first операционная система для сервисного бизнеса, которая
преобразует разрозненные бизнес-данные в проверяемые знания, решения и
безопасные действия независимо от конкретной CRM, отрасли, канала и поставщика
языковой модели.**

Maya должна знать не интерфейс CRM, а бизнес. CRM, платежная система,
мессенджер, таблица или устройство являются источниками и исполнителями, но не
местом, где живёт интеллект Maya.

### 1.2 Обещание продукта

Большинство систем отвечают на вопрос «что произошло». Maya должна замкнуть
полный операционный цикл:

1. Что произошло?
2. Почему это произошло?
3. Насколько можно доверять выводу?
4. Что лучше сделать дальше?
5. Что Maya может безопасно выполнить после подтверждения?
6. Как проверить фактический результат действия?

Целевой пользовательский опыт: владелец не управляет бизнесом в одиночку. Он
получает операционного партнёра, который понимает контекст компании, объясняет
цифры и доводит подтверждённые решения до результата.

### 1.3 Цели

Maya OS MUST:

- подключать новые источники без изменения core domain;
- поддерживать новые отрасли конфигурацией, taxonomy и adapters;
- рассчитывать деньги и KPI детерминированно и воспроизводимо;
- объяснять происхождение каждого существенного факта;
- отличать отсутствие данных от нулевого значения;
- запрашивать уточнение при существенной неоднозначности;
- изолировать tenants во всех слоях;
- ограничивать AI ролью, permissions, capabilities и risk policy;
- заменять LLM provider без изменения бизнес-контрактов;
- выполнять действия только через typed tools и application services;
- измерять результат рекомендаций и действий.

### 1.4 Не-цели

Maya OS на текущем этапе MUST NOT:

- создавать собственную универсальную foundation model;
- превращать LLM в базу данных, калькулятор или policy engine;
- поддерживать произвольный SQL, shell или generic HTTP для модели;
- копировать схему YClients, DIKIDI или другого провайдера в core domain;
- обещать причинность там, где доступна только корреляция;
- выполнять необратимые или финансовые действия без policy и approval;
- переходить к микросервисам до доказанной необходимости разделения.

### 1.5 Архитектурные законы

1. **Данные не равны знаниям.** Источник поставляет факты; семантика и
   определения принадлежат Maya.
2. **LLM не является источником фактов.** Факты приходят только из
   авторизованных tools и версионированных knowledge sources.
3. **LLM не считает бизнес-метрики.** Расчёты выполняет Universal Metrics
   Engine.
4. **Planner не исполняет действия.** Он создаёт план; Tool и Action Engines
   авторизуют и исполняют шаги.
5. **Tenant определяется доверенным backend-контекстом.** Значение tenant из
   сообщения модели или request body не предоставляет доступ.
6. **CRM-specific логика заканчивается в adapter layer.**
7. **Все деньги хранятся в minor units с currency.**
8. **Все существенные результаты имеют provenance, freshness и quality.**
9. **Опасные действия имеют idempotency, audit и human approval.**
10. **Новая вертикаль не требует новых core-таблиц без portability review.**
11. **Модель заменяема; бизнес-контракты стабильны.**
12. **Любое «не могу» должно объяснять недостающую capability, permission или
    data requirement и, если возможно, путь исправления.**

### 1.6 Пользователи и режимы

| Actor | Основной режим | Граница данных |
| --- | --- | --- |
| Platform operator | Platform administration | platform metadata; tenant data only through audited support flow |
| Owner | Maya OS / Finance / Analytics | весь разрешённый tenant scope |
| Manager / Administrator | Maya Admin | операционные данные по permissions |
| Employee / Provider | Staff assistant | собственные и назначенные рабочие данные |
| Customer | Maya Consult | собственные записи, покупки и публичный каталог |
| Integration | Machine actor | только declared capabilities и bound tenant |

Один User MAY иметь несколько Membership и ролей. User, Customer и Employee
MUST оставаться разными сущностями с явными связями.

---

## 2. Philosophy of Data

### 2.1 От данных к действию

Основная цепочка Maya:

~~~text
External data
  → Canonical facts
  → Business semantics
  → Deterministic metrics
  → Evidence-backed insight
  → Proposed action
  → Approved execution
  → Measured outcome
~~~

Каждый переход является отдельным контрактом. Пропуск уровня создаёт скрытую
бизнес-логику и делает вывод невоспроизводимым.

### 2.2 Классы данных

| Класс | Пример | Требование |
| --- | --- | --- |
| Source record | запись CRM | хранится с provider identity и ingestion metadata |
| Canonical entity | Appointment | соответствует Maya Business Language |
| Domain event | AppointmentCompleted | immutable факт о переходе состояния |
| Metric observation | revenue за день | содержит definition version и lineage |
| Knowledge assertion | Revenue AFFECTS Profit | имеет source, confidence и validity |
| Memory item | правило компании | имеет scope, retention и author |
| Recommendation | заполнить свободные слоты | содержит evidence и expected impact |
| Action outcome | кампания дала 14 записей | связывается с recommendation/action |

### 2.3 Data ownership и source of truth

Source of truth MUST задаваться отдельно по tenant и data type. Допустимые
режимы: maya, external_system и hybrid. Режим hybrid требует явной conflict
policy; timestamp-only last-write-wins запрещён для записей и денег.

Каждая canonical запись MUST иметь:

~~~yaml
id: uuid
tenantId: uuid
source:
  system: yclients
  externalId: "provider-scoped-id"
  observedAt: "2026-08-05T08:30:00Z"
  syncedAt: "2026-08-05T08:31:12Z"
provenance:
  adapterVersion: "1.4.0"
  mappingVersion: "3"
dataQuality:
  status: verified
  warnings: []
createdAt: "..."
updatedAt: "..."
~~~

Source payload MUST NOT становиться публичной domain model. Его хранение
допустимо в ограниченной raw zone для reconciliation, если это соответствует
privacy policy и retention.

### 2.4 Факт, оценка и гипотеза

Maya MUST различать:

- **fact** — наблюдаемое или детерминированно рассчитанное значение;
- **estimate** — результат статистической модели с интервалом неопределённости;
- **hypothesis** — возможное объяснение, требующее проверки;
- **recommendation** — действие, основанное на фактах, целях и policy.

Ответ не должен превращать estimate или hypothesis в факт. UI и API MUST
передавать тип утверждения явно.

### 2.5 Время

Все timestamps хранятся как timezone-aware UTC. Бизнес-расчёты используют:

- tenant timezone;
- location timezone при локальном расписании;
- business date для смен и операций, пересекающих полночь;
- периоды вида [start, end), где end не включён;
- зафиксированную calendar policy.

Частичный текущий период по умолчанию сравнивается с равной по длительности
частью прошлого периода. Полный прошлый месяц не сравнивается с неполным
текущим без явного запроса.

### 2.6 Деньги

Денежное значение MUST включать amountMinor, currency и accounting policy.
Суммирование разных валют без явной FX policy запрещено. Revenue, cash inflow,
gross profit и net profit являются разными метриками.

### 2.7 Data quality

Каждый аналитический результат MUST включать:

~~~yaml
quality:
  freshnessAt: "2026-08-05T08:31:12Z"
  completeness: 0.97
  excludedRecords: 14
  warnings:
    - "expenses are available only from 2026-01-01"
  sourceSystems:
    - yclients
    - maya
  definitionVersion: 3
~~~

Отсутствующее значение — unknown, а не 0. Просроченные данные могут быть
показаны только с предупреждением. Critical calculation MUST fail closed, если
quality ниже порога метрики.

### 2.8 Privacy by design

Данные разделяются на:

- operational PII vault;
- canonical business facts;
- analytics/read models;
- AI-safe context;
- audit metadata.

Raw phone, email, full name, payment credentials, photo и voice recording MUST
NOT попадать в prompt или vector index без отдельного legal basis, consent,
minimization и retention policy. Cross-tenant identity по сырому PII запрещена.

---

## 3. System Architecture

### 3.1 Архитектурный стиль

**Accepted:** modular monolith first для platform core на NestJS/PostgreSQL.
Модули общаются через public application services и domain events. Выделение
сервиса допускается, когда доказаны независимое масштабирование, отказоустойчивый
контур или ownership команды.

Production Python contour рассматривается как первая вертикаль и legacy
compatibility runtime. Он мигрирует по pattern strangler, а не становится
параллельным platform core.

### 3.2 Плоскости системы

~~~mermaid
flowchart TB
  subgraph Experience["Experience plane"]
    Channels["Web · iOS · Telegram · Voice · Partner API"]
  end

  subgraph Control["Control plane"]
    Gateway["API Gateway"]
    Identity["Identity · Tenant · Permissions · Entitlements"]
    Policy["Policy · Consent · Approval"]
  end

  subgraph Intelligence["Intelligence plane"]
    QUE["Query Understanding Engine"]
    Planner["Planner"]
    Reasoning["Reasoning Engine"]
    Context["Context · Memory · Knowledge"]
  end

  subgraph Execution["Execution plane"]
    Tools["Tool Registry · Tool Engine"]
    Actions["Action Engine"]
    Engines["Metrics · Notifications · Billing"]
  end

  subgraph Data["Data plane"]
    Domain["Canonical Domain"]
    Events["Event Log · Outbox"]
    ReadModels["Metrics · Segments · Forecasts"]
    Audit["Audit · Lineage · AI Evals"]
  end

  subgraph Integration["Integration plane"]
    Adapters["CRM · Payments · Messaging · AI providers"]
    External["External systems"]
  end

  Channels --> Gateway
  Gateway --> Identity
  Identity --> QUE
  QUE --> Planner
  Planner --> Reasoning
  Reasoning --> Tools
  Context --> QUE
  Context --> Reasoning
  Tools --> Policy
  Policy --> Actions
  Tools --> Engines
  Actions --> Domain
  Engines --> ReadModels
  Domain --> Events
  Events --> ReadModels
  Domain --> Adapters
  Adapters --> External
  Audit --- Tools
  Audit --- ReadModels
~~~

### 3.3 Компоненты и ownership

| Компонент | Owns | Не должен делать |
| --- | --- | --- |
| API Gateway | transport, request ID, rate limit | бизнес-расчёты |
| Identity/Tenancy | User, Membership, TenantContext | принимать tenant от LLM |
| Canonical Domain | aggregates, invariants, commands | хранить provider semantics |
| Adapter Layer | credentials, mapping, sync cursor | считать KPI |
| QUE | AnalyticalQuery | исполнять tools |
| Planner | bounded ExecutionPlan | принимать policy decisions |
| Metrics Engine | metric registry, calculation DAG | генерировать объяснение LLM |
| Knowledge Graph | semantic and dependency graph | заменять operational DB |
| Tool Engine | typed invocation, auth, result | обходить application services |
| Action Engine | approval and execution lifecycle | разрешать действие модели |
| Memory Engine | scoped, retained memory | хранить raw PII без policy |
| AI Orchestrator | provider abstraction, loop | становиться source of truth |
| Observability | traces, SLO, usage, evals | писать secrets или raw prompts в audit |

### 3.4 Request lifecycle

1. Edge создаёт requestId и применяет transport controls.
2. Identity layer аутентифицирует user или machine actor.
3. Tenant Resolver получает tenant из Membership, verified domain или signed
   channel binding.
4. Permission и entitlement policy формируют разрешённые capabilities.
5. Context Builder создаёт минимальный AI-safe context.
6. QUE переводит сообщение в структурированный QuerySpec.
7. Planner строит ограниченный план.
8. Tool Engine авторизует каждый шаг и вызывает application service.
9. Metrics Engine возвращает факты, lineage и quality.
10. Reasoning Engine строит evidence-backed explanation.
11. Action Engine создаёт draft/approval для любых write operations.
12. Ответ и structured cards возвращаются в channel adapter.

### 3.5 Dependency rule

Зависимости направлены внутрь:

~~~text
Channel / Provider
  → Adapter
  → Application contract
  → Domain
~~~

Domain MUST NOT импортировать provider SDK, HTTP transport, ORM delegate или LLM
types. AI module MUST NOT читать private tables другого модуля.

---

## 4. Canonical Business Model and Maya Business Language

### 4.1 Maya Business Language

Maya Business Language (MBL) — стабильный внутренний словарь сущностей,
событий, метрик, dimensions, действий и policies. Все adapters, engines и agents
говорят на MBL.

Примеры нормализации:

| Provider/vertical term | MBL |
| --- | --- |
| YClients record, booking | Appointment |
| master, doctor, trainer | Employee / ProviderProfile |
| salon, clinic, studio | Organization |
| branch, venue | Location |
| chair, room, car lift | Resource |
| membership, certificate, package | Package + Entitlement |

Отображаемая терминология MAY меняться через industry preset. Имя core entity
не меняется.

### 4.2 Общий entity envelope

Каждая tenant-owned entity MUST иметь:

~~~typescript
type EntityEnvelope = {
  id: UUID;
  tenantId: UUID;
  version: number;
  sourceSystem: string;
  sourceId?: string;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt?: Instant;
};
~~~

Optimistic version, tenant scope и external identity проверяются backend.
Metadata допускается только как bounded, versioned extension; оно не заменяет
обязательные поля и invariants.

### 4.3 Identity and tenancy

| Entity | Назначение | Ключевые invariants |
| --- | --- | --- |
| Tenant | security, billing и configuration boundary | unique slug; explicit status and plan |
| User | глобальная platform identity | не хранит единственную tenant role |
| Membership | связь User ↔ Tenant | unique user+tenant; active access required |
| Organization | бизнес внутри tenant | tenant-scoped; at least one Location when operational |
| Location | место оказания услуги | timezone and business calendar required |
| Department | организационная группа | не заменяет permission scope |

### 4.4 Workforce and capacity

| Entity | Назначение | Required |
| --- | --- | --- |
| EmployeeProfile | трудовой/операционный профиль | status, location eligibility |
| ProviderProfile | может оказывать услуги | services, bookable policy |
| Resource | помещение, оборудование, человек или virtual capacity | type, availability policy |
| WorkSchedule | плановая доступность | timezone, effective interval |
| TimeOff | исключение доступности | interval, reason category |

EmployeeProfile MAY быть связан с User, но связь не обязательна. Resource MAY
ссылаться на ProviderProfile, но staff и equipment остаются разными типами.

### 4.5 Customer and relationship

~~~yaml
Customer:
  required:
    - id
    - tenantId
    - status
    - createdAt
  protected:
    - displayName
    - phoneEncrypted
    - emailEncrypted
  identities:
    - phoneHash
    - emailHash
    - providerExternalId
    - telegramBinding
    - linkedUserId
  computedOutsideEntity:
    - lifetimeRevenue
    - averageTicket
    - retentionState
    - lastVisitAt
    - nextAppointmentAt
    - churnRisk
~~~

Вычисляемые показатели не являются mutable полями Customer. Они принадлежат
Metrics Engine/read models и включают definitionVersion и calculatedAt.

Customer merge MUST быть транзакционным, tenant-scoped и auditable. Raw PII
запрещено использовать как глобальный cross-tenant key.

### 4.6 Catalog and service delivery

| Entity | Смысл |
| --- | --- |
| ServiceCategory | универсальная taxonomy |
| Service | продаваемая/записываемая единица работы |
| Product | материальный или цифровой товар |
| PriceRule | цена по location, time, segment или channel |
| Appointment | намерение и резерв времени |
| Visit | факт присутствия/оказания |
| ServiceDelivery | фактически оказанная услуга |

Appointment и Visit MUST быть разными сущностями. Completed Appointment может
создать Visit/ServiceDelivery, но импортированные факты допускают Visit без
предварительного Appointment.

### 4.7 Appointment lifecycle

~~~mermaid
stateDiagram-v2
  [*] --> Requested
  Requested --> Previewed: availability validated
  Previewed --> Confirmed: create succeeds
  Confirmed --> Rescheduled: non-destructive move
  Rescheduled --> Rescheduled: another move
  Confirmed --> Completed: service delivered
  Rescheduled --> Completed: service delivered
  Confirmed --> Cancelled: policy passes
  Rescheduled --> Cancelled: policy passes
  Confirmed --> NoShow: attendance cutoff
  Rescheduled --> NoShow: attendance cutoff
  Completed --> [*]
  Cancelled --> [*]
  NoShow --> [*]
~~~

Reschedule MUST be non-destructive. Delete-and-recreate не допускается как
fallback, потому что ломает identity, payments, audit и analytics.

### 4.8 Commerce and finance

| Entity | Назначение |
| --- | --- |
| Order | коммерческое намерение и набор позиций |
| OrderItem | Service, Product, Package или fee |
| Payment | попытка/факт оплаты |
| Refund | возврат, связанный с Payment |
| Transaction | immutable money movement |
| Expense | операционный расход |
| Package | сертификат, абонемент, bundle, membership |
| Entitlement | доступный визит, credit или benefit |
| LedgerEntry | immutable debit/credit |

Balance MUST выводиться из ledger. Исправление финансового события создаёт
compensating entry, а не редактирует исходную запись.

### 4.9 Growth and operations

Core включает Campaign, AttributionTouch, Lead, Review, LoyaltyAccount,
InventoryItem, InventoryMovement, Supplier, Task, Notification и Conversation.
Их вертикальные поля оформляются extension contracts, а не новыми core
агрегатами без portability review.

### 4.10 Platform intelligence entities

| Entity | Назначение |
| --- | --- |
| DomainEvent | immutable business fact |
| MetricDefinition | versioned deterministic definition |
| MetricObservation | calculated value + lineage |
| KnowledgeAssertion | typed graph edge + evidence |
| MemoryItem | scoped retained memory |
| QueryRecord | sanitized QuerySpec and confidence |
| ExecutionPlan | immutable planned steps |
| ToolInvocation | typed tool audit |
| ApprovalRequest | human decision lifecycle |
| ActionRun | execution and outcome |
| Recommendation | evidence, expected impact and status |

### 4.11 Relationship invariants

- Все ссылки между tenant-owned entities MUST принадлежать одному tenant.
- Appointment MUST ссылаться на Location и хотя бы один Service/Resource
  requirement.
- Payment MUST ссылаться на Order или documented standalone reason.
- Completed Visit MUST иметь фактическое время и source.
- Recommendation MUST ссылаться на evidence snapshot.
- ActionRun MUST ссылаться на approved plan/version.
- DomainEvent payload MUST содержать только минимальные non-sensitive facts.

---

## 5. Adapter and Capability Framework

### 5.1 Назначение

Adapter Layer переводит внешние системы на MBL и обратно. Adapter отвечает за
transport, authentication, provider schema, pagination, retries, mapping и
capability discovery. Он MUST NOT содержать аналитику, product permissions или
tenant policy.

### 5.2 Adapter contract

~~~typescript
interface BusinessSystemAdapter {
  provider: string;
  contractVersion: number;

  discoverCapabilities(ctx: AdapterContext): Promise<CapabilityManifest>;
  verifyConnection(input: CandidateCredentials): Promise<VerificationResult>;
  pull(input: PullRequest): AsyncIterable<SourceBatch>;
  normalize(batch: SourceBatch): Promise<CanonicalChangeSet>;
  push(command: CanonicalCommand): Promise<ProviderCommandResult>;
  reconcile(input: ReconciliationRequest): Promise<ReconciliationReport>;
}
~~~

Credentials загружаются внутри infrastructure по trusted tenant context и
никогда не приходят из LLM arguments.

### 5.3 Capability manifest

~~~yaml
provider: yclients
contractVersion: 2
entities:
  appointments:
    read: true
    write: true
    historyFrom: "2024-01-01"
  payments:
    read: true
    refunds: false
  expenses:
    read: false
operations:
  reschedule:
    supported: true
    semantics: non_destructive
freshness:
  webhooks: partial
  pollingSeconds: 300
limits:
  requestsPerMinute: 120
~~~

Capability — это проверенный runtime contract, а не запись в enum. Planned
provider MUST быть non-connectable до прохождения contract tests.

### 5.4 Sync pipeline

1. Scheduler запускает job в bound TenantContext.
2. Adapter читает incremental cursor.
3. Raw records проходят schema validation.
4. Normalizer создаёт canonical change set.
5. Repository выполняет idempotent upsert по
   tenant+provider+entityType+externalId.
6. Domain layer проверяет invariants.
7. Outbox фиксирует изменения.
8. Reconciliation сравнивает counts, totals и missing references.
9. Cursor обновляется только после успешного commit.

### 5.5 Mapping requirements

Каждый mapping MUST иметь:

- adapterVersion и mappingVersion;
- source field lineage;
- normalization rules;
- enum translation;
- timezone/currency policy;
- invalid-record strategy;
- fixture и negative-path tests;
- reversibility для supported write operations.

Unknown source status не должен молча становиться Confirmed. Он попадает в
quarantine или explicit unknown mapping.

### 5.6 Conflict and reconciliation

Conflict policy задаётся по entity/field. Для bookings и money требуется
semantic merge или authoritative owner. Reconciliation report включает:

- source count и canonical count;
- unmatched external identities;
- value totals by currency;
- duplicate rate;
- mapping errors;
- latest successful sync;
- cursor lag.

---

## 6. Business Knowledge Graph

### 6.1 Назначение

Business Knowledge Graph (BKG) описывает, как сущности, события, метрики,
capabilities, знания и действия связаны между собой. Он позволяет строить
анализ по зависимостям, а не искать заранее написанную функцию под каждый
вопрос.

BKG не заменяет operational database и не даёт LLM прямой доступ к graph
storage. Traversal выполняется deterministic Graph Service.

### 6.2 Типы узлов

| Node type | Пример |
| --- | --- |
| EntityType | Customer, Appointment, Payment |
| EventType | AppointmentCancelled |
| Metric | Revenue, NetProfit, Utilization |
| Dimension | Location, Employee, Service |
| Capability | expenses.read |
| BusinessRule | cancellation policy |
| KnowledgeSource | tenant policy document |
| ActionType | LaunchRetentionCampaign |
| Goal | IncreaseProfit |

### 6.3 Типы связей

| Edge | Семантика |
| --- | --- |
| HAS / BELONGS_TO | структурная связь |
| PRODUCES | entity/event создаёт другой факт |
| REQUIRES | metric/tool требует data/capability |
| COMPUTED_FROM | формальная зависимость метрики |
| AFFECTS | возможное влияние, не обязательно причинность |
| CAUSES | подтверждённая причинная модель с method |
| CORRELATES_WITH | наблюдаемая корреляция |
| DIMENSION_OF | допустимая группировка |
| ENABLES | capability разрешает calculation/action |
| PROPOSES / EXECUTES | связь insight с action |
| EVIDENCED_BY | assertion подтверждается source |

AFFECTS, CAUSES и CORRELATES_WITH MUST быть различимы. Edge CAUSES требует
method, assumptions, confidence и validity interval.

### 6.4 Graph assertion contract

~~~yaml
id: "edge:revenue:affects:profit:v1"
tenantScope: global
from: "metric:revenue"
type: AFFECTS
to: "metric:net_profit"
polarity: positive
evidence:
  - "metric-definition:net_profit:v3"
confidence: 1.0
validFrom: "2026-01-01"
validTo: null
version: 1
status: accepted
~~~

Tenant-specific assertion может расширять, но не менять global definition без
versioned policy. Каждое утверждение имеет provenance.

### 6.5 Metric dependency graph

~~~mermaid
flowchart TD
  Profit["Net profit"]
  Gross["Gross profit"]
  Expense["Operating expense"]
  Revenue["Recognized revenue"]
  DirectCost["Direct cost"]
  Visits["Completed visits"]
  Ticket["Average ticket"]
  Appointments["Confirmed appointments"]
  Cancel["Cancellations"]
  NoShow["No-shows"]

  Profit -->|COMPUTED_FROM| Gross
  Profit -->|COMPUTED_FROM| Expense
  Gross -->|COMPUTED_FROM| Revenue
  Gross -->|COMPUTED_FROM| DirectCost
  Revenue -->|DECOMPOSED_BY| Visits
  Revenue -->|DECOMPOSED_BY| Ticket
  Visits -->|AFFECTED_BY| Appointments
  Visits -->|AFFECTED_BY| Cancel
  Visits -->|AFFECTED_BY| NoShow
~~~

COMPUTED_FROM определяет формулу. DECOMPOSED_BY помогает объяснению, но не
обязан быть тождественной формулой. Planner MUST учитывать эту разницу.

### 6.6 Traversal rules

Graph Service MUST:

- ограничивать depth, node count и tenant scope;
- возвращать только типизированные paths;
- фильтровать paths по available capabilities;
- отмечать cycle и не выполнять бесконечный traversal;
- возвращать edge version и evidence;
- не превращать unknown edge в причинное утверждение.

### 6.7 Storage

На старте BKG SHOULD храниться в PostgreSQL как versioned registries и adjacency
tables. Отдельная graph database — Proposed и требует ADR с доказанной
нагрузкой. Семантический поиск knowledge documents может использовать vector
index, но metric dependency graph остаётся typed и deterministic.

---

## 7. Universal Metrics Engine

### 7.1 Назначение

Universal Metrics Engine (UME) — единственное место, где определяются и
вычисляются бизнес-метрики Maya. Формулы запрещено дублировать в prompts,
controllers, frontend и CRM adapters.

### 7.2 Metric definition

~~~yaml
key: revenue
version: 3
status: active
name: Recognized revenue
valueType: money
grain: transaction
requiredFacts:
  - Transaction
formula:
  type: sum
  field: amountMinor
  filters:
    - field: status
      operator: eq
      value: recognized
    - field: kind
      operator: in
      value: [sale, refund]
dimensions:
  - day
  - location
  - employee
  - service
comparisons:
  - previous_period
  - same_period_last_year
qualityPolicy:
  minimumCompleteness: 0.95
  maximumStalenessSeconds: 900
owner: finance-domain
~~~

Definition MUST включать key, version, semantic description, unit/value type,
required facts, formula, allowed dimensions, time/currency policy, quality
threshold и owner.

### 7.3 Value types

- count;
- ratio;
- percentage;
- duration;
- money;
- score;
- distribution;
- forecast with interval;
- boolean/categorical indicator.

Unit проверяется при composition. Money нельзя сложить с count; ratio нельзя
агрегировать простым средним без weighting policy.

### 7.4 Calculation pipeline

1. Resolve metric key and version.
2. Resolve tenant accounting/calendar policy.
3. Validate capabilities and data requirements.
4. Normalize period to [start, end).
5. Build typed calculation DAG.
6. Push allowed filters to read model/query layer.
7. Calculate deterministic values.
8. Apply comparison and decomposition.
9. Attach lineage, quality and warnings.
10. Persist/cache observation by definition+inputs hash.

### 7.5 Metric result contract

~~~json
{
  "metric": "revenue",
  "definitionVersion": 3,
  "value": {
    "amountMinor": 48523000,
    "currency": "RUB"
  },
  "period": {
    "start": "2026-07-01T00:00:00+03:00",
    "end": "2026-08-01T00:00:00+03:00"
  },
  "comparison": {
    "mode": "same_period_last_year",
    "absoluteDeltaMinor": -5420000,
    "percentageChange": -0.1005
  },
  "quality": {
    "completeness": 0.98,
    "freshnessAt": "2026-08-05T08:31:12Z",
    "warnings": []
  },
  "lineageId": "lin_...",
  "calculatedAt": "2026-08-05T08:32:01Z"
}
~~~

### 7.6 Comparison rules

Percentage change:

~~~text
(current - previous) / abs(previous)
~~~

Если previous = 0, percentageChange = null и возвращается absolute delta.
Calendar comparison учитывает leap year, business timezone и partial-period
policy.

### 7.7 Core metric catalog

Первая версия registry SHOULD включать:

- revenue, cash inflow, refunds, gross profit, net profit;
- appointments, confirmed appointments, completed visits;
- cancellation rate, no-show rate, booking conversion;
- unique, new, returning, retained и lost customers;
- repeat rate, retention, customer lifetime value;
- average ticket, revenue per visit, revenue per customer;
- provider utilization, available capacity, revenue per employee;
- service mix, product mix, package utilization;
- marketing spend, attributed revenue, CAC и campaign ROI;
- inventory consumption и stockout risk;
- data freshness, sync lag и reconciliation gap;
- AI/tool cost и action ROI.

Gross profit MUST требовать direct cost. Net profit MUST требовать operating
expenses. При отсутствии требования UME возвращает unavailable с missing
requirements, а не оценку без явного запроса.

### 7.8 Root cause decomposition

UME предоставляет decomposition primitives, но не объявляет причинность
автоматически:

~~~text
Revenue change
  = volume contribution
  + price/mix contribution
  + residual
~~~

Декомпозиция по location/employee/service использует consistent population и
не допускает double counting. Вывод «причина» разрешён только если method и
evidence соответствуют причинному уровню; иначе используется «вклад» или
«связано с».

### 7.9 Versioning and reproducibility

Изменение формулы создаёт новую version. Исторический report MUST уметь:

- воспроизвести старую definition;
- показать, какой version использовался;
- выполнить controlled recomputation;
- объяснить difference между versions.

Cache key включает tenant, metric version, period, filters, dimensions,
accounting/calendar policy version и data watermark.

---

## 8. Query Understanding Engine

### 8.1 Назначение

Query Understanding Engine (QUE) преобразует естественный язык и безопасный
контекст в формальный AnalyticalQuery. Planner не интерпретирует исходный текст
заново; он работает с результатом QUE.

QUE не отвечает на вопрос, не выполняет расчёты и не вызывает write tools.

### 8.2 Pipeline

~~~text
Message
  → language and safety normalization
  → intent classification
  → entity/metric resolution
  → time normalization
  → filter and dimension resolution
  → comparison resolution
  → semantic expansion
  → capability and missing-data precheck
  → confidence evaluation
  → QuerySpec or ClarificationRequest
~~~

### 8.3 Intent taxonomy

Initial intents:

- summarize;
- lookup;
- compare;
- explain;
- root_cause_analysis;
- forecast;
- optimize;
- recommend;
- monitor;
- execute;
- configure.

Execute/configure intents создают только intent и proposed operation. Они не
предоставляют permission и не обходят approval.

### 8.4 AnalyticalQuery contract

~~~yaml
schemaVersion: 1
intent: root_cause_analysis
goal: explain
metrics:
  primary:
    - net_profit
  supporting:
    - revenue
    - completed_visits
    - average_ticket
time:
  period:
    mode: current_month_to_date
  comparison:
    mode: same_elapsed_period_last_year
dimensions:
  - location
  - employee
filters: []
scope:
  organizationId: null
  locationIds: []
output:
  format: narrative_with_table
  language: ru
confidence:
  overall: 0.91
  intent: 0.99
  metrics: 0.88
  time: 0.96
ambiguities:
  - field: accountingPolicy
    severity: low
missingRequirements:
  - expenses.read
provenance:
  messageId: "msg_..."
  priorQueryId: null
~~~

Scope из текста является requested scope. Effective scope формируется backend
policy и может быть только уже requested.

### 8.5 Entity and metric resolution

QUE использует:

- MBL aliases;
- tenant vocabulary;
- industry preset;
- Metric Registry;
- BKG relationships;
- recent conversation QuerySpec;
- role/capability context.

Фраза «как дела у бизнеса» MAY расширяться в health bundle, но bundle MUST быть
versioned и видимым:

~~~yaml
bundle: business_health
version: 2
metrics:
  - revenue
  - completed_visits
  - average_ticket
  - cancellation_rate
  - new_customers
  - provider_utilization
~~~

### 8.6 Time understanding

QUE преобразует «в прошлом году», «за последние три месяца», «после Нового
года» и «за аналогичный период» в TimeExpression. Относительное время MUST
содержать resolvedAt, timezone и calendar policy.

Если «прибыль упала» не содержит периода, QUE MAY применить documented default
для owner briefing. Для high-impact ответа период должен быть видим пользователю.

### 8.7 Confidence and clarification

Каждое значимое поле имеет confidence. Clarification обязателен, если:

- возможные interpretations существенно меняют метрику или действие;
- time range отсутствует и нет approved default;
- requested write operation имеет неоднозначную цель;
- confidence ниже threshold;
- capability отсутствует, но есть несколько альтернатив анализа.

Clarification SHOULD быть коротким и предлагать 2–3 осмысленных варианта.
Система не спрашивает то, что можно безопасно определить из tenant policy.

### 8.8 Missing data detection

QUE выполняет precheck по Metric Registry и Capability Registry:

~~~text
net_profit
├── gross_profit
│   ├── revenue               available
│   └── direct_cost           unavailable
└── operating_expense         unavailable
~~~

Результат может быть:

- answerable;
- partially_answerable;
- requires_clarification;
- unavailable_with_remediation;
- forbidden.

Unavailable и forbidden — разные состояния. Пользователь может подключить
источник данных, но не может исправить permission простым текстом.

### 8.9 Conversation query memory

Фраза «а теперь по филиалам» наследует только разрешённые поля прошлого
QuerySpec: metric, period и filters. Наследование MUST быть явным в
provenance.priorQueryId. Старый scope или permission не переносится без
повторной policy evaluation.

### 8.10 Safety

Пользовательский и retrieved текст считается untrusted data. QUE MUST:

- отделять instructions системы от business content;
- не создавать tool name из свободного текста;
- использовать allowlisted schema values;
- ограничивать размер и complexity запроса;
- redacted PII до model boundary;
- сохранять sanitized QuerySpec, а не raw confidential prompt в audit.

---

## 9. Planning and Reasoning Engines

### 9.1 Разделение ответственности

Planner превращает QuerySpec в проверяемый план. Reasoning Engine объединяет
результаты плана в вывод. Ни один компонент не получает полномочия на
исполнение только потому, что LLM предложила шаг.

| Компонент | Input | Output |
| --- | --- | --- |
| QUE | message + safe context | QuerySpec |
| Planner | QuerySpec + registries | ExecutionPlan |
| Tool Engine | authorized plan step | ToolResult |
| Reasoning | QuerySpec + evidence bundle | Insight |
| Action Engine | approved ActionDraft | ActionRun |

### 9.2 ExecutionPlan

~~~yaml
id: "plan_..."
version: 1
queryId: "qry_..."
mode: analytical
steps:
  - id: s1
    type: metric_query
    metric: net_profit
    onUnavailable: continue_with_dependencies
  - id: s2
    type: graph_expand
    from: net_profit
    edgeTypes: [COMPUTED_FROM, DECOMPOSED_BY]
    maxDepth: 3
  - id: s3
    type: metric_batch
    dependsOn: [s2]
    maxMetrics: 12
  - id: s4
    type: contribution_analysis
    dependsOn: [s3]
limits:
  maxSteps: 8
  maxToolCalls: 12
  timeoutMs: 12000
  maxCostUnits: 20
policySnapshotId: "pol_..."
~~~

План immutable после начала исполнения. Replan создаёт новую version и
указывает reason.

### 9.3 Planner rules

Planner MUST:

- использовать только зарегистрированные step types;
- строить dependency DAG;
- проверять data/capability requirements до дорогого исполнения;
- batch одинаковые metric queries;
- иметь limits по depth, calls, latency и cost;
- завершаться при достаточном evidence;
- не включать generic code execution;
- не скрывать unavailable dependencies.

### 9.4 Reasoning output

Insight MUST содержать:

~~~yaml
claim: "Основной измеримый вклад в снижение выручки дал филиал B."
claimType: contribution
evidence:
  - metricObservationId: "obs_..."
    role: primary
  - metricObservationId: "obs_..."
    role: supporting
uncertainty:
  level: medium
  reasons:
    - "marketing spend is unavailable"
alternatives:
  - "seasonality may explain part of the change"
recommendedNextChecks:
  - "connect marketing cost data"
~~~

Reasoning Engine MAY формулировать текст через LLM, но claim type, evidence
references, numbers и uncertainty MUST валидироваться backend.

### 9.5 Forecasting and optimization

Forecast и optimization являются отдельными typed steps. Каждый model result
MUST включать modelVersion, trainingWindow, features, predictionInterval,
backtest metrics и generatedAt. Оптимизация MUST раскрывать objective,
constraints и infeasible state.

---

## 10. Tool API and Execution Framework

### 10.1 Tool definition

Tool — типизированный application contract, доступный AI orchestration. Tool не
является произвольной функцией и не предоставляет прямой доступ к таблице.

~~~yaml
name: analytics.query_metrics
version: 1
kind: read
inputSchema: MetricBatchRequest.v1
outputSchema: MetricBatchResult.v1
permissions:
  - analytics.read
roles:
  - owner
  - manager
riskTier: low
approval: never
tenantScope: required
idempotency: not_applicable
timeoutMs: 5000
auditPolicy: metadata_only
~~~

### 10.2 Invocation lifecycle

1. Resolve tool by exact registry name/version.
2. Validate JSON schema.
3. Inject MayaExecutionContext server-side.
4. Check membership, role, permission, entitlement и consent.
5. Apply risk and approval policy.
6. Execute application service with timeout/idempotency.
7. Sanitize and minimize result.
8. Record metadata audit and trace.
9. Return typed result or stable error.

### 10.3 MayaExecutionContext

~~~typescript
type MayaExecutionContext = {
  requestId: string;
  actorId: UUID;
  tenantId: UUID;
  membershipId: UUID;
  roles: string[];
  permissions: string[];
  channel: "web" | "native" | "telegram" | "voice" | "api";
  locale: string;
  timezone: string;
  policySnapshotId: string;
};
~~~

Model output MUST NOT задавать tenantId, roles, permissions или approval status.

### 10.4 Risk tiers

| Tier | Пример | Policy |
| --- | --- | --- |
| Low | read KPI | execute after auth |
| Medium | create draft/task | may require confirmation by tenant policy |
| High | reschedule, campaign send, price change | explicit approval |
| Critical | refund, payroll, bulk export, destructive admin | strong approval + step-up auth |

### 10.5 Stable errors

Tool errors используют machine-readable codes:

- tool_not_allowed;
- permission_denied;
- entitlement_required;
- approval_required;
- capability_unavailable;
- data_incomplete;
- validation_failed;
- conflict;
- rate_limited;
- provider_unavailable;
- execution_timeout.

LLM MAY объяснить error, но не переопределить его.

---

## 11. Action System and Agent Framework

### 11.1 Action lifecycle

~~~mermaid
stateDiagram-v2
  [*] --> Drafted
  Drafted --> AwaitingApproval: policy requires
  Drafted --> Approved: low-risk policy
  AwaitingApproval --> Approved: authorized human
  AwaitingApproval --> Rejected
  Approved --> Executing
  Executing --> Succeeded
  Executing --> Failed
  Succeeded --> Verified: outcome measured
  Failed --> Compensating: reversible workflow
  Compensating --> Compensated
  Rejected --> [*]
  Verified --> [*]
  Compensated --> [*]
~~~

Approval связывается с exact action payload hash, version и expiry. Изменение
payload аннулирует approval.

### 11.2 ActionDraft

ActionDraft MUST включать:

- цель и ожидаемый результат;
- exact typed command;
- затронутые entities и audience;
- evidence и recommendation ID;
- risk tier;
- preview/diff;
- cost or financial impact;
- reversibility/compensation plan;
- approval requirements;
- idempotency key;
- expiry.

### 11.3 Outcome measurement

Action без измерения результата не завершает learning loop. ActionRun связывается
с:

- baseline snapshot;
- execution events;
- observation window;
- target metrics;
- realized impact;
- confounders/uncertainty.

Maya MUST отличать «действие выполнено» от «цель достигнута».

### 11.4 Agent model

Agents — capability profiles над одним orchestration core, а не отдельные LLM
по умолчанию:

| Profile | Основные tools | Ограничение |
| --- | --- | --- |
| Maya OS | owner analytics/actions | owner permissions |
| Maya Admin | booking/schedule | no internal finance by default |
| Maya Consult | catalog/customer booking | own customer scope |
| Maya Finance | finance metrics | no raw payroll unless permission |
| Maya Analytics | metrics/diagnostics | read-first |
| Maya Marketing | segments/campaign drafts | consent and approval |
| Maya HR | workforce/tasks | restricted employee data |

Profile определяет prompt, allowed tools, memory scope и response style. Он не
расширяет permissions actor.

### 11.5 Autonomy levels

| Level | Поведение |
| --- | --- |
| A0 Observe | только объясняет |
| A1 Recommend | предлагает ActionDraft |
| A2 Prepare | создаёт preview и материалы |
| A3 Execute with approval | исполняет после explicit approval |
| A4 Bounded automation | действует по заранее утверждённому policy envelope |

A4 требует отдельного ADR, kill switch, budget, monitoring и periodic review.

---

## 12. Context, Memory and Knowledge

### 12.1 Context Builder

Context Builder формирует минимальный context package из:

- actor/tenant/channel context;
- current QuerySpec;
- allowed tool descriptors;
- recent bounded conversation state;
- relevant business memory;
- cited knowledge excerpts;
- data capability summary.

Context MUST быть role-filtered, token-bounded и provenance-aware.

### 12.2 Memory scopes

| Scope | Пример | Retention owner |
| --- | --- | --- |
| User preference | формат отчёта | user/tenant policy |
| Customer service | предпочтение без raw contact | tenant |
| Staff | рабочая настройка | tenant HR policy |
| Business | правило отмены | owner/admin |
| Conversation | предыдущий QuerySpec | short-lived |
| Outcome | результат action | analytics policy |

MemoryItem имеет source, author, confidence, visibility, createdAt, expiresAt и
deletion policy. Модель не может сама повышать confidence или retention.

### 12.3 Knowledge Engine vs Business Knowledge Graph

Knowledge Engine работает с документами: регламенты, каталоги, инструкции,
legal templates. BKG работает с typed relationships и dependencies.

RAG result MUST включать sourceId, revision, excerpt bounds и access scope.
Текст документа считается untrusted content и не может вводить новые system
instructions или tools.

### 12.4 Memory write policy

Automatic memory write допускается только для allowlisted low-risk categories.
Sensitive, legal, financial или people-related memory требует explicit source
и policy. Пользователь MUST иметь механизм просмотра, исправления и удаления
доступной ему памяти.

---

## 13. Data Platform and Persistence

### 13.1 Logical layers

~~~text
Raw/landing (restricted, optional)
  → Canonical operational store
  → Domain events + transactional outbox
  → Analytical read models
  → Metric observations / segments / forecasts
  → AI-safe evidence bundles
~~~

### 13.2 PostgreSQL as system of record

Platform core использует PostgreSQL. Tenant-scoped repositories обязательны.
Row Level Security SHOULD добавляться после того, как все вызовы выполняются в
явном transaction tenant context; RLS является defense in depth, а не заменой
application authorization.

### 13.3 Required read models

- metrics_daily;
- kpi_tenant_daily;
- kpi_location_daily;
- kpi_employee_daily;
- kpi_service_daily;
- customer_cadence;
- segment_snapshot;
- campaign_outcome;
- forecast_log;
- recommendation_outcome;
- tool_cost_daily;
- data_quality_snapshot.

Названия являются logical contracts; физическая реализация MAY меняться.

### 13.4 Events and outbox

Domain event:

~~~yaml
id: uuid
type: AppointmentCompleted
version: 1
tenantId: uuid
aggregate:
  type: Appointment
  id: uuid
occurredAt: "..."
recordedAt: "..."
actor:
  type: user
  id: uuid
payload:
  locationId: uuid
  serviceIds: [uuid]
traceId: "..."
~~~

Critical async reactions используют transactional outbox. Consumers MUST быть
idempotent и хранить processing cursor/deduplication key.

### 13.5 Freshness strategy

Operational booking MAY обращаться к provider при необходимости real-time
availability. Analytics MUST работать на materialized facts и публиковать
watermark. Каждый data product имеет SLA freshness и fallback policy.

### 13.6 Deletion and retention

Удаление account/PII выполняется через policy-aware workflow. Immutable
financial/security audit сохраняет минимальные pseudonymous facts в пределах
закона. Vector indexes, caches, backups и derived read models MUST входить в
deletion plan.

---

## 14. Security, Privacy and Multi-Tenancy

### 14.1 Tenant resolution

Доверенный порядок:

1. signed authenticated session/JWT membership;
2. verified host/domain mapping;
3. integration credential binding;
4. signed channel binding;
5. explicit tenant slug только в trusted onboarding/admin flow.

Arbitrary tenantId из client payload, prompt или tool args не предоставляет
доступ.

### 14.2 Authorization

Authorization объединяет:

- active Membership;
- RBAC role;
- fine-grained permission;
- entity ownership/scope;
- plan entitlement;
- feature flag;
- consent;
- risk/approval policy.

Проверка выполняется server-side на каждом tool/application boundary.

### 14.3 Secrets

Provider credentials encrypted at rest, scoped per tenant и загружаются на один
call scope. Secrets не возвращаются API, не логируются и не попадают в docs,
prompts, traces или error messages.

### 14.4 AI boundary

До provider call выполняются:

- PII redaction/tokenization;
- role-based minimization;
- prompt injection boundary marking;
- provider/model allowlist;
- budget and rate check;
- data residency/consent policy.

Fallback model MUST пройти ту же policy; отказ provider не разрешает ослабление
privacy.

### 14.5 Audit

Audit record содержит actor, tenant, action/tool, target reference, policy
decision, risk, status, requestId и timestamps. Raw conversation text, secrets
и лишняя PII в security audit запрещены.

### 14.6 Threats to test

- cross-tenant IDOR;
- forged tenant/channel binding;
- prompt injection through user or RAG;
- tool argument escalation;
- replay of approval token;
- webhook replay;
- CRM credential leakage;
- cache key missing tenant;
- model/tool result containing PII;
- bulk action exceeding approved audience.

---

## 15. API and Event Contracts

### 15.1 API principles

- API-first; UI не содержит бизнес-логику.
- Public routes versioned under /api/v1 or compatibility alias.
- Inputs/outputs имеют schemas и stable error codes.
- Idempotency-Key обязателен для money, booking, campaigns и destructive writes.
- Pagination cursor opaque.
- Dates, currency и locale explicit.
- Responses не раскрывают provider payload.

### 15.2 AI orchestration API

Channel-agnostic endpoint принимает bounded conversation или message,
clientRequestId и channel. Backend разрешает identity, tenant, tools и policy.
Response состоит из:

~~~yaml
message:
  text: "..."
  language: ru
cards:
  - type: metric_summary
    data: {}
  - type: approval_request
    data: {}
evidence:
  - id: "obs_..."
quality:
  warnings: []
requestId: "req_..."
~~~

### 15.3 Internal contracts

Internal module calls SHOULD использовать typed application services, а не
loopback HTTP. Async events versioned, backwards-compatible и содержат
минимальный payload. Consumer не должен читать private таблицы producer.

### 15.4 Schema evolution

- additive field по умолчанию optional;
- breaking change требует новой version;
- enum consumers MUST обрабатывать unknown;
- event consumer поддерживает минимум текущую и предыдущую version в migration
  window;
- deprecation имеет owner, deadline и telemetry.

---

## 16. Reliability, Observability and Cost

### 16.1 Service levels

Initial targets являются **Proposed** и должны быть подтверждены ADR/SLO:

| Flow | Target |
| --- | --- |
| read-only operational API | p95 ≤ 500 ms excluding provider |
| cached metric query | p95 ≤ 1 s |
| owner analytical answer | p95 ≤ 12 s |
| booking write | 99.9% monthly availability |
| critical tenant isolation | 0 tolerated leaks |

Voice MAY использовать progressive response, но факты не должны появляться до
получения tool evidence.

### 16.2 Observability

Каждый request связывает:

- request/trace/span IDs;
- QuerySpec ID;
- plan ID/version;
- tool invocation IDs;
- metric lineage IDs;
- approval/action run IDs;
- provider/model identifiers;
- latency, token/cost aggregates и outcome.

Logs MUST быть structured и redacted. Audit, application logs и AI eval traces
имеют разные retention/access policies.

### 16.3 Failure behavior

- Provider timeout не превращается в пустые данные.
- Partial plan возвращает partial result с warnings.
- Money/booking ambiguity fails closed.
- Retry write operation только с idempotency key.
- Circuit breaker защищает external provider.
- Kill switch существует для agent profile, tool и automation policy.

### 16.4 Cost controls

Budgets задаются per tenant, user, channel и workflow. Orchestrator ограничивает
tool loop, prompt size, output size и model class. Кэширование не должно
нарушать tenant scope или data freshness.

---

## 17. Testing and Evaluation Strategy

### 17.1 Test pyramid

| Layer | Обязательные тесты |
| --- | --- |
| Domain | invariants, state machines, tenant ownership |
| Adapter | fixtures, mapping, pagination, retry, reconciliation |
| Metrics | golden datasets, edge cases, version reproducibility |
| QUE | intent/time/metric resolution eval set |
| Planner | bounded plans, missing data, cycle/limit behavior |
| Tools | schema, permission, entitlement, approval, idempotency |
| Security | cross-tenant negative tests, injection, replay |
| End-to-end | channel → evidence → response/action |
| Migration | legacy parity, backfill, rollback |

### 17.2 Golden business datasets

Нужны synthetic tenant fixtures минимум для:

- one-location salon;
- multi-location business;
- zero previous-period revenue;
- mixed currencies;
- missing expenses;
- late CRM sync;
- duplicate customers;
- cancelled/no-show edge cases;
- refund crossing period boundary;
- DST/timezone boundary;
- second industry without beauty terminology.

Expected metrics и lineage фиксируются в versioned fixtures.

### 17.3 QUE evaluation

Eval set включает естественные формулировки, ambiguity, follow-up queries,
typos, multiple languages, permission-sensitive scope и adversarial prompt
injection. Метрики качества: intent accuracy, slot accuracy, clarification
precision/recall, unsafe resolution rate и exact TimeExpression match.

### 17.4 AI answer evaluation

Проверяются:

- все числа существуют в evidence;
- нет unsupported causal claims;
- warnings не потеряны;
- отсутствующая capability объяснена;
- tool/action не предложен вне permissions;
- ответ соответствует роли и channel;
- citations/lineage resolvable.

### 17.5 Release gates

Change не готов, пока не пройдены:

- docs/ADR update;
- schema and contract tests;
- tenant isolation tests;
- metric golden tests для затронутых definitions;
- AI evals для изменённых prompts/tools;
- migration/rollback verification;
- observability and audit verification.

---

## 18. Deployment and Evolution

### 18.1 Target runtime

Platform core: NestJS modular monolith, PostgreSQL, worker/scheduler и optional
queue/cache после появления требования. Channels и provider adapters остаются
на границах.

### 18.2 Migration strategy

1. Зафиксировать текущие production use cases и parity tests.
2. Выделить canonical contracts и anti-corruption adapters.
3. Перенести tenant/auth/permissions в platform core.
4. Перенести typed tools и approval runtime.
5. Ввести events/outbox и analytical read models.
6. Включить UME и QUE за feature flags.
7. Переводить channels на единый AI endpoint.
8. Удалять prompt-side/legacy бизнес-логику только после canary parity.

### 18.3 Feature rollout

Каждый engine поддерживает off, shadow, preview, limited и live modes.

- **shadow** вычисляет, но не показывает/исполняет;
- **preview** показывает результат и lineage;
- **limited** доступен выбранным tenants/roles;
- **live** становится стандартом после exit criteria.

Write capability не включается автоматически вместе с read capability.

### 18.4 Rollback

Rollback plan обязателен для schema, metric definition, adapter mapping,
prompt/tool contract и automation policy. Financial migrations используют
forward repair/compensation вместо destructive rollback.

---

## 19. Implementation Roadmap

### Phase 0 — Specification and guardrails

Deliverables:

- принять этот документ и ADR backlog;
- закрепить MBL vocabulary;
- инвентаризировать current/legacy contracts;
- создать architecture conformance checklist.

Exit: новые изменения можно проверить на соответствие архитектуре.

### Phase 1 — Canonical foundation

Deliverables:

- EntityEnvelope и tenant-scoped repositories;
- core entities/events;
- capability registry;
- adapter mapping contracts;
- synthetic multi-industry fixtures.

Exit: одна и та же core model принимает beauty и non-beauty dataset.

### Phase 2 — Data and metrics

Deliverables:

- outbox and analytical read models;
- Metric Registry v1;
- Time Intelligence;
- lineage/data-quality contracts;
- golden metric test suite.

Exit: revenue, visits, average ticket, retention и utilization воспроизводимы
без LLM и live CRM calls.

### Phase 3 — Query and analytical planning

Deliverables:

- AnalyticalQuery schema;
- QUE v1 with clarification;
- BKG metric dependencies;
- bounded analytical Planner;
- evidence-backed answer contract.

Exit: вопрос «почему просел бизнес» превращается в traceable plan и partial
answer при missing expenses.

### Phase 4 — Actions and agents

Deliverables:

- ActionDraft/Approval/ActionRun;
- risk policies and step-up auth;
- agent profiles;
- outcome measurement;
- kill switches and budgets.

Exit: Maya безопасно готовит и после approval выполняет один end-to-end
операционный workflow с измерением результата.

### Phase 5 — Scale and ecosystem

Deliverables:

- additional CRM adapters;
- vertical presets;
- certified tool/plugin model;
- forecast/optimization models;
- bounded automations.

Exit: новый provider и новая vertical подключаются без изменения core domain.

---

## 20. Codex Implementation Contract

### 20.1 Перед началом задачи

Codex MUST:

1. прочитать AGENTS.md, эту спецификацию и relevant ADR/module docs;
2. определить затронутые modules и contracts;
3. проверить рабочее дерево и не захватывать unrelated changes;
4. сформулировать acceptance criteria;
5. обозначить архитектурный конфликт до написания кода.

### 20.2 Правила реализации

- Не добавлять provider-specific поля в core без adapter mapping.
- Не принимать tenantId от AI как authority.
- Не переносить формулы в prompt/frontend/controller.
- Не вызывать private repository другого module.
- Не добавлять arbitrary SQL/shell/HTTP tools.
- Не выполнять write без idempotency и policy.
- Не считать отсутствие данных нулём.
- Не логировать secrets, raw PII или confidential prompts.
- Не менять accepted architecture молча; сначала ADR/spec update.

### 20.3 Definition of Ready

Feature готова к реализации, если определены:

- owner и user outcome;
- domain entities/invariants;
- API/event/tool contracts;
- permissions/entitlements;
- data requirements and quality policy;
- risk/approval/idempotency;
- metrics and observability;
- migration and rollback;
- tests and acceptance criteria.

### 20.4 Definition of Done

Implementation завершена, когда:

- contracts и code согласованы;
- unit/contract/integration/security tests пройдены;
- tenant isolation доказана negative tests;
- schema migration безопасна;
- metrics lineage/audit доступны;
- docs и ADR обновлены;
- feature flag/rollout/rollback готовы;
- unrelated application code не изменён.

### 20.5 Архитектурный review checklist

- [ ] Решение универсально для service business?
- [ ] Tenant scope присутствует на всех данных и cache keys?
- [ ] Источник истины и conflict policy явны?
- [ ] LLM отделена от расчётов, permissions и execution?
- [ ] Metric/formula versioned и тестируема?
- [ ] Missing/partial data не скрыты?
- [ ] Tool typed, bounded и auditable?
- [ ] Risk, approval, idempotency и compensation заданы?
- [ ] PII/secrets минимизированы?
- [ ] Существуют rollout, observability и rollback?

---

## 21. End-to-End Reference Scenario

### 21.1 Запрос

Владелец: «Почему прибыль в этом месяце упала относительно прошлого года и что
с этим делать?»

### 21.2 Обработка

~~~mermaid
sequenceDiagram
  participant Owner
  participant QUE
  participant Planner
  participant Graph as Business Knowledge Graph
  participant Metrics as Metrics Engine
  participant Reasoning
  participant Actions as Action Engine

  Owner->>QUE: Natural-language question
  QUE->>QUE: Resolve intent, metrics, periods, scope
  QUE-->>Planner: QuerySpec + confidence + missing requirements
  Planner->>Graph: Expand net_profit dependencies
  Graph-->>Planner: Required metrics/capabilities
  Planner->>Metrics: Batch calculation
  Metrics-->>Planner: Results + quality + lineage
  Planner-->>Reasoning: Evidence bundle
  Reasoning-->>Owner: Facts, contributions, uncertainty
  Reasoning->>Actions: Proposed ActionDrafts
  Actions-->>Owner: Preview + approval request
~~~

### 21.3 Если расходов нет

Maya не вычисляет net profit. Она отвечает:

> Достоверно сравнить чистую прибыль нельзя: источник не передаёт прямую
> себестоимость и операционные расходы. По доступным данным выручка снизилась
> на 10,1%. Наибольший измеримый вклад дали снижение завершённых визитов в
> филиале B и рост отмен. Я могу показать декомпозицию выручки или помочь
> подключить данные расходов.

Числа поступают из MetricObservation. Формулировка «измеримый вклад» не
подменяет причинность. Рекомендации создаются только для доступных actions.

### 21.4 Если данные полны

Maya:

1. показывает net profit и comparison policy;
2. раскладывает изменение по revenue, direct cost и operating expenses;
3. объясняет contribution по location/service/employee без double counting;
4. показывает confidence/quality;
5. предлагает максимум несколько приоритетных ActionDraft;
6. исполняет только выбранный и approved draft;
7. измеряет outcome в заданном observation window.

---

## 22. Initial Contract Registry

### 22.1 Core schemas

- EntityEnvelope.v1
- DomainEvent.v1
- CapabilityManifest.v1
- MetricDefinition.v1
- MetricQuery.v1
- MetricResult.v1
- AnalyticalQuery.v1
- ClarificationRequest.v1
- ExecutionPlan.v1
- EvidenceBundle.v1
- Insight.v1
- ToolDefinition.v1
- ToolResult.v1
- ActionDraft.v1
- ApprovalRequest.v1
- ActionRun.v1
- MemoryItem.v1
- KnowledgeAssertion.v1

### 22.2 Core events

- TenantCreated
- MembershipActivated
- CustomerCreated
- CustomerMerged
- AppointmentRequested
- AppointmentConfirmed
- AppointmentRescheduled
- AppointmentCancelled
- AppointmentCompleted
- VisitCompleted
- PaymentCompleted
- RefundCompleted
- ExpenseRecorded
- CrmSyncCompleted
- MetricCalculated
- RecommendationCreated
- ActionApproved
- ActionSucceeded
- ActionFailed

### 22.3 Initial tool namespaces

- catalog.*
- scheduling.*
- bookings.*
- customers.*
- commerce.*
- finance.*
- analytics.*
- knowledge.*
- tasks.*
- campaigns.*
- integrations.*

Namespace не является permission. Каждый tool объявляет собственную policy.

---

## 23. Open Decisions and ADR Backlog

| Decision | Status | Required before |
| --- | --- | --- |
| Formula DSL representation and sandbox | TBD | UME implementation |
| BKG physical storage beyond PostgreSQL | Proposed: stay on PostgreSQL | scale-out |
| Event schema registry technology | TBD | external consumers |
| RLS rollout sequence | Proposed | external tenant onboarding |
| Data residency/provider policy | TBD | multi-region/provider expansion |
| Forecast model registry technology | TBD | forecast production |
| A4 bounded automation policy | TBD | autonomous actions |
| Plugin signing/certification model | TBD | marketplace |
| Cross-tenant aggregate analytics policy | TBD | platform benchmarks |

TBD не разрешается фиксировать случайным выбором библиотеки в feature PR.

---

## 24. Glossary

| Термин | Определение |
| --- | --- |
| Maya OS | вся операционная платформа |
| Maya Brain | intelligence/orchestration subsystem |
| MBL | канонический язык бизнеса Maya |
| Canonical fact | provider-neutral проверенный бизнес-факт |
| BKG | типизированный граф семантики и зависимостей |
| UME | детерминированный движок метрик |
| QUE | перевод естественного языка в QuerySpec |
| Planner | строит bounded план, но не исполняет policy |
| Tool | typed application contract для orchestration |
| Action | разрешённая write operation с lifecycle |
| Evidence | ссылка на факт, метрику или knowledge source |
| Lineage | происхождение и трансформации результата |
| Capability | фактически доступные данные/операции |
| Tenant | security, billing и configuration boundary |
| Watermark | момент полноты materialized данных |
| Approval | решение человека для exact action payload |

---

## 25. Change Log

### 0.1.0 — 2026-08-05

- Создан единый living architecture document для Maya OS.
- Формализованы Vision и Philosophy of Data.
- Определены Canonical Business Model и Maya Business Language.
- Зафиксированы Business Knowledge Graph, Universal Metrics Engine и Query
  Understanding Engine.
- Добавлены contracts для Planner, Tools, Actions, Memory, Data Platform,
  Security, API, testing и implementation roadmap.
