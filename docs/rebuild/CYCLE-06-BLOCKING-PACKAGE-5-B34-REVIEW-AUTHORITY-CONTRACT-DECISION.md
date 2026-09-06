# B34 / reduced A27 — exact review contract reconstruction and authority decision

> Option A was approved after checkpoint `7a2cc296`: retire legacy Python
> review import/sync, preserve canonical Maya ingress, zero schema/backfill.
> [Runtime local gate](CYCLE-06-BLOCKING-PACKAGE-5-B34-RUNTIME-LOCAL-GATE.md).
> The proposal's pending-decision status below is historical and superseded;
> its exact AC4 conflict contract remains unchanged.

Base checkpoint: `6a2cbb81b7c664ebff833c6ae02b1cd0d13f820f`. Date: 2026-09-06.
Status: **Stage 1 complete; source-authority / retirement decision required.**
This is a proposal, not an approved runtime cutover. B29–B33 remain accepted.

## 1. Decision and exact STOP boundary

**Changed-source semantics ARE approved: conflict and preserve the original.**
The [Wave 4 contract, §2–3](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-4-A27-A28-RUNTIME-CONTRACT-GATE.md)
requires authenticated tenant/provider/external-id acceptance once; identical
replay converges and changed evidence under that identity fails closed.
The [AC4 classification](CYCLE-06-BLOCKING-PACKAGE-5-AUTHORITY-CLASSIFICATION-MINIMUM-SCHEMA-DECISION-GATE.md#reduced-a27--ordinary-inventory-and-review-ingestion)
identifies the authenticated provider as the external-fact authority. No new
ignore, observation, replacement or correction semantics are needed or proposed.

The remaining gap precedes the AC4 owner: the legacy review feed has **no
verified exact tenant authority**. Its signed Telegram owner check and global
Yandex/2GIS card configuration cannot be substituted for the canonical Maya
membership/tenant context. No approved map-card → tenant binding or retirement
decision for this published legacy feed was found. The accepted
[post-B33 handoff](CYCLE-06-BLOCKING-PACKAGE-5-POST-B33-REMAINDER-CHECKPOINT.md)
explicitly left source/tenant authority and reuse/retirement for this cycle.

An adapter using a new trusted global tenant, a caller-selected tenant, a CRM
bridge token, or an inferred map-card/CRM-company relationship would introduce
a new authority contract. Forwarding only existing Maya JWT requests could
reuse the manual ingress; it would still retire the current signed-widget
import and the credentialless public-page sync. That capability change is the
concrete decision proposed below, not evidence that changed-source behavior is
undefined. No new schema/model/action or implicit trust relationship is created.

```text
AC4 CHANGED-SOURCE CONTRACT DEFINED: YES — CONFLICT, PRESERVE ORIGINAL
CANONICAL REVIEW ACCEPTANCE FOUNDATION SUFFICIENT: YES
B34 LEGACY SOURCE/TENANT AUTHORITY FOUNDATION SUFFICIENT: NO
EXISTING CORRECTION / REPLACEMENT / VERSION LINEAGE: NONE FOUND
RECOMMENDED OPTION: A — retire legacy review ingestion; retain canonical manual ingress
B34 RUNTIME REMEDIATION / DEPLOYMENT: NOT STARTED
```

## 2. Canonical model, ingress and owner

Model: [`BusinessReview`](../../maya-saas-backend/prisma/schema.prisma), line 1366;
12 persisted scalar fields and a Tenant relation. Identity constraint:
`@@unique([tenantId, source, externalRef])`. `externalRef` is nullable in the
historical schema, but the current ingest contract requires a nonempty value.
Do not treat null historical refs as an accepted new-source identity.

Existing ingress:

`POST /api/business-content/reviews`
→ valid Maya access session / active User / active Membership
→ tenant-access, role and `reviews.core` checks
→ `BusinessContentService.ingestReview`
→ `Package5Wave4ReviewFactService.accept`
→ one `BusinessReview` insert or return the original / conflict.

Sources: [JWT validation](../../maya-saas-backend/src/auth/jwt.strategy.ts):44,
[controller](../../maya-saas-backend/src/business-content/business-content.controller.ts):276,
[service](../../maya-saas-backend/src/business-content/business-content.service.ts):202,
[AC4 owner](../../maya-saas-backend/src/package5-wave4/package5-wave4.service.ts):1731.
Write roles are `tenant_owner`, `business_owner`, `tenant_admin`, `administrator`.
Tenant comes from the authenticated membership, then `assertTenantId`, not the
review body. The owner is an internal trusted service, not an authentication
resolver. Its `tenantId` argument alone is not proof of caller authority.

The existing HTTP ingress is authenticated manual ingestion. It accepts a
provider label in its DTO; it does not verify a Yandex/2GIS signature, card
ownership or feed credential. Preserving that accepted ingress does not confer
new automatic-provider authority on Python. The feature catalog explicitly
says external review-provider synchronization needs separate configuration
([source](../../maya-saas-backend/src/common/feature-catalog.ts):412).

No ActionExecution is created or required for this AC4 fact. It has no provider
write/UNKNOWN business execution. Network uncertainty on an ingest response
must retry the same source identity and evidence, not allocate another identity.

## 3. Exact identity and evidence mapping

| Input / boundary | Existing canonical meaning | Constraint |
| --- | --- | --- |
| Authenticated context | Exact `tenantId` from current Maya membership | Body tenant, slug, Telegram founder ID and global salon URL are not substitutes |
| Provider/source | `source.trim().toLowerCase()` | Nonempty, DTO max 40; Yandex and 2GIS are different provider namespaces; no arbitrary cross-provider aliasing |
| Exact provider review id | `externalRef.trim()` | Nonempty, DTO max 160; never derive from text, author, date or content hash |
| Combined identity | `(tenantId, source, externalRef)` → `BusinessReview.id` | One accepted fact in that scope; another tenant/provider has an independent identity |
| Source evidence | Rating, event time, normalized plaintext identity, accepted branch/staff references | Compared on replay; conflict on difference, no retroactive write |
| Derived accepted evidence | Deterministic topic tags stored with the fact | Included in equality; no mutable-tag exception |
| Read projections | Redacted review DTO, rating distribution, averages, topic aggregates | May be recomputed from accepted facts; do not update the original row |

Canonical normalization is already implemented, not newly selected here:

- DTO rating is integer 1…5; `occurredAt` is required ISO8601, converted to Date.
- Text is trimmed, empty becomes null. It is encrypted at rest. The normal
  plaintext ingress compares decrypted original text, not randomized ciphertext.
- `branchId` / `staffExternalId` are trimmed or null. A supplied branch is
  checked against the exact tenant. `staffExternalId` is accepted descriptive
  source evidence, not a canonical Staff FK or authority grant.
- Topics are derived server-side from normalized text, then deduplicated and
  sorted. The existing `wave4Hash` sorts object keys recursively and serializes
  Date to ISO; it is not raw transport JSON equality.
- Within the tenant-qualified lookup, comparison inputs are exactly `source`,
  `externalRef`, `rating`, `occurredAt`, `textIdentity`, `topicTags`, `branchId`,
  `staffExternalId`. Tenant scopes the unique lookup; it is not omitted from
  identity merely because it is outside this equality hash.
- Request time, import time, retries, author display names, HTTP metadata and
  encryption randomness do not become a second identity. No durable fingerprint
  column is needed by this existing review contract.

### All 12 persisted model fields

| Field | Classification | Existing permission after acceptance |
| --- | --- | --- |
| `id` | Immutable business identity | Never rebind/reassign |
| `tenantId` | Immutable ownership/scope | Never move the review to another tenant |
| `source` | Immutable provider identity | Never rename/rebind to another provider |
| `externalRef` | Immutable source identity | Never substitute an ID or content-derived fallback |
| `rating` | Immutable source fact | Changed rating conflicts |
| `occurredAt` | Immutable source fact | Changed accepted provider timestamp conflicts |
| `encryptedText` | Immutable source evidence, encrypted storage | Preserve original; no content rewrite on retry |
| `topicTagsJson` | Derived projection **persisted as accepted evidence** | Included in equality; no reclassification/update flow exists |
| `branchId` | Immutable accepted attribution | Different branch conflicts; no historical reassignment |
| `staffExternalId` | Immutable accepted source attribution | Different staff reference conflicts |
| `createdAt` | Technical metadata | Set by initial insert; no importer update contract |
| `updatedAt` | Technical metadata | ORM `@updatedAt` is not permission to mutate a source fact |

**Approved mutable set on the persisted BusinessReview row: empty.**
There is no `lastSeenAt`, author/display field, response-state field, review
version, replacement pointer or correction owner. The Tenant relation is not a
13th scalar. Existing tenant cascade is a separate lifecycle/schema fact, not
importer authority to delete or rebuild evidence. No retention change is proposed.

Current enforcement is the AC4 owner and the tenant/provider/id unique index;
the BusinessReview migration contains no immutable-update trigger. Do not claim
database-wide prevention of arbitrary privileged SQL. B34 ratchets are still
needed for application paths. Unrelated P4 offer lineage and recovery correction
contracts are not review correction permission.

### Author/display metadata

Neither BusinessReview nor its DTO stores author/display metadata. The current
Python parsers discard it. The canonical HTTP validation rejects unknown DTO
properties (`whitelist` + `forbidNonWhitelisted`). Thus there is no canonical
author-edit test to simulate by adding a field: a future adapter must not add
it to identity or overwrite text with it. Changing a provider-only discarded
author field does not change the already modeled fact; sending that unknown
field directly to the current HTTP DTO is invalid. This limit must be explicit
in a later B34 executable proof.

## 4. Legacy fields and every identified import/sync entry

Precision: the reproduced overwrite is in a **separate SQLite `external_reviews`
table**, not PostgreSQL BusinessReview. Its parallel mutable evidence owner is
the B34 violation. No production population or cross-tenant exploitation is
inferred just from this schema.

[`database.py`](../../ai%20администратор/database.py):2658 defines nine fields.
Its separate initial database setup also defines the table at line 431.

| SQLite field | Current use/write | Canonical disposition |
| --- | --- | --- |
| `id` | Local integer primary key | Not a canonical BusinessReview identity |
| `source` | Provider label, truncated to 24 | Candidate provider only; missing tenant qualification |
| `external_id` | Source id, truncated to 160 | Candidate exact ref only if originally proven; no fake backfill |
| `rating` | Nullable REAL; overwritten on conflict | Canonical integer source evidence; no silent rounding/defaulting |
| `review_text` | Redacted/truncated plaintext; overwritten | Canonical normalized encrypted evidence; no promotion as original unmodified text |
| `published_at` | Optional 32-character string; overwritten | Not automatically equivalent to required canonical event time |
| `imported_at` | Local import time, rewritten on each upsert | Technical legacy timestamp, not occurredAt or a new identity |
| `response_state` | Legacy state, overwritten | Not a BusinessReview field; no approved canonical mutable mapping |
| `alerted_at` | Separate bootstrap/delivery updates | Legacy delivery bookkeeping, not canonical source evidence |

The upsert at line 2684 changes `rating`, `review_text`, `published_at`,
`imported_at`, `response_state` on `(source, external_id)` conflict.
The importer at [`reputation.py`](../../ai%20администратор/reputation.py):518
manufactures a SHA256-derived id when the provider id is missing. Since that
material includes rating/text/time, changed payload can also allocate a new
legacy identity. This fallback cannot cross the canonical boundary.

| Surface | Authority / behavior today | Scope required in later remediation |
| --- | --- | --- |
| Published `POST /api/panel/external_reviews/import` | Signed Telegram/web session → legacy founder-owner → Python import → SQLite upsert | Retire or adapt only through an approved canonical authority; no parallel writer |
| Published `POST /api/panel/reputation/refresh` | Same legacy owner → public-page fetch → same importer; snapshot, bootstrap and alerts | Must not retain a second sync entrance when manual import is fixed |
| `reputation_monitor_loop` | Same refresh/import chain, no Maya membership | Included in source closure; **not active** in the accepted request-only production launcher |
| Direct `reputation.import_reviews` / `refresh_public_reviews` calls | No tenant argument or canonical credential | Fail closed/retire at module boundary, not only at the route |
| `database.upsert_external_review` | Direct mutable SQLite owner | Must no longer be an ingestion bypass |
| `save_source_snapshot`, `refresh_2gis_stats` | Global mutable aggregate settings/cache | Separate observations; never backfill/rebind a canonical review |
| `panel_reviews_handler`, `reputation_snapshot`, owner AI consumer | Read/analyze legacy rows; snapshot may refresh aggregate cache | Do not silently relabel historical SQLite data as canonical AC4 evidence |
| `list_external_reviews`, `list_unalerted_external_reviews`, alerted helpers | Legacy reads/delivery state; lazy ensure may create/alter table | Audit indirect writes and remove live ingestion/delivery fallback in any retirement |

The [read-only inventory](evidence/package5-b34-contract-inventory.json) scans
85 local root non-test Python modules, recording 22 relevant function anchors,
56 syntactic call sites and six SQL-literal sites (including DDL and delivery
metadata, not six content writers). It is not a runtime closure proof. Previous
production evidence covers 70 active non-test modules and the published route:
[production anchors](evidence/package5-b34-production-anchors.json),
[original reproduction](evidence/package5-b34-review-import.proof.json),
[active inventory](evidence/package5-b33-final-production-python-inventory.json).
Those are accepted checkpoint evidence, not a fresh live inspection this cycle.

## 5. Source / tenant gap, without guessing authority

`_public_page_url` reads global `BARBERSHOP_YANDEX` / `BARBERSHOP_2GIS`, checks
HTTPS/host and extracts the map-card id. Parsers ensure the selected card matches
that id. Yandex yields `reviewId` and `updatedTime`; 2GIS yields review `id` and
`date_created`. Neither parser establishes canonical tenant ownership. Public
page retrieval is not a verified Maya membership or a configured authenticated
review-feed binding.

Legacy `_panel_auth` proves a Telegram/web identity; `_panel_resolve_role`
proves its legacy owner role. Neither returns a canonical tenant membership.
The current review module does not call a canonical source resolver.

`BridgeSourceService` binds a configured **CRM provider/company** to an active
CrmIntegration and tenant. It does not bind a Yandex business card or 2GIS branch
to that tenant. Reusing appointment bridge secrets or relabeling a Yandex card
as a CRM company would expand authority. `channel_proof` can forward an existing
Maya JWT for other approved commands; it does not turn a Telegram widget into
an authorized canonical review owner. No provider/card binding model, resolver
or approved review lifecycle extension was found in the inspected schema,
tenancy code, review code and governing Wave 4 documents.

This is a source-code/contract conclusion, **not** a claim that no external
operational arrangement exists. No production configuration secrets, customer
review data or old databases were inspected to invent such an arrangement.

## 6. Minimal Owner/Contract Proposal — Option A recommended

**Approve retirement of legacy review ingestion/sync; retain the existing
authenticated canonical manual ingress unchanged.**

1. Retire the two published Python review-import/refresh write paths and the
   module/database import bypasses. Their compatibility responses must fail
   closed with no fetch/import/alert side effects. Do not retain a background
   route that can restart the same mutable owner.
2. New accepted reviews continue through the existing Maya-authenticated
   `POST /api/business-content/reviews` → AC4 owner. No Telegram→Maya role
   conversion, review bridge credential, automatic tenant choice or additional
   batch transaction contract is introduced.
3. Preserve historical SQLite rows in place. No deletion, guessed tenant/ref,
   invented original text, replay migration or canonical backfill. Existing
   displays must not label that retained legacy snapshot as canonical evidence;
   no new sync, source-fact ownership or canonical business write comes from it.
4. Preserve the existing conflict rule, plaintext/encryption comparison,
   uniqueness and read aggregates. Add the requested all-surface ratchets and
   executable authorization/replay proof before any deployment.

Product effect requiring the decision: the legacy signed-widget import and
public-card refresh stop accepting reviews. The accepted manual Maya ingress
remains available. This proposal does not silently promise an automatic
Yandex/2GIS replacement. It avoids choosing new feed trust/schema semantics.

```text
OPTION A NEW MODELS: 0
OPTION A NEW PERSISTED FIELDS: 0
OPTION A NEW ACTION CLASSES: 0
OPTION A MIGRATION REQUIRED: NO
OPTION A HISTORICAL BACKFILL: NO
OPTION A NEW PROVIDER / TENANT TRUST BINDING: NO
OPTION A APPROVAL STATUS: PROPOSED — NOT IMPLEMENTED
```

If automatic/public-card sync must remain, the alternative is a separate
source-authority decision defining trusted provider/card → exact tenant
binding, its provisioning/revocation and the authorized ingestion credential.
Its storage/schema is deliberately not selected here. Changed-source behavior
would still be the existing conflict rule; no review replacement model follows
from choosing an automatic adapter.

## 7. Required later proof and deployment gate

| Case | Required result after approved remediation |
| --- | --- |
| First authorized import | One canonical fact created by existing AC4 owner; no AE/provider write |
| Identical replay | Same id/evidence; no review update; separate technical audit is not a new business fact |
| Changed text / rating / accepted timestamp / branch / staff | Conflict, original immutable row unchanged |
| Author/display change | Not modeled; no identity/rebound; unknown fields rejected by existing HTTP DTO |
| Concurrent identical | Unique index and conflict-winner reread yield one fact |
| Concurrent divergent | One accepted fact, other attempt conflicts; no overwrite |
| Wrong/missing/revoked tenant membership; foreign branch | Rejected before acceptance; no other-tenant fact |
| Same external id, different provider or tenant | Independent scoped identities; no collision or cross-scope overwrite |
| Restart / lost ingest response / replay | Durable accepted row is reused; changed replay still conflicts |
| Legacy route/module/sync/database bypass | No review content write, source rebound, fallback provider import or delivery |
| Original evidence after all attempts | Unchanged id/scope/text/rating/time/attribution/tags/stamps |

Ratchets must examine active Python import/refresh/worker/database surfaces and
backend writes outside `Package5Wave4ReviewFactService`, plus synthetic bypasses,
unqualified IDs, evidence UPDATE/upsert and history rebinding. A regex only on
`import_reviews` is insufficient. Inventory alone is not this ratchet.

After approval: targeted/executable proof → review/booking regressions → existing
architectural guards → lint → both typechecks → build → schema/migration
preflight → full mandatory backend regression → documented deployment only if
all PASS → structural/read-only production verification. Production review,
booking, provider and business proof mutations remain zero. Then restart the
full Package 5 Final Gate across 13/13 families; B35+ means report/commit/push/STOP.
No later remediation gate is claimed complete by this Stage 1 document.

## 8. This checkpoint verification and hygiene

Repository preflight: origin fetched; isolated `contour/b29-remediation` HEAD
equal to canonical origin at `6a2cbb81`, ahead/behind 0/0, unpushed 0, clean
before documentation edits. Main checkout was read only for status/hash checks.
The 24 recorded dirty entries and hashes are preserved.

Static inventory executes without application imports, database connections or
production requests. The existing review-owner unit case was rerun: **1 PASS,
0 FAIL**, three unrelated cases unselected. It confirms plaintext replay despite
randomized ciphertext and rating conflict with mocked persistence; it is **not**
the requested B34 PostgreSQL/concurrent/authorization proof. The previously
accepted real Wave 4 proof is historical evidence, not a newly rerun gate.

No runtime/schema change, migration, deployment, test DB, provider call, browser,
watcher or background process was created. Full mandatory/runtime/production and
Final Gate stages are not run on this proposal-only checkpoint. All 17 old DBs
were left untouched; no access or inspection was performed. [Evidence](evidence/package5-b34-stage1-checks.json).

```text
B29 / B30 / B31 / B32 / B33: PRESERVED — ACCEPTED PRODUCTION PASS
B34 EXACT CONTRACT RECONSTRUCTION: COMPLETE
B34 IMMUTABLE CHANGED-SOURCE SEMANTICS: EXISTING CONFLICT RULE
B34 SOURCE AUTHORITY / RETIREMENT DECISION: PENDING
B34 IMPLEMENTATION / PRODUCTION DEPLOYMENT: NOT STARTED
B34 PRODUCTION REMEDIATION: NOT PASS
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13 — ACCEPTED BASELINE
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B34 / A27
PRODUCTION REVIEW / PROVIDER / BUSINESS MUTATIONS: 0
MAIN DIRTY WORKTREE TOUCHED: NO — 24 entries/hashes preserved
PRE-EXISTING DATABASES TOUCHED: 0 — 17 protected
PROCESS HYGIENE: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Proposal/evidence/remainder → commit/push → STOP. Approval needed only for the
concrete legacy-source retirement/authority choice, not to reconsider B33 or the
already approved immutable review conflict semantics.
