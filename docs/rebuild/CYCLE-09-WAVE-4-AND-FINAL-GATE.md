# Chapter 9 — Wave 4: P06 consumers, evaluation and the final gate

Date: 2026-09-14. Baseline: Wave 3 production release
[`20260914-c9-wave3-78ad0247`](CYCLE-09-WAVE-3-STRATEGY-AND-EXECUTION.md).
Authority: the approved D1–D16 and the combined mapping `cf05547b`. **No new product
decision was taken in this wave.**

## 1. Envelope — unchanged, measured

§15 allocates P06 `0/0/0/0/0`, and that is what shipped. The final gate measures the
envelope from the schema and the one migration rather than restating it:
**5 models, 123 physical fields, 1 migration, 0 backfills, 0 Action Engine classes,
1 AC6 class, 1 orchestrator, 4 canonical agents, 32 frozen surfaces.**

## 2. P06 — consumers, versioned bundles, offline evaluation

**Versioned reasoning bundles** (`c9.skills.ts`) are released code artifacts with immutable
digests — skill, prompt, model-config and evaluation-manifest hashes derived from released
content. No prompt text, secret or credential is stored in any row; there is no table for
one, and the final gate asserts the schema has none. A BI bundle cannot even express a
proposal (`maxProposedIntents: 0`).

**Consumer integration** (`c9.consumers.architecture.spec.ts`) fixes the carried
presentation defects as ratchets rather than as prose:

- the `.slice(0, 200)` silent cap (L05) may not reappear anywhere in C9; bounded arrays are
  **rejected** when oversize, never quietly shortened;
- every answer carries a full completeness envelope, and a `COMPLETE` claim with a missing
  total or a truncation is denied by the contract;
- native, web, chat, history and voice all resolve through **one** identity contract with
  exactly two principals, and no `userId` is fabricated for a Client without a Maya User;
- no C9 surface can express a contact list, a phone or an email at all;
- there is exactly one effect path, and the legitimacy of an effect attachment is the
  database's decision, not C9's.

**Offline evaluation** (`c9.evaluation.ts`) runs **110 cells** — 4 domains × 4 verticals ×
5 outcome contexts = 80 named, plus 30 adversarial cells, one per requirement — against the
production agent code with frozen synthetic inputs. Every cell asserts completeness,
mandatory missingness, grounding, the read-only boundary, prohibited capabilities and the
absence of any invented number. **All 110 pass, and one failure fails the corpus** — no
average can hide a single unsafe answer. It runs inside `c9.release.spec.ts`, so it is part
of the mandatory release gate rather than an optional script.

> **Recorded discrepancy, not silently resolved.** The approved mapping states
> "120 named scenario cells = 4 domains ×4 verticals ×5 outcome contexts", but those
> enumerated dimensions multiply to **80**, and the document enumerates exactly four
> verticals and five contexts. This corpus follows the **enumerated factorization**.
> Raising the named count to 120 would require inventing a sixth vertical or a sixth
> context — a product decision, which was not taken. The corpus artifact records this.

**Model-graded scoring is unavailable, and says so.** The mapping's 3-samples-per-cell
rubric needs provider calls; paid reasoning is closed because no price basis or cap is
configured. What is certifiable without a model — grounding, missingness, completeness, the
read-only boundary, prohibited capabilities, invented numbers — is certified in every
sample. This matches the mapping's own position that "deterministic integration tests
independently prove the actual effects/denials; passing a model transcript cannot certify
authority."

## 3. The final gate

`scripts/chapter9-final-gate.ts` — structural and offline, no database connection, no
production action. **10/10 PASS**
([receipt](evidence/chapter9-final/final-gate.json)).

| Gate | Measured |
|---|---|
| Q01–Q30 across exactly six packages and four waves | 30 / 6 / 4 |
| Frozen production surfaces | 32, none added or removed |
| Owner decisions | D1–D16, 16/16 |
| Envelope from schema + migration | 5 models, **123 fields**, 1 migration, 5 tables, 8 functions, 10 triggers, 11 RESTRICT, 0 CASCADE, 0 backfills |
| AC6 / Action Engine classes | 1 / 0 |
| Orchestrator / agents / reasoning tasks | 1 / 4 / 6 |
| Permanent ratchets present and colocated | 12/12, all matched by the existing `testRegex` |
| Offline evaluation corpus | **110/110** |
| Self-modification, self-initiation, online training | none: no `eval`/`new Function`, no cron/interval/timeout, no training path |
| Paid reasoning | DISABLED |

```text
ONLINE PEER TRAINING: NO
SELF-MODIFYING PRODUCTION AGENT: NO
C9 AUTONOMOUS SELF-INITIATION: NO
```

Every run still begins from an explicit, signed, expiring user request event, and the
database admits only `EXPLICIT_REQUEST` or an explicitly selected `SELECTED_OPPORTUNITY`.

## 4. Local gates

| Gate | Result |
|---|---|
| `prisma validate` | PASS |
| `npm run typecheck` / `typecheck:scripts` | PASS / PASS |
| `npm run lint` | PASS (0 errors) |
| `npm run build` | PASS |
| Mandatory backend regression (`jest --runInBand`, unfiltered) | **461 suites / 3878 tests PASS** (Wave 3 459/3864 + 2 new suites / 14 tests) |
| Gate runtime | certified Node **22.23.2**; production Node unchanged |
| P01 PostgreSQL proof | **27/27** |
| P02 PostgreSQL proof | **13/13** |
| Wave 3 three-scenario proof | **15/15**, 0 business/provider/message mutations |
| Chapter 9 final gate | **10/10** |

## 5. Production deployment and read-only verification

Release **`20260914-c9-wave4-7c9da983`**, all ten steps, exit 0.
[Transcript](evidence/chapter9-final/deployment.txt) ·
[verification](evidence/chapter9-final/production-verification.txt) ·
[chapter acceptance](evidence/chapter9-final/chapter9-acceptance.json).

| Production gate | Result |
|---|---|
| `migrate deploy` | `No pending migrations to apply.` |
| Applied / pending migrations | 99 / **0** |
| Drift | **NONE** |
| Health / readiness after cutover | `ok` / `ready` |
| Structural probe vs Wave 1 | **byte-for-byte identical**, 123 fields |
| Rows in the five C9 tables | **0** → production proof effects **0** |
| Coordination routes, unauthenticated | 401 |

```text
C9 WAVE 4 ENVELOPE CONFORMANCE: EXACT (0 models / 0 fields / 0 migrations / 0 actions / 0 AC6)
FINAL GATE: 10/10
EVALUATION CORPUS: 110/110
PRODUCTION RELEASE: 20260914-c9-wave4-7c9da983
PENDING MIGRATIONS: 0
DRIFT: NONE
HEALTH: PASS
READINESS: PASS
PAID REASONING: DISABLED
PRODUCTION EFFECTS: 0
WAVE 4: COMPLETE
CHAPTER 9: COMPLETE
```
