# CYCLE 05 — PHASE A — OPPORTUNITIES & AGENT TASKING

Статус: **INSPECT + PLAN ONLY**

Дата: 2026-08-21

Ветка: `codex/maya-brain-systemic-release-20260815`
Проверенный исходный HEAD: `bd8549dd122dc1e7f08d641903af5f130f5d90c0`

## 0. Scope и доказанная исходная точка

Перед этим планом прочитаны и сверены с кодом:

- `CARRY-FORWARD-REGISTER.md`;
- `MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md`;
- completion reports Chapters 1–4;
- текущий git HEAD и незакоммиченные изменения;
- CI, `deploy/vps/deploy.sh` и `release-preflight.ts`.

Chapter 4 синхронизирован с фактическим закрытием:

- `CHAPTER 4 COMPLETE: YES`;
- `UNDERSTAND FOUNDATION COMPLETE: YES`;
- финальный production release: `20260820-c04-closure-final`.

Phase A ничего не исполняет и не меняет приложение. Ниже предлагаются только
контракты, классификация и план. Действующая архитектурная формула обязательна:

> Agent thinks. Capability computes or acts. Business State owns truth.
> Action Engine owns side effects.

Maya остаётся единственным Orchestrator. В v1 допустимы только четыре agent
domains: **Admin**, **Client Lifecycle**, **Occupancy**, **Business
Intelligence**. Loyalty остаётся capability/policy. Marketing Agent не
создаётся. Reputation отложен до canonical reputation truth. Прямая связь
agent-to-agent запрещена.

## 1. Existing Opportunity Inventory

В коде нет единого canonical `Opportunity`. Слова opportunity,
recommendation, risk и candidate сейчас обозначают разные уровни: от факта до
готового внешнего действия. Таблица ниже называет реальный уровень каждого
найденного контура.

