# D2 — finite native staff quick-create (YC-ST1-CHAT-1)

Date: 2026-10-21. Base: `961fa196c4b02a8badd2ada94f505f5cb838b78f`.
Branch: `codex/maya-service-staff-d2-20261021`.

**D2 remains PARTIAL. This is a local implementation and synthetic proof, not release certification, hosted admission or permission to perform a real provider write.** The fixed phone release/profile certificate and digest are unchanged. Integration must qualify the new registry before any activation. HANDOFF remains STOP.

## Finite scope

The supported literal owner command is:

> Создай сотрудника «Синтетический Мастер» со специализацией «Парикмахер»

Only the two explicit labels author the proposal. No LLM is called for this command and this tool is omitted from model descriptors. The current persisted ordinary user turn supplies its identity; a later request cannot invent another parent turn. Both labels are nonempty, trimmed, at most 240 UTF-16 units and contain no control/format characters. These are application bounds, not claimed YCLIENTS maxima.

The server derives the exact company from the active YCLIENTS integration and requires its existing canonical branch binding. It rereads the active tenant, unscoped owner membership, features, integration revision and provider create permission. An administrator, staff member, client or owner acting in the client/staff audience cannot become the owner of this operation.

The provider request is exactly `POST /api/v1/company/{company_id}/staff/quick`, with `name`, `specialization`, `position_id: null`, `phone_number: null`. It neither creates a Maya account nor requests a YCLIENTS user-account binding. Caller-supplied company, user, phone, position, employee ID, HTTP method or URL is rejected. No service rename, price change, service binding, staff edit/delete, generic CRUD or universal HTTP tool is added.

## One existing owner chain

1. `AiCoreService` recognizes the finite command after canonical user-turn persistence. `AiToolRuntimeService` requires the internal `YC-ST1-CHAT-1` route and exact turn binding; the standalone tool endpoint cannot manufacture it.
2. The registered C9 tool `catalog.staff.create` delegates preparation to `CrmService.prepareStaffCreate`; the native adapter reads current `settings_master_access` and `master_create`. Name/specification, company, integration and permission revisions are covered by the approval payload hash.
3. The existing `AiApprovalRequest` owns the preview. Exactly one audited chat origin, current principal and active parent turn are required. A separate sealed staff approval noun is minted through the existing widget emitter. The existing APPROVAL/detail carrier is reused, including `fs.catalogue`; no presentation design is changed.
4. The individually pinned pairing is `catalog.staff.create` → `crm.staff.quick-create.v1`. The exact typed settings subtype uses APPROVAL, explicit actor confirmation and the existing ordered gates. The historical F38 rows and other subjects remain intact; no inference from a capability prefix creates authority.
5. `StaffCreateApprovalAdapter` invokes the existing approval CAS with the current widget entitlement guard. Legacy REST approval, another tenant, substituted payload, expired approval, erased origin, inactive membership/source or removed entitlement cannot invoke the provider.
6. `CrmService.applyStaffCreate` is the sole provider execution owner. The existing canonical Action Engine receives a **REQUIRED** approval, linked to the already decided actor approval; its policy remains current owner-only. It records the actual action/attempt and receipt. There is no `NONE` approval shortcut, mirror execution writer or fabricated success.

`staff-create:{approval}:{hash}:{decision}` identifies widget confirmation, separately from price and inventory origins. The canonical persisted turn supplies command idempotency; labels are not action identity. An advisory lock on exact tenant/company/proposal prevents a new command from bypassing an unresolved prior outcome. This conservatively holds same-label proposals while the previous operation is unresolved; after confirmed success an explicitly new command is a new operation.

## UNKNOWN is an outcome, not a retry instruction

The adapter dispatches once. A lost response or mismatched company/name/specialization/position/account receipt becomes `CrmOutcomeUnknownError`. The Action Engine remains UNKNOWN and no success outcome is shown. Retrying the same token, concurrent confirmations and a new same-proposal command cannot duplicate an unresolved creation.

The primary provider contract gives this operation no attributable request identity or idempotent-create/readback guarantee. Reconciliation therefore returns `STILL_UNKNOWN`, never searches by name or invents proven non-execution, and never redispatches. A safe pending result is an intentional limit; this slice does not include an operator resolution UI or a real-provider qualification.

## Primary source and facts versus assumptions

