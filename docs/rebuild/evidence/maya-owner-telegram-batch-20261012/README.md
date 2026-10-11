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
