# Fresh Telegram login: confirmed unlinked result and closed diagnostics

Date: 2026-10-12 (Europe/Moscow).
Branch: `codex/maya-local-crm-setup-20261010`.
Qualification: local owner acceptance after C9, **not release certification**.

## Real attempt 07 — observed, not inferred

Candidate `218a1b066826b663b8fe72c7853e056e86a4b887` reused the saved Telegram
identity. The exact saved-salon finder succeeded and the owner confirmed login.
Telegram token exchange and JWKS both completed with HTTP 200. The restricted
transport dispatched 29 registry-page requests, with no transport refusals.
This is a request count, not proof of the number of returned customers or of a
complete registry. The canonical response body and registry were not retained.

The launcher observed login entry and HTTP 201 completion 83,164 ms apart.
The unchanged browser request budget is 80,000 ms. The UI displayed
`Нет связи — повторить`; no retry was clicked. HTTP 201 does not establish a
personal Client link: canonical login can succeed with an unlinked outcome.

Unlike the earlier pending-only snapshot in attempt 06, this attempt included a
read-only snapshot **after** HTTP completion. It found one saved Telegram
identity, one newly consumed login flow, and zero exact-user ClientChannelLinks
or initial-link audits. Personal Client binding was not established. Its exact
reason was not captured, and must not be described as not-found, ambiguity,
expiry or provider failure without new evidence.

The owned runtime and database were stopped; private state and source equality
were preserved. `attempt-07.json` contains only a safe aggregate projection.
`attempt-manifest.json` records hashes of originals that remain local.

## Two bounded corrections

`0acd5e1f142e3f11bf1d604df5bf1c962b792e8c` combines the remaining base/read
source scans. Every guard still checks Git status and committed metadata,
rereads every required file, checks blob and SHA-256 hashes, rejects symlinks,
and verifies HEAD again. There is no cached authority, omitted file or increased
timeout. Full ordered source projection equality is executable, including the
extension order. A new test failed before the patch because the old implementation
ran two metadata scans; the preserved before result is 8 PASS / 1 FAIL.

`7a0e963e270f4c3998ab57a08caad9aaace84a19` adds an optional closed diagnostic
category for `client_binding` on successful Telegram login responses. It reads
only own data descriptors for status/reason, never credentials, phone, card,
response body or Error text. Unknown results become a fixed category. IPC rejects
unknown values, wrong routes/stages/statuses and additional raw fields. Diagnostic
failure cannot change the response or retain an earlier binding result. Product
authentication, identity resolution, runtime, carrier and schema are unchanged.

## Executable evidence and limits

The diagnostic regression initially failed three new assertions on the old
module. All 263 local unit tests now pass. The actual AppModule, canonical
Telegram verification/client resolver, real YCLIENTS adapter and isolated
PostgreSQL pass 92 HTTP tests with synthetic remote responses. They include a
unique match, no match, and multiple matches, and prove closed diagnostics agree
with canonical results while preserving the response and withholding authority.
Typechecking and scoped lint pass.

The first HTTP test attempt failed to load the new ESM diagnostic module in
Jest: 76 tests passed and one suite could not start. The exact existing test
transform allowlist was extended to that module; no product workaround was used.
The failed receipt remains local and is included in the proof manifest.

Final timing, binary and restrictions-mutation receipts are summarized separately.
Offline timing uses the real bounded transport with synthetic instant responses
and simulated authority rereads. It does not measure real provider/database
latency or prove successful owner login/card resolution.

On committed code `7a0e963e270f4c3998ab57a08caad9aaace84a19`, the shared scan
took 38,117 ms versus 114,536 ms for the original pre-batching algorithm on the
same current bytes. Both completed 32 pages, 341 source checks and 68 simulated
authority rereads, with exactly equal 2,163-file projections. The actual compiled
child/IPC/relay proof passed 14 checks with no real provider dispatches and clean
shutdown. Restrictions mutations: 38 baseline PASS, 11/11 killed, 38 restored
PASS. The HTTP suite ran on the uncommitted diagnostic patch before that commit;
all its recorded file hashes were checked against the committed code and match.
It is not mislabeled as a run that started on the later commit.

## Remaining boundary

Saved Telegram account identity is confirmed. A successful fresh browser login
and exact personal Client binding remain unproven. The next live attempt must
use a new bounded owner approval and the new diagnostic; do not reuse consumed
attempt 07 or recreate its existing Telegram link. The retained owner database
remains stopped during offline proofs.

No production change, grant, SMS, real booking, model call, message, history
import, iPhone operation or push belongs to this unit.
