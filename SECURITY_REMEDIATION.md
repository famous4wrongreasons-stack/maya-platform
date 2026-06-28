# 🔴 SECURITY_REMEDIATION.md — план санации секретов MAYA

> Создан 2026-06-17 (ревизия). Уровень риска: **КРИТИЧЕСКИЙ**.
> Все перечисленные ключи нужно считать **скомпрометированными** и ротировать.
> В этом файле НЕТ значений секретов — только что/где/как ротировать.

## Что уже сделано автоматически (этой ревизией)
- ✅ Создан `.gitignore` (секреты/БД/логи/бэкапы исключены из будущего git).
- ✅ `bot.log`: полный Telegram-токен (утекал 985×) **замаскирован** и файл вынесен в `_archive/2026-06-17/SECRETS-DELETE-AFTER-ROTATION/`.
- ✅ Изолированы (chmod 600, вынесены из рабочих папок): `api-proxy.php.bak.sesstoken` (светил YClients PARTNER_TOKEN в plaintext из веб-рута), дубликат `vapid_private.pem` (был 0644 в веб-ассетах).
- ✅ Создан каркас выноса секретов: `ai администратор/config.example.py` (читает ключи из окружения) + `.env.example` (шаблон без значений) + `python-dotenv` в requirements. Готов к вводу в строй (Шаг 2).
- ⚠️ Боевые `config.py` / `tg-config.php` / `api-proxy.php` **НЕ тронуты** — нужны рантайму. Их санация — ручная (ниже).

## Шаг 1. Ротировать ключи (по убыванию опасности)
| # | Ключ | Где лежит (локально) | Где ротировать |
|---|---|---|---|
| 1 | **YooKassa LIVE secret + provider token** (реальные деньги) | `ai администратор/config.py`; `secret_key.txt` в Google Play пакете | ЛК ЮKassa → новый секретный ключ |
| 2 | **PII_ENCRYPTION_KEY** (Fernet, расшифровывает ПД) | `config.py` | ⚠️ ТОЛЬКО с миграцией зашифрованных данных (перешифровать `*_enc` старым→новым ключом), иначе ПД станут нечитаемыми |
| 3 | **Telegram BOT_TOKEN** (основной бот) | `config.py`, `tg-config.php`, (был в `bot.log`) | @BotFather → `/revoke` → новый токен |
| 4 | **Telegram BOT_TOKEN** (smm_bot, отдельный) | `smm_bot/config.py` | @BotFather |
| 5 | **Claude API key** (`sk-ant-`) — общий с smm_bot | `config.py` + `smm_bot/config.py` | console.anthropic.com → revoke + новый. **Завести отдельный ключ на каждое приложение** |
| 6 | **OpenAI API key** (`sk-proj-`) — общий с smm_bot | `config.py` + `smm_bot/config.py` | platform.openai.com → revoke + новый (отдельный на приложение) |
| 7 | **YClients partner + user токены** | `config.py`, `api-proxy.php`, `tg-auth/api-proxy.php` | кабинет партнёра YClients |
| 8 | **VK secure key + access token** | `config.py`, `smm_bot/config.py` | vk.com/dev (приложение) |
| 9 | **Publer API key** | `smm_bot/config.py` | ЛК Publer |
| 10 | **WEBHOOK_SECRET** | `config.py` | сгенерировать новый, обновить URL вебхука YClients |
| 11 | **VAPID keypair** | `ai администратор/vapid_private.pem` (боевой, 0600) | сгенерировать новую пару; ⚠️ подписчикам PWA нужно переподписаться на новый публичный ключ |
| 12 | **CRM API_TOKEN** | `_archive/.../subsystems/CRM/` | если CRM не возрождается — не актуально |
| 13 | **Android signing keystore** + пароль | `МЭП - Google Play package/signing.keystore` + `signing-key-info.txt` | если утечка подтверждена — Play Console → сброс upload-ключа |

## Шаг 2. Ввести в строй каркас (config.example.py → config.py)
Каркас уже готов в `ai администратор/`. Порядок (выполнять ПОСЛЕ Шага 1 — ротации):
```bash
cd "$HOME/Desktop/сайт и приложение/ai администратор"
cp .env.example .env && chmod 600 .env          # 1) создать .env
# 2) вписать в .env НОВЫЕ (ротированные) ключи; PII_ENCRYPTION_KEY — действующий!
pip install python-dotenv                         # 3) если ещё не стоит
python -c "import config"                          # 4) проверка: импорт без ошибок = все ключи на месте
cp config.py config.py.preenv.bak && mv config.example.py config.py   # 5) подменить (бэкап старого)
```
- На **VPS**: положить `.env` в каталог бота (права 600) и в systemd-юните добавить `EnvironmentFile=/home/botadmin/barbershop-bot/.env`, затем `systemctl restart barbershop-bot` (+ webhook-сервис). Проверить логи, что поднялось.
- **smm_bot** использует ТЕ ЖЕ Claude/OpenAI ключи — для него сделать аналогичный каркас (или временно подставить новые ключи), иначе после ротации он отвалится.
- **PHP-прокси**: `PARTNER_TOKEN`/`COMPANY_ID`/`BOT_TOKEN` вынести в include **выше docroot** (как уже сделано для `tg-config.php`), не в файл внутри `pwa-assets/`.
> Я (Claude) могу выполнить шаг 5 (подмену `config.py`) сам, когда подтвердишь, что `.env` заполнен и `python -c "import config"` проходит — чтобы не уронить боевой бот раньше времени.

## Шаг 3. Подчистить Beget (веб-рут) — ручная проверка на хостинге
- Удалить с Beget (если выложены): `api-proxy.php.bak.sesstoken`, `debug-tg.php`, любые `*.pem`.
- Расширить `.htaccess`: добавить `bak|sesstoken|yclientsms|py|pem` в `FilesMatch` (сейчас покрыты только `env|ini|log|conf|pem|sqlite|db` — `.bak`/`.sesstoken` НЕ покрыты, отдаются plaintext).
- Проверить: `GET /pwa-assets/tg-auth/api-proxy.php.bak.sesstoken` → должно быть 403/404, не исходник.

## Шаг 4. Завести git правильно
```bash
cd "$HOME/Desktop/сайт и приложение"
git init
# .gitignore уже на месте — проверь, что config.py/*.pem/*.db/*.log НЕ попадают:
git add -A && git status   # убедись, что секретов в списке нет
git commit -m "Initial commit (secrets excluded, post-revision)"
```
> Если секреты случайно закоммитятся — недостаточно их удалить следующим коммитом: нужно либо пересоздать репозиторий, либо `git filter-repo`. Лучше проверить ДО первого commit.

## Шаг 5. После ротации
- Удалить `_archive/2026-06-17/SECRETS-DELETE-AFTER-ROTATION/` целиком (старые секреты обесценятся).
- Убрать `signing-key-info.txt` и `secret_key.txt` из синхронизируемых папок (iCloud/Dropbox/Desktop).
