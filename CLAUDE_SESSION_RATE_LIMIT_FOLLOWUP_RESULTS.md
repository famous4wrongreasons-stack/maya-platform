# CLAUDE_SESSION_RATE_LIMIT_FOLLOWUP_RESULTS

> Ответ на `CLAUDE_SESSION_RATE_LIMIT_FOLLOWUP.md`. Claude, 2026-07-07.
> Backend/миграции не тронуты, production не деплоился, несвязанные dirty-изменения не задеты.

## Изменённые файлы

- `сайт и приложение/app.html` — bundle-хранилище, refresh-pipeline, 429/терминальные, logout, устройства/сессии, оба дефект-фикса;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало, md5 идентичен app.html;
- `сайт и приложение/oauth-callback.html` — сохраняет полный bundle;
- `сайт и приложение/maya-start.html` — handoff = полный bundle;
- `сайт и приложение/maya-admin.html` — bundle в `S`, single-flight refresh в `api()`, серверный logout.

## Схема storage bundle

`localStorage['me_saas_auth_v1']` (PWA/iOS; oauth-callback пишет тот же ключ), одно JSON-присваивание:

```json
{
  "token": "<access_token>",
  "refresh_token": "maya_rt_...",
  "access_expires_at": 1783440000000,
  "refresh_expires_at": "ISO",
  "session": { "id": "...", "device_name": "...", "status": "active", "is_current": true },
  "user": { }
}
```

- `saasSaveBundle(res)` — единственная точка записи пары (login/verify/oauth/rotation): новый access только со своим же refresh.
- `saasUpdateUser(user)` — PATCH-профиль обновляет ТОЛЬКО `user`, пара не трогается.
- Legacy-запись `{token}` без refresh: работает до первого `401` → `saasForceLogout('legacy_401')` → спокойный вход; refresh из неё не вызывается.
- `maya_admin_handoff` — тот же bundle-формат; админка потребляет его одноразово (`removeItem`), две вкладки пару не делят. Админка держит bundle в памяти (`S`), как и раньше — persist не добавлялся.

## Single-flight и cross-tab

- **Вкладка:** `saasDoRefresh()` — один shared promise (`window.__meSaasRt.p`); все ожидающие вызовы делят его (в т.ч. 429-ожидание). Промис сбрасывается в `finally`.
- **Между вкладками:** lock `localStorage['me_saas_refresh_lock']` = `{owner, exp}` (15с; при 429 продлевается на `retry_after`). Не-владелец ждёт смену пары через `BroadcastChannel('me_saas_auth')` + `storage`-событие + поллинг 250мс до `lock.exp`. После записи lock — джиттер 25–75мс и перечитка (гонка записи в один кадр), затем перечитка session (пара могла смениться, пока ждали).
- **Стейл-401:** если 401 пришёл на access, который уже не равен текущему в storage (другая вкладка ротировала) — повтор сразу с текущим access, refresh не зовётся.
- **Использование:** `localBookingFetch` сам делает (а) проактивную rotation при `access_expires_at - now < 30с`, (б) на первый 401 не-auth запроса — одну rotation и один повтор исходного запроса (`__retried`). Пути `/auth/*` исключены из обвязки. Все существующие вызовы прошли через эту центральную точку — колл-сайты менять не пришлось.
- Аналогичный single-flight (`REFRESH_P`) и retry-once — в `api()` админки.

## 429 на /auth/refresh

- Пара НЕ очищается; ожидание = серверный `retry_after_seconds`/`Retry-After`; ровно один отложенный повтор внутри той же single-flight операции.
- Повторный 429 → ошибка `auth_rate_limited` наверх, credentials сохранены; рестор-путь показывает спокойный экран входа без уничтожения bundle; каталог показывает «Слишком много попыток…» с кнопкой «Повторить».
- Автоповторы `GET /me` удалены (мёртвая ветка из прошлого патча вырезана): рестор = одна проверка `/me`, истёкший access чинит pipeline.

## Терминальные коды, logout, revoke

- `refresh_token_invalid | refresh_token_reused | session_expired | session_revoked` → `saasForceLogout`: пара стирается, `BroadcastChannel` + `storage`-событие закрывают защищённый UI во ВСЕХ вкладках, экран — спокойный вход (без JSON).
- Logout (PWA и админка): сначала `POST /auth/logout` с текущим Bearer, затем в finally-семантике локальная очистка + broadcast.
- Мини-кабинет «Мои записи» → блок **«Устройства»** (без редизайна, по клику «Показать активные сессии»): `GET /auth/sessions` (device_name + метка «это устройство» по `is_current`), `DELETE /auth/sessions/:id` («Отозвать» / «Выйти» для текущей → немедленный logout), `DELETE /auth/sessions` («Выйти на всех устройствах» → logout).

## Два дефекта прошлого патча

1. **Same-frame double click/Enter**: синхронный `authReqRef` (useRef) в `authStart/authVerify/authSocial`; в админке `doLogin` гейтится `LOGIN_LOCK` + `disabled`. Проверено смоуком (ниже).
2. **Вечный interval на стадии `code`**: тикер теперь живёт ТОЛЬКО пока `max(authResendAt, verify-lock, social-lock) > now`; последний тик отрисовывает разблокировку и сам гасит interval.

## e2e-смоуки (headless CDP, fetch-стаб контракта; станд. профиль)

| Сценарий | Результат |
|---|---|
| A. Одна вкладка, `/branches`+`/staff` параллельно 401 | ✅ refresh-запросов ровно **1**, пара `at_1/rt_2`, оба запроса повторены, каталог загружен |
| B. Две вкладки с одной парой, обе бьются в 401 | ✅ refresh суммарно **1**, вторая вкладка приняла новую пару, обе живы |
| C. `/auth/refresh` → 429 (retry_after 2с), дважды | ✅ вызовов ровно **2** (initial + один отложенный, без цикла), пара **сохранена** (`at_0/rt_1`), спокойная ошибка |
| D. `/auth/refresh` → `refresh_token_reused`, две вкладки | ✅ пара стёрта в **обеих**, оба экрана — спокойный вход |
| E. Двойной trusted-click «Получить код» (ответ 400мс) | ✅ auth-запросов ровно **1**, флоу продолжился |

Rotation-семантика стаба: повторное использование старого refresh → `refresh_token_reused` (стаб помнит использованные) — сценарии A/B прошли без единого reuse.

## Parse / cmp

- `node --check` всех inline-скриптов: app.html (21), maya-start, maya-admin, oauth-callback — **все OK**.
- iOS-зеркало: `md5(app.html) == md5(maya-ios/www/index.html)` ✅.

## Примечания

- Смоуки шли на fetch-стабе по контракту пакета; против реального бэка ветки не гонялись (общий чекаут на другой ветке — не переключал). Если что-то в реальных ответах отличается — правка точечная.
- UI «Устройства» ждёт реальных ответов `GET /auth/sessions` — форма нормализуется и как массив, и как `{sessions:[…]}`.
