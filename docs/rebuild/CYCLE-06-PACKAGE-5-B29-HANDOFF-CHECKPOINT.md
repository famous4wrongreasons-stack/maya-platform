# Cycle 06 — Package 5 B29 handoff checkpoint

> Latest Stage 1: [B37 owner/contract/schema proposal](package5-b37-owner-contract-schema-proposal.md), based on accepted `7201f7bd`. B37-A scheduled reminder and B37-B expense mutation are separate. B37 remains STOP pending contract/schema decisions; no runtime/schema/migration change. The B36 idempotency-key and concurrent-write-conflict failures remain mandatory runtime blockers.

> Current continuation: [B36 schema applied / B37 STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B36-SCHEMA-APPLIED-B37-STOP-REPORT.md) and [current remainder](CYCLE-06-BLOCKING-PACKAGE-5-B36-B37-REMAINDER-CHECKPOINT.md). All B36 decisions, including INBOX → TELEGRAM → APNS, remain approved. Production B36 schema PASS; B36 runtime is WIP with a failed PostgreSQL runtime proof and has NOT been deployed. A new B37 weekly staff-expense reminder/intake authority bypass was confirmed during required background inventory; STOP before runtime deployment. B35 runtime preserved; Package 5 NOT COMPLETE. Historical pending/STOP statements below are superseded.

Status: **HANDOFF READY — STOP AT B29 / A18**

Handoff source checkpoint: `917d2ed4ce02162ca6a753e4251fc3067d3024d1`.
The checkpoint matched
`origin/codex/maya-brain-systemic-release-20260815` before this documentation-only
handoff commit.

This document is the canonical continuation point for Chapter 6. It is
self-contained at the decision and execution-plan level; the linked reports
contain the detailed proofs, hashes, migrations, production checks and negative
ratchet cases. B29 has not been implemented in this cycle.

## 1. Repository documentation inventory

The inventory at the handoff source checkpoint found 422 tracked artifacts in
`docs/rebuild/`. Git history and the canonical reports below cover the accepted
Chapter 6 foundation, Package 4, Package 5 Waves 1–6 and every final-remediation
blocker B1–B28. The B29 finding, executable probe and current remainder are also
already tracked.

No material result existed only in a temporary workspace or the current chat.
Consequently, no attachment, temporary report, generated cache or duplicate
evidence was copied into the repository. This handoff checkpoint is the only new
artifact required by the inventory.

Canonical baseline reading order:

1. [Package 1 residual appointment convergence](CYCLE-06-BLOCKING-PACKAGE-1-RESIDUAL-APPOINTMENT-CONVERGENCE-REPORT.md)
2. [Package 2 communication convergence](CYCLE-06-BLOCKING-PACKAGE-2-COMMUNICATION-CONVERGENCE-REPORT.md)
3. [Package 3 canonical ingress completion](CYCLE-06-BLOCKING-PACKAGE-3-CANONICAL-INGRESS-COMPLETION-REPORT.md)
4. [Package 4 final adversarial completion](CYCLE-06-BLOCKING-PACKAGE-4-FINAL-ADVERSARIAL-VERIFICATION-COMPLETION-REPORT.md)
5. [Package 5 Entry Remainder Gate](CYCLE-06-BLOCKING-PACKAGE-5-ENTRY-REMAINDER-GATE.md)
6. [Package 5 common schema foundation](CYCLE-06-BLOCKING-PACKAGE-5-COMMON-SCHEMA-FOUNDATION-REPORT.md)
7. [Package 5 business decision closure](CYCLE-06-BLOCKING-PACKAGE-5-BUSINESS-DECISION-CLOSURE-REPORT.md)
8. [Current post-Wave-6 remainder](CYCLE-06-BLOCKING-PACKAGE-5-POST-WAVE-6-REMAINDER-CHECKPOINT.md)
9. [B28 production completion and B29 STOP](CYCLE-06-BLOCKING-PACKAGE-5-B28-DEPLOYED-FINAL-GATE-STOP-REPORT.md)

