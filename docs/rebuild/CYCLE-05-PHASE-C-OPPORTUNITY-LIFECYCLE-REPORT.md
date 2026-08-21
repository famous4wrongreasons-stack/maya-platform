# CYCLE 05 PHASE C - OPPORTUNITY LIFECYCLE REPORT

Дата проверки: 2026-08-21.

Ветка: `codex/maya-brain-systemic-release-20260815`.

Проверенный HEAD: `bd8549dd`.

Production baseline: `20260820-c04-closure-final`.

## 1. Scope and decision

Phase C начата с adversarial review Phase B. Проверка нашла блокирующий
архитектурный дефект: текущая lifecycle-фильтрация существует только внутри
одного вызова pure projector. После следующего запуска engine не знает, что
Opportunity была resolved, expired или заменена новым evidence. Следовательно,
старый `AgentTask` может снова стать текущим.

Для restart-safe deduplication, resolution, supersession и expiry нужен
tenant-scoped durable lifecycle owner. В текущей Prisma schema такого owner нет.
Использовать `DomainEvent`, `InboxItem` или `MarketingCampaign` вместо него
нельзя: эти модели владеют соответственно историческим фактом, пользовательским
сообщением и артефактом действия, а не актуальным состоянием Opportunity.

По обязательному правилу задания:

> DURABLE PERSISTENCE REQUIRED -> SCHEMA GATE -> STOP.

После достижения gate application code, Prisma schema, database и production
не изменялись. Этот документ фиксирует доказательство, минимальную lifecycle
семантику, policy matrix и вопросы для отдельного Schema Gate.

## 2. Baseline reviewed

Adversarial review сверял:

- `src/opportunities/opportunity.contract.ts`;
- `src/opportunities/opportunity.signal.ts`;
- `src/opportunities/opportunity.policy.ts`;
- `src/opportunities/opportunity.engine.ts`;
- boundary, engine и production-shadow tests;
- Phase A и Phase B reports;
- Orchestrator + Specialized Agents Architecture Gate;
- Prisma models `DomainEvent`, `InboxItem`, `MarketingCampaign`;
- legacy analytics, marketing, motivation и recovery contours;
- Chapter 4 completion report и carry-forward register.

## 3. Adversarial review of Phase B

| Проверяемое утверждение | Результат | Доказательство / дефект |
|---|---|---|
| Canonical contract owner один | PASS с ограничением | `src/opportunities` является единственным владельцем контрактов `maya.opportunity/1`, `maya.agent-task/1`, `maya.action-intent/1` |
| Canonical opportunity computation production-exclusive | FAIL | legacy `UpsellOpportunity`, `collectUpsellOpportunities`, `analyticsRecommendation`, marketing reactivation и recovery logic продолжают независимо вычислять рекомендации/кандидатов; они не используют canonical Opportunity contract |
| AgentTask routing deterministic | PASS | статический `ROUTES` сопоставляет каждый type одному из четырёх утверждённых domains; LLM и внешний текст в routing не участвуют |
| ActionIntent не исполняется в Chapter 5 | PASS | контракт допускает только `state: proposed`, `dryRun: true`; engine не имеет DB/network/CRM/messaging dependency; projection всегда публикует `executed: 0` |
| Opportunity не придумывает деньги | PASS внутри canonical engine | canonical contracts не содержат valuation/lost/recovered revenue; legacy motivation всё ещё считает monetary upsell estimates и поэтому не может считаться canonical Opportunity owner |
| Unknown/incomplete не становится выдуманным фактом | PASS с явным исключением | measured opportunity не создаётся из unknown; `missing_business_input` допустима только как отдельная policy-backed Opportunity о доказанном отсутствии обязательного input, а не как подстановка значения |
| Tenant isolation | PASS в pure projection, NOT PROVEN для lifecycle store | tenant входит в policy lookup, keys, tasks и intents; durable tenant constraint пока отсутствует, потому что store не существует |
| Untrusted text не управляет правами/routing | PASS | `untrustedText` не копируется в evidence/task/intent; route/capability allowlist статичны; роль из текста получить нельзя |
| Resolution переживает новый projection/restart | FAIL, BLOCKER | `lifecycleBlocked` строится только из non-active signals текущего input и исчезает после завершения `project()` |
| Supersession каноничен | FAIL, BLOCKER | identity включает изменяемые `factRef`, `intervalRef`, change refs; новое evidence создаёт новый key вместо замены старой Opportunity |
| Expiry определяется family policy | FAIL | engine принимает внешний `expiresAt`; утверждённой family-specific expiry policy нет |
| BI change означает deserves attention | FAIL | любой measured-to-measured `business_fact_change` создаёт Opportunity без versioned attention policy |
| Не каждая Opportunity обязана иметь AgentTask | FAIL | engine маршрутизирует каждую обнаруженную Opportunity; outcome `inform_only` отсутствует |
| Deterministic urgency отделена от orchestration priority | FAIL | reactivation policy может записать generic `low/medium/high` в canonical Opportunity; deadline-derived urgency отдельно не моделируется |

