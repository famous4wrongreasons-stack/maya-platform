# Existing owner → Telegram → personal Client

Implementation checkpoint: `1e0e72c267f2429b79e77a63d0fdaa04a28d0868`.
Parent phone repair: `39a0a4d6`. Branch: `codex/maya-local-crm-setup-20261010`.
This is local functional development after C9, not C10 or a certified release.

## Verified retained local state

Read-only preflight at `20a543840eb75b58d649c44517f8e071b04865fc` found an
active owner and CRM integration, one membership, no owner phone/social identity,
no tenant Clients/channel episodes/appointments, and no history-setting revision.
The canonical history default remains off. This is the retained local owner DB,
not a claim about production or YCLIENTS source records. Queries used read-only
transactions; no application runtime/provider/model was started. PostgreSQL was
stopped and private input pins remained unchanged. Counts/provenance only are
archived in `owner-prestate.json`; no credentials or customer rows are copied.

The previous browser proof (`48cfa9ea`) seeded an AuthIdentity and User.phone.
It proved initial Client binding, but did not prove first linking an unlinked
business owner. The new owner browser case starts without either identity field.

## Existing authority owners, narrow changes

1. Authenticated `/auth/oauth/telegram/link/start` resolves the current tenant
   server-side and reuses the existing Telegram PKCE start owner. Its DTO accepts
   only platform/callback, rejecting caller tenant/user/Client/phone fields.
   Current business membership is reread; the callback allowlist is unchanged.
2. Existing `/auth/oauth/telegram/link/complete` and A23 remain the only account
   identity writer. Linking does not issue another session or create Client
   authority. The new React control lives in the existing privacy/account panel.
3. Runtime holds the purpose/state and initiating session epoch in memory. A
   switched/revoked session, foreign state, cancellation or replay cannot change
   the current account. No token from the linking response is installed. A lost
   response remains unconfirmed; there is no automatic retry.
4. A separate fresh Telegram login uses the existing verified-phone/unique
   current CRM registry resolver to establish the personal Client context.
   TENANT_OWNER stays TENANT_OWNER. Historical revocation remains immutable.
5. The first owner login exposed a real pre-existing bug: attaching a verified
   international phone incorrectly invoked Russian-only validation. Social
   attachment now shares existing E.164 identity normalization and the same
   availability/identity/CAS checks. Public Russian-only availability validation,
   SMS, booking policy, roles and client grants are unchanged.
6. History remains behind its canonical setting and existing reconciliation
   owner. The browser proof explicitly enables that setting on test data and
   synchronizes after binding; login is not an implicit consent or import writer.

## Verification

Fresh proof checkpoint: `d27699c2f96d65095f1d24c7fca79ad69e227e1b` (only a concurrency test changed after the implementation checkpoint).

Executed results and source/log hashes are recorded in `summary.json` and
`receipts.json`. The HTTP/browser run checks 2,109 source hashes against the
committed proof checkpoint. Backend mutations ran on `1e0e72c2`; the backend
source, tests and mutation runner are byte-identical at `d27699c2`. This explicit
reuse applies to targeted development evidence only, not release admission. Temporary
mutation runs restore their source bytes and have a green unmutated baseline.
The two browser cases use emitted React/runtime/callback, actual AppModule HTTP,
and isolated PostgreSQL. Telegram issuer, CRM records and model are synthetic.
No private history is serialized to the model; no business ActionExecution is
created. Checkpoint counts inside browser cases are not extra Jest test counts.

Earlier failed attempts are retained locally: the original post-link login
failed on Russian-only phone validation; the first new link-start implementation
missed the established authenticated context wrapper and was rejected with 403.
Both were corrected through their existing owners. The full runtime self-test
also caught old finite endpoint fixtures; all copies now name the two exact
new endpoints while arbitrary paths remain refused. No timeout was widened.

The broad backend run returned 9,562 passes and 37 inherited failures, all 37
reproduced by exact suite/case name on the original
`20a54384` source. They are not waived or hidden: see
[BASELINE-REGRESSIONS.md](BASELINE-REGRESSIONS.md). Targeted Telegram success is
not a claim that the whole backend or release programme is green.

## Live acceptance boundary

LIVE OWNER TELEGRAM/HISTORY ACCEPTANCE: NOT RUN.
READY FOR LIVE PRIVATE-READ LAUNCH: NO.

Remaining prerequisites are concrete:

- Qualify the current React/callback pair on an authorized HTTPS test return
  address registered for `@mayaos_login_bot`. The earlier public probe found an
  older callback on mayaos.ru; it does not establish current production SHA or
  the health of every application route. No deploy or BotFather change occurred.
- Qualify a bounded private-read mode of the existing local launcher. Its current
  catalog-only profile disables Telegram and forbids client registry/journal
  reads. Do not silently broaden it or reuse the expired live allowance.
- Use the existing history/consent owner, and obtain a fresh explicit allowance
  for actual personal-data reads/model use before dispatch. The owner completes
  real Telegram sign-in themselves. Current local rows are not manually edited.

No production change, real OTP/SMS, YCLIENTS business effect, grant, migration on
owner/production DB, iPhone install or design-package migration occurred.
Old release certificates are not inherited. This checkpoint remains local;
pushing was not attempted in this turn.

## Follow-up, preserving this historical checkpoint

The 37 backend failures recorded here are resolved by the subsequent
[backend regression repair](../maya-backend-regression-repair-20261011/README.md)
on `6f48df0542468d0557e386d65f91cb9bb7b6a97f`: 9,601 passes / zero failures.
The original receipts and this checkpoint's counts remain unchanged. Live owner
Telegram/history acceptance is still not run.

The subsequent [local launcher return proof](../maya-local-telegram-return-20261011/README.md)
fixes an additional callback serving/boundary gap and runs the browser proof
through the real local web handler. Its consolidated live prerequisites are in
[LIVE-PREPARATION.md](../maya-local-telegram-return-20261011/LIVE-PREPARATION.md).
Real provider registration and the finite private-data launch remain unqualified.
