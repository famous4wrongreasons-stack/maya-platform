# History erasure: current React and process restart checkpoint, 2026-10-07

**Useful result:** the existing `shell.privacy` route now uses the ready privacy backend through one canonical runtime port. The user explicitly confirms deletion of the current conversation; local drafts, selection, timeline, widget handles and pending work are invalidated. A lost completion stays uncertain and permits only a manual retry with the original request identity. Actual current React, real local HTTP, separate compiled Node processes and a PostgreSQL stop/start prove deletion survives reload/relogin and the same request returns its original completion without extra tombstones. Other conversation content survives.

Runtime code: `e9b916c3cb2a08ab508a49f8080077ee160e806a`; final proof candidate: `dff8ec0962df0346f3e5c1f706cfa7be1fdceb05`; base: `119cfecb47b3e50eed6bad9a204cd2a7570d970b`. The three intervening commits change only test/harness files. Isolated branch: `codex/maya-development-integration-20261006`. The working website, foreign design worktree, real subjects and providers were untouched. No push, merge or deployment.

[Evidence manifest](evidence/maya-development-integration-20261006/history-erasure-ui/manifest.json) SHA-256 `1fdd4b3c4e21c85b82274994cef67e375bd4240b78fe7a5bd6c210ceb9453561`, binds 28 changed source/test paths, three complete Git source trees, 80 copied raw artifacts and the generated backend/React artifact hashes. The separately bound independent review verifies all 80 copies, 28 source paths, three trees and 2,898 generated artifact hashes; its document review has no blocking finding. The [previous backend checkpoint](MAYA-HISTORY-ERASURE-OWNER-CHECKPOINT-20261007.md) remains the evidence for its 247 unit/architecture, K3 10/10 and 17 HTTP/PG cases; those counts are not rerun or added to this checkpoint's test totals.

## Existing authority and local behavior

A11 already admits class-s handoff to `shell.privacy` under the verified session. The UI does not supply conversation, tenant, actor or request IDs. Runtime captures the current server-owned conversation and generation, allocates one request UUID and reserves an immutable operation before synchronous subscribers can replace the session. Each callback boundary and result settlement checks operation identity and session epoch. The server re-resolves the principal and owns deletion scope on every attempt.

The confirmation states that only current conversation messages/cards/drafts are selected; other conversations and canonical appointments, payments and mandatory audit are preserved. Entering the panel or displaying the confirmation does not make a request. Only the separate confirmation calls the existing `POST /api/privacy/conversations/:conversationId/erasure` with exactly `{requestId}`. Chat/model text and presentation still grant no authority; `conversation.history.erase` remains `NEVER_CHAT_ACTUATED`.

Before sending, runtime closes personal detail/forms, explicitly cancels voice, freezes composer/history work, advances the local generation and releases all widget entries, including detail-only entries, vault tokens and pending callbacks. React clears its unsent draft, awaiting reference, refusal text, focus and selection before paint. Late chat, history, receipt, widget-render and form responses cannot repopulate the erased generation. Session replacement also invalidates a synchronously queued old operation even when the new login is the same user.

Transport normalizes strict UUIDs and validates the exact completion contract, echoed scope and UTC timestamp; runtime checks its immutable tuple again. One ordinary auth refresh can occur, but there is no automatic network retry. Lost, truncated, aborted, malformed or server-error responses keep the UI uncertain and old actions frozen. Manual retry uses the same request. Definite refusal cannot start a replacement deletion; sign-out is the exit. Only a verified completion says deleted. A subsequent server-owned conversation resets the old completed status to idle. Retry state exists only in memory: reload does not invent a completion or resume a deletion automatically.

No backend store, schema, retention policy, C9 orchestrator or background C10 initiator was added. Historical orphan content still causes the existing owner to refuse the exact scope before erasure; the UI uses a neutral conflict explanation.

## Port handoff for the separate design task

Use the exported **`privacy`** from `maya-carrier-react/src/runtime/compose.ts`; types are `PrivacyPort` / `PrivacyView` in `maya-chat-shell/src/shell/ports.ts`. The registered route remains `shell.privacy`. This document is the handoff; no external design notification or design-worktree edit is claimed.

