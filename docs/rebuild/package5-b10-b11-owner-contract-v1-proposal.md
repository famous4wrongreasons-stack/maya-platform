# Package 5 Final — B10/B11 owner contract V1 proposal

Status: **OWNER DECISION REQUIRED — RUNTIME/SCHEMA IMPLEMENTATION NOT STARTED**

Source checkpoint: `573c3e7b`

Proposal date: 2026-09-05

## 1. Reconstruction result

The two B10 endpoints do not represent one business operation.

| Surface | Exact operation | Existing canonical owner | Verdict |
| --- | --- | --- | --- |
| `/api/sub/create` | initiate a customer-subscription checkout | P4-05 `initiate_customer_subscription_purchase`, executed by `P405CustomerSubscriptionExecutableService` through Action Engine | contract and schema sufficient |
| `/api/promo_gift` | issue a Client-specific 20% first-visit discount entitlement for 14 days, then present/deliver it | none | owner/value-lifecycle decision required |

P4-09 owns tenant-wide membership/certificate offer configuration and referral
policy. It does not issue Client-specific promotion entitlements. P4-04 owns only
rewards derived from a qualified referral. Reusing either would fabricate the
source and authority of the discount.

The B11 record-delete flow contains five distinct concerns:

| Concern | Existing canonical owner |
| --- | --- |
| YClients record-delete evidence | existing provider event/evidence boundary |
| released-capacity opportunity | Chapter 5 `appointment_cancellation_recovery` Opportunity |
| recovery analysis | `prepare_recovery_options`, proposal-only and explicitly unable to contact a Client |
| recipient/delivery outcome and cooldown | Communication Delivery campaign/recipient/attempt lifecycle |
| proactive cycle-scored outreach authority | none approved for automatic execution |

The legacy `freed_slot_offers` row is not a discount, entitlement, or separate
opportunity. Its fields record the selected Client, slot, send/blocked outcome and
time so the sender can deduplicate and enforce a cooldown. Those facts belong to
the canonical delivery recipient/attempt lifecycle once an outreach contract is
approved. A second offer table is not required.

## 2. Decision D1 — `/api/promo_gift`

### Option A — disable new first-visit promotion issuance in Chapter 6

- `/api/promo_gift` fails closed with an explicit unavailable response.
- It creates no Client, promo code, value fact, message, push or provider effect.
- Existing legacy promo rows are not migrated, rewritten or presented as
  canonical facts.
- P4-09 and P4-04 remain unchanged.
- No schema is required.

Product effect: the current automatic 20% first-visit gift is unavailable until a
separate promotion-entitlement contract is approved.

### Option B — approve a canonical Client promotion entitlement

Add a minimal `ClientPromotionEntitlement` aggregate and canonical issuance/use
commands. Before implementation the owner must approve all value semantics that
the legacy route currently assumes rather than proves:

- eligibility source and proof that this is the Client's first visit;
- exact 20% denomination, eligible services and non-stacking rule;
- 14-day server-derived expiry;
- one active entitlement per approved campaign/Client identity;
- issuer/approval authority and immutable policy snapshot;
- redemption target, final applied discount and one-time claim;
- cancellation/revocation rules;
- presentation and Communication Delivery as effects separate from issuance.

Schema impact: **YES**, at least one new value aggregate plus the minimum durable
one-time fulfillment binding required by the approved lifecycle. Backfill remains
zero. A raw code in `birthday_promo` cannot be promoted to canonical history.

### Recommendation

`RECOMMENDED: OPTION A`

The current endpoint grants financial value without a canonical eligibility,
approval, redemption or non-stacking contract. Disabling new issuance closes the
bypass without inventing value facts during the final Package 5 remediation.

## 3. Decision D2 — B11 cycle-scored freed-slot outreach

### Option A — retain only explicit wanted-slot delivery

Canonical flow:

`record-delete evidence`
→ `appointment_cancellation_recovery Opportunity`
→ proposal-only `prepare_recovery_options`
→ existing B9 exact-time `ClientWantedSlotInterest` matching/delivery.

The separate cycle-scoring branch is removed. A Client who did not create an
exact wanted-slot interest is not contacted automatically. Legacy
`freed_slot_offers`, direct Telegram delivery, legacy `chat_id` lookup and the
cycle-created recovery touchpoint are removed from this path.

