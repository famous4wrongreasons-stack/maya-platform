<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 94fc7ae37283c7466afd210b6564521ac34d2209b37c3e6d266001fb38cf446d -->

# Controlled integration — required scope-isolation decision

Status: **STOP. Proposal only; not implemented or activated.**

Combined candidate: `4f479dce32e6e3595516447a5a6bf8cc6278528a`.

## Why the current release cannot be certified

AR-1 V1 accepts only `scope: full165.closed-input`, exactly 165 rows, each `L`, `L-T` or properly evidenced `U`. G6-6 and G13-R8 remain false under the accepted HANDOFF STOP. Even if the other 163 rows passed, V1 would refuse this candidate. Removing the two rows, submitting `STOP`, changing the scope string or adding an exclusion field also refuses. The executable proof is `prove-scope-boundary.cjs`; its fresh receipt is `receipts/scope-boundary.json`. Its all-L positive control is synthetic parser input, not a release attestation.

The restriction is not merely documentary. `WidgetsController` uses the boolean `widgets.runtime` entitlement for both widget routes. `WidgetReleasePolicy.allows` returns a boolean, with no effect/profile information. Gate 6 still admits registered HANDOFF destinations under their existing destination rules; `EffectRouterService` can route HANDOFF to `HandoffTargetSigner`. That signer produces an opaque destination handle; it is not a destination-owner receiving contract. There is no certificate-bound, all-ingress release profile excluding this branch. UI hiding, absence of a current emitter, or a mocked receiving surface cannot establish isolation.

The relevant sources and their exact hashes are in the boundary receipt. Global contract semantics, the two STOP rows and all existing authority gates remain unchanged.

## Decision requested

**Option A — approve a versioned, server-enforced release profile for this release. Recommended.** Implement the bounded contract below, then finish 9.6 and the remaining source proofs and run the complete certification programme. This approval would permit implementation and synthetic proof only. It would not issue a certificate or grant an entitlement.

**Option B — retain AR-1 V1 unchanged and keep release certification blocked.** The combined candidate can remain available for integration development. HANDOFF's destination-owner contract and its evidence would have to be settled in a separately authorized workstream before a full-165 certificate could be issued. This integration pass implements no HANDOFF endpoint.

There is no valid option to relabel HANDOFF as U, suppress those rows, or simply lower the V1 threshold.

## Exact minimum contract for Option A

1. **Version and evidence.** Keep V1 `full165.closed-input` unchanged. Add a separately versioned certificate/profile contract. It binds the full 165-row global audit digest, immutable server profile id/digest, candidate/build/carrier/registry/evidence/integration/FBE2E/revocation digests and existing exact tenant authorization. The global matrix continues to show G6-6 and G13-R8 as false/STOP. Report `CERTIFIED_FOR_PROFILE` separately from full-contract certification; the latter remains false.

2. **Finite release profile.** Define `closed-input.no-handoff@1` in reviewed server code, never as caller-selected exclusions. It explicitly denies HANDOFF and pins the allowed server template/effect/kind/capability/target combinations by registry digest. Unknown rows and future additions fail closed. Do not add free-text, scalar/date/time or normalizer inputs. This profile cannot exclude the seven remaining source-evidence duties or 9.6 by implication. Any further exclusion requires another owner decision and dependency proof.

3. **Threshold and dependency proof.** Enumerate every clause once. Only the two named HANDOFF-specific STOP duties can be outside this profile's applicable threshold, with a reviewed dependency map and executable exclusion proofs. Every shared and in-profile duty, including 9.6, must pass with the existing evidence class and OD-3 U duties. If dependency analysis shows an allowed path requires a HANDOFF duty, that path remains blocked; it cannot inherit the exclusion. Require the complete applicable fresh mutation/CI programme on the exact candidate.

4. **One server admission owner.** Extend the existing release-policy owner to resolve a verified, immutable profile view from the signed entitlement state. The boolean entitlement remains a coarse entry gate and is never sufficient to authorize an effect. Carry the same profile decision through the existing owner-port boundary; do not add a frontend entitlement evaluator or parallel authority service. The server resolves effect, template, target and capability from its sealed record, never submission fields.

5. **All ingress and egress.** Enforce the profile when minting an actionable envelope and when admitting its sealed intent. Cover `/widgets/intent`, typed Step-0 through `/ai/chat`, internal gateway callers, resolve/reprojection and proactive emission. Refuse excluded/unknown actions before Gate 9's user-turn write, token consumption, destination signing or owner dispatch. Add a final scope assertion at dispatch to catch bypasses. Keep all existing gate ordering, checks and reason vocabulary; use the existing canonical unavailable/refusal projection. Resolve must make an old excluded control non-actionable through canonical lifecycle/projection handling, without rewriting its historical sealed body. Specify that projection in the implementation design before changing any bytes; presentation semantics remain unchanged.

6. **Current-state and revocation.** Bind profile digest to the signed certificate, authorization, stored grant and audit/receipt through the existing certificate digest. Re-read the current candidate/profile/expiry under the existing release admission/revocation lock before an effect is admitted. Reject old-profile tokens after narrowing, replay, stale CAS, expiry and cross-tenant/profile substitution. Previously admitted effects retain the existing reconciliation contract. Revoke and status retain their existing exact-tenant/CAS/atomic-audit behavior. No automatic renewal, plan or trial grants; max 24 hours; production stays refused.

7. **Proofs required before profile certification.** Positive real-source booking create and normal permitted navigation; excluded HANDOFF via HTTP, typed chat, internal gateway and old stored envelope; forged/missing/unknown profile; new registry row; changed profile digest; cross-tenant/candidate certificate; concurrent revoke/expiry versus admission; zero signer/receiver/owner calls, user-turn writes and token consumption for excluded submissions. Kill mutants removing each scope fence, profile binding, registry totality, dependency threshold and revocation check. Existing global HANDOFF mechanism tests remain; no receiving endpoint is fabricated.

8. **Persistence.** Propose reuse of the signed entitlement `configJson` and canonical AuditLog payload, with no new table/column. This is a design proposal, not a claim that persistence changes are already approved. If executable design requires extra durable correlation beyond existing state, stop for the smallest additive schema decision before any migration.

## Consequence and next boundary

Option A separates a proven, restricted release from full-contract certification while retaining the global STOP. It does not establish that this candidate already satisfies the restricted threshold: 9.6 and seven evidence duties are still open. No production grant, deploy, real OTP, YCLIENTS effect, iPhone reinstall or Chapter 10 is authorized by either option.

This pass stops at the scope contract boundary requested by the owner. Read-only analysis, builds and existing diagnostic suites can establish the candidate's current condition; they cannot authorize the new scope or substitute for the complete post-implementation certification run.
