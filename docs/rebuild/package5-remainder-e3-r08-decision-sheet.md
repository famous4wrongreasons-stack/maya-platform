# E3 / R08 — native feedback owner and schema decision

**PROPOSAL ONLY — NOT APPROVED.** Exact package: **R08 / B47**, closed 32/32 inventory, checkpoint `60e82664`; R-A/R-B runtime baseline `42962475` is reported production PASS by the coordinating agent. R01 and R02 integration prerequisites are satisfied. This assessment makes no production calls and does not certify remediation.

## Options and recommendation

| Option | Contract | New models / columns / action classes | Migration / backfill | Business loss |
| --- | --- | --- | --- | --- |
| **A — RECOMMENDED** | Separate canonical native feedback request/revisions and fixed delivery slots bound directly on existing ActionExecution. Reuse Action Engine/Communication Delivery; preserve B34 external review owner. | **2 / 41 / 4**: 3 AE + 1 explicitly proposed AC6 retention class | YES / NO | Old unverifiable requests are not sent or promoted. Raw Telegram ratings and “next message is a comment” stop; feedback moves to a verified Client surface. No automatic new requests from retired payment flow, no cross-channel fallback, no staff edits of Client ratings. |
| B | Retire first-party request scheduler, `/reviews_now`, callback/comment writes and follow-up delivery; retain historical storage only. B34 external imports continue. | 0 / 0 / 0 | NO / NO | No first-party rating/comment collection or follow-up in Chapter 6. |

**WHY A:** preserves a useful private feedback loop while giving each request and response an exact Client/Appointment owner. Existing `BusinessReview` records an immutable external source fact and has neither Client/request identity nor correction semantics; extending its source label would conceal the missing authority. Delivery attempts, leases and UNKNOWN remain exclusively in existing A12/A13 owners. As in B36, the existing ActionExecution receives three exact parent/slot binding columns. Frozen manifests own recipients/routes; existing AE/CD own lifecycle. A separate link-only slot table is unnecessary.

## Proposed contract A

**Authority and eligibility.** Only a current tenant management Member (`tenant_owner`, `business_owner`, `tenant_admin`, `administrator`) may explicitly admit a request for an exact tenant Appointment whose `mayaClientId` equals the canonical Client. No legacy `Appointment.clientId`, phone, raw record ID or staff chat ID can supply ownership. V1 requires canonical `attendance = arrived`, non-canceled status and `endAt <= now`; absence of proven attendance is ineligible, including internal-calendar rows without that fact. There is no invented `completed` status: the current Appointment status enum only has confirmed/canceled. This restriction and its loss of coverage are part of the proposal. Earliest delivery is `endAt + 3h`; response window ends seven days after the later of admission time and that earliest delivery time. One request per tenant/Appointment/Client; no reminder repeats. A scheduler may resume only these explicitly admitted requests. It may not create permission, attest attendance or revive `pay_visit`.

A response is accepted only from the existing verified Client binding/channel-proof resolver, including a Client **without Maya User**. Tenant, Client and request are resolved server-side; a request ID/deep link is never authentication. Initial rating and optional comment form one explicit response, `1..5` and at most 2,000 normalized characters. A later comment/rating correction is a new immutable revision with an explicit expected accepted revision and new command identity; it cannot replace Client, tenant or Appointment. The Client may withdraw the visible response through a new withdrawal revision. No administrator may rewrite the Client's statement. Withdrawal is available after the response window; new ratings/corrections are not. Exact retries return their original receipt even after expiry; altered retries conflict. Unrelated Telegram text never becomes feedback. Native Telegram buttons only hand off to the verified surface. No public `BusinessReview` is created by this contract.

**Delivery and consent.** An admitted request exists in the canonical Client feedback read surface independently of delivery. The immutable plan selects **one** invitation route at admission: verified Client Telegram link first, otherwise existing verified Client Web Push endpoints (maximum five, stable endpoint-ID ordering), otherwise no delivery slots. No User is fabricated. This is explicitly marketing-purpose invitation delivery: current canonical marketing consent and existing preferences/quiet-hour rules must allow it both at admission and each dispatch boundary. Missing/ambiguous policy fails closed; binding membership is not consent. New scoped feedback capability/content registrations are required over the existing A12/A13 transports; no new provider protocol or automatic bulk permission.

Every accepted non-withdrawal response revision pins exact currently active tenant management recipients, deduplicated by canonical User ID, for **Inbox-only** follow-up; no raw `INITIAL_ADMIN_IDS` and no personal text in an external notification. Current membership is rechecked before its slot. No new recipients/devices/routes on retry. Client receipt/thanks and optional external-review links are rendered by the authenticated read surface, not a bot-side send/edit. External-review invitation links require current marketing consent; private feedback submission/withdrawal does not.