| Существующий контур | Код / источник | Что существует сегодня | Текущий уровень | Допустимый результат Chapter 5 |
|---|---|---|---|---|
| Полный реестр клиентов | `client-registry-analysis.ts`, `scanClientRetention()` | число карточек, визитов, repeat/loyal, давность 1–12 месяцев, неизвестная давность | **DETERMINISTIC FACT** для счётчиков; пороги repeat/loyal — **INTERPRETATION** | evidence для Lifecycle opportunity после явной tenant policy |
| Спящие / inactive clients | `readDormantClients()` | карточки с доказанной давностью выше заданного порога, неизвестные вынесены отдельно | факт давности + **INTERPRETATION** порога; список ещё не canonical opportunity | `client_reactivation_candidate`, если порог и исключения принадлежат policy |
| High-value clients | `readHighValueClients()` | сортировка по визитам, давности и spend | **INTERPRETATION** / ranking | не отдельный тип opportunity без доказанной цели и policy |
| Loyalty segments | `clientLoyaltySegment()`, `LOYAL_VISIT_THRESHOLD` | несколько порогов по числу визитов | **INTERPRETATION** | вход policy; не business truth |
| No-show risk | `readNoShowRiskClients()` | отметки провайдера + `risk_level` по локальной эвристике | отметки — **DETERMINISTIC FACT**; risk level — **PREDICTION** / эвристика | только evidence; prediction требует Chapter 8 или явно названной rule policy |
| Reactivation advice | `deterministicClientReactivationAdvice()` | выбор «тёплого» сегмента и инструкция писать после проверок | **OPPORTUNITY** + **ACTION INTENT** в тексте | структурированная Lifecycle opportunity; отправка запрещена |
| Персональный upsell | `suggestClientUpsell()`, `historicalAddonOpportunity()` | исторически покупавшаяся допуслуга или menu match | **OPPORTUNITY** / **INTERPRETATION** | Lifecycle/Admin opportunity без обещания конверсии и денежной ценности |
| Денежный upsell мастера | `moneyPitchForClient()`, `collectUpsellOpportunities()` | прогноз дохода месяца/года из допуслуги и доли зарплаты | **PREDICTION** | не переносить в canonical Opportunity; нужна valuation model Chapter 8 |
| Marketing audience | `MarketingService.findAudience()` | consent-safe аудитория из активных MAYA-аккаунтов и exact CRM match | **OPPORTUNITY** / candidate set | capability Client Lifecycle; Marketing Agent не нужен |
| Campaign preview | `MarketingService.previewCampaign()` | persistent draft и запрос подтверждения | **ACTION INTENT** плюс локальная persistence | за границей Phase A; унифицировать с Action Intent после Chapter 6 |
| Campaign send | `MarketingService.sendCampaign()` | inbox publish, touchpoint и смена статуса кампании | **SIDE EFFECT** | только Chapter 6 Action Engine |
| Свободный слот | CRM scheduling / availability capabilities | реальный интервал доступности можно прочитать по запросу | **DETERMINISTIC FACT**, если источник полный | `free_slot` opportunity только после canonical capacity owner |
| «Недозагружен» | `composeMorningBrief()` | мастер с `appointments <= 1` | **INTERPRETATION** без рабочей ёмкости | не выпускать как opportunity до закрытия 4.41/4.54 |
| Schedule gap | тексты брифов и scheduling domain | совет проверить свободные окна, но canonical gap detector отсутствует | generic **RECOMMENDATION** | Occupancy opportunity после сравнения рабочих интервалов и занятых минут |
| Cancellation recovery | notifications, appointment events, recovery touchpoint `freed_slot` | факт отмены и последующая атрибуция заполненного окна; detector кандидата не един | факт + outcome; отправка — **SIDE EFFECT** | Occupancy opportunity из canonical cancellation event; execution в Chapter 6 |
| Recovery reporting | `RecoveryService.recordBooking()` / reconciliation | атрибуция touchpoint → booking → confirmed revenue | **SIDE EFFECT** + измеренный outcome | Chapter 7; не opportunity detector |
| Revenue delta | Business State / operations analytics | текущий и сравнительный период, delta при достаточной полноте | **DETERMINISTIC FACT** | evidence для BI; сам delta ещё не anomaly |
| Revenue anomaly | `analyticsDiagnosis()` и taxonomy | выбирается самое сильное отрицательное изменение | **INTERPRETATION**; статистической anomaly model нет | BI opportunity только с rule basis; прогнозная anomaly — Chapter 8 |
| Generic recommendation | `analyticsRecommendation()` | правило: cancellations ≥10%, negative clients, declining service | **INTERPRETATION** → текстовая **RECOMMENDATION** | BI/Lifecycle opportunity после вынесения порогов в policy |
| Missing expense confirmation | `expenseCompleteness.owner_confirmation_recommended` | просьба владельцу подтвердить неполные расходы | **INTERPRETATION** / request for evidence | Admin task «получить недостающий факт», не финансовая opportunity |
| No-show / late-cancel prevention | notification schedulers и risk reader | reminders существуют; late-cancel truth не доказан | risk — **PREDICTION**, отправка — **SIDE EFFECT** | Chapter 5 может сформировать Intent, не отправлять |
| Lost revenue | тексты/upsell motivation | локальные оценки из цены, доли или предполагаемых визитов | **PREDICTION** | запрещено помещать сумму в Opportunity без canonical valuation model |
| Operational anomaly | conversation taxonomy | capability name присутствует, единого detector/contract нет | декларация, не runtime fact | не заявлять реализованной opportunity |
| Reputation opportunity | review trend paths | тренды существуют с открытыми вопросами UTC/source semantics | **INTERPRETATION** | deferred; Reputation не маршрутизировать в v1 |
| DomainEvent backlog | `EventStoreService.claimBatch()` | события есть, потребителя Chapter 5 нет; tenant claim имеет открытый долг | **DETERMINISTIC FACT** / transport | будущий вход projector, не opportunity сам по себе |

### 1.1 Что не найдено как canonical runtime

- нет единого типа, владельца или реестра `Opportunity`;
- нет canonical capacity/utilization owner;
- нет durable opportunity queue;
- нет canonical priority/severity policy;
- нет canonical valuation model для «потеряно/можно вернуть N ₽»;
- нет agent task runtime и agent-to-agent протокола, и последний не нужен;
- нет общего Action Intent для всех четырёх существующих контуров side effects.

## 2. Duplicate Opportunity Logic

