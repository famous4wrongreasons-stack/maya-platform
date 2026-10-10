# Локальная регистрация владельца и следующий вход

**11 октября, реальное сохранение + активация/import подтверждены на `bfc83242`:** current React показал активное подключение; connect и activate вернули HTTP 201. Та же owner БД содержит одну active integration, три SUCCEEDED A17 execution и 6 Staff/provider links/access (`pending_contact`). Данные пережили DB restart и network-closed AppModule restart (health/readiness 200, штатная остановка, provider calls 0). Услуги прочитаны в preview; полного локального каталога этот импорт не создаёт. Owner login/UI после app restart и booking ещё не проверены. Ручные остановки сохранили `runtime_summary_missing`; это отмечено отдельно, без подмены receipt. [Точный checkpoint и границы](MAYA-LOCAL-YCLIENTS-ACTIVATION-20261011.md). Старые отказы ниже — история прежних источников; повторно сохранять или активировать подключение не требуется. Production и внешние business effects не выполнялись.

**Исправления подключения проверены 10 октября на `b46e3d09748d6e38549fcaeb3cb0565077f77345`.** Отдельная synthetic HTTP/Auth/AE/PostgreSQL матрица прошла **20/20** сценариев; текущий React — **15 checkpoints, 9 парольных входов и 3 точных отказа**, затем отдельный backend/process и PG restart. Исправлены потеря выбранной компании после первых 200 записей, влияние неправильного title другой компании и ошибочная классификация malformed selected payload как отсутствующей компании. Закрытая диагностика теперь сохраняет только разрешённый canonical error code; форма объясняет блокировку активации до сохранения подключения. [Исходники, результаты и границы](evidence/maya-yc-pre-ae400-reproduction-20261010/summary.json). Все provider ответы в новых проверках синтетические; реальные YCLIENTS/model calls — 0, owner DB и рабочий сайт не затрагивались.

**Реальное подключение владельца пока не сохранено.** В закрытом сеансе 20:09–20:24 UTC два connect POST вернули HTTP 400 после companies GET 200, recovery — `NOT_OBSERVED`; read-only проверка той же БД в 20:25 подтвердила 0 integrations и 0 A17 executions. Известны pre-AE стадия отказа и отсутствие сохранения, но исходный canonical код, provider payload и точная причина остаются UNKNOWN. Найденные synthetic дефекты нельзя приписывать этому сеансу. БД/ключи сохранены, приложение и PG остановлены. [Owner evidence](evidence/maya-owner-yc-connect400-20261010/summary.json). Новый ввод ключей или owner window не запрашивались; следующий реальный запуск требует готовности владельца и актуального ограниченного handoff. Real YCLIENTS acceptance и завершение MAYA/C10 не выданы.

**Сравнение с прежним работавшим путём завершено:** mandatory `companies?my=1` появился 31.07, Authorization не менялся; прежний серверный active integration и новый local tenant — разные состояния. Октябрьская смена endpoint не подтверждена. Недостающий исходный `error.code` не сохранён, новую форму ради него не повторяем. [Точный differential и пределы вывода](MAYA-YCLIENTS-CONNECTION-DIFFERENTIAL-20261010.md).

**Владелец создал бизнес и вошёл в MAYA. Сессия затем штатно остановлена;
база и служебные ключи сохранены вместе.** Безопасный status, полученный
2026-10-10 в 18:40:51 UTC, подтверждает один новый tenant, user и branch,
одного активного владельца, завершённую activation и выданную owner-сессию.
Регистрация выполнена владельцем вручную. Имя, email, короткое имя бизнеса,
пароль, canonical IDs и приватный путь state в этот handoff не включены.
[Checkpoint и границы доказательства](evidence/maya-owner-registration-20261010/summary.json).

CRM integrations: **0**; `crmConnected: false`, `providerAdmission: false`.
Регистрация не подключила YCLIENTS. Статус завершения подтверждает остановку
собственных PG/runtime процессов, отсутствие postmaster и сохранность базы
с прежними ключами. Счётчик owner-сессии относится к моменту входа и не означает,
что сервер сейчас работает. Этот state больше не используется для синтетических
тестов. [Redacted owner status](evidence/maya-owner-registration-20261010/owner-status.redacted.json).

## Попытка подключения 10 октября, 19:11–19:26 UTC

