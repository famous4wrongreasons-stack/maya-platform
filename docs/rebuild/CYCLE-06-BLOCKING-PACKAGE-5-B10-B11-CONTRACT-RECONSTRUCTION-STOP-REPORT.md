# Cycle 06 — Package 5 Final B10/B11 contract reconstruction STOP report

Status: **STOP — OWNER DECISION REQUIRED**

Source checkpoint: `573c3e7b`

Report date: 2026-09-05

## Outcome

The production baseline was inspected without changing runtime, schema,
migrations, provider state or business data. B9 remains accepted and was not
reopened.

B10 subscription purchase has an exact existing canonical owner: P4-05
`initiate_customer_subscription_purchase`. The production PWA route still owns a
legacy purchase body that resolves identity through SQLite, creates legacy
subscription state and invokes YooKassa directly. Its safe remediation is fully
defined: verified Client identity must enter the P4-05 executor and the legacy
body must be removed.

B10 promo issuance is not covered by an existing owner. The route creates a
Client-specific 20% first-visit discount valid for 14 days in the legacy
`birthday_promo` table, then performs direct Telegram/push presentation. P4-09
owns tenant offer configuration, P4-04 owns qualified-referral rewards and
Package 2 owns delivery; none owns this entitlement or its eligibility and use
lifecycle. A decision is required between disabling new issuance and approving a
new canonical promotion-entitlement contract.

B11 decomposes into existing provider evidence, Opportunity and Communication
Delivery foundations, but the automatic cycle-scored outreach authority is not
approved. Chapter 5 explicitly limits `prepare_recovery_options` to a proposal
that contacts nobody. Package 2 provides durable delivery, but its existing bulk
executor is owner-confirmed and internal-User/inbox based. B9 provides verified
Client delivery only for exact wanted-slot interests. The record-delete event
cannot silently authorize a separate marketing send.

The legacy `freed_slot_offers` row is a send outcome/cooldown record. It does not
need a new offer model: canonical campaign recipients and delivery attempts own
those facts after an outreach contract is approved.

The minimum owner decision is recorded in
`package5-b10-b11-owner-contract-v1-proposal.md`. The recommended Chapter 6
choice is to disable new first-visit promo issuance and remove automatic
cycle-scored outreach while preserving B9 explicit wanted-slot delivery.

## Production evidence

Read-only inspection of the running PWA source confirmed:

- `/api/promo_gift` calls `database.get_or_create_client`, writes
  `birthday_promo`, then sends through legacy Telegram/push helpers;
- `/api/sub/create` calls `database.get_or_create_client` before phone
  validation, then owns legacy subscription/payment effects;
- `offer_freed_slot` runs the canonical B9 exact-interest match first, then a
  separate cycle branch that uses legacy Client rows and `chat_id`, calls
  `app.bot.send_message`, writes `freed_slot_offers`, and publishes a recovery
  touchpoint.

No endpoint was invoked and no record was created, updated, deleted or delivered
during this reconstruction.

## Stop verdict

```text
B9 PRODUCTION REMEDIATION: ACCEPTED BASELINE
B10 CONTRACT RECONSTRUCTION: COMPLETE
B10 SUBSCRIPTION CANONICAL OWNER: P4-05 initiate_customer_subscription_purchase
B10 SUBSCRIPTION EXISTING SCHEMA SUFFICIENT: YES
B10 PROMO CANONICAL OWNER: NOT FOUND
B10 PROMO OWNER/VALUE-LIFECYCLE DECISION REQUIRED: YES
B11 CONTRACT RECONSTRUCTION: COMPLETE
B11 RECORD-DELETE OWNER: PROVIDER EVENT/EVIDENCE BOUNDARY
B11 RELEASED-CAPACITY OWNER: APPOINTMENT CANCELLATION RECOVERY OPPORTUNITY
B11 RECOVERY ANALYSIS OWNER: prepare_recovery_options — PROPOSAL ONLY
B11 DELIVERY OWNER: COMMUNICATION DELIVERY
B11 LEGACY OFFER FACT CLASSIFICATION: DELIVERY OUTCOME/COOLDOWN, NOT VALUE ENTITLEMENT
B11 NEW OFFER MODEL REQUIRED: NO
B11 OUTREACH AUTHORITY DECISION REQUIRED: YES
RUNTIME/SCHEMA IMPLEMENTATION STARTED: NO
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
REAL PRODUCTION MUTATIONS: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
```

The 17 pre-existing local test databases were not touched. No process, watcher,
browser or temporary database was started or left by this cycle.
