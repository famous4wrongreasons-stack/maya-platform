# One bounded saved-Telegram login batch

Date: 2026-10-12 (Europe/Moscow). Branch:
`codex/maya-local-crm-setup-20261010`. Local owner acceptance after C9 only;
**not release certification or production authorization**.

## Owner decision

The owner requested fewer repeated approvals and key entries, then approved the
proposal: one local window of at most 30 minutes, at most three login attempts,
each credential entered once in the owner's Terminal, credentials retained only
in process memory until shutdown. The owner still confirms Telegram login.
YCLIENTS access remains the exact selected salon's client-registry read, at most
32 pages of 200 rows per attempt; no booking, SMS, messages, model, history import,
production or iPhone operations. A successful initial personal Client link may
be saved only in the retained local database through the canonical authority owner.

## Implementation

The existing private pinned launcher admits the explicit
`owner_telegram_saved_login_batch_v2` contract. There is no second credential
store, release engine, identity writer or automatic renewal. The historical V1
mode and generic setup/chat/diagnostic durations remain unchanged. Only the
separately validated V2 plan permits 30 minutes. The deadline includes preparation
and input, clips runtime duration, aborts pending input, and shuts down the child.
The plan still binds exact source hashes/HEAD, database and private-state hashes,
tenant, owner, company, redirect origin, public Telegram client ID and approval.
Only one launcher and one child may consume the plan; deleting the claim revokes it.

V2 accepts saved-identity login only. Both ingress and runtime reject Telegram
re-linking. The canonical Telegram verifier still checks signature, issuer,
audience and current identity; the canonical Client resolver still owns the exact
Client match and initial link. Owner role alone grants no Client authority.

At most three starts and three completed-attempt invocations are admitted.
Failures/aborts count, concurrent starts reserve the count after the awaited
identity reread, concurrent exchanges are refused, and consumed state/code is
never replayed. Each attempt retains the existing 120-second operation budget,
20-second fetch budget, exact provider URL/body scope and 32-page bound. V2 also
rejects responses over 200 rows per page. Provider calls are never automatically
replayed by transport. The agent may initiate another fresh login within the
approved batch; Telegram consent remains manual. A terminal identity ambiguity
or a source/code change is a stop condition, not a reason for blind retries.

The credentials are passed to the existing child process and discarded from the
parent environment. They are not written to a plan, receipt, file or Git. The
batch ends on expiry, explicit cancellation, runtime failure or completion of
the task; restarting a consumed plan is refused. No secret is carried into a
replacement process after shutdown.

## Regression provenance

New tests against old checkpoint `450eff259d4d155dcab028d0eeee29fd3ab5dd82`
produced 51 PASS / 6 FAIL. The failures expose the missing batch contract,
re-link refusal, attempt cap, row bound and isolated duration path. Before the
concurrent-start correction, an actual AppModule/PG test admitted four
simultaneous starts; its receipt is preserved. The corrected test admits three
and refuses the fourth.

The enlarged HTTP corpus also exposed shared localhost completion-rate buckets
between independent cases: a historical test received 429 after earlier tests
consumed the global 60/10m policy. `c5c93465` isolates only that loopback preflight
bucket in guarded proof databases, between cases. A separate real-HTTP test
proves 60 attempts are admitted, the 61st is refused, and resetting this one
fixture bucket preserves every other bucket. Production rate-limit code is
unchanged. An intermediate proof had a misconfigured synthetic Telegram fixture
and returned 503; it was corrected by using the existing signed-login fixture,
not by relaxing a product guard. All failed receipts are retained locally.

The implementation is `a80b2e74`; see `proof-summary.json` and
`proof-manifest.json` for final committed-source receipts and exact hashes.
The test build uses synthetic identities/credentials and a disposable database;
it is not evidence of a real personal Client match.

## Live boundary

Saved Telegram identity is already confirmed. Real personal Client binding is
not yet proven. Only the owner-initiated, hidden-input launcher can begin the
approved real batch. No live provider call or retained-database start is made by
the offline proof programme. The earlier refusal of automated Terminal control
is preserved; the agent does not read the clipboard or type credentials.

## Live batch result: first attempt, 2026-10-12 02:19 MSK

This section supersedes the unexecuted live boundary above, not its historical
proofs. The owner manually launched the approved batch at candidate
`ab23aef26a4ed22af1db467ef720ce59f52ded8b`. One fresh Telegram confirmation
completed; the second and third permitted attempts were not used.

