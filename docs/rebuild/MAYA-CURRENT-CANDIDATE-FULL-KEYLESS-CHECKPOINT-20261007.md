# Full current-candidate keyless HTTP checkpoint

**Useful result:** all 24 authored dialogs / 33 user turns now complete against the current candidate through the actual authenticated HTTP application, fresh PostgreSQL and a separate keyless broker. All 65 source preflights match their expected outcomes. Two explicit cancellation-window requests use the existing C9 path and persist proposal revision 1, with two evidence references, two bounded options and `noSideEffects: true`. This is local offline mechanics evidence, not real-model language quality, live YCLIENTS acceptance or C10 completion.

Exact tested code: **`832c86c6e2a064636aca39bbbb5546c7d61e96d2`**, isolated branch `codex/maya-development-integration-20261006`. The [archive](evidence/maya-development-integration-20261006/current-candidate-full-keyless/archive.json) records manifest **`f1ce3e57db8c79ef1c5b050de7613967fd1ff637e224bb2d84737d88e95e66f4`**, 39 verified source/harness paths and unchanged corpus SHA `6913f69c29a33cf42c1a9c03ea5dfde6bd7dd2f7ee1e1142977f55fbfc6ea996`. The corpus has eight development families and zero independent holdout families. No runtime overlay or assertion weakening was used.

## Executed outcomes

The fresh run is `/tmp/maya-candidate-full-keyless-20261007-01`. There are 32 HTTP 201 chat turns and one expected HTTP 401 after session revocation. Thirty turns use fixed synthetic clarification through the real serializer/parser and separate broker. The other three are two deterministic explicit C9 Occupancy first turns and the revoked session. Those three contribute zero model coverage. Source preflights are independent of model selection: four HTTP 200, 43 HTTP 201, two 401, one 403, nine 404 and six 503. No cases remain unexecuted.

Both C9 first turns save an AVAILABLE proposal with a persistent run, work receipt and version identity. Their positive availability uses a **synthetic branch-qualified domain port**. It verifies C5/C9 mechanics; it cannot establish successful native branch-scoped YCLIENTS availability. The actual YCLIENTS adapter separately returns the one finite synthetic configured-company slot with null branch, and refuses unbound selected branches before availability transport. The [branch-source checkpoint](MAYA-YCLIENTS-BRANCH-AVAILABILITY-CHECKPOINT-20261007.md) remains authoritative for that limitation and shared booking-caller impact. `availabilityEvidence` labels describe configured fixture sources; BI/Lifecycle INTERNAL labels alone are not proof that availability was invoked.

Maximum serialized request is **93,222 bytes**, below the unchanged 98,304-byte cap. Maximum conservative input reservation is 97,318. All **30 request tuples**—case, turn, body hash and byte length—match between application and broker. Attempt/input/output/money reservation counters match: 30 attempts, 2,426,930 input tokens, 36,000 output tokens and **$3.3461076 offline bookkeeping**, not provider spend. The app counts all 24 dialogs/33 turns; the broker correctly counts only 22 dialogs/30 turns with model requests. These are two records of the same reservations, not additive budgets. Minimum observed reservation interval is 6,024 ms.

Both ledgers end `closed`; broker reports `stopped: true`; launcher confirms PostgreSQL stopped, and the owned `postmaster.pid` is absent. Process inspection found no remaining own runner/broker/PG process. Unrelated PostgreSQL instances were untouched. Paid calls, upstream calls, external provider fetches and provider writes are zero. No credentials were loaded, and no outbound notifications or business mutation path was enabled.

The first standalone artifact-verification helper incorrectly compared all application dialog/turn counters to the broker's narrower model-request counters. The corrected helper checks exact request identities, equal reservation counters and each ledger's proper scope. This was a verifier assumption, not a failed HTTP attempt; no runner source, result or raw evidence was changed. The correction is retained in `verification.json`.

## Local profile and checks

The runner accepts an explicit absolute `--pg-bin` and adds a separate `--preflight` mode. It inspects Node 24 and four readable/executable PostgreSQL 16 binaries (`postgres`, `initdb`, `pg_ctl`, `createdb`), canonical installation paths, matching minor versions and SHA256. Each version subprocess receives only LANG/TZ and a five-second timeout. Invalid paths/versions, cross-install symlinks and mixed run/preflight modes refuse before output directories, cluster or network listeners are created. This mode does not inspect environment files, credentials or servers.

Observed execution is **macOS arm64 / Node 24.15.0 / PostgreSQL 16.14**. An explicit installation path removes the hardcoded-Mac-only runner assumption; Linux/server execution remains untested. Recorded memory is a momentary host observation, not peak RSS or admission. Runner heap 256 MB is supplied by the invocation, not enforced by inspecting the parent Node heap. Broker 256 MB, backend/Jest 3,072 MB, one worker, PostgreSQL shared buffers 64 MB, work memory 4 MB and max connections 30 remain the resource plan.

**48 Node tests PASS**: six profile/CLI, 19 current-candidate, eight budget, three child-cleanup, 11 keyless-broker and one broker-contract test. The six profile tests were rerun after the final path-encoding test correction. Full widgets-live TypeScript, scoped ESLint and diff check pass. The HTTP probe is one Jest test containing the corpus/preflights; HAR-13 separately passes two tests with 143 explicit skips. No aggregate gate or production-code change was introduced in this checkpoint; earlier 213 domain tests remain separately dated evidence. Independent review found no blocking code or artifact finding within this scope; its exact qualifiers are archived.

Read-only profile inspection:

```sh
cd maya-saas-backend
NODE_OPTIONS=--max-old-space-size=256 node scripts/conversation-qualification/current-candidate-http.mjs --preflight --pg-bin /absolute/existing/postgresql16/bin
```

Full local proof, only within an authorized serial heavy slot and with a new output directory:

```sh
NODE_OPTIONS=--max-old-space-size=256 node scripts/conversation-qualification/current-candidate-http.mjs --run --broker-preflight --pg-bin /absolute/existing/postgresql16/bin --output /tmp/NEW-UNUSED-PROOF-DIRECTORY
```

## Remaining boundaries

The full latest Mac corpus gap is closed. A separately selected diagnostic server/profile, exact credential reference and authorized reader, process/egress isolation, reviewed live broker and explicit bounded paid decision remain unresolved in the [real-model prerequisites](MAYA-REAL-MODEL-PREREQUISITES-20261007.md). A full no-upstream run on that exact admitted server profile remains necessary. The existing dry broker has no paid switch. No old pilot, key, production DB or permit was reused.

The original explicit request vertical remains one existing C9 with current CRM/C5 facts, saved evidence/version and bounded read/no-action options. No autonomous initiator, new schema/retention contract, second orchestrator or agent framework was added. Website/realbooking files, production, HTTPS, device, push and merge were not touched. **C10 and real-model/provider acceptance are not claimed.**
