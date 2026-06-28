# Применённые исправления безопасности бэкенда бота — 2026-06-22

> Источник: `SECURITY_AUDIT_2026-06-22.md` + `..._DEEP.md`. Бэкап оригиналов:
> `_archive/2026-06-22-secfix/`. Все файлы проходят `py_compile`; `redact_pii` и
> rate-limiter покрыты функциональными тестами. **Ещё НЕ задеплоено на VPS.**

## ✅ Сделано (код в `ai администратор/`)

### P0
1. **BOLA в журнале мастера** — `webhook_server.py`.
   Добавлен страж `_panel_record_guard(info, record_id)`. Привязанный мастер теперь
   может читать/менять **только записи своей колонки** (сверка `record.staff_id`
   из YClients со своим `staff_id`); владелец/управляющий — полный доступ.
   Применён к 8 операциям: `journal_reschedule, journal_cancel, journal_attendance,
   journal_record, journal_pay, journal_add_service, journal_set_services,
   journal_set_client_name`. Для мастера запись грузится один раз (переиспользуется
   в `journal_record`); для owner/manager лишнего запроса нет.
2. **VK-вход отключён** — `webhook_server.py`.
   Роуты `/api/auth/vk` и `/api/auth/vk-sdk` закрыты по умолчанию (гейт на
   `config.VK_LOGIN_ENABLED`, сейчас `False`) → весь VK-контур недоступен снаружи.
   Обратимо одним флагом. (Серверная верификация VK-токена в `web_auth.py` уже
   была на месте — оставлена как defense-in-depth.)
3. **Привязка порта настраиваема** — `webhook_server.py` + `config.py`/`config.example.py`.
   Новый `WEBHOOK_BIND` (по умолчанию `0.0.0.0` — поведение не изменилось).
   После поднятия nginx+HTTPS на VPS поставить `127.0.0.1` и закрыть 8080 фаерволом.
4. **Rate-limit телефонного входа** — `webhook_server.py`.
   In-process лимитер (один HTTP-процесс ⇒ атомарно): `phone/start` — 5/час на
   IP и на номер + cooldown 60 сек (анти-SMS-бомбинг); `phone/verify` — 7 попыток/
   15 мин на номер (анти-брутфорс кода). Превышение → HTTP 429 + `retry_after`.
5. **Расширен `redact_pii`** — `anonymizer.py`.
   Добавлено: банковские карты (с проверкой Луна), СНИЛС, ИНН, паспорт (по
   ключевому слову), @ник. Улучшает ВСЕХ потребителей (советы мастерам, веб-чат,
   голосовой мост, remember_client). Тесты: реальные ПД режутся, невалидная по
   Луну «карта» остаётся, обычный текст («15:00», «1500 ₽») не ломается.

### P1
6. **Лимит входящего WS** — `webhook_server.py:realtime_handler`.
   `max_msg_size` инбаунд-сокета 0 → `1 МиБ` (анти-DoS по памяти).
7. **Атомарное погашение баллов** — `database.py` + `loyalty.py`.
   `claim_loyalty_code()` (UPDATE … WHERE used_at IS NULL); `consume_redeem_code`
   столбит код ДО списания → двойной тап/два кассира не спишут баллы дважды.
8. **Лимит длины запоминаемого текста** — `claude_ai.py`.
   `remember_client_preference` / `remember_business_rule` усечены до 500 симв.
   после redact — сужает окно инъекции второго порядка (текст подмешивается в промпт).

## ⚠️ Поведенческое (учтено)
- **Кассир/ресепшен.** По решению владельца страж пропускает роль `is_cashier`
  (`can_redeem`) наравне с owner/manager — кассир/ресепшен ведёт записи всего
  салона (телефоны клиентов им всё равно не показываются, `can_phone=owner`).
  Обычный мастер без кассы — только свои записи.
- Журнал-**список** (`/api/panel/journal`) по-прежнему показывает всем сотрудникам
  доску дня с именами (без телефонов) — это исходный дизайн общего расписания, не
  трогал. Телефоны и полная история визита — закрыты стражем/ролью.

## ⏳ Только владелец (я не могу)
- **Ротировать ВСЕ секреты** в кабинетах сервисов: ЮKassa, Telegram-бот, Claude,
  OpenAI, YClients, VK, `PII_ENCRYPTION_KEY`, `WEBHOOK_SECRET`. Лежат в открытом
  виде в `config.py` и `smm_bot/config.py`. Каркас выноса в env готов
  (`config.example.py` + `.env.example`): после ротации — заполнить `.env`,
  `mv config.example.py config.py`, перезапуск.
- **Инфра VPS:** фаервол на 8080, HTTPS-реверс-прокси (nginx) → затем `WEBHOOK_BIND=127.0.0.1`,
  fail2ban, права `chmod 600` на БД/.env, чистка остаточных plaintext-ПДн в БД/WAL.

## ❎ Вне контура бэкенда (не трогал)
- Проверка подписи/IP уведомления ЮKassa: в бэкенде бота отдельного callback-роута
  нет (подтверждение оплаты идёт поллингом/redirect). Если приём вебхука ЮKassa
  есть — он в `api-proxy.php` на Beget (отдельный деплой фронта).

## Деплой (когда подтвердишь)
scp изменённых `.py` на `botadmin@111.88.148.206:/home/botadmin/barbershop-bot/`
→ `sudo systemctl restart barbershop-bot` (скилл `deploy-maya`).
Изменены: `webhook_server.py, anonymizer.py, database.py, loyalty.py, claude_ai.py, config.py`.
