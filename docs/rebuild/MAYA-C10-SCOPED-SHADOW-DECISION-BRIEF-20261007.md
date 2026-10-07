# C10: минимальное решение для фонового Occupancy shadow

Дата: 2026-10-07. База: `3f0dd856`. **Предложение для решения, не утверждённая
autonomy policy и не закрытие C10.** Ниже отделены работающий пользовательский
путь, подготовленный локальный proof и будущая фоновая authority.

## Что уже разрешено

Работающий сценарий: явный запрос владельца «Проверь окна после отмен» →
существующий C9 → текущая Opportunity и проверка CRM → Occupancy → сохраняемая
версия предложения READ/NO_ACTION. Запрос не разрешает подписку или повторные
фоновые запуски. Semantic routes остальных разговорных запросов сохраняются.

Существующий C5 hook после CRM reconciliation обрабатывает canonical WATCH
`appointment.removed`, проверяет актуальный график/доступность и сохраняет
Opportunity/AgentTask с `L2_5_SHADOW`. Он владеет dedupe, revalidation, resolution
и expiry, но не вызывает C9 или C6. В новой ветке не нужен другой scheduler,
agent runtime или источник бизнес-фактов.

Нормативные основания:

- [C9 preflight §3](CYCLE-09-PREFLIGHT-AND-SCOPE.md#3-product-objective-and-boundaries)
  отделяет autonomous repeated initiation в C10.
- [Approved C5 schema gate](CYCLE-05-OPPORTUNITY-LIFECYCLE-SCHEMA-GATE.md)
  разрешает durable Opportunity/AgentTask; историческая строка carry-forward
  «durable lifecycle отсутствует» не отменяет этот последующий gate.
- [C10 carry-forward](CARRY-FORWARD-REGISTER.md#service-business-c10) требует
  tenant × domain × action class, current policy, limits и kill switch.
- [Remaining decisions](MAYA-REMAINING-READINESS-DECISIONS.md#c10-что-отсутствует-а-что-не-требует-нового-решения)
  прямо оставляет safe request-driven L0/L1 открытым для реализации.
- [C9 mapping](CYCLE-09-COMBINED-SCHEMA-ACTION-ORCHESTRATION-MAPPING.md)
  фиксирует USER/CLIENT_CHANNEL, signed request event и source-capped derived
  retention. A22 `c9_orchestration` не содержит фонового trigger/authority.

## Точная граница реализации

`C9Authority.current` принимает текущего пользователя либо подтверждённый
Client channel. `C9RequestIdentity` проверяет purpose-bound expiring event,
а `C9Store.admitRequest` связывает его с principal. Даже `entryRef` выбранной
Opportunity не заменяет это основание. Выдавать owner event из scheduler нельзя.

Кроме нового основания admission, будущему фоновому потребителю нужна проверка
**точных** Opportunity id/revision/identity fingerprint и current AgentTask.
Нынешний `C9OccupancySource.read` выбирает доступную сохранённую возможность для
свежего запроса владельца. Его нельзя использовать как фоновое «возьми любую»
или подменить исправленную/истёкшую revision другой текущей записью.

## Минимальный пакет решения владельца

Следующий envelope предлагается утвердить целиком либо изменить конкретные
поля. Численные лимиты ниже — **предложенные**, они нигде не включены.

| Поле | Предлагаемое первое ограничение |
|---|---|
| Pilot scope | Один явно названный tenant, YCLIENTS-first, домен OCCUPANCY, только `appointment_cancellation_recovery`. Tenant-wide scope соответствует текущему owner reader; отдельный branch scope потребует точного reader mapping. |
| Разрешение | Фоновое чтение текущего окна и сохранение ограниченного предложения, максимум L2.5 Shadow. Никакой action execution, outbound delivery, клиентской аудитории, скидки или денежной оценки. |
| Trigger | Только новая active C5 Opportunity revision/current task, принятая после включения подтверждённой policy, из существующего reconciliation hook. Без backfill старых событий и без отдельного cron. |
| Dedupe | Не больше одной admission на tenant × Opportunity id/revision × domain/action class. Restart, повтор WATCH и новая policy revision сами по себе не разрешают повтор той же работы. |
| Output | Сохранённая версия/evidence для последующего чтения действующим владельцем внутри MAYA по его запросу. Без вставки сообщений в чужую беседу и без push/Telegram/SMS. Quiet window для доставки здесь не нужен, потому что доставки нет. |
| Limits | Один активный run на tenant, до 10 новых admissions за календарный день в canonical timezone tenant; один домен, ноль model calls и paid cost. Одна пара current schedule/availability reads на run, без discovery loop. |
| Stop | `enabled=false` по умолчанию; отзыв scoped policy/tenant access/feature останавливает новые admission и дальнейшее чтение. Перед сохранением результата — повторная проверка source/task/policy. Missing, stale, expired, occupied и provider failure дают явно ограниченный исход; UNKNOWN не redispatch. |
| Review/escalation | Тот же действующий владелец видит failed/unknown/limited состояния при следующем запросе. Автоматической отправки escalation нет. |
| Shadow result | Сопоставление сохранённой рекомендации с последующей current availability и canonical terminal reason; dedupe, stale-task suppression, zero execution/dispatch. C7 funnel даёт наблюдаемые cohort/status counts, но не точность рекомендаций или причинный эффект. |

Для первого включения остаются три фактических ответа: **какой tenant**,
**принят ли envelope выше (включая лимит 10/день)**, **когда начинается pilot**.
Подтверждение не заменяет технический contract gate и локальные proofs ниже.
L3/L4 и любые отправки остаются отдельным будущим scope.

## Технический contract gate перед фоновым admission

Нужно утвердить минимальное расширение существующего C9 admission: machine
principal от current scoped A22 policy, точная source/task correlation,
request-key/dedupe, validity и revocation. Это новый тип authority, не новый
orchestrator. Нынешние USER/CLIENT_CHANNEL и chat receipts не переиспользуются
под чужим смыслом. READ capability principal allowlists также требуют явного
mapping; право записано не только в request token.

Физическая новая таблица заранее не предлагается. Сначала mapping показывает,
можно ли сохранить отдельный machine contract в существующих C9 owners с их
ограничениями. Если нужны новая схема, retention либо изменение cleanup/dedupe
после удаления, остановка относится к этим точным изменениям. Не разрешено
подменять historical `DomainEvent`, `InboxItem` или пользовательский turn
хранилищем нового разрешения. Existing explicit request work продолжается.

Для первого envelope предлагается сохранить существующие верхние retention
границы C9 и source-capped payloads, без копий контактов/CRM facts. Конкретный
machine receipt, validity не позже current task/window eligibility и совместимость
AC6 cleanup должны быть описаны в mapping до кода. Ни текущий brief, ни
synthetic proof такого изменения не осуществляют.

## Ближайшее исполнимое доказательство без новой authority

Подготовлено расширение существующего owned-cluster
[`c9-occupancy-proof.mjs`](../../maya-saas-backend/scripts/c9-occupancy-proof.mjs)
и его HTTP probe. Оно использует реальных C5/C9/C7 owners и синтетический CRM
adapter, не подменяет C9 user admission. План проверки:

1. WATCH event → C5 active Opportunity/current task; повтор события создаёт ту
   же revision/task и не создаёт C9 run.
2. Настоящий authenticated owner HTTP запрос → C9 Occupancy и сохранённое
   READ/NO_ACTION предложение; повтор запроса не вызывает нового чтения CRM.
3. Новый backend process + PostgreSQL restart → те же proposal/evidence;
   повтор C5 scan дедуплицируется без фонового C9 admission.
4. Синтетически занятый интервал: partial/provider-failure scan не закрывает
   Opportunity; complete scan сохраняет canonical resolution evidence и
   инвалидирует задачу. Свежий owner request видит CLOSED. Исходный proposal
   hash не меняется.
5. Истёкшая Opportunity: существующий lifecycle ставит EXPIRED, invalidates
   task; повтор не создаёт новую задачу.
6. Existing authorized C7 `execution_funnel` после этапов показывает состояния
   и нулевые AE admissions/success/attempts. Это `live`, `PARTIAL`,
   `NOT_APPLICABLE`, без фиктивной MeasurementRevision. Сохраняются limitations
   `proposal_admission_denominator_unavailable` и `incremental_revenue_not_measured`.

C6 `occupancy.recovery-options.prepare` отдельно зарегистрирован SHADOW_ONLY,
но требует `calendar.internal` и отсутствует в C9 registry. Этот proof не выдаёт
YCLIENTS tenant искусственное право и не объявляет C9 READ исполненным C6 step.
В текущем пути корректный C6 результат — отсутствие admission/dispatch.

Неизменяемые границы proof: source-qualified facts из CRM/C5/C7/C8; только C9
координирует; AE единственный effect owner; presentation не авторизует; current
tenant/actor/feature revocation обязательны; при недоступности нет выдуманного
нуля, вероятности или восстановленной выручки.

## Статус проверки этого follow-up

Подготовка кода завершена; read-only independent review не нашёл оставшихся
блокирующих замечаний. [Лёгкие evidence](evidence/maya-development-integration-20261006/c10-preflight-light/manifest.json)
фиксируют точный scope проверок. Шесть лёгких
проверок proof driver прошли с heap 256 MB, включая отмену child, игнорирующего
TERM, и разрешение только cleanup после отмены. Pure presenter checks сохраняют
ненулевые секунды/миллисекунды и различают UTC offsets при DST fold.
Actual C9 BI/Lifecycle result validators принимают новые statements и сохраняют
source asOf. PARTIAL BI без причин неполноты корректно отвергается; первая
ad hoc fixture была исправлена без изменения этого guard.
PostgreSQL/HTTP/browser, полный Jest/types/lint пока не запускались, local heavy
slot передан website. Ни подготовленный
probe, ни предыдущие evidence не считаются новым PASS. Новый результат и hashes
будут записаны после фактического запуска.

Real-model/provider acceptance, production enablement, C10 closure и release
certificate: **не заявлены**.
