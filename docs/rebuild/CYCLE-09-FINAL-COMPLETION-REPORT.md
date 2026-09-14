# Chapter 9 — final completion report

Date: 2026-09-14. Canonical branch `codex/maya-brain-systemic-release-20260815`.
Approved baseline: combined mapping `cf05547b`, preflight `b9402e39`, C8 checkpoint
`bae6620c`, owner decisions **D1–D16 16/16**. Chapter 6, 7 and 8 remain COMPLETE and
unmodified.

## 1. Waves and production releases

| Wave | Packages | Release | Gate |
|---|---|---|---|
| 1 | P01 | `20260914-c9-p01-336d270d` | 453 suites / 3804 tests; PostgreSQL proof 27/27 |
| 2 | P02 + P03 | `20260914-c9-wave2-b7ae4ddc` | 456 / 3837; P02 proof 13/13 |
| 3 | P04 + P05 | `20260914-c9-wave3-78ad0247` | 459 / 3864; three scenarios 15/15 |
| 4 | P06 + final gate | `20260914-c9-wave4-7c9da983` | 461 / 3878; final gate 10/10 |

Every wave deployed through the unchanged documented process, all ten steps, exit 0.

## 2. Envelope — measured, never asserted

| Approved | Delivered | How it was measured |
|---|---:|---|
| NEW MODELS | **5** | `schema.prisma` and production `information_schema` |
| NEW PHYSICAL FIELDS | **123** | 28+27+26+16+26, counted in the schema, in SQL by the P01 proof, and read back from production |
| ALTERED MODELS | **2** | `Tenant` reverse relations (0 columns); the A22 CHECK allowlist extension (0 columns) |
| MIGRATIONS | **1** | one directory, `20260913160000_chapter9_orchestration_foundation` |
| BACKFILLS | **0** | no `UPDATE`/`INSERT` over any non-C9 table in the migration |
| NEW ACTION CLASSES | **0** | — |
| NEW AC6 CLASSES | **1** | `expire_c9_orchestration_runs`, policy `chapter9.orchestration-retention` v1 |
| CAPABILITY REGISTRY | HYBRID | released code manifest + persisted `registryHash` only |
| ORCHESTRATOR / AGENTS | **1 / 4** | ADMIN, CLIENT_LIFECYCLE, OCCUPANCY, BUSINESS_INTELLIGENCE |
| PRODUCTION SURFACES | **32** | frozen manifest, none added or removed |
| REQUIREMENTS / PACKAGES / WAVES | **30 / 6 / 4** | frozen manifest checked against code by the final gate |

Waves 2, 3 and 4 added **no schema at all**. Production confirms it rather than the reports
claiming it: `migrate deploy` reported "No pending migrations to apply", applied stayed at
99, drift stayed NONE, and the structural probe returned a result **byte-for-byte identical
to Wave 1** on every subsequent release.

## 3. Permanent architectural boundaries — how each is held

| Boundary | Mechanism |
|---|---|
| `ORCHESTRATOR != ACTION ENGINE` | 0 new Action Engine classes; C9 attaches to receipts, never creates them |
| `ORCHESTRATOR != PROVIDER OWNER` | no `fetch`/`axios`/URL in any C9 production file (ratcheted per file) |
| `ORCHESTRATOR != BUSINESS FACT OWNER` | no C9 FK into any source; every fact is a live qualified projection |
| `AGENT != ACTION OWNER` | agents propose typed intents; only the reviewed owner-handoff step can bind |
| `AGENT != SYSTEM OF RECORD` | five derived tables, `ON DELETE RESTRICT` ×11, 0 CASCADE |
| `AGENT MEMORY != BUSINESS STATE` | `C9Context@1` marks conversation `authority: NONE`; notes are untrusted |
| `STRATEGY != PLAN != ACTION` | Run → Revision → Step → Binding, each with its own identity and guard |
| `STRATEGY APPROVAL != BLANKET EFFECT AUTHORITY` | `c9_effect_binding_requires_reviewed_handoff`: an accepted review still cannot fabricate an effect |
| `OWNER APPROVAL != CLIENT CONSENT` | C8 ranking strips members; `contactPermission`/`actionAuthority` false |
| `UNKNOWN != FAILED` | UNKNOWN holds the same receipt, blocks only dependents, is reported as unknown |
| `C8 DISABLED PREDICTION != LLM GUESS` | 0/8 still 0/8; no arithmetic and no predict/forecast path in agent or strategy |
| `CHAT HISTORY != POLICY/APPROVAL` | A22 remains the only confirmed-configuration owner; intake writes nothing |
| `C9 != AUTONOMOUS SELF-INITIATION` | no cron/interval/timeout anywhere; every run starts from a signed expiring user event |