Telegram token exchange and JWKS verification succeeded. The current Chrome
carrier returned to AChat. The canonical login endpoint returned HTTP 201 with
`client_binding = unlinked / fresh_telegram_verification_required` after
70,614 ms. Authentication succeeded; personal Client binding did not.

The exact owner's saved signed-claim timing was examined with a read-only,
loopback-only, tenant/user-scoped query. Only lifetime/relative timing was
retained in repository evidence, not claims, phone, identifiers or credentials.
The proof was issued during this session, had a **30-second lifetime in this
attempt**, and was already expired by 38.861 seconds at the binding response.
This is an observed claim lifetime, not a claim about every Telegram token.

The final provider summary records 31 calls: one token exchange, one JWKS read,
29 registry page reads, zero refused provider calls. Page count does not state
the number of customers returned. A read-only aggregate observation after the
response found one saved Telegram identity, one newly consumed login flow,
zero exact-user `maya_user` links and zero initial-binding audit records.

`TelegramClientBindingService.bind` first validates the unexpired login proof,
then reads the complete registry, resolves exactly one current CRM identity,
and checks the proof again inside the final identity-locked transaction.
`assertLogin` and the canonical writer's `validUntil` both retain the original
token expiry. The live result therefore fits expiry during the lookup, not
an incorrect Client Secret or failed Telegram authorization. The receipt does
not separately measure network versus source-guard/DB cost; that split is not
claimed here. It also does not prove that every previous failed attempt had
this cause.

The owned launcher was stopped after this determinate refusal. Runtime and
PostgreSQL stopped cleanly, private state was preserved, pinned source stayed
unchanged for the entire live run. Local login/identity processing may write
local session/CRM registration state; `samePrivateState` concerns the pinned
private-state artifacts and is not a claim that the database had no writes.
There was no production, booking, message, SMS, model or history-import action.
Raw receipts remain local; see `live-attempt-01.json` and the hash manifest.

## Offline reproduction, not a fix

Test-only commit `b8b60d94a7ff56cc3c224499bad0dc24fd342b4b` adds a synthetic
30-second signed token to the real HTTP/AppModule/PostgreSQL suite:

- Fast exact CRM lookup: HTTP 201, one canonical personal Client link.
- Synthetic lookup completing after expiry: HTTP 201 login, the same explicit
  freshness refusal, zero link/audit writes, consumed-flow replay refused.

The slow case uses real wall-clock expiry and PostgreSQL time. Signature,
expiry, tenant and identity checks are not mocked away. Fresh results on that
committed source: **100 PASS / 0 FAIL**, including both new cases; TypeScript
and scoped lint passed. The disposable database stopped and source hashes
remained unchanged. See `short-lived-proof-summary.json` and
`short-lived-proof-manifest.json`. Earlier fixtures used a 600-second token
lifetime; their green results did not cover this real short-lived proof.

No product/runtime/authority behavior was changed. Successful real personal
Client binding remains **NOT PROVEN**. No release certification is inferred.

## Narrow contract proposal — NOT APPROVED / NOT IMPLEMENTED

Do not delete expiry checks or accept an already-expired incoming token.
Proposed resolution for a legitimate CRM lookup exceeding the provider token's
lifetime:

1. The existing verifier must accept a valid, unexpired signed Telegram token
   for the exact audience/issuer, fresh consumed flow, user and tenant.
2. Before CRM work, the same server-owned coordinator creates an immutable,
   in-process, one-operation admission proof. It binds token hash, verified
   phone/Telegram subject, user, tenant, flow and current session. No caller may
   supply or receive this proof and it cannot survive a process restart.
3. Its hard deadline is the minimum of acceptance time + 120 seconds, signed
   issue time + the existing 10-minute freshness limit, flow expiry and session
   expiry. This explicitly separates provider-token verification time from
   the bounded lifetime of the already accepted operation; it is a change to
   the present authority contract, not merely an HTTP timeout increase.
4. Final consumption still rereads current session/membership/identity/source,
   verifies the complete fresh exact-Client match and applies the existing
   identity locks, single writer, immutable revocation and atomic audit.
   Revocation, source changes, ambiguity, substitution, expiry or replay refuse
   the binding. Owner role grants no Client authority.
5. The audit retains versioned acceptance/deadline provenance and original
   token expiry without storing the token or raw phone. Use existing evidence
   owners; no new persistence is authorized by this proposal. If sufficient
   evidence cannot be represented safely, stop before adding durable schema.

