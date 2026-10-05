<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: c10f121b7a3fff8106db63e0bcedc37004691e6bb6e53ae02a993cae93a538ac -->

# Phase 4 — the last three hardening edits

Repo `work/maya-identity-consent`, branch `codex/maya-identity-consent-20260913`, HEAD `34bc82a2` =
`origin/codex/maya-identity-consent-20260913`. **No git write command was run** — the human commits.
No deploy, no production access, no database, no service worker. Work confined to `maya-chat-shell/`;
**the one file I changed is `maya-chat-shell/build.mjs`** (see §6).

Nothing from phases 3 + 4's eight findings was redone. The shared-shell mobile fixes, the new PWA
layer, the closed manifest, the role-based head contract, `PWA_SERVING`/`--serve-path`,
`test/brand.test.mjs` and probe **M8** were all found in place, re-measured, and left alone.

**Runtimes.** Node 22 is `work/.maya-program/node22/bin/node` **v22.23.3** (put first on `PATH`); the
machine default is **v24.15.0** and is green on every gate that has a runtime. Chrome is
**154.0.8037.57**. Every rc below was read from `$?` on its own line — nothing is behind a pipe. My
scripts and scratch trees live **outside the repository** in `work/.maya-program/mobile/fix4/`.

**Logs.** `work/.maya-program/mobile/logs/p4-NN-*`, numbered `p4-00-…` to `p4-62-…`; every log cited
below is one of those. (The directory also holds older, unnumbered `p4-*` logs from an earlier session —
`p4-baseline-…`, `p4-final-…`, `p4-check-node22.log` and so on. None of those are from this run and none
were overwritten.)

**Green before I started**, so nothing below is a pre-existing red: `node build.mjs --check` rc **0**
(`p4-00`), `node build.mjs --self-test` rc **0**, pwa contract **46/46** (`p4-01`).

---

## 1. The base-uri question, measured — and the premise is half wrong

The brief's premise was that `entry/index.html`'s meta CSP already carries `base-uri 'none'`, "which
should make a planted `<base href="/app/">` inert". **It does not, in the position that matters.** A
meta-delivered CSP governs only what is parsed *after* it, so a `<base>` placed earlier in the head —
the natural place for one, and the position whose `href` a browser honours — is processed before the
policy exists.

`dist/web` was copied to `fix4/base-web` and four variants of `index.html` were written, differing only
in where the `<base href="/app/">` sits and whether the meta keeps the token. Each was navigated with
headless Chrome and read over CDP: `document.baseURI`, `Page.getAppManifest`, `Page.getAppId`
(`fix4/base-probe.mjs`).

### 1a. Served with **no** CSP header — the meta is the only fence (`p4-05`, `p4-07`)

| the page | `<base>` position | meta token | `document.baseURI` | `Page.getAppId` | verdict |
|---|---|---|---|---|---|
| `index.html` (control) | none | intact | `…/index.html` | `…/maya-chat-shell/` | — |
| `v1-base-first-metaintact` | **before** the meta CSP | **intact** | **`…/app/`** | **`…/app/`** | **HONOURED** |
| `v2-base-last-metaintact` | after the meta CSP | intact | `…/v2-…html` | `…/maya-chat-shell/` | INERT |
| `v3-base-first-metadropped` | before | dropped | `…/app/` | `…/app/` | HONOURED |
| `v4-base-last-metadropped` | after | dropped | `…/app/` | `…/app/` | HONOURED |

The `Page.getAppId` column is the load-bearing one. With a manifest declaring `id: "/app/"` present at
`/app/` — which is exactly the state of the real host, where the retired PWA still lives — three of the
four planted pages made Chrome answer:

```
== v1-base-first-metaintact.html
   <base> element present : "<base href=\"/app/\">"
   document.baseURI       : http://127.0.0.1:8903/app/
   manifest url fetched   : http://127.0.0.1:8903/app/manifest.webmanifest
   manifest errors        : []
   Page.getAppId          : {"appId":"http://127.0.0.1:8903/app/","recommendedId":"/app/"}
   the <base> is          : HONOURED (baseURI moved)
```

