# E2 Stage 1 — R07 / B46 + B57 assessment

Assessment baseline: `b1a937fe4cb1a179cec315c0b49ec4e384e52161`. Exact scope is the accepted [master package definition](package5-remainder-inventory-final.json), R07: **“Native reactivation/manual cycle/renewal initiators converge to B35 manifest/consent/attempts; no renewed legacy value owner.”** No inventory expansion or runtime implementation was performed.

```text
PACKAGE: R07
BLOCKERS INCLUDED: [B46, B57]
CANONICAL OWNER: B35 canonical bulk marketing owner; P405 retains subscription eligibility
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES: [R02]
DEPENDENCIES SATISFIED: YES — R02 production PASS in Wave R-A
READY FOR IMPLEMENTATION: YES
READY FOR PRODUCTION: NO
IMPLEMENTATION THIS STAGE: NOT STARTED
NEW PRODUCTION PATH / INVENTORY DEFECT: NONE IDENTIFIED
```

Foundation sufficiency means enforcing the **existing owner-confirmed B35 contract**, including rejecting unsupported initiators. It does not authorize automatic marketing, a new campaign scheduler/segmentation policy, native chat approval, new personalized renewal terms or a new subscription model. R02 proves staff access; it does not constitute B35 campaign approval. No repeated owner/schema approval is needed for the already-approved restriction.

## Exact current evidence

`TS:` paths below are relative to `maya-saas-backend/src/`. `PY:` denotes the actual production source, not an assumption that every canonical-tree Python function is deployed. Unmodified producer captures are in `work/package5-exhaustive-inventory/python/`; R-A-modified launcher/database captures are in `work/package5-wave-ra-implementation/stage-python/`, under the app workspace. Each inspected capture was hash-matched against the existing local `work/package5-wave-ra-implementation/production-postcutover-metadata.json`; **no SSH, application import or DB read** was used.

| Evidence | Exact meaning for R07 |
| --- | --- |
| Master `findings.B46`, `findings.B57`, `packages.R07`; [completion report](../CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md), package table | Two existing blockers; dependency R02; business/schema NO; automatic marketing without owner confirmation must fail closed. |
| `PY:reactivation.py:76`, `:171`–`:233` | Audience is local Telegram/phone history; direct send at `:202`, legacy reactivation sent/blocked marks follow. Local consent/read filters do not supply B35 audience/approval/attempt ownership. |
| `PY:cycle_reminder.py:379`, `:465`–`:567` | Scheduled candidate scanning remains distinct from manual sending. Manual job recomputes recipients, sends Telegram, calls the legacy PWA helper and records sent/blocked/error outcomes outside the B35 graph. |
| `PY:subscriptions.py:239`–`:264`, `:269`–`:327`, `:330`–`:369`; `PY:database.py:2891`, `:2900`–`:2905` | An unchanged-usage or early-return sync bypasses the disabled usage setter; an active unexpired legacy term can reach raw-chat renewal delivery and `UPDATE subscriptions SET renew_reminder_sent_at`. Ambiguous delivery is caught generically and can be repeated. This is the already-inventoried B57; no historical eligible row is asserted. |
| `PY:bot.py:1012`, `:1052`, `:1395`, `:4708`, `:4724`, `:4753`; `PY:webhook_server.py:3219`, `:3372`–`:3482`, `:3485`–`:3582` | Manual commands, APScheduler wrappers and panel/chat fixed-job dispatch reach those same producers. Panel `asyncio.create_task(fn(app))` at `:3450` and chat at `:3546` do not bind a reviewed campaign/intent. Local job timestamps and a natural-language “yes” are not B35 confirmation. |
| `PY:birthday.py:34`, `:70`, `:157`; `PY:yclients.py:1167`–`:1183` | Preserve the master B46 exclusion: nested `client.id` lookup cannot consume the current flat `client_id` record projection. This is a fragile data-shape exclusion, not explicit retirement. Do not repair that mismatch or revive gift/send behavior; include it in the permanent guard. |
| `TS:marketing/canonical-bulk.service.ts:54`–`:76`, `:95`–`:145`, `:320`–`:406` | Existing owner must be a verified Maya User with active exact-tenant owner membership/AuthIdentity. Preview accepts an explicit canonical `clientIds` selection or all Clients, freezes it, and conflicts on changed same-key intent. Confirm binds the exact reviewed hash, canonical approval and root ActionExecution; resume uses the same graph. |
| `TS:communication-delivery/communication-bulk-policy.service.ts:49`–`:123`, `:126`–`:244` | Existing verified Client routes, optional Maya User, exact endpoint plan, current owner/Client/tenant checks, canonical consent facts/preferences and dispatch evidence. Audience membership and approval never imply consent. |
| `TS:communication-delivery/communication-bulk-delivery.service.ts:72`–`:184`, `:202`–`:220` | Root admission is mandatory; logical Client claims and deterministic slot keys are durable. UNKNOWN blocks dependent slots; independent Clients continue. Actual transport attempts belong to Communication Delivery. |
| `TS:customer-subscriptions/customer-subscription-renewal-shadow.service.ts:171`–`:263`; `p4-05-customer-subscription-executable.service.ts:980`–`:1048` | Existing P405 reads validate canonical CRM/Client binding, exact subscription/client/term, active state, existing renewal window, approved offer and absence of successor. The executable owner rechecks exact predecessor/Client identity. A legacy SQLite row, price, phone or reminder flag cannot replace these facts. The shadow planner is not a read-only selector to invoke during preview: its mutation/planning path must not be accidentally called for eligibility reads. |
| `ai администратор/legacy_marketing_bulk_bridge.py:7`–`:40`; `webhook_server.py:3656`–`:3684` in canonical source | Existing transport carries canonical owner proof and preview/confirm/resume/status identity; ambiguous outcomes request the same campaign resume. The current panel preview forwards text/identity only; targeted native selection must never silently become its default all-Client audience. |