Сохранённая база владельца повторно открыта на `f259208eea7e05ee82926531e40350fdc6ef55d5`.
Вход наблюдался в 19:21:56 UTC, загрузка одного филиала — в 19:25:43.
Владелец сообщил о нажатии «Проверить и сохранить». После окончания сессии
оставшаяся вкладка содержит исходный `install` locator и неопределённый результат.
Авторитетная read-only проверка той же БД в 19:30:17 обнаружила **0 integrations
и 0 executions четырёх canonical A17 capabilities**. Сохранения и активации нет;
историческая причина попытки остаётся **UNKNOWN**.
[Факты и границы](evidence/maya-owner-yc-save-20261010/outcome.redacted.json),
[поэтапная диагностика](evidence/maya-owner-yc-save-20261010/historical-trace.json).

Два `companies` dispatch и 0 guard refusals не означают успешного ответа YCLIENTS.
Исторический runtime не сохранял HTTP/reply status и request timeline. Отметка
старого observer «outside scoped page» не доказывает уход владельца со страницы:
он сравнивал полный URL и также отвергал адрес с добавленными параметрами
исходной операции. Причина конкретной прошлой отметки отдельно не наблюдалась.

Окно закончилось в **19:26:58 UTC** и не продлевалось. Штатный stop подтвердил
неизменный source, сохранённый state, отсутствие runtime group и остановку PG;
cleanup failures нет. Отдельная metadata-проверка не запускала приложение,
не читала credentials, работала read-only через private Unix socket, не делала
внешних вызовов или business writes; после неё PG и lock также отсутствуют.
Первая metadata-попытка остановилась на проверке выбора owner до чтения integration
и сохранена отдельно. Owner state не используется для synthetic tests.

## Текущая проверка сохранения — завершена на синтетических данных

На `d4cc4bd7e0d182ba656c42ee84517c1c50d37ae1` текущий React → точные
`read_setup_v1` ingress/transport → HTTP/PostgreSQL прошёл **13 checkpoints и
7 парольных входов**, затем отдельный backend/process и PostgreSQL restart.
Сохранение, activation/import, потеря ответа, same-ID recovery без дублей,
отказы credentials/company, stale version, чужой tenant/actor и отзыв доступа
проверены. Отказы проверки credentials/company не создают integration/AE mutation;
чтение результата не вызывает нового provider GET. [Архив и границы](evidence/maya-yc-current-save-20261010/summary.json).

Локальный вход теперь сразу показывает парольную форму и явную загрузку филиалов.
Точные безопасные коды дают понятную причину, сохраняя неопределённость и исходный
request locator. Setup больше не запускает историю чата при входе; обычное
восстановление чата сохранено. Закрытая диагностика хранит только ограниченные
этапы/статусы и время получения launcher, без токенов, body или request ID.

Первый тест остановился на ESM-загрузчике, второй обнаружил лишний history GET;
оба сохранены как FAIL. Третий полный прогон PASS. PG и тестовый Chrome остановлены.
Это synthetic native GET и test AppModule/grants; полный private launcher environment,
реальный YCLIENTS и причина прежней owner-попытки этим не подтверждаются.
117 canonical schema/migration файлов совпадают с source регистрации владельца;
это только source check, не повторный запуск его базы.

Технический save/status proof завершён. Следующий шаг при новой готовности
владельца — ограниченно открыть **ту же остановленную БД с теми же ключами**,
сохранить текущий URL с исходной операцией, войти по паролю и явно прочитать её
результат. При `NOT_OBSERVED` предусмотренная формой явная повторная отправка
требует того же ID, нового ввода и согласия. Новая регистрация или новый ID
не нужны. Новое окно и ввод ключа автоматически не открываются; рабочий сайт
и production не изменены.

## Предшествующая квалификация повторного запуска

Подготовка повторного открытия **той же БД с теми же ключами** теперь проверена
на отдельном синтетическом состоянии: настоящий PG restart сохранил canonical
данные, password/session/refresh state, ключи и каталоги. Существующий diagnostic
runtime запустился, отвечал health `200`, отклонял auth `403`, сообщил 0 provider
calls/refusals и штатно остановился. Вход по паролю после этого restart не
допускался профилем и не заявляется как успешный.
[Actual synthetic resume и cleanup](evidence/maya-same-db-read-resume-20261010/summary.json).
Независимый actual review дал `QUALIFIED_SYNTHETIC_ACTUAL_PASS` без blockers:
сверены 2029 source paths, сохранность состояния и cleanup; прежние failed
attempts сохранены.
[Review](evidence/maya-same-db-read-resume-20261010/independent-actual-review.json).

До описанной выше owner-сессии переход от runtime `03875b2` к candidate
`c2079dd5b20de32995c8baa0a293547391cd5d33` проверялся только по исходникам:
прежние paths сохранены, 117 canonical Prisma/migration files совпадают.
Эта отдельная историческая проверка не читала owner DB/keys; actual owner login
позднее наблюдался на том же сохранённом состоянии, как описано выше.
[Source-only проверка](evidence/maya-same-db-read-resume-20261010/owner-source-transition.source-only.json).

