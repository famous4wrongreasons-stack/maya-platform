# Local Telegram return — actual launcher boundary

Tested committed source: `573b4567b663e216f819233649e858735951dd82`.
Parent: `b3f1660e9119e348222d3feb3c6623d5ff906064`.
Branch: `codex/maya-local-crm-setup-20261010`.

This is local launch preparation after C9. It is neither a new release
certificate nor live owner Telegram/Client/history acceptance.

## Finding and repair

The earlier synthetic browser proof served the callback directly, bypassing the
owner launcher's web boundary. The actual launcher refused a cross-site provider
document return with HTTP 403. A direct callback received HTTP 404: the React
payload intentionally does not embed this separately owned edge artifact. Its
ordinary response CSP would also block the callback's inline script.

Before changing behavior, the existing handler was mechanically extracted into
`createReadWebServer`; the new tests reproduced both HTTP failures. The original
failure receipt is retained and hashed, not replaced by the final passing run.

The same launcher now serves the canonical callback bytes at exactly
`/oauth-callback.html`. It admits cross-site GET document navigation only for that
static page, with an exact local Host and no incoming authentication material.
Other paths, methods, subframes, fetch requests, foreign hosts/origins and bearer,
cookie or Telegram headers remain refused. The callback CSP permits only the
hashes of its fixed script/style; no external connections or arbitrary inline
script are admitted. Query values are neither reflected nor forwarded/logged.

Malformed and standalone returns use the canonical query eraser. Only the
existing parent-window pending-state check and backend can complete login.
Serving this static page does not enable Telegram, change an identity, broaden
the catalog profile, issue a session or access CRM. The callback and new handler
are included in the existing committed-source binding (2,154 distinct paths).

Backend product source/schema, runtime, React presentation, canonical callback,
release packaging and iOS source are byte-identical to the parent. Scope hashes
and the finite changed files are recorded in `provenance.json`.

## Fresh executed verification

| Surface | Result |
| --- | --- |
| Local launcher/profile/environment/transport/resume tests | 93 PASS, 0 FAIL |
| Actual emitted React/runtime + actual local HTTP relay/callback in Chrome | 30 checkpoints PASS |
| Full React carrier tests | 163 PASS, 0 FAIL |
| Release packaging tests | 18 PASS, 0 FAIL |
| Canonical PWA/Capacitor payload verification | PASS, 8 files; approved endpoint/HTML substitutions only |
| Targeted callback mutations in private committed-source copy | 25 green baseline, 8/8 killed, 25 restored |
| Exact committed source binding | PASS; callback/handler included, no duplicate paths |

The browser now uses the same `createReadWebServer` as the owner launcher. It
records actual cross-site/navigate/document request metadata without callback
queries. AChat opens once with no parent reload. Decline, foreign state, forged
native event/message, manual close and standalone/reload paths remain refused.
Its backend and provider replies are synthetic; this does not exercise the
real backend admission policy or prove Telegram's current provider headers.
Browser/listeners were stopped. Network isolation is CDP interception plus deny
proxy/resolver, not an OS packet capture claim. Native installation is not tested.

Mutations restore cross-site refusal, block the callback script, admit a foreign
Host or authentication headers, admit a subframe or non-GET, broaden the path,
and substitute callback bytes. Each fails an expected assertion, not a syntax,
import or timeout failure. The working checkout is never mutated by the runner.

Full backend/runtime suites were not rerun for this launcher-only change.
The preceding 9,601-pass backend receipt remains historical evidence for its
unchanged product sources, not a fresh final release certification.

## Public read-only preflight

At `2026-10-11T15:01:39.738Z`, two unauthenticated static GETs found:

- `https://mayaos.ru/oauth-callback.html`: HTTP 200, still different from current
  canonical callback bytes. Exact expected/observed SHA-256 are in the receipt.
- `https://mayaos.ru/maya-chat-shell/`: HTTP 404 at this path.

Neither observation establishes overall backend health, current production SHA,
BotFather configuration or whether another application URL works. No production
files/configuration were changed.

## Live boundary

**READY FOR LIVE PRIVATE-READ LAUNCH: NO.** See
[LIVE-PREPARATION.md](LIVE-PREPARATION.md) for one consolidated prerequisite list.
The existing setup/catalog launch modes still disable Telegram and client/history
access; do not silently broaden them or reuse an expired model/CRM allowance.

No owner database start/write, real provider login, model call, YCLIENTS call,
OTP/SMS, deploy, grant, migration, iPhone install or push occurred in this unit.

## Reproduction

From `maya-saas-backend/`:

```sh
node --test scripts/local-telegram-return.test.mjs \
  scripts/local-yclients-read.test.mjs scripts/local-yclients-read-profile.test.mjs \
  scripts/local-yclients-read-resume.test.mjs scripts/local-owner-chat-policy.test.mjs \
  scripts/local-onboarding.test.mjs scripts/local-onboarding-environment.test.mjs
```

The finite mutation runner is `node scripts/local-telegram-return-mutations.mjs
/private/tmp/maya-local-return-new-run` and requires committed, clean sources.
From `maya-carrier-react/`, build the web payload, then run
`node test/telegram-popup.browser.mjs /private/tmp/maya-telegram-browser-new-run`.
Use a fresh output directory. `npm test`, `npm run test:release`, and
`node tools/release.mjs verify` cover carrier and payload checks.
