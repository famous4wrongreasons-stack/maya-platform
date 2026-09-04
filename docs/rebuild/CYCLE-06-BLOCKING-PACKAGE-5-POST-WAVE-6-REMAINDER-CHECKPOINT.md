# Package 5 post-Wave-6 remainder — B10/B11 deployed, Final Gate stopped at B12

Accepted owner checkpoint `b932f86f`. Waves 1–6 remain accepted 6/6. B9 remains
the accepted production baseline and B10/B11 runtime commit `ce08e931` is now
deployed.

1. `/api/sub/create` is a verified Client initiator for existing P4-05
   `initiate_customer_subscription_purchase`; hidden Client creation is zero.
2. `/api/promo_gift` is retired with an explicit mutation-free 410 outcome.
   Historical promo facts remain untouched and no canonical promo lifecycle was
   invented.
3. Record-delete retains B9 exact wanted-slot matching but cycle-scored outreach
   is disabled. The scorer sends no Telegram message, reads no legacy delivery
   `chat_id` and writes no legacy offer/cooldown fact.
4. The B10/B11 deployment gate passed 336 suites / 2779 tests. Backend and PWA
   health/readiness passed, post-start error logs were empty, pending migrations
   are 0 and drift is NONE. No real production business/provider mutation was
   used for proof.
5. The complete 13-family Final Gate restarted from scratch and stopped at new
   blocker **B12**. The active published PWA source lacks accepted Package 4
   fail-closed legacy guards that exist in repository HEAD.
6. Exact reachable B12 paths are public loyalty booking, gift-certificate
   creation/redemption and the record-delete legacy loyalty refund. They can
   directly write legacy loyalty/certificate facts and call YClients/YooKassa
   outside their accepted P4-03/P4-06 owners.
7. This is production source/deployment convergence work, not Wave 7. No B12
   change was made because the Final Gate requires STOP on a new bypass.

Package 5 remains FAIL/NO. The next controlled cycle must restore the accepted
Package 4 guards/canonical ownership on the exact active PWA runtime, pass the
mandatory deployment gates, deploy without real loyalty/certificate/provider
smoke mutations, and then restart the full 13-family Package 5 Final Gate from
the beginning.

Preserve B7–B11, all Waves 1–6, D1-A…D7-A, P02/P03 holds, Client ownership,
immutable evidence, the tenant hard-delete prohibition, Package 2 Communication
Delivery and AC6 A30 ownership. Do not create Wave 7, start Chapter 7 or declare
Chapter 6 complete. All 17 old databases remain untouched; owned processes,
watchers, Chrome and temporary databases are zero.