| Семья | Дубли / расхождения | Решение для Chapter 5 |
|---|---|---|
| Давность клиента | registry analysis, dormant reader, dossier/history и cohort logic имеют собственные окна и пороги | evidence только из canonical recency capability; порог — отдельная tenant policy |
| Loyalty / repeat | `LOYAL_VISIT_THRESHOLD = 3` и отдельная многоступенчатая `clientLoyaltySegment()` | не превращать сегмент в факт; один policy contract, Loyalty остаётся capability |
| Reactivation candidate | полный registry, dormant list и marketing audience фильтруют разные множества | сначала candidate из CRM facts, затем отдельные eligibility/consent policy filters |
| No-show risk | provider marks, attendance mirror и локальный `risk_level` смешивают наблюдение и прогноз | сохранить marks как evidence; risk score вынести в Chapter 8 либо rule policy |
| «Недозагружен» / free slot | brief считает `appointments <= 1`, scheduling знает slots, capacity owner отсутствует | запретить opportunity до schedule + working intervals + completeness |
| Cancellations | canonical dictionary, UI/AI copies и recovery touchpoint используют разные представления | detector читает только canonical appointment transition; UI strings не источник |
| Revenue anomaly | delta считает канон, причины и пороги выбирает `ai-core` | Opportunity ссылается на delta; правило materiality принадлежит policy, не LLM |
| Upsell | history addon, menu keyword fallback и money motivation дают разные основания | разделить evidence-backed addon и speculative suggestion; деньги убрать |
| Marketing candidate | Lifecycle cohort и `MarketingService.findAudience()` смешивают opportunity и eligibility | candidate отдельно; consent, channel, recent-contact и entitlement — policy gate |
| Recovery | `freed_slot` используется как вид touchpoint и как признак результата | free-slot opportunity, outreach intent и measured outcome — три разных объекта |
| Recommendations | owner briefs и AI replies сами выбирают действие | presentation потребляет готовую opportunity; не становится её владельцем |

## 3. Fact vs Interpretation vs Opportunity Matrix

Уровни образуют последовательность, но ни один следующий уровень нельзя
подменять предыдущим.

| Уровень | Определение | Допустимый пример | Недопустимая подмена |
|---|---|---|---|
| **DETERMINISTIC FACT** | значение, вычисленное capability из canonical source с периодом, полнотой и основанием | «у мастера свободен интервал 14:00–15:00» | «мастер недозагружен» без capacity policy |
| **INTERPRETATION** | именованное правило над фактами с owner/version/basis | «клиент inactive по policy `recency_60d/v1`» | назвать локальный regex или порог business truth |
| **OPPORTUNITY** | ограниченная во времени ситуация, где разрешён следующий безопасный шаг | «отмена освободила доказанный слот; Occupancy может подготовить варианты» | сразу отправить предложение клиенту |
| **PREDICTION** | вероятностная оценка с моделью, версией, uncertainty и calibration | «риск неявки 0.64 по model X» | `risk_level: high` без основания или проверки |
| **ACTION INTENT** | предложение конкретного действия, ещё не исполненное | «предложить владельцу draft сообщения аудитории A» | считать preview отправленной кампанией |
| **SIDE EFFECT** | изменение внешнего/внутреннего мира | отправка, запись, отмена, CRM write, loyalty write | любой такой вызов из агента или Chapter 5 |

### 3.1 Денежное правило

Opportunity не содержит придуманную денежную ценность. Допустимо:

- `free slot: 60 minutes`;
- `client inactive: 73 days`;
- `revenue delta: -12%` как canonical fact со сравнимыми периодами.

Недопустимо без отдельной canonical valuation model:

- `lostRevenue = 5 000 RUB`;
- `expectedRecovery = 30 000 RUB`;
- годовой доход из предполагаемого upsell;
- «стоимость возможности» из средней цены или LLM-оценки.

В будущем Opportunity может иметь только `valuationRef` на результат отдельной
versioned capability. Сумма не вычисляется самим Opportunity, Orchestrator или
agent domain.

## 4. Opportunity Contract Proposal

Это domain value object, а не Prisma model.

```ts
type AgentDomain =
  | 'admin'
  | 'client_lifecycle'
  | 'occupancy'
  | 'business_intelligence';

type OpportunityV1 = {
  contract: 'maya.opportunity/1';
  opportunityKey: string; // deterministic tenant-scoped fingerprint
  tenantId: string;
  type: OpportunityType;
  affectedEntity?: {
    kind: 'client' | 'appointment' | 'staff' | 'service' | 'branch' | 'tenant';
    ref: string; // opaque tenant-scoped ref, never raw PII
  };
  evidence: Array<{
    capability: string;
    factRef?: string;
    observedAt: string;
    asOf?: string;
    completeness: 'complete' | 'partial' | 'unknown';
    basis: string;
  }>;
  observedAt: string;
  expiresAt?: string;
  priority?: {
    level: 'low' | 'medium' | 'high';
    basis: 'policy' | 'deadline';
    policyRef: string;
  };
  recommendedAgentDomain: AgentDomain;
  allowedNextCapabilities: string[];
  proposedActionIntent?: ActionIntentV1;
  limitations: string[];
};
```

