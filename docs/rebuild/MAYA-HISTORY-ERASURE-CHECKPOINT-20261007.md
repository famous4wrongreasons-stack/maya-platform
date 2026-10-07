# History erasure: scoped kernel checkpoint, 2026-10-07

**Useful result:** the existing dark erasure job now acquires the conversation lock before taking its target snapshot, scopes drafts through retained conversation references, and can clean late children of erased parents on retry. No HTTP erasure route or UI delete action is enabled. `GAP-HISTORY-ERASE` remains open.

Base: accepted `d418e253eb918341f212a4c31a29a698de915b5c`; code `51f420084fef4185f4870a95994a311a0b9bb1b9`. Code checkpoint and artifact hashes are recorded in the adjacent [evidence manifest](evidence/maya-development-integration-20261006/history-erasure/manifest.json). Only lightweight local checks ran; no user data was deleted, and no build, PostgreSQL, browser, model, provider or production/site operation ran.

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

## Verification and limits

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
| Current runtime qualification | Once the heavy slot is available, run scoped types/lint and the prepared isolated RT6 PG fixtures. Add overlap proof for a shared draft and erase-before/after-mint ordering; then prove authenticated privacy admission, revocation, foreign rejection, restart/replay, no content restoration and byte-identical canonical reads. Only then evaluate RT8 and the UI action. |

The working website, initial Client binding, C10 machine authority and paid model acceptance are outside this checkpoint. The original explicit-request Occupancy development slice and accepted booking/branch checkpoints remain independently qualified; this work does not announce MAYA or C10 completion.
