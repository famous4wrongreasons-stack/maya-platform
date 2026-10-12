# Проверка доступа после чтения результата записи — 12 октября 2026

Проверенный committed candidate: `fd7e4c4c6e83bfa2cae3e71ab1e2fd63cbc47a72`.
Ветка: `codex/maya-local-crm-setup-20261010`.
Исходный checkpoint: `45a162a8a0c5f9135e494a7edc48f411587cc51a`.
Это локальное исправление и scoped verification этапа C delivery plan,
не новая release certification и не реальная приёмка YCLIENTS.

## Дефект и исправление

Чтение завершённой create/reschedule операции проверяло Client/widget authority
перед асинхронным запросом сохранённого результата, но не после него.
Два новых regression tests на исходном коде получили SUCCEEDED вместо отказа,
когда доступ отзывался во время этого запроса. Остальные 11 тестов проходили.

`a4416701` добавляет повтор существующей проверки после awaited result read
в двух существующих методах CrmService. Нет нового endpoint, owner, источника
authority, роли или миграции. Completed read остаётся provider-free; существующее
разрешение прочитать исторический успешный результат без нового каталога или
действующей цены сохранено. Durable execution не откатывается и не переписывается.
UNKNOWN/reconciliation/dispatch, booking input и runtime/presentation не менялись.

Отдельный `722ee59a` явно типизирует test fixture переноса. Это закрывает четыре
старых TS2339 без casts в any, отключения проверки или изменения runtime payload.

## Свежие проверки на final code/test candidate

| Поверхность | Результат |
| --- | --- |
| 11 scoped backend/Client/AE/widget/conversation suites | 293 PASS / 0 FAIL |
| Regression subset, входит в 293 | 13 PASS / 0 FAIL |
| Изолированные counterfactuals | green 13 baseline; 3/3 killed; green 13 restored |
| Backend build types, scripts types, widgets-live types | PASS |
| ESLint четырёх изменённых TS файлов | PASS |
| Actual HTTP/AppModule/PostgreSQL prepare → restart → resume | 2/2 phases, 6 checkpoints PASS |
| Реальные provider/model/Keychain/owner DB обращения | 0 |

Counterfactuals: точный prior CrmService возвращает обе исходные ошибки;
удаление каждого post-read check отдельно возвращает соответствующую ошибку.
Тесты неизменны между вариантами, checkout не мутируется. Crash/timeout или
ошибка загрузки тестов не считаются обнаружением дефекта.

В `--ordinary` HTTP/PG proof native synthetic provider сохраняет один перенос PUT
и теряет ответ. После реального перезапуска PG и backend сначала сохраняется
UNKNOWN, затем authoritative read подтверждает тот же action/receipt и время
в mirror. Повторные completed reads не читают provider. Свежая отрицательная
проверка отзывает настоящий synthetic Client link после фактического чтения
durable result: HTTP 403, без widget disclosure и без изменения ActionExecution.
Последующий уже-revoked запрос тоже получает 403. Создание исходной записи —
ровно один synthetic POST, перенос — ровно один PUT. Чужой tenant не получает
исходный widget и не вызывает provider. Собственная PG остановлена; source hashes
не изменились во время прогона. Проверка использует scripted schedule source,
не настоящую модель и не браузерный перенос пользователя.

## Исправления тестового запуска и сохранённые красные результаты

- Первые restart attempts остановились на setup HTTP 400. Точная диагностика:
  отсутствовал обязательный `expectedVersion` в старом connect fixture.
  `6d937908` передаёт null для первой установки и возвращённый configVersion
  при activation. Production DTO/CAS не ослаблены.
- Старый native assertion ожидал «Запись подтверждена.» для переноса.
  Канонический projector уже выдаёт «Запись перенесена.» с `6ed41427` и имеет
  отдельный owner test. `fd7e4c4c` обновляет только устаревшее expectation,
  сохраняя exact action_receipt_ref и CONFIRMED. Красный resume сохранён.
- Первый scoped Jest command включал ошибочный путь create spec: 171 tests
  прошли, одна suite не загрузилась. Этот запуск не считается PASS.
- Первый lint новой test diagnostic object обнаружил unsafe any; ответ fixture
  теперь рассматривается как unknown. Правило ESLint сохранено.
- Режим runner без `--ordinary` отдельно прошёл 10 branch/create checkpoints
  на `6d937908`; он **не** доказывает native reschedule race. В итоговый proof
  выше входит только нужный `--ordinary` режим на `fd7e4c4c`.

## Границы и воспроизведение

Нет изменений React, headless runtime, дизайна, production, retained owner DB,
ключей, entitlements, реального booking, OTP, уведомлений или C10. Existing
migrations применялись только к новым disposable synthetic databases.
Полный backend CI, новый browser/phone acceptance и release certificate не выданы.
Исторические receipts не заменяли текущие результаты.

Из backend checkout: `node scripts/completed-receipt-authority-mutations.mjs`
с новым абсолютным output path; затем
`node scripts/branch-booking-selector-proof.mjs --run --ordinary --output=...`.
Runner создаёт свою PG; никакие реальные ключи не нужны.

Следующая незавершённая реальная приёмка — ответ AChat о последнем визите после
planner correction. Сохранённые ключи готовы для существующего broker path,
но их наличие не продлевает истёкшее разрешение на модель/CRM. Реальные
create/move/cancel требуют отдельно согласованного конечного сценария.

Агрегаты и точные hashes исходных receipts: [summary.json](summary.json),
[counterfactuals.json](counterfactuals.json), [receipt-manifest.json](receipt-manifest.json).
