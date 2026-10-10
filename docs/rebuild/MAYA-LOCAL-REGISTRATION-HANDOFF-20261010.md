# Локальная регистрация владельца и следующий вход

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

## Следующий шаг владельца

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

**Сохранённая БД владельца ещё не открывалась повторно.** Только по исходникам
проверен переход от её runtime `03875b2` к candidate
`c2079dd5b20de32995c8baa0a293547391cd5d33`: прежние paths сохранены, 117 canonical
Prisma/migration files совпадают. Эта проверка не читала owner DB/keys и не
заменяет actual owner-state preflight или обычный вход.
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
