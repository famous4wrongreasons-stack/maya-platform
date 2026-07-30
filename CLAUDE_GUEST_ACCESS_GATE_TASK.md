# MAYA OS: iOS mirror for the guest-access gate

## Context

Codex has implemented and verified the backend/PWA rule for the button
`Продолжить без авторизации` on branch `codex/maya-os-release-candidate`.

The backend public mobile config now returns:

- `guest_access_ready`;
- `guest_access_blockers`.

The button is disabled until MAYA is operationally configured. For the internal
calendar this requires a ready provider, services and schedule. For an external
calendar it requires a real active CRM connection; `mock` is not enough.

## Your task

Mirror only the accepted PWA guest-access behavior from:

`сайт и приложение/app.html`

into your current working file:

`/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Requirements:

1. Preserve your current full-screen trial banner and all unrelated work.
2. Do not change backend logic or duplicate Codex work.
3. Read `guest_access_ready` from the public tenant config and fail closed while
   the config is missing or not ready.
4. Before readiness, show `Доступно после настройки MAYA`; tapping must do
   nothing.
5. After readiness, show `Продолжить без авторизации`; tapping must open the
   client home as before.
6. Keep the existing production/legacy MAYA behavior unchanged outside the
   universal SaaS context.
7. Parse every inline script, run `npx cap sync ios`, and confirm byte parity:
   `cmp -s www/index.html ios/App/App/public/index.html`.
8. Commit and push only the iOS files you intentionally changed.

Return a short result document named
`CLAUDE_GUEST_ACCESS_GATE_RESULTS.md` with the commit, checks and screenshots of
both locked and unlocked states.

## Acceptance reference

Verified by Codex locally:

- `demo-business` + mock CRM -> locked;
- completed trial tenant + ready internal calendar -> unlocked;
- 53 backend suites / 244 tests pass;
- frontend inline scripts parse 22/22.