That is the retired install's identity — the one thing the absolute `id` member exists to keep apart —
reached **with `base-uri 'none'` still in the meta**. Without the `/app/` manifest the harm is only
slightly smaller: the manifest fetch leaves the shell's own directory and the identity collapses to the
document URL (`p4-05`).

### 1b. Served with the shell's own dev server — all four inert (`p4-03`)

`node dev/serve.mjs --root=fix4/base-web --port=8901 --mock=dev/fixtures --scenario=happy` sends its
own header CSP:

```
Content-Security-Policy: default-src 'self'; … base-uri 'none'; …; frame-ancestors 'none'
```

A **header** CSP applies to the whole document regardless of parse order, so through the dev server all
four planted variants reported `INERT` and `…/maya-chat-shell/`. That is why the dev server alone cannot
answer the question, and why §1a needed the header-free control (`fix4/static-noheaders.mjs`) serving the
identical bytes.

### What follows, and it reorders the brief

* Refusing a `<base>` element is **not** defence in depth. For the before-the-meta position it is the
  only build-side defence there is.
* Pinning the token is still worth doing: it covers the after-the-meta position (v2 → v4 is a clean
  before/after), and it does not depend on the deploy host sending a header CSP. Nothing in this
  repository deploys the shell yet, and the platform's other front is a Beget/PHP relay — a host that
  serves a built tree with no CSP header is the ordinary case, not the exotic one.
* **What already covered part of this, honestly stated.** `test/dom.test.mjs:137` asserts
  `cspSplitProblems(HEADER_CSP, html) === []`, which compares the meta against `dev/serve.mjs`'s
  `CSP_DIRECTIVES`; dropping the token from the meta **alone** was therefore already caught there
  (`["meta CSP lacks base-uri"]`). Two things it does not catch, measured (`p4-61`, `p4-62`): a planted
  `<base>` (`[]`), and the token leaving the meta *and* `dev/serve.mjs`'s list together (`[]`). The
  build — the thing a deployer runs, and the only gate that travels with the artefact — said nothing in
  every one of these cases, and now refuses all of them.

---

## 2. The three edits

All three are in `build.mjs`'s step 9(b) PWA contract and its self-test table. No stylesheet, entry,
`src/**`, route, renderer, session, auth or policy change; no service worker; no new file.

### 2.1 The base URL (`pwaContract`, the head section)

* `headTags()` now also parses `<base>` (`/<(base|link|meta)\b([^>]*)>/gi`), and its contract says the
  whole document is scanned rather than the head alone — Chrome honours a `<base href>` wherever it is
  parsed.
* A new clause refuses **any** `<base>` element, naming the measurement from §1a.
* A new clause requires **exactly one** meta `Content-Security-Policy` and pins `base-uri 'none'` in it.
* New helper `cspDirectives(policy)` — a CSP string read the way a browser reads it, name → tokens, so
  the pin is not a substring match on the attribute.

### 2.2 The viewport (`pwaContract`, the head section)

* New frozen `VIEWPORT_TOKENS` = `width=device-width`, `initial-scale=1`, `viewport-fit=cover`,
  `interactive-widget=resizes-content`, with the reason each one is load-bearing written next to it.
* New helper `viewportTokens(tag)` normalises the `content` list (comma split, whitespace around `=`
  removed, lower-cased), so `viewport-fit = cover` is the same token.
* Exactly one `<meta name="viewport">`, and each of the four tokens required by name — so a refusal says
  *which* token went missing. `viewport-fit=cover` is what makes every `env(safe-area-inset-*)`
  non-zero, i.e. what makes all of `--safe-top/right/bottom/left` in `entry/styles.css` more than `0px`;
  `interactive-widget=resizes-content` is what makes Chrome shrink the layout viewport for the keyboard,
  which is the behaviour the composer's keyboard inset is built on. Neither is visible to a test that
  only reads the stylesheet.

