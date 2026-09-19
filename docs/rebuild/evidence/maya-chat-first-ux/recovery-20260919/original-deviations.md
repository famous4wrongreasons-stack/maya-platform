# Recovered original Wave 1 deviations — historical evidence only

Recovered 2026-09-19 from a Claude `Bash` tool payload recorded at
`2026-09-18T04:48:43.676Z` (session `5b9153c0-ea00-4736-9109-0cab2643f8e1`,
workflow `wf_27070595-b62`, agent `a588477daf5063319`
(`agent-a588477daf5063319.jsonl`, line 871)). The original target was
`p6-gates/w1/ckptw1-deviations.md`, subsequently lost with the scratchpad.

The text below is recovered verbatim, not a new ruling. Its claims that all batteries
ran are historical claims requiring independent verification; they are NOT accepted
as results. In particular, DEV-W1-7 describes the earlier no-push instruction, which
the current owner's explicit recovery-checkpoint authorization supersedes.

## 6. Deviations

**DEV-W1-1 — review fixes inside merged units' exclusive files.** Permitted by the phase brief («do not
rewrite a unit's exclusive files except for a review fix, and record it»), recorded per file and named in
the commit that carries it:

| File | Unit | What changed, and why it changes nothing the unit asserts |
|---|---|---|
| `gates/gate11.ts`, `gate11.spec.ts`, `noun-resolution/noun-resolution.ts` | U11a | Finding 1. `G11-N9-k` is re-pinned (`REFINE`/`CONTROL` → row `'P'`) and `G11-N9-l` added. The unit's claim — that the applicability table is total and has six rows with no default — is untouched; what changed is which effects the noun-less row covers. |
| `rendering/reason-text.ts`, `refusal-codes-covered.spec.ts` | P-RENDER | Finding 2. `reasonText` keeps its signature, which is REN-4's fence; `reasonTextOrNull` is added beside it and `REN-3b` is added. REN-1 and REN-3 are unchanged. |
| `emission/seal-h6.architecture.spec.ts` | P-SEAL | Finding 5. `SEAL-5c` added; SEAL-4 and the four SEAL-5 arms untouched. |
| `input-validation/input-validation.gate.ts`, `stores/lowering-source.read.ts` | U8a | Finding 4. `InputValidationGate.run` takes `T` and binds it to the port; `runInputValidation` and the gate's decision order are untouched, and the gate file still names no store client (GATE-FILE). |
| `test/widgets-live/gate8-input.live-spec.ts` | U8a | Finding 4. `T-READ-ONCE` reads the call positionally and asserts the third argument — strictly stronger than the two-argument equality it replaces. |
| `test/widgets-live/principal.live-spec.ts` | P-PRINCIPAL | Finding 8. `G2-IN` rewritten; every other PR-* test untouched. |
| `test/widgets-live/mutations/gateP-principal.json` | P-PRINCIPAL | Finding 6. P-M12's first edit re-anchored. Same two edits, same killers, same `expect`. |
| `test/widgets-live/mutations/gate8r.json` | U8R | Finding 9. M21 names `T-SRC-INV30-b` as well as `T-SRC-8R`. Same edit, same `expect`. |

**DEV-W1-2 — `mechanism_absent` renders as nothing, not as PROVIDER_SILENT (finding 2).** D-10 fixes the
CODE's life-cycle («`mechanism_absent` … leaves `RefusalCode` in U8b's merge; P-RENDER's interlock stays
red until then») but says nothing about what the route should render for it meanwhile. This phase chose
`null` over P10(b)'s borrowed phrase. It is recorded as a deviation because it is a plan-silent choice
about a live response member, and because it is visible: a `mechanism_absent` response carries
`reason_text: null` until U8b. `REN-3b` is the ratchet, and REN-3/REN-1 keep the interim from covering a
second code.

**DEV-W1-3 — B-22's DI-level property is pinned, not satisfied (finding 5).** `SealService`,
`SealVerifierService` and `SEAL_VERIFIER` remain providers of `WidgetsModule`, which also declares
`IntentGatewayService`, so P-SEAL's «the gateway module never holds the key» is not literally true at the
container. The CONTRACT property (B-22 / AMB-40, C11:7217) holds and SEAL-5 proves it at the import
graph. Landing `emission.module.ts` would take P-MINT-CORE's files at a checkpoint. `SEAL-5c` pins the
gateway's constructor and the single provider site until P-MINT-CORE's merge moves them. **This corrects
MERGE-A-REPORT.md §2's IR-SEAL-1 row**, which recorded «B-22 holds either way» without listing it as a
deviation.

**DEV-W1-4 — `scripts/widgets-mutation-battery.mjs` is left prettier-unclean**, continuing Merge-B's
DEV-B7. The file was already unclean at `4da8954f` (verified: `git show HEAD:…` piped to
`prettier --check` is rc=1 BEFORE any edit of mine), `npm run lint` globs `"{src,apps,libs,test,scripts}/**/*.ts"`
and so does not cover it, and no checker in `run-all-checks.sh` does either. A `prettier --write` would
reformat hundreds of lines this phase never touched. `npx prettier --write` was run on exactly four named
`.ts` files, never `npm run format` or `lint:fix`.

**DEV-W1-5 — the `--gate <id> --dry-run` sweep is now a load-time rule instead of a ritual.** The review's
fix for finding 6 asks for «`--gate <id> --dry-run` for EVERY declared battery … to the per-merge exit
list and to the closing regression». The closing regression does run all nineteen. Rather than also
adding a step every future merge must remember, the rot that finding 6 and finding 9 are two instances of
— a dead `find` anchor, a dead killer id — now fails the runner's LOAD, so any invocation of any battery,
including a single `--gate`, refuses. `node scripts/widgets-mutation-battery.mjs --dry-run` with no
`--gate` validates all nineteen in one call and is what the self-test asserts.

**DEV-W1-6 — a gate-7 twin for `T-SRC-INV30` is owed, not invented here.** See §4.1.

**DEV-W1-7 — §2.5 step 7 (push and CI dispatch) is not performed.** The phase brief says «Do not push»,
so the branch is not pushed, `widgets-mutation.yml` is not dispatched, and no CI run ids are recorded.
Every battery in §2 ran locally instead, serialized through the one mirror lock. The CI half of §2.5 (7)
remains owed to whoever pushes the wave.
