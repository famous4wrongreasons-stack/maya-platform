# Local desktop project map - 2026-06-28

This map was created after scanning `/Users/stanislavmosin/Desktop` and comparing key local files with the Beget snapshot in `beget_remote_snapshot_2026-06-28`.

## Main website

Primary source:

- `/Users/stanislavmosin/Desktop/maya-web`

Important paths:

- `app/` - Next.js app routes.
- `sections/` - main landing sections.
- `components/` - shared React components.
- `features/` - auth, cart, Maya chat, voice assistant, promo.
- `data/` - services, masters, catalogue, shop, FAQ, brand data.
- `public/media/` - media used by the site.
- `.next-export/` - exported static build.

Evidence:

- `maya-web/.next-export/index.html` matches Beget `muzhskayaestetika.rf/public_html/index.html` byte-for-byte.
- Next build marker in both local export and Beget is `SoGeNLL_lOJXGDN7avgw4`.
- `maya-web/package.json` defines `next dev -p 8770`, `next build`, and `next start -p 8770`.

## PWA / web app

Primary local folder:

- `/Users/stanislavmosin/Desktop/сайт и приложение/сайт и приложение`

Important paths:

- `app.html` - main PWA HTML file.
- `manifest.json` and `service-worker.js` - root PWA files.
- `pwa-assets/for-app/` - app icons and manifest.
- `pwa-assets/for-root/` - root icons, manifest, service worker, htaccess template.
- `pwa-assets/tg-auth/api-proxy.php` - backend proxy for app integrations.
- `pwa-assets/tg-auth/tg-config.php` - Telegram-related config.
- `svc/` - service images.
- `tips.html`, `tips-data.js`, `tips-qrs/` - tips/QR flow.

Evidence:

- `pwa-assets/tg-auth/api-proxy.php` matches Beget `muzhskayaestetika.rf/public_html/app/api-proxy.php` byte-for-byte.
- Local `app.html` and Beget `public_html/app/index.html` differ in one hunk around line 20243.
- Local `app.html` uses `PAGE_BG`; Beget app uses `BUBBLE_SHADOW`.

## iOS wrapper

Primary local folder:

- `/Users/stanislavmosin/Desktop/maya-ios`

Important paths:

- `capacitor.config.json` - app id `pro.malesthetic.app`, app name `Мужская Эстетика`, hostname `malesthetic.pro`.
- `www/index.html` - web assets prepared for Capacitor.
- `ios/App/App/public/index.html` - copied Capacitor public bundle.
- `ios/App/App/capacitor.config.json` - native-side Capacitor config.

Evidence:

- `maya-ios/www/index.html` and `ios/App/App/public/index.html` match each other byte-for-byte.
- iOS `www/index.html` differs from Beget `public_html/app/index.html` only by the appended Capacitor Haptics/native tactile script.

## AI administrator / bot backend

Primary local folder:

- `/Users/stanislavmosin/Desktop/сайт и приложение/ai администратор`

Important paths:

- `bot.py` - main bot logic.
- `webhook_server.py` - YClients webhook receiver bridge.
- `yclients.py` - YClients API integration.
- `database.py`, `barbershop.db` - local database layer/data.
- `claude_ai.py`, `prompts.py`, `realtime_bridge.py`, `voice.py` - AI/voice logic.
- `loyalty.py`, `subscriptions.py`, `referral.py`, `reviews.py`, `birthday.py`, `reactivation.py` - customer lifecycle features.
- `requirements.txt` - Python dependencies.

## SMM bot

Primary local folder:

- `/Users/stanislavmosin/Desktop/сайт и приложение/smm_bot`

Important paths:

- `bot.py`
- `ai_caption.py`
- `publishers.py`
- `schedule_db.py`
- `publer_analytics.py`

## Release packages

Google Play / Android package:

- `/Users/stanislavmosin/Desktop/сайт и приложение/МЭП - Google Play package`

Contains APK/AAB package files, signing material, and Android asset links.

Current Beget snapshot:

- `/Users/stanislavmosin/Desktop/сайт и приложение/beget_remote_snapshot_2026-06-28`

Contains copied production files from Beget plus `home_extras/` with root-level archives and backups.

## Supporting / auxiliary folders

- `/Users/stanislavmosin/Desktop/remotion` - Remotion video/brand film project for Maya / Male Aesthetic.
- `/Users/stanislavmosin/Desktop/maya-demo` - design concept demos.
- `/Users/stanislavmosin/Desktop/beget_app_frontend_update_20260603` - older Beget frontend update bundle.
- `/Users/stanislavmosin/Desktop/Male 20.06` and `/Users/stanislavmosin/Desktop/Male 20.06 web` - media/photo assets.

## Sensitive files found by path

Contents were not printed. Treat these as secrets:

- `/Users/stanislavmosin/Desktop/maya-web/.env.local`
- `/Users/stanislavmosin/Desktop/сайт и приложение/ai администратор/config.py`
- `/Users/stanislavmosin/Desktop/сайт и приложение/ai администратор/vapid_private.pem`
- `/Users/stanislavmosin/Desktop/сайт и приложение/smm_bot/config.py`
- `/Users/stanislavmosin/Desktop/сайт и приложение/МЭП - Google Play package/secret_key.txt`
- `/Users/stanislavmosin/Desktop/сайт и приложение/МЭП - Google Play package/signing.keystore`
- `/Users/stanislavmosin/Desktop/сайт и приложение/_archive/2026-06-17/duplicates/google-play-package-DUPLICATE/signing.keystore`

## Notes

- No `.git` directories were found under `/Users/stanislavmosin/Desktop`.
- The deployed Beget site appears to be produced from local `maya-web`.
- The deployed Beget app appears to be a close variant of the local PWA/iOS bundle, with small one-hunk differences between web, Beget, and iOS versions.
