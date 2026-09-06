# B33 — approved durable confirmation runtime local gate

Accepted Option A: `8a5bd92c`. Schema foundation commit `3e27bc9c` is pushed.
Exactly 1 new model / 8 persisted fields / 0 new action classes. No B31/B32 contract or runtime implementation was changed.

## Confirmed source and execution flow

An explicit **Подтверждаю запись** button persists a pending source event before its first send. Same offer double-click, normal/stream fallback and restored pending-send replay carry the same event. A genuinely new explicit offer confirmation can allocate a new event; transport loss never allocates a retry UUID. Storage failure sends nothing. The current pending envelope contains no authentication credential. Source receipt applies prospectively; no legacy text/history is backfilled.

Normal chat and stream authenticate and accept `booking-confirmation` before invoking the model. Original source context is replayed from the durable sender envelope and validated against immutable keyed receipt evidence. No receipt means no create: ordinary model booking proposals require the explicit confirmation gesture. Python passes only the accepted confirmation reference and booking arguments. `chat-appointment-create` validates the original Client/link/tenant receipt and derives its deterministic key on the backend, then calls the existing B31 creator through the existing B32 principal and Action Engine. No provider/Appointment write owner was added. Model time/service/staff never enters source-key derivation.

The key is the approved UTF-8 byte-length-prefixed namespace/tenant/Client/confirmation tuple. B31 still owns the canonical booking fingerprint. SAME C + SAME INTENT converges; SAME C + CHANGED INTENT conflicts. Provider UNKNOWN/MANUAL_REQUIRED remains on the same execution; no blind new provider operation.

## Proof and gates

[Real PostgreSQL runtime proof](evidence/package5-b33-runtime.proof.json) uses actual compiled bridge/controller, signed authenticator, verified Client resolver, canonical policy, B31 and Action Engine with synthetic provider/catalog I/O. Internal and CRM paths, Client without Maya User, concurrent same/different intent, changed time/service/staff, SUCCEEDED replay, UNKNOWN, wrong tenant/Client, missing receipt, new explicit event and HTTP/AI parity PASS. Child processes reopen receipt/key after restart; injected SIGKILL before model, after synthetic interpretation/before B31, and after durable binding/provider attempt before result preserve identity. The last case remains EXECUTING and rejects changed intent without another execution.

[Python proof](evidence/package5-b33-chat-confirmation.proof.json) executes both actual chat and stream handlers with synthetic model A/A/B and transport/result stubs. Both accept receipt before model, replay the original source context and preserve confirmation ID under changed model output. This is a composed local proof, not a live provider/LLM/production booking test.

[Mandatory local gates](evidence/package5-b33-local-gates.json): targeted **6 suites / 50 tests**, appointment/booking **41 / 385**, architectural guards **79 / 429**, lint, both typechecks, build, Prisma validation/status/diff and full backend **375 / 3069 PASS**. Owned PostgreSQL port 55503; 81 migrations replayed, pending 0, drift NONE. Python: B33 booking **8**, bridge **10**, chat routing **48 PASS**. The broader chat suite initially exposed six obsolete expectations also reproduced at accepted `8a5bd92c`; tests now assert the already accepted B13 legacy staff-authority retirement, P4 legacy loyalty denial and B24 no raw-identity push/history behavior. Those runtime contracts were not modified.

Source PWA scripts parse **28/28**. Published variants have separately reviewed narrow overlays; **26/26 and 28/28** script blocks parse and exact sender functions match the behavioral test. PHP overlay forwards the same envelope for normal/stream; PHP 8.3 syntax checked. [Overlay hashes](evidence/package5-b33-overlay-manifest.json), [validation](evidence/package5-b33-overlay-validation.json). Patches retain production-only launcher/UI differences. The three changed webhook functions matched accepted source before overlay; unchanged active-root behavior is preserved. Candidate Python compilation and both Package 4/5 active-root guards PASS.

## Production schema / next step

[Additive production migration](evidence/package5-b33-production-migration.json) PASS: expected-only pending before apply, pending 0 after apply, drift NONE, eight columns, immutable guard, zero receipts/fake backfill before runtime cutover; health/readiness PASS. The active B32 runtime remained unchanged during schema apply.

Runtime deployment is not yet claimed at this checkpoint. Next: commit/push, existing canonical backend deployment, reviewed Python/PWA/proxy overlay publication and read-only structural verification, then fresh full Package 5 Final Gate across 13/13 families. No production booking/provider mutation is used for proof.

Main checkout's 24 dirty entries/files and 17 pre-existing databases remain outside owned scope. No iOS checkout is modified: this cycle is restricted to the approved isolated repository worktree. Owned temporary PostgreSQL/candidate resources will be removed at STOP. Package 5 and Chapter 6 remain incomplete; Wave 7 and Chapter 7 have not started.