### 4.1 Contract invariants

1. `tenantId` обязателен; cross-tenant evidence запрещён.
2. `opportunityKey` воспроизводим из tenant + type + affected ref + fact
   window/policy version; он не является глобальной идентичностью клиента.
3. Evidence с `partial/unknown` не превращается в точный ноль.
4. Opportunity с истёкшим `expiresAt` не маршрутизируется.
5. `priority` отсутствует, если нет доказуемого deadline или versioned policy.
6. PII, raw phone/email/name и CRM token в контракт не входят.
7. Денежная сумма запрещена без `valuationRef` отдельной canonical capability.
8. `allowedNextCapabilities` — allowlist, а не приглашение исполнить действие.
9. Opportunity не хранит business truth и не пересчитывает метрики.
10. Reputation opportunity в v1 отсутствует.

Минимальные v1-типы предлагаются только там, где есть путь к доказанному
evidence:

- `client_reactivation_candidate`;
- `appointment_cancellation_recovery`;
- `free_slot` — после capacity gate;
- `schedule_gap` — после capacity gate;
- `client_addon_candidate`;
- `business_metric_change`;
- `missing_business_input`;
- `incoming_customer_request`.

`no_show_risk`, `revenue_anomaly`, `lost_revenue` и
`underloaded_staff` не становятся canonical v1 types до появления владельца
правила или prediction/valuation capability.

## 5. Agent Task Contract Proposal

```ts
type AgentTaskV1 = {
  contract: 'maya.agent-task/1';
  taskId: string;
  tenantId: string;
  agentDomain: AgentDomain;
  opportunityRefs: string[];
  objective: string;
  evidenceRefs: string[];
  allowedReadCapabilities: string[];
  allowedActionClasses: string[];
  autonomy: 'L2_5_SHADOW';
  constraints: {
    noSideEffects: true;
    noDirectAgentCalls: true;
    noTruthOwnership: true;
    noCanonicalMetricCalculation: true;
  };
  requestedAt: string;
  expiresAt?: string;
};
```

Task формирует Maya Orchestrator. Agent domain получает минимальный контекст,
читает только allowlisted capabilities и возвращает структурированное решение
Orchestrator. Agent Task не является очередью внешних действий, не меняет
Opportunity и не общается с другим agent domain.

Autonomy scoped минимум как:

```text
tenant × agent domain × action class = L2.5 Shadow
```

Общий флаг «autopilot enabled» недопустим.

## 6. Action Intent Boundary

Максимальный выход Chapter 5:

```ts
type ActionIntentV1 = {
  contract: 'maya.action-intent/1';
  tenantId: string;
  source: {
    agentDomain: AgentDomain;
    taskId: string;
    opportunityRefs: string[];
  };
  actionClass: string;
  capability: string;
  targetRef?: string;
  arguments: Record<string, unknown>; // schema-validated, redacted
  rationale: string;
  evidenceRefs: string[];
  expiresAt?: string;
  dryRun: true;
  state: 'proposed';
};
```

Chapter 5 не имеет перехода из `proposed` в другое состояние. Запрещены:

- send message / publish inbox / Telegram / email / SMS;
- create or send campaign;
- create, book, move or cancel appointment;
- change appointment status or attendance;
- change CRM data;
- loyalty accrual/redemption/write;
- expense write;
- любой автоматический внешний action;
- прямой вызов существующих action-capabilities из agent domain.

Preview, текст и план не должны называться выполненным действием. Проверка
permissions, consent, entitlement, idempotency, rate limit, retries,
unknown-outcome reconciliation и реальное исполнение принадлежат Chapter 6.

## 7. Routing Matrix к четырём agent domains

