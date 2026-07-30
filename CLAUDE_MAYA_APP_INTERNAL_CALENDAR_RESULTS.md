# CLAUDE_MAYA_APP_INTERNAL_CALENDAR_RESULTS

> Ответ на `CLAUDE_MAYA_APP_INTERNAL_CALENDAR_TASK.md`. Claude, 2026-07-12.
> Работа в worktree ветки `codex/maya-app-internal-calendar` (`~/Desktop/maya-app-local`).
> NestJS/Prisma/миграции/billing/production не тронуты; `main` и живое приложение не менялись.

## Изменённые файлы

- `сайт и приложение/app.html` (worktree ветки) — блок «Календарь MAYA» в кабинете + `calendar_source` в boot;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало, **byte-identical**; `npx cap sync ios` выполнен, `ios/App/App/public/index.html` **byte-identical** www;
- `сайт и приложение/maya-start.html` (worktree ветки) — выбор источника расписания в существующем онбординге. *(Файл вне перечня «app surfaces», но именно в нём живёт существующий flow `POST /api/onboarding/trial` — правка минимальная, без новых экранов.)*

## Онбординг владельца

В форму триала добавлен один выбор **«Как вы ведёте расписание?»** (стиль формы сохранён):

- **«В самой MAYA»** (по умолчанию) → `calendarSource: "internal"` + `industryPresetId: "solo_specialist"`; API-токен не запрашивается;
- **«Подключить CRM»** → `calendarSource: "external"`; CRM-путь и его поля не тронуты.

Экран успеха для internal дополнен подсказкой: «Кабинет → Календарь MAYA, стартовый график Пн–Пт 09:00–18:00 уже создан».

## Настройки внутри MAYA (не отдельный дашборд)

В существующем мини-кабинете приложения — компактный блок **«Календарь MAYA»** в Aurora-токенах. Показывается только при `calendar_source === 'internal'` (из `/api/mobile/config/:slug`, добавлено в `__SAAS_TENANT`) и роли `tenant_admin | tenant_owner | business_owner | administrator` (из `/me`). Содержит:

1. `GET /internal-calendar/setup` — загрузка по кнопке «Настроить услуги и график»;
2. услуги: список + создать (`POST /services`), выключить (`DELETE`), включить обратно (`PATCH {active:true}`);
3. специалист: имя/роль/шаг слота (`PATCH /providers/:id` → `displayName/title/slotIntervalMinutes`);
4. график недели: 7 дней on/off + время, атомарная замена (`PUT /providers/:id/schedule {rules:[{weekday,startTime,endTime}]}`);
5. перерывы/отпуска: список + добавить (`POST /time-off {startAt,endAt,note}`) + убрать (`DELETE`);
6. спокойная строка готовности строго по серверному `ready` (точка + текст) — своей eligibility-логики в JS нет, ошибки сервера показываются как есть (`readErrorText`).

Все вызовы идут через существующий refresh-aware `localBookingFetch` (Bearer, single-flight, tenant-namespace). Формулировки — «специалист / услуга / клиент», салонной лексики в новом UI нет. Навигация/чат/голос/командный чат не задеты; приложение открывается как раньше.

## Клиентская запись

Второй реализации записи нет: каталог/слоты/записи — прежние `/services`, `/staff`, `/available-slots`, `/appointments*`. Проверено живьём, что при `internal` те же endpoints отдают данные внутреннего календаря (см. ниже).

## Верификация (живой backend ветки, без стабов)

Backend поднят из worktree: `prisma migrate deploy` (свежая БД) + `prisma db seed` + `npm run start:prod` на :3000. Фронт — статикой на :8787 (dev-CORS-аллоулист бэка).

Полный e2e через UI headless-CDP (`CALENDAR E2E OK`):

| Шаг | Результат |
|---|---|
| Онбординг формой, выбор «В самой MAYA» | салон создан; подсказка про Календарь MAYA и график 09:00–18:00 на экране успеха ✅ |
| `GET /mobile/config/:slug` | `calendar_source: "internal"` ✅ |
| Вход владельца в приложение по телефону (debug-код) | вошёл; в клиентском каталоге виден специалист «Ирина» (данные internal через общий `/staff`) ✅ |
| Кабинет → «Календарь MAYA» | setup загружен; строка «Добавьте услугу и график…»; поля специалиста + неделя ✅ |
| Добавление услуги через UI (Стрижка, 45 мин, 1800 ₽) | строка появилась; готовность сменилась на «Календарь готов — клиенты могут записываться» (серверный `ready:true`) ✅ |
| Суббота ON → «Сохранить график» | сервер: `weekly_rules` дни `[1,2,3,4,5,6]` ✅ |
| «Закрыть время» (20.07 10:00→14:00, «Личное») | сервер: `time_off: ["Личное"]` ✅ |
| Роль «Мастер» → «Сохранить специалиста» | сервер: `providers[0].title === "Мастер"` ✅ |
| `GET /available-slots?date=…&staffId=…&serviceIds=…` | слоты из внутреннего календаря: с 09:00 МСК, шаг 30 мин, длительность 45 ✅ |

## Parse / sync

- `node --check` всех inline-скриптов: worktree `app.html` (21/21), iOS `www/index.html` (21/21), `maya-start.html` — **все OK**;
- `npx cap sync ios` выполнен; `www/index.html` ⇄ `ios/App/App/public/index.html` — **byte-identical**.

## Расхождений с backend-контрактом не найдено

Все задокументированные маршруты/поля отработали как в `docs/product/internal-calendar.md` и Swagger-DTO. Единственная UI-условность: недельный график редактируется как один интервал на день (первый слайс); при нескольких интервалах на день с бэка форма покажет первый, а `PUT` заменит день одним интервалом — если нужно много-интервальное редактирование в этом слайсе, скажи, добавлю.
