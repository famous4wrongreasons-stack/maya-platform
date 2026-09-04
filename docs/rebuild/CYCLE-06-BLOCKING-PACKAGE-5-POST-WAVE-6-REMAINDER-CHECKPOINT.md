# Package 5 post-Wave-6 remainder — B9 delivery endpoint decision STOP

Accepted checkpoint `57196b09`. Waves 1–6 remain accepted 6/6; B7/B8 runtime
`4b96b546` remains the production application baseline. Package 5 Final Gate
remains FAIL and Package 5 is not complete.

1. Approved `ClientWantedSlotInterest` schema foundation is committed at
   `8a316f4c`, locally proven 8/8, clean-replayed, and applied in production.
   Pending migrations are 0, drift is NONE, backfill is 0, health/readiness PASS.
2. Approved exact-time, expiry-at-start, max-10-active, Client-only delivery and
   max-three-earliest invariants are enforced by the additive foundation.
3. Runtime did not begin because delivery reconstruction found a new blocker:
   Telegram `ClientChannelLink` stores only an irreversible subject HMAC.
   `ClientWantedSlotInterest` intentionally has no chat id; User/device schemas
   cannot route a Client without Maya User; Communication Delivery needs the real
   recipient address before it stores its durable hash.
4. Legacy SQLite `telegram_chat_id` cannot be used as identity/delivery fallback.
   No runtime workaround, referral write, hidden Client creation or provider send
   was introduced. Production business/provider mutations remain 0.
5. Owner decision is required in
   `package5-b9-client-delivery-endpoint-v1-decision.md`. Recommended option A:
   a nullable encrypted address on the verified ClientChannelLink, populated only
   by explicit verified linking, no backfill, and revalidated against its HMAC.
6. **STOP** before B9 runtime/ratchet/deployment and before restarting the full
   13-family Final Gate. After the decision, resume the same remediation cycle.

Preserve deployed B7/B8, all accepted waves, D1-A…D7-A, P02/P03 holds, Client
ownership, immutable evidence, tenant hard-delete prohibition and AC6 A30 owner.
No Wave 7, Chapter 7 or automatic Chapter 6 completion. All 17 old databases
remain untouched; owned processes/watchers/Chrome/temp DB are zero.
