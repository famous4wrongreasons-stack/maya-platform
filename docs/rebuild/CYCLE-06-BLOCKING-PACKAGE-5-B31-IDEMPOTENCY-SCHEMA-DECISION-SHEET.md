# B31 Idempotency Schema Decision Sheet

**PROPOSAL ONLY — APPROVAL PENDING. Migration/runtime не реализуются.**

Checkpoint `49e3376f9b4c3e5e3c2041242fd0fe4f53a95774` и STOP приняты владельцем.
После fetch: HEAD = origin canonical branch, unpushed = 0; существующий
`/tmp/maya-b29-contour` чистый. B31-G1 FOUNDATION SUFFICIENT: **NO**.
B31 DEPLOYMENT: **NOT STARTED**. PACKAGE 5 COMPLETE: **NO**.

## Основание решения

[STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B31-LOCAL-CONTRACT-STOP-REPORT.md),
[remainder](CYCLE-06-BLOCKING-PACKAGE-5-POST-B31-LOCAL-REMAINDER-CHECKPOINT.md) и
[реальный PostgreSQL proof](evidence/package5-b31-secondary-idempotency-alias.proof.json):
`K1+A → E1; K2+A → E1; K2+B → E2`. Второй ключ не сохраняется при logical
deduplication. Это нарушает существующий
[Schema Gate](CYCLE-06-ACTION-ENGINE-SCHEMA-GATE.md#caller-request-identity) и
[appointment identity contract](CYCLE-06-PHASE-B2-APPOINTMENT-ACTION-MIGRATION-REPORT.md#4-logical-identity-and-idempotency).

Проверенные владельцы: `ActionExecution` в
[`schema.prisma`](../../maya-saas-backend/prisma/schema.prisma),
`findDuplicate` / `assertDuplicateEquivalent` в
[`ActionEngineKernel`](../../maya-saas-backend/src/action-engine/action-engine.kernel.ts),
[`ActionIdentityService`](../../maya-saas-backend/src/action-engine/action-engine.identity.ts),
`createAppointmentNormalizer` в
[`registry`](../../maya-saas-backend/src/action-engine/action-engine.registry.ts),
[`ClientAppointmentCreateService`](../../maya-saas-backend/src/appointments/client-appointment-create.service.ts)
и existing create/dispatch/reconcile в
[`CrmService`](../../maya-saas-backend/src/crm/crm.service.ts).

## Общий обязательный контракт A/B

**ONE IDEMPOTENCY IDENTITY → ONE IMMUTABLE BOOKING INTENT.**

Для новых B31 intents identity = `(tenantId, operationScope, keyHash)`.
Серверный scope `appointments.client.create.v1` общий для HTTP/AI и обоих
calendar sources; имя initiator не создаёт отдельную identity. Используется
существующий `callerIdempotencyHash({ tenantId, scope, key })`: key — opaque,
case-sensitive, без обрезания/переписывания непустого значения; raw key не хранится.
Client фиксируется в binding и fingerprint, но **не включается в unique key**:
смена Client внутри одного tenant не освобождает уже занятый ключ. Для другого
tenant identity независима. Client всегда разрешается через verified binding;
User ID, legacy `Appointment.clientId` и contact matching не являются authority.

Без явного ключа сохраняется существующая server-derived identity/duplicate
policy; отсутствие ключа не даёт гарантии сопоставления двух разных намерений.
Новый транспортный request ID не подставляется вместо logical identity.

| Случай | Результат обоих вариантов |
| --- | --- |
| First valid request | После authorization/validation атомарно принять intent, связать ключ и выбрать/create существующий canonical execution. Dispatch только после commit. |
| Same key + same canonical intent | Тот же execution и его durable outcome; новый create не запускается. Authorization проверяется заново. |
| Same key + different canonical intent | `IDEMPOTENCY_CONFLICT`; 0 новых Appointment, provider bookings, ActionExecution и business outcomes. |
| Different key + same intent | Existing logical identity / duplicate-booking policy решает outcome. Если выбрана существующая E1, **обязательно** привязать новый ключ к E1 до возврата успеха. Не добавлять uniqueness по одному booking hash. |
| Concurrent same key + same intent | Один committed winner; остальные перечитывают его binding и возвращают тот же execution. |
| Concurrent same key + different intent | Один committed accepted intent; проигравший сравнивает hash и получает conflict. Его provisional execution откатывается. |
| Missing/revoked binding или неверный context | Отказ до принятия ключа/execution; чужой outcome не раскрывается. Это authorization failure, а не способ занять ключ. |
| Crash/restart | До commit — нет accepted intent; после commit — binding уже указывает на durable execution. Потеря HTTP-ответа не разрешает повторный business create. |
| Provider UNKNOWN | Same key/intent находит **тот же** UNKNOWN execution. Только existing reconciliation; redispatch допустим лишь по existing `PROVEN_NOT_EXECUTED` policy. Changed intent всегда conflict, даже при UNKNOWN. |

`IDEMPOTENCY_CONFLICT` здесь — требуемая семантика; существующий класс
`ActionConflictError` имеет код `ACTION_IDEMPOTENCY_CONFLICT`. Решение не требует
нового action class или молчаливого переименования API error contract.

## Варианты схемы

Счётчики ниже — **новые persisted scalar columns**, включая колонки новых
таблиц; Prisma navigation/back-reference fields отдельно не считаются колонками.
Оба варианта используют существующий `create_appointment` и Action Engine.

| Измерение | A — execution владеет intent (**рекомендован**) | B — отдельный владелец create intent |
| --- | --- | --- |
| Canonical owner | `ActionExecution` владеет immutable intent и outcome; `ActionExecutionIdempotencyBinding` хранит все принятые aliases. | Новый `AppointmentCreateIntent` владеет immutable intent; `AppointmentCreateIntentKey` хранит aliases; execution остаётся владельцем попыток/outcome. |
| Новая model / поля | Binding: `tenantId String`, `clientId String`, `idempotencyScope String`, `requestIdempotencyKeyHash String`, `actionExecutionId String`, `createdAt DateTime`. | Intent: `id String`, `tenantId String`, `clientId String`, `intentContract String`, `intentHash String`, `intentEncrypted String?`, `actionExecutionId String`, `createdAt DateTime`. Key: `tenantId String`, `idempotencyScope String`, `requestIdempotencyKeyHash String`, `appointmentCreateIntentId String`, `createdAt DateTime`. |
| Изменения existing schema | В `ActionExecution`: `bookingIntentContract String?`, `bookingIntentHash String?`, `bookingIntentEncrypted String?`. Первые два либо оба null для legacy, либо оба заполнены. | Новых scalar columns в existing models нет. |
| Immutable hash / payload | Contract/hash на execution; encrypted canonical descriptor и resolution context — в `bookingIntentEncrypted`. Existing normalized action payload/hash не переопределяются. | Contract/hash и encrypted descriptor — на Intent. Existing execution normalized payload/hash не переопределяются. |
| Exact fingerprint inputs | Единый контракт ниже. Hash один на execution, aliases не хранят разные версии намерения. | Тот же контракт; hash один на Intent. |
| Tenant / Client scope | PK binding `(tenantId, idempotencyScope, requestIdempotencyKeyHash)`; FK `(clientId, tenantId)` → Client; FK `(actionExecutionId, tenantId)` → ActionExecution. | Такой же PK Key; FK `(appointmentCreateIntentId, tenantId)` → Intent. Intent имеет FK Client и ActionExecution, оба tenant-qualified. |
| Relation к execution | Many aliases → one execution. Нельзя перепривязать accepted key или менять Client/hash. | Many keys → one Intent → one execution; unique `(tenantId, actionExecutionId)` исключает второй Intent для одной E1. Intent также имеет unique `(id, tenantId)` для FK. |
| Relation к Appointment | Через existing execution result/executor, без новой Appointment FK/колонки. Appointment появляется только в executor с exact `mayaClientId + tenantId`. | То же; Intent не создаёт Appointment и не владеет provider outcome. |
| First / retry / changed request | Общая таблица выше; новая alias-row + создание execution/intent fields — одна transaction. | Та же таблица; Intent + Key + execution — одна transaction. При logical duplicate берётся existing Intent. |
| Concurrent first request | Unique binding выбирает winner; unique existing logical execution identity также сохраняется. | Unique Key выбирает winner; unique execution relation не даёт двум параллельным ключам создать два владельца E1. |
| Restart / crash / UNKNOWN | Восстановление через FK к existing execution, его attempts, lease и transport identity. Binding не удаляется при ошибке/UNKNOWN. | То же через Intent → execution; новый domain state machine не вводится. |
| Retention / lifecycle | Aliases живут вместе с durable execution identity; payload очищается отдельно. Правила ниже. | Key/Intent живут вместе с execution identity; тот же lifecycle, плюс согласованное хранение дополнительного owner. |
| Migration / backfill | Additive migration: 1 пустая таблица, 3 nullable колонки, PK/FK/indexes и immutable guards. Backfill: NO. | Additive migration: 2 пустые таблицы, PK/FK/unique/indexes и immutable guards. Backfill: NO. |
| Количество | **1 model, 9 scalar fields (6 + 3), 0 action classes.** | **2 models, 13 scalar fields (8 + 5), 0 action classes.** |
| Почему безопасен / tradeoff | Все accepted aliases атомарно закреплены за исходным execution/hash. Не вводит второго владельца booking lifecycle; подходит именно к выявленному G1. | Та же атомарность/неизменность; отдельный owner полезен лишь при отдельно утверждённой потребности в domain intent entity. Для B31 добавляет ненужный уровень связи. |

Для A понадобятся relation-only поля Binding → Tenant/Client/ActionExecution
и inverse collections у этих трёх models (6 Prisma relation fields). Для B —
10 relation-only полей: Intent → Tenant/Client/ActionExecution/keys, Key →
Tenant/Intent, две inverse collections у Tenant и по одной у Client/ActionExecution.
Таким образом, если считать **все** Prisma field declarations: A = 15, B = 23.
Это proposal counts; в этом checkpoint добавлено **0** моделей/полей runtime.

## Exact canonical intent fingerprint — proposal v1

Contract: `maya.client-appointment-create-intent/1`.
Hash: existing `ActionIdentityService.hmac(contract, descriptor)` → HMAC-SHA-256.
Descriptor содержит **ровно** следующие поля; defaults материализуются явно:

| Поле | Canonical value и normalization |
| --- | --- |
| `tenantId` | Exact authenticated tenant ID после context check. |
| `mayaClientId` | Exact tenant-qualified Client ID из active verified binding. |
| `calendarTarget` | `{ source, provider, companyId }`. Internal: `internal`, null, null. CRM: `external`, существующий provider key и decimal-string company ID из validated provider settings для YClients/Altegio. Это booking namespace, не credentials. Для provider без company contract — null; неизвестный target contract не угадывать. |
| `branchId` | Exact server-validated branch ID; null означает existing «branch не указан». Не придумывать default branch. |
| `staffRef` | Existing accepted `staffId` booking selector, проверенный в tenant/calendar target. Provider ID остаётся квалифицирован provider/company, internal ID — tenant. Не подменять его User ID или создавать Staff mapping. |
| `serviceIds` | Existing validated service IDs в том же calendar target: opaque refs, unique, сортировка как existing `serviceIds` normalizer; порядок/дубликаты в transport-массиве не меняют intent. |
| `startAt` | `canonicalAppointmentInstant` после existing timezone resolution, UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ`. Эквивалентные offset/local формы дают один instant; не вводить новое округление времени. |
| `durationMinutes` | Existing explicit duration override: integer 1…1440; иначе null. HTTP/AI B31 DTO не содержит override, поэтому null. Не добавлять вычисленную текущую catalog duration как новый requested-term contract. |
| `clientName` | Effective booking name после canonical contact resolution, trim, existing 160-character limit. Не ownership authority; изменение accepted booking contact значимо. |
| `clientPhone` | Effective booking phone через existing `normalizeBookingPhone` (`+7…`); presentation punctuation незначима. Не использовать phone matching для выбора Client. |
| `notes` | Existing optionalText normalization: отсутствует/null/пустая строка → null; иначе trim, max 2000. Whitespace-only invalid по existing normalizer. Регистр и внутренние пробелы сохраняются. |
| `creationMode` | `client` — существующее фиксированное B31 значение. |
| `allowBusy` | false — существующее фиксированное B31 значение. |
| `notifyBySmsHours` | 0 — существующее фиксированное B31 значение. |

Нормализация IDs не меняет регистр и не сливает разные opaque refs. Нормализация
имени/notes не добавляет Unicode/case-folding, отсутствующее в existing contract.
Используется `stableActionJson` **только после** field-level normalization:
фиксированные имена полей, отсортированные object keys, явные null/defaults,
нормализованный service set; unsupported/non-finite values отклоняются.
Raw DTO `JSON.stringify` не является hash contract. Version и HMAC secret
должны оставаться воспроизводимыми для живых bindings; ротация не означает
«ключ не найден» и не разрешает создавать новый execution.

**Исключены:** caller key, HTTP/AI source, User ID, link ID, request/trace IDs,
timestamps доставки, AI message/tool-call metadata, sourceRef/evidence refs,
auth token, IP, retry counter, lease, provider response, API credentials.
Также исключены текущая availability, display labels, live catalog price,
вычисленные buffers/endAt и прочие terms, которые existing create contract
не принимает как независимое намерение. Booking contact и notes, напротив,
передаются в business create, поэтому не могут быть отброшены как metadata.

Encrypted descriptor хранит принятую нормализованную форму. Отдельный encrypted
resolution context хранит effective timezone для интерпретации local time;
сам timezone не входит в hash, когда UTC instant одинаков. На связанном retry
отсутствующие contact/default inputs разрешаются относительно принятого
snapshot, а явно изменённые значимые значения сравниваются с ним. Изменение
profile/catalog/config не переписывает accepted intent. Нельзя автоматически
перенаправить старый execution на другой provider/company; при недоступности
исходного target существующий outcome остаётся pending/UNKNOWN/manual.

## Atomic boundary и lifecycle

Binding lookup/compare/insert принадлежит canonical Action Engine ingress/kernel,
после verified Client authorization. HTTP/AI только инициируют команду. Сначала
проверяется занятый ключ; новая availability-проверка не маскирует conflict и
не блокирует replay уже занятого своей записью slot.

В одной DB transaction: lookup key → compare immutable fingerprint; либо
existing logical duplicate lookup → verify its accepted fingerprint → insert
alias; либо create execution + immutable descriptor + first alias. Успех не
возвращается до commit. Unique-conflict/serialization loser повторяет **всю**
transaction и перечитывает winner; fallback не может просто вернуть logical
duplicate без записи alias. UPDATE accepted key/owner/hash запрещён immutable
DB guards; разрешена только отдельная очистка encrypted payload. FK tenant
scope и проверки capability/Client/hash обязательны, включая logical duplicate.
Не вводится новый logical identity/duplicate-booking algorithm.

Ни Appointment write, ни provider I/O не допускаются внутри проигравшей
transaction/до её commit. Затем работают existing database claims, attempts,
transport idempotency и executor/reconciler. In-process coalescing не является
доказательством concurrent safety. Обязателен будущий multi-connection proof
обеих гонок и исходного `K1+A; K2+A; K2+B`.

Aliases/hash не имеют самостоятельного TTL и не удаляются при cancel, failure,
Client merge/revocation или UNKNOWN. Client/Execution FK — Restrict для
индивидуального удаления; tenant-owned purge следует existing tenant/legal-hold
lifecycle. Existing appointment capability объявляет payload 7 days / audit
365 days; эти metadata не разрешают автоматически освободить ключ. Active и
UNKNOWN сохраняют encrypted continuation data по existing Schema Gate;
terminal payload очищается отдельно, без уничтожения identity/conflict proof.
До отдельного одобренного expiry/purge contract данный scope не добавляет
cleanup binding/identity и не обещает key reuse по истечении audit deadline.
После удаления payload недоказуемый retry останавливается, никогда не создаёт
новый execution; существующий safe outcome остаётся единственным outcome.

## Migration / historical boundary / approval

Оба варианта применяются **только к новым B31 create intents после будущего
cutover**. Таблицы пустые; existing fields/legacy first-key constraint сохраняются.
**FAKE HISTORICAL IDEMPOTENCY BACKFILL: NO. BACKFILL REQUIRED: NO.**
Нельзя вычислять «исходный» hash из текущей Appointment, текущего профиля или
неполных audit данных. Известные legacy keys/executions проверяются read-only:
новый scope не должен обходить существующий binding/UNKNOWN. Если duplicate
указывает на legacy execution без доказуемого v1 intent, не создавать новый
execution и не прикреплять выдуманный v1 hash. Нужен controlled stop, без
автоматического legacy conversion. Исторические secondary aliases, которые
никогда не сохранялись, восстановить и покрыть гарантией невозможно.

Approval A означает согласие с owner, 9-column shape, fingerprint v1, атомарным
alias registration и исторической границей выше. Это позволит **возобновить
реализацию**, но не deployment. Затем обязательны все B31 authorization,
retry/concurrency/UNKNOWN regressions, архитектурные guards и полный исходный
verification pipeline. Mandatory G1 FAIL остаётся открытым до executable PASS.

Этот цикл изменяет только sheet и ссылку/next step в remainder. Documentation
diff/links проверяются; backend tests/build/schema replay не перезапускаются.
Migration/runtime/deployment/production calls: 0. Новых процессов/DB не
создавалось; owned B31 PostgreSQL остановлен. Main dirty worktree и 17 старых
DB не затронуты. B29/B30 PASS не переоткрываются; Wave 7 и Chapter 7 не начаты,
Chapter 6 COMPLETE не объявляется. После commit/push — **STOP**.

```text
RECOMMENDED OPTION: A
NEW MODELS: 1
NEW FIELDS: 9 — persisted scalar columns; 15 including Prisma relation fields
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES — proposed, not implemented
BACKFILL REQUIRED: NO
CANONICAL INTENT FINGERPRINT: versioned HMAC of normalized tenant + canonical Client + calendar target + branch + staff/services + UTC start + explicit duration + booking contact/notes + fixed create options
SAME KEY + CHANGED INTENT: IDEMPOTENCY_CONFLICT
CONCURRENT SAFETY: unique scoped key + atomic binding/execution transaction + winner reread + existing execution claims
UNKNOWN SAFETY: same binding/execution/transport identity; existing reconciliation only; changed intent conflicts
B31 IMPLEMENTATION CAN RESUME AFTER APPROVAL: YES
B31-G1 FOUNDATION SUFFICIENT: NO — approval and implementation pending
B31 DEPLOYMENT: NOT STARTED
PACKAGE 5 COMPLETE: NO
PRODUCTION MUTATIONS: 0
PROCESS HYGIENE: 0 — owned running processes
```
