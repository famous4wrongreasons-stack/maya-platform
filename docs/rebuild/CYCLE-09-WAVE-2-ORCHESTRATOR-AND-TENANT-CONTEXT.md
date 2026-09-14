# Chapter 9 — Wave 2: P02 Orchestrator + BI, P03 conversational tenant context

Date: 2026-09-14. Baseline: P01 production release
[`20260914-c9-p01-336d270d`](CYCLE-09-P01-ORCHESTRATION-FOUNDATION.md), canonical branch
`codex/maya-brain-systemic-release-20260815`. Authority: the approved D1–D16 and the
combined mapping `cf05547b`. **No new product decision was taken in this wave.**

## 1. Envelope — unchanged, measured

Both packages are allocated **0 schema** by §15. That is what shipped:

| Approved for P02 + P03 | Implemented | Evidence |
|---|---:|---|
| New models | 0 | `schema.prisma` untouched in this wave |
| New physical fields | 0 | production field total stays **123** |
| Altered models | 0 | the A22 allowlist extension was already migrated in P01 |
| Migrations | 0 | no new directory under `prisma/migrations/` |
| Backfills | 0 | — |
| New Action Engine classes | 0 | — |
| New AC6 classes | 0 | still the single `expire_c9_orchestration_runs` |
| Canonical orchestrator / agents | 1 / 4 | `C9Orchestrator`; `ADMIN`, `CLIENT_LIFECYCLE`, `OCCUPANCY`, `BUSINESS_INTELLIGENCE` |
| Production surfaces | 32 frozen | no surface added or retired |

The one existing-owner extension P03 uses — the A22 namespace `c9_orchestration` — was
already part of P01's single migration; this wave adds its **semantics** only.

## 2. P02 — one Orchestrator, one executable specialist

`src/orchestration/c9.orchestrator.ts` admits a request, routes it, delegates and composes
one grounded answer. It is not an action engine, not a provider owner and not a business
fact owner.

- **Routing (Q01)** is a released table in `c9.contract.ts`, never a guess. An objective
  maps to at most two domains; an unmapped or simple request delegates to **nothing** and
  is answered by the coordinator alone, consuming no call. A tenant-tightened `domainsMax`
  wins over the table.
- **Delegation (Q19)** reserves one fenced `C9WorkReceipt` per read, claims it, builds the
  typed `C9Context@1`, runs the domain agent, then settles. An exhausted budget stops with
  an explicit `delegation_budget_exhausted`; it never truncates silently.
- **BI (Q12)** is the only executable domain in this package. It is read-only by three
  independent mechanisms: every registered BI capability has `mode: READ`, the database
  CHECK forbids `BUSINESS_INTELLIGENCE` + `OWNER_HANDOFF`, and `c9AgentResult` denies
  `bi_read_only` for any proposed intent. `ADMIN`, `CLIENT_LIFECYCLE` and `OCCUPANCY`
  return an explicit `domain_capability_not_activated` result rather than a fabricated one
  — their reasoning is P04.
- **Limited data (Q13)** is carried, not smoothed. A projection's own `completeness` and
  `qualification` decide the fact status; an unavailable C8 result yields
  `status: UNAVAILABLE` with the source's own reason codes, no finding and no number. An
  answer whose only evidence is unavailable is `UNAVAILABLE`, not "partial".
- **Explanations (Q26)** separate facts, policy, prediction and strategy. The response
  carries an explicit `boundaries` block (`factIsPrediction`, `strategyIsApproval`,
  `resultIsConsent`, `memoryIsPolicy`, `unknownIsFailure` — all `false`), the live budget
  state, and no raw identifier: source ids become per-run opaque handles.

### Paid reasoning stays closed

`c9.model.ts` is the only door to a paid call, and it is fail-closed exactly as D10
requires. `C9Allowance` reads a released price manifest and an explicit finite cap from
deployment configuration; **neither is configured in production**, so:

- the gateway returns `UNAVAILABLE: paid_capability_not_activated` without reserving
  anything and without invoking a provider;
- `C9WorkService.reserve` denies a `MODEL` receipt at the ledger for the same reason;
- the database guard coalesces an absent `aiCost.capMicros` to `0`, so any positive cost
  raises `c9_paid_cost_basis_required`.

No price was invented, estimated or defaulted anywhere. When an allowance is configured,
a reservation charges the **full** token bound plus every fee, rounded up, and reported
usage above its own reservation stops the run instead of being clamped.

## 3. P03 — conversational configuration that writes nothing

`src/orchestration/c9.policy.ts` defines the closed `maya.c9-tenant-context/1` payload and
`c9.policy.service.ts` performs the intake. The flow is: read current confirmed
configuration → type the extracted proposal → show the exact material diff → **stop**. The
owner confirms on the existing A22 `tenant_business_configuration` ingress, which stays the
single system of record. The intake service contains no create/update/delete of any kind.

- **Q08 / Q20** — a draft carries the exact `expectedRevision` and `previousRevisionId`, so
  a confirmation built on a stale predecessor is rejected by A22 rather than silently
  applied. An identical proposal produces `changed: []` and nothing is offered.
- **Q21** — all four verticals (`barbershop`, `beauty`, `dental`, `auto_service`) plus the
  generic `service_business`; a solo profile cannot be asked for branches it does not have.
