# History erasure: scoped kernel checkpoint, 2026-10-07

**Useful result:** the existing dark erasure job now acquires the conversation lock before taking its target snapshot, scopes drafts through retained conversation references, and can clean late children of erased parents on retry. No HTTP erasure route or UI delete action is enabled. `GAP-HISTORY-ERASE` remains open.

Base: accepted `d418e253eb918341f212a4c31a29a698de915b5c`; code `51f420084fef4185f4870a95994a311a0b9bb1b9`. Code checkpoint and artifact hashes are recorded in the adjacent [evidence manifest](evidence/maya-development-integration-20261006/history-erasure/manifest.json). At that initial checkpoint only lightweight local checks ran; no user data was deleted, and no build, PostgreSQL, browser, model, provider or production/site operation ran.

**Subsequent bounded qualification:** after the parent returned the heavy slot, code `bf7257ed1fac9d511a24bd12883a980e2902367e` passed **7/7 actual PostgreSQL tests**, scoped lint and widgets-live types. The current qualification is detailed below and archived separately in [PG evidence](evidence/maya-development-integration-20261006/history-erasure-pg/manifest.json). The earlier light-only evidence and failures remain historical, unchanged. HTTP/UI erasure is still not enabled.

## Existing authority and implemented correction

[A11](MAYA-WIDGET-CONTRACT-V1.1-DECISION-RECORD.md) already approves K12 history erasure: class-s HANDOFF to `shell.privacy` at `SESSION_VERIFIED`. The exact ruling is at lines 388–393; [RT5–RT8](MAYA-WIDGET-CONTRACT-V1.md) are at lines 5921–5937. This is approved implementation work, not a new product/autonomy decision. `conversation.history.erase` stays in `NEVER_CHAT_ACTUATED`; chat text, model output and widget COMMIT do not authorize deletion.

The existing owner is [`WidgetConversationErasureJob`](../../maya-saas-backend/src/widgets/consent/erasure.job.ts), registered as a dark provider. Its only callers remain fixtures; there is no authenticated canonical erasure request owner or callable privacy endpoint.

- `run` explicitly uses `ReadCommitted`. `runInTransaction` permits a future privacy owner to resolve current authority and erase in the same transaction; that caller must also use `ReadCommitted`.
- The Gate 9 advisory lock is a separate awaited statement. A lock inside the old data CTE could wait with a snapshot taken before the competing writer committed.
- Tenant, principal and conversation qualify persistent scope anchors. Already erased parents remain anchors, allowing a subsequent kernel run to clear late receipts, audits or renders. Only non-erased rows are update targets.
- Drafts require a retained `confirmationOfKind = draft` / `confirmationOfRef = draftRef` link in the selected conversation, plus the draft's own tenant and principal fence. Unlinked drafts are preserved; this is explicitly incomplete for a full erasure promise.
- Every UPDATE also rechecks `erasedAt IS NULL` after row-lock acquisition. Overlapping conversations which reference one draft cannot stamp it twice merely because both earlier snapshots selected it.
- UUID aliases are refused before acquiring locks, preventing uppercase/braced UUID spellings from selecting one database tuple under different advisory lock identities.
- The C/X field map, schema, canonical business rows and retained audit references are unchanged. Row idempotency is not claimed as immutable erasure-request replay.

## Initial lightweight verification and limits

| Check | Result |
| --- | --- |
| Erasure job and consent fence unit suites | **45 tests / 2 suites PASS**, final result archived. Includes lock-wait barrier, lock failure, scope anchors, draft linkage, update-local guards and UUID aliases. SQL shape checks do not execute PostgreSQL. |
| Existing migration/schema unit suites | **9 tests / 2 suites PASS**. No schema or retention change. |
| First unit attempt | 43 passed, 2 failed because existing registry expectations still said 227 AE rows / 49 tools. The integrated goods lane has 228 / 51. Counts were updated; consent = 3 and identity = 6 fences are unchanged. Raw failure retained. |
| Formatting / whitespace | Prettier on the four changed files and `git diff --check` pass. |
| Scoped ESLint | **Incomplete:** exit 134, heap limit 512 MiB, `Reached heap limit Allocation failed - JavaScript heap out of memory`. No larger retry while the design task owns the heavy slot. |
| Type check, build, HTTP/PG, browser | **Not run for this checkpoint.** |
| PG regression source | Existing RT6-2 fixture now links its synthetic draft explicitly. New RT6-4 covers sibling/foreign/unlinked drafts; RT6-5 covers late-child retry; RT6-6 holds a writer lock, observes the eraser's actual advisory wait by PID, then commits the writer. All remain authored, unexecuted fixtures. |

The raw failed and final unit results, schema result, exact rejected metadata tool request and hashes are archived together. No historical PG/HTTP proof is relabeled as acceptance of this code. Independent review found the UPDATE race and confirmed the narrower correction after it was applied; its qualification remains dark-only and does not close RT8.

## Subsequent owned PostgreSQL qualification

[`scripts/history-erasure-proof.mjs`](../../maya-saas-backend/scripts/history-erasure-proof.mjs) reuses the existing C9 proof's clean environment, finite setup commands and owned-child cleanup. It starts a new private cluster and random loopback proof database, runs only `erasure-ordering.live-spec.ts`, and stops that cluster in `finally`. No browser build or preview is included. The four committed `src/test/scripts/prisma` trees are captured before execution and checked for changes afterward; installed dependencies are outside this binding.

