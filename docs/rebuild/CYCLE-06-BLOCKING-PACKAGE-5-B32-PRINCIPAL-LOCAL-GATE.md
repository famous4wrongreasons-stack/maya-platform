# B32 — approved Client principal wiring and local gate

Baseline: `b49c5c15`. The Owner explicitly approved B32 Option A on 2026-09-06:
reuse the existing `client_channel` principal, immutable evidence storage and
ClientChannelLink history. This approval supersedes the decision-pending status
in the historical decision sheet. No schema/model/field/action-class addition,
migration, historical backfill or synthetic User is authorized or introduced.

## Runtime change

The existing canonical policy resolver admits a Client alternative for the
existing appointment create, cancel, reschedule and service-change capabilities.
The server constructs one reserved `client-authority:v1:<link-id>` reference
after authenticating the channel and resolving its active verified binding.
For an existing Appointment it also records the canonical Appointment reference.
The shared parser reconstructs the same principal at ingress, admission and claim.
It rejects malformed, mixed, duplicate and unregistered authority references.

Policy checks exact tenant, active versioned link, canonical unmerged Client and
capability-specific business ownership. Existing Appointment authority requires
`Appointment.mayaClientId + tenantId`; an external target additionally requires
the current active integration, matching provider and exact external reference.
Internal targets use the canonical Appointment ID. A failed Client check cannot
fall through to User or service authority. Existing staff/service alternatives
and the bounded consent/preferences/habits/wanted-slot contracts remain intact.

HTTP and AI account create, and the published verified channel create bridge,
now share `ClientAppointmentCreateService` and the B31 immutable intent admission.
Account authentication still verifies the real authenticated account; a canonical
Client need not have `Client.userId`. A Telegram Client needs no account actor.
Both submit `authenticated_request`, with `actorUserId = null` for this principal.
Channel identity and raw credentials are not booking intent or business ownership.

The Action Engine still owns the existing internal-calendar and CRM executors.
No route/AI/provider write fallback was added. B29/B30 account authorization and
executors are preserved; their initiators now supply the same verified Client
principal. Existing external channel cancel/reschedule/service changes use the
same target authority. No new internal channel mutation API is introduced.

The first execution retains immutable source/evidence and keyed policy facts:
principal kind, Client, exact link, provider, verification identity/evidence,
action and target. Revoking the link does not rewrite historical attribution.
No raw Telegram subject, signature, delivery credential or phone is saved as
principal evidence. No synthetic User, membership or AI actor is created.

## Idempotency and UNKNOWN

B31's business fingerprint and persisted schema are unchanged. Authority metadata
stays outside the fingerprint. Exact retries and channel/account/AI aliases reuse
the same intent/execution/outcome; changed intent conflicts before another
execution, Appointment or provider operation. Claim reconstruction retains the
original authority; a retry cannot relabel that execution with another channel.

Bound replays reuse frozen server defaults even if the current contact/catalog
read is unavailable. Lost provider response followed by conclusive reread reaches
the same SUCCEEDED execution with one dispatch. Inconclusive reconciliation keeps
the existing UNKNOWN / MANUAL_REQUIRED state. Recovering provider reads does not
silently reopen manual-required execution or authorize a blind provider retry.
Changed intent cannot bypass either state.

## Verification boundary

The ordinary tests exercise the real policy registry and action-specific target
checks, plus account/channel entry and compatibility with existing Client actions.
Compiled probes use actual HTTP/AI and signed Telegram bridge controllers,
authenticator, Client resolver, canonical policy/kernel and a fresh owned real
PostgreSQL database. Only fixture credentials and external catalog/provider I/O
are synthetic. Internal/external × Client with/without Maya User are covered.
Eight concurrent channel requests converge to one outcome. Other-Client target,
missing/revoked binding, immutable historical evidence and zero runtime User
creation are asserted. The B31 probe also covers cross-process concurrency and
crash/restart against persisted bindings.

All required local gates PASS. Targeted: 6 suites / 68 tests; cross-action:
40 / 381; architectural guards: 78 / 425. Lint, both typechecks, build,
Prisma validation, full fresh migration replay, migration status and structural
schema diff PASS. Full mandatory backend: **374 suites / 3065 tests PASS**.

Evidence: [gate results](evidence/package5-b32-local-gates.json),
[B31 regression](evidence/package5-b32-b31-regression.proof.json),
[channel principal](evidence/package5-b32-client-principal.proof.json).
The default local Node 24.15 full run encountered the already documented V8
SIGSEGV. The complete mandatory run uses the existing installed Node 24.19 via
the documented local runtime selection, without omitting tests or changing
production Node. Earlier formatting errors were corrected. The extra UNKNOWN
test was aligned with the existing MANUAL_REQUIRED contract, without changing
runtime reconciliation behavior.

Production deployment and the fresh all-13-family Package 5 Final Gate follow
only after all local mandatory gates pass. This local report is not a Package 5
completion or production PASS claim. Chapter 6 remains incomplete; Wave 7 and
Chapter 7 are not started. Main dirty checkout and all 17 pre-existing DBs remain
untouched. The one owned proof DB is retained temporarily for the subsequent gate.
