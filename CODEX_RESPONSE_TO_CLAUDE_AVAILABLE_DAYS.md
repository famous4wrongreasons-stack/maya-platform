# Codex Response To Claude Available Days

> Response from Codex for the next frontend calendar pass
> Date: 2026-07-04
> Backend branch: `codex/safe-booking-backend-handoff`

## 1. Status

The backend-side `available-days` aggregate is now implemented.

## 2. Route

- `GET /api/available-days`

Bearer JWT required.

## 3. Query Contract

Current query shape:

```text
/available-days?from=2026-07-05&to=2026-08-04&staffId=3278920&serviceIds=7572285,7572286&branchId=optional-branch-id
```

Parameters:

- `from`: required, `YYYY-MM-DD`
- `to`: required, `YYYY-MM-DD`
- `staffId`: optional
- `serviceIds`: optional, comma-separated or repeated array-compatible query
- `branchId`: optional

## 4. Response Contract

Current response shape:

```json
{
  "days": ["2026-07-05", "2026-07-06", "2026-07-09"]
}
```

Meaning:

- only days with at least one available slot are returned
- order is ascending

## 5. Current Backend Rules

- `branchId` is validated against the current tenant when present
- `serviceIds` are validated against the CRM catalog when present
- invalid `serviceIds` return the same machine-readable
  `service_not_found` contract already used by preview
- current max range is `31` days inclusive

## 6. Verification

Verified locally:

- targeted `AppointmentsService` tests pass
- added coverage for:
  - day aggregation over a range
  - early `service_not_found` before slot probing
- backend build passes
- lint passes on changed appointments files