At `bf7257ed`, **all seven PG tests passed without skips or retries**: Gate 9 ordering; C/X clearing with byte-identical canonical appointment/consent/loyalty reads; erased predecessor refusal; sibling/foreign/unlinked draft preservation; late-child retry; fresh snapshot after an observed advisory-lock wait; and one shared-draft tombstone after both erasers are observed waiting on row locks. The last case specifically qualifies the UPDATE-local `erasedAt IS NULL` predicate under overlapping snapshots. Synthetic reference rewrites in these storage fixtures are not minted COMMIT authority. RT6-2 explicitly seeds an appointment and a loyalty account; its consent query is compared before/after but no consent fact is seeded. It therefore does not qualify preservation of a populated consent register or every RT7 canonical owner.

The updated unit suites passed **45/2**; scoped ESLint and `test/tsconfig.widgets-live.json` type checking passed at a 3,072 MiB heap limit. The first larger lint attempt found six test-only typing issues; their failure log and the subsequent pass are preserved. The earlier 512 MiB OOM remains in the initial evidence. No build or browser check was added.

Cleanup was independently checked with `pg_ctl status` on the exact owned directory: exit **3**, no `postmaster.pid`. The runner completed, source trees remained unchanged, and the heavy slot was released. Foreign design preview `4177` and other clusters/processes were untouched. Raw run `/tmp/maya-history-erasure-pg-20261007-01` and its archived copies match. The runner labels zero provider/model calls as expected scope, not measured egress counters. This is actual storage concurrency proof, not HTTP authentication, privacy UI, request restart/replay or model/provider acceptance.

## Conversational UI contract for the existing privacy surface

This describes the remaining implementation target, not an enabled UI or endpoint:

1. A conversational request to delete history can explain the scope and hand off to **«Приватность и данные»**. It must not execute deletion or answer «Удалено». Until the owner and RT8 proof exist, retain the capability gap and do not mint an actionable erasure promise.
2. The verified privacy surface names the exact conversation the current principal can access. Use **«Удалить эту переписку»**, not a claim to delete every historical account record. Current proof hashes can change after role, branch or binding changes; they are not an account-wide historical identity index.
3. Confirmation copy must explain: **«Будут удалены сообщения и сохранённое содержимое карточек этой переписки. Записи на услуги, согласия, бонусы и результаты подтверждённых действий сохранятся.»** Other conversations must not silently be selected as a fallback.
4. Transport authentication and the current principal resolver must be checked again inside the erasure transaction. Tenant, actor and principal proof come from those owners, never request fields or presentation mode. Foreign and inaccessible conversation identities get the same non-disclosing refusal.
5. The owner must define immutable request scope and replay before accepting a confirmation. A timeout/reload must reconcile that exact request; it must neither erase newly created history nor report success from a network error. No raw text or raw text hash is needed in request evidence.
6. Only after committed success may the carrier discard the selected timeline, widget vault and pending local chat context and start a fresh conversation. In-flight responses from the previous generation must be ignored; reload must not restore deleted content or replay a booking. Canonical `UNKNOWN`/READY outcomes stay with their existing owner.
7. No trigger on mounting privacy, opening a link, speaking a phrase or background polling. Native/web use the same owner. No new permission rung, data-subject act or C10 authority is introduced here.

## Exact engineering blockers before HTTP activation

| Blocker | Existing source and next work |
| --- | --- |
| Orphan draft content has no conversation provenance | `WidgetDraft` has no conversation column. `EffectRouterService.completeBookingPreview` writes `putDraft` before mint, outside the mint transaction. Use the existing owner to make draft/link/mint atomic, or avoid the unused copied C-content for this specific draft path. Historical unlinked rows cannot be assigned to a conversation by guessing; broader account erasure must not be inferred. |
| In-flight writers can save children after erasure | `WidgetEmitterService.emitInternal` opens its transaction at line 1140 without a general erasure lock/parent-liveness protocol. Late-child retry cleanup is mitigation, not a promise that no data remains after the first run. The writer protocol must be fixed before exposing deletion. |
| Naive emitter locking deadlocks | `ChatReadTrigger.afterCompletedRead` already holds the conversation lock in an outer transaction (lines 97–98) while awaiting an emitter that opens another transaction. Reuse one transaction through the existing emission owner or move the lock/dedupe into its atomic write; do not put a second same-key lock on another connection. |
| Request replay and conversation closure | No canonical request owner currently freezes a confirmation and reconciles its retry. The kernel's `erasureRequestRef` is a tombstone correlation, not a single-use authorization or immutable request ledger. Complete this within the existing owners before wiring HTTP. A schema/retention change, if actually necessary, needs its exact design and separate decision; none is requested or made in this checkpoint. |
| Current runtime qualification | Scoped types/lint and seven isolated RT6 PG fixtures now pass, including shared-draft overlap. Still required: erase-before/after-mint ordering after the writer protocol is corrected, authenticated privacy admission, revocation, foreign HTTP rejection, request restart/replay and no content restoration. Only then evaluate RT8 and the UI action. |

The working website, initial Client binding, C10 machine authority and paid model acceptance are outside this checkpoint. The original explicit-request Occupancy development slice and accepted booking/branch checkpoints remain independently qualified; this work does not announce MAYA or C10 completion.
