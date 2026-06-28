# ARCHITECTURE.md — MAYA / «Мужская Эстетика»

> Карта архитектуры. Создана 2026-06-16 (ревизия проекта). Основано на чтении реального кода.

## 1. Карта верхнего уровня

```
                              ┌─────────────────────────────┐
        Клиент в Telegram ───▶│  Telegram Bot «Антон»        │
                              │  ai администратор/bot.py     │  long-polling, 13 APScheduler-джоб
                              └──────────────┬──────────────┘
                                             │ импортирует
        Клиент в браузере/PWA                ▼
   malesthetic.pro ──▶ index.html      ┌─────────────────────────────┐
                  ──▶ /app/ app.html ──▶│ api-proxy.php (Beget, PHP)  │
                       (React/Aurora)   │  CORS+rate-limit, роутер     │
                                        └───────┬───────────┬─────────┘
                                                │           │ напрямую (запись/услуги/времена)
                          форвард /api/* (HTTP) │           ▼
                                                ▼      ┌──────────────┐
                              ┌──────────────────────┐ │  YClients    │ (источник правды:
                              │ webhook_server.py     │◀┤   API v2     │  записи, касса, выручка)
                              │ aiohttp :8080 (VPS)   │ └──────────────┘
                              │  ~58–90 /api/* + hook │        ▲ webhook record.create/update/delete
                              └───┬─────────┬─────────┘        │
                                  │         │                  │
                  ┌───────────────┘         └──────────────┐   │
                  ▼                                         ▼   │
        ┌──────────────────┐                      ┌────────────────────┐
        │ database.py       │                      │ Внешние сервисы     │
        │ SQLite barbershop │                      │ Claude (PROXY_URL)  │
        │ .db (~33 табл.,   │                      │ OpenAI gpt-5.1      │
        │ Fernet-шифр. ПД)  │                      │ fal.ai (примерка)   │
        └──────────────────┘                      │ YooKassa (платежи)  │
                                                   │ Web Push (VAPID)    │
                                                   │ VK ID, SMS.ru       │
                                                   └────────────────────┘
```

## 2. Frontend

- **`сайт и приложение/index.html`** (~808 КБ) — маркетинговый сайт, корень `malesthetic.pro`. Hero-видео (`team-videos-optimized/*.mp4`), секции услуг/о нас, кнопка «Установить» → `/app/`.
- **`сайт и приложение/app.html`** (~828 КБ) — боевой **PWA** на React, дизайн-система **Aurora**, собран «в один файл» (нет внешних `<script src>`, 1072 `React.createElement`). Экраны записи STEP 0–4, табы, ЛК, панель мастера/владельца, GOD-режим, ИИ-чат, CutMatch, чаевые, платежи.
- **`tips.html` + `tips-data.js`** — экран чаевых мастеру (QR `tips.html?master=<slug>`), 5 мастеров.
- ⚠️ Исходники Aurora (`app-aurora.html`, `build.js`) **локально отсутствуют** — деплоится собранный `app.html`.

## 3. Backend

aiohttp + python-telegram-bot, всё в `ai администратор/`. Два монолита:

- **`bot.py`** (6404 строки) — Telegram-бот: ~45 команд, `consent_gate` (152-ФЗ), `handle_message/voice/contact`, мега-роутер `handle_callback`, **13 APScheduler-джоб** (реактивация 10:00, ДР 10:30, цикл, рефералы, абонементы, лояльность, отзывы/5мин, лид-алерты/5мин, дневной отчёт 21:00, god_watch 09:00, ротация ПД 03:00).
- **`webhook_server.py`** (6546 строк) — aiohttp на `:8080`: приём webhook YClients + ~58–90 REST-эндпоинтов `/api/*` для PWA: `chat[/stream]`, `try-haircut`, `analyze-face`, `auth/phone|vk`, `cabinet/*`, `panel/*` (журнал-CRUD), `god/*`, `cert/create`, `sub/create`, `push/subscribe`.
- **Фиче-модули** (все импортируются): `loyalty`, `referral`, `subscriptions`, `cutmatch`, `reviews`, `masters_ai`, `lead_alerts`, `freed_slot`, `birthday`, `cycle_reminder`, `reactivation`, `broadcast_templates`, `ai_billing`, `web_auth`, `sources`, `memory`, `migration`, `cert_pdf`, `yukassa_api`, `admin_nlu`.
- **Кросс-срезы:** `config` (14 импортёров), `pii_crypto`, `anonymizer`, `prompts`.

## 4. База данных

- **`ai администратор/barbershop.db`** — SQLite (~33 `CREATE TABLE` в `database.py`; локальная копия пустая, 24 таблицы). Не источник правды — надстройка над YClients: привязки, согласия 152-ФЗ, баллы, коды, состояние диалога, биллинг ИИ.
- **`database.py`** (3316 строк, 163 функции) — слой данных без ORM: DDL + ad-hoc миграции (`ALTER TABLE` в try/except) + шифрование + доменные запросы вперемешку.
- **ПД at rest:** Fernet-шифрование (`pii_crypto`) колонок `name_enc/phone_enc` + HMAC `phone_hash` для поиска. Ротация/обезличивание `PII_RETENTION_MONTHS=18`.

