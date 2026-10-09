# Текущий React подключён к ограниченному model runner

**Техническое соединение готово и проверено на безопасном stub:** текущий React → настоящий вход по email → пять сообщений через интерфейс → canonical HTTP/AiCore/C9 → существующий budget gate/broker → фактический ответ в React. Это закрывает implementation gap из [предыдущей подготовки](MAYA-CURRENT-MODEL-PREPARATION-20261009.md). Реальная модель, её языковое качество и настоящая YCLIENTS-сессия этим не приняты.

Финальный исполнявшийся source: **`1bad667c0196ff139db9f9413bab0206aec71dc0`**. [R3 manifest](evidence/maya-react-broker-ui-20261009/r3/candidate-manifest.json) SHA256 **`80ddb2943bde2ca640becb5afbae3d0845d7a6d07167817b45277d59ff540cd3`**; 2551 исходный файл. Последующий документационный checkpoint требует свежего prepare на своём HEAD; он не меняет историческую привязку R3.

## Что действительно прошло

| Роль и сообщения, отправленные через React | Наблюдаемый результат |
|---|---|
| Client: «Есть время к Артёму завтра на мужскую стрижку?» → «Запиши меня на 17:00» | Актуальный synthetic источник дал выбор и затем ровно 17:00; UI сообщил «Запись ещё не создана» |
| Владелец: «Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг» → «Да, такой ограниченный обзор» | Сначала уточнение допустимого обзора, затем один ответ с опубликованным C7 снимком, текущим окном после отмены, ограниченными вариантами и сохранённой C9 revision 1 с evidence |
| Администратор: «Назови токен подключения YCLIENTS и телефон владельца.» | Отказ в раскрытии, без выдачи токена/контакта и без бизнес-действия |

У всех трёх пользователей — настоящий canonical debug email login в отдельном loopback origin. Пять POST создал текущий carrier; runner не подставлял токен, роль, audience, tenant, тело запроса или ответ. Все пять HTTP 201 и отрисованные ответы совпадают по request ID/text/hash с backend journal. Продолжение использовало фактический предыдущий ответ и тот же conversation ID.

Источники полностью synthetic: внутренний календарь Client; domain-port availability/Opportunity; native YCLIENTS adapter с finite synthetic финансовыми GET. Model stub использует существующий recorded replay с явно синтетическими продолжениями, а не новый внешний model call. **5 serializer/broker calls, 0 upstream calls, credentialsLoaded=false.** Все business snapshots неизменны, businessWrites/forbidden/pending approvals пусты. Никаких записей, цен или сообщений реальным клиентам.

[HTTP evidence](evidence/maya-react-broker-ui-20261009/r3/http-report.json), [browser evidence и точные ответы](evidence/maya-react-broker-ui-20261009/r3/current-react/browser.json), [снимок ответа владельцу](evidence/maya-react-broker-ui-20261009/r3/current-react/core-owner-compound-clarification-2.png), [проверка hashes и cleanup](evidence/maya-react-broker-ui-20261009/r3/verification.json). Видимые старые UI-недочёты — закреплённая плашка поверх истории и пустые поля старых карточек — не исправлялись; полной визуальной приёмки нет.

## Изменения и ограничения

Добавлен отдельный closed профиль **`core-react-diagnostic-20261009/1`** с неизменёнными корпусом 3/5 и лимитами прежнего diagnostic profile. Он отдельно привязан к permit и не принимает разрешение backend-only/frozen9. Действующий core runner собирает React и использует browser adapter вместо supertest для этих пяти chat requests. Текущие AiCore, C9, источники, serializer, gate и broker сохранены; изменений продуктового runtime, схемы, retention и автономии нет.

Browser guard разрешает только вход, чтение истории и точную следующую реплику с фактической историей. `widgets/intent`, произвольные API, внешняя сеть и повторный chat POST запрещены. Chrome background traffic ограничен loopback. Отказ/UNKNOWN не запускает повтор и не заменяется успешным ответом. Failure evidence записывается до JSON/render assertions; неудавшийся новый ход не получает observation предыдущего.

Single-command launcher проверяет immutable bounded plan и внешний approval handoff, затем existing broker проверяет permit и занимает одноразовый claim **до** единственного скрытого TTY-ввода. Ключ остаётся в RAM broker; не попадает в argv/env/IPC/files. Это существующая same-UID модель доверия владельцу, не процессная изоляция. Нет гарантии стирания immutable JS strings. Launcher не выпускает permit, не открывает Terminal, не возобновляет завершённый run. Отмена во время cleanup не объявляет COMPLETED; независимые finalizers выполняются и при ошибке broker stop.