## 4. Proof inventory

| Proof | Result |
|---|---|
| P01 PostgreSQL (`chapter9-foundation-proof.ts`) | **27/27**, production effects 0 |
| P02 PostgreSQL (`chapter9-p02-proof.ts`) | **13/13**, paid reasoning DISABLED |
| Wave 3 three mandatory scenarios (`chapter9-wave3-proof.ts`) | **15/15**, business/provider/message mutations **0** |
| Chapter 9 final gate (`chapter9-final-gate.ts`) | **10/10** |
| Offline evaluation corpus | **110/110** cells, inside the mandatory suite |
| Mandatory backend regression | **461 suites / 3878 tests** |
| Permanent C9 ratchets | 12, all colocated and matched by the existing `testRegex` |

## 5. Cost safety

No price basis and no cost cap are configured in production, so **paid reasoning is closed**
and the system says so in its own answers (`reasoning.reason: paid_capability_not_activated`).
The closure is enforced three times over: the gateway declines without reserving, the ledger
denies a MODEL receipt, and the database coalesces an absent cap to zero. No price was
invented, estimated or defaulted anywhere. Deterministic zero-charge work continues, which
is the approved D10 fail-closed branch rather than a degraded mode.

## 6. Stated limitations

These are recorded because they are true, not because they were required:

1. **The C7/C8 reader boundary is unwired in the executable proofs.** Domain reasoning over
   qualified projections is proved deterministically by the permanent specs against the same
   production code; the projections themselves remain certified by the C7 and C8 suites.
2. **Model-graded scoring is unavailable.** The mapping's 3-samples-per-cell rubric needs
   provider calls, which are closed. Everything certifiable without a model is certified in
   every sample.
3. **The evaluation corpus has 110 cells, not 150.** The approved mapping states 120 named
   cells but enumerates dimensions multiplying to 80. This corpus follows the enumerated
   factorization (80 named + 30 adversarial). Raising it would require inventing a sixth
   vertical or context — a product decision that was not taken.
4. **`POST /runs/:id/revisions` and `/review` were added in Wave 3**, not Wave 2, because no
   strategy proposal existed before P04/P05 and a dead approval surface is worse than none.
5. **The chat-first UX direction is not implemented.** It was explicitly out of scope: no
   existing native/PWA mode or tab was removed, the C9 envelope was not widened for it, and
   nothing in P06 forecloses it.

## 7. Final answers

```text
CHAPTER 9 COMPLETE: YES
REQUIREMENTS: 30/30
PACKAGES: 6/6
WAVES: 4/4
PRODUCTION SURFACES: 32/32 FROZEN
OWNER DECISIONS: 16/16
NEW MODELS: 5    NEW PHYSICAL FIELDS: 123    ALTERED MODELS: 2
MIGRATIONS: 1    BACKFILLS: 0    NEW ACTION CLASSES: 0    NEW AC6 CLASSES: 1
CANONICAL ORCHESTRATOR: 1    CANONICAL AGENTS: 4
PENDING MIGRATIONS: 0    DRIFT: NONE    HEALTH: PASS    READINESS: PASS
PAID REASONING: DISABLED
ONLINE PEER TRAINING: NO
SELF-MODIFYING PRODUCTION AGENT: NO
C9 AUTONOMOUS SELF-INITIATION: NO
BUSINESS/PROVIDER/MESSAGE MUTATIONS FOR PROOF: 0
PRODUCTION EFFECTS: 0
C10: NOT STARTED
```
