# H-2 — Personal-history configuration during an ordinary full trial

Status: OWNER DECISION REQUIRED; no product authority change implemented.
Date: 2026-10-12. This is independent of the local catalogue-refresh defect.

## Established facts

- The authorized local execution on `f7429380a9d92b2f710f2ca90f9da2a6d00d0282`
  imported 162 appointments. A read-only aggregate identified four appointments
  for the owner's one current verified personal Client link.
- The normally authenticated settings GET returned 403, `Exact active staff
  membership required`. No settings POST was attempted. A separate lifecycle
  observation during that session found a `trial` tenant, active owner
  membership and active User; this observation was not a fresh assertion of
  trial expiry/full-access eligibility.
- `GovernedSettingsReadService.actor` literally requires tenant status
  `active`. This is shared configuration authority, not a presentation error.
- `updateGoverned` checks `readPersonal` before admission and receipt disclosure.
  Therefore changing only the settings GET, or directly writing configuration,
  would not establish a valid canonical update path.
- Existing [R11/A22 decision](../../package5-remainder-e3-r11-decision-sheet.md)
  requires current owner and active exact tenant access. It does not explicitly
  settle ordinary full-trial access to this governed setting.
- [The C9 full-trial correction](../../MAYA-C9-TRIAL-PRINCIPAL-20261011.md)
  establishes current conversation-principal lifecycle only. It does not by
  itself authorize widening every A22 configuration namespace.
- Personal privacy consent succeeded separately (201, verified by status read),
  with marketing false. Consent does not replace the tenant capability setting.

## Question

May a current owner of an otherwise eligible, unexpired **ordinary full trial**
read and change the existing `client_capabilities.client_self_visit_history`
setting through the canonical A22 path?

## Option A — Allow only this existing setting for eligible full trials (recommended)

Apply to all ordinary tenants, without a founder-specific exception. Preserve
the existing active-tenant behavior. Add narrowly scoped full-trial eligibility
to the read and canonical command admission/execution/replay authority for this
namespace only. Use existing lifecycle meaning: `status=trial`,
`trialFullAccess=true`, valid future `trialEndsAt`; reread current authority.
This proposal does not assert that the retained tenant currently meets all
those conditions; execution must verify them.

Keep current allowed read roles, owner-only tenant writes, exact tenant/User/
Membership, feature/action policy, explicit confirmation, immutable input,
CAS/generation, audit and canonical Action Engine ownership. Retain verified
exact-Client checks and independent privacy consent for personal history.
Do not widen other tenant configuration or staff-preference namespaces.

Expired/setup-only/disabled trials, inactive/replaced membership, foreign
tenant, non-owner mutation, stale CAS and receipt replay after authority loss
must remain refused. Trial must not grant `widgets.runtime`, booking authority
or HANDOFF. No tenant status change, grant, new schema or migration.

Required proof: eligible full trial versus each refusal above through real
compiled HTTP/PostgreSQL and the existing A22 executor, including authority
changes between admission and execution; active-tenant regression and unchanged
other-namespace refusal. Synthetic proof first. A new real local execution
allowance would be separate, with the already-imported journal reused.

Consequence: a full-trial salon owner can explicitly enable this existing
personal-history capability, subject to the same remaining controls. This is
a product authority decision, not merely a local test-harness repair.

## Option B — Keep active-only governed configuration

Leave this setting inaccessible while the salon is `trial`. Use the ordinary
authorized lifecycle transition to `active` when appropriate; do not simulate
that transition with direct SQL, a test grant, or a founder exception. Retain
the imported local journal and verified personal link. History enablement in
AChat remains blocked until the existing authority prerequisites are met.

## Unchanged execution boundary

The previous live session was deliberately stopped, its allowance consumed.
No new provider read, reimport, production change, model request, SMS/message,
booking mutation or real Client binding is authorized by this packet.
The successful local import is not successful personal-history API/AChat
acceptance: the live private GET returned 500, separately reproduced and
addressed by the local catalogue-refresh work.
