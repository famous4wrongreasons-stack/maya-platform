# Задание Клоду: frontend для auth rate limits

Codex добавил backend-контракт защиты авторизации в ветке `codex/auth-abuse-protection`. Backend и миграции не меняй.

## Что сделать

1. Во всех auth-flow обработай HTTP `429` с `error.code === "auth_rate_limited"`: пароль, регистрация, телефон, Yandex/Telegram, refresh и trial signup.
2. Используй `error.retry_after_seconds` или заголовок `Retry-After` для локального countdown.
3. На время countdown блокируй только повтор соответствующего действия, а не всё приложение.
4. Не запускай автоматический retry-loop и не показывай технический JSON.
5. Для SMS сохрани текущий таймер: теперь backend реально отклоняет повтор до разрешённого времени.
6. Для refresh при `auth_rate_limited` не очищай токены немедленно; дождись разрешённого времени или предложи повторный вход. Ошибки `refresh_token_invalid/reused`, `session_expired/revoked` обрабатывай по прежнему session-security заданию.
7. Синхронизируй PWA и iOS зеркало и прогони их parse/build проверки.

## Acceptance

- Countdown использует серверное значение и переживает повторный render.
- Параллельные кнопки не создают несколько одинаковых запросов.
- После окончания countdown действие снова доступно.
- Остальные экраны и текущий дизайн не меняются.