- **Q22** — `URL != DATA ACCESS` is enforced structurally: a `reference_only` entry may not
  name a connector, an `existing_connector_ref` must, and there is no writable "verified"
  flag. A URL carrying userinfo, a fragment or a credential-shaped query is refused with
  `use_secure_surface`; `RAW SECRET IN LLM: FORBIDDEN` holds because credentials have no
  representable field here at all.
- **Q23** — a report preference carries only type, enabled, local hour, timezone source and
  scope. No recipient, device, channel order, cron or SQL is expressible, duplicates by
  report type are refused, and the existing `OwnerReportRun` owner keeps its own identity,
  so an already-admitted same-date report is neither regenerated nor re-routed.
- **Resource limits** confirmed by an owner are intersected with the released manifest at
  run admission and frozen there: a tenant may tighten a bound, never raise one, and may
  not fund paid work the release has not priced.

## 4. Local gates

| Gate | Result |
|---|---|
| `prisma validate` | PASS |
| `npm run typecheck` | PASS |
| `npm run typecheck:scripts` | PASS |
| `npm run lint` | PASS (0 errors) |
| `npm run build` | PASS |
| Mandatory backend regression (`jest --runInBand`, unfiltered) | **456 suites / 3837 tests PASS** (Wave 1 453/3804 + 3 new suites / 33 tests) |
| Gate runtime | certified Node **22.23.2**; production Node unchanged |
| P01 PostgreSQL proof (re-run unchanged) | **27/27**, `productionEffects: 0` |
| P02 PostgreSQL proof | **13/13**, `paidReasoning: DISABLED`, `productionEffects: 0` |

New permanent ratchets wired into the mandatory suite:
`c9.budget.spec.ts` (P02), `c9.context-and-bi.spec.ts` (P02/P06),
`c9.policy-and-sources.spec.ts` (P03), alongside the P01 five.

## 5. Production deployment and read-only verification

Release **`20260914-c9-wave2-b7ae4ddc`** deployed through the unchanged documented process,
all ten steps, exit 0. [Transcript](evidence/chapter9-wave2/deployment.txt) ·
[release acceptance](evidence/chapter9-wave2/release-acceptance.json) ·
[verification](evidence/chapter9-wave2/production-verification.txt).

| Production gate | Result |
|---|---|
| Pending migrations before and after | **0 / 0** — `No pending migrations to apply.` |
| Applied migrations | 99, unchanged by this wave |
| `migrate diff --exit-code` (drift) | **NONE** |
| `release-preflight` strict | PASS, `config: safe` |
| Package 4 / Package 5 PWA runtime guards | PASS / PASS |
| Port-3199 smoke on `/api/health/ready` | PASS — the new controller and module wiring boot cleanly |
| `/api/health` and `/api/health/ready` after cutover | `ok` / `ready`, `database: ready` |
| `journalctl -p err` over the following 2 minutes | `-- No entries --` |
| R01 live relay verification, before preflight and after cutover | PASS (42 entries, 10 active PHP, 16 blocked archives, 0 provider/message effects) |

The zero-schema envelope is not asserted, it is measured. The same structural probe run
against production returns a result **byte-for-byte identical to Wave 1**: 5 tables, 123
fields, 8 functions, 10 triggers, 5 PK + 12 UNIQUE + 46 CHECK + 11 FK all valid, 11
RESTRICT, 0 CASCADE, 25 indexes with the one partial UNIQUE — and still **0 rows in all
five C9 tables**, so **production proof effects remain 0**.

The coordination surface is present and authenticated, not open. Unauthenticated calls to
each route return `401`:

| Route | Unauthenticated |
|---|---|
| `POST /api/orchestration/request-identity` | 401 |
| `GET /api/orchestration/runs/:id` | 401 |
| `GET /api/orchestration/tenant-context` | 401 |

No new public or provider surface was added; the frozen 32 stand unchanged.

## 6. What this wave does **not** claim

- The `c9.route`/`c9.compose` model task keys exist and are budgeted, but **no model call
  is possible in production** — the answer is deterministic, and the response says so in
  `reasoning.reason`.
- The P02 executable proof leaves the C7/C8 reader boundary unwired, so it covers routing,
  delegation accounting, request identity, tenant isolation, cancellation and the paid-work
  denial. The grounded-answer shape over qualified projections is proved deterministically
  by `c9.context-and-bi.spec.ts` against the same production code; the projections
  themselves remain certified by the C7 and C8 suites. This is stated rather than implied.
- `POST /runs/:id/revisions` and `/review` from mapping §11 are **not** exposed yet: no
  strategy proposal exists before P04/P05, and a dead approval surface is worse than none.
- C8 remains `0/8` active. Nothing in this wave needs a numeric prediction.

```text
C9 WAVE 2 ENVELOPE CONFORMANCE: EXACT (0 models / 0 fields / 0 migrations / 0 actions / 0 AC6)
LOCAL GATES: PASS
POSTGRESQL PROOFS: P01 27/27, P02 13/13
PRODUCTION RELEASE: 20260914-c9-wave2-b7ae4ddc
PENDING MIGRATIONS: 0
DRIFT: NONE
HEALTH: PASS
READINESS: PASS
PAID REASONING: DISABLED
PRODUCTION EFFECTS: 0
WAVE 2: COMPLETE
```
