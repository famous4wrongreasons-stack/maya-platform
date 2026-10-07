# History erasure: local privacy owner checkpoint, 2026-10-07

**Subsequent local checkpoint:** [current React privacy and separate Node/PostgreSQL restart](MAYA-HISTORY-ERASURE-UI-CHECKPOINT-20261007.md) now prove explicit confirmation, local clearing, uncertain/offline/manual retry and no text resurrection. The backend evidence below remains historical; populated RT7 preservation and full RT8 discharge are still open.

**Useful result:** the current local privacy endpoint erases the selected conversation under current tenant/user authority, preserves an immutable completion across application restart, and prevents late writers from restoring its content. **17/17 actual HTTP/PostgreSQL tests, 247 targeted unit/architecture tests, K3 10/10, scoped lint and widgets-live types passed.** The working website and real user data were untouched. This is a ready local backend contract; `GAP-HISTORY-ERASE`, UI acceptance and overall MAYA/C10 completion remain open.

Code: `6b4a89b19dc940cb147c885be6ee79bb80a5b12f`, from `c3e37e2447b552bf64d42c1462a3988370535ad0`, isolated branch `codex/maya-development-integration-20261006`. No push/merge/deployment. [Evidence manifest](evidence/maya-development-integration-20261006/history-erasure-owner/manifest.json), SHA-256 `9950e8f258a6195e228ecb9637cd9b82556216b6ceb7979ebc6868c4cf5deb37`, binds four committed source trees and 23 copied artifacts. Installed dependencies and aggregate release gates are outside this binding.

## Contract and scope

`POST /api/privacy/conversations/:conversationId/erasure` accepts exactly `{requestId: UUID}`. Both UUIDs are normalized before locks and digesting. Tenant, actor, session and principal proof come from existing authentication and `PrincipalResolver`; no DTO field, chat text, widget COMMIT or model output authorizes deletion. A11 remains the authority: class-s handoff to `shell.privacy` at `SESSION_VERIFIED`.

The successful response is `{contract: 'maya.privacy.history-erasure/1', outcome: 'COMPLETED', requestId, conversationId, erasedAt}`. Replays return the original completion, not a claim to have erased newly created data. Other conversations, other principals and foreign tenants are not selected as a fallback. A changed proof/conversation under the same request UUID conflicts; inaccessible and unknown first conversations get the same refusal. Every retry rechecks current authority.

`HistoryErasureOwner` runs the existing `WidgetConversationErasureJob` in one `ReadCommitted` transaction. Request identity lock precedes the initial current-principal resolution and conversation lock. The same resolver runs again after a possible conversation-lock wait, preserving the existing principal→conversation lock order while checking fresh Tenant/Staff facts. The exact proof must still match. Database time is read after those locks.

Existing `WidgetErasureTombstone` rows bind server-derived request and scope digests. The lookup groups distinct refs; two arbitrary rows cannot hide another scope. First success requires a live owned turn and its actual atomic tombstone. Zero-write success is refused. Completed retries never rerun the job. No new table, conversation store, schema migration or retention policy was introduced.

Privacy transport lives in `src/privacy`; `WidgetsModule` still registers exactly `WidgetsController`, and its two interaction routes are unchanged. The erasure ledger is not discharged or advertised as a finished carrier action.

## Closed writer gaps

- Active booking previews persist only the existing A facts reference/owner/principal/TTL. No copied service/staff/slot/branch content is stored before mint. SQL `NULL` and the retained facts read are exercised against PostgreSQL.
- The generic draft writer refuses every non-null content payload before INSERT. The unused legacy `BookingCommitService.persistDraft` therefore cannot create an unlinked C row if called; it is not revived as another booking path.
- The minter locks the conversation and reads the exact live owned turn before emission, intent and render writes. Chat READ passes its existing transaction through the same minter, avoiding an outer-lock/inner-transaction deadlock.
- Generic timeline append/ensure refuse erased conversation anchors under the same lock. Existing typed/Gate 9/reply writers retain their source checks.
- C-bearing submission audit writes take that lock and re-read exact record/emission/turn metadata. A late submission retains A evidence while C fields stay null. Receipt writing/reconciliation retains the canonical AE reference without an utterance copy.
- The architecture check exposed a pre-existing direct Tenant read in the minter. Calendar-source projection now goes through the existing `BookingSelectorOwnerPort` and `CrmService`. Missing owner facts refuse, external branch/revision qualification remains enforced, and source drift still refuses before mint. Only the exact adapter imports were enumerated. The stale K3 token list was synchronized with the already integrated goods receipt owner; no new capability was enabled.

Historical content-bearing draft rows without retained record→emission→turn provenance cannot be attributed to a conversation. **The privacy owner refuses before deletion when such an orphan exists for this exact tenant/principal.** It does not guess provenance, delete real historical rows or silently broaden to principal/account-wide erasure. Their real existence/count was not inspected. Reference-only and other-principal drafts do not block the selected scope.

## Current evidence

