# Unified MAYA development regression checkpoint — 2026-10-08

The existing explicit YCLIENTS company/branch binding survives application and PostgreSQL restart on the integrated candidate. Current chat retains the selected master while clarifying a missing, multiple or unknown service. Price and goods confirmation no longer wait on a conversation lock held by their own caller. The existing explicit C9 Occupancy response, approval, history and revocation paths pass together in the current React browser. The working website was not changed or deployed.

Code candidate: `4023c4d547884a65923f22b9f9d33e044f347595`, tree `79c41647c1e3c8a142e65621c2074b946d6f1bc1`, isolated branch `codex/maya-development-integration-20261006`. This checkpoint continues accepted source `3febab1755bb6d6410c4f08600d42c8806e182ce`; the requested original `c6a35e5c61975e9d101326e7b3970331f3c905d8` is an ancestor. Evidence is bound to that code candidate; the following documentation commit does not replace its test provenance.

## Useful behavior and bounded repairs

- **CRM source ownership:** the selector receives the three required current-calendar reads through the existing CRM owner. Missing, foreign and changed native bindings refuse. A17 persists one explicit tenant-owned company/branch pair; removal invalidates an already persisted READ. The restart fixture also checks bounded immutable canonical-origin lookup and rejects absent, foreign and ambiguous origins.
- **Booking conversation:** a finite current scoped staff READ retains a uniquely matched public staff name before asking for a missing service or rejecting a multiple/unknown service choice. Request-local aliases are not persisted as authority. The next turn rebinds the preference to the current catalog. Rejected service choices request no availability and emit no booking widget. The explicit availability READ in a test driver is not proof of automatic semantic continuation.
- **Price/goods transaction:** the trigger already held the conversation lock, while the emitter opened a second transaction and waited on that lock. Forwarding the caller transaction preserves current-parent, policy, revalidation and dedupe checks atomically. No timeout increase or lock removal was used.
- **History/privacy composition:** TimelineStore owns minimal exact live conversation/turn projections; the privacy job owns its request lock and orphan query. Request/principal/conversation lock ordering, fresh principal checks, database time and immutable completion replay remain. The required booking noun verifier and stable keyless digest retain their boundaries. No schema or retention policy changed.
- **Planner input:** a finite dictionary encodes four repeated labels while preserving all 89 intent rows, 13 fields, instructions, tools and policy fields under the unchanged 98,304-byte cap. This is serializer evidence, not real-model acceptance.
- **Existing guards and audit:** exact already-approved goods registry deltas and historical HAR inputs are reconciled without promoting conformance. The 165 clause identities/order, 163 false plus two STOPPED:D-H statuses, zero discharged obligations and `NOT_ISSUED` remain. Source/authority checks, typed fact scope and the diagnostic grant callback retain their existing owners.

The original explicit request slice remains [C5 Opportunity/current availability → existing C9 Occupancy → persisted proposal version/evidence](MAYA-EXPLICIT-OCCUPANCY-CHECKPOINT-20261006.md), with [native bound CRM proof](MAYA-NATIVE-OCCUPANCY-CHECKPOINT-20261007.md) and [finite compound owner review](MAYA-COMPOUND-OWNER-REVIEW-CHECKPOINT-20261008.md). Live CRM is not represented by fabricated C7 references. C7/C8 retain their own factual revisions, AE alone owns business mutations, and presentation grants no authority. No second orchestrator, agent framework or background initiator was added.

## Executed results

All final dynamic rows below use clean committed `4023c4d5`. Counts overlap and must not be summed.

| Gate | Actual result | Qualification |
|---|---|---|
| Full backend | **7,237 tests / 645 suites PASS**, zero skips | One worker; bounded Node heap and worker recycling |
| Full widgets-live HTTP/PostgreSQL | **562 tests / 57 suites PASS**, zero skips | Actual local HTTP and fresh PostgreSQL; synthetic provider/model fixtures |
| Focused booking/capture | **12 tests / 2 suites PASS** | Entirely contained in the 562 above |
| Combined current React browser | **1 test / 8 checkpoints PASS** | General chat, explicit Occupancy, price approval/confirmation, restricted schedule, history, uncertain retry and revocation |
| Native branch binding | **prepare 1 + resume 1 PASS**, seven checkpoints | Separate app processes and one actual PostgreSQL restart; 14 source hashes per phase; synthetic native GET transport |
| Goods current React/restart | **prepare 1 + resume 1 + restore 1 PASS** | Two actual PostgreSQL restarts; success, rejection and UNKNOWN facts retained; no resend or active COMMIT on terminal restore |
| Goods HAR13 placement subset | **2 PASS, 145 filtered/pending**, one suite | Intentional finite test-name filter; not a full HAR acceptance run |
| Canonical local smoke | **PASS** | Fresh PostgreSQL, current compiled backend, canonical smoke script; source, entry and harness unchanged; child process group closed and absent |
| Last fixture checks | **PASS** | Full widgets-live TypeScript and scoped lint of the two final fixture files |
| Contract/backend/scripts/live types, contract checker, lint, K3, build | **PASS at `4baefee2`** | Zero lint errors, nine existing generated warnings. `4baefee2` → `4023c4d5` changes only two test expectations, not runtime |
| Migration validate/deploy/status | **PASS** | Local owned databases only |
| Schema diff | **FAIL** | Exactly the three PublicBooking foreign keys below; the overall final PG runner therefore remains FAIL |

