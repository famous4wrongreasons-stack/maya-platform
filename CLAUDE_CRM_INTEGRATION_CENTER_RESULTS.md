# CLAUDE results: MAYA CRM Integration Center

Frontend-only delivery of the protected owner **«Интеграции»** screen on top of
Codex's secure `/api/integrations/crm/*` lifecycle. No backend / Prisma / Nest /
migration / auth / tenant-resolution / API-contract change.

## Scope delivered

- New standalone protected owner screen `ACrmCenter` (screen key `crm`) — the
  **only** tenant-credential screen in the package.
- CRM token: `input type="password"`, `autoComplete="off"`, kept in component
  memory only, **cleared after every request** (`setTok('')`), never displayed,
  prefilled, persisted, logged or sent to analytics. API returns only
  `has_credentials: true` — we never read a token back.
- MAYA never asks for a CRM token in AI chat (nothing added to the chat path).
- Provider list rendered strictly from `GET /api/crm/providers`
  `selectable_provider_keys` (fail-closed — unknown/unselectable keys are not shown).
- Full state machine: `GET /api/integrations/crm` → `connect` (stage+preview) →
  `activate` → `recheck` / `preview` / `DELETE` (with explicit confirmation).
- Six screen states: not connected · checking · preview awaiting confirmation ·
  active · reconnect required · provider temporarily unavailable.
- Onboarding wiring: external calendar (`next_step: "connect_crm"` /
  `calendarSource === 'external'`) reboots straight into this screen via a
  URL-authoritative `crm_connect=1` route that wins over the role-based boot
  routers; internal calendar never asks for CRM. «Подключить позже» opens the
  owner app; Profile always exposes an **«Интеграции»** row back to this screen.
- Error copy mapped exactly per the task table; raw provider responses never shown.
- Strict black-and-white palette (status dot uses `t.ink`, no bronze/gold, no
  separate admin product). Owner session + tenant preserved on back-nav; never
  falls back to demo tenant; no cross-tenant IDs read from URL / localStorage.

## Files & commits

| Repo | Branch | File |
|---|---|---|
| maya-platform (worktree `maya-os-prepublication-review`) | `claude/crm-integration-center` (base `628ee9c4`) | `сайт и приложение/app.html` — `+272 / −3` |
| maya-ios | `codex/maya-os-trial-chat-ios` (from `3b9ba39`) | `www/index.html` + synced `ios/App/App/public/index.html` |

Commit hashes are recorded in the commit step appended below.

## Verification

Backend: local review NestJS on `http://localhost:3107/api` (mock + yclients
selectable). Frontend served from the worktree on `http://localhost:8892`.

Tested URL (portrait 390×844, owner JWT injected into `me_saas_auth_v2:<ns>`):

```
http://localhost:8892/app.html?booking_backend=saas-local&booking_api_base=http://localhost:3107/api&booking_tenant=<onboarded-slug>
```

### Headless-CDP e2e — CRM Center: 12 / 12

| # | Check | Result |
|---|---|---|
| 1 | Screen opens: not-connected shows password token input | PASS |
| 2 | Invalid token → mapped error, never advances to preview | PASS |
| 3 | Token field cleared after request | PASS |
| 4 | Valid token → real preview, booking blocked until confirm | PASS |
| 5 | Token cleared after connect (memory-only) | PASS |
| 6 | Activation → active state with actions | PASS |
| 7 | Activation survives page/app reload | PASS |
| 8 | Recheck unchanged provider needs no token | PASS |
| 9 | Reconnect does not show the old token | PASS |
| 10 | Disconnect clears connection (external booking blocked) | PASS |
| 11 | Profile has «Интеграции» return row | PASS |
| 12 | No tenant ID in CRM paths/body (owner JWT only) | PASS |

### Headless-CDP e2e — onboarding routing: 2 / 2

| Check | Result |
|---|---|
| External onboarding (`connect_crm`) → opens CRM Integration Center | PASS |
| Internal onboarding → does NOT ask CRM (lands on logo step) | PASS |

### Task acceptance matrix (8/8)

| Acceptance check | Evidence |
|---|---|
| Invalid token never advances to preview; previous active connection remains after refresh | e2e #2, #7 |
| Valid token shows real preview; booking blocked until confirmation | e2e #4 (preview shows counts + `Услуги`/`Специалисты`, note «включится после активации») |
| Activation survives page/app restart and status reload | e2e #7 (reload → active state persists) |
| «Подключить позже» has a working return route from owner settings | e2e #11 (Profile «Интеграции» row → `__meGo('crm')`) |
| Reconnect does not show old token and needs none for a plain recheck | e2e #8, #9 |
| Disconnect clears the connection; external booking stays blocked | e2e #10 (explicit-confirm `DELETE`, returns to not-connected) |
| No cross-tenant IDs from URL params / local storage | e2e #12 (all CRM requests are `/api/integrations/crm*` + `/api/crm/providers`, owner JWT only, no tenant id in path or body) |
| PWA and iOS sources functionally identical, inline scripts parse | see parity section |

### PWA ↔ iOS parity

- `ACrmCenter` component **byte-identical** between `app.html` and iOS `www/index.html`
  (19 034 chars each); helper blocks `__CRM_ERR`, `crmTryRefresh`, `crmRawFetch`,
  `onbOpenAppCrm` identical.
- 7 of 8 diff hunks applied to iOS by context patch; hunk #5 (MEApp initial
  `useState`) hand-placed at the iOS-only anchor (`__meReadBusinessOnboarding`)
  with the identical `crm_connect` branch — the only difference is the surrounding
  iOS-only onboarding-reader, which is a pre-existing sanctioned divergence.
- Inline-script parse: PWA **23/23** scripts OK, iOS **24/24** scripts OK (0 errors).
- `npx cap sync ios` → synced `ios/App/App/public/index.html` is **byte-identical**
  to `www/index.html` (1 979 128 bytes, `cmp` clean).
- Note: the iOS bundle is built for the native Capacitor shell; running it in a
  headless *web* context surfaces its native-session boot gate ("Сессия не найдена")
  at the shared, byte-identical auth layer — an environment artifact, not a CRM
  behaviour, so functional e2e is run on the deployable web target (`app.html`)
  and mirrored byte-for-byte to iOS, matching every prior packet.

## Screenshots (portrait 390×844)

- `CLAUDE_CRM_CONNECT.png` — not-connected: provider chips + password token input.
- `CLAUDE_CRM_PREVIEW.png` — valid token → import preview (counts + services/staff),
  booking blocked until activation.
- `CLAUDE_CRM_ACTIVE.png` — active: provider, филиал ID, «проверено»/«синхронизация»
  timestamps, Проверить / Переподключить / Отключить.
