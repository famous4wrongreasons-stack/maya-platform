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

The later production-only typecheck at application HEAD `9d1baa9f` passed with
4096 MB heap in 5.52 seconds. It covers the committed canonical personal context
correction, but the public-profile HTTP/browser proof did not select the new
personal-specific HTTP cases. Their actual execution remains pending.

Code `41f9ae79` makes the existing personal READ useful for “Когда я записан?”:
AiCore composes up to three earliest upcoming visits, date/time in each appointment
branch's timezone, optional public branch/service labels and full available-list
counts. It consumes the actual runtime result before the generic 40-item display
truncation. The canonical reader's existing history setting remains authoritative;
empty available lists no longer imply that no past records exist. The source is
identified as personal records in MAYA, not a freshly reconciled live CRM snapshot.

The handler forwards only the branch timezone already selected by the existing
reader. It does not add Client identity, phone/name/contact or provider payload.
Stale or malformed results, absent/invalid upcoming dates and unknown branch
timezones produce an explicit blocked answer. UTC ISO strings are round-trip
validated; JavaScript date rollover and machine-local timezone parsing cannot
invent a visit time. A cached upcoming flag is ignored once its instant has passed.
Cancelled visits are not presented as upcoming. No second model call receives the
personal history, and no READ grant, context owner, mutation, schema, retention or
background authority changes.

Six targeted suites pass 304/304; lint has zero errors and two existing test-helper
warnings. Independent review has no remaining blocker. The previous RED showed
8 failures/1 pass and is retained. The changed personal HTTP expectation is prepared,
not executed. Types and HTTP/PG/current React proof for this newest increment are
pending; prior public-profile proof cannot qualify the new runtime. Heavy slot was
released before this light work. `NOT_ISSUED`; no real model/provider or C10 completion.

[Personal appointment details: hashed RED/green/lint/review evidence](evidence/maya-development-integration-20261006/personal-appointment-details/manifest.json).

## Actual runtime proof and cross-turn privacy correction

Code `02fb2e7b` closes a confirmed cross-turn boundary gap: although the personal
READ reply is composed on the server, the carrier sends prior assistant prose in
the next chat request. Generic name/phone/ID redaction does not remove a personal
visit's service, time or count. No real model was called during this finding; it is
not evidence that a live external disclosure occurred.

Immediately before model planning, AiCore now forwards only sanitized user turns
and the existing server-owned semantic context. Client-supplied assistant prose
has no trusted source classification and is excluded, including after history
restore or truncation. UI, encrypted transcript and local deterministic handlers
retain their history. No second memory store, carrier authority, schema or
retention policy is introduced. Public assistant prose is also excluded from the
model input; scripted tests do not establish real-model dialogue quality.

Final targeted units pass **273/273** in six suites, including the real provider
request serializer intercepted before network. Both input-level and serialized
RED regressions, intermediate test failures and final results are retained. Scoped
lint has zero errors and two existing warnings. Production-only semantic types
pass at 4096 MB in 5.52 seconds; test/script semantic types and the prior full-project
3072 MB OOM are not promoted to a full pass.

Actual r1 and strengthened r2 pass AppModule HTTP/auth/C9, two selected personal
context HTTP regressions, fresh PostgreSQL/application restart and seven current
React checkpoints: restored history, current visit, changed time, missing timezone,
cancelled visit, revoked Client link and revoked membership. r2 runs at committed
`02fb2e7b`. Its browser proves that both the restored-history request and request
after Client-link revocation contain prior private service/time in assistant prose.
All nine complete serialized model request bodies exclude those facts. The revoked
link adds exactly one model request (resume index 4) and no source execution;
membership revocation returns 401 without another model request. No business
mutation or outgoing notification occurs. Both owned clusters and browsers stopped.

Independent review found no remaining privacy/runtime blocker. Synthetic model
transport, appointment source and A18 verifier are explicit. Existing personal
SCHEDULE cards and duplicated labels remain a presentation limitation; polished
UX and suppression of all incomplete-source cards are not accepted. This proof
does not activate owner-to-personal booking in the carrier. Real model/provider
acceptance and C10 completion remain unclaimed; `NOT_ISSUED`.

[Hashed runtime proof, full synthetic serialized requests, screenshots, RED/green and review](evidence/maya-development-integration-20261006/personal-dates-privacy-http-react/manifest.json).