### 3.1 Phase B claims that must not be overread

Phase B действительно построила один canonical **contract and pure projection
owner**. Она не доказала:

1. production exclusivity относительно legacy recommendation computations;
2. cross-run lifecycle;
3. restart-safe task invalidation;
4. semantic supersession;
5. family policy для BI attention и expiry.

Тест с формулировкой `never resurrects resolved or expired evidence` доказывает
только подавление в одном input, когда active и blocking signal переданы
одновременно. Он не доказывает restart behavior. До Schema Gate этот тест нельзя
использовать как lifecycle proof.

### 3.2 Why Phase B defects were not patched in application code

Исправить lifecycle дополнительным in-memory map, локальным cache или повторным
чтением последних сигналов нельзя: это замаскирует потерю состояния при restart и
не обеспечит атомарную supersession. Как только это установлено, обязательное
правило Phase C требует `SCHEMA GATE -> STOP`. Поэтому после gate не внесено даже
частичное runtime-исправление, которое создало бы ложное ощущение завершённости.

## 4. Canonical lifecycle semantics proposal

### 4.1 Durable status versus observations

`detected` и `still_valid` не следует хранить как конкурирующие durable statuses.
Это события/результаты проверки над одной активной сущностью.

Минимальный durable status set:

| Status | Семантика |
|---|---|
| `active` | canonical evidence сейчас делает Opportunity истинной |
| `resolved` | current-state revalidation доказала, что условие больше не истинно |
| `expired` | family-specific evidence deadline/freshness window закончились до resolution |
| `superseded` | более новое evidence описывает тот же бизнес-смысл и атомарно заменило прежнюю версию |

Lifecycle observations/transitions:

| Observation | Переход |
|---|---|
| `detected` | отсутствие текущей Opportunity -> `active` |
| `still_valid` | `active` -> `active`, обновляются validation timestamp/evidence fingerprint при допустимой revalidation |
| `resolved` | `active` -> `resolved` |
| `expired` | `active` -> `expired` |
| `superseded` | старая `active` -> `superseded`; новая версия того же semantic scope -> `active` атомарно |

Главный invariant:

> Opportunity существует как current только пока current canonical evidence
> делает её истинной. Terminal Opportunity не может породить current AgentTask.

Terminal statuses: `resolved`, `expired`, `superseded`.

### 4.2 Required validity rule

Current task разрешён только если одновременно:

1. Opportunity status равен `active`;
2. evidence revalidated по правилам family;
3. evidence не просрочено;
4. policyRef/version всё ещё разрешены tenant policy;
5. task ссылается на current Opportunity revision/validity token;
6. tenant task совпадает с tenant Opportunity;
7. task capabilities являются подмножеством route/policy allowlist.

Если хотя бы одно условие не доказано, fail closed: current task не выдаётся.

## 5. Resolution semantics by family