| Opportunity / вход | Domain | Почему | Разрешённый результат Chapter 5 |
|---|---|---|---|
| incoming customer request, missing contact/input, booking question | **Admin** | операционная коммуникация и сбор недостающего контекста | ответ либо proposed intent; без записи/отправки |
| recency, inactive/sleeping, retention/reactivation, addon candidate | **Client Lifecycle** | жизненный цикл клиента | cohort explanation, eligibility request, proposed contact intent |
| canonical free slot, cancellation, schedule gap, capacity mismatch | **Occupancy** | заполнение доказанной ёмкости | варианты и proposed fill-slot intent |
| revenue delta, completeness issue, staff/service change, financial fact | **Business Intelligence** | объяснение канонических показателей | diagnosis с fact refs или request for missing fact |
| loyalty balance/policy | соответствующий domain через **Loyalty capability** | Loyalty не агент | read/eligibility; write только Chapter 6 |
| marketing audience/campaign | **Client Lifecycle** + Admin policy | Marketing Agent в v1 не создаётся | audience proposal / campaign intent, не send |
| reputation/reviews | **не маршрутизируется в v1** | canonical reputation truth отсутствует | deferred |
| несколько независимых opportunities | Maya Orchestrator маршрутизирует отдельно | agent-to-agent запрещён | несколько независимых task results, затем synthesis |

Ни один route не зависит от свободной формулировки LLM. Router использует
структурированный `Opportunity.type`, policy/entitlements и tenant context.

## 8. Persistence Decision

**Решение Phase A: не добавлять persistence.** `OpportunityV1`, `AgentTaskV1`
и `ActionIntentV1` сначала реализуются как versioned domain contracts и pure
projections. Существующие Prisma entities `MarketingAudience`, campaign,
recovery и `DomainEvent` не объявляются canonical Opportunity store.

Причины:

- текущая фаза не требует durable queue для доказательства контракта;
- использование существующих campaign/recovery таблиц смешает opportunity,
  action и outcome;
- `DomainEvent.claimBatch()` имеет открытый tenant/security debt и не является
  очередью возможностей;
- схема до выбора retention/dedup/audit lifecycle преждевременна.

Durable lifecycle понадобится, если Phase B потребует межпроцессный dedup,
claim/lease, status history, expiry recovery или недельное измерение L2.5.
Тогда работа останавливается на отдельном **SCHEMA GATE** до Prisma/migration.

Для предложенного ниже первого Phase B schema gate сейчас не требуется.

## 9. Carry-forward Mapping

Закрытые строки не открываются повторно. Все релевантные незакрытые строки
реестра разложены ниже; одна строка может иметь основной и зависимый адресат.

### 9.1 Chapter 5 — Opportunities & Agent Tasking

| Finding | Назначение |
|---|---|
| 3.3 / 3.4 | identity и delivery target внутреннего мастера для Occupancy/Admin |
| 3.7, 0.3 | приоритет №1: canonical client identity/link; без него Lifecycle не адресуем |
| 3.8 | provider returns outside window: запрет выводов без проверки периода |
| 3.10 (`client/*`, `staff/*`) | известный discriminator перед event projection |
| 4.5 | mirror не источник salon opportunity facts |
| 4.9 / 4.39 / 4.74 | единый recency/segment policy, не новая формула |
| 4.12 | working-time/capacity owner; если нужна persistence — schema gate |
| 4.14 / 4.80 | tenant-safe первый consumer DomainEvent; backlog не терять |
| 4.15 | tenant без integration возвращает unavailable, не exception/false opportunity |
| 4.19 | `risk_level` оставить interpretation/prediction, не fact |
| 4.33 | master brief attendance evidence для tasking |
| 4.41 / 4.54 | запрет «underloaded» до canonical capacity/utilization |
| 4.52 | презентационные counters не источник opportunity |
| 4.53 | canonical per-client attendance зависит от client identity |
| 4.72 | provider/search failure ≠ client not found |
| 4.73 | history window должен принадлежать capability contract |
| 4.75 | cohort не считает future/no-show обычным prior visit |
| 4.76 | единый симметричный attendance read path |
| 5.1 / 5.2 / 5.5 | capability/provider catalog и failure semantics для allowlist routing |

### 9.2 Chapter 6 — ACT / Action Engine

