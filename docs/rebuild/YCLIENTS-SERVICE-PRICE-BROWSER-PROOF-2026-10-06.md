# Pricing browser proof — functional evidence, UI acceptance blocked

Production baseline: `aba6bfe7f4ba2d2b0fc8975c5d27c4db828d9ced`.
The authorized serial local browser run completed at 17:41 UTC on 2026-10-06.
[Evidence manifest](evidence/yc-service-pricing-browser-20261006/manifest.json),
[sanitized actual network](evidence/yc-service-pricing-browser-20261006/network-sanitized.json)
and [state progression](evidence/yc-service-pricing-browser-20261006/state-progression.json)
record three actual Chromium flows, with real UI email login, HTTP, auth, Action
Engine and owned Postgres. Only model decisions, email delivery and CRM transport
were synthetic. No fixture response continuation or injected session was used.

- Confirmed: visible 2,000 → 2,500 RUB, detail opened, one PATCH after explicit click,
  full non-price field preservation, SUCCEEDED and exact linked authoritative receipt.
- Reject: rejected approval, zero PATCH, no mutating AE execution.
- UNKNOWN: the provider applied one PATCH then lost the response. The AE stayed
  UNKNOWN after repeat click, reload and fresh UI login; no second write or false Done.

These are three manually driven browser scenarios, not three automated Jest tests.
The one passing Jest test establishes clean completion of the long-running harness.
Independent read-only review checked all eleven state snapshots, provider events,
three Chromium traces and screenshots and agrees with the bounded functional result.

**UI acceptance remains blocked.** Screenshots expose a pending-looking card with
active confirmation controls after confirmed/rejected/UNKNOWN outcomes, an UNKNOWN
explanation overwritten by generic unavailable on repeat click, concatenated risk
metadata and serif fallback. The parent explicitly requested these fixes and narrow
regressions, then a fresh actual browser run. Fix preparation may proceed while main
owns the heavy slot; this evidence is retained as the pre-fix checkpoint.

The provider GET recovery sentinel restored fixture availability, but no additional
application CRM GET occurred (`reads_after_patch` stayed 1). This run does not qualify
canonical read recovery. Reload required fresh UI login and restored text warnings,
not old approval cards. No real-provider/model, mobile/Safari or release claim follows.

The first harness boot failed because Jest did not support a dynamic import callback.
It failed before UI/business execution, was retained, and was repaired to ordinary
static imports. The successful attempt used the same built production assets and
preserved database. All owned services and browser sessions are stopped; the database
and raw evidence remain. Raw auth traces/mailbox stay outside committed evidence;
only sanitized network fields and raw-file hashes are published.

The following procedure is retained for reproducibility. A fresh run requires an
available heavy slot and a new evidence directory; never overwrite this checkpoint.

## Resources and isolation

- One Chromium session at a time, one Jest worker hosting the actual `AppModule`,
  one synthetic HTTP CRM server and one same-origin relay. No response interception
  or fixture envelopes in the browser. The model alone is scripted and identified
  in the run metadata; its numeric business arguments come from current chat binding.
- Existing owned Postgres data directory: `../pricing-proof-pg`, loopback port
  **56347**, user `pricing_proof`, `shared_buffers=16MB`, `max_connections=24`.
  Use a **new** database `maya_widget_gate_proof_service_price_browser_20261006`.
  Preserve the previous HTTP database and every previous evidence directory.
- React relay **127.0.0.1:56541**; actual backend and synthetic provider get separate
  owned ephemeral IPv4 loopback ports. No existing stand or shared port is reused.
- Fresh evidence directory `output/playwright/service-price-live-<UTC-id>` beneath
  this isolated checkout. Never reuse a directory with `ready.json`/carrier evidence.
- Node v24.15.0, Postgres 16.14, `npx`, cached Playwright CLI 0.1.22 and cached
  Chromium 1234 were found locally. No package install or browser download is needed.
  Cap the Jest process at 3072 MB; actual peak memory has not been measured.

## Start sequence after the slot is released

Run from `/Users/stanislavmosin/Documents/Codex/2026-10-06/task/service-pricing`.
The commands below describe the run sequence; recorded logs and manifest establish what ran.

```sh
pricing_run="$PWD/output/playwright/service-price-live-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$pricing_run"

# Build only this candidate with the already available dependency tree.
ln -s /Users/stanislavmosin/Documents/Codex/2026-10-05/task-3/client-readiness/maya-carrier-react/node_modules maya-carrier-react/node_modules
(cd maya-carrier-react && node build.mjs --target=web) > "$pricing_run/react-build.log" 2>&1

# Start only our stopped cluster. If already running, inspect ownership; do not stop another process.
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D ../pricing-proof-pg -l "$pricing_run/postgres.log" start
/opt/homebrew/opt/postgresql@16/bin/createdb -h 127.0.0.1 -p 56347 -U pricing_proof maya_widget_gate_proof_service_price_browser_20261006

# No .env/.env.local is permitted in the backend working directory.
(cd maya-saas-backend && test ! -e .env && test ! -e .env.local && env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://pricing_proof@127.0.0.1:56347/maya_widget_gate_proof_service_price_browser_20261006 node node_modules/prisma/build/index.js migrate deploy) > "$pricing_run/migrations.log" 2>&1
```

If the new database already exists, retain it, inspect its provenance and record
that fact. Never drop/reset/truncate it to obtain a clean run. Each harness start
creates distinct synthetic tenants. The harness checks the exact database/port/user
in addition to the existing proof-database guard.

The opt-in `*.browser-spec.ts` harness is excluded by the normal live-test regex.
Its explicit launch uses the existing widgets-live environment scrubber and real
Jest evidence owner. Run it in a separate foreground process (the command waits
for `STOP`, at most 30 minutes). It writes `ready.json` only after real HTTP and all
three synthetic owners are ready:

