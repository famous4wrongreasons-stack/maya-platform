# Explicit booking receipt recovery and native reschedule restart — 2026-10-08

The current React chat can resolve an originally UNKNOWN booking by an explicit status READ, preserve the original canonical receipt and show CONFIRMED without another booking POST. A native synthetic YCLIENTS reschedule survives separate backend and PostgreSQL restart: one lost-response PUT becomes SUCCEEDED through authoritative readback, with the same action, source evidence and receipt; the appointment mirror receives the new time.

Runtime candidate: `da9db9e27fc891d566d2361fa7f5a15ac0f9cb34`, parent `17a4639361ecc328fbfffcb14e2503b6db003a8f`. Isolated branch `codex/maya-development-integration-20261006`. [Evidence manifest](evidence/maya-development-integration-20261006/booking-receipt-status-20261008/manifest.json).

## User-visible behavior and authority

- Only the explicit **Проверить результат** action sends `booking_receipt: {widget_id}` alongside the existing bounded `thread_page: {limit:20}` on `/widgets/resolve`. The closed DTO rejects null, extra fields, cursor, another limit and combined render evidence. Passive history, render and post-COMMIT reads do not start provider reconciliation.
- The widget ID is a locator. The backend resolves current tenant/principal, un-erased retained emission/turn, seal, release access and the exact previously ACCEPTED COMMIT. Only its server-stored confirmation idempotency key locates the original canonical action. Current verified Client ownership and source witness are revalidated before readback, mirror and completion. Completed status checks remain provider-free.
- The existing AE yields after one inconclusive Client create/reschedule read. One explicit check claims at most one reconciliation; it never enters ingress, dispatch or the execution loop, even if a negative read turns an action READY. MANUAL_REQUIRED and existing budgets remain intact; an expired reconciliation lease has one bounded recovery.
- Reschedule status checks retain Client ownership without reapplying the time restriction for authorizing a new mutation. The existing original appointment/branch witness governs recovery; today's occupied target slot is not a reason to requote or dispatch again.
- Native readback previously used domain ID `crm-501` to update a mirror keyed by external ID `501`, allowing AE success while the mirror remained at the old time. The existing domain decoder now supplies the raw ID; matching also requires the exact original ID and a non-cancelled record. Wrong-record and cancelled readback cannot confirm.

## Evidence

| Gate | Result and qualification |
| --- | --- |
| Backend targeted tests | 215/215, 10 suites. Real code with mocked source boundaries where named; no aggregate qualification. |
| Static gates | Backend, live-fixture and contract TypeScript; scoped ESLint; contract and K3 checks PASS. |
| Shell transport | 186 shell tests, 6 browser-guard tests, shell typecheck PASS; existing dedupe/late/foreign checks retained. |
| Current React | Final committed-candidate browser proof: three scenarios, 34 checkpoints; real Chrome/HTTP/PG, synthetic planner/provider. Exact 14:30→15:00 across find→create, one POST, UNKNOWN before positive readback, one canonical CONFIRMED after it, repeat status/re-login, stale source refusal. |
| Native restart | prepare/resume in separate backend processes with actual PG stop/start. One canonical setup create POST and one non-destructive reschedule PUT; response deliberately lost after durable synthetic ledger write. Original UNKNOWN, evidence hash and action identity survive. First inconclusive status remains unconfirmed, later authoritative READ updates the same mirror/action/receipt. The two repeated reads after positive completion add no provider GET/PUT. Foreign tenant and revoked Client checks add no provider reads; revocation is checked after completion. |
| Isolation | Owned process groups close and disappear, temporary PostgreSQL clusters stop; final source hashes remain unchanged. Production qualification stays `NOT_ISSUED`. |

The native reschedule source card is produced by the existing emitter with a labelled synthetic schedule fact; preview, confirmation, gates, AE and native adapter are real. This proves the recovery path, not a model-generated reschedule conversation or a live schedule projector. The existing 6 READY/UNKNOWN and ordinary preference restart cases remain in the same test.

The local gate ran against the parent plus working changes, then the tested code was committed. Final browser and restart manifests bind their source paths to the committed candidate. Failed harness attempts are retained separately: missing shell build/launcher setup, historical-card selection, a wrong scripted intent, and create-only scoped handles correctly refused by Gate 11. The native mirror regression has its original failing Jest report; it is not reclassified as passing.

## Review and remaining limits

Independent reviews covered current authority, source drift, revocation, bounded recovery, the fixture and the native ID fix. The discovered catalogue-await authorization race, missing source recheck, historical-time rejection, expired reconciliation lease and null DTO edge were corrected before the final gates. Artifact/source hash review is recorded beside the archive.

The existing timeline contract intentionally keeps the historical SUBMITTED/UNKNOWN line followed by the later CONFIRMED line. Screenshots were inspected; the older wording remains visible, and the floating header overlaps earlier long history. This checkpoint does not claim a single-line status presentation or full visual acceptance.

Only finite synthetic YCLIENTS transport and scripted semantics were exercised. No real model/provider acceptance, live booking, production/HTTPS/phone/model call, external notification, deployment, push or merge is claimed. No schema or retention decision was applied. The public-booking FK owner choice, initial Client trust, metadata SSH permission and policy-bound C10/background admission remain open; this does not complete all MAYA or C10. Working website and other worktrees are untouched.
