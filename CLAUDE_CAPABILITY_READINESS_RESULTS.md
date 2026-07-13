# CLAUDE_CAPABILITY_READINESS_RESULTS

> Ответ на `CLAUDE_CAPABILITY_READINESS_TASK.md`. Claude, 2026-07-13.
> Фронт-продолжение поверх текущего пакета trial/chat, ветка `codex/maya-os-trial-chat-fe`
> (worktree `~/Desktop/maya-ai-onboarding`). Незакоммиченную работу trial/chat не трогал/не сбрасывал.
> Backend-ветка контракта `codex/capability-readiness-contract` поднята локально для проверки.
> NestJS/Prisma/миграции/backend не менял; в `main` не сливал; production не деплоил.

## Изменённые файлы

- `сайт и приложение/app.html` — CRM-селектор fail-closed из `GET /api/crm/providers` + обработка 400; потребление `GET /api/features/registry` (schema_version=2) с readiness-гейтом виджетов.
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало (**byte-identical**); `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical** www.

Скриншот: `CLAUDE_CAP_CRM.png` (CRM-экран с fail-closed каталогом).

## CRM-селектор (fail-closed, источник истины — сервер)

При входе в стадию CRM тянется `GET /api/crm/providers`; каталог = единственный источник истины:
- токен принимается только у провайдера с `connectable=true` — реальный выбор показан для **YClients** и **Altegio**;
- `mock` **не** показывается как внешняя CRM (это локальные/тест/trial-preview данные) — скрыт из списка;
- **DIKIDI / Whitelines / Salon Online** (`connectable=false`, `planned`) не открывают форму токена — показаны неактивными с спокойным `· Скоро`, никогда как успешно подключаемые;
- `Внутренний календарь MAYA` остаётся продовым путём без CRM (кнопка «Подключить позже» + пояснение в шапке экрана).

Форма токена (`API-токен` + `ID компании` + «Сохранить и проверить») рендерится только когда выбранный провайдер реально `connectable`. Если выбор не подключаем (в т.ч. восстановлен из stale) — формы нет, кнопки сохранения нет, спокойное «выберите YClients или Altegio».

**HTTP 400 `crm_provider_not_available`:** токен чистится из памяти (`setOnbCrm token=''`), каталог перезапрашивается (`GET /api/crm/providers`), выбор сбрасывается на реально подключаемый провайдер, показывается восстановимое сообщение. Токен CRM никогда не попадает в `localStorage`/`sessionStorage`/URL/логи/аналитику. Есть и клиентский pre-check `onbProvOk(...)` перед отправкой — прямой stale-провайдер не уходит на бэк вовсе (а если ушёл — 400-обработчик восстанавливает).

Старый неиспользуемый CRM-блок в `ALogin` (`lgCrm`/`aiWrap`) недостижим (`setLgCreate(true)` нет ни одного) — активный коннектор один, в чате-онбординге (`onbCrm`), его и привёл к контракту.

## Feature-registry (потребление контракта, без over-claim)

На бутстрапе (saas-режим) тянется `GET /api/features/registry` (schema_version=2, 41 фича) → `window.__ME_FEATURE_READINESS` (map `key → {implementationStatus, availableIn, limitations}`) + helper `window.__meFeatureReady(key, {universal})`:
- entitlement по-прежнему решает коммерческий доступ (`__SAAS_FEATURES`/tenant-gate не тронул);
- readiness решает, можно ли выдавать модуль за рабочий: `planned` → не показываем как доступный; `current_runtime_only` → не выдаём за готовый **универсальный** платформенный модуль (флаг `universal`), но он остаётся рабочим в текущем рантайме MAYA (этот `app.html`); `partial` — в пределах `limitations`;
- **никогда** не разблокирует фичу из одной readiness-метаданной (helper только гейтит показ, доступ — за entitlement).

Применено к реальному surface: гейт виджетов главной (`ATile`) теперь дополнительно скрывает виджет, если его фича `planned`. В существующем production-режиме MAYA текущие виджеты (`shop`/`loyalty`/`ai_chatbot` = `current_runtime_only`) остаются видимы. В universal SaaS-режиме они скрываются до появления tenant-aware реализации; AI-чат доступен как отдельное безопасное исключение только во время onboarding.

## Верификация (headless CDP, backend `codex/capability-readiness-contract` :3000, фронт :8787)

`GET /api/crm/providers` вживую: `selectable=[yclients,altegio,mock]`; `yclients:ready`, `altegio:ready`, `mock:development_only`, `dikidi/whitelines/salon_online:planned/connectable=false`.

Сценарий (external-онбординг → стадия CRM; первый `/crm/providers` подменён stale-стабом, где `dikidi.connectable=true`, чтобы проверить восстановление; далее — реальный бэк) — **9/9**:

| Проверка | Итог |
|---|---|
| External-онбординг доходит до стадии CRM | ✅ |
| `mock` не показан как внешняя CRM | ✅ |
| `planned` (Whitelines/Salon Online) — неактивны, `· Скоро` | ✅ |
| Прямая stale-отправка `dikidi` → восстановимое «недоступно» | ✅ |
| CRM-токен не сохранён (ls/ss/url пусто) | ✅ |
| Поле токена очищено после «недоступно» | ✅ |
| `dikidi` после refresh каталога — не подключаем (`· Скоро`) | ✅ |
| YClients/Altegio остаются выбираемыми (форма токена появляется) | ✅ |
| Путь без CRM «Внутренний календарь MAYA» доступен | ✅ |

Feature-registry: в браузере `window.__ME_FEATURE_READINESS` = 41 ключ; helper на месте. Проверены оба режима: current MAYA сохраняет существующие модули, universal SaaS скрывает `current_runtime_only` и `planned` поверхности.

Parse / зеркало: `node --check` — app.html **22/22**, iOS www **22/22**; `npx cap sync ios`; `cmp -s www/index.html ios/App/App/public/index.html` — **byte-identical**.

## Заметки

- «Планируемый CRM нельзя выбрать даже из restored stale state» покрыто двумя рубежами: клиентский pre-check (не отправляем) + серверный 400 `crm_provider_not_available` с восстановлением (проверено стабом, имитирующим stale-каталог).
- Реального сетевого вызова в прод-CRM в e2e не делал: stale-провайдер отбивается 400 до внешнего API; для YClients/Altegio проверял только достижимость формы (без валидного токена).
- feature-registry потреблён и применён к universal-навигации, home-виджетам, быстрым действиям и прямому переходу в чат; отдельного платформенного каталога модулей пока нет.
