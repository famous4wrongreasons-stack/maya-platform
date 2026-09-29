# The iOS carrier

This carries MAYA onto iPhone. **It is not a second Maya.** It owns no booking, no CRM, no widgets,
no authority and no product UI — those live once, in `../maya-chat-shell`, and both carriers load the
same bytes.

```
                  MAYA BACKEND
                       ↑
                mayaos.ru/api
                       ↑
             SHARED CHAT-FIRST SHELL          ../maya-chat-shell
                ↙             ↘
             PWA            iOS               this directory
                           Capacitor
```

## Build it

```
npm install
npm run sync      # rebuilds the shell for the capacitor target, then copies it in
npm run open      # opens Xcode
```

`npm run sync` is the only supported way to put web assets here. It runs
`node ../maya-chat-shell/build.mjs --target=capacitor`, whose **capacitor proof** refuses any
difference between the two targets except the one line that is allowed to differ. So a drift between
the PWA and the app cannot survive a sync — it fails the build instead.

## What may live here, and what may not

Carrier-only concerns, and nothing else: Capacitor bootstrap, app lifecycle, safe areas, keyboard,
microphone permission, other native permissions, signing, deep links.

The committed source surface is deliberately tiny — two Swift files of Capacitor boilerplate, a
`Package.swift` the CLI manages, a one-line marker, `Info.plist`, and the asset catalogue. If a
future change adds product behaviour here, that is the fork this architecture exists to prevent.

**`ios/App/App/public/` is gitignored on purpose.** It is where `sync` drops the shell, and a
committed copy could silently drift from the shared source. The carrier carries the shell; it never
stores one.

## 🔴 The de-spoofing

The earlier native work set the WebView's own origin to the production site:

```json
"server": { "hostname": "mayaos.ru", "iosScheme": "https", "cleartext": false }
```

That made the app *claim to be* `https://mayaos.ru` — same-origin with production by assertion
rather than by fact, so the backend could not tell the app apart from the real site, and neither
could anything else relying on origin.

This carrier has **no `server` block**. The WebView runs on `capacitor://localhost`, the app is
honestly a separate origin, and it reaches the backend across that boundary the way any client does.
The live `CORS_ALLOWED_ORIGINS` already admits `capacitor://localhost`, so nothing had to be widened
to allow it.

`limitsNavigationsToAppBoundDomains` is set, which keeps the WebView inside the app's declared
domains.

## Identity

| | |
|---|---|
| bundle id | `ru.mayaos.app` |
| display name | MAYA |
| deployment target | iOS 15.0 |
| orientation | portrait, matching the shell's manifest |
| plugins | `@capacitor/app` (lifecycle, deep links), `@capacitor/keyboard`, `@capacitor/status-bar` |

`NSMicrophoneUsageDescription` is present because the shell captures voice. Without it iOS terminates
the app the moment the microphone is touched.

**The bundle id is the same one the owner's phone already carries**, so the first install of this
carrier replaces the app currently on that phone. There is no side-by-side path without changing the
identity, and changing it would strand the existing install.

## Signing

`CODE_SIGN_STYLE = Automatic` and `DEVELOPMENT_TEAM` is deliberately **unset** in the committed
project: a team is an account-level choice and does not belong in version control where it would
follow every clone. Select it once in Xcode — Signing & Capabilities — and Xcode stores it locally.
