# Локальное подключение YCLIENTS: профиль готов к передаче владельцу

**11 октября, точная несовместимость установлена:** реальный management staff ответ содержит только `meta.count`, численно равный длине массива; остальные source/shape/company проверки прошли. Добавлен допуск этого варианта только для прежнего точного unfiltered v2 management source, без синтеза total и без ослабления pagination/identity checks. 151 тест и 8 мутаций PASS. На момент исправления: 0 integrations / 0 A17; реальное сохранение после правки ещё не проверено. [Причина и доказательства](MAYA-YCLIENTS-TEAM-COUNT-FIELD-20261011.md).

**11 октября, повтор на `f3aceca9` снова отклонён:** staff HTTP 200, `total_count` отсутствует, но точное дополнительное условие отказа collection branch не записано. Предыдущая правка не закрыла реальный отказ. Read-only БД: 0 integrations / 0 A17. Добавлена полная закрытая диагностика структуры/источника; правила допуска byte-identical, 148 тестов и 7 прежних мутаций PASS. Реальное сохранение и точная причина дополнительного отказа остаются неподтверждёнными. [Факты и следующий шаг](MAYA-YCLIENTS-TEAM-SOURCE-DIAGNOSTIC-20261011.md).

**11 октября, фактическая причина staff refusal установлена:** `meta.total_count` отсутствует; поддержка числовой строки реальную проблему не устранила. Сохранения нет: 0 integrations / 0 A17, исходная операция `NOT_OBSERVED`. Добавлен узкий допуск пустой metadata только для точного unfiltered management collection по актуальному контракту YCLIENTS, с v2/HTTP 200, обязательной company каждого сотрудника, уникальными ID и без признаков пагинации. 126 synthetic проверок и 7 мутаций PASS; реальное сохранение ещё не выполнено. [Контракт, доказательства и ограничения](MAYA-YCLIENTS-TEAM-COLLECTION-COMPATIBILITY-20261011.md).

**Исправления подключения проверены 10 октября на `b46e3d09748d6e38549fcaeb3cb0565077f77345`.** Отдельная synthetic HTTP/Auth/AE/PostgreSQL матрица прошла **20/20** сценариев; текущий React — **15 checkpoints, 9 парольных входов и 3 точных отказа**, затем отдельный backend/process и PG restart. Исправлены потеря выбранной компании после первых 200 записей, влияние неправильного title другой компании и ошибочная классификация malformed selected payload как отсутствующей компании. Закрытая диагностика теперь сохраняет только разрешённый canonical error code; форма объясняет блокировку активации до сохранения подключения. [Исходники, результаты и границы](evidence/maya-yc-pre-ae400-reproduction-20261010/summary.json). Все provider ответы в новых проверках синтетические; реальные YCLIENTS/model calls — 0, owner DB и рабочий сайт не затрагивались.

**Реальное подключение владельца пока не сохранено.** В закрытом сеансе 20:09–20:24 UTC два connect POST вернули HTTP 400 после companies GET 200, recovery — `NOT_OBSERVED`; read-only проверка той же БД в 20:25 подтвердила 0 integrations и 0 A17 executions. Известны pre-AE стадия отказа и отсутствие сохранения, но исходный canonical код, provider payload и точная причина остаются UNKNOWN. Найденные synthetic дефекты нельзя приписывать этому сеансу. БД/ключи сохранены, приложение и PG остановлены. [Owner evidence](evidence/maya-owner-yc-connect400-20261010/summary.json). Новый ввод ключей или owner window не запрашивались; следующий реальный запуск требует готовности владельца и актуального ограниченного handoff. Real YCLIENTS acceptance и завершение MAYA/C10 не выданы.

**Сравнение с прежним работавшим путём завершено:** mandatory `companies?my=1` появился 31.07, Authorization не менялся; прежний серверный active integration и новый local tenant — разные состояния. Октябрьская смена endpoint не подтверждена. Недостающий исходный `error.code` не сохранён, новую форму ради него не повторяем. [Точный differential и пределы вывода](MAYA-YCLIENTS-CONNECTION-DIFFERENTIAL-20261010.md).