Schema impact: **NO**.

Product effect: verified Clients with an exact wanted-slot interest continue to
receive the approved service notification. Heuristic “same master / predicted
cycle” offers stop.

### Option B — owner-approved targeted recovery campaign

Canonical flow:

`record-delete evidence`
→ `Opportunity / prepare_recovery_options`
→ deterministic Client audience proposal
→ business-owner confirmation of exact recipients and content
→ `MarketingCampaign` / recipient claims
→ verified `ClientChannelLink` delivery endpoint
→ Communication Delivery.

The V1 contract would freeze the exact source event, slot, scoring-policy version,
ordered Client identities, eligibility evidence, marketing consent/preferences,
content hash and owner confirmation before dispatch. The existing maximum of two
recipients and seven-day per-Client cooldown may be retained only if explicitly
approved. Provider uncertainty remains `UNKNOWN`; no blind retry is allowed.

Schema impact: **NO** is expected. Existing Opportunity, MarketingAudience,
MarketingCampaign, recipient/attempt and ClientChannelLink foundations can hold
the facts. Runtime must be extended to treat verified Client links as recipients;
the current bulk executor accepts only internal Maya Users and therefore cannot
be reused unchanged.

Product effect: the business owner sees a pending recovery proposal and chooses
whether to send it. Nothing is sent merely because YClients reported deletion.

### Option C — automatic policy-authorized cycle outreach

This would allow a versioned server policy to approve recipient selection and
delivery without a human confirmation. It requires explicit approval of the
marketing classification, score inputs and thresholds, maximum fan-out,
cooldowns, quiet hours, content authority, blast radius and policy-change
authority. The record-delete event still cannot imply consent.

Schema impact: existing durable foundations may be sufficient, but the authority
contract is new and is not approved by any Package 1–5 baseline.

### Recommendation

`RECOMMENDED: OPTION A`

B9 already preserves the high-confidence case where the Client explicitly asked
for the exact slot. The heuristic branch is proactive marketing and currently has
neither owner confirmation nor an approved autonomous policy. Option A closes the
bypass with no new schema or hidden product authority.

## 4. Invariants common to every approved option

`AI/PROMO/SUBSCRIPTION ENDPOINT MAY IMPLICITLY CREATE CLIENT: NO`

`get_or_create_client AS PRODUCTION IDENTITY SHORTCUT: FORBIDDEN`

`PHONE MATCH AS CLIENT AUTHORITY: NO`

`RECORD DELETE EVENT == COMMUNICATION CONSENT: NO`

`SCORER == DELIVERY OWNER: NO`

`SCORER == CLIENT IDENTITY OWNER: NO`

`DIRECT TELEGRAM SEND FROM SCORER: NO`

`LEGACY chat_id DELIVERY: NO`

`DELIVERY ENDPOINT HMAC VERIFIED: YES`

`MISSING/AMBIGUOUS CLIENT OR DELIVERY ENDPOINT: FAIL CLOSED / NO SEND`

`LEGACY freed_slot_offers AS CANONICAL FACT: NO`

`PROVIDER UNKNOWN != FAILED: YES`

`BLIND RETRY AFTER UNKNOWN: NO`

## 5. Resume boundary after owner decision

After D1 and D2 are approved, the same Final Remediation cycle may resume:

1. wire `/api/sub/create` to verified Client resolution and the existing P4-05
   purchase command; delete the legacy body and fallback;
2. implement the approved `/api/promo_gift` disposition;
3. implement the approved B11 disposition using existing Opportunity and
   Communication Delivery owners;
4. add the B10/B11 identity, delivery and direct-write ratchets;
5. run targeted adversarial proof and mandatory deployment gates;
6. deploy without real promo/subscription/Telegram mutations for smoke;
7. restart the complete 13-family Package 5 Final Adversarial Verification.

`B10 SUBSCRIPTION CONTRACT SUFFICIENT: YES`

`B10 PROMO OWNER DECISION REQUIRED: YES`

`B11 OFFER FACT NEW MODEL REQUIRED: NO`

`B11 OUTREACH AUTHORITY DECISION REQUIRED: YES`

`RUNTIME/SCHEMA IMPLEMENTATION STARTED: NO`

`PRODUCTION MUTATIONS: 0`