### 2.3 The theme-token reader (`schemeToken`, `rootBlock` → `rootBlocks`)

`rootBlock(css, from)` returned the first `:root` block from an offset and `schemeToken` read the first
`--bg` in it. CSS paints the **last** declaration of equal specificity, in both senses — the last
`--name` inside a block and the last `:root` block of the scope.

`rootBlocks(css)` replaces it: one brace-depth walk that collects every `:root` block into the two
scopes the schemes are actually read from — the top level (light) and the body of
`@media (prefers-color-scheme: dark)` — in source order. `schemeToken` then takes the last declaration
across that scope. Direct before/after on one stylesheet (`fix4/t.mjs`):

```
BEFORE (first-wins): {"light":"#aaa","dark":"#111"}
AFTER  (last-wins) : {"light":"#bbb","dark":"#222"}
```

The hole ran in exactly the harmful direction: a second `--bg` appended to `:root` repainted the page
while the reader still returned the value nothing paints, so the manifest's two colours and both
theme-color metas kept matching a dead token and the build stayed green over a window whose chrome no
longer equals its page. The earlier review measured that in a browser — a doubled `--bg` put the painted
body background at `rgb(255, 0, 0)` with the theme-color meta still saying `#f6f5f2`
(`logs/v34b-40-doubled-bg.log`).

### Diff summary

`maya-chat-shell/build.mjs` **2088 → 2239 lines, +170 / −19, 7 hunks.** Reconstructed exactly (the
reverted copy is `fix4/build.as-i-found-it.mjs`, 2088 lines; the diff is `fix4/phase4-build.diff`):

| hunk | what |
|---|---|
| `@@ -1342,27 +1342,67 @@` | `rootBlock` → `rootBlocks` (the two-scope brace walk); `schemeToken` takes the last declaration |
| `@@ -1419,14 +1459,15 @@` | `headTags` parses `<base>` too, and its contract says "the document", not "the head" |
| `@@ -1437,6 +1478,33 @@` | new `cspDirectives`, `viewportTokens`, `VIEWPORT_TOKENS` |
| `@@ -1532,8 +1600,8 @@` | the head-contract preamble comment names `base` |
| `@@ -1554,6 +1622,52 @@` | the `<base>` refusal, the one-meta-CSP + `base-uri 'none'` pin, the viewport clauses |
| `@@ -1881,8 +1995,35 @@` | four new self-test rows (base-uri dropped, `<base>` planted, `viewport-fit` dropped, second viewport meta) |
| `@@ -1906,6 +2047,16 @@` | the fifth row: a second `--bg` appended to `:root` |

`node build.mjs --self-test`: **pwa contract 46/46 → 51/51**. Nothing else in the self-test moved
(refuse 66/66, admit 23/23, coverage 31/31, write guard 2/2, probes 8/8).

The emitted artefact did not change: `dist/manifest.json` hashes
`d174b373777c730b424c85d1f8890f28df1b4331fb1eec4e4354f9b3ba7db4d1` before and after every run below,
digest `fe2a8c9d…`, web `d49934ad…`. `build.mjs` is not part of the digest, and no emitted byte moved.

---

## 3. The five planted mutations, each with its quoted refusal

Every row runs against the **real** committed manifest, head, stylesheet and icons. Each mutation was
also run through the contract **as I found it** — all five were **admitted, 0 refusals**
(`p4-11-rows-before-after.log`): the full row table scores **46/51 before → 51/51 after**, with exactly
my five rows failing on the pre-edit contract.

**1. Drop `base-uri 'none'` from the meta CSP** — before: 0 refusals · after:

> `entry/index.html: the meta CSP must carry base-uri 'none' — it is what makes a <base> element parsed after it inert, and it is the only such fence on a host that serves this tree without a CSP header (found null)`

**2. Plant `<base href="/app/">` as the first tag of the head** — before: 0 refusals · after:

> `entry/index.html: the page declares a <base> element, which moves the base URL every relative URL resolves against — including ./manifest.webmanifest, so the install identity becomes whatever manifest lives at the new base. Measured in Chrome: a <base href="/app/"> placed before the meta CSP is honoured DESPITE base-uri 'none' in it, and Page.getAppId then answered the retired install's id. The shell has no <base> and must not acquire one (found "<base href=\"/app/\">")`

**3. Drop `viewport-fit=cover`** — before: 0 refusals · after:

> `entry/index.html: the viewport meta must carry viewport-fit=cover — without it every env(safe-area-inset-*) is 0px, so the --safe-* tokens the whole shell pads from collapse and the notch and the home indicator paint over it (found "width=device-width, initial-scale=1, interactive-widget=resizes-content")`

**4. A second viewport meta, differently spelled, before the canonical one** — before: 0 refusals · after:

> `entry/index.html: the viewport meta must appear exactly once in the head — a browser uses the FIRST one in tree order, whatever its spelling (found 2: "<meta NAME=VIEWPORT content='width=device-width, initial-scale=1'>", "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content\">")`

**5. Append a second `--bg: #ff0000` to `:root`** — before: 0 refusals · after: **3**, which is the
whole colour clause the brief named:

> `entry/manifest.webmanifest: theme_color is "#f6f5f2" but the stylesheet's light --bg is "#ff0000"; a window whose chrome does not equal the page's own background shows a seam`
> `entry/manifest.webmanifest: background_color is "#f6f5f2" but the stylesheet's light --bg is "#ff0000"; a window whose chrome does not equal the page's own background shows a seam`
> `entry/index.html: the light theme-color is "#f6f5f2" but the stylesheet's light --bg is "#ff0000"`

---

## 4. The Send-button regression fix, re-confirmed

Still present in `entry/styles.css`, untouched by me:

```css
.panel--conversation { overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }   /* 187 */
.timeline-hint      { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }  /* 197 */
@media (max-height: 32rem) { .timeline-hint, .timeline { padding-block: 0.25rem; } }            /* 804 */
```

Probe measurement **M8** is present (`test/mobile-probe.mjs:426`, `:477`, `:490`) and **still fails
against the pre-fix stylesheet**. The A/B tree is unchanged and still differs by the stylesheet alone —
`fix34/prefix-web/styles.css` = `e2285e66…` (phase 3), while `entry/styles.css`, `dist/web/styles.css`
and `dist/capacitor/styles.css` all = `83b8bb8f…`; `diff -rq` reports `styles.css` and nothing else.

| 320×568, 2× text, insets on, empty log | pre-fix (`p4-33`) | fixed (`p4-54`) | limit |
|---|---|---|---|
| «Отправить» bottom | **792.06** ✗ | **440.84** ✓ | ≤ 534 (`innerHeight` − inset-bottom 34) |
| composer bottom | **803.25** ✗ | **452.03** ✓ | ≤ 568 |
| last nav control bottom | **560** ✗ | **526** ✓ | ≤ 534 |

Pre-fix run: rc **1**, **13 of 133** recorded checks fail — M8 at both sizes (including the «Отправить»
check quoted above) and M5's dialog check at both sizes, the same 13 the phase-34 report records. Fixed
tree: rc **0**, 15 measurements, 133 checks, **0 failed**, driver
`Emulation.setSafeAreaInsetsOverride`, Chrome/154.0.8037.57. (133 recorded = 127 gated + 6 ungated
notes, the split the probe itself makes.)

---

## 5. The final command table

Every command from `work/maya-identity-consent/maya-chat-shell` unless stated. `rc` read from `$?` on
its own line.

