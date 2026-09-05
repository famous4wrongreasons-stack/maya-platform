# Package 5 post-Wave-6 remainder — B21 realtime identity/history STOP

Accepted checkpoint `171fcdc5`. Waves 1–6 remain accepted 6/6. B7–B19 remain
accepted production baselines. B20 runtime commits `16c24bd1` and `9cc3b2f1`
are deployed in backend release
`/opt/maya-saas/releases/20260905-p5-b20-16c24bd1`, the active request-only PWA
and the published application/proxy.

1. B20 is closed for all three cabinet projections. `/api/cabinet/me`,
   `/api/cabinet/me-via-login` and `/api/cabinet/me-via-session` use one
   `ClientChannelRuntimeService.cabinetProjection` boundary and have 3/3
   identity/read-only parity.
2. The cabinet boundary requires a verified active tenant-qualified
   `ClientChannelLink`. Telegram init data, Telegram Login Widget and Maya JWT
   are channel proofs; Maya JWT resolves a Client only through an active
   `maya_user` link. Raw `chat_id`, legacy session, phone and caller `clientId`
   are not Client authority.
3. Missing, revoked, ambiguous and cross-tenant bindings return an unlinked
   projection with no stored Client PII. Client without Maya User remains
   supported through an exact verified channel link. Delivery address remains
   delivery-only and is not reverse identity authority.
4. Cabinet projections read canonical Client, appointment, loyalty,
   subscription and referral state and perform zero Client, link, profile,
   consent, history, conversation or business-fact mutations. Legacy history
   cache, lazy backfill and referral get-or-create are no longer reachable.
5. Targeted B20 proof passed 7 Python tests, 2 TypeScript suites / 10 tests,
   preserved B13–B20 proof passed 56 Python tests and 10 TypeScript suites / 55
   tests, and the mandatory deployment regression passed 349 suites / 2860
   tests. Active Package 4 and Package 5 guards pass. Pending migrations are
   `0`, drift is `NONE`, health/readiness pass and post-activation error logs
   are empty.
6. Production verification used structural/read-only checks. No production
   cabinet PII endpoint was called. Real Client, profile, consent, history,
   provider or value mutations were `0`.
7. The fresh Final Gate restarted from the beginning over all 13 family
   foundations, exact backend release, active PWA, published
   proxy/application, AI/voice, cabinet, chat/stream, journal/history,
   background/event, identity/PII/read/provider/value surfaces and Package 4
   guards. It stopped at the first new blocker, **B21 / A18**.
8. Published `wss://rt.malesthetic.pro/api/realtime` actively accepts a legacy
   `web_session_token`. The handler resolves it to a Telegram-shaped identity,
   reduces all accepted identities to raw `chat_id` and uses legacy
   `has_valid_consent_by_chat_id` as the gate.
9. Failure to build canonical channel proof is converted to `None`, but the
   handler still sends `ready` and starts `realtime_bridge.run_session`. It
   does not first require verified active `ClientChannelLink`, exact
   tenant-qualified Client or fail closed on missing/ambiguous Client binding.
10. The realtime bridge resolves AI role and conversation state from raw
    `chat_id`, passes it as `user_id` into active AI tools and creates canonical
    Client command context only when optional proof exists. Legacy Client and
    provider reads can expose appointment, loyalty and visit-history facts.
11. The same bridge persists transcript/reply history under raw `chat_id` via
    the legacy conversation file. A signed channel or legacy session is thus
    still Client/role/projection and history-write authority outside the
    approved verified-binding boundary.
12. The next controlled remediation must reconstruct one realtime voice
    authority/history boundary shared with the approved Client identity
    foundation. If existing verified channel, canonical conversation or role
    foundations cannot represent the required semantics, return an exact
    minimal proposal and STOP. Do not preserve a legacy session/chat-id
    fallback for compatibility.

Package 5 remains FAIL/NO. B21 is Final Gate remediation, not P4-11 or Wave 7.
Preserve B7–B20, Waves 1–6, D1-A…D7-A, P02/P03 holds, verified Client identity,
Package 2 Communication Delivery, Package 4 value ownership, immutable
evidence, the tenant hard-delete prohibition and AC6 A30 ownership. Do not
create P4-11 or Wave 7, start Chapter 7 or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
