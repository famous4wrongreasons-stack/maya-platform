# CLAUDE.md — MAYA / «Мужская Эстетика»

> Операционный гайд для Claude Code. Создан 2026-06-16 в ходе ревизии проекта.
> Связанные файлы: [ARCHITECTURE.md](ARCHITECTURE.md) · [PROJECT_MEMORY.md](PROJECT_MEMORY.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [🔴 SECURITY_REMEDIATION.md](SECURITY_REMEDIATION.md)

## Что это за репозиторий

«Зонтик» из нескольких слабо связанных подсистем под брендом **«Мужская Эстетика» / MAYA**. Общего кода/БД между ними нет — связь только по бренду.

| Подсистема | Папка | Что это | Деплой | Статус |
|---|---|---|---|---|
| **Бэкенд бота** | `ai администратор/` | Python: бот «Майя» (MAYA; старое имя «Антон» — устарело) + webhook/REST-сервер + YClients/AI/платежи | VPS `111.88.148.206` | 🟢 ПРОД |
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

### MAYA OS / SaaS (`mayaos.ru`) — топология не такая, как кажется

`mayaos.ru` резолвится в **Beget `45.130.41.193`**, но это только фронт. Бэкенд —
NestJS на том же VPS, что и бот: **`111.88.148.206`**.

| Что | Где |
|---|---|
| Сайт + `app/` | Beget, `~/mayaos.ru/public_html` (логин `mocine3388@prime.beget.com`) |
| `/api/*` | PHP-реле `maya-platform-api.php` → `https://maya.111.88.148.206.nip.io/api` |
| NestJS | VPS `111.88.148.206`, `/opt/maya-saas/current` → `releases/<стамп>`, юнит `maya-saas`, порт 3107 |
| Секреты | `/etc/maya-saas/live-widgets.env` (читается systemd только при старте юнита) |

🔴 **VPS закрыт напрямую** — с рабочей машины недоступны ни 22, ни 80, ни 443.
Ходить только через Beget как трамплин; ключи при этом остаются локально:

```
ssh -o ProxyCommand="ssh -i ~/.ssh/beget_deploy -W %h:%p mocine3388@prime.beget.com" \
    -i ~/.ssh/yandex_bot botadmin@111.88.148.206
```

🔴 **Выкат — только `maya-saas-backend/deploy/vps/deploy.sh <имя-релиза>`.**
Релиз собирается ЦЕЛИКОМ на сервере (`npm ci --omit=dev`) и ни на что не
ссылается. Три аварии 06-07.08 выросли из одного решения — зависимости не
ставились, а перетаскивались из соседнего релиза: `cp -a` унёс симлинк на
донора и уборка его снесла; `cp -aL` разыменовал `.bin` и порвал относительные
`require` в prisma; вместе с зависимостями приезжал СТАРЫЙ сгенерированный
клиент Prisma, не знавший новых колонок, — миграция проходила, здоровье было
зелёным, а первая же запись падала в рантайме. Копировать `node_modules` между
релизами нельзя ни в каком виде.

Порядок шагов зафиксирован и каждый умеет провалить выкат: заливка → `npm ci` →
проверка загрузки `bcrypt` → `migrate deploy` → `prisma generate` + проверка
загрузки клиента → смоук по `/api/health/ready` на порту 3199 → переключение
симлинка → проверка релиза с АВТООТКАТОМ на `previous-release`, если новый не
ответил.

Гочи:
- `prisma.config.ts` обязателен в релизе: в схеме нет `url`, строка подключения
  берётся оттуда. Без него `migrate deploy` падает с «datasource.url is required».
- `prisma` должен лежать в обычных зависимостях, а не в dev — серверу нужен CLI.
- `rsync -e` разбивает значение по пробелам, а путь к проекту их содержит;
  обёртка `ssh-jump.sh` копируется во временный путь без пробелов.
- Никогда не прятать код возврата за `| tail`: конвейер вернёт код `tail`, и
  провал миграции пройдёт незамеченным (так и уехал в прод релиз без колонок).
- Уборка старых релизов не трогает `current` и `previous`.

Гочи выката: `/opt/maya-saas/releases` принадлежит `maya-saas`, поэтому каталог
релиза создавать `sudo mkdir` + `chown botadmin` (у `botadmin` есть `NOPASSWD: ALL`).
Строку `ProxyCommand` нельзя протащить в `rsync -e` — кавычки теряются, нужна
обёртка-скрипт. Симлинк `current` переключать только после смоука нового релиза
на запасном порту.

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
- ИИ: «Майя» (MAYA; НЕ «Антон» — имя устарело, указание Стаса 2026-07-03) — Claude Sonnet 4.5 (через `PROXY_URL`, геоблок РФ); советы мастерам — Haiku 4.5 / GPT-4o-mini; CutMatch — OpenAI gpt-5.1 + fal.ai.

## Конвенции

- Бэкенд — Python без ORM (сырой SQLite в `database.py`). Git нет ⇒ откат через `.bak` (теперь в `_archive/`).
- Ручные утилиты (`generate_*pdf.py`, `generate_bind_codes.py`) перенесены в `_archive/2026-06-17/tools/`.
- Бизнес-константы размазаны по модулям (`CASHBACK_PCT` в `loyalty.py`, `PLANS` в `subscriptions.py`, лимиты в `cutmatch.py`) и `config.py`.
