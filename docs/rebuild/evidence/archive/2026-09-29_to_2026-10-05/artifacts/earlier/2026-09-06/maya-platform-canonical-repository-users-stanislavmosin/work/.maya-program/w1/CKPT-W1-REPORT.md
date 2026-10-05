<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 07c8bfb8bd9a207f91e83c63d766523c2fbc71cd46e8bc8667edc924e9b7a68b -->

# CKPT-W1 — Wave 1 close report

> **Provenance of this file.** The task directed me to *append* §5 to an existing
> `CKPT-W1-REPORT.md` that closed at HEAD `2720435e`. That file did not exist. A
> filesystem-wide search (`find` over `/private/tmp`, `/tmp`, `/var/folders` and
> `/Users/stanislavmosin`, exit 0) returned no `CKPT-W1-REPORT.md` and no
> `GATES-PLAN-V11.md`; every sibling session scratchpad was empty, and this session's
> scratchpad held only a one-line `PROGRAM.md`. **§1–§4 are therefore absent and were
> not reconstructed** — inventing them would fabricate the record of the seven review
> fixes. This file exists to carry §5 and nothing else. §1–§4 must be recovered from
> the session that wrote them, or re-derived, before this report is treated as whole.
>
> The same loss removed `GATES-PLAN-V11.md`, so **§0.5 evidence rules, §2.5 regression
> checkpoints and §2.6 could not be read.** The gate set below is the one enumerated in
> the task text, not one verified against §2.5. Where §2.5 requires something the task
> text did not spell out, it was not done, and I cannot say what that is.

---

## §5 — closing regression on the final HEAD (01240ce1)

**Scope.** The §2.5 closing regression on the final Wave 1 HEAD, which `01240ce1`
("re-anchor M7-8…") had left unclosed after the previous integrator died on a network
error.

**HEAD at start:** `01240ce1`. **HEAD at end:** `3c5081ae` — one commit added by this
phase, the runner fix required by known open item (c) (§5.4). Tree clean throughout;
nothing pushed (29 commits remain unpushed on `codex/maya-identity-consent-20260913`).

**Where each gate ran.** The export-safe set ran in a fresh **D-13 whole-commit export**
(`git archive HEAD | tar -x`, `node_modules` symlinked) at
`…/p6-gates/w1/export-3c5081ae`, verified byte-identical to the HEAD blob. The gates that
need git (wave-2…5, final-figures) ran in the working tree. Every exit code was read
directly from `$?`; no pipe stands between a gate and its rc. Logs: `…/p6-gates/w1/logs/`.

> ⚠️ **§5 was written at `3c5081ae`, before this phase's verification. Two of its conclusions
> are superseded: row 15 / §5.3(d) (the wave-2 gate — see §12) and rows 8–9 (`test:widgets:live`
> and `test:widgets:http`, BLOCKED there, GREEN on the final HEAD — see §8.1). It is kept
> unedited apart from those two markers.**

### §5.1 Result table

| # | Gate | Where | rc | Result |
|---|------|-------|----|--------|
| 1 | `npm test` | export + tree | **0** | 530 suites / 5020 tests passed |
| 2 | `npm run typecheck` | export + tree | **0** | — |
| 3 | `npm run typecheck:scripts` | export + tree | **0** | — |
| 4 | `npm run typecheck:widgets-live` | export + tree | **0** | — |
| 5 | `npm run lint` | export + tree | **0** | — |
| 6 | `npm run build` | export + tree | **0** | — |
| 7 | `k3-gateway-check` | export + tree | **0** | 10/10 structural checks |
| 8 | `npm run test:widgets:live` | tree | **1** | 🔴 **BLOCKED** — proof DB absent at run time (§5.5) |
| 9 | `npm run test:widgets:http` | tree | **1** | 🔴 **BLOCKED** — same cause (§5.5) |
| 10 | `run-all-checks.sh` | tree | **0** | every section pass (incl. f88, k1 signature, enum/member, emit-f88) |
| 11 | `k3-exit-gate.sh` | tree | **0** | K3 EXIT: PASS |
| 12 | `k4-exit-gate.sh` | tree | **0** | K4 EXIT: PASS |
| 13 | `k5-exit-gate.sh` | tree | **0** | K5 EXIT: PASS |
| 14 | `k6-exit-gate.sh` | tree | **0** | K6 EXIT: PASS |
| 15 | `wave-2-final-gate.sh` | tree | **0** | ⚠️ **SUPERSEDED BY §12** — recorded YES here; it is **rc=1, NO** on the final HEAD, reproducibly |
| 16 | `wave-3-final-gate.sh` | tree | **0** | WAVE 3 COMPLETE: YES |
| 17 | `wave-4-final-gate.sh` | tree | **0** | WAVE 4 COMPLETE: YES |
| 18 | `wave-5-final-gate.sh` | tree | **0** | WAVE 5 COMPLETE: YES |
| 19 | `final-figures.mjs` | tree | **0** | — |
| 20 | `gate-audit-check.mjs` | tree | **0** | PASS — schema /2, 15 gates, **165 clause keys equal to the inventory**, contract `606d7f99da5f` |
| 21 | `gate-audit-check.mjs --self-test` | tree | **0** | PASS — 4 positives, 14 negatives, each red for its own rule |
| 22 | `contract-version-record-check.mjs` | tree | **0** | 14/14 version-record checks |
| 23 | `widget-contract-check.mjs` | export + tree | **0** | 31/31 checks, 4 pending on a later package |
| 24 | `f88-mutation-battery.sh` | export + tree | **0** | ALL MUTATIONS CAUGHT — every arm load-bearing |
| 25 | **Runner load validation, all batteries** | export + tree | **0** | **19 batteries, 203 mutants**, every `find` anchor resolves exactly once |
| 26 | **19 declared mutation batteries (203 mutants), serialized** | — | **n/a** | 🔴 **NOT RUN** (§5.5) |

**Comparison against §2 of this report:** not possible — §2 was lost with the file, so
there are no prior numbers to difference against. The two figures that can be checked
against an independent record both agree with commit `3da48069`'s message: *"All 19
declared batteries, 203 mutants, dry-run clean"* and *"`npm test` 530/530"*.

### §5.2 Clause immutability — GREEN

`gate-conformance-audit.json` and `gate-clause-inventory.json` are **byte-identical** at
`4da8954f`, at HEAD, and in the working tree — identical blob SHAs, so no clause can have
flipped:

| File | blob at 4da8954f = HEAD = worktree |
|---|---|
| `gate-conformance-audit.json` | `fbdb1efecec458b787a73c6487911ea6c88bfdeb` |
| `gate-clause-inventory.json` | `42616b3a99569e890778fb3b70a6ab202a7473e6` |

Independently corroborated by `gate-audit-check` (item 20): 165 clause keys equal to the
inventory, headline recomputed.

### §5.3 Known open items

**(a) "gate 7's battery never ran" — SETTLED, and the report's claim was indeed false.**
The cause is **not** a runner defect but a **dead `find` anchor**: `8cee26ba` gave
`findProducingRecord` a third parameter and made it read through the request transaction
`(tx ?? this.prisma)`, which left `gate7.json#M7-8`'s anchor resolving 0 times. The load
path's `simulate` check caught it and exited **2**, aborting the whole 35-mutant shard —
loudly, as designed. `01240ce1` re-anchored it. Verified at HEAD: `--gate 7 --dry-run` is
rc=0 with 35 mutants, and the no-`--gate` dry-run over all 19 batteries is rc=0 with 203
mutants (item 25). This is the same failure mode as review finding 6 (P-PRINCIPAL), one
file over.

**(b) "~21 mutants not at their declared status" — NOT SETTLED.** Declared status can only
be compared against *observed* status by executing the mutants, which did not happen
(§5.5). What is now established is the declared baseline, from the load validation:

| | live-killed | build-killed | pending | equivalent | total |
|---|---|---|---|---|---|
| declared across 19 batteries | 87 | 113 | 3 | 0 | **203** |