| Family | Active evidence | Resolution proof | Нельзя считать resolution |
|---|---|---|---|
| Cancellation recovery / released capacity | canonical removal after WATCH cutover + current measured capacity interval | capacity занята, интервал исчез, appointment восстановлена либо interval end наступил | факт отправки сообщения, предположение о причине отмены |
| Free slot / schedule gap (future) | canonical schedule + occupancy + completeness подтверждают capacity | slot заполнен, schedule изменён, capacity исчезла | отсутствие appointment без доказанного рабочего интервала |
| Client reactivation | canonical attended-visit recency + versioned tenant policy | новый доказанный attended visit, identity invalidated, policy disabled/replaced | сообщение отправлено, обещание клиента, churn score |
| BI attention | measured Business State + versioned attention policy | current re-evaluation больше не удовлетворяет policy или окно сравнения закрыто | LLM решила, что проблема исчезла |
| Missing business input | canonical state incomplete/unknown + trusted critical-input policy | input становится measured/complete либо policy больше не требует его | подстановка нуля/default |
| Incoming customer request | immutable request ref + trusted routing metadata | canonical request state closed/handled by a later system of record | текст пользователя "всё сделано" без trusted state transition |

Resolution не означает успешное действие и не является outcome attribution.
Action/outcome принадлежат Chapters 6 и 7.

## 6. Supersession

Текущий `opportunityKey` смешивает semantic identity и evidence identity. Это
небезопасно. Нужны два независимых понятия:

- `semanticKey`: стабильная tenant-scoped идентичность одного бизнес-смысла;
- `evidenceFingerprint`: отпечаток конкретной текущей версии доказательств.

Пример Occupancy:

1. capacity episode означает окно `14:00-15:00`;
2. schedule/capacity revalidation уточняет его до `14:30-15:00`;
3. semanticKey остаётся тем же;
4. evidenceFingerprint меняется;
5. старая revision получает `superseded`;
6. новая revision становится единственной `active`;
7. task старой revision больше не current.

Family-specific semantic scope нельзя выводить одним generic hash:

| Family | Proposed semantic scope | Versioned evidence |
|---|---|---|
| Client Lifecycle | tenant + client ref + opportunity family/policy scope | recency fact ref, attended visit ref, policy version, asOf |
| Occupancy | tenant + canonical capacity episode/recovery scope | interval, schedule, occupancy, source event refs |
| BI | tenant + affected entity + metric + attention-policy scope | current/previous facts, comparison window, policy version |
| Admin | tenant + canonical request/conversation work item ref | request revision, trusted request state, routing policy version |

Точные keys должны пройти Schema Gate вместе с уникальностями и атомарным
transition contract. Их нельзя молча закодировать в Prisma из этого документа.

## 7. Expiry policy by family

Единого TTL нет.

| Family | Honest expiry rule | Gate |
|---|---|---|
| Occupancy | не позже конца доказанного capacity interval; любое более раннее изменение capacity вызывает resolve/supersede | нужен canonical capacity episode owner |
| Client Lifecycle | evidence freshness window из versioned tenant reactivation policy; attended visit разрешает немедленно | утверждённого глобального threshold/TTL нет |
| BI | конец evaluation/comparison window или policy-defined evidence freshness; затем повторная оценка, а не вечная task | нужна versioned attention policy |
| Admin | trusted request deadline/closure policy; без утверждённого bounded policy family не порождает current task | нельзя брать deadline из untrusted text |
| Missing input | policy review/freshness window; measured fact разрешает немедленно | не использовать бесконечную task |

Найденные `30/45/60/90` days являются локальными правилами инструментов и
marketing tests, а не платформенной истиной. Реактивационный threshold принадлежит
versioned tenant Opportunity Policy. Существующую MarketingPolicy можно перенести
только явной миграцией policy ownership; молчаливое повторное использование
запрещено. Churn probability остаётся Chapter 8.

## 8. Urgency and orchestration priority

Необходимо разделить:

| Concept | Owner | Canonical content |
|---|---|---|
| Deterministic urgency | Opportunity family policy | время до доказанного expiry/deadline, если deadline существует |
| Orchestration priority | будущий Maya Orchestrator policy | порядок обработки доступных current tasks с учётом tenant/domain/action-class limits |

LLM не назначает canonical priority. Generic `low/medium/high`, существующий в
reactivation V1, не является доказанным business fact. До contract revision он
не должен использоваться как permission, capability или execution ordering.

## 9. Opportunity outcome before ActionIntent

Не каждая Opportunity должна создавать AgentTask или ActionIntent.