The branch fixture reports 34 synthetic provider GETs per phase and zero provider writes, model calls or external calls in that fixture. Its A17 metadata mutations and canonical-origin AE fixtures are intentional local writes, not real provider bookings. Goods fixtures intentionally make five synthetic provider writes during prepare and three during resume, with 16 and three scripted model selections respectively. Negative/replay intervals prove zero additional effects, not a global zero count. Terminal restore reports zero provider reads/writes/model calls and unchanged executions. No real provider, model or OCR acceptance is claimed.

Each final owned PostgreSQL cluster was stopped; smoke's owned process group was absent. Loopback-only Node TCP preload is a boundary on applicable launchers, not a measured global network counter. No real outbound messages, production/HTTPS/phone operations, deployment, push or merge were performed.

## Unresolved schema gate

The migration-derived database uses NO ACTION where Prisma declares RESTRICT for:

- `PublicBookingAttempt(quoteId, sessionId, tenantId)` → `PublicBookingQuote`;
- `PublicBookingQuote(sessionId, tenantId)` → `PublicBookingSession`;
- `PublicBookingSession(tenantId)` → `Tenant`.

The [exact diff output](evidence/maya-development-integration-20261006/unified-regression-20261008/schema-diff.txt) is retained. These belong to the separate website lane. No schema edit was made, and passing HTTP tests do not erase this failure or establish migration/release readiness.

## Evidence and independent review

The [package manifest](evidence/maya-development-integration-20261006/unified-regression-20261008/manifest.json) binds all public files, source qualification and review. [Gate summary](evidence/maya-development-integration-20261006/unified-regression-20261008/gates/summary.json) preserves independent stages, raw digests, source bindings and overlap. [Source binding](evidence/maya-development-integration-20261006/unified-regression-20261008/gates/source-binding.json) records committed blob changes and unchanged protected website/native paths. Earlier checkpoints remain historical evidence; none are silently relabeled as final-candidate tests.

Failed attempts are preserved: original aggregate regressions; source-changing first target run (diagnostic only); sandbox listen EPERM before the authorized repeat; macOS locale and smoke launcher failures; intermediate booking/staff/catalog fixture failures; the corrected diagnostic grant placement; and every PublicBooking schema diff. The earlier PG cohort is a subset of its full run. Two overwritten historical scratch launcher byte versions cannot be replay-verified; the summary explicitly records their mismatches. Current exact launchers are included as provenance with historical absolute paths, not portable ready-to-run commands.

The raw inventory marks an absent convenience filename `http-smoke.log` as `NOT_RUN`; the actual executed smoke writes an intentionally excluded `http-smoke-private.log`. This is an artifact-name limitation, not a missing smoke execution: its source-bound stage manifest reports PASS and completed cleanup.

Jest projections retain counts and hashed test identities/statuses; error/console/auth payloads are omitted. Metadata reports are byte-exact; authored observation projections are marked as such. Private restart/auth receipts, raw auth logs, environment files and PostgreSQL data are excluded. The bundle contains 77 checksum-bound files plus its inventory; the supplement contains 16 bound files plus its manifest. The outer manifest also binds the exact schema diff and final review record.

Independent review covered transaction forwarding, preserved authority/retention boundaries, staff retention, branch source rejection and executed evidence; [review record](evidence/maya-development-integration-20261006/unified-regression-20261008/final-review.json) states the exact qualifications. Both retained screenshots were inspected: the [Occupancy explanation](evidence/maya-development-integration-20261006/unified-regression-20261008/supplement/screenshots/occupancy.png) and [confirmed goods outcome](evidence/maya-development-integration-20261006/unified-regression-20261008/supplement/screenshots/goods-success-outcome.png) are visible. Inherited floating-header overlap remains a design limitation.

## Remaining work and exact boundaries

1. **Booking:** actual browser UNKNOWN-to-CONFIRMED receipt observation, native reschedule UNKNOWN restart and exact-time semantics remain. The proposed exact-time patch is unapplied. Review found that the existing quote owner can convert distinct daylight-saving overlap instants to the same wall-clock time and choose the first match. Preserve the chosen instant or explicitly refuse that ambiguity before accepting the two-choice path.
2. **History/privacy:** the prior [populated retention checkpoint](MAYA-HISTORY-RETENTION-CHECKPOINT-20261008.md) already closes the text-only preservation gap and seven L27 baseline failures within its stated owners. RT8, package/ledger review, consent register/export and remaining design qualification are still separate; this run creates no certificate.
3. **YCLIENTS:** one configured company/tenant branch pair is locally qualified. Multi-company management UI, actual integration rights and real provider responses remain unqualified. Goods real OCR and selected-store/type admission are also unresolved. Broader real-model conversation quality is not established by scripted selectors.
4. **Existing owner choices:** initial Client trust without a verified predecessor; exact C10 background principal/trigger/bounds; the pending metadata-only remote inspection; and the closed-profile one-day/one-master SETTINGS.4 editor/correction exception remain in the [exact decision note](MAYA-REMAINING-READINESS-DECISIONS.md). The schedule exception is proposed, not approved; SETTINGS_DRAFT stays excluded. No fabricated expiring user event or scheduler was added. Explicit verified-Client and C9 work remains usable without those choices.

Automatic approval review previously rejected the metadata-only SSH action because it would collect private infrastructure metadata without the required authorization. That exact action remains paused; no retry or workaround was attempted here. The [recorded blocker](MAYA-HISTORY-ERASURE-UI-CHECKPOINT-20261007.md#exact-remote-metadata-blocker-unchanged) is unchanged. Safe local work continued independently.

This checkpoint is a qualified development result, not completion of all MAYA, C10, real YCLIENTS/model acceptance or release authorization. `NOT_ISSUED`.
