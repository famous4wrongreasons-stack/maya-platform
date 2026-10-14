# Remaining Companion screens — source map

Read-only inspection of `5b8d99db12a41e5522ad71f0a9a7972e2070f0ec`.
No endpoint was invoked and no new backend acceptance is claimed here.
The supplied prototype defines appearance and desired UX; it is not an authority
contract. Existing backend capabilities must be reused, not declared absent simply
because React lacks a tab.

| Screen | Existing concrete source | Unresolved part of the proposed UI |
| --- | --- | --- |
| Feed | `inbox/inbox.controller.ts`: GET `/inbox`, authenticated current tenant/user; `InboxService.listForUser` filters tenant+user+not-deleted, bounds 1–100, returns persisted items and read state | Exact classification into Salon/Opportunities, source freshness and saved-item owner. POST `:id/read` is read acknowledgement, not Save. Raw payload/deep_link is not navigation/Action Engine authority |
| Tasks | `package5-wave1/operational-work.controller.ts`: GET `/operational-work` returns `maya.operational-work/1`, current user's task-kind A23 rows, limit 50. Separate `tasks.list` chat READ uses current A23 owner and explicit filters | Runtime typed port and closed route mapping; differentiate complete vs partial list. Don't claim global count from a bounded list. No reopen/undo endpoint exists in the inspected controller; prototype undo cannot be implemented by toggling a local checkbox |
| Task create/complete | POST `/operational-work/create` and `/complete` exist and call canonical cutover/Action Engine with idempotency key. Create requires manager roles; complete uses exact actor's Inbox locator bound to WorkItem | Explicit form/date semantics and receipt/error reconciliation for the new carrier surface. `task_id: null` does not permit substitution with `work_item_id`. Don't expose assignment to another user merely because the body supports it |
| Materials | `owner-reports/owner-report-snapshots.controller.ts`: GET `/owner-reports`, `:id/snapshot`, `:id/download`; actor/tenant passed to OwnerReportStore | This is persisted report snapshots, not every document/media category shown in prototype. Need finite included types and typed projection; do not treat internal legacy report trigger as a library writer |
| Media | Existing narrow GoodsPhoto capture/OCR and closed `fs.media` detail route | Generic upload/list/storage lifecycle is not established by those paths. No generic file store added |
| Ideas/plans | Inbox taxonomy includes `growth_plan`; C9/widget pathways already carry server-authored plans/actions | A taxonomy member is not proof of a complete fresh recommendation reader. Determine current producer, title/body freshness, tenant/principal scope and exact task-create receipt before wiring a list |
| Calendar | Existing `fs.calendar` via canonical server NAVIGATE, DetailSheet and close/parent return | Independent header entry must resolve through that owner; no caller-chosen calendar or local `setSheet` authority |

`maya-chat-shell/src/routes/registry.ts` remains unchanged with five existing base
destinations. `src/shell/ports.ts` does not currently provide the four new dedicated
list ports. Runtime/core transport—not the React component—must own their requests,
refusal, refresh/session teardown and validated results. Existing contract/registry
ratchets must move together if their finite vocabulary is explicitly extended.

Recommended implementation order after this visual unit: Tasks read-only projection
over existing A23 → persisted Feed/report readers → precise Ideas source → forms
and mutations only under the matching owner. Keep missing, forbidden, stale and
empty distinct. Preserve current-user scope until a broader product contract exists.

Concrete policy gaps in the supplied prototype are **task undo**, **Save from Feed**,
**generic media storage**, and **new route/source vocabulary**. No decision for those
was silently made in the AChat visual change. This map is not a release blocker
for the old closed-input profile and does not reopen C10 or HANDOFF.

## Implemented continuation (2026-10-13)

The retained Feed/report readers described above now have a bounded local
implementation at `ccd38792e3772f65165a9b2f0a7706e1151b145d`:
[Feed/Library checkpoint](../../MAYA-COMPANION-FEED-LIBRARY-CHECKPOINT-20261013.md).
This does not close the separate Save, generic media, model-context discussion,
Ideas or task-command owner gaps. Earlier checkpoint receipts remain historical.

## Task actions checkpoint (2026-10-13)

Кандидат `88fa811644b59211d484a47816e44b604e4f1387` подключил ручное создание задачи самому себе без срока и
завершение через существующую A23/Inbox binding. Read-only этап выше остаётся
историческим. Date selection, assignment, undo и Ideas-to-task не включены.
См. [checkpoint](../../MAYA-COMPANION-TASK-ACTIONS-CHECKPOINT-20261013.md) и
[source review](../maya-companion-task-actions-20261013/IDEAS-SOURCE-REVIEW.md).

## Ideas source inspection checkpoint (2026-10-14)

`e9cd4ad2d7da61288e2026222835437b32ebd29c` connects the existing C8 list reader
for inspection of retained calculation metadata, with current reread, exact revision
binding, local expiry and session invalidation. Recommendations, numerical displays,
plan execution and plan-to-task mapping are not implemented by this unit. The source
review above remains historical; see `../../MAYA-COMPANION-IDEAS-CHECKPOINT-20261014.md`
and `../maya-companion-ideas-20261014/README.md` for fresh scoped evidence.

## Ideas value presentation checkpoint (2026-10-14)

`e8aa7e484433ef591f7b0389159ce83f3ec0f766` extends the same read-only Ideas source
with finite observed values, literal dormancy boolean and conditional appointment
scenario. No generic financial formatter, ranking members, inferred prediction,
recommendation or task writer was added. All existing access/reread/expiry owners
remain in place. This supersedes only the numerical-display gap in the metadata
checkpoint above. See `../../MAYA-COMPANION-IDEA-VALUES-CHECKPOINT-20261014.md` and
`../maya-companion-idea-values-20261014/README.md` for fresh scoped evidence.

