# Fresh Telegram login: late response and local source-guard cost

Date: 2026-10-12 (Europe/Moscow).
Branch: `codex/maya-local-crm-setup-20261010`.
Real attempt: `2fb2569147cf1910be0b4c01b7ad2735054abe6a`.
This is local owner acceptance after C9, not release certification.

## Observed real attempt, preserved separately from diagnosis

The exact saved-salon finder succeeded. The owner confirmed a fresh Telegram
login through the previously saved Telegram AuthIdentity. Telegram token
exchange and JWKS verification returned 200. The local guard dispatched 22
YCLIENTS client-registry page requests. The counter is requests, not a verified
number of returned rows or a complete-registry claim. One transport refusal was
recorded; its exact registry-stage cause was not retained.

The launcher received login-entry and final HTTP 201 events 122,346 ms apart.
The UI displayed `Нет связи — повторить`. Its existing request budget is
80,000 ms. No retry was clicked. These event times are launcher receipt times,
not exact provider timings. HTTP 201 does not prove personal Client binding:
the canonical login may return an unlinked result after binding resolution
fails. The response body was not retained.

A read-only local snapshot while the request was still pending found one
Telegram identity, one new consumed auth flow and zero new ClientChannelLinks.
It showed idle database sessions, with no observed lock wait at that instant.
That snapshot precedes the final response. The final Client binding state was
not reread and remains unverified; do not promote the pending zero to a final
claim. The owner database was then stopped and preserved. Source/private-state
equality and process/database cleanup passed.

## Proven local harness defect and bounded correction

Every current-authority guard rereads and hashes 2,163 committed source files.
The read-profile extension additionally spawned 22 separate `git ls-tree`
processes on every check. A pre-edit offline measurement averaged 345 ms per
binding. An equivalent batched experiment averaged 135 ms with the exact same
ordered projection and hashes. Frequent checks amplify this avoidable cost
during paginated registry reads. This does not establish that all real elapsed
time was local or prove a particular YCLIENTS latency.

The correction batches only those 22 metadata lookups. Each guard still runs
Git status, verifies all required committed paths, rejects symlinks and malformed
or substituted metadata, rereads every file, checks its Git blob and SHA-256,
and verifies HEAD again. There is no cache, skipped guard or longer timeout.
Product/backend authority, React, runtime, schema and provider contracts are
unchanged. The local transport and source projection retain their existing
ownership. Code commit: `bd627f46007ce40084102643a9e5a4a0945ea5d4`.

## Executable evidence

`local-source-binding.test.mjs` evaluates the actual exported binding function
against disposable Git repositories. Before the patch: 7 PASS / 1 FAIL (two
metadata processes where one is required). After the patch, all 258 local unit
tests pass, including eight binding cases covering output order/hashes, dirty
and untracked source, missing files, directory and symlink substitution,
post-status byte tampering, concurrent HEAD replacement and malformed metadata.

`local-source-binding-proof.mjs` compares the former algorithm and current
algorithm on the same committed file bytes. It exercises the existing transport
with synthetic responses and the same source-check count around authority
rereads. No retained database is opened and no real network is called. Its
timing receipt measures guard cost; it is not an end-to-end real-provider or
Client-identity proof. See the final proof summary and manifest for results.

## Remaining boundary

Successful live fresh login and an exact personal Client match remain unproven.
The consumed session cannot be reused. Any next real attempt requires a new
bounded owner approval and should first inspect the retained binding state
without mutating it. The existing Telegram link should not be recreated.

No production deploy, production migration, entitlement grant, SMS, booking,
model, message, iPhone operation or push was performed in this unit.

## Final offline results

On committed code `bd627f46007ce40084102643a9e5a4a0945ea5d4`, both algorithms
produced exactly the same source projection. With synthetic instant responses,
the same 32 registry pages plus token/JWKS dispatches and 341 source checks
took 112,697 ms before batching and 44,218 ms after batching. The former exceeds
the unchanged 80,000 ms browser budget even without provider/database latency.
Both preserve the 120,000 ms transport operation budget. This isolates a local
harness performance defect; actual provider latency remains unmeasured.

The final compiled child/IPC/relay proof passed 14 checks with zero provider
dispatches, clean process/database shutdown and unchanged source. Restrictions
mutation programme: 38 baseline PASS, 11/11 killed, 38 restored PASS. The retained
owner database remained stopped throughout all offline checks. No additional
live attempt was started by these proofs.
