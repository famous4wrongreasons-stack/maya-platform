# MAYA — завершение отзывов после уточнения оценки

Два запроса отзывов доведены до ответа в **отдельных HTTP-цепочках**: исходная фраза → существенное уточнение → явная оценка 2 → один существующий C9 READ → факты и сохранённое evidence. Отдельный вариант 062 продолжает незавершённое уточнение после настоящего перезапуска приложения и PostgreSQL. **137 локальных тестов, TypeScript, lint; HTTP prepare 1164 + resume 433 assertions PASS.** Проверенный source: `586c71779eb3743a318436e5316811375b3204af`.

Новый прогон исходных 81 ходов: **57 PASS, 0 semantic FAIL, 12 unsupported, 10 insufficient evidence, 2 clarification pending**. Все прежние 57 PASS сохранены. В исходном корпусе **22 других незакрытых хода + 2 вопроса без ответа = 24 unclosed**. Продолжения не дописаны в исходный корпус и не увеличивают его PASS. Exit 2, `completed-with-semantic-limitations`.

Исходная точка работы — `b81ac624cd8b359bbebc6d809f530e1ed978e360`; предыдущий checkpoint — `34f3b60864d1ee9ffd05ee8d9078d0c93fe68c8d`. [Старые 2 FAIL](MAYA-OFFLINE48-AFTER-REVIEWS-20261009.md) и их raw evidence сохранены без изменений. Новые изменения относятся к доказательствам и оценщику; production runtime не изменён относительно [календарного среза отзывов](MAYA-REVIEWS-CALENDAR-HTTP-CHECKPOINT-20261009.md), product commit `693298531e2447331f52feb05576576234790f5e`.

## Почему нужен вопрос об оценке

`BusinessReview.rating` — переданная источником целочисленная оценка 1–5, отдельно от текста. Это закрепляют [DTO](../../maya-saas-backend/src/business-content/dto/business-review.dto.ts), [DB constraint](../../maya-saas-backend/prisma/migrations/20260814190000_business_content_registry/migration.sql) и [утверждённый B34 contract](CYCLE-06-BLOCKING-PACKAGE-5-B34-REVIEW-AUTHORITY-CONTRACT-DECISION.md). Ingest передаёт оценку без вычисления. `analyzeReviews` считает распределение оценок и частоты тем; тема `result` включает и «доволен», и «испортили», поэтому не доказывает тональность. CI-тест с `rating:low` проверяет маршрутизацию, без числового преобразования.

В проверенных canonical sources не найден утверждённый порог «плохих» отзывов или работающий классификатор тональности. Нельзя самовольно выбрать 1–2, 1–3 или оценивать текст моделью. Для существующего числового READ корректен вопрос: «За 2026-09 показать все оценки или отзывы с одной оценкой — 1, 2, 3, 4 или 5?» Он остаётся промежуточным состоянием. [Семантика и SHA256 семи источников](evidence/maya-review-clarification-completion-20261009/maya-review-rating-source-semantics-20261009.json).

## Что доказано через HTTP и перезапуск

- Exact original 062 ADMINISTRATOR и 067 OWNER начинают без rating и без филиала: вопрос сохраняет tenant-level месяц, не вызывает READ/C9 и не подставляет branch. Новое «Только с оценкой 2» даёт одно чтение реестра, C9 `COMPLETED` и фактический ответ. В синтетическом tenant `Pacific/Honolulu` получено шесть отзывов, показаны первые пять с явной оговоркой. Месяц и timezone входят в ответ и evidence.
- История обоих диалогов и точные неизменяемые completion revisions переживают restart. Повтор completed request возвращает тот же run/source receipt без нового чтения.
- Отдельный вариант **того же 062**, не третий уникальный запрос: pending до restart → новое numeric-only сообщение после restart → одно свежее чтение за прежний месяц → повтор с нулём дополнительных чтений. Сохранённый context hash совпадает; граф C9 меняется только при новом законном READ.
- Перезапуск выполнен в пределах одного календарного месяца. Продолжение через естественную смену месяца этим HTTP-прогоном не квалифицировано.
- Сохранены прежние branch-local проверки: выбранный филиал и месяц после уточнения оценки, полные/пустые/недоступные выборки, границы месяца, ограничение размера. Foreign tenant/branch, неоднозначный филиал, restricted membership, CLIENT/STAFF, отзыв прав, изменение timezone во время чтения и при replay не раскрывают старые факты.
- Всего 32 chat requests: 29 HTTP 201, два 403, один 401; отдельно два direct READ отказа CLIENT/STAFF. 29 scripted planner calls, 12 вызовов владельца `listReviews` (не SQL count): девять выданных свежих результатов, одна инъекция недоступности, два результата удержаны после изменения доступа/timezone. Пять повторов используют сохранённое evidence без owner READ.
- 38 синтетических review facts внесены существующим HTTP ingest owner до baseline. Business families после setup не изменились; неожиданных вызовов нет. Это границы наблюдаемого proof, не OS-egress census.

