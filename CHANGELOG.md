# CHANGELOG — MAYA / «Мужская Эстетика»

> Формат: обратный хронологический. Создан 2026-06-16 в ходе ревизии проекта.
> ⚠️ Проект **не под git**, поэтому ранняя история восстановлена приблизительно по датам файлов и комментариям в коде. С этого момента вести записи вручную при каждой выкатке.

## 2026-06-16 — Ревизия проекта (техдиректорский аудит)
- Проведён полный 7-этапный аудит: скан ФС, карта архитектуры, классификация мусора, скан безопасности (адверсариально верифицирован).
- Созданы файлы памяти: `CLAUDE.md`, `PROJECT_MEMORY.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md`.
- Выявлен КРИТИЧЕСКИЙ уровень риска по секретам (см. `PROJECT_MEMORY.md` §5, `ROADMAP.md` P0). Файлы пока **не удалялись/не перемещались** — ждём подтверждения владельца.
- Обновлены `bot.py`, `webhook_server.py`, `database.py`, `cutmatch.py`, `yclients.py`, `app.html` (по датам — последняя активность).

## ~2026-06-15 — SaaS blueprint: тарифы и витрина
- Доработаны `plan_catalog.py`, `tenant_features.py` (тарифы-конструктор, метрик-биллинг ai_chatbot).

## ~2026-06-13 — SaaS blueprint: старт переписки на PostgreSQL
- Созданы `saas_blueprint/` (PG-схема с RLS, tenant resolution, BookingProvider, B2B-биллинг, white-label), `00_DESIGN.md`, `CUTOVER_RUNBOOK.md`, `AUDIT_REPORT.md`.
- Маркетинг-сайт SaaS `demo/saas-site.html` (бренд MAYA).

## ~2026-06-11 — Бэкапы перед выкаткой
- Снапшоты `backups/claude_ai.py.bak`, `webhook_server.py.bak`, `yclients.py.bak`.

## ~2026-06-03 — Деплой фронта/пуша
- `beget_app_frontend_update_20260603.tar.gz`, `bot_push_deploy.tar.gz`.
- Веб-вход переведён со схемы «SMS через YClients» на SMS.ru/VK (старая версия → `web_auth.py.bak.yclientsms`, `api-proxy.php.bak.sesstoken`).

## ~2026-06-01 — i18n / сборка сайта
- `index.html.bak-i18n-20260601` — снапшот перед правками локализации.
- Splash-экраны `launch/*.png` (11 разрешений iPhone).

## ~2026-05-29 — Google Play пакет
- Собран TWA `pro.malesthetic.twa` (PWABuilder): `.aab/.apk`, `signing.keystore`, `assetlinks.json`.

## ~2026-05-22…05-31 — Базовый бот (исходный пласт)
- Telegram-бот «Антон», YClients-интеграция, лояльность/рефералы/абонементы/сертификаты, отзывы, ИИ-биллинг, шифрование ПД (152-ФЗ), CRM (PHP), SMM-бот.

---

## Шаблон записи
```
## YYYY-MM-DD — Короткое описание
- Что изменилось (файлы, поведение).
- Задеплоено: VPS / Beget / нет.
```
