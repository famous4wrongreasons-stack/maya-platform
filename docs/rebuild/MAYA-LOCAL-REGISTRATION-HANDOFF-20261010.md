# Действующая локальная регистрация без YCLIENTS ключа

**Текущая форма фактически прошла React → HTTP → PostgreSQL на
`03875b23523a578fad13ec0e8f7035dcd4e5a66b`.** Созданы два вымышленных бизнеса через
обычный AppModule и стандартные миграции; 9 browser/DB checkpoints, 5 парольных
входов, потеря успешного ответа после commit и восстановление без дубля — PASS.
[Evidence](evidence/maya-registration-form-20261010/summary.json).
Это работающая локальная регистрация MAYA, а не preview и не внешний аккаунт.
Owner registration ещё не выполнена; тестовый профиль чисто остановлен.

## Точный профиль для следующего окна владельца

Используется существующий `local-onboarding.mjs`, stage 0, **без partner/user token**.
Он создаёт новую приватную PostgreSQL на этом Mac, служебные ключи и обычные
бизнес/филиал/owner records после явного согласия в форме. БД и ключи сохраняются
вместе вне Git. Сохранённые owner-сессии и синтетическую тестовую БД не переиспользовать.

После согласования готовности владельца к одному 15-минутному окну:

```sh
cd /Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend
/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)(allow network-bind (local ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))(allow network-outbound (remote ip "localhost:*"))' /usr/local/bin/node scripts/local-onboarding.mjs --run --state=/private/tmp/maya-onboarding-owner-NEW --minutes=15
```

`NEW` заменить уникальным именем нового каталога. Source должен быть committed/clean.
Launcher печатает конкретный `http://127.0.0.1:<port>/__local-onboarding`; порты
выделяются автоматически. После `ready` открыть этот адрес в видимом браузере,
затем «Открыть текущую форму» → «Создать бизнес». Владелец сам вводит данные и пароль;
агент не читает поля и не отправляет форму. Выбрать город филиала, отметить согласие,
нажать «Создать бизнес». Никакой ключ YCLIENTS на этом шаге не требуется.

При потерянном/неопределённом ответе перейти ко входу по паролю с выбранными
коротким именем бизнеса и email; не создавать бизнес повторно. Пароль не хранится
в presentation storage. После истечения окна штатно останавливаются собственные
Node/PG процессы, данные не удаляются. Для повторного открытия сохранённой owner БД
нужен отдельно проверенный resume; source-only synthetic restart helper не выдаётся
за универсальное owner-восстановление.

## Что проверено и что ещё открыто

- Новый UI: понятные поля, сохраняемая ручная правка slug, native checkbox,
  обязательный IANA select с городами/UTC, inline ошибки и фокус. 63 synthetic
  browser checks, 34 focused tests, 117 carrier ratchets и build/typecheck PASS.
- Actual: current React bytes совпадают со сборкой; две регистрации, reload/signout
  и парольный recovery используют те же owner/branch identities. Дублей нет.
- Collision: занятый slug откатывает создание; добавляется только pending
  TrialActivation. Существующий backend отвечает generic 500, поэтому UI сохраняет
  `uncertain` и не разрешает retry. Для понятной ошибки «имя занято» остаётся узкий
  серверный код из rollback-границы `tx.tenant.create`; общий 500 переименовывать нельзя.
- 17 таблиц бизнес-эффектов остались пустыми. Chat/model, provider connect, email OTP
  и чужие Origin/Host/Sec-Fetch-Site отклонены на backend и relay. Runtime-процессы
  запускались под OS network policy только для loopback. Chrome использовал свой
  sandbox/свежий профиль/request guard; OS-wide packet closure Chrome не заявляется.
- Первая actual попытка остановилась до браузера из-за сравнения PostgreSQL `inet`
  с маской. `host(inet_server_addr())` исправляет представление, сохраняя exact
  loopback и data-directory checks. Отказ и clean cleanup сохранены в evidence.

Stage 0 не подключает бизнес к YCLIENTS и не открывает CRM-мутации, рассылки или C10.
После регистрации подключение компании к филиалу остаётся отдельным разрешённым
setup. Этот документ не добавляет миграцию stage-0 owner БД в real-provider профиль.
Рабочий сайт, production, телефон и сохранённые owner DB/keys не изменены.
