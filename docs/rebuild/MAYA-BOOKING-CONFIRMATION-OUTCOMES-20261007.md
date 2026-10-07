# Booking confirmation and restored outcomes — local development checkpoint

The canonical chat booking path now shows the selected specialist's current public
name before explicit confirmation. After a browser reload and real UI sign-in,
saved confirmation and pending outcomes are visible again as historical text.
No old controls or intent tokens are reactivated.

Staff projection code: `58cc3397`. Outcome restoration: `cabb3c1a`. Final proof
harness: `f1ee7805`, on the isolated
`codex/maya-development-integration-20261006` branch. The final r8 proof uses
actual AppModule HTTP/auth/C9/Action Engine, PostgreSQL and current React, with
scripted model decisions and explicitly synthetic identity/provider fixtures.
This is a qualified local checkpoint, not release acceptance: `NOT_ISSUED`.

## Changes and existing owners

`ClientAppointmentCreateService.quoteForAccount` projects a nullable public
`{id, name}` from the existing current-tenant CRM staff reader. Only one exact
selected ID with a trimmed, bounded string name is accepted. Malformed, missing
or ambiguous staff information cannot become an ID presented as a person's name.
The optional projection catches reader/parsing errors, so it does not obstruct
the durable booking owner's Gate 11 or UNKNOWN handling. Both preview entry
paths require the matching readable name before issuing a new confirmation.
The shared mutation quote, canonical Client authority and idempotency descriptor
are unchanged.

The browser proof then exposed a separate defect: the AE outcome was persisted,
but the chat restored only encrypted chat completions. Its terminal widget line
disappeared after reload. The fix reads one page of at most 20 widgets through the
existing `WidgetThreadPageService`, after ordinary text restoration. That owner
already verifies the current principal, tenant, seal and release admission.

Only BOOKING_CONFIRMATION terminal text is published, using the existing live
canonical outcome deduplication. A visible notice identifies these as saved recent
results. This is a bounded page across the principal's history, not a complete
transcript or a page restricted to the latest conversation. There is no envelope
ingest, render receipt, token vault insertion, COMMIT, capability dispatch or new
history writer. The existing encrypted transcript is not rewritten to pretend
that a widget result was a model completion.

Signed-out or superseded sessions discard late reads. `tenant_bound: false`
never reaches the receipt sink. Reader refusal/failure and presentation exceptions
leave ordinary chat usable. Independent review identified and verified fixes for
the tenant-bound check and a possible stuck composer after a throwing sink.

## Actual evidence

- Five backend unit suites: **69/69 PASS**, including malformed public staff
  data. Original RED: 12 failures/34 passes; intermediate fixture failures remain
  in the archive. Scoped backend ESLint passes. Production-only TypeScript passes
  at 4096 MB in 5.48 seconds; full-project test/script types remain unqualified.
- Five headless runtime suites: **224/224 PASS**, including identity changes,
  abort, reader rejection, unbound page, throwing sink, receipt deduplication and
  no restored controls. React parity/detail: **77/77 PASS**. Shell and carrier
  typechecks/build guards pass. The normal shell build refreshed its existing
  runtime manifest; no guard was weakened.
- Actual HTTP: **7/7 PASS** across the multi-turn catalog booking and provider
  UNKNOWN suites. Service/staff/date/time corrections use existing server semantic
  context and C9; canonical selectors reach explicit COMMIT and one AE. The privacy
  fix remains in force: client-carried assistant prose is excluded from model
  planning, while server-owned semantic context resolves the selected specialist.
- Actual current React: **9 checkpoints PASS** in r8. Three ordinary CLIENT
  scenarios each reach a readable preview and explicit COMMIT, followed by reload
  and fresh UI authentication. The unchanged email cooldown is respected.
- Successful internal booking: one appointment with the selected Client, service,
  staff and instant; one `crm.appointment.create.v1` execution in SUCCEEDED with
  `executionAttemptCount = 1`, unchanged after reload.
- Canonical ClientChannelLink revoked between preview and COMMIT: **zero AE
  executions and zero appointments**, still zero after reload. No success is shown.
- Owned loopback provider: persists one synthetic booking, then loses the response
  socket; reconciliation remains unavailable. The actual gateway records UNKNOWN,
  one attempt and one provider dispatch. Reload shows “Запрос принят.
  Подтверждение ожидается.”, without a stale COMMIT control or another dispatch.

All eight proof attempts are preserved. r1–r5 include test-harness corrections;
r6 is the actual restoration RED. r7 passes functionally but has an incompletely
painted background-tab screenshot. r8 brings the tab forward before capture and
is the final visual evidence. All owned PostgreSQL clusters, HTTP listeners and
Chrome processes were stopped. These booking runs prove browser reload and new
AuthSession, **not application/PostgreSQL restart**.

[Hashed sources, full run evidence, screenshots, review and failed attempts](evidence/maya-development-integration-20261006/booking-confirmation-http-react/manifest.json).

## Limits and next boundary

The model is scripted, the A18 verifier is synthetic, and provider transport is
an owned loopback fixture. The CLIENT fixtures have a canonical verified link and
retain `Client.userId` for contact lookup. This does not establish legacy-free
booking, current owner verification, real-model dialogue quality or actual
YCLIENTS acceptance. No real external provider, model, SMS, production, phone,
deploy, push or merge was used.

The follow-up presentation checkpoint `6900dfcf` replaces technical English
booking/control labels with Russian text and removes the repeated service title.
One history warning covers incomplete lowered turns, without marking them complete
or admitting them to model history. Frozen/text-only booking and selector views
now carry readable facts instead of raw JSON. UNKNOWN/not-measured values,
completeness, policy notices and each measure's provenance are retained.

Independent review found omitted non-KNOWN facts and duplicate paragraph/list
content in the first text projection; both were corrected before the final proof.
This is qualified for the current booking producers, not every A21 shape/profile.
The source basis remains attached to each measure; the earlier catalog response
still precedes the confirmation. Polished end-to-end UX is not accepted.

Fresh r10 actual HTTP (7 cases) and current React (9 checkpoints) pass for success,
revocation, UNKNOWN and UI reauthentication with no second provider dispatch.
r9 is preserved: its only failure was a test reading CSS-uppercase button text
instead of the correct accessible name. Focused backend units 26/26, headless
fallback/history tests 64/64 and React tests 93/93 pass. Scoped ESLint and
production TypeScript at 4096 MB pass. All owned services were stopped; exact
PostgreSQL paths were independently checked with pg_ctl status (exit 3).
[Follow-up sources, failed/final runs and screenshots](evidence/maya-development-integration-20261006/booking-presentation-http-react/manifest.json).

Revoked-link proof establishes refusal and zero effects; it does not claim a
durable reconstructed refusal conversation after reload.

The approved SB-1 JSON V2 contract already owns fresh successor verification; the
older schema/issuer STOP is superseded. Owner-to-personal-client carrier entry,
its activation and actual identity verification remain separate, unproved work.
No new identity owner, global role mode, schema, retention, background authority,
second C9/orchestrator or general capability framework was added. The original
explicit Occupancy recommendation remains read/recommend only. This checkpoint
does not make C10 complete.