```ts
interface PrivacyPort {
  view(): PrivacyView;
  subscribe(listener: (view: PrivacyView) => void): Cancel;
  requestConfirmation(): void;
  cancelConfirmation(): void;
  confirmErasure(): void;
  retry(): void;
}
interface PrivacyView {
  readonly phase: 'idle' | 'confirming' | 'erasing' | 'uncertain' | 'refused' | 'completed';
  readonly available: boolean;
  readonly localEpoch: number;
  readonly failure: 'forbidden' | 'unavailable' | 'conflict' | 'invalid_request' | 'signed_out' | null;
  readonly erasedAt: string | null;
}
```

`available` means a new current-conversation confirmation can begin, not permission for retry. In `uncertain`, it is false but `retry()` is allowed for the captured request. `localEpoch` is a local clearing signal, never authority. Actions take no arguments; the carrier must not reconstruct a target or call the endpoint itself.

## Executed evidence

| Check | Observed result |
| --- | --- |
| Targeted runtime/net/conversation/shell/voice | **147 tests PASS**, including 16 privacy cases, three adversarial replacement-session callbacks and the compiler-backed exact URL ratchet with eight mutation negatives. |
| React presentation/browser guard | **8 tests PASS**: five presentation cases and three finite network guard cases. |
| Types/build/lint | Shell build, React typecheck, full widgets-live TypeScript and scoped HTTP-probe ESLint PASS. New `.mjs` files received syntax checks; excluded project-service files are not claimed as ESLint accepted. |
| Actual current React + HTTP | Prepare and resume each pass **one Jest test**, no skips. Synthetic debug-email login through the real current UI; no browser token injection. Real compiled `dist/src/main.js`, `NODE_ENV=test`, safe model. |
| Lost-response behavior | Relay consumes a real completed deletion, forwards its real 200 headers/Content-Length, writes only a proper prefix of that real body and closes. Browser records a failed body, then uncertain. Offline retry fails before backend; online manual retry returns the same UUIDs and `erasedAt`. No fabricated completion response. |
| Separate restart | Backend PID **22014 → 22630**, probe **21979 → 22598**; observed PG start **2026-10-07T23:40:50.457Z → 2026-10-07T23:41:57.202Z**. Retained exact HTTP request after restart returns the same completion and unchanged tombstone hash. |
| Reload / no resurrection | New real UI login after reload and after process/PG restart: erased synthetic text absent, sibling conversation present, no automatic erasure request. No `/ai/chat` or business widget intent. |
| Cleanup/source freeze | Successful manifest records `postRunSourcesAndArtifactsUnchanged: true`, `clusterStopped: true`. Independent local `pg_ctl status` is 3, postmaster PID files absent and all four reported backend PIDs across failed/successful runs gone. Only owned services stopped; foreign preview 4177 untouched. |

Raw successful output: `/tmp/maya-history-erasure-ui-20261007-pg-04`. Each run uses one Jest worker/browser, bounded 1536 MiB backend/probe and 256 MiB browser heap, PG 64 MiB shared buffers/4 MiB work memory/30 connections. Only public finite reports/build logs/screenshots are copied; private restart credential fixtures, raw backend auth logs, PG data and local dependency trees are excluded.

Raw tool logs retain their original trailing whitespace/blank lines to preserve byte identity. The full staged archive therefore has whitespace diagnostics; authored code/docs/JSON pass the scoped diff check. No evidence file is reformatted to make that check green.

Failed attempts remain in the archive: the initial sandbox listener failed before service creation; the local loopback proof then received automatic approval. `pg-02` exposed the fixture's missing existing `widgets.runtime` feature, fixed only in the seed. `pg-03` exposed Chrome's transparent retry on a pre-header drop; the fault was corrected to truncate the actual body after headers. `pg-04` passed. All owned clusters are stopped.

The initial broader runtime selection had nine failures: two exact export/path census expectations were updated for the new port; **seven L27 failures are reproduced on untouched base `119cfecb`** using a read-only Git archive. They concern repeated-Dismiss expectations against readonly booking terminal receipts. Their original and baseline logs are retained; the aggregate suite is **not** represented as green. Final scoped TypeScript and lint at `dff8ec09` also pass.

