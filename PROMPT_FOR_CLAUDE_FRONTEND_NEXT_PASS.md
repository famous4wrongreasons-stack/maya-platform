Please switch to the current frontend pass for the MAYA project.

Read these three documents first:

1. `CLAUDE_FRONTEND_OWNERSHIP_AND_WORKFLOW.md`
2. `CLAUDE_FRONTEND_ACTION_PLAN.md`
3. `CODEX_BACKEND_HANDOFF_FOR_CLAUDE.md`

Current working split remains:

- **Codex owns backend** in `maya-saas-backend/`
- **Claude owns frontend** in:
  - `сайт и приложение/app.html`
  - `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Important:

- Do **not** build a second parallel backend beside `maya-saas-backend/`
- Build frontend flows against the documented backend contracts
- If a backend field is missing, request an explicit contract change instead of
  implementing backend logic in parallel

Backend status update from Codex:

- public mobile config is expanded and ready for white-label boot
- phone-first auth now exists in local/debug-safe mode:
  - `POST /api/auth/phone/start`
  - `POST /api/auth/phone/verify`
- client profile now exists:
  - `GET /api/me`
  - `PATCH /api/me`
- booking preview now supports profile fallback and machine-readable errors
- `GET /api/appointments/my` is richer and ready for cabinet UI

Your concrete task now:

1. Implement or refine white-label boot against `GET /api/mobile/config/:tenantSlug`
2. Implement phone-first onboarding against the current safe/debug backend auth
3. Use `GET /api/me` after auth and route incomplete users to `PATCH /api/me`
4. Refine booking UX so it uses stored client identity and handles preview error
   codes cleanly
5. Build or refine cabinet UI against `GET /api/appointments/my`
6. Mirror the same frontend changes into `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Please respond with:

1. your execution plan for the frontend pass
2. any exact backend gaps still blocking you
3. any contract requests in precise request/response terms

Do not redesign the backend. Do not rebuild a second backend path. Treat
`maya-saas-backend/` as the backend source of truth.
