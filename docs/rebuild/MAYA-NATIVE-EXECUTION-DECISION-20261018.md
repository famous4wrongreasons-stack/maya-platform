# First phone: bounded operational execution decision

Status: OPTION A APPROVED by the owner on 2026-10-18.
Approval: “A — реализовать ограниченный подписанный запуск”.
Implementation and isolated proofs only; real execution remains unauthorized.
Date: 2026-10-18. Inspected engineering HEAD:
`30db3a9447bf4b275eb3f885eba14e0d2ff0def2`.
Fixed release profile: `closed-input.no-handoff.no-price-goods@1`.
No release certificate, production authorization, credential, grant or external
operation is created by this document.

## Exact remaining gap

The current AR-1 production authorization parser admits only `grant` and `revoke`
(`maya-saas-backend/src/entitlements/widget-release-production.contract.ts`).
The canonical booking path already checks personal Client authority, current
ownership, confirmation, Action Engine identity and provider outcomes. Neither
that product authority nor a widget entitlement is a human authorization to run
a bounded real acceptance experiment against the salon's YCLIENTS account.

The existing transport/run guard requires an independent current admission
verdict. Its tests explicitly supply a synthetic verdict; there is no real
verifier/launcher that may replace it with `true`. A scope JSON file, its hash,
provider credential possession or an AR-1 grant alone cannot supply that verdict.
See [the existing guard contract](MAYA-NATIVE-RUN-GUARD-20261018.md).

A fresh diagnostic using the actual compiled `AiCoreModelService` also proves
that the old model sidecar refuses the ordinary request with HTTP 403: ordinary
AiCore sends its Bearer header, while the old sidecar expects private actor
headers injected by a wrapper. That wrapper additionally replaces Action Engine
execution with refusal. Enabling widgets while retaining it does not enable
booking. Removing its checks or supplying fixed user headers would not prove
current actor authority. This must be replaced with ordinary-backend-compatible
transport using server-resolved request context, without replacing AiCore,
tool selection, confirmation or Action Engine behavior.

The diagnostic used synthetic credentials and a loopback provider. Real model
and YCLIENTS calls: 0. Existing allowance windows have expired and were not reset.

## Option A — fixed signed operational attachment (recommended)

Implement a single fixed acceptance-window attachment in the existing operator
tooling, verified with the existing platform operator trust/key identity. Keep
AR-1's release certificate and grant/revoke contracts unchanged. Do not add an
HTTP endpoint, release engine, tenant role, database model or generic permission
system. The attachment authorizes only the restrictive network executor; it
never replaces canonical Client, confirmation, entitlement or AE authorization.

Minimum signed binding:

- Domain-separated contract `maya.phone-native-execution/1`, unique run ID,
  exact final candidate SHA and compiled artifact digest.
- Exact certificate/evidence digest, fixed profile ID/digest, and the exact
  AR-1 grant authorization digest and entitlement version.
- Exact test environment/server, tenant, company, authenticated Maya User and
  platform operator. Personal Client identity must still be resolved and reread
  by the existing canonical path; callers cannot select it as authority.
- One operator with `independentHumanReview: false`; no fabricated reviewer,
  second self-signature or claim of independent review. The same operator's
  separate operational signature is explicitly for a different purpose.
- Explicit `notBefore` and `expiresAt`, at most 30 minutes; no auto-renew.
- At most 12 model attempts and $2, current verified price bounds required
  before real activation. Only canonical sanitized model payloads; no raw
  contacts, credentials or customer export.
- At most 256 admitted provider reads, one create, one time-only reschedule and
  one cancellation, all for the one record actually created in this run.
  Uncertainty does not replenish a budget or allow a replacement create.

The real verifier must check the installed candidate/certificate/trust, actual
global platform session, exact active entitlement/CAS and allowlist before
opening the run and at dispatch boundaries. The existing private immutable scope
and atomic one-use journal remain the replay owner. Use an awaited verifier where
current database/session checks require asynchronous I/O; do not substitute a
cached boolean for current authority. A failed/expired/revoked check closes the
run. Replacing a file or restarting the process cannot reset the consumed run.

The model bridge must derive actor context from the existing authenticated server
context and reread current scope; a model Bearer key is transport authentication,
not user authority. The private network allows only the bounded relays. No old
wrapper monkey-patching of chat, tools or Action Engine survives in the real path.

Revocation closes model/provider dispatch and remains available after allowlist
removal, certificate expiry or candidate replacement. Existing AR-1 revoke is
used for the entitlement. After a provider response is lost, preserve UNKNOWN
and canonical reconciliation; do not announce success or automatically create
another appointment. Revocation is not an automatic business cancellation.

Local implementation proof must cover real ordinary AppModule/compiled HTTP
flow with synthetic provider and signer; altered/missing/wrong-scope signatures,
tenant/user/session substitution, expired/revoked/stale grants, candidate changes,
concurrent/replayed starts, budget exhaustion, restart, loss/reconciliation,
HANDOFF/price/goods refusal and unchanged canonical actor/receipt identity.

Approval of Option A permits code and isolated proofs only. The operator's real
private key remains outside agent/Git/chat/application files. Issuing the real
attachment, updating Beget, granting, installing on iPhone or making paid/business
calls still requires the concrete separate execution authorization after the
final candidate, certificate, rollback and artifact checks are complete.

## Option B — defer real-effect acceptance

Keep model/provider execution closed and continue only synthetic/read-only
acceptance. No new verifier is implemented. This cannot complete the owner's
requested first real create → reschedule → cancel scenario on the phone.

## Why a decision is needed now

This is a narrow explicit extension of operational authorization, not a request
to reapprove ordinary tests or the already-approved product booking contracts.
The previous run-guard checkpoint left this external authority deliberately
unimplemented. Choosing its signed bounds implicitly would invent that missing
security contract. All independent certification and phone packaging can continue
while this sub-unit awaits a decision.

## Fresh evidence (not a certificate)

Local output root:
`outputs/maya-phone-final-be58cf41-20261018/` in the controlling workspace.

- `ordinary-model-transport-diagnosis-30db3a94/RESULT.json`: actual compiled model
  request rejected by the historical relay; synthetic control isolates missing
  private actor headers. No product source edits or real credentials.
- `native-integrations-30db3a94-v2/native-lifecycle-loss/manifest.json`:
  10 passing ordinary AE/native-network cases, including durable provider commit
  with lost response, concurrent retry refusals and current AR-1 revocation.
- `source-evidence-30db3a94-continuation/manifest.json`: all required fixed-profile
  source claims present. Global unclaimed duties remain explicitly listed;
  profile claims are not promoted into global/full-contract certification.
- `full-mutations-30db3a94-v6/manifest.json`: running when this proposal was written;
  no final green mutation or certification result is claimed.

The owner's intentional working-file deletions are untouched. No schema change,
live key access, deployment, migration, grant, provider effect or phone install.
