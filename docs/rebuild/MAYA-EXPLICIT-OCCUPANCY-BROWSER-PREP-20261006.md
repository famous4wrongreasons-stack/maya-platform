# Explicit owner Occupancy — local browser acceptance preparation

Historical preparation below. The parent later assigned the slot; see [executed browser result](MAYA-EXPLICIT-OCCUPANCY-BROWSER-RESULT-20261006.md) for PASS, all attempts and cleanup.

Status: **PREPARED; BROWSER ACCEPTANCE NOT RUN**. Parent accepted the HTTP/PG
checkpoint at `4b14da33f96bdd43788b2d1c63dda01054f33c3b` and requested this narrow
finishing check. Heavy slot remains with main, then pricing. No backend, PostgreSQL,
React build or Chrome was started during this preparation. This is not C10 completion
or real model/provider acceptance.

## Ready command and resources

After parent explicitly assigns the heavy slot, run from this isolated worktree:

```bash
cd /Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-explicit-occupancy/maya-saas-backend
node scripts/c9-occupancy-proof.mjs --run --browser --output=/tmp/maya-c9occ-browser-20261006-attempt1
```

The output directory must not exist. Each later authorized attempt needs a fresh
directory; previous evidence is retained. Without `--run`, the command only prints
the preparation message and opens no listeners.

Required local resources, already present: Node 24.15.0, installed workspace
dependencies, PostgreSQL 16 binaries at `/opt/homebrew/opt/postgresql@16/bin`, and
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. No download or
external service is required. The preparation did not install packages.

The driver serially creates a private temporary PG cluster and unique
`maya_widget_gate_proof_c9occ_*` database, deploys committed migrations, builds the
actual React web payload with `node build.mjs --target=web`, and invokes one
`--runInBand` browser stage in the existing HTTP probe. The browser stage owns one
Nest HTTP app, one same-origin static/API relay and one headless Chrome process
with a new private profile and two separate browser contexts. PG, HTTP, relay and
CDP use ephemeral IPv4 loopback ports; shared ports 5432/55611 are refused by guards.
Normal child/browser/HTTP/PG resources are closed on success or failure; raw PG
data and evidence remain local for inspection. Only the owned child/profile/cluster
may be cleaned up.

Allow several minutes: a real email login cooldown contributes at least 61 seconds.
The child watchdog is 180 seconds, Jest test budget 240 seconds, and outer browser
stage budget 300 seconds. Build stages have separate 180-second budgets. These are
timeouts, not measured performance claims. Loopback permission is needed when the
slot is actually used; the prior HTTP gate required sandbox escalation for listening.

## Actual route and observations to be accepted

The existing React `SignIn` and `ChatScreen` run from `dist/web`; the existing
`createDevServer({api: ...})` proxies the real Nest HTTP app. There is no mock API
mode, browser response fulfillment, storage token seed, or rendered UI fixture.
Fixtures supply only synthetic tenant/owner/source rows and the CRM adapter edge,
using the same C5 lifecycle and C9 persistence owners as the accepted HTTP proof.

The local ConfigService enables the existing email debug provider. The browser
enters the synthetic email, reads `debug_code` from its real `/auth/email/start`
response, then enters the code through the visible UI. No email is sent. Tokens,
codes, auth bodies and raw request bodies are excluded from published evidence.

1. Enter “Проверь окна после отмен” in the actual composer. Match the complete
   new assistant DOM message to `body.reply`, require one coherent answer and saved
   version 1, and check actual HTTP evidence plus persisted run/revision/receipt.
2. Reload. The approved memory-only session must return to sign-in. Honor the
   real email cooldown, log in again through UI, restore the stored answer and the
   existing notice that data and availability must be checked again. History must
   create no new C9 run or CRM reads.
3. Emulate a network disconnect, submit the same explicit wording as a new turn,
   and observe the real “Нет связи” failure. Confirm no new run/CRM reads. Reconnect
   and press the existing retry once; verify the same request ID, one fresh answer,
   a new persisted run, and one bounded availability read pair.
4. Suspend that actual fixture membership through the fixture DB client. The next
   UI request must receive real HTTP denial, end the session and hide the composer.
   No additional C9 run or CRM read may occur.
5. In a separate clean context, log in as the owner of a historically expired
   fixture opportunity. Require a complete visible EXPIRED response, only no-action,
   zero fresh CRM reads and no active source refs. No clocks or expiry columns are
   replaced at the browser boundary.

Every checkpoint also compares appointment/opportunity/task/event state and checks
recorded application writes for business mutations/outbound effects. The model edge
throws on use; the synthetic CRM adapter rejects every method outside the two reads.

## Network and evidence boundaries

Before page navigation, CDP Fetch request-stage interception admits only the exact
local carrier origin, built static assets, email start/verify, refresh, conversation
history, and the exact explicit owner chat wording. Voice, widget intents, other
business endpoints, foreign origins/ports and credentialed URLs are refused. The
guard only continues or fails requests; it never supplies a response. Service-worker
bypass and page WebSocket blocking are enabled. Chrome starts with external DNS
resolution blocked and a fail-closed proxy for non-loopback background traffic.

Evidence will include driver stage logs and manifest, backend `browser.json`, and
`output/playwright/browser.json` plus screenshots for available, restored history,
offline, reconnected, revoked and expired. Screenshot and DOM evidence still require
inspection after the real run. A prepared assertion is not a passing observation.

## Light verification and independent review

- Eight pure tests PASS: driver environment/owned DB admission, original restart
  plan, new browser plan, synthetic edge refusal, and request-stage browser guard.
- JavaScript syntax checks, targeted TypeScript transpilation, targeted ESLint and
  diff whitespace check PASS. Full build, whole-backend typecheck and browser/PG
  execution are deferred to the heavy slot.
- Independent review identified and preparation corrected: EXPIRED has empty active
  refs; a restored answer cannot satisfy the new-response DOM assertion; UI relogin
  must respect the real email rate limit; Chrome must be tracked from spawn so an
  early cancellation cannot orphan it; evidence-write failure must still clean up.
  Final independent read-only recheck found no remaining preparation blockers;
  it explicitly does not certify browser/HTTP/PG acceptance.

Remaining blocker: **parent heavy-slot assignment**, followed by actual execution,
screenshot inspection and qualified evidence review. Existing HTTP/PG acceptance
remains in `MAYA-EXPLICIT-OCCUPANCY-HTTP-PG-RESULT-20261006.md`. No production code,
schema, autonomy policy, background initiator or website/booking work is changed by
this preparation.