**Identity and resume.** New governed classes: `request_native_feedback`, `submit_native_feedback_revision`, `withdraw_native_feedback`. Reuse existing ActionExecution's unique `(tenantId, idempotencyScope, requestIdempotencyKeyHash)` and normalized input contract/hash; booking-specific columns stay unused. Scope contains the canonical initiating subject and operation/request. Same key/same canonical intent resumes one execution; changed intent conflicts before another admission/outcome. Same request under a different key cannot create a second request for the same Appointment/Client. Concurrent corrections compare the exact accepted revision; one winner, stale revision conflicts. There is no process-local awaiting flag or idempotency dictionary.

The fixed slot key contains phase (request or response revision), canonical recipient, purpose, channel and exact endpoint identity. Admission creates/link-resolves the same A12/A13 execution per slot before effect. Sequential Web Push slots use their frozen ordering; confirmed slots skip; unstarted slots continue; UNKNOWN reconciles the same slot and blocks subsequent slots for that recipient. Other recipients are independent. Deterministic terminal failure is terminal. **Cross-channel fallback/retry after either terminal failure or UNKNOWN: NO.** Timeout never marks a sent request failed or permits a new provider operation. Parent response success is not rewritten by a later notification failure.

**Retention and historical rows.** Proposed policy `native-feedback-retention/1`: encrypted request/response payloads expire 365 days after request admission; reads hide expired/withdrawn content without writing. New AC6 class `purge_native_feedback_payloads` may erase only new-model encrypted payloads after deadline and only with no live execution/slot lease or unresolved UNKNOWN reference. It retains non-content hashes, canonical references and idempotency tombstones; no automatic row/audit deletion is authorized. Withdrawal hides content immediately and does not claim erasure of already delivered copies. The existing six AC6 policies and B34 are unchanged; this is one explicit, separately named extension proposed for approval. Legacy `review_requests` remain quarantined historical data, not new request/response identities. **FAKE HISTORICAL BACKFILL: NO.** No arbitrary old chat ID, rating or mutable row becomes a fingerprint, canonical Client or accepted attendance fact.

## Canonical intent fingerprint

Canonical hash contract for this proposal: a versioned, explicitly named object; recursive sorted object keys and UTF-8; Unicode NFC text with CRLF→LF and trimmed outer whitespace; opaque IDs are exact, not lowercased; dates are UTC ISO milliseconds; absent optional business values become explicit null; arrays retain specified order or are sorted/deduplicated only where declared sets. No raw JSON serialization contract, random encryption bytes, HTTP headers, retry time, worker ID or transport metadata. Caller intent hash is separate from immutable admission-plan hash: retries first match the original command, then reuse the original plan, never recompute recipients/routes from current discovery. Current eligibility is a dispatch check, not permission to rewrite that plan.

Exact intent inputs: request = `{contractVersion,tenantId,actorUserId,clientId,appointmentId,purpose:"native_feedback",policyVersion}`; response = `{contractVersion,tenantId,clientId,requestId,expectedAcceptedVersion,kind,rating,normalizedComment}`; withdrawal has the same owner/version scope and kind `withdraw` with null content. Request plan hash additionally freezes eligibility evidence digest, original eligibleAt/expiresAt, invitation content/version and exact route/endpoints/order. Revision plan hash freezes its request/revision/content identity and exact deduplicated management User recipients. Slot hash binds parent/phase/recipient/channel/endpoint/content/version. Dates and policy snapshots chosen at first admission are reused on retry.

## Exact proposed schema

NEW FIELDS counts persisted DB columns, including columns of new models. Existing model column additions: **3**, all on `ActionExecution`. `text?`/other `?` means nullable; all IDs reference existing canonical key types. Hashes are versioned canonical SHA-256/HMAC identities, never raw credentials. The mapping below is the proposal, not a migration.

| Model / purpose | Persisted columns (exact) | Count |
| --- | --- | --- |
| `NativeFeedbackRequest` | `id: text`; `tenantId: text`; `clientId: text`; `appointmentId: text`; `requestedByUserId: text`; `requestExecutionId: text`; `requestIdentityHash: char64`; `intentHash: char64`; `contractVersion: int`; `eligibleAt: timestamptz`; `expiresAt: timestamptz`; `contentHash: char64`; `contentEncrypted: text?`; `planHash: char64`; `planEncrypted: text?`; `state: text`; `revision: int`; `latestResponseVersion: int`; `createdAt: timestamptz`; `closedAt: timestamptz?`; `payloadErasedAt: timestamptz?`; `retentionUntil: timestamptz` | 22 |
| `NativeFeedbackRevision` | `id: text`; `tenantId: text`; `requestId: text`; `clientId: text`; `executionId: text`; `identityHash: char64`; `intentHash: char64`; `version: int`; `kind: text`; `rating: int?`; `commentEncrypted: text?`; `contentHash: char64`; `planHash: char64`; `planEncrypted: text?`; `createdAt: timestamptz`; `payloadErasedAt: timestamptz?` | 16 |


