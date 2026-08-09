# Native app access contract

## Purpose

The native MAYA app must not infer an interface from a CRM token, phone number,
cached workspace or a locally selected role. After authentication it requests
`GET /api/me` and renders only the modes returned in `app_access`.

This contract is additive. Existing `role`, `staff_profile` and tenant fields
remain available while the native app migrates to the server-owned mode list.

## Response

`app_access` has the following stable shape:

```json
{
  "schema_version": 1,
  "default_mode": "owner",
  "available_modes": [
    {
      "mode": "owner",
      "access": "granted",
      "tenant_id": "tenant-id",
      "role": "tenant_owner",
      "profile_linked": true
    },
    {
      "mode": "staff",
      "access": "granted",
      "tenant_id": "tenant-id",
      "role": "tenant_owner",
      "profile_linked": true
    },
    {
      "mode": "client",
      "access": "preview",
      "tenant_id": "tenant-id",
      "role": "tenant_owner",
      "profile_linked": false
    }
  ],
  "can_switch_mode": true,
  "chooser_required": true
}
```

Supported modes are `platform`, `owner`, `staff` and `client`.

- `granted` means the authenticated identity has the server-side profile or
  membership needed for that mode.
- `preview` is allowed only for the client surface of an authenticated business
  user who does not have a linked customer profile. It must not expose personal
  history, loyalty or another customer's data.
- `default_mode` is selected by the backend. The current precedence is owner,
  staff, client, platform.
- `chooser_required` tells the native app to show the mode chooser after login.
- `can_switch_mode` tells the native app to keep the persistent switch control.

## Owner-provider identity

An owner who is also linked to an active CRM staff record receives both
`owner` and `staff`. The membership remains owner-level; the staff mode uses
`staff_profile.external_staff_id` to select the owner's personal schedule and
earnings. Removing the CRM staff link removes the staff mode but must not remove
tenant ownership.

## Security rules

- The client may choose only an entry present in `available_modes`.
- A mode selection is presentation context, not a replacement for endpoint
  authorization. Every API still checks the authenticated tenant membership.
- A CRM token never grants an owner mode and must never be stored on-device.
- Profile lookups are fenced by both `tenantId` and `userId`.
- Suspended memberships do not reach `/api/me`; existing authentication guards
  reject them before this contract is built.

## Native implementation rules

1. Request `/api/me` after every successful login and token refresh.
2. Discard any cached mode that is absent from the new response.
3. Show a chooser when `chooser_required` is true.
4. Persist only the selected mode key, namespaced by tenant and user.
5. Fall back to `default_mode`; never infer a stronger mode from `role`.
6. Treat `client + preview` as a tenant preview without CRM personal data.
7. Keep the switch visible when `can_switch_mode` is true.
