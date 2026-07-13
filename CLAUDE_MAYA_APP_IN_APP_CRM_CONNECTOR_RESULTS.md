# CLAUDE_MAYA_APP_IN_APP_CRM_CONNECTOR_RESULTS

> **Финальное состояние:** после независимой приемки Codex поле Base URL удалено из tenant UI, YClients/Altegio оставлены активными, остальные CRM помечены `скоро`, а имя владельца обязательно. Актуальный протокол: `CODEX_AI_ONBOARDING_ACCEPTANCE.md`.
>
> Ответ на `CLAUDE_MAYA_APP_IN_APP_CRM_CONNECTOR.md`. Claude, 2026-07-13.
> worktree `~/Desktop/maya-ai-onboarding`, ветка `codex/ai-onboarding-foundation`.
> NestJS/Prisma/миграции/backend-тесты не тронуты; production не деплоился; untracked `android/` и `index.beta-basis-*.html` не тронуты.

## Изменённые файлы

- `сайт и приложение/app.html` — in-app CRM-коннектор + фиксы restore/confirm/bundle;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало (**byte-identical**); `npx cap sync ios`; `ios/App/App/public/index.html` — **byte-identical** www.
- `maya-admin.html` из прошлого follow-up **не менялся** и новый онбординг от него больше **не зависит** (deep-link убран).

Скриншот: `CLAUDE_AI_CRM_CONNECTOR.png` (in-app CRM-экран).

## Реализованные сценарии

**1. CRM-подключение прямо в `app.html`.** Стадия `lgAiStage==='crm'` — полноценный защищённый коннектор в Aurora-стиле, без перехода в `maya-admin.html`:
- провайдеры чипами: YClients, Altegio, DIKIDI, Salon Online, Whitelines;
- API-токен как `type=password`; ID компании (→ `settingsJson.companyId`, число если числовой); опциональный Base URL (поддержан текущим DTO);
- «Сохранить и проверить»: `PATCH /admin/tenants/:id/crm`, при `404` → `POST`, затем `POST /admin/tenants/:id/test-crm`; спокойные loading/success/error; после успешной проверки — открытие MAYA нового tenant в preview (`lgOpenApp`);
- «Подключить позже» — сразу preview;
- все запросы с `Authorization: Bearer <lgAiResult.token>` из памяти flow; на входе в стадию — best-effort `GET /admin/tenants/:id` для префилла текущего провайдера (без токена).

**Безопасность.** `status:'live'` не отправляется (live не включается); при `test` данные в прод не пушатся (проверка соединения). API-токен только в React-state (`lgCrm.token`) — не в `localStorage`/`sessionStorage`/URL/логах/сообщениях/result-файле; после успешного сохранения поле токена очищается; сохранённый серверный токен обратно не подставляется (GET его не отдаёт). Введённые данные при ошибке сохраняются (кроме токена при успехе).

**2. Restore AI-черновика.** `/read` вызывается строго через сохранённый `s.apiBase` (нормализован по trailing slash, проверка `^https?://`), не через текущий `lgApiBase()`. Нет `apiBase`/невалиден → черновик чистится, начинаем заново. В `sessionStorage` по-прежнему только `{draftId, draftToken, apiBase}`.

**3. Invalid/expired на confirm.** В `lgAiConfirm` коды `invalid_ai_onboarding_token`/`ai_onboarding_expired` → `lgAiHardReset(...)` (как в `lgAiSend`): авто-возврат в новый диалог, без ручного «назад».

**4. Одинаковые slug разных backend.** Новый CRM-flow **не ищет** bundle в localStorage — использует `lgAiResult.token`/`tenantId`/`api` из памяти. Прежний admin-deeplink (с поиском bundle по паре slug+api_base) удалён.

**5. iOS-зеркало.** `app.html` ⇄ `www/index.html` byte-identical; `cap sync ios`; `www/index.html` ⇄ `ios/App/App/public/index.html` byte-identical.

## Фактические локальные проверки (headless CDP, backend ветки :3000, фронт :8787)

| # | Проверка | Результат |
|---|---|---|
| 1 | Internal: confirm → logo/skip → `calendar_setup=1` | из прошлого follow-up, регрессия зелёная |
| 2 | External: confirm → встроенный CRM-экран в `app.html` (не maya-admin) | ✅ «Подключите CRM · Система записи», URL остаётся `app.html` |
| 3 | CRM save: PATCH mock → реальный provider; токен не в storage/URL | ✅ провайдер стал `dikidi` (GET `/admin/tenants/:id`.`crm_integration.provider`); поиск секрета в ls/ss/url = пусто; поле токена очищено |
| 4 | CRM test: результат показан внутри MAYA; live не включён | ✅ ответ `test-crm` показан в экране; `mobile config.booking_mode` = `preview` (не live). Для теста провайдер DIKIDI (заглушка, без выхода в прод-API); success-путь проверен fetch-стабом `test-crm→ok:true` → «CRM подключена» → preview |
| 5 | «Подключить позже» открывает preview нового tenant | ✅ `booking_tenant=britva-*`, не maya-admin |
| 6 | Reload restore использует сохранённый `apiBase` + `/read` | ✅ (сценарий RESTORE: session=has → reload → «С возвращением», `missing` сохранён; «Начать заново» → сессия чиста) |
| 7 | Invalid/expired на `/messages` и `/confirm` → авто новый диалог | ✅ `/messages` (base e2e) и `/confirm` (стаб 401): экран — свежий чат (чипы «С чего начать» + note «Сессия настройки не найдена — начните заново»), не карточка |
| 8 | Parse + зеркала + `cap sync ios` | ✅ app.html 22/22, iOS www 22/22; byte-identical; sync успешен |

## Оставшиеся блокеры

Нет. Одна заметка (не блокер): реальная проверка `test-crm` для YClients/Altegio уходит в их API (адаптеры делают сетевой вызов). В e2e я использовал провайдер DIKIDI (backend-заглушка, без сети) и fetch-стаб для success-пути, чтобы не бить в прод-провайдер — соответствует требованию «не отправлять данные в production API во время проверки». Реальный owner с валидным токеном YClients получит настоящий ответ проверки.
