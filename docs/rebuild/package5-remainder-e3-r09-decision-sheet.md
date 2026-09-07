# E3 / R09 — public community facts and moderation decision

**PROPOSAL ONLY — NOT APPROVED.** Exact package **R09 / B52**, closed master inventory at `60e82664`; R02 is production PASS. This covers the already inventoried community gateway, anonymous comments/likes/views, moderation, `process_comment` and its brand-reply/owner-alert helpers. It does not reopen site publication discovery or alter B34 native/external-review ownership.

## Options and recommendation

| Option | Contract | New models / columns / action classes | Migration / backfill | Business loss |
| --- | --- | --- | --- | --- |
| **A — RECOMMENDED** | Tenant-bound anonymous source-fact acceptance plus human moderation and human-approved brand replies. Separate from verified Client facts. | **2 / 36 / 3**: 2 AE + 1 explicitly proposed AC6 class | YES / NO | No model auto-publication or automatic brand replies; moderation is manual and may be slower. No direct owner Telegram alerts; queue must be opened in the canonical panel. Anonymous self-edit/delete is unsupported. Unverified historical comments/counters do not become current canonical content. |
| B | Retire community comment/like/view mutation, moderation mutation and notifications; retain static editorial site content. | 0 / 0 / 0 | NO / NO | No interactive discussion or engagement counters, including canonical moderation. Historical storage remains untouched. |

**WHY A:** retains public discussion while distinguishing “a browser submitted this” from “a verified Client said this.” Existing AC4 patterns, canonical current staff authority and Action Engine are reusable, but external `BusinessReview` cannot express anonymous publication, visibility revisions, likes or moderator authority. Separate comment and anonymous observation models hold those facts. Existing ActionExecution and ActionTargetMutation already hold moderation intent, actor, receipt and target-generation history; only one current execution link is needed on a comment, not a second moderation journal.

## Proposed contract A

**Public source boundary.** The existing verified gateway supplies a configured `sourceGatewayId → exact tenant + allowed publication namespace` mapping. URL/body tenant, visitor cookie, form token, rate-limit bucket, raw Telegram session and display name cannot override that mapping or authenticate a Client/staff Member. Known static slugs and already-published canonical site references are allowlisted; draft publication writers receive no new permission. A gateway signature proves source transport only. It must be verified against its configured source scope before admission; missing or ambiguous mapping fails closed.

All visitor submissions remain **ANONYMOUS**, even when a legacy optional `user_id` appears. No Client/User relation is created or inferred. Visitor HMAC is a pseudonymous browser scope, not a unique human and not consent. Preserve existing normalization, anti-impersonation, explicit publication-consent checkbox, PII/spam checks and rate/form limits; limits are protocol protection, not moderation authority. Do not disclose rejected text in error payloads or model prompts.

**Comments.** New guest comments are immutable source facts with normalized label (max 40) and text (max 1,200), exact publication and explicit consent-policy version. Same source/visitor/key with the same normalized fact returns the original comment; changing text, display label, publication or consent version conflicts. `PENDING` is hidden. Deterministic rejection before admission creates no comment or ActionExecution. Model review may provide a non-authoritative suggestion; model output never publishes, changes state, impersonates staff or sends an alert. No process-local task is necessary to preserve a pending queue.

**Moderator.** Current active exact-tenant `tenant_owner`, `business_owner`, `tenant_admin` or `administrator` Member only; platform role without that membership is insufficient. Two new AE classes: `moderate_public_community_comment` and `publish_public_community_reply`. Moderation uses exact comment/content hash and expected revision; approve/reject/withdraw visibility records one existing AE-linked ActionTargetMutation and updates the visibility projection/current execution link in the same local transaction. Re-review is an explicit new command/revision; original Client/anonymous text never changes. `acknowledge` may resolve an already terminal review queue item but never publish a pending comment by implication. A human brand reply is an immutable child of an approved parent in the same publication/tenant; one brand reply per parent in V1. Sender name is the configured brand, not arbitrary guest text. No automatic MAYA reply remains. Anonymous authors cannot edit/delete by cookie; they may ask staff to moderate. There is no Client-history erasure permission.

**Interactions.** Views and explicit desired `liked=true/false` are anonymous source observations under exact source/visitor/publication. A daily view identity includes server UTC date; repeat views do not increase that day's observer count. Like/unlike commands include the existing projection's expected version and a fresh stable key. Same key with a changed desired state conflicts; a concurrent state transition has one winning version. Different keys requesting the already-current liked state return the current outcome without a second transition. Public counts derive from the latest accepted observation per browser/publication; no claim of distinct people. Status/fetch reads do not record views, change moderation, bootstrap schema or purge data; a view is a separate explicit source-fact request.

