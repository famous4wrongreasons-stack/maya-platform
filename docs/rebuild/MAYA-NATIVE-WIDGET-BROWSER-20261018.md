# React booking lifecycle with AR-1 and native transport — 2026-10-18

**LOCAL SYNTHETIC PROOF. NOT A RELEASE CERTIFICATE OR SERVER EXECUTION AUTHORIZATION.**

Application candidate: `6356db1875545337e34b6c8888b7ca858bb64361`.
Profile: `closed-input.no-handoff.no-price-goods@1`.
Parent tooling checkpoint: `b9a088a02cf17ea0f285f148e0c2bb9d353ebffc`.

This continues [native move/cancel UNKNOWN reconciliation](MAYA-NATIVE-LIFECYCLE-UNKNOWN-20261018.md).
It joins the existing React browser lifecycle probe to the existing diagnostic
native HTTP/provider harness and signed canonical AR-1 admission. It does not
introduce a second application, release writer, booking owner or UI implementation.

## Combined path

The real React payload is built from a small Git-object-verified export of the
exact candidate. Its headless runtime and backend contract types come from the
same candidate. The build gate, type checking and source-bound output verification
must pass before the browser starts. No product file is rewritten.

The existing browser probe uses a real canonical debug-email login for a generated
synthetic client. It submits four utterances and clicks six widget actions. Model
interpretation alone is scripted. The backend resolves current source/authority,
emits the widgets and executes their existing owners. The YCLIENTS adapter uses
real fetch through the bounded native transport to a loopback HTTP provider with
actual disposable PostgreSQL persistence.

The eleven synchronized browser/backend checkpoints cover:

1. Initial availability and exact 17:00 selection.
2. Create preview, with zero bookings or booking executions before confirmation.
3. Explicit create confirmation, producing exactly one provider record.
4. Own-appointments SCHEDULE and move preview showing service, master, previous
   17:00 and proposed 18:00 in Europe/Moscow, before any PUT.
5. Explicit move confirmation, with exactly one PUT and the same appointment ID.
6. Own-appointments SCHEDULE and cancel preview, before any DELETE.
7. Explicit cancel confirmation, with exactly one DELETE and no replacement booking.
8. A second real login after the canonical resend interval and restored chat outcome.

Three concurrent submissions of each already consumed confirmation are refused
by the canonical widget owner. The nine refusals cannot create another booking
execution or provider mutation. Provider counts remain one POST, one PUT and one
DELETE, with zero proxy refusals hiding an attempted redispatch. Each successful
booking action has one Action Engine execution attempt. Appointment, verified
client, branch, provider record, service and master stay correlated.

This browser mode also retains the six server controls: healthy HTTP lifecycle,
create UNKNOWN after a durable commit, and invalidation by AR-1 revoke, allowlist
removal, candidate replacement and expiry. It does not replace the separate
move/cancel UNKNOWN suite with a UI claim.

## Fresh result

Both runs use the same runner/probe bytes recorded in the receipt:

- Combined suite: **7 PASS / 0 FAIL / 0 SKIP**, including the browser lifecycle
  and six server controls. Eleven browser checkpoints, two canonical logins,
  four chat requests and six widget intents passed.
- Replays: **9/9 refused**, with one create, one move and one cancel in the
  synthetic provider ledger. No duplicate effect or proxy refusal masking a retry.
- Separate lost-response regression: **10 PASS / 0 FAIL / 0 SKIP**.
- React build/type checks and source-bound artifact verification: **PASS**.
- External network fence: **PASS**, attempted TEST-NET connection refused by OS.
- All four disposable PG clusters stopped and removed; **322,152,626 bytes**
  reclaimed. Logs, hashes and receipts retained. No owner data was involved.

The seven and ten tests overlap in their server controls; they are two run results,
not seventeen distinct cases. These receipts qualify this diagnostic unit only.

## Test environment corrections

Two failed diagnostic runs are preserved as failures, not counted as passing proof.

- The first build found missing TypeScript standard-library files in an older
  dependency directory. A separate small dependency directory was installed using
  the candidate's exact lockfile and `npm ci --ignore-scripts`. No owner-deleted
  files were restored. Required package versions and lockfile bytes are checked.
- The second run passed backend controls and the React build, but Chrome's renderer
  could not initialize its nested macOS sandbox inside the runner's existing
  sandbox. A minimal CDP reproduction reached target creation, then timed out on
  `Runtime.enable` and Chrome exited with SIGTRAP; stderr recorded sandbox
  initialization failures. This occurred before the first application login.

The diagnostic runner now adds **one test-only `--no-sandbox` launch flag** to a
disposable copy of the existing browser probe. Its original and executed hashes
are recorded separately. All application/carrier/runtime files remain exact Git
bytes. The same minimal renderer reproduction then succeeds.

The enclosing OS loopback-only network fence remains active for Chrome and all
test processes. A separate startup check requires an external TEST-NET TCP attempt
to fail with OS `EPERM`. The existing dead proxy, DNS restriction, fresh private
browser profile and finite request guard also remain. No user's browser profile
is used. **Chromium's own nested sandbox is not qualified by this local run**;
this flag is neither shipped to Maya nor applied to the installed app/browser.

The longer browser-mode suite budget accounts for its added UI case and the
existing one-minute re-login interval. Product timeouts and resend limits are
unchanged; waiting longer was not used to solve the renderer crash.

## Receipts and reproduction

Fresh counts, exact runner/probe and application hashes, browser checkpoints,
build receipts and known limitations are in
[RECEIPT.json](evidence/maya-native-widget-browser-20261018/RECEIPT.json).

```sh
node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --source /absolute/path/to/verified-6356-export \
  --repository /absolute/path/to/development/repository \
  --output /absolute/path/to/new-output \
  --create-egress --lifecycle-ae --release-admission --lifecycle-browser \
  --carrier-dependencies /absolute/path/to/isolated-carrier/node_modules
```

The export must include `maya-saas-backend`, `.github/workflows`,
`maya-carrier-react` and `maya-chat-shell` from the pinned candidate. The carrier
dependencies must have an adjacent matching `package-lock.json`. Frontend build
outputs are written only to the per-run overlay. The ordinary owner checkout
and its 1,333 intentional deletions remain untouched.

## Remaining boundary

This is desktop Chromium with synthetic interpretation/provider data, not paid
model acceptance, real YCLIENTS acceptance or iPhone acceptance. No installation
or server change is performed. The ordinary app, source resolver, confirmation,
Action Engine, native adapter, current release access and widget replay checks
are real code; signing authority and certificates remain artificial test fixtures.

External-effects admission for the native transport is still a labelled synthetic
callback. Real operator/transport wiring, bounded ordinary AiCore transport,
actual server pre-state and rollback, and the separate operational authorization
remain outstanding. Widget display of UNKNOWN is not newly proved by the healthy
browser flow. The interrupted full V6 mutation corpus still has no final receipt.
No full certification or production/phone readiness is inherited from these tests.

Real model/provider calls, production/Beget changes, owner-database/Keychain access,
and iPhone changes are zero. All migration/grant writes are confined to new private
disposable databases. This unit does not push Git changes.
