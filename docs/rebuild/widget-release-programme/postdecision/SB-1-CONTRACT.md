# SB-1 A — explicit personal-client context, backend unit

Owner approval: `owner-decisions.json`, 2026-09-29. This is a backend implementation contract; no carrier changes, production grant, role migration or re-link operation.

## Implemented request contract

`POST /api/personal-client/appointments` uses the existing authenticated tenant session and requires `x-maya-authority-context: personal_client` on every request. The body is the existing CreateAppointmentDto. Extra fields, including Client/link/role/tenant/context IDs, are rejected. The optional existing `idempotency-key` remains a transport alias for the canonical booking intent. Selection is request-local and neither changes the session's business role nor persists a new global mode.

The backend resolves the exact active V1 `maya_user` link by the authenticated User's canonical subject hash and tenant. It checks the current session, active User and membership, exact session/member/tenant identity, link versions/evidence, Client merge state and unresolved identity holds. Zero or multiple matching links refuse. Historical revoked episodes never grant current authority. The selected link, Client and evidence hash are frozen and checked again at canonical execution admission and immediately before dispatch. The existing Action Engine also rechecks Client authority at its own claim boundary.

The canonical Client creator and calendar/action owners perform booking. The personal context does not set role=client in the session, widen CLIENT_ROLES, grant any widget feature, bypass booking mode/entitlements or call YCLIENTS directly. The ordinary account creator and its quote refuse a tenant_owner without an explicit personal context. The approved route keeps business owner role metadata as attribution only. A verified Client is the booking authority.

Durable ActionExecution evidence contains the exact Client link plus `personal-context:v1:personal_client`, actual User, AuthSession, membership and business role references. These server-generated references are attribution, never bearer credentials or a policy override. The existing appointment audit retains User and adds the selected context/session/member/link metadata. Existing evidence storage is sufficient for this unit; no schema change.

A retry revalidates the context before the canonical idempotent execution. The original execution's actor evidence remains immutable; the new request is audited under its actual current session. This unit implements create only. It does not add business booking on behalf of another Client, a global context token, chat/widget role switching, cancellation/rescheduling UI, or a second conversation writer.

## Evidence boundary

Development amendment, 2026-10-07: the separately authorized factual booking slice adds optional syntactic `previewFactsHash` (64 lowercase hex characters) to the create DTO. New personal creation requires it to match the current server quote; an already durable canonical retry may omit it and restores/rechecks its original evidence. Preview still accepts only the original selection DTO. This is an optimistic business-terms precondition, not Client authority or execution identity. See [code, compatibility limits and local evidence](../../MAYA-BOOKING-FACTS-CHECKPOINT-20261007.md). This amendment makes no new identity, schema, production or autonomy grant.

Unit negatives cover no selection, foreign tenant/actor, revoked/expired sessions, membership drift, revoked/ambiguous/version-invalid links, Client merge/hold and link/client/evidence changes after selection. HTTP and production-binary cases use a synthetic verified link and an isolated internal calendar. They assert one durable action, immutable retry, actual actor/context evidence and unchanged tenant_owner membership. No production verifier or real external effect is simulated as production evidence.

The HTTP fixture's downstream staff inbox publication currently reports the existing R06 Appointment/Client/branch refusal for its branchless synthetic source. Booking/action/audit assertions pass. This is not evidence of staff notification delivery.

## Current owner: binding remains BLOCKED

The 2026-09-29 read-only observation in the retained preintegration packet found no active verified link. The new route therefore refuses that owner until a genuinely new verified episode exists. No production identity/data was reread or changed in this unit. The synthetic positive fixture is not that owner's new episode.

`NEW VERIFIED BINDING PATH: BLOCKED`. See `SB-1-REVERIFICATION-DECISION.md`. The context-consumption implementation is complete; the end-to-end owner self-booking contract remains blocked by independent re-verification authority and its persistence contract.