Следующий handoff должен сохранить уже созданный бизнес и привести к обычному
входу, без повторной регистрации или подмены БД. Новое окно ввода токенов не
открывается до отдельно подтверждённой готовности сохранённого runtime и новой
готовности владельца к вводу. В завершённом stage 0 partner/user token не нужен
и не принимается. Реальное подключение компании YCLIENTS к филиалу остаётся
отдельным явным setup-действием; сейчас оно не выполнено.

## Исправление занятого короткого имени

Исправленный backend возвращает `409` с `error.code: trial_signup_slug_taken`
только для точного Prisma `P2002` по одному полю `slug` или `subdomain` внутри
`tx.tenant.create`. Исключение немедленно выходит через транзакцию. Неизвестные,
противоречивые или чужие metadata, ошибки других записей и выдачи сессии не
превращаются в этот отказ.

Только такой точный ответ позволяет текущей форме показать ошибку поля и
исправить короткое имя. Остальные поля сохраняются; пароль остаётся лишь в DOM
того же активного submit при подтверждённом collision. Новая отправка требует
нового явного согласия. Отмена, уход со страницы, поздний ответ и неопределённый
исход не разрешают повторное создание; UNKNOWN по-прежнему ведёт к обычному
входу. Это не заявление о физическом обнулении памяти JavaScript.

- **45/45 backend unit tests**, две suites: оба Prisma metadata пути, отказ
  неподходящих ошибок, отсутствие дальнейших bootstrap-записей, сохранение
  поздних transaction/session ошибок. Транзакция здесь — unit seam, не actual PG.
  [Summary](evidence/maya-owner-registration-20261010/slug-fix.backend-summary.json).
- **91 synthetic browser checks** текущего React с `OnboardingPort`: исправление
  поля, фокус, время жизни секрета, новое согласие и сохранение UNKNOWN/no retry.
  Signup HTTP и база в этом прогоне не использовались.
  [Summary](evidence/maya-owner-registration-20261010/slug-fix.browser-summary.json).
- **Independent review: QUALIFIED_SOURCE_PASS**, конкретных blockers нет.
  Проверенные 14 файлов привязаны к SHA256 и точным Git blobs опубликованного
  fix `9aab0db141e3b624be0f81c745b8fa68caf06b01`. Parent подтвердил remote SHA;
  этот шаг архивации сетевую проверку не повторял.
  [Review](evidence/maya-owner-registration-20261010/slug-fix.review-summary.json).

**Новый `409` подтверждён на actual React → HTTP → PostgreSQL** на отдельном
candidate `c2079dd5b20de32995c8baa0a293547391cd5d33`: 9 checkpoints, 5 входов
по паролю, потеря ответа после commit и recovery без дубля. Коллизия дала точный
`409 trial_signup_slug_taken`, не создала новый бизнес, user, branch или
membership; появилась одна pending activation. 17 таблиц доменных эффектов
остались пустыми. Первая неудачная попытка browser startup сохранена отдельно,
без неподтверждённого объяснения причины.
[Actual evidence](evidence/maya-same-db-read-resume-20261010/actual-ui-attempt02.passed.json).
Этот actual прогон проверил collision, фокус, требование нового согласия и
отсутствие автоматического повтора. Третий бизнес с исправленным именем не
отправлялся; исправленная отправка покрыта отдельно component/headless tests.

Этот более поздний synthetic прогон дополняет прежнюю фиксацию `NOT_RUN`; он не
приписывается owner-сессии на `03875b23523a578fad13ec0e8f7035dcd4e5a66b`.

## Историческое actual evidence

[Прежний React → HTTP → PostgreSQL proof](evidence/maya-registration-form-20261010/summary.json)
на `03875b23523a578fad13ec0e8f7035dcd4e5a66b` остаётся историческим: два
вымышленных бизнеса, 9 browser/DB checkpoints, 5 парольных входов, потеря ответа
после commit и recovery без дубля. Тогда collision откатывал бизнес-записи,
оставлял pending TrialActivation и отвечал generic `500`; UI правильно сохранял
`uncertain`. Этот исход не переписан как доказательство нового `409`.

В прежнем proof 17 таблиц бизнес-эффектов остались пустыми; chat/model, provider
connect, email OTP и чужие Origin/Host/Sec-Fetch-Site отклонялись на backend и
relay. Первая попытка завершилась до браузера из-за представления PostgreSQL
`inet`; отказ и cleanup сохранены. Chrome OS-wide packet closure не заявляется.

Архивация не запускает services, не читает owner DB/keys, не меняет
рабочий сайт, production или телефон и не разрешает фоновые C10-действия.
