# Финальный пакет Клоду: закрыть пограничные ошибки session pipeline

## Контекст

Codex проверил `CLAUDE_SESSION_RATE_LIMIT_FOLLOWUP_RESULTS.md` по фактическому frontend-коду и backend-контракту.

Принято без переделки:

- полный access/refresh bundle уже проходит через phone, OAuth, password и onboarding;
- same-tab single-flight реализован;
- базовый two-tab сценарий и stale-401 обработаны;
- один отложенный повтор после `429` и четыре терминальных refresh-кода реализованы;
- UI устройств/сессий добавлен;
- PWA и iOS зеркало идентичны и parse-clean;
- исправлены React same-frame guard и остановка countdown interval.

Ниже только найденные пограничные дефекты. Не делай редизайн и не переписывай auth заново.

Backend, API-контракт и миграции не меняй. Production не деплой. Не откатывай несвязанные dirty-изменения в platform repo, `ai администратор/` и iOS repo.

## 1. Защищённые `/auth/*` должны использовать refresh

Сейчас `localBookingFetch()` считает любой путь с `/auth/` auth-путём и исключает его из proactive refresh и retry после `401`. Из-за этого защищённые маршруты тоже исключены:

- `POST /auth/logout`;
- `GET /auth/sessions`;
- `DELETE /auth/sessions/:id`;
- `DELETE /auth/sessions`.

Замени общий `isAuthPath` на точную классификацию. Без refresh должны оставаться только публичные login/phone/social endpoints и сам сырой `/auth/refresh`. Защищённые logout/sessions обязаны проходить через обычную refresh-aware обвязку.

То же правило примени в `maya-admin.html`: не определяй публичность маршрута только по префиксу `/auth/`.

Logout в PWA и admin:

- если access истёк, сначала одна успешная rotation, затем серверный `POST /auth/logout`;
- после попытки серверного logout локальный bundle очищается в `finally`;
- терминальная refresh-ошибка также спокойно завершает локальную сессию;
- logout не должен оставлять активную серверную сессию только потому, что access JWT истёк.

## 2. Admin: строгий single-flight и retry только после успеха

В `maya-admin.html` нужны три точечных исправления.

1. Добавь синхронный `LOGIN_BUSY` guard в начало `doLogin()`. `disabled` блокирует мышь, но обработчик Enter всё ещё напрямую вызывает функцию. Повторный Enter в том же кадре должен создать ровно один login request.
2. В `api()` повторяй исходный запрос после `401` только если `doRefresh()` успешно вернул новый access. Network/timeout/`500` refresh-ошибку не проглатывай и не повторяй исходный запрос со старым Bearer.
3. Переведи admin logout с raw `fetch()` на тот же защищённый refresh-aware pipeline, сохранив локальную очистку в `finally`.

Для действий revoke в PWA также поставь синхронный ref/in-flight guard: два быстрых тапа не должны отправлять два одинаковых `DELETE`.

## 3. Cross-tab lock должен переживать долгий refresh

Текущий lease истекает через 15 секунд, но `saasRawRefresh()` не имеет timeout или heartbeat. Если fetch завис дольше lease, другая вкладка может повторно отправить тот же одноразовый refresh token и backend отзовёт всю сессию как reuse.

Сделай координацию безопасной:

- предпочти Web Locks API для межвкладочного exclusive lock, когда он доступен;
- fallback на `localStorage` lease должен регулярно продлеваться владельцем до завершения всей операции, включая ожидание `retry_after_seconds`;
- raw refresh должен иметь ограниченный timeout через `AbortController`, согласованный с TTL lease;
- после любого `await`, перед initial refresh и перед отложенным повтором заново проверь ownership и актуальный bundle;
- никогда не отправляй захваченный ранее refresh token, если bundle удалён, заменён или lock уже принадлежит другой вкладке;
- освобождай только собственный lock.

Одна медленная операция refresh дольше прежних 15 секунд всё равно должна дать суммарно один `/auth/refresh` на две вкладки.

## 4. Ожидающая вкладка должна сразу увидеть logout