The P405 job/usage early-return tombstones visible in canonical `ai администратор/subscriptions.py:244` and `:341` are **not** present in the hash-matched production producer. R-A preserved that unmodified production file. A future R07 overlay and ratchet must cover the deployed function bodies, not claim B57 fixed from the canonical-tree tombstones alone.

Hash-matched producer sources:

| Production file | SHA-256 |
| --- | --- |
| `reactivation.py` | `c2417c9884437ab08ae059f5f8a0a9757c95beb50d808b6be97b67eb2caa70d6` |
| `cycle_reminder.py` | `188039aae341fa102ac1a01d51f604d143d227d444f556b338f8675cbe44c41b` |
| `subscriptions.py` | `335d0e8400d3d457676fafc6bf168109be908645c35a349d5249f9c47f03ae24` |
| `bot.py` | `6d31753b1b3c54886985026d552dd7e61f3860d3f0deb8a511d2a49081f96f86` |
| `webhook_server.py` | `f5956dd6665ac838db8619ac4d52b78ef00a73f89e7fe7f879a7fc1a0971dee9` |
| `database.py` | `e00d81bf1b7976fa07a34db824944f899d8ea9c408441009cbab3fcea866dbf3` |

## Minimal package plan after implementation authorization

1. Put an explicit fail-closed boundary at the actual reactivation/cycle/renewal sender entries and their manual/scheduled dispatch branches. Without the exact B35 campaign/intent and valid existing owner proof, return the canonical-owner-required outcome before sends, background execution, delivered markers or renewal mutations. Do not synthesize approval from R02 role, Telegram chat ID, old job timestamp or legacy “yes”. Candidate scans may remain non-authoritative projections; they cannot admit or send a campaign.
2. Supported manual sends use the existing B35 preview → reviewed confirmation → same campaign status/resume flow. Carry an explicit tenant-qualified canonical Client selection only when existing canonical identity resolution proves it. Missing/unresolved selection fails closed; never fall back to raw phone/chat ownership or broaden a targeted selection to all Clients. Unsupported old native buttons may direct the owner to the existing canonical review surface. Preserve supported B35 payload/approval contracts; no new automated/personalized offer contract is part of R07.
3. Retire `_send_renew_push` and the direct `mark_subscription_renew_pushed` authority. Do not reactivate legacy usage/expiry/activation/payment logic or import old terms. Any permitted canonical renewal offer must derive eligibility/terms from P405 and pass through the existing owner-confirmed B35 route; absent a provable supported mapping, no offer is sent. This closes B57 without inventing a new renewal-notification capability or schema. Existing P405 value actions remain the only route for actual renewal business outcomes.
4. Reuse B35's `MarketingCampaign`/audience/Client recipient/slot graph, existing ActionExecutions and Communication Delivery attempts. A retry changes neither audience nor route/content; confirmed successes skip, pending work resumes, UNKNOWN reconciles/remains manual-required, independent recipients continue. No automatic cross-channel fallback or new logical identity after ambiguity. No SQLite sent flag becomes the idempotency owner.

