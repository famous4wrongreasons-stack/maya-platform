# Guest FK correction and source-carrier probes — 2026-10-13

Tested executable candidate: `8bdfc5b680bb4c48944c951784a6e50f62652797`.
Branch: `codex/maya-local-crm-setup-20261010`.
**LOCAL QUALIFICATION ONLY — certificate NOT_ISSUED.**

## Owner decision and implementation

The owner approved “Да — запретить подмену, миграция и локальные тесты”.
[The canonical decision](../../MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md)
now records that approval without rewriting its earlier pending history.

One new forward migration,
`20261013120000_public_booking_restrict_parent_replacement`, changes exactly:

- `PublicBookingSession.tenantId → Tenant.id`;
- `PublicBookingQuote.(sessionId, tenantId) → PublicBookingSession.(id, tenantId)`;
- `PublicBookingAttempt.(quoteId, sessionId, tenantId) → PublicBookingQuote.(id, sessionId, tenantId)`.

Delete actions become RESTRICT. Update actions remain NO ACTION. Names, keys,
tables, columns, indexes, user triggers and immutable-function definitions remain
unchanged. The original migration files/checksums are preserved. The migration
is transactional and was applied only to newly created synthetic databases.

The repeatable proof is
`maya-saas-backend/scripts/public-booking-fk-migration-proof.mjs`. It refuses
non-loopback, default-port, non-proof-name and non-empty databases before the
migration exercise. Both database URLs must name newly created, separate
`maya_widget_gate_proof_fk_*` databases owned by the synthetic `widget_proof`
user. Run it within the qualification runner's loopback-only sandbox, never
against a retained salon or production database.

Fresh execution proves all 13 checkpoints: original same-key replacement succeeds
under NO ACTION; ordinary parent deletion and identity updates are refused;
upgraded and clean schemas match Prisma with empty diff; existing fixture rows
survive; original checksums and non-target constraints remain unchanged; a
deliberate error after two DDL changes rolls back the whole migration. Reverting
each strengthened action independently makes the replacement-refusal oracle
fail, then rollback restores the strict schema and exact fixture rows.

No history deletion, retention change, caller-selected Client authority or new
booking route was added. This is not permission to apply production DDL.

## Integration test maintenance, not a product workaround

The unmodified f1a45c23 source probe failed because it expected time slots directly
after staff selection. The current source intentionally asks for an explicit
date. The canonical BOOK-1…6 proof already handles this
(`aeb987b4`, ordinary-booking checkpoint 2026-10-07). The helper now asserts that
question/no successor, then the synthetic driver invokes the existing explicit
availability read. This does not prove model interpretation of an arbitrary date.

The helper also used the old schedule detail control for rescheduling. Since
`e7118871`, the reschedule owner is the server-declared entry `move_intent`;
the detail control opens personal navigation. The updated helper verifies the
selected operation's capability and its presence in actual rendered reading order.
Errors now fail the child process and parent assertion explicitly. Personal and
journal probes run as separate cases and write separate receipts.

NS-1's old probe passed 15 of 16 checks but counted canonical login history
restoration as unexpected NAVIGATE traffic. The corrected fixture serves and
asserts the exact startup conversation read and bounded receipt-page read
(owners `b56965f9` and `59d6e46c`), finishes startup, and measures only the
roundtrip afterwards. No extra request is permitted within that roundtrip.
Injecting an actual transport reread after return fails two assertions.
The normal probe passes 16/16; fullscreen closes, parent replaces in place,
no duplicate timeline item appears, and focus/history ownership is released.

No application TypeScript, runtime implementation, visual design, renderer,
authority policy, notification transport or provider adapter was changed.

## Fresh measured results on the tested SHA

