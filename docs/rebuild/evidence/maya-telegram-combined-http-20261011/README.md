# Telegram → personal Client/history through the actual local relay

Executed source: `0157b600fcfdf4edd9e38d4c5e4fe5b40aa794e7`.
Parent: `f256ea716d1bb03714933ee611607e9be4c5a0b8`.
Branch: `codex/maya-local-crm-setup-20261010`. Date: 2026-10-11.

This is synthetic local acceptance preparation after C9, not release
certification or acceptance on the owner's retained database.

## What changed and what is proved

Previously, real backend/PostgreSQL browser tests fulfilled local app/API traffic
through CDP, while the actual launcher callback had a separate synthetic-backend
proof. The browser now uses emitted React/runtime, the existing
`createReadWebServer`, its real canonical HTTP relay, and AppModule against an
isolated migrated PostgreSQL database in one run. CDP continues actual loopback
requests instead of fulfilling them. Only the provider authorization page and
external Telegram/CRM/model responses remain synthetic.

The response observer collects assertions without changing response bytes or
issuing a second request. Actual callback requests are cross-site GET document
navigations. The browser starts AChat, renders three exact personal-context
replies and restores their single persisted conversation after relogin.

Both a synthetic client and an existing synthetic business owner pass. The owner
uses password entry → canonical A23 account link → separate fresh Telegram login.
`TENANT_OWNER != CLIENT`; exact personal Client authority remains separately
resolved. The browser supplies no Client/role authority fields.

History configuration now goes through existing governed-settings HTTP read/CAS
write/reread; consent uses its canonical authenticated HTTP endpoint. The fixture
still invokes the existing reconciliation service explicitly. It is **not** a
qualified operator history-import endpoint or a side effect of login.

Only three test/runner files changed. Backend product sources, schema/migrations,
runtime source, React presentation, iOS and canonical callback are unchanged
from the parent; exact tree comparisons are in `provenance.json`.

## Fresh results on the committed source

| Surface | Result |
| --- | --- |
| Initial Telegram binding/history/browser HTTP + PostgreSQL suite | 78 PASS |
| Successor binding suite | 19 PASS |
| Combined total | **97 PASS / 0 FAIL / 0 SKIP**, 2 suites |
| Browser client / business-owner scenario checkpoints | 14 / 19 PASS, contained within the suites above |
| Local launcher/environment/profile/resume unit tests | 93 PASS / 0 FAIL |
| Targeted callback mutation programme | 25 green baseline; **8/8 killed** by assertions; 25 green restored |
| `typecheck:widgets-live` | PASS |
| Scoped ESLint for the changed TypeScript proof | PASS |
| Current React build and payload verification in both browser runs | PASS |
| Source unchanged during final run; no working patch | PASS |
| Both browsers/listeners and isolated PostgreSQL stopped | PASS |

The unscoped exploratory `tsc --noEmit --incremental false` failed with 369
diagnostics. This is not the repository's scoped typecheck. A compiler-host
comparison substituted the only changed TypeScript file with its exact parent
blob while holding installed/generated dependencies constant: both versions have
the same 369 file/code/message diagnostics and digest. Positions were excluded
from that comparison. This broader check is **not PASS**; no unrelated fixes or
silent waivers were made. The comparison receipt is included.

An initial exploratory browser run exposed a test observer mistake: Node's
`getHeader()` does not recover headers supplied inline to `writeHead()`. The
observer now reads those header arguments without rewriting them. Final receipts
above are from a fresh committed run after that correction, not that exploration.

No full backend/runtime/carrier release programme was rerun for this test-only
change. Earlier full-suite receipts are historical and are not relabelled.

## Evidence and boundaries

`proof-summary.json`, both browser summaries, mutations and type comparison are
repository-safe projections. `receipt-manifest.json` records the hashes and sizes
of the underlying local receipts; raw Jest results and logs are not copied.
No real customer records, tokens, callback query values or private keys are
included. Browser response/conversation references are hashed synthetic values.

Network isolation uses CDP, a deny proxy/resolver and synthetic backend fetches;
it is not an OS-level packet capture claim. External requests dispatched by the
browser are zero. The test web server runs in diagnostic mode; its real runtime
admission policy is **not** enabled or certified by this fixture.

**READY FOR LIVE PRIVATE-READ LAUNCH: NO.** The finite retained-owner launch mode
remains to be implemented and qualified; original setup/catalog modes stay
closed to Telegram and private history. See the consolidated
[live preparation](../maya-local-telegram-return-20261011/LIVE-PREPARATION.md).

No owner database start/write, real Telegram sign-in, YCLIENTS/model request,
OTP/SMS, deploy, grant, production migration, iPhone installation or push occurred
in this proof. A separately approved BotFather local registration attempt is
recorded in its own report; it is not a login proof.

## Reproduction

From `maya-saas-backend/`, on committed test sources with dependencies installed,
using fresh private output directories:

```sh
JEST_TELEGRAM_WITH_SUCCESSOR=1 node scripts/telegram-client-binding-proof.mjs \
  /private/tmp/maya-telegram-combined-new-run --browser
node scripts/local-telegram-return-mutations.mjs \
  /private/tmp/maya-telegram-return-mutations-new-run
npm run typecheck:widgets-live
```

The source hash capture includes the existing local launcher modules and browser
driver. Do not substitute the retained owner database or real provider responses
into this synthetic proof runner.
