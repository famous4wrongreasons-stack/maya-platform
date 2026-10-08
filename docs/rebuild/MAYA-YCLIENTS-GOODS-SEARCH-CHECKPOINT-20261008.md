# MAYA — поиск товаров YCLIENTS по запросу владельца

Runtime: `245d3888f69b036fd28f4a31b6e87becf12bd264`; baseline `ef02f37ab7c47b9b10632b1dd86c0e08eb05e218`. Изолированная development ветка `codex/maya-development-integration-20261006`. `NOT_ISSUED`: не release и не завершение MAYA/C10.

## Полезная функция

Владелец может попросить найти товар по названию, артикулу или штрихкоду, не зная внутреннего ID. Существующий `AiCore → C9 TOOL_READ(inventory.goods.search) → CRM → native YclientsCRMAdapter` возвращает один серверный ответ с максимум 20 наблюдёнными совпадениями. Категории отделены от товаров. Первый товар не выбирается автоматически; следующий запрос точной карточки требует явного выбора ID. Поиск не выводит цены, остатки, скидки, полную численность каталога или отсутствие товара из ограниченного списка.

Новая projection `maya.goods-search.read/1` сохраняет company, query, as_of, bounded rows и limitations в существующих encrypted READ receipts/C9 run и chat timeline. Нет новой таблицы, retention policy, orchestrator, background trigger, action или outbound. Новый semantic intent `inventory.goods_search` использует product slot. Presentation завершает ход без второго model turn и не предоставляет authority.

## Источник и права

Проверенный ранее официальный OpenAPI capture: SHA256 `9ba4c2deca4197aeee333c95b4d641f19073ef91b40279b0fc83651bd502157b`. Используется один `GET /api/v1/goods/search/{company}?term=...&count=21`, без redirects, fallback URL и retry. 21-я строка проверяется полностью и служит только признаком возможного продолжения. Лимит 20 относится к сумме категорий и товаров. `meta.count` не считается общим числом совпадений: документация описывает счётчик категорий.

Документация противоречива: URL template использует `term/count`, metadata параметров — `search_term/max_count`. Выбран явный URL template без пробных альтернатив. Это квалифицированная offline реализация, **не доказательство реальной совместимости**.

Пустой/повреждённый query блокируется до GET. Принимаются только successful envelope, непротиворечивые item/category flags, точные положительные ID, ограниченные названия и уникальные пары kind/id; повреждённый ответ, лишние строки или provider error дают unavailable, а не пустой успех.

CRM повторно проверяет текущего tenant/actor, активность membership/user, owner role без branch scope, features, external source и integration revision после awaited search. READ dedupe/replay дополнительно проверяет те же права и revision после persistence lookup и после async presentation, без повторного GET. Новые полномочия для branch owner не добавляются.

Явный barcode/article берётся сервером из текущего user turn после выбора search tool. Phone-shaped barcode остаётся скрытым от модели; leading zeros сохраняются. Numeric barcode отделяется от пунктуации, quoted article сохраняет конечную точку. Неоднозначный или неполный code требует уточнения вместо model guess. Это узкое связывание предпочтения поиска, не универсальное распознавание ПД и не выбор товарной карточки.

## Проверки и evidence

- Финальный локальный gate: **663/663 tests, 13 suites PASS**, включая actual native adapter с synthetic fetch, actor/revision races, AiCore/C9 binding, registry и historical census. Browser request guard: **5/5 PASS**.
- Backend/live-fixture/contract TypeScript, scoped lint, contract checker **31 PASS + 4 ранее отложенных checks**, K3 PASS.
- Независимый review обнаружил и затем принял исправления cached revocation и barcode masking. Позитивный runtime test также обнаружил отсутствовавший registry validation case; он добавлен.
- RED v3 — три отрицательных контроля при временном отключении только final revalidator calls, с обязательным восстановлением исходника в finally. Это controlled guard omission, не утверждение о неизменном baseline commit. V1/V2 и промежуточные gate failures сохранены и не выдаются за самостоятельное подтверждение race.
- Registry census: TOOL 51→52, C9 60→61; AE 228 и POLICY 223 неизменны. Исторические 226/221/48/57 и hash assertions сохранены; search — отдельная точная пара TOOL/C9, без wildcard. Release profile не перегенерирован.

