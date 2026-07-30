# CLAUDE_CLIENT_STATE_FENCE_MICRO_FIX_RESULTS

> Ответ на `CLAUDE_CLIENT_STATE_FENCE_MICRO_FIX.md`. Claude, 2026-07-07.
> Backend/API/миграции/production не тронуты.

## Изменённые файлы

- `сайт и приложение/app.html` (+ зеркало `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`, **byte-identical**);
- `сайт и приложение/oauth-callback.html`.

## Что сделано

1. **`saveRotated(body, sentRt)` переупорядочен**: сперва полный post-response fence (ownership fallback-lock → существование текущего tenant bundle → совпадение `refresh_token` с `sentRt`), и только для всё ещё исходной пары неполный successful response обрабатывается как `refresh_incomplete` с controlled logout. Если bundle удалён или заменён новым login — malformed late response ничего не чистит/не перезаписывает и `rotated` не публикует; новый `access_token` из malformed-ответа отзывается best-effort (`revokeOrphan`), локально не записываясь.
2. **Дубли пре-проверок убраны**: строка `if (cur.token !== s.token) return cur;` удалена из Web Locks callback (и её близнец — из fallback-пути); проверка централизована в `saasPerformRefresh(checkOwn, baseToken)` — «пару уже ротировали, пока ждали lock» теперь решается в одном месте.
3. **OAuth pending TTL ужесточён** (callback): `ts` обязан быть числовым, конечным, не старше 15 минут и не позже now+60с — иначе pending удаляется и `complete` не вызывается.
4. **`authSocial`**: `res.state` и state из `auth_url` обязаны быть непустыми и строго равными (контракт возвращает оба) — иначе к провайдеру не уходим.

## Acceptance

| # | Тест | Результат |
|---|---|---|
| 1 | Старый refresh в полёте → записан НОВЫЙ login → поздний malformed 200 | ✅ F1: новая пара `atA_7/rtA_8` не тронута, UI остался authenticated (masters), logout/broadcast для неё нет; сирота `atA_9` отозвана best-effort; refresh **1** |
| 2 | Исходная пара не менялась, refresh 200 без `refresh_token` | ✅ N1 (rerun): controlled logout, bundle очищен, consumed token не повторён; refresh **1** |
| 3 | Bundle удалён до неполного late response | ✅ F3: не восстановлен, чужое состояние повторно не чистится, `logged_out`; сирота `atA_9` отозвана; refresh **1** |
| 4 | Pending без valid `ts` / несовпадающие states | ✅ F4: (b) start с расходящимися states — к провайдеру не ушли, спокойная ошибка, pending 0; (a) нечисловой `ts` — pending удалён, `complete` **не вызван** (0), токены не записаны |
| 5 | Регрессия + parse/cmp | ✅ N1, N3, N4, N5, T12, R5 — все OK; parse 4/4 OK; PWA/iOS **byte-identical** |
