# Package 5 post-Wave-6 remainder — B10/B11 owner decision STOP

Accepted owner checkpoint `573c3e7b`. Waves 1–6 remain accepted 6/6. B9 schema
commit `0d640318` and runtime commit `9b483768` are deployed as production
release `/opt/maya-saas/releases/20260904-p5-b9-9b483768`.

1. The verified Client delivery endpoint is durable and nullable. It stores no
   plaintext or fake historical backfill; HMAC remains channel identity authority.
2. `ClientWantedSlotInterest` owns exact-time wanted-slot intent with expiry at
   slot start, max ten active per Client and max-three earliest eligible delivery.
3. Original B9 AI bypasses are closed: `get_referral_link` is mutation-free and
   `remember_wanted_slot` requires verified ClientChannelLink authority. Production
   structural/read-only verification passed without real mutations.
4. Production migration state is 78 repository / 81 accepted production records,
   pending 0 and drift NONE. Health/readiness and error-priority logs are clean.
5. The mandatory fresh 13-family Final Gate found **B10/A18**: published
   `promo_gift` and `sub_create` routes both call direct SQLite
   `get_or_create_client`. `sub_create` creates the Client before returning
   `no_phone`; both routes also lead to direct legacy value/provider effects.
6. It also found **B11**: the record-delete freed-slot initiator runs a separate
   cycle-scoring branch that sends Telegram directly to legacy `chat_id` and
   writes a legacy offer fact outside Communication Delivery.
7. B10/B11 contract reconstruction is now complete. `/api/sub/create` maps exactly
   to P4-05 `initiate_customer_subscription_purchase` and needs no schema decision.
   `/api/promo_gift` issues a separate first-visit discount entitlement for which
   no approved canonical owner or value lifecycle exists.
8. The record-delete opportunity and Communication Delivery owners already exist.
   `freed_slot_offers` is delivery outcome/cooldown evidence, so no new offer model
   is needed. The missing decision is whether heuristic cycle-scored outreach is
   removed, owner-confirmed, or granted a new automatic policy authority.
9. Package 5 remains FAIL/NO. Runtime/schema implementation is stopped at
   `package5-b10-b11-owner-contract-v1-proposal.md`. After the owner decides the
   promo disposition and B11 outreach authority, resume the same remediation,
   deploy with zero real smoke mutations, and restart the complete 13-family Final
   Gate from scratch.

Preserve B9 and all earlier production baselines, D1-A…D7-A, P02/P03 holds,
Client ownership, immutable evidence, tenant hard-delete prohibition, Package 2
Communication Delivery and the AC6 A30 owner. Do not create Wave 7 or start
Chapter 7. All 17 old databases remain untouched; owned processes, watchers,
Chrome and temporary databases are zero.
