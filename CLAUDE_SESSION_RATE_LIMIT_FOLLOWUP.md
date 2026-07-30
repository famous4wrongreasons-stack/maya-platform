# Задание Клоду: закрыть session security и refresh rate limit

## Контекст

Codex проверил `CLAUDE_AUTH_RATE_LIMIT_RESULTS.md` против backend-ветки `codex/auth-abuse-protection`.

Принято без переделки:

- формат `429` разобран правильно: `error.code === "auth_rate_limited"`, `error.retry_after_seconds`, fallback на `Retry-After`;
- countdown для phone start/verify, password login, social start/complete и trial signup соответствует backend-контракту;
- PWA и iOS зеркало parse-clean и сейчас идентичны.

Backend и миграции не меняй. Production не деплой.

## Блокирующий разрыв

Пункт refresh пока не выполнен. `GET /me` не является refresh и не защищён auth refresh limiter'ом. Текущий frontend:

- нигде не сохраняет `refresh_token`;
- нигде не вызывает `POST /api/auth/refresh`;
- сохраняет только `access_token` после phone, OAuth, password и onboarding;
- поэтому не может безопасно пережить 15-минутное истечение access JWT;
- блок `429` с тремя повторами `GET /me` нужно удалить: это мёртвая ветка, а не реализация refresh.

## Backend-контракт

Все успешные password/phone/social/onboarding ответы содержат:

```json
{
  "access_token": "...",
  "refresh_token": "maya_rt_...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_expires_at": "ISO timestamp",
  "session": {
    "id": "uuid",
    "device_name": "Safari on iPhone",
    "status": "active",
    "is_current": true
  },
  "user": {}
}
```

Rotation:

```http
POST /api/auth/refresh
Content-Type: application/json

{"refreshToken":"maya_rt_..."}
```

Успешный refresh всегда возвращает новую пару. Старый refresh после rotation одноразовый: повторное использование отзывает всю сессию.

Терминальные коды refresh: `refresh_token_invalid`, `refresh_token_reused`, `session_expired`, `session_revoked`.

## Что сделать

### 1. Атомарное хранение пары

- Расширь session storage в PWA, OAuth callback, admin и onboarding handoff: сохраняй `access_token`, `refresh_token`, вычисленный `access_expires_at`, `refresh_expires_at`, `session` и `user` одним JSON-присваиванием.
- Никогда не записывай новый access со старым refresh.
- Старую запись только с `token` считай legacy: можно один раз проверить `/me`, но при первом `401` предложить новый вход; refresh из неё невозможен.
- `maya-start.html -> maya-admin.html` должен передавать весь token bundle, не только access token.

### 2. Настоящий refresh pipeline

- Перед истечением access token или после первого обычного `401` вызови `/auth/refresh`.
- После успешной rotation атомарно замени оба токена и повтори исходный API-запрос ровно один раз.
- В одной вкладке должен существовать ровно один shared/single-flight refresh promise.
- Между вкладками добавь `BroadcastChannel` либо эквивалентный lock с owner, expiry и публикацией новой пары. Две вкладки не должны отправить один refresh token параллельно.
- Не создавай бесконечный retry-loop.

### 3. `429` именно на refresh

- Если `/auth/refresh` вернул `auth_rate_limited`, не очищай token bundle.
- Используй серверный `retry_after_seconds`/`Retry-After`.
- Разрешён максимум один отложенный повтор в рамках одной single-flight операции; все ожидающие API-вызовы разделяют его.
- Если повтор снова получил `429`, сохрани credentials и покажи спокойное действие «Повторить вход через N с» либо возврат на экран входа без уничтожения bundle.
- Удали автоматические повторы `GET /me`: limiter установлен на `/auth/refresh`, а не `/me`.

### 4. Терминальные ошибки и logout

- При `refresh_token_invalid`, `refresh_token_reused`, `session_expired`, `session_revoked` очисти оба токена во всех вкладках и покажи повторный вход без технического JSON.
- Logout: сначала `POST /api/auth/logout` с текущим Bearer access, затем в `finally` очисти локальный bundle и разошли logout другим вкладкам.
- После отзыва текущей сессии защищённые экраны не должны продолжать работать на старом access JWT.

### 5. Устройства и сессии

В компактном кабинете добавь без редизайна:

- `GET /api/auth/sessions`;
- `DELETE /api/auth/sessions/:id`;
- `DELETE /api/auth/sessions`;
- метку текущего устройства по `is_current`;
- немедленный logout после отзыва текущей сессии.

### 6. Два дефекта текущего rate-limit patch

- Добавь синхронный ref/in-flight guard для `authStart`, `authVerify`, `authSocial` и password `doLogin`. Один `authBusy` state не блокирует два тапа/Enter в одном кадре.
- Исправь countdown effect: сейчас `authStage === "code"` держит секундный interval бесконечно после окончания всех таймеров. Interval должен существовать только пока хотя бы один timestamp находится в будущем и остановиться сразу после последнего countdown.

## Файлы

Ожидаемые frontend-файлы:

- `сайт и приложение/app.html`;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`;
- `сайт и приложение/oauth-callback.html`;
- `сайт и приложение/maya-admin.html`;
- `сайт и приложение/maya-start.html`.

Не перезаписывай и не откатывай несвязанные dirty-изменения в platform repo и `ai администратор/`.

## Acceptance

- Два одновременных `401` в одной вкладке создают один refresh request.
- Две вкладки с одной исходной парой создают один refresh request; вторая принимает новую пару.
- После rotation старый refresh не используется повторно.
- `429` на refresh сохраняет credentials и использует серверный countdown без retry-loop.
- Четыре терминальных refresh-кода очищают пару и ведут на спокойный повторный вход.
- Phone, OAuth callback, password login и onboarding handoff сохраняют полный bundle.
- Same-frame double click/Enter создаёт один auth request.
- Countdown interval прекращается после последнего таймера.
- Logout/revoke немедленно закрывает защищённый UI во всех вкладках.
- Все inline scripts parse-clean; PWA и iOS зеркало идентичны после правок.

## Результат

Верни один файл `CLAUDE_SESSION_RATE_LIMIT_FOLLOWUP_RESULTS.md` с:

- изменёнными файлами;
- схемой local storage bundle;
- описанием single-flight и cross-tab координации;
- результатами same-tab/two-tab concurrency tests;
- сценариями `429`, terminal errors, logout и revoke;
- parse/cmp результатами.
