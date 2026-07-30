# CLAUDE_PREPUBLICATION_FRONTEND_RESULTS

> Ответ на `CLAUDE_PREPUBLICATION_FRONTEND_TASK.md`. Claude, 2026-07-16.
> Ветка **`claude/prepublication-frontend`** (от `de2fe106`, ветка `codex/maya-os-final-integration`).
> Коммиты: **`06a5bb1c`** (P0-интеграция) + **`5dbe4178`** (double-tap guard + saas-роутер в legacy boot) + RESULTS/скрины.
> iOS-зеркало: `maya-ios` ветка `codex/maya-os-trial-chat-ios`, коммит **`3b9ba39`**.
> NestJS/Prisma/миграции/политику не менял. Production не деплоил, приложение на телефон НЕ ставил (по условию пакета).

## Изменённые файлы

- `сайт и приложение/app.html` — вся интеграция (P0 §2–§9).
- `сайт и приложение/oauth-callback.html` — очистка stale business-onboarding после успешного соц-входа.
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — те же правки `patch`-ем (18/19 ханков; ханк MEApp-роутера вставлен вручную вокруг iOS-only `__meReadBusinessOnboarding`); iOS-only блоки (owner-preview, native-login, `__meReturnToLegacyWorkspace`) сохранены; `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical**.

Прочитаны перед началом: `docs/architecture/ai-core.md`, `ai-tool-runtime-runbook.md`, `prepublication-readiness-2026-07-15.md`, `maya-saas-backend/README.md`.

## Что сделано

**§2 Единый чат** — авторизованный SaaS-чат шлёт `POST /api/ai/chat`: `surface` = `native` (Capacitor) / `web`, `requestId` = UUID, ≤12 последних сообщений, роли только user/assistant, контент ≤2000 знаков. `reply` рендерится ТОЛЬКО как текст (React text node, не innerHTML). `safe_fallback` — валидный ответ (не ошибка). JWT + общий refresh: постоянный мост `window.__meSaasAuthedFetch` из ABookFlow (единственный пайплайн: single-flight, межвкладочный lock, терминальные коды → logout); когда ABookFlow ещё не поднимался в этой загрузке — ограниченный фолбэк с уважением того же межвкладочного lock и терминальных кодов (один retry, не цикл). Ключи провайдеров во фронт не попадают; второго «мозга» нет.

**§3 Approvals** — `action.status==='approval_required'` → ч/б карточка из серверных данных (человекочитаемый tool, `summary`, `payload_preview`, «Действует до HH:MM»). Approve/Reject → `POST /api/ai/approvals/:id/{approve,reject}` с `{payloadHash}`. До подтверждения никакая мутация не изображается выполненной; двойной тап блокируется синхронным ref-гардом (два тапа в одном кадре = 1 POST); 401 → общий refresh один раз; 409 → «истекло или уже обработано»; 429 → сообщение с `retry_after_seconds`; reject никогда не исполняет; `replayed` approve не даёт второго визуального результата (после успеха кнопок нет); после успеха — событие `me-saas-data-changed` + точный итог в карточке.

**§4 Роутинг** — стартовый экран выбирает серверная роль из tenant-сессии (и MEApp-инициализация, и legacy boot-роутер, который раньше уводил всех через `panel_me` на home): owner/admin/manager/staff → кабинет бизнеса, client/customer → клиентское приложение. `manager` добавлен в email-роутинг. Успешный вход (email/phone/oauth-callback) очищает stale `me_onb_v1` → клиентский вход никогда не открывает чат «создадим ваш бизнес».

**§5 Безопасный API/tenant** — на публичном домене query-параметры не читаются вообще; API строго `${location.origin}/api` (или подписанный `window.__ME_TENANT_BOOT` — только https и не-localhost); tenant — из серверного boot-конфига/meta `me-tenant`/дефолт; сохранённые localhost-значения чистятся; при попытке локального API — fail closed (saas-режим не активируется). Тестовые overrides работают только на `localhost`/`127.0.0.1` (Capacitor-шелл — тоже localhost). `me_saas_auth_v2:<ns>` и rotation/fence не менялись.

**§6 Экраны** — владелец/менеджер: вкладка «Обзор» (`/analytics/business` + `/customers` count + `/expenses`, 30 дней, подпись «источник: backend»); сотрудник: вкладка «Статистика» (`/analytics/me`); клиент: карточка «Баллы» (`/loyalty/me` + транзакции) во вкладке «Записи» — суммы строго из backend, фронт ничего не начисляет. Блоки гейтятся серверной ролью + feature policy.

**§7 Features/trial** — подключён `GET /api/features/effective` (entitlement, обновляет `__SAAS_FEATURES`) поверх реестра readiness; чат гейтится AI-профилем (`ai.owner`/`ai.admin`/`ai.consultant`), а не legacy `ai_chatbot`; `402` открывает существующий subscription-лист (`__meSubOpen`); публичная кнопка триала и private-gate не тронуты.

**§8 PWA** — `GET /api/mobile/pwa/:slug/install` → подмена `<link rel="manifest">` на tenant-манифест; apple-touch-icon меняется ТОЛЬКО при `has_custom_icon=true`, иначе остаётся MAYA-фолбэк; нативный Capacitor не трогается (иконка MAYA из App Store). Лого в приложении — `object-fit: contain` + `__ME_LOGO_UPLOADED`-гейт (без чёрного квадрата) — из прошлых пакетов, сохранено.

**§9 UX** — монохром; онбординг в каноничном чате, quick replies шлют реальный message-turn (проверено e2e); клавиатурный контур/семидневный график/быстрый онбординг не тронуты.

## Acceptance matrix (доказательства)

| # | Пункт | Статус |
|---|---|---|
| 1 | Client login → клиентский интерфейс | **PASS (частично live)**: phone-клиент live (кабинет клиента, ни следа «создадим ваш бизнес»); oauth-механизм live-эквивалентом (bundle из oauth-callback → boot → клиентский экран — APPROVALS 1-й пункт); email-клиент — та же ветка `lgEmailVerify` (роль вне owner/staff-списков → клиентский путь), live-подтверждена для owner-роли; реальный OAuth-провайдер локально недоступен (нет client_id) |
| 2 | Owner private preview → trial → onboarding → подтверждение | **PASS**: полный API-флоу (activation→drafts→confirm→tenant) выполняется в каждом прогоне prep; UI-онбординг 12/12 |
| 3 | Шаблон профессии → полный набор услуг; график редактируется | **PASS**: ONB 12/12 (FI), WEEK1 7/7 (FI) — payload 7 правил вкл. `{weekday:0,"11:00","17:00"}` |
| 4 | AI read-only → ответ в обычном чате | **PASS**: AI CHAT 3/3 (payload-контракт проверен перехватом; safe_fallback рендерится текстом) |
| 5 | AI write → proposal, без изменений до approve | **PASS**: APPROVALS — карточка из реального approval; запись оставалась `confirmed` до approve |
| 6 | Reject не меняет данные | **PASS**: после reject запись `confirmed` (проверено API) |
| 7 | Approve ровно один раз; повтор безопасен | **PASS**: двойной тап → ровно 1 POST; сервер выполняет idempotent (запись `canceled`); после успеха кнопок нет |
| 8 | Истёкший trial → 402 и экран подписки | **PASS (сетевой стаб)**: 402 на `/ai/chat` через network-перехват → сообщение + существующий subscription-лист; серверный 402-путь тот же код |
| 9 | Публичный host никогда не зовёт localhost | **PASS**: host `public.test` + сохранённые localhost-значения + query-override → 0 запросов к localhost, API=same-origin, stored localhost стёрт, tenant=default |
| 10 | Tenant A не появляется в tenant B | **PASS**: bundle A в своём ns; на B — гостевая оболочка; bundle A сохранён |
| 11 | Refresh rotation/reload/revoke без бесконечного retry | **PASS (наследие)**: пайплайн не менялся (проверен пакетами session-pipeline: 10 acceptance + конкурентные смоуки); в этом пакете — restore-by-role на reload live; отдельные rotation-смоуки не перегонял |
| 12 | Tenant PWA получает logo; native — MAYA icon | **PASS**: manifest → `mobile/pwa/demo-business/manifest.webmanifest`; без custom icon apple-touch-icon остаётся MAYA; native-гейт кодом (Capacitor → не трогаем) |
| 13 | Quick replies/клавиатура/скролл на реальном iPhone | **NOT RUN на устройстве** (пакет запрещает установку в этом раунде): проверено в эмуляции 390×844; quick replies шлют реальные ходы (ONB e2e); реальный iPhone — в общем pre-publication build Codex |

## Команды и итоги проверок

- Parse `new Function(...)`: **app.html 23/23, maya-admin.html 1/1, maya-start.html 1/1, oauth-callback.html 1/1**; iOS www **24/24**.
- Ширины: mobile 390×844 (все e2e) + desktop 1280×800 (`CLAUDE_PREPUB_DESKTOP.png`, rotate-lock не срабатывает).
- iOS: `npx cap sync ios`; `cmp -s www/index.html ios/App/App/public/index.html` → **byte-identical**. Паритет маркеров FI↔iOS совпадает; iOS-only блоки на месте.
- e2e-прогоны (headless CDP, backend `codex/maya-os-final-integration` :3106, фронт :8891, `AI_CORE_PROVIDER=safe`): AI CHAT **3/3**, APPROVALS **8/8**, PUBLIC HOST **5/5**, OWNER **3/3**, ISOLATION **2/2**, PAY402 **2/2**, PWA **2/2**, ONB **12/12**, WEEK1 **7/7**.
- Скриншоты: `CLAUDE_PREPUB_APPROVAL.png` (карточка подтверждения), `CLAUDE_PREPUB_REJECT.png`, `CLAUDE_PREPUB_BIZ.png` («Обзор» владельца), `CLAUDE_PREPUB_DESKTOP.png`.

## Осталось / не удалось воспроизвести

1. **Реальный OAuth Telegram/Яндекс** локально не запускается (нет provider credentials) — механизм проверен эквивалентом (bundle, который пишет oauth-callback → boot-роутер); сам oauth-callback дополнен очисткой stale-онбординга. Нужен прогон на staging с ключами.
2. **Живой iPhone** — по условию пакета не ставил; эмуляция 390×844 пройдена. Пункт 13 закрыть в общем pre-publication build.
3. **Email-вход клиента** — в seed нет клиентского email-пользователя; ветка роутинга общая с проверенной owner-веткой (роль вне списков → клиентский путь). Стоит добавить클иентский email-акк в staging-чеклист.
4. **402 живым сервером** — триал новых тенантов активен 10 дней; ждать истечения нельзя, гонял сетевым стабом того же кода. Серверный 402-контур у Codex проверен smoke-ом.
5. Для локальной проверки добавил в `maya-saas-backend/.env`: `PORT=3106`, `DATABASE_URL=maya_os_fi_local`, `AI_CORE_PROVIDER=safe`, `PHONE_AUTH_FIXED_CODE=123456`, CORS `:8891` — файл gitignored, в коммиты не входит.
6. Тестовые тенанты `vladelets-test*` созданы прогонами в локальной FI-БД — прод не затронут.