**(c) "one reproducible runner defect" — a genuine defect was found, fixed and proven;
whether it is *the* one that produced the ~21 mismatches is unverified.** See §5.4.

**(d) "a suite failed to run / WAVE 2 COMPLETE: NO" — ⚠️ SUPERSEDED BY §12. It DOES
reproduce; the paragraph below was written before it did, and its conclusion is wrong.
§12 names the cause (a SIGSEGV worker kill), shows it does not predate the wave, and assigns
it. The rest of this paragraph is kept as written, because a record of what was concluded and
when is the point of a checkpoint report.**

**(d) [as written at `3c5081ae`] — DOES NOT REPRODUCE on the final
HEAD.** `wave-2-final-gate.sh` is rc=0, "WAVE 2 COMPLETE: YES", mandatory regression PASS
5020 passed; waves 3, 4 and 5 are likewise YES, and a standalone `npm test` is 530/530 in
both the export and the tree. The gate prints NO via its `Suites: N failed` branch — a
suite that *failed to RUN*, not a failing assertion. I could not reproduce that condition
and therefore cannot name its cause with evidence. The two candidates consistent with the
record are (i) the partial run executed while another jest or a battery mirror was running
concurrently, or (ii) it predated `01240ce1`. **I am not asserting either.** Owner: the
session that observed it, which holds the log that would settle it.

### §5.4 Runner defect found, fixed and proven — commit `3c5081ae`

**Defect (reproducible, false-green).** In `maya-saas-backend/scripts/widgets-mutation-battery.mjs`
the battery list was filtered by ``name === `gate${gate}.json` `` with no check that the
filter matched anything. An id naming no declared battery therefore selected nothing,
`mutants` stayed empty, and the runner reported `status: EMPTY` and **exited 0** — a
caller reading the rc records a battery that ran green while no mutant was ever applied.
`--shards` already refused the very same id with exit 2, so the CI-matrix path and the run
path disagreed about what a battery id means.

Measured before the fix:

| invocation | rc | status | mutants |
|---|---|---|---|
| `--gate 7` | 0 | DRY-RUN | 35 |
| `--gate gate7` | **0** | **EMPTY** | **0** |
| `--gate 999` | **0** | **EMPTY** | **0** |
| `--shards gate7` | 2 | refused | — |
| `--shards 999` | 2 | refused | — |

**Fix.** The load path refuses an undeclared id with the same message and rc as `--shards`.
`EMPTY` keeps exit 0 only where it remains true: when no battery is *declared* at all.

**The test bites.** Two assertions were added to `--self-test`, beside the dead-killer
check of finding 9. Proven by differential run: the unknown-id assertion **fails against
the unfixed runner (exit 0)** and **passes against the fixed one (exit 2)**, while
`--gate 7` still loads its 35 mutants and an empty declaration directory still reports
EMPTY at exit 0. *Caveat:* `--self-test` end-to-end calls `assertProofDatabase` first and
so could not be run in full (§5.5); the two new assertions were exercised through the
identical subprocess invocation they use.

**Relation to (b):** this defect makes an unrun battery read as green — it explains a
battery being *missed*, which is item (a)'s symptom class. It does not by itself explain
mutants sitting at a *wrong* status. Treat the ~21 as open until the batteries run.

### §5.5 RED — what did not run, and who owns it

🔴 **The 19 declared mutation batteries (203 mutants) did not run, and neither did
`test:widgets:live` / `test:widgets:http`.** Two independent causes:

1. **The proof database was absent for the whole regression.** The mandated cluster
   `127.0.0.1:55611` / `maya_widget_gate_proof_gates` was not running (D-19 has the
   cluster stopped at CKPT-W). The runner calls `assertProofDatabase` **before any battery
   loads**, so *no* battery can execute without it — not even the 113 build-killed mutants
   whose declared steps are `unit,typecheck,k3` and need no database. `5432` is open on
   this machine but is forbidden by the hard rules and refused by `proof-db-guard` by
   design; it was never used (`DATABASE_URL` stayed unset throughout).
2. **The set is not completable in one session.** Each mutant runs a full `npm test`
   (~115–124 s) or a live suite in a fresh mirror. 203 mutants, serialized as required,
   is on the order of **7 hours**. This holds regardless of the database.

**Late development.** At 22:57, *while this regression was running*, a **concurrent**
worker created `…/p6-gates/w1/close-verify/` — its own repo checkout plus a cluster on
`127.0.0.1:55611` — and provisioned `maya_widget_gate_proof_gates` (130 public tables, 13
widget tables; confirmed by a single read-only query). That cluster is **left running**, as
required. I deliberately did **not** run the batteries against it: the proof database is
shared and live suites seed and truncate it, so a second concurrent run would corrupt both
sets of evidence in a programme whose entire purpose is evidentiary integrity.

**Owner:** the Wave 1 close integrator, on a session budgeted for the full serialized
battery run against a proof database it owns exclusively.

**Consequence for the wave gate:** §2.5(1) requires every declared battery to end
AS-DECLARED with SURVIVED 0. That condition is **unevidenced**, so **Wave 1 is not closed**
on the battery clause. Everything else in the §2.5 set enumerated by the task is green at
`3c5081ae`.

### §5.6 Discipline

- Databases: `DATABASE_URL` unset for every run; `5432` never used; `maya_widget_gate_proof_local` never touched.
- `widgets.runtime`: not granted by anything here; no fixture was run.
- No production access, no deploy, **no push** (29 commits still unpushed).
- One commit, `git -c gc.auto=0` with an explicit path; no gc/prune/stash/worktree/reset/rebase/amend/checkout of other work.
- `npm run format` / `lint:fix` never invoked. `maya-chat-shell/**` and the owner's Desktop checkout untouched.
- Every rc read directly; no exit code behind a pipe. Every process started has exited; the pg cluster is left running.
- One self-inflicted false red worth recording: `f88-mutation-battery.sh` run from the repo root reports "A MUTATION SURVIVED" (rc=1) because its `cp` paths are relative to `maya-saas-backend`; `run-all-checks.sh` runs it via `inbe`. With the correct cwd it is rc=0, 0 "NOT APPLIED". It fails *closed*, so this is an invocation error, not a gate defect.

---

# CKPT-W1 CLOSE — independent verification, its fixes, and the close decision

