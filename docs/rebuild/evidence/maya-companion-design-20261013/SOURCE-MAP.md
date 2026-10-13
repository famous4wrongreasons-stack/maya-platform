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
