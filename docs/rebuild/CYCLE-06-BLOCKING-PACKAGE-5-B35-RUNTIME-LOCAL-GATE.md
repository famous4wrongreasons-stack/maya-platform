# B35 canonical Client bulk — runtime implementation and local gate

Owner approval: checkpoint `c3641411`, [exact Option A mapping](package5-b35-exact-schema-mapping-v1-proposal.md).
The approved schema was committed at `82816b26`; [production migration PASS](CYCLE-06-BLOCKING-PACKAGE-5-B35-PRODUCTION-MIGRATION-REPORT.md) is checkpoint `4b13b9f1`.
This runtime introduces no additional schema changes. Total B35 delta remains
0 models, 12 persisted fields, 2 nullability changes, 3 uniques, 2 indexes,
3 foreign keys, 0 action classes; historical backfill 0.

## Canonical owner and durable execution

`CanonicalBulkService` owns the MarketingCampaign root and frozen canonical
Client audience. HTTP and the panel's bound legacy bridge accept a real Maya
owner session; tenant comes from authenticated context or the existing exact
integration binding. Active owner membership, active account, session and
existing authentication identity are checked. Neither a legacy owner/chat ID nor
a caller-supplied tenant/Client/User authority substitutes for that proof.

Preview fixes a bounded (maximum 500) unique Client set, normalized template,
24-hour expiry, encrypted per-Client content and verified delivery plans. The
existing ActionIdentityService canonical/HMAC primitives bind the typed complete
manifest. Repeated original identity reuses the stored snapshot; changed content
or selection conflicts before another admission. `{name}` is rendered once from
a verified Maya account or the existing `друг` fallback; rendered text and device
preview remain frozen. Marketing content uses the explicit plain-text contract.
No Client IDs are stored in a User compatibility list.

Confirmation compares the reviewed hash to the recomputed stored manifest and
atomically binds approving authority, immutable approval evidence, the root
ActionExecution and its successful admission receipt. Each deterministic delivery
slot uses the same existing Action Engine admission machinery. Creation, approval,
claim and completion of these local admission executions share their graph
transaction. A lost COMMIT response can only recover that same committed graph
or retry a rolled-back admission. The existing approval attestation lifetime is
unchanged; no committed READY admission is left waiting for a later provider send.
Root/slot engine success means durable admission, never provider acceptance.

Communication Delivery alone creates transport envelopes/attempts, checks policy,
crosses the durable boundary and invokes the existing protected transports.
Logical Client leases and leaf atomic claims prevent independent duplicate sends.
The immutable graph and original keys survive retries and process/database restart.
New pending Clients receive the bounded work window before previously unresolved
Clients; manual UNKNOWN leaves do not perform another send-policy/claim cycle.
Successful leaves are skipped, definitive failure/denial is terminal, pending
work continues, UNKNOWN reconciles only. Inbox reconciliation rereads the original
unique InboxItem; Telegram/Web Push/APNs require conclusive evidence and never
use a blind or alternate-channel retry. Missing planned slots remain pending.

## Fixed routing and current policy

Priority: verified active Maya User/Inbox, otherwise verified Telegram, otherwise
B24 Web Push-only; missing endpoint produces a skipped Client. No fake User is
created. Link/material/evidence/device references are fixed before effects and
revalidated at dispatch. B24 fan-out remains at most five devices below one logical
Client. Supplemental Web Push/APNs requires actual primary acceptance. Revocation,
rotation, denial, deterministic failure or UNKNOWN cannot select another route.
The Telegram executor uses its original unmirrored transport, preserving sole
ownership of supplemental delivery. For B35, proven Telegram Forbidden/BadRequest
is a terminal rejection; timeout/lost response stays UNKNOWN without a retry.
Permanent Web Push invalidity closes only the exact B24 endpoint, using its exact
durable failed attempt and canonical Client parent; UNKNOWN cannot close it.

Dispatch rechecks canonical privacy/marketing consent facts, exact Client policy
projection, current owner/tenant/category authority, quiet hours, frequency and
pinned endpoint validity. The policy reads only consent/preference fields from
CustomerProfile, with an explicit narrow B28 internal-owner ratchet. It does not
return private profile data. Client/profile/tenant/link/device locks order current
eligibility against the durable provider boundary; a prior consent withdrawal
prevents the effect. Dispatch proof is sealed on the actual delivery attempt.

Same-Client frequency checks and the first attempt reservation share a transaction.
Accepted/delivered and unresolved evidence comes from the canonical logical Client
journal, not device counts or fabricated legacy timestamps. Resolved UNKNOWN releases
its reservation. There is no implicit weekly limit when no explicit frequency was
chosen. NULL history coverage denies delivery; explicit 7/14/30-day limits require
a complete prospective interval.

## Retired paths and initiators

