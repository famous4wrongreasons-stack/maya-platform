# Задание Клоду: закрыть последние negative paths client state

## Контекст

Codex проверил `CLAUDE_TENANT_SCOPED_CLIENT_STATE_RESULTS.md` по фактическому коду и backend-контракту.

Принято без переделки:

- auth/config/lock/channel разделены по `apiBase + tenantSlug`;
- bundle проверяет tenant metadata при каждом чтении;
- OAuth pending и admin handoff получили одноразовые ключи;
- transient restore сохраняет credentials и показывает ручной retry;
- fallback lease получил ownership fencing;
- исходные десять тестов, parse и PWA/iOS cmp зелёные.

Ниже только негативные ветки, не покрытые текущим отчётом. Backend, API, миграции и production не трогай. Редизайн не делай. Несвязанные dirty-изменения не откатывай.

## 1. Malformed refresh нельзя повторять как network error

Сейчас restore относит любую ошибку без `status` к transient. Поэтому:

- `refresh_incomplete` после успешного HTTP refresh показывает «Нет связи» и оставляет уже потреблённый старый refresh token;
- `refresh_unavailable` для неполного v2 bundle также попадает в бесконечный ручной retry.

Исправь классификацию до общего `status == null`:

- `refresh_incomplete` после ответа rotation -> controlled logout/очистка текущего tenant bundle; старый refresh больше не отправлять;
- `refresh_unavailable` -> спокойный новый вход;
- `session_write_failed`, `logged_out`, `refresh_lock_stale` и четыре terminal code остаются terminal;
- только настоящие network/timeout/lock-busy/`5xx` сохраняют bundle.

Неполный ответ первичного phone/OAuth/password login по-прежнему не должен перезаписывать существующую полную пару. Это отдельный случай от уже выполненной server-side rotation.

## 2. Post-response fence: logout нельзя «воскресить»

`ownOrThrow()` сейчас вызывается до raw refresh, но не перед `saveRotated()`. Сценарий: вкладка A отправила refresh и зависла; вкладка B увидела stale lease и выполнила fail-closed logout; затем поздний `200` A снова записывает bundle и публикует `rotated`.

Перед записью каждого успешного refresh response:

- заново проверь ownership, если используется fallback lease;
- перечитай текущий tenant bundle;
- убедись, что bundle существует и всё ещё содержит именно пару/snapshot, из которой был отправлен request;
- если bundle удалён, заменён новым login или ownership потерян, response не записывай и `rotated` не публикуй;
- уже закрытый UI не должен вернуться в authenticated state;
- если безопасно возможно, отзови осиротевшую server session новым access token best-effort, но никогда не восстанавливай локальную пару ради этого.

Проверка нужна и после initial refresh, и после delayed retry. Web Locks path также обязан уважать удаление/замену bundle другой вкладкой во время network request.

## 3. Restore `429`: реальный countdown

Сейчас сообщение содержит N секунд, но кнопка «Повторить» активна сразу.

- сохрани `retry_after_seconds`/`Retry-After` в отдельный restore timestamp;
- до его окончания кнопка disabled и показывает оставшееся время;
- последний tick разблокирует кнопку и останавливает timer;
- автоматического retry нет;
- tenant bundle остаётся целым.

## 4. OAuth cancel/error должен вернуться в правильный tenant

В callback `error` обрабатывается до чтения pending по `state`, поэтому `RET_URL` остаётся `/app.html`, а pending не удаляется.

Исправь flow:

- сначала прочитай `state`, затем соответствующий pending и проверь TTL;
- безопасно вычисли tenant return URL: только same-origin app URL, без open redirect;
- при provider cancel/error верни пользователя именно в исходный tenant и одноразово удали pending;
- при start используй `res.state` как канонический state и сверь его со state внутри `auth_url`;
- после `localStorage.setItem(pending)` сделай read-back; если запись не удалась, не отправляй пользователя к провайдеру;
- terminal complete/error удаляет pending; чужой/протухший state токены не записывает.

## 5. Handoff TTL и foreign-brand fallback

Точечно закрой два cleanup-края:

- admin принимает handoff только с обязательным конечным `ts` внутри 10 минут; отсутствующий/будущий/протухший timestamp отклоняется;
- при загрузке очисти протухшие `maya_admin_handoff:*`, чтобы refresh tokens не оставались в localStorage навсегда после прерванной навигации;
- для nonce используй `crypto.getRandomValues()` с fallback только для несовместимой среды;
- в safe-mode чужого tenant до получения config не показывай бренд/контент default tenant. Нужен нейтральный placeholder без flash «Мужская Эстетика»; default tenant вне safe-mode не меняй.

## Acceptance

1. Refresh `200` без `refresh_token` -> старый consumed token не повторяется, текущий tenant bundle очищен, спокойный вход.
2. V2 bundle без refresh -> один спокойный новый вход, без экрана «Нет связи» и retry-loop.
3. A отправила refresh; B очистила bundle; поздний `200` A -> bundle остаётся удалён, `rotated` не публикуется, UI не воскресает.
4. Fallback A потеряла ownership во время initial request -> поздний response не перезаписывает lock/bundle; reuse = 0.
5. Restore `429` -> кнопка заблокирована до server retry time; запросов до ручного клика после countdown нет.
6. OAuth cancel tenant B -> pending B удалён, возврат в B; bundle A не изменён.
7. Ошибка записи OAuth pending -> перехода на provider нет, пользователь видит спокойную ошибку.
8. Missing/expired/future handoff timestamp -> bundle не принимается и ключ удаляется.
9. Offline foreign tenant без cache не показывает ни cache другого tenant, ни default-бренд MAYA/«Мужская Эстетика».
10. Прежние tenant A/B, same-tab, two-tab, logout, `429`, parse и cmp тесты не регрессировали.

## Результат

Верни один файл `CLAUDE_CLIENT_STATE_NEGATIVE_PATHS_RESULTS.md` с:

- изменёнными файлами;
- поведением каждого из десяти acceptance tests и счётчиками refresh/auth requests;
- результатами parse и byte-identity PWA/iOS.
