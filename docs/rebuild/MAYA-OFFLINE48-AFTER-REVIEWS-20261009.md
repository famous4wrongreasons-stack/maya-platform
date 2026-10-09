# MAYA — исходные 48 диалогов после календарного чтения отзывов

На **`95449003f21b3ec514220c32b3ae51b47b0ab38f`** выполнены все **81 actual HTTP ход**: **57 PASS / 2 semantic FAIL / 12 unsupported / 10 insufficient**, critical 0/0. Все прежние 57 PASS сохранены. Из исходных **remaining24 закрыто 0; remaining24 сохраняется**. Общий результат — `completed-with-semantic-failures`, exit 2, без общей acceptance.

Baseline checkpoint: **`b81ac624cd8b359bbebc6d809f530e1ed978e360`**; его предыдущий actual run был на `9a54eb4a489ba61f80fabc793d28ba4aabbd9737` с 57/0/14/10. Корпус, реплики, scripted planner, evaluator и fixtures этого повторного прогона не менялись.

## Почему изменились два статуса

| Исходный ход | Было → стало | Фактическое поведение |
|---|---|---|
| `utt-reviews.list_recent-062:1` | unsupported → semantic FAIL | Уточнение оценки за `2026-09`, без READ |
| `utt-reviews.list_recent-067:1` | unsupported → semantic FAIL | То же поведение для второго исходного запроса |

Оба одноходовых запроса говорят «плохие отзывы за прошлый месяц», не указывая филиал. Scripted plan содержит `period:last_month`, но не содержит rating. Новый путь возвращает конечный вопрос об оценке и сохраняет календарный месяц. Он не назначает числовое значение слову «плохие» и не читает произвольные 90 дней.

Неизменённый evaluator требует `reviews.list.read` и literal `last_month`/описание прошлого месяца. Поэтому raw failures — `current_read_reviews_list_read` и `requested_registry_scope_retained`, missing evidence — `configured_registry_scope_evidence`. Эти статусы не переписаны и не заменены PASS. Два исходных хода остаются незакрытыми. [Отдельный HTTP/PG/restart proof](MAYA-REVIEWS-CALENDAR-HTTP-CHECKPOINT-20261009.md) подтверждает полезное продолжение после ответа пользователя с оценкой; оно не добавляется задним числом в frozen corpus.

## Доказательства и ограничения

Все 81 actual HTTP попытки завершены: 80 HTTP 201 и один ожидаемый revoked 401. Все **2533 source SHA256** сверены с exact Git; source/HEAD во время выполнения не менялись. Score SHA256: `530a06b0bc22af8772ca45544a87e74badb4b8db3f06e0e3b10d74a0f487ae37`. Candidate manifest SHA256: `70288e9beb8e57761e103baa60298c4bd0bba4ecf6a1feb3e58c5c41c8c9a1ca`.

Собственные PG и broker остановлены: независимый `pg_ctl status = 3`, PID-файл, broker PID и все шесть command groups отсутствуют. Ограничения: один Jest worker, Node heap 1536 MB, broker 64 MB, PG shared buffers 64 MB.

Existing generic phone sanitizer в этом запуске повредил одно opaque `source_hash` в `utt-services.price-067:1`. Raw audit не исправлялся; точный employee-service hash дополнительно присутствует в ранее реализованных scoped receipts. Это не новое исправление общего sanitizer. Ранняя raw запись expected 401 и final audit имеют разные стадии проекции; byte-identical equivalence между ними не заявляется.

[Raw score](evidence/maya-offline48-after-reviews-20261009/r1/semantic-score.json), [source/delta verification](evidence/maya-offline48-after-reviews-20261009/r1/source-and-delta-verification.json), [remaining24](evidence/maya-offline48-after-reviews-20261009/r1/remaining24-after-reviews.json), [cleanup](evidence/maya-offline48-after-reviews-20261009/r1/independent-cleanup.json), [independent evidence review](evidence/maya-offline48-after-reviews-20261009/maya-reviews-period-independent-evidence-review-20261009.json), [archive manifest](evidence/maya-offline48-after-reviews-20261009/archive-manifest.json).

Оставшиеся зависимости: finance/C7 — 6 I; неоднозначный journal — 2 I; public branch semantic/source/oracle — 2 I; retention — 6 U; отдельная price lane — 2 U; BI без денежных данных — 1 U; profit без подтверждённой базы — 1 U; inventory без branch/store attribution — 2 U; исходные отзывы, требующие уточнения оценки, — 2 F. Для следующих verdict нужны соответствующие факты текущего владельца или явно версионированная проверка требуемого диалога. Порог оценок и недостающие денежные/складские данные не придуманы.

Это scripted/synthetic qualification настоящего HTTP/auth/C9/PG. Общий прогон не проверяет real model/provider, React или restart; restart отзывов квалифицирован отдельно. Website, pricing mutations, frozen9/handoff, schema/retention и background C10 не менялись. Общая MAYA/C10 acceptance — **NOT_ISSUED**.
