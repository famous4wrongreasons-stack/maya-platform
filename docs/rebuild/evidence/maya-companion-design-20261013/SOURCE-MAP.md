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

## About Maya checkpoint (2026-10-14)

`1da26ad9a24d91bd809f236d0b54c9e9635c2695` adds the owner's static introduction sheet, opened by the header
character. It uses the existing finite mascot, greeting/context adapter, motion
preference and canonical chat return. Opening/greeting/closing have no requests;
chat history/draft and current workspace remain intact. Photo surface close
ownership is not bypassed by a local root transition. No demo facts, AI request,
new asset, route, notification control or business authority was added.
See `../../MAYA-COMPANION-ABOUT-CHECKPOINT-20261014.md` and
`../maya-companion-about-20261014/README.md` for fresh scoped evidence.


## Settings checkpoint (2026-10-14)

`064094e659817a5cd720b147f0239d502512bcce` adds the owner's Settings sheet with current session display and
the existing session-only motion preference. Drawer, header and About share the
same motion owner; system reduced motion still wins. Names are escaped display
text, not role/capability inputs. Native modal focus and session revocation are
proved through emitted React/runtime. No new authority, persistence or request.
The prototype's generic notification toggle remains unavailable in this surface:
staff/client backend preferences have distinct owners and cannot be represented
by a made-up delivery switch. Existing notification contracts are unchanged.
See `../../MAYA-COMPANION-SETTINGS-CHECKPOINT-20261014.md` and
`../maya-companion-settings-20261014/README.md` for fresh scoped evidence.
This supersedes only the missing Settings presentation, not notification delivery
acceptance, device acceptance or release certification.

## 2026-10-14 — schedule shortcut, scoped acceptance

Product `a6e49b9b2420363e37b5ca8cb940b79c8c6f6b9f` adds the reference calendar button as the visible question
«Покажи расписание на сегодня» through the existing conversation writer. It does
not mint/open a calendar directly. The composer draft is preserved even when equal
to that question; pending, retry, expiry and canonical detail bindings remain owned
by the runtime. Privacy remains in the existing menu.

Fresh results: runtime 828 PASS + 7 SKIP; carrier 194 PASS; four emitted-browser
suites 333 PASS; NS-1 16 PASS; packaging 18 PASS, PWA/Capacitor parity PASS.
Independent current-backend source proof 2 PASS on new synthetic PG, stopped.
No actual model/provider/owner DB involved; not full release certification.

Direct header-to-detail, prototype free-window rows and booking shortcuts remain
open. Current journal source yields sealed prose; blank journal space is not
availability authority. See [checkpoint](../../MAYA-COMPANION-SCHEDULE-CHECKPOINT-20261014.md).


## Personal booking and canonical detail sheet checkpoint (2026-10-14)

`26cd94b4ace838dc1cc692c0d8b521c6d7435fb5` presents the existing personal booking form and server-owned fullscreen
route in the Companion bottom-sheet surface. Branch/service/staff/date/availability,
preview, exact confirmation and result owners remain unchanged. Fresh actual
AppModule/HTTP/PG/React proof covers success, missing/changed facts, revoked context,
UNKNOWN and application/database restart, with scripted model and owned provider.
This closes presentation of the existing personal path only. Journal gaps are
not availability, and the header still asks via AChat before explicit NAVIGATE.
The full populated schedule/time-grid and aggregated free-window shortcuts remain
open. See `../../MAYA-COMPANION-PERSONAL-BOOKING-CHECKPOINT-20261014.md` and
`../maya-companion-personal-booking-20261014/README.md`.

## 2026-10-14 — populated schedule rows

Candidate `8d54c4c5f7a76735143e71eab6e8711fd4f68153`: white structured SCHEDULE rows; server-minted
local date/time/timezone subtitle; shared runtime preserves entry and parent-return
sealed order. Actual internal HTTP/PG source: 2 entries survive initial/detail, no
extra booking effects; source has generic «Запись» because its day owner currently
omits service names. No inferred free windows. Browser fixtures and actual source
proof remain separately identified. See [checkpoint](../../MAYA-COMPANION-SCHEDULE-ROWS-CHECKPOINT-20261014.md).

