# Phone canonical-main cutover preparation — 2026-10-17

Status: **PREPARED_ONLY. Not ready for execution or booking.** This is deployment
tooling, not a new release owner, certificate, provider authorization or product
contract. No server, database, grant, credential store or phone was accessed.

The target remains the separately frozen application candidate
`6356db1875545337e34b6c8888b7ca858bb64361`, profile
`closed-input.no-handoff.no-price-goods@1`. A later commit containing these tools
is not a replacement certified application candidate. Full mutation execution is
still running separately; this preparation does not certify it.

## Implemented

`maya-saas-backend/scripts/phone-canonical-cutover-plan.mjs` derives an inspectable
intermediate configuration for ordinary `/app/dist/src/main.js`. It explicitly
clears Docker's default command, which otherwise applies migrations at startup.
It removes the historical AI wrapper and incompatible model relay, keeps the
model disabled, and preserves the read-only catalogue boundary. It does **not**
implement or enable the provider write transport required for real booking.

Database/uploads volumes and existing catalogue service are unchanged in the
draft. Both cutover and rollback place the existing AR-1 revoke operation on the
matching runtime **before** crossing the runtime/profile boundary. Durable revoke
and audit must be verified; merely observing ineffective access is insufficient.
There is no seed, reset, down-migration, automatic restore over newer effects,
replacement create for UNKNOWN, or new authorization writer. These are plan
requirements, not a claim that a live rollback or revoke has been executed.

The prior image is historical `7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3`.
The baseline Compose shape is reconstructed through existing staging/catalogue/AI
plan owners with a **synthetic scope digest**. It is not the actual current Beget
configuration. Unknown live differences require explicit reconciliation; no
historical checkpoint establishes the live server state.

## Fresh local proof

`phone-canonical-cutover-proof.mjs` reads the frozen source and already built app:

- 22 unit tests passed, including refusal of implicit migrations/seed, direct
  backend egress, database-volume replacement, changed/missing migration checksums,
  broader profile, missing revoke, reordered rollback and fabricated readiness.
- Six additional counterfactuals passed against the actual generator-derived plan.
- The existing carrier owner reconstructed the expected web output in memory with
  `--verify-output`. Actual phone payload parity passed for
  `https://phone-test.mayaos.ru/api`; the only JavaScript difference is the approved
  endpoint substitution. No build output was repaired or installed.
- A correlated modification to **both** web and phone JavaScript passed parity
  alone, then failed the source-bound check. This closes the review finding that
  matching stale payloads must not acquire the target candidate label.
- The compiled backend digest was reread through `WidgetReleasePolicy.buildDigest`:
  `a7f07289450289f4669bcd3dfbfc1218fb7e9df4a7c60de4734142c9e14955bf`.
- Both pinned Git revisions contain 106 identical migration SQL files. Added or
  rewritten migrations between them: **0**. Live pending migrations: **unknown**.

Receipts: [PLAN.json](evidence/maya-phone-canonical-cutover-20261017/PLAN.json),
[PROOF.json](evidence/maya-phone-canonical-cutover-20261017/PROOF.json),
[unit tests](evidence/maya-phone-canonical-cutover-20261017/unit-tests.tap).

The first local attempt (`/private/tmp/maya-phone-canonical-cutover-proof-20261017-01`)
was superseded because parity alone did not bind payloads to source. The archived
receipts come only from corrected attempt `...-02`; the original was not rewritten.

Reproduce without contacting a server (all paths below are local inputs):

```sh
node maya-saas-backend/scripts/phone-canonical-cutover-proof.mjs \
  --source /absolute/path/to/clean-frozen-6356-checkout \
  --app /absolute/path/to/already-built-phone-test/App.app \
  --out /absolute/path/to/new-output-directory
```

## Still required

1. Finish the uninterrupted mutation corpus and existing canonical admission for
   the exact frozen candidate. Historical/partial receipts are insufficient.
2. Implement and prove bounded model and CRM transports compatible with the
   ordinary backend. Keep Client → confirmation → Action Engine → canonical
   adapter authority, including loss/retry/UNKNOWN safety. The old catalogue proxy
   admits GET only; changing its method allowlist is not a booking implementation.
3. Read the actual server artifacts, image digest, configuration, schema, durable
   entitlement/CAS and encryption-key references before drafting executable steps.
   A candidate image tag is not evidence of its compiled bytes.
4. Rehearse rollback against the actual previous/next artifacts and isolated data.
   This unit did not run PostgreSQL, migrations, a backup or rollback.
5. Obtain the existing platform operator/session/signature and a separate bounded
   operational authorization before any update, grant or real provider effect.
   Product `TENANT_OWNER` never substitutes for platform authority. Signing and
   phone installation were not verified or performed here.

The tools were added to the existing development worktree. No extra source
checkout was created; the owner's 1,333 intentional working-file deletions were
neither restored nor staged. Runtime, booking, design and model selection did not
change in this unit.