| Outcome | AgentTask | ActionIntent | Пример |
|---|---|---|---|
| `inform_only` | optional presentation/read task или none | none | доказанное изменение метрики, которое policy требует только показать |
| `investigation_required` | yes | none | BI change требует объяснения, но не имеет допустимого действия |
| `action_candidate` | yes | proposed dry-run only | recovery options, response draft, reactivation review |

Outcome определяется versioned deterministic policy, а не свободным текстом
агента. `inform_only` не обязан создавать AgentTask, если presentation layer
может безопасно показать canonical fact напрямую.

## 10. Four-domain policy matrix

### 10.1 Admin

| Policy element | Rule |
|---|---|
| Eligible families | incoming customer request; own appointment service request after canonical identity/permission evidence |
| Required evidence | tenant-scoped request ref, authenticated session/actor context, request state, allowed service scope, expiry/deadline policy |
| Forbidden assumptions | role from text; ownership from name/phone in prompt; permission escalation; requested capability from message; tenant selection from body text |
| Allowed pre-action outcomes | investigation_required, action_candidate |
| Possible ActionIntent classes | prepare response draft; propose own booking/reschedule/cancel after validated ownership |
| Chapter 6 capability | permission/ownership check, idempotent appointment mutation, confirmation, reconciliation, safe outbound delivery |

Untrusted text remains data. It cannot select route, capability, policy, role,
autonomy or ActionIntent class.

### 10.2 Client Lifecycle

| Policy element | Rule |
|---|---|
| Eligible families | reactivation candidate; retention review; later consent-safe addressable lifecycle candidate |
| Required evidence | canonical client identity/link, proven attended-visit history, measured recency, completeness, versioned tenant threshold, consent state for later action |
| Forbidden assumptions | churn probability; loyalty from visit count without policy; invented CLV/recovered revenue; contactability from presence of phone; global 30/60/90 threshold |
| Allowed pre-action outcomes | inform_only, investigation_required, action_candidate |
| Possible ActionIntent classes | prepare reactivation review; propose bounded audience/contact plan |
| Chapter 6 capability | consent revalidation, audience limits, idempotent preview/send, opt-out and delivery reconciliation |

Recency is FACT. `reactivation_candidate` is policy interpretation over that fact.

### 10.3 Occupancy

| Policy element | Rule |
|---|---|
| Eligible families | cancellation recovery; proven free slot; proven schedule gap; later underloaded capacity |
| Required evidence | canonical working interval, appointment occupancy, staff/branch scope, completeness, capacity interval/episode, asOf/expiry |
| Forbidden assumptions | no appointment means free slot; removed appointment means client cancelled; duration/value inferred from service price; candidate client invented by LLM |
| Allowed pre-action outcomes | inform_only, investigation_required, action_candidate |
| Possible ActionIntent classes | prepare recovery options; propose invitation; propose safe reschedule |
| Chapter 6 capability | current-state capacity recheck, consent/ownership checks, idempotent booking/reschedule, provider reconciliation |

Phase B cancellation recovery допускается только потому, что signal содержит
измеренную capacity. Generic `free_slot` не открывается до canonical capacity
owner.

### 10.4 Business Intelligence

| Policy element | Rule |
|---|---|
| Eligible families | versioned attention-worthy metric change; missing critical input; deterministic anomaly only after approved policy |
| Required evidence | measured Business State facts, same tenant/entity/metric, explicit comparison window, completeness, versioned attention policy |
| Forbidden assumptions | every change deserves attention; monetary impact; causality; prediction; risk score; action recommendation without policy |
| Allowed pre-action outcomes | inform_only, investigation_required |
| Possible ActionIntent classes | none in v1 Chapter 5 |
| Chapter 6 capability | none for BI itself; BI remains read-only |

BI Opportunity означает `deserves attention`, а не `must act`. Для неё отсутствие
ActionIntent является корректным результатом.

## 11. Agent-ready task contract requirements

Будущий specialized agent получает только current structured AgentTask:

- opaque tenant-scoped opportunity/evidence refs;
- factual objective, уже выбранный deterministic route;
- allowed read capabilities;
- allowed ActionIntent classes;
- policy ref/version;
- expiry and current revision/validity token;
- limitations/completeness;
- autonomy `L2.5_SHADOW`;
- immutable constraints: no side effects, no truth ownership, no canonical
  metric calculation, no direct agent calls.