**Текущий handoff владельца использует уже созданный бизнес и ту же сохранённую БД.**
На `d4cc4bd7e0d182ba656c42ee84517c1c50d37ae1` завершён [полный synthetic save/status proof](evidence/maya-yc-current-save-20261010/summary.json): текущий React, exact read-profile ingress/transport, 13 checkpoints, отказы и отдельный PG/process restart. Следующий запуск требует новой готовности владельца; ключи пока не запрашиваются. Сохранить исходный pending URL/request ID, войти по паролю и явно проверить результат операции. Точный текущий порядок — в [handoff сохранённого бизнеса](MAYA-LOCAL-REGISTRATION-HANDOFF-20261010.md). Причина прежней попытки остаётся UNKNOWN; реальная привязка не подтверждена.

Ниже сохранён исходный контракт профиля. Пример с новым state относится к первому созданию окружения; для существующего бизнеса используется подготовленный same-DB resume без initdb, миграций, signup или смены служебных ключей.

**Фактический диагностический startup PASS на `3480485443f9301666bdd70015f9da1bbcc44328`: 37/37 focused tests, две свежие PostgreSQL с обычным AppModule, health 200, текущий React в Chrome и штатная остановка.** [Evidence](evidence/maya-yclients-startup-diagnostics-20261010/summary.json). Использован только публичный синтетический partner constant; provider calls/refusals — 0/0. Backend имеет OS network deny с исключениями только для своей PostgreSQL/API. Браузер сохраняет встроенную sandbox, пустой профиль и перехват только локальной статики; OS-wide отсутствие пакетов Chrome не квалифицировано. Это проверка запуска и отображения, не реальная привязка филиала, A17 import, модель, full MAYA или C10.

Предыдущий разрешённый owner handoff на `46479aa49c9a79a76ebe6ce420aabd28bc422708` завершился до readiness. Старый launcher не сохранил точный этап отказа: причина, факт принятия ключа и внешний dispatch остаются **UNKNOWN**; `not_started` не заменяет transport evidence. Его база и ключевые файлы сохранены без чтения/изменения. Новое окно или запрос ключа не открывались. Теперь manifest различает `waiting_input` → `credential_accepted` (только boolean) → `backend_starting` → `ready`, а отказ сохраняет первый безопасный код и этап; сообщения ошибок и метаданные секрета не записываются.

Исторический source-only checkpoint `2777ca65ab69c71224e20971d491575d074eb096`, 29/29 tests и static review остаётся [сохранён](evidence/maya-local-yclients-read-profile-20261010/summary.json). Его прежний NOT_RUN для AppModule/PG/React заменён новым synthetic startup proof; real YCLIENTS/owner-input acceptance остаётся открытой.

Предыдущий stage 0 фактически проверен с обычным backend/current React и двумя синтетическими бизнесами, включая парольное восстановление и перезапуск собственной PostgreSQL: [actual evidence](evidence/maya-normal-onboarding-actual-20261010/summary.json), runtime `11e16cd111af6fa571ed2b638fb2dac06acd31d1`. Это отдельное историческое доказательство, не подмена запуска нового профиля. Synthetic `crm-setup-local` и stage 0 по-прежнему не принимают настоящие токены.

## Исходный контракт первого запуска профиля

Предыдущее разрешение на тот же ограниченный setup не нужно запрашивать повторно. Сначала согласовать готовность владельца к вводу; автоматически новый prompt не открывать. Старый failed state не переиспользовать и не удалять.

Из отдельного worktree в интерактивном Terminal на этом Mac:

```bash
cd /Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend
node scripts/local-yclients-read.mjs --run --state=/private/tmp/maya-yclients-owner-NEW --minutes=15
```

`--state` должен указывать на новый каталог вне checkout; `NEW` заменить уникальным именем. Запуск без `--run` только показывает подготовленный план и не создаёт окружение. Нужны установленные локальные зависимости и PostgreSQL; launcher не устанавливает пакеты. Точное дерево source должно быть committed/clean. В исходном checkpoint универсальное повторное открытие state не было реализовано; текущий handoff использует отдельно проверенный finite same-DB resume.

