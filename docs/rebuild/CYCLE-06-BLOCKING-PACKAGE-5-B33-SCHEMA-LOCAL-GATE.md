# B33 approved Option A — schema local gate

Owner approved checkpoint `8a5bd92c` proposal: one model / eight persisted fields / zero new action classes; no historical backfill.

Added `ClientBookingConfirmation` with global source UUID, exact tenant/Client/original verified link, fixed versioned action namespace, bounded keyed source evidence, evidence hash and server acceptance time. Composite FKs and immutable SQL guards prevent rebinding/deletion; active verified binding and unmerged Client are required on insert. No existing model receives persisted columns.

The source receipt service authenticates through the existing B32 resolver and serializes acceptance by global event identity before deriving the key. It has no provider or appointment executor. The service is not yet connected to chat. B31/B32 runtime is unchanged.

[Owned PostgreSQL proof](evidence/package5-b33-receipt-schema.proof.json): 12 concurrent same-event requests converge; divergent original source gets one acceptance and one conflict; tenant/Client isolation, no-User Client, immutable rows, revoked binding rejection and new connection replay PASS. No ActionExecution or Appointment is created by receipt acceptance. Exactly eight columns. Source evidence contains only keyed references and canonical binding, no raw channel credentials or chat text.

Clean replay of all 81 migrations on dedicated PostgreSQL port 55503 PASS; Prisma validation and schema diff PASS, drift NONE. Schema ratchet 1 suite / 2 tests, lint, both typechecks and build PASS. Test database is task-owned, isolated from the 17 old DBs.

Production migration has not yet been applied at this checkpoint. Next: expected-only production migration preflight, additive migration, read-only post-check, then runtime integration and all required gates without intermediate STOP unless a blocker appears.