Existing `ActionExecution` additions: `nativeFeedbackRequestId: text?`, `nativeFeedbackRevisionId: text?`, `nativeFeedbackSlotKey: text?`. These are nullable only for unrelated action classes; every admitted package delivery execution requires its complete owner/slot binding.

Constraints: request unique `(tenantId, requestIdentityHash)` and `(tenantId, appointmentId, clientId)`; add an **index/unique constraint only**, not columns, on existing Appointment `(id,tenantId,mayaClientId)` so the request can use that exact ownership FK. Revision unique `(tenantId,requestId,version)` and `(tenantId,requestId,identityHash)`; composite FK `(requestId,tenantId,clientId)` to the same request. ActionExecution unique `(tenantId,nativeFeedbackRequestId,nativeFeedbackSlotKey)` and composite request FK; optional revision FK `(nativeFeedbackRevisionId,tenantId,nativeFeedbackRequestId)` references revision `(id,tenantId,requestId)`, enforcing the same root. Slot key includes request versus revision phase, canonical recipient and exact channel/endpoint identity. Scoped capability CHECK requires request+slot key together; revision-phase keys also require the revision link. Root-only invite keys forbid a revision link. Existing MarketingCampaignRecipient FKs and strict manifest comparison bind the actual Client/User recipient; no new recipient owner or raw-ID fallback. All new FKs are restrictive and tenant-qualified.

Admission/atomicity: request and response rows are **not drafts**: `requestExecutionId` and response `executionId` are NOT NULL restrictive same-tenant links. The admitted AE business executor commits the owner row, accepted revision/CAS and immutable plan in one PostgreSQL transaction. `latestResponseVersion` advances only there. Child delivery also waits for that execution's confirmed business outcome. An unmaterialized slot exists only in the manifest and grants no delivery permission. Lower AE creation persists the complete native feedback parent/revision/slot binding **in the admission transaction**, not as a later update. Unique slot identity collapses concurrent materialization. The scoped CD dispatch boundary rechecks exact manifest slot, current recipient eligibility and confirmed parent outcome. A crash before admission resumes the same frozen slot; a crash after admission resumes the linked original AE. An admitted package delivery with missing owner binding is invalid and nondispatchable. No nullable-link window authorizes an effect.

New Prisma virtual relations (not columns): request → Tenant, Client, Appointment, requester Membership, owning request ActionExecution, response revisions and delivery ActionExecutions; revision → Tenant, request, Client, owning ActionExecution and delivery ActionExecutions; ActionExecution → optional native feedback request/revision using the three new binding columns; matching inverse collections. No Client/User projection is promoted to ownership. The two models hold missing business request and correction history; existing AE/CD supply every slot/attempt/lease/outcome.

## Known path dispositions and required acceptance

- `reviews.py:114,227,288` and pending scheduler/`/reviews_now`/`rev_*`/negative-comment/admin follow-up: retire legacy mutation/send leaves; replace only with the authenticated request/revision initiators or static handoff. `schedule_after_close` remains unreachable/retired; no new automatic producer.
- `database.py:2489–2576` (current named helpers `schedule_review_request`, `record_review_response`, sent/failed/expire helpers) and raw comment UPDATE: guard all direct legacy writers, not just visible handlers.
- Foundation: `prisma/schema.prisma:1371,2582`; `package5-wave4.service.ts:1727` AC4 source authority; `crm/client-channel-runtime.service.ts:75`; Communication Delivery envelope/claim/reconciliation contract. Production-reference line numbers in the master remain historical; functions identify exact scope after R-A/R-B overlays.

Future proof must cover User-free Client, missing/revoked/foreign binding, caller-supplied review ID, wrong tenant/Appointment, unchanged/changed/concurrent identity, explicit correction/withdrawal, marketing consent withdrawal, missing attendance, callback unrelated text, same-slot actual restart, partial delivery and UNKNOWN with zero new routes/devices. Permanent mandatory ratchet: only new native owner writes its tables, only CD performs follow-up; detect reintroduced SQL, direct send/edit/push, transient comment authority, legacy ID lookup, or swallowed ambiguous delivery at any known entry/helper. B34 AC4 regressions must remain PASS. No test or mutation was performed in this assessment.

```text
PACKAGE: R08
BLOCKERS INCLUDED: [B47]
EXISTING FOUNDATION SUFFICIENT: NO
BUSINESS DECISION REQUIRED: YES
SCHEMA REQUIRED: YES
RECOMMENDED OPTION: A
NEW MODELS: 2
NEW FIELDS: 41
NEW ACTION CLASSES: 4 (3 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
RUNTIME-ONLY: NO
INTEGRATION DEPENDENCIES SATISFIED: YES
DEPENDENCIES SATISFIED: NO — package owner/schema approval pending
READY FOR IMPLEMENTATION: NO — YES only after approval
CLIENT WITHOUT MAYA USER: SUPPORTED YES
PRODUCTION MUTATIONS/MESSAGES: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
