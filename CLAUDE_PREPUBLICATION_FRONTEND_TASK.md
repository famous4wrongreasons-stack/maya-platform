# CLAUDE_PREPUBLICATION_FRONTEND_TASK

> Финальный frontend-пакет перед общим pre-publication тестированием MAYA OS.
> Backend-контракт зафиксирован в ветке `codex/maya-os-final-integration`.
> Production не трогать.

## 1. Граница ответственности

Работай от последнего коммита ветки `codex/maya-os-final-integration` и создай
отдельную ветку `claude/prepublication-frontend`.

Твоя зона:

- существующий интерфейс `сайт и приложение/app.html`;
- его iOS-зеркало `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`;
- frontend-интеграция уже готовых API;
- мобильная UX-проверка и доказательный отчёт.

Не меняй:

- NestJS backend, Prisma schema и миграции;
- серверные правила ролей, тарифов, trial и tenant isolation;
- production-файлы и production-серверы;
- уже работающий onboarding, если изменение не требуется пунктами ниже.

Перед началом прочитай:

- `docs/architecture/ai-core.md`;
- `docs/architecture/ai-tool-runtime-runbook.md`;
- `docs/architecture/prepublication-readiness-2026-07-15.md`;
- `maya-saas-backend/README.md`.

## 2. P0: единый чат MAYA

Подключи обычный, уже существующий чат MAYA авторизованного SaaS-пользователя к
`POST /api/ai/chat`.

Request:

```json
{
  "surface": "native",
  "requestId": "crypto.randomUUID()",
  "messages": [
    { "role": "user", "content": "Покажи мои ближайшие записи" }
  ]
}
```

Правила:

- `surface` равен `native` в iOS и `web` в PWA;
- передавай не более 12 последних сообщений;
- роли только `user` и `assistant`, текст одного сообщения не более 2000 знаков;
- используй серверный JWT и существующий общий refresh-flow;
- ответ `{ request_id, reply, source, redacted_input, action, tools_used }`;
- `reply` выводи только как текст, никогда через `innerHTML`;
- ключи DeepSeek/OpenAI никогда не попадают во frontend;
- не создавай второй локальный AI-мозг и не дублируй бизнес-логику API.

Обычный deterministic fallback без внешней модели является валидным ответом,
поэтому UI не должен считать `source: "safe_fallback"` ошибкой.

## 3. P0: подтверждение действий MAYA

Если `action.status === "approval_required"`, покажи компактную чёрно-белую
карточку подтверждения из серверных данных:

```json
{
  "id": "approval-id",
  "tool_name": "appointments.own.cancel",
  "summary": "...",
  "payload_hash": "64-char-sha256",
  "payload_preview": {},
  "expires_at": "ISO timestamp"
}
```

Кнопки:

- подтвердить: `POST /api/ai/approvals/:id/approve`;
- отклонить: `POST /api/ai/approvals/:id/reject`;
- body в обоих случаях: `{ "payloadHash": approval.payload_hash }`.

Обязательное поведение:

- до подтверждения никакой мутации в UI не изображать как выполненную;
- блокировать повторный тап во время запроса;
- `401` пропускать через общий refresh один раз;
- `409` показывать как истекшее/уже обработанное/изменившееся действие;
- `429` уважать вместе с `retry_after_seconds`;
- reject никогда не запускает действие;
- повторный approve не должен давать второй визуальный результат;
- после успеха обновлять только затронутые данные и показывать точный итог.

## 4. P0: маршрутизация после входа

Маршрут выбирается по серверной сессии и membership, а не по кнопке входа и не
по сохранённому onboarding-state:

- `client` / `customer`: клиентское приложение, MAYA Consult и запись;
- `tenant_owner` / `business_owner` / `tenant_admin` / `administrator` /
  `manager`: кабинет бизнеса и MAYA OS;
- `provider` / `employee` / `staff`: интерфейс сотрудника;
- создание бизнеса: только явный private-trial flow до подтверждения tenant.

Критическая регрессия: вход обычного клиента через Telegram, Яндекс или email
никогда не должен открывать чат «создадим ваш бизнес». Проверь все три способа.

## 5. P0: безопасный API и tenant context

На публичном домене:

- API только same-origin `${location.origin}/api` либо подписанный server config;
- tenant берётся из доверенного mobile config/manifest/host/session;
- публичные query-параметры и `localStorage` не могут подменять API или tenant;
- сохранённые `localhost` / `127.0.0.1` значения очистить или игнорировать;
- приложение должно fail closed и никогда не пытаться вызвать localhost.

Тестовые `booking_api_base` и `booking_tenant` допустимы только когда сама
страница открыта на `localhost` или `127.0.0.1`.

