# Ideas — source review, no new authority

Scope: source inspection on the task-actions candidate; no reader or plan writer was added here.
This is a map of existing owners, not a new architecture or approval.

| Existing source | What is present | Boundary for the supplied design |
| --- | --- | --- |
| `src/inbox/dto/inbox.dto.ts`, `src/communication-delivery/communication-delivery.service.ts` | `growth_plan` taxonomy and governed reports/briefings capability | A notification type does not establish a fresh Ideas feed or permission to contact clients |
| `src/widgets/proactive/moments.ts` | `mt.growth_plan@1`: period/headline, `c8.result.read` owner | Preserve server envelope/freshness; the template is not a free-form action plan |
| `src/valuation/c8.controller.ts`, `c8.read.ts` | GET `/analytics/valuations`, GET `/analytics/valuations/:id`; current tenant/principal access, references, expiry, explanations | Existing read source for an informational surface; not a claim that every value is an actionable recommendation |
| `src/valuation/c8.opportunity.contract.ts` | C8 opportunity evidence with policy/model/source digests and expiry | `c8AssertOpportunityBranch` requires `inform_only`, no `proposedActionIntent`, only `read_valuation_result`; execution cannot be invented by frontend |
| `src/opportunities/opportunity.lifecycle.ts` | Persisted opportunity/AgentTask lifecycle | AgentTask is not the personal A23 OperationalWorkItem; IDs/authority must not be interchanged |
| `src/package5-wave1/operational-work.controller.ts` and canonical cutover | Manual personal A23 task create/complete, now connected to UI | A manually entered task does not prove an Ideas source-to-task mapping or approve sending invitations |

Prototype `03-ideas.png` / `12-action-plan.png` contains free-slot suggestions,
matched-client claims, plan steps and invitation text. None of those claims was copied
as live salon evidence. No model call or invented recommendation was added.

Next bounded work: choose the exact existing read shape and server-authored kinds to
present from C8, prove stale/unavailable/current-principal cases, then connect the
read-only Ideas surface. Before implementing a plan-to-task action, establish the
canonical server-owned source/intent/receipt binding; do not treat a rendered string,
Inbox payload or AgentTask ID as execution authority. No generic plan/strategy policy,
messages, C10 or automatic activity are authorized by this source review.