1. Launcher создаёт отдельные служебные ключи, собственную PostgreSQL и применяет канонические миграции без seeds/fixture grants. Все слушатели — `127.0.0.1`. Подготовка ограничена 15 минутами, отдельный stage — 180 секундами.
2. После подготовки владелец **сам вводит partner token в скрытый TTY prompt** (до 10 минут; отдельное окно после завершения подготовки). Не в чат, аргументы команды, файл или переменные родительского shell. Ввод не отображается; отмена/EOF останавливают запуск. Partner token передаётся только запускаемому backend и не сохраняется в state/manifest/evidence.
3. Launcher печатает локальный адрес `/__local-yclients-read`; переход ведёт в существующий React `/?local_crm_setup=1`. Владелец штатно создаёт собственный бизнес, учётную запись и филиал либо входит в созданный в этой сессии бизнес. Тестовые аккаунты не переиспользуются. Сохраняются реальные guards, текущие membership и entitlement `crm.integration`; UI не выдаёт полномочий. Widget/chat release grant этому прямому setup пути не нужен.
4. В существующей форме владелец выбирает свой филиал, указывает company ID и вводит **user token в поле пароля**. Отдельное явное действие **«Проверить и сохранить подключение»** выполняет provider GET и A17 install: зашифрованный пользовательский токен и company↔branch сохраняются в локальной базе со статусом `pending_activation`. Поле токена очищается перед отправкой. Company ID сам по себе не подтверждает право доступа.
5. После просмотра компании, филиала и версии владелец отдельно нажимает **«Активировать и импортировать»**. Выполняются существующие A17 activation/import с текущими проверками и сохранённой квитанцией. Нет автоматического запуска, фонового retry или нового UUID при неизвестном исходе. При потере ответа используется существующее чтение операции и допустимое продолжение с тем же UUID: [recovery contract](MAYA-A17-SAME-ID-RECOVERY-HANDOFF-20261010.md).
6. Сессия работает не более 15 минут после готовности; затем останавливает собственные процессы и PostgreSQL. В приватный отчёт попадают счётчики и до 64 закрытых событий HTTP/provider: route/method/stage/status/code, sequence, elapsedMs и UTC времени получения launcher. Raw URL/query/headers/body/errors, credentials и request ID не сохраняются; provider wire read не означает A17 commit. База и локальные ключи остаются в приватном каталоге; остановка не удаляет данные.

До явного **«Проверить и сохранить»** профиль не допускает provider dispatch. Ввод partner token и открытие формы сами по себе не вызывают YCLIENTS. Это проверено source/pure tests, а не packet-level наблюдением нового runtime.

## Фактически используемые API

Метод — только **GET**, origin — `https://api.yclients.com`, base path — `/api/v1/`. Ни произвольный provider URL, ни дополнительные query не принимаются. Native setup может повторять чтения при перепроверке A17; это не обещание одного GET.

| Разрешённый путь | Зачем вызывается |
| --- | --- |
| `companies?my=1` | Проверка доступных токену компаний; это каталог доступных компаний, не только выбранная компания |
| `company/{selected_company_id}` | Метаданные выбранной компании |
| `book_services/{selected_company_id}` | Доступные услуги для preview |
| `services/{selected_company_id}` | Существующий fallback услуг |
| `service_categories/{selected_company_id}` | Необязательные категории для preview |
| `company/{selected_company_id}/staff` | Полная команда для локального импорта |
| `staff/{selected_company_id}` | Существующий fallback полной команды |

Native adapter также имеет fallback `book_staff/{id}`, но **этот профиль его запрещает**: bookable subset не доказывает полноту команды. Принятый staff response обязан иметь `success:true`, массив уникальных ID и явный `meta.total_count`, равный длине массива (не более 50). Pagination, противоречивые counts, чужой `company_id` и отсутствие подтверждения полноты отклоняются. Совместимость реального YC response с этим требованием ещё не проверена; при отказе нельзя молча ослабить guard.

Услуги/категории участвуют в preview; этот A17 import **не материализует полный каталог услуг**. Preview ограничен 30 строками услуг/staff; отдельная полная команда ограничена 50. Provider payload в памяти может содержать имена/контактные метаданные сотрудников и компании; они не отправляются модели и не архивируются как raw response.

Transport ограничен 64 GET на явную HTTP операцию, 256 на сессию, 120 секундами на операцию, 20 секундами на GET и 2 MiB на response. Redirect запрещён. Только текущий аутентифицированный active actor в connect/activate может открыть dispatch; фоновый вызов, завершённый request и чужая company отклоняются. Это application-layer control, не OS firewall.

## Что меняется локально и что сохраняется

**У YCLIENTS ничего не создаётся и не изменяется.** Записи, клиенты, продажи и платежи не читаются. Booking/create/move/cancel, цены/графики, сообщения, внешние уведомления, модель и фоновые инициаторы закрыты. Рабочий сайт, production, HTTPS и телефон не меняются.

Локальный scope является явно подтверждаемым setup/import, поэтому содержит изменения:

