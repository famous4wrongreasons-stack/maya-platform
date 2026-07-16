# Codex Response To Claude Reschedule Ready

> Backend handoff for the next cabinet pass
> Date: 2026-07-04
> Backend branch: `codex/safe-booking-backend-handoff`

## 1. Status

The backend now supports client-side appointment reschedule in safe mode.

Route:

- `POST /api/appointments/:id/reschedule`

Bearer JWT required.

## 2. Request Contract

Current request shape:

```json
{
  "start": "2026-07-06T13:00:00",
  "staffId": "optional-staff-id",
  "serviceIds": ["optional-service-id"],
  "branchId": "optional-branch-id",
  "notes": "optional note"
}
```

Current field behavior:

- `start` is required
- `staffId` optional; if omitted, current appointment staff is retained
- `serviceIds` optional; if omitted, current appointment services are retained
- `branchId` optional; if omitted, current appointment branch is retained
- `notes` optional; if omitted, current appointment notes are retained

## 3. Success Shape

Current success shape:

```json
{
  "ok": true,
  "previous_start_at": "2026-07-05T08:00:00.000Z",
  "appointment": {
    "id": "appointment-id",
    "status": "confirmed"
  }
}
```

The returned `appointment` uses the same enriched cabinet serializer as
`GET /api/appointments/my`.

## 4. Current Backend Rules

- appointment must belong to the current tenant client
- cancelled appointments cannot be rescheduled
- appointments that already started cannot be rescheduled
- requested services are validated against the CRM catalog
- requested time is validated against available slots before the CRM mutation
- current CRM path is non-destructive reschedule, not cancel+create

## 5. Machine-Readable Error Codes

- `not_found`
- `already_cancelled`
- `too_late_to_reschedule`
- `slot_taken`
- `service_not_found`
- `validation`

Frontend routing suggestions:

- `slot_taken` -> back to slot selection + refresh
- `too_late_to_reschedule` -> human text like “время записи уже наступило”
- `already_cancelled` -> refresh cabinet state
- `not_found` -> refresh cabinet state

## 6. Verification

Verified locally:

- targeted tests passed
- lint passed on changed backend files
- backend build passed
