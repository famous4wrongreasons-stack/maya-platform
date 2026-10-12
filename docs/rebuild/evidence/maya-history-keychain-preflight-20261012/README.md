# Personal history with saved local keys — preflight

Date: 2026-10-12. Tested code/test candidate:
`1bdbc5498732935a229afaa71e74e15030aef3d3`.
Local development only, not release certification or live model acceptance.

## Fresh executed results

- 32/32 focused unit checks, including the real permit-construction expression
  under an advancing clock; the historical two-read expression is refused by
  the unchanged execution-window validator.
- Actual React → HTTP → AppModule → fresh synthetic PostgreSQL: 17 checkpoints
  PASS. The same conversation retains old/interrupted turns, renders both
  history answers, excludes foreign visits/notes and refuses revoked access,
  imports, business effects and expired allowance. Exactly two synthetic planner
  calls; no private visit data enters the planner. Owned browser/PG stopped.
- Native memory-only credential helper → existing claimed broker → retained
  launcher → compiled CRM factory: 9 checkpoints PASS, including restart,
  concurrent one-use admission, expiry/revocation and no secret values in
  generated reports. No actual Keychain or provider access in these tests.
- Read-only metadata preflight verified the installed real helper's exact
  signature/hash and the saved local-state pins. Retained owner PostgreSQL is
  stopped; schema/migration source remains compatible. No credential values read.

## Failure and narrow correction

The initial history proof on `6fb4c03c` was refused with
`history_execution_window` before any browser acceptance checkpoint. It sampled
the clock separately for start and end, so a clock tick could make the requested
window longer than 30 minutes. The proof now derives both boundaries from one
sample. The admission policy and product sources are unchanged.

The first credential integration run overlapped the history proof's backend
build and exited with `child_boot_failed`. Its fixture consumes that emitted
build; its cleanup discarded detailed child diagnostics, so the precise cause
is not claimed as proven. The subsequent independent run after the build
completed passed all 9 checkpoints. Future preparation runs these stages in
sequence; the failed run is not counted as a passing receipt.

## Next live scope

The earlier live pair proved the history response but not the last-visit answer;
the planner correction remains to be checked against the real model. Prepare
one new source-bound run of the same two questions, one existing conversation,
maximum 30 minutes, 12 model attempts and $2. Existing personal visits are read
locally. YCLIENTS may supply only service/category/staff labels for the exact
salon, maximum 40 reads. No customer/journal import, setting/consent mutation,
booking, notifications, OTP, production or installation.

Saved Keychain credentials replace manual key entry through the already-approved
helper and private pipes. Storage does not extend expired paid/read allowance.
A fresh bundled owner allowance is still required; no permit was issued here.
One ordinary Maya login or macOS approval prompt may require the owner.

This supersedes the old credential-entry paragraph in
`../maya-owner-history-review-20261012/NEXT-LIVE-REVIEW.md`: the two keys are now
saved by the owner, and the new prepared launch requires zero manual key inputs.
Historical failed launches and evidence remain preserved.
