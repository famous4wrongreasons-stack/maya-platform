# Phone CI baseline repair — 2026-10-18

Status: LOCAL HARNESS REPAIR; NOT RELEASE CERTIFICATION.

The fresh mandatory backend CI checks were started from a clean detached checkout
of `be58cf4138e03ede2fae5cb3097e6722a0a2f546`. The application sources,
Prisma schema/migrations, React source, runtime source and workflow files are
unchanged from the frozen `6356db1875545337e34b6c8888b7ca858bb64361` application.
The later checkpoint includes the already-approved icon and operational proofs.

## Observed failure

Fresh dependency installation, production-dependency audit, Prisma generation and
validation, clean migration replay, synthetic CI seed and both backend/script type
checks passed. The mandatory full lint then failed: 74 errors in two newer native
diagnostic probes, plus 10 warnings (nine existing contract warnings and one
diagnostic unsafe-argument warning). The runner stopped and shut down its isolated
PostgreSQL cluster. No old receipt was substituted and no certificate was issued.

The errors came from untyped dynamic ESM imports, untyped PostgreSQL result rows,
JSON/body values escaping as `any`, and redundant/nonlocal null assertions.
The error was in test code; it did not prove a product booking defect.

## Narrow correction

Only these two test sources change:

- `native-provider-lifecycle.probe-spec.ts`
- `native-provider-socket-loss.probe-spec.ts`

They declare the pinned transport module boundary and SQL projections, keep
untrusted JSON as `unknown`, check incoming object/string/array shapes, validate
the listening address and retain the required output path as a checked string.
The assertions about one provider record, preserving PUT, cancellation, UNKNOWN,
concurrent retry and current AR-1 refusal remain in place.

No lint rule is disabled, no test is skipped and no expected result or timeout is
relaxed. No product/runtime source, authority rule or transport behavior changes.
The independent execution-admission callback remains explicitly synthetic in
these diagnostic fixtures; a green fixture is not a live operational permit.

## Verification and boundaries

The final two-file lint is clean (zero errors and warnings). Both probes are
separately compiled by their existing external runner before executing against
loopback-only disposable PostgreSQL and HTTP providers.

- Native lifecycle wire: 3 passed, zero failed/skipped.
- Native Action Engine plus guarded transport, lost response and AR-1 refusals:
  10 passed, zero failed/skipped.
- React/browser regression: 7 passed, zero failed/skipped, including the actual
  React create/move/cancel path. Six shared admission controls overlap the
  Action Engine run; the totals are not twenty distinct scenarios.

The early repair attempt with an output path still typed `string | undefined`
failed before database startup. Its log is retained locally. The final typed
binding corrected that issue; it is not counted as a successful check.

Receipts live under `evidence/maya-phone-ci-baseline-repair-20261018/`.
These are scoped repair receipts, not a complete CI/mutation/FBE2E release receipt.
The full programme must run on the new committed candidate.

The original development worktree retains exactly the owner's 1,333 intentional
deletions, with unchanged deletion-set SHA-256
`2e476be9ddc949e1031ec446c347da5a411a77d349be043d82b1f7f76136897a`.
A separate disposable validation checkout contains the complete Git tree needed
by the CI scanners; it does not restore those working files or create a second
implementation. Dependencies and test databases are isolated.

No Beget change, production migration/deploy/grant, paid model call, real
YCLIENTS effect, OTP, credential-store access, phone install or Git push occurred.

## Work still open

1. Finish ordinary-backend bounded model/provider execution wiring and its real
   operator admission. The old read-only AI launcher suppresses Action Engine
   execution; the ordinary model client does not supply that launcher's actor
   headers. Neither a shared model credential nor a synthetic callback is a
   replacement for the actual caller or execution authority.
2. Complete fresh full certification; the interrupted mutation corpus remains
   incomplete and cannot be promoted.
3. Rehearse complete old/new application cutover with canonical revoke/rollback,
   then request the one concrete owner execution approval with all operator
   prerequisites gathered together.
4. After authorization, perform controlled server/phone rollout and user
   acceptance. Real booking, move and cancellation still require the authorized
   external-effects window and ordinary in-app confirmation.

The prior icon, root-only server backup and isolated backup-restore proof are
preserved in `MAYA-PHONE-PREPARATION-20261018.md`. They do not mean the latest
application has been deployed or installed.
