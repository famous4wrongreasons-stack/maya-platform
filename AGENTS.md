# AGENTS.md — MAYA / Мужская Эстетика

Рабочая инструкция для Codex и других coding agents по проектам сайта, PWA, iOS-обёртки, Telegram-бота и голосовой MAYA. Файл содержит только операционные правила и дизайн-конвенции. Секреты, токены, ключи, реальные значения API-ключей и персональные данные сюда не записывать.

## Карта проектов

- Platform repo: `/Users/stanislavmosin/Desktop/сайт и приложение`
- Website/PWA source in platform repo: `сайт и приложение/index.html`, `сайт и приложение/app.html`
- Backend bot: `ai администратор/`
- Telegram bot: `ai администратор/bot.py`
- REST/webhook backend: `ai администратор/webhook_server.py`
- AI logic: `ai администратор/claude_ai.py`, `ai администратор/realtime_bridge.py`, `ai администратор/masters_ai.py`, `ai администратор/ai_billing.py`
- iOS Capacitor repo: `/Users/stanislavmosin/Desktop/maya-ios`
- iOS web source: `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
- iOS project: `/Users/stanislavmosin/Desktop/maya-ios/ios/App/App.xcodeproj`
- Local workspace index: `/Users/stanislavmosin/Desktop/MAYA_WORKSPACE`

## Product And Brand

- Brand: Мужская Эстетика / MAYA.
- Domain: `malesthetic.pro`; Cyrillic web identity: `мужскаяэстетика.рф`.
- Tone: premium, calm, masculine, operationally useful. Avoid generic SaaS/landing-page decoration inside the actual app.
- The app should open into the usable experience, not a marketing page.
- MAYA is the client-facing assistant for consultation and booking.
- Telegram bot "Антон" and PWA chat share the same booking/business brain.
- Staff chat is utilitarian, compact, messenger-like, not decorative.

## Frontend Architecture

- `app.html` is the production PWA bundle. Aurora source files like `app-aurora.html` / `build.js` are not available locally; edit the existing bundled `app.html` carefully.
- iOS app mirrors the PWA through Capacitor. When changing PWA UI, mirror the same change in `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`.
- After editing iOS web source, run `npx cap sync ios` before building.
- Active service worker is `сайт и приложение/service-worker.js`; it is push-only and intentionally does not cache/fetch page shells.
- Do not accidentally use or deploy the wrong service worker from `pwa-assets/for-root/`.

## Typography

- Main brand display font in PWA: `DISPLAY = "'Montserrat', sans-serif"`.
- Main body font in PWA: `BODY = "'Manrope', sans-serif"`.
- Chat message text uses iOS-native stack for closer mobile messenger rendering:
  `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`.
- Avoid viewport-scaled font sizes. Text must fit containers on mobile and desktop.
- Use normal letter spacing for body copy. Reserve large letter spacing for small uppercase brand labels only.

## Aurora Style System

- Core visual language: Aurora / liquid glass, muted premium surfaces, restrained accents.
- Prefer full-screen app surfaces, not marketing sections.
- Use existing helpers when possible: `tokens`, `AuroraShell`, `ATile`, `PrimaryPill`, `AIcon`, `Icon`, `DISPLAY`, `BODY`.
- Cards are for individual repeated items, modals, framed tools, and tiles. Do not nest cards inside cards.
- Keep controls ergonomic and dense enough for repeated operational use.
- Use `env(safe-area-inset-*)` for iOS edges.
- In light mode, root/page backgrounds must continue behind keyboard/safe areas to prevent black corner flashes.

## Color And Surface Notes

- Light staff chat page background: `#ffffff`.
- Dark staff chat page background: `#0c0c10`.
- Incoming team chat bubble fill: `#E5E5E5`.
- Outgoing team chat bubble fill: `#DCF8C6`.
- Team chat text color: black in light bubble context.
- Existing online green: `#3f9e6a`.
- Do not invent new palettes casually. If a UI has an established local palette, keep it.

## Canonical Team Chat Bubble

The staff/team chat bubble must use the SVG reference shape, not a CSS triangle, pseudo-element oval, or generic iMessage bubble.

Current component location:
- `сайт и приложение/app.html` around `ATeamChat()`
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html` around `ATeamChat()`

Canonical path:

```js
const SVG_BUBBLE_PATH = 'M18 0H114C123.941 0 132 8.05887 132 18C132 27.9411 123.941 36 114 36H24.5C22.0147 36 19.6047 37.0041 17.8489 38.7612L14 40L15.2388 36.1511C15.7506 35.6389 16.004 34.9446 16.004 34.2225V34C6.98933 33.4016 0 25.7842 0 16.5C0 7.3873 7.3873 0 16.5 0H18Z';
```

Canonical behavior:
- Use `MessageBubble({ side, children, tight })`.
- Left/incoming fill: `#E5E5E5`.
- Right/outgoing fill: `#DCF8C6`.
- Right bubble mirrors the same path with `transform: 'translate(132 0) scale(-1 1)'`.
- SVG background uses `viewBox: '0 0 132 40'`, `preserveAspectRatio: 'none'`.
- Text is a separate layer above SVG (`zIndex: 1`).
- Bubble width is content-based: `display: inline-block`, `width: fit-content`, `maxWidth: 72%`.
- Compact production sizing: `minHeight: 40`.
- Compact text padding:
  - right: `9px 30px 10px 26px`
  - left: `9px 26px 10px 30px`
