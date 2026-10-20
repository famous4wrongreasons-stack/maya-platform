# SB1-M09: certification stopped on a masked binding assertion

Date: 2026-10-20.

Product candidate: `1e10a38365284791a5e7a8e5ec96c486e8079b05`.
Product branch: `codex/maya-local-crm-setup-20261010`.
Profile: `closed-input.no-handoff.no-price-goods@1`.

**CERTIFIED_FOR_PROFILE: NO. READY_FOR_RELEASE: NO.**

This is a diagnostic evidence packet, not a release certificate. Its documentation
commit is separate from the product candidate. No product implementation,
canonical test, mutation definition, or certification threshold was changed after
the failure. The current product still contains the link-identity guard.

## Exact failure

The fresh complete mutation programme on GitHub found `SB1-M09` surviving with a
green, unrestricted SB1 baseline. The battery expected `build-killed`. The full
unit suite, typecheck and K3 all returned zero for this mutant.

- [Exact candidate mutation run](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/39403966541)
- Failed job: `Widgets mutation battery (SB1)`, ID `118565706583`.
- Original receipt: [widgets-mutation-part-SB1.json](widgets-mutation-part-SB1.json).
- SB1 result: nine expected kills, one survivor; no red baseline.

The programme requires 559 mutants across 72 parts / 48 batteries. It was stopped
after this genuine defect; unfinished and cancelled parts are not passes.
The final collector refused admission and issued no certificate.

## Root cause

The declared mutation in
`maya-saas-backend/test/widgets-live/mutations/gateSB1.json` replaces
`personal.linkId !== link.id ||` with `false ||` in
`src/appointments/client-appointment-create.service.ts`.

The declared killer, `SB1-BOUND`, is in
`src/appointments/client-appointment-create.service.spec.ts`, lines 1242–1260
at this exact candidate. It changes a selected personal-context field, calls
`forAccount`, and accepts **any thrown exception**. It supplies no
`expectedBookingFactsHash`.

The original code refuses a changed link ID with
`personal_client_binding_changed`. When the link-ID guard is removed, execution
continues until the independent preview check rejects the absent hash with
`booking_preview_stale`. The test accepts that unrelated error, so it does not
prove the link-ID guard.

| Diagnostic case | Original code | SB1-M09 code |
| --- | --- | --- |
| Changed tenant/user | `personal_client_context_mismatch` | Same refusal |
| Changed link ID | `personal_client_binding_changed` | `booking_preview_stale` |
| Changed Client/evidence hash | `personal_client_binding_changed` | Same refusal |
| Five original generic assertions | 5 pass | 5 pass |

This proves a regression-test/evidence defect. It does not prove an exploitable
production authority bypass. The current product's guard remains present; no
real booking, account, Client record, or provider was used.

## Executable reproduction

The canonical mutation runner was also run in a disposable diagnostic copy:

```sh
node scripts/widgets-mutation-battery.mjs \
  --gate SB1 --partition 9/10 --steps unit \
  --unit-tests src/appointments/client-appointment-create.service.spec.ts \
  --unit-filter 'SB-1 canonical create with personal context' \
  --keep --out /path/to/diagnostic/restricted-reproduction.json
```

Result: green baseline, `SB1-M09 SURVIVED`, runner exit 1. The eight selected
tests passed; 62 unrelated tests were filtered out. This restricted run is
diagnostic only and cannot replace the unrestricted GitHub receipt.

For cause inspection, only the disposable copy of the test was instrumented to
capture the safe synthetic error response and rethrow the same error. The five
original assertions were retained. Original and mutated service runs each
passed all five assertions, exposing the different link-ID refusal above.

- [Restricted runner receipt](restricted-reproduction.json)
- [Observed refusal comparison](CAUSE.json)
- [Diagnostic instrumentation only](observed-test.patch)
- [Source and local receipt hashes](PROVENANCE.json)

Git blame places the generic assertion at `a46b228bc` and the later preview-hash
guard at `c6555a62f`. This is source provenance, not a historical bisect.
The candidate's Telegram retry change does not touch these files.

## Fresh work completed before the stop

All local certification surfaces completed on this exact product candidate,
including backend (9,997 tests), Widgets Live (746 tests), runtime, carrier,
compiled HTTP/BIN journeys, profile/revocation proofs, migration replay and
synthetic rollback, native execution proofs, packaging and iOS byte parity.
The unsigned iOS build includes the Maya AppIcon and was not installed.

The targeted Telegram programme killed all 20 mutations with green baseline
and restored runs. Actual PostgreSQL contention passed 160 cases. These results
do not compensate for the SB1 failure.

GitHub Platform CI, Widget Contract, Widgets Live, Chat Shell and canonical
React packaging succeeded on this candidate. The complete mutation programme
did not pass. Final FBE2E/certification assembly remains blocked.

A separate local orchestration error attempted to invoke a collector twice.
The exclusive-output refusal and original failed manifest were preserved.
An isolated control produced byte-identical evidence; only the duplicate parent
invocation was removed. That correction did not change candidate bytes and did
not waive SB1. See the provenance manifest for the retained local proof hashes.

The source matrix has zero profile-missing source claims, but this is **not**
zero certification blockers. Global excluded duties remain false, including
HANDOFF STOP. Full-contract certification remains false.

## Narrow next repair — not implemented

1. Obtain a valid preview using the correct personal context.
2. Carry its exact booking-facts hash into the attempted operation.
3. Substitute only the selected binding field under test.
4. Assert the specific context/binding refusal, plus no provider call.
5. Retain a positive control proving the unchanged context can quote/create.
6. Prove baseline → SB1-M09 failure → restored pass, then all SB1 mutants.
7. Commit the test repair and run the required fresh certification on its SHA.

Do not remove the mutant, weaken the authority guard, label this mutation
equivalent, broaden profile exclusions, or admit historical/partial receipts.

## Preservation and effects

The product candidate is available on GitHub under its existing branch.
The certification checkout remained clean. The primary checkout's 1,333
intentional owner deletions remained byte-for-byte unchanged.

No Beget/production deployment, owner/production database migration, entitlement
grant, real signing/session setup, paid model call, OTP, YCLIENTS effect, or
iPhone installation occurred in this certification/diagnostic pass.

The pass stops here under the owner's instruction to stop on a genuine new
certification defect.
