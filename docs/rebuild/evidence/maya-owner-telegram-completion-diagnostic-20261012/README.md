# Local Telegram completion refusal and bounded diagnostics

Date: 2026-10-12 (Europe/Moscow).
Branch: `codex/maya-local-crm-setup-20261010`.
Executed diagnostic checkpoint: `bf030ae97f32321ea9548026532c9efea87aedc6`.
Live attempt checkpoint: `99033d2752eb4015f67ad1ce96dc7082d17ade5d`.
This is local acceptance work after C9, not release certification or deployment.

## Actual owner attempt

The owner authorized one renewal of the bounded Telegram/personal-read session,
manually supplied credentials through the reviewed hidden Terminal prompts,
signed into the existing Maya account, and confirmed Telegram in clean Chrome.
The callback returned to Maya. The application displayed an unconfirmed link;
Chrome Console showed HTTP 400 on the canonical Telegram link completion route.

A read-only query during this session observed zero Telegram AuthIdentity rows
for the selected owner, one new AuthFlowState with consumedAt, and no selected
owner audit actions during the session. No real Client binding was established.
These observations are not a retained raw database export.

The saved launcher receipt reports one provider dispatch, `telegram_token: 1`;
JWKS and YCLIENTS dispatches were zero. The stopped session is `cancelled`, with
clusterStopped, runtimeGroupAbsent, sourceUnchanged and samePrivateState true.
It was deliberately stopped after refusal, with no retry or state reuse.

**Exact live root cause remains unknown.** The prior transport discarded error
bodies and did not retain provider status or canonical completion failure code.
One token dispatch with no JWKS narrows the refusal but does not prove an invalid
Client Secret, provider availability failure, or unsupported ID token. Telegram
consent success does not prove a saved Maya identity link.

This differs from the first attempt's reproducible ambient-cookie callback
refusal. The clean Chrome callback was qualified with a synthetic return first;
the second actual attempt reached the server-side exchange. Cookie refusal,
callback validation and identity rules remain unchanged.

## Narrow change

Only the existing local launcher diagnostic owner and its tests changed:

- Closed HTTP route identifiers for canonical Telegram link/login completion.
- Existing canonical public error codes, copied only from own data properties.
- Closed Telegram token/JWKS route, stage and numeric HTTP status events.
- Existing strict IPC projection and 64-event limit; the new proof file is pinned
  in the finite source manifest.

No raw body, error description, JWT, code, verifier, header, cookie, identity,
phone, key or provider URL is written into the diagnostic record. Non-OK provider
bodies are still cancelled without reading and replaced with `{}`. Successful
response bytes, refusal behavior, counters, replay/expiry and authority checks
remain unchanged. Diagnostic sink failures cannot authorize or retry an action.

Product `src`, schema/migrations, React, headless runtime and callback sources
are byte-identical to the live checkpoint. Neither verification semantics nor
real provider behavior was repaired or claimed repaired in this unit.

## Fresh executed proof

| Surface | Result |
| --- | --- |
| New diagnostic tests against old sources in isolated copy | 7 FAIL / 1 PASS (expected regression) |
| Same eight diagnostic tests against changed sources | 8 PASS |
| Local read/Telegram/callback unit programme | 229 PASS / 0 FAIL |
| Actual AppModule + isolated PostgreSQL, synthetic Telegram/CRM wire | 86 PASS / 0 FAIL |
| Compiled local child, IPC and relay, isolated database | 11 checks PASS; zero provider dispatches |
| Existing local restriction mutations | Green baseline 38; 11/11 killed; restored 38 PASS |
| Scoped widgets-live type check and changed TS lint | PASS |
| Isolated database/process cleanup; unchanged test source | PASS |

The three additional AppModule cases distinguish a synthetic token-endpoint
401, HTTP 200 without an ID token, and HTTP 200 with a malformed token. Canonical
completion returns 400, creates no identity/Client link, consumes the flow, and
refuses replay without another dispatch. These cases explain what the new
diagnostics can distinguish; they are not evidence of which occurred live.

The binary proof observes a canonical refusal through the actual child IPC and
saved receipt. It does not make a real token exchange. Counterfactual tests used
archived old sources and the same new test bytes, never altered the worktree.

An exploratory unit run caught the source-manifest count needing its explicit
21-to-22 update for the added test. The final committed run above includes that
correction. An initial counterfactual copy omitted the relay module and could
not load; only the corrected copy's assertion failures count as regression proof.

Safe result projections and hashes of local raw receipts are in `proof-summary.json`
and `receipt-manifest.json`. Raw logs, private session material and database
contents are not archived here.

## Boundary and next step

The real owner link and personal Client lookup remain **NOT PROVEN**. A new live
attempt needs a new explicit bounded approval, a freshly pinned one-use plan,
owner-entered keys and fresh Telegram consent. Old codes, flows and permits must
not be reused. Preparation/testing did not restart the retained owner database.

No production change, deployment, production migration/grant, SMS, booking,
model call, notification, iPhone action or push was performed. The only real
provider operation in the reported attempt was the authorized Telegram exchange.

Reproduce in new private output directories:

```sh
node --test scripts/local-owner-telegram-diagnostic.test.mjs
node scripts/telegram-client-binding-proof.mjs /private/tmp/maya-new-http-proof
node scripts/local-owner-telegram-binary-proof.mjs /private/tmp/maya-new-binary-proof
node scripts/local-owner-telegram-mutations.mjs /private/tmp/maya-new-guard-mutations
npm run typecheck:widgets-live
```
