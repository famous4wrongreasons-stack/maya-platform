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

## The OAuth deep link

After Telegram's consent the backend redirects to `mayaos://oauth-callback/?state=…&code=…` (or
`…&error=…`). `Info.plist` claims the `mayaos` scheme and `SceneDelegate` receives it.

**The glue is not auth code.** It checks the URL's shape — scheme, host, empty path, no user, no
password, no port, only `state`/`code`/`error` and each at most once — lifts those strings out, and
hands them to the shared shell as JSON-escaped data on a `window` event. It cannot tell a real code
from a fabricated one, never reads or writes a session, and never decides anyone is signed in. The
shell owns all of that, once, for both carriers.

### Why the shell is still loaded when the callback arrives

Capacitor's own `WebViewDelegationHandler.decidePolicyFor` **cancels** a top-level navigation to any
non-application URL and hands it to `UIApplication.open` instead. So `location.assign(<telegram>)`
from the shell opens Safari and leaves this WebView exactly where it was — with its in-memory record
of the login it started still intact. That record is the only thing that can tell a real callback
from one somebody else delivered, so this behaviour is load-bearing. **Do not add
`@capacitor/browser`, `SFSafariViewController` or `ASWebAuthenticationSession`**: the default is the
behaviour we want.

Equally: **do not add an `App.addListener('appUrlOpen')` listener.** `@capacitor/app` queues launch
URLs with `retainUntilConsumed`, so the first such listener anyone adds would be handed a stale
`code`+`state` from an earlier launch.

### A cold launch is deliberately not handled

If iOS has jetsammed MAYA during the Safari detour, the in-memory record is gone and no callback can
be trusted any more. The app opens at its first screen and the person starts again. Accepting a
callback in that state is exactly the attack the record exists to stop.

### 🔴 What this cannot close: same-device scheme hijack

A custom URL scheme is not exclusive. Any app on the phone may also declare `mayaos`, and iOS's
tie-break between them is undefined. Because the PKCE verifier lives on the server, `state` + `code`
together are a bearer credential: an app that wins the tie-break can POST them itself and receive a
session, without ever touching MAYA.

**No client-side check can close this**, and nothing in this directory pretends to. The two real
fixes, either sufficient:

1. **Universal Links** — an `applinks:mayaos.ru` associated domain, an AASA at `mayaos.ru` naming
   `<TEAMID>.ru.mayaos.app` for `/api/auth/oauth/native/callback`, and drop the 302 to the custom
   scheme entirely. Universal Links are cryptographically bound to the domain and cannot be claimed
   by another app. Needs the associated-domains entitlement, so it needs a provisioning profile that
   carries it — which needs the Apple account signed in to Xcode.
2. **A per-attempt client nonce** — the app generates it, sends it on `StartOauthLoginDto`, the
   server stores it beside `codeVerifier` and requires it on `CompleteOauthLoginDto`. A hijacker
   holding `(state, code)` then holds an incomplete credential. Needs a backend release.

Until one of them lands, this is a known, stated limitation of the native flow.

## Signing

`CODE_SIGN_STYLE = Automatic` and `DEVELOPMENT_TEAM` is deliberately **unset** in the committed
project: a team is an account-level choice and does not belong in version control where it would
follow every clone. Select it once in Xcode — Signing & Capabilities — and Xcode stores it locally.
