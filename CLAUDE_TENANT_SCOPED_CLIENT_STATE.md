# Задание Клоду: разделить client state по салонам и закрыть restore edge cases

## Контекст

Codex проверил `CLAUDE_SESSION_PIPELINE_FINAL_FIXES_RESULTS.md` по фактическому коду.

Принято:

- защищённые logout/sessions теперь refresh-aware;
- полная access/refresh-пара валидируется;
- same-tab и Web Locks single-flight реализованы;
- `429`, terminal errors, admin retry и same-frame guards исправлены;
- PWA/iOS byte-identical и все inline scripts parse-clean;
- backend session tests: 16/16 green.

Ниже следующий небольшой security-пакет. Backend, API, миграции и production не трогай. Редизайн не делай. Не откатывай несвязанные dirty-изменения.

## 1. Tenant-scoped namespace для client state

Сейчас разные салоны на одном frontend origin используют общие ключи:

- `me_saas_auth_v1`;
- `me_saas_refresh_lock`;
- `BroadcastChannel('me_saas_auth')`;
- `me_saas_cfg_v1`;
- `me_oauth_pending`;
- `maya_admin_handoff`.

Из-за этого вкладка tenant A может принять bundle/logout/config tenant B. Сделай единый детерминированный namespace из:

- нормализованного `apiBase`;
- нормализованного `tenantSlug`.

В namespace должны входить auth bundle, refresh lock, BroadcastChannel и public config cache. Bundle дополнительно хранит `tenant_slug` и `api_base`; каждое чтение проверяет совпадение с текущим контекстом до использования токенов.

Правила:

- refresh tenant A никогда не читает и не заменяет bundle tenant B;
- logout/revoke tenant A не очищает UI или credentials tenant B;
- cached branding/config tenant A не применяется к tenant B даже временно и не используется offline;
- старый глобальный bundle без tenant metadata нельзя молча привязывать к открытому салону. Безопасный fallback: спокойный новый вход;
- namespace не должен содержать секреты или raw refresh token.

## 2. OAuth и onboarding handoff без межtenant-коллизий

Два параллельных OAuth flow разных салонов не должны перезаписывать один `me_oauth_pending`.

- привяжи pending context к OAuth `state` либо к одноразовому nonce;
- callback получает только соответствующие `apiBase`, `tenantSlug` и return URL;
- после complete сохраняет bundle только в namespace этого tenant;
- чужой/отсутствующий pending context завершается спокойной ошибкой, без записи токенов;
- onboarding -> admin handoff также сделай одноразовым и привязанным к tenant/nonce, чтобы две вкладки регистрации не обменялись bundle.

## 3. Временная ошибка restore не должна удалять сессию

Сейчас catch начального `GET /me` очищает bundle при любой ошибке, кроме `429` и terminal code. Поэтому offline, timeout или backend `500` заставляют клиента войти заново.

Раздели ошибки:

- `refresh_token_invalid`, `refresh_token_reused`, `session_expired`, `session_revoked`, подтверждённый auth `401` после единственного retry и legacy bundle без refresh -> завершение сессии;
- `refresh_network`, `refresh_timeout`, `refresh_lock_busy`, HTTP `5xx` и обычная потеря сети -> bundle сохраняется;
- для временной ошибки покажи компактное спокойное состояние «Нет связи» / «Повторить», без формы нового входа поверх действующей сессии;
- retry повторяет restore один раз по действию пользователя, без reload и без автоматического цикла;
- `429` сохраняет текущую пару и серверный countdown.

## 4. Fallback lease: ownership fencing и fail-closed

Web Locks path оставь как есть. В localStorage fallback текущий `renew()` без проверки может перезаписать lock нового владельца после разморозки старой вкладки.

Исправь fallback:

- heartbeat продлевает lease только если текущий `owner === myId`; иначе помечает ownership lost и останавливается;
- перед initial refresh, после каждого ожидания и перед delayed retry проверяются и bundle, и ownership;
- потерявший ownership код не отправляет refresh request и не удаляет чужой lock;
- исчерпание wait guard не даёт права украсть действующий lock;
- stale/expired lock с неизменившимся одноразовым token не должен автоматически приводить к повторной отправке этого token. Без Web Locks безопаснее fail-closed с повторным входом, чем риск `refresh_token_reused`;
- `saasClearSession()` возвращает результат read-back. Если storage не очистился, текущий runtime ставит tombstone и больше не использует этот bundle/refresh.

## Ожидаемые файлы

- `сайт и приложение/app.html`;
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`;
- `сайт и приложение/oauth-callback.html`;
- `сайт и приложение/maya-start.html`;
- `сайт и приложение/maya-admin.html` только если handoff требует точечной правки.

## Acceptance

1. Tenant A и B на одном origin одновременно хранят разные полные bundles.
2. Два одновременных refresh A/B создают по одному запросу для каждого tenant и не делят lock/channel.
3. Logout A очищает только A; B остаётся авторизован и не меняет экран.
4. Два параллельных OAuth start A/B завершаются каждый в свой namespace и return URL.
5. Offline tenant B не получает cached brand/config tenant A.
6. Restore с `refresh_network`, `refresh_timeout` и `500` сохраняет bundle; ручной retry после восстановления сети открывает приложение без нового login.
7. Terminal restore очищает только текущий tenant bundle и закрывает только его UI.
8. Fallback без Web Locks: A теряет lease, B становится владельцем, затем A возобновляется -> A не переписывает lock B и не отправляет старый refresh; reuse = 0.
9. Legacy global bundle без tenant metadata не используется ни для A, ни для B.
10. Прежние same-tab/two-tab/429/session tests не регрессировали; inline scripts parse-clean; PWA/iOS byte-identical.

## Результат

Верни один файл `CLAUDE_TENANT_SCOPED_CLIENT_STATE_RESULTS.md` с:

- схемой namespace и миграционным поведением legacy keys;
- изменёнными файлами;
- счётчиками запросов/результатами десяти acceptance tests;
- parse/cmp результатами.
