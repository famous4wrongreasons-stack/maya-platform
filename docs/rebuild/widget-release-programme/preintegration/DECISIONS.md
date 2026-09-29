# Final decision packet — pre-integration

No choice below has been made. These decisions do not authorize production activation.
Canonical basis: Decision Sheet 07; V1.2 settled OD-1 A and OD-2 C only. Historical ceiling figures in Sheet 07 are not a fresh computation.

## OD-3 — what does acceptance count?

**QUESTION:** Can the separately reported U-class denominator count toward acceptance for this cycle?

**OPTION A:** Accept U-class separately, only with all four absence/refusal/mechanism/basis duties. Preserve the strict live figure.

**OPTION B:** Accept only the strict live figure; retain U as disclosed, unaccepted partial coverage. This is Sheet 07's original option C.

**RECOMMENDED OPTION:** A, as in the existing sheet.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** A does not call an unreachable path live, waive a missing implementation, or enable a feature. B leaves the affected gates partial. Neither defines an activation threshold. The original option B (bring excluded carriers into scope) is a separate future contract programme, unavailable within this pass's ownership/scope; it is not presented as an immediate acceptance choice.

**WHAT IT UNBLOCKS:** The acceptance interpretation of the existing 17 U clauses and OD-4 B. It does not close any of the remaining false clauses.

**SCHEMA/MIGRATION IMPACT:** None for either current-cycle option.

## OD-4 — Gate 5 step-up/deep link

**QUESTION:** How should the unavailable conformant shortfall/step-up path be disposed of this cycle?

**OPTION A:** Approve a separate versioned route/response contract and P-12 package before implementation; specify the verifier, landing ingress and point at which a handle may be issued.

**OPTION B:** Accept G5-f as U this cycle under OD-3 A; retain the current code-only refusal and no early HandoffTarget issuance.

**RECOMMENDED OPTION:** B, conditional on OD-3 A.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** B preserves fail-closed refusal and exposes no new entry point. A cannot make Gate 5 strict merely by adding a route: the fitter still withholds an above-level intent and a changed principal fails earlier. Gate 13's handle must not be moved before Gate 6 destination checks.

**WHAT IT UNBLOCKS:** B resolves acceptance of G5-f. A authorizes a future security-contract design, not production activation or current-cycle strict proof.

**SCHEMA/MIGRATION IMPACT:** B: none. A: undetermined until the handle/persistence contract is approved; no migration is authorized or claimed necessary now.

## OD-5 — principal-dependent masking

**QUESTION:** Is current Gate 12 acceptance scoped to owner-shaped output, or must a principal-dependent masking carrier be introduced?

**OPTION A:** Approve a versioned composer-input carrier for principal-dependent masking; register narrowed rows only after isolation/leak proofs.

**OPTION B:** Accept owner-shaped output as the current scope. Keep principal-narrowed registrations unavailable.

**RECOMMENDED OPTION:** B for this cycle, as in the existing sheet.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** B does not treat unnarrowed tests as evidence about narrowed data and introduces no registration. A must prove that omissions/masks derive from the canonical owner and cannot leak through body, slots, facts or alternate tiers.

**WHAT IT UNBLOCKS:** B settles the interpretation of G12-R5; it is not a new runtime implementation. A enables a future narrowed-projector work unit after the carrier contract is signed.

**SCHEMA/MIGRATION IMPACT:** B: none. A: no DB migration follows merely from a typed carrier; persistent fields/retention, if required by the approved contract, need their own decision.

## SB-1 — owner self-booking

Read-only production observation found one unambiguous active tenant_owner, one Telegram identity, one active personal Client, one active CrmClientLink, and a matching V1 maya_user ClientChannelLink history. That link is **revoked**. There are zero active verified maya_user links and zero active ClientChannelLinks on that personal Client. Counts and read-only transaction proof are in `owner-identity.json`; no PII is included.

```text
SAME-HUMAN BINDING EXISTS: YES (explicit historical User/Client/link identity)
MISSING LINK: a currently active, canonically verified maya_user binding episode; the existing episode is revoked
EXISTING CANONICAL ROUTE CAN SUPPORT SELF-BOOKING: NO (for the current tenant_owner context)
CONTRACT DECISION REQUIRED: YES
```

Identity and authority are separate blockers. Re-verification alone would not authorize CLIENT-only widget/chat capabilities for tenant_owner. `audience=client` presentation/persona routing is not a grant of the canonical CLIENT policy. Business booking on behalf of another customer is excluded.

**QUESTION:** Which personal authority context should the same human use?

**OPTION A:** A separate verified client context, with explicit context selection, tenant scope, revocation revalidation and receipt actor identity; the business owner context stays distinct.

**OPTION B:** A dedicated narrow owner-self-booking capability bound only to that actor's verified Client. Its policy/receipt contract must be approved first; never accept a caller-selected Client id.

**OPTION C:** Keep self-booking refused in the owner context and use an independently authenticated CLIENT/CUSTOMER route. The revoked link must not be reactivated directly.

**RECOMMENDED OPTION:** A for the intended same-account experience; C is the existing separate-client route. No automatic role change, phone matching, relink or identity migration is proposed.

**EXACT SECURITY/PRODUCT CONSEQUENCE:** A/B require an approved authority contract and a new verified binding episode through its canonical owner. C changes neither owner privileges nor application contracts. Historical revocation remains immutable.

**WHAT IT UNBLOCKS:** Only an approved personal booking context; not widgets.runtime activation.

**SCHEMA/MIGRATION IMPACT:** Read-only proof and C: none. Existing tables support a new verified link episode; whether A/B need additional context/authority persistence is undecided. No migration is authorized.

## Remaining implementation and activation decisions

- **G6-6 / G13-R8 → OWNER_DECISION_REQUIRED:** destination registration, sensitive-target/floor checks and the HandoffTarget signer exist. A canonical receiving route and verification/lookup/replay contract do not. The current opaque HMAC alone does not define receiver authority. Specify the destination owner, current-principal/tenant checks, accepted carrier, expiry/replay semantics and handle-to-record lookup before implementation. No generic endpoint or schema is invented.
- **9.6 → IMPLEMENTATION_MISSING / PRESENTATION DEPENDENCY:** the certified same-writer requirement is clear, but typed chat and widget lowering still do not share a canonical persisted user-turn path. Establish the carrier conversation/turn identity with Claude before a backend unit; adding an independent mirror write would not prove byte identity. This pass does not change the carrier/runtime ports or choose a new conversation authority.
- **AR-1 remains STOP:** no approved activation envelope, threshold, approver, entitlement writer, rollback/revocation procedure or ratchet unlock. None is inferred from a higher gate count.
- **L5/L24, L25, L26:** respectively date/window/timezone ownership; tap-as-delivery lifecycle ruling; historical mutation-receipt admission/revocation policy. The new current evidence consumer checks green baselines without rewriting historical receipts.
