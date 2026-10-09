# MAYA — отзывы за календарный месяц через существующий C9

Локальный путь завершён: явный запрос → проверенный месяц и филиал → уточнение оценки при необходимости → один зарегистрированный `reviews.list.read` → ответ с источником и сохранённым C9 evidence. **843 component tests / 15 suites, TypeScript, ESLint и actual HTTP/process/PostgreSQL restart PASS.** Product commit: `693298531e2447331f52feb05576576234790f5e`; успешный HTTP source: **`95449003f21b3ec514220c32b3ae51b47b0ab38f`**.

Исходная точка работы — **`b81ac624cd8b359bbebc6d809f530e1ed978e360`**. Это отдельный development checkpoint, без общей MAYA/C10 acceptance. [Повтор исходных 81 сценария](MAYA-OFFLINE48-AFTER-REVIEWS-20261009.md) сохраняет 57 PASS и remaining24; два старых одноходовых запроса отзывов не объявлены закрытыми.

## Полезное поведение

«Покажи плохие отзывы за прошлый месяц в филиале Набережная» возвращает уточнение: «За 2026-09 показать все оценки или отзывы с одной оценкой — 1, 2, 3, 4 или 5?» Следующий ход «Только с оценкой 2» сохраняет месяц и филиал и выполняет одно чтение. Это наблюдалось через HTTP с actual parser и scripted planner; качество реальной модели этим не установлено.

Источник — существующий локальный `BusinessReview`, доступ — `MeasurementReadService.reviewScope`. CRM/StaffSchedule не используются как разрешение читать отзывы. Поддержаны завершённый прошлый месяц и явный `YYYY-MM`, точная оценка 1–5 либо явное `all_ratings`. Запрос содержит полуинтервал `[from, toExclusive)` в текущем часовом поясе выбранного филиала или бизнеса. Незавершённый/будущий месяц, неоднозначный/чужой филиал, неизвестная оценка и неподдерживаемый фильтр сотрудника не превращаются в расширенную выборку.

Новая проекция содержит только дату, оценку и разрешённые обезличенные темы. Исходный текст, контакты, имена и идентификаторы клиентов модели не передаются. `limit + 1` определяет `has_more`; ответ не обещает полноту внешних отзывов. Пустой результат означает пустую выполненную выборку; недоступность источника не представляется нулём или отсутствием настройки.

Текущие membership/tenant/branch/timezone проверяются перед выдачей и при replay. Заключительная проекция владельца читается после awaited feature-check; это не заявление SQL serializability. Свидетельство области чтения входит в существующий input hash; нового хранилища, CRM revision или права из presentation нет. Подтверждённый ответ требует C9 `COMPLETED`. Сохранённый ответ помечается как сохранённый, с исходным временем наблюдения. Сохраняется только конечный серверный вопрос об оценке в существующем semantic context; права из предыдущего хода не переносятся.

## Выполненные проверки

- **R4 prepare/restart/resume:** 828 + 115 assertions PASS. 23 chat requests: 20 HTTP 201, два 403 и один 401. Отдельно два прямых READ API запроса CLIENT/STAFF получили `403 ai_tool_forbidden`. Обе роли в чате фактически отклонены сервером до модели.
- **20 scripted planner calls**, не более одного на ход; **9 вызовов владельца `listReviews`**, включая одну явную инъекцию недоступности и два результата, скрытых после изменения timezone/access. Это число вызовов владельца, не SQL-запросов. Каждый подтверждённый запрос связан с одним settled C9 READ.
- **34 синтетических факта** приняты существующим HTTP ingest owner до baseline. Проверены границы месяца в `Pacific/Kiritimati` при tenant `Pacific/Honolulu`, исключение соседнего месяца/другого филиала, exact rating и ограниченная выборка всех оценок. Leap February, Berlin DST и смена года дополнительно проверены компонентно.
- Два уточнения имеют точный сохранённый completion/context: tenant, parent turn, immutable completion revision, месяц, филиал и серверный вопрос. Rating-only продолжение прошло через actual HTTP. Replay до и после нового процесса и рестарта PG сохранил run/evidence и не вызвал нового чтения реестра.
- Изменение timezone во время чтения и перед cached replay блокирует старые факты; отзыв membership во время чтения даёт 403, следующий запрос — 401. Foreign tenant не получает историю или чужой run.
- Наблюдаемые business families и снимки не изменились после fixture setup. Внешних provider/model запросов и outbound в пределах proof нет; это не OS-egress census. Схема, retention, website, pricing mutations, frozen9/handoff и background authority не менялись.

Все **1861 source SHA256** каждого HTTP attempt сверены с exact Git. У всех четырёх собственных кластеров `pg_ctl status = 3`, PID-файлы отсутствуют. R4 source digest: `87096f758c2b019b563daf8022638dea22cdae7d8d3a21b86dc411a09be04423`; manifest SHA256: `94e32efe1d0fc9ec00c2b56defe18aea147ca5c411373c38a3b118f4f45ed40d`.

R1/R2/R3 сохранены как FAIL: ошибочное ожидание мутации исходного parser plan, неверная формула immutable reply ID и ожидание scripted denial вместо фактического server denial. Исправлялся probe; product после `69329853` не менялся. Первый component run также сохранён: тесты были зелёными, ошибки типов/lint исправлены до успешного повторного gate.

[R4 observations](evidence/maya-reviews-calendar-http-20261009/r4/prepare-observations.json), [restart observations](evidence/maya-reviews-calendar-http-20261009/r4/resume-observations.json), [source/cleanup verification](evidence/maya-reviews-calendar-http-20261009/r4/source-and-cleanup-verification.json), [independent source review](evidence/maya-reviews-calendar-http-20261009/maya-reviews-period-independent-source-review-20261009.json), [archive manifest](evidence/maya-reviews-calendar-http-20261009/archive-manifest.json).

HTTP/auth/C9/PG и локальный query owner настоящие; planner и входные факты синтетические. Реальный YCLIENTS, real model, React, multi-company binding и общая MAYA/C10 readiness — **NOT_ISSUED**. Ничего не опубликовано, не отправлено, не слито и не развёрнуто.