The panel's old raw chat-id bulk loop, selector and direct Web Push path are retired.
The old bot bulk producer returns the canonical-owner-required result. The dormant
User/CRM-based MarketingService sender and CommunicationDeliveryService v1 bulk
entry now fail before any admission or mutation; historical rows are not promoted.
MarketingModule registers only the new canonical bulk owner. Opportunity discovery,
legacy marketing decisions and scoring do not gain send authority.

The PWA persists original draft/campaign/hash per canonical tenant/account across
browser restart; lost confirmation responses resume or inspect that original
campaign. Templates are read-only. A failed local identity save cannot confirm.
The PHP helper forwards only canonical bearer proof and supported intent fields.
Both published PWA variants have narrow reviewed overlays. Shared iOS changes are
mirrored without replacing unrelated local content; Capacitor sync and copy equality
are checked. No native application install is performed.

Permanent backend/Python ratchets cover registered owners, initiators, fixed plans,
approval/audience immutability, duplicate children, Action Engine admission,
Communication Delivery ownership and UNKNOWN handling. The deployment's existing
active Python guard now checks B35 callable boundaries, including the protected
single-send Telegram adapter. Legacy B29–B34 decisions remain unchanged.

## Verification and limits

Final source PASS: targeted **12 suites / 101 tests**, architectural **83 / 469**,
lint, both typechecks, build, Prisma validation/status/diff, full mandatory backend
**382 suites / 3130 tests**. [Gate results](evidence/package5-b35-runtime-local-gates.json).
[PostgreSQL runtime proof](evidence/package5-b35-runtime-postgres.proof.json) and
[actual restart proof](evidence/package5-b35-runtime-restart.proof.json) PASS.
Five Python tests (including known rejection/UNKNOWN single-send behavior), six
pure PHP 8.4 request checks, current active-source guards, PWA/iOS and both production
overlay script parsing PASS. No provider I/O is used by those proofs. Real PostgreSQL proofs use only the owned port 55505 database,
actual channel/session authentication, canonical policy/admission/delivery kernels,
SQL fences and encrypted persistence. Provider I/O and feature-entitlement fixtures
are explicit controlled doubles. This is not a live-provider or live-HTTP message
smoke. A separate process follows an actual PostgreSQL restart. Production messages,
provider writes and business proof mutations remain zero.

Intermediate test/guard failures are retained as superseded local results: test
transaction forwarding, historical architectural path assertions, the narrow
policy-reader classification, and the bounded-work scheduling regression were
corrected. None is waived or treated as PASS. The final source must pass the full
mandatory gate before publication. PHP is validated with installed PHP 8.4; the
host's unrelated default PHP 5.6 CLI is not the published runtime verification.

## Authorized cutover and next gate

After local PASS: commit/push, then the existing `deploy/vps/deploy.sh` process
(fresh dependencies, preflight, drift, spare-port readiness, activation), followed
by the reviewed Python/PWA/PHP overlays and the currently active Python service restart. Verify active
artifact hashes, registered boundaries, health/readiness and guards without sending
any production message or invoking a business/provider proof operation.

Only after that structural cutover is verified, run the compiled
`package5-b35-history-cutover.js --apply-evidence <verified receipt>` from the
active release. It validates active file hashes and health, establishes the current
DB-time epoch once for current eligible tenants, and records existing AuditLog
metadata in the same transaction. It never creates a campaign/message, backdates
history, resets an epoch or changes existing enabled/budget fields. Repeating it
preserves established epochs; later tenants need their own verified establishment.
This is authorized prospective cutover metadata, not a historical backfill or a
production message proof.

B35 production PASS must then be followed by the existing full Package 5 Final Gate
across all 13 families. A confirmed new blocker requires evidence/remainder,
commit/push and STOP without fixing that blocker. A clean gate may complete Package 5;
Chapter 6 completion is a separate acceptance cycle. No Wave 7 or Chapter 7 is started.

Fresh read-only service inspection before publication found `barbershop-bot.service`
active with `bot.py` (since 2026-09-07 13:17 MSK), while the historical
`barbershop-pwa` unit is not loaded. B34 runtime release and reviewed source hashes
remain the baseline. The B35 overlay covers both bot and webhook initiators; use
the existing AGENTS.md `barbershop-bot` restart for this actual active entry point.
Do not start a replacement launcher or change background-job configuration.

[Python overlay](evidence/package5-b35-python-overlay-manifest.json),
[frontend overlay](evidence/package5-b35-frontend-overlay-manifest.json),
[active guard](evidence/package5-b35-local-active-guard.json).

```text
B35 LOCAL SCHEMA/RUNTIME GATES: PASS
B35 PRODUCTION SCHEMA FOUNDATION: PASS
B35 RUNTIME DEPLOYMENT: NOT STARTED AT THIS CHECKPOINT
PACKAGE 5 COMPLETE: NO
MAIN DIRTY WORKTREE: 24 entries and recorded hashes preserved
PRE-EXISTING DATABASES TOUCHED: 0 — 17 protected
PRODUCTION MESSAGES / BUSINESS / PROVIDER PROOF MUTATIONS: 0 / 0 / 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: DO NOT DECLARE
```
