# MAYA development runtime checkpoint — 2026-10-06

Последующий [локальный release qualification checkpoint](MAYA-DEVELOPMENT-RELEASE-QUALIFICATION-20261006.md)
содержит свежий AR-1 rehearsal, проверенные HTTP/BIN claims и доказанный FK semantic blocker.
Runtime и исходные evidence этого checkpoint сохранены.

**Полезный результат:** в текущем React AChat один сохранённый диалог проходит обычный ответ → явный запрос «Проверь окна после отмен» → объяснение актуального окна с evidence и сохранённой версией C9 → отдельное подтверждение цены → корректный отказ недоступному редактору расписания. Occupancy не пишет бизнес-сущности и не отправляет сообщения. Цена меняется ровно один раз в synthetic CRM после отдельного явного подтверждения через существующий AE.

Это квалифицированный development checkpoint. **C10 complete, real-model/provider acceptance и release certificate не заявлены.**

## Source и границы

- Frozen runtime source: `be7a4a5f08fe34369c11d548741724bae13a2618`, ветка `codex/maya-development-integration-20261006`.
- Исходный read-only HEAD повторно проверен: `c6a35e5c61975e9d101326e7b3970331f3c905d8`. Occupancy `f9976ab6`, pricing `4c8141e0`, schedule `7b9d0ff5` остались на прежних HEAD с чистыми worktree.
- Один C9, существующие CRM/C5 Opportunity readers и AE. Live CRM не маскируется под C7 revision. Presentation не выдаёт authority. Второй orchestrator, agent v2 и background initiator не добавлены.
- Схема и migrations относительно исходного HEAD не менялись. Website/real-booking source не редактировались. Production, live YCLIENTS, реальная модель, HTTPS, телефон, push/merge/deploy не использовались для исполнения этого slice.
- Начальный Occupancy slice ограничен явным owner web request. Branch-scoped actor не получает расширения полномочий; именованные даты/филиалы/сотрудники и составные запросы требуют уточнения. Отсутствие данных не превращается в вывод об отсутствии окон.

## Что исправили runtime gates

1. PostgreSQL `to_jsonb(timestamp without time zone)` отдаёт UTC без суффикса. C9 теперь нормализует эту DB-границу, сохраняя отказ истёкшему/некорректному сроку и запрет расширять `validUntil`. Регрессия отдельно запущена с `TZ=Europe/Moscow`.
2. Pricing adapter читает current turn identity через `TimelineStore`. Durable audit proof проходит через существующий approval port и `UserTurnAuditPort`, с исходной транзакцией bind, exactly-one и закрытым набором полей. Gate 9 не ослаблен.
3. AE самостоятельно валидирует свой exact price input и больше не импортирует CRM-контракт. Сохранены прежние ограничения ID/суммы и единственный dispatch.
4. Полная recipe inventory включает general, booking, pricing и schedule. Existing generator связывает её с точным profile snapshot. Профиль `closed-input.no-handoff@1` отказывает всему `SETTINGS_DRAFT`, включая пустые/all-NONE карточки. Обязательный SETTINGS.4 editor не удалён и HANDOFF не разрешён.
5. C9 release fence различает scheduler и единственный request-local deadline: AST допускает только literal 6000 ms, `reject(new Error(...))`, `Promise.race` и очистку в `finally`. Пять counterfactuals закрывают расширение бюджета, initiator callback, `newError(...)`, потерю cleanup и перенос в constructor. Автономия не разрешена.
6. Сверены точные текущие catalogue counts/hash и generated confirmation source binding; историческая evidence не перекрашена в V1.4 acceptance.

## Проверки

| Gate | Результат и предел |
| --- | --- |
| Полный backend census на frozen source | 615 suites / 6184 PASS; unfiltered, one worker, memory recycling |
| e2e | 1 suite / 1 PASS |
| TypeScript backend/scripts/widgets-live и отдельный generated contract | PASS; финальные затронутые типы перепроверены |
| Backend build + preflight | PASS |
| Lint | полный прогон: 0 errors, 11 warnings; последующие изменённые runtime/test файлы: PASS |
| Registry/generators/K3 | PASS; K3 10/10; contract structural 31/31 с прежними 4 pending later-package obligations |
| Shell | 505 PASS, 9 SKIP; typecheck/self-test/build PASS |
| React | 93 PASS; release tests 18 PASS; web/Capacitor payload build/verify PASS; nativeVerified=false |
| Event PostgreSQL | 4 PASS, включая usable transaction после duplicate event и counterfactual |
| Actual HTTP/auth/AE/C9 cohort | 7 suites / 64 PASS на frozen source |
| Combined mounted React | PASS: 9 checkpoints, одна conversation, подтверждённая цена, отказ editor, history, offline/retry identity, revocation |
| C9 two-process + PG restart | PASS: прежние run/version сохранены, исторический ответ не выдаётся за свежую проверку, новый occupied/expired outcome и foreign/revoked refusals |
| Отдельный C9 mounted browser | PASS: available/history/offline/reconnected/revoked/expired; modelCalls=0, businessWrites=0 |
| Built-binary HTTP smoke | PASS: own seeded synthetic DB, internal booking/journal/analytics/loyalty/auth/tenant fence; no live provider acceptance |

