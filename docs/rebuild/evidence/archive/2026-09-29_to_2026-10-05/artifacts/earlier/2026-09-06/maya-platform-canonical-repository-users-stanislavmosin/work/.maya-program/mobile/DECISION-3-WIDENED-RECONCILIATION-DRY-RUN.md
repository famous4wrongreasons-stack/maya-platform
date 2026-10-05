<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 97d8cce974222edae90c34d61331124bc0442a706b3d8f2560a413c65252321b -->

# Decision 3 — the widened reconciliation. Dry-run scope and counts. NOT RUN.

**Read-only throughout. Nothing was reconciled, nothing was replayed, no production value changed.**
Measured 2026-09-28 against the live database over the Beget jump, counts only, no personal data read.

The owner's rule: *«Перед widened reconciliation показать dry-run/read-only scope/counts; если
operation может создавать external business effects — STOP.»* This is that showing.

---

## 1. Can it create external business effects? Structurally, yes. That is a STOP.

An independent trace of every path a newly written `DomainEvent` can take found **two** that leave
Maya, and both are **armed** in the live environment:

| flag in `/etc/maya-saas/live-widgets.env` | value | consequence |
|---|---|---|
| `CRM_RECONCILIATION_SCHEDULER_ENABLED` | **true** | see §3 — this is the urgent one |
| `OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT` | **2026-09-08T12:31:30.816Z** | effect paths 1 and 2 armed |
| `CANONICAL_INBOX_PROJECTION_CUTOVER_AT` | **2026-09-08T12:31:30.816Z** | effect path 1 armed |
| `OPPORTUNITY_LIFECYCLE_ENABLED` | true | internal rows + read-only provider calls |
| `APPOINTMENT_REMINDERS_SCHEDULER_ENABLED` | absent → on | bounded to 7 days, so not a shoulder concern |

**Path 1 — inbox item + iOS push to every active member**, for `appointment.created/removed/
rescheduled/staff_changed/services_changed`. It filters on `receivedAt`, which reconciliation stamps
as *now*, and **it has no filter on the appointment's own date at all**. A cancellation of a visit
that happened 25 days ago, discovered now, is announced as «Запись снята … Изменение принято Maya
*now*».

**Path 2 — a message to real salon clients**, «Освободилось время», Telegram via the Python bot or
Maya inbox, up to three clients per released slot.

**Nothing writes back to YCLIENTS.** Every provider mutation is reachable only from human- or
chat-initiated entry points; the reconciliation path reaches the adapter only through a journal read
bounded to 31 days. And there is **no event-bus fan-out**: every `DomainEvent` consumer is a named
query with its own filters, and `claimBatch`/`markProcessed`/`markFailed` have no production callers
at all.

## 2. Would they actually fire? Measured on live data: no. Every gate is zero.

This is the part that can only be answered by counting, so it was counted:

| what the gate needs | live count | consequence |
|---|---|---|
| appointments in the **future** 8–31 day shoulder | **0** | the future shoulder is empty; nothing to discover |
| appointments in the **past** 8–31 day shoulder | 461 | the real scope of the widened pass |
| …of those, passing path 1's gate (`branchId` **and** `mayaClientId` both non-null) | **0 of 461** | **path 1 is dead for this window** |
| active `ClientWantedSlotInterest` in the 8–31 day band | **0** | **path 2 is dead for this window** |
| registered push tokens, all platforms | **0** | no push can be sent to anyone |
| active memberships (the fan-out multiplier) | **1** | even if something fired, one recipient: the owner |
| tenants with a CRM watch started | 1 | one tenant in scope |
| last mirror write in the past shoulder | **2026-09-20 16:54:43** | exactly when reconciliation broke — consistent |

**So the measured external effect of a widened pass today is zero**, on every path, by a wide margin
— not by one gate narrowly failing.

**Say plainly what that is and is not.** It is a measurement of *today's data*, not a structural
guarantee. The code paths exist and are armed; what is zero is the data that would flow through them.
Both numbers that matter — the inbox gate and the wanted-slot interests — can become non-zero as soon
as clients are linked or slot interests are registered. By the owner's rule as written, this is a
**STOP and show the numbers**, not a licence to run.

## 3. 🔴 The urgent finding: deploying the fix *is* the widened reconciliation

`CRM_RECONCILIATION_SCHEDULER_ENABLED=true`. The medium contour is **already ±31 days** and fires
**about 7 minutes after the process starts**, then every 24 h. So the moment the fix is deployed and
`maya-saas` restarts, that pass runs — uncontrolled, with no dry run, covering exactly the shoulders
this document is about.

Two ways to take that, and the owner should choose deliberately rather than discover it:

- **Let it happen.** Given §2 it is measurably harmless today, and it is the cheapest possible
  recovery: the ±31-day pass *is* the widened reconciliation, so no separate operation is needed.
- **Make it a decision.** Set `CRM_RECONCILIATION_SCHEDULER_ENABLED=false` in the live env **before**
  the deploy, so the fix goes out inert; then run one controlled pass and re-enable.

Either way the near contour (±7 days) is already running and already healthy — it recovered on its
own after the restart and pulled 81 appointments back. Only the medium contour is still failing.

## 4. What a widened pass would still not recover

**Bookings made during the outage for dates beyond +31 days.** The reconciliation window is on the
appointment's *time*, not on when it was changed, so a booking made on 09-25 for December is outside
every window until the date drifts in. Whether any exist is a question for YCLIENTS, not for Maya —
Maya cannot know about a record it never received.

And the intra-outage **timeline** is gone regardless: reconciliation compares current state against
the mirror rather than replaying a log, and it stamps `occurredAt` with the observation moment, so an
appointment that changed three times during the outage yields one event dated now. No replay can
restore that, which is the same reason the webhook backlog is not worth replaying.

## 5. If it is run, the order that keeps it controlled

1. Decide §3 first — before the deploy, not after.
2. A dry run exists and is genuinely read-only: `scripts/appointment-mirror-bootstrap.ts` **without**
   `--apply`, which walks the same journal windows with the same 31-day slicing and returns before
   every write. Read `truncated_windows` honestly: a truncated window licenses no conclusion about
   absence.
3. Run the shoulders only — `now−31d … now−8d`, one 23-day slice, inside the provider's 31-day limit.
   The future shoulder is empty, so it needs no slice at all.
4. Accept a `ReconciliationRun` with `completeness = 'complete'` and `finishedAt` non-null as the exit
   criterion. **Not** a green `/api/health/ready` — that returned 200 two and a half minutes before
   the pass failed on 2026-09-28.
5. If the cutover flags are ever blanked to suppress consumers, do **not** restore the old values
   afterwards: the inbox projection admits anything with `receivedAt` newer than the cutover, so
   restoring them would flush the whole backlog at once. Set them to an instant *after* the pass
   finished.

---

**STOP. The widened reconciliation was NOT run. The counts above are the showing the ruling asked
for; the decision is the owner's.**