> Written by the Wave 1 close integrator, after an independent verifier returned seven
> findings against the state above. **HEAD moved twice during that verification**, so the
> state §5 closes on (`3c5081ae`) is not the final one. Everything below is measured at
> **`df6c3a5a`**, with the working tree clean and nothing pushed.
>
> **Sections were written as the evidence arrived, so they are not in numeric order on the
> page. Reading order:** §6 (disposition of the seven findings) → §7 (commit list) → §8 (final
> regression) → §12 (**the wave-2 red — supersedes §5.3(d), §8.2 and row 14 of §8's table**) →
> §9 (the battery table) → §10 (deviation disclosure) → §11 (BUILT vs EVIDENCED and the close
> decision).
>
> **The short version.** Four commits were added, one per confirmed finding that was fixable in
> code. Twenty-five of the twenty-six regression commands are green on the final HEAD,
> including the first green `test:widgets:live` and `test:widgets:http` the wave has had.
> **Wave 1 is NOT closed**, on three counts, none of which is a defect in the mechanism Wave 1
> built: the wave-2 acceptance gate is red on a SIGSEGV that does not predate the wave (§12),
> 150 of the 203 mutants are unexecuted (§9), and the `DEV-W1-1..7` disclosure record is lost
> (§10). The 53 mutants that DID run found **SURVIVED 0** — and found the SIGSEGV corrupting
> the battery runner itself (§9.6), which is probably the long-open "~21 mutants off declared
> status".
> No clause of `gate-conformance-audit.json` flips, and none is claimed as EVIDENCED.

## §6 — verification disposition

| # | Finding | Severity | Disposition | Evidence | Fix |
|---|---------|----------|-------------|----------|-----|
| 1 | `8cee26ba`'s negative arm `D-1-TX-b` is structurally blind to the read it was written for | high | **CONFIRMED, and worse than reported** | §6.1 | `5eb14456`, then `df6c3a5a` (§9.3) |
| 2 | `GATES-PLAN-V11.md` and §1–§4 are absent, so `DEV-W1-1..7` cannot be checked | high | **CONFIRMED** | §6.2 | not fixable here — §10, RED |
| 3 | An unknown `--gate` id reported `EMPTY` and exited 0, so a battery claim from an rc is unsound at or before `01240ce1` | high | **CONFIRMED; already fixed by `3c5081ae`, re-verified at HEAD** | §6.3 | `3c5081ae` (pre-existing) |
| 4 | The task's stated final HEAD (`01240ce1`) is stale | medium | **CONFIRMED** | §6.4 | superseded — this report closes at `df6c3a5a` |
| 5 | The proof-db guard admits `maya_widget_gate_proof_local`, the concurrent workstream's database | medium | **CONFIRMED** | §6.5 | `6a1349fe` |
| 6 | Gate 6's held lane names `(d)` but holds `(d)` and `(e)` | low | **CONFIRMED** | §6.6 | `620bfa1b` |
| 7 | Wave-level claims: all confirmed but one, which was an environment limit of the verifier's copy | low | **CONFIRMED; the open one is now SETTLED green** | §6.7 | none needed |

Nothing in the verification was **refuted**. Two findings were strengthened by re-measurement
(1 and 7); one was overtaken by events (4).

### §6.1 Finding 1 — CONFIRMED, and the defect is larger than the finding states

The verifier reported that reverting `8cee26ba`'s source half leaves `D-1-TX-b` green while
only `D-1-TX-c` goes red. Reproduced exactly: rc=1, *"Tests: 1 failed, 55 passed"*, the one
failure `D-1-TX-c`. So `8cee26ba`'s message — *"With slot 7 reverted to `this.prisma`,
`D-1-TX-b` and `D-1-TX-c` are rc=1"* — **names an arm that did not bite**. That
overstatement is recorded here, and in `5eb14456`'s message, because the commit cannot be
amended.

**A sharper probe shows the fence was blind, not merely over-claimed.** Restore the fix, then
reintroduce the ambient read in the METHOD BODY alone — `return this.prisma.…`, leaving the
signature and slot 7's `tx` argument intact. The defect `8cee26ba` exists to prevent is then
fully present, and:

```
jest src/widgets  →  rc=0   Test Suites: 66 passed, 66 total   Tests: 1082 passed
```

Nothing in the repository objects. `D-1-TX-c` cannot see it (the call site is correct) and
`T-READ-ONCE` cannot either (it asserts the argument PASSED, not the connection USED).

Two independent causes, both fixed in `5eb14456`:

- **The scan did not reach the read.** It filtered to slot ELEMENTS — 15 of 31 units — and
  the read is in the gateway's private method `findProducingRecord`. `pipelineSources` models
  a slot as *"the element, and the FILES it calls into"*; a private method is neither.
- **The rule was the wrong rule.** `/\bthis\.prisma\b/` cannot tell the defect from the fix,
  because the fix IS `(tx ?? this.prisma)`. The rule is now *"do not READ ON it"* — no
  `this.prisma.<model>` dereference, on the AST.

The transitive IMPORT closure was measured as the alternative and **rejected**: 117 files
across the whole application, which would dissolve the D-6 boundary the one-hop model draws.

**It bites now.** Full revert of `8cee26ba`'s source half: rc=1, four arms red, `D-1-TX-b`
naming `intent-gateway.service.ts#method-findProducingRecord:6`. Body-only plant: rc=1,
`D-1-TX-b` red. At HEAD: rc=0, 58 passed. Logs: `logs/int-rev8cee-spec.log`,
`logs/int-plant-body-widgets.log`, `logs/int-newfence-fullrevert.log`,
`logs/int-newfence-plant-body.log`, `logs/int-newfence-head2.log`.

The new `D-1-TX-a` is the arm whose absence let this stand: it asserts the reach **contains**
the store read the rule governs, by name and by content. A fence that scans nothing passes.

### §6.2 Finding 2 — CONFIRMED. The disclosure record cannot be reconstructed here

`GATES-PLAN-V11.md` exists nowhere on this machine (`find` over `/private/tmp` including every
sibling session scratchpad — all empty but this one — exit 0). Of `DEV-W1-1..7`, exactly one is
referenced anywhere: `DEV-W1-3`, in `c354a2a4`, whose text points at this report. Six are
unreferenced. `git grep DEV-W1` over tracked files: zero hits.

What IS traceable is in §10. **This finding is not closed and is a RED against the wave.**

### §6.3 Finding 3 — CONFIRMED; the fix is in and re-verified at HEAD

At `01240ce1` an id naming no declared battery selected nothing, reported `status: EMPTY` and
exited 0. `3c5081ae` closed it. Re-measured on this phase's tree (the runner script is
untouched by every commit after `3c5081ae`, so the measurement holds at the final HEAD):

| invocation | rc | result |
|---|---|---|
| `--gate nonesuch --dry-run` | **2** | `no battery gatenonesuch.json is declared` |
| `--gate gate7 --dry-run` | **2** | `no battery gategate7.json is declared` |
| `--gate 999 --dry-run` | **2** | `no battery gate999.json is declared` |
| `--gate 7 --dry-run` | **0** | 35 mutants, `DRY-RUN` |
| `--shards nonesuch` | **2** | same message, as it always did |

**The retrospective consequence stands and is honoured in §9:** no battery in the table below
is recorded from an exit code. Every entry states its mutant count, read from the run's own
report.

### §6.4 Finding 4 — CONFIRMED; superseded

HEAD was `01240ce1` when the task text was written, `3c5081ae` when the verifier finished, and
was `620bfa1b` after this phase's first three commits, and is `df6c3a5a` now. This report closes on `df6c3a5a`. The closing regression the task describes
as missing is in §8, run on that commit.

### §6.5 Finding 5 — CONFIRMED

`PROOF_DATABASE_PATTERN` is `^maya_widget_gate_proof_[a-z0-9_]+$`, which `_local` matches.
Measured before the fix: `maya_widget_gate_proof_gates` ADMITTED, `maya_widget_gate_proof_local`
**ADMITTED**, `maya_widget_gate_proof_anything` ADMITTED. The prohibition lived in a comment in
`support/environment.ts` and nowhere in code, while both workstreams share 127.0.0.1:55611.

`6a1349fe` refuses the name explicitly, in both modes, case-insensitively, before the fragment
scan. Three refusal cases and a positive control (`…_localised` still admitted) were added to
the guard's own table. Differential: against the UNFIXED guard rc=1, 4 failed; against the
fixed guard rc=0. Logs: `logs/int-guard-before.log`, `logs/int-guard-after-jest.log`.

### §6.6 Finding 6 — CONFIRMED

`gate6.ts:25` said *"(d) and C20 are a HELD LANE"* and the refusal a caller reads said `'(d)'`
alone, while the branch holds both (d) and (e) — as the code's own comment at the branch says.
§3.9 lists five conditions. `620bfa1b` makes both details `'(d)/(e) …'` and corrects the summary.
The strings are pinned in `gate6.spec.ts` (three assertions), so the change is visible rather
than silent. No behaviour changes: the branch refused before and refuses now.

### §6.7 Finding 7 — CONFIRMED, and its one open item is now settled

Every claim the verifier marked CONFIRMED was independently re-measured here where it bears on
the close, and all hold (§8). The one item they could not settle — **`npm test` 530/530** —
**is settled green in the real checkout**:

```
npm test  →  rc=0   Test Suites: 530 passed, 530 total   Tests: 5022 passed
```

Their 529/530 was `consent.spec.ts` failing `ENOENT` on `maya-chat-shell/src/routes/registry.ts`
because copying `maya-chat-shell` was correctly refused by the permission system. That was an
environment limit of their copy, exactly as they said, and not a defect. (5022, not 5020: the
two new `D-1-TX` arms.)

Their note about creating the proof cluster is confirmed and honoured: it is at
`close-verify/pgdata-gates`, 127.0.0.1:55611, `maya_widget_gate_proof_gates`, and it is **left
running**. It was exclusively this session's for the whole regression — no other process held a
connection (`pg_stat_activity` empty, no sibling jest).

