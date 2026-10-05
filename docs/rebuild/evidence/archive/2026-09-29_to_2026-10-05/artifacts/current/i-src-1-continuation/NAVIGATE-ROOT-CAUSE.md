<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 0b75395d8b2a37c9e97cba142d7feead7bc6e3f41810c4a39ef6742b94a03322 -->

# I-SRC-1 — confirmed runtime NAVIGATE blocker

Candidate: `1d519822bb92343f1bf4efdf92cbc4264eace48a` on `codex/maya-controlled-integration-20260930`. The worktree is clean.

The missing-emission hypothesis is DISPROVED by the actual canonical NS-1 source. No backend production fix is justified. The implementation is stopped at the user's explicit runtime-defect boundary. No runtime or presentation rewrite was made.

## Exact observation

The guarded local PostgreSQL probe creates synthetic INTERNAL calendar fixtures, invokes the production `operations.journal.read` source for `2026-09-24`, then activates the server-declared drawn detail control through the actual runtime and HTTP gateway. It uses the production React test drawer to verify drawn refs. No envelope is fabricated or resealed by this probe.

- Initial envelope: `61190c0a-68c6-459d-a8eb-d36947380716`; provenance `operations.journal.read`.
- `presentation.fullscreen_detail = {"route_key": "fs.calendar", "reason": "exceeds_chat_density"}`.
- NAVIGATE target: `{"class":"detail","ref":"fs.calendar"}`; no InputSchema.
- Initial integrity verdict: `valid`; renderer projection retains that same fullscreen declaration.
- `/api/widgets/intent`: HTTP 200; gate 13; 14 gates run; outcome `terminate`.
- Returned `next_envelope`: `8bfe5831-9fc5-47aa-a0c5-788616bcf010`, SCHEDULE, retained date `2026-09-24`; integrity verdict `valid`.
- The transport projection preserves that returned envelope exactly; live submission returns `advanced` with the same widget ID.
- Observed fullscreen phases: `progress → null`. There is no `open` transition.
- Timeline widget count: `1 → 2`; detail is rendered at `CARD` in the timeline.
- Final `fullscreen = null`. The source-carrier acceptance test remains red; it has not been weakened to accept this result.

## Exact source cause

On this candidate `maya-chat-shell/src/shell/intents.ts:528` opens PROGRESS after the existing exact-own-route check accepts the server target. Line 538 closes PROGRESS after the response. Lines 547–551 handle every `advanced` outcome by `ingest(outcome.envelope)`, regardless of the accepted `opens_detail` route. `ingest` places this emission on the timeline. The existing controller operation `maya-chat-shell/src/shell/shell.ts:231` (`presentDetail`) is never called by this outcome path.

The backend emission at `maya-saas-backend/src/widgets/emission/envelope.factory.ts:503` is correct for this request. Changing that declaration cannot repair a lifecycle branch which already accepted it and received a valid response.

Owner: **RUNTIME / Claude**. This packet does not authorize rewriting presentation semantics. Preserve existing integrity checks, route ownership, authority, parent re-resolution, no nested detail and focus/back behavior. Parent return through the carrier has not yet been exercised because the required fullscreen opening fails first; the separate fresh backend source tests prove the canonical parent HTTP response.

## Reproduction and receipts

[Complete observed initial envelope, exact detail response, transport projection and runtime trace](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/i-src-1-continuation/receipts-1d519822/source-carrier-observations.json). Only spendable token/password/authorization string fields are replaced by SHA-256 markers. Each raw synthetic payload also has its own JSON hash. Bearer [REDACTED] are never recorded. Redacted copies are diagnostic artifacts; they are not reusable authenticated wire payloads. All raw authority values stay process-local; rerunning the probe obtains fresh ones.

[Probe command, candidate SHA and exit status](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/i-src-1-continuation/receipts-1d519822/source-carrier.receipt.json). Set `DATABASE_URL` to the guarded loopback proof database and `GITHUB_SOURCE_PROBE_OUT` to an explicit local report path, then run in `maya-saas-backend`:

```bash
npx jest --config test/jest-widgets-live.json --runInBand --testRegex 'widgets-live/source-carrier.probe-spec.ts$'
```

Requires Node 22.23.2, dependencies, the already-approved NS-1 test migration, runtime build and carrier test harness. No production infrastructure is needed or authorized.

## CANCEL and certification

The exact Claude patch `f531367f` was cherry-picked as `977b814e` with original author, coauthor and source marker. Its parent is exactly the previous candidate; file overlap/conflicts: zero. Runtime/carrier paths remain byte-for-byte equal to Claude's commit. Fresh personal source-carrier probe passes: 8 submissions; create, reschedule and cancel owner executions; the same appointment ends canceled.

Fresh tests on `1d519822`: runtime 359 PASS / 7 declared skips, carrier 93 PASS; targeted backend source/profile tests 9 PASS across 3 suites. Build and type checks pass. Full mutation corpus and complete CI certification are **not run/certified for this candidate**: the user's prerequisite NAVIGATE PASS is not met and their runtime-defect STOP applies.

The inherited backend progress matrix remains 0 profile-applicable false / 2 global HANDOFF STOP duties. This is not integration success or a release certificate. `CERTIFIED_FOR_PROFILE = NO`; `FULL-CONTRACT CERTIFIED = NO`; `READY FOR RELEASE AUTHORIZATION = NO`.

Production migration/deploy/grant, real OTP, real YCLIENTS, iPhone reinstall and Chapter 10 effects: zero.