| Check | Observed result |
| --- | --- |
| Targeted source tests | 247 tests / 11 suites PASS; includes owner replay, current authority, writer fences, booking draft behavior and architecture ratchets. |
| Actual HTTP/PostgreSQL | 17 tests / 3 suites PASS, no skips or retries, at the committed code above. Seven existing RT6 cases, five late-writer cases, five authenticated privacy HTTP cases. |
| HTTP admission | Real AppModule, production guards, login-issued token, no guard override. Unknown/foreign/malformed refusals; concurrent dedupe; same request/different conversation conflict; changed proof and revoked authority. |
| Controlled concurrency | Existing advisory and shared-draft row-lock regressions remain green. New audit writer is observed waiting via `pg_locks`/`pg_blocking_pids`; new HTTP request is observed waiting before tenant deactivation, then refuses with no erasure. |
| Restart scope | Fresh Nest application instances over the same running temporary PostgreSQL, with a fresh login. The same request returns the same completion and leaves subsequent conversations intact. **Not a separate binary/process or PG restart.** |
| K3 / lint / types | 10/10 K3 structural checks, scoped ESLint and `test/tsconfig.widgets-live.json` PASS. |
| Cleanup | Runner `clusterStopped: true`, `postRunSourcesUnchanged: true`; independent `pg_ctl status` exit 3 and absent `postmaster.pid`. |

Raw run: `/tmp/maya-history-erasure-owner-20261007-pg-01`. The finite runner owns its private cluster and loopback listeners, limits Node heap to 3072 MiB, PostgreSQL shared buffers to 64 MiB/work memory to 4 MiB/max connections to 30, uses one Jest worker and a 300-second test bound. Only its own cluster is stopped. Foreign preview `4177` is untouched; the heavy slot is released.

Initial unit expectation failures, test-only type/lint failures and the stale architecture baseline failures are retained in the archive rather than overwritten as successes. The final fixes preserve assertions and closed boundaries. Independent code review identified the post-wait authority race; the second resolver and controlled HTTP negative close that finding. Final independent artifact review confirmed all 23 hashes/sizes and byte-identical raw copies, all four Git source-tree bindings, the 17/247 test results and cleanup evidence; no mismatches or new blocking findings.

The original RT6-2 fixture seeds an appointment and loyalty account, but compares an empty consent query. It still does not qualify a populated consent register or every RT7 canonical owner. Late receipt tests use an explicitly synthetic AE reference, not an executed canonical booking claim. The runner records provider/model calls as expected zero scope; external egress is not independently measured. Real YCLIENTS/model acceptance is not claimed.

## Remaining work and exact external blocker

The carrier still needs explicit privacy confirmation, correct scope/refusal presentation, old-generation response suppression, timeline/widget-vault/pending-context clearing and reload verification. No UI control was enabled here. Independent process/PG restart and populated RT7-owner preservation remain separate qualification work. The existing Occupancy/C9 and branch-booking checkpoints retain their own evidence; this checkpoint introduces no C10 initiator or background authority.

The metadata SSH inventory remains paused. Automatic approval review rejected the exact action before process creation; it never ran and was not retried or bypassed. The parent is handling the owner's precise permission question. Setup, credential admission and paid/model calls remain separate even if metadata permission is later granted.

Proposed scope: one `python3 - --collect` over existing SSH to `botadmin@api.mayaos.ru` through the existing proxy, no sudo. Read only metadata of `maya-booking-proof-db.service`, `maya-booking-proof-broker.service`, `maya-booking-proof-followup-paid-followup-2.service`; numeric UID/GID of `botadmin`, `maya-booking-proof` and `maya-booking-broker`; versions, numeric RSS/headroom/process stats; numeric stat metadata for at most 16 validated explicit paths. Unit metadata may name environment/credential file paths, but no values or file contents are read. No env, credential, config, log or permit contents; no DB connection or production rows. No remote files, users, databases or services are created/changed. The local wrapper only creates a new `/tmp` results directory. Collector bound 600 seconds, commands 10 seconds/32 KiB, outer SSH 620 seconds; budget $0, model/provider calls 0.

The exact unit-property whitelist is `FragmentPath`, `User`, `Group`, `SupplementaryGroups`, `EnvironmentFiles`, `LoadCredential`, `ActiveState`, `SubState`, `MainPID`, `PrivateNetwork`, `JoinsNamespaceOf`, `ProtectSystem`, `NoNewPrivileges`, `ReadOnlyPaths`, `ReadWritePaths`, `IPAddressAllow`, `IPAddressDeny`, `MemoryMax`, `TasksMax`. Path stat is confined to the declared proof-root/control/evidence paths and validated unit-declared environment/credential paths; no final-symlink following, ACL inference or content read. Numeric process inspection is limited to the units' observed MainPID. It does not read `Environment`, `SetCredential`, `ExecStart`, command arguments or logs.

Exact rejected tool approval question:

> Выполнить ограниченный read-only metadata collector через существующий SSH-доступ к api.mayaos.ru: три исторические proof units, без sudo, чтения содержимого секретов, изменений сервисов или платных вызовов?

Original fuller approval proposal:

> Разрешите один запуск приложенного read-only collector на `botadmin@api.mayaos.ru` через существующий доступ: максимум 10 минут, бюджет $0, provider/model calls 0. Только три перечисленных historical proof units, три principals, версии/RSS/headroom и metadata максимум 16 явно объявленных paths; без чтения содержимого environment, credentials, configs, logs или permit. Никаких setup, запусков/изменений units, production или website proof. По результату подготовим конкретный setup-план для нового sibling run directory; старые candidate/evidence/permit остаются неизменными. Setup, credential admission и paid/model calls этим запросом не разрешаются.

Exact reviewer reason:

> This performs an unapproved SSH access to a private server and collects potentially sensitive infrastructure metadata; the user authorized the development task but not this exact remote inventory action.

The reviewer also said: **“Do not bypass this rejection through a workaround or indirect execution.”** Full exact tool arguments remain in the earlier [rejection artifact](evidence/maya-development-integration-20261006/history-erasure/metadata-action-rejected.json).
