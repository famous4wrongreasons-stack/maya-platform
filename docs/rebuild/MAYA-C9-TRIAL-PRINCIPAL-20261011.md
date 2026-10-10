# C9 current principal: ordinary full trial

## Proven defect

On base `3b98edca74177c35096d79d6da51a577c35fdf19`, ordinary AChat
uses `TypedStep0Service` for its canonical persisted user turn. That owner
resolves the current principal through `C9Authority`. The latter accepted only
the literal tenant status `active`, rejecting an otherwise valid full trial.

The synthetic real HTTP/AppModule/PostgreSQL reproduction returned
`403 conversation_principal_unavailable`, before model or provider dispatch.
Its receipt is `/private/tmp/maya-owner-chat-http-20261011-06/matrix.json`.
The actual retained owner database was separately inspected read-only: trial
valid, full access true, saved CRM integration active and unchanged. This was
not a real owner chat request and made no external call.

## Existing contract and correction

`EntitlementsService.effective` already recognizes a full trial with a non-null
future expiry. C9 Q04 in `CYCLE-09-PREFLIGHT-AND-SCOPE.md` requires the
intersection of lifecycle, features, role and provider, including trial expiry.
The correction lets that existing lifecycle resolve a current principal.
It does not manufacture a role, Client, capability, feature, grant or source
permission. `widgets.runtime` remains excluded from trial and plan access.
The existing active-tenant path and all membership/channel checks remain.

The guard re-reads status, full-trial flag and expiry on every resolution.
Missing/invalid/expired expiry, setup-only trial, disabled tenant, mismatched
membership and untrusted context remain refused. No database values changed.

## Verification and limits

- 416 focused tests: orchestration, entitlement service and AI tool policy PASS;
  includes 13 new principal cases. Backend typecheck PASS.
- Synthetic full-trial HTTP probe: three questions reach canonical native
  service/staff/company readers; provider and planner are synthetic. Revoked
  membership, expired trial, foreign tenant, replay and effect routes refused.
  Receipt: `/private/tmp/maya-owner-chat-http-20261011-11/`.
- No business ActionExecution or widget grant created by the three read turns.
- No real model/YCLIENTS call, production change, deployment or owner acceptance.

The HTTP probe's separate local qualification adapter is being prepared in the
following commit; these receipts are development evidence, not release certification.
