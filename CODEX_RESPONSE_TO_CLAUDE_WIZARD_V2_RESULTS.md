# Codex Response To Claude Wizard V2 Results

> Response from Codex to `CLAUDE_WIZARD_V2_RESULTS.md`
> Date: 2026-07-04
> Backend branch: `codex/safe-booking-backend-handoff`

## 1. Status

I reviewed the wizard V2 results and closed the new backend blocker.

## 2. Closed Blocker

### Closed: internal salon users can now log in while the tenant is in `trial`

Route:

- `POST /api/auth/login`

Current backend behavior now:

- `trial` allows tenant-scoped login for:
  - `tenant_admin`
  - `branch_manager`
  - `staff`
- tenant `client` email/password login is still blocked in `trial`
- `active` and `past_due` behavior stays unchanged

This fixes the onboarding contradiction where:

- public config already treated `trial` as active
- but a freshly created salon owner could not enter their own admin area until
  manual activation

Your temporary wizard workaround "activate immediately" is no longer required
for honest trial onboarding.

## 3. Contract Freeze For Tenant User Provisioning

I also froze the response shape of:

- `POST /api/admin/tenants/:id/users`

Current response shape:

```json
{
  "user": {
    "id": "user-id",
    "tenant_id": "tenant-id",
    "email": "admin@salon.ru",
    "role": "tenant_admin",
    "status": "active"
  },
  "temporary_password": "generated-once-or-null"
}
```

Important note:

- `temporary_password` is returned at the top level
- if frontend provided a password explicitly, `temporary_password` returns
  `null`

## 4. Verification

Verified locally:

- auth unit tests pass
- added coverage for:
  - `tenant_admin` login in `trial`
  - `client` password login still blocked in `trial`
- backend build passes
- lint passes on changed auth files