Agent не должен повторно читать raw CRM, вычислять Opportunity, выбирать tenant,
угадывать permissions или расширять capability list. Перед выдачей task runtime
обязан проверить, что Opportunity revision всё ещё current.

## 12. Persistence decision

### 12.1 Decision

`DURABLE PERSISTENCE REQUIRED: YES`.

Без durable owner невозможно гарантировать:

- deduplication после restart;
- resolution между projections;
- atomic supersession;
- family expiry;
- invalidation старых AgentTasks;
- replay/cutover checkpoints;
- аудит, почему task перестала быть current.

### 12.2 Why existing models cannot be reused

| Existing model | Why it is not Opportunity lifecycle owner |
|---|---|
| `DomainEvent` | immutable historical evidence; событие остаётся истинным после исчезновения Opportunity |
| `InboxItem` | user-facing message of record; user-specific presentation, не domain state |
| `MarketingCampaign` | action artifact с recipients/sending lifecycle; смешивает действие и доставку |

Переиспользование любой из них нарушит правило: Business State owns truth,
Opportunity owns current attention state, Action Engine owns side effects.

### 12.3 Minimum schema questions for approval

Schema Gate должен отдельно утвердить, не копируя поля автоматически:

1. tenant-scoped durable Opportunity record;
2. stable semanticKey и evidenceFingerprint/revision;
3. statuses `active/resolved/expired/superseded` и transition reasons;
4. firstDetectedAt, lastValidatedAt, expiresAt, terminalAt;
5. policyRef/version и recommended domain/outcome;
6. atomic uniqueness: не более одной current revision на tenant + semanticKey;
7. supersededBy relation или equivalent transition audit;
8. task validity binding к current Opportunity revision;
9. transition history/audit without PII/raw provider payloads;
10. tenant foreign keys, indexes, deletion/retention policy;
11. transaction/concurrency behavior для detect/revalidate/supersede;
12. bootstrap/cutover checkpoint ownership.

До ответа на эти вопросы Prisma/schema/database не меняются.

## 13. DomainEvent bootstrap and cutover policy

Накопленные pending DomainEvents нельзя автоматически превращать в historical
Opportunities.

| Source/event class | Replay policy |
|---|---|
| `bootstrap / observed_existing` | никогда не создаёт event-driven recovery Opportunity само по себе; только seed текущего canonical state |
| pre-WATCH appointment events | не replay как recovery; разрешена только current-state revalidation через capacity owner |
| after-cutover canonical appointment removal | может быть candidate input, если appointment/interval всё ещё current и capacity измерена |
| recency | вычисляется из current canonical attendance history/asOf, а не из очереди старых visit events |
| BI | пересчитывается из current Business State + current policy/window, не из всех historical changes |
| incoming request | replay только если trusted request store подтверждает, что request всё ещё open и не expired |

Нужны tenant + family cutover/checkpoint и явная маркировка bootstrap. Replay
исторического факта без current-state revalidation запрещён.

## 14. Read-only production shadow status

Phase B baseline на release `20260820-c04-closure-final` доказал:

- read-only aggregate read;
- signals read: 4;
- accepted current capacity signals: 1;
- expired/rejected: 3;
- detected Opportunity: 1;
- routed Occupancy task: 1;
- proposed dry-run ActionIntent: 1;
- executed: 0;
- side effects: 0.

Phase C требует сравнения во времени: detected, still_valid, resolved, expired,
superseded. Текущий ephemeral engine не способен честно классифицировать эти
переходы между запусками. Повторный запуск показал бы только новый snapshot и
создал бы ложное доказательство lifecycle.

После Schema Gate новый production shadow не выполнялся: правило требует STOP,
искусственные записи запрещены, а без durable baseline transitions недоказуемы.

## 15. Chapter 5 completion criteria

| Layer | Required meaning | State |
|---|---|---|
| WATCH | что произошло | CLOSED |
| UNDERSTAND / Business State | что является правдой | CLOSED |
| Opportunity | что сейчас заслуживает внимания | NOT CLOSED: current lifecycle/restart safety отсутствуют |
| AgentTask | какому domain поручить | deterministic route существует, но stale task не исключена |
| ActionIntent | потенциальное действие | proposed/dry-run boundary существует; executed 0 |
| Side effect | только Chapter 6 | не введён |