Source/outcome units проверяют пустую/неполную выборку, закрытое/истёкшее/занятое/устаревшее окно, отказ CRM, отменённый run и ограниченный timeout без повтора provider read. HTTP/restart/browser evidence отдельно подтверждает свежий и исторический ответ, occupied/expired, replay identity, foreign tenant и revocation. Эти уровни доказательства не смешиваются с real-provider acceptance.

Actual HTTP использует настоящий AppModule/auth, C9/AE, timeline и release owners на собственном PG. Только model и CRM edges synthetic; общий текст/price intent scripted, Occupancy deterministic. Browser проходит реальный email UI с local debug delivery, без token injection/response fixtures; egress ограничен loopback. Состояние бизнес-таблиц, raw/model writes и adapter counters проверяются на checkpoint-границах. В combined fixture только явно подтверждённая synthetic price action допускается как исключение: одна capability, `SUCCEEDED`, attempt=1. Отдельный existing schedule suite проверяет явный synthetic schedule commit в подходящем full scope. Исходные synthetic grants не являются сертификатом кандидата.

## Сохранённые неуспешные попытки

- Первая HTTP-когорта выявила timezone validity bug. Следующая попытка уточнила канонический foreign-run отказ `400 c9_run_authority`; финальная когорта зелёная.
- Первый browser harness ожидал неверную фразу успеха; текущий React показывает canonical receipt «Цена подтверждена в YCLIENTS». Исправлен harness, actual UI/receipt authority не подменены.
- Первый полный census на `ac324e4c`: 599/614 suites и 6147/6167 tests PASS; 20 отказов в 15 suites сохранены. Их исправления и затронутые owners прошли 21 suite / 514 tests; последний AST counterfactual дополнительно перепроверен.
- Первый final census завершился без aggregate JSON после 394 PASS lines, без FAIL lines. Это **INCOMPLETE, не PASS**; причина не установлена. Повтор использует ту же полную выборку, ровно один worker с `workerIdleMemoryLimit=768MB`; исходники/выборка тестов не менялись.
- Ошибки prerequisites/invocation (private `.bin` links, manifest/build order, первоначальный lint heap, ts-node preload) также сохранены с последующими успешными повторами.

## Точные оставшиеся ограничения

1. **Schema drift остаётся RED и блокирует общий release qualification.** В исходных migrations три FK используют `ON DELETE NO ACTION`, а Prisma schema требует `RESTRICT`: `PublicBookingSession(tenantId) → Tenant`, `PublicBookingQuote(sessionId,tenantId) → PublicBookingSession`, `PublicBookingAttempt(quoteId,sessionId,tenantId) → PublicBookingQuote`. Это другой website/public-booking lane; DDL не выполнялся, schema/migrations не исправлялись. Точный read-only diff сохранён в `schema-drift-exact.sql`.
2. Candidate profile digest: `7cd61f802cc7f021842a70f9bdd126108f50769543868d60bff950d2ccbf2122`, **certificate=NOT_ISSUED**. Fresh clause/mutation/signature packet не собран; полные mutation batteries и `run-all-checks.sh` с mutation стадиями не запускались после RED schema prerequisite. Synthetic fixture certificate не перенесён в governance evidence.
3. Schedule editor остаётся **NOT_USER_REACHABLE** в restricted no-HANDOFF profile. Exact owner alternative записан в [profile choice](MAYA-DEVELOPMENT-PROFILE-CHOICE-20261006.md), но не реализован. Нет ни неявного HANDOFF, ни fake второго human reviewer.
4. Это подготовка полезного C10 L0/L1/L2.5. Новые schema/retention/autonomy решения и фоновая власть не выводятся из этих тестов. C10 complete и реальная model/provider acceptance по контрактам не объявляются.

## Evidence и cleanup

[SHA-256 manifest](evidence/maya-development-integration-20261006/runtime-heavy/manifest.json) сохраняет исходные и архивные hashes, все существенные failures/reruns, команды, screenshots и redaction paths. Только synthetic authority tokens удалены из экспортируемых browser JSON; оригиналы остаются в `/tmp/maya-unified-gate-20261006`. Это review copies, не replayable authority.

[Independent engineering review](evidence/maya-development-integration-20261006/runtime-heavy/independent-review-final.txt) завершён без оставшихся блокирующих замечаний к коду. Это agent review, не human/governance certificate.

Собственный PG на `127.0.0.1:57463` остановлен; `pg_ctl status` вернул 3, `postmaster.pid` отсутствует. Оба отдельных C9 proof drivers также остановили свои кластеры. HTTP/Chrome children закрыты harness-ами. Данные proof сохранены в приватных `/tmp` каталогах; чужие процессы/кластеры не останавливались. Working tree содержит только этот source/evidence checkpoint; push/merge/deploy не выполнялись.
