# Same-DB read resume — checkpoint 2026-10-10

На candidate `c2079dd5b20de32995c8baa0a293547391cd5d33` подтверждены два отдельных этапа:

1. Настоящий current React → HTTP → PostgreSQL сценарий регистрации: 9 checkpoints, 5 входов по паролю и точный `409 trial_signup_slug_taken`. Коллизия не создала повторный бизнес, пользователя, филиал или membership; появилась только одна pending activation. В 17 проверяемых таблицах доменных эффектов осталось 0 строк.
2. Реальное восстановление той же **синтетической** БД через существующий diagnostic read profile: новый PG start при прежнем system identity, прежние каталоги и ключи, неизменные canonical rows и authentication state. Backend и relay отвечали health `200`, auth `403`. Runtime сообщил `calls: 0`, `refused: 0` и штатно остановился.

Actual collision проверил ошибку поля, фокус, новое согласие и отсутствие автоматического повтора. Третий бизнес с исправленным именем не отправлялся; явная исправленная отправка отдельно покрыта component/headless tests.

Второй этап допускает только health. Сохранённые password/session/refresh данные не являются доказательством успешного входа после restart. БД и ключи владельца не читались; его runtime не запускался. Реальная YCLIENTS-интеграция и новое окно токенов остаются отдельным следующим шагом.

- [Actual UI/HTTP/PG](actual-ui-attempt02.passed.json): реальные canonical counts, запреты маршрутов, 5 входов и cleanup браузера.
- [Проверка той же БД](same-db-readonly-verification.json): safe booleans сравнения snapshot/verify, counts, health/auth refusals; исходные приватные агрегаты не включены.
- [Завершённый stage 0 restart](stage0-restart.stopped.json): собственный PG остановлен, source и private state неизменны.
- [Завершённый diagnostic resume](diagnostic-resume-attempt03.passed.json): ready → stopped, без first failure или cleanup failures, provider calls/refusals 0.
- [Source-only переход owner runtime](owner-source-transition.source-only.json): от `03875b2` к candidate сохранены paths и 117 canonical Prisma/migration files. Это не actual owner-state preflight или запуск.
- [Независимый source review](source-review.json) и [точные source bindings](source-bindings.json): 13 reviewed paths и 3 proof paths сверены с Git blobs/SHA-256 candidate; 9 unchanged boundaries также совпадают с базой review.
- [Независимый actual review](independent-actual-review.json): `QUALIFIED_SYNTHETIC_ACTUAL_PASS`, blockers отсутствуют; reviewer сверил 2029 уникальных source paths и сохранённые failed attempts.
- [Машиночитаемый итог](summary.json).

Предыдущие неудачи сохранены отдельно: [browser startup attempt 01](actual-ui-attempt01.failed.json) и [diagnostic child boot attempt 02](diagnostic-resume-attempt02.failed.json). Лишний внешний OS sandbox назван родителем возможным объяснением; причинная связь не установлена. Поздний успех не превращает эти attempts в PASS.

Это local development proof, не production/HTTPS, live-provider или model acceptance. Нулевые browser counters, закрытые маршруты и перечисленные таблицы не заменяют packet-level доказательство отсутствия любого outbound. Diagnostic использовал существующий профиль с закрытой сетью и публичную test constant, без ввода владельцем credentials.

Архив исключает PII, account/DB/system/private-state hashes, private state paths, ключи, пароли, session/auth bodies, скриншоты и raw logs. Сверены только предоставленные proof reports и исходники; архивация не запускала services, PG, браузер, тесты или сетевые запросы. [Предыдущий owner-registration checkpoint](../maya-owner-registration-20261010/README.md) сохраняет историческую фиксацию owner-сессии и прежних проверок; новый actual409 и synthetic resume привязаны отдельно.
