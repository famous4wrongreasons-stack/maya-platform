# Разовое настоящее подключение YCLIENTS: подготовка, без запуска

**Состояние: PREPARED, NOT ADMITTED.** Это отдельный профиль будущего локального подключения через обычный `CrmAdapterFactory` → `YclientsCRMAdapter`. Он не запущен и не квалифицирован реальными данными. Тестовый `crm-setup-local` остаётся synthetic-only; его запрет настоящих токенов не меняется. Владелец не просил новую демонстрацию, поэтому после успешной автоматической остановки developer smoke новая сессия не открыта.

Код восстановления готов: [результат и evidence](MAYA-A17-SAME-ID-RECOVERY-HANDOFF-20261010.md). База исходного follow-up: `77d41ef56254972d6ae849d497046ea02ac2487c`. Этот документ описывает один следующий запуск, а не новую систему разрешений, хранения или оркестрации.

## Что именно предлагается выполнить один раз

1. Поднять отдельный backend и PostgreSQL **на этом Mac**, только на loopback, с текущим React. Использовать обычный AppModule и native YCLIENTS adapter, без Jest, test literals, mock adapter и фикстурных прав. До подтверждения владельца и ввода токена — ноль обращений к YCLIENTS и ноль изменений реального бизнеса.
2. Штатно создать один локальный бизнес, учётную запись владельца и один филиал либо использовать уже подтверждённую пару в этом изолированном контуре. Не переносить production-базу и не выдавать права прямым SQL. Проверить актуальное членство и доступ к `crm.integration`.
3. Владелец выбирает конкретную компанию YCLIENTS и соответствующий филиал MAYA, приватно вводит пользовательский токен. По отдельному согласию текущая форма выполняет **«Проверить и сохранить подключение»**: проверяет доступ через native GET и сохраняет зашифрованный токен и привязку только в локальной базе.
4. После просмотра сохранённой компании, филиала и версии владелец отдельно подтверждает **«Активировать и импортировать»**. Разрешены только существующие локальные A17 activation/import effects. Получить и сохранить подтверждение операции, затем остановить этот разовый runtime. При потере ответа — чтение исходной операции и только допустимое продолжение с прежним UUID.

Provider scope этого запуска: проверка доступных компаний/выбранной компании, услуг/категорий, bookable staff и команды компании — тот же набор чтений, который вызывает текущий setup. Метаданные команды могут содержать имена/контакты сотрудников: они остаются в локальном backend/import, в модель не отправляются. Списки клиентов, записи, продажи и платежи этим setup не запрашиваются. Запись, перенос, отмена, изменение цен/графиков, CRM writes и рассылки в этот запуск не входят.

Предлагаемое окно исполнения — до 15 минут после готовности локального контура; этот предел ещё не является выданным разрешением на real-provider session. Подготовка контура может занять отдельное время. Цена доступа/API YCLIENTS не проверена; нулевая стоимость не обещана. Model key и платная модель для самого подключения не нужны.

## Проверенные входные условия

Проверка **только наличия** в текущем execution shell и собственном backend worktree обнаружила:

- `YCLIENTS_PARTNER_TOKEN` отсутствует. Это токен партнёрского приложения, его подготавливают приватно на backend.
- `CRM_ENCRYPTION_KEY` отсутствует. Ключ для нового изолированного backend надо создать приватно и сохранить вместе с доступом к его зашифрованным данным; production-ключ не нужен.
- `DATABASE_URL` и служебные auth/AE ключи для обычного runtime отсутствуют. Это работа локальной подготовки, не перечень значений, которые пользователь должен отправлять в чат.
- `.env` и `.env.local` в собственном backend worktree отсутствуют. Другие каталоги, Keychain и production secret stores не проверялись. Из этого нельзя заключать, что у владельца нигде нет токенов.
- Пользовательский YCLIENTS token не запрашивался и не читался. Настоящие company ID, локальные tenant/actor/branch и соответствие компании филиалу ещё не выбраны.

[Presence-only record](evidence/maya-a17-same-id-recovery-20261010/real-profile-presence.json) не содержит значений секретов. Для обычного backend применяются существующие `src/config/runtime-config.ts` и валидаторы доменов; public CI test literals нельзя использовать с настоящими данными. Основные служебные области — auth/session/rate limits, CRM encryption, AE identity/payload, Client identity и обязательные ключи referral/gift/loyalty модулей. Их генерирует локальная подготовка независимо, не владелец вручную.

## Штатные business/branch owners

Существующий путь — `POST /api/onboarding/trial-activations` с `{source:"web"}`, затем `POST /api/onboarding/trial` с исходным activation token, названием/slug бизнеса, owner email, выбранным паролем, `calendarSource: external`, названием филиала и его IANA timezone. Он создаёт tenant, владельца/членство и филиал атомарно и выдаёт owner session. Для дополнительного филиала есть защищённый `POST /api/branches`; список берётся через `GET /api/branches`. Company ID YCLIENTS никогда не считается доказательством прав: доступ проверяет credential owner.

