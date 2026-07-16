# Claude task: MAYA CRM Integration Center

## Context and ownership

Codex has completed the secure backend lifecycle for tenant CRM credentials in
branch `codex/secure-crm-integration-lifecycle`. Your task is frontend only.
Do not alter Prisma, NestJS services, migrations, authentication, tenant
resolution or API response contracts.

MAYA must not ask for a CRM token in AI chat. The token belongs only in this
protected owner screen, stays in component memory, uses a password-style input
and is cleared immediately after every request.

This is the only tenant credential screen in this package. Never ask a business
owner for DeepSeek/OpenAI, Yandex ID, Telegram Login, SMS, email, the MAYA
subscription YooKassa key or the YClients partner token. Those are platform
secrets configured once on the server. Per-business YooKassa acquiring is a
separate planned feature and must not be presented as available here.

## Files

- PWA: `сайт и приложение/app.html`
- iOS mirror: `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
- After the iOS edit run `npx cap sync ios` and verify the synced public file.

Preserve the current MAYA visual language and strict black-and-white palette.
Do not add bronze, gold or a separate decorative admin product.

## API flow

All protected calls use the existing owner JWT. Do not put tenant ID into these
paths and do not use the old `/admin/tenants/:id/crm` routes.

1. Load providers with `GET /api/crm/providers`. Render only keys from
   `selectable_provider_keys`.
2. Load current state with `GET /api/integrations/crm`.
3. Connect with `POST /api/integrations/crm/connect`:

```json
{
  "provider": "yclients",
  "apiToken": "entered-in-memory-only",
  "settingsJson": { "companyId": 123456 }
}
```

4. The response contains `connection`, `preview` and
   `next_action: "activate"`. Show counts and up to the returned service/staff
   items. Do not infer or fabricate imported data.
5. Confirm with `POST /api/integrations/crm/activate`. On success clear the
   token field and show the active state.
6. Refresh health with `POST /api/integrations/crm/recheck`.
7. Refresh preview with `GET /api/integrations/crm/preview`.
8. Disconnect only after an explicit confirmation with
   `DELETE /api/integrations/crm`.

## Required UX

- External-calendar onboarding opens this flow immediately after
  `next_step: "connect_crm"`.
- Internal-calendar onboarding does not ask for a CRM.
- "Подключить позже" may open the owner app, but Profile/Settings must always
  contain an "Интеграции" row that returns to this screen.
- Screen states: not connected, checking, preview awaiting confirmation,
  active, reconnect required and provider temporarily unavailable.
- Active state shows provider, company ID, `last_checked_at`, `last_sync_at`
  and actions "Проверить", "Переподключить", "Отключить".
- Never display, prefill, persist, log or send the token to analytics. The API
  intentionally returns only `has_credentials: true`.
- Keep the existing owner session and tenant when navigating back. Never fall
  back to demo tenant or overwrite the current business.

## Error copy

Map these backend codes without exposing raw provider responses:

| Code | Russian message |
|---|---|
| `crm_token_required` | Введите токен CRM. |
| `crm_credentials_rejected` | CRM отклонила токен. Проверьте токен и права доступа. |
| `crm_company_not_found` | Филиал не найден или недоступен для этого токена. |
| `crm_provider_unreachable` | CRM временно недоступна. Попробуйте ещё раз позже. |
| `crm_platform_configuration_error` | Подключение временно не настроено на стороне MAYA. |
| `crm_connection_failed` | Не удалось проверить подключение. Данные не сохранены. |
| `crm_provider_not_available` | Эта интеграция пока недоступна. |
| `crm_integration_not_configured` | CRM ещё не подключена. |
| `subscription_required` | Пробный период закончился. Подключите подписку. |

## Acceptance checks

- Invalid token never advances to preview and a previous active connection
  remains visible after refresh.
- Valid token shows real preview; booking remains blocked until confirmation.
- Activation survives page/app restart and status reload.
- "Connect later" has a working return route from owner settings.
- Reconnect does not show the old token and does not require it when the owner
  only rechecks the unchanged provider.
- Disconnect clears the connection and external booking remains safely blocked.
- No cross-tenant IDs are read from URL parameters or local storage.
- PWA and iOS sources are functionally identical and inline scripts parse.

## Result handoff

Commit only frontend/iOS files and create
`CLAUDE_CRM_INTEGRATION_CENTER_RESULTS.md` with commit hashes, tested URLs,
mobile screenshots and the acceptance matrix above.
