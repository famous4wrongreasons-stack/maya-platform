# Package 5 post-Wave-6 remainder — B16 A18 identity/projection STOP

Accepted checkpoint `d531fa75`. Waves 1–6 remain accepted 6/6. B7–B14 remain
accepted production baselines. B15 runtime commit `8c186a54` is deployed in
backend release `/opt/maya-saas/releases/20260905-p5-b15-8c186a54` and the
active request-only PWA.

1. B15 is closed in production. `/api/chat/history` requires canonical
   `ClientChannelLink` status in client mode, reads canonical privacy consent,
   creates no recommendation/communication/value fact, never saves history and
   never rewrites old messages. Its legacy loyalty/repeat offer hooks fail
   closed.
2. B15 proof passed 34 targeted Python tests, 5 architecture checks and the
   mandatory 340-suite / 2798-test deployment regression. Active P4 and P5
   guards pass. Pending migrations are `0`, drift is `NONE`, health/readiness
   pass and post-deploy error logs are empty.
3. The fresh Final Gate restarted from the beginning over all 13 families,
   backend, active PWA, published edge, background/event surfaces and Package 4
   guards. It stopped at new blocker **B16 / A18**.
4. Public proxy action `booking_prefill` reaches active
   `POST /api/booking/prefill`. The handler uses `_authed_chat_id`,
   `database.get_client(chat_id)` and legacy consent to return a Client name and
   full phone. It does not require verified `ClientChannelLink` identity.
5. An isolated reproduction of the exact deployed function returned legacy PII
   from a legacy session/raw channel binding. No production endpoint was
   invoked and production mutations were `0`.
6. Before implementation, reconstruct the prefill/contact presentation
   contract. Prefill must require a verified canonical Client. Missing or
   ambiguous identity must fail closed or return empty/unavailable without PII.
   Do not migrate legacy name/phone mechanically; if an approved canonical
   Client-owned contact projection is insufficient, return the minimal owner or
   schema proposal and STOP.

Package 5 remains FAIL/NO. B16 is Final Gate remediation, not P4-11 or Wave 7.
Preserve B7–B15, Waves 1–6, D1-A…D7-A, P02/P03 holds, Client ownership,
ClientChannelLink/ClientLinkChallenge, Package 2 Communication Delivery,
Package 4 value ownership, immutable evidence, the tenant hard-delete
prohibition and AC6 A30 ownership. Do not create P4-11 or Wave 7, start Chapter
7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