| Finding | Назначение |
|---|---|
| 3.2 | grant status semantics; schema gate |
| 3.5 | PII delivery by external id; security + execution boundary |
| 3.6 / 4.18 / 4.43 | cancel/delete/attendance-safe appointment mutation |
| 3.9 | provider rate limits / `429` handling |
| 4.44 | notification dedup against delivery proof and completeness |
| 6.1 | orphan after CRM success/local failure = unknown outcome reference case |
| 6.2 / 6.3 | loyalty write and source-truth/security boundary |
| Existing campaign `sending` | retry/reconcile/recover instead of stuck state |
| All side effects | confirmation, idempotency, dry-run, rate limits, retry, audit, reconciliation |

### 9.3 Chapter 7 — MEASURE & OUTCOMES

| Finding | Назначение |
|---|---|
| 3.10 (`finances_operation/*`) | canonical financial event interpretation |
| 4.0 / 4.1 / 4.3 / 4.6 | cash operations, returns, fiscal semantics, double expense |
| 4.13 / 4.22 / 4.79 | master earning/motivation model only after owner decision |
| 4.20 / 4.21 / 4.26 | report arithmetic, comparable completeness, period labels |
| 4.24 | goals/plan fact family |
| 4.42 | reputation fact owner; Reputation remains deferred until closed |
| 4.51 / 4.66 / 4.67 | currency and expense import semantics |
| 6.4 | journal/card mismatch becomes measured discrepancy |
| 7.1 | recovered visit must not remain conversion forever |
| Recovery service | confirmed outcome/attribution belongs here, not in Opportunity |

### 9.4 Chapter 8 — PREDICT

| Finding / family | Назначение |
|---|---|
| no-show `risk_level` beyond deterministic rule | versioned model, uncertainty, calibration |
| revenue/operational anomaly beyond named thresholds | statistical detector, not LLM guess |
| lost revenue / expected recovery / upsell uplift | canonical valuation model or no money |
| future occupancy and demand | forecast capability with explicit error bounds |

Chapter 8 не создаёт отдельного prediction agent. Его capabilities потребляют
те же четыре domains.

### 9.5 Chapter 9 — Maya Orchestrator & Conversation

| Finding | Назначение |
|---|---|
| 4.10 | один server-owned reporting period |
| 4.32 | model tools перестают считать business metrics |
| 4.57 | silent cap 200 становится disclosed completeness |
| 4.59 | несовместимые `by_category` получают versioned contracts |
| 4.61 | frontend читает canonical expense/profit disclosure |
| 4.85-B | `journal.read` выносит completeness/disclosure в контракт |
| Agent registry/router | Maya synthesis, budgets, role/entitlement filters, no A2A |

### 9.6 Chapter 10 — Autopilot & Autonomy Policy

- autonomy key: tenant × agent domain × action class;
- переход только L2 → L2.5 Shadow → L3/L4 после Chapters 6, 7 и 9;
- лимиты, rollback, kill switch, disagreement/precision metrics;
- никакого глобального `autopilot=true`;
- Reputation и неподтверждённые predictions не получают автономию.

### 9.7 Security debt

| Finding | Требование |
|---|---|
| S.1 Telegram token in journald (HIGH) | rotate/revoke, scrub logging, incident check вне Chapter 5 |
| 3.5 external-id PII delivery | tenant membership + subject binding before delivery |
| 4.14 event claim lacks tenant filter | tenant-safe claim before any consumer |
| 6.3 loyalty source confusion | prohibit cross-source/cross-tenant balance claims |
| Opportunity/Task contracts | no raw PII, tokens, names, phones or emails; opaque refs only |

### 9.8 Technical debt

| Finding | Назначение |
|---|---|
| 4.11 | replace free `status: string` with canonical type |
| 4.45 | one owner for loyalty balance read |
| 4.46 | one tenant timezone owner |
| 4.47 | consolidate price/duration rule inside CRM boundary |
| 4.58 | remove dead presentation branches |
| 4.60 / 4.68 | avoid duplicate expense reads |
| 4.78 | remove UI cancel dictionary copy |
| 5.3 / 5.4 | provider contract/common layer extraction |
| N.1 | naming debt `mayaClientId` |
| 0.4 / 0.5 | compatible role and feature-key names before agent registry |
| Test debt | 224 spec type errors, missing Postgres integration contour; blocks L3 |
| Ratchets 9 / 8 / 5 | only down; new contracts add no bypass |

### 9.9 Explicitly deferred owner decisions (не потеряны)