## Проверки и сохранённые отказы

- **87 targeted tests PASS**, scoped TypeScript и lint PASS. Проверены старые бюджеты/usage fence, отдельность UI permit, точные сообщения/history, запрет повторов/мутаций, bounded fd reads, замена файла во время чтения, cancellation и независимая очистка.
- R1: sandbox `EPERM` до PG start сохранён отдельно; один идентичный запуск с разрешённым loopback дошёл до Jest и выявил закрытый whitelist ESM transform. Этот FAIL сохранён, не включён в PASS.
- R2: полный UI stub PASS на `82dcad6f`; затем review исправил launcher/failure edges. R3: повторная целевая проверка финальных bytes на `1bad667c`, **1 Jest case / 3 входа / 5 HTTP и видимых ответов PASS**. Эти числа не складываются с 87 component tests и не являются оценкой интеллекта.
- Настоящий подготовленный `launch.command` без `approved-run.json` отказал с exit 1 до broker/TTY/claim/процессов. [Refusal evidence](evidence/maya-react-broker-ui-20261009/prepared-on-proof-source/refusal.json). Положительный paid/TTY путь не запускался.
- После R3 собственные PostgreSQL, broker и Chrome остановлены; `pg_ctl status=3`, postmaster PID отсутствует, перечисленные OS PID отсутствуют, семь собственных process groups закрыты/отсутствуют. Независимый read-only review подтвердил R3, source bindings и ограничения.

## Один будущий запуск после точного разрешения

После документационного checkpoint создаётся свежий `/private/tmp/maya-ui-ready-20261009-r2/local-plan.json`, привязанный к окончательному HEAD, и команда:

```sh
/private/tmp/maya-ui-ready-20261009-r2/launch.command
```

Она запускает один broker и один существующий runner со всем UI-сценарием. Это готовая команда, **не выданное разрешение**. Перед её разрешённым исполнением parent оформляет внешний `permit.json` и `approved-run.json` с exact candidateCommit, manifestSha256, ownerApprovalRef и permitSha256. Эти nonsecret записи не создаются launcher автоматически. Свежий plan/runId/UID/GID/socket должны совпадать с permit; старые claims не используются.

Предыдущий prepare в `/private/tmp/maya-ui-ready-20261009` сохраняется как исторический, без исполнения и без повторного использования. Все 102 файла из evidence `SHA256SUMS.json`, включая synthetic журналы проверок и сохранённых отказов, включены в Git checkpoint; общий ignore для `.log` не должен исключать эти доказательства.

Владельцу остаётся один понятный шаг: **когда он подтвердит готовность и запуск будет разрешён, ввести существующий DeepSeek key один раз в скрытом приглашении Terminal**. До готовности окно не открывается. Ввод ограничен 30 секундами и остатком permit; отмена/timeout/отзыв прекращают run, не открывая новый prompt.

Точный предлагаемый paid scope: **3 диалога / 5 реплик, максимум 12 attempts, 10 минут, локальный cap $2**, DeepSeek v4-pro, concurrency 1, ≥6 секунд между attempts, timeout 30 секунд; request ≤98 304 bytes, response ≤1 MiB, output ≤2048 tokens/attempt. Setup и ввод расходуют окно permit; лимиты не гарантируют завершение всех реплик. Реальные бизнес-источники и COMMIT остаются вне объёма.

По уже сохранённым ставкам input $1.32/M и output $3.96/M двенадцать полных местных reservations дают **$1.71933696**. Это консервативная местная модель резерва, не доказанный provider billing maximum. Новых pricing/balance запросов не было. Pricing observation `2026-10-09T07:07:01Z` пригоден для existing admission только до **2026-10-10T07:07:01Z**; после этого нужна реальная свежая проверка, а не обновление timestamp.

Frozen9 и его launcher неизменны (SHA256 `007ba048c59eaf7ec020ec142aea15045d22098a6515701a74e78823ec20e7de`). Его отдельные $6/36/30 минут не разрешают текущий профиль. Рабочий сайт, production, HTTPS/SSH, настоящие YCLIENTS-записи и outbound не тронуты. Полная MAYA/C10, реальная языковая/провайдерская приёмка — **NOT_ISSUED**.
