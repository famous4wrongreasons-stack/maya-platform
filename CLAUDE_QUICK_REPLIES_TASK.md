# MAYA OS: working quick replies in the iOS mirror

## Context

Codex fixed the complete quick-action path in the PWA on branch
`codex/maya-os-release-candidate`, commit `8abbbcbf`:

https://github.com/famous4wrongreasons-stack/maya-platform/commit/8abbbcbf

The defect had two parts:

- business-template chips only changed their selected style and sent nothing;
- quick actions were selectable `div` elements instead of reliable mobile
  controls and assumed that every backend reply always contained `message`.

## Your task

After finishing your current full-screen trial-banner work, mirror only the
accepted quick-reply changes from:

`сайт и приложение/app.html`

into:

`/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Requirements:

1. Preserve the current banner and every unrelated iOS change. Do not replace
   `www/index.html` with the PWA file wholesale.
2. Port the two-argument `onbSend(textArg, templateIdArg)` behavior so the
   selected template is included in the very first draft request without a
   stale React-state race.
3. A tap on a business template must immediately send
   `Используй готовые услуги из шаблона «<name>»` with that template ID. It must
   not merely highlight the chip.
4. Render onboarding templates, backend quick replies, confirmation/restart
   actions, welcome commands and contextual suggestions as native
   `button type="button"` controls with mobile-safe tap and no text selection.
5. Backend quick replies must accept `message`, then `value`, then `label`, plus
   plain string replies. Empty replies must not render.
6. Preserve the existing request lock: rapid repeated taps must produce only
   one request until MAYA answers.
7. Keep the black-and-white MAYA visual system. Do not introduce any accent
   color.
8. Parse every inline script, run `npx cap sync ios`, and confirm byte parity:
   `cmp -s www/index.html ios/App/App/public/index.html`.
9. Test on a real iPhone: a template tap creates a user message and MAYA reply;
   the next backend quick reply also sends and advances the conversation.
10. Commit and push only the intentional iOS files.

Return `CLAUDE_QUICK_REPLIES_RESULTS.md` with the commit, checks and the two
real-device acceptance results. Do not change the backend.

## Codex acceptance reference

- all 22 PWA inline scripts parse;
- `Барбершоп` template click contract produced 17 services;
- quick reply `Нет отдельного названия` was sent as turn 2 and MAYA changed the
  question to the owner's personal display name.
