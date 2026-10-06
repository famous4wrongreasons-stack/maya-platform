# Personal verified Client context — existing path and replay correction

Code checkpoint: `e2d11388`. This is a local READ correction, not personal booking
activation, role switching or release acceptance.

## Existing path, without duplication

`appointments.own.list` and `loyalty.own.read` already allow interactive tenant
roles and delegate to canonical verified Client readers. `Client.userId` is an
optional legacy association; the current active verified `maya_user` episode owns
Client selection. `PersonalScheduleAdapter` already selects the existing personal
context for its exact own-list invocation. The canonical chat can therefore read
an authenticated employee/owner's own Client data without a role switch.

Canonical React chat deliberately omits audience/mode/role from its wire body.
The separately approved [SB-1 backend contract](widget-release-programme/postdecision/SB-1-CONTRACT.md)
requires request-local `personal_client` selection for personal booking and
expressly excludes chat/widget role switching. [Its integration boundary](widget-release-programme/postdecision/INTEGRATION-AND-ACTIVATION.md)
leaves that carrier entry separate; [successor verification](widget-release-programme/sb1-v2/CONTRACT.md)
already owns re-verification. This increment adds none of those endpoints,
identity writers or UI modes. A future carrier entry must preserve the approved
explicit context and D1's prohibition on global role/application modes; the
current personal READ correction does not depend on it.

## Observed defect and fix

AiToolRuntime's personal cache fingerprint previously selected `Client` rows by
`userId`. The actual reader instead used the canonical channel link. If the Client
had no matching legacy `userId`, a revoked/replaced verified link could leave that
fingerprint unchanged. Both ordinary same-key execution and C9 completed-read
replay could return an older private result without calling its source again.
Five new unit cases failed against the previous code, including revoked and
replaced episode replay and an in-flight context change.

The runtime now reuses `PersonalClientContextService` after existing tool policy
and before cache lookup. Its fingerprint contains the server-resolved Client,
link, verification evidence and the existing Client CRM projection, keyed by the
resolved Client ID. The actual User/session/business-role is passed intact.
The owner revalidates after the source and again after asynchronous widget
projection. A missing context owner refuses personal READ; no fallback grants
identity from `userId`, presentation or a phone number. AppointmentsModule already
exports this owner and AiToolsModule already imports that module.

Old stored executions have the old fingerprint and are intentionally not replay
compatible. Their same-key retry fails closed; a fresh explicit request reads
under current verified authority. No stored row is rewritten or backfilled.

## Evidence and limits

- Final targeted cohort: 7 suites, 162 PASS, no failures. Includes both personal
  tools, execute/C9 replay, absent owner, retained business actor, changed episode,
  post-source/post-widget revocation, existing context/reader tests and routing.
- Earlier 6-suite context/widget-architecture cohort: 114 PASS, including the
  exact widget import graph. These cohorts overlap and are not additive.
- Scoped ESLint: zero errors or warnings. Independent read-only review: no
  remaining blocker; reviewer did not run tests.
- The routing corpus uses its existing synthetic sources and now an explicit
  matching synthetic personal-context port. It is not identity-provider evidence.
- The existing C9 HTTP suite is prepared with a real canonical reader, synthetic
  verified link owner, null legacy `Client.userId`, same-key replay and revocation.
  Its previous synthetic identity test now revokes through that owner instead of
  treating removal of the optional legacy association as verified revocation.
  **These HTTP changes are not yet run.**
- Full semantic typecheck remains unverified after the prior all-project 3072 MB
  OOM. A bounded serial check and HTTP/PG proof await main's heavy-slot handoff.
  No PG/browser/build process was started for this increment.

[Hashed source, tests, failed initial regressions and review](evidence/maya-development-integration-20261006/personal-read-context/manifest.json).

No CRM mutation, outgoing notification, new schema, retention policy or autonomy
authority. Model/provider acceptance and C10 completion remain unclaimed;
qualification stays `NOT_ISSUED`.
