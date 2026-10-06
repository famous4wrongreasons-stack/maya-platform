# Private semantic context and local compiled qualification — 2026-10-06

Code checkpoint: `00b8d6b3e245fa56fe61a8b10e2d46394e8b0c98`, on review candidate
`3e520bfca8ac114135afc398bf6a3ecd7918d687`.
Changes: `e49d32f2d20bf2951eab84ec74f9dde2bc3abf4b` (model projection),
`adea70f951bf79de8b6a9fa9421a046c3c3c7339` (inspection/runbook),
`00b8d6b3e245fa56fe61a8b10e2d46394e8b0c98` (known private values in resumed prose).

## Result and bounds

The existing sanitizer now projects semantic plans, tool data, conversation history,
notes and grounding corrections through the same request-local alias maps. Current
catalog names/references are registered before prose projection. Canonical booking
binding remains local; tool references are restored only from current minted aliases
and still undergo normal runtime validation. Semantic service references normalize
to the current catalog label. Stale staff aliases refuse before availability/approval.
No new context owner, schema, retention assumption or public state was introduced.

The regression intercepts real AiCoreModelService serialized fetch bodies, including
rare full names, staff_scope, corrections and private references. HTTP tests resume
real encrypted context and inspect those bodies across staff changes, negation,
self-name and service/time narrowing. The ten-turn booking ends in one synthetic
INTERNAL-calendar Action Engine receipt. This is not real-model/provider acceptance.
Protection covers known current private values plus existing redaction, not a universal
classifier for arbitrary unknown names in old transcripts. Ambiguous name fragments
remain unbound; canonical staff selection remains authoritative.

`MAYA_DEPLOY_INSPECT_ONLY=1` exits before writes, builds, network or database actions;
four fake-command tests assert ordering and refusal of invalid/conflicting flags.
Existing PREPARE_ONLY still installs dependencies and applies pending migrations.
It is explicitly not a dry run. The [release runbook](widget-release-programme/RELEASE-PACKAGING-AND-TRUST-RUNBOOK.md)
now records matching-runtime revoke before profile change and before rollback,
durable disable evidence, preservation of UNKNOWN recovery and receipts, complete
pending-migration inventory, and the distinction between code/build/profile digests.

## Reproducible local evidence

Evidence root, relative to this checkout's parent:
`pilot-evidence/privacy-release-final/`. Reports retain source SHA and commands.

- Backend census: 5855 PASS, zero failed/skipped, all 601 configured suites exactly once.
- HTTP census: 492 PASS, zero failed/skipped, all 52 configured suites exactly once.
- Shell: 430 PASS; seven explicit LOCAL API NOT GIVEN skips, never counted as acceptance.
- React: 93 PASS. Canonical local payload build and release tests: 18 PASS.
- Backend, scripts and HTTP types, backend build: PASS.
- Documented aggregate runner: 27/27 PASS; inspection mode: 4/4 PASS.
- Full final lint: zero errors, nine existing warnings.
- Fresh isolated source export: owned dependencies, Prisma generation, build, 115
  targeted tests and four compiled-binary tests PASS. Native bcrypt/Prisma load PASS.

Diagnostics are preserved: earlier unpartitioned OOM; native-crash partition splits;
eight initial HTTP failures due to missing carrier react-dom, followed by successful
rerun of the entire affected group; release tests before payload build failed, then
passed after canonical local build. No failed run was silently reclassified.
`backend-summary.json` and `http-summary.json` reconcile the exact configured census.
`checks.json` retains initial failures and the successful replacement checks.

## Local compiled artifact

`release-artifacts/00b8d6b3-local/manifest.json` contains archive hashes, all runtime
file hashes, source blob verification, lockfile/schema and all 105 migration hashes.
The export owns node_modules; it does not use a development dependency symlink.
Both archives exclude node_modules, environment files, keys and certificates.

- Compiled build digest: `061159bb2f9ae13e71912223fc4996b864917ab2e9b4fbe0d839f552a6b49221`.
- Profile digest: `eaddcf2b69dfd890688ace7d25552609b8ec8923c3419f844c416b4d6f0cae45`.
- Frozen website: `d5b310e9a3dc13051eb7f5ccd1e23bf28e8884d6` (unchanged).
- Schema: `77d37c8f8709f34b7eddd0081bf4aac3a10fdbf9092ad590196aa61c2a9e9977` (unchanged).
- Qualified toolchain: darwin/arm64, Node 24.15.0, Prisma 7.9.1, TypeScript 5.9.3.

This is a local compiled package, not Linux/production qualification. A target-native
fresh install/generate and runtime checks, actual target/configuration and migration
inventory, matching release certification, owner Safari/browser and actual provider
acceptance remain prerequisites. A source SHA is not a build digest and the local
synthetic authorization is not production authorization.

No paid model calls, production writes/deploy/migrations, real notifications/payments,
phone actions, push or merge occurred. Only the owned disposable local proof cluster
and synthetic fixtures were used; the owned cluster was stopped after testing. Telegram installation and inbound retention/unlinked
policy decisions remain unresolved. The next path is parent review of this exact
package, then separately authorized target inventory and external acceptance.
