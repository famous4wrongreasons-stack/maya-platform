# Отмена записи: исходная компания YCLIENTS и филиал

**Закрыта воспроизведённая отмена чужой записи после смены подключения A → B.** Старое подтверждение теперь отказывается до DELETE. При неизменном источнике параллельные вызовы и повтор используют один AE и один DELETE. Проверено через настоящий HTTP, отдельный PostgreSQL и native YCLIENTS adapter с конечным синтетическим transport.

Квалификация: **PASS для этого development slice**, не принятие реального YCLIENTS, всей MAYA или C10. Рабочий сайт и production не изменялись; реальных model/provider calls — 0. Новых schema, retention policy, фоновых триггеров или владельцев действий нет.

## Точный исходник и результат

- Полный исходный baseline: `aa8feb8a726cc8a162d4527da0e2333c0977c28a`.
- Чистое воспроизведение RED: `7ed93a17529c4ef197996e61827c5372a345a0cd`. Runtime, Prisma и prisma.config.ts идентичны baseline; добавлены только proof/test и cleanup теста.
- Основной runtime fix: `b251a36fe2b0e9ac8201463b08cd54b7a66e7e74`.
- Финальный runtime fix с проверкой record ID при readback: `9099199a76f20ce3ebe499c58ef049281be289c2`.
- Финальный исполнявшийся candidate с исправленными fixtures: `1cb7f4dd0a85cc915459672a9727de328de82129`, ветка `codex/maya-conversation-continuation-20261009`.

[Проверка исходников и cleanup](evidence/maya-cancel-source-20261010/verification.json), [независимое ревью](evidence/maya-cancel-source-20261010/independent-review.md), [финальный manifest](evidence/maya-cancel-source-20261010/after-r3/manifest.json), [точные HTTP assertions](evidence/maya-cancel-source-20261010/after-r3/regression-jest.json).

## Failure before → pass after

Сценарий создаёт собственную запись `5001` в компании A `430001` через канонический HTTP create. В синтетической компании B `430002` существует чужая запись с тем же provider-local ID. Preview отмены получен в A, затем владелец выполняет реальные HTTP connect/activate для B в том же tenant/branch и подтверждает старый widget.

До исправления — [before-r2 observations](evidence/maya-cancel-source-20261010/before-r2/observations.json): `DELETE record/430002/5001`, ACCEPTED/SUCCEEDED, чужая запись B отменена, запись A остаётся активной, локальный mirror ошибочно canceled. Единственная регрессия падает на требовании нулевого DELETE.

После исправления — [after-r3 observations](evidence/maya-cancel-source-20261010/after-r3/observations.json): Gate 11 `superseded / handle_stale`, `providerAfterConfirm: []`; обе записи неизменны, mirror confirmed. Исходный регрессионный сценарий сохранён.

## Что изменено в существующих владельцах

[Client cancel owner](../../maya-saas-backend/src/crm/client-appointment-cancel.service.ts) требует доказанный canonical Client create origin для native YCLIENTS/Altegio и действующую company ↔ branch привязку. Provider-local ID сам по себе недостаточен. Сохраняется source revision в уже существующем AE evidence; link, Client, source, provider, external ID, branch и revision перечитываются при исполнении. После completed replay/concurrent waiter владелец снова проверяет текущий доступ до выдачи строки записи.

[CRM owner](../../maya-saas-backend/src/crm/crm.service.ts) использует существующий AE, прежний ключ идемпотентности и существующий branch witness. Native adapter вызывает серверную проверку непосредственно перед DELETE. Drift после DELETE, в том числе ответа 404, сохраняет UNKNOWN без ложного обновления mirror. Reconciliation обращается к захваченному исходному adapter, проверяет текущий источник до и после чтения, сравнивает decoded record ID и только затем подтверждает отмену.

[Widget COMMIT adapter](../../maya-saas-backend/src/widgets/owner-ports/commit-booking.adapter.ts) больше не подменяет поздний отказ cancel owner прежним SUCCEEDED. Уже совершённая операция остаётся SUCCEEDED в AE; текущий ответ и widget receipt — REFUSED без указателя на результат. Повторный DELETE не выполняется. UNKNOWN по-прежнему показывается как неопределённый результат.

## Проверки

**21/21 actual HTTP/PG cases PASS; 220 unit tests / 6 suites PASS; scoped TypeScript и ESLint PASS.** Native transport перехвачен конечной synthetic fixture; модель запрещена. HTTP auth, Gates, AppModule, create/cancel owners, AE, mirror и ограничения PostgreSQL настоящие. Race wrappers вызывают исходные runtime/native methods. Revocation выполняет настоящий ClientChannelLinkService с явно synthetic verifier.

