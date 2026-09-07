# Wave R-B — R07 / B46 + B57 local completion

Authorized baseline: `cb4fb27c48ca036bdb77b1f9ee480edcb43fdad6`. Scope and owner remain exactly the accepted [R07 assessment](package5-remainder-e2-r07-assessment.md) and master inventory. This is package-local acceptance; coordinated wave verification/cutover remains separate.

```text
PACKAGE: R07
BLOCKERS INCLUDED: [B46, B57]
CANONICAL OWNER: B35 canonical bulk marketing; P405 subscription eligibility/value
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES — R02 production PASS
PACKAGE LOCAL EXECUTABLE PROOF: PASS
PRODUCTION STATUS: COORDINATED WAVE CUTOVER PENDING
```

## Closed paths and retained behavior

- `reactivation.run_reactivation_job` (`reactivation.py:173`), `cycle_reminder.run_cycle_reminder_job` (`cycle_reminder.py:467`) and `subscriptions.run_subscriptions_job` (`subscriptions.py:278`) now return the pure `B35_CANONICAL_OWNER_REQUIRED` refusal before any candidate read, legacy eligibility/sync, send, recovery write, sent marker or task creation. Old reachable bodies were removed; a branch cannot fall through an early tombstone.
- `_send_renew_push` (`subscriptions.py:272`) is independently retired. `database.mark_subscription_renew_pushed` raises the same canonical-owner requirement before SQL. The direct B57 helper cannot send or record success even for an active, unexpired legacy term with unchanged usage. No legacy term/price/phone becomes P405 eligibility or renewal authority.
- Native `/reactivation_now`, `/cycle_now`, `/subscriptions_now` retain R02 staff authorization and explain that no campaign was sent, directing the owner to the existing MAYA panel review. Scheduler wrappers reach only the retired producer. R04 owns the shared-file edit: authenticated `panel_job_run_handler` and `_run_owner_job_from_chat` return the same R07 refusal for all three jobs, without old journal/timestamp/confirmation or background launch. Neither staff role nor natural-language “yes” becomes B35 approval.
- Supported sending remains the existing canonical B35 preview → exact reviewed confirmation → original campaign status/resume flow. No native raw selection is passed into a default all-Client campaign; missing canonical mapping results in no campaign. No second idempotency/approval system was added. Existing canonical Client/no-Maya-User routes, current consent/preferences, pinned audience/route, Action Engine admission, Communication Delivery attempts and UNKNOWN/reconciliation remain unchanged.
- Candidate-only cycle scanning and its projection remain unchanged; six existing projection regressions pass. The exact inventoried birthday flat-`client_id` / nested-`client.id` mismatch remains untouched and guarded. This is preservation of its existing exclusion, not retirement or activation of birthday behavior.
- Existing B36 `_daily_report_job` bytes are unchanged in both canonical and composed production views. Schema/migrations, B36 runtime status and other package ownership were not changed.

The accepted loss is the unapproved automatic or one-click legacy send. Existing owner-reviewed B35 bulk remains supported. No automatic personalized renewal campaign or replacement subscription contract is implied.

## Permanent ratchet

`package5_retention_runtime_guard.py` validates the actual AST call closure, not a delegation string: complete producer/dispatcher bodies must be effect-free; the refusal helper is recursively checked as pure/truthful; direct renewal SQL is closed; staff authorization dominates manual protocol replies; fixed command/HTTP/scheduler registrations cannot bypass or rebind the boundaries. Exact accepted birthday source segments fence accidental activation of its excluded shape.

The existing `package5_bulk_runtime_guard.scan_bulk_sources` includes this scanner. The ordinary mandatory `canonical-bulk.architecture.spec.ts` executes `test_package5_wave_rb_r07.py`. Tests reject **45 mutations of actual source bodies**, including early/late send, push, raw audience, local marker, background launch, conditional tombstone, alias dispatch, exception→cross-channel fallback, shared dispatcher effects, helper effect, route/entry rebinding and birthday activation.

## Proof and deployment composition

[Local proof JSON](package5-wave-rb-r07-local-proof.json) records exact commands, working directories, source and output hashes. Raw stdout remains in the owned app-workspace `work/package5-wave-rb-implementation/r07/`.

| Proof | Result |
| --- | --- |
| Canonical native R07 + B35 + R02/B13 + P405 renewal bridge | 42/42 PASS |
| Actual production-source composition, all deployed native R07 + B35 + R02/B13 cases | 40/40 PASS |
| Existing cycle projection regressions, canonical and composed views | 6/6 PASS in each |
| Ordinary backend B35 owner/controller/panel/policy/delivery, P405 renewal/executable and R02 guard | 10 suites / 80 tests PASS; includes native ratchets |
| Existing B35 real PostgreSQL fixture, root-owned new `maya_rb_r07` database | PASS: 15 main checks + 3 distinct-process resume checks; original UNKNOWN not resent |
| Existing P405 all-eight executable fixture in the same new owned database | PASS: 8 existing action classes; all 16 invariant matrix entries true |
| Owned TypeScript formatting check | PASS |

The PostgreSQL proofs were run by the root agent through [the bounded fixture adapter](package5-wave-rb-r07-foundation-proof.cjs), retaining real current runtime and original assertions. One historical P405 fixture initially failed because it lacked already-required immutable offer references; four proof-only builders received those three references, then all eight existing classes passed. No runtime contract was relaxed. A first composed native command also requested two canonical-only shadow-bridge tests against production, where that module is not deployed; these were recorded as harness errors. Every deployed case passed, and the corrected 40-case composed run is fully PASS; those two bridge tests already pass in the canonical 42-case run. Both superseded failures and hashes are retained in evidence.

The [bounded overlay recipe](package5-wave-rb-r07-overlay.py) replaces **10 named functions in 5 files**, verifies accepted before-function hashes, and adds only the pure refusal helper and source guard. [The composed manifest](package5-wave-rb-r07-overlay-manifest.json) records the 74 hash-matched captured production files plus the 3 R04-owned shared R07 closures. Every unrelated production byte is preserved, including the known `subscriptions.py` divergence outside the replaced entry/helper and the B36 production daily-report body. It does not deploy the canonical file wholesale or copy the nondeployed shadow bridge. The final combined wave composition and live read-only checks belong to the coordinated cutover report.

```text
NEW INVENTORY PATH / DECISION / SCHEMA GAP: NONE
PRODUCTION MUTATIONS/MESSAGES: 0
MAIN 24 DIRTY ENTRIES TOUCHED: 0
17 OLD DATABASES TOUCHED: 0
OWNED RUNNING PROCESSES: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
