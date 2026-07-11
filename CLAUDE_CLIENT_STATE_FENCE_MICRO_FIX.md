# Микропатч Клоду: fence до обработки malformed refresh

## Контекст

`CLAUDE_CLIENT_STATE_NEGATIVE_PATHS_RESULTS.md` принят почти полностью. Parse, PWA/iOS cmp и backend session tests зелёные.

Осталась одна гонка в `saveRotated(body, sentRt)`: проверка полноты response сейчас выполняется до post-response fence. Если старый refresh вернул поздний `200` без `refresh_token`, а пользователь уже вошёл заново, `saasForceLogout('refresh_incomplete')` удалит новую пару.

Backend, API, миграции и production не трогай. Меняй только frontend-файлы, необходимые для микропатча.

## Что исправить

1. В `saveRotated()` сначала выполни все post-response fence-проверки:
   - ownership fallback-lock;
   - существует ли текущий tenant bundle;
   - совпадает ли его `refresh_token` с `sentRt`.
2. Только если текущий bundle всё ещё является исходной парой, обрабатывай неполный successful response как `refresh_incomplete` и делай controlled logout.
3. Если bundle уже удалён или заменён новым login, malformed late response не должен очищать/перезаписывать текущую сессию и не должен публиковать `rotated`.
4. Если malformed response содержит новый `access_token`, можно best-effort отозвать его server session, не записывая локально.
5. Удали дублированную строку `if (cur.token !== s.token) return cur;` в Web Locks callback.

Дополнительно ужесточи OAuth pending TTL: отсутствующий, нечисловой, слишком будущий или старше 15 минут `ts` считается invalid, pending удаляется, complete не вызывается. При старте требуй точное совпадение непустых `res.state` и state из `auth_url`, поскольку backend-контракт возвращает оба.

## Acceptance

1. Старый refresh летит; затем записан новый login bundle; старый response приходит неполным -> новый bundle остаётся без изменений, logout/broadcast для него отсутствуют.
2. Исходный bundle не менялся; refresh `200` без `refresh_token` -> controlled logout, старый token не повторяется.
3. Bundle удалён до неполного late response -> bundle не восстанавливается и повторно не очищает чужое состояние.
4. OAuth pending без valid `ts` или с несовпадающими states -> provider/complete request не выполняется, токены не записываются.
5. Прежние negative-path/tenant/concurrency тесты зелёные; inline scripts parse-clean; PWA/iOS byte-identical.

## Результат

Верни `CLAUDE_CLIENT_STATE_FENCE_MICRO_FIX_RESULTS.md` с изменёнными файлами и результатами пяти acceptance tests.
