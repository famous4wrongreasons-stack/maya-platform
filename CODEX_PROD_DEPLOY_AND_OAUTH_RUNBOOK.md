# CODEX_PROD_DEPLOY_AND_OAUTH_RUNBOOK

> Codex, 2026-07-06. Пункты 5 и 6 из `CLAUDE_TASKS_FOR_CODEX.md`.
> Это безопасный план включения production. Реальный деплой пока не выполнялся.

## Текущее состояние

- Backend готов локально: NestJS + Prisma + PostgreSQL.
- Есть Dockerfile, docker-compose, `prisma migrate deploy`, health endpoint.
- Health check после деплоя: `GET /api/health`.
- Реальное приложение сейчас не затронуто.
- Переключать фронт на production API нужно только после отдельного smoke-check.

## Рекомендуемая схема

- MAYA APP получает собственный нейтральный production-домен, не связанный с доменом какого-либо tenant.
- PWA и API публикуются на одном platform-origin:
  - `https://<maya-platform-domain>/app.html`;
  - `https://<maya-platform-domain>/api/...`.
- `/api` проксируется с platform-origin на NestJS backend. Это сохраняет корректные PWA scope, manifest и tenant-иконки.
- `malesthetic.pro` остаётся доменом tenant «Мужская Эстетика» и не используется как системный домен MAYA APP.
- Tenant-ссылки сначала работают в path/slug-режиме. Tenant-домены и wildcard-зона подключаются отдельным этапом.

## Что нужно от Стаса

1. Решить, где живёт backend:
   - новый VPS под SaaS backend, рекомендуется;
   - или текущий VPS, но только если не мешаем старому боту.
2. Выбрать и зарегистрировать отдельный домен MAYA APP.
3. Настроить DNS:
   - `A <maya-platform-domain> -> <server-ip>`.
4. Создать production-секреты:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CRM_ENCRYPTION_KEY`
   - `PHONE_AUTH_SECRET`
5. Подготовить внешние кабинеты:
   - SMS.ru `SMSRU_API_ID`
   - YClients partner token
   - YooKassa shop id + secret key
   - Yandex OAuth app
   - Telegram OAuth app

## Backend env для production

Не отправлять секреты в чат. Их нужно вносить прямо на сервере в `.env`.

```env
NODE_ENV="production"
PORT=3000
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
CRM_ENCRYPTION_KEY="..."
SELF_SERVE_TRIAL_SIGNUP="true"

YCLIENTS_BASE_URL="https://api.yclients.com/api/v1"
YCLIENTS_PARTNER_TOKEN="..."

PHONE_AUTH_PROVIDER="smsru"
PHONE_AUTH_DEBUG="false"
PHONE_AUTH_SECRET="..."
PHONE_AUTH_CODE_TTL="300"
PHONE_AUTH_RESEND_COOLDOWN_SECONDS="60"
PHONE_AUTH_MAX_ATTEMPTS="5"
SMSRU_API_ID="..."
SMSRU_FROM=""
SMSRU_TEST="false"

YANDEX_LOGIN_ENABLED="true"
YANDEX_CLIENT_ID="..."
YANDEX_CLIENT_SECRET="..."

TELEGRAM_LOGIN_ENABLED="true"
TELEGRAM_CLIENT_ID="..."
TELEGRAM_CLIENT_SECRET="..."
TELEGRAM_JWKS_URL="https://oauth.telegram.org/.well-known/jwks.json"

YOOKASSA_SHOP_ID="..."
YOOKASSA_SECRET_KEY="..."
YOOKASSA_RETURN_URL="https://<maya-platform-domain>/billing/return"
YOOKASSA_API_BASE_URL="https://api.yookassa.ru/v3"

UPLOAD_ROOT="./uploads"
```

## OAuth redirect whitelist

Добавить в Yandex и Telegram provider settings:

```text
http://127.0.0.1:8787/oauth-callback.html
https://<maya-platform-domain>/oauth-callback.html
```

Если production callback будет жить не в `/app/`, добавить фактический URL callback-страницы.

## YooKassa webhook

В кабинете YooKassa добавить:

```text
https://<maya-platform-domain>/api/billing/yookassa/webhook
```

События:

```text
payment.succeeded
payment.canceled
```

## Порядок безопасного деплоя

1. Поднять PostgreSQL production.
2. Развернуть backend код на сервере.
3. Создать `.env` на сервере.
4. Запустить миграции:

```bash
npm run prisma:migrate:deploy
```

5. Запустить backend:

```bash
npm run build
npm run start:prod
```

или через Docker:

```bash
docker compose up -d --build
```

6. Разместить PWA на platform-origin и поставить reverse proxy `<maya-platform-domain>/api -> localhost:3000`.
7. Выпустить SSL.
8. Проверить:

```bash
curl -i https://<maya-platform-domain>/api/health
```

9. Smoke-check без переключения реального приложения:
   - `GET /api/health`
   - `GET /api/admin/plans` с platform-owner JWT
   - `POST /api/onboarding/trial`
   - `POST /api/auth/phone/start`, в production не должен возвращать `debug_code`
   - `POST /api/auth/oauth/yandex/start`, должен вернуть `auth_url`
   - `POST /api/auth/oauth/telegram/start`, должен вернуть `auth_url`

## Когда подключать Claude/frontend

Только после зелёного backend smoke-check:

- передать Claude production `apiBase`;
- обновить frontend API base;
- проверить витрина -> trial signup -> админка -> клиентское приложение;
- после этого обсуждать tenant-поддомены и публичный cutover.

## Что сделает Codex после данных от Стаса

- Проверит production `.env` без вывода секретов в чат.
- Запустит миграции.
- Поднимет backend.
- Проверит `/api/health`.
- Проверит SMS/OAuth/YooKassa endpoints безопасными smoke-запросами.
- Даст Claude отдельный короткий frontend switch packet.
