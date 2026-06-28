# Боевой катовер: перевод на мультитенантный Postgres-стек

Это план перевода БОЕВОГО салона на новый слой. Делается ОСОЗНАННО и фазами:
сначала переносим текущий салон на Postgres (риск минимальный, поведение 1:1),
проверяем, и только потом включаем подключение НОВЫХ салонов.

Всё в песочнице (`saas_blueprint/pg/`) уже проверено локально: ~98 тестов зелёные
(схема, миграция 1:1, слой данных, резолвинг, аудит изоляции, джобы, онбординг,
биллинг, white-label). Прод (SQLite) пока не тронут.

🔴 Главный принцип: **SQLite остаётся рабочим до самого переключения.** Откат =
вернуть один импорт и перезапустить сервис.

---

## ФАЗА A — текущий салон на Postgres (single-tenant, поведение 1:1)

Цель: тот же один салон работает как раньше, но на Postgres как `tenant_id=1`.
Мультитенантность ещё НЕ включаем — минимизируем риск.

### A1. Поднять БД (твой шаг в облаке)
1. Yandex Cloud → Managed Service for PostgreSQL 16, регион РФ (152-ФЗ).
2. Создать БД `barbershop`, пользователя-владельца.
3. Сохранить host/port/dbname/пароль — положить в окружение сервиса (НЕ в код).

### A2. Применить схему
```bash
psql "$PG_DSN" -f 01_schema_postgres.sql
psql "$PG_DSN" -f 02_tenant_resolution.sql
# роль приложения (НЕ суперпользователь — иначе RLS не действует):
psql "$PG_DSN" -c "CREATE ROLE salon_app LOGIN PASSWORD '...' NOSUPERUSER;
  GRANT USAGE ON SCHEMA public TO salon_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO salon_app;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO salon_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON tg_chat_binding, bot_registry TO salon_app;"
```

### A3. Перенести данные
1. Снять консистентный снимок боевой SQLite (backup-API, не мешает боту):
   `python -c "import sqlite3; s=sqlite3.connect('barbershop.db'); d=sqlite3.connect('/tmp/snap.db'); s.backup(d)"`
2. Прогнать `migrate_sqlite_to_pg.py` (поменять PG=… на Yandex DSN, SQLITE=… на снимок).
   Сверить: число строк по каждой из 31 таблицы должно совпасть (скрипт это печатает).

### A4. Подключить код к Postgres (на сервере)
1. **Бэкап:** `cp database.py database.py.sqlite.bak`.
2. Залить `db_pg_full.py` и переименовать в `database.py` (он — порт database.py,
   API совпадает). В нём:
   - `PG = {...}` → читать из окружения (host/port/user=salon_app/password/dbname);
   - поставить `psycopg2-binary` в venv.
3. **Контекст салона.** Пока single-tenant — проще всего на старте сервиса один раз
   `database.set_tenant(1)` (и в фоновых джобах тоже). Точки входа НЕ переписываем.
4. `pii_crypto` ключ и (для будущего онбординга) `SAAS_SECRET_KEY` — в окружении.

### A5. Проверка и переключение
1. Прогнать сервис на staging/в отдельном процессе, указывающем на Postgres.
2. Дымовой регресс: запись/перенос/отмена, оплата визита, баллы, отчёт, журнал,
   чат Антона — всё как на SQLite.
3. Переключить боевой сервис, `systemctl restart barbershop-bot`. Наблюдать логи.

### A6. Откат (если что-то не так)
`cp database.py.sqlite.bak database.py && systemctl restart barbershop-bot` —
мгновенно вернулись на SQLite (данные там не трогались).

**Критерий выхода из Фазы A:** салон неделю стабильно работает на Postgres.

---

## ФАЗА B — включить мультитенантность (продавать новым салонам)

Только после стабильной Фазы A.

### B1. Per-tenant YClients
🔴 Боевой `yclients.YClientsAPI` читает креды из глобального config. Дать
конструктору принимать `company_id/user_token/cash_account_id/cashless_account_id`
(для салона 1 — дефолт из config, чтобы не сломать). Тогда
`booking_provider.YClientsProvider` заработает на любой салон.

### B2. Точки входа через резолвер
- Telegram: обернуть обработчик в `saas_runtime.telegram_request(chat, payload, token)`
  (резолвит салон → `tenant_scope`). На общем боте — `?start=<slug>` привязывает чат.
- HTTP/PWA: middleware `saas_runtime.http_request(host, session_tenant_id)`; салон —
  из АВТОРИЗОВАННОЙ web-сессии, Host — только лендинг.
- Фич-роуты: `require_active=True` (биллинг-гейт); роуты оплаты/лендинга — без него.

### B3. Джобы по тенантам
Тело каждой `*_job` обернуть в `tenant_jobs.run_for_all_tenants(<job>, ...)`.
Добавить джобы биллинга: `tenant_billing.enforce_access(now())` (статусы) и
`charge_due(YooKassaGateway(...), now())` (рекуррент).

### B4. Поддомены + white-label
- DNS wildcard `*.app.ru` → сервер; эндпоинт `/api/tenant-config` =
  `tenant_config.public_config(request.host)`; index.html на старте применяет бренд
  (см. `whitelabel_boot_example.js`).
- Боты: общий бот-платформа (deeplink по slug) на старте; выделенные боты
  (`bot_registry`) — как платная white-label опция.

### B5. Онбординг-флоу
Лендинг → регистрация (`tenant_onboarding.create_tenant`) → «Подключить YClients»
(`connect_yclients` → `sync_catalog`) → выбор тарифа + триал → оплата
(`tenant_billing.activate_paid` из YooKassa-вебхука). Маркетплейс YClients —
полировка (1-клик подключение) уже после первых ручных подключений.

---

## Что остаётся «бумажной» работой (юр/орг, не код)
- 152-ФЗ: ты становишься ОБРАБОТЧИКОМ ПД для каждого салона → оферта + поручение
  на обработку. Данные уже в РФ — плюс.
- Партнёрка YClients: уточнить лимиты partner-токена на много компаний и условия
  публикации в Маркетплейсе.
- Тарифы/цены: значения в `tenant_billing.PLANS` — поставить реальные.

## Порядок, если коротко
A1→A2→A3→A4→A5 (живём неделю) → B1→B2→B3→B4→B5 → первый внешний салон.