## 2. Chapter 6 status

| Scope | Current state |
| --- | --- |
| Packages 1–3 | Accepted convergence/completion baselines; preserve them. |
| Package 4 | **COMPLETE**. Final adversarial verification passed; its value-owner and later cross-package guards remain mandatory. |
| Package 5 common foundation | Applied and accepted. |
| Package 5 implementation waves | **6/6 COMPLETE in production**. Wave 7 does not exist. |
| Package 5 family inventory | **13/13 inventoried**: A15, A16, A17, A18, A22, A23, A25, A26, reduced A27, A28, A29, A30 and A31. |
| Package 5 Final Adversarial Verification | **FAIL / STOP at B29**. B1–B28 are accepted production baselines and must not be reopened without new evidence. |
| Package 5 | **NOT COMPLETE** because B29 is a confirmed production-reachable Client authority and internal mutation-owner bypass. |
| Chapter 6 | **NOT COMPLETE**. After Package 5 passes, a separate Chapter 6 Final Completion/Acceptance Gate is still required. |
| P4-11 / Wave 7 / Chapter 7 | Not created / not started. |

Wave completion reports:

- [Wave 1 — A22/A23](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-1-A22-A23-COMPLETION-REPORT.md)
- [Wave 2 — A16/A25/A26](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-2-A16-A25-A26-COMPLETION-REPORT.md)
- [Wave 3 — A15/A17/A18](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-3-A15-A17-A18-COMPLETION-REPORT.md)
- [Wave 4 — A27/A28](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-4-A27-A28-COMPLETION-REPORT.md)
- [Wave 5 — A29/A31](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-5-A29-A31-COMPLETION-REPORT.md)
- [Wave 6 — A30](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-6-A30-COMPLETION-REPORT.md)

## 3. Last confirmed production baseline

The last runtime deployed before this handoff is B28:

```text
B28 PRODUCTION REMEDIATION: PASS
RUNTIME COMMITS: 80b6d81b, c738bc1b
PRODUCTION RELEASE: /opt/maya-saas/releases/20260906-p5-b28-c738bc1b
MANDATORY DEPLOYMENT REGRESSION: PASS — 362 SUITES / 2952 TESTS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
HEALTH/READINESS: PASS
POST-DEPLOY SERVICE ERRORS: 0
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR PROOF: 0
```

The canonical report/evidence checkpoint that records this production state and
the subsequent B29 STOP is commit `917d2ed4`. Exact production hashes and
read-only verification are in the [B28/B29 report](CYCLE-06-BLOCKING-PACKAGE-5-B28-DEPLOYED-FINAL-GATE-STOP-REPORT.md)
and [B28 deployed recheck](evidence/package5-b28-deployed-final-recheck.json).

## 4. Binding Package 5 decisions

### D1-A through D7-A

The complete approved decision record is
[Package 5 business decision closure](CYCLE-06-BLOCKING-PACKAGE-5-BUSINESS-DECISION-CLOSURE-REPORT.md).
Its binding summary is:

- **D1-A:** CRM connection, verification, import and disconnect are separate,
  bounded capabilities.
- **D2-A:** `CustomerProfile` and `ClientConsentFact` belong to canonical
  `Client`; Maya User/account is optional and may identify an actor.
- **D3-A:** `TrialActivation` owns the one-time bootstrap claim; Package 5
  tenant hard delete is forbidden.
- **D4-A:** normal inventory/catalog removal means archive/hide, never physical
  delete.
- **D5-A:** service, schedule and price configuration changes are prospective;
  accepted appointment conditions remain intact.
- **D6-A:** recovery attribution may be corrected from later authoritative
  evidence while the original evidence stays immutable.
- **D7-A:** retention is central, versioned and allowlisted. Tenant/legal
  overrides require a separate future contract.

