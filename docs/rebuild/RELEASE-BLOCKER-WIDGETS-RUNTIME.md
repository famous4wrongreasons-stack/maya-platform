# 🔴 RELEASE BLOCKER — `widgets.runtime` may not be granted

> **Status: BLOCKING. Owner decision D3, 2026-09-29: STOP accepted.**
> `widgets.runtime` is not to be enabled, existing ratchets are not to be bypassed, and no
> out-of-band SQL is to be run. This document records why, so the question does not have to be
> re-litigated and cannot be answered by accident.
>
> **This blocks booking widgets only.** Chat presentation work proceeds; booking widgets stay
> fail-closed (owner decision D6).

---

## The finding

There is **no canonical release gate** for taking `widgets.runtime` from `planned` to enabled. The
canonical texts say the opposite of what a gate would say:

> `maya-saas-backend/src/common/feature-catalog.ts:46-48`
> *"MAYA widget runtime (K3, wave 2). Deliberately absent from every plan: the runtime is dark, and
> this key is how it stays dark. **Granting it to a tenant is a separate, later decision.**"*

No prerequisite list, no threshold, no approver, no procedure. There is nothing to execute.

## Why this is more than a missing document

**1. A blocking build ratchet forbids the flip itself.**
`maya-saas-backend/scripts/k3-gateway-check.mjs:634-643` computes `runtimePlanned` from
`/'widgets\.runtime':\s*defineReadiness\('planned'/` and fails unless it is true. The script exits 1
on any failure (`:664`) and runs blocking in `.github/workflows/platform-ci.yml:79`. Changing
`'planned'` to anything else turns Platform CI red, with no documented unlock.

**2. A second ratchet forbids writing the entitlement from any repository path.**
`k3-gateway-check.mjs:975-1019` scans `prisma/`, `scripts/`, `src/` and `test/` and fails on
*"&lt;file&gt; writes a TenantEntitlement row for widgets.runtime"*. There is no scripted, reviewable
activation the repository would permit.

**3. No write path exists at all.**
`features.controller.ts` exposes only `GET /features/registry`, `/features/add-ons` and
`/features/effective`. A grep over `maya-saas-backend/src` finds **zero** non-spec writes to
`tenantEntitlement`. `docs/rebuild/MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md:613` records it
plainly: *«писателя TenantEntitlement нет вовсе»*. The one writer in the repository,
`test/widgets-live/support/fixtures.ts:360`, calls `assertProofDatabase`, which refuses any database
whose name contains `prod`, `clone`, `maya_saas` or `postgres`.

**4. The written prerequisite is not discharged.**
`docs/rebuild/WAVE-6-PRE-CUTOVER-DETERMINATION.md:64` — *"the partial gates stand in front of an
effect path that does not exist yet. **They must be completed before one does.**"*
The FINAL audit (`docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json`) still holds
**31 clauses at `false`**: gate 6 (7), gate 7 (6), gate 8 (4), gate 8-R (1), gate 9 (1), gate 11 (1),
gate 12 (2), gate 13 (6), gate 14 (3). The certified headline is
**`GATES LIVE CONTRACT-COMPLETE 3/15 · WITH U-CLASS 6/15`**
(`docs/rebuild/WIDGET-GATE-WAVE-6-CLOSURE.md:72`). No document anywhere names a gate count at which
granting becomes permissible. Decision Sheet 07 is still **OPEN** on OD-3, OD-4 and OD-5.

**5. 🔴 The other fence is already gone.**
`.maya-program/mobile/RECOVERY-COMPLETE-20260929.md:15` — *"migrations | 102 applied, 0 pending
(three additive widget-layer migrations, 14 new tables)"*. The widget tables exist in the live salon
database. **The entitlement is now the only remaining fence** in front of a pipeline with 31 false
clauses.

**6. Granting it would buy nothing today.**
`docs/rebuild/WIDGET-GATE-WAVE-6-CLOSURE.md:120` — *"The current shell still defaults to
`createUnavailableSubmission()` and its network client deliberately has no `/widgets/intent`
endpoint."* Nothing would reach a user; the only effect would be removing the last fence.

## What would have to be true to revisit this

Not a checklist to work through opportunistically — the point of recording it is that **someone must
author the gate first.** At minimum:

1. A canonical release-gate document that names prerequisites, a threshold, an approver and a
   procedure, filed beside `WAVE-6-PRE-CUTOVER-DETERMINATION.md`.
2. An owner-authorized, reviewable write path for `TenantEntitlement` — not an SQL insert.
3. A documented unlock for `k3-gateway-check.mjs` checks 8 and the entitlement-writer scan, or an
   amendment to them that is itself certified.
4. The 31 false clauses discharged, or an explicit owner determination that a named subset suffices.
5. The six configuration prerequisites in `WIDGET-GATE-FBE2E-CLOSURE.md:1041-1053`.
6. A shell that can actually submit — `createUnavailableSubmission()` replaced and `/widgets/intent`
   wired — so that granting has an effect worth having.

## Consequence for the presentation carrier migration

Migration step **M7** (booking selectors as renderers) is **gated on this blocker** and is
fixture-only until it lifts. Steps M0-M6 and M8 are unaffected. Booking widgets remain fail-closed,
which is what owner decision D6 requires.