```sh
(cd maya-saas-backend && env -i PATH="$PATH" HOME="$HOME" NODE_OPTIONS=--max-old-space-size=3072 DATABASE_URL=postgresql://pricing_proof@127.0.0.1:56347/maya_widget_gate_proof_service_price_browser_20261006 WIDGET_GATEWAY_PG=required WIDGETS_EVIDENCE=1 WIDGETS_EVIDENCE_DIR="$pricing_run" node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --runInBand --testRegex='widgets-live/service-price-browser[.]browser-spec[.]ts$' --runTestsByPath test/widgets-live/service-price-browser.browser-spec.ts) > "$pricing_run/harness.log" 2>&1
```

Once `ready.json` exists, start the current React server in a separate process:

```sh
node maya-carrier-react/test/service-price-browser-serve.mjs --run-dir="$pricing_run" > "$pricing_run/carrier.log" 2>&1
```

It reads only the owned backend address, serves `maya-carrier-react/dist/web`
unchanged, records asset hashes in `carrier-ready.json`, and uses the existing
relay for real `/api/*` requests. It has no mock mode or browser auth injection.

## Browser operation and acceptance

Use the Playwright CLI skill and a fresh named session for each case, closing each
before opening the next. Run the CLI from the evidence directory. Disable update
checks and use the cached CLI to avoid network installation:

```sh
pricing_cli=/Users/stanislavmosin/.npm/_npx/31e32ef8478fbf80/node_modules/@playwright/cli/playwright-cli.js
cd "$pricing_run"
cat > playwright-cli.json <<'JSON'
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "headless": true,
      "executablePath": "/Users/stanislavmosin/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    },
    "contextOptions": { "viewport": { "width": 1280, "height": 900 } }
  }
}
JSON
NO_UPDATE_NOTIFIER=1 node "$pricing_cli" --session=pricing-confirmed open http://127.0.0.1:56541 --config="$pricing_run/playwright-cli.json"
NO_UPDATE_NOTIFIER=1 node "$pricing_cli" --session=pricing-confirmed snapshot
NO_UPDATE_NOTIFIER=1 node "$pricing_cli" --session=pricing-confirmed tracing-start
```

Use fresh snapshot refs for `click`/`fill`, resnapshot after transitions, and save
screenshots, console/network output and traces. Never inject a bearer/session,
call an approval API from browser evaluation, modify a response or replay a saved
envelope. Read-only DOM inspection can verify visible wording. The browser must
exercise the displayed controls.

The current React screen has email-code login, not a password form. Click
«Войти по email», enter the case's synthetic email from `ready.json`, request a
code, read the generated code from the harness `mailbox.json`, fill «Код из письма»
and click «Войти». Email start/verify, one-use code consumption, tenant membership
and session minting run through the actual backend. Only outbound delivery is
captured locally; no real email is sent. On reload, repeat UI login if the runtime
requires it, without injecting prior tokens.

The current carrier keeps the session in memory. Reload can require UI sign-in
again; conversation restoration restores text, not old widgets/approvals. The
UNKNOWN reload claim is therefore limited to no false success and no second PATCH,
with the durable UNKNOWN verified in Postgres. Do not claim the transient outcome
card was restored or invent a repeat button when no such control is displayed.

| Case | UI path | Required server evidence |
|---|---|---|
| Confirmed | Actual owner login → explicit price intent → visible service/company and old/new RUB prices → detail and close → approve → confirmed receipt wording | No PATCH before click; one PATCH afterward; exact preserved provider fields; one SUCCEEDED AE execution; actual approval/receipt IDs and readback |
| Reject | Fresh separate owner login → same bounded proposal → reject | Exact approval rejected; zero provider writes and no mutating AE execution; no confirmed wording |
| UNKNOWN | Fresh separate owner login → proposal → approve against fixture which applies PATCH then loses response → unconfirmed wording → reload and reauthenticate if needed | Exactly one PATCH, AE remains UNKNOWN, no successful receipt; reload/read recovery and any displayed repeat control must not send a second PATCH or show success |

Before/after each phase, request the harness's read-only `SNAPSHOT` and retain its
numbered state snapshots. For UNKNOWN, after capturing the lost-response state,
create `RECOVER_UNKNOWN_PROVIDER` to restore only the synthetic GET transport;
then reload and verify no false success or second PATCH. Inspect read counters before
claiming that application recovery actually read the now-readable provider state. On completion create `STOP`; the harness writes final
state and closes its backend/provider. Harness completion proves observed server
state, not browser acceptance by itself. The final browser report must combine
screenshots, live network trace, exact backend/provider evidence and asset hashes.

Required screenshots: signed-in actual chat, exact pending diff, detail, confirmed
result, rejected result, UNKNOWN result, and UNKNOWN after reload. Check console
and network failures, layout, readable values and usable controls in the screenshots.
Any failure is retained with its first observed state; do not relabel it as passed
or erase the evidence before a repair and fresh attempt.

## Shutdown and evidence limits

Close only the named pricing browser sessions and this relay process. Stop the
owned cluster after the harness exits:

```sh
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /Users/stanislavmosin/Documents/Codex/2026-10-06/task/pricing-proof-pg -m fast stop
```

Remove only the temporary React `node_modules` symlink, never its target. Preserve
the browser proof database and run directory. Report slot free to the parent.
Do not push, merge, deploy, call a real model/provider, change the existing stand,
or expand service create/edit/archive during this acceptance.

The completed run passed the React build/runtime import gate and deployed committed
migrations to the new proof database. It retained the initial startup failure and
completed the corrected harness. Current outcomes and blocking UX findings above
supersede the original preparation-only status; see the evidence manifest for hashes.