Chapter 5 нельзя закрыть, пока terminal/superseded Opportunity способна снова
породить current task после restart.

## 16. Carry-forward mapping

### Chapter 5

- Schema Gate и durable lifecycle owner.
- Stable semanticKey/evidenceFingerprint.
- Family expiry/revalidation policies.
- BI attention policy.
- Outcome model `inform_only | investigation_required | action_candidate`.
- Removal/rename/cutover of parallel legacy opportunity computations.
- Current-task invalidation and lifecycle acceptance tests.
- Cross-time read-only shadow proof.

### Chapter 6

- ActionIntent state machine and единственная execution boundary.
- Permissions, consent, ownership, entitlement, autonomy policy.
- Idempotency, confirmation, rate limits, retries, reconciliation, unknown
  outcome and audit.
- Action result may resolve an Opportunity only through canonical observation,
  not by optimistic mutation from agent/runtime.

### Chapter 7

- Outcome measurement and attribution.
- Proven recovered appointment/client/revenue.
- Reputation canonical facts before Reputation domain.

### Chapter 8

- Churn/no-show probability, anomaly models, calibration and uncertainty.
- Canonical valuation for lost/recovered revenue, CLV and expected impact.

### Chapter 9

- Maya Orchestrator runtime and specialized agent runtime.
- Orchestration priority separate from deterministic urgency.
- Registry/context synthesis; no direct agent-to-agent calls.

### Chapter 10

- Tenant x agent domain x action class autonomy matrix.
- L2.5 shadow measurement before L3.
- Kill switch, limits, escalation, observability and rollback.

### Security debt

- Durable lifecycle rows must be tenant-scoped by construction.
- `EventStoreService.claimBatch()` tenant-safety debt remains unresolved.
- Untrusted request text never controls route/capabilities/permissions.
- No raw PII/provider payloads in Opportunity/Task/Intent/audit.
- Legacy bridges with platform secrets/body-selected tenant remain blocked from
  autonomous execution.

### Technical debt

- Business State change stream is transient.
- Current Phase B lifecycle test title overclaims cross-run behavior.
- Capacity episode owner is absent.
- Client canonical identity/mirror remains incomplete.
- Provider discriminators/rate limits remain partially unknown.
- Legacy recommendation computations are not cut over.

## 17. Risks and blockers

1. **SCHEMA GATE**: no durable lifecycle owner.
2. **STALE TASK**: a terminal Opportunity can reappear after restart.
3. **SUPERSESSION**: changed evidence can create competing tasks.
4. **LEGACY PARALLELISM**: canonical contract is not yet production-exclusive.
5. **CAPACITY OWNER**: generic free-slot/underload families remain blocked.
6. **CLIENT IDENTITY**: addressable lifecycle remains blocked for tenants without
   canonical client links.
7. **BI POLICY**: measured change is not automatically attention-worthy.
8. **EXPIRY POLICY**: no approved family-specific freshness contract.
9. **PRIORITY CONFLATION**: canonical object contains generic policy priority.
10. **SHADOW PROOF**: cross-time lifecycle cannot be measured honestly yet.

## 18. Scope freeze confirmation

Не создавались и не запускались:

- runtime agents;
- agent prompts;
- Action Engine;
- campaigns;
- autonomous loops;
- prediction;
- attribution;
- Autopilot;
- side effects.

Chapter 6 не начат.

## Final status

PHASE C COMPLETE: NO

OPPORTUNITY LIFECYCLE CANONICAL: NO

STALE OPPORTUNITY CAN PRODUCE CURRENT TASK: YES (BLOCKER; REQUIRED TARGET: NO)

AGENT DOMAIN POLICY DEFINED: YES (DOCUMENTED; RUNTIME POLICY NOT IMPLEMENTED)

DURABLE PERSISTENCE REQUIRED: YES

SCHEMA GATE REQUIRED: YES

ACTION INTENTS EXECUTED: 0

READY FOR CHAPTER 5 FINAL VERIFICATION: NO

APPLICATION CODE CHANGED: NO

PRISMA / DATABASE CHANGED: NO

PRODUCTION CHANGED: NO

STOP
