# L5/L24 current-chat evidence correction — 2026-10-16

This is a test/evidence correction on parent `cde265b99439996fb9fa4de687aabae182fcb54c`. It is not a product change, release certificate, deployment or production authorization.

## Proven failure and provenance

The unrestricted FB battery had green unmutated live and build baselines but reported two survivors: `FB-DAY-UTC` and `FB-DAY-ELAPSED`. They mutate `nextAppointmentDay` in `src/crm/appointment-time.utils.ts` and named `L5-PIPELINE` as their live killer.

Commit `aeb987b43a2663aef6b49e8aa77774311ddf4d46` correctly changed the booking continuation proof to an explicitly dated availability READ. Its comment explicitly disclaimed automatic next-day continuation. The mutation declaration was not updated with that change. Current production callers do not invoke `AvailabilityCalendarService.nextAvailabilityDay`; the current semantic chat path invokes `bookingPreferenceDate` through `AiCoreService`.

The original receipt remains failed. No survivor is waived or declared equivalent. The complete certification run was stopped: 37 jobs finished successfully, FB failed, Gate 8r separately reached the existing runner timeout, three other jobs were interrupted after FB failure, and 27 jobs never started. All six owned PostgreSQL clusters stopped. None of those partial results certifies a replacement candidate.

## Correction and boundaries

- Retain both original mutation IDs and edits. Their already-existing `L5-CALENDAR` unit cases really fail, so classify them accurately as BUILD, not HTTP evidence.
- Add `FB-CHAT-DAY-UTC` and `FB-CHAT-DAY-ELAPSED` against the actual semantic date owner, with the new `L5-CHAT-TOMORROW` HTTP/PG killer.
- Keep the original explicitly dated availability → envelope → carrier → confirmation tests unchanged.
- Add twelve current-chat cases covering tenant fallback, selected branch precedence, positive/negative/fractional UTC offsets, month/year/leap-day boundaries and spring/autumn DST.
- The HTTP request and scripted semantic plan contain `tomorrow`, never the expected date. Expected dates are independent literals. Actual server calendar logic, catalog resolution, tool execution, sealed envelope, React carrier rendering and DRAFT confirmation all run. No COMMIT or appointment creation occurs.
- The model is scripted. Only the existing calendar function's `now` argument receives a synthetic boundary instant; its real implementation is called. Authentication, retention, orchestration and PostgreSQL keep their actual clock. This is not a database-clock or real-model acceptance proof.

The first diagnostic used global fake time and exposed a fixture mismatch: PostgreSQL-based retention/admission and the synthetic application clock disagreed. That approach was discarded; no retention/authority owner or stored turn was replaced. The final test injects only the calendar clock and records this limitation explicitly.

## Executed focused proof

`FOCUSED-PROOF.json` identifies exact local receipts and hashes:

- Old helper unmutated unit baseline: 26 PASS.
- Current chat unmutated boundary baseline: 12 PASS.
- Original UTC and elapsed mutations: 7 unit failures each, including declared `L5-CALENDAR` killers.
- Current chat UTC mutation: 8 HTTP boundary failures.
- Current chat elapsed-24h mutation: 4 HTTP DST failures.
- Restored current chat: 12 PASS.
- Release collector/partition ratchets: 60 PASS.

Product source files in backend, runtime, React and iOS remained byte-identical to the parent throughout the final diagnostic (intentional mutations were isolated and restored). The corpus now declares 559 mutants in the existing 48 batteries/69 jobs. The two extra declarations do not change the release threshold or scope.

## Still mandatory

Run fresh full applicable certification on the new committed SHA, including all unrestricted mutation controls/steps and strict admission. Focused test filtering is diagnostic only and is inadmissible as a complete corpus receipt. Until then `CERTIFIED_FOR_PROFILE: NO`, `READY_FOR_PRODUCTION_EXECUTION_AUTHORIZATION: NO`.

Profile remains `closed-input.no-handoff.no-price-goods@1`. HANDOFF remains globally STOP. No real provider/model/OTP/YCLIENTS operation, server deployment, owner database access, grant or phone install occurred.