**Delivery, idempotency and restart.** Moderation queue is a canonical read surface. Option A sends **no external moderation notification** and creates no replacement bulk run; `notify_owner` and its `owner_notified` marker are retired. Thus no delivery-plan/partial-fanout schema is needed here. Normal HTTP response loss resolves the same accepted comment, interaction or moderation ActionExecution; it never reruns model publication or notification. Moderator AE commands bind canonical User, tenant and operation in existing `idempotencyScope/requestIdempotencyKeyHash` uniqueness and compare the persisted normalized input hash; guest observations use their own model's source-fact uniqueness. Distinct concurrent moderation against the same revision has one winner. Local commit is authoritative; an HTTP timeout is unresolved receipt, not proof of failed mutation. Provider UNKNOWN / cross-channel retry / partial bulk resume: **not applicable because no provider delivery is admitted by A**. Pending moderation survives a real process restart as durable rows; there is no “interrupted means rejected/approved” startup rewrite.

**Correction, retention, deletion.** No in-place editing of guest or brand text. Corrections require a newly submitted fact and explicit moderation; prior visible content may be withdrawn by its canonical moderator. Proposed `public-community-retention/1`: comment/reply payload is hidden after 365 days from creation; new AC6 class `purge_public_community_payloads` erases only encrypted author/text after deadline and no live referenced execution/lease. Non-content hashes, decision/idempotency tombstones and pseudonymous interaction facts are retained; automatic row/audit deletion is not authorized. Reads never unlink or erase. This one explicit new policy does not widen existing AC6 classes or authorize general conversation deletion.

New foundation applies only to new facts. Legacy public comments/likes/counters are frozen historical data and excluded from the new canonical public feed and counts; they may remain in a separately labeled authorized archive without fabricated moderator/Client/provenance records. No bulk anonymous-to-Client conversion or fabricated fingerprint is permitted. Editorial articles remain published. **FAKE HISTORICAL BACKFILL: NO.**

## Canonical intent fingerprint

Canonical hash contract for this proposal: a versioned, explicitly named object; recursive sorted object keys and UTF-8; Unicode NFC text with CRLF→LF and trimmed outer whitespace; opaque IDs are exact, not lowercased; dates are UTC ISO milliseconds; absent optional business values become explicit null; arrays retain specified order or are sorted/deduplicated only where declared sets. No raw JSON serialization contract, random encryption bytes, HTTP headers, retry time, worker ID or transport metadata. Caller intent hash is separate from immutable admission-plan hash: retries first match the original command, then reuse the original plan, never recompute recipients/routes from current discovery. Current eligibility is a dispatch check, not permission to rewrite that plan.

Exact intent inputs: guest comment = `{contractVersion,sourceGatewayId,tenantId,visitorSubjectHash,publicationKey,normalizedAuthor,normalizedText,publicationConsent:true,consentPolicyVersion}`; key itself is the separate source identity. Brand reply substitutes current canonical actor and exact parent/content hash; no guest authority. Moderation = `{contractVersion,tenantId,actorUserId,commentId,contentHash,expectedRevision,decision,reasonCode}`. Like observation = `{contractVersion,sourceGatewayId,tenantId,visitorSubjectHash,publicationKey,desiredLiked,expectedVersion}`. View = same source/publication/visitor scope plus server UTC viewDay; retry lookup reuses the originally admitted day, not the retry clock. Consent acceptedAt/receivedAt are stored audit timestamps, excluded from retry comparison.

## Exact proposed schema

NEW FIELDS means persisted columns, including new models. Existing model column additions: **0**. Nullable fields carry `?`; all text payloads containing names/comments are encrypted at rest. Immutable hashes are calculated over normalized plaintext in the trusted boundary before encryption, never over random ciphertext or unnormalized raw JSON.

| Model / purpose | Persisted columns (exact) | Count |
| --- | --- | --- |
| `PublicCommunityComment` | `id: text`; `tenantId: text`; `publicationKey: text`; `parentCommentId: text?`; `sourceKind: text`; `visitorSubjectHash: char64?`; `identityHash: char64`; `intentHash: char64`; `authorEncrypted: text?`; `textEncrypted: text?`; `contentHash: char64`; `consentPolicyVersion: text?`; `consentAcceptedAt: timestamptz?`; `status: text`; `revision: int`; `createdAt: timestamptz`; `retentionUntil: timestamptz`; `payloadErasedAt: timestamptz?`; `creationExecutionId: text?`; `sourceGatewayId: text`; `lastModerationExecutionId: text?` | 21 |
| `PublicCommunityInteraction` | `id: text`; `tenantId: text`; `publicationKey: text`; `kind: text`; `visitorSubjectHash: char64`; `identityHash: char64`; `intentHash: char64`; `expectedVersion: int`; `version: int`; `desiredValue: boolean?`; `viewDay: date?`; `receivedAt: timestamptz`; `sourceGatewayId: text`; `contractVersion: int`; `payloadHash: char64` | 15 |

