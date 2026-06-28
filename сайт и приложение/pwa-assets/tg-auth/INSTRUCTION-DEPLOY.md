# Telegram-авторизация в PWA — деплой

## Что внутри

```
pwa-assets/tg-auth/
├── tg-config.php             ← секретный конфиг (BOT_TOKEN)
├── .htaccess                 ← защита от прямого доступа к конфигу
├── api-proxy.php             ← обновлённая версия с 2 новыми actions
├── webhook_server-patch.py   ← код для добавления в бот
└── INSTRUCTION-DEPLOY.md     ← эта инструкция
```

`app.html` в основной папке уже обновлён — содержит экран логина, виджет Telegram и логику переключения режимов.

---

## ШАГ 1 — BotFather (если ещё не сделал)

```
/setdomain → @malesthetic_bot → malesthetic.pro
```

Без этого Telegram-виджет не сработает на сайте.

---

## ШАГ 2 — Залить на Beget (в папку `/app/`)

В FTP открой `malesthetic.pro/app/` (та же папка где `api-proxy.php` лежит). Загрузи туда:

| Файл из `pwa-assets/tg-auth/` | Куда на Beget | Заметка |
|---|---|---|
| `tg-config.php` | `/app/tg-config.php` | НИКОМУ не показывать, не коммитить в git |
| `.htaccess` | `/app/.htaccess` | Если уже есть — добавь содержимое к существующему |
| `api-proxy.php` | `/app/api-proxy.php` | **Перезатрёт старый.** Сначала сохрани бэкап старого! |

### Проверь что работает:

- https://malesthetic.pro/app/api-proxy.php?action=version → должно вернуть `{"success":true,"version":"v7_tgauth"}`
- https://malesthetic.pro/app/tg-config.php → должно вернуть **403 Forbidden** (если открывается JSON-ом или содержимым — `.htaccess` не работает, защити вручную через настройки Beget)

---

## ШАГ 3 — Залить `app.html` на Beget

В корне локальной папки → залить `app.html` в `/app/index.html` (как обычно).

---

## ШАГ 4 — Обновить бот (Python, отдельный сервер)

На сервере бота (Yandex Cloud):

1. Открой `webhook_server.py` в редакторе
2. Из файла `webhook_server-patch.py` скопируй **три** функции:
   - `_verify_telegram_login_widget(...)`
   - `cabinet_me_via_login_handler(...)`
   - `_mask_phone_helper(...)`
3. Вставь их в `webhook_server.py` где-нибудь перед `start_webhook_server` (например, после `cabinet_me_handler`)
4. В функции `start_webhook_server` найди блок где регистрируются роуты:
   ```python
   web_app.router.add_get("/api/cabinet/me", cabinet_me_handler)
   web_app.router.add_options("/api/cabinet/me", cabinet_options_handler)
   ```
   Добавь под ними:
   ```python
   web_app.router.add_post("/api/cabinet/me-via-login", cabinet_me_via_login_handler)
   web_app.router.add_options("/api/cabinet/me-via-login", cabinet_options_handler)
   ```
5. Перезапусти бота (`systemctl restart bot` или как обычно)

---

## ШАГ 4.1 — Включить Web Push для мастеров

На сервере бота (Yandex Cloud):

1. Скопируй рядом с `webhook_server.py` файлы:
   - `vapid_private.pem`
   - `requirements.txt`
   - `master_push_subscriptions.sql` (как справку по структуре таблицы)
2. Установи зависимость:
   ```bash
   python3 -m pip install -r requirements.txt
   ```
3. Обнови `webhook_server.py` новой версией из этой папки.
4. Перезапусти бота.

Если в основном `database.py` нет своих методов для push, `webhook_server.py`
сам создаст SQLite-файл `master_push_subscriptions.sqlite3` рядом с собой.
Через переменную окружения `MASTER_PUSH_DB` можно задать другой путь.

В приложении уже прописан VAPID public key, поэтому после распознавания мастера
PWA/APK попросит разрешение на уведомления и сохранит подписку через
`/app/api-proxy.php?action=push_subscribe`.

---

## ШАГ 5 — Протестировать

### Открой `https://malesthetic.pro/app/` на компьютере в Chrome:

1. Должен появиться экран «Войти в приложение» с двумя кнопками
2. Жми «Войти через Telegram»
3. Откроется маленькое окно Telegram «Разрешить @malesthetic_bot войти?»
4. Жми Accept
5. Окно закроется, экран логина исчезнет, увидишь интерфейс с 5 кнопками
6. В правом верхнем углу — твоё имя и аватарка с кнопкой «Выйти»
7. Жми «Личный кабинет» → должен открыть твой кабинет (если ты есть в БД бота)

### Если что-то не работает:

- Открой DevTools (F12) → Console — смотри ошибки
- Открой Network — смотри что отдаёт `tg_login_verify` и `cabinet_me_login`
- Если `invalid_signature_or_expired` — проверь что в `tg-config.php` правильный BOT_TOKEN
- Если `bot_unreachable` — проверь что бот работает: `curl http://111.88.148.206:8080/api/cabinet/me-via-login`

---

## Откат если всё сломалось

1. На Beget верни старый `/app/api-proxy.php` из бэкапа
2. Удали `/app/tg-config.php`
3. Старый `app.html` (PWA с одной кнопкой) можно вернуть из git/бэкапа

---

## Что дальше можно улучшить (потом)

- Полный ЛК в PWA: пока возвращается только имя/баллы (см. TODO в `webhook_server-patch.py`)
- Чтобы скопировать всю логику ЛК из `cabinet_me_handler` — вынести её в helper-функцию, вызывать из обоих хэндлеров
- «Запомни меня на 90 дней» вместо стандартных 30