| # | Command | Node | rc | Result | Log |
|---|---|---|---|---|---|
| B1 | `node build.mjs --check` (**before** my edits) | 22 | **0** | green start | `p4-00` |
| B2 | `node build.mjs --self-test` (**before**) | 22 | **0** | pwa contract 46/46 | `p4-01` |
| G1 | `node build.mjs` | 22 | **0** | 33 sources, `serving:` line printed, `dist/manifest.json` byte-identical | `p4-20` |
| G2 | `node build.mjs --check` | 22 | **0** | `fe2a8c9d…`, web `d49934ad…`, 30 per-file hashes equal | `p4-21` |
| G3 | `node build.mjs --self-test` | 22 | **0** | refuse 66/66, admit 23/23, coverage 31/31, guard 2/2, **pwa contract 51/51**, probes 8/8 | `p4-22` |
| G4 | `node build.mjs --typecheck` | 22 | **0** | PASS | `p4-23` |
| G5 | `node build.mjs --target=capacitor` | 22 | **0** | `capacitor proof: PASS (only net/endpoint.js differs; index.html differs only in digest path and connect-src; styles.css and every PWA asset identical)` | `p4-24`, `p4-56` |
| G6 | parity independent of `build.mjs`: per-file sha256 with the module directory normalised, `diff -rq`, `cmp` on each PWA asset | 22 | **0** | 37 files each; **only** `index.html` and `m/<D>/src/net/endpoint.js` differ; manifest, styles and all four icons byte-identical | `p4-57`, `p4-59` |
| G7 | `node --test conformance.test.mjs test/*.test.mjs` | 22 | **0** | 346 tests, 339 pass, 0 fail, 7 skipped | `p4-25` |
| G8 | same | 24 | **0** | 346 / 339 / 0 fail / 7 skipped | `p4-26` |
| G9 | `node build.mjs --check` | 24 | **0** | same digests as Node 22 | `p4-27` |
| G10 | `node build.mjs --self-test` | 24 | **0** | pwa contract 51/51 | `p4-28` |
| G11 | `node build.mjs --typecheck` | 24 | **0** | PASS | `p4-29` |
| G12 | `node test/mobile-probe.mjs --url=http://127.0.0.1:8906/` (fixed tree) | 22 | **0** | 15 measurements, 133 checks, 0 failed | `p4-32`, `p4-54` |
| G13 | the same probe against the A/B tree (phase-3 stylesheet), `:8905` | 22 | **1** | 13 of 133 fail — M8 at both sizes, M5's dialog check at both sizes | `p4-33` |
| G14 | `npm run check:serving`, `MAYA_SHELL_SERVE_PATH` unset | 22 | **1** | `--serve-path must be an origin-relative path beginning with "/"` | `p4-40` |
| G15 | `MAYA_SHELL_SERVE_PATH=/app/ npm run check:serving` | 22 | **1** | refused, naming the live worker at `/app/service-worker.js` | `p4-41` |
| G16 | `MAYA_SHELL_SERVE_PATH=/maya-chat/ npm run check:serving` | 22 | **0** | `dry-run: nothing written` | `p4-42` |
| G17 | `bash docs/rebuild/evidence/maya-chat-first-ux/k5-exit-gate.sh` (repo root) | 22 | **0** | **K5 EXIT: PASS**; both planted-fetch mutations refused; `LINES NAMING document IN entry/: 1` | `p4-50` |
| G18 | `node docs/rebuild/evidence/maya-chat-first-ux/k15-bundle-census.mjs` (repo root) | 22 | **0** | successor authority 0, storage `never (ast+text)`, reflective `none`, `src: 29 files`, `entry: 2 files` | `p4-51` |
| G19 | the five mutations against the pre-edit and the current contract | 22 | **0** | 46/51 before → 51/51 after; each mutation 0 refusals before, refused by a named clause after | `p4-11` |
| G20 | `node build.mjs` then `node build.mjs --check`, after the capacitor build | 22 | **0** / **0** | digests unchanged, `dist/` restored to the web target | `p4-58`, `p4-60` |
| E1 | `fix4/base-probe.mjs` via `dev/serve.mjs` (header CSP present) | 22 | **0** | all four planted variants INERT — the header masks the meta | `p4-03` |
| E2 | `fix4/base-probe.mjs` via `fix4/static-noheaders.mjs` (no CSP header) | 22 | **0** | the `<base>` before the meta is **HONOURED** with the token intact | `p4-05` |
| E3 | the same, with a live `/app/manifest.webmanifest` declaring `id: "/app/"` | 22 | **0** | `Page.getAppId` = `http://…/app/` for three of four variants | `p4-07` |

