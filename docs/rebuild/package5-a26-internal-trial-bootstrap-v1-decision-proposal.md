# Package 5 final remediation — ordinary internal trial bootstrap decision

Status: **PROPOSED — NOT APPROVED; runtime deployment STOP**

This is a remaining contract within A26 final remediation, not a new wave. The
approved D1 AI receipt schema and D2 CRM handoff A remain unchanged.

## Exact gap

The live public `POST /api/onboarding/trial` accepts `calendarSource=internal`
(also defaults to it for the solo-specialist industry) and calls
`InternalCalendarService.bootstrapEnsureProviderForUser` after creating its
owner. That helper directly upserts an InternalProvider bound to that existing
User and supplies initial availability. The ordinary trial path has no
test-only guard; self-serve signup is enabled in production.

The approved Wave 2 atomic TrialActivation contract creates tenant, first
branch, owner, membership and branding. Its implementation fixes
`calendarSource=external` and does not create an owner provider.

Existing commands cannot honestly substitute:

- A28 `create_internal_provider` creates a provider with `userId=null`.
- A26 `create_internal_provider_user` creates a **new** User/membership and
  rejects an already existing User identity. It cannot link the reserved
  bootstrap owner without duplicating or changing that identity.
- Choosing the first provider, directly assigning `userId`, or reviving the
  legacy helper would reintroduce the bypass.

D2 option A explicitly keeps **AI onboarding** CRM-only. It does not explicitly
retire ordinary internal trial signup. The undeployed external-mode candidate
therefore cannot be deployed as a complete fix by silently rejecting that mode.

## Recommended decision: preserve internal trial with an explicit atomic extension

Approve the following bounded extension of the pre-tenant TrialActivation
protocol for ordinary trial/admin initiators:

1. The server validates an explicit internal/external mode before claiming the
   activation. Existing callers default to the existing external contract.
2. In internal mode, the same serializable activation transaction additionally
   creates exactly one initial InternalProvider for the exact reserved owner
   and first branch, with a deterministic activation-derived provider id.
   Initial availability uses the existing internal-calendar default rules.
   No historical appointments, consent or provider facts are manufactured.
3. Tenant, branch, owner, membership, branding, provider, initial rules and
   completed activation commit together. Failure commits none; concurrent
   activation/retry returns one durable tenant/provider outcome.
4. No consumer may select an existing owner User/provider binding. No new User
   is created to imitate the owner, and no arbitrary staff linking is added.
5. After this initial atomic commit, provider/calendar/configuration changes
   remain existing governed canonical commands. Tenant hard delete remains
   forbidden. Existing suspension/recovery authority remains unchanged.
6. AI onboarding remains CRM-only under the approved D2 handoff A. Its receipt,
   schema, authority and child execution contracts do not change.

Existing InternalProvider/User/Branch/availability relations can represent this
bounded initial state. No additional model/column or new action class is
proposed. Approval is required for the **protocol scope**, not to invent schema.
The extension is not implemented at this checkpoint.

Alternative owner decision: explicitly make **all ordinary trial signup in
Chapter 6** CRM-only and retire the internal choice on every public/manual
surface. That would authorize a product capability restriction beyond D2's
AI-only boundary. It must not be inferred from the AI decision.

Before deployment, the resumed cycle must also finish the complete ordinary
trial DTO/caller compatibility review, including legacy plan selection under
existing Package 4 authority. This proposal does not authorize direct billing
assignment or silently redefine those contracts.

## Proof after a decision

For the recommended extension: exact same owner, one initial provider/branch,
atomic rollback, concurrent/restarted activation, changed/forged owner rejection,
preserved suspension, no direct post-tenant writer, no tenant delete, no external
provider write, and unchanged external/AI bootstrap baselines. Then finish
A18/A26/AI candidate validation, mandatory deployment gates, read-only production
verification and the complete 13-family final gate from the beginning.

```text
ORDINARY INTERNAL TRIAL PRODUCTION-REACHABLE: YES
EXISTING CANONICAL OWNER-PROVIDER BOOTSTRAP CONTRACT SUFFICIENT: NO
NEW BUSINESS/PROTOCOL DECISION REQUIRED: YES
ADDITIONAL SCHEMA PROPOSED: NO
NEW ACTION CLASS PROPOSED: NO
INTERNAL TRIAL PROTOCOL EXTENSION IMPLEMENTED: NO
PRODUCTION RUNTIME REMEDIATION DEPLOYED: NO
WAVE 7 CREATED: NO
```
