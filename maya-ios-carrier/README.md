# The iOS carrier

The single release web payload owner is `../maya-carrier-react`: the certified React AChat over
Maya's headless runtime. `maya-chat-shell` remains a runtime library and test harness; its DOM shell
is not the production PWA or native payload.

## Build and verify locally

```
npm ci
npm run sync
npm run verify
npm run open
```

`sync` invokes `maya-carrier-react/tools/release.mjs`. It compiles the runtime dependency, builds both
React targets, verifies their exact file sets and approved endpoint substitution, invokes Capacitor,
and verifies the actual generated `App/public` and native configuration. Xcode also runs that refusing
verifier before every build. Use `node ../maya-carrier-react/tools/release.mjs verify-app PATH/App.app`
after a build to check the packaged resources. No command above installs, publishes, grants, or logs in.

Web and native share the React entrypoint, CSS, approved manifest and icons. The existing PWA install
identity `/maya-chat-shell/` is retained as identity metadata; it does not select the old shell's code.
The production web artifact is `../maya-carrier-react/dist/web`, published at that approved path.
The native artifact is `../maya-carrier-react/dist/capacitor`. Only the one approved API endpoint string,
its content address and the corresponding CSP connect-src differ. No application behavior is native-owned.

Verification reconstructs expected bytes from the fixed React source. It does not trust an inventory
supplied with a candidate. Extra files, nonempty bridge placeholders, remote-server overrides, old-shell
selection, missing manifest or changed generated assets fail closed. A failed check does not repair assets.

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

## The OAuth callback: a Universal Link

After Telegram's consent the provider sends the browser to
`https://mayaos.ru/api/auth/oauth/native/callback?state=…&code=…`. That exact path is claimed by
this app as a **Universal Link**, so iOS opens MAYA on it instead of letting the request go out.
`SceneDelegate.scene(_:continue:)` receives it.

**The glue is not auth code.** It checks the URL's shape — scheme, host, exact path, no user, no
password, no port, only `state`/`code`/`error` and each at most once — lifts those strings out, and
hands them to the shared shell as JSON-escaped data on a `window` event. It cannot tell a real code
from a fabricated one, never reads or writes a session, and never decides anyone is signed in. The
shell owns all of that, once, for both carriers.

| | |
|---|---|
| association | `applinks:mayaos.ru` (`App/App.entitlements`) |
| AASA | `https://mayaos.ru/.well-known/apple-app-site-association` — `application/json`, 200, no redirect, no auth |
| appID | `YCL5U4L56W.ru.mayaos.app` |
| claimed path | `/api/auth/oauth/native/callback`, and nothing else on the domain |

The AASA is published from `maya-saas-backend/deploy/platform/beget-edge/well-known/`. It sits beside
its own `.htaccess`, which supplies the `application/json` type the extensionless file would
otherwise be served without — deliberately NOT in the site's root `.htaccess`, whose sha256 is pinned
by the R01 relay gate.

### The development-only `mayaos://` transport

Associated Domains is not available to a personal Apple team, so a Universal Link cannot be signed
on one — and the owner needs to run MAYA on their own iPhone now. A custom-scheme transport therefore
exists **for the Debug configuration alone**, and the separation is enforced three times over:

| | Debug | Release |
|---|---|---|
| `MAYA_DEV_URL_SCHEME` | `mayaos` | empty — the built plist carries `CFBundleURLSchemes: [""]` |
| `SWIFT_ACTIVE_COMPILATION_CONDITIONS` | `DEBUG MAYA_DEV_AUTH_SCHEME` | empty |
| `scene(_:openURLContexts:)` | compiled | **does not exist** |
| `CODE_SIGN_ENTITLEMENTS` | none | `App/App.entitlements` (applinks:mayaos.ru) |
| callback | `mayaos://oauth-callback/` | `https://mayaos.ru/api/auth/oauth/native/callback` |

1. **The code is not there.** The dev handler is inside `#if MAYA_DEV_AUTH_SCHEME`, and only Debug
   defines it. A release build has no method that can receive a custom-scheme URL.
2. **`#error` if anyone tries.** Defining the flag for a non-debug configuration stops the build.
3. **A build phase refuses it.** «Refuse a release build that carries the dev auth scheme» reads the
   built Info.plist's `CFBundleURLSchemes` and fails any non-Debug build that names one — and fails a
   release that declares no associated-domains entitlement either, so Release cannot end up with no
   working callback at all. Proven in both directions: a clean Release build passes it, and a Release
   build with `MAYA_DEV_URL_SCHEME=mayaos` forced in fails with that message.

Both transports validate the same way and hand the same three opaque strings to the same shell
through one `hand(_:)`. There is one landing, one completion and one session owner; only the
doorway differs.

**Before TestFlight, the App Store, or any public iOS release this transport must be gone** — which
the release gate already guarantees, because such a build cannot be produced while it is present.

### 🔴 Why the custom `mayaos://` scheme is not the final transport

It used to be the callback transport. A custom scheme is not exclusive: any app may declare the same
one, iOS's tie-break between them is undefined, and because the PKCE verifier lives on the server,
`state` + `code` together are a bearer credential for a session. An app that won the tie-break could
mint a session without ever touching MAYA.

An `applinks:` association is bound to the domain by a file only that domain can serve, so it cannot
be claimed by another app. `CFBundleURLTypes` is therefore removed, and **there is no fallback to the
scheme here**. The backend still emits a 302 to `mayaos://` when the link is not intercepted; nothing
claims it any more, so that path now dead-ends visibly. A fallback that quietly worked would make
every Universal Link proof a lie, which is exactly why there isn't one. Removing the backend's 302 is
a separate, canonical backend change.

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

### 🔴 This target cannot be signed by a personal team

Associated Domains is not available to free Apple IDs. Measured 2026-09-29:

```
error: Cannot create a iOS App Development provisioning profile for "ru.mayaos.app".
Personal development teams, including "Stanislav Mosin", do not support the
Associated Domains capability.
```

Xcode reached Apple and was refused, so this is not a missing login — team `YCL5U4L56W` is a personal
team. Building this target needs an **Apple Developer Program membership** for that Apple ID, and the
Associated Domains capability enabled on the `ru.mayaos.app` App ID. Everything else is in place and
builds the moment that is true.

## Signing

`CODE_SIGN_STYLE = Automatic` and `DEVELOPMENT_TEAM` is deliberately **unset** in the committed
project: a team is an account-level choice and does not belong in version control where it would
follow every clone. Select it once in Xcode — Signing & Capabilities — and Xcode stores it locally.
