# CLAUDE CHAT WIDGETS BACKEND - results for frontend

Date: 2026-07-19

Backend commit: `46138a31`

Branch: `codex/maya-os-crm-integration-final`

The legacy MAYA backend package from `CLAUDE_CHAT_WIDGETS_BACKEND_TASK.md` is implemented,
tested and deployed. This document is the frontend contract for Claude. Payments were not
added and must not be added in this pass.

## 1. Widget contract in MAYA chat

Both chat transports can now return an optional `widget` beside the normal reply:

- JSON `chat`: `{ "reply": "...", "widget": "book" }`
- SSE `chat_stream`: the final `done` event can contain
  `{ "type": "done", "reply": "...", "widget": "book" }`
- Chat history preserves `widget`, including proactive MAYA messages, so a card can be
  restored after reopening the app.

Allowed values are strictly limited to:

```text
book | mybookings | loyalty | shop | profile | history | referral | notify
```

The model has a dedicated server tool and decides naturally when a card is useful. Unknown
values are discarded. Existing deterministic actions are mapped to the same contract. Keep
the current regex logic only as a frontend fallback.

## 2. Real client cancellation

Call the existing PHP proxy:

```text
POST /app/api-proxy.php?action=client_cancel_record
Content-Type: application/json
```

Body:

```json
{
  "record_id": 123456,
  "auth_data": null,
  "session_token": "optional-session-token"
}
```

Continue sending the same authorization channel already used by `cabinet_me`: Telegram
Mini App initData header, Telegram Login Widget `auth_data`, or MAYA `session_token` /
`X-Session-Token`.

Success:

```json
{
  "success": true,
  "ok": true,
  "record_id": 123456,
  "widget": "mybookings"
}
```

The backend verifies signed authentication, valid consent, the client's stored phone and
record ownership before calling YClients DELETE. A foreign `record_id` cannot be cancelled.

## 3. Real client reschedule

```text
POST /app/api-proxy.php?action=client_reschedule_record
Content-Type: application/json
```

Body with a selected local date and time:

```json
{
  "record_id": 123456,
  "date": "2026-07-22",
  "time": "15:30",
  "auth_data": null,
  "session_token": "optional-session-token"
}
```

The endpoint also accepts one ISO-like `datetime` field instead of `date` + `time`.

Success:

```json
{
  "success": true,
  "ok": true,
  "record_id": 123456,
  "datetime": "2026-07-22 15:30:00",
  "widget": "mybookings"
}
```

Rescheduling uses the existing non-destructive YClients PUT. It preserves `record_id`, the
client, master, services and original record if the new slot is rejected. The frontend
should offer times from the existing live availability API before calling this action.

## 4. Error contract

Errors use both `error` and `code` with the same machine-readable value:

```json
{
  "success": false,
  "ok": false,
  "error": "not_yours",
  "code": "not_yours",
  "message": "..."
}
```

Relevant codes:

```text
unauthorized
needs_consent
client_not_found
phone_required
not_found
not_yours
too_late_to_cancel
too_late_to_reschedule
invalid_datetime
cancel_failed
reschedule_failed
yclients_unavailable
```

`cabinet_me.upcoming[]` already includes an integer `record_id` for each booking.

## 5. Proactive MAYA messages

The backend now persists the following messages in the client chat and sends Web Push when
the client has a valid push subscription:

- Appointment reminder -> `widget: "mybookings"` with the record id.
- Confirmed loyalty balance can cover current YClients services from the care catalog ->
  `widget: "loyalty"`. It runs only after newly earned points and respects marketing
  consent, notification preferences, quiet hours and frequency limits.
- Personal visit cycle is due -> `widget: "book"`, preserving the familiar master in the
  action. The existing owner-confirmation gate remains intentionally enabled.
- Review request after a completed visit -> `widget: "history"` plus action
  `type: "review_prompt"`. The existing happy-path destinations remain Yandex and 2GIS.

Messages are deduplicated. They remain visible in history even when Web Push is unavailable.

## 6. What Claude should implement now

1. Read optional `widget` from JSON chat responses and the SSE `done` event, then render the
   matching existing inline card.
2. In `mybookings`, replace the text request to MAYA with the direct cancellation action,
   including an explicit confirmation step and immediate cabinet refresh after success.
3. Add rescheduling through the existing live slot picker, then call the direct reschedule
   action and refresh the same card after success.
4. Render proactive history entries using their stored `widget` and support
   `action.type === "review_prompt"` with the existing review UI.
5. Keep regex widget detection as fallback only. Do not infer success locally: trust the
   backend HTTP status and machine code.

## 7. Verification and limits

- 106 regression checks passed in the combined working tree.
- 92 checks passed against the exact isolated Git commit content.
- 22 focused tests passed again inside the production VPS environment.
- Production service is active.
- Public proxy smoke tests for cancel and reschedule return the expected `401 unauthorized`
  without credentials; no real client record was changed during verification.

Current policy blocks cancellation or rescheduling after the visit has started. If a stricter
business deadline is required later (for example two hours before the visit), it should be a
server setting, not frontend logic.
