# Bounded retained-owner Telegram admission

Executed candidate: `c06745c8dea79a49933ae3c53c18799d9e4e3027`.
Parent: `8ccdb9e734895f477aa90f18899bd7b7b38c0749`.
Branch: `codex/maya-local-crm-setup-20261010`. Date: 2026-10-11.

This is local acceptance preparation after C9, **not release certification**.
The existing retained-database launcher now has a separately admitted finite
`owner_telegram_personal_read_v1` mode. Product auth, Client identity, Action
Engine, schema, React, runtime and callback sources are unchanged from the
parent; exact comparisons are in `provenance.json`.

## Scope and existing owners

The mode only admits the selected existing owner's password session, canonical
A23 Telegram account link, separate fresh Telegram login, and current local
personal profile/appointment projections. The canonical initial Client resolver
still requires fresh cryptographically verified Telegram phone evidence and a
unique current canonical CRM match. No alternate identity writer was introduced.
`TENANT_OWNER != CLIENT`; no revoked episode is reactivated or replaced by this
initial-only route.

The local plan binds the exact candidate/source hashes, previous retained-state
pins, account, tenant, branch, company, callback origin and Telegram client ID.
Its one-use runner/child claims cannot be silently retried. The plan is a local
execution bound, not a platform grant or user credential. Real application
authentication and current membership remain mandatory.

The network guard permits only the canonical Telegram token exchange/JWKS and,
after verified selected-owner login, the exact company's canonical paginated
client-registry read. Exchanges carry the canonical state, code, verifier and
redirect. Each completion is serialized and bounded; current authority is read
again around provider responses. Abort, expiry, oversized replies, changed
authority, replay, foreign company/tenant/account and source substitution fail
closed. Diagnostics contain closed stages/counters only.

Bounds: session at most 10 minutes after readiness, immutable execution window
at most 30 minutes, four OAuth starts, 128 total provider calls, 32 registry pages
of 200 records per initial resolution, two-minute completion and 20-second fetch
deadlines. An incomplete registry cannot prove uniqueness. Larger registries or
provider refusal therefore leave the binding unconfirmed, never partly accepted.

The shared saved-owner read-only checks were extracted into `local-owner-scope`;
the old catalog/model mode reuses the same checks without importing that model
broker into the new guard. Old setup/model ingress remains closed to this mode.

## Fresh results on the committed candidate

| Surface | Result |
| --- | --- |
| Initial/history/browser HTTP + isolated PostgreSQL | 78 PASS |
| Existing successor verification regression suite | 19 PASS |
| New local owner restrictions with real AppModule/PG and synthetic wire | 7 PASS |
| Combined HTTP/browser suite | **104 PASS / 0 FAIL / 0 SKIP** |
| Local launcher/environment/profile/resume units | **132 PASS** |
| New restriction mutations | 38 green baseline; **11/11 killed**; 38 green restored |
| Existing callback mutations | 25 green baseline; **8/8 killed**; 25 green restored |
| Actual compiled child + IPC + web relay | **10/10 checks PASS** |
| Scoped `typecheck:widgets-live` and changed TS ESLint | PASS |
| Current React build/hash verification in browser probes | PASS |
| Source unchanged, isolated DB/browser/child cleanup | PASS |

The binary proof uses the actual compiled AppModule, strict child environment,
private single-use plan and normal local web relay. A fresh synthetic database
is created/migrated and seeded only for this test. macOS sandbox-exec restricts
the child to that database and loopback HTTP listener. Password login, canonical
Telegram link start, forbidden routes, permit revocation, child replay refusal
and clean shutdown pass with **zero provider dispatches**. It does not claim to
test real token exchange or the entire owner-TTY resume command.

The AppModule proof tests signed synthetic Telegram and synthetic CRM replies
through the actual verifier and adapter. It proves link → fresh login → exactly
one personal binding, literal empty profile/history, no consent/import writes,
foreign identity/tenant refusal, suspended membership refusal, replay and
concurrent completion. Existing browser cases prove the actual React/runtime
and local relay, but their history/model fixtures do **not** represent this
restricted mode's authority. These distinct proof boundaries are preserved in
the JSON projections.

Exploratory runs exposed only test setup issues: missing MJS typing/transform,
a wrong synthetic membership enum, and an expectation of 403 where the existing
JWT guard correctly returns 401. A shared-helper extraction initially omitted a
message-shape helper; the old unit suite caught it and it was restored. None of
these failed runs substitutes for the final committed receipts above.

No complete platform/runtime/carrier release programme was rerun or inherited.
The previously disclosed unscoped TypeScript errors remain outside this scoped
qualification and are not relabelled PASS.

## Retained state and next owner action

Read-only file preflight confirms original manifest/private-state/restart hashes
and unchanged schema/migrations. The retained owner database was **not started**;
current membership and integration authority will be reread by the guarded
launcher before any admitted operation.

**READY TO REQUEST BOUNDED LIVE APPROVAL: YES.**
**LIVE TELEGRAM / OWNER CLIENT BINDING / IMPORTED HISTORY: NOT PROVEN.**

The owner must approve one session including Telegram exchange, a salon-wide
YCLIENTS client-registry read (ID/name/phone/visit count/amount/last visit), and
canonical initial identity writes in the local database. This is broader than
the expired public catalog allowance and the BotFather URL-setting approval.
No provider booking, model, message, SMS, production or iPhone effect is included.

After approval, issue a freshly pinned local plan. The owner enters the YCLIENTS
partner token and Telegram **Login Widget Client Secret** into the existing
reviewed hidden Terminal input. The stored YCLIENTS user token is reused. Never
paste secrets into chat, source, plan or receipts. The user performs actual
Telegram consent/login. Automatic Terminal credential entry remains unavailable
because it was previously rejected by safety review; this unit does not bypass
that rejection.

Login does not enable consent/settings or import history. Existing local data is
read honestly, including an empty result. A separate bounded operator history
sync path still needs qualification; the all-tenant reconciliation CLI must not
be used as its substitute. Real provider acceptance of the registered loopback
redirect is also still unproven; BotFather retained the exact Redirect URI but
normalized away the port in Trusted Origins, so that wrong extra origin was
removed in the previous approved registration attempt.

No owner database write, real Telegram/CRM/model request, OTP/SMS, deploy, grant,
production migration, iPhone installation or push occurred in this unit.

## Reproduction

Use new private output directories and committed clean executable sources:

```sh
node scripts/local-owner-telegram-binary-proof.mjs /private/tmp/maya-new-binary-proof
JEST_TELEGRAM_WITH_SUCCESSOR=1 node scripts/telegram-client-binding-proof.mjs /private/tmp/maya-new-http-proof --browser
node scripts/local-owner-telegram-mutations.mjs /private/tmp/maya-new-guard-mutations
node scripts/local-telegram-return-mutations.mjs /private/tmp/maya-new-return-mutations
npm run typecheck:widgets-live
```

Raw logs, test DB keys, browser images and full Jest output remain local. The
receipt manifest preserves hashes; repository files contain safe projections.
