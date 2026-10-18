# Native transport: immutable scope and one-run journal — 2026-10-18

**LOCAL PREPARATION AND SYNTHETIC PROOF. NOT REAL EXECUTION AUTHORITY.**

Application candidate remains `6356db1875545337e34b6c8888b7ca858bb64361`.
Fixed profile: `closed-input.no-handoff.no-price-goods@1`.
Parent tooling checkpoint: `4a5f718464a0e7f065fb64c20c42f7fa1543a35b`.
This continues [the combined React/native lifecycle proof](MAYA-NATIVE-WIDGET-BROWSER-20261018.md).

## What changed

The native transport already exclusively creates its attempt ledger. However,
the caller supplying a different ledger filename could otherwise start another
budget under the same external execution-authorization digest. The component
explicitly required an executor to prevent that; this unit supplies that missing
local restriction around the existing component.

`phone-native-run-guard.mjs` reads the **existing** native scope contract from an
operator-installed private file, verifies the separately supplied exact hash,
then opens the existing `nativeCreateEgress`. It does not change the adapter,
Action Engine, runtime, carrier, AR-1 or the provider transport implementation.
There is no executable entrypoint or new authorization issuer.

- Scope and journal directories must have their configured operator UID and
  mode 0700. The default UID is root; synthetic tests explicitly use their test
  user's UID. The UID, pinned hash and directory paths are trusted executor
  configuration, never caller/request fields or a source of platform authority.
- Scope is a regular private 0600 file with one hard link, bounded size and one
  exact UTF-8 JSON encoding. Symlinks, duplicate JSON keys, alternate encodings,
  extra authority fields and invalid native candidate/profile/tenant/window fail.
- The canonical journal basename comes from the independently checked execution
  authorization digest. Callers cannot supply an alternative ledger filename.
- An exclusive `.consumed` claim is written and fsynced, including its directory,
  before the existing attempt ledger can open. A second process loses atomically.
  A crash/failure after claiming burns the run; removing only the attempt ledger
  or changing the scope hash cannot reset the authorization's journal namespace.
- Every existing transport admission check rereads scope bytes, file identities,
  private-directory identities, claim and revocation marker. A dangling symlink
  also counts as a revocation marker. Any observed refusal permanently closes
  this process; putting a file/authority back cannot revive it.
- The existing independent `assertCurrent(scope) === true` check remains
  mandatory. Missing, false, undefined or asynchronous admission cannot claim.
  The guard does not infer execution authority from AR-1 grant presence, a tenant
  owner role, credential possession, an installed JSON file or its hash.
- The existing transport still owns routing, limits, reservations and uncertain
  outcomes. If revocation is observed after a provider commit, the connection is
  lost; the guard does not invent a definite provider rejection or success.

The guard's namespace is one fixed operator-installed journal directory. It is
not protection against a privileged operator replacing that entire installation,
deleting all claims, changing its trusted configuration or supplying a dishonest
authority callback. The future executor must pin this namespace and validate
real execution authority and installed artifacts. No such executor is installed
or certified by this change. There is deliberately no reset/resume API.

## Fresh verification

Exact source hashes and results are recorded in
[RECEIPT.json](evidence/maya-native-run-guard-20261018/RECEIPT.json).

- New guard tests: **39 PASS / 0 FAIL / 0 SKIP**, including four competing OS
  processes (one claim, three refusals), changed/replaced files, broken claims,
  expiry/revocation, missing authority and post-commit transport uncertainty.
- Existing native transport regression: **90 PASS / 0 FAIL / 0 SKIP**.
- Five test-copy mutations are detected: claim overwrite, ignored independent
  admission verdict, skipped current scope pin, ignored revocation marker, and
  reviving a poisoned run. The healthy control passes in every final mutant run.
- Native Action Engine/lost-response integration with the guard: **10 PASS**.
  All ten scopes were claimed; all ten duplicate startups were refused.
- Fresh guarded React integration: **7 PASS / 0 FAIL / 0 SKIP**, including all
  eleven lifecycle checkpoints, two canonical logins, four chat requests, six
  widget intents and nine concurrent consumed-confirmation refusals. All seven
  scopes refuse duplicate startup. Provider effects remain exactly one create,
  one move and one cancellation in the synthetic ledger.
- Both disposable PG clusters stopped and removed; **163,359,152 bytes** reclaimed.
  Supporting logs and source inventories remain. Shared controls in the two
  integration suites are not counted as seventeen distinct behavioral tests.

The first mutation attempt removed the authority callback entirely. That also
broke the healthy control's proof that admission was reread. The final mutation
still calls the callback but deliberately ignores its verdict, isolating the
intended defect. The first attempt remains archived as failed qualification;
the full final mutation run starts with a fresh green baseline. No product
condition or healthy assertion was weakened to accept the first attempt.

All integration processes run under the existing OS loopback-only network fence.
The canonical backend and native HTTP adapter remain unchanged. Model
interpretation, provider data/endpoint, AR-1 signer/certificate and independent
external-effects authority are synthetic. The new guard does not turn the
synthetic callback into real platform execution admission.

## Reproduction

```sh
node maya-saas-backend/scripts/phone-native-run-guard-mutation.mjs --run \
  --output /absolute/path/to/new-mutation-output

node maya-saas-backend/scripts/native-provider-socket-proof.mjs --run \
  --source /absolute/path/to/verified-6356-export \
  --repository /absolute/path/to/development-repository \
  --output /absolute/path/to/new-native-output \
  --create-egress --lifecycle-ae --release-admission --lifecycle-loss-ae --run-guard
```

For the combined browser run, replace `--lifecycle-loss-ae` with
`--lifecycle-browser --carrier-dependencies /absolute/path/to/isolated/node_modules`.
The existing diagnostic-only Chrome nested-sandbox qualification remains as
described in the preceding browser report; the outer OS network fence remains.

## Still required before a phone/server operation

1. Real external-effects authority verification and its trusted artifact/network/
   journal-directory binding. The AR-1 grant contract permits grant/revoke; it is
   not by itself authorization for an external booking.
2. Bounded ordinary AiCore transport. Its shared Bearer credential must not be
   misrepresented as exact-user authority; the old wrapper's injected actor
   headers are absent from the ordinary model client.
3. Complete fresh release certification. The interrupted V6 mutation corpus
   still has no final receipt; these scoped tests do not replace it.
4. Actual server pre-state, compatible rollback rehearsal and separate explicit
   owner authorization for the real release/provider window, then live phone
   acceptance. No old authorization window is extended here.

No real YCLIENTS/model calls, owner-database or Keychain access, Beget/production
change, real grant/migration, iPhone installation or Git push occurs. The owner's
1,333 intentional file deletions are not restored or staged. No certificate or
server/phone readiness is issued by this unit.
