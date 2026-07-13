# CLAUDE → CODEX: финальный статус фронта MAYA OS

> Claude, 2026-07-13. Консолидированный статус всей фронт-работы, чтобы понять, на каком мы этапе.
> Домен: только фронт (`app.html` PWA + iOS-зеркало). NestJS/Prisma/миграции/бэкенд не трогал. В `main` не сливал. Прод не деплоил.

## TL;DR — где мы

Весь фронт для линии **«MAYA OS: пробная версия → онбординг в чате → подписка/фичи»** реализован и проверен e2e против бэкенд-веток. Готово к приёмке/мержу. **Главный нерешённый организационный момент: почти вся моя работа НЕ закоммичена** — лежит в рабочих деревьях как ` M app.html`. Нужно решение Codex/Стаса: коммитить/мержить как есть или иначе.

## Ветки и состояние коммитов

| Worktree | Ветка | HEAD | Моя работа |
|---|---|---|---|
| `~/Desktop/maya-ai-onboarding` (канон фронта) | `codex/maya-os-trial-chat-fe` | `fa1eb797 docs: record MAYA OS frontend acceptance` | **uncommitted** (` M сайт и приложение/app.html`) — trial-chat + capability + баннер |
| `~/Desktop/maya-os-release-candidate` (сборка релиза) | `codex/maya-os-release-candidate` | `bae269f2 fix(branding): accept onboarding logo field` | **uncommitted** (` M app.html`) — перенёс только баннер-коллаж |
| `~/Desktop/maya-capability-readiness` | `codex/capability-readiness-contract` | — | бэкенд контракта, поднимал для проверки |

Backend `:3000` сейчас поднят из ветки `codex/capability-readiness-contract` (в ней есть и trial-эндпоинты, и `/crm/providers`, и `/features/registry`).

## Что сделано (пакеты + верификация)

### 1. `CLAUDE_MAYA_OS_TRIAL_CHAT` — пробная версия и онбординг в каноничном чате
Отчёт: `CLAUDE_MAYA_OS_TRIAL_CHAT_RESULTS.md`. Бэкенд `codex/human-onboarding-trial`.
- Экран входа: первичная кнопка «Получить пробную версию MAYA OS», email убран в общую группу (раскрытие по тапу), Telegram/Яндекс/«без авторизации» сохранены.
- Нижний лист активации: свайп (механика APromoBanner), `POST /api/onboarding/trial-activations {source:maya_os}` ровно 1 раз, `activation_token` только память + sessionStorage (не URL/localStorage/логи).
- Онбординг — **режим каноничного `AChat()`** (не визард): draft `/onboarding/ai/drafts` (+`trialActivationToken`) → `/messages`, `quick_replies` чипами, `needs_clarification` блокирует переход.
- Инлайн-подтверждение/логотип/CRM в той же ленте; `/confirm` (draftToken + trialActivationToken); `trial.days/ends_at` с сервера; `counted_as_connected_business` не инкрементим локально.
- Триал-состояние из `/mobile/config`; фенс подписки (config `subscription_required` или HTTP 402) → in-app лист подписки (`/api/billing/plans` + серверный `checkout_path`).
- God Mode: `Подключенные бизнесы = totals.connected_businesses` из `/api/admin/analytics/trials`.
- **Верификация: 21/21** (часть 1 — 13/13, часть 2 — 8/8), headless-CDP против бэка ветки, `connected_businesses` читал платформенным владельцем `owner@maya.local`.

### 2. `CLAUDE_CAPABILITY_READINESS` — fail-closed CRM + реестр готовности
Отчёт: `CLAUDE_CAPABILITY_READINESS_RESULTS.md`. Бэкенд `codex/capability-readiness-contract`.
- CRM-селектор строго из `GET /api/crm/providers`: токен только у `connectable` (YClients/Altegio); `mock` не как внешняя CRM; DIKIDI/Whitelines/Salon Online — `· Скоро`, форму токена не открывают; путь без CRM «Внутренний календарь MAYA» сохранён.
- HTTP 400 `crm_provider_not_available` → токен из памяти чистится, каталог перезапрашивается, возврат к выбору; токен CRM нигде не хранится. Есть и клиентский pre-check.
- `GET /api/features/registry` (schema_version=2) → `window.__ME_FEATURE_READINESS` + `__meFeatureReady(key,{universal})`; `planned` не рекламируем; entitlement по-прежнему решает доступ (readiness не разблокирует).
- **Верификация: 9/9** (в т.ч. восстановление из stale-`dikidi` через fetch-стаб).

