# MAYA — два запроса адреса выбранного филиала

Две точные исходные фразы 037/041 прошли **отдельный supplemental HTTP proof**: CLIENT → явно извлечённый scripted branch → действующая синтетическая company↔branch связь → один существующий C9 READ → адрес из публичного профиля выбранной CRM company. История и точные receipts переживают перезапуск приложения и PostgreSQL; повтор не добавляет чтений. Без binding, при несовпадении company или изменении источника старый адрес не выдаётся.

**19 component tests + 4 driver tests, scoped TypeScript и lint PASS; actual HTTP prepare 1392 + resume 508 assertions PASS.** Source: `73f29d3c7721fc7dd328ff97055704fda4835aa9`. Изменены только существующий probe и dataset binding его driver; production runtime не менялся.

Полные SHA предыдущих checkpoints:

- Журнал: **`b25edb2f9914721b8862a371aaa49a7c48d09991`**, [отчёт](MAYA-JOURNAL-CALENDAR-CONTINUATION-20261009.md). Product source журнала: `bad0a002e286d78fd9e1332cee3b666380cb203a`.
- Предыдущий original81/reviews: **`ca70076b35afc4aaa299b8bfe9bb34f2954c7723`**, [отчёт](MAYA-REVIEW-CLARIFICATION-COMPLETION-20261009.md).

## Знаменатель 81 не изменён

Исходный frozen corpus, его scripted model, fixtures, expectations, evaluator и старые raw results не менялись. Исходные 81 хода не перезапускались и не переоценивались: **57 PASS / 0 semantic FAIL / 12 unsupported / 10 insufficient evidence / 2 clarification pending**. Остаются **22 других незакрытых хода + 2 уточнения без ответа**.

В исходной диагностике `core-full-offline-model.mjs` выдаёт для 037/041 `entities:{}`, а booking fixture не устанавливает company↔branch binding. Поэтому scoped public-company interceptor там не получает необходимые данные. Новый proof явно задаёт `{branch:'основной филиал',field:'address'}` через настоящий planner validator и отдельно создаёт действующую синтетическую связь. Это доказывает условный путь данных при корректном semantic extraction. **Понимание исходной фразы живой моделью не подтверждено**; исправленные предпосылки не превращают прежние insufficient результаты в PASS.

Проверены две формулировки одной family `historical-single:company.public_info:3`, обе CLIENT. Полный исходный dataset SHA256 `9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b` и exact text/role/family/sourceRowSha сверяются до запуска и входят в Git source bindings. Это не две новые capability и не две независимые семьи.

## Проверенный путь

Каждый первоначальный supplemental запрос создаёт один `COMPLETED` C9 run и один `SETTLED TOOL_READ catalog.staff.read`. Проверены canonical receipt contract, capability, execution ID, input hash, completedAt и work-result hash. `tools_used.execution_id` совпадает с записью execution текущего tenant/actor. Расшифрованный результат содержит только `salon` и `public_scope` с exact branch ID, current sourceRevision, company ID и projection `company_profile`.

Адрес сверяется с независимо наблюдённым синтетическим native company GET, не только с текстом ответа. Parent principalProofHash совпадает с C9 authorityHash; текущая membership имеет CLIENT role. Сохраняются semantic task, encrypted completion, immutable ID и fingerprint. Имена клиентов, телефоны и private A22 guidance не добавляются в публичный ответ. Сохранены старые foreign-tenant, restricted-branch, CLIENT private-guidance, mid-read cutover и revocation controls.

Оба запроса и immediate replay идут в одном клиентском диалоге. История API показывает последнюю сохранённую completion с обозначением replay; initial immutable completion отдельно проверяется по exact ID. После restart история восстанавливается, оба same-key повтора возвращают те же run/work/execution/source hashes с нулём native GET. По два отдельных negative запроса без binding и с несовпадающей company дают blocked до native READ, без новых C9 receipts или AiToolExecution и без fallback к tenant branding. После sourceRevision drift оба same-key повтора не выдают прежние факты и не переписывают старый result.

