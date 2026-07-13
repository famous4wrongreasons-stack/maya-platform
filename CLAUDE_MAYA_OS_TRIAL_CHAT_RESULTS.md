# CLAUDE_MAYA_OS_TRIAL_CHAT_RESULTS

> Ответ на `CLAUDE_MAYA_OS_TRIAL_CHAT_TASK.md`. Claude, 2026-07-13.
> Изолированный фронт-branch `codex/maya-os-trial-chat-fe` от `codex/human-onboarding-trial`,
> worktree `~/Desktop/maya-ai-onboarding`. В `main` не сливал.
> NestJS/Prisma/миграции/backend-тесты/backend-доки НЕ трогал; production не деплоился;
> untracked `android/` и `index.beta-basis-*.html` не трогал.

## Изменённые файлы

- `сайт и приложение/app.html` — единственный боевой бандл (auth-экран, нижний лист триала, онбординг в каноничном чате AChat, инлайн confirm/logo/CRM, триал-состояние + лист подписки, метрика God Mode).
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало (**byte-identical**); `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical** www.

Скриншоты (worktree root): `CLAUDE_TRIAL_CHAT.png` (онбординг в обычном чате MAYA), `CLAUDE_TRIAL_CONFIRM.png` (инлайн-подтверждение + триал), `CLAUDE_TRIAL_RESTORE.png` (восстановление после reload), `CLAUDE_TRIAL_SUB.png` (лист подписки с тарифами).

## Что сделано (по разделам пакета)

**1. Экран входа.** Первичная кнопка `Получить пробную версию MAYA OS` на месте email-пилюли (открывает нижний лист активации, НЕ запускает триал молча). E-mail перенесён в ту же группу, что Telegram/Яндекс — строка `Войти через email`, поле раскрывается по тапу. `Войти через Яндекс`, `Войти через Telegram`, `Продолжить без авторизации` сохранены. Отдельный вход «Настроить с Майей» убран (продуктовое решение — отдельного визарда/чата настроек больше нет).

**2. Нижний лист активации.** Aurora bottom-sheet над экраном входа (не новая страница, не полноэкранное промо). Спокойно объясняет: полный доступ на 10 дней; отсчёт — после регистрации бизнеса; далее нужна подписка. Свайп-контрол на механике `APromoBanner` (`-20%`-слайдер): pointer-физика, snap-back до порога, блокировка после успеха. На пороге РОВНО один раз `POST /api/onboarding/trial-activations {source:"maya_os"}`. Провал → слайдер сброшен/разблокирован + спокойный ретрай. Без `activation_token` в онбординг не входим. Токен — только память (`window.__meOnb`) + session-scoped `sessionStorage` (никогда URL/console/analytics/error/localStorage).

**3. Онбординг в обычном чате MAYA.** Отдельный `lgCreate`/`aiWrap` больше не презентация — онбординг это режим каноничного `AChat()`: та же полноэкранная Aurora-оболочка, шапка (`Maya · Администратор · онлайн`), спейсинг сообщений, пузыри, композер и голосовой ввод. Поведение: после активации MAYA открывает обычный чат и приглашает описать бизнес; шаблоны — компактными чипами в ленте (не опросник); старт `POST /onboarding/ai/drafts` (+`trialActivationToken`); дальше `/messages`; `assistant_message` рисуется обычным пузырём MAYA; `quick_replies` рисуются чипами под последним ответом (видимый текст = `label`, тап шлёт `message` тем же `/messages`); во время запроса чипы отключены; при новом сообщении устаревшие чипы убираются; `confidence`/`interpreter_source` не показываются; текст ответа не парсим для «выдумывания» ответов; `needs_clarification:true` не даёт перейти к подтверждению (кнопка «К подтверждению» только при пустом `missing_fields` и `!needs_clarification`); ответ одним словом остаётся обычным сообщением. draft+activation токены только в session-scoped state.

**4. Подтверждение / логотип / CRM — в той же ленте.** Подтверждение — инлайн-карточка в том же треде (название, тип бизнеса чипами, расписание, специалисты, услуги add/remove, недельный график с бейджем «предположительно — проверьте», контакты владельца — только здесь). `/confirm` шлёт `draftToken` + тот же `trialActivationToken`. После успеха — сообщение с `trial.days`/`trial.ends_at` с сервера; доверяем `counted_as_connected_business`, локальный счётчик НЕ инкрементим; internal → инлайн-шаг логотипа (загрузка/пропуск, logo-only, без билдеров цвета/шрифта/темы); external → защищённый in-app CRM-коннектор (токен CRM только в памяти, не в чат/логи/storage). Ошибки активации (`invalid_trial_activation_token`, `trial_activation_expired`, `trial_activation_not_pending`, `trial_activation_draft_exists`, `trial_activation_draft_mismatch`, `trial_activation_token_required`) → спокойная копия MAYA + восстановимое действие. Если локальный draft-токен потерян или недействителен, текущая активация корректно завершается и предлагается новая: привязанный к активации серверный draft нельзя безопасно восстановить без токена. Старое AI-draft-error поведение сохранено.

**5. Триал-состояние + подписка.** Из `GET /mobile/config/:slug` читаю `access_state`, `subscription_required`, `trial.days_remaining`, `trial.full_access`, `subscription_cta` в `__SAAS_TENANT` (сервер авторитетен, локальный таймстамп не разблокирует). Во время `trial_active` — неброский индикатор дней в owner-области (owner-роль + owner-экраны). При `subscription_required` (конфиг) ИЛИ HTTP `402` `error.code:"subscription_required"` (перехват в `localBookingFetch`) — открывается in-app лист подписки (не generic-ошибка): тарифы из `GET /api/billing/plans`, CTA идёт на серверный `checkout_path`. Биллинг/детали тенанта остаются доступны (лист закрывается).

**6. God Mode.** Для платформенного владельца — `GET /api/admin/analytics/trials` (Bearer). Главная метрика ровно `Подключенные бизнесы = totals.connected_businesses` (не `trial_swipes`). Дополнительно из того же ответа: в ожидании/брошено/активных/оплатили. Значения только с сервера, не из локальных жестов. Карточка добавлена во вкладку «Платформа» дашборда God Mode.

## Верификация (headless CDP, backend ветки `codex/human-onboarding-trial` :3000, фронт :8787)

Backend поднят локально из ветки (prisma migrate deploy `20260713150000_human_onboarding_trial` + seed + build + start:prod). Платформенный владелец `owner@maya.local` для чтения `connected_businesses` до/после. Между прогонами чистил `AuthRateLimitBucket` в dev-БД.

Часть 1 — **13/13**:

| Проверка | Итог |
|---|---|
| Экран входа: CTA + Telegram/Яндекс/email/«без авторизации» | ✅ |
| Лист триала объясняет 10 дней | ✅ |
| Неполный свайп → 0 активаций + snap-back (`translateX(0px)`) | ✅ |
| Полный свайп → **ровно 1** активация | ✅ |
| Свайп открывает онбординг-чат (не визард) | ✅ |
| Естественная история продвигает blueprint до «К подтверждению» | ✅ |
| Контакты в диалоге не спрашиваются | ✅ |
| Инлайн-карточка подтверждения в ленте | ✅ |
| Телефон обязателен на подтверждении | ✅ |
| Confirm → сообщение «Пробная версия MAYA OS активна … 10 дней» | ✅ |
| internal → инлайн-шаг логотипа | ✅ |
| `connected_businesses` **+1** после регистрации (0→1 через analytics) | ✅ |
| session-scoped онбординг очищен после confirm | ✅ |

Часть 2 — **8/8**:

| Проверка | Итог |
|---|---|
| Abandon: свайп (activation) без регистрации → `trial_swipes`+1, `connected_businesses` без изменений | ✅ |
| Reload восстанавливает онбординг в чате («С возвращением») | ✅ |
| `activation_token` не в localStorage/URL (только sessionStorage) | ✅ |
| session-scoped draft/activation переживает reload | ✅ |
| Лист подписки показан на фенсе (`Подписка MAYA OS` + `Оформить подписку`) | ✅ |
| Тарифы подтянуты из `/billing/plans` (start/pro/max, ₽/мес) | ✅ |
| Неоднозначный ответ → чипы = ровно `quick_replies` бэка (`["Взять из шаблона","Перечислю сам"]`) | ✅ |
| Ответы одним словом сохраняют факты (specialists=3 доехали до карточки) | ✅ |

Parse / зеркало: `node --check` inline-скриптов — app.html **22/22**, iOS www **22/22**; `npx cap sync ios`; `cmp -s www/index.html ios/App/App/public/index.html` — **byte-identical**.

## Фактические наблюдения по контракту (сообщаю, а не притворяюсь)

- `POST /api/onboarding/trial-activations` вернул `activation_token`/`expires_at`(24ч)/`trial_days:10`/`trial_starts_when:"registration_completed"`/`counted_as_connected_business:false` — совпало с доком; беру `activation_token` (с фолбэком `activationToken`).
- Ответ черновика содержит `quick_replies:[{label,message}]`, `needs_clarification`, `blueprint`, `missing_fields` — рендерю ровно их; текст не парсю.
- `GET /api/admin/analytics/trials` `totals`: `connected_businesses`, `trial_swipes`, `pending_registrations`, `abandoned_registrations`, `active_trials`, `expired_trials`, `paid_conversions` — метрика God Mode берёт `connected_businesses`, вторичные поля — best-effort по этим именам.
- `GET /api/billing/plans` отдаёт массив с `name`/`price_monthly` — добавил `price_monthly` в извлечение цены (кроме `price`/`amount`/`monthly_price`).
- Детерминированный интерпретатор (без OPENAI_API_KEY) отдаёт `quick_replies` и продвигает blueprint на форматах «Услуги: … руб … минут» и коротких репликах — этого хватило для всех проверок.

## Оставшиеся заметки (осознанно отложено / зона Codex)

- **Триал-индикатор дней** (5a) реализован (owner-роль + owner-экраны + `access_state==='trial_active'`), но отдельного e2e нет — для него нужен живой `trial_active` конфиг с owner-сессией; фенс подписки (конфиг + HTTP 402) и `/billing/plans` проверены.
- **Оплата подписки**: CTA идёт на серверный `checkout_path`, передаёт выбранный `planId` и открывает возвращённый `confirmation_url`; прод-платёж — вне локального слайса (по доку).
- **Достижимость God Mode для SaaS-платформенного владельца**: карточка «Подключенные бизнесы» и её фетч из SaaS-бэка (`/admin/analytics/trials` с owner-токеном) готовы; сам эндпоинт проверен вживую (0→1 до/после регистрации). Роутинг «когда SaaS-платформенный владелец видит AGodMode» — за бэком/навигацией Codex; backend в этой ветке я не менял.

## Дополнение Codex после приёмки

После завершения пакета Codex сверил UI с фактическими backend-контрактами и исправил пограничные расхождения: обязательные `ownerEmail`/`ownerName`/`ownerPhone`, JSON checkout с выбранным `planId`, ответ YooKassa `confirmation_url`, безопасный перезапуск при потерянном draft-токене, fail-closed readiness в universal-режиме и блокировку скрытых запросов к legacy `malesthetic.pro` для чужого tenant. Также убраны салонные/барбершопные данные из универсального home; production-режим существующей MAYA сохранён отдельно.