Primary source: [YCLIENTS API documentation](https://developers.yclients.com/ru/), operation `api.location.staff.create_quick`, current public OpenAPI embedded in the page. Read on 2026-10-21; HTML SHA-256 `ed57f3e1908597d58e880184d7cea555534d6243837d5648069b114f4326bd36`. The repository-safe field projection is [provider-contract.json](evidence/maya-staff-quick-create-20261021/provider-contract.json). The source fetch reads documentation only, not the YCLIENTS API.

Documented: four required request properties; nullable position/phone; 201 response includes company/staff identity, labels and nullable position. The older `/staff/{company_id}` create route is deprecated. Permission fields are documented in the existing current-user/company permission source.

Application decisions: null position and phone, exact two-field proposal, 240-unit bound, active unscoped owner only, required canonical branch binding, separate chat origin, approval/CAS/expiry and no automatic replay. These restrictions are not represented as provider guarantees. Permission-to-endpoint behavior and response fields still require separately authorized real-provider qualification before rollout; synthetic tests prove Maya behavior against the documented contract, not production YCLIENTS behavior.

## Fresh focused verification

The result is recorded in [focused-results.json](evidence/maya-staff-quick-create-20261021/focused-results.json). The exact command is reproducible with `node scripts/staff-create-proof.mjs --run --output=/absolute/new/directory` from the backend. It allocates a fresh guarded loopback PostgreSQL 16 database and an owned HTTP provider, applies migrations only there, executes this one probe and stops the owned cluster in `finally`. Inherited provider credentials and DATABASE_URL are not forwarded. There are no existing salon records or external provider calls.

Coverage includes registered HTTP chat → preview → APPROVAL/detail → native dispatch/receipt; no provider write before approval; explicit REQUIRED AE record; standalone/legacy refusal; cross-tenant/reject; current provider permission, membership, integration, branch, expiry, origin erasure/removal, payload CAS and entitlement revocation; six simultaneous initial confirmations; native socket destruction after one synthetic provider insertion; actual CRM/AE reconciliation remaining pending; one normal plus six concurrent replays; and a fresh same-proposal command after UNKNOWN. The fake provider deliberately has no unique-name/idempotency guard. Only the outbound destination is restricted; native fetch and the native YCLIENTS adapter handle the socket failure.

RED → GREEN provenance is preserved in the local numbered receipts: the new canonical path initially refused its unregistered APPROVAL source and then its absent exact gate-7 pairing (no POST); the explicit typed source/pairing completed that path. Later failures from an invalid test audience and wrong-case test expectation were test corrections, not product defects. Historical owner/registry tests were extended with the one explicit new row; historical row expectations remain exact. These focused results do not stand in for a complete release mutation programme or CI.

The planner's exact UTF-8 serialization remains **60,953 bytes**, 92 intents, unchanged from base (the existing compactness test also passes). This slice adds no planner intent. D3 integration and its independent projection change must still be checked together.

## Exact D2 remainder

| Duty | Current state | Missing evidence/decision |
| --- | --- | --- |
| Native staff quick-create without account | Implemented; synthetic chain proven | Integrated qualification, certified release admission, separately authorized real provider proof |
| Service rename | Existing read/preview retained; no write added | Preserve inherited booking/printed labels: authoritative source plus explicit update/omission/inheritance semantics. The existing rename-admission document remains governing. |
| Service create/update/delete | Not completed by this slice | Finite field contract, current authority/confirmation owner and destructive/history semantics for each operation; no generic CRUD inference |
| Staff edit/delete | Not completed | Current PUT describes optional fields including user linkage but not complete omitted-field preservation. Current read omits some mutable fields. DELETE 204 does not establish history/dependency effects. |
| Service–staff binding/update/unlink | Not completed | Create/update require `technological_card_id`; inspected service.staff read exposes ID/duration, not a current authoritative technology-card snapshot. Do not silently reset it to null or guess existing semantics. |

Related primary project documents: [product scope](../product/README.md), [management decision brief](MAYA-YCLIENTS-MANAGEMENT-DECISION-BRIEF-20261007.md), [service rename admission](MAYA-YCLIENTS-SERVICE-RENAME-ADMISSION-20261008.md), [delivery plan](MAYA-DELIVERY-PLAN-20261010.md). The documentation gap audit's D2 is not relabelled complete.

No production deploy, migration, grant, OTP, customer data processing, YCLIENTS mutation, paid model request, iPhone installation or push was performed by this unit.