This proposal needs an explicit owner/security decision because it permits
finishing an already verified operation after the external token expires. The
current live-session approval does not silently grant that contract change.
Until decided, no further real attempt, expiry relaxation or production action.

## Subsequent owner decision and local implementation

The owner subsequently answered **«Да, реализовать и проверить локально»** to
the explicit two-minute operation proposal above. This supersedes its pending
approval status. It authorizes implementation and synthetic proof only, not a
new real-provider session or production action.

`TelegramClientBindingService` remains the only login-to-Client coordinator.
After verifying an unexpired incoming token and rereading current login
authority, it freezes one in-memory admission bound to that exact frozen login
proof. The deadline is the minimum of 120 seconds from acceptance, the original
flow/session expiry and the signed issue-time freshness limit. It is minted
before registry lookup and outside the transaction retry loop. A later login
extension does not renew this deadline. The admission is never read from an HTTP
request or saved profile and is not returned to the browser.

Final identity-locked consumption still rereads session revocation/expiry,
membership, Telegram identity/verified phone, consumed flow and current CRM
source. Full fresh registry uniqueness, exact Client registration/mapping,
immutable revoked history and canonical ClientChannelLink writer are unchanged.
The canonical writer's proof deadline is clipped to the admission deadline.
The channel-control evidence hash commits to the admission, and the same atomic
audit records its `a18.telegram-oidc-phone.operation.v1` contract, acceptance
time, hard deadline, original token expiry and opaque proof hash. No token or
raw phone is added to that audit. Existing historical link evidence is untouched.

No model, SQL column, migration, endpoint, role, carrier behavior or new authority
writer was added. The old token-expiry rule still applies at **initial admission**;
only completion of the already admitted operation uses the approved bounded
deadline. Expired incoming tokens, replay, substitutions and current revocation
remain refusals. The local launcher's independent source pins, overall session
expiry, three-attempt cap, provider limits and cancellation are unchanged.

Counterfactual proof temporarily restored the old product file while running the
new slow-lookup test: it failed with the original explicit freshness refusal.
The proposed file was restored byte-for-byte afterward. The earlier 100-test
receipt above intentionally preserves the old refusal expectation; it is not
relabelled as a successful binding.

The first enlarged test run exposed two **test harness** issues: an empty test
filter was encoded differently in the manifest, and the new simulated clock
assigned a method to Prisma's transaction proxy, leaking a closed transaction
into subsequent tests. The runner now normalizes an empty filter to an
unfiltered run; the clock helper wraps each transaction without modifying the
Prisma proxy. The failed receipts remain local. The isolated clock regression
then passed 12 selected cases. Product checks were not relaxed to repair these
test issues. Final receipts and limitations are recorded separately in
`operation-proof-summary.json` and `operation-proof-manifest.json`.

### Final local verification

Executable checkpoint: `eb336c97a8725291319a5164bed0ee039cf3fe3a`.

| Surface | Fresh result |
| --- | --- |
| Auth, binding ownership, canonical link writer, personal context unit suites | 75 PASS / 0 FAIL |
| Complete selected HTTP/PostgreSQL corpus, including successor suite | 130 PASS / 0 FAIL |
| Targeted security mutations | 15/15 killed by the intended assertions |
| Unfiltered HTTP/PostgreSQL rerun after restoring every mutation | 130 PASS / 0 FAIL |
| Compiled child/IPC/relay and bounded batch refusal proof | 16 PASS, zero provider dispatch |
| TypeScript and scoped lint | PASS |
| Disposable database and child cleanup; source stability | PASS |

The mutation programme covers incoming expiry, hard operation expiry, the
120-second ceiling, session/flow/issue-time bounds, current session/source,
verified phone, unique Client, immutable revocation, audit atomicity and existing
registration/profile behavior. HTTP negatives also cover caller-authored
admission, substitution, session/membership/identity/flow changes during lookup
and replay. Existing concurrent-writer and historical-revocation cases remain
in the unfiltered corpus. Only the mutation runs use disclosed targeted test
filters; both baseline and restored receipts are unfiltered.

The compiled-child proof validates the actual local launch/relay and its
refusals, not real Telegram or a real Client match. The short-token success is
proved with a synthetic signed issuer and real HTTP/PostgreSQL owners. A new
real owner acceptance has **not** been run. The previous real batch is stopped;
its consumed authorization cannot authorize the changed source. No new provider
calls, production writes, OTP/SMS, booking or iPhone actions followed the owner's
local-only implementation decision. This is not release certification.
