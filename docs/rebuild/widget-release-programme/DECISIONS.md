# Decisions required before a widgets release

Status: proposals only. No selection/approval is inferred from this implementation request.

## OD-3 — acceptance denominator

Canonical authority: Decision Sheet 07 §S7-3; V1.2 settled OD-1 A and OD-2 C only.

- A (recommended by the existing sheet): report strict live and live-with-U separately; U is admissible only with all four absence/refusal/mechanism/basis duties. This does not make U live evidence or itself authorize a release.
- B: bring excluded carriers/owners into scope with versioned contracts (phone/privacy, voice, approval lifecycle). Larger separate programme.
- C: accept only the strict figure; U remains partial. No shortcut to strict 15/15.

Decision requested: A/B/C and release acceptance scope. Current 3/15 strict, 6/15 with 17 U clauses is not an accepted production threshold.

## OD-4 — Gate 5 step-up / deep link

Canonical authority: Decision Sheet 07 §S7-4, K6/F53, P-12.

- B (existing recommendation, conditional on OD-3 A): keep G5-f U for this cycle, with absence proof. No early HandoffTarget issuance, no new route.
- A: version the route/response member and package P-12; require destination fences before any handle is accepted. Security review is required. Still cannot make the gate strict without conformant shortfall inputs.

Decision requested: B/A. No route or security handle is invented here.

## OD-5 — principal-narrowed data

Canonical authority: Decision Sheet 07 §S7-5, AMB-48(vi).

- B (existing recommendation): scope G12-R5 to owner-shaped output; keep principal-narrowed projector registrations unavailable.
- A: version an explicit composer-input carrier for principal-dependent masking, then prove narrowed projection and no leaks before registration.

Decision requested: B/A. Unnarrowed tests cannot be counted as proof of narrowed output.

## AR-1 — widgets.runtime activation contract (STOP)

The repository still deliberately forbids every production grant. Missing: canonical release envelope, threshold, accountable approver, activation owner/write path, audit/revocation/rollback semantics and approved ratchet amendment. OD-3/4/5 alone do not settle these.

- Full-envelope release: require closure/admitted disposition of every applicable clause and all intended carriers; then separately approve a canonical entitlement command and revised guards.
- Bounded booking release: owner names exact capabilities, principals, tenants, carriers, clause subset and explicitly excluded mechanisms; security review must prove that excluded paths remain unreachable. Only then implement the entitlement owner and executable prerequisite checks.
- Remain dark: continue fixture-only proof under the current gates.

No implementation of a production grant is safe to infer now. Planned/readiness and writer ratchets are unchanged. No SQL, configuration toggle or migration is proposed as an escape. No production action is part of this branch.

## SB-1 — same-human tenant_owner self-booking (STOP)

Code facts: `User`/Membership is not `Client`; a verified `ClientChannelLink` is required. `ClientAppointmentCreateService.resolveAccount` resolves active membership plus tenant-scoped `maya_user` subject hash and verification/subject version 1. It does not derive Client from a phone/name. `ai-tool.catalog.ts` deliberately restricts own create/reschedule/cancel to CLIENT/CUSTOMER. Login/social identity alone proves neither Client identity nor booking authority.

A low-level resolver accepting an active owner account with a verified link is not an approved owner chat/Action-Engine policy. Actual production Client/link presence is UNVERIFIED in this branch: no production DB was queried, and fixture accounts are not evidence about the owner. Readiness must eventually be checked by a canonical privileged read that returns booleans/counts, not PII.

- A: define a separate same-human client context backed by a verified maya_user link, with explicit selection and revalidation, preserving owner business authority separately. Specify policy admission, receipt actor identity, revocation, tenant scope and ambiguity refusal before code.
- B: define a narrow owner-self-booking capability with its own policy mapping and exact verified Client binding. It must never accept another Client id or grant business booking-on-behalf authority.
- C: keep owner booking refused; use an independently authenticated CLIENT/CUSTOMER account through the existing supported route.

Decision requested: intended same-human product route A/B/C; approve the authority contract before implementation. `TENANT_OWNER != CLIENT`, CLIENT_ROLES unchanged. No phone matching, automatic relink, impersonation, or customer-on-behalf booking.

## Additional bounded policy/dependency decisions

- L5/L24: the selector's fixed tomorrow/UTC window has no agreed tenant-local search-window owner contract. A generic timezone fix alone would preserve an invented product window. Specify the owner of date/window/timezone, empty-window expansion and slot labels; then implement it in that owner and consume the result.
- L25: decide whether a legitimate tap is accepted delivery/render evidence for the selector lifecycle or require separate observation. Do not revise lifecycle authority opportunistically.
- L26: decide how existing red/missing-baseline historical receipts are invalidated or recertified before changing the historical audit admission policy. New local programme receipts must have a green baseline regardless.
- L2: adding Prisma generation can repair a workflow step, but making the historically advisory Widget Contract workflow blocking changes release acceptance. This requires a workflow/acceptance owner ruling; a green advisory badge is not a passing gate.