The accepted loss is the old unapproved automatic send and one-click legacy send bypass. Existing canonical owner-reviewed bulk remains supported. This does not justify reintroducing automatic campaigns or a second subscription owner.

## Package-local acceptance and permanent ratchet

Implementation must leave an ordinary mandatory Python/backend regression and active-source guard; **none was written or run in this assessment**.

- Exercise scheduler, direct producer, bot command, panel and chat entry for all three producers; a valid R02 principal without B35 reviewed intent still produces zero deliveries, canonical admissions and legacy sent/renewal writes. Test malicious raw Client/chat/phone, changed audience/content, missing/revoked owner proof, wrong tenant, duplicate confirmation and concurrent same key.
- Exercise the exact B57 active/unexpired/unchanged-usage and early-return branches using synthetic rows; assert no raw send, no reminder marker, no renewal value/provider operation. Missing/terminal/wrong-Client/wrong-tenant subscription, successor and closed renewal window must not be promoted into a permitted offer. No historical data existence claim or fake backfill.
- For supported B35 sends, prove canonical Client without Maya User, consent/preferences withdrawal and route revocation, no delivery before admission, frozen explicit audience, same-key conflict, one per-recipient outcome, restart/partial resume, UNKNOWN preservation and no cross-channel retry. Reuse existing B35/P405 acceptance fixtures; test the native transport with synthetic dependencies and a fresh owned database when durable proof is required.
- Extend `ai администратор/package5_bulk_runtime_guard.py:7`–`:40` beyond its current five panel/broadcast boundaries to the exact R07 producer/sink/dispatcher closure; extend `maya-saas-backend/src/marketing/canonical-bulk.architecture.spec.ts:17`–`:85`. Use AST dominance/call-closure checks and mutated **real producer/dispatcher bodies**, not marker presence alone. Reject early `send_message`, `_send_client_push`, sent/renewal writes, raw audience authority, asynchronous dispatch before B35 proof, exception→failed/reset/retry, and renewal branches that escape a tombstone. Guard the known birthday shape exclusion against accidental unguarded activation. Keep candidate-only scans explicitly separate.
- Validate both canonical source and the composed Python deployment view so the existing P405 tombstones cannot mask live B57. Preserve B35/P405 guards and R02 authority; coordinate shared `bot.py`/`webhook_server.py` hunks with other E2 packages. Package-local proof precedes the coordinated wave gate/cutover. No full Package 5 Final Gate until all 14 remediation packages reach production PASS.

```text
ASSESSMENT ONLY: YES
RUNTIME / SCHEMA / MIGRATION / TEST IMPLEMENTATION: 0 / 0 / 0 / 0
TESTS EXECUTED: 0
DATABASE / SSH / PROVIDER CALLS: 0 / 0 / 0
PRODUCTION MUTATIONS/MESSAGES: 0
MAIN WORKTREE / 17 OLD DATABASES TOUCHED: NO / NO
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
