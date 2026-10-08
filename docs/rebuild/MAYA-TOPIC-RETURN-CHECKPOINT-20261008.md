# Booking topic return through existing conversation context — 2026-10-08

The current React chat retains a booking across an ordinary general question and a general follow-up. An explicit return reads current availability for the original branch, service, specialist, date and 14:30; a subsequent 15:00 correction changes only the time. General turns perform zero provider reads or booking effects. The final booking still dispatches at most its one original POST.

Runtime: `fb65749bbfb12582e8043ea4864a6d91bdf8c2b5`, parent `fd06e0d9f00a7158b5849de9d0e77f7a021b2d66`. [Evidence manifest](evidence/maya-development-integration-20261006/topic-return-20261008/manifest.json). Isolated development branch; no working-site or production change.

## Reproduced failure and bounded repair

The baseline test on unchanged parent runtime failed: booking → `general.explain_term` → date-only booking returned no availability because the latest general plan had replaced the booking context. This is an executed scripted unit reproduction, not a real-language or baseline browser result. Its failing output is retained under `reproduction/`.

The existing timeline owner now offers an internal projection of at most eight preceding assistant completions, with no caller-selected limit/cursor, response text, action or handle in the projection. It checks the current retained user turn and principal, and stops before decrypting erased, expired, foreign-principal/channel or empty rows. Malformed and action completions are barriers. No table, migration, retention change, persistent parallel state or new orchestrator was introduced.

AiCore uses one previous booking preference plan only across a continuous sequence of validated non-data general/small-talk plans. Another business task, absent/invalid context or the window bound stops recovery. The original saved time, timezone and branch-source witness remain; stale relative dates clear, source drift/unavailability falls back to the latest general context. CI only carries values into a current booking continuation; a new `booking.prepare_personal` starts afresh. History never restores COMMIT, Client authority, availability or permission.

## Executed evidence

- **349 targeted tests / 8 suites PASS**, zero skips: AiCore, Occupancy regressions, CI/slot normalization, timeline context barriers and typed/gateway boundaries. Source-drift/unavailable fallback, aged relative versus absolute dates, new-booking reset, other-task/action/null/erasure/expiry/principal barriers and finite bounds are covered at their named unit boundaries.
- Backend, live-fixture and contract TypeScript; scoped ESLint; contract/K3 checks PASS. The contract checker reports 31 PASS and four pre-existing pending entries; this is not complete contract discharge. Six existing browser-guard tests PASS. Local gate source hashes are retained for the parent-plus-working-change run and compared to committed runtime.
- **Actual HTTP/PostgreSQL + current React Chrome: three scenarios / 43 checkpoints PASS** on that runtime. Six general turns produce zero provider reads/effects; explicit return preserves exact source-qualified preferences and reads fresh availability. The existing success, lost-response UNKNOWN → CONFIRMED, stale refusal, explicit receipt re-read and reload/re-login paths still pass without another booking dispatch.
- Final proof source hashes remain unchanged, owned process groups close/disappear and the temporary PostgreSQL cluster stops. This checkpoint does not rerun the separate native-reschedule process/PG restart proof or the full aggregate suite.

The native adapter transport, A18 verifier and semantic decisions are finite synthetic fixtures. The scripted general follow-up deliberately returns the same short answer; it proves no-tool routing and context continuity, not conversational quality. Screenshots were inspected. Existing floating-header overlap, historical-card clutter and partial headless painting exclude full visual acceptance. No real model/provider, paid call, notification, device action, deployment, push or merge is claimed. `NOT_ISSUED`.

## Delivery remainder and environment

See the [implementation remainder](MAYA-IMPLEMENTATION-REMAINDER-20261008.md) for absent functions versus partially connected domains. Overall MAYA/C10 is not complete. The next concrete safe functional gap is `tasks.list` using an Inbox projection instead of current A23 task state; that separate slice must preserve historical NULL-linked tasks without inventing authority.

The earlier Mac disconnection was resolved; local execution and retained edits were verified before continuing. The owner separately authorized exactly one retry of the previously rejected SSH metadata inventory. Automatic review allowed process creation, but SSH exited 255 after 8.02 seconds during target banner exchange after the BeGet greeting, with zero collector-output bytes. [Authorized attempt evidence](evidence/maya-development-integration-20261006/metadata-inventory-authorized-20261008/authorized-attempt-manifest.json). No inventory/readiness was established, and no further retry or route change occurred. This is now a transport blocker, not missing approval for that already attempted inventory. New paid/model operations, initial Client trust and C10 authority remain separate decisions.