Всего, включая сохранённые старые controls: **35 chat requests — 32×201, 2×403, 1×401; 34 scripted planner calls; 12 synthetic native GET**. Число GET не равно числу C9 READ. Observed business-family census после setup не изменился; неожиданных вызовов нет. Это ограниченное наблюдение, не OS-egress доказательство.

[Prepare](evidence/maya-public-branch-supplemental-20261009/http/r1/prepare-observations.json), [resume](evidence/maya-public-branch-supplemental-20261009/http/r1/resume-observations.json), [Git/cleanup verification](evidence/maya-public-branch-supplemental-20261009/http/r1/source-and-cleanup-verification.json). Все **1863** source bindings сверены с exact Git source; код во время proof не менялся. Собственный PG остановлен, `pg_ctl status=3`, PID отсутствует. Manifest SHA256: `0d7d79bc97420fc1dd7c7ef40cf9315f84b3a16fd426ab522020f8ccb4a422ef`.

Независимый review до HTTP обнаружил P2 в test helper: latest-three scan мог пропустить старую completion первого запроса после второго. Исправлен точный saved assistant ID для resume lookup; bounded scan и parent/text/hash checks сохранены. Оба local gates сохранены, actual HTTP прошёл с первой попытки. Это исправление доказательства, не production runtime.

## Следующий реальный missing link

Выбран первый запрос «кто не был больше двух месяцев» в `mt-retention_drill_down-0:1` / `-15:1`: текущий singleton Lifecycle переводит **любые** entities в generic clarification до C8 READ, даже когда уже опубликован current C8 signal по точному правилу `calendar_month:2`, `comparison:gt`. Existing C8 owner уже хранит и отдаёт точные параметры подтверждённой policy, а C9 владеет bounded selection, receipts и текущими authority/source/expiry fences.

Следующий конечный development slice: сопоставить явно запрошенный порог с уже действующей C8 policy через существующих owners. Constraint должен входить в existing request/receipt hash; несовпадающее правило, branch/service scope, недостаточное покрытие, stale policy/result и отзыв прав должны давать честное уточнение или unavailable. Нельзя заменять два календарных месяца на 60 дней, создавать policy из чата, менять asOf, раскрывать PII или представлять три selected signals как полный список клиентов. Старый unconstrained путь и replay сохраняются. Это ещё **не реализовано** и не закрывает исходные ходы.

Для этой конечной интеграции не нужны платная модель, live provider или новая policy. Однако baseline публикует правило 30 дней с PARTIAL coverage и пустыми ranking objectives. Оно не доказывает запрос о двух месяцах. Прежняя регулярность, приоритет возврата, конкретные имена клиентов и полнота популяции остаются за пределами такого READ; их нельзя получить подменой fixture или новым порогом без подходящей утверждённой семантики и источника. [Source-level выбор следующего среза](evidence/maya-public-branch-supplemental-20261009/maya-next-real-gap-after-public-20261009.md).

Следовательно, оставшаяся работа **не сводится исключительно к живой модели или решению владельца**. Есть локальная интеграционная работа с existing C8/C9. Одновременно confirmed cash/profit требует пригодного источника: нынешний C7 emits NOT_MEASURED; booked/provider turnover его не заменяет. Tenant inventory registry не имеет branch relation; заполнение tenant rows не доказывает остатки выбранного филиала. Pricing остаётся отдельной lane. Эти ограничения не скрыты снижением знаменателя.

Live YCLIENTS/model, production branch binding, browser, общая MAYA/C10 acceptance — **NOT_ISSUED**. Нет paid frozen9, ввода ключа, внешних provider/model calls, CRM business mutations, outbound, schema/retention/autonomy изменений, website/phone, push/merge/deploy. Frozen9 и handoff сохранены.

[Независимый source review](evidence/maya-public-branch-supplemental-20261009/maya-public-branch-supplemental-independent-source-review-20261009.json), [независимый evidence review](evidence/maya-public-branch-supplemental-20261009/maya-public-branch-supplemental-independent-evidence-review-20261009.json), [архив](evidence/maya-public-branch-supplemental-20261009/archive-manifest.json).