- Install сохраняет существующую `CrmIntegration`, encrypted user token, fingerprint, company/branch settings и обычные A17/AE/audit records.
- Activation помечает integration активной, обновляет verification timestamps, `calendarSource: external` и локальный `branding.booking.mode: live`. Этот флаг не открывает booking routes/YC writes в данном профиле.
- Import создаёт/обновляет локальные Staff, StaffProviderLink, CrmStaffAccess (`pending_contact`), шифрует отображаемые имена. Новые User accounts и сообщения сотрудникам не создаются. При существующей команде canonical reconciliation может менять access/membership, отключать отсутствующих сотрудников и отзывать сессии.
- Применяются company presentation и timezone: tenant default и следующие прежнему default/null филиалы могут получить timezone компании. Logo URL сохраняется, но browser CSP запрещает внешнюю загрузку. Полный Service catalog, Client и Appointment не импортируются.

Activation и import — последовательные команды: activation может завершиться, а import остаться неподтверждённым. Необязательные категории имеют existing catch-to-empty: их ошибка может ухудшить preview и всё же позволить сохранить конфигурацию после остальных успешных чтений. Профиль **не обещает общий rollback A17 при каждом transport refusal**; обязательная полная команда остаётся проверяемой.

Приватный state каталог имеет режим `0700`, файлы служебных ключей/environment — `0600`. Локальная база и эти ключи сохраняются вместе после остановки вне Git. Пользовательский токен шифруется существующим AES-256-GCM owner; также применяются существующие encrypted AE payload records. У `CrmIntegration` нет TTL токена. Existing executable A17 payload retention — 30 дней, shadow — 7 дней, audit retention в registry — 7×365 дней. Это текущие contracts; физическое удаление по таймеру и автопurge базы не обещаются, scheduler выключены. Новая secret store/retention policy не создавалась.

Partner token живёт в environment/памяти собственного backend до его остановки; не пишется в manifest/service keys/logs. Это не гарантия недоступности same-UID процессу или криптографического стирания JavaScript строк. User token вводится через существующую форму, не сохраняется React в state/storage; сервер сохраняет его только при явном install.

## Доказательства и точная граница допуска

[Архив](evidence/maya-local-yclients-read-profile-20261010/summary.json) содержит 8 profile/native synthetic adapter, 11 launcher/fake-TTY и 10 stage 0 regression tests (29 PASS), точные source hashes, read-only A17/background/UI findings и финальное независимое ревью. Четыре syntax checks и no-argument preparation PASS. Ни новые HTTP/PG/React/TTY runtime checks, ни real YC/model acceptance этим checkpoint не заявлены. Тяжёлый запуск на общем Mac требует согласованного runtime слота.

**Разрешённый scope сохраняется:** один локальный setup с private partner/user input, provider GET выбранной компании и локальными A17 сохранением/activation/import по отдельным явным действиям формы; retained DB/keys и ограничения описаны выше. Предыдущее разрешение получено, failed handoff не аннулирует его и не требует повторного общего approval на тот же ограниченный retry.

**Следующий шаг — согласовать новую готовность владельца**, затем открыть ровно одну ограниченную сессию на той же сохранённой БД через подготовленный same-DB resume. В этом checkpoint новый prompt не открывается. Paid model, provider booking, background C10, production и телефон в scope не входят. После фактического подключения current chat reads и confirmed actions квалифицируются отдельно в общей MAYA: [план](MAYA-DELIVERY-PLAN-20261010.md).

## Повторяемая локальная диагностика без ключей

`node scripts/local-yclients-read.mjs --run --diagnostic-no-provider --state=/private/tmp/maya-yc-diagnostic-NEW` запускает тот же AppModule/React на отдельной PostgreSQL, без TTY, с публичным synthetic constant и жёстким пределом в одну минуту после readiness. Допущены только health GET; signup, setup и chat возвращают 403. Real token в этом режиме не принимается. Не оборачивать launcher во второй `sandbox-exec`: macOS отказывает во вложенной sandbox до IPC. Штатный дочерний runtime уже ограничен своей OS policy; подготовка launcher не имеет общей OS-изоляции сети.

[Архив](evidence/maya-yclients-startup-diagnostics-20261010/summary.json) сохраняет failed attempt A, два успешных запуска, ошибки проверочного UI harness, проверку раннего IPC отказа, 2021 source bindings и cleanup. Эти новые проверки не устанавливают причину старого owner failure.
