# Fixed release profile — implementation design

Owner decision: Option A, `closed-input.no-handoff@1`. Implementation and synthetic/adversarial proof only. No production authorization.

## Certificate and threshold

The V1 `full165.closed-input` parser, its 165-row threshold and existing AR-1 writer remain. V2 uses a distinct contract `maya.widget-release-profile-certificate/2`, `CERTIFIED_FOR_PROFILE`, a reviewed fixed manifest, and the complete global matrix digest. Only G6-6 and G13-R8 must have STOP in V2. They remain globally false, never U or L. The other 163 duties retain the existing L/L-T/U evidence validator, including all four OD-3 U duties. 9.6 and the seven open source duties cannot be omitted or marked STOP. No release attestation is issued by this implementation.

The signed certificate binds candidate/build/carrier/registry/evidence/integration/FBE2E/revocation and new isolation/dependency digests. Exact-tenant signed authorization already binds the certificate digest. The stored signed command and its canonical AR-1 audit therefore carry the same profile binding. Status labels a V2 grant `CERTIFIED_FOR_PROFILE` and `fullContractCertified: false`; it never calls it a full-contract certificate.

## One admission owner and existing durable state

WidgetReleaseAccessService is part of the existing entitlement owner, exported only through the widget owner-port boundary. It reads the current signed state using the AR-1 shared tenant admission lock and the database clock. AR-1 grant/revoke retain their exclusive lock, exact tenant, CAS, atomic TenantEntitlement + AuditLog, max 24h, no renew/trial/plan grant and production refusal.

The fixed manifest pins the current whole registry digest and every allowed template/effect/kind/capability/target/input-schema combination. Successor C9 keys are a finite reviewed snapshot. There is no caller profile selector, exclusion list or generic profile registration. New registry rows refuse until reviewed code and certificate agree. The existing HANDOFF destination authority readers and global contracts are unchanged.

At mint, the same transaction creates an immutable AuditLog `widget.release.emission_binding` for each token and inserts the emission/record/render receipt. The binding contains the exact current grant generation, certificate/profile digests, server template key and immutable record-facts digest. Admission requires exactly one matching canonical audit binding. Missing, altered or duplicated bindings fail closed. V1 historical tokens have no V2 binding and cannot gain V2 admission. A revoke/regrant cannot revive an old token even when timestamps coincide. No table or column is added; existing AuditLog retention can only withdraw admission by deleting evidence, never restore it.

## Ingress, cached egress and unavailable projection

- Mint, including proactive and successor mint, converges on the existing emitter and its atomic release binding.
- HTTP intent, typed Step-0 and internal submissions retain Gates 1–14 ordering. Gate 6 first runs its existing authority check and then the same current release admission in the existing request transaction. Refusal precedes Gate 9 user-turn persistence, consumption and dispatch.
- The effect router checks current admission before destination resolution (and therefore before HANDOFF signing), claim or owner invocation. It opens no parallel authority path.
- Resolve and stored NAVIGATE inspect every intent in an envelope. An excluded or stale envelope is omitted/returns unavailable through the existing projection. Its frozen historical body, seal and terminal receipt are not rewritten; no false cancellation or replacement confirmation is fabricated. This is the unavailable-projection choice used by the implementation, not a new presentation state.
- Cached completed-read replay, expired/predecessor remedies, booking-selector successors and linked-successor replay each recheck current admission before returning an old actionable envelope.

Admission is the existing synchronization boundary: a revoked grant denies later admission. Work already admitted retains the existing reconciliation contract. No transaction lock is held across business owner I/O, preserving D1/PR9b.

## Dependency map

| Duty | Profile dependency | Executable obligation |
|---|---|---|
| G6-6 | HANDOFF destination ingress only; no allowed effect needs a destination receiver | HANDOFF refused at HTTP/typed/internal Gate 6 before any user turn; all mixed controls unavailable |
| G13-R8 | HANDOFF target/signing/receiver only | Final dispatch refusal precedes signer, token claim and any owner effect |
| Other Gate 6/13 duties | Mandatory for the permitted branches | Existing ordering, owner checks, binding, stale/revoke/expiry negatives; production-source booking proof |
| 9.6 | Mandatory | Same canonical persisted ordinary-typed/widget user-turn writer; remains open until actual combined proof |
| G7-5/G7-BOOK1/G11-I9/G13-I3 | Mandatory | Initial appointment-specific cancel/reschedule source and paired production HTTP/BIN proof; create alone is insufficient |
| G12-R1b/G12-I11/G13-R2 | Mandatory | Real source detail/w navigation with current retained-source read and carrier result; Gate 6 admission alone is insufficient |
| All remaining duties | Mandatory with inherited evidence class | Exact 165-row inventory; no additional exclusion or implicit U; fresh full applicable certification required |

The approved two-duty exclusion does not discharge an allowed path that depends on an unavailable source or receiving owner. Positive normal navigation and the eight remaining applicable duties remain release blockers. The synthetic all-green certificate fixtures are parser/admission controls, never current release evidence.

## Verification and scope

`widget-release-profile.contract.spec.ts` checks exact global inventory, registry snapshot, mandatory 9.6/source duties, U obligations and V1 separation. Access tests check signed current state, immutable bindings, unknown/future registry, tampering, replay/regrant, expiry and revocation. `profile-isolation.live-spec.ts` uses the real HTTP writer and a guarded local PostgreSQL database to test ingress/dispatch/mint/resolve/refusal, atomic rollback, concurrency and actual production-source internal-calendar booking. Cache/successor tests exercise the additional stored-envelope exits. `gatePI.json` and `gatePI-contract.json` declare 22 fence, binding, threshold and concurrency mutants. Receipts distinguish focused diagnostics from complete CI certification.

No HANDOFF receiver, schema migration, frontend evaluator or presentation rewrite. No production grant/deploy/write, real OTP, YCLIENTS effect, iPhone reinstall or Chapter 10.

## Local proof checkpoint

The pre-commit implementation passed 584 backend suites / 5581 tests and 31 widget-live suites / 385 tests on an isolated PostgreSQL database. All 22 new profile mutants were killed by declared checks (16 focused unit and 6 focused live); these restricted diagnostic runs are not the complete mutation certification. All 480 current mutation anchors validate. Fresh final-candidate certification remains mandatory.

Historical direct-mint fixtures now explicitly obtain their guarded test entitlement before mint. Missing-entitlement negatives still remove it before the request. The old canonical-owner revocation-race proof uses an ephemeral local-only PostgreSQL trigger to pause the production token claim after the new admission boundary, then revokes through the existing lock. The trigger changes no row values, is restricted to the fixture tenant, and is removed in finally. This is proof scheduling only: no production migration, new application column or durable transport.