[Prepare observations](evidence/maya-review-clarification-completion-20261009/http/r1/prepare-observations.json), [resume observations](evidence/maya-review-clarification-completion-20261009/http/r1/resume-observations.json), [1862 exact Git source hashes и cleanup](evidence/maya-review-clarification-completion-20261009/http/r1/source-and-cleanup-verification.json). Source digest: `9dcb040e3a09eef0868fe94646ed8911eb38680a2f1b4199a908b1194120504f`. Manifest SHA256: `8c62a89729702bbeb98fb857a00a277e24b2846e8e03aec41b60165029345032`.

## Версия оценщика и исходные 81 хода

`maya.offline48.turn-assessment/2` и `maya.offline48.contract-score/2` вводят `clarification_pending`, `goalCompleted:false`, `AWAITING_RATING_CHOICE`. Условия конечные: только exact 062/067 first turn, разрешённая singleton review task, текущий civil month/timezone, точный серверный вопрос, отсутствующая/неоднозначная оценка, ноль READ/C9/actions/approvals/effects. Дополнительно наблюдается настоящая сохранённая Timeline completion: текущий C9 principal hash, parent, immutable reply ID, context/reply hashes. Это test observation, не новый владелец данных и не разрешение из presentation.

Нет сохранённого свидетельства — insufficient evidence. Противоречие или побочный эффект — FAIL. Старые raw artifacts не получают новый статус автоматически. Опциональная архивная переоценка должна создавать отдельный явно маркированный artifact. Typed declaration синхронизирована с v2. Expectation SHA, original corpus, scripted model и source fixtures не изменены.

Actual full81: 80 HTTP 201 + ожидаемый 401, critical safety 0 failed / 0 missing. Все **2533 source hashes** сверены с exact Git; исходники неизменны во время запуска. Score SHA256 `1f356033af104806774b1ef5b3134ba2ca4f1ac5f04e6d3109f4d9ef9c9488b2`; manifest SHA256 `7d40d7658a7653ca30ff08afbbc65eaf0a02d59cd3d6c8bc1cafd2120bfa453a`.

Ранний JSONL ожидаемого 401 записан до вычисления финальных `expectedRefusal/historyUnchanged`; эти поля сверяются с отдельным refusal evidence. Байтовая идентичность ранней и финальной audit-проекций не заявляется.

[Score v2](evidence/maya-review-clarification-completion-20261009/full81/r1/semantic-score.json), [exact clarification observations](evidence/maya-review-clarification-completion-20261009/full81/r1/offline-review-clarification-receipts.jsonl), [source/delta/cleanup](evidence/maya-review-clarification-completion-20261009/full81/r1/source-and-delta-verification.json). Оба собственных PG-кластера остановлены (`pg_ctl status=3`, PID отсутствует); broker и шесть process groups full81 закрыты.

Первый локальный gate сохранён как FAIL: 132/133, отсутствующий civil anchor ошибочно превращался в противоречие; также TypeScript/lint выявили неявный `any` в probe. Исправлены независимые проверки отсутствующих/повреждённых данных и типизация. Повтор — 137/137, types/lint PASS. Это не скрытый повтор HTTP: оба новых HTTP runs успешны с первой попытки.

## Следующий безопасный срез и пределы

Выбран **journal clarification с сохранением точной даты**. Existing `employee-journal-read.ts` вычисляет branch-local дату до catalog, но сохраняет absolute period только после успешного чтения; при неоднозначном сотруднике относительный `tomorrow` может остаться в контексте. Restore fence проверяет `date/date_or_period`, но не `period`. Это source-level counterexample, ещё не воспроизведённый HTTP-дефект. Следующий шаг: RED через полночь, минимальный existing-owner fix, fresh catalog/StaffScheduleSource/ACL на продолжении и отдельный HTTP/PG proof. Нельзя выбирать одного из двух Саш по наличию provider-link. Два исходных journal результата автоматически не переклассифицированы.

Реальный HTTP/auth/C9/PG и query owner; scripted planner и синтетические факты. Real model, live YCLIENTS, browser, multi-company binding и общая MAYA/C10 acceptance — **NOT_ISSUED**. Нет business mutation/outbound, новой схемы, retention/autonomy решения, фонового события или второго orchestrator. Рабочий сайт, production, Keychain, paid/provider calls, pricing lane и frozen9/handoff не менялись; push/merge/deploy не выполнялись.

[Независимый source review](evidence/maya-review-clarification-completion-20261009/maya-reviews-clarification-independent-source-review-20261009.json), [независимый evidence review](evidence/maya-review-clarification-completion-20261009/maya-reviews-clarification-independent-evidence-review-20261009.json), [archive manifest](evidence/maya-review-clarification-completion-20261009/archive-manifest.json).