| Сценарий | Проверенный результат |
| --- | --- |
| A preview → B connect/activate → confirm | Отказ до DELETE, обе записи и mirror неизменны |
| Перепривязанный/отсутствующий branch, недоказанный create origin, смена provider/calendar source | Отказ до DELETE; прямой unproven-origin cancel возвращает 409 |
| Отзыв Client до COMMIT или непосредственно перед native DELETE | Отказ, ноль DELETE |
| Смена source/record ID непосредственно перед native DELETE | Отказ, ноль DELETE |
| Неизменный source, параллельный same-key cancel и replay | Один AE, одна execution attempt, один DELETE, canceled mirror |
| Отзыв Client после завершения AE для direct waiter / held widget COMMIT | Direct 403; widget REFUSED/null action receipt; durable эффект не переписывается |
| Source drift после DELETE: успех, 404, потерянный ответ | UNKNOWN, mirror confirmed, нет чтения/отмены B и повторного DELETE |
| Потерянный ответ, исходный source стабилен | Один readback подтверждает SUCCEEDED, без второго DELETE |
| Drift во время readback | UNKNOWN без mirror, следующий same-key запрос 409 без I/O |
| Readback недоступен или возвращает другой record ID | Ровно 3 reconciliation → MANUAL_REQUIRED, один DELETE; replay не выполняет I/O |
| Foreign tenant | HTTP 404, owned запись и provider неизменны |

UNKNOWN после исчерпания существующего лимита не становится автоматически SUCCEEDED, даже если провайдер позже доступен. В этом slice сохранена действующая семантика cancel; widget status reader по-прежнему поддерживает create/reschedule, но не cancel. Нового ключа или фонового повторного исполнения для обхода UNKNOWN нет.

## Сохранённые попытки и границы доказательств

Все попытки сохранены без перезаписи; [artifact-hashes.json](evidence/maya-cancel-source-20261010/artifact-hashes.json) связывает raw файлы.

- **before-r1 — FAIL:** ошибочный DELETE B воспроизведён; дополнительно тестовый teardown нарушил FK. Эта попытка не используется как чистый RED.
- **before-r2 — FAIL / чистый RED:** единственное падение — реальная регрессия неправильной компании.
- **after-r1 — FAIL, 13/19:** некорректные fixture writes нарушили immutable B31/revocation constraints; два теста ошибочно ожидали повторной сверки после уже исчерпанного лимита.
- **after-r2 — FAIL, 19/21:** недопустимый retention fixture update и ожидание отсутствующего поля HTTP DTO. Отказы и предел UNKNOWN уже проходили. Защиты БД не отключались и runtime лимит не менялся.
- **after-r3 — PASS, 21/21:** missing origin проверяется через неподтверждённый external mirror ID без изменения AE history; widget receipt читается из настоящего store.

Каждая попытка имеет exact candidate, 2,014 source hashes, неизменённый scoped source и остановленный собственный PG. Hash каждого файла сопоставлен с Git object; финальный source совпадает с диском. Дополнительный config TypeScript сопоставлен с Git после прогона, непрерывная фиксация этого config не заявляется. Все пять собственных кластеров остановлены; postmaster.pid отсутствует. Предыдущие React/model evidence не изменены.

Этот proof не включает React/browser, process/PG restart, настоящий model/provider или проверку всего продукта. Source witness фиксируется при текущем owner admission/AE; не заявляется заморозка любой metadata revision с момента показа preview. Внешний DELETE и локальная БД не являются общей транзакцией. Несколько компаний/филиалов одновременно и импортированные записи без доказанного origin этим исправлением не разрешаются.

## Что ещё нужно для одного реального клиентского lifecycle

1. Проверить конкретный tenant, active YCLIENTS integration, точную пару `maya.crm-branch-binding/1` company ↔ tenant-owned branch, timezone/revision. Сейчас поддержана одна явная пара. Multi-company runtime требует отдельного [schema decision](MAYA-YCLIENTS-MULTI-COMPANY-SCHEMA-DELTA-20261008.md).
2. Подготовить подтверждённого тестового Client, canonical session/link/consent и нужные entitlements; реальную личность не выводить из телефона или имени.
3. Read-only проверить актуальные service/staff, цену/currency/duration/окна, credentials permissions для read/create/PUT/cancel и настройки provider notifications. Synthetic flags не доказывают отсутствие собственных автоматизаций YCLIENTS.
4. Получить точный допуск реального действия: одна create → own non-destructive reschedule → cancel, свежий preview и отдельное подтверждение каждого шага. При UNKNOWN остановиться на исходной операции; cancel status UI/manual reconciliation остаётся отдельным ограничением.

Этот checkpoint не запускает такой pilot, не публикует сайт и не разрешает background C10. Общая MAYA/C10 остаётся `NOT_ISSUED`.
