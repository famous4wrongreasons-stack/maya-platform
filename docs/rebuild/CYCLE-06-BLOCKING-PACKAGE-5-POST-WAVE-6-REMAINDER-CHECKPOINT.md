# Package 5 post-Wave-6 remainder — B17 Client record authority STOP

Accepted checkpoint `7faab8d3`. Waves 1–6 remain accepted 6/6. B7–B15 remain
accepted production baselines. B16 runtime commit `a3a12f26` is deployed in
backend release `/opt/maya-saas/releases/20260905-p5-b16-a3a12f26`, the active
request-only PWA and the published proxy.

1. B16 is closed in production. `/api/booking/prefill` authenticates the
   original channel and requires exactly one active tenant/provider/subject
   qualified `ClientChannelLink` before reading Client PII. Raw `chat_id`,
   phone, legacy sessions and caller-supplied Client identity are not accepted
   as authority.
2. Missing, revoked, ambiguous, cross-tenant and merged identities return an
   empty unlinked prefill. Consent is evaluated only after canonical identity.
   The read creates no Client, link, consent or PII fact, and no production PII
   endpoint was used for smoke proof.
3. B16 proof passed 8 targeted Python tests, 20 active-guard regressions, 13
   TypeScript service/architecture tests and the mandatory 342-suite /
   2811-test deployment regression. Active P4 and P5 guards pass. Pending
   migrations are `0`, drift is `NONE`, health/readiness pass and post-deploy
   error logs are empty.
4. The fresh Final Gate restarted from the beginning over all 13 families,
   backend, active PWA, published edge, background/event surfaces, PII read
   surfaces and Package 4 guards. It stopped at new blocker **B17**.
5. Public `client_cancel_record` and `client_reschedule_record` resolve
   authority through `_authed_chat_id`, legacy consent and a SQLite Client
   phone. They then call direct YClients cancel/reschedule helpers and write
   legacy actor markers. Neither route requires verified `ClientChannelLink`
   identity or the canonical Client/appointment action owner.
6. An isolated reproduction showed that a legacy session and legacy Client
   phone reach both mutating helpers. Provider calls were replaced by
   record-only doubles; production mutations were `0`.
7. Before remediation, reconstruct the exact canonical Client appointment
   cancel/reschedule ownership and existing action classes. Preserve the
   approved provider UNKNOWN/reconciliation behavior. Do not retain legacy
   phone comparison, actor markers or direct YClients helpers as fallback
   authorities. If existing contracts are insufficient, return the minimal
   owner/schema proposal and STOP.

Package 5 remains FAIL/NO. B17 is Final Gate remediation, not P4-11 or Wave 7.
Preserve B7–B16, Waves 1–6, D1-A…D7-A, P02/P03 holds, Client ownership,
ClientChannelLink/ClientLinkChallenge, Package 2 Communication Delivery,
Package 4 value ownership, immutable evidence, the tenant hard-delete
prohibition and AC6 A30 ownership. Do not create P4-11 or Wave 7, start Chapter
7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
