<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 37291a8daa329ff1f0c1e90b1a2e5960483a25a964cde04139f9cf9220082bc4 -->

# iOS DECISION SHEET — which bundle line becomes the carrier, and why it is not "the newest folder"

Owner decision. **No native project was modified.** Read-only throughout; the only file written by this
step is this sheet plus `logs/p6d-01-ios-decision-evidence.log`. No git write command, no build, no
deploy, no network call, no Maya code change.

Sources: `phase6-native-copies.md` (the two-copy comparison), `phase5-ios-inventory.md` (the carrier
inventory), `phase4-final.md` (the shell's own gates), plus read-only re-reads of the two trees and of
`git log` / `git show` / `git ls-tree` in the carrier repository (evidence log).

---

## 0 · THE FRAME, BEFORE THE THREE LINES

The three lines below are three versions of **the legacy salon bundle** — the 2.7 MB single-file
`www/index.html`. They are *not* three versions of the carrier. The carrier (Xcode project, Capacitor
8.4.1 via SPM, bundle id `ru.mayaos.app`, team `YCL5U4L56W`, iOS 15 target) is **the same in all three**
and is already fit to host the shell: `node build.mjs --target=capacitor` passes, and `dist/capacitor/`
differs from `dist/web/` in exactly two files (`index.html`'s digest path + `connect-src`, and
`src/net/endpoint.js`) — `phase4-final.md` G5/G6.

That reframes the question. Under the approved principle — **ONE chat-first shell → PWA →
iOS/Capacitor** — the shell replaces `www/` **wholesale**. So every one of these three bundles is
legacy UI to remove, in full, whichever line wins. What actually differs between the lines, and what
the decision therefore turns on, is only:

1. how much of the line exists **in git** (i.e. how much of it is recoverable, reviewable, CI-covered);
2. how large the **native Swift surface** is that must be deleted afterwards;
3. what **unique design work** the line holds that the new shell might want to carry.

---

## LINE A — the committed, pushed line

```
LINE A:
provenance/commit:  origin/codex/native-app-access-ui @ 78a27a6e76cfa96b4592baf2a4af0fc9e65b73cd
                    (2026-08-10), in repo [REDACTED EMAIL]:famous4wrongreasons-stack/maya-ios.git.
                    Six commits AHEAD of the local checkout's HEAD 30ad78f:
                    78a27a6 keep social login buttons interactive
                    b79642a sync login form with keyboard
                    6bccad3 restore Maya identity and smooth login reveal
                    772c4c1 add private client intelligence cards
                    40044b6 merge PR #11 (pr9-native-chat-contract)
                    2507208 replace misleading validation message
                    272 tracked files. Nothing uncommitted — this line IS a commit.
embedded UI:        www/index.html blob b78790f1, 39 457 lines / 2 553 782 B,
                    maya-build = 2026-08-01-crm-analytics-v2.
                    www/manifest.json: name «Мужская Эстетика», short_name Malesthetic,
                    id "/app/", background_color/theme_color #000000.
                    Ships www/service-worker.js and www/vkid-sdk.js.
unique work:        the ONLY line whose state is reproducible from a commit, reviewable as a diff and
                    covered by CI (.github/workflows/native-verify.yml: npm ci → npm test →
                    npm audit --audit-level=high). Carries .gitignore and .gitleaks.toml.
                    Its own identity work, committed: 6bccad3 added the maya-mark family
                    (dark/light/mono .svg + .png, maya-mark-icon, maya-mark-*-1024,
                    mayaos-login-bot-avatar-640) plus 201 lines of bundle change — a DIFFERENT
                    identity implementation from LINE C's ribbon-v1 module.
                    Its Swift surface is the MINIMAL one: MainViewController.swift is 104 lines and
                    MayaRuntimePlugin declares only getPreviewAccess. No checkTipsAvailability,
                    no openTipsURL, no loadRemoteImage, no DEBUG localStorage bootstrap.
                    Its verify-native.js is 201 lines / 30 assertions.
signing:            CODE_SIGN_STYLE Automatic, DEVELOPMENT_TEAM YCL5U4L56W,
                    PRODUCT_BUNDLE_IDENTIFIER ru.mayaos.app,
                    CODE_SIGN_ENTITLEMENTS = App/App.entitlements for BOTH Debug and Release,
                    CURRENT_PROJECT_VERSION 8 in both, MARKETING_VERSION 1.0,
                    IPHONEOS_DEPLOYMENT_TARGET 15.0.
plugins:            the same 11 npm Capacitor 8.4.1 packages + @capacitor-community/app-icon, and the
                    same four in-tree Swift plugins (MayaRuntime, TeamVoicePlayer, MayaVoiceRecorder,
                    MayaNfcWriter) — but MayaRuntime in its pre-salon-logic form (see unique work).
advantages:         recoverable, reviewable, CI-gated, secret-scanned; smallest post-adoption deletion
                    surface (30 assertions, 104 Swift lines, no uncommitted state to reconcile);
                    it is the only line a second machine or a CI runner can reproduce.
liabilities:        nobody has built it since 2026-08-10, so "it builds" is untested.
                    Debug signs with App.entitlements, which carries aps-environment=development and
                    the NFC NDEF format — on the free team observed (§signing reality below) that is
                    the likely reason LINE B invented an empty AppDebug.entitlements; a first Debug
                    build off LINE A may fail provisioning until those entitlements are removed
                    (which the shell wants removed anyway — R3/R6).
                    Adopting it means declaring that the month of uncommitted work in LINE B, which is
                    what the owner's phone actually runs today, is not carried forward as code.
```

```
COMPATIBLE WITH SHARED CHAT-FIRST SHELL:  BUNDLE: NO.  CARRIER: YES.
  The bundle is the legacy salon product — id "/app/" (the exact install identity the shell's own
  gate refuses: MAYA_SHELL_SERVE_PATH=/app/ npm run check:serving exits 1, phase4 G15), a registered
  service worker, a dead 169 KB VK SDK against CLAUDE.md gotcha 7. None of it survives.
  The carrier is compatible and, of the three, its native surface is closest to what the shell needs.
LEGACY UI TO REMOVE:  all of www/ and ios/App/App/public/ — the 39 457-line bundle, the salon-branded
  manifest (id "/app/", #000000), service-worker.js, vkid-sdk.js, native-enhancements.js,
  native-styles.css, the salon asset tree (master photos, certificates, cuts/, svc/); the same A*
  screen family counted at 55 components in LINE B's bundle (not separately counted here — same
  lineage); the three business Swift plugins (TeamVoicePlayer, MayaVoiceRecorder, MayaNfcWriter) and
  the NFC entitlement + NFCReaderUsageDescription; the 30 legacy assertions in verify-native.js.
UNIQUE WORK WORTH PRESERVING:  the repository itself — history, remote, CI workflow, .gitignore,
  .gitleaks.toml. That is the asset, and it is the one asset the other two lines cannot manufacture.
  The committed maya-mark asset family is a design INPUT for the new shell's brand layer, to be judged
  next to LINE C's ribbon-v1 — not carried as bundle code.
MIGRATION COST:  LOWEST. C1 replace www/ with dist/capacitor; C2 origin fix (below); C3 splash colour;
  C4 decide CapacitorHttp; C5 rewrite or repoint npm test (30 assertions, not 149); C6 update CI;
  C7 add a shared .xcscheme (none exists in any line); C8 settle versions; R3–R9 removals.
  Nothing to rescue out of an unbacked tree, because nothing in this line is unbacked.
```

---

## LINE B — the owner's working tree (what the phone runs)

```
LINE B:
provenance/commit:  /Users/stanislavmosin/Desktop/Projects/maya-ios — the working tree of that same
                    repo at HEAD 30ad78f (2026-08-10), 6 commits BEHIND its own origin, with 82 dirty
                    paths on top (33 modified tracked, 49 untracked), mtimes 2026-09-06 → 2026-09-11.
                    600 files in the preserved checkpoint. Provenance of the dirt is NOT a commit:
                    the uncommitted blobs exist in no git object anywhere. This line cannot be
                    reconstructed from any commit in any repository — it exists only as this tree.
embedded UI:        www/index.html a1d770a0…, 42 595 lines / 2 720 378 B,
                    maya-build = 2026-09-02-native-telegram-auth1.
                    manifest 22efe708… — theme/background #0A84FF, unversioned icons, id "/app/".
                    capacitor.config.json a6b28de3 (HEAD has d13a608d): SplashScreen #0A84FF.
                    ios/App/App/public/ is in sync with its own www/.
unique work:        1 870 bundle lines LINE C does not have — the native Telegram initData path and the
                    X-Telegram-InitData header, the `native-consent:` command, the native
                    TeamVoicePlayer.stop branch, the Telegram-style hold-to-record gesture.
                    In Swift: MainViewController grew 104 → 240 lines — checkTipsAvailability (probes
                    yclients.com / yookassa.ru / yoomoney.ru), openTipsURL (yclients.com only,
                    UIApplication.open + SFSafariViewController), loadRemoteImage (Telegram CDN proxy),
                    and the DEBUG WKUserScript bootstrap that clears localStorage/sessionStorage and
                    writes me_booking_backend / me_booking_api_base / tenant muzhskaya-estetika-3.
                    verify-native.js grew 201 → 478 lines, 30 → 149 assertions.
                    134 files only here: 108 .playwright-cli console/a11y snapshots, 20 PR9 visual-QA
                    screenshots, AGENTS.md, the PR9 task brief, and a 1.2 MB
                    index.beta-basis-20260709_194105.html snapshot.
                    www/assets/ is UNTRACKED here and holds the maya-mark family at byte sizes
                    identical to the ones 6bccad3 committed in LINE A (5769 / 389911 / 51928 / 39074 /
                    2870) — i.e. LINE A's identity assets appear to have been dropped in as loose files
                    instead of merged. That is an inference from sizes, not a hash proof.
signing:            same style/team/bundle id. Differences from LINE A: Debug
                    CODE_SIGN_ENTITLEMENTS = App/AppDebug.entitlements — an EMPTY <dict/> that is
                    UNTRACKED in git, i.e. the file the installed Debug build signs with is not
                    committed anywhere; CURRENT_PROJECT_VERSION 10 (Debug) vs 9 (Release).
                    project.pbxproj f9b130fc (uncommitted).
plugins:            identical npm + SPM set to A and C. In-tree Swift: the same four, but MayaRuntime
                    in its salon-business form (240-line MainViewController).
advantages:         it is the state the owner has actually seen working on the phone; the newest device
                    build (2026-09-08) came from here; it holds the only visual-QA evidence set.
liabilities:        unbacked, unreviewable, un-pushed, and 6 commits behind its own origin, so adopting
                    it forces a second decision — rebase onto A's six commits, or declare them dead.
                    Every one of its 1 870 unique bundle lines is work ON THE LEGACY PRODUCT (legacy
                    login, legacy chat composer, salon tips), so none of it survives the shell.
                    Its 149 assertions and 136 extra Swift lines are the largest deletion surface of
                    the three. Its Debug entitlements file is untracked, so the signing configuration
                    that works today is itself not recoverable from git.
```

```
COMPATIBLE WITH SHARED CHAT-FIRST SHELL:  BUNDLE: NO — and it is the least compatible of the three,
  because its unique value is precisely the native integration of the legacy login and the legacy chat
  (Telegram initData, hold-to-record, native-consent), which the shell replaces by design. Its Swift
  layer additionally hard-codes salon business logic and a single tenant slug inside the carrier, which
  is the one thing a SHARED shell carrier must not do.  CARRIER: YES (same carrier as A and C).
LEGACY UI TO REMOVE:  everything in LINE A's list, PLUS: MayaRuntimePlugin's three business methods,
  the whole DEBUG bootstrap block (MainViewController.swift:174-230), the 149-assertion verify-native.js,
  the 1.2 MB index.beta-basis snapshot, and the stale .playwright-cli/ + output/ evidence (move to the
  checkpoint, do not carry forward).
UNIQUE WORK WORTH PRESERVING:  two facts, not files.
  (1) AppDebug.entitlements — an empty entitlements dict for Debug is what lets a free team sign without
      push/NFC; re-create it deliberately in whichever line wins (or remove the entitlements the shell
      does not need, which reaches the same place).
  (2) the Telegram initData / X-Telegram-InitData contract, as a REQUIREMENT the new shell's auth may
      need to satisfy — read it, write it down, do not port the code.
  Everything else is preserved byte-for-byte in the checkpoint and does not need to live in the carrier.
MIGRATION COST:  HIGHEST but one. Everything in LINE A's list, plus deciding the fate of 82 uncommitted
  paths (commit them so they are reviewable, then delete what the shell replaces — or abandon them to
  the checkpoint), plus reconciling against A's six unmerged commits, plus deleting 149 assertions and
  136 lines of Swift.
```

---

## LINE C — the isolated copy with the ribbon-v1 identity

```
LINE C:
provenance/commit:  …/work/maya-identity-native — NO git at all (rev-parse fails, no .git anywhere).
                    496 files in the preserved checkpoint. Inferred, not recorded: it began as a copy
                    of LINE B taken after 2026-09-11 (the five Swift files, project.pbxproj, Info.plist,
                    all three .entitlements and verify-native.js are byte-identical to LINE B and all
                    dated 2026-09-08), then advanced the brand layer on 2026-09-13. It did NOT inherit
                    LINE B's bundle: its own meta tag names its origin as the older
                    2026-08-13-native-typewriter-v2 native build.
embedded UI:        www/index.html 6e94cb7e…, 41 650 lines / 2 717 588 B,
                    maya-build = 2026-09-02-pwa-telegram-auth1 (the PWA line, not the native line),
                    maya-source-build = 2026-08-13-native-typewriter-v2.
                    manifest 4fba3e54… — theme/background #ffffff, icons versioned ?v=maya-ribbon-v1,
                    id "/app/" (same retired identity as A and B).
                    capacitor.config.json 35a942fa — SplashScreen #FFFFFF.
unique work:        925 bundle lines and 30 files neither other line has. The substantive one is
                    www/assets/maya-identity.js — 129 lines, 5e7a1854…, exported as
                    window.MayaIdentity {version:'ribbon-v1', motionVersion:'owner-reference-v3'}:
                    the ribbon mark as two bezier paths with two gradients, seven named poses cropped
                    out of an unmodified 1672×941 owner storyboard PNG (dimension-checked, white matte
                    un-premultiplied per pixel), additive cross-fade between exact source frames, a
                    mount(host,{state,level}) state machine over idle/launch/thinking/recording/
                    responding/done/cancelled, prefers-reduced-motion and visibilitychange honoured,
                    ResizeObserver, and a documented refusal to invent an equalizer or open a mic.
                    With it: www/maya-motion-reference.png (1.0 MB owner reference, pinned by the
                    canonical pipeline to sha b57b0494…), maya-icon.svg, maya-mark.svg, and split
                    app-scope / root-scope PWA icon sets (pwa-assets/for-app, for-root, logo-source.png)
                    — 15 source files, all mirrored into ios/App/App/public/.
                    Every one of those 15 is absent from origin/codex/native-app-access-ui and absent
                    from the Desktop repo's object store. They exist in no git object anywhere.
signing:            identical to LINE B, byte for byte — same project.pbxproj f9b130fc, same three
                    entitlements files, same team YCL5U4L56W, same bundle id ru.mayaos.app,
                    same CURRENT_PROJECT_VERSION 10/9 split.
plugins:            identical to LINE B — package.json byte-identical, same 8 SPM plugin packages +
                    capacitor-swift-pm 8.4.1, all five Swift files hash-equal to LINE B's.
advantages:         it holds the only serious NEW design work in the whole comparison, and that work is
                    written framework-agnostically: an IIFE that takes a host element and a state, with
                    no dependency on the legacy React/Aurora tree. It is the one thing here that a
                    chat-first shell could genuinely want.
liabilities:        no git, no remote, no CI, no .gitignore, no .gitleaks.toml. It FAILS ITS OWN
                    verification script (npm test → rc 1, AssertionError at verify-native.js:10:
                    the bundle does not carry the native build marker the script pins). Its bundle is
                    the PWA line, 945 lines shorter than LINE B's, so adopting it as a bundle would
                    also silently drop LINE B's native work. Its 1 MB motion reference and its
                    "owner-reference-v3" claim are undocumented as accepted — nothing in either tree
                    records that the ribbon mark was approved.
```

```
COMPATIBLE WITH SHARED CHAT-FIRST SHELL:  BUNDLE: NO — same salon lineage, same id "/app/", same
  service worker, same VK SDK; and it is a PWA-line bundle inside a native carrier, which is how it
  ends up failing its own gate.  ONE MODULE INSIDE IT: YES, with a rewrite (see migration cost).
  CARRIER: YES (same carrier).
LEGACY UI TO REMOVE:  everything in LINE B's list (it carries the same Swift surface byte for byte),
  plus its own bundle. Note the trap: the ribbon-v1 identity is currently entangled with that bundle
  through ?v=maya-ribbon-v1 asset versioning and a maya-identity-source inline script — extract the
  module, do not keep the bundle for it.
UNIQUE WORK WORTH PRESERVING:  www/assets/maya-identity.js, www/maya-motion-reference.png,
  www/assets/maya-icon.svg, www/assets/maya-mark.svg — the four files that are the actual design work.
  These are the only files in the entire comparison that are simultaneously (a) valuable to a
  chat-first shell and (b) backed by nothing. They are preserved in the checkpoint; whether they ship
  is a PRODUCT question (below), not a reason to keep this line.
MIGRATION COST:  HIGHEST. Everything in LINE B's list, plus: create or graft a git repository, restore
  .gitignore / .gitleaks.toml / the CI workflow, and fix that the tree fails its own npm test.
  Separately, the cost of carrying the identity module into the shell (which is the same whichever line
  wins): maya-identity.js:79 does host.innerHTML = markup(id). The shell's CSP is
  require-trusted-types-for 'script' and its build carries a dom-sink rule ('dom-sink', N-3/V2-15),
  so innerHTML is refused at build time and would throw at runtime. The fix is mechanical — build the
  <svg> with createElementNS/setAttribute instead of a string, keep every coordinate, gradient stop,
  pose rectangle and the matte maths unchanged. The module already avoids everything else the shell
  bans: no storage, no cookies, no service worker, no WebSocket, no network beyond one local PNG.
```

---

## RECOMMENDATION

**Adopt LINE A as the carrier's baseline. Carry LINE C's four design files forward as product inputs.
Ship nothing from LINE B; keep it only as the preserved record of what the phone runs.**

**This follows from the principle, not from dates — and the principle points at the OLDEST line.**
LINE C is the newest folder (2026-09-13) and LINE B is what the phone runs; the recommendation is
LINE A, dated 2026-08-10. The reasoning is entirely: *one chat-first shell serving both the PWA and the
iOS/Capacitor carrier*. Under that principle the carrier is a thin delivery vehicle — `webDir: "www"`
gets `dist/capacitor/` and nothing else — so the bundle every line is built around is discarded in all
three cases. What is left to value is the repository (history, remote, CI, secret scanning) and the
smallness of the native surface that must then be deleted. LINE A wins both on the merits:

* it is the only line that exists as a commit, so the first shell carrier build is reviewable as a diff
  and reproducible on another machine or in CI;
* its Swift surface is already the one the shell wants — 104 lines, `MayaRuntimePlugin` with only
  `getPreviewAccess`, no salon tips, no Telegram CDN proxy, no tenant slug, no `localStorage` bootstrap.
  Removals R1 and R6 are simply *not adopted* rather than performed;
* its verification gate is 30 assertions, not 149, so C5 (rewrite or repoint `npm test`) is a third of
  the work.

Had the decision been made by recency it would have picked LINE C, which has no git, fails its own
gate, and carries a PWA-line bundle inside a native carrier — three defects that all have to be
repaired before the first phone test, none of which buy the shell anything.

**What adopting LINE A does not mean.** It does not mean deleting LINE B or LINE C. Both originals are
untouched and both are preserved byte-for-byte (§Preserved copies). It does not mean the six unmerged
commits are automatically right either — they are simply the reviewable baseline. And it does not mean
the owner's phone keeps working: all three lines share bundle id `ru.mayaos.app`, so whichever is built
**replaces** the app on the phone, and there is no way to keep two side by side.

**The uncommitted design work is a product question, not a reason to keep a legacy bundle.** LINE C's
`maya-identity.js` (ribbon-v1 / owner-reference-v3 + the 1 MB motion reference) and LINE A's committed
`maya-mark-*` family are two different answers to "what is the MAYA mark, and how does it move". Which
one — if either — the NEW shell should carry is for the owner to decide, next to the shell's own
placeholder brand layer (`brand/make-icons.mjs`, `entry/manifest.webmanifest`, whose `theme_color` and
`background_color` the build already forces to equal the stylesheet's `--bg`). That decision is about
the product's identity. It is not evidence that any of the three bundles should survive, and it does not
change which line should be the repository baseline. Keeping LINE C alive "because the identity lives
there" would be keeping a 2.7 MB salon bundle, a `/app/` install id, a service worker and a dead VK SDK
in order to hold four files that are already preserved and that need a rewrite either way.

**Two things are not settled by this sheet and should not be guessed.** (1) Whether the six unmerged
commits supersede or are superseded by the local Sep-08/Sep-13 work — `6bccad3 restore Maya identity and
smooth login reveal` is the same subject as LINE C's identity layer, solved differently; that is intent,
not files. (2) Whether `maya-ribbon-v1` was ever accepted. Both are owner answers, and both are
recorded as open in `phase6-native-copies.md` §5.

---

## PREPARED, NOT APPLIED — the native wrapper must not spoof the production web origin

**Status: prepared, not applied. Nothing was edited. Apply this with the first shell carrier build,
after a line has been chosen — not before, and not to a legacy line.**

### What it does today

`capacitor.config.json` (identical in LINE B and LINE C; LINE A's committed copy is a different blob —
HEAD `d13a608d` vs LINE B's `a6b28de3` — and its content was not read in this session, see Limits):

```json
  "server": {
    "hostname": "mayaos.ru",
    "iosScheme": "https",
    "cleartext": false
  }
```

`server.url` is absent, so the WebView loads the **packaged local bundle** through Capacitor's own
URL-scheme handler — but the document is given the **production web origin**, `https://mayaos.ru`. The
app names itself as the live site while serving files off the device. `plugins.CapacitorHttp.enabled` is
`true`, which patches `fetch` and `XMLHttpRequest` onto the native HTTP stack.

### Why that silently widens the shell's same-origin policy

1. **`'self'` stops meaning "this bundle" and starts meaning "the production host."** The shell's CSP is
   `default-src 'self'; script-src 'self'; connect-src 'self'` (web target), and
   `connect-src 'self' https://mayaos.ru` for the capacitor target. CSP resolves `'self'` against the
   **document origin**. Under the spoof, `'self'` *is* `https://mayaos.ru` — so the web target's
   deliberately narrow `connect-src 'self'` would already permit the whole production host, and the
   capacitor target's explicit grant becomes a no-op. The build cannot see this: `capacitorProof` checks
   that `index.html` differs from the web build only in the digest path and the `connect-src` string
   (`phase4-final.md` G5), and two different strings that denote the same runtime origin pass that check.
2. **Local and remote become indistinguishable to the page.** With `CapacitorHttp` patching `fetch`, an
   absolute `https://mayaos.ru/api/...` leaves the device while a relative `/api/...` is answered by the
   local scheme handler — same origin, same code path, no way for the page to tell. A future relative
   call silently becomes a local 200 serving the bundle's own HTML instead of JSON; a path typo silently
   becomes a production request. Neither trips CSP, because both are `'self'`.
3. **Origin-keyed browser state is written as the production origin.** WebKit keys cookies, storage and
   the service-worker registry by origin. The shell stores nothing — `localStorage`, `sessionStorage`,
   `indexedDB`, `caches`, `serviceWorker`, `WebSocket`, `EventSource` and `cookie` are all in the build's
   `BANNED_NAMES` — so there is no leak today. The point is the fence, not a current incident: the shell
   is the layer that is supposed to make that guarantee checkable, and a spoofed origin makes it
   uncheckable.
4. **It erases the one distinction a shared shell needs.** With two carriers on one shell, the native
   build should be identifiable — in an `Origin`/`Referer` header, in a server log, in a bug report.
   Today it is byte-identical to the web front in that respect, by configuration.

### The exact change

File: `<carrier>/capacitor.config.json`. Delete the `hostname` and `iosScheme` members of `server`
(or set `"iosScheme": "capacitor"`, its default) and leave `server.url` absent:

```json
  "server": {
    "cleartext": false
  }
```

Then `npx cap sync ios` to regenerate the mirror at `<carrier>/ios/App/App/capacitor.config.json` —
that file is generated, never hand-edited. Rebuild; no Swift, no `Info.plist`, no `project.pbxproj`, and
no shell source change is needed.

**Effect.** The iOS WebView origin becomes Capacitor's default (`capacitor://localhost`). `'self'` then
means the local bundle and nothing else, and every API call must be the absolute `https://mayaos.ru/api`
that the shell's capacitor target already emits and already names in `connect-src 'self' https://mayaos.ru`
— a grant that starts doing real work instead of being a synonym for `'self'`. Nothing in the shell
changes: `TARGETS.capacitor` in `maya-chat-shell/build.mjs` already hard-codes that absolute base.

**Caveats, stated rather than smoothed over.**

* Changing the scheme/host changes the origin, so any WebKit storage bound to the old origin is
  orphaned. The shell stores nothing, so it loses nothing — a **legacy** bundle would lose its
  `localStorage`, which is a second reason to apply this only to the shell carrier.
* What the runtime origin is *today* is an inference from the config (phase 5 §4.1/§5), not a
  measurement — WKWebView's treatment of `https` as a custom scheme was not tested here. Confirm with
  one `window.location.origin` read on a simulator run before and after.
* This is hygiene, not a fix that makes login work: `https://mayaos.ru/api/health/ready` answered
  **502** (phase 5 §5), and the host behind it is the one lost on 2026-09-23. The change is inert until
  the backend has an address again.
* It does not settle C4. Whether a `CapacitorHttp`-patched `fetch` is subject to page CSP at all remains
  a device question (phase 5 §7.3 residual 1); deciding `CapacitorHttp.enabled` deliberately is still
  open.
* **Release-gate impact: none.** `capacitor.config.json` lives in the iOS carrier repository, not in the
  canonical repo, so it is not one of the R01-pinned files and this change adds no discrepancy to the
  S5-1 situation. The carrier's own gate (`.github/workflows/native-verify.yml` → `npm test` →
  `verify-native.js`) fails on the bundle swap regardless (C5/C6) and must be rewritten in the same
  change set.

---

## PRESERVED COPIES — where they are, how to restore

`work/.maya-program/mobile/native-preserve/` — additive copies made 2026-09-28T14:38:54Z. **Nothing was
moved or deleted from either original; both originals are exactly as found.**

| Checkpoint | Source (untouched) | Files | Verified |
|---|---|---|---|
| `native-preserve/desktop-maya-ios-20260928T143854Z/tree/` | `/Users/stanislavmosin/Desktop/Projects/maya-ios` (LINE B, and LINE A's git history via `origin`) | 600 | `meta/verify.diff` empty |
| `native-preserve/work-maya-identity-native-20260928T143854Z/tree/` | `…/work/maya-identity-native` (LINE C) | 496 | `meta/verify.diff` empty |

Every file was hashed in the original (`meta/source.sha256`) and again read back out of the copy
(`meta/copy.sha256`); the diff is empty for both. Excluded by directory name: `node_modules`, `.git`,
`Pods` (none — the project uses SPM), `build`, `DerivedData`, `.DS_Store`. `.git` was excluded only
after proving it holds nothing unique (`git rev-list --count --all --not --remotes` = 0, `git stash
list` empty), so LINE A is recoverable from `[REDACTED EMAIL]:famous4wrongreasons-stack/maya-ios.git`;
the full git state is transcribed in `desktop-…/meta/git-state.txt`.

**Restore** — full procedure, manifests and the re-verification command are in
`native-preserve/RESTORE.md`. In short: restoring is a plain `rsync -a` of a `tree/` back over the
original (destructive to the original's current content — read `phase6-native-copies.md` first, because
the two copies are **not** supersets of each other), or a single `cp` for one file, e.g. the four design
files this sheet recommends carrying forward:

```
native-preserve/work-maya-identity-native-20260928T143854Z/tree/www/assets/maya-identity.js
native-preserve/work-maya-identity-native-20260928T143854Z/tree/www/maya-motion-reference.png
native-preserve/work-maya-identity-native-20260928T143854Z/tree/www/assets/maya-icon.svg
native-preserve/work-maya-identity-native-20260928T143854Z/tree/www/assets/maya-mark.svg
```

Re-verify any restore against `meta/copy.sha256` with the command in `RESTORE.md` (rc 0 = identical).
Manifest roll-ups: desktop `7b4ef5fb53a6df6d…`, work `f2c70694879c1cf5…`.

**Not in the checkpoint:** `build/` — 9.6 GB of DerivedData in LINE B and 1.9 GB in LINE C, excluded by
name. If a signed artefact or a provisioning profile in there matters, it is not preserved. (There is no
`.ipa` and no `.xcarchive` anywhere in the carrier, so there is no distribution artefact to lose.)

---

## LIMITS OF THIS SHEET

* **No native project was modified**, nothing was built, no simulator or device was used. That any line
  builds today is argued from configuration plus the recorded `--target=capacitor` pass, not from an IPA.
* **LINE A's committed `capacitor.config.json` was not read.** The shell tool became unavailable
  mid-session after the first read-only git calls, so `git show 78a27a6:capacitor.config.json` was not
  completed. What is known: HEAD's blob is `d13a608d` and LINE B's worktree file is `a6b28de3`, so they
  differ, and none of the four unmerged commits whose stats were read touched that path. The origin fix
  above is a single edit to whichever line is chosen, so this gap does not affect the recommendation —
  but A's committed `server` block should be read before the edit is applied.
* **The identity-asset overlap between A and B is inferred from byte sizes**, not from a hash comparison
  (same reason). LINE B's untracked `www/assets/` files match the sizes 6bccad3 committed exactly.
* **The 107 differing raster assets were compared by hash only** — which differ is known, which looks
  right is not.
* **LINE C's provenance is an inference** from mtimes, the `maya-source-build` meta tag and the
  byte-identical Swift/Xcode files — a strong inference, not a record, because there is no commit.
* **The six unmerged commits were read as messages and file stats**, not diffed against either worktree.
* **Free-team signing is an inference** from a 7-day profile with no `aps-environment` and an auto App ID
  `XC ru mayaos app`; it is settled only in Xcode ▸ Settings ▸ Accounts or on developer.apple.com, which
  only the owner can open. It applies equally to all three lines and is not a differentiator.
* No secret value appears anywhere in this sheet. Code-signing fingerprints, provisioning-profile
  certificates, tokens and credentials were never printed or read into it.
