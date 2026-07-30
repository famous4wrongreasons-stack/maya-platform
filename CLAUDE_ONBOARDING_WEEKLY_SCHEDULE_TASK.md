# MAYA OS: editable seven-day onboarding schedule

## Context and ownership

Codex verified the backend contract. No backend changes are required: onboarding confirmation already accepts `weeklyRules[]` with `weekday` values `0..6` (`0=Sunday`, `1=Monday`, ..., `6=Saturday`) and the internal calendar persists arbitrary working days.

The remaining defect is frontend-only. The current confirmation card renders only keys already present in `blueprint.weeklyRules`. A default Monday-Friday template therefore gives the user no way to enable Saturday or Sunday.

Work only on the existing release-candidate branches. Do not modify `main`, do not deploy production, and do not edit NestJS/Prisma/backend onboarding logic.

Keep these sources in sync:

- `/Users/stanislavmosin/Desktop/maya-os-release-candidate/сайт и приложение/app.html`
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Preserve all iOS-only owner-preview, native-login, Telegram callback, and `window.__meReturnToLegacyWorkspace` blocks.

## Required behavior

1. The AI onboarding confirmation card must always show all seven days in this visual order:

   `Пн, Вт, Ср, Чт, Пт, Сб, Вс`

2. Initialize the editable schedule by merging backend `weeklyRules` into a complete seven-day model. Days absent from the backend response must exist in the UI as disabled days, not disappear.

3. Every day must be independently switchable between working day and day off.

4. When a disabled day is enabled:

   - restore that day's last edited time if it exists;
   - otherwise use a calm default such as the nearest existing schedule or `09:00–18:00`;
   - never silently force Saturday or Sunday back to day off.

5. When a day is disabled, keep its draft times locally so the user can enable it again without retyping. Only active days may be sent in `weeklyRules` during confirmation.

6. Support without special cases:

   - seven working days;
   - Sunday and Monday as working days with Tuesday/Wednesday off;
   - weekends that are not Saturday/Sunday;
   - a single working day;
   - different hours for each day.

7. Keep the existing validation that at least one day must be active. Validate time only for active days. Continue enforcing `HH:MM` and `start < end`.

8. Make the state obvious in MAYA's monochrome visual language:

   - active day: clear selected state and editable time fields;
   - day off: visibly disabled state with the text `Выходной`;
   - no bronze, gold, or new accent colors.

9. Add a compact `Без выходных` action that enables all seven days without changing already edited times. Do not make Monday-Friday a permanent product assumption.

10. Preserve mobile keyboard behavior and make sure all controls remain reachable on an iPhone viewport.

## Important implementation detail

The current code builds confirmation state in `onbToConfirm()` and later derives `wdKeys` from `Object.keys(c.weekly || {})`. Replace that partial model with a complete week ordered by `[1, 2, 3, 4, 5, 6, 0]`.

Do not convert Sunday to `7` in the confirm request. The backend contract requires Sunday as `0`.

## Acceptance checks

1. Default template opens with all seven rows visible; Saturday and Sunday may start as `Выходной` but can be enabled with one tap.
2. Select `Без выходных`, set Sunday to `11:00–17:00`, confirm, and verify the request contains seven rules including `{ weekday: 0, startTime: "11:00", endTime: "17:00" }`.
3. Configure only Monday, Thursday, and Sunday; confirm that only weekdays `1, 4, 0` are submitted.
4. Disable a day after changing its times, then re-enable it and verify its edited times are restored.
5. An invalid time on a disabled day must not block confirmation; an invalid time on an active day must show the existing inline error.
6. Complete both solo and business onboarding paths and ensure schedule editing behaves identically.
7. Parse every inline script with `new Function(...)`.
8. Run `npx cap sync ios`, verify `cmp -s www/index.html ios/App/App/public/index.html`, and build the iOS Debug app.

## Deliverable

Commit only the related frontend changes on the existing branches and create:

`CLAUDE_ONBOARDING_WEEKLY_SCHEDULE_RESULTS.md`

The result must include exact tested day combinations, request payload evidence without personal data, parse/build results, and any remaining limitation.