## 2026-10-14 — internal journal service labels

Candidate `91916d52903ac8f18fb8df30ead2b8d3a7aef0f0` closes the internal service-name
gap recorded above. The current day owner resolves stored internal service IDs to
same-tenant catalogue names after aggregation, without selecting current prices or
changing historical totals. Missing/foreign labels and retained external rows stay
unnamed; inactive services can still label old visits without becoming bookable.
Actual HTTP/PG source: four synthetic rows keep exact titles and times in initial
and detail, with no journal writes or timeline duplication. Fresh 508 unit tests,
3 source scenarios, 4 targeted mutations, types/lint PASS. No frontend change.
This is scoped local acceptance, not release certification. Aggregated free-window
cards and alternating-master actual-source evidence remain open. Current branch
binding is present in code; older absence-of-mapping reports are historical.
See [checkpoint](../../MAYA-JOURNAL-SERVICE-NAMES-CHECKPOINT-20261014.md).


## 2026-10-14 — interleaved masters in the journal

Candidate `9208d779df7f8c0d94f696e2011db66c43bfadee` closes the alternating-master
actual-source gap. Runtime groups only consecutive entries, preserving the sealed
A/B/A/C order and repeating the existing server label. Unknown/duplicate lanes,
H7, reading order and TEXT_ONLY refusals remain fail-closed. Backend product code,
carrier CSS/semantics, identities and action owners are unchanged.
Actual HTTP/PG source proves four scenarios, including three interleaved masters;
separate Chrome proof covers order, focus, detail return and refusal. Fresh runtime
846 PASS + 7 SKIP, carrier 196 PASS, browser 348 PASS, NS-1 16 PASS, packaging/parity,
types/ratchets and targeted old-grouping mutation PASS. No real effects or full
release certification. Aggregated free windows without a service remain unresolved.
See [checkpoint](../../MAYA-SCHEDULE-MULTILANE-CHECKPOINT-20261014.md).

## 2026-10-14 — invoice photo sheet

Product `b3c9ad3fc33960ab2e83296b3d32e376e087269c`, final tested candidate
`bdba69cdf583ac8970cec699a60a0cd6aa33e376`, presents the existing GoodsPhoto owner
in the reference bottom sheet. Native modal focus, cancellation/late-response
refusal, ephemeral field cleanup, explicit purchase-price verification and
uncertain-operation no-replay behavior are proved through emitted React/runtime.
The final test-only commit fixes a loopback request-arrival race in the schedule
harness; product runtime/backend contracts are unchanged.
Fresh runtime 846 PASS + 7 SKIP, carrier 198 PASS, browser 386 PASS, NS-1 16 PASS,
packaging 18 PASS, parity/ratchets and targeted Escape mutation PASS.
This supersedes only the inline GoodsPhoto presentation. Generic media/file
storage, prototype demo actions, real OCR/provider acceptance and full release
certification remain outside this unit. See
[checkpoint](../../MAYA-COMPANION-PHOTO-SHEET-CHECKPOINT-20261014.md).

## 2026-10-14 — existing feed filter in the reference sheet

Candidate `7e5eea892aaeffb67f37087ba122394844e48d97` presents the existing
All/Unread filter in the screen-17 bottom sheet. Selection is projected from
`WorkspaceReadsView.unreadOnly` and calls only `filterUnread`; no request,
acknowledgement or subscription is created. Loaded-slice/cap semantics remain
explicit; loading/refusal disables choices. Native modal focus, background
inertness, concurrent mark-read completion and session expiry are covered.

Fresh runtime 846 PASS + 7 SKIP, carrier 200 PASS, six browser suites 525 PASS,
NS-1 16 PASS, packaging 18 PASS, parity/types/ratchets PASS. Actual emitted
React/runtime uses synthetic intercepted HTTP; no actual backend/provider proof
or full release certification is claimed. The old workspace browser Privacy
transition was corrected to open its containing menu first, without product changes.

This supersedes only inline All/Unread presentation. It does not close the
prototype Salon/Opportunities taxonomy, Feed Save or notification-delivery policy.
See [checkpoint](../../MAYA-COMPANION-FEED-FILTER-CHECKPOINT-20261014.md).
