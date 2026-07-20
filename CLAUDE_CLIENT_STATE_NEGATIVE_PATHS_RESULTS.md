# CLAUDE_CLIENT_STATE_NEGATIVE_PATHS_RESULTS

> Ответ на `CLAUDE_CLIENT_STATE_NEGATIVE_PATHS.md`. Claude, 2026-07-07.
> Backend/API/миграции/production не тронуты. Редизайна нет. Несвязанные dirty-изменения не задеты.

## Изменённые файлы

- `сайт и приложение/app.html` — restore-классификация, post-response fence, restore-429 countdown, канонический OAuth state + pending read-back, нейтральный placeholder;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало, **byte-identical**;
- `сайт и приложение/oauth-callback.html` — порядок state→pending→error, safe same-origin return URL, одноразовый pending на всех исходах;
- `сайт и приложение/maya-start.html` — nonce через `crypto.getRandomValues()` (Math.random только как фолбэк несовместимой среды);
- `сайт и приложение/maya-admin.html` — строгий TTL handoff + sweep протухших ключей.

## 1. Malformed refresh ≠ network error

- `refresh_incomplete` (успешный HTTP rotation, но неполная пара): старый refresh уже потреблён сервером → **controlled logout** (`saasForceLogout`) прямо в `saveRotated`; consumed token больше не отправляется; restore ведёт на спокойный вход (не «Нет связи»).
- `refresh_unavailable` (v2 bundle без refresh) → `saasClearSession()` + спокойный вход, без retry-loop.
- Transient сужен: `refresh_network | refresh_timeout | refresh_lock_busy | 5xx | потеря сети (status==null && !code)`. Все наши коды классифицируются явно.
- Неполный ответ ПЕРВИЧНОГО login (phone/OAuth/password) по-прежнему не перезаписывает существующую пару — отдельная ветка, не тронута.

## 2. Post-response fence

`saveRotated(body, sentRt)` перед записью КАЖДОГО успешного refresh-ответа (initial и delayed retry; Web Locks и fallback):

- fallback: повторная проверка ownership (`checkOwn`) — потерян → ответ НЕ записывается, `rotated` НЕ публикуется, чужой lock не трогается; осиротевшая server-session отзывается best-effort `POST /auth/logout` с НОВЫМ access (локальная пара при этом не восстанавливается);
- bundle перечитывается: удалён (logout другой вкладки) → не пишем, orphan revoke best-effort, `logged_out` — закрытый UI не воскресает;
- заменён новым login (`refresh_token !== sentRt`) → наш ответ не пишем, orphan revoke, возвращаем текущую (новую) пару.

## 3. Restore-429 countdown

`retry_after_seconds`/`Retry-After` → `restoreWaitAt`; кнопка «Повторить» заблокирована и показывает «Повторить · N с», тикер самоостанавливается последним тиком (разблокировка), авто-retry нет, пара цела.

## 4. OAuth cancel/error → правильный tenant

Callback теперь: сначала `state` → pending (с TTL 15 мин) → `RET_URL = safeRet(pend.ret)` (только same-origin, без open redirect) → и лишь потом обработка `error`/`code`. Provider cancel/error возвращает в исходный tenant и одноразово удаляет pending; ошибка `complete` тоже удаляет pending; чужой/протухший state токенов не пишет. `authSocial`: канонический `res.state`, сверка со state в `auth_url`, read-back записи pending — при сбое записи переход к провайдеру не происходит.

## 5. Handoff TTL и neutral placeholder

- Admin принимает handoff только с обязательным конечным числовым `ts` в окне `[-10 мин; +60 с]`; отсутствующий/будущий/протухший — отклоняется и ключ удаляется; на загрузке sweep всех `maya_admin_handoff:*` по тому же правилу.
- Nonce — `crypto.getRandomValues(Uint8Array(16))`.
- Safe-mode чужого салона без кэша: до прихода config применяется нейтральный placeholder («Ваш салон», нейтральные hero/тексты, скрытые МЭ-виджеты) — бренд «Мужская Эстетика» не мелькает; default tenant вне safe-mode не изменён.

## Acceptance — поведение и счётчики

| # | Тест | Счётчики | Вердикт |
|---|---|---|---|
| 1 | Refresh 200 без `refresh_token` | refresh **1**; consumed token не повторён; bundle очищен; спокойный вход | ✅ |
| 2 | V2 bundle без refresh | refresh **0**; один спокойный вход; экрана «Нет связи»/retry-loop нет | ✅ |
| 3 | B стёрла bundle, поздний 200 A | refresh **1**; bundle остался удалён; `rotated` не опубликован; UI не воскрес; orphan-session отозвана Bearer `atA_1` (logout=1) | ✅ |
| 4 | A потеряла ownership во время запроса | refresh **1**, reuse **0**; bundle (`atA_0/rtA_1`) и чужой lock (`thief`) не перезаписаны; orphan отозвана `atA_1` | ✅ |
| 5 | Restore 429 | кнопка «Повторить · N с» заблокирована до серверного времени (клик по ней ничего не шлёт: rc остался 2); после countdown ручной клик → refresh **3-й** → вход без login-формы | ✅ |
| 6 | OAuth cancel tenant B | pending B удалён; возврат на URL с `booking_tenant=demo2`; bundle A не изменён (`atA_1`); bundle B не записан | ✅ |
| 7 | Ошибка записи pending | перехода к провайдеру нет (остались на app.html); спокойная ошибка «Не удалось начать вход»; pending-ключей 0 | ✅ |
| 8 | Handoff ts: отсутствует/протух/будущий | bundle не принят (форма логина); все `maya_admin_handoff:*` удалены | ✅ |
| 9 | Offline чужой tenant без кэша | title «Ваш салон»; ни «Salon A» (кэш соседа), ни «MAYA/Мужская Эстетика» на странице | ✅ |
| 10 | Регрессия | T12 (изоляция+2×refresh), T3 (logout A≠B), R2 (429×2), R3 (double-click), R5 (две вкладки=1 refresh) — все OK; parse все файлы OK; PWA/iOS **byte-identical** | ✅ |

## Методика

Headless CDP + fetch-стаб контракта; per-tenant счётчики; сбой записи storage эмулировался патчем `Storage.prototype.setItem`; потеря ownership — подменой владельца lease во время сетевого запроса; «поздний 200» — задержкой ответа refresh (3–4 с) с удалением bundle в полёте.
