# CLAUDE.md — MAYA / «Мужская Эстетика»

> Операционный гайд для Claude Code. Создан 2026-06-16 в ходе ревизии проекта.
> Связанные файлы: [ARCHITECTURE.md](ARCHITECTURE.md) · [PROJECT_MEMORY.md](PROJECT_MEMORY.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [🔴 SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md)

## Что это за репозиторий

«Зонтик» из нескольких слабо связанных подсистем под брендом **«Мужская Эстетика» / MAYA**. Общего кода/БД между ними нет — связь только по бренду.

| Подсистема | Папка | Что это | Деплой | Статус |
|---|---|---|---|---|
| **Бэкенд бота** | `ai администратор/` | Python: бот «Антон» + webhook/REST-сервер + YClients/AI/платежи | VPS `111.88.148.206` | 🟢 ПРОД |
| **Фронт / PWA** | `сайт и приложение/` (вложенная) | `index.html` (сайт), `app.html` (PWA), `api-proxy.php` | Beget, `malesthetic.pro` | 🟢 ПРОД |
| **SaaS-переписка** | `ai администратор/saas_blueprint/` | мультитенант на PostgreSQL + маркетинг-сайт | — | 🟡 in-progress |
| **SMM-бот** | `smm_bot/` | автопостинг в соцсети | VPS `/opt/smm_bot` | 🟢 отдельный прод |
| **Google Play пакет** | `МЭП - Google Play package/` | TWA `pro.malesthetic.twa` + keystore | Google Play | 🟢 артефакт |
| **Видео команды** | `team-videos-optimized/` | mp4 мастеров для сайта | — | используется сайтом |
| **Архив ревизии** | `_archive/` | бэкапы, заброшенная CRM, vpn, дубликаты, секрет-бэкапы (перемещено, не удалено) | — | архив |

## Главная (боевая) версия

- **Бэкенд:** `ai администратор/bot.py` (точка входа бота) + `ai администратор/webhook_server.py` (aiohttp :8080). Монолиты ~310 КБ.
- **Фронт:** `сайт и приложение/app.html` — боевой PWA (React/Aurora, собран в один файл). `сайт и приложение/index.html` — сайт.
- **Прокси фронта:** `сайт и приложение/pwa-assets/tg-auth/api-proxy.php`.
- **Активный Service Worker:** `сайт и приложение/service-worker.js` (push-only, без `fetch`).

## Деплой (см. скилл `deploy-maya`)

- **Бэкенд → VPS:** `scp` `.py` из `ai администратор/` на `botadmin@111.88.148.206:/home/botadmin/barbershop-bot/`, затем `systemctl restart barbershop-bot`. Бэкенд и фронт деплоятся **раздельно**.
- **Фронт → Beget:** вручную залить `app.html`, `api-proxy.php` (если менялись эндпоинты), `index.html`. SW push-only ⇒ новый html подтянется без version-bump.

## Критические гочи (read before you touch)

1. 🔴 **Секреты в открытом виде** в `ai администратор/config.py`, `smm_bot/config.py`, `tg-config.php`, `api-proxy.php`. Проект не под git. **Ключи ещё НЕ ротированы** — см. [SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md). Готов каркас выноса в env: `ai администратор/config.example.py` + `.env.example`.
2. ⚠️ **Aurora-исходников нет** (`app-aurora.html`, `build.js`). Правится/деплоится собранный `app.html`.
3. ⚠️ **Два service-worker'а:** активный `сайт и приложение/service-worker.js` (push-only) vs `pwa-assets/for-root/service-worker.js` (self-destruct для корня). Не перепутать.
4. ⚠️ **ПД клиента НИКОГДА не уходят в LLM** (обезличивание + `anonymizer.redact_pii`). Не ломать контур 152-ФЗ.
5. ⚠️ **Перенос записи — только неразрушающий PUT** `record/{company}/{id}`; запись на любое время — админский путь `records/{company}` (клиентский `book_record` → 422 на нерабочее время).
6. ⚠️ **`barbershop.db` локально пустая** (dev-копия). Реальные ПД только на VPS.
7. VK/MAX-ссылок в проекте быть не должно (требование владельца). `vkid-sdk.js` сейчас не подключён.

## Бизнес-факты (зашиты в код)

- Один салон: YClients `COMPANY_ID=503759`. Владелец Стас `OWNER_STAFF_ID=1461615` (ЗП 100%, не выплачивается). Илья `#1460233` — 60%, остальные 50%.
- Кассы: нал `1016537`, безнал `1016538`, `expense_id=5`.
- ИИ: «Антон» — Claude Sonnet 4.5 (через `PROXY_URL`, геоблок РФ); советы мастерам — Haiku 4.5 / GPT-4o-mini; CutMatch — OpenAI gpt-5.1 + fal.ai.

## Конвенции

- Бэкенд — Python без ORM (сырой SQLite в `database.py`). Git нет ⇒ откат через `.bak` (теперь в `_archive/`).
- Ручные утилиты (`generate_*pdf.py`, `generate_bind_codes.py`) перенесены в `_archive/2026-06-17/tools/`.
- Бизнес-константы размазаны по модулям (`CASHBACK_PCT` в `loyalty.py`, `PLANS` в `subscriptions.py`, лимиты в `cutmatch.py`) и `config.py`.
