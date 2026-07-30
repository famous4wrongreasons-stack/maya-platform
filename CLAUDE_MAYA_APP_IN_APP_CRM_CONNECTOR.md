# CLAUDE: in-app CRM connector for MAYA AI onboarding

Продолжай **в том же worktree**:

- repo: `/Users/stanislavmosin/Desktop/maya-ai-onboarding`
- branch: `codex/ai-onboarding-foundation`
- platform app: `сайт и приложение/app.html`
- iOS mirror: `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Backend, Prisma, миграции и тесты backend не менять. Production не деплоить.

## Почему нужен этот пакет

Текущий follow-up ведёт `connect_crm` в относительный `maya-admin.html`. В web-worktree этот файл есть, но в установленной iOS MAYA его нет:

- `/Users/stanislavmosin/Desktop/maya-ios/www/maya-admin.html` отсутствует;
- `/Users/stanislavmosin/Desktop/maya-ios/ios/App/App/public/maya-admin.html` отсутствует.

Значит, в реальном приложении кнопка CRM откроет несуществующую страницу. Кроме того, продуктовая договорённость: подключение бизнеса проходит **внутри существующей MAYA в Aurora-стиле**, без отдельного сайта/админки.

## Задача

### 1. Перенести CRM-подключение прямо в `app.html`

На стадии `lgAiStage === 'crm'` сделай полноценный защищённый in-app коннектор, не переходящий в `maya-admin.html`.

Используй уже полученные после `/confirm` данные:

- `lgAiResult.api`;
- `lgAiResult.tenantId`;
- `lgAiResult.token`.

Доступные backend-маршруты уже разрешены для `tenant_admin`:

- `GET /admin/tenants/:tenantId` — безопасное состояние tenant/CRM, без выдачи сохранённого токена;
- `PATCH /admin/tenants/:tenantId/crm` — обновить существующую mock-интеграцию;
- `POST /admin/tenants/:tenantId/crm` — создать, если PATCH вернул `404`;
- `POST /admin/tenants/:tenantId/test-crm` — проверить связь.

Во всех запросах: `Authorization: Bearer <lgAiResult.token>`.

UI в текущем Aurora-стиле MAYA:

- выбор провайдера: YClients, Altegio, DIKIDI, Salon Online, Whitelines;
- API-токен как password input;
- ID компании;
- optional Base URL только если он уже поддерживается текущим DTO;
- действия «Сохранить и проверить» и «Подключить позже»;
- спокойные состояния loading/success/error;
- после успешной проверки открыть MAYA нового tenant в preview;
- при ошибке не терять введённые данные, кроме случаев безопасности ниже.

Безопасность:

- API-токен не писать в `localStorage`, `sessionStorage`, URL, логи, аналитику, сообщения Майе или result-файл;
- после успешного сохранения очистить token input;
- сохранённый backend-токен никогда не подставлять обратно в поле;
- не включать `live` автоматически;
- не отправлять данные в production API во время проверки.

### 2. Исправить восстановление AI-черновика

Сейчас `apiBase` сохраняется в `me_ai_onboarding_draft`, но `/read` вызывается через текущий `lgApiBase()`. Возобновляй черновик только через сохранённый `s.apiBase` (после нормализации trailing slash). Если `apiBase` отсутствует/невалиден, очищай черновик и начинай заново.

Не добавляй в sessionStorage ничего, кроме уже согласованных `{draftId, draftToken, apiBase}`.

### 3. Закрыть invalid/expired на confirm

В `lgAiConfirm` обрабатывай `invalid_ai_onboarding_token` и `ai_onboarding_expired` через `lgAiHardReset(...)`, как уже сделано в `lgAiSend`. Пользователь не должен возвращаться назад вручную, чтобы начать заново.

### 4. Не оставлять скрытый шаг профиля после confirm

Имя владельца на итоговой карточке должно быть обязательным вместе с e-mail и телефоном. Сейчас при пустом `ownerName` tenant создаётся, но вместо готового календаря приложение показывает дополнительный экран «Как вас зовут?». Проверь `ownerName.trim()` до `/confirm`, покажи спокойную подсказку и всегда отправляй заполненное имя. После internal confirm + logo/skip пользователь должен сразу попасть в «Календарь MAYA», без промежуточного client-profile шага.

### 5. Не смешивать одинаковые slug разных backend

Если код поиска auth bundle ещё используется, совпадение должно быть по паре:

- `tenant_slug === lgAiResult.tenantSlug`;
- нормализованный `api_base === lgAiResult.api`.

Но для нового in-app CRM предпочтительно вообще не искать bundle в localStorage: используй `lgAiResult.token` только в памяти текущего flow.

### 6. Зеркало iOS

- синхронизировать `сайт и приложение/app.html` и `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` byte-identical;
- выполнить `npx cap sync ios`;
- подтвердить byte-identical `www/index.html` и `ios/App/App/public/index.html`;
- не трогать untracked `android/` и `index.beta-basis-20260709_194105.html`.

Изменение `сайт и приложение/maya-admin.html` из прошлого follow-up можно оставить как безопасный deep-link для web-инструмента, но новый onboarding **не должен от него зависеть**.

## Проверка

Используй только изолированные локальные порты/backend ветки, не `3100/8888`, если они уже заняты. Для DB используй отдельную тестовую **database**, а не только `?schema=...`: текущий `PrismaPg` adapter не гарантирует применение этого query-параметра и тестовые tenant могут попасть в локальный `public`.

Обязательно проверить:

1. Internal flow: пустое имя блокируется на confirm; заполненный confirm -> logo/skip -> `calendar_setup=1` -> сразу виден «Календарь MAYA».
2. External flow: confirm -> встроенный CRM-экран внутри `app.html`.
3. CRM save: PATCH mock -> реальный provider; token не появляется в storage/URL.
4. CRM test: результат показан внутри MAYA; live не включён.
5. «Подключить позже» открывает preview нового tenant.
6. Reload restore использует сохранённый `apiBase` и `/read`.
7. Invalid/expired на `/messages` и `/confirm` автоматически возвращают к новому диалогу.
8. Все inline scripts parse-clean; зеркала byte-identical; `npx cap sync ios` успешен.

## Результат

Создай рядом файл:

`CLAUDE_MAYA_APP_IN_APP_CRM_CONNECTOR_RESULTS.md`

Укажи только:

- изменённые файлы;
- реализованные сценарии;
- фактические локальные проверки;
- оставшиеся блокеры, если они есть;
- никаких секретов, токенов и персональных данных.