The common minimum foundation remains `ActionTargetMutation`,
`OperationalWorkItem`, `ClientConsentFact`, `MaintenanceRun`,
`MaintenanceItemClaim` and the Client-owned `CustomerProfile` compatibility
extension. A30's canonical owner is AC6 Maintenance Coordinator, as recorded in
[the Wave 6 owner decision](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-6-AC6-OWNER-DECISION.md).

### Other owner decisions that constrain future work

| Decision cluster | Binding result | Canonical source |
| --- | --- | --- |
| Client-channel identity | First link requires a server-issued, tenant-qualified, short-lived, single-use challenge bound to an exact Client. Phone, Telegram subject and bare `Client.userId` are not first-link authority. TTL is 600 seconds; tokens are digest/HMAC protected. | [Channel-link proposal](package5-final-a18-client-channel-link-schema-v1-proposal.md), [challenge schema](package5-a18-client-link-challenge-schema-v1-proposal.md), [TTL V1](package5-a18-client-link-challenge-ttl-v1-proposal.md), [foundation report](CYCLE-06-BLOCKING-PACKAGE-5-A18-CLIENT-LINK-CHALLENGE-FOUNDATION-REPORT.md) |
| A18 consent | Authenticated channel → verified `ClientChannelLink` → canonical Client consent command → append-only `ClientConsentFact`. Direct Python SQL writers and heuristic Client resolution are forbidden. | [Initial final blocker](CYCLE-06-BLOCKING-PACKAGE-5-FINAL-ADVERSARIAL-BLOCKER-REPORT.md), [deployed remediation](CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md) |
| A26 trial/admin creation | Public, internal and admin initiators converge on one atomic `TrialActivation`; one activation identity yields one logical tenant. Physical tenant-delete compensation and legacy bootstrap fallback are forbidden. | [Internal trial decision](package5-a26-internal-trial-bootstrap-v1-decision-proposal.md), [deployed remediation](CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md) |
| AI onboarding | Confirmation uses an immutable revision/snapshot/authority/ordered-child-plan receipt. Successful children resume by durable outcome. CRM continuation waits for a real canonical CRM connection/import; mock staff identities are forbidden. | [Receipt schema](package5-ai-confirmation-receipt-schema-v1-proposal.md), [CRM handoff](package5-ai-confirm-crm-handoff-v1-decision.md), [foundation report](CYCLE-06-BLOCKING-PACKAGE-5-AI-CONFIRMATION-FOUNDATION-REPORT.md) |
| Visit mood and notification preferences | Visit mood is Maya-local and Client-owned; no automatic CRM PUT. Notification preferences are distinct from consent; absence inherits policy, `reminder_hours=0` is invalid, explicit range is 1..48 and `reminder=false` disables reminders. | [Visit mood](package5-b5-visit-mood-v1-decision-proposal.md), [preference schema](package5-b5-b6-client-preferences-schema-v1-proposal.md), [B5/B6 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Client habits and phone linking | Encrypted Client preferences are bounded to 12 entries, 8192 plaintext bytes, 10963 persisted encrypted bytes and 200 Unicode code points per entry; overflow rejects atomically. SMS/phone is evidence only and cannot create a Client. | [Habits schema/limits](package5-b7-client-habits-schema-v1-proposal.md), [phone linking](package5-b8-phone-client-linking-v1-decision-proposal.md), [B7/B8 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B7-B8-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Wanted-slot and verified delivery endpoint | `ClientWantedSlotInterest` owns exact-time requests: expiry at slot start, maximum 10 active interests and maximum fan-out 3. Delivery uses a verified `ClientChannelLink` with encrypted reversible address and HMAC subject match; no legacy `chat_id` fallback. | [Wanted-slot schema](package5-b9-wanted-slot-schema-v1-proposal.md), [delivery endpoint decision](package5-b9-client-delivery-endpoint-v1-decision.md), [B9 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B9-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Promo/subscription and cycle outreach | Subscription initiation uses P4-05. New legacy 20% promo issuance is retired. Cycle scoring may create/rank canonical Opportunity but has no automatic outreach authority; direct Telegram and legacy offer/value writes are disabled. | [B10/B11 owner contract](package5-b10-b11-owner-contract-v1-proposal.md), [B10/B11 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B10-B11-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Legacy control-plane paths | Raw Telegram staff/manager/cashier authority, separate daily/growth/capacity goals and the legacy GOD subscriber mutation owner are retired. GOD subscribers is a read-only canonical projection; real staff/access changes use A16 and tenant creation uses TrialActivation. | [B13 contract](package5-b13-control-plane-contract-v1-proposal.md), [B13 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B13-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| GOD billing/overview | Legacy renewal tracker and editable global AI budget are retired. Measured cost is read-only. `maya_tenants` is neither current subscriber authority nor a fallback projection. | [B14 decision](package5-b14-god-billing-owner-decision-v1.md), [B14 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B14-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Realtime history | Client ready requires verified Client binding; staff ready requires canonical User/AuthIdentity, Membership and A16 access. Voice context is session-memory only and disappears on disconnect. | [B21 contract](package5-b21-realtime-session-history-v1-proposal.md), [B21 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B21-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Tips and chat deletion | The unverified tip-sent signal and its Maya value claim are retired; external tip URL remains. Legacy server-side chat deletion is retired pending a future canonical conversation lifecycle and cannot return history/PII on failure. | [B22 decision](package5-b22-tip-contract-v1-proposal.md), [B23 decision](package5-b23-chat-history-delete-contract-v1-proposal.md), [B22 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B22-DEPLOYED-FINAL-GATE-STOP-REPORT.md), [B23 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B23-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Web Push and appointment reminders | `ClientWebPushEndpoint` is encrypted, HMAC-identified, owner-bound and limited to five active endpoints. One logical reminder chooses a durable deterministic route; UNKNOWN never permits cross-channel retry. Explicit Client hours replace tenant schedule; total policy occurrences are at most four. | [Web Push schema/lifecycle](package5-b24-web-push-delivery-endpoint-schema-v1-proposal.md), [reminder policy](package5-b25-reminder-orchestration-policy-v1-proposal.md), [B24 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B24-DEPLOYED-FINAL-GATE-STOP-REPORT.md), [B25 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B25-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| Canonical private reads | Appointment, loyalty and CustomerProfile reads require verified tenant-qualified Client authority and are read-only. Missing canonical facts return empty/unavailable or the approved not-established result; reads do not import, create, backfill or repair business state. | [B26 appointment reads](CYCLE-06-BLOCKING-PACKAGE-5-B26-DEPLOYED-FINAL-GATE-STOP-REPORT.md), [B27 loyalty reads](CYCLE-06-BLOCKING-PACKAGE-5-B27-DEPLOYED-FINAL-GATE-STOP-REPORT.md), [B28 profile reads](CYCLE-06-BLOCKING-PACKAGE-5-B28-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |

## 5. Final remediation history: B1–B28

Every row below has reached production and is an accepted baseline. A report may
also document the next blocker because the full Final Gate restarted after each
successful deployment.

| Blocker | Problem class | Resolution | Production status | Canonical report |
| --- | --- | --- | --- | --- |
| B1 | A18 consent endpoint directly wrote SQL and bypassed Client-owned consent. | Verified channel binding plus canonical append-only Client consent command; direct Python writers fail closed. | PASS | [Initial remediation deployment](CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md) |
| B2 | A26 public trial used legacy bootstrap and physical tenant-delete compensation. | One atomic/restart-safe `TrialActivation`; tenant hard delete and compensation removed. | PASS | [Initial remediation deployment](CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md) |
| B3 | A26 GOD/admin tenant creation was an independent mutation owner. | Admin is an authorized initiator of the same canonical TrialActivation flow. | PASS | [Initial remediation deployment](CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md) |
| B4 | AI onboarding confirmation performed direct A26/A28 mutations without a durable immutable execution plan and used mock CRM handoff. | Immutable confirmation receipt, canonical child actions, durable resume and wait for real A17/A16 CRM continuation. | PASS | [Initial remediation deployment](CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md) |
| B5 | `set-visit-mood` directly wrote SQLite Client profile and performed an automatic CRM PUT. | Client-owned Maya-local `CustomerProfile.defaultVisitMood` / `Appointment.clientVisitMood`; no automatic provider write. | PASS | [B5/B6 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B6 | Notification preferences used direct SQL and even read/no-op could create a legacy Client. | Verified Client → canonical CustomerProfile preferences; no hidden creation; preference is distinct from consent. | PASS | [B5/B6 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B7 | AI Client habits used legacy/direct preference storage and staff notes. | Bounded encrypted Client-owned preferences with atomic overflow rejection; no staff-notes fallback. | PASS | [B7/B8 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B7-B8-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B8 | Phone/SMS link flow implicitly created or updated a Client. | SMS is evidence only; verified challenge/link is required; missing/ambiguous identity fails closed. | PASS | [B7/B8 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B7-B8-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B9 | AI `get_referral_link` and `remember_wanted_slot` called `get_or_create_client`; delivery used legacy identity. | Referral is mutation-free; wanted-slot has a canonical durable owner and verified encrypted delivery endpoint. | PASS | [B9 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B9-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B10 | Promo/subscription endpoints used `get_or_create_client`; promo issued unowned value. | P4-05 owns subscription purchase; legacy promo issuance is retired without rewriting history. | PASS | [B10/B11 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B10-B11-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B11 | Cycle scorer sent direct Telegram through legacy `chat_id` and wrote a legacy offer fact. | Automatic scored outreach disabled; scoring may create canonical Opportunity only; Communication Delivery remains separate. | PASS | [B10/B11 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B10-B11-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B12 | Accepted P4-03/P4-06 fail-closed guards were absent from the active production PWA/runtime baseline. | Active PWA synchronized to canonical loyalty/certificate owners and placed under a permanent cross-package deployment guard. | PASS | [B12 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B12-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B13 | Staff/cashier/manager raw-Telegram authority, plan goals and GOD subscriber mutations bypassed A16/A22/A26. | Legacy controls retired/read-only; A16, A22 monthly finance target and TrialActivation remain owners. | PASS | [B13 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B13-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B14 | GOD billing directly wrote renewal/AI-budget settings; overview trusted `maya_tenants`. | Mutable legacy controls retired; measured-cost/current canonical projections only, with no legacy fallback. | PASS | [B14 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B14-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B15 | Chat-history read created/updated legacy Client, offer, recommendation or history state. | Authorized read-only projection; no history rewrite, hidden creation, offer or value mutation. | PASS | [B15 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B15-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B16 | Booking prefill trusted legacy session/raw `chat_id` and disclosed Client PII. | Verified active ClientChannelLink is required before exact Client PII projection; missing/revoked/ambiguous fails closed. | PASS | [B16 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B16-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B17 | Legacy Client cancel/reschedule record paths trusted raw identity and owned provider mutation. | Verified Client/Appointment ownership → canonical cancel/reschedule actions → Action Engine/provider executor. | PASS | [B17 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B17-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B18 | Six AI/journal appointment helpers directly owned provider mutation or unverified authority. | All six are bridge-only canonical Action Engine initiators; legacy journal write handlers fail closed. | PASS | [B18 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B18-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B19 | Chat/stream booking used legacy Client authority plus local booking/loyalty writers. | Both chat entry points use verified Client → canonical appointment command → Action Engine; local writers retired. | PASS | [B19 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B19-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B20 | Cabinet projections trusted raw chat/session/phone and could mutate on read. | Shared verified ClientChannelLink read-only projection with no identity, profile, consent, history or value writes. | PASS | [B20 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B20-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B21 | Realtime voice used legacy identity/role authority and durable raw-`chat_id` history. | Canonical Client/staff readiness; per-socket ephemeral context; no durable or legacy history writer. | PASS | [B21 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B21-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B22 | Public tip intent acted as unverified payment/value/communication fact. | Tip signal retired; external payment page remains without Maya claiming payment outcome or sending gratitude. | PASS | [B22 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B22-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B23 | Chat delete used legacy session authority, rewrote shared history and disclosed history/PII on failure. | Server-side legacy deletion retired with fixed unsupported response and zero disclosure/mutation. | PASS | [B23 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B23-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B24 | Web Push registry stored plaintext/unowned endpoints and direct senders bypassed Communication Delivery. | Canonical encrypted/HMAC `ClientWebPushEndpoint`, bounded lifecycle and canonical delivery only. | PASS | [B24 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B24-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B25 | Reminder scheduler resolved Client by phone and lacked durable route/override semantics. | Exact Appointment Client, frozen deterministic route/device plan, consent/preferences and ActionExecution/Delivery ownership. | PASS | [B25 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B25-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B26 | Appointment read resolved by User phone, imported provider data and mutated local appointments. | Verified Client read-only `Appointment.tenantId + mayaClientId` projection; no import/backfill/repair. | PASS | [B26 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B26-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B27 | Loyalty GET/projections trusted phone/User/raw Telegram and could create/import value state. | Verified Client read-only loyalty projection; missing account returns approved not-established result; P4 remains value owner. | PASS | [B27 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B27-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |
| B28 | CustomerProfile reads used optional User association and disclosed another Client's profile. | Shared verified Client profile reader selects exact `CustomerProfile.clientId`; read-only, no phone/User fallback. | PASS | [B28 deployment](CYCLE-06-BLOCKING-PACKAGE-5-B28-DEPLOYED-FINAL-GATE-STOP-REPORT.md) |

## 6. Permanent architectural invariants

These constraints are cumulative. A later remediation may tighten them but must
not silently weaken, bypass or replace them.

### Client identity and private projection

- Canonical customer identity is the tenant-qualified `Client`, established for
  a channel by exactly one active, verified, versioned `ClientChannelLink`.
- Phone match, SMS verification, raw Telegram/`chat_id`, legacy session,
  delivery address, consent fact, name, CRM ID from client input and bare
  `Client.userId` are not Client authority.
- A Client without Maya User/account is supported through a verified channel
  binding. User/account is an actor/channel subject, not the Client owner.
- Missing, revoked, ambiguous, merged/held, wrong-tenant or conflicting binding
  fails closed before private projection or Client-authorized command.
- Encrypted delivery addresses are delivery capabilities only and never reverse
  Client lookup or identity evidence.

### Business ownership and reads

- `CustomerProfile`, `ClientConsentFact`, Client preferences and Client habits
  are owned by canonical Client. Consent facts are append-only; original
  evidence and historical facts are not rewritten or fabricated.
- Appointment ownership is exact `Appointment.mayaClientId + tenantId`.
  `Appointment.clientId` is an optional User/account association and cannot
  authorize a Client read or mutation.
- Client appointment mutations must pass verified Client ownership and execute
  through their existing canonical action and Action Engine. An internal-calendar
  appointment is not an exception.
- Package 4 value mutation owner is Action Engine and its execution-bound
  canonical ledgers/claims. P02/P03 holds and Package 4 cross-package ratchets
  remain mandatory.
- Read, projection, GET, no-op and failed compatibility paths create no Client,
  link, profile, consent, appointment, loyalty, referral, value, history,
  opportunity or other business state. Missing canonical data is not repaired by
  a read.
- No legacy mutating owner or fallback may become production reachable merely
  for compatibility.

### Providers and communication

- Initiators, schedulers, AI, scorers and projections do not own provider or
  business mutations. Canonical executors own effects and durable outcomes.
- Provider `UNKNOWN` is not `FAILED`. It forbids blind retry and cross-channel
  retry/fallback and requires the previously approved reconciliation contract
  where provider writes exist.
- Communication requires a separately authorized intent, exact canonical
  Client, current consent/preferences/policy and canonical Communication
  Delivery. Evidence, scoring, Opportunity and wanted-slot interest are not
  communication consent.
- Telegram delivery uses a verified encrypted endpoint whose decrypted subject
  HMAC matches the stored canonical HMAC. Legacy `chat_id` delivery is forbidden.
- Web Push uses `ClientWebPushEndpoint`; endpoint material is encrypted,
  HMAC-addressed, owner-bound and limited to five active endpoints. Registration
  creates neither Client nor consent.

### Architectural protection and operational scope

- Permanent scans cover the backend, active PWA variants, published proxy,
  realtime/voice, cabinet, chat/stream/history, AI/journal, schedulers,
  workers/background/event paths, Communication Delivery and Package 4
  cross-package surfaces.
- Test/proof/migration exclusions must remain narrow and demonstrated. A whole
  file/directory or generic mutation allowlist is not acceptable.
- D1-A…D7-A, Waves 1–6, A30 AC6 ownership, P02/P03, no tenant hard delete,
  prospective configuration, immutable recovery evidence and versioned
  allowlisted retention remain in force.
- Production verification for remediation uses structural/read-only checks; it
  does not manufacture real customer, appointment, value, provider or private
  PII mutations for smoke.

## 7. Active blocker: B29 / A18

### Confirmed production path

`POST /api/appointments/:id/cancel`

The exact source and executable evidence are in the
[B28 production / B29 STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B28-DEPLOYED-FINAL-GATE-STOP-REPORT.md),
[fresh production inventory](evidence/package5-b28-fresh-production-inventory.json),
[B29 executable probe](evidence/package5-b29-appointment-command-authority.probe.cjs)
and [B29 proof result](evidence/package5-b29-appointment-command-authority.proof.json).

Confirmed behavior at checkpoint `917d2ed4`:

1. `appointments.controller.ts` passes authenticated `user.userId` to the
   Client-cancel service.
2. The service/repository authorizes by `Appointment.clientId`, the optional
   legacy User/account association, instead of requiring an active verified
   Client binding and comparing `Appointment.mayaClientId`.
3. The compiled real-PostgreSQL reproduction showed that a target Appointment
   belonging to Client B could be cancelled when the authenticated account had:
   - no verified Client binding;
   - a revoked binding;
   - an active verified binding to Client A.
4. The accepted B26 reader correctly rejected/hid the same mismatched target.
5. Each accepted legacy cancellation changed the internal Appointment to
   cancelled and produced **zero `ActionExecution` rows**.
6. The evidence is an authenticated Client-authority/internal-owner bypass, not
   a claim of anonymous access. The proof used synthetic isolated data,
   intercepted provider/catalog/inbox paths and made zero production mutations.

**B29 is not remediated.** No B29 runtime, schema, migration, ratchet or
deployment change belongs to this handoff commit.

### Approved B29 direction for the next work contour

```text
authenticated identity
  -> verified active tenant-qualified ClientChannelLink
  -> exact canonical Client
  -> Appointment.mayaClientId + tenantId ownership
  -> existing canonical cancellation action
  -> Action Engine
```

Permanent B29 requirements:

```text
LEGACY USER ASSOCIATION AS APPOINTMENT AUTHORITY: NO
PHONE MATCH AS APPOINTMENT AUTHORITY: NO
RAW chat_id AS APPOINTMENT AUTHORITY: NO
CROSS-CLIENT APPOINTMENT CANCEL: FORBIDDEN
ACCEPTED CLIENT CANCEL WITHOUT ActionExecution: FORBIDDEN
CANCEL EXECUTION OWNER: ACTION ENGINE
INTERNAL-CALENDAR APPOINTMENT EXEMPTION: NO
```

For CRM-backed cancellation, preserve the accepted B17 deterministic identity,
idempotency, provider `UNKNOWN` and reconciliation contract. The route must not
write Appointment status directly or call a provider mutation helper. Start with
the confirmed cancel route. Adjacent create/reschedule methods were flagged for
authority reconstruction but were not executed or certified by the B29 probe;
do not claim a defect or modify them without mapping and evidence.

## 8. Next execution plan

The next agent/work contour must:

1. Read this handoff and the linked current remainder, B28/B29 report, D1–D7
   closure, Package 4 completion and relevant B17/B26 appointment reports.
2. Confirm the checkout is clean and `HEAD = origin` before implementation.
3. Map B29 controller/service/repository/runtime ownership to the existing
   Client binding, Appointment and cancellation Action Engine contracts.
4. If those existing contracts are sufficient, implement the narrow B29
   remediation without a new model/action/schema. If a real contract/schema gap
   is found, stop with exact evidence and a minimal proposal before changing
   runtime behavior.
5. Add targeted authorization, retry/concurrency and architectural ratchet
   coverage, including accepted/rejected `ActionExecution` counts and absence of
   direct status/provider writes.
6. Run all required lint, typecheck, build, appointment regressions, permanent
   ratchets and the full mandatory deployment regression sequentially. Any red
   gate stops deployment.
7. If green, run the normal production preflight and deploy the single B29
   candidate. Do not perform a real cancellation/provider mutation for smoke.
8. Complete structural/read-only production verification: health/readiness,
   errors, ownership/ratchets, pending migrations, drift and prior baselines.
9. Restart the full Package 5 Final Adversarial Verification from the beginning
   across all 13 families and every permanent production surface.
10. If another bypass is found, record exact evidence and STOP. Do not create
    Wave 7.
11. If the full Gate is clean, declare `PACKAGE 5 COMPLETE: YES` and commit/push
    its completion report.
12. Do not declare Chapter 6 complete automatically. Run the separate
    `CHAPTER 6 FINAL COMPLETION / ACCEPTANCE GATE` in a later controlled cycle.

## 9. Deferred product capabilities

The following accepted deferrals are product requirements, not missing B29
work. Do not implement them in the B29 remediation:

- unified Maya conversation memory across text, Telegram and voice;
- canonical user-requested conversation deletion with ownership, retention,
  privacy, audit and legal-preservation semantics;
- canonical tip/payment outcome rather than an unverified browser signal;
- richer manager/RBAC/cashier capability beyond the approved A16 access model;
- daily, growth and capacity business-goal capabilities beyond the retained
  canonical monthly finance target;
- infrastructure renewal monitoring;
- versioned AI budget, alert and cost-control policy.

Future reactivation remains required as a separately governed product flow:

```text
client-base analysis
  -> identify/rank loyal clients who have become dormant
  -> canonical Opportunity/list
  -> owner/admin recommended return strategy
  -> explicit approval plus communication policy
  -> permitted Communication Delivery/PushSMS
     OR manual call-list/export
  -> measured return outcome
```

Detection or scoring alone is not communication consent or delivery authority.

## 10. Handoff boundary

This cycle changed documentation only. It did not implement B29, alter runtime
or schema, apply migrations, deploy software, perform production mutations or
touch the 17 pre-existing local test databases.

```text
HANDOFF DOCUMENT CREATED: YES
B1-B28 CANONICAL DOCUMENTATION COVERAGE: COMPLETE
B29 ACTIVE BLOCKER DOCUMENTED: YES
B29 IMPLEMENTATION STARTED: NO
RUNTIME CHANGES: 0
SCHEMA CHANGES: 0
MIGRATIONS APPLIED: 0
PRODUCTION MUTATIONS: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES TOUCHED: 0
```
