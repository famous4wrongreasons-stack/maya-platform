# Core conversation HTTP checkpoint — 2026-10-08

The core diagnostic is executable through actual authenticated HTTP, AiCore and
its existing DeepSeek serializer. The first local run completed all three dialogs
and five user turns against an owned PostgreSQL cluster, with five serialized
model requests passed unchanged through the existing budget kernel to a separate
broker. This is a wiring result, **not real-model quality or MAYA completion**.

The broker returned one generic, explicitly canned clarification on every dry
request. There were no C9 revisions or recommendations produced by those canned
turns. The fixture separately established a verified synthetic Client/calendar,
a canonical Opportunity and published C7 data. Existing C9 semantics/failure
acceptance remains the separate [C9 checkpoint](MAYA-C9-FAILURE-CHECKPOINT-20261008.md).
No current React, restart, real YCLIENTS, branch-link or real-model acceptance is
claimed by this checkpoint.

## Implementation and boundaries

- `core-conversation-runner.mjs`: captures the exact committed source inventory,
  dataset and limits; owns a fresh finite PG/HTTP run and cleanup. New files,
  including added migrations, changed HEAD and dirty source refuse before setup.
- `core-conversation-http.probe-spec.ts`: actual auth/HTTP/AiCore, native DeepSeek
  request serialization, actual assistant history and persistent conversation ID.
  Saves every reply/model response and observes C9 revisions if produced. There
  are no golden assistant turns or injected model plans. The explicit fixture
  source qualifications remain in `http-report.json`.
- Existing `CandidateBudgetGate` owns reservations, durable ledger, finite retry
  accounting, cancellation, response bounds and refusal after unknown delivery.
  Its old offline defaults and ordinary widgets guards remain unchanged.
- `candidate-broker-server.mjs` is the extracted existing finite broker kernel.
  Dry uses credential-free loopback TCP; admitted transport uses only a Unix
  socket with pinned path/GID, broker ownership, parent mode `02710` and socket
  `0660`. It cannot use a shared-host TCP model route. Existing paths are never
  unlinked to restart a run.
- `core-conversation-admission.mjs` consumes an independently authorized fresh,
  SHA-pinned permit. It never creates owner authority or a usable permit. An
  exclusive fsynced claim cannot resume; expiry/revocation/drift is checked before
  reservation and dispatch. Broker and runner must have different existing UIDs.
  Credential bytes stay in the broker and can only come from the exact declared
  scalar file after admission. Env-file extraction is deliberately unsupported.
- This changes development diagnostic scripts/tests, not production routing,
  product schema, business authority, background autonomy or the working site.

## Evidence

Final runtime candidate: **746e0ae4e1efda0abf7918cbb63a5fe4d46861b9**.
First dry proof: `ac3c4142be3cb4c3e1770300a224d0eb4e57bf7d`.
Evidence archive: [manifest](evidence/maya-development-integration-20261006/core-http-runner-20261008/manifest.json).

- 84 mechanical Node checks passed (budget, admission, source inventory, broker,
  Unix transport, cleanup and replay); focused TypeScript and lint passed.
- Final dry HTTP proof passed: 3 dialogs / 5 turns / 5 serialized requests.
  Broker and runner request-body hashes/lengths match, and both record the five
  canned model responses. Follow-ups use the preceding actual HTTP reply.
- Both HTTP runs stopped their own broker and PG cluster; all 12 owned HTTP
  stage groups are absent. The final run verifies unchanged sources and exact
  Git blob hashes in the artifact audit.
- No credentials loaded, external model/provider calls, business-table changes
  or outbound operations. Reservations are synthetic: $0.593334720 equivalent,
  not actual spend. Independent read-only code review passed with the explicit
  live placement blockers below.

Both local attempts are retained. The first check run passed Node tests/types but
failed six lint rules; these were corrected. The first Unix transport test attempt was blocked by the scratch TCP-only network
guard; the final guard admits only the current test owner’s exact synthetic Unix
socket pattern and still denies external hosts/other sockets. Both attempts are
retained. No successful model call is inferred
from tests with mocked expired permits. Dry ledgers account synthetic reservations
only; they are not provider usage or charges. The first owner follow-up was 97,200
bytes out of the 98,304-byte request cap: a longer real history can stop the batch
at the same explicit bound instead of silently enlarging it.

The additional [12-dialog / 24-turn development follow-up corpus](evidence/maya-development-integration-20261006/core-http-runner-20261008/core-followup-cases.json)
is retained with exact dev provenance, not gold or a holdout. Its fixture gaps are
explicit; it has no executable admission and does not enlarge this 3/5 batch.

To reproduce the credential-free profile from a clean committed checkout after
assigning its local heavy slot:

```sh
node --max-old-space-size=3072 scripts/conversation-qualification/core-conversation-runner.mjs \
  --run --mode dry --output /absolute/new/evidence-directory
```

`--prepare` writes only a nonsecret declaration. Neither command prepares a live
permit. The normal widgets harness does not gain a paid-mode switch.

## Concrete next admission proposal

A future live diagnostic is limited to **3 dialogs, 5 turns, 12 total attempts,
$2 and 10 minutes**, concurrency 1, at least 6 seconds between attempts, 30 seconds
per attempt, 96 KiB request / 1 MiB response, max 2,048 output tokens per attempt,
aggregate input reservation 1,228,800 and output 24,576 tokens. At the pinned peak
rates $1.32/M input and $3.96/M output, maximum full reservations total $1.71933696;
[official pricing](https://api-docs.deepseek.com/quick_start/pricing/) was checked
on 2026-10-08, and an admitted permit still requires fresh price evidence.

Proposed physical target is historical `api.mayaos.ru` / `89.169.160.55`, SSH user
`botadmin`, existing broker UID 996 and runner UID 997. Use a **new** isolated code
placement, processes, synthetic PG, permit and ledgers. Do not resume the old
service, DB or closed paid permit. Only broker egress to `api.deepseek.com:443` is
needed; payload is synthetic dialog/tenant context. No production/CRM data,
notifications, real booking or model credential is sent to this Mac.

Exact blockers: the existing scalar DeepSeek credential reference/owner/reader is
unknown; existing primary/supplementary group metadata and a socket directory that
excludes unrelated users/ACLs are unverified. The credential must also be unreadable by the runner through
mode/group/ACL; the broker’s no-group/world-write check alone does not prove this.
UID is not GID. Host string binding
is an operator placement declaration, not remote host attestation. Cross-UID Unix
isolation and actual scalar credential reads have not been exercised locally.
If the existing source is only an EnvironmentFile, scalar-file admission remains
unresolved; do not extract it or provision a new secret without authorization.

**One next bounded action:** obtain fresh authorization for a metadata-only SSH
inventory of the known broker unit and the two existing principals. Read only
`User,Group,SupplementaryGroups,EnvironmentFiles,LoadCredential`, numeric owner/
mode metadata for validated declared paths, and `id` for the known principals;
no file contents, arbitrary search, `Environment`, `ExecStart`, sudo, startup or
paid calls. The previous authorized attempt ended at SSH banner timeout and is
not reused. After this action resolves the descriptors, propose the exact fresh
placement/process and paid execution admission. No SSH or paid action occurred
in this checkpoint.
