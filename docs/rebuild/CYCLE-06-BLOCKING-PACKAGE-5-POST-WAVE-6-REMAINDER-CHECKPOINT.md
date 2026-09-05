# Package 5 post-Wave-6 remainder — B19 chat booking authority/local owner STOP

Accepted checkpoint `9456a552`. Waves 1–6 remain accepted 6/6. B7–B17 remain
accepted production baselines. B18 runtime commit `76936d0f` is deployed in
backend release `/opt/maya-saas/releases/20260905-p5-b18-76936d0f`, the active
request-only PWA and the published proxy/application.

1. B18 is closed for the exact six active residual appointment provider sites.
   `update_booking`, attendance, add/replace services, duration and Client field
   changes are bridge-only and map 6/6 to existing canonical appointment
   actions. Direct YClients PUT ownership outside canonical executors is `0`.
2. Customer AI update/reschedule/cancel uses verified Client and Appointment
   authority. The five affected legacy journal write routes fail closed in
   favor of the SaaS journal with `CrmStaffAccess`. Provider dispatch repeats
   authority immediately before execution. `UNKNOWN`/reconciliation and no
   blind retry remain enforced.
3. B18 proof passed 74 targeted Python tests, 5 TypeScript suites / 73 tests and
   the mandatory 345-suite / 2839-test deployment regression. Active Package 4
   and Package 5 guards pass. Pending migrations are `0`, drift is `NONE`,
   health/readiness pass and post-deploy error logs are empty.
4. Production verification used structural/read-only checks. Real Client,
   appointment and provider mutations were `0`. The first PWA candidate was
   rejected by health and rolled back because it omitted an active request-only
   compatibility overlay; the corrected exact-active-overlay candidate then
   deployed successfully. No unrelated working-tree changes were deployed.
5. The fresh Final Gate restarted from the beginning over all 13 family
   foundations, backend, active PWA, published proxy/application, AI,
   journal/history, background/event, identity/PII/read/provider surfaces and
   Package 4 guards. It stopped at the first new blocker, **B19 / A18**.
6. Published `action=chat_stream` and its `action=chat` fallback reach active
   `/api/chat/stream` and `/api/chat`. Both authenticate a channel/session but
   reduce identity to raw `chat_id`, then pass only that value to
   `_finalize_booking_for_chat` when AI requests booking.
7. The finalizer selects a legacy SQLite Client by `chat_id`, uses its phone,
   name and legacy notification preferences, and invokes `create_appointment`
   without verified `ClientChannelLink` or canonical Client authority. After
   success it writes a legacy booking fact; a requested loyalty redemption can
   also enter a legacy Package 4 mutation path.
8. The B19 provider write already belongs to Action Engine. The new blocker is
   the legacy Client identity decision plus out-of-band booking/value owners.
   An exact-artifact isolated reproduction reached the legacy Client lookup,
   appointment command and legacy booking write from one synthetic raw
   `chat_id`; network/provider calls and production mutations were `0`.
9. The next controlled remediation must reconstruct the chat-booking boundary
   from authenticated channel to verified ClientChannelLink, canonical Client,
   canonical appointment creation and canonical local/value convergence. A
   chat authentication, phone, legacy Client or consent row cannot supply
   Client authority. No legacy booking or loyalty fallback may remain. If the
   existing canonical schema/actions do not express every required outcome,
   return the minimal proposal and STOP.

Package 5 remains FAIL/NO. B19 is Final Gate remediation, not P4-11 or Wave 7.
Preserve B7–B18, Waves 1–6, D1-A…D7-A, P02/P03 holds, verified Client identity,
Package 2 Communication Delivery, Package 4 value ownership, immutable
evidence, the tenant hard-delete prohibition and AC6 A30 ownership. Do not
create P4-11 or Wave 7, start Chapter 7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