| Surface | Result |
| --- | --- |
| Migration upgrade / clean replay / rollback | 13 checkpoints PASS |
| Migration allowlist baseline / restored | 5 / 5 PASS |
| Tampered migration hash / extra unapproved directory | Both REFUSED by the original strict fence |
| Backend, unfiltered | 9,819 PASS; 725 suites |
| Widgets Live | 687 PASS; 59 suites |
| Compiled release binary | 4 PASS |
| Separate HTTP/BIN | 21 PASS; 47 mints; 0 malformed |
| Actual source → carrier | 2 PASS: create/move/cancel and journal detail |
| NS-1 parent roundtrip | 16 PASS; extra-read counterfactual refused |
| Runtime | 763 PASS; 7 explicit SKIP; 0 FAIL |
| React carrier | 164 PASS |
| Packaging | 18 PASS |
| Local staging HTTP / binary | 17 PASS |
| Existing release HTTP / binary compatibility | 34 PASS |
| Operator offline / compiled | 30 / 9 PASS |
| e2e / events PostgreSQL | 1 / 4 PASS |
| Strict mutation receipt collector | 60 PASS |
| Widget Contract / K1 / K3 | 31 / 15 / 10 checks PASS |
| Fresh captured evidence verification | 35 lines, 31 claims, 0 violations |

The seven runtime skips explicitly say LOCAL API NOT GIVEN; they are not counted
as PASS. Widget Contract retains four explicit later-package pending declarations.
The evidence verifier validates the supplied captures, not whole-contract conformance.

Types, script types, full lint, Prisma validate, production-dependency audit,
synthetic HTTP smoke and frontend prepublication checks passed. This is fresh
local execution on macOS, not hosted GitHub CI. The unchanged standalone legacy
Python workflow was **not rerun** in this pass, so this packet does not claim a
complete fresh Platform CI result.

Canonical React PWA/Capacitor parity and the actual unsigned Xcode simulator
`App.app` payload passed the existing verifier. The approved production endpoint
was inspected only as static bytes. No application was installed or deployed.
[Payload hashes](PAYLOAD-HASHES.json) cover the exact resulting artifacts.

## Failures retained and correctly classified

On `ccfdf1ef`, the full backend run reported 9,818 PASS / 1 FAIL. MIG-4
correctly refused the newly introduced migration because it was absent from the
frozen allowlist. Commit `8bdfc5b6` pins only the owner's exact new migration
name and SHA-256; the baseline count remains 99. Both hash tampering and an extra
unapproved migration remain executable refusals. The complete backend suite was
then rerun from the new clean committed candidate.

The first packaging invocation on `8bdfc5b6` ran before canonical React release
payload generation and refused a missing payload. This preparation error remains
in its original failed runner receipt. The follow-up ran canonical release sync,
all 18 packaging tests, unsigned iOS build and actual app verification on the
same unchanged SHA; all passed. The failed receipt is not relabelled green.
Earlier direct-ts-node probe and obsolete Prisma CLI invocations were setup errors,
not product defects or positive qualification evidence.

## Current boundary and next work

The original conformance audit is unchanged: **165 global unqualified/false
clauses, including two HANDOFF STOP; 163 profile-applicable duties remain
unqualified**. This counts evidence qualification, not 163 demonstrated code
defects. No historical certificate or prior candidate's result is inherited.

All 545 mutation declarations resolve in the fresh dry-run (47 batteries,
68 scheduled parts). The complete corpus has **not executed** on this SHA.
Three migration counterfactuals, two fence refusals, one NS-1 counterfactual and
60 collector checks do not substitute for that programme. Complete applicable
FBE2E qualification and release admission remain outstanding. The previously
targeted staging mutations are historical to their own SHA, not fresh kills here.

Next qualification work is the complete canonical mutation programme and remaining
applicable FBE2E with current evidence, followed by exact-candidate AR-1 admission.
Before any real local booking there must also be actual platform authority,
operator-controlled signing, separately authorized staging data handling and a
bounded real-operation permit. No real grant or owner booking acceptance is
claimed by these synthetic proofs.

All owned synthetic PG clusters stopped. No owner database was opened or copied;
no saved key, real provider/model, OTP/SMS, YCLIENTS mutation, production system,
iPhone installation or C10 work was used.

[Measured aggregates](RESULTS.json) · [Migration proof](MIGRATION-PROOF.json) ·
[Audit boundary](QUALIFICATION-BOUNDARY.json) · [Raw provenance](RAW-MANIFEST.json).
Raw logs, synthetic database files and build blobs remain outside Git.

Implementation provenance: `d6e44a2a` (approved DDL/proof),
`ccfdf1ef` (source/roundtrip probe maintenance), `8bdfc5b6` (exact migration fence).
Documentation commits after the tested SHA preserve evidence; they do not create
a release certificate for a different candidate.

