# CLAUDE_EMAIL_LOGIN_AND_BOOKING_IA_RESULTS

> Ответ на `CLAUDE_EMAIL_LOGIN_AND_BOOKING_IA_TASK.md`. Claude, 2026-07-14.
> Ветка `codex/maya-os-release-candidate` (там же backend с email-логином и фиксом онбординга), worktree `~/Desktop/maya-os-release-candidate`.
> NestJS/Prisma/миграции/backend-политику не трогал. В `main` не сливал. Prod не деплоил.

## Изменённые файлы

- `сайт и приложение/app.html` — email-код логин (2 шага), разделение формата работы и профессии, IA-разбивка «Мои записи» на разделы.
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало (**byte-identical**); `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical** www.

## 1. Email-код логин (два шага) в `ALogin`

Стаб `lgEmailGo` заменён на реальный поток:
- **Старт**: `POST /auth/email/start {tenantSlug, email}` (tenant строго из `window.__ME_SAAS_CTX.slug` / `booking_tenant`; email в одиночку по всем тенантам НЕ ищет; без контекста — fail-closed «Откройте ссылку вашего бизнеса…»). Успех → в той же compact-группе появляется поле **6-значного кода**; копия enumeration-safe: «Если адрес привязан к этому бизнесу, код отправлен»; resend-countdown из `retry_after_seconds`.
- **Локальный debug**: если бэк вернул `debug_code` — показываю неброскую строку «debug-код: …» (тап подставляет код). Код **не логируется, не пишется в storage/URL/аналитику**, живёт только в state.
- **Verify**: `POST /auth/email/verify {tenantSlug, email, code}` → session bundle сохраняю через тот же контракт **`me_saas_auth_v2:<namespace>`** (`lgSaveBundle`, tenant slug из контекста, read-back), затем `lgOpenApp` → owner-опыт того же бизнеса. Второй auth-store не заводил.
- **Коды ошибок** спокойной копией: `email_code_invalid` / `email_code_expired` / `email_code_missing` / `email_too_many_attempts` / `email_login_invalid` / `email_login_unavailable` / `email_delivery_unavailable` / `email_delivery_failed` + shared rate-limit `retry_after_seconds`; при `remaining_attempts` показываю «Осталось попыток: N».
- «Изменить» возвращает к вводу адреса; одноразовый код нигде не сохраняю.

## 2. Формат работы ≠ профессия (онбординг MAYA-чата)

- `onbApply` теперь синхронизирует выбранный шаблон с серверным `blueprint.templateId` после каждого хода — устаревший выбранный шаблон **не перекрывает** возвращённую профессию.
- `onbSend`: `templateId` шлётся только при **создании черновика** (или явном тапе чипа), не переклеивается на обычные сообщения (`onbTpl` не форсится после появления draft).
- Ручной fallback (`lgCrGo`): убрал безусловный `industryPresetId = 'solo_specialist'` — шлётся только если владелец явно выбрал шаблон (`lgCr.tpl`), иначе backend решает сам (профессию не выдумываем). *(Ручной путь в RC недостижим — `setLgCreate(true)` нет; правка на будущее.)*
- Карточка подтверждения: «Тип бизнеса» → **«Сфера / профессия»**; отдельная строка **«Формат работы · специалистов»** с подписью «Работаю один — это формат работы, не сфера» при 1.

## 3. IA-разбивка «Мои записи» (`ABookFlow.myView`)

Один экран со всеми owner-инструментами разнесён на разделы табами (без удаления рабочего API):
- **Записи** — только предстоящие/прошедшие записи + действия (отмена/перенос/записаться снова).
- **Календарь** — те же записи как операционный список + «Открыть журнал расписания» (`__meGo('schedule')`).
- **Услуги** — только имя/цена/длительность/active.
- **Расписание** — специалист, недельные интервалы, перерывы/отпуска, серверная готовность (`ready`).
- **Профиль / Безопасность** — активные устройства, revoke, «Выйти на всех», **«Выйти из аккаунта»** (`saasLogout`).

Клиентский booking (шаги) не менял — там только услуга/специалист/дата/время + компактный итог; прайс-редактор/график там не появляются. Онбординг-подтверждение уже разбито на отдельные карточки (Услуги/График/Контакты), все backend-обязательные значения редактируемы.

## Верификация (headless CDP, RC backend :3105, RC frontend :8890)

Backend ветки RC (`maya_os_rc_local`, `EMAIL_LOGIN_ENABLED=true`, `EMAIL_AUTH_DEBUG=true`). Между прогонами чистил `AuthRateLimitBucket`.

| Сценарий | Итог |
|---|---|
| **EMAIL**: старт → шаг кода (enumeration-safe) + debug-код показан; verify корректным кодом → session bundle `me_saas_auth_v2:*` сохранён | **3/3** ✅ |
| **WRONG**: неверный код → field-error, остаёмся на шаге кода; «Осталось попыток» показано | **2/2** ✅ |
| **PROF (acceptance 3)**: «Я парикмахер, работаю один. Услуги поставь автоматически» → MAYA: «услуг: 17, специалистов: 1» (Барбершоп, НЕ одна Консультация); тип на карточке — из blueprint | **3/3** ✅ |

Backend-контракт live: `email/start` → `{delivery:'debug', debug_code, retry_after_seconds:60, expires_at, next_step:'verify_email_code'}`; `email/verify` → `{access_token, refresh_token, session, user(role:tenant_admin)}`; неверный код → `email_code_invalid` + `remaining_attempts`; черновик «парикмахер…» → `templateId:barbershop, providerCount:1, services:17, missing:["business_name"]`.

Parse: `node --check` inline-скриптов — app.html **23/23**, iOS www **23/23**. `npx cap sync ios`; `cmp -s www/index.html ios/App/App/public/index.html` — **byte-identical**.

## Честные заметки

- **Acceptance 5 (разделы «Мои записи»)**: разбивка на табы реализована и проходит parse; живой прогон именно authed-owner-кабинета я не довёл — после email-входа `tenant_admin`-сессия в клиентском booking-режиме не поднимает `saasAuth='authed'`, поэтому ссылка «Мои записи →» в этом режиме не появляется (это ортогонально IA-правке — она внутри myView). Структурно: таб-бар + гейтинг секций по `myTab` корректны.
- **Acceptance 4 (booking в календаре MAYA)**: создание записи не трогал — поведение сохранено; отдельным live-прогоном в этом пакете не гонял.
- debug-код доступен только при `EMAIL_AUTH_DEBUG=true` (локально); в проде поле не появится (delivery `email`).