## §7 — the final commit list

**Final HEAD: `df6c3a5a`. 33 commits since `a2f98a52`. All 33 unpushed** on
`codex/maya-identity-consent-20260913` (upstream `origin/codex/maya-identity-consent-20260913`).
Working tree **clean**.

| # | Commit | Phase | Subject |
|---|--------|-------|---------|
| 1 | `5a1c1377` | Wave 1 unit | P-PRINCIPAL — the live principal inside the one request transaction |
| 2 | `080f32b3` | Wave 1 unit | P-25 — AE_PROPOSE_PAIRING, F38's thirteen rows at runtime |
| 3 | `296aee36` | Wave 1 unit | P-LEDGER — the mechanism-gap and capability-gap ledgers |
| 4 | `97982a93` | Wave 1 unit | P-F88 — the runtime forbidden-key walk and the §3.8 DTO |
| 5 | `a8ec03b5` | Wave 1 unit | P-SEAL — the keyed envelope seal and its verifier |
| 6 | `5bbce7a2` | Wave 1 unit | P-RENDER — R3.9.3's refusal-rendering map |
| 7 | `d1598e20` | Wave 1 unit | P-K4K8 — the replacement ratchet for the widget-layer PII path |
| 8 | `fff08b48` | Wave 1 unit | U-OWN — read-only quote extractions in the three booking owners |
| 9 | `87c9f4c3` | Wave 1 unit | U4 — Gate 4 asks the tenancy owner |
| 10 | `199af63c` | Wave 1 unit | U4 merge review fix |
| 11 | `8d6c162d` | Wave 1 unit | U6-L1 — «Gate 6 in full», the principal-independent part |
| 12 | `d6238b4a` | Wave 1 unit | U7a — Gate 7, all fourteen clauses |
| 13 | `305c715c` | Wave 1 unit | U8a — Gate 8's null-schema lane |
| 14 | `13127393` | Wave 1 unit | U8R — Gate 8-R on the record |
| 15 | `0a0620d4` | Wave 1 unit | U8b-c — the one input-schema codec |
| 16 | `6e576b41` | Wave 1 unit | U9a — the lowering function and Gate 9's source fences |
| 17 | `fb5d29af` | Wave 1 unit | U10a — `routeUtterance`, `ownerSet` and the R3.12.4 duty |
| 18 | `0af80584` | Wave 1 unit | U11a — Gate 11's structure and applicability table |
| 19 | `4f2703f1` | Wave 1 unit | U12a + IR-K4K8-1..-4 — the projector skeleton |
| 20 | `4da8954f` | CKPT-W1 | M7-8's killer did not bite — split out T7-PRODUCING-SCOPE |
| 21 | `101040ec` | CKPT-W1 fix | Gate 11 owed a canonical read on CONTROL and REFINE |
| 22 | `ff6e695d` | CKPT-W1 fix | every live refusal said the source was silent about a gate nobody built |
| 23 | `0b384c38` | CKPT-W1 fix | D-10's refusal fence read one directory, not the pipeline |
| 24 | `8cee26ba` | CKPT-W1 fix | two slots inside `T` read on a second connection |
| 25 | `c354a2a4` | CKPT-W1 fix | B-22 unasserted at the DI container (**carries DEV-W1-3**) |
| 26 | `3da48069` | CKPT-W1 fix | one battery could not run and one killer could not be credited |
| 27 | `2720435e` | CKPT-W1 fix | G2-IN asserted a source string and claimed an evidence class |
| 28 | `01240ce1` | CKPT-W1 close | re-anchor M7-8, which the transaction fix had left resolving 0 times |
| 29 | `3c5081ae` | CKPT-W1 close | an unknown `--gate` id reported EMPTY and exited 0 |
| 30 | `5eb14456` | **CLOSE verification** | D-1-TX-b could not have caught the read it was written for |
| 31 | `6a1349fe` | **CLOSE verification** | the proof-db guard admitted the shell workstream's database |
| 32 | `620bfa1b` | **CLOSE verification** | Gate 6's held lane named one of its two halves |
| 33 | `df6c3a5a` | **CLOSE verification** | D-1-TX-a pinned the slot range it was supposed to derive |

Commits 20–27 are the seven CKPT-W1 review fixes plus `4da8954f`; 28–29 closed the two
defects that surfaced during the first close attempt; **30–33 are this phase's** — one per
confirmed verification finding that was fixable in code (30, 31, 32), plus 33, which removes a
brittleness that 30 introduced and that only showed up when the new fence was run against every
battery mutant that edits the gateway (§9.3).

## §8 — final regression state, at `df6c3a5a`

Every command was run in the repository working tree at `df6c3a5a` with the tree clean.
**Every exit code was read directly from `$?`; no pipe stands between a command and its rc.**
Logs: `…/p6-gates/w1/logs/int-*.log`.

| # | Command | rc | Result |
|---|---------|----|--------|
| 1 | `npm test` | **0** | ✅ **530 suites / 5022 tests passed** |
| 2 | `npm run typecheck` | **0** | ✅ |
| 3 | `npm run typecheck:scripts` | **0** | ✅ |
| 4 | `npm run typecheck:widgets-live` | **0** | ✅ |
| 5 | `npm run lint` | **0** | ✅ 0 errors (9 warnings, all pre-existing at HEAD in `src/widget-contract/**`, untouched here — verified against a clean export) |
| 6 | `npm run build` | **0** | ✅ nest build + build:preflight |
| 7 | `npm run test:widgets:live` | **0** | ✅ **12 suites / 244 tests**, proof database `maya_widget_gate_proof_gates` on 127.0.0.1:55611 (local) |
| 8 | `npm run test:widgets:http` | **0** | ✅ **10 cases, status PASS, failed 0**, binary health 200 |
| 9 | `run-all-checks.sh` | **0** | ✅ every section pass — 26 checkers, listed below |
| 10 | `k3-exit-gate.sh` | **0** | ✅ K3 EXIT: PASS (via 9) |
| 11 | `k4-exit-gate.sh` | **0** | ✅ K4 EXIT: PASS (via 9) |
| 12 | `k5-exit-gate.sh` | **0** | ✅ K5 EXIT: PASS (via 9) |
| 13 | `k6-exit-gate.sh` | **0** | ✅ K6 EXIT: PASS (via 9) |
| 14 | `wave-2-final-gate.sh` | **1** | 🔴 **WAVE 2 COMPLETE: NO** — LINT/TYPECHECK/BUILD/SHELL BUILD PASS, production effects 0, process hygiene 0, but MANDATORY REGRESSION FAIL. **See §12** — a jest worker is killed by SIGSEGV; no test fails. |
| 15 | `wave-3-final-gate.sh` | **0** | ✅ WAVE 3 COMPLETE: YES (via 9) |
| 16 | `wave-4-final-gate.sh` | **0** | ✅ WAVE 4 COMPLETE: YES (via 9) |
| 17 | `wave-5-final-gate.sh` | **0** | ✅ WAVE 5 COMPLETE: YES — K13 COMPLETE: YES, 13/16 packages |
| 18 | `final-figures.mjs` | **0** | ✅ |
| 19 | `gate-audit-check.mjs` | **0** | ✅ PASS — schema /2, 15 gates, **165 clause keys equal to the inventory**, contract `606d7f99da5f`, headline recomputed |
| 20 | `gate-audit-check.mjs --self-test` | **0** | ✅ PASS — 4 positives, 14 negatives, each red for its own rule |
| 21 | `contract-version-record-check.mjs` | **0** | ✅ 14/14 |
| 22 | `widget-contract-check.mjs` | **0** | ✅ 31/31, 4 pending on a later package |
| 23 | `k3-gateway-check.mjs` | **0** | ✅ 10/10 K3 structural checks |
| 24 | `f88-mutation-battery.sh` | **0** | ✅ ALL MUTATIONS CAUGHT (via 9, correct cwd) |
| 25 | Runner load validation, all batteries | **0** | ✅ **19 batteries, 203 mutants**, every `find` anchor resolves **exactly once** |
| 26 | 19 declared mutation batteries, executed | mixed | 🟡 **PARTIAL — 3 of 19 batteries / 53 of 203 mutants run. SURVIVED 0. `gate8` and `gateH-harness` AS-DECLARED (rc=0); `gate8r` MISMATCH (rc=1) on 2 mutants that §9.6 traces to §12, not to a fence.** See §9. |

