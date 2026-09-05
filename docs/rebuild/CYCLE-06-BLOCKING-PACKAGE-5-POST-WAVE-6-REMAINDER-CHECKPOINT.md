# Package 5 post-Wave-6 remainder — B20 cabinet identity/PII/read-write STOP

Accepted checkpoint `dd70c09b`. Waves 1–6 remain accepted 6/6. B7–B18 remain
accepted production baselines. B19 runtime commits `0eb193b1` and `e674b743`
are deployed in backend release
`/opt/maya-saas/releases/20260905-p5-b19-e674b743` and the active request-only
PWA.

1. B19 is closed for all three reconstructed chat-booking legacy mutation
   sites. `/api/chat` and `/api/chat/stream` require original authenticated
   channel proof, verified active `ClientChannelLink`, exact tenant-qualified
   Client and the existing canonical appointment action/executor. The legacy
   booking fact writer and both direct loyalty branches are gone, coverage is
   3/3, and chat/stream authority and mutation ownership are identical.
2. Deterministic action identity, immediate pre-dispatch authority recheck,
   retry/concurrency convergence and the established `UNKNOWN`/reconciliation
   boundary remain enforced. Chat never interprets provider ambiguity as
   failure and has no legacy fallback.
3. B19 proof passed 34 targeted Python tests, 18 preservation/bridge tests, 2
   targeted TypeScript suites / 11 tests and the mandatory 347-suite /
   2850-test deployment regression. Active Package 4 and Package 5 guards
   pass. Pending migrations are `0`, drift is `NONE`, health/readiness pass and
   post-activation error logs are empty.
4. Production verification used structural/read-only checks. Real Client,
   appointment, booking-cache, loyalty or provider mutations were `0`. The
   first PWA candidate omitted the already-active request-only launcher
   compatibility parameter and was rejected by readiness; B18 was restored.
   The corrected exact-active-overlay candidate deployed successfully without
   unrelated working-tree changes or business mutation.
5. The fresh Final Gate restarted from the beginning over all 13 family
   foundations, exact backend release, active PWA, published
   proxy/application, AI, journal/history, background/event,
   identity/PII/read/provider/value surfaces and Package 4 guards. It stopped
   at the first new blocker, **B20 / A18**.
6. Published `cabinet_me`, `cabinet_me_login` and `cabinet_session` reach active
   `/api/cabinet/me`, `/api/cabinet/me-via-login` and
   `/api/cabinet/me-via-session`. All three call `_build_full_cabinet` with a
   raw Telegram/legacy-session `chat_id`.
7. `_build_full_cabinet` selects a legacy SQLite Client by that `chat_id`, uses
   a legacy consent row as its gate and returns full booking phone,
   Client/YClients state, history, loyalty, subscription and referral
   projections without verified `ClientChannelLink` or canonical
   tenant-qualified Client authority.
8. The same nominal read projection actively writes the legacy Client history
   cache. It also calls tombstoned loyalty-backfill and referral get-or-create
   entry points; those currently fail closed and therefore created no value or
   referral facts during verification.
9. The next controlled remediation must reconstruct the cabinet projection
   boundary: verified Client identity, exact allowed PII/read models and zero
   read-time business/projection writes. A signature, legacy session, phone,
   raw `chat_id` or consent fact cannot be Client authority. If existing
   canonical schema/read models cannot represent required cabinet data, return
   a minimal proposal and STOP rather than adding a runtime fallback.

Package 5 remains FAIL/NO. B20 is Final Gate remediation, not P4-11 or Wave 7.
Preserve B7–B19, Waves 1–6, D1-A…D7-A, P02/P03 holds, verified Client identity,
Package 2 Communication Delivery, Package 4 value ownership, immutable
evidence, the tenant hard-delete prohibition and AC6 A30 ownership. Do not
create P4-11 or Wave 7, start Chapter 7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
