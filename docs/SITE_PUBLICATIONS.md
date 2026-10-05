# Telegram Publications for the Website

## Status

Implemented locally on 2026-09-03, not deployed or enabled in Telegram.
Update 2026-09-04: public HTTP read routes and PHP forwarding were deployed as
part of the guest discussion integration (see `SITE_COMMUNITY.md`). Telegram
incoming publication commands are still not active; the rest of this status
describes that separate ingress integration.
The intended existing bot was confirmed as `@malesthetic_bot` using `getMe`.
The production `barbershop-bot.service` is disabled/inactive; its replacement
`barbershop-pwa.service` intentionally has no polling or scheduled jobs.
Telegram has no webhook configured. Pending updates were not read or acknowledged.

Do not restart the full legacy bot to enable this feature: the Action Engine
cutover deliberately freezes its old financial writers and scheduled jobs.
Activation requires an approved Telegram ingress/handler deployment that preserves
the existing update queue and non-publication flows. Do not create a competing
poller, switch webhooks blindly, or use `drop_pending_updates`.

## Editor Flow

1. An existing administrator opens a private chat with the same bot and sends
   `/post`, or chooses `Новый пост на сайте` in `/admin`.
2. Send a photo/video with caption, an album, or text. More messages append to
   the draft. A first short line (up to 140 characters) followed by body text
   becomes the headline. Text is preserved, not rewritten by an LLM.
3. Press `Опубликовать на сайте` or send `/publish`. The bot replies with the
   article URL. Repeated confirmation returns the same publication.
4. `/cancel` cancels only the active draft. Existing published posts are untouched.

Drafts survive restarts and remain private. Authority uses the existing
`database.is_admin` check; group chats and ordinary clients cannot publish.
Existing commands, booking callbacks, contacts, and voice messages pass through.

Limits: 50,000 text characters, 10 attachments, 20 MB per input file (standard
Telegram Bot API download limit), video up to 10 minutes. JPEG/PNG/WebP and
MP4/MOV/WebM documents are supported along with native Telegram photos/videos.
Photo metadata is removed; videos become H.264/AAC MP4 with a poster and faststart.
Media stays on the existing backend host, not at expiring Telegram download URLs.

## Components

- `ai администратор/site_publications.py`: additive SQLite tables, drafts,
  publication, validated local media and public read routes.
- `ai администратор/site_publication_bot.py`: handlers for the existing PTB
  application. No token, poller, scheduler, new model or bot.
- `bot.py`: registration before normal conversational handlers and an admin button.
- `webhook_server.py`: table initialization and HTTP route registration.
- `site_engagement.py`: new published slugs accepted by existing counters/comments.
- `сайт и приложение/pwa-assets/tg-auth/site-publications-proxy.php`: secret-free
  PHP forwarding for list, detail, and range-capable media reads.
- Sibling `maya-web`: live homepage/index feed, article route
  `/events/post/?slug=post-<uuid>`, photos/videos and existing engagement UI.

The website checks for updates on opening, focus, and every 60 seconds while
visible. Homepage retains three cards and links to the paginated archive.
Existing authored static articles and their URLs are retained.

## Deployment Requirements

Back up the backend SQLite database and media directory before deployment.
Deploy only reviewed publication changes, not the whole dirty workspace.
The new tables do not alter customers, bookings, loyalty or financial records.
The read API must use the same database/media directory as the approved bot ingress.
Install/use Pillow, ffmpeg and ffprobe on the backend. Existing PTB version is 21.6.
Set `SITE_PUBLICATIONS_URL` to the new website's public root when it goes live
(including a preview subdirectory if needed). Default is `https://malesthetic.pro`.

The existing `api-proxy.php` is intentionally gitignored because it contains
deployment configuration. Its local dispatch has been updated. When merging into
the live proxy, preserve its config and add the three actions:

```php
case 'site_post_list':
case 'site_post':
case 'site_post_media':
    require_once __DIR__ . '/site-publications-proxy.php';
    forward_site_publication($action, $TG_CONFIG['bot_api_base']);
    break;
```

Also add these actions to its existing read-only rate-limit tier. Upload the
secret-free helper next to the proxy. Keep upstream paths fixed. Verify a real
`Range: bytes=0-255` request returns 206 for published video and 404 for draft files.

Build the website with `BUILD_EXPORT=1 npm run build`. In Next 15 the export folder
is `.next-export`; the compiler still uses `.next`. The dev server now uses
`.next-dev` so verification builds cannot overwrite the running localhost.

New article content loads through the public API into a static shell. This step
does not generate server-rendered per-post Open Graph metadata or dynamic sitemap
entries. A server-rendered publication route is a separate SEO follow-up; do not
claim guaranteed indexing from the current client-rendered feed.

## Verification

- `python -m unittest test_site_publications test_site_engagement -v` from the
  backend directory: 17 tests, including owner isolation, duplicate delivery,
  persistence, cancelled/draft privacy, video conversion, range responses,
  dynamic engagement, and existing moderation rules.
- Python compile checks for all touched backend modules.
- Both PHP files pass PHP 8.2 lint (remote lint only, no deployment).
- Static website export passes.
- Playwright against disposable local publication storage: photo decoding, video
  playback, escaped article text, missing article, three-card homepage, desktop
  and 320/390px mobile views. The PHP transport was intercepted in these browser
  checks; production proxy and live Telegram end-to-end remain unverified.
- Disposable fixture and UI checks are in `output/playwright/`. No test posts were
  published to production, and no Telegram message was sent.
