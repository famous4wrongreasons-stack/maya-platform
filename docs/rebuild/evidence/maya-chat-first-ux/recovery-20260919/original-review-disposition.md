# Recovered original ten-finding review disposition

Recovered verbatim from the original Claude tool payload, retained privately as `transcript-recovery/dev-002.txt`. This is historical evidence, **not a current verification result**. In particular, finding 10’s claim that all nineteen batteries ran is not accepted: the new execution reports determine that independently.

## 4. Disposition of the ten review findings

Every finding was re-verified against the tree at `4da8954f` before anything was changed. **All ten are
CONFIRMED**, one (5) with a correction to its claim. None was refuted.

| # | Sev | Verdict | How it was verified, and what was done |
|---|---|---|---|
| **1** | high | **CONFIRMED — fixed** (`101040ec`) | `noun-resolution.ts:150` reads `ACTUATING` (5 members, `effect-sets.ts:16-22`); `gate11.ts:94-97` throws on A0/N0; `NOUN_RESOLUTION_PORTS_UNBOUND` is the production value (`widgets.module.ts:71`); `gate11.spec.ts:326-327` pinned `REFINE: 'A1', CONTROL: 'A1'` for an EMPTY `frozenNouns`. The reachability claim is false at the source: plan §0.1 D-4 says «No `DRAFT`/`REQUEST_APPROVAL`/`COMMIT` is minted», and AREA-C F-3 (line 31) says the same three; AREA-C §2.1.4 line 250 nonetheless writes «Unreachable by F-3 before discharge». C11:4731 gives row 11 the antecedent «each frozen noun» and the single outcome `SUPERSEDED / handle_stale`. Narrowed to the three D-4 blocks, stated in Gate 11's own file. |
| **2** | medium | **CONFIRMED — fixed** (`ff6e695d`) | `reason-table.ts` has no `mechanism_absent` row (grep rc=1); `reason-text.ts:31,48` falls back to `widget.limitation.provider_silent` = «Источник пока не отвечает.»; `widgets.controller.ts:91` called it for every code; `denial-projection.ts:15-31` cites P10(b) scoped to `C9_DENIAL_PROJECTION`; `refusal-codes-covered.spec.ts:206` is `it.failing`. Merge-B §1 confirms the wall is slot 9, and `lowering.gate.ts:19-23` refuses `mechanism_absent` there — so it was the answer to every conformant submission. |
| **3** | medium | **CONFIRMED — fixed** (`0b384c38`) | `gate-files.source.spec.ts:30-35` scopes the scan to `__dirname`; `input-validation.gate.ts:56-59` and `lowering.gate.ts:19-23` write three real codes outside it; `grep -rln RefusalCode src/widgets` returns no spec under either directory. **Demonstrated, not argued:** a real `refuse('invented' as RefusalCode, 'x')` planted in `input-validation.gate.ts` leaves the old fence rc=0 and turns the new one rc=1. |
| **4** | medium | **CONFIRMED — fixed** (`8cee26ba`) | `intent-gateway.service.ts:629-638` used `this.prisma`; slot 7 called it from inside `inTransactionSlots`; `input-validation.gate.ts:65-68` called `reader.read` with two arguments, so `lowering-source.read.ts:62`'s `client` default took `this.prisma` — while `:34-39` documents that parameter as the seam for `T`. Both now read through `T`, with `D-1-TX` as the fence. |
| **5** | low | **CONFIRMED, with one correction — pinned** (`c354a2a4`) | `widgets.module.ts:44-56` does declare `IntentGatewayService`, `SealService`, `SealVerifierService` and `SEAL_VERIFIER` in one `providers` array, and Merge-A did not list it under §5 Deviations. **Correction:** the CONTRACT property (B-22 / AMB-40, C11:7217 — «there is no fourth holder of the seal key») holds, and SEAL-5 proves it at the import graph; what is violated is the PLAN's wording of P-SEAL's scope, at the DI container. Landing `emission.module.ts` would take P-MINT-CORE's files at a checkpoint, so the deviation is recorded (DEV-W1-3) and pinned by `SEAL-5c` until that move. |
| **6** | high | **CONFIRMED — fixed** (`3da48069`) | `--gate P-principal` is rc=2 at `4da8954f`, `P-M12: find occurs 0 times`. Counted per commit: the anchor resolves 1× at `080f32b3` and 0× from `97982a93` (P-F88's brace import) on. `--shards ""` lists `P-principal`, so the CI shard exits 2 too. No `--gate P-principal` log exists in `logs/mergeA` or `logs/mergeB`. Re-anchored; rc=0, 12 mutants. |
| **7** | high | **CONFIRMED — fixed** (`3da48069`) | `mergeB-4.json` marks 2 and `mergeB-8r.json` 9 mutants `live_evidence: true`, 11 in all, each with an `"entry": "HTTP", "evidence": true` kill — against MERGE-B-REPORT.md §4.2's «`live_evidence` is `false` on every kill». `mint_provenance.captured = 0` in the wave's own FINAL-09 log, so no record under any of them is trigger-minted. The unstated second half checks out exactly: **13 of gate 8-R's 25** live-killed mutants (M24, M9, M5a, M5b, M6, M7, M8, M10, M16, M18, M19, M20, M11) have ONLY untagged `[RI]` killers. |
| **8** | medium | **CONFIRMED — fixed** (`2720435e`) | `principal.live-spec.ts:679` made no submission and asserted `String(slot2?.run)`; its inline comment was stale since `5a1c1377`; `gateP-principal.json#P-M9` names it with `expect: "live-killed"`; §3.2 Gate 2 assigns it the L-T carrier role. Rewritten to submit and assert `outcome`, `code`, the in-array stop, `gates_run` and NW — and the `[E-INDEP]` label is DROPPED, which HAR-12 (D-17 (3)) enforced the moment the rewrite kept it. |
| **9** | medium | **CONFIRMED — fixed** (`3da48069`) | `widgets-mutation-battery.mjs:479` matches `x.title` alone and `killerMatches` needs a leading token; `T-SRC-INV30` was only on the `describe` at line 99, and all four `it` titles began with other words. `gate8r.json#M21` still named only `T-SRC-8R`, so MERGE-B §2's claim was wrong on both counts. Ids prefixed, M21 re-pointed to both fences, and a dead killer id is now a load-time usage error with its own self-test arm. |
| **10** | medium | **CONFIRMED — run in this phase** | `logs/mergeB` holds `BAT-{4,6,7,8,8c,8r,9a,10a,11,12,12k}.log` and no `BAT-P-*`; `logs/mergeA` holds no `--gate` run for any battery (only `f88-battery-1.log`, the contract-generator script). The only gateP runs on disk, `mut/p-25-*.json` and `mut/p-seal-*.json`, are timestamped 23:26 and 23:34 — inside the units' implementation windows, before any merge commit. §2 above runs **all 19 declared batteries** on the merged tree. |

### 4.1 What the fixes found that the review did not

- **A second dead killer id, caught by finding 9's own new check.** Its first run refused
  `gate8.json#M-NULL-PASS: killer T-NULL-OBJ names no test`. That one is a FALSE POSITIVE and the check
  was corrected, not the battery: `T-NULL-OBJ` and `T-NULL-EMPTY` are `it.each` table rows that jest
  substitutes into a `'%s [GW]: …'` title, so the tests really are named after them. The check reads
  `it.each` tables when — and only when — the title interpolates. `T-SRC-INV30` on a `describe` is still
  refused, which the runner's self-test proves by planting exactly that mutant and requiring exit 2.
- **`effect-sets.ts#ACTUATING` now has no importer at all.** Gate 11 was its last reader. The export is
  deliberately NOT deleted: `mutations/gate8r.json#M2b` re-adds the import to restore the effect-keyed
  antecedent row 8-R names as its own defect, and a mutant that stopped compiling would be build-killed
  instead of live-killed — a weaker proof. R7-4 (Merge-B §6 item 1) is therefore a deletion for a unit
  that also re-points M2b, not for this checkpoint.
- **A gate-7 twin for the pipeline-wide fence is owed.** The review demonstrated (REV-M2) that a planted
  `profileId` read in `gate7.ts` is caught by `T-SRC-INV30` but credited to nobody. M21 now names the
  pipeline-wide id, so the fence is creditable; a mutant that exercises it OUTSIDE slot 8-R belongs in
  `gate7.json`, which is U7a's file. Recorded as owed rather than invented here.
