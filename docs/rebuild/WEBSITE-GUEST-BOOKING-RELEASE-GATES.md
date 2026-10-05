# Guest booking: provider acceptance, release diff and rollback

Local candidate only; no production activation is authorized by this document.
Baseline implementation: `b3fdbfe1a70ef1bb3232f1a3895a89c32e811f64` after
`2da0f90d414c911dc3142f004eee04ef219207c4`. Subsequent recovery changes retain
one appointment owner, one CRM adapter transport and the same ActionExecution.

## Official-source contract checked read-only

Source: official YCLIENTS OpenAPI snapshot `yclients-official-openapi-2026-10-05.json`,
SHA256 `cd1ad2d04ed96ccfcdaedd7d39a9350dd7b9b91d5c681023e8ecafdc1348ac41`.
Relevant paths: POST `/api/v1/book_record/{company_id}`, GET
`/api/v1/book_services/{company_id}`, GET `/api/v1/book_times/{company_id}/{staff_id}/{date}`,
GET `/api/v1/records/{company_id}`, GET `/api/v1/record/{company_id}/{record_id}`.
No real provider request or write was made for this review.

| Boundary | Implementation and qualification requirement |
|---|---|
| Public create | Existing client-mode `book_record`, one appointments[] item, explicit staff/services and offset-aware instant. No admin records/create fallback. |
| Receipt | Require a single result, echoed `id=1` and positive exact `record_id`; echo `id` alone is not a created record. `record_hash` is a management secret and never a guest response. |
| Correlation | Prose describes api_id as string, request schema as number. Send a positive JSON-safe numeric projection plus the **full server HMAC marker in comment**. Readback requires both, so a truncated numeric-ID collision cannot prove success. Provider preservation must be qualified. No provider idempotency guarantee is assumed. |
| Readback | Existing adapter pages records for the quoted local date with_deleted=1. Incomplete/repeated-full-page/duplicate/missing matches do not resolve. One candidate is re-read by exact record ID; company, full marker, numeric api_id, active/deleted flag, staff, service set, instant and duration must match. No phone lookup or Client attachment. |
| Time/branch | Tenant timezone drives the existing slot owner. Conflicting branch timezone is refused. Configured tenant/branch and frozen provider company must still match at recovery. A provider company is not chosen by the browser. |
| Catalog | Staff-specific book_services duration and fixed undiscounted price only. Ranges, discounts, invalid duration and mandatory/unknown prepayment are not silently approximated. |
| Contact | Official schema requires phone/fullname/email; current existing transport sends email="". Whether empty email is accepted for this specific company is an explicit acceptance prerequisite. Never fabricate an email or a verified identity. |
| Phone proof | Official schema says code is required when company phone_conformation=true. This release has no OTP continuation; such company configuration must block activation until a supported continuation exists. No fabricated code or MAYA login substitution. |
| Consent | Guest confirmation freezes the configured consent version/URL and rejects missing consent. Provider personal-data flag is true only on admitted guest create; newsletter consent is explicitly false. The deployed document must cover the intended provider processing. |
| Notifications | notify_by_sms=0 and notify_by_email=0 suppress those reminder settings. They do **not** prove that all company confirmation/staff/webhook automations are disabled. Verify the actual company rules and controlled destinations before any test create. |
| Negative outcome | Docs list business error codes 431–437 but do not supply qualified error envelopes in this operation's responses schema. Do not parse messages or convert arbitrary 4xx/5xx into “not created.” Positive exact readback is implemented; absence remains UNKNOWN. |

## Exact prerequisites for any real test-record acceptance

1. Name the approved test company/integration, canonical tenant/branch, exact salon timezone,
   staff ID and service IDs, available test interval and expected fixed amount/duration. Confirm
   it is the authorized release target and not a copied production company under a test tenant.
2. Supply an owner-controlled test contact and any required email; verify phone confirmation,
   prepayment, booking availability and provider data-processing configuration. Do not reuse a
   real customer identity or create a Maya User/Client link for this test.
3. Verify partner/user authorization for public create **and** bounded list/detail reads. Read-only
   checks must establish company scope, staff/service compatibility and the slot before dispatch.
4. Confirm notification destinations/rules and bind the existing owner test-record authorization
   to the exact approved company/contact/interval; do not request that broad authorization again.
   Zero reminder hours alone is insufficient proof of zero messages. No paid charge or broad
   notification acceptance is included. Existing instruction currently forbids real writes.