**Not run, and why:** the CI job's `npm ci --ignore-scripts` in `maya-saas-backend` (an install that
needs the network; the toolchain it installs is already present and pinned, and `build.mjs` verified
TypeScript 5.9.3 on every run above). `node build.mjs` and `--target=capacitor` were run on Node 22
only; the runtime-sensitive gates (`--check`, `--self-test`, `--typecheck`, `node --test`) were run on
both and agree byte for byte.

**Processes.** Five servers were started across this phase (`dev/serve.mjs` on 8901 / 8904 / 8905 /
8906, `fix4/static-noheaders.mjs` on 8902 / 8903) and every one was killed in the same call that
started it. Confirmed at the end: `pgrep -f dev/serve.mjs` rc **1**, `pgrep -f static-noheaders.mjs`
rc **1**, `pgrep -f maya-shell-cdp-` rc **1**. Every headless Chrome is closed in a `finally`.

---

## 6. Files I changed

**Exactly one:**

* `maya-chat-shell/build.mjs` — 2088 → 2239 lines, +170/−19.

Nothing else in the repository was written. `git status` is the phase-34 list unchanged (eight modified
files, four untracked paths); `dist/manifest.json` was rewritten by the builds to the identical bytes
(`d174b373…` before and after), and `dist/web/`, `dist/capacitor/` and `dist/mobile-probe.json` are
git-ignored build output.

Written **outside** the repository, and not part of the change:
`work/.maya-program/mobile/fix4/{base-probe.mjs, static-noheaders.mjs, prove-rows.mjs, t.mjs,
build.before-phase4.mjs, build.as-i-found-it.mjs, phase4-build.diff, base-web/**}` and
`work/.maya-program/mobile/logs/p4-*`.

---

## 7. Residuals, stated rather than smoothed over

* **The viewport clause pins presence, not absence.** The four tokens must be there; an *added*
  `user-scalable=no` or `maximum-scale=1` — which would break the 2× text-scale reflow the whole shell
  is built for — is not refused. The brief named the four tokens and I kept to them rather than widening
  the contract on my own; closing it is a one-line addition to `VIEWPORT_TOKENS`'s neighbourhood.
* **The `<base>` refusal is a source contract.** It gates `entry/index.html`, so it stops the element
  being introduced in this repository. It cannot stop a host or relay injecting one into the served
  HTML afterwards; against that, the header CSP is the fence, and §1b shows it works.
* **The dark-scheme scope.** `rootBlocks` reads the light token from top-level `:root` blocks and the
  dark one from `:root` inside `@media (prefers-color-scheme: dark)`. A `:root` nested in some *other*
  at-rule — say `@media (max-height: 32rem)` — would apply in the light scheme at that size and is
  still not read. `entry/styles.css` has exactly two `:root` blocks, one per scope, so nothing is missed
  today; the limit is written down rather than presented as complete.
* **The keyboard behaviour `interactive-widget=resizes-content` buys is still not proven on a device.**
  Finding 6's correction stands: headless Chrome opens no keyboard, so M5 simulates the inset. Pinning
  the token means the build refuses its removal — not that a phone was observed resizing.
