# AR-1 approved implementation — not an activation certificate

The owner approved the contract in `final-evidence/AR-1-ENVELOPE.md`. That historical proposal is unchanged. This overlay records the implementation and its limits. Production activation, production writes, real OTP and real YCLIENTS effects remain unauthorized.

## Narrow operator entry

`/api/platform/widget-release/:tenantId/{validate,grant,revoke,status}` is the only release entry. The first three operations are POST; status is GET. Existing JWT/session/role/tenant guards apply. The writer independently locks and rereads the current global `platform_owner` User and AuthSession. A tenant owner has no release authority. There is no public, plan, trial, SQL or implicit default-tenant grant path.

`validate` performs the grant checks without entitlement or audit mutation. `grant` requires a signed owner authorization and independently signed security certificate; `revoke` requires a signed owner authorization bound to the stored candidate/certificate and CAS version. Revoke does not depend on the old candidate still being healthy or the certificate still being valid. Suspended tenants can still be revoked. `status` returns the exact tenant's effective enablement, expiry, version and stored candidate.

## Trust and certificate

Ed25519 public keys are configured by the server in `WIDGET_RELEASE_TRUST_JSON`, with explicit principal identity and owner/security purpose. The caller cannot supply trust keys. An empty trust set refuses. Strict canonical JSON signatures bind operation, authorization id, environment, tenant, candidate SHA, build digest, certificate digest, operator, approver, independent reviewer, rollback owner, CAS version and time window. Wildcards and extra fields are refused.

`WIDGET_RELEASE_CANDIDATE_SHA` is a server setting; the writer computes a digest of its own runtime source/built bytes and package lock. The certificate binds that candidate/build to carrier, registry, evidence, integration, FBE2E and revocation-proof digests. It enumerates all 165 clause ids exactly once, with only L/L-T/U; U requires hashes for the decision, absence, refusal and mechanism duties. Missing, duplicate, false or STOP rows refuse. A certificate is an attestation by the separately trusted reviewer, not a claim that the writer independently executes CI or verifies remote artifact contents.

Only `synthetic` and `staging` environments exist in this implementation. Synthetic execution requires the established guarded proof database boundary. Staging uses the explicit `maya_widget_release_staging_*` database namespace. `NODE_ENV=production` is separately refused. No actual Maya release certificate, production signing keys or production execution authorization was created. Synthetic tests sign deliberately synthetic evidence with ephemeral keys.

## Atomicity, expiry and rollback

Authorization and tenant advisory locks, an entitlement row lock, a full-row CAS fingerprint and a unique durable audit id serialize consumption. The same signed authorization returns its historical receipt; it cannot grant again after revoke. Rebound bytes under the same id conflict. A new grant requires a new authorization and the current version. There are no renewal jobs.

`TenantEntitlement` and the canonical `AuditLogService` write in one transaction. Failure after the audit insert rolls both back. The receipt retains actual actor, approver, reviewer, rollback owner, session identity hash, before/after state, candidate and certificate. No new table, SQL column, migration or mirror audit writer was added.

Authorization and certificate windows are at most 24 hours. Grants require explicit expiry at most 24 hours from the database clock, never beyond certificate expiry. The reader revalidates the stored signed certificate, current running candidate/build and expiry. Expired or unsigned overrides fail closed. The existing proof fixture exception retains the proof database fence and cannot apply to production. Trial exclusion survives a future readiness change; plan expansion also explicitly excludes `widgets.runtime`. Readiness remains `planned`.

Revoke writes an explicit deny. A widget COMMIT takes a shared tenant release lock and rereads the entitlement at canonical Action Engine admission; revoke takes the exclusive lock. If revoke wins, a request that passed Gate 6 earlier is refused before admission. If admission wins, revoke waits for that admission transaction. Previously admitted/dispatched effects are not undone; UNKNOWN still belongs to canonical reconciliation. The independent SB-1 personal booking route keeps its own authority contract.

## Evidence and remaining release boundary

Proof receipts cover signed grant/retry, concurrent consumption, stale CAS, forged/expired/cross-tenant/rebound authorization, revoked session/tenant role refusal, atomic audit rollback, suspended-tenant rollback, explicit revoke, old widget token refusal, expiry and two independent production-binary processes. A production-minted catalog → selector → draft → COMMIT chain exercises the real Gate 6/revoke/Gate 14 race, with the real disagreement metric observed both in-process and from binary stdout. Neither an owner answer nor a widget token is fabricated for that claim.

The current matrix still contains release blockers. A green writer test does not certify the current Maya release. HANDOFF STOP is preserved, and 9.6 is integration-owned. A combined carrier/backend candidate, canonical persisted user-turn identity, complete applicable fresh CI/mutations and the remaining release evidence are still required before any activation proposal can advance. Production execution would additionally require a separately reviewed unlock and exact owner execution authorization; neither is part of this checkpoint.
