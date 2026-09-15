# D9 — canonical executable paths for the two consent operations

**Result: the canonical path already exists end-to-end for both operations.** No new
business or security decision is required, and no parallel consent owner is created.
What is missing is only a user-facing surface, which is package **K12** in wave 5 and is
not authorized yet.

## The owner

`Package5Wave3CanonicalCutoverService.recordClientConsent(tenantId, userId, clientId,
kind: 'privacy' | 'marketing', granted: boolean, occurredAt, idempotencyKey)` —
`maya-saas-backend/src/package5-wave3/package5-wave3-canonical-cutover.service.ts:265`.

**`granted` is a boolean, so `granted: false` IS the revocation.** Both operations are the
same canonical act with a different `kind`:

| Operation | Call |
|---|---|
| marketing-consent revocation | `recordClientConsent(…, 'marketing', false, …)` |
| 152-FZ base consent withdrawal | `recordClientConsent(…, 'privacy', false, …)` |

## The capability

`package5.wave3.record-client-consent.execute.v1` — `policyDecision: ALLOW`,
`actionClass: record_client_consent`, `targetKind: client_consent`. Verified by executing
`ActionCapabilityRegistry.list()` in process. Its shadow twin
`…record-client-consent.shadow.v1` is `SHADOW_ONLY` and not mintable.

## The route

`PATCH /api/customers/me/profile` — `src/customers/customers.controller.ts:58`.

`{ marketingConsent: false }` → `customersService.updateOwnProfile` →
`recordClientConsent(…, 'marketing', false, …)` (`customers.service.ts:88`).
`{ privacyConsent: false }` → the same, with `kind: 'privacy'` (`customers.service.ts:78`).

**A marketing-only revocation is possible.** The controller's `privacyConsent && marketingConsent`
branch is only a compatibility shim for native builds installed before `e5ec27fd`, which
submit both together; a body carrying one consent falls through to `updateOwnProfile`.

## What this means for D9

- **No new business/security decision is needed.** `granted: false` is already the approved
  meaning of revoke/withdraw at the canonical owner; nothing here extends it.
- **No parallel consent owner is created.** Any future surface calls this same service
  through the same verified client-link boundary.
- **The gap is a surface gap, not a capability gap.** `GAP-CONSENT-MKT-CHANGE` and
  `GAP-CONSENT-PD-WITHDRAW` are "no route in any channel *that a user can reach*", not
  "no executable path". That is a materially smaller remediation than the inventory implied,
  and it is why the copy fix alone already removes the false promise.
- **Remaining work:** a user-facing surface (K12, wave 5) plus the Roskomnadzor register
  export, which is a separate capability and separately gapped.
