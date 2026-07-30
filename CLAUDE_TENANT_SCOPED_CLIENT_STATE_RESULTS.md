# CLAUDE_TENANT_SCOPED_CLIENT_STATE_RESULTS

> Ответ на `CLAUDE_TENANT_SCOPED_CLIENT_STATE.md`. Claude, 2026-07-07.
> Backend/API/миграции/production не тронуты. Редизайна нет. Несвязанные dirty-изменения не задеты.

## Изменённые файлы

- `сайт и приложение/app.html` — namespace (boot + компонент), проверяемое чтение bundle, tombstone, state-привязанный OAuth pending, restore-классификация ошибок + экран «Нет связи», fencing fallback-lease;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` — зеркало, **byte-identical**;
- `сайт и приложение/oauth-callback.html` — pending по state, ns-запись, без api-фолбэка;
- `сайт и приложение/maya-start.html` — одноразовый nonce-handoff;
- `сайт и приложение/maya-admin.html` — точечная правка: чтение handoff по nonce из `#handoff=`.

## Схема namespace

`ns = djb2(normalized(apiBase) + '|' + normalized(slug))` в base36 + суффикс из slug (только `[a-z0-9-]`). Формула продублирована в boot-скрипте app.html, компоненте и oauth-callback.html (помечено «менять синхронно»). Секретов и raw refresh token в ns нет.

| Было (глобально) | Стало (per-tenant) |
|---|---|
| `me_saas_auth_v1` | `me_saas_auth_v2:<ns>` |
| `me_saas_refresh_lock` | `me_saas_refresh_lock:<ns>` |
| `BroadcastChannel('me_saas_auth')` | `me_saas_auth:<ns>` |
| Web Lock `me_saas_auth_refresh` | `me_saas_auth_refresh:<ns>` |
| `me_saas_cfg_v1` | `me_saas_cfg_v2:<ns>` (+ slug-проверка при apply и записи) |
| `me_oauth_pending` | `me_oauth_pending:<state>` (одноразовый, TTL 15 мин) |
| `maya_admin_handoff` | `maya_admin_handoff:<nonce>` (одноразовый, TTL 10 мин, nonce в `#handoff=`) |

Bundle дополнительно несёт `tenant_slug` + `api_base`; **каждое** чтение (`saasReadSession`) сверяет их с текущим контекстом — чужая/легаси пара не используется. Single-flight/BC-состояние (`window.__meSaasRtMap`) тоже per-ns.

**Миграция legacy:** boot-скрипт удаляет глобальные `me_saas_auth_v1`, `me_saas_refresh_lock`, `me_saas_cfg_v1`, `me_oauth_pending`; старый bundle без tenant-метаданных молча не привязывается — спокойный новый вход. Админка игнорирует и удаляет legacy `maya_admin_handoff`.

## Restore: transient ≠ terminal

- Завершение сессии: 4 терминальных кода, `session_write_failed`, `logged_out`, `refresh_lock_stale`, подтверждённый `401` после единственного повтора, legacy без refresh.
- Пара СОХРАНЯЕТСЯ: `refresh_network`, `refresh_timeout`, `refresh_lock_busy`, HTTP `5xx`, потеря сети (`status == null`) → компактный экран «Нет связи» + «Повторить» (один повтор по действию пользователя, без reload и цикла; форма входа не показывается поверх живой сессии).
- `429` → пара цела + серверный countdown в сообщении, повтор ручной.

## Fallback-lease: fencing и fail-closed

- `renew()` продлевает lease ТОЛЬКО при `owner === myId`; чужой owner → `lost`, heartbeat останавливается, чужой lock не переписывается и не удаляется.
- `ownLock()` проверяется перед initial refresh и перед delayed retry (плюс всегда — актуальный bundle); потеря ownership → `refresh_lock_busy`, refresh не отправляется.
- Исчерпание wait-guard → `refresh_lock_busy` (lock не крадём).
- Умерший владелец (expired lock) + несменившаяся пара → **fail-closed**: `saasForceLogout('refresh_lock_stale')` — безопаснее повторный вход, чем риск `refresh_token_reused`. Чисто освобождённый чужой lock без rotation → транзиентный `refresh_lock_busy` (авто-переотправки одноразового token нет).
- `saasClearSession()` возвращает результат read-back; если storage не очистился — tombstone (`RT.tomb`) и bundle/refresh этим рантаймом больше не используются.

## Acceptance — счётчики и результаты

| # | Тест | Сценарий | Результат |
|---|---|---|---|
| 1 | A и B хранят разные полные bundles | T12 | ✅ `atA_1/rtA_2` (slug demo) и `atB_1/rtB_2` (slug demo2) одновременно |
| 2 | Параллельные refresh A/B | T12 | ✅ rcA=**1**, rcB=**1**, reuse=0, lock/канал не делятся |
| 3 | Logout A не трогает B | T3 | ✅ bundle A стёрт + гейт A; B — не сменил экран, bundle цел; серверный logout с Bearer `atA_1` |
| 4 | Два параллельных OAuth A/B | T4 | ✅ каждый bundle в своём ns с верным slug; оба pending одноразово удалены; A вернулся на URL с `booking_tenant=demo`, B — `demo2` |
| 5 | Offline B без кэша бренда A | T5 | ✅ cfg-кэш только у A; страница/заголовок B без «Salon A» |
| 6 | Transient restore | T6 | ✅ network-fail: пара сохранена + экран «Нет связи/Повторить»; после восстановления ручной повтор открыл приложение **без нового login** |
| 7 | Terminal restore per-tenant | T7 | ✅ rcA=1, только bundle A стёрт и только его UI закрыт; B авторизован |
| 8 | Lease fencing | T8 (без Web Locks) | ✅ «вор» забрал lease во время 429-ожидания → A не отправил второй refresh (rcA=**1**), reuse=**0**, пара цела, чужой lock не перезаписан/не удалён |
| 9 | Legacy global bundle | T9 | ✅ не использован ни для кого, удалён миграцией, спокойный вход |
| 10 | Регрессия + parse/cmp | R2/R3/R5 | ✅ 429×2 (rc=2, пара цела), double-click (1 запрос), две вкладки одного tenant (rc=1); parse все OK; PWA/iOS **byte-identical** |

## Методика

Headless CDP + fetch-стаб; токены/refresh-цепочки префиксованы tenant'ом (`atA_*/rtB_*`), счётчики per-tenant; ns в стабе вычисляется той же формулой. Fencing-тест: подмена владельца lease во время серверного 429-ожидания. Против реального бэка ветки не гонялось.
