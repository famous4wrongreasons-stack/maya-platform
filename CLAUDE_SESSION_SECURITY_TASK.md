# Задание Клоду: frontend session security

## Граница ответственности

Codex реализовал backend-контракт refresh-сессий в ветке `codex/session-security`. Не изменяй backend, миграции и error codes. Твоя задача только frontend в принадлежащих тебе web/PWA/iOS зеркалах.

## Новый ответ авторизации

Все успешные входы (пароль, телефон, Yandex, Telegram и self-serve onboarding) сохраняют прежний `access_token` и дополнительно возвращают:

- `refresh_token`;
- `token_type: "Bearer"`;
- `expires_in` (обычно `900` секунд);
- `refresh_expires_at`;
- `session` с `id`, `device_name`, `status`, `is_current`, датами.

## Что реализовать

1. После любого успешного auth/onboarding атомарно сохраняй пару `access_token + refresh_token`; не оставляй новый access со старым refresh.
2. Перед истечением access JWT или после первого обычного `401` вызови `POST /api/auth/refresh` с `{ "refreshToken": "..." }`, затем атомарно замени оба токена.
3. Сделай один общий single-flight refresh promise для всех API-вызовов. Два параллельных refresh-запроса запрещены: backend расценивает повтор как компрометацию и отзывает сессию.
4. Для нескольких вкладок добавь координацию через `BroadcastChannel` или эквивалентный lock: одна вкладка ротирует токен, остальные получают новую пару.
5. Повторяй исходный API-запрос после успешного refresh только один раз. Не создавай бесконечный retry loop.
6. При `refresh_token_invalid`, `refresh_token_reused`, `session_expired` или `session_revoked` очисти оба токена и покажи спокойный экран повторного входа.
7. Logout: сначала `POST /api/auth/logout` с Bearer access token, затем всегда очищай локальные credentials.
8. Добавь в кабинет экран «Устройства и сессии»: `GET /api/auth/sessions`, отзыв одной через `DELETE /api/auth/sessions/:id`, всех через `DELETE /api/auth/sessions`.
9. Текущую сессию помечай по `is_current`; после её отзыва сразу выходи из аккаунта.
10. Сохрани текущие trial, phone, social-auth и onboarding UX без визуального редизайна.

## Acceptance

- Одновременные `401` от нескольких запросов создают ровно один refresh-вызов.
- После rotation старый refresh никогда не используется снова.
- После logout/revoke защищённый экран не продолжает работать на старом access JWT.
- Ошибки refresh не показываются как технический JSON.
- PWA и iOS зеркало используют одинаковый контракт и проходят parse/build проверки.
- В результатах перечисли изменённые файлы и ручные сценарии проверки.