На `4aec1a470a3b66766af3e20d867ef1fd9f2627ef` carrier получил первоначальную форму standard onboarding и видимый парольный вход через `/api/auth/login` с `tenantSlug`, email и паролем. После неопределённого signup форма направляет к входу с выбранными реквизитами без автоматического повторного создания. 117 synthetic/SSR tests и builds PASS; [точные source bindings и независимый review](evidence/maya-standard-onboarding-20261010/summary.json). Actual HTTP/PG/browser signup в обычном профиле ещё не выполнялся. Trial длится 10 дней; при production mode его включение требует `SELF_SERVE_TRIAL_SIGNUP=true`. Здесь production mode/развёртывание не включались.

Trial может выдать текущие `crm.integration` и `ai.owner` через существующий entitlement owner. **`widgets.runtime` исключён из trial и всех обычных планов:** для widget chat/approval нужен существующий platform/widget-release validate/grant с платформенными полномочиями и точным certificate/build/profile. Прямым CRM setup routes этот grant не нужен. Поэтому работоспособность setup не выдаётся за готовность всего chat/action приложения; тестовые grants из smoke не переносятся в реальный профиль.

## Остаток работы до реального ввода токена

После опубликованного checkpoint `c097e9919df509fecbf081f929703c03b4f8ab10` подготовлен код отдельного **stage 0 для штатной локальной регистрации**, [source checkpoint и ограничения](evidence/maya-normal-onboarding-profile-20261010/summary.json). `maya-saas-backend/scripts/local-onboarding.mjs` при будущем явном запуске собирает обычный AppModule и текущий React, создаёт собственную свежую PostgreSQL без seed/fixture grants, а независимые служебные ключи сохраняет вместе с базой в приватном каталоге вне репозитория. Это явно `NODE_ENV=development` на loopback HTTP; существующий production-запрет HTTP/CORS сохранён.

Stage 0 допускает только стандартную регистрацию, парольный вход/session, health, список филиалов и состояние CRM. Прямой backend и текущий transparent relay отдельно ограничены по маршрутам и browser origin/host. Настоящие provider credentials в профиль не принимаются; discovery, connect, preview, activation, модель, сообщения и другие действия закрыты. Обычные backend guards/DTO/entitlement owners не заменяются. Synthetic launcher не изменён.

**Actual запуск этого профиля, onboarding HTTP/PG/browser и real-provider профиль ещё не выполнены.** До ввода токенов нужны проверка stage 0 в согласованном локальном HTTP/PG слоте, затем отдельный конечный real-provider admission. Поэтому нельзя писать «осталось только ввести токен». Для будущего stage 0 из `maya-saas-backend`: `node scripts/local-onboarding.mjs --run --state=/private/tmp/maya-normal-onboarding-NEW --minutes=15`. Путь должен быть новым; существующая база не принимается. Время работы после готовности — 1–15 минут; подготовка ограничена отдельно. Остановка сохраняет приватную базу и ключи; повторный запуск сохранённого state этим launcher пока не реализован.

Локальные проверки source: 8 pure + 6 scheduler unit PASS, backend typecheck, syntax и formatting PASS. Scoped typed ESLint завершился V8 OOM при лимите 1024 MiB (exit 134), повторов/увеличения памяти не было; lint PASS не заявляется. Первый отказ production HTTP сохранён отдельно. Реальные служебные ключи, listeners и процессы PostgreSQL здесь не создавались.

Подготовленный stage 0 явно выключает billing, appointment reminders, owner reports, CRM reconciliation, expense reminders и ingestion retention; operational-alerts cutover отсутствует. Добавлены два узких opt-out — `TEAM_COMMUNICATIONS_SCHEDULER_ENABLED=false` и `NATIVE_FEEDBACK_SCHEDULER_ENABLED=false`; default-поведение существующих owners сохранено. Fresh DB, закрытый ingress, чистое окружение и private cwd без dotenv остаются отдельными ограничениями: один `NODE_ENV` отсутствие исходящих действий не доказывает. Actual отсутствие dispatch при запуске ещё предстоит проверить.

После технической подготовки нужны два действия владельца: согласовать **этот конечный provider-read/local-import scope** и приватно предоставить оба YCLIENTS token вида и точную компанию/филиал. Изменение границ операции требует нового согласования, а не обхода. Отдельная платная модель, реальное booking действие, доступный iPhone HTTPS и установка на устройство в это разрешение не включаются.

Срок полного подключённого приложения сейчас нельзя честно вывести из длительности локальных проверок. Последовательность конкретна: normal local profile → owner/source admission и приватные credentials → один real setup → chat/current reads → отдельно подтверждённые move/cancel → iPhone через уже реализованный Debug HTTPS override. Website, production и существующее приложение на телефоне при этой подготовке не меняются.