Constraints: all models have `(id,tenantId)` uniqueness and restrictive tenant relations. Comments unique `(tenantId,sourceGatewayId,identityHash)`; guest identity includes visitor/operation key, and a brand identity includes canonical actor/operation key. Parent composite FK is same tenant; parent publication must match; unique non-null brand parent enforces one reply in V1. CHECK distinguishes guest visitor+consent versus canonical brand creation-execution evidence. Interaction unique `(tenantId,sourceGatewayId,identityHash)` and `(tenantId,sourceGatewayId,publicationKey,visitorSubjectHash,kind,version)`; view day uniqueness is additionally enforced for `kind=view`. Version allocation/expected-state comparison is serialized per exact visitor/publication/kind. Moderation uses existing ActionExecution tenant/actor/operation key uniqueness and existing ActionTargetMutation unique `(tenantId,targetKind,targetRef,targetGeneration)`; exact content hash and expected revision CAS fence publication. The comment lastModerationExecutionId FK is tenant-qualified. A guest comment can leave PENDING only with its same-tenant admitted moderator execution link; the canonical actor is read from that AE, not duplicated as a second authority. No Client FK exists by design.

Admission/atomicity: guest comment/interaction rows are AC4-style anonymous source facts and intentionally have no fabricated AE/User claim. A brand comment requires a same-tenant creation ActionExecution by CHECK. For moderation, the existing execution intent/receipt and ActionTargetMutation constitute the immutable decision history. The mutation fact, comment visibility/revision CAS and lastModerationExecutionId update commit together inside the admitted executor transaction. CHECK requires an admitted decision link for non-PENDING guest status; no accepted publication has a null decision link. AE actor, normalized decision/content hash and safe result reason/version must remain auditable under this capability’s 365-day payload policy and retained audit tombstones; no fake external-review history. Public reads accept only committed projections. Existing AE key uniqueness binds normalized moderator intent before a write.

Virtual Prisma relations, excluded from column counts: comment → Tenant, optional parent/children, creation ActionExecution and current moderation ActionExecution; interaction → Tenant; corresponding inverse collections. Existing AE actor Membership and target-mutation relations are reused. No extra model is proposed for workers, model reviews, anonymous “users,” provider delivery or publication registry.

## Evidence, path disposition and required proof

The master B52 row names `POST /api/site/community/{action}`, both site-community gateway paths and `reserve_comment/process_comment/resolve_comment`. The known production-only sources are in the coordinating agent's hash-pinned R-B baseline; **`site_community.py` and `site_engagement.py` are absent from canonical root Python, so implementing only canonical files would miss this package**. This is an existing inventoried variant, not a new production path.

- Captured `site_community.py:62,114,137,171,185,218,281`: lazy schema/startup mutation, likes, comment reservation, moderation, direct owner notices, model state/brand-reply chain and legacy admin gate. Replace known mutations with the respective new fact/AE owner; retire model-publication and direct-notify branches. Preserve gateway/anti-abuse as transport protection.
- Captured `site_engagement.py:244,300` and related `add_comment/toggle_like`: only canonical source-fact/admitted moderation paths may write; no alternate local SQLite owner. `site-community-proxy.php` remains an initiator, never a moderator or Client principal.
- Existing foundation: R02 current-principal controller/global guards; `package5-wave4.service.ts:1727` demonstrates AC4 idempotent fact acceptance but does not approve reuse of external reviews for community; `package5-wave6.policy.ts` shows the six existing bounded classes.

Future local proof: forged tenant/gateway/visitor-as-Client, missing/revoked moderator, published-parent scope, same/changed/concurrent source identity, like/unlike replay/version race, moderator race, restart with pending queue, delayed model suggestion cannot override a human decision, sanitized public projection, expiry/withdrawal pure reads, and historical rows never promoted. Permanent mandatory ratchet must cover production-only modules plus both gateway callers: reject direct SQL/modeled publication, raw is_admin authority, direct Telegram/brand-reply calls and read/startup business mutations; source-fact owner and approved executor/AC6 leaves are the only narrowly allowed writers. No test, database access or production call was performed in this assessment.

```text
PACKAGE: R09
BLOCKERS INCLUDED: [B52]
EXISTING FOUNDATION SUFFICIENT: NO
BUSINESS DECISION REQUIRED: YES
SCHEMA REQUIRED: YES
RECOMMENDED OPTION: A
NEW MODELS: 2
NEW FIELDS: 36
NEW ACTION CLASSES: 3 (2 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
RUNTIME-ONLY: NO
INTEGRATION DEPENDENCIES SATISFIED: YES
DEPENDENCIES SATISFIED: NO — package owner/schema approval pending
READY FOR IMPLEMENTATION: NO — YES only after approval
ANONYMOUS FACT IMPLIES CLIENT AUTHORITY: NO
PRODUCTION MUTATIONS/MESSAGES: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