> Ранее в этой линии уже приняты Codex (см. `CODEX_CLAUDE_FRONTEND_ACCEPTANCE.md`, `CODEX_AI_ONBOARDING_ACCEPTANCE.md`): AI-онбординг, внутренний календарь, in-app CRM-коннектор, session/rate-limit пайплайн.

### 3. Баннер триала — полноэкранный фотоколлаж (запрос Стаса, вне пакета)
- Нижний лист активации переделан в **полноэкранный**: коллаж 4 сфер (барбер / бьюти / массаж / стоматология) во весь экран (flex-регион над карточкой — видны все 4), снизу компактная белая карточка со слайдером и текстом; логотип/бренд-надпись убраны по просьбе.
- Коллаж встроен как `data:`-URI (`window.__ME_TRIAL_COLLAGE`, ~272 КБ JPEG) — офлайн в PWA/iOS. Исходники: `~/Desktop/maya-ai-onboarding/trial-media/`.
- Свайп/активация не менялись по смыслу (геометрия слайдера подогнана и перепроверена **5/5**).
- **Перенесён и в release-candidate** (`maya-os-release-candidate/сайт и приложение/app.html`) точечно — только блок баннера + коллаж-глобал, остальное в RC не тронуто.

## Состояние файлов (что где)

- `maya-ai-onboarding/сайт и приложение/app.html` — канон, всё вышеперечисленное. parse inline-скриптов **23/23**.
- `maya-os-release-candidate/сайт и приложение/app.html` — RC: имел мои принятые пакеты (онбординг/CRM/features), **добавлен полноэкранный баннер-коллаж**. parse **23/23**.
- `~/Desktop/maya-ios/www/index.html` — зеркало канона, `npx cap sync ios`, `ios/App/App/public/index.html` **byte-identical**.
- Встроенный коллаж в каноне и в RC **идентичен** новому исходнику (проверено побайтово).

## ⚠️ Важно для этапа

1. **Незакоммичено.** trial-chat + capability + баннер — в рабочих деревьях как ` M app.html`, не в коммитах. Приёмка Codex (`fa1eb797`) добавила только доки/скрины, сам `app.html` не коммитила. Риск: смена ветки/пересборка потеряет работу. **Нужно решение: коммитить/мержить.**
2. **Тестовый стенд Стаса грузит release-candidate** (`http://192.168.31.17`, отдаётся `python -m http.server` из `maya-os-release-candidate`), а не мой worktree. Поэтому изменения нужно держать синхронно и в RC (баннер уже перенёс). Плюс на телефоне бывает кэш — нужен hard-reload/`?v=`.
3. **RC = отдельная ветка** `codex/maya-os-release-candidate` (на ~245 строк длиннее моего файла) — там есть своя интеграция; я её не перезаписывал целиком, только точечный баннер. Если Codex собирает RC заново — нужно донести туда полноэкранный баннер + коллаж-глобал (`window.__ME_TRIAL_COLLAGE`).

## Открытые вопросы к Codex / что дальше

- Закоммитить принятый фронт (`app.html`) в `codex/maya-os-trial-chat-fe` и/или влить в `codex/maya-os-release-candidate`, чтобы работа не жила только в рабочем дереве.
- Свести источник истины для `app.html`: сейчас минимум 3 копии (worktree, release-candidate, основной репозиторий `~/Desktop/сайт и приложение`) — какая из них релизная.
- Прод-деплой (Beget PWA + iOS-сборка на устройство) я не делал — по правилам жду явного ОК; runbook есть (`CODEX_PROD_DEPLOY_AND_OAUTH_RUNBOOK.md`).
- Бэкенд-заметки по контрактам — в соответствующих `*_RESULTS.md` (поля `trial-activations`, `crm/providers`, `features/registry`, `billing/plans`, `analytics/trials` — все совпали с реализацией; расхождений, требующих правок бэка, не нашёл).

Итог: **фронт линии MAYA OS готов и проверен**, ждёт коммита/мержа и решения по релизной копии; прод-деплой — за отдельным ОК.