5. Record one exact create receipt and provider readback; confirm full correlation preservation,
   record ID versus echo ID, timezone/staff/services/duration and no unintended Client authority.
   Exercise controlled response loss on that same attempt and prove one provider record/one
   execution, status recovery after reload/restart and no redispatch. Use a genuinely isolated
   provider scenario; synthetic adapter tests do not satisfy this item.
6. For missing/deleted/moved/ambiguous records or unavailable read permission, preserve UNKNOWN
   and a visible contact/investigation path. Never clear an uncertain attempt to create again.
   This release does not yet provide a qualified negative-outcome/manual-support resolver.

## Concrete migration/application diff

The guest baseline adds these four migrations, applied **only** to the owned local proof DB:

- `20261005160000_public_booking_guest`: additive immutable session/quote/attempt tables; tenant
  and session/quote compound foreign keys; unique secret, nonce and intent bindings.
- `20261005160100_public_booking_rejected_intent`: partial active-intent unique index; only a
  durable pre-dispatch refusal releases the intent guard, never the nonce receipt.
- `20261005160200_public_booking_action_source`: narrow guest-create source constraint and an
  insert trigger binding AE tenant/sourceRef/input hash/target to active guest evidence.
- `20261005160300_public_booking_utc_clock`: UTC defaults/comparisons independent of DB timezone.

Reviewed local migration SHA256 values (the target must match exactly):

| Migration suffix | SHA256 |
|---|---|
| 160000_public_booking_guest | `e02cd1b34c3c1a70e2c038e77e800926776aaa5b837a78dfe646c59a52366a42` |
| 160100_public_booking_rejected_intent | `85ee849ad4bcbce80c582b8f0a3b562d4e48812c85f609e3c5a463f1bacb752a` |
| 160200_public_booking_action_source | `8c7fab5a9bef40d719d2c7bb164609bbfafb072402fbee046552f4bfa9cc6766` |
| 160300_public_booking_utc_clock | `678d2accbbef88a17b3f766bd39aa41143fb872ae7d7d0d8d75beaa4d7edca52` |

Recovery adds no schema migration. It adds an optional server-only providerRequestId to create
normalization, exact YCLIENTS readback, and a narrow AE readback-only completion method. A positive
proof can reopen guest MANUAL_REQUIRED reconciliation under the existing execution lock and
finalize PROVEN_SUCCEEDED; the method has no dispatch callback and cannot return READY. Other
capabilities and principals retain their existing admission/reconciliation rules.

Before release, inspect the **actual** target backend SHA, applied migration names/checksums,
DB roles/backups and reverse-proxy mapping. The installed iOS currently uses the unchanged old
production API; local green tests are not evidence that production has these prerequisites.
Do not run an unreviewed `prisma migrate deploy` against an older production baseline: it could
apply unrelated pending migrations. Resolve that complete migration inventory first.

Deploy candidate with PUBLIC_BOOKING_SITES unset initially; generate Prisma client in its own
release artifact, never through the shared local node_modules symlink. Qualify the same-origin
website adapter (Origin/Cookie/Set-Cookie, no-cache, status/reload/reset). Review the exact
site→tenant/branch/origins/consent mapping and activate only after the complete release approval.
Keep retired create_record refusal and all other relay boundaries intact.

## Rollback preserves evidence and prevents duplicates

First stop new guest POST /attempts admission at the reviewed ingress and show website maintenance;
retain GET status, session cookie scope and existing evidence where possible. Never route users to
legacy raw create or fabricate FAILED for pending requests. Let already-dispatched attempts settle
through their original backend/AE or exact readback; no retry by a replacement deployment.

Rollback the recovery application to the guest-compatible baseline only if necessary, understanding
that this removes automatic positive readback and requires investigation of UNKNOWN. Disable new
admission before rolling back farther to a pre-guest backend. Retain all additive tables, AE rows,
constraints and encrypted payload retention policy. No automatic down migration, table deletion,
source-allowlist shrink over guest rows or cross-version replay is authorized. Restore an earlier
website bundle only with its mutation relay still closed; never restore legacy booking authority.

A concrete release approval must attach target inventory, candidate SHAs, migration checksums,
frontend/browser and real test-record evidence, exact ingress/config changes, backup reference and
rollback operator/commands for that actual environment. Server network/setup approval remains
separate and pending; no paid model calls are part of this guest release.


The shortest actionable provider plan and exact remaining negative/manual proof boundary are in
[WEBSITE-GUEST-ONE-RECORD-ACCEPTANCE.md](WEBSITE-GUEST-ONE-RECORD-ACCEPTANCE.md).