- Message text: `fontSize: 17`, `lineHeight: 1.3`, `fontWeight: 400`, `whiteSpace: pre-wrap`, `overflowWrap: break-word`.
- Text-only bubbles do not show time/checkmarks.
- Media/voice/file bubbles can keep their separate compact/tight handling.

If a reference screenshot conflicts with generic chat conventions, follow the screenshot.

## Voice Assistant MAYA

- MAYA voice UI is in `app.html` and mirrored in iOS `www/index.html`.
- Realtime endpoint: `wss://rt.malesthetic.pro/api/realtime`.
- Backend bridge: `ai администратор/realtime_bridge.py`.
- Realtime model config currently uses `REALTIME_MODEL`, default `gpt-realtime-2`.
- Voice/chat model config currently uses `OPENAI_VOICE_CHAT_MODEL`, default aligned with `OPENAI_CHAT_MODEL`.
- Main high-quality client brain: `gpt-5.5`.
- Staff/master notification advice: `gpt-5.4`.
- Fast/service fallback: `gpt-5.4-mini`.
- STT/TTS fallback paths exist via `gpt-4o-transcribe` and `gpt-4o-mini-tts`.
- Model prices are not stable knowledge. Verify current OpenAI pricing before changing `ai_billing.MODEL_PRICES`.

## Backend And Bot Rules

- Production backend lives on VPS `111.88.148.206` under `~/barbershop-bot`.
- Local backend DB `ai администратор/barbershop.db` may be empty. Do not assume it reflects production.
- YClients is the source of truth for records, services, schedule, cashbox and revenue.
- Booking moves must be non-destructive `PUT`, never delete+create.
- Do not send personal data to LLM. Use anonymization/redaction and backend deterministic steps for phone/name/contact collection.
- Keep 152-ФЗ constraints intact: encrypted PII at rest, no raw phone/name/email/id in prompts.
- AI billing logs to `ai_usage_log`; reports use `ai_billing.py`.
- Do not print or copy secrets from `config.py`, `.env`, PHP configs, logs, or server files into chat or docs.

## Deployment Commands

Beget PWA deploy:

```bash
scp -i ~/.ssh/beget_deploy '/Users/stanislavmosin/Desktop/сайт и приложение/сайт и приложение/app.html' mocine3388@prime.beget.com:~/muzhskayaestetika.rf/public_html/app/index.html
```

iOS build and install:

```bash
cd /Users/stanislavmosin/Desktop/maya-ios
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'id=FF6F8003-99D2-5AED-A4CA-05BAE3877929' -derivedDataPath build/DerivedData -allowProvisioningUpdates build
xcrun devicectl device install app --device FF6F8003-99D2-5AED-A4CA-05BAE3877929 build/DerivedData/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device FF6F8003-99D2-5AED-A4CA-05BAE3877929 --terminate-existing pro.malesthetic.app
```

Production backend access:

```bash
ssh -i ~/.ssh/yandex_bot botadmin@111.88.148.206
```

Restart backend only after deliberate backend changes and checks:

```bash
sudo systemctl restart barbershop-bot
```

## Verification Checklist

- For `app.html` / `www/index.html`, parse all inline scripts with `new Function(...)`.
- For iOS, always confirm `cmp -s www/index.html ios/App/App/public/index.html` after `npx cap sync ios`.
- Check built app contains the expected markers with `rg` before installing.
- For Beget, verify uploaded file markers and `curl -I -L https://malesthetic.pro/app/`.
- For UI changes, inspect screenshots where possible and compare against the user-provided reference.

## Git And Dirty Worktree

- Platform repo may have unrelated dirty files such as:
  - `сайт и приложение/.htaccess`
  - `сайт и приложение/htaccess`
  - `сайт и приложение/htaccess-root.txt`
  - `сайт и приложение/index.html`
  - `сайт и приложение/robots.txt`
  - `сайт и приложение/sitemap.xml`
- Do not stage, revert, or overwrite unrelated dirty files.
- Stage only files directly related to the current task.
- Prefer small, specific commits.

## Desktop Organization

- Do not move existing project folders without explicit confirmation. Current paths are used by Xcode, deploy commands, Git remotes, and local scripts.
- Use `/Users/stanislavmosin/Desktop/MAYA_WORKSPACE` as the safe local index/metarepo for documentation, project map, and operating instructions.
- If full Desktop cleanup is requested later, first create a migration plan and preserve path compatibility through symlinks or updated scripts.