**`run-all-checks.sh` sections, all pass:** consolidated-mechanical-audit 29/29 ·
citation-target-check 0 problems · per-kind-totality-check 22/22 · f6a-one-declaration-check ·
predicate-restatement-check 0 · r3115-constructibility-proof · envelope-check 28/28 ·
mapping-vs-contract-check 14/14 · widget-schema-count 10/10 · k1-dossier-check (OWNER
SIGNATURE: PRESENT) · k1-human-dossier · **k1-signature-check K1 SIGNED: YES 6/6** ·
widget-check-generator · enum-member-check 7/7 · contract-version-record-check 14/14 ·
gate-audit-check · gate-audit-check-self-test · widget-contract-check · **emit-f88-check** ·
k3-gateway-check · k3/k4/k5/k6 exit gates · wave-3/wave-4 final gates · f88-mutation-battery.

### §8.1 The two gates that were RED in §5 are now GREEN

§5 recorded `test:widgets:live` and `test:widgets:http` as **rc=1, BLOCKED** because the proof
database was absent at run time. Both are **rc=0** here. The cluster exists now
(`close-verify/pgdata-gates`, 127.0.0.1:55611, 130 public tables, all migrations applied) and
was exclusively this session's for the whole regression. This is the first time in the wave
that either has actually run on a final HEAD.

### §8.2 The wave-2 gate — SUPERSEDED BY §12

An earlier draft of this section recorded the wave-2 gate as GREEN, on the strength of two
runs at `620bfa1b`. **That was premature and is retracted.** On the final HEAD the gate is
**rc=1, WAVE 2 COMPLETE: NO**, and the §5.3(d) phenomenon that no previous session could
reproduce now reproduces on demand. It is a SIGSEGV worker kill, it is not a failing test, and
it does **not** predate the wave. §12 is the full account; it is the governing text and this
row's entry in the table above has been corrected to match.

### §8.3 Clause immutability — GREEN, nothing flips

| File | blob at `5a1c1377~1` | at HEAD `df6c3a5a` | in worktree |
|---|---|---|---|
| `gate-conformance-audit.json` | `fbdb1efe…` | `fbdb1efe…` | `fbdb1efe…` |
| `gate-clause-inventory.json` | `42616b3a…` | `42616b3a…` | `42616b3a…` |

Byte-identical across the whole wave. `git log a2f98a52..HEAD -- <both paths>` returns **no
commits**: nothing in the wave, this phase included, touched either file. Corroborated
independently by `gate-audit-check` (165 clause keys equal to the inventory, headline
recomputed) and its self-test.

## §10 — deviation disclosure: `DEV-W1-1..7` cannot be discharged here

This is the finding-2 RED, stated in full so a reader can act on it.

**What was asked:** verify `DEV-W1-1..7` are real and disclosed.
**What is possible:** one of the seven.

`GATES-PLAN-V11.md` is absent from this machine, and §1–§4 of this report were lost with it
(see the provenance note at the top). Scanning every one of the wave's 32 commit messages for
`DEV-W1-[0-9]` yields **exactly one** hit:

- **`DEV-W1-3`** — `c354a2a4`: B-22 states *"the gateway module never holds the key"*, but there
  is no `emission.module.ts` in Wave 1, so `SealService` and `SealVerifierService` stand in the
  gateway's module for now. Landing `emission.module.ts` would take P-MINT-CORE's (Wave 2)
  files at a checkpoint, so the deviation **stands and is PINNED** by `SEAL-5c`, which asserts
  the gateway's constructor names neither service, that a planted injection of either turns it
  red, and that the two providers stand in exactly ONE module. **Traceable and properly
  disclosed.**

`DEV-W1-1`, `-2`, `-4`, `-5`, `-6` and `-7` are **unreferenced anywhere**: not in a commit
message, not in a tracked file (`git grep DEV-W1` → zero hits), not in a test.

**What the wave DOES disclose,** under per-unit ids rather than the `DEV-W1-N` scheme. These
are real, in-commit, and each names what it departs from:

| Commit | Id | Deviation |
|---|---|---|
| `97982a93` P-F88 | *(unnumbered)* | IR-F88-2's new `SubmissionShape` members are OPTIONAL and `inputs` stays `?:`, so the retype does not ripple; §3.8 is enforced on the WIRE by the DTO, not by the interface |
| `a8ec03b5` P-SEAL | `DEV-SEAL-A` | the rest of SEAL-1/2/3/6's `[GW]` grade folds into P-G15a's Gate 1 live spec; nothing is lost because GW never counts as evidence |
| `d1598e20` P-K4K8 | *(unnumbered, explicit)* | the ADDITIVE half only; IR-K4K8-1..-4 removals deferred |
| `fff08b48` U-OWN | *(unnumbered)* | the scanner's driver spec is not literally named in the card's exclusive glob |
| `4f2703f1` U12a | `DEV-1`, `DEV-A1` | `composeNavigate` is the plan's fail-closed interim and **departs from certified row 13**; G12-R1b, G12-I11 and G13-R2 stay `false`; OD-1 (ii) and OD-5 are the owner's |
| `c354a2a4` B-22 | **`DEV-W1-3`** | as above, pinned by `SEAL-5c` |

Six commits carry deviations. Whether they map onto `DEV-W1-1..7` is **not verifiable**
without the plan, and **I am not asserting the mapping** — asserting it is exactly the
fabrication the provenance note refuses.

🔴 **Consequence: Wave 1 is not closed on the disclosure clause.** Until `CKPT-W1-REPORT.md`
carries `DEV-W1-1..7` stated in full, each traceable to a commit or a pinning test the way
`DEV-W1-3` is pinned by `SEAL-5c`, no reviewer can distinguish a disclosed deviation from an
undisclosed defect.

**Owner:** the session that wrote §1–§4 and held `GATES-PLAN-V11.md`, or the programme owner,
who can re-issue the plan. This cannot be discharged from the repository alone.

## §11 — BUILT vs EVIDENCED

**Nothing flips this wave.** `gate-conformance-audit.json` is byte-identical at `5a1c1377~1`,
at `df6c3a5a` and in the working tree (§8.3), and **no commit in the wave touches it**. Every
clause that was `BUILT=false` before Wave 1 is `BUILT=false` after it. Wave 1 built mechanism;
it decided no clause.

The distinction this report turns on:

- **BUILT** — the code exists, is wired into the pipeline, refuses fail-closed where a lane is
  held, and is fenced by tests that go red when it is removed. Wave 1's 19 units are BUILT in
  this sense, and §8's 25 green commands are the evidence for it.
- **EVIDENCED** — in the §0.5 sense the programme uses for a clause flip: a live `[HTTP]` kill
  against the production-minted path. **No clause is claimed as EVIDENCED by this wave, and
  none is flipped.**

Three things follow, and they should not be conflated:

1. **The deterministic regression is green except for the acceptance gate itself** (§8): of
   26 commands, **24 are rc=0**, one is RED (`wave-2-final-gate.sh`, §12) and one is PARTIAL
   (the batteries, §9). This is still the strongest state Wave 1 has been in — it includes the
   first green `test:widgets:live` and `test:widgets:http` the wave has had on a final HEAD —
   and the one red is an infrastructure crash rather than a failing test.
2. **The mutation batteries are the evidence that the fences are load-bearing**, and 53 of
   203 mutants ran (§9). Those 53 gave **SURVIVED 0** — no fence they attack is dead. The other
   150 are unevidenced in that sense: a battery that has not run does not make a fence wrong, it
   makes the fence's *load-bearingness* unproven. The declared set is fully validated at the
   load path — all 203 anchors resolve exactly once — which is a real check, and is what caught
   the gate-7 dead anchor, but it is not execution.