## 5. Telegram-бот

- Бот `@malesthetic_bot`. ИИ-администратор «Антон» (Claude Sonnet 4.5, 20 tools, prompt caching). Голос (`handle_voice`), контакт-шеринг, постоянная память без ПД.
- Глобальный `consent_gate` (group=-1, `ApplicationHandlerStop`) блокирует всё до подписания согласия 152-ФЗ.
- Уведомления мастерам о записях + AI-апсейл-совет; привязка мастера `/bind ME-XXXXXX`.

## 6. PWA

- Манифесты: `pwa-assets/for-app/manifest.json` (для `/app/`) и `for-root/manifest.json` (для корня). Иконки any+maskable 192/512 (продублированы for-app↔for-root, байт-в-байт).
- Splash: `launch/*.png` (11 разрешений iPhone) — ⚠️ `apple-touch-startup-image` в `app.html` **не найден**, сейчас не подключены.
- Установка: Telegram Mini App + Login Widget + (отключённые) телефон/VK; Android — TWA из `МЭП - Google Play package/`.

## 7. Service Worker

- **Активный:** `сайт и приложение/service-worker.js` — **PUSH-ONLY**: `install→skipWaiting`, `activate→` снос ВСЕХ кэшей + `clients.claim`, обработчики `push`/`notificationclick`. Сознательно **без `fetch`** ⇒ страница всегда из сети, нет «залипшей оболочки».
- **Корневой:** `pwa-assets/for-root/service-worker.js` — отдельный self-destruct SW (unregister старого кэширующего SW на `/`).

## 8. YClients интеграция (`yclients.py`, 88 КБ)

- Клиент REST API v2 (`YClientsAPI`), `COMPANY_ID=503759`, auth `Bearer partner_token` + `User user_token`.
- **Запись:** клиентская `book_record/{company}` (отклоняет нерабочее время → 422) vs админская `records/{company}` (на любое время).
- **Услуги:** `add_services_to_record` (растит `seance_length`) / `set_record_services` (полная замена). Обязательно передавать `cost` — иначе YClients дропает услугу.
- **Перенос:** только неразрушающий `PUT record/{company}/{id}` (никогда delete+create).
- **Оплата:** `set_record_paid` (cash/card) → `attendance=1/paid_full=1` + `finance_transactions` (нал `1016537` / безнал `1016538`). Защита от двойной оплаты: per-record `asyncio.Lock` + пред-скан существующих транзакций (у YClients нет идемпотентности).
- **Выручка:** нал/карта по `account.is_cash`; ЗП мастера = выручка × процент.

## 9. AI интеграция

- **«Антон»** — `claude_ai.py` (84 КБ): Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`), 20 tools, prompt caching, стрим/обычный. Через `PROXY_URL` (Claude геоблокирует РФ).
- **Советы мастерам** — `masters_ai.py`: Claude Haiku 4.5 / GPT-4o-mini (переключаемо), таймаут 5с с фолбэком.
- **CutMatch** — `cutmatch.py`: анализ лица OpenAI gpt-5.1 vision (Claude-фолбэк), генерация примерки fal.ai `nano-banana/edit`, submit→poll, лимит 2/день.
- **Биллинг** — `ai_billing.py`: учёт токенов в `ai_usage_log`, цены $/1M по моделям (обновляются вручную), `/ai_cost`.

## 10. Платежи

- `yukassa_api.py` — ЮKassa REST v3: `create_payment` (redirect, чек 54-ФЗ, vat_code=1 ИП без НДС) для сертификатов/абонементов, фоновый поллинг до `succeeded`, идемпотентность по `cert-{code}`/`sub-{id}`.

## 11. Конфигурационные файлы

| Файл | Назначение |
|---|---|
| `ai администратор/config.py` | 🔴 Все боевые секреты + бизнес-константы (кассы, master_ids, founder_ids, retention) |
| `ai администратор/schedule.json` | Локальный график для `_check_booking_fits` (⚠️ рассинхрон с YClients API) |
| `ai администратор/requirements.txt` | Python-зависимости бэкенда |
| `tg-auth/tg-config.php` | 🔴 BOT_TOKEN + `bot_api_base` (IP бэкенда) для прокси |
| `tg-auth/.htaccess` | Защита `tg-config.php` и расширений `env/ini/log/conf/pem/sqlite/db` |
| `pwa-assets/*/manifest.json` | Манифесты PWA |

## 12. SaaS Blueprint (параллельная ветка, `ai администратор/saas_blueprint/`)

Мультитенантная переписка на PostgreSQL (RLS-изоляция, `tenant_scope` через contextvars, `BookingProvider` поверх YClients, B2B-биллинг салонов, white-label). **Не в проде** — прод на SQLite. Подробности и статус — в [PROJECT_MEMORY.md](PROJECT_MEMORY.md) и `saas_blueprint/CUTOVER_RUNBOOK.md`.
