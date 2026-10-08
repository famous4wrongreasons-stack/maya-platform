# MAYA — актуальное состояние собственных задач в чате

Runtime: `1483b3342dfaea557b5999fb44f44e4b85edded5`, parent `0bf1488ff25c24f7c6386d2ecdcce73e85705b7a`, isolated branch `codex/maya-development-integration-20261006`. Local development checkpoint, `NOT_ISSUED`; no deployment or full MAYA/C10 acceptance.

## Полезный результат

«Покажи все мои задачи» теперь читает состояние из A23 `OperationalWorkItem`. Раньше `tasks.list` читал `InboxItem.payloadJson` и исключал архив: завершённая задача могла выглядеть активной либо исчезать из «всех». Два RED-теста через настоящий handler воспроизвели этот разрыв. Устаревшая, архивная или отсутствующая inbox-проекция больше не меняет текущий статус задачи.

Существующий `AiCore → C9 TOOL_READ(tasks.list) → handler → A23` возвращает один серверный ответ с grounding и временем чтения. Текст задач не уходит во второй вызов модели, а прошлый assistant reply не попадает в модель как источник фактов. Текущий чат сохраняет ответ через существующий timeline; reload/re-login не выполняет новый READ. Повтор со старым idempotency key остаётся историческим snapshot с исходным `as_of`, не новой проверкой состояния.

## Источник и границы

- Канонические status/body/dueAt берутся из A23. Inbox даёт только существующий exact-user locator или `null`; work-item ID не подставляется как completion locator. Нет repair/backfill, новых API, схемы или расширения прав.
- Проверяются точные tenant/actor и текущие membership/User/tenant/role до чтения и перед возвратом. «Мои» не расширяется до команды.
- `active/all` и `today/overdue/all` фильтруются в базе до ограничения 100+1. Дата и фильтры используют timezone компании; исходный `due_at` сохраняется. Отсутствующий timezone не подменяется UTC.
- История `operationalWorkItemId=NULL` остаётся доступной согласно [A23 §7.2](CYCLE-06-BLOCKING-PACKAGE-5-AUTHORITY-CLASSIFICATION-MINIMUM-SCHEMA-DECISION-GATE.md), отдельно как `unverified/read_only`, без фильтра текущего состояния/срока. Она не включается в текущие статусы и не получает действие завершения.
- Две коллекции ограничены по 100 строк; текст — 4000 символами на источник, ответ — 10 текущими и 5 историческими строками с сокращением описаний и явным признаком неполноты. Stale/malformed source даёт `blocked`, а не утверждение об отсутствии задач.

Основные изменения: [A23 READ](../../maya-saas-backend/src/package5-wave1/operational-tasks.read.ts), [handler](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts), [presentation](../../maya-saas-backend/src/ai-tools/own-tasks-presentation.ts), [AiCore](../../maya-saas-backend/src/ai-tools/ai-core.service.ts).

## Выполненные проверки

| Проверка | Результат и граница |
| --- | --- |
| Исходный дефект | 2 RED через реальный handler; baseline runtime `fb65749b` (следующий `0bf1488f` менял только docs/evidence) |
| Финальный targeted unit | **331/331, 6 suites PASS**. В том числе timezone/DST, ограничение выборки, foreign actor/tenant, текущие роли, revocation во время чтения, stale/incomplete source, отсутствие private task text в модельных входах |
| Static/architecture | Backend/live-fixture/contract types, scoped lint, K3 PASS; contract checker **31 PASS + 4 ранее отложенных checks** |
| Browser request guard | **5/5 PASS**; конечные prompts/auth/history/resolve, mutations и внешние адреса запрещены |
| Actual HTTP/PG/current React | **1 scenario, 7 checkpoints PASS**: history, active, all, today, overdue, reload, revoked. 4 direct HTTP READ и 5 chat READ; 5 settled C9 receipts/completed runs; после reload и `401` при revoked — без нового C9/model вызова |
| Effects/privacy | На READ-этапе неизменный business snapshot, writer recorder без бизнес-записей, provider fetch 0, real model calls 0, unexpected calls 0. Все 5 scripted selections проверяют отсутствие task bodies и toolResults в модельном входе |
| Isolation/cleanup | Fresh loopback PG; один worker, Node heap 3072 MiB, PG shared buffers 64 MiB/work memory 4 MiB/max connections 30. Все owned groups closed/absent, кластер остановлен; source и launcher hashes неизменны |

HTTP fixture использует настоящие A23 create/complete для setup: семь задач и два завершения. Missing/stale/archived Inbox divergence вводится явно как synthetic test seam. Всего после setup зафиксировано 15 `ActionExecution`, включая остальные fixture-действия. **Отсутствие бизнес-эффектов относится к READ после baseline, а не ко всему setup.** Auth/session/chat/audit/C9 persistence и тестовый отзыв membership не являются этим business-effects утверждением.

[Manifest и архив](evidence/maya-development-integration-20261006/own-tasks-20261008/artifact-manifest.json), [HTTP observations](evidence/maya-development-integration-20261006/own-tasks-20261008/browser-attempt2/own-tasks-observations.json), [runner/source binding](evidence/maya-development-integration-20261006/own-tasks-20261008/browser-attempt2/manifest.json), [independent review](evidence/maya-development-integration-20261006/own-tasks-20261008/independent-review.md).

Архив сохраняет промежуточные ошибки: первое root unit assertion ожидало неправильную оболочку runtime DTO; затем исправлены тип helper в новом fixture и lint. Первый browser launcher остановился до fixture из-за неправильного cwd для Prisma; кластер был остановлен. После явного backend cwd второй запуск прошёл на том же runtime SHA. Эти неудачи не скрыты и не представлены как product failures.

## Что эта проверка не доказывает

Выбор инструмента scripted; содержимое задач synthetic, хотя A23/AE/HTTP/PG/React выполняются реально локально. В этом срезе нет YCLIENTS/provider READ и нет real-model/language acceptance. Browser role — tenant owner; остальные отрицательные роли и DST проверены unit-тестами. Reload не равен Node/PG restart; отдельный restart для этого READ не заявлен. Полный aggregate повторно не запускался.

Просмотрены реальные скриншоты all/active/revoked. На all видны правильные completed/open состояния и отдельная история; revoked возвращает экран входа. Сохраняются прежние перекрытие шапкой/историей и частичная headless отрисовка отдельных кадров; это не design/visual acceptance. Каталог `output/playwright` — историческое имя артефактов: запуск использует Chrome CDP, не новый design Playwright run.

Рабочий сайт, реальные записи/рассылки, deployment, push/merge, телефон и background C10 не затронуты. [Полный остаток реализации](MAYA-IMPLEMENTATION-REMAINDER-20261008.md) сохраняет отдельные отсутствующие функции и решения владельца.
