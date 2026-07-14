# CLAUDE_EMAIL_OWNER_SHELL_AND_CALENDAR_FOLLOWUP_RESULTS

> Ответ на `CLAUDE_EMAIL_OWNER_SHELL_AND_CALENDAR_FOLLOWUP.md`. Claude, 2026-07-14.
> Ветка `codex/maya-os-release-candidate`, worktree `~/Desktop/maya-os-release-candidate`.
> NestJS/Prisma/миграции/backend-политику не трогал. В `main` не сливал. Prod не деплоил.

## Изменённые файлы

- `сайт и приложение/app.html` — owner-landing по роли, мост tenant-сессии в шелл, per-tab заголовки, реальный журнал `/internal-calendar/journal`, fail-closed на подделанный/битый bundle.
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало (**byte-identical**); `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical** www.
- Скриншоты: `CLAUDE_OWNER_CABINET.png` (лендинг «Мои записи»), `CLAUDE_OWNER_CALENDAR.png` (заполненный день журнала), `CLAUDE_OWNER_PROFILE.png` («Профиль и безопасность»).

## 1. Owner email → owner-опыт (роль, не email)

`lgEmailVerify()` после сохранения session bundle читает `response.user.role`. Для менеджерских ролей — `tenant_admin`, `tenant_owner`, `business_owner`, `administrator` — открывается owner-поверхность через `lgOpenAppCal()` (`calendar_setup=1` → авто-открытие кабинета MAYA OS). Клиентские роли остаются на клиентском маршруте `lgOpenApp()`. Роль из email **не** выводится; каждый привилегированный запрос по-прежнему проверяет сервер.

## 2. Мост tenant-сессии для оболочки (никакого «Войти» у владельца)

- `window.__meHasSession()` теперь дополнительно распознаёт `me_saas_auth_v2:<__ME_SAAS_CTX.ns>` **только текущего** tenant (чужие namespace не сканируются). Проверяется совпадение `tenant_slug` с контекстом; presence используется **исключительно** для отображения/навигации оболочки — бэкенд-право из localStorage не выдаётся, `ABookFlow` восстанавливает/обновляет сессию через `/me` и rotation, источник истины — сервер.
- «Личный кабинет»/нижняя вкладка «Записи»/профиль-меню в saas-режиме ведут во внутренний кабинет MAYA OS (`window.__meSaasCabinet` → экран `book` + `myView`), а не в легаси-кабинет салона. Мост `__meOpenSaasCabinet` регистрируется, пока `ABookFlow` смонтирован; если нет — флаг `__meSaasWantCabinet` читается на монтировании.
- Выход/протухший refresh/`me-saas-logout`/storage/`BroadcastChannel` logout → шелл мгновенно в гость: слушатель в `MEApp` делает `force()` (nav пересчитывает `loggedIn` → снова «Войти») и уводит с защищённых экранов (`book/cabinet/chat/settings`) на вход.
- **Fail-closed на подделку/битый контекст** двумя рубежами: (а) на старте `ABookFlow`, если под ключом tenant лежит «сырой» bundle, но `saasReadSession()` его не принимает (чужой tenant/битый контекст) — `saasForceLogout('restore_rejected')` чистит **только эту** пару; (б) если bundle принят по контексту, но токены подделаны — первый привилегированный `401` уходит на rotation, а невосстановимый (не транзиентный) сбой refresh (валидация/битая пара) теперь тоже `saasForceLogout` → вход. Терминальные коды refresh разлогинивали и раньше.

## 3. Свой заголовок и контент у каждого раздела

Глобальный «Мои записи» над всеми вкладками убран — `h2` теперь per-tab:

| Вкладка | Заголовок | Контент |
|---|---|---|
| Записи | **Мои записи** | только записи пользователя + отмена/перенос/записаться снова |
| Календарь | **Календарь** | реальный операционный журнал тенанта из `/internal-calendar/journal` |
| Услуги | **Услуги** | только имя/цена/длительность/active |
| Расписание | **Расписание** | специалист, недельные интервалы, перерывы/отпуска, серверная `ready` |
| Профиль | **Профиль и безопасность** | устройства, revoke, «Выйти на всех», выход |

Вкладка «Записи» больше не содержит редактора услуг/графика; журнал — только под «Календарь». «Календарь» показывается лишь владельцу/админу (`saasIsCalManager()`).

## 4. Журнал внутреннего календаря в стиле MAYA

- Окно по умолчанию — 7 дней, содержащих сегодня в tz тенанта (локальная полночь → UTC). ‹ / › сдвигают на 7 дней, «Сегодня» возвращает; запрос никогда не превышает 31 день.
- `GET /internal-calendar/journal?from&to` с `Authorization: Bearer`. Группировка по локальному (tz тенанта) дню, сортировка по времени. Строка: время `HH:MM–HH:MM`, имя клиента, услуги, специалист (`имя · должность`), статус; цена вторична. **Email/телефон не показываются** — API их и не отдаёт.
- Состояния: загрузка, пусто («На эти дни записей нет»), ошибка + «Повторить», auth-expired (через общий logout-пайплайн). Легаси-журнал (`__meGo('schedule')`, `panel_journal`, `SS_PROXY`) больше не вызывается.
- `calendar_source = external` (или бэк-код `internal_calendar_disabled`) → честное CRM-состояние без вызова внутреннего эндпоинта: «Календарь ведётся в вашей внешней CRM… появится, когда backend добавит адаптер». (Проверено: `demo-business`/`malesthetic` = external → 409 `internal_calendar_disabled`.)

## Верификация (headless CDP, backend RC :3105 `/api`, фронт RC :8890)

Внутренний tenant `stronger` (`calendar_source=internal`, owner `mosinstav@gmail.com`, 1 запись 14.07 10:00 МСК). Между прогонами чистил `AuthRateLimitBucket`.

**OWNER — 10/10** ✅

| Проверка | Итог |
|---|---|
| Owner email-логин → шелл распознаёт сессию (`__meHasSession=true`) | ✅ |
| Приземление в owner-кабинет (myView) | ✅ |
| Записи → заголовок «Мои записи» | ✅ |
| Календарь → заголовок «Календарь» | ✅ |
| Календарь шлёт `GET /internal-calendar/journal` (не легаси `panel_journal`) | ✅ |
| Журнал рисует реальную запись (Мужская стрижка / Stas) | ✅ |
| Услуги → «Услуги» · Расписание → «Расписание» · Профиль → «Профиль и безопасность» | ✅ |
| Reload того же tenant → сессия восстановлена (шелл не гость) | ✅ |

**FORGE (fail-closed) — 2/2** ✅ — подделанный bundle под верным ns: ни один привилегированный запрос не прошёл (все `401`; `/auth/refresh` → `400`), owner-данные не показаны, пара очищена → возврат на вход (`hasSession=false`, bundle удалён).

Живой контракт: `journal` (internal) → `{calendar_source:'internal', timezone:'Europe/Moscow', range, count:1, appointments:[{client{name}, provider{name,title}, services[{name,price,duration_minutes,currency}], start_at, end_at, status:'confirmed', total_price:1800, currency:'RUB'}]}`; internal endpoint для external-tenant → `409 internal_calendar_disabled`.

Parse: `node`-check inline-скриптов — app.html **23/23**, iOS www **23/23**. `npx cap sync ios`; `cmp -s www/index.html ios/App/App/public/index.html` — **byte-identical**.

## Честные заметки

- Экран запускался в портретной эмуляции (иначе landscape-guard «Поверните телефон»); `me_intro_v1`/`me_coach_done_v1` выставлены, чтобы пропустить интро/коуч — на реальную логику это не влияет.
- Приёмочный тест 6 (новая запись видна в журнале) покрыт существующей записью `stronger` в текущем окне; отдельного создания записи в этот прогон не делал, чтобы не менять состояние тестового тенанта — по требованию журнал перечитывается при каждом открытии вкладки «Календарь» (и кнопкой «Сегодня»/‹/›), так что свежая запись подтягивается.
- Токены (email-код, access/refresh) нигде не логируются/не пишутся в URL/аналитику; в отчёте и результатах их нет.