Independent code review found and drove fixes for the synchronous replacement-session race, proof cleanup/late-spawn handling and array-to-UUID coercion in the browser guard. Final archive/restart review is recorded separately in the evidence manifest.

## Limits and next safe completion gap

The browser fixture contains synthetic textual history and an unsent draft, **not populated historical widgets or receipts**. Its no-controls check is therefore not evidence of deleting populated historical action rows. Seven screenshots are retained, but uncertain/completed captures have partial headless painting and the privacy panel inherits a serif font unlike the surrounding chat. This is functional acceptance, not full visual/new-design acceptance.

This is neither production configuration nor real YCLIENTS/model/voice acceptance. External egress is expected zero by scope but not independently measured. The previous RT6 fixture seeds an appointment and loyalty account, but its consent query is empty. Full RT7-owner preservation and RT8/`GAP-HISTORY-ERASE` discharge remain open; no overall MAYA or C10 completion is claimed.

**Selected next safe gap:** create a finite synthetic fixture with populated canonical appointment, consent register, loyalty, Client binding, ActionExecution, approval and receipt/audit owners; compare their owner reads before/after erasure while populated historical C fields/receipt rendering disappear across reload. Reuse current owners and retention classification. RT7 is a scope boundary, not a global data-rights guarantee. RT8 also requires the classification/fixture/package-gate/ledger review before discharge. No new authority, store or real data is needed for that local work.

## Exact remote metadata blocker, unchanged

Automatic approval review rejected the remote action before process creation. It never ran, was not retried, and has no workaround. The parent is handling exact owner permission; the approved local loopback proof does not authorize SSH. Metadata permission would not authorize setup, credential admission or paid/model calls.

The paused action is one `python3 - --collect` over existing SSH to `botadmin@api.mayaos.ru` via the existing `mocine3388@prime.beget.com` proxy, without sudo. Existing key references are `~/.ssh/yandex_bot` and `~/.ssh/beget_deploy`; no key contents are read into evidence. Flags: `BatchMode=yes`, `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, `ConnectTimeout=8`, `ConnectionAttempts=1`.

Scope: metadata for exactly `maya-booking-proof-db.service`, `maya-booking-proof-broker.service`, `maya-booking-proof-followup-paid-followup-2.service`; numeric UID/GID for `botadmin`, `maya-booking-proof`, `maya-booking-broker`; versions and numeric RSS/headroom/process statistics only for observed MainPID; numeric stat for at most 16 validated explicit proof-root/control/evidence and unit-declared environment/credential paths, without final-symlink following or ACL-grant inference.

Unit-property whitelist: `FragmentPath`, `User`, `Group`, `SupplementaryGroups`, `EnvironmentFiles`, `LoadCredential`, `ActiveState`, `SubState`, `MainPID`, `PrivateNetwork`, `JoinsNamespaceOf`, `ProtectSystem`, `NoNewPrivileges`, `ReadOnlyPaths`, `ReadWritePaths`, `IPAddressAllow`, `IPAddressDeny`, `MemoryMax`, `TasksMax`. No `Environment`, `SetCredential`, `ExecStart`, command arguments, environment values, secret/credential/config/log/permit contents, DB connection, SQL or rows. No remote file/user/DB/service creation or change; local wrapper creates only a new `/tmp` result directory. Collector 600 seconds; commands 10 seconds/32 KiB; outer SSH 620 seconds; $0, expected zero model/provider calls.

Exact rejected approval question:

> Выполнить ограниченный read-only metadata collector через существующий SSH-доступ к api.mayaos.ru: три исторические proof units, без sudo, чтения содержимого секретов, изменений сервисов или платных вызовов?

Exact original reviewer reason:

> This performs an unapproved SSH access to a private server and collects potentially sensitive infrastructure metadata; the user authorized the development task but not this exact remote inventory action.

The reviewer also instructed: **“Do not bypass this rejection through a workaround or indirect execution.”** [Original rejection artifact](evidence/maya-development-integration-20261006/history-erasure/metadata-action-rejected.json). Collector: `maya-saas-backend/scripts/conversation-qualification/diagnostic-readonly-inventory.py`, SHA-256 `1596be6da3d38772b772f8f81bcde4dfb50c33146018860dd494b74ea07e5ace`. `NOT_ISSUED`.