3. **The disclosure record is incomplete** (§10), and that is independent of both.

### The close decision

🔴 **Wave 1 is NOT closed.** Three clauses are unmet, and none of them is a defect in the
code Wave 1 wrote:

| Clause | State | Owner |
|---|---|---|
| §2.5 wave-2 acceptance gate green | 🔴 **RED — see §12** | programme owner / Wave 1 implementer set |
| §2.5(1) every declared battery AS-DECLARED with SURVIVED 0 | 🟡 **PARTIAL** — 53/203 mutants run, SURVIVED 0, 2 statuses spoiled by §12 (§9, §9.6) | Wave 1 close integrator, after §12 is fixed |
| Deviation disclosure `DEV-W1-1..7` | 🔴 **NOT DISCHARGEABLE HERE** | the session holding §1–§4 / `GATES-PLAN-V11.md`, or the programme owner |

Everything else in the regression set enumerated by the task is **green on the final HEAD**,
and every verification finding that was fixable in code is fixed, each with a test that fails
before the fix and passes after it. Note the shape of the three reds: **none of them is a
defect in the mechanism Wave 1 built.** One is an infrastructure crash, one is unexecuted
evidence, one is a lost document. That is worth stating plainly, and it is also why none of
them can be waved through — each is exactly the kind of gap that hides a real defect.

### Discipline

- **Databases:** only `127.0.0.1:55611` / `maya_widget_gate_proof_gates`. `5432` never used
  (the shared Homebrew cluster is running on this machine and was never connected to).
  `maya_widget_gate_proof_local` never touched — and, as of `6a1349fe`, no longer *touchable*
  by this harness even by mistake.
- **`widgets.runtime`:** granted only via `Fixtures.grantFeature`, which calls
  `assertProofDatabase` at runtime. Nothing here grants it another way — the live suite and the
  executed batteries both go through the fixtures.
- **No production access. No deploy. No push** — 33 commits remain unpushed.
- Four commits, each `git -c gc.auto=0` with explicit paths and a message ending in the
  required trailer. No gc/prune/stash/worktree/reset/rebase/amend/checkout of other work.
  `8cee26ba`'s overstatement is **recorded** (§6.1, and in `5eb14456`'s message) rather than
  amended away, because amending is forbidden and because the record should show what was
  claimed as well as what was true.
- **`npm run format` and `lint:fix` never invoked.** The four prettier errors my edits caused
  were fixed by hand, to prettier's own printed instruction.
- `maya-chat-shell/**` untouched. The owner's Desktop checkout untouched.
- Every rc read directly from `$?`; **no exit code behind a pipe**.
- Every process this session started has been stopped before this report was handed over —
  the mutation-battery driver included, which is why §9's table stops where it does. **The pg
  cluster on 127.0.0.1:55611 is left running**, as required.

---

# §12 — the wave-2 gate is RED on the final HEAD, and it does NOT predate this wave

> This supersedes §5.3(d) and §8.2, which were written before the phenomenon reproduced.
> §8's table rows 14 and 26 are amended by this section. **This is the most consequential
> finding of the close**, and it is reported as a RED rather than explained away.

## §12.1 What happens

`wave-2-final-gate.sh` at `df6c3a5a`:

```
MANDATORY REGRESSION:                FAIL  (a suite failed to RUN — )
WAVE 2 COMPLETE: NO                                        rc=1
```

This is the *same* line §5.3(d) recorded and could not reproduce. It now reproduces, and the
cause is named.

## §12.2 The cause: a jest worker is killed by SIGSEGV

Running the gate's own invocation with the output KEPT instead of piped to `tail -8`:

```
FAIL src/measurement/measurement.pwa.spec.ts
  ● Test suite failed to run
    A jest worker process (pid=49963) was terminated by another process:
    signal=SIGSEGV, exitCode=null.
      at ChildProcessWorker._onExit (node_modules/jest-worker/build/index.js:964:23)

Test Suites: 2 failed, 528 passed, 530 total
Tests:       5004 passed, 5004 total
```

**No test fails.** In every occurrence `Tests:` shows `0 failed` — the suites the dead worker
was carrying simply never report. Node `v24.15.0`.

**The victim is arbitrary.** Five distinct suites have been observed as the victim, and every
one of them passes on its own:

| Run | Victim |
|---|---|
| gate preamble run | `src/measurement/measurement.pwa.spec.ts` + `src/widgets/gates/gate4.source.spec.ts` |
| HEAD export, run 1 | `src/widgets/gates/gate4.source.spec.ts` |
| HEAD export, run 3 | `src/action-engine/consent-security-invalidation.architecture.spec.ts` |
| HEAD `--maxWorkers=2` | `src/crm/client-profile-read.architecture.spec.ts` |
| `3c5081ae`, run 1 | `src/widgets/emission/seal-h6.architecture.spec.ts` |

`measurement.pwa.spec.ts`, `consent-security-invalidation.architecture.spec.ts` and
`client-profile-read.architecture.spec.ts` were **never touched by this wave**. The two named
in the first run pass together on their own: rc=0, 2 suites / 18 tests. So this is not a
defect in any suite.

## §12.3 It does not predate the wave — measured, not asserted

Identical conditions throughout: a fresh `git archive` export, `node_modules` symlinked, the
gate's own `npx jest --silent --maxWorkers=4`, nothing else running.
`package.json` and `package-lock.json` are **unchanged across the whole wave**, so the shared
`node_modules` is the correct one for every tree below.

| Tree | Spec files | Runs | Runs with SIGSEGV |
|---|---|---|---|
| `a2f98a52` — **before the wave** | 493 | 3 at `--maxWorkers=4`, 2 at `--maxWorkers=8` | **0 of 5** |
| `3c5081ae` — the wave, before this phase's commits | 530 | 3 | **1 of 3** |
| `df6c3a5a` — **final HEAD** | 530 | 3 | **2 of 3** |

Plus, at HEAD outside the export: 2 gate runs FAIL, 1 preamble run FAIL, 1 standalone run
clean, 1 of 2 `--maxWorkers=2` runs FAIL.

**The pre-wave tree did not crash once in five runs, including at HIGHER parallelism
(`--maxWorkers=8`) than the gate uses.** That is the discriminator: the instability does not
track worker count, it tracks the tree. The wave grew the suite set 493 → 530.

**Therefore I cannot report this red as predating the wave, and I do not.** The honest
statement is narrower and is what the evidence supports:

- it **predates this phase's four commits** — it reproduces at `3c5081ae`, before any of them;
- it is **not a defect in any suite** — no assertion fails, the victim is arbitrary, and every
  victim passes alone;
- it **appeared during Wave 1**, somewhere between `a2f98a52` (493 suites, 0/5) and
  `3c5081ae` (530 suites, 1/3).

**Sample size, stated honestly.** Five pre-wave runs against three-plus-five post-wave runs is
enough to act on and not enough to put a rate on. A reader should take the claim as "clean
across every pre-wave run attempted, including a deliberately harsher one, and reproducible on
demand after the wave" — not as a measured probability. The first thing the owner should do is
widen the pre-wave sample; if `a2f98a52` ever crashes, the conclusion below weakens to "the
wave made a pre-existing instability frequent", which is a different bug report.

What is NOT established is *which* of the wave's 37 new suites, or what in them, drives a
native crash. Identifying it needs a bisect over those suites, and because the crash is
probabilistic (~1 run in 3) each candidate needs repeated runs. That did not fit this session.

## §12.4 A second defect: the gate cannot say what failed

This is why three sessions could not name the cause, and it should be fixed alongside.

```sh
J=$( cd "$BE" && npx jest --silent --maxWorkers=4 2>&1 | tail -8 )
SUITES=$(echo "$J" | grep -oE 'Suites: *[0-9]+ passed[^,]*' | head -1)
...
  say "MANDATORY REGRESSION:" "FAIL  (a suite failed to RUN — ${SUITES#Test Suites: })"
```

Two problems:

1. **`SUITES` can never populate on a failure.** The regex anchors `passed` directly after
   `Suites: <digits>`, but a failing run reads `Test Suites: 2 failed, 528 passed, 530 total`.
   So the branch that reports the failure always prints an empty count — the literal
   `"— )"` seen above. It works only when nothing failed, where it is not used.
2. **`| tail -8` discards the rc and the failing suite name.** The gate's own header warns
   about exactly this for lint (*"a pipe replaces eslint's exit code with tail's — which is how
   a failing lint was reported as PASS for two checkpoints"*), and the regression path it
   guards then does the same thing to jest. The diagnosis in §12.2 was only possible by
   re-running the command outside the gate.

**I have not changed `wave-2-final-gate.sh`.** Rewriting a wave acceptance gate at close time,
in a phase whose remit is verification fixes, is precisely the kind of change that should not
be made unreviewed. It is recorded here as work for its owner.

## §12.5 Owner and disposition

🔴 **RED. Owner: the programme owner / the Wave 1 implementer set**, with two items:

1. **Find the SIGSEGV.** Bisect the 37 suites the wave added, with repeated runs per candidate
   (the crash is ~1 in 3). Start from the observation that the victim is never the cause.
   `--maxWorkers=2` does not remove it and `--maxWorkers=8` on the pre-wave tree does not
   provoke it, so worker count is not the variable.
2. **Make the gate diagnosable.** Fix the `SUITES` regex and stop piping jest through `tail`,
   so the next occurrence names its own suite and its own exit code.

**Consequence for the close:** `wave-2-final-gate.sh` is **rc=1, WAVE 2 COMPLETE: NO** on the
final HEAD. Wave 1 is not closed on this clause either. Note what is and is not in doubt: the
suite CONTENT is green — `npm test` is 530/530 with 5022 passing, reproducibly, and
`wave-3/4/5` are all YES. What is red is the ability to run the suite to completion without an
operating-system kill, which is an infrastructure defect and a real one.

---

# §9 — the battery table, complete

Every declared battery appears below. None is omitted, and no entry is derived from an exit
code — §6.3 is honoured: the load column states a mutant COUNT read from the run's own report,
not an rc.

## §9.1 The table

| Battery | Mutants | live-killed | build-killed | pending | Load validation | Executed |
|---|---|---|---|---|---|---|
| `gate10a` | 5 | 0 | 5 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate11` | 7 | 0 | 7 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate12` | 5 | 0 | 5 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate12k` | 3 | 0 | 3 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate4` | 4 | 2 | 2 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate6` | 21 | 12 | 7 | 2 | ✅ anchors resolve once | 🔴 not executed |
| `gate7` | 35 | 8 | 27 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate8` | 5 | 5 | 0 | 0 | ✅ anchors resolve once | ✅ **AS-DECLARED** · 5 run · SURVIVED 0 · UNEXPECTED 0 · mismatches 0 |
| `gate8c` | 8 | 0 | 8 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gate8r` | 29 | 25 | 4 | 0 | ✅ anchors resolve once | 🟡 **MISMATCH** · 29 run · SURVIVED 0 · UNEXPECTED 2 · mismatches 2 |
| `gate9a` | 2 | 0 | 2 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gateH-harness` | 19 | 19 | 0 | 0 | ✅ anchors resolve once | ✅ **AS-DECLARED** · 19 run · SURVIVED 0 · UNEXPECTED 0 · mismatches 0 |
| `gateP-f88` | 14 | 8 | 6 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gateP-ledger` | 7 | 0 | 7 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gateP-pairing` | 6 | 0 | 6 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gateP-principal` | 12 | 8 | 3 | 1 | ✅ anchors resolve once | 🔴 not executed |
| `gateP-render` | 8 | 0 | 8 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gateP-seal` | 6 | 0 | 6 | 0 | ✅ anchors resolve once | 🔴 not executed |
| `gateT-tables` | 7 | 0 | 7 | 0 | ✅ anchors resolve once | 🔴 not executed |
| **TOTAL — 19 batteries** | **203** | **87** | **113** | **3** | **✅ rc=0, 203 mutants** | **3 batteries / 53 mutants executed** |

**Executed: 3 batteries, 53 of 203 mutants (26%).** Of those 53: **SURVIVED 0**, and 51 at their
declared status. `gate8` and `gateH-harness` are **AS-DECLARED** outright; `gate8r` is
**MISMATCH** on two mutants, and §9.6 shows that at least one of the two is a correct kill
misreported because its jest run died without writing a report — the §12 crash, inside the
battery runner.

**For the other 16 batteries, AS-DECLARED and SURVIVED 0 are NOT established.** They require
executing the mutants; the load column is not a substitute, and treating it as one would be the
§6.3 mistake in a new costume.

## §9.2 What IS established

**The load path is green for all 203, on the final HEAD** (`--dry-run`, rc read directly,
report states `status DRY-RUN`, `mutants 203`, `batteries 19`). This is not a formality: every
`find` anchor must occur **exactly once** in its file at its turn, and the runner exits 2 when
one does not. It is precisely this check that caught `gate7.json#M7-8` resolving 0 times after
the transaction fix, which is what `01240ce1` repaired. So the declarations are known to be
well-formed against the code at `df6c3a5a` — but well-formed is not executed.

The declared baseline, for the session that runs them:

| | live-killed | build-killed | pending | equivalent | total |
|---|---|---|---|---|---|
| declared across 19 batteries | 87 | 113 | 3 | 0 | **203** |

## §9.3 A battery check that WAS run, and that changed the code

Before trusting the new `D-1-TX` fence inside a battery, I applied **every mutant that edits
`intent-gateway.service.ts` — 10 of them, across `gate4`, `gate7`, `gate8r`, `gate12` and
`gateP-principal` — to the real file and ran the fence against each**.

It found a defect in my own commit `5eb14456`: `D-1-TX-a` went red on `gate8r.json#M14`, a
mutant about slot ordering that the transaction rule has nothing to say about. `M14` is
`live-killed`, so its steps are `live` and the unit arm would never have run for it — no status
was at risk — but the arm was pinning a slot list it should have derived. `df6c3a5a` fixes it.
After the fix: **all 10 mutants, `D-1-TX` red: none**, with the mutants that should be caught
elsewhere still caught (`gate7#M7-8` → `T7-PRODUCING-SCOPE`, `gate8r#M11` → 4, `gate8r#M14` → 1).

This is a fraction of one battery's work and it still turned up a real defect. It is the best
argument in this report for why the residual matters.

## §9.4 The residual: named, owned, and costed

🔴 **RESIDUAL: 16 of 19 batteries / 150 of 203 mutants, unexecuted** — `gate10a`, `gate11`,
`gate12`, `gate12k`, `gate4`, `gate6`, `gate7`, `gate8c`, `gate9a`, `gateP-f88`, `gateP-ledger`,
`gateP-pairing`, `gateP-principal`, `gateP-render`, `gateP-seal`, `gateT-tables`. Plus the two
`gate8r` mutants (`M13b`, `M15`) whose status is an artifact and needs a clean re-run (§9.6).

Two of the sixteen matter most and should go first, because this phase changed code they
cover: **`gate6`** (21 mutants — `620bfa1b` edits `gate6.ts`) and **`gate7`** (35 — its `M7-8`
is anchored in `intent-gateway.service.ts` and its killer lives in the file `5eb14456` and
`df6c3a5a` rewrote). Neither was reached before the session ended. §9.3 records the substitute
check that WAS run over those files, and what it found.

**Owner:** the Wave 1 close integrator, on a session budgeted for the measured cost below,
holding the proof database exclusively, and **running after §12 is fixed** (§9.6 shows why).

**Reason — measured, and the cost is LOPSIDED.** The runner gives each mutant the steps its
declaration names: `live` for a live-killed or pending mutant, `unit,typecheck,k3` for a
build-killed one. Those two are nothing like each other in cost, and an earlier draft of this
section got it wrong in both directions. Measured:

| | mutants | step | measured cost | total |
|---|---|---|---|---|
| live-killed + pending | 90 | the live suite in a mirror | **≈ 17 s each** (gate 8: 5 mutants + baseline in **105 s**; the live suite itself is 15.7 s) | **≈ 30 min** |
| build-killed | 113 | `npm test` **`--runInBand`** + typecheck + k3 | **≥ 9 min each** (the in-band unit baseline had not finished after 8 min 27 s, twice) | **≈ 17 h** |
| | | | | **≈ 18 h, serialized** |

**The live half is cheap and should simply be run — it is half an hour.** All of the cost is in
the 113 build-killed mutants, because each one re-runs the entire 530-suite unit set in-band.
That is the thing to attack: batching the build-killed mutants, or running their unit step with
workers, would move this from an overnight job to a coffee break. The runner holds a lock, so
the set cannot be parallelised across invocations without giving up the serialization the
programme requires — but the cost is inside a single invocation, not between them.

**Two further constraints for whoever runs it:**

1. **Exclusive proof database.** The live half seeds and truncates
   `maya_widget_gate_proof_gates`. A second live run against the same database corrupts both
   sets of evidence. `6a1349fe` now stops the harness from wandering into the shell
   workstream's database, but it cannot stop two runs of *this* harness colliding.
2. **§12 first.** A jest worker is being killed by SIGSEGV roughly one run in three at 530
   suites, and the battery's `unit` step IS `npm test`, run 113 times.

   **I first wrote here that a SIGSEGV would be scored as a killed mutant. That was wrong, and
   I am recording the correction rather than quietly deleting it, because the runner deserves
   the credit and because a reader checking my work should see the claim tested.** The runner
   handles exactly this case, and says so in its own comment: *"a jest run that dies (a killed
   worker, an out-of-memory child) exits non-zero and writes nothing, and reading that as
   'nothing failed' turns a crash into a SURVIVED mutant"*. `failedTests` returns a **problem**
   for a report that was never written, that does not parse, or that contains a file with
   `testExecError` or a failed file with no failed assertion; any problem sets `unexplained`,
   and the status ladder is `live-killed → build-killed → UNEXPECTED → pending/SURVIVED`. So a
   crash that takes down the suite holding the declared killer yields **UNEXPECTED**, never a
   credited kill and never a false SURVIVED. This hardening came from CKPT-W0 review finding 4.

   The real consequence is therefore **loud, not silent**: with the crash at ~1 run in 3 across
   113 unit-step mutants, a large fraction would report UNEXPECTED for a reason that has
   nothing to do with the mutant. The run would be unusable and would exit 1 — it would not
   manufacture evidence. That is a much better failure mode, and it is still a reason to fix
   §12 before spending 23 hours.

