# Package 5 post-Wave-6 remainder — B15 owner decision STOP

Accepted checkpoint `c73134ea`. Waves 1–6 remain accepted 6/6. B7–B13 remain
accepted production baselines. B14 runtime commit `7260a5a4` is deployed in the
active request-only PWA, published app/proxy and backend release
`/opt/maya-saas/releases/20260905-p5-b14-7260a5a4`.

1. B14 is closed in production. GOD renewal and editable AI-budget mutations
   are retired, GOD overview has no `maya_tenants` fallback, the health path is
   read-only, and both PWA controls and proxy mutation forwarding are removed.
2. The deployment Gate passed 339 suites / 2793 tests, lint, both typechecks,
   build, release preflight, no-op migration, candidate smoke, health/readiness,
   active P4 and P5 guards, and edge syntax/availability checks. Pending
   migrations are `0`; drift is `NONE`; post-cutover error logs are empty.
3. The fresh Package 5 Final Gate restarted from the beginning across all 13
   families, backend, active PWA, published edge, background/event paths and
   Package 4 guards. It stopped at new blocker **B15 / A18**.
4. Published `chat_history` reaches active `POST /api/chat/history`. The endpoint
   is a read projection but invokes `_ensure_client_loyalty_chat_offer` and
   `_ensure_client_repeat_booking_offer` for client mode.
5. The repeat helper resolves legacy Client state by raw `chat_id` and writes a
   new recommendation into legacy conversation storage through
   `_store_assistant_message_in_chat`. The read handler independently rewrites
   history to add generated message IDs. An isolated reproduction using exact
   deployed function text changed state with one save call; production
   mutations were `0`.
6. The P4 loyalty backfill itself remains fail-closed. The new blocker is
   hidden chat/recommendation state creation from a read endpoint, legacy
   channel identity as Client/communication authority, and the absence of an
   approved canonical Opportunity/outreach/Communication Delivery owner.
7. Before implementation, the owner must decide whether automatic loyalty and
   repeat-booking suggestions are retired or represented by an explicit
   canonical action, who owns persisted in-app recommendations, and whether the
   read-time ID migration is removed or separately classified as protocol
   migration.

Package 5 remains FAIL/NO. B15 is Final Gate remediation, not P4-11 or Wave 7.
No B15 runtime/schema work is authorized by the B14 decision. Preserve B7–B14,
all Waves 1–6, D1-A…D7-A, P02/P03 holds, Client ownership, Package 2
Communication Delivery, Package 4 value ownership, immutable evidence, the
tenant hard-delete prohibition and AC6 A30 ownership. Do not create P4-11,
Wave 7, start Chapter 7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