| Finding | State |
|---|---|
| 4.2 `withLegacyNet` frontend | deferred; revisit with Chapter 7 UI truth |
| 4.35 expanded personal brief audience | deferred by owner |
| 0.1 public `PATCH team-access/:externalStaffId` | deferred |
| 0.2 business-account for internal staff | deferred |

## 10. Proposed Phase B packages

Phase B разрешается только после approval этого документа. Предлагаемый порядок:

1. **B1 — Domain contracts.** `OpportunityV1`, `AgentTaskV1`,
   `ActionIntentV1`, enums и invariants; pure TypeScript, без DB.
2. **B2 — Evidence adapters.** Read-only adapters от Business State,
   canonical recency и appointment transitions; никакой новой арифметики.
3. **B3 — Versioned opportunity policies.** Tenant-scoped thresholds и rule
   basis; сначала reactivation и missing input. `risk`/money исключены.
4. **B4 — Pure projector + dedup key.** Fact/event → zero or more ephemeral
   opportunities; expiry/completeness/PII tests.
5. **B5 — Orchestrator routing.** Opportunity → один из четырёх AgentTask;
   no direct agent calls, agents ещё не создаются.
6. **B6 — Intent boundary validator.** Структурный dry-run `proposed` output;
   allowlist и тесты, доказывающие отсутствие execution.
7. **B7 — Contract/routing acceptance suite.** tenant isolation, unknown ≠ 0,
   incomplete evidence, expiry, no money, no PII, no Marketing/Reputation agent.
8. **B8 — Conditional DomainEvent adapter.** Только после исправления
   tenant-safe claim/discriminators. Если понадобится новая durable store,
   **SCHEMA GATE → STOP**.

Phase B не включает LLM runtime specialized agents. Она строит безопасную
дорожку tasking, которую Chapter 9 позже подключит к Maya Orchestrator.

## 11. Dependencies on Chapter 6

Chapter 5 может завершиться на `ActionIntentV1(state='proposed', dryRun=true)`.
Без Chapter 6 нельзя:

- проверить и исполнить action через единую permission/policy точку;
- гарантировать idempotency во всех четырёх существующих action contours;
- отличить failed от unknown outcome;
- retry/reconcile external CRM/message actions;
- применить provider rate limits;
- доказать delivery и дедуп уведомления;
- восстановить campaign из `sending`;
- безопасно book/move/cancel appointment;
- выполнить loyalty/expense/CRM write;
- открыть L3 autonomy.

L2.5 Shadow в Chapter 5 означает только формирование и измеримость решения, но
не исполнение. Durable audit/decision outcome, если он требует новой схемы,
будет согласован отдельным gate вместе с Chapter 6.

## 12. Risks / blockers

1. **Client identity gap (3.7, 4.53, 0.3)** блокирует адресный Lifecycle.
2. **Capacity owner absent (4.12, 4.41, 4.54)** блокирует canonical free-slot,
   gap и underloaded opportunities.
3. **Tenant-unsafe event claim (4.14)** блокирует consumer DomainEvent.
4. **Unknown provider discriminators and request limits** могут породить
   пропуски или дубли.
5. **Local thresholds masquerade as truth** для loyal/dormant/no-show/anomaly.
6. **Incomplete provider reads** могут создать ложную opportunity, если
   completeness не обязательна.
7. **PII leakage** возможна при переносе client candidates в tasks; нужны
   opaque refs и capability-mediated reads.
8. **Existing side-effect services** легко вызвать напрямую. Compile-time и
   acceptance guards должны запрещать imports/calls из opportunity/tasking.
9. **Invented monetary value** уже есть в motivation paths; canonical contract
   обязан отвергать её без valuationRef.
10. **Marketing/recovery persistence** нельзя переименовать в Opportunity:
    там смешаны candidate, action и outcome.
11. **Agent registry role/feature aliases** должны быть устранены до Chapter 9.
12. **Reputation truth absent**: Reputation остаётся deferred.

Ни один из этих рисков не требует изменения production в Phase A. Они задают
gates для Phase B и последующих глав.

---

PHASE A COMPLETE

APPLICATION CODE CHANGED: NO

DATABASE CHANGED: NO

OPPORTUNITY MODEL PROPOSED: YES

SCHEMA GATE REQUIRED: NO

READY FOR CYCLE 05 PHASE B: YES

WAITING FOR APPROVAL