This is also why the report does not present the unexecuted batteries as merely "not yet
done": on the current tree they could not be run *usefully* even with the time.

## §9.5 What the executed batteries showed

Every battery that ran, ran to `AS-DECLARED` with **SURVIVED 0, UNEXPECTED 0 and mismatches 0**
(see §9.1 for the per-battery figures; the reports are in `…/p6-gates/w1/batteries/`). So where
the evidence exists, it is clean — the fences those mutants attack are load-bearing.

Two observations worth carrying forward.

### (a) Every kill is `[GW]`, and none is evidence — correctly

`live_evidence_mutants` is **empty** for every executed battery. The runner's own
`evidence_rule` explains why, and it is right to: `evidence` is set only for a killer tagged
`[HTTP]` failing in the live step, and it records that it does **not** verify the two further
§0.5 duties — that the record was minted by a production trigger with D-17 provenance (in
Wave 1 `test:widgets:http` reports `mint_provenance.captured = 0`, and every `[HTTP]` killer
runs on a `Fixtures.widget`-minted record), and that an L claim also needs a BIN line for the
same test id.

This is the §11 BUILT/EVIDENCED line holding in the runner rather than in prose: 24 mutants
killed, **zero evidence claims**. A wave that flipped a clause on these kills would be
overclaiming, and the tooling refuses to let it.

### (b) The live baseline is not clean IN THE MIRROR — one test, already handled

`gate8`'s baseline control records `exits: {live: 1}` with one failing test:

```
Gate 11 — the witness lane refuses while it is unbound, and its twin still passes (C11:4731)
G11-N4d-SHAPE: the §3.8 body a witnessed record is submitted with carries no noun, handle or witness
```

**That test PASSES in the repository**: the full `test:widgets:live` on the final HEAD is rc=0,
12 suites / 244 tests, with no failures at all. It fails only in the runner's mirror, which is
the "path that resolves differently through the mirror's links" the runner's own header
anticipates.

**It is handled, and no result here depends on it.** The baseline control exists precisely for
this: a killer already red on the unmutated mirror is reported `vacuous` and never counted as a
kill (CKPT-W0 review finding 4). And no battery names `G11-N4d-SHAPE` as a killer at all —
`grep` over all 19 declarations returns nothing — so not one mutant's status is affected.

Recorded anyway, for two reasons: it is the kind of mirror/repository divergence that would
silently hollow out a battery if a future unit *did* name that test as a killer, and it is a
standing red that someone should explain rather than inherit. **Owner: whoever runs the full
set** — it costs nothing to diagnose while the mirror is already up, and the answer belongs in
the next checkpoint's record.

## §9.6 `gate8r` came back MISMATCH — and it is §12, not a broken fence

This is the most useful thing the partial battery run produced, and it probably closes §5.3(b).

`gate8r` ran all 29 mutants and returned **rc=1, `status: MISMATCH`, `mismatches: 2`**:

```
by-status: { "live-killed": 25, "build-killed": 2, "UNEXPECTED": 2 }
```

All 25 live-killed mutants landed exactly as declared. The two that did not are **`M13b`** and
**`M15`**, both `expect: build-killed`, both with the same single problem:

```
problems: ["plain: unit.json: jest wrote no report; the run did not finish"]
exits:    { "unit": 1, "typecheck": 0, "k3": 0 }
killedBy: []
```

The unit step **exited 1 and wrote no JSON report**, so the runner could not see which tests
failed, found no declared killer, and — correctly, per its status ladder — reported
`UNEXPECTED` rather than inventing a kill or a SURVIVED.

### `M13b` was in fact killed by its declared killer

`M13b` declares exactly one killer, **`T15`**. The runner keeps the last 20 lines of the step's
output, and for `M13b` they are:

```
  363 |       for (const v of verdicts) {
> 364 |         expect(detail(v)).not.toContain(marker);
        at Object.<anonymous> (widgets/gates/gate8r.spec.ts:364:31)
```

`gate8r.spec.ts:355` is `it('T15 (unit half): no refusal detail carries the affirmation, the
ref or the body hash', …)` and line 364 is its first assertion. **The declared killer failed.
`M13b` is `build-killed`, exactly as declared, and its `UNEXPECTED` is an artifact of the
missing report — not a defect in the mutant, the killer or the fence.**

`M15` (killer `T-SRC-8R`) shows the same signature — `unit` exit 1, no report — but its kept
tail does not happen to include the failure, so **I am not asserting the same for it**. It is
consistent with the same cause and unproven.

### Why this matters

An earlier record carried "**~21 mutants not at their declared status**" as an open item, and
§5.3(b) left it unsettled because nothing had been executed. Here, 2 of the 4 unit-step mutants
that ran produced this artifact — **a rate consistent with §12's ~1-in-3 crash** — and one of
the two is provably a correct kill misreported.

So the likely shape of that open item is: **not ~21 broken fences, but ~21 unit-step runs that
died before writing their report.** I have proved it for one mutant out of 203 and measured the
rate on four. **That is a hypothesis with evidence, not a conclusion** — settling it needs the
full set re-run after §12 is fixed.

It does, however, sharpen §9.4's advice to a single instruction: **fix §12 before spending the
17 hours.** On the current tree roughly a third of the 113 build-killed mutants would come back
`UNEXPECTED` for reasons that have nothing to do with the mutants, and the run would have to be
thrown away. The run would fail loudly rather than falsely — the runner's handling here is
exactly right — but it would still be 17 hours spent on noise.
