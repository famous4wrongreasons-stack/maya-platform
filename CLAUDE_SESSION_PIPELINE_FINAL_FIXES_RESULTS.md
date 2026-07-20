# CLAUDE_SESSION_PIPELINE_FINAL_FIXES_RESULTS

> Ответ на `CLAUDE_SESSION_PIPELINE_FINAL_FIXES.md`. Claude, 2026-07-07.
> Backend/контракт/миграции не тронуты, production не деплоился, несвязанные dirty-изменения не задеты. Редизайна нет — только пограничные фиксы.

## Изменённые файлы

- `сайт и приложение/app.html` — route classification, lock/heartbeat/timeout, waitForRotation-состояния, verified bundle writes, честные ошибки, revoke-гарды;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало, **byte-identical** (`cmp` чистый);
- `сайт и приложение/maya-admin.html` — LOGIN_BUSY, retry-после-успеха, классификация, logout через pipeline, полная пара, item-6;
- `сайт и приложение/oauth-callback.html` — полная пара + read-back верификация записи;
- `сайт и приложение/maya-start.html` — handoff только с полной парой.

## 1. Route classification

`saasIsPublicAuthPath()` (PWA) / `isPublicAuthPath()` (admin): публичные = `/auth/refresh` (сырой), `/auth/login*`, `/auth/phone/*`, `/auth/oauth/*`. **Всё остальное — refresh-aware**, включая `/auth/logout`, `GET/DELETE /auth/sessions*`. Logout при истёкшем access: сначала одна rotation (проактивная, <30с до истечения), затем серверный `POST /auth/logout` с новым Bearer; локальная очистка — в finally-семантике всегда; терминальная refresh-ошибка тоже спокойно завершает локальную сессию.

## 2. Lock / heartbeat / timeout

- **Предпочтительно Web Locks API**: `navigator.locks.request('me_saas_auth_refresh', exclusive)` — нативная очередь, авто-освобождение при смерти вкладки; внутри эксклюзива bundle перечитывается (уже ротирован → возврат без сети; удалён → `logged_out`).
- **Fallback** (нет Web Locks): localStorage-lease `{owner, exp: now+15с}` + **heartbeat каждые 5с** на всё время операции, включая ожидание `retry_after_seconds`. Ожидающий крутится в цикле перечитки lease (продлённая lease = ждём дальше), джиттер 25–75мс + перечитка после захвата.
- **`AbortController` timeout 30с** на каждый raw `/auth/refresh` (согласован: heartbeat держит lease живой всё это время). Таймаут → `refresh_timeout`, пара не трогается.
- **После каждого await** и перед КАЖДЫМ refresh-запросом токен перечитывается из текущего bundle: удалён → `logged_out`; заменён → возврат новой пары без сети. Фолбэк вида `current.refresh_token || capturedOld` удалён. Освобождается только собственная lease (проверка owner).

## 3. waitForRotation

Возвращает `{state: 'rotated'|'logged_out'|'timeout', session}`. Будится: `storage`-событием, `BroadcastChannel` (`rotated`/`logout`), локальным `me-saas-logout`, поллингом 250мс. Удаление bundle владельцем → **немедленный** `logged_out`; после него waiter не захватывает lock и не вызывает refresh.

## 4. Verified bundle writes

`saasSaveBundle`: (а) принимает ТОЛЬКО непустые `access_token` **и** `refresh_token` — половина пары не перезаписывает прежний bundle (спокойная ошибка `refresh_incomplete`); (б) после `setItem` — read-back: записана именно новая пара, иначе `null`. Если запись **rotated**-пары не удалась → `saasForceLogout('bundle_write_failed')` (старый refresh уже одноразово использован — доступным не остаётся), проверка очистки, broadcast, спокойный вход. То же правило в phone verify, OAuth callback (read-back), admin login (`adminSetBundle` → false на половине пары), onboarding handoff (пишется только полная пара) и обоих refresh-попытках (initial + delayed).

## 5. Честные ошибки (item 6)

После delayed retry: только фактический второй `429 auth_rate_limited` возвращается как rate limit; терминальные — терминальная обработка; network/timeout/4xx/5xx выходят наружу со своим реальным status/code/message; третьего повтора нет. Одинаково в PWA (`saasPerformRefresh`) и admin (`doRefresh`).

## 6. Admin

`LOGIN_BUSY` — синхронный guard (двойной Enter в одном кадре = один `/auth/login`). `api()` повторяет исходный запрос **только** после успешного `doRefresh()` (ошибка refresh уходит наружу, повтора со старым Bearer нет). Logout переведён на `api('POST','/auth/logout')` (refresh-aware) с reload в finally. Бонус-фикс: ошибка на этапе `enter()` возвращает форму логина, чтобы сообщение было видно. В PWA revoke/logout-действия получили синхронный `mySessReqRef`-guard (два тапа = один DELETE).

## Acceptance tests — счётчики запросов

| # | Тест | Счётчики | Вердикт |
|---|---|---|---|
| 1 | Истёкший access + `GET /auth/sessions` | refresh **1**; sessions Bearer `at_1`; список отрисован | ✅ |
| 2 | Истёкший access + logout (revoke текущей) | refresh **1**; `DELETE` **1** (at_1); `POST /auth/logout` **1** с Bearer `at_1`; bundle очищен; экран входа | ✅ |
| 3 | Два Enter в admin login в одном кадре | `/auth/login` **1** | ✅ |
| 4 | Admin: 401 + refresh 500 | исходный `/admin/tenants/:id` **1** (не повторён); refresh **1**; ошибка видна | ✅ |
| 5 | Owner-refresh висит 20с (>15с lease), две вкладки | refresh **суммарно 1**; reuse **0**; обе вкладки на `at_1/rt_2` — и Web Locks (**I**), и fallback-lease+heartbeat (**I2**) | ✅✅ |
| 6 | Terminal у owner, waiter ждёт | refresh **1**; reuse **0**; bundle стёрт в обеих; оба экрана — вход; и Web Locks (**D**), и fallback (**D2**, waiter будится `logged_out`) | ✅✅ |
| 7 | Rotation-ответ без `refresh_token` | refresh **1**; пара **сохранена** (`at_0/rt_1`); спокойная ошибка | ✅ |
| 8 | `setItem`-fail после успешной rotation | refresh **1**; bundle **очищен** (старый rt недоступен); спокойный вход | ✅ |
| 9 | 429 → delayed retry получает 500 | refresh **2** (третьего нет); наружу «Внутренняя ошибка сервера», НЕ rate limit; пара сохранена | ✅ |
| 10 | Parse + зеркало | `node --check` все inline OK (4 файла); `cmp` app.html vs iOS — byte-identical | ✅ |

## Регрессия (прежние тесты)

- **A** — параллельные 401 в одной вкладке: refresh **1**, rotation `at_1/rt_2`, каталог загружен ✅
- **B** — две вкладки happy-path: refresh **1**, обе живы на новой паре ✅
- **C** — 429×2 на refresh: вызовов **2**, пара цела, rate-limit сообщение ✅
- **E** — double-click «Получить код»: **1** запрос ✅

## Методика

Headless CDP + fetch-стаб контракта (rotation-семантика: повтор использованного rt → `refresh_token_reused`, стаб помнит использованные; счётчики в localStorage — общие для вкладок). Fallback-путь проверялся отключением `navigator.locks` в стабе. Против реального бэка ветки не гонялось (общий чекаут на другой ветке).