## Ideas rule parameters checkpoint (2026-10-14)

`dda3d3b77380bb9c08121fd1f42977dbf9761c9f` adds exact current dormancy parameters
from the same existing C8 reader: interval, boundary inclusion, evidence, required
coverage, service scope summary and timezone. The list has a compact explanation;
the detail explains day/calendar-month semantics. Missing/invalid parameters are
not borrowed from defaults or other results. No local policy evaluation, action
writer, recommendation or plan-to-task authority was added. This closes only the
rule-parameter display gap retained by the previous checkpoint. See
`../../MAYA-COMPANION-IDEA-RULES-CHECKPOINT-20261014.md` and
`../maya-companion-idea-rules-20261014/README.md` for fresh scoped evidence.

## Feed acknowledgement checkpoint (2026-10-14)

`7c477a9a2a769cad19a38b4f27bf7364169c3c58` connects explicit mark-read to the
existing Inbox owner; final candidate `be123b3d3b26101713a045b04976071cc4b07ae2`
also updates the exact closed network fixture inventories. Opening/filtering remain
inert. `{ok:true}` alone is not confirmation: the exact item is reread, without an
application replay after a lost response. Backend product semantics remain intact,
including repeated delivery updating only readAt. This closes acknowledgement only,
not Save, categories, task completion or message/booking authority. Earlier read-only
Feed evidence is historical. See `../../MAYA-COMPANION-FEED-READ-CHECKPOINT-20261014.md`
and `../maya-companion-feed-read-20261014/README.md` for fresh scoped evidence.

## Five-section navigation checkpoint (2026-10-14)

`a05d0c5b17375694704d9c692aaff1498e28f4a6` connects the five owner-design tabs to the already implemented
Chat, Inbox Feed, C8 Ideas, A23 own Tasks and retained owner-report Library.
Current section remains a ShellView projection; no new reader, route, authority
or writer was added. Re-selecting a section is inert. Composer draft/history and
single-turn ownership survive switching. Measured layout reserves navigation
space; coarse-pointer text entry hides it, and width changes remeasure wrapped
composer content. Source/runtime/backend contracts remain unchanged.
See `../../MAYA-COMPANION-NAVIGATION-CHECKPOINT-20261014.md` and
`../maya-companion-navigation-20261014/README.md` for fresh scoped evidence.
The policy gaps listed earlier remain open; this is not release certification.

## Retained report sheet checkpoint (2026-10-14)

`4adc54beb81f6f64e9d7c8ac412b39f4915e0a66` presents the existing retained report reader as the owner's
document bottom sheet above the library. Native modal focus, independent scrolling
and canonical back preserve the list, selected document and chat draft. Current
authority reread, exact report tuple, cancellation and refusal remain with the
existing runtime/backend owners. No report-to-model context, export, widget route,
new writer or permission was added. This supersedes only the inline-reader
presentation in the earlier Library checkpoint. See
`../../MAYA-COMPANION-REPORT-SHEET-CHECKPOINT-20261014.md` and
`../maya-companion-report-sheet-20261014/README.md` for fresh scoped evidence.

## Drawer and library view controls checkpoint (2026-10-14)

`79fad41b5cdc293d1ec19e3fe7d3dcc923bf2c58` presents the five existing destinations in the owner's drawer,
with current state projected from ShellView and explicit Privacy/photo handling.
Choosing the current destination is inert; returning to Chat uses the existing
root route. Library layout/order move into the owner's native bottom sheet,
calling only the existing presentation preferences. No new read, writer,
preference persistence, authority or fake profile/recents/search was added.
Existing admitted navigation icons are reused; a before-fail/after-pass proof
protects against CSS shorthand hiding those images. This supersedes only the
drawer/inline-preferences presentation at the previous checkpoint. See
`../../MAYA-COMPANION-CONTROLS-CHECKPOINT-20261014.md` and
`../maya-companion-controls-20261014/README.md` for fresh scoped evidence.
The separate source/policy gaps above remain open.

## Personal task sheet checkpoint (2026-10-14)

`42bde026f9d0407f9eba2cfc5e8c18e829192526` aligns the already implemented A23 personal task form with the
owner's lower sheet, existing visible viewport geometry and independently
scrollable fields. Native modal focus, disabled-control Tab traversal and pending
close preserve command ownership; late confirmation cannot steal focus after
the form closes. Title/body bounds, current-user assignment, no deadline and
same-identity retry remain with the existing runtime/A23 owner. No task date,
assignment, undo or new writer was added. This supersedes only presentation and
focus handling of the task-actions checkpoint. See
`../../MAYA-COMPANION-TASK-SHEET-CHECKPOINT-20261014.md` and
`../maya-companion-task-sheet-20261014/README.md` for fresh scoped evidence.

## Voice sheet checkpoint (2026-10-14)

`b34e3513801a55a98489603c60e798453d2f03dd` presents the existing voice state machine in the owner's bottom
sheet. Actual gesture arm/send, 20-second held state, cancellation, exact Cell
refusal and the single conversation writer stay with their existing owners.
Native modal focus and background/late-response cancellation are checked through
emitted React/runtime with synthetic audio APIs and loopback HTTP. No demo
transcript, microphone, provider, capture engine or second writer was added.
This supersedes only voice presentation, not real-device/provider acceptance.
See `../../MAYA-COMPANION-VOICE-SHEET-CHECKPOINT-20261014.md` and
`../maya-companion-voice-sheet-20261014/README.md` for fresh scoped evidence.