Сохрани единое tenant-scoped auth-хранилище `me_saas_auth_v2:<namespace>` и
существующие rotation/revoke/fence правила. Нельзя восстанавливать UI tenant A
после входа в tenant B.

## 6. P0: разложить данные по правильным экранам

Используй готовые API, не складывая весь кабинет на экран записи:

- клиент: `GET /api/customer-portal`, `GET /api/loyalty/me`,
  `GET /api/loyalty/me/transactions`, собственные записи;
- владелец/админ: `GET /api/analytics/business`, `/customers`, `/expenses`,
  журнал внутреннего календаря;
- сотрудник: `GET /api/analytics/me`;
- доступность блоков определяется серверными ролями и feature policy.

Суммы loyalty показывай из backend/CRM как источник истины. Не начисляй и не
пересчитывай баллы во frontend.

## 7. P0: features, trial и подписка

- Читай `GET /api/features/effective` и `GET /api/features/registry`.
- Не показывай planned/current-runtime-only функцию как готовую SaaS-функцию.
- Реальный активированный 10-дневный trial получает весь уже готовый
  `platform_backend` функционал; явный deny tenant имеет приоритет.
- `402` открывает существующий экран оплаты/окончания trial.
- Публичная кнопка «Получить пробную версию MAYA OS» сохраняет существующий
  экран «Скоро» для обычных пользователей.
- Private preview открывается только через существующий контролируемый gate.
- Не хардкодь email владельца или персональные данные в bundle.

## 8. PWA и white label

Подключи tenant install metadata:

- `GET /api/mobile/pwa/:tenantSlug/install`;
- `GET /api/mobile/pwa/:tenantSlug/manifest.webmanifest`;
- `GET /api/mobile/pwa/:tenantSlug/icon/:size.png`.

Каноническое правило продукта:

- приложение из App Store всегда имеет иконку MAYA;
- логотип конкретного бизнеса появляется у установленной tenant PWA;
- iOS не обещает динамическую замену App Store-иконки на логотип каждого
  бизнеса;
- логотип в самом приложении должен использовать `object-fit: contain`, не
  превращаться в чёрный квадрат и иметь безопасный MAYA fallback.

## 9. UX, который нельзя сломать

- Сохрани установленную чёрно-белую стилистику MAYA, без бронзовых акцентов.
- Настройка бизнеса проходит в обычном каноническом чате MAYA.
- Quick reply должен немедленно отправлять реальный message-turn на backend, а
  не только визуально выделяться.
- При открытой клавиатуре активный input и последнее сообщение остаются видны;
  учти `visualViewport`, safe areas и ручной скролл пользователя.
- Не возвращай повторяющиеся вопросы о названии бизнеса.
- Существующий быстрый onboarding и редактируемый семидневный график сохранить.

## 10. Зеркало iOS

После завершения frontend:

1. Синхронизируй изменения в
   `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`.
2. Выполни `npx cap sync ios` в `/Users/stanislavmosin/Desktop/maya-ios`.
3. Подтверди:

```bash
cmp -s www/index.html ios/App/App/public/index.html
```

Production не деплой и приложение на телефон не устанавливай в рамках этого
пакета: это будет отдельный общий pre-publication build после ревью Codex.

## 11. Acceptance matrix

Нужны доказательства каждого пункта:

1. Client login через Telegram, Яндекс и email ведёт в клиентский интерфейс.
2. Owner private preview проходит trial -> onboarding -> подтверждение бизнеса.
3. Шаблон профессии загружает полный базовый набор услуг; график редактируется.
4. AI read-only запрос возвращает ответ в обычном чате.
5. AI write создаёт proposal, но ничего не меняет до approve.
6. Reject не меняет данные.
7. Approve выполняет действие ровно один раз; повтор безопасен.
8. Истёкший trial получает `402` и экран подписки.
9. Публичный host ни при каких сохранённых значениях не вызывает localhost.
10. Состояние tenant A не появляется в tenant B.
11. Refresh rotation, reload и revoke работают без бесконечного retry.
12. Tenant PWA получает tenant logo; native app сохраняет MAYA icon.
13. Quick replies, клавиатура и ручной скролл работают на реальном iPhone.

## 12. Проверка и результат

Минимум:

- распарсить все inline scripts в `app.html`, `maya-admin.html`,
  `maya-start.html`, `oauth-callback.html` через `new Function(...)`;
- проверить desktop и mobile ширины;
- приложить скриншоты ключевых состояний;
- выполнить iOS sync и byte equality;
- не скрывать ошибки и не писать «готово» без фактической проверки.

Создай `CLAUDE_PREPUBLICATION_FRONTEND_RESULTS.md`, где укажи:

- commit hash и список изменённых файлов;
- результаты каждого пункта acceptance matrix;
- команды и точный итог проверок;
- скриншоты;
- всё, что осталось или не удалось воспроизвести.
