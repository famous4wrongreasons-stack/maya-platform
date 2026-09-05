# Package 5 post-Wave-6 remainder — B18 appointment authority/owner STOP

Accepted checkpoint `f69bf0f9`. Waves 1–6 remain accepted 6/6. B7–B16 remain
accepted production baselines. B17 runtime commit `eb17dff4` is deployed in
backend release `/opt/maya-saas/releases/20260905-p5-b17-eb17dff4`, the active
request-only PWA and the published proxy.

1. B17 is closed for `/api/client/cancel-record` and
   `/api/client/reschedule-record`. Both require the original authenticated
   channel, exactly one active tenant-qualified `ClientChannelLink`, and an
   exact canonical Appointment owned by that Client.
2. The two endpoints delegate to existing `cancel_appointment` and
   `reschedule_appointment` Action Engine owners. The canonical executor
   rechecks channel/appointment authority before provider dispatch. Legacy
   phone/session ownership, actor markers, direct provider calls and mutating
   fallback are absent. Existing `UNKNOWN`/reconciliation semantics remain
   intact; production mutation smoke was `0`.
3. B17 proof passed 35 targeted Python tests, 18 TypeScript
   service/architecture tests and the mandatory 344-suite / 2829-test
   deployment regression. Active P4 and P5 guards pass. Pending migrations are
   `0`, drift is `NONE`, health/readiness pass and post-deploy error logs are
   empty.
4. The fresh Final Gate restarted from the beginning over all 13 families,
   backend, active PWA, published edge, AI, background/event surfaces and
   Package 4 guards. It stopped at new blocker **B18**.
5. Active production `yclients.py` is an older artifact than the repository's
   canonical bridge-only source. Six appointment mutation methods still call
   direct provider `self._put(...)`: update services, attendance, add services,
   replace services, duration and Client name/phone.
6. Published chat reaches AI reschedule/update/cancel branches that resolve
   appointment authority through a SQLite Client selected by raw `user_id`
   and phone. Published/registered journal actions reach the same direct
   provider owner surface. Observation after a direct write is not canonical
   execution ownership.
7. An isolated exact-artifact probe replaced provider transport with a
   recording double; all six methods reached a direct PUT branch. Network and
   production mutations were `0`.
8. Remediation must remove phone/chat-derived AI appointment authority and
   synchronize every active residual appointment mutation to its existing
   canonical Action Engine owner. No direct provider fallback may remain.
   Preserve current action identities and approved `UNKNOWN`/reconciliation;
   if any operation lacks an approved authority or action contract, return the
   minimal proposal and STOP.

Package 5 remains FAIL/NO. B18 is Final Gate remediation, not P4-11 or Wave 7.
Preserve B7–B17, Waves 1–6, D1-A…D7-A, P02/P03 holds, verified Client identity,
Package 2 Communication Delivery, Package 4 value ownership, immutable
evidence, the tenant hard-delete prohibition and AC6 A30 ownership. Do not
create P4-11 or Wave 7, start Chapter 7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