`saasWaitForRotation()` сейчас завершается только при смене access token. Удаление bundle владельцем не завершает ожидание, поэтому waiter ждёт timeout и затем может попытаться использовать старый token.

Верни из ожидания различимые результаты `rotated`, `logged_out` и `timeout/lost_lock` либо эквивалентные состояния.

- `storage`/`BroadcastChannel` logout немедленно завершает waiter;
- после `logged_out` waiter не захватывает lock и не вызывает refresh;
- убери fallback вида `current.refresh_token || capturedOldRefreshToken` после ожиданий;
- перед каждым refresh request token берётся только из текущего валидного bundle.

## 5. Bundle записывается только полным и проверенным

Сейчас некоторые места принимают `access_token` без `refresh_token`, а `saasWriteSession()` проглатывает ошибку `localStorage.setItem()` и сообщает успех. После backend rotation это может оставить в storage уже использованный старый refresh token.

Исправь все точки получения/rotation bundle:

- phone verify;
- OAuth callback;
- password login/admin;
- onboarding handoff;
- refresh initial и delayed retry.

Правила:

- успешным считается только ответ, содержащий непустые `access_token` и `refresh_token`;
- неполный ответ не перезаписывает прежний bundle и показывает спокойную ошибку;
- после `setItem` прочитай bundle обратно и проверь, что записана именно новая пара;
- если запись новой rotated-пары не удалась, не продолжай работу с новым access в памяти: удали старый bundle, проверь очистку, разошли logout и покажи повторный вход;
- `adminSetBundle()` и `maya_admin_handoff` также не должны принимать половину пары.

## 6. Не маскировать вторую ошибку под `429`

После разрешённого delayed retry код PWA и admin сейчас превращает любой второй неуспех в `auth_rate_limited`, даже если backend ответил `500` или другим кодом.

- Только фактический второй `429`/`auth_rate_limited` должен возвращаться как rate limit.
- Terminal code сохраняет текущую terminal-обработку.
- Network, timeout, `4xx` и `5xx` должны сохранить свой реальный status/code/message.
- Никакого третьего автоматического повтора.

## Ожидаемые файлы

- `сайт и приложение/app.html`;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`;
- `сайт и приложение/oauth-callback.html`;
- `сайт и приложение/maya-admin.html`;
- `сайт и приложение/maya-start.html`.

Меняй только те из них, где исправление действительно требуется.

## Обязательные acceptance tests

1. Истёкший access + `GET /auth/sessions` -> один refresh -> sessions успешно загружены.
2. Истёкший access + logout -> один refresh -> серверный logout вызван с новым Bearer -> локальный bundle очищен.
3. Два Enter в admin login в одном кадре -> один `/auth/login`.
4. Admin: исходный запрос получил `401`, refresh получил `500` -> исходный запрос не повторён.
5. Две вкладки, owner refresh завис больше 15 секунд -> суммарно один refresh request, reuse отсутствует.
6. Owner получает terminal error и удаляет bundle -> waiter завершается сразу и не отправляет старый refresh token.
7. Auth/refresh ответ без `refresh_token` -> прежняя полная пара не перезаписана половиной bundle.
8. Эмулированная ошибка `localStorage.setItem` после успешной backend rotation -> старый refresh не остаётся доступным для повторного использования, UI переходит к спокойному входу.
9. Delayed retry после первого `429` получает `500` -> наружу выходит `500`, а не `auth_rate_limited`; третьего запроса нет.
10. Все inline scripts parse-clean; `app.html` и iOS `www/index.html` byte-identical.

Дополнительно повтори прежние same-tab и two-tab happy-path тесты, чтобы исправления lock не дали регрессию.

## Результат

Верни один файл `CLAUDE_SESSION_PIPELINE_FINAL_FIXES_RESULTS.md` с:

- изменёнными файлами;
- коротким описанием route classification, lock/heartbeat/timeout и bundle write verification;
- числом запросов в каждом из десяти acceptance tests;
- результатами прежних concurrency regression tests;
- parse/cmp результатами.