Actual HTTP/auth/PG/C9/current React: **1 scenario, 6 checkpoints PASS** — mixed matches, 21 categories → 20 displayed, empty source, unavailable, reload/re-login, revoked membership → 401. Четыре scripted model selections и четыре UI native GET создают три SETTLED/COMPLETED C9 результата; unavailable остаётся HELD_UNKNOWN/INCOMPLETE. Сохранённый точный полезный mixed reply проверен в DOM после reload; model/source/C9 счётчики не растут.

Отдельно: Client 403 до handler/source; владелец foreign tenant обращается только к своей company; source settings drift во время native GET даёт 409 без candidates. Всего **6 synthetic native GET**: foreign 1 + drift 1 + chat 4. Бизнес-снимок неизменен, business effects/ActionExecution/approval/provider writes/detail GET/outbound/real model/real provider — **0**, unexpected `[]`. Тестовые seeds и единственное declared settings drift/restoration не выдаются за бизнес-эффекты запроса.

Независимая финальная сверка: **29 local source hashes и 1 857 browser source hashes** совпали с Git `245d3888`; local 29 файлов точно совпадают с delta commit. Launcher/fence/supervisor и digest проверены; все 12 групп (8 local + 4 HTTP) закрыты, postmaster.pid отсутствует. Блокеров в этом ограниченном checkpoint не осталось.

Fresh loopback PG; heap 3072 MiB, один Jest worker, PG buffers64/work4/connections30. Все 4 owned process groups closed/absent, exit 0 без TERM/KILL; PG stopped. Candidate `245d3888`, source/harness hashes unchanged. HTTP run не менял runtime. Посмотрены mixed/unavailable/reload/revoked screenshots: mixed и unavailable читаемы, revoked показывает login. Reload PNG не отрисовал часть текста, хотя exact useful reply проверен DOM assertion; **не design/visual acceptance**.

[Archive manifest](evidence/maya-development-integration-20261006/goods-search-20261008/artifact-manifest.json), [local gates](evidence/maya-development-integration-20261006/goods-search-20261008/local-attempt6/report.json), [HTTP evidence](evidence/maya-development-integration-20261006/goods-search-20261008/browser-attempt1/goods-search-observations.json), [owned-run manifest](evidence/maya-development-integration-20261006/goods-search-20261008/browser-attempt1/manifest.json), [independent review](evidence/maya-development-integration-20261006/goods-search-20261008/independent-review.md).

Cosmetic harness limitation: final console label у скопированного launcher ещё говорит «client dossier»; executed command/env/test paths и JSON contracts — goods-search, они проверены. Исполненный launcher сохранён без post-run редактирования.

## Пределы и следующий блокер

Native adapter исполняется локально с конечным synthetic fetch; model selection scripted. Active integration rows — явные synthetic seeds, **не A17 lifecycle acceptance**. Browser проверяет поиск по названию; barcode binding и cached revocation race проверены unit suites. Reload не равен process/PG restart. Создание/изменение товаров, OCR, полный каталог и multi-company runtime не реализуются этим срезом.

Мультифилиальная миграция остаётся отдельным решением по [конкретному schema delta](MAYA-YCLIENTS-MULTI-COMPANY-SCHEMA-DELTA-20261008.md): один A17 credential owner/global disconnect, дочерние exact company↔branch sources и source-qualified staff access evidence. Текущий sync второй компании может отозвать доступ первой; legacy без доказанной company остаётся held. Альтернатива — сохранить singleton без миграции. Независимые подключения требуют другого A17 контракта и не предлагаются.

Рабочий сайт/real booking/production, живые YCLIENTS/model/SSH/phone не вызывались; push/merge/deploy не выполнялись. Фоновая автономия не добавлялась.
