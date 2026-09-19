# Recovered full gate programme — historical reconstruction, not a new approval

Preserved during recovery on 2026-09-19. Source: the durable `.maya-program/GATES-PLAN-V11.md` reconstruction; original bytes SHA-256: `0fdff2031549173ad13146ddec72d33e5ebe6ed7f27d6a1d32c7ffc1cfc19a71`.

The original reconstruction tags `[REC·rev]`, `[REC·pre]`, `[RECON]` and `[DERIVED]` remain below. They identify different provenance strengths. This file does not supersede Widget Contract V1.1, its owner decision record or executable repository evidence. Historical completion claims and commands are not current approvals or current results. The recovery report independently checks Wave 1. **Gate Wave 2 is not started by preserving this document.** Later-wave prescriptions are retained as evidence for a future authorized cycle, not newly certified here. Old scratchpad paths, process IDs, database ports and no-push instructions must not be executed as current operational directions.

---

# GATES-PLAN-V11 — Gates 1–14 to LIVE CONTRACT-COMPLETE on the proof-DB live path (Contract V1.1)

Plan only. Nothing in the repository was written by the plan itself. Written 2026-09-17 for step 2 («Remaining gate
units, включая Gate 9 Option A») and step 3 («Довести live path до contract-complete gates») of the owner's order.
Revised the same day after an adversarial review: 31 findings, all verified against the sources and applied in place
(REVIEW DISPOSITION, at the end).

> ## RECONSTRUCTION BANNER — read before using this file
>
> The original `GATES-PLAN-V11.md` lived in `/private/tmp/…/scratchpad/p6-gates/` and was destroyed by system
> cleanup on 2026-09-18. This file is a reconstruction assembled on 2026-09-19 from, in order of authority:
>
> 1. `recovered/GATES-PLAN-V11.md` — §0 of the **pre-review** plan, 330 lines, byte-exact.
> 2. `recovered/gatesplan_chunks/` — eight raw transcript chunks: the Write/Bash payloads of the agent that wrote
>    and then revised the plan. Chunks 003 and 004 are Python `PAIRS = [(old, new), …]` revision lists; chunks 005–008
>    are the `cat >>` heredocs that appended REVIEW DISPOSITION, §1, §2–§4 and Appendix A.
> 3. The repository at `df6c3a5a`: the committed `gate-conformance-audit.json` (schema `/2`) and
>    `gate-clause-inventory.json`, both generated *from* the revised plan by unit I-AUD0/I-HAR, and the merged
>    Wave 0/Wave 1 code and unit commits.
> 4. Decision Sheets 06 and 07, Contract V1.1 §3.9 and the ruling packet.
>
> **Provenance legend.** Every section and, where they differ, every row carries one of:
>
> | Tag | Meaning |
> |---|---|
> | `[REC·rev]` | Recovered, in the **revised** (post-review) wording. Use as written. |
> | `[REC·pre]` | Recovered, but only in the **pre-review** wording; no revision chunk covers it, and the review may or may not have touched it. Read the REVIEW DISPOSITION row before relying on a number. |
> | `[RECON]` | **RECONSTRUCTED — verify before use.** Rebuilt from the audit JSON, the inventory, the REVIEW DISPOSITION or the repository. It says what must be true, never what was proven. |
> | `[DERIVED]` | Recovered indirectly but exactly: the committed artifact was machine-generated from the lost section, so the text round-trips. |
>
> **No evidence in this file was re-run.** Where a reconstructed card names an exit test, that test is a *duty*, not a
> result. Nothing here may be quoted as proof that a test passed.

## Pins  `[REC·rev]`

- **Repository (read only for the plan):**
  `/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent`,
  plan HEAD `d5ecca98` (re-pinned from `c7cca0e2`; `d5ecca98` is the shell commit «served Maya Web Shell P1-NOW»,
  which changes no backend file and leaves the contract SHA unchanged; the tree was clean). Code paths are relative to
  `maya-saas-backend/` unless they start with `docs/`, `.github/` or `scratchpad/`.
  **Programme HEAD today is `df6c3a5a`** (Wave 0 merged and pushed through `a2f98a52`; Wave 1's 33 commits merged and
  **not pushed**). `[RECON]`
- **Contract:** `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md`, version 1.1, SHA-256
  `606d7f99da5fe1977d5efe737dca91a04f2b11faecddbd666120d34a03e94a8a` (re-verified), 7415 lines. `C11:n` is a line of
  that file. The §3.9 table is C11:4718-4734, «Gate 6 in full» C11:4736-4798, «Gate 10 in full» C11:4800-4876,
  Annex C C11:7007-7415.
- **Line map:** `scratchpad/p4-v11/final/gen/contract-v1-to-v1.1-linemap.json`. Its `v11_sha256` equals the committed
  SHA. The copy in `p4-v11/challenge/` maps to the pre-c2 build and is off by about 145 lines, so it is not used.
- **Inputs, read in full:**
  - AREA-A `scratchpad/p6-gates/AREA-g6-8r.md` (Gates 6, 7, 8, 8-R)
  - AREA-B `scratchpad/p6-gates/AREA-g9-10.md` (Gates 9, 10)
  - AREA-C `scratchpad/p6-gates/AREA-g11-13-prereq.md` (Gates 11, 12, 13, the prerequisites, and Gates 1, 3, 5)

  **All three AREA files were in the wiped scratchpad and are NOT recovered.** Cards that say "AREA-x §n as stated"
  are therefore pointers into a lost document; the merged Wave 1 code is now the best record of what they said.
  `[RECON]`
- **Also used:**
  - `scratchpad/p1-gates/INTEGRATION-PLAN.md` (PLAN) and its specs — **recovered**, at
    `.maya-program/recovered/INTEGRATION-PLAN.md`.
  - `docs/rebuild/DECISION-SHEET-04-RULING-PACKET.md` (`PKT:n`), with engineering choices at PKT:359-416 and the
    settled list at PKT:462-493
  - Sheet 06 (`S6-n`), Sheet 07 (`S7-n`, written from this plan) and Sheet 03 lines 3-8 (DS-03 A)
  - `docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json` (AUD)
- **Proof DB:** `postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_gates`, cluster `scratchpad/pg-live/data`.
  Never 5432. This is the programme's **own** database: since `d5ecca98` the shell workstream pins
  `maya_widget_gate_proof_local` on the same cluster and writes tenants and users into it with raw SQL
  (`maya-chat-shell/dev/local-api-env.mjs`, `local-api-fixture.mjs`). The programme never drops, recreates, migrates or
  seeds `_local`. The widgets-live guard admits `^maya_widget_gate_proof_[a-z0-9_]+$`
  (`test/widgets-live/support/proof-db-guard.ts`), so `_gates` needs no guard change.
  **Since `6a1349fe` the guard also refuses `maya_widget_gate_proof_local` BY NAME, in either mode.** `[RECON]`
- **Other databases on 55611 (integrator-created, §2.5):** `maya_c06_gates_w<n>` for `action-engine:proof:ts` (its
  guard requires `maya_c06_*`), `maya_c06_appointment_gates_w<n>` for `action-engine:appointment-proof:ts`
  (`maya_c06_appointment_*`), and `maya_gates_smoke_w<n>`, migrated **and seeded**, for `test:e2e` and `test:http`
  (`http-smoke.ts:855` asserts the seeded `business_plus` plan).
- **Standing rules applied, not reopened:**
  - DS-03 A for Gate 9.
  - Gate 10 refuses on effect-class divergence, with A3's router, same-owner and null readings.
  - `WIDGET_CAPABILITY_POLICY` Option A.
  - Gate 14 stays in `CanonicalActionIngressService`.
  - No invented refusal codes. One admission pipeline.
  - `widgets.runtime` stays dark in production and is granted only to tenants on the guarded proof DB.
  - GATE MODULE EXISTS ≠ GATE ENFORCED. A function-level unit test is not live proof.
  - Packet engineering choices are built only where certified V1.1 text already permits them (C11:7394-7413).
  - No git worktrees, stash, gc or prune (PROGRAM.md).

## Bottom line  `[REC·rev]`

1. **Honest starting point: 0/15, not 6/15.** The audit's 6/15 was scored against V1 clause lists and V1 line anchors,
   and it counted module presence. Against V1.1 and this plan's evidence rules:
   - **Gate 1** has no "HMAC valid", no "`widget_id` matches", and no L8 outcome or R3.9.4 successor.
   - **Gate 3** compares a local sha256, not `c9PrincipalHash` (K4, C11:2546).
   - **Gate 4** does not call `TenantContextService.assertTenantId` (C11:4723).
   - **Gate 5** lacks the `SUPERSEDED` outcome, the successor, the `widget_floor_divergence` counter and the K1/K2
     level derivation.
   - **Gate 2** is a constant pass in slot 2 (`run: () => ({ outcome: 'pass' })`), and nothing shows the widget route
     resolves the session "exactly as for a typed message" (D-16, G2-EQ).
   - **Gate 14** is a `terminate` pointer in slot 14. No widget submission reaches
     `CanonicalActionIngressService.prepare()` before a live COMMIT exists (D-4, E2). The ingress anchors and
     `action-engine:proof` show that the module exists, not that the gate is enforced on the widget path.
   - (AREA-C F-1; this plan adds Gates 2, 4 and 14.)
2. **Everything in Waves 0–5 can be built with no new owner decision:** 46 units. The pipeline ends fully built, with
   no `pending()` slot, and with LIVE evidence on production-minted non-actuating records. The records are minted
   **without a model call** through T-2b (`POST /api/ai/tools/:toolName/execute`, a registered capability read
   endpoint, L1 (2)); the model transport is never stubbed (D-15).
3. **Ceilings.**

   | Stage | Strict: every clause L or L-T | Counting U-class clauses |
   |---|---|---|
   | After Wave 5, no owner answer | **3/15** (1, 2, 4) | **6/15** (+3, +5, +10), if OD-3 is accepted and P-MT3 delivers G3-e |
   | After OD-1 + OD-2 (P-01 discharge) and Wave 6 | **up to 7/15** (+6, +7, +12, +14). Gates 6 and 13 also need the landing-route verification (§0.3); Gate 6 needs P-MT1; Gate 7 needs P-MT3; Gate 12 is conditional on OD-5 | **up to 12/15** (+3, +5, +8-R, +10, +11), if OD-3 is accepted; **13/15** only if P-17 (K13) also delivers `control.delivery.resolve` (+13) |

   Strict **15/15 cannot be reached this cycle.** Eight gates carry clauses with no conformant input by settled scope
   or certified text, or clauses no unit in this plan builds:
   - Gate 3: G3-c2 and G3-f, no CLIENT_CHANNEL or Telegram token carrier (K14-10, PKT:485).
   - Gate 5: G5-f, no conformant shortfall (K6 C11:2550, F53 C11:1126), and step-up has no package (P-12, C11:6635).
   - Gate 8: the phone half of G8-5 (PKT:469); G8-3, G8-4, the text half of G8-5 and G8-DENY have no registered
     bounds source or normalizer (AMB-21d is an unapproved engineering choice, so they are `false`, not U).
   - Gate 8-R: R-2…R-5 (PKT:471).
   - Gate 9: 9.6 needs the typed chat ingress to persist user turns through the same writer (P-03/K5), which is not
     built this cycle.
   - Gate 10: row 5 is unreachable, because class `c` is permitted on no kind (C11:2801).
   - Gates 11 and 13: approval decisions (C11:5073; SH-11, PKT:476).
   - **Gates 8 and 9 do not reach COMPLETE-U either.**
4. **The biggest cap is not a gate. It is §A2.**
   - A2.2 (C11:6723) and settled AMB-01b (PKT:465) forbid minting any `DRAFT`, `REQUEST_APPROVAL` or `COMMIT` until
     P-01 is discharged. For Gate 6's subjects, P-23, P-26 and P-30 must also be discharged (C11:4781).
   - P-01 cannot be discharged while Gate 13's `NAVIGATE` edge is this plan's fail-closed interim (**DEV-1**, §0.4).
     S6-4 itself changes no clause (C.2 A5, C11:7173). The interim is a plan choice, forced for `detail`/`w`
     re-projection because the only source of the capability, `provenance.source_capability`, fails §0.4 F15
     (C11:7373). A2.6(3) (C11:6738) forbids discharging a partial mechanism.
   - **Every actuating clause** of Gates 6, 7, 8-R, 11 and 13 is therefore BLOCKED-DISCHARGE until OD-1 and OD-2 are
     answered. At I-AUD0 that is **25 keys**.
   - AREA-A §3.1 planned to evidence booking `COMMIT` clauses on RM-D records before discharge. This plan withdraws
     that (decision D-4).

---

## §0 Rulings, blockers, STOPs and scoring

### §0.1 Integrator decisions that reconcile the three areas (binding on implementers)

D-1…D-15 are recovered pre-review; D-2, D-8, D-11, D-13 and D-15 are recovered in their **revised** form, and
D-16…D-18 are revision-only rows. D-19 exists in the revised plan (chunk 004 cites «the proof database is
`maya_widget_gate_proof_gates` (D-19)») but its table row was not captured; it is rebuilt from the I-AUD0 audit note.

| # | Conflict | Decision | Why it is within text | Prov. |
|---|---|---|---|---|
| **D-1** | **Transaction scope.** AREA-A: one transaction from before the principal slot until the pipeline returns. AREA-B (REQ-TX): open by slot 9 and commit after slot 10. AREA-C: a short principal transaction committed before slot 1. | **One request transaction `T`.** `submit()` opens it (interactive, `ReadCommitted`, explicit timeout) before the principal read and the record read. The principal adapter and the tenancy owner's Membership read run in `T`. Slots 9 and 10 write only through `T`. `T` commits when a slot ≤ 10 returns a non-pass verdict, or when slot 10 returns. It rolls back on any throw. Slots 11–13 run after the commit, so no row lock or advisory lock is held while owners run. | K1 "inside the request transaction" (C11:2539); B-02 "Membership read inside the request transaction (FOR SHARE…)" (C11:7189); «Gate 10 in full» "in the request transaction" (C11:4861). One phrase means one transaction. AREA-C's short transaction would create two transactions with that name. | `[REC·pre]` |
| **D-2** | Principal as fact `authority` (AREA-A R6-3) or as base member (AREA-C D-3) | **Base member `ctx.principal`**, set before slot 1: `{ authority: C9Principal; role: string \| null; presentationMode; verificationLevel; proofHash } \| null`. `authority` leaves `AdmissionFacts`/`FACT_SLOTS`. `principal === null` (`C9Authority.current` denied a session the transport admitted) is refused at **slot 3** under D-16, not at slot 2. `presentationMode` is carried for presentation only; slot 6 and its owner ports never read it (FR-14, G6-FR14). | Gate 1's R3.9.4 issuance and Gate 3 read the principal before slot 2, and a fact produced at slot 2 or later cannot be read at slot 1 (J-1). | `[REC·rev]` |
| **D-3** | Evidence classes: AREA-A proposes E-MINT/HOSTILE/DRIFT/INDEP/TAMPER; AREA-B allows no synthetic update on the path; AREA-C proposes U-CONSTRUCT | Clause states **L**, **L-T**, **U**, plus STOPPED, BLOCKED-DISCHARGE and false (§0.5). L-T only for defence-in-depth refusals, only with an L positive for the same clause and live-killed mutants, and never for Gate 9/10 clauses. U never counts toward the strict headline. Both counts are always printed. | Evidence discipline changes no contract meaning. Whether U satisfies the owner's "15/15" is the owner's call (OD-3). | `[REC·pre]` |
| **D-4** | Actuating evidence before discharge (AREA-A RM-D vs AREA-C F-3) | **No `DRAFT`/`REQUEST_APPROVAL`/`COMMIT` is minted on the proof DB until P-DISCHARGE (Wave 6).** Actuating clauses are built and tested G-SYNTH before then, and flip only at E2. | A2.1/A2.2/A2.6(1) (C11:6719-6738): "no such branch", not even behind a pilot or allowlist; PKT:465. | `[REC·pre]` |
| **D-5** | Who generates `CHANNEL_TIER`/`TIER_EFFECTS` (AREA-A: U7), `KIND_OWNER_CLASS`/`ownerClassKeys` (AREA-B: U7's generator), K20 `emittable` (AREA-A: U7 `null`) | **One unit, U-TAB (Wave 0)**, owns `build-tables.mjs`, `tables.ts`, the new `owner-classes.ts` (`KIND_OWNER_CLASS`, runtime `ownerClassKeys`, `emittable`, `allowedKinds`) and `carriers/channel-profile.ts` (`carrierAdmits`). U7, U8R, U10a, P-MINT-CORE, P-G15 and the fitter import them. | AREA-B: "**one** implementation, shared by K20 `emittable`, `allowedKinds`, R3.9.4's remedy and Gate 10". | `[REC·pre]` |
| **D-6** | `authority/propose-pairing.ts` (U7 `null`) vs P-25 rows | **P-25 (Wave 1)** owns the file, with F38's rows (C11:755-774). U7 imports it. | AREA-A: engineering within the text. | `[REC·pre]` |
| **D-7** | U8b owns the codec, which the minter imports | **Split.** U8b-c (Wave 1) builds the pure `input-schema/{codec,parse-input-schema,input-schema-hash}.ts`. U8b (Wave 3) builds the gate's schema lane. | Removes the P-MINT ↔ U8b cycle. | `[REC·pre]` |
| **D-8** | Migration folds | **One integrator commit, I-MIG2 (first in Wave 2):** `WidgetIntentRecord.confirmationSubject` and `approvalDecision` (CHECKs), `WidgetIntentDivergenceAudit`, and dropping NOT NULL on `WidgetRenderReceipt.composedEnvelopeJson`/`emittedEnvelopeJson` and `WidgetDraft.diffJson`, all folded into `20260916120100_widget_layer_runtime`. Frozen numbers, RT5 and the mapping are updated in the same commit, and the proof DB is recreated. | A2 "the columns fold into migration 2 before its first deploy" (C11:7095). Production had 0 widget tables at the read-only snapshot of 2026-09-16T14:14Z (`pre-cutover-reconciliation.json`, ruling R1), and every deploy has been blocked since (Sheet 05 S5-1). The fold relies on that block; if any deploy happens first, the fold becomes a new migration. | `[REC·rev]` |
| **D-9** | Gate 4 was out of every area | **Unit U4** (Wave 1): slot 4 calls `TenantContextService.assertTenantId(record.tenantId)` through a tenancy port. A throw refuses `tenant_mismatch`. | Row 4 names the call (C11:4723). | `[REC·pre]` |
| **D-10** | Code mapping | AMB-02a and AMB-02b as published (PKT:362-367). An unregistered `normalizer_ref` refuses `use_secure_surface`, and an unregistered `bounds_source` refuses `bound_violation` (AREA-A). An AMB-27 stored/recomputed divergence refuses `readback_mismatch`. **`mechanism_absent` leaves slot 10 at U10b, leaves slot 8 at U8b, and leaves `RefusalCode` in U8b's merge (the later of the two in Wave 3); P-RENDER's interlock stays red until then.** `EXPIRED`/`SUPERSEDED` become response outcomes (L8, B-29) at P-G15a. | Rows 7, 8 and 8-R name the codes; C11:7396-7397. | `[REC·rev]` |
| **D-11** | Router residuals, Gate 9 residuals | Router residuals adopted as AREA-B states them: match by normalised equality with `renderUtterance`; order escape-first, then `issuedAt DESC, intentTokenHash ASC`, with the tapped record not privileged; Gate 9 appends on every submission (AMB-26d's packet wording is not carried); retries append until P-F88's `client_nonce` exists. **Gate 9 residual, narrowed to DS-03 A:** every render impossibility of the tapped interaction answers `superseded/handle_stale` with no write. That covers an erased record, an absent or blank template, an unresolvable label, erasure racing the write, an unknown slot, and a slot with ≠1 label. Only a pipeline construction defect throws: a Gate 8 fact missing after Gate 8 passed (a J-1 invariant, not a property of the frozen widget). To keep `handle_stale` from looping on refresh, P-MINT-CORE builds and tests the slotted-template mint rule (MINT-11). AREA-B's "shape defects throw" is **not** carried. | DS-03 A (Sheet 03:3-6) has no fault carve-out. R3.9.3 says "only a genuine **transport** fault may look like a fault" (C11:4902-4903); AREA-B's "R3.9.3 (C11:4897) lets a genuine fault look like a fault" misquotes it. AMB-23 is an unapproved engineering choice (C11:7397), built here only as a mint rule. | `[REC·rev]` |
| **D-12** | "No write" on a refusal vs the R3.9.4 successor | NW = zero durable writes to every `Widget*` model. The recorder separates `FOR SHARE`/advisory locks from durable writes (fixes AREA-B's P-PRINCIPAL warning). On the Gate 1/5 successor branches, "zero conversation writes" (R3.9.1) is asserted as **zero `WidgetTimelineTurn` writes**. Minter (2) writes exactly the remedy's own `IntentRecord`, and its emission is bound to the predecessor's turn (L7). | R3.9.1 (C11:4878-4882); R3.9.4 "its own `IntentRecord`" (C11:4915); timeline store = P-03 (C11:6620). | `[REC·pre]` |
| **D-13** | Checkpoints in one working tree | **Clean-export checkpoints of the whole commit:** `git archive "$SHA" \| tar -x` into `scratchpad/p6-gates/ckpt/<sha>` (about 240 MB of tracked files), with `node_modules` linked, as the mutation runner already does. It has no pathspec: 22 backend specs read `сайт и приложение/…` and 7 read `maya-os-site/…` at module load, and `k5-exit-gate.sh` builds `maya-chat-shell/`. The previous export is deleted once the next CKPT-M is green. No worktree and no stash. CKPT-M0 proves the export on HEAD before Wave 0. | PROGRAM.md hygiene. | `[REC·rev]` |
| **D-14** | Audit format | `gate-conformance-audit.json` moves to `maya.gate-conformance-audit/2`: per-clause state, evidence entries, mutant artifact ids and ruling pins. A checker is added to `run-all-checks.sh` (§3.3). | Makes "n/15" machine-checkable. | `[REC·pre]` |
| **D-15** | Minter (2) hook location (AREA-C D-5) and the model | **One in-process hook at the completion of a registered C9 READ inside `AiToolRuntimeService.execute`**, behind `widgets.runtime`, with **owner-side review** (not an owner decision). No route. Both production routes that execute a registered read reach it: **T-2b** `POST /api/ai/tools/:toolName/execute` (model-free) and **T-2a** `POST /api/ai/chat` (its pre-model preset reads, and any read after `model.decide()`). **Evidence never stubs the model transport.** Under the harness, `AI_CORE_PROVIDER` is `safe` and no provider key exists, so `decide()` returns null (`ai-core-model.service.ts:1323`). `/ai/chat` therefore runs only its `PRELOADABLE_TOOLS` presets (`ai-core.service.ts:426`) and the expenses completion (`:656`). Every envelope class that E1 needs is minted through T-2b, and P-MT2a's MT2-6 proves that. | L1 (2) "a registered capability read endpoint" (C11:5475); P-01's route count (C11:6618); SH-19 implementable (C11:7404). | `[REC·rev]` |
| **D-16** | Gate 2 "exactly as for a typed message" vs `C9Authority.current` | **Gate 2 is the transport session chain the typed route uses:** the same six global `APP_GUARD`s (`JwtAuthGuard` → `JwtStrategy.validate`, `RolesGuard`, `TenantAccessGuard`, `SubscriptionAccessGuard`, `FeatureGuard`, `QuotaGuard`), with no `@Public`, on `POST /api/ai/chat` and `POST /api/widgets/intent` alike. `C9Authority.current(T)` is the K1/K3 principal the gates read; it is not a second Gate 2. When the chain admits a principal but `C9Authority.current` denies it (a staff-class role without exactly one active Staff row; a tenant, membership or user that became inactive after the guard ran), that principal has no live proof hash and is refused at **slot 3** `widget_principal_mismatch`, never at slot 2. Slot 2 refuses `unauthenticated` in-array only when no transport session reached the gateway (defence in depth, L-T by E-INDEP). **G2-a flips only on G2-EQ**, a live principal matrix submitted to both routes on an entitled proof tenant, with equal admit/refuse at the transport stage. | Row 2 "exactly as for a typed message" (C11:4721). Row 3 "equals the live principal's proof hash" (C11:4722): with no live principal there is no equality. K1/K3/K5 (C11:2536-2548). The typed route resolves through `@CurrentUser()` and the global guards only (`ai-core.controller.ts:34-40`; `C9Authority` is referenced only under `src/orchestration` and `src/widgets`). Making `/api/ai/chat` resolve through `C9Authority` would change production chat for every tenant, outside the dark feature. | `[REC·rev]` |
| **D-17** | Provenance of evidence records | A record counts as trigger-minted only when the **server** says so. (1) The minter hook writes one structured line per mint through a dedicated logger context `WidgetMintProvenance`: trigger id, route, request id, `intent_token_hash`, `widget_id`. No PII. (2) In BIN, the runner captures the child process's stdout, which no test code can write. (3) In HTTP, a sink installed at bootstrap captures that logger context, and a BUILD test forbids any `*.live-spec.ts` or `*.cases.ts` from naming that context or calling `Fixtures.widget`, `Fixtures.synthetic`, `WidgetEmitterService.emit` or the record writer in a test labelled `[E-MINT]`, `[E-HOSTILE]`, `[E-DRIFT]`, `[E-TAMPER:…]` or `[E-INDEP]`. (4) The verifier cross-checks each manifest line against the captured mint lines **and** against the database **before teardown**. (5) An L claim needs an HTTP line and a BIN line with the same test id, both verified. No schema column is added. | Evidence discipline changes no contract meaning (D-3). An undeclared provenance column would change §3.7's record shape and the §4.4.3 classification. | `[REC·rev]` |
| **D-18** | Parallel implementation in one tree | **Implementers add; the integrator deletes.** An implementer never deletes a file or removes an export that another file imports; every deletion or export removal is an IR applied in the merge commit. **I-CTX lands slot seams:** slots 1, 4, 8, 9 and 10 call `gates/gate1.ts`, `gates/gate4.ts`, `input-validation/input-validation.gate.ts`, `lowering/lowering.gate.ts` and `gates/gate10.ts`, whose initial bodies reproduce today's behaviour (inline checks for 1 and 4; `pending()` for 8, 9 and 10). A unit then edits only its seam file. **Exits tagged `[GW]`, `[HTTP]` or `[BIN]` that need an IR (a provider, a module import, a controller member) are merge-step exits:** the integrator runs them in the merge commit, not the implementer in self-check. | §2.2. It removes the compile breaks that exclusive deletions caused in the shared graph (`intent-gateway.service.ts` imports `gateSensitiveDest` and `gate12`; `support/fixtures.ts` and `intent-submit-args.ts` import `principal.util`). | `[REC·rev]` |
| **D-19** | The proof database is shared with the concurrent shell workstream | **Separate databases on 55611.** The programme uses `maya_widget_gate_proof_gates` (plus `maya_c06_gates_w<n>`, `maya_c06_appointment_gates_w<n>` and `maya_gates_smoke_w<n>`) and **never touches `maya_widget_gate_proof_local`**, which the shell workstream pins. The cluster is stopped at CKPT-W only when no foreign connection is present (`pg_stat_activity`). | Review finding 26. The two workstreams share 127.0.0.1:55611; only a name-level fence keeps this harness from seeding and truncating the other side's evidence. | `[RECON]` — rebuilt from the I-AUD0 note's D-19 summary and chunk 004; the plan's own table row was not captured. The fence is now code (`proof-db-guard.ts`, `6a1349fe`). |

### §0.2 Ruling disposition (every AMB id, plus the other rulings the gates depend on)  `[REC·pre]` + revision notes

The table below is the **pre-review** disposition, recovered byte-exact. The review touched nine of its rows; those
revisions are listed immediately after it and take precedence.

**Legend.**
- **V11** = certified body text.
- **BB** = Block B reading (Annex C C.3, C11:7183-7247; B-nn = decision-record id).
- **SET** = packet "SETTLED — not asked".
- **EWT** = engineering within text (packet choice or integrator design; permitted by the cited text; C11:7394-7413).
- **STOP** = Sheet 06.
- **OPEN** = not stated.

| id | Status | Decided by | What it means for this plan (unit) |
|---|---|---|---|
| AMB-01a | BB | B-01 C11:7188 | Clause-level fail-closed lanes (U8a held lane, U11a row W, U13a per-destination refusals). No whole-gate refusal. |
| AMB-01b | V11 + SET | P-01 C11:6618; A2.1–A2.7 C11:6719-6744; PKT:465 | D-4. Actuating mints wait for P-DISCHARGE (W6). |
| AMB-01c | EWT | C11:7408; F35 C11:592 | The P-MINT-CORE A2 backstop carries `MG-Pnn` as `capability_gap_ref`. |
| AMB-02a | EWT | row 8 C11:4727; C11:7396; PKT:362-366 | U8a/U8b code mapping plus D-10's extension. |
| AMB-02b | EWT | row 7 C11:4726; C11:7396 | U7 code split. |
| AMB-02c | EWT | §3.8 C11:4622; C11:7397 | U8R: a null ack refuses `readback_mismatch` (GW). After P-F88 it is a 400 at the shape stage. |
| AMB-03, -04 | BB + V11 | B-02 C11:7189-7191; F88.1 C11:1690-1696 | P-PRINCIPAL (D-1, D-2). U6-L3 reads `ctx.principal.role`. The `actor.role` fence stays. |
| AMB-05 | BB | B-03 C11:7192 | Surface `'web'` in U6-L3 and in U12b's port. |
| AMB-06 | V11 | FR-3 C11:1782; B-04 C11:7193 | (a)–(e) are direct reads at slot 6. `preview()` is used only in U13c's approval owner. |
| AMB-07 | BB | B-05 C11:7194 | No special case. The approval-decision sub-case has no input this cycle (SH-11). |
| AMB-G6-7 | EWT | C11:4756-4758 | Gate 6/14 disagreement counter at the COMMIT edge (U13c), metric only, no code. |
| AMB-08 | V11 + SET | row 9 C11:4729; R3.9.1 C11:4878-4882; INV-24 C11:5356; PKT:466 | NW on every refusal at 1–8-R. Gate 5's counter is non-durable (P-G15a). |
| AMB-09 | BB | B-06 C11:7195 | Destinations only through `subjectCapability`/`subjectOf`. R3.5.3 reader test (integrator, W1). Used by U7 C2, U10 B10-10, U13a B19. |
| AMB-10 | V11 + SET | R3.2.2 C11:3825-3833; PKT:467 | HANDOFF destination ∈ {C9, AE}. TOOL refused (U6, U7). |
| AMB-11 | V11 + BB | R3.12.1 C11:5134-5142; CH1 C11:5895; CH2 C11:5899; INV-26 C11:5358; Escape C11:7196-7199 | Tier cells are allowlists, plus the tokened escape on every non-RICH tier, `ANNOUNCEMENT` included (U-TAB `TIER_EFFECTS`; U7 C7). Reverses G7's A1 interim. |
| AMB-12 | V11 | PAY.4 C11:3553; K11 C11:2900 | C1 = membership in `permitted_effects`. `PAYMENT_HANDOFF` is gap-blocked through U-TAB's `emittable`. |
| AMB-13 | V11 (A2) | §3.7 C11:4500-4504; R3.7.5 C11:4600; BOOK.1 C11:3109 | I-MIG2 column, P-MINT-CORE writer, U7c check. Every `BOOKING_CONFIRMATION` COMMIT refuses until then. |
| AMB-14 | V11 + SET | §4.4.3 C11:5778 | `deliveryChannel` is legitimately read by U7 C7, the U8R recompute and U13b's successor. |
| AMB-15 | BB | B-08 C11:7200 | A re-read duty. The withdrawn-row refusal is E-INDEP (after discharge). |
| AMB-16 | V11 (A1) | C11:4157-4198; INV-8′ C11:5349 | Reschedule/cancel REFINE/DRAFT become mintable. U6-L1 deletes `floor.ts` `sensitiveDest` (A1 follow-up, C11:7399). |
| AMB-17 | BB | B-09 C11:7201; §3.7 C11:4546-4548 | Per-field domain and field-keyed labels. Codec in U8b-c. |
| AMB-18 | BB | B-10 C11:7202 | Erased or absent schema → `superseded/handle_stale`, NW. A hash failure throws (U8b). |
| AMB-19 | EWT | InputSchema C11:4424; H6 C11:2627 | The byte cap is the UTF-8 length of `stableActionJson(inputs)`, one function (U8b-c). |
| AMB-20 | BB | B-11 C11:7203 | Selections are sets (U8b). |
| AMB-21a | BB | B-12 C11:7204 | Bounds re-read → `bound_violation`; `bound_ref` is an echo (U8b). |
| AMB-21b | SET (scope) | PKT:469 | Phone values refuse `use_secure_surface`. The phone half of G8-5 has no input: **U candidate (OD-3)**. |
| AMB-21c | EWT | SCHED.1 C11:3148; F66 C11:1320 | Per-entry `move_targets` (U8b). Minted by P-MT2a on SCHEDULE. |
| AMB-21d | EWT (mechanism) | R3.6.4 C11:4445-4454; INV-23 C11:5354 | Registries bound and empty (U8b). The minter refuses non-closed fields (P-MINT-CORE BUILD test). G8-3/4/5 become **U candidates**. |
| AMB-21e | BB | B-13 C11:7205 | Boolean: type check only. |
| AMB-21f | BB | B-14 C11:7206 | `max_len` → `bound_violation`; `c9SafeText` keeps its own default. |
| AMB-21g | EWT | C11:5499; C11:2773 | The mint omits disabled option ids (P-MINT-CORE). |
| AMB-21h | V11 in part; boolean half OPEN, non-blocking | §4.4.3 C11:5758-5760; C11:7413 | Not a gate clause. No boolean or scalar answer is persisted in receipts. |
| AMB-22 | V11 + SET | F15 C11:220-235; PKT:470 | Non-closed values never become facts. Owner DTOs bind handles or closed members only. |
| AMB-23 | EWT | C11:4543; R3.9.2 C11:4889-4895; DS-03 A | Slotted templates only for one closed field with cardinality 1 (mint rule). Gate 9 throws on ≠1 label. |
| AMB-24 | BB | B-15 C11:7207 | `client_identified` envelopes get slot-less templates (P-MINT-CORE test). |
| AMB-25 | BB | B-16 C11:7208 | `degraded` → the composer's deterministic text as an assistant turn (U12b/U13b). |
| AMB-26a, -26b | SET (scope) | PKT:471 | Production vocabulary port bound `null` (U8R T-BIND). R-2..R-5 are **U candidates (OD-3)**. |
| AMB-26c | EWT | V5 C11:6106; §3.8 C11:4620 | `spoken_transcript` refused with 400 at the shape stage (P-F88). |
| AMB-26d | EWT; packet wording **not carried** | row 9 C11:4729 | Gate 9 always appends. The duplicate is avoided on Step 0's typed path (P-TYPED). |
| AMB-27 | BB | B-17 C11:7209; C11:4386-4389 | Recompute at ingress; divergence → `readback_mismatch` (D-10; U8R). |
| AMB-28 | EWT | §3.8 C11:5756 | Channel = carrier; last commit wins; no widget columns on user turns. Dedupe on `client_nonce` is optional after P-F88 and is not a clause. |
| AMB-29 | V11 (A3a) | C11:4805-4814; R3.12.4 C11:5169-5176 | `routeUtterance`/`liveCandidates` (U10a/U10b). Residual match and order are D-11. |
| AMB-30 | V11 (A3b) | C11:4833-4844 | `ownerSet`/`sameOwner` over U-TAB tables and P-25 rows (U10a). |
| AMB-31 | V11 (A3c) | C11:4853-4859 | AGREE needs both sides non-null. A pointer tap records NULL. |
| AMB-32 | V11 (A2) | C11:4819-4827, 5679, 5766-5776, 7095 | `WidgetIntentDivergenceAudit` folded in I-MIG2 (U10b). |
| AMB-33 | EWT (disclosed reading) | C11:7397; F14 C11:216-218; R3.7.3 C11:4588-4591; BOOK.4 C11:3116 | Owner-minted handles in `frozenNounsJson`, tagged with `ActionIdentityService.hmac`. Adapters live in owner-ports (U11b). P-MINT-CORE writes them. |
| AMB-34 | EWT, narrowed | C11:7397; B-18 | A divergence is an owner-reported change. The stored-quote hash half is not built. |
| AMB-35 | EWT | R3.7.4 C11:4593-4598; R3.11.4 C11:5085-5091 | Revision witness through `C9Store.snapshot` (U11b). The AE binding is left to `decideApproval`. |
| AMB-36 | BB | B-18 C11:7210-7213 | Adapter outcome mapping. U-OWN surfaces `already_cancelled`. |
| AMB-37 | BB | B-19 C11:7214 | `NounResolverInput` = the seven fields plus actor, effect and witness presence (U11a). |
| AMB-38 | BB | B-20 C11:7215 | Body `*_ref` members are never dereferenced as handles (U11b). |
| AMB-39 | BB | B-21 C11:7216 | Restricted-role replay (U11b G11-N16). The widget path fails closed. |
| AMB-40 | BB | B-22 C11:7217 | `SealVerifier` and `SuccessorMinter` are minter-held (P-SEAL, P-MINT-CORE). The gateway holds no key. |
| AMB-41 | BB | B-23 C11:7218 | Diff = AUDIT_RETAINED facts + fresh values. Successor = same-kind confirmation or the amend selector (U11b + U12b rows). |
| AMB-42 | BB | B-24 C11:7219 | `successor.delivery_channel` = the predecessor's. |
| AMB-43a | V11 | §3.7 C11:4505-4509; R3.11.2 C11:5069-5073 | `approvalDecision` column (I-MIG2), writer, routing (U13c). Unreachable this cycle: **U**. |
| AMB-43b | V11 + EWT (ordering) | R3.11.3 C11:5075-5083; B-28 | Gate 11 emits `resolvedNouns{diverged,diff}` for APPROVAL decisions; U13c rejects and re-mints. **U**. |
| AMB-43c | EWT | F75 C11:1458-1463 | Sibling consumption inside U13c's claim CAS. |
| AMB-44 | BB | B-25 C11:7220 | The fresh read happens at slot 11. |
| AMB-45 | V11 | C.5 C11:7339 | None. |
| AMB-46 | V11 + BB | F15 C11:230-235; B-26 C11:7221 | Value-flow tests: T-ARCH-F15, G11-N15, G13-B14. |
| AMB-47 | **STOP (A5, S6-4)** | C11:7373 | NAVIGATE projector unbuildable. `composeNavigate` stays degraded with 0 reads. §0.4. **OD-1**. |
| AMB-48 | (i)(ii) EWT; (vi) OPEN | C11:7398; C11:2154; P9/P10 C11:2486-2511; RT4a C11:5712-5714; K18 C11:2923 | Principal-narrowed projector rows are not registered (U12b). **OD-5**. |
| AMB-49 | V11 | C5 C11:2304 | A PERMISSION Cell needs no gap. It has no author until OD-5. |
| AMB-50 | V11 (A4) | R3.9.4 C11:4907-4935 | Gates 1/5 hold no projector or owner port (P-G15 build test). |
| AMB-51 | OPEN, non-blocking | F95 item 2 C11:1882-1886; C11:7409 | The Gate 12 audit clause is F95's remainder, never "five call sites". |
| AMB-52 | V11 + BB | §2.4 C11:2859-2871; B-27 C11:7222 | `allowedKinds` from U-TAB. Rows keep the tapped kind (U12b ARCH-12-7). |
| AMB-53 | BB | B-28 C11:7223 | Enumerated edge import test (U13a B15). |
| AMB-54 | EWT | C11:7397; row 1; P-02 | Claim CAS at Gate 13 entry; a draft is consumed after the final outcome (U13a/U13c). |
| AMB-55 | V11 + SET | FR2 C11:5591-5593; C11:7341; PKT:472 | U13a writes `WidgetIntentReceipt`, never `utteranceEcho`. |
| AMB-56 | V11 + BB | L8 C11:5506-5507; B-29 C11:7224 | UNKNOWN is receipted ACCEPTED and its ref set on reconciliation (U13a/c). Response outcomes in P-G15a. |
| AMB-57 | BB | B-30 C11:7225 | `run.cancel` → `C9Store.cancel` (U13b). |
| AMB-58 | EWT | PROGRESS.3 C11:3342; H6 | Cancel key derived from (tenant, runId, revisionId) (U13b). |
| AMB-59 | BB | B-31 C11:7226 | Draft-owner registry indexed by AE key through P-25 (U13c). |
| AMB-60 | V11 | R3.8.5 C11:4676-4702 | `HandoffTarget` signer (U13b). |
| AMB-61 | EWT | DR1–DR3 C11:5652-5662 | The router writes no `DeliveryRecord`. |
| AMB-62 | V11 + BB | Escape C11:7196-7199 | Dismiss changes delivery state only (U13a fix). |
| AMB-63 | V11 | §3.7 C11:4496-4499; §4.4.3 C11:5734 | `idempotency_key` is AUDIT_RETAINED. `readback_text` is never persisted (P-MINT-CORE). |

**Other rulings and items.**

| Item | Status | Consequence |
|---|---|---|
| DS-01 `WIDGET_CAPABILITY_POLICY` Option A | binding | Gate 6's non-catalogue row test is build totality plus a positive; it is never a runtime refusal (C11:4792-4795). |
| DS-02 + A3 | V11 (C11:4800-4876) | Seven-row table. No `GATE10_MODE`. No old §5.4 predicates (AREA-B §1.2). |
| DS-03 A | binding owner ruling (Sheet 03:3-8; SH-14 PKT:479) | U9b: `superseded/handle_stale`, no turn, no effect, no guessed or LLM label. |
| Gate 14 placement | binding; row 14 C11:4734 | The slot stays a `terminate` pointer. Clauses are proven at `action-engine.ingress.ts` (call sites `:71`, `:107`; methods `:161`, `:141`). |
| A1, A2, A3, A4 | TRANSFERRED (C11:7160-7172) | As above. A4 adds three fail-closed "code alone" conditions (P-G15b). |
| A5, A7 | **STOPPED** (S6-4, S6-1) | §0.4. |
| A6, A8–A13 | RECORDED | A13: K14's parity proof reads `subjectCapability(record)` (U10a exports for K14). |
| R-01 read set (C11:7306) | V11; F36a registration unowned | When F36a registers, re-run Gate 6 C9 evidence under the new `C9_REGISTRY_HASH`. Not a cap. |
| R-02 | V11 (F36a) | `staff.journal.own.read` is principal-narrowed: not registered in U12b (OD-5). |
| R-03 | V11 (P-33) | Telegram ingress is outside this plan. Gate 2's "verified ClientChannelLink" alternative is exercised there. It is an "or" clause, not a cap. |
| R-04, R-05 | V11 / deferred | Not gates. NATIVE/PWA NOT PROVEN. |
| SH-05 (Escape on pwa) | BB C11:7197 | The server-matched «отмена» never reaches `/widgets/intent`. The shell imports `ESCAPE_VERBS`/`normaliseUtterance` from U10a. |
| SH-11 | SET PKT:476 | K11 APPROVAL comes later, so the approval clauses are U. |
| SH-13 | SET PKT:478 | `c9PrincipalHash` (P-PRINCIPAL). |
| SH-16 | not carried C11:7402 | Locale pinning is deployment configuration. No global `stableActionJson` change. |
| SH-17 | CONFORMANCE FLAG, open C11:7403 | P-F88 validates `widget_id` as UUID. |
| SH-19 | implementable C11:7402 | `/ai/chat` `resolution` member (P-MT2a/P-TYPED). |
| SH-22 | OPEN, non-blocking C11:7406 | Response members limited to certified ones (`reason_text`, `next_envelope`, `resolved_widget`, L8 outcomes). |
| SH-08, SH-18 | not approved; implementable C11:7404 | P-RESOLVE builds the thread page only. The `(widget_id, density)` request bullet is dropped (A5). |
| K14-09 | SET PKT:484 | Gate 10 counts only on the live path. |
| S6-2, S6-3 | STOPPED | No gate clause. The keys are not registered. |
| S6-5 (Q-1), S6-6 (Q-2) | OPEN, non-blocking | Personal-data REFINE stays handoff-only. For F36a keys `ownerSet` = ∅, so row 6 refuses a same-effect divergence (certified fail-closed). |
| VOICE-ALIASES | contract gap | Not a table clause. It joins **OD-2** through P-01's Step 0. |
| `CLIENT_LIST` has two owner-class labels | EWT | Outcome-neutral. U-TAB picks one and records it. |

#### Revisions the review applied to §0.2  `[RECON]` — verify before use

Rebuilt from the REVIEW DISPOSITION's "Applied" column (which names each row it edited) plus the committed audit.
The exact revised sentences were not captured; the substance is certain, the wording is not.

| Row | Finding | Revision |
|---|---|---|
| AMB-02c | 15 | Gate 8-R's R-6 evidence uses an **object** ack on a null-confirmation record and on a non-readback record. A `null` ack is a shape-stage 400 (P-F88 F88-4) and is never Gate 8-R evidence. |
| AMB-21d | 9 | AMB-21d is an **unapproved engineering choice** (PKT:371; C11:7397). Empty registries are still bound, but G8-3, G8-4, G8-5t and G8-DENY are **`false`, not U candidates**. Only the phone half (G8-5p, PKT:469) is a U candidate. |
| AMB-23 | 7 | Slotted templates are built **only as a mint rule** (P-MINT-CORE MINT-11). Gate 9 no longer throws on ≠1 label: every render impossibility answers `superseded/handle_stale` (D-11). |
| AMB-33 | 29 | Noun-handle minting and the integrity-tag namespace get their own unit, **P-HANDLE** (Wave 2, before P-MINT-CORE). P-MINT-CORE writes what P-HANDLE mints; U11b dereferences it. |
| AMB-47 | 8 | The NAVIGATE interim is recorded as plan deviation **DEV-1**, not as STOPPED. S6-4 changes no clause (C.2 A5, C11:7173). OD-1 asks (i) S6-4 A/B and (ii) accept DEV-1 or direct otherwise. |
| AMB-60 | 12 | The landing-route verification (`EP-FETCH`, R3.8.5 C11:4694-4702) is named as delivery dependency **LANDING-VERIFY**. U13b builds only the signer, so G6-6 and G13-R8 stay `false` until it exists. |
| R-03 | 23 | G3-c is split: **G3-c1** (membership re-create, role change; L) and **G3-c2** (client unlink/relink; U candidate, K14-10). PR-1 becomes a GW-RI U-proof over a synthetic revocation verifier (IR-P-REV). |
| Gate 14 placement | 1 | The clauses G14-a…c are **BLOCKED-DISCHARGE** until a live widget COMMIT reaches `prepare()` (E2). `built: true` with the ingress anchors is an annotation, never evidence. |
| K14-09 / K14-10 | 13, 23 | Two new Gate 3 keys: **G3-e** (a web-push token minted for A and submitted by B is refused, NW; producer P-MT3) and **G3-f** (a forwarded Telegram message is inert; U candidate, PKT:485, P-33). |

### §0.3 Genuine blockers: owner decisions still open  `[REC·pre]` + revision notes

Nothing below may be decided by the integrator or an implementer. Each item names what it blocks and what the plan
builds meanwhile. The **revised** question/blocks wording is preserved verbatim in the committed audit note
(`gate-conformance-audit.json` → `note.ownerDecisions`) and in Decision Sheet 07; it is quoted under each item.

**OD-1 — S6-4 (A5), already on Sheet 06. HARD BLOCKER.**
- **Blocks directly:**
  - G12-R1's NAVIGATE half (revised key: G12-R1b) and G12-I11 (K16)
  - G13-R2 (`NAVIGATE → projector → next_envelope`)
  - the `/widgets/resolve` detail request
- **Blocks through A2.6(3)/A2.7:** P-01's discharge, and with it every actuating clause:
  - G6-8…G6-13, and G6-14 on DRAFT subjects
  - G7-4, G7-5, G7-6, G7-BOOK1, G7-FR6b, G7-FR6d
  - R-1a (recompute needs a COMMIT)
  - 10.R2 on DRAFT/COMMIT (CONTROL remains)
  - G11 COMMIT subjects
  - G13-R6, G13-R9, G13-I3
- **Meanwhile:** the fail-closed interim (`composeNavigate` → degraded, 0 reads), labelled "holds by absence".
- **Sheet recommendation:** A (an AUDIT_RETAINED source-capability member sealed at mint).
- **Revised question (audit note, verbatim)** `[REC·rev]`: «S6-4 (A5): A, an AUDIT_RETAINED source-capability member
  sealed at mint (recommended), or B, re-sign A5; **and meanwhile accept DEV-1 or direct that the certified NAVIGATE
  edge be built**.» Blocks: «G12-R1b, G12-I11, G13-R2 and the `/widgets/resolve` detail request; through A2.6(3)/A2.7
  P-01's discharge and so every actuating clause (the 25 BLOCKED-DISCHARGE keys and the blocked parts of G6-14, G7-7,
  G11-R1…R4, G13-I5).» The interim label becomes **"holds by absence (DEV-1)"**.

**OD-2 — Discharge scope of P-01 and P-30 (new; needs a sheet).**
- **The rule.** A2.7(a) discharges a row only when "the named mechanism exists".
- **The problem.** Even after OD-1, P-01 ("Step 0 plus Gates 1–13 … and the two widget routes", C11:6618) and P-30
  ("… plus `ReadbackAck` and Gate 8-R", C11:6711) each contain a part that has no conformant content this cycle
  because of settled scope, not because code is missing:
  - (i) Gate 8-R's closed affirmation vocabulary: "waits for a SPOKEN carrier" (PKT:471).
  - (ii) Step 0's voice door "match on `speech_aliases` ∪ `ordinal`" (C11:4711). It is not expressible through
    `routeUtterance`, because §3.7 declares neither member (C11:4805-4806, 5742; VOICE-ALIASES), while PKT:471 says
    voice uses the typed path.
  - (iii) Step 0 for web push (`event.action`, K13) and Telegram. Telegram carries no callback tokens (K14-10,
    PKT:486) and its ingress is P-33.
  - A2.6(2)/(3) forbid softening a rule or discharging a partial mechanism.
- **Options.**
  - **A.** Record a reading: a mechanism that is built, `EP-BUILD`-tested and fail-closed, and whose only missing part
    is content or a carrier the owner settled out of cycle, counts as existing. The carve-outs are listed in the
    discharge commit.
  - **B.** Keep P-01/P-30 pending, so there is no in-chat actuation this cycle.
  - **C (recommended).** A contract version bump splits P-01 into the pwa/native JWT widget route and per-carrier
    Step 0 rows, and splits P-30 into record fields and the spoken-readback path. The split rows discharge honestly
    and A2.6 stays intact.
- **Blocks:** the same actuating set as OD-1.

**OD-3 — Do clauses with no conformant input this cycle count toward "15/15"?** (AREA-A B1/B2 and AREA-C D-1 combined.)

The pre-review U-candidate table is superseded by the review (findings 9, 13, 23, 3, 10). The **revised** candidate
list, recorded verbatim in the audit note, is: `[REC·rev]`

> G3-c2, G3-f, G5-f, G8-5p, R-2, R-3, R-4, R-5, the required half of R-7, the SPOKEN half of R-1a, 10.R5, G11-I4,
> G11-I5, G11-I6, G11-I10, G13-R7, G13-I1, G13-I2, the approver half of G13-I9 — **19 candidates**.
>
> **Not U:** G8-3, G8-4, G8-5t and G8-DENY (AMB-21d unapproved); the G13-R5 `delivery.resolve` sub-case (P-17).

| Clause | Basis |
|---|---|
| G3-c2 (client unlink/relink) | K14-10, PKT:485; the JWT widget route carries no channel proof |
| G3-f (forwarded Telegram) | K14-10 PKT:485; R-03 / P-33 |
| G5-f | K6 C11:2550; F53 C11:1126; P-12 has no package (C11:6635) — see OD-4 |
| G8-5p (phone half) | PKT:469; FORM.2 C11:3461; F34 C11:575 |
| R-2, R-3, R-4, R-5, the required half of R-7 | PKT:471; C11:4386-4389 (true only for a SPOKEN COMMIT) |
| the SPOKEN half of R-1a | PKT:471 |
| 10.R5 | class `c` is permitted on no kind (C11:2801); NAVIGATE(c) cannot be minted |
| G11-I4, G11-I5, G11-I6, G11-I10 | C11:5073; SH-11 PKT:476 |
| G13-R7, G13-I1, G13-I2, the approver half of G13-I9 | C11:5073; SH-11 PKT:476 |

Options:
- **A (recommended):** accept U, and print it separately: `LIVE CONTRACT-COMPLETE n/15 · WITH U-CLASS m/15`.
- **B:** bring them into scope. This means a phone/bounds/normalizer owner and 152-FZ handling; a SPOKEN carrier with
  vocabulary, locale and the V5 transcript-logging fix; and K11 APPROVAL with an F34 row. Each needs a contract bump
  and lies outside step 3.
- **C:** keep those gates PARTIAL.

**OD-4 — Gate 5 "deep link" for non-`HANDOFF` records (AREA-C B-2).**
- **The gap.** Row 5 and R3.4.5 require it (C11:4724, 4075-4081). Only R3.8.5 declares a signed handle, and only for
  Gate 13's HANDOFF (C11:4680). P-12 has no package.
- **Blocks:** strict Gate 5 (G5-f) and any carrier below `SESSION_VERIFIED`.
- **Revised (finding 10)** `[REC·rev]`: **no handle at Gate 5.** `HandoffTarget` is Gate 13's, for an *admitted*
  HANDOFF (C11:4676-4677); R3.4.5 is a landing *after verification* (C11:4079). The pre-review "HANDOFF sub-branch
  built within text and evidenced L-T" path is **withdrawn**. G5-f is a U candidate on every carrier, with its
  mechanism blocked on OD-4 + P-12.
- **Options:** A — name the route and response member (a contract bump) with P-12; B (recommended this cycle) —
  accept U under OD-3.

**OD-5 — AMB-48(vi): how principal-dependent narrowing reaches `data_scope.masked_fields` (AREA-C B-3). CONDITIONAL.**
- **Blocks:**
  - registering any projector row whose owner narrows by principal (`staff.journal.own.read` under R-02; role- or
    branch-scoped measurement reads);
  - G12-R5's "masked body" **if** the re-audit reads the clause as requiring a principal-narrowed projection.
- **Meanwhile:** Gate 12 is evidenced on unnarrowed rows, and the reading is disclosed in the audit note.
- **Options:** A — owner names the D-class composer-input carrier (contract bump); B — the audit clause is scoped to
  owner-shaped output ("never a leak").

**Not blockers.** Certified text, a reading or an approved ruling permits each of these:
- P-PRINCIPAL and D-1/D-2;
- the tenancy owner's in-transaction Membership read;
- AMB-27's code; the escape predicate; the Gate 6/14 counter;
- evidence classes L-T and U (as reporting);
- I-MIG2; P-25's F38 rows; the K20 binding;
- AMB-33/34/35/54/58/61; R3.11.3 placement; RT6 nullability; K4/K8 disposition; seal custody; L8 outcomes;
- D-12's successor NW reading.

**Delivery dependencies that bound COMPLETE.** These are not owner decisions. If one slips, the clauses it feeds stay
`false`. **They are never moved to U.**

| Dependency | Feeds | Prov. |
|---|---|---|
| K11 run-bearing orchestrator compose (**P-MT1**) | G6-16, G11-R2, `control.run.cancel` | `[REC·pre]` |
| K13 moments (**P-MT3**) | the restricted-tier positives of G7-7, web-push `single_use`, and **G3-e** | `[REC·rev]` (G3-e added by finding 13) |
| K7 booking draft owner (**P-08**) | P-MINT-BOOK | `[REC·pre]` |
| the marketing owner's approval-request surface | U13c; only needed for P-01 discharge, since its clauses are U | `[REC·pre]` |
| **TYPED-TURN (P-03/K5)** — the typed chat ingress persisting user turns through the same writer | **9.6**; not built this cycle, so 9.6 is `false` and Gate 9 leaves both counts | `[RECON]` from finding 4 |
| **LANDING-VERIFY** — the `EP-FETCH` landing-route verification of R3.8.5 (its placement must respect P-01's route count, C11:6618) | **G6-6**, **G13-R8** | `[RECON]` from finding 12 |
| **P-17 (K13 `control.delivery.resolve`)** | the `delivery.resolve` sub-case of G13-R5; without it Gate 13 cannot reach 13/15 even with U | `[RECON]` from finding 9 |

### §0.4 STOPPED items and the one plan deviation  `[REC·pre]` + `[REC·rev]` for DEV-1

**Revision (finding 8): the A5/S6-4 row leaves this table.** S6-4 stops a *ruling*, and C.2 A5 (C11:7173) says the
STOP changes no clause. What the plan does instead of the certified NAVIGATE edge is a **plan deviation, DEV-1**, and
its three clauses are `false` with the reason "not built (DEV-1; OD-1)", never `STOPPED`. The STOPPED-clause count
drops from 3 to **0**.

| STOP | What is built instead | How the clause is scored | Knock-on |
|---|---|---|---|
| **A5 / S6-1…S6-6 in general** | see rows below | a STOPPED clause would be `false` with its STOP id; **no Sheet 06 STOP governs a gate clause** | the headline prints `STOPPED CLAUSES 0` |
| **A7 / S6-1** | nothing | no gate clause | `/whats_new` stays NOT RETIRED (G2 scope) |
| **S6-2** (CAP-47, SC-21/22/24, A7 catalogue) | not registered | no gate clause | Gate 6 note "24 once F36a registers" unchanged |
| **S6-3** (`catalog.staff.read` v2) | output unchanged | no gate clause | U12b's `catalog.staff.read` row uses output v1 |
| **S6-5, S6-6** (Q-1, Q-2) | R3.5.1 handoff-only for `personal_data` REFINE; F36a keys in no owner class | no cap: G6-6 (SENSITIVE_DEST) uses these as positives; 10.R6 refuses them (certified) | Step-5 successors stay unbuilt |

**DEV-1 — the NAVIGATE interim.** `[REC·rev]` (quoted from the committed audit note, which I-AUD0 copied from §0.4)

- **Status:** standing; the owner is asked to accept it or direct otherwise (OD-1 (ii)).
- **What:** `composeNavigate` → `degraded` with zero reads; Gate 13's NAVIGATE edge answers `degraded` (a B-16 text
  turn, no `next_envelope`) for every NAVIGATE class. This departs from certified row 13 "NAVIGATE … → projector →
  `next_envelope`" (C11:4733) and row 12's NAVIGATE body (C11:4732). It is a plan deviation, not a STOP: a
  within-text `detail`/`w` re-projection must read `provenance.source_capability`, which §0.4 F15 fails (C11:7373).
- **Clauses:** `G12-R1b`, `G12-I11`, `G13-R2`.
- **Consequence:** the three clauses are `false` with reason "not built (DEV-1; OD-1)"; **Gates 12 and 13 cannot be
  COMPLETE in either count**; the live test is labelled "holds by absence (DEV-1)" and flips nothing; through
  A2.6(3) P-01 cannot be discharged, so every actuating clause is BLOCKED-DISCHARGE.
- U6 adds **no** detail branch (mutant M28 must die). Gate 6 keeps the certified null-subject pass for
  `w`/`i`/`s`/`detail` (C11:4740-4741). `[REC·pre]`

**Scoring rule.** A STOPPED clause is `false` with its STOP id. A gate holding one cannot be COMPLETE. The headline
prints the STOPPED count. A fail-closed interim built for a STOP or for DEV-1 never flips the clause it stands in for.

### §0.5 Scoring model

**Clause states** (one per clause key in §3.1). The pre-review definitions are recovered; the **revised** definitions
are preserved verbatim in the committed audit's `clauseStates` and are quoted in the right-hand column.

| State | Definition (pre-review, `[REC·pre]`) | Revision (`clauseStates` at `df6c3a5a`, `[REC·rev]`) |
|---|---|---|
| **L** | Executed on the live admission path with real input. Entry is HTTP (`AppModule`, all six `APP_GUARD`s, `FeatureGuard` not overridden, a seeded `TenantEntitlement` for `widgets.runtime`) **and** BIN (`dist/src/main`). The record is written by P-MINT-CORE's minter, reached from a production trigger entry (T-2a `/api/ai/chat`, T-1 C9 run, T-3 scheduler tick, or a gateway successor edge whose predecessor itself qualifies). Sub-classes: E-MINT (as minted), E-HOSTILE (a violating value in client-controlled bytes), E-DRIFT (a real owner write between mint and submit). Asserts `stopped_at_gate`, `gates_run`, the ruled outcome and code, and owner spies on real instances. | «executed on the live admission path with real input: HTTP (AppModule, all six APP_GUARDs, FeatureGuard not overridden, widgets.runtime granted by `Fixtures.grantFeature`) AND BIN (dist/src/main), on a record minted by P-MINT-CORE from a production trigger (**T-2b**, T-2a, T-1, T-3, or a qualifying successor edge), **provenance verified per D-17**; counts strict and U» |
| **L (EP-BUILD clause)** | — (new) | «a clause whose certified evaluation point is EP-BUILD: its EP-BUILD test green in the flipping commit's CI and, where it protects a runtime property, an L test on the same commit; counts strict and U» |
| **L-T** | A **defence-in-depth refusal** (no conformant minter can produce the violating input), evidenced by **E-TAMPER** or **E-INDEP** on the live path. E-TAMPER: an E-MINT record plus one direct SQL write to one AUDIT_RETAINED column the clause reads, labelled `[tamper:<column>]`. When the column is a floor term, `verificationFloor` is rewritten to `recomputeFloor(row)` in the same statement. E-INDEP: the shadowing gate's return value is replaced in a mutant build. Admitted **only** with an L positive for the same clause and every declared mutant live-killed. **Never used for Gate 9 or Gate 10 clauses** (AREA-B §5.2(4)). | «…evidenced by E-TAMPER (**never on a SealVerifier column except G1-a**) or E-INDEP on the live path, only with an L positive for the same clause and every declared mutant **live-killed by an `[HTTP]` killer**; never for Gate 9/10 clauses» (findings 6 and 21). **E-INDEP(mint)** is added as a sub-class. |
| **U** | No conformant input this cycle, by certified text or settled scope. All four must hold: (1) an `EP-BUILD` or mint-side L test proves no production mint path produces the antecedent; (2) an HTTP test over a labelled RI record proves the gate fails closed with its own code and 0 owner calls; (3) the mechanism is complete against its owner interface, with admit/refuse proven over injected rows and the mutants killed; (4) the audit row quotes the certified or settled sentence. | unchanged in substance; tightened by finding 9 — **a clause whose input is absent only because of an unapproved engineering choice or an undelivered package is `false`, not U.** |
| **STOPPED:\<id\>** | §0.4 | unchanged; the count is **0** this cycle (finding 8) |
| **BLOCKED-DISCHARGE** | Needs an actuating mint (D-4) | unchanged; **25 keys** at I-AUD0 |
| **false** | anything else, including G-SYNTH, RI, stub owners, GW-only runs, unit tests, hand fixtures, a green mutation run alone, k3 presence, or `liveGateCount` | unchanged |

**Gate classes** (`gateClasses` in the audit, verbatim):
- `COMPLETE` — every clause L or L-T.
- `COMPLETE-U` — every clause L, L-T or U, with at least one U.
- `PARTIAL-STOPPED` — some clause STOPPED; cannot be COMPLETE.
- `PARTIAL` — reachable on the live path, and code for some clauses executes, but the gate is not COMPLETE.
- `NOT_BUILT` — the slot is a refusing `pending()` stub (`mechanism_absent`).
- `NOT_LIVE` — the function or module exists, but no live widget submission reaches it.

**Headline:** `GATES LIVE CONTRACT-COMPLETE <strict>/15 · WITH U-CLASS <u>/15 · STOPPED CLAUSES <k> · BLOCKED-DISCHARGE CLAUSES <d>`.
At I-AUD0 it reads `0/15 · WITH U-CLASS 0/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 25`. `[REC·rev]`

**Per-gate ceiling.** "Strict" means every clause is L or L-T. Clause keys are defined in §3.1. The pre-review table is
recovered; the revised one is **rebuilt** from the review disposition's count column, the audit note's `expected`
block and Sheet 07's ceilings table. `[RECON] — verify before use.`

| Gate | Clauses that cap it (revised) | Strict: earliest wave / condition | With U counted |
|---|---|---|---|
| 1 | none | E1 (W5) | E1 |
| 2 | G2-a flips only on G2-EQ (D-16) | E1 | E1 |
| 3 | G3-c2 and G3-f → U; G3-e needs P-MT3 | **never this cycle** | E1, if OD-3 is accepted and P-MT3 delivers G3-e |
| 4 | G4-a refusal is L-T via E-INDEP on neutraliser set `N4` | E1 | E1 |
| 5 | G5-f → U on every carrier (no handle at Gate 5) | **never this cycle** (needs OD-4 A + P-12) | E1, if OD-3 is accepted |
| 6 | G6-8…G6-13 BLOCKED-DISCHARGE; G6-14 DRAFT half BLOCKED-DISCHARGE; G6-16 needs P-MT1; **G6-6 needs LANDING-VERIFY** | E2 (OD-1, OD-2) **and** P-MT1 **and** LANDING-VERIFY | E2, same conditions |
| 7 | G7-4/5/6, G7-BOOK1, G7-FR6b, G7-FR6d BLOCKED-DISCHARGE; G7-7 restricted-tier positives need P-MT3 | E2 + P-MT3 | E2 |
| 8 | G8-3, G8-4, G8-5t, G8-DENY → **`false`** (AMB-21d unapproved); G8-5p → U | **never this cycle** | **never this cycle — Gate 8 does not reach COMPLETE-U** |
| 8-R | R-1a BLOCKED-DISCHARGE (SPOKEN half U); R-2…R-5 and the required half of R-7 → U | **never this cycle** | E2, if OD-3 is accepted |
| 9 | 9.6 needs TYPED-TURN (P-03/K5), which is not built this cycle | **never this cycle** | **never this cycle — Gate 9 does not reach COMPLETE-U** |
| 10 | 10.R5 unreachable (class `c` on no kind, C11:2801) → U; watch item: production template collisions (AREA-B §4) | **never this cycle** | E1, if OD-3 is accepted |
| 11 | COMMIT subjects BLOCKED-DISCHARGE; G11-I4/I5/I6/I10 → U | never this cycle | E2, if OD-3 is accepted |
| 12 | G12-R1b and G12-I11 are DEV-1 `false`; G12-R5 conditional on OD-5 | E2 (OD-1 answered, then U12c) | E2 |
| 13 | G13-R2 is DEV-1 `false`; G13-R6/R9/I3/I5(actuating)/I7 BLOCKED-DISCHARGE; G13-R7, G13-I1, G13-I2 and the approver half of G13-I9 → U; the `delivery.resolve` sub-case of G13-R5 is `false` without P-17; G13-R8 needs LANDING-VERIFY | never this cycle | E2 + OD-1 + OD-2 + OD-3 **and P-17 and LANDING-VERIFY** |
| 14 | G14-a…c BLOCKED-DISCHARGE until a live widget COMMIT reaches `prepare()` | **E2**, not I-AUD0 | E2 |

---

## §1 Waves of units, in dependency order

### §1.0 Conventions  `[REC·rev]`

**Unit card fields.** Every card carries the same fields:
- Phase and wave, and who owns the unit: implementer, integrator, or owner-side (owner-reviewed code outside
  `src/widgets`).
- **Depends**: units that must be merged first.
- **Exclusive files**: only this unit may create or edit them.
- **Integrator requests (IR)**: edits to integrator-only files (§2.1), made by the integrator in the unit's merge
  commit.
- **Exit tests**: the tag says where each test runs and what it proves:
  - `[GW]` gateway level, real `WidgetsModule`, proof DB;
  - `[HTTP]` `AppModule` with all guards;
  - `[BIN]` the production binary;
  - `[BUILD]` source, type or import-graph test;
  - `[U]` unit;
  - `[RI]` injected registry or port;
  - `[G-SYNTH]` a labelled synthetic record;
  - `[XF→X]` `it.failing` until unit X merges.
  - GW, G-SYNTH, RI and U never count as evidence.
  - **Merge-step exits (D-18).** A `[GW]`, `[HTTP]` or `[BIN]` exit that depends on an IR (a provider, a module
    import, slot wiring beyond the I-CTX seams, a controller member) is run by the integrator in the unit's merge
    commit, not in the implementer's self-check. Implementers self-check with `[U]`, `[BUILD]`, `[RI]` and the `[GW]`
    tests their seam file alone makes runnable.
- **Battery**: mutants in `test/widgets-live/mutations/gate<id>.json`, which the runner finds by
  `^gate[0-9A-Za-z-]+\.json$`. A mutant may carry several edits, and an `[E-INDEP]` killer names the neutraliser set
  it runs on (I-HAR). A live kill counts toward L/L-T only when the failing killer is an `[HTTP]` test (§3.2).
- **Run**: the commands for this unit.
- **Audit**: clause keys from §3.1 this unit makes flippable, and the evidence that flips them. **No unit flips a
  clause at its own merge.** Flips happen only in the evidence batches E1 (Wave 5) and E2 (Wave 6).
- **MERGED** (added by this reconstruction): the commit that landed the unit. `[RECON]`

**Common commands.** `<…>` marks the unit's own paths.

```bash
BE=<repo>/maya-saas-backend
S=<scratchpad>                                                     # the durable home is now .maya-program; the
                                                                   # plan's own `S` pointed into /private/tmp
PDB='postgresql://maya@127.0.0.1:55611/maya_widget_gate_proof_gates'   # the programme's own DB; never `_local` (the shell's)
# proof cluster — the integrator starts it at the beginning of a wave; implementers only check status
LANG=C pg_ctl -D $S/pg-live/data status >/dev/null || LANG=C pg_ctl -D $S/pg-live/data -o "-h 127.0.0.1 -p 55611 -k ''" -l $S/pg-live/pg.log start
cd $BE
# implementer self-check: own files only, never the whole tree (D-18: add files, never delete or remove an imported export)
npx jest <unit spec paths>
npx tsc --noEmit -p tsconfig.build.json --incremental false        # equals `npm run typecheck`; errors in files you do not own are not yours
npx eslint <unit files> && npx prettier --check <unit files>        # NEVER `npm run format` or `lint:fix` (they rewrite other units' files)
node scripts/k3-gateway-check.mjs
npm run typecheck:widgets-live
DATABASE_URL=$PDB npm run test:widgets:live -- <unit live-spec path>   # only the tests the seam file alone makes runnable; the rest are merge-step exits
# integrator only, serialized: mutation batteries, BIN (`dist/` is shared), merge-step exits
DATABASE_URL=$PDB node scripts/widgets-mutation-battery.mjs --gate <id> --steps <unit,typecheck,k3|live> --out $S/p6-gates/mut/<unit>-$(date +%Y%m%d%H%M).json
npm run build && DATABASE_URL=$PDB npm run test:widgets:http       # script added by I-HAR
```

---

### Wave 0 — groundwork (sequential; one committer) · **MERGED and PUSHED, through `a2f98a52`**

#### CKPT-M0 — Prove the checkpoint and the databases on HEAD `d5ecca98` · integrator · no commit  `[REC·rev]`
- **Scope:**
  - Run the §2.5 CKPT-M script once on `d5ecca98`, using the whole-commit export (D-13). Every step must be green, or
    its red must be recorded as pre-existing with its log. Mutation and BIN steps report `EMPTY`.
  - Create `maya_widget_gate_proof_gates` on 55611 and run `migrate deploy` on it. Create `maya_c06_gates_w0` and
    `maya_c06_appointment_gates_w0` and migrate them. Create `maya_gates_smoke_w0`, migrate it and run `prisma:seed`.
  - Record `pg_stat_activity` for `maya_widget_gate_proof_local`. The shell's database is never touched.
- **Exit:** the CKPT-M0 log with every rc read directly. `run-all-checks.sh` from the export root is green.
- **MERGED:** no commit by design. **Whether CKPT-M0 ever ran is not recorded in any surviving file.** `[RECON]`

#### I-AUD0 — Re-baseline the audit against V1.1 · integrator · docs only  `[REC·rev]`
- **Depends:** CKPT-M0.
- **Scope:**
  - Rewrite `gate-conformance-audit.json` to schema `/2` (D-14) against V1.1: SHA `606d7f99…`, table C11:4718-4734,
    «Gate 6 in full» C11:4736, «Gate 10 in full» C11:4800.
  - Replace every clause list with the §3.1 inventory. Every clause starts `false`, **Gates 2 and 14 included**;
    implemented ones are annotated `built: true`.
  - Gate 2's old evidence (global `JwtAuthGuard`, no `@Public`) is kept as `built: true` with the note "slot 2 is a
    constant pass; G2-EQ (D-16) not run".
  - Gate 14's old evidence is kept as `built: true` with the anchors `action-engine.ingress.ts:71/:161` and
    `:107/:141`, state `BLOCKED-DISCHARGE`, and the note "module exists; no widget COMMIT reaches `prepare()` before
    E2".
  - Every U candidate of OD-3 is recorded as `false` with `u_candidate: true`, and every DEV-1 clause with
    `reason: "not built (DEV-1; OD-1)"`.
  - Record the deviations named in AREA-A §3.1 and AREA-C F-1: Gate 6's "R3.5.1 sensitive destination" key is removed;
    Gate 8-R's "readback required on a spoken actuation" key is removed; Gate 1's `widget_id` note is obsolete.
  - `mechanism_absent` exposure note. Headline
    `0/15 · WITH U-CLASS 0/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES <counted>`.
  - Record D-1…D-18, DEV-1 and OD-1…OD-5 in the note. (The committed note records **D-1…D-19**.) `[RECON]`
- **Exclusive files:** the audit JSON (integrator-only).
- **Exit tests:** `node -e` JSON parse; `run-all-checks.sh` still green, because the checker is not added until I-HAR.
- **Audit:** this unit *lowers* the headline from 6 to 0. It flips nothing up.
- **MERGED:** **`ad4fa3f1`** — «docs(gates): I-AUD0 — re-baseline the gate audit to Contract V1.1, schema /2: 0/15».
  The committed headline is `0/15 · WITH U-CLASS 0/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 25`, 165 clause
  keys, `built: 25`, `uCandidates: 19`, `dev1Clauses: 3`. `[RECON]`

#### I-CTX — Types-only context commit · integrator  `[REC·rev]`
- **Depends:** I-AUD0.
- **Scope (no behaviour change):**
  - `gate.types.ts`: add `PrincipalView` and `GateContext.principal: PrincipalView | null`; add verdict outcome
    `'expired'` (unused until P-G15a); `SubmissionShape.readback_ack: unknown` (R8R-2).
  - `gates/facts.ts`: delete the `authority` row (D-2), and update `facts.architecture.spec.ts`.
  - `di-tokens.ts`: `REQUEST_TX`, `PRINCIPAL_RESOLVER`, `SEAL_VERIFIER`, `SUCCESSOR_MINTER`, `HANDOFF_SIGNER`,
    `GATE_8R_OWNERS`, `NOUN_RESOLUTION_PORTS` (already declared), `TENANT_SCOPE`.
  - The runner sets `principal: null`.
  - **Slot seams (D-18):** slot 1 → `gates/gate1.ts` (today's inline Gate 1), slot 4 → `gates/gate4.ts` (today's
    inline compare), slot 8 → `input-validation/input-validation.gate.ts`, slot 9 → `lowering/lowering.gate.ts`,
    slot 10 → `gates/gate10.ts` (each today's `pending()`). They change no behaviour, and each file passes to its unit
    (P-G15a, U4, U8a, U9b, U10b) as an exclusive file.
  - The R3.5.3 reader-set reference test (R7-3; AMB-09) in `src/widgets/gates/r353-readers.source.spec.ts`,
    allowlisting `subjectCapability`, `subjectOf`, F43 `recomputeFloor`, the mint validator and the help generator.
- **Exit tests:**
  - `npm test`, `typecheck`, `lint`, k3, `typecheck:widgets-live` green.
  - `test:widgets:live` green (T-PENDING8, G12-L00 [GW], T-F11/B-1 unchanged), and `pipeline-order` unchanged across
    the seams.
  - R353-READERS [BUILD] green.
- **Audit:** none.
- **MERGED:** **`3d83366e`** — «refactor(widgets): I-CTX — types-only gate context and slot seams, no behaviour
  change». `[RECON]`

#### I-HAR — Harness to HTTP/BIN evidence grade · integrator  `[REC·rev]`
- **Depends:** I-CTX.
- **Scope:**
  - **IR-H1:** add test-only literals for the keys the referral, gift-certificate and AE identity modules require, in
    `test/widgets-live/support/environment.ts` and `.github/workflows/widgets-live.yml`, with the harness literal-set
    test extended to "platform-ci literals ∪ the declared widgets-live extras". G12-L00 `[HTTP]` changes from
    `it.failing` to `it`.
  - `package.json`: add
    `"test:widgets:http": "ts-node --project tsconfig.scripts.json --transpile-only scripts/widgets-intent-http-proof.ts"`.
    `widgets-live.yml` runs it after `build`.
  - `support/no-write-recorder.ts`: classify `FOR SHARE`/`FOR UPDATE` row locks and `pg_advisory_xact_lock`
    separately from durable writes (D-12).
  - `support/evidence.ts` (new): when `WIDGETS_EVIDENCE=1`, append one manifest line per evidence test: test id,
    entry, trigger trace id, record hash, `stopped_at_gate`, `gates_run`, labels. The jest harness **and** the BIN
    runner write through it.
  - **The proof database is `maya_widget_gate_proof_gates` (D-19).** `widgets-live.yml`, the harness docs and the
    common commands name it; CI keeps `maya_ci`.
  - **BIN runner fixture context (review finding 17).** `scripts/widgets-intent-http-proof.ts` boots the same guarded
    `FixtureContext` (`support/bootstrap.ts`) in the runner process against the admitted database. `HttpProofContext`
    gains `fixtures` (the real `Fixtures`: `tenant`, `user`, `staff`, `client`, `grantFeature`, `teardown`) and
    `evidence` (the `support/evidence.ts` writer). It gains no widget writer: `Fixtures.widget`/`synthetic` are not
    exposed to BIN cases. The runner calls `teardown` after every case.
  - **Server mint provenance capture (D-17).** The BIN runner keeps the child's stdout lines of context
    `WidgetMintProvenance`. `support/http-bootstrap.ts` installs a logger sink for the same context. Both expose the
    captured lines to the verifier.
  - **The provider-override allowlist** in `widgets-evidence-verify.mjs` enumerates: the recording `PrismaService`
    factory (`support/bootstrap.ts`, `support/http-bootstrap.ts`), which is call-through; the
    `IntentGatewayService.submit` scope wrapper (`http-bootstrap.ts`), also call-through; the YClients HTTP client
    stub; the link-verifier challenge stub. Nothing else, and never the model transport (D-15).
  - **Mutation runner (review findings 21 and 24):** (a) multi-edit mutants (`edits: [{file, find, replace}]`);
    (b) named neutraliser sets for `[E-INDEP]` killers, applied to the copy before the mutant's own edits; (c) each
    kill is tagged with its killer's entry level, read from the `[GW]`/`[HTTP]` title prefix, and the report marks
    only `[HTTP]` kills as live evidence; (d) a stable jest `--cacheDirectory` outside the temp copy, so ts-jest
    reuses its content-hash cache; (e) `--steps live` for live-killed mutants and `unit,typecheck,k3` for build-killed
    ones.
  - **`.github/workflows/widgets-mutation.yml`:** a `workflow_dispatch` input `gates` (comma list) drives a job matrix
    with one shard per battery id, each within the 180-minute timeout. CKPT-W step 7 dispatches it for the flipping
    commit and records every shard's run and artifact id.
  - `scripts/widgets-evidence-verify.mjs` (new, skeleton).
  - `docs/rebuild/evidence/maya-chat-first-ux/gate-audit-check.mjs` (new): validates schema `/2`, the contract SHA and
    clause-key equality with `gate-clause-inventory.json` (new, from §3.1). Added to `run-all-checks.sh`.
- **Exit tests:** HAR-1 AppModule boots [HTTP]. HAR-2 `test:widgets:http` runs and reports "0 cases" [BIN]. HAR-3 the
  recorder records a `FOR SHARE` as a lock and turns red on a durable write in the same request [GW]. HAR-4
  literal-set test. HAR-5 `gate-audit-check.mjs` passes on I-AUD0's JSON and fails on a key removed from it
  (self-test). HAR-6 the evidence manifest is written only when the flag is set. HAR-7 [BIN] a BIN case grants
  `widgets.runtime` through `ctx.fixtures.grantFeature` to its own tenant and tears it down; the manifest line is
  written. HAR-8 the call-through wrappers return byte-identical results to the unwrapped call (recorder and submit
  spy). HAR-9 the verifier rejects a manifest line whose record hash is missing from the captured
  `WidgetMintProvenance` lines, or missing from the database before teardown (self-test with a `Fixtures.widget`
  record). HAR-10 the verifier rejects an `[E-TAMPER:<col>]` label on a column the `SealVerifier` reads, except for
  key G1-a. HAR-11 the mutation runner applies a two-edit mutant and a neutraliser set, and tags a `[GW]` kill as
  non-evidence.
- **Battery:** `gateH-harness.json`: recorder counts locks as writes (kills HAR-3); checker skips the SHA compare
  (kills HAR-5); verifier skips the provenance cross-check (kills HAR-9); verifier admits sealed-column tampers
  (kills HAR-10).
- **Audit:** none.
- **MERGED:** **`4c300842`** — «test(widgets): I-HAR — harness to HTTP/BIN evidence grade, with the CKPT-W0 review
  fixes», plus three follow-ups in Wave 0: **`d1768d92`** (prettier on three I-HAR files), **`c677c49a`** («the
  mutation runner never reads a jest report this run did not write») and **`0a346065`** («the consent fence follows
  the shell's contract-spelled routes»). `[RECON]`

#### U-TAB — One module of derived tables · implementer · first implementer unit  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:**
  - `build-tables.mjs` also emits `KIND_PERMITTED_EFFECTS` (§2.4, C11:2831-2932), `EFFECT_KEY_SPACES` (R3.2.2,
    C11:3825-3842), `CHANNEL_TIER` (tier table C11:5885-5893) and `TIER_EFFECTS`. `TIER_EFFECTS` holds the CH1
    allowlists (C11:5895), with the tokened escape `CONTROL ∧ control.widget.dismiss ∧ priority 0` (F60,
    C11:1228-1238) admitted on every tier whose cell lacks CONTROL.
  - New `src/widget-contract/owner-classes.ts`: `KIND_OWNER_CLASS`; runtime `ownerClassKeys(kind)`, with wildcards
    expanded over `c9Registry` and F79 for `SETTINGS_OWNER`; K20 `emittable(kind)` (C11:6727); `allowedKinds` (the
    inverse; B-27); a load assertion that every member resolves.
  - `carriers/channel-profile.ts`: `carrierAdmits(channel, effect, ref, priority)` and `PROFILES[*].tier` from
    `CHANNEL_TIER`.
- **Exclusive files:** `scripts/widget-contract/build-tables.mjs`; `src/widget-contract/tables.ts` (generated);
  `src/widget-contract/owner-classes.ts` and `.spec.ts`; `src/widgets/carriers/channel-profile.ts` and `.spec.ts`;
  `test/widgets-live/mutations/gateT-tables.json`.
- **IR:** `[REC·rev]` consumers import values. **IR-TAB-1:** `widgets.module.ts` `onModuleInit` calls the load
  assertion **through a re-export in `authority/contract-bindings.ts`** (integrator), never `from '../widget-contract/…'`
  directly, because `k3-exit-gate.sh` fails on any `from '../<dir>/` import in `widgets.module.ts` other than prisma.
- **Exit tests** [BUILD/U]:
  - TAB-1 `CHANNEL_TIER` is total over `ChannelId` (11) and equal to C11:5885-5893.
  - TAB-2 each `TIER_EFFECTS` cell equals CH1 plus the escape (RICH_INTERACTIVE all 8; RICH_CONSTRAINED and SPOKEN all
    but NONE; ANNOUNCEMENT {NAVIGATE, HANDOFF} + escape; TEXT_ONLY {HANDOFF} + escape; PUBLIC_READ
    {NAVIGATE, HANDOFF} + escape; ANONYMOUS_CHAT {REFINE, HANDOFF} + escape).
  - TAB-3 `KIND_PERMITTED_EFFECTS` = §2.4. TAB-4 `EFFECT_KEY_SPACES` = R3.2.2. TAB-5 `ownerClassKeys` is total;
    NONE → ∅; `catalog.services.read` → CATALOG_READ. TAB-6 `emittable('PAYMENT_HANDOFF') === false`. TAB-7
    `allowedKinds` is the inverse. TAB-8 one `carrierAdmits` implementation (import-graph test). TAB-9
    `node scripts/widget-contract/build-tables.mjs` makes no diff.
  - `[REC·rev]` **TAB-10** no kind's `allowed_target_classes` contains `'c'` (C11:2801), which is 10.R5's U duty (1).
- **Battery:** TAB-M1 escape without priority 0; M2 ANNOUNCEMENT without escape; M3 ordered ceiling instead of
  allowlist; M4 NONE admitted off RICH_INTERACTIVE; M5 `ownerClassKeys` includes INHERITED keys; M6 `emittable`
  constant true. All build-killed.
- **Run:** `npx jest src/widget-contract/owner-classes.spec.ts src/widgets/carriers/channel-profile.spec.ts`;
  `--gate T-tables`.
- **Audit:** `[REC·rev]` enables G7-1, G7-2 and G7-7; 10.5; **10.R5's U duty (1)**; G12-I6; G1-f and G5-e (R3.9.4
  `REFINE ∈ permitted_effects`); R-1a. Flips nothing.
- **MERGED:** **`c29ba762`** — «feat(widget-contract): U-TAB — one module of §2.4 derived tables, with IR-TAB-1 and
  IR-TAB-2». (The plan names only IR-TAB-1; a second request, IR-TAB-2, landed with it and is not described in any
  surviving text.) `[RECON]`

#### Decision Sheet 07 — gates live scope · integrator · docs  `[RECON]`
Not a card in the plan (§0.3 OD-2 says the discharge scope «needs a sheet»; Appendix A carries the basis). It was
drafted and merged inside Wave 0 as **`a2f98a52`** — «docs(gates): Decision Sheet 07 — the honest gate count under
V1.1 and five open questions», 165 lines at `docs/rebuild/DECISION-SHEET-07-GATES-LIVE-SCOPE.md`. Its report
(recovered chunk 002) lists seven deviations and points for the integrator, of which two are still open: the OD-5
recommendation is the drafter's, not the plan's, and the OD-1 B/C consequences are drafting inferences.

**Wave 0 status: CKPT-W0 was run and closed** (its review fixes are folded into `4c300842`/`d1768d92`). Wave 0 is the
only pushed part of the programme: `origin/codex/maya-identity-consent-20260913` is at `a2f98a52`.

---

### Wave 1 — Phase A gate units + prerequisites A (parallel; file-disjoint) · **MERGED, NOT PUSHED**

18 units, merged in the §2.4 order between `5a1c1377` and `4f2703f1`, followed by 14 review-fix commits ending at
`df6c3a5a`. **CKPT-W1 is not closed:** the surviving W1 report carries only §5, and PROGRAM.md records that the wave
close was not evidenced (battery table placeholder, the Gate 7 battery never ran, about 21 mutants off their declared
status, no closing regression on the final HEAD). Treat every "green" in the cards below as a duty, not a result.

#### P-PRINCIPAL — The live principal in the one request transaction · prerequisite · implementer + owner-side
- **Depends:** I-CTX, I-HAR (recorder). **First merge of Wave 1.**
- **Scope:** AREA-C §2.4.1 as amended by D-1/D-2:
  - The request transaction `T` in `submit()`.
  - `C9Authority.current(T)`.
  - The role from the tenancy owner's in-transaction `FOR SHARE` Membership read (`m.id === authority.membershipId`,
    B-02).
  - `presentationMode` per B-02; `verificationLevel` per K1 (USER → SESSION_VERIFIED; CLIENT_CHANNEL → BOUND_CLIENT).
  - `proofHash = c9PrincipalHash(authority)`.
  - `[REC·rev]` `principal: null` on resolution failure. **Slot 3** refuses it `widget_principal_mismatch` (D-16).
    Slot 2 stays the transport pointer and refuses `unauthenticated` in-array only when no transport session reached
    the gateway.
  - `T` commits at the first non-pass verdict ≤ slot 10 or after slot 10, and rolls back on a throw.
- **Exclusive files:** `src/widgets/owner-ports/principal.adapter.ts`; `src/widgets/authority/principal-view.ts` +
  spec, `authority/k5-principal.architecture.spec.ts`; `test/widgets-live/principal.live-spec.ts`;
  `mutations/gateP-principal.json`; `scripts/widgets-http-proof/gateP-principal.cases.ts`; `[REC·rev]` (the deletion
  of `src/widgets/principal.util.ts` is **IR-P-DEL**, applied at merge after its two importers switch; D-18).
  **Owner-side:** `src/tenancy/memberships.service.ts` (+ spec:
  `activeMembershipInTransaction(tx, membershipId, userId, tenantId)`, R6-4), and `src/orchestration/c9.module.ts`
  (export `C9Authority`).
- **IR:** `[REC·rev]`
  - `intent-gateway.service.ts`: `T`, the principal step, slot 2's in-array refusal (no transport session) and slot
    3's refusal of `principal === null`.
  - `intent-submit-args.ts`: stop deriving the level and hash.
  - **IR-P-DEL:** delete `src/widgets/principal.util.ts` in the same merge commit, after `support/fixtures.ts` and
    `intent-submit-args.ts` stop importing it.
  - **IR-P-REV:** `support/fixtures.ts` gains a synthetic revocation proof for A18's verifier, used only by the G3-c2
    U-proof (PR-1).
  - `authority/authority-resolver.ts` input; the owner-ports module imports `C9Module` and `TenancyModule`.
  - k3 checks 4 (slot 2 refuses only with no transport session; slot 3 refuses a null principal) and 6.
  - `support/fixtures.ts` switches to `c9PrincipalHash`.
  - The one-line hash call-site switch in `emission/emitter.service.ts`, which P-MINT-CORE later rewrites.
  - The K3 exit wording "one principal read + one record read".
- **Exit tests:** `[REC·rev]`
  - [GW RI; U-proof for G3-c2]: **PR-1** client unlink/relink invalidates, over the real `C9Authority.current(T, proof)`
    with A18's synthetic verifier. The JWT widget route has no channel proof, so this is not live evidence.
  - [GW, HTTP]: PR-2 membership re-create invalidates; PR-3 role change invalidates; PR-4 a staff role without a Staff
    row → admitted by the transport chain on both routes, refused at **slot 3** `widget_principal_mismatch`; PR-5 an
    inactive tenant → whatever the transport chain answers on `/api/ai/chat`, the widget route answers the same at the
    transport stage, and otherwise slot 3; PR-6 the B-02 `presentationMode` table on real memberships; PR-7 K1 levels;
    PR-8 a spy shows the tenancy read receives the same `T` as `C9Authority.current`; **PR-9a** T-TX (refusal at 3
    commits, a throw rolls back); **PR-9b** a `pg_locks` probe from a second connection at a slot-11 spy shows no lock
    held by the request [XF→U10b]; PR-10 equal-latency sample; PR-12 exactly one principal read + one record read per
    refusal.
  - [HTTP, BIN]: **G2-EQ** (D-16): one principal matrix on an entitled proof tenant, submitted to `POST /api/ai/chat`
    and `POST /api/widgets/intent`. It covers: active member; no token; malformed token; revoked session; inactive
    user; inactive membership; inactive tenant; staff-class role without a Staff row; platform owner without a tenant.
    The transport-stage admit/refuse and HTTP status must be equal row by row; a differing row keeps G2-a `false`.
    **G2-IN**: E-INDEP on neutraliser `N2` (`JwtAuthGuard` admits without a user) → slot 2 `unauthenticated`, NW.
  - [BUILD]: PR-11 K5 (no `C9Principal` constructed under `src/widgets`); PR-13 the only role input to slot 6 is
    `ctx.principal.role`.
- **Battery:** X-M6 (`runAsAuthPrincipal` in the harness); role from `actor.role`; hash via the deleted util; role read
  outside `T` (M25); `T` held past slot 10; slot 2 constant pass (G2-IN); slot 2 refuses a null principal instead of
  slot 3 (PR-4, G2-EQ); `presentationMode` `'system'` restored.
- **Audit:** `[REC·rev]` enables G2-a (with G2-EQ), G2-c; G3-a, G3-b, **G3-c1**, G3-d; the **G3-c2 U-proof**; G5-b.
  Required by U6-L3, U11b, U12b, U13a, P-MINT-CORE and P-G15.
- **MERGED:** **`5a1c1377`**. Later touched by **`8cee26ba`** («two slots inside `T` read on a second connection,
  outside it» — `intent-gateway.service.ts`, `lowering-source.read.ts`, `input-validation.gate.ts`), **`5eb14456`**
  and **`df6c3a5a`** (the D-1-TX-a/-b source specs), **`2720435e`** («G2-IN asserted a source string and claimed an
  evidence class for it» — `principal.live-spec.ts`) and **`3da48069`** (`gateP-principal.json`). `[RECON]`

#### P-25 — `AE_PROPOSE_PAIRING` runtime rows · prerequisite · implementer  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:** rows transcribed from F38 (C11:755-774): `appointments.own.{create,reschedule,cancel}` ⇄
  `crm.appointment.*.v1`; `b35.confirm` ⇄ `communication.bulk-campaign.admit.v2`.
- **Exclusive files:** `src/widgets/authority/propose-pairing.ts` + spec, `mutations/gateP-pairing.json`.
- **IR:** none.
- **Exit tests:** [BUILD] PAIR-1 rows = F38; PAIR-2 exactly one pairing per AE key (FR-6b); PAIR-3 each propose key is
  registered in `c9Registry` and each AE key in `ActionCapabilityRegistry`.
- **Battery:** drop a row; duplicate a row (PAIR-2); a wrong AE key (PAIR-3).
- **Audit:** enables G7-FR6b, G7-5 (C5b), 10.5 (AE) and G13-R6 indexing.
- **MERGED:** **`080f32b3`** — «P-25 — AE_PROPOSE_PAIRING, F38's **thirteen** rows at runtime». (The card names five
  pairings; the commit landed thirteen rows. The AREA-A source that enumerated them is lost.) `[RECON]`

#### P-LEDGER — Runtime mechanism-gap and capability-gap ledgers · prerequisite · implementer  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:** runtime `MECHANISM_GAP_LEDGER` (MG-P01…MG-P34) generated from
  `docs/rebuild/evidence/maya-chat-first-ux/k1/k1-mechanism-gap-ledger.json`, and the P-07 capability-gap ledger; an
  A2.4 start-up assertion (every `[ABSENT]` §A1 row is bound to a gap key, otherwise the process does not start); the
  F92 build-printed count; read by P-MINT-CORE's A2 backstop.
- **Exclusive files:** `scripts/widget-contract/emit-ledgers.mjs`,
  `src/widget-contract/{mechanism-gap-ledger,capability-gap-ledger}.runtime.ts`,
  `src/widgets/authority/ledger-startup.assert.ts` + spec, `mutations/gateP-ledger.json`.
- **IR:** `widgets.module.ts` start-up hook.
- **Exit tests:** [BUILD] LED-1 34 rows equal the JSON and §A1; LED-2 P-07 rows; LED-4 printed count. [GW] LED-3 a
  missing binding blocks boot.
- **Battery:** drop MG-P01; neutralise the assertion.
- **Audit:** none directly. It is D-4's mechanism and P-DISCHARGE's substrate.
- **MERGED:** **`296aee36`**. `[RECON]`

#### P-F88 — Runtime forbidden-key walk and the §3.8 DTO · prerequisite · implementer  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:** AREA-C §2.4.3: one generated `F88_FORBIDDEN_KEYS` and `F88_EXEMPTIONS` list; `assertNoForbiddenKeys` (a
  total walk with six structural exemptions); a §3.8-conformant DTO (`contract` literal, UUID `widget_id` (SH-17
  flag), required nullable `inputs`, `client_nonce`, advisory `profile_id`, non-null `readback_ack` when present,
  `spoken_transcript` refused on pwa, advisory `client_emitted_at`); a controller-scope pipe before
  `intentSubmitArgs`.
- **Exclusive files:** `src/widget-contract/f88.generated.ts`, `scripts/widget-contract/emit-f88.mjs`,
  `src/widgets/validation/f88-walk.ts` + spec, `src/widgets/dto/submit-intent.dto.ts`,
  `test/widgets-live/f88-shape.live-spec.ts`, `mutations/gateP-f88.json`,
  `scripts/widgets-http-proof/gateP-f88.cases.ts`.
- **IR:** controller pipe; `SubmissionShape` retype; Gate 1's `widget_id` compare lands in P-G15a; append runtime
  mutants to `f88-mutation-battery.sh` (evidence file); the shell contract is the shell workstream's.
- **Exit tests:** [HTTP, BIN] F88-1 each of the 28 keys at depth 0 and depth 3 → 400; F88-2 each F88.2 location
  accepted only at its path, depth and type; F88-3 missing `contract` → 400; F88-4 `readback_ack: null` → 400 (was
  SMOKE-G8R-NULL-ACK); F88-5 `spoken_transcript` → 400. [BUILD] F88-7 no gate antecedent reads `profile_id` (R3.8.3);
  F88-8 one key list shared with `scripts/widget-contract-check.mjs`.
- **Battery:** each exemption arm widened; the walk stops at depth 2; the key list diverges. Plus
  `f88-mutation-battery.sh`.
- **Audit:** enables G1-b (with P-G15a), G2-b and G11-I1 (shape half).
- **MERGED:** **`97982a93`**. `[RECON]`

#### P-SEAL — Keyed seal and verifier (minter-held) · prerequisite · implementer
- **Depends:** I-CTX.
- **Scope:** `[REC·pre]`
  - `SealService.seal(terms)` = `ActionIdentityService.hmac('maya.widget.envelope/1', H4 terms)` (H4 C11:2615-2623;
    H6 C11:2627).
  - `SealVerifier.verify(recordHash)` reads the H4 terms from stored AUDIT_RETAINED columns
    (`WidgetEmission.bodyHash/widgetId/tenantId/issuedAt/expiresAt`, `WidgetIntentRecord.principalProofHash`,
    `WidgetRenderReceipt.profileId` for the emission's channel), compares in constant time, and accepts only the
    current key version (interim).
  - B-22: the gateway module never holds the key; `SEAL_VERIFIER` is provided by the emission module.
- **Exclusive files:** `[REC·rev]` `src/widgets/emission/seal.service.ts` + spec, `emission/seal-verifier.service.ts` +
  spec, **`emission/seal-h6.architecture.spec.ts`** (renamed from `h6-hashing.architecture.spec.ts` so that it falls
  under P-MINT-CORE's `seal*.ts` exclusion), `mutations/gateP-seal.json`.
- **IR:** `SEAL_VERIFIER` provider and module export; H6 retirement list shared with R8-5
  (`contract-bindings.ts:111` canonicaliser, integrator).
- **Exit tests:** `[REC·rev]` [GW] SEAL-1 keyed; SEAL-2 verify fails for each tampered term (7 cases); SEAL-3 an
  unknown key version is refused; SEAL-6 constant-time compare. [BUILD] **SEAL-4 H6 ratchet**: `createHash` or
  `JSON.stringify` hashing under `src/widgets/**` only in the canonicaliser and in a listed set that may only shrink.
  Today's set: `token.util.ts` and `authority/contract-bindings.ts` (integrator; retired in the P-MINT-CORE and U8b
  merges, R8-5), `emission/emitter.service.ts` (P-MINT-CORE), `consent/erasure.ts` (P-RT6),
  `proactive/provenance.ts` (P-MT3), `analytics/projection.ts` (U12b). The ratchet is green at P-SEAL's merge, and
  each owner's merge removes its entry. SEAL-5 no key under the gateway import graph.
- **Battery:** unkeyed hash; one term dropped; non-constant compare; verifier returns `true` on a null column.
- **Audit:** enables G1-a (with P-G15a and P-MINT-CORE) and R-4's integrity basis (B-17).
- **MERGED:** **`a8ec03b5`**, plus **`c354a2a4`** — «B-22 holds at the import graph but was unasserted at the DI
  container» (91 new lines in `emission/seal-h6.architecture.spec.ts`). `[RECON]`

#### P-RENDER — The R3.9.3 refusal-rendering map · prerequisite · implementer
- **Depends:** I-CTX.
- **Scope:** `[REC·pre]` AREA-C §2.4.5: a runtime `LIMITATION_REASON_TABLE` over every §3.9 code and response outcome;
  `C9_DENIAL_PROJECTION` with the P10(b) default; `reason_text` as a server Phrase; the anti-error lint; the
  interlocks.
- **Exclusive files:** `src/widget-contract/reason-table.ts`, `src/widgets/rendering/{denial-projection,reason-text}.ts`,
  `rendering/denial-projection.ratchet.spec.ts`, `rendering/anti-error-lint.spec.ts`,
  `rendering/refusal-codes-covered.spec.ts`, `mutations/gateP-render.json`.
- **IR:** `[REC·rev]` response member `reason_text` (controller); k3 check 8 extension: no migration, seed or script
  creates a `widgets.runtime` `TenantEntitlement`. **The one allowlisted grant path is `Fixtures.grantFeature` in
  `test/widgets-live/support/fixtures.ts`**, called from `test/widgets-live/**` and from
  `scripts/widgets-intent-http-proof.ts` (the BIN runner, I-HAR).
- **Exit tests:**
  - [BUILD]: REN-1 table total; REN-2 ratchet over the 118 `c9Deny` literals; REN-3 `RefusalCode ⊆ table`
    **[XF→U8b**, turns green when `mechanism_absent` leaves**]**; REN-4 lint; REN-6 k3 check 8, with a self-test that
    a seed or script grant fails and the BIN runner's `grantFeature` call passes.
  - [HTTP]: REN-5 every refusal carries `reason_text` and no error token **[XF→U8b]**.
- **Battery:** drop a row; severity `error`; raw exception text; a seed granting `widgets.runtime`.
- **Audit:** enables G11-I8, G12-I4, G13-I8 and R3.9.3 rendering for every gate.
- **MERGED:** **`5bbce7a2`**, plus **`ff6e695d`** — «every live refusal said the source was silent about a gate nobody
  built» (`rendering/reason-text.ts`, `refusal-codes-covered.spec.ts`, `widgets.controller.ts`,
  `intent-submit-args.spec.ts`). `[RECON]`

#### P-K4K8 — Remove the widget-layer PII path · Phase A (Gate 12 prerequisite) · implementer  `[REC·rev]`
- **Depends:** I-CTX.
- **Scope:** AREA-C §2.2.4 P-K4K8: remove `authority/pii-fences.ts`, `client/client-presentation.ts` and the legacy
  `gate12` rules and specs. **Under D-18 the implementer prepares the removal and its replacement tests; the
  integrator performs the deletions in the merge commit (IR-K4K8-1).**
- **Exclusive files:** the fence sections of `authority/authority.spec.ts` and `client/wave3.spec.ts`,
  `gates/gate12.spec.ts`. The deletion of `authority/pii-fences.ts`, `client/client-presentation.ts` and
  `gates/gate12.ts` is IR-K4K8-1.
- **IR:** **IR-K4K8-1**, in one merge commit: delete the three files, set the slot 12 pointer `run: () => pass`
  excluded from `liveGateCount` (D-7, k3 check 4 exception from U0), and remove the `gate12` import. **IR-K4K8-2:**
  `k4-exit-gate.sh` drops the "fire independently" pin and pins instead ARCH-12-2 (no widget-layer PII path) and F95
  (masking stays in the owners), with the V1.1 reason in the commit message. **IR-K4K8-3:** re-record the K4/K8 exit
  evidence wording in the mapping (disclosure).
- **Exit tests:** `npm test`, k3 and `k4-exit-gate.sh` green after the deletion (merge step). ARCH-12-2 [BUILD] lives
  in U12a's architecture spec and turns green in U12a's merge, which follows immediately (§2.4).
- **Battery:** `gate12k.json`: a restored `CARRIER_PII_CEILING` import (ARCH-12-2).
- **Audit:** enables G12-R4.
- **MERGED:** **`d1598e20`** — «P-K4K8 — the replacement ratchet for the widget-layer PII path (removals deferred to
  U12a)». The deletions landed with **`4f2703f1`** as **IR-K4K8-1..-4** (the plan names three IRs; four landed).
  `[RECON]`

#### U-OWN — Read-only extractions inside the booking owners · prerequisite · owner-side
- **Depends:** none in the widget layer.
- **Scope:** `[REC·pre]` AREA-C U-OWN·V11: `quoteForAccount`, `quoteOwnedReschedule`, `readOwnedCancelTarget` (returns
  the canonical status so `already_cancelled` maps, B-18). No behaviour change.
- **Exclusive files:** `src/appointments/client-appointment-create.service.ts`,
  `src/crm/client-appointment-reschedule.service.ts`, `src/crm/client-appointment-cancel.service.ts`, their specs,
  `src/crm/client-appointment-*.architecture.ts`.
- **IR:** none.
- **Exit tests:** `[REC·rev]` existing crm scanners green; owner unit specs pin `forAccount = extraction + execute`;
  FR-16 (no canonical column, no C9 or AE registry field). **Merge-step (integrator):** `npm run test:e2e` on
  `maya_gates_smoke_w1`, and `npm run action-engine:appointment-proof:ts` on `maya_c06_appointment_gates_w1` (§2.5),
  both on 55611, never 5432.
- **Battery:** none in widgets (owner scanners are the fence).
- **Audit:** enables G11-R1 and G11-I9 (via U11b).
- **MERGED:** **`fff08b48`**. `[RECON]`

#### U4 — Gate 4 calls `assertTenantId` · Phase A · implementer
- **Depends:** I-CTX.
- **Scope:** `[REC·pre]` slot 4 → `gate4(ctx, tenantScope)`. `tenantScope.assert(recordTenantId)` delegates to
  `TenantContextService.assertTenantId` (`tenancy/tenant-context.service.ts:142`). A throw maps to
  `refuse('tenant_mismatch')`. No string compare.
- **Exclusive files:** `[REC·rev]` `src/widgets/gates/gate4.ts` **(the I-CTX seam)**, `gate4.spec.ts`,
  `gate4.source.spec.ts`; `src/widgets/owner-ports/tenant-scope.provider.ts`;
  `test/widgets-live/gate4-tenant.live-spec.ts`; `mutations/gate4.json`; `scripts/widgets-http-proof/gate4.cases.ts`.
- **IR:** `[REC·rev]` **IR4-1** `@Inject(TENANT_SCOPE)` into the gateway (slot 4 already calls the seam); IR4-2 the
  owner-ports module provides `TENANT_SCOPE` (`TenancyModule` import; k3 check 9 enumeration in the same commit).
- **Exit tests:**
  - T4-POS [GW, HTTP]: same tenant passes; spy on `assertTenantId` called once with `record.tenantId`.
  - T4-SRC [BUILD]: no `===` on tenant ids in slot 4.
  - `[REC·rev]` **T4-INDEP** [GW, HTTP; E-INDEP on neutraliser set `N4` = `findRecord`'s tenant filter removed **and**
    slot 3's compare returning pass]: tenant A's request finds tenant B's record, passes slot 3 on the neutralised
    build and reaches slot 4 → `tenant_mismatch`, `stopped_at_gate '4'`, NW. With only the filter neutralised the
    request stops at slot 3 `widget_principal_mismatch`, because both the current hash and `c9PrincipalHash` include
    `tenantId`. **T4-INDEP-3** pins that stop as the control case.
  - T4-NW.
- **Battery:** `[REC·rev]` M4-1 string compare restored (T4-SRC); M4-2 `assertTenantId(ctx.tenantId)` and M4-3 the
  throw passes, both applied on `N4` and killed by T4-INDEP [HTTP].
- **Audit:** G4-a (L positive; the refusal is L-T via E-INDEP) and G4-b, flippable at E1 on trigger-minted records.
- **MERGED:** **`87c9f4c3`**, plus the merge-review fix **`199af63c`** («the gateway unit spec constructs the service
  with its tenancy port»). `[RECON]`

#### U6-L1 — Gate 6 in full, principal-independent part · Phase A · implementer
- **Depends:** I-CTX, U-TAB.
- **Scope:** `[REC·pre]` AREA-A §2.1 U6-L1 unchanged, except: the "no live principal" branches read
  `ctx.principal === null` (D-2); the catalogue principal will be built from `ctx.principal` in L3; **no
  detail/i-class branch** (DEV-1).
- **Exclusive files:** `[REC·rev]` `gates/gate6.ts`, `gate6.spec.ts`, `gate6.source.spec.ts`; `authority/floor.ts`,
  `authority/totality.spec.ts`. **The removal of `sensitiveDest` and of the `gateSensitiveDest` export is R6-1b,
  applied by the integrator in the merge commit together with R6-1 (D-18).** Plus
  `owner-ports/gate6.owners.provider.ts`, `test/widgets-live/gate6-authority.live-spec.ts`, `mutations/gate6.json`,
  `scripts/widgets-http-proof/gate6.cases.ts`.
- **IR:** `[REC·rev]` R6-1 (slot 6 + `@Inject(GATE6_OWNERS)`, drop the `gateSensitiveDest` import); **R6-1b** (delete
  `sensitiveDest` in `floor.ts` and the `gateSensitiveDest` export; update `k4-exit-gate.sh`'s "SENSITIVE_DEST is
  total" pin in the same commit if the totality spec loses that title, with the V1.1 reason A1/C11:7399); R6-2
  (owner-ports imports `AiToolPolicyModule`, `EntitlementsModule`; k3 check 9 in the same commit; never
  `ActionEngineModule`); R6-5 (the `gate-context.source.spec.ts:445` fence).
- **Exit tests:**
  - [GW]: P-NULL, P-NULL-DETAIL, P-CONTROL, P-HANDOFF-BI, P-HANDOFF-A22, P-HANDOFF-NOEXEC, P-HANDOFF-AE,
    P-HANDOFF-W-NONSENS, P-HANDOFF-SCHEDULE-UPDATE, P-F48-NONHANDOFF, P-C9-9-RUNLESS, P-C9-9-RUN; N-HANDOFF-SENS-C9,
    N-HANDOFF-SENS-C9b, N-HANDOFF-UNREG-CONTROL, N-C9-DOMAIN, N-C9-BI, N-OWNER-THROW-C9, N-AE-NOPRINCIPAL [RI],
    N-C9-47-NOPRINCIPAL [RI], T-TRANSITIONAL-VETO; S-A, S-B, S-C, S-TOOL, S-REG. All [G-SYNTH] until E1.
  - [BUILD]: S-1, S-1b, S-2…S-8, S-SURFACE, S-TX; `[REC·rev]` **S-FR14**: slot 6, `gate6.ts` and
    `owner-ports/gate6.owners.provider.ts` never read `principal.presentationMode`, `profile_id` or `a11y_env`
    (FR-14 C11:1798).
  - `[REC·rev]` [HTTP, E-INDEP on neutraliser `NPM` = `ctx.principal.presentationMode` overridden per request]:
    **FR14-VAR**: the same record and principal with `presentationMode` ∈ {client, owner, staff} give the same Gate 6
    verdict.
  - `[REC·rev]` [GW; merge-step HTTP]: **P-CONTROL-HANDLER** and **N-CONTROL-FOREIGN**: a CONTROL subject (dismiss,
    and `run.cancel` once P-MT1 exists) passes Gate 6 with no execute-admission test; the handler's own principal and
    tenant check (R3.2.4) is asserted at Gate 13 in U13a/U13b.
  - [HTTP/BIN]: SMOKE-G6-HANDOFF-SENS, -HANDOFF-BI, -C9-9-DOMAIN, -BODY.
  - Every refusal asserts NW, `stopped_at_gate '6'` and `gates_run 6`.
- **Battery:** G6 M1–M5, M8b, M10, M11, M13, M15–M22 (independence neutralisers M16a′–M20a′), M23 (surface,
  build-killed), M25 (role read outside `T`, build-killed), M28 (a detail branch calls an owner → P-NULL-DETAIL).
- **Audit:** enables G6-1…G6-7, G6-15…G6-20 and G6-FR14. Flips at E1 per §3.2 Gate 6. **G6-6 also needs
  LANDING-VERIFY** (finding 12). **G6-18 carries the full R3.2.4 text** (finding 11).
- **MERGED:** **`8d6c162d`**, plus **`620bfa1b`** — «Gate 6's held lane named one of its two halves» (`gate6.ts`,
  `gate6.spec.ts`). `[RECON]`

#### U7a — Gate 7, all clauses built · Phase A · implementer  `[REC·pre]`
- **Depends:** I-CTX, U-TAB.
- **Scope:** AREA-A §2.2 U7 clauses C1, C2+C3, C7, then C9a → C6 → C8a → C4 → C5a, with codes per AMB-02b. C7 is keyed
  on `record.deliveryChannel` through `carrierAdmits` (U-TAB). C2 has no direct `handoff*` read. C5b/C8b/C6a read the
  P-25 import, and C9b reads U-TAB `emittable`; until P-25 merges these absent-input clauses refuse (AMB-01a). C11 is
  coded against `record.confirmationSubject` and refuses while the member is absent (C11:3109). A required
  `findProducingRecord` loader.
- **Exclusive files:** `gates/gate7.ts`, `gate7.spec.ts`, `gate7.pipeline.spec.ts`; `authority/commit-guard.ts`,
  `authority/confirmation-guard.runtime.ts` (generated), `scripts/widget-contract/emit-confirmation-guard.mjs`;
  `booking/booking-commit.service.ts`, `booking/booking-allowlist.ts` (type widening), `booking/booking.spec.ts`;
  `test/widgets-live/gate7-effect.live-spec.ts`; `mutations/gate7.json`;
  `scripts/widgets-http-proof/gate7.cases.ts`.
- **IR:** R7-1 (slot 7 with the tenant-scoped `findProducingRecord` selecting `effect, capabilitySpace, capabilityKey,
  consumedAt`); R7-4 (remove `ACTUATING` from `effect-sets.ts` once no importer remains).
- **Exit tests:** [GW] P4–P8, P10, P12; A1a/A1b re-pinned positive; P-ESC-TEXT; P-ESC-PUBLIC; P-ESC-ANNOUNCE;
  N1a–N1c, N2a–N2c, N2e, N3a, N7a–N7c, N7e, N11, N12, N7-GUEST-NAV, N-ESC-P1, N-NONE-PUSH. COMMIT cases FC1–FC5, N1d,
  N2d, N4*, N5*, N6*, N8a, N9a/b, N-C11-NULL [XF→U6-L3]. [HTTP/BIN] tier refusal, escape on push, kind rule. All
  refusals NW.
- **Battery:** G7 M1–M32 and M33–M39 (AREA-A §2.2). M35 and M36 are build-killed.
- **Audit:** enables G7-1, G7-2, G7-3, G7-7 and G7-8 (non-COMMIT half) for E1. COMMIT clauses are BLOCKED-DISCHARGE
  (E2). **G7-7's restricted-tier positives need P-MT3.**
- **MERGED:** **`d6238b4a`** («all fourteen clauses built, with slot 7's producing-record loader»). Its battery was
  re-anchored twice: **`4da8954f`** («M7-8's killer did not bite — split T7-PRODUCING-SCOPE out of the S-ROW read
  fence», `gate-context.source.spec.ts` + `gate7.json`) and **`01240ce1`** («re-anchor M7-8, which the transaction fix
  had left resolving 0 times»). **PROGRAM.md records that the Gate 7 battery never ran at the CKPT-W1 attempt.**
  `[RECON]`

#### U8a — Gate 8 null-schema lane · Phase A · implementer  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:** AREA-A §2.3 U8a: null schema with inputs absent or `null` → pass with facts; anything else (including
  `{}`) → `selection_out_of_domain`; a schema-bearing record → `mechanism_absent` (held clause, path dark) until U8b;
  one lazy `LoweringSourceReader.read` after a pass (D-2 of PLAN).
- **Exclusive files:** `src/widgets/input-validation/input-validation.gate.ts` **(the I-CTX seam)**,
  `input-validation.ts`, `label-mapping.ts` (+ specs); `stores/lowering-source.read.ts`;
  `test/widgets-live/gate8-input.live-spec.ts` (taken over; T-PENDING8 retired); `mutations/gate8.json`;
  `scripts/widgets-http-proof/gate8.cases.ts`.
- **IR:** R8-1 (slot 8 → `this.inputValidation.run(ctx)`; `INPUT_VALIDATION` and `LoweringSourceReader` providers);
  R8-2 (order test, `liveGateCount`; T-F11/B-1 (b) now stops at 8-R/9).
- **Exit tests:** [GW] T-NULL-PASS, T-NULL-NULL, T-NULL-OBJ, T-NULL-EMPTY, T-HELD, T-READ-ONCE, T-INV24, T-F11.
  [HTTP/BIN] SMOKE-G8-NULL-INPUTS.
- **Battery:** M-NULL-PASS, M-EMPTY-OBJ, M-READ-EARLY, M-FACT-SLOT, M-TRUNC.
- **Audit:** enables G8-7, G8-8 (null half) and G8-LABELS (null half). Unblocks reachability of 8-R…13.
- **MERGED:** **`305c715c`** («the slot stops being a stub»). Later corrected by **`8cee26ba`** (the gate and
  `lowering-source.read.ts` read on a second connection, outside `T`) and by **`0b384c38`** («D-10's refusal fence read
  one directory, not the pipeline», `gates/gate-files.source.spec.ts`). `[RECON]`

#### U8R — Gate 8-R on the record, with the recompute · Phase A · implementer
- **Depends:** I-CTX, U-TAB. **Must merge before or with U9b.**
- **Scope:** `[REC·pre]` AREA-A §2.4 U8R exactly: stored vs recomputed (`effect === 'COMMIT' ∧
  CHANNEL_TIER[deliveryChannel] === 'SPOKEN'`), divergence → `readback_mismatch`, the required branch, the
  unrequired-ack refusal, no carrier/profile/locale reads, and the affirmation never logged.
- **Exclusive files:** `gates/gate8r.ts`, `gate8r.spec.ts`, `gate-8r.owners.ts`, `gate-8r.antecedent.spec.ts`,
  `gate-8r.binding.spec.ts`; `test/widgets-live/gate8r-readback.live-spec.ts`; `mutations/gate8r.json`;
  `scripts/widgets-http-proof/gate8r.cases.ts`.
- **IR:** R8R-1 (slot, provider `GATE_8R_OWNERS_UNRULED`); R8R-3 (T-SRC-INV30); R8R-5 (record D-10 in the audit note).
- **Exit tests:** [GW] T3, T3d, T10, T11-today, T12, T13b-direct, T14, T15, T16, T17, T-BIND, T-DIV-1 [XF→U8a].
  Required branch T5, T-DEF3, T6/T7/T9/T1-stub, T13a/c/d, T-DIV-2 [XF→U6-L3 + U7b, G-SYNTH].
  `[REC·rev]` [HTTP/BIN]: **SMOKE-G8R-UNREQUIRED-ACK with an object ack**, on a record whose `confirmation` is null
  and on a record whose `confirmation.requires_readback` is false. SMOKE-G8R-NULL-ACK moves to P-F88 as a 400 case and
  is never Gate 8-R evidence.
- **Battery:** G8R M1, M3a/b, M4–M21 and M22–M25.
- **Audit:** enables R-0, R-1, R-6 and R-7 (unrequired half) for E1; R-1a at E2; R-2…R-5 are U (OD-3).
- **MERGED:** **`13127393`**, plus **`3da48069`** (`gate8r.json` — «one battery could not run and one killer could not
  be credited»). `[RECON]`

#### U8b-c — Shared input-schema codec · Phase A · implementer (same person as U8b)  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:** `parseInputSchema`, `inputSchemaHash` (H6 canonicaliser `stableActionJson`), the field-keyed
  `selection_domain` codec (B-09) and the field-keyed labels decode (C11:4546), and `inputsByteLength` (AMB-19). All
  pure. The minter (P-MINT-CORE) and Gate 8 (U8b) import these; nothing else may re-implement them.
- **Exclusive files:** `src/widgets/input-schema/{codec,parse-input-schema,input-schema-hash,inputs-bytes}.ts` and
  specs, `input-schema/input-schema.architecture.spec.ts`.
- **Exit tests:** [U] round-trip per field kind; reject malformed; hash stable under key order. [BUILD]
  single-implementation import test (no other `selection_domain` parser under `src/widgets/**`).
- **Battery:** `gate8c.json`: codec accepts a duplicate id; hash via `JSON.stringify`; labels decoded flat. All
  build-killed.
- **Audit:** none directly; feeds G8-1, G8-2, G8-6 and G8-SCHEMA.
- **MERGED:** **`0a0620d4`** («the one input-schema codec, hash and byte length, imported and never restated»).
  `[RECON]`

#### U9a — Lowering function and Gate 9 fences · Phase A · implementer  `[REC·rev]`
- **Depends:** I-CTX.
- **Scope:** AREA-B §2.4 U9a (`renderUtterance`, `isAbsentTemplate`, `SELECTION_SLOT`, and `LoweredUtterance` moved
  here), **with D-11's classes**. `renderUtterance` returns a typed **render impossibility** for an unknown slot, a
  slot with ≠1 label, braces it cannot resolve, and an absent or blank template; Gate 9 maps each to
  `superseded/handle_stale`. Only `LoweringConstructionDefect` (a Gate 8 fact missing after a pass) throws. The
  architecture specs that need the slot are `it.failing` until U9b.
- **Exclusive files:** `src/widgets/lowering/lowering.ts`, `lowering.spec.ts`,
  `gate9-lowering.architecture.spec.ts`.
- **IR:** `gate.types.ts` imports `type LoweredUtterance` from `./lowering/lowering`.
- **Exit tests:** [U] the `$&`/`$1`/`$$` matrix, braces, **unknown slot → impossibility, 0/2 labels → impossibility**,
  slot-less, **missing fact → construction defect**. [BUILD] T-ARCH-SIG, T-ARCH-AUTH, T-ARCH-WRITER,
  T-ARCH-STORE-METHODS, T-ARCH-READERS, T-ARCH-F15, T-ARCH-MODELS, T-ARCH-NOWRITE, T-ARCH-TX, T-BYTE-2
  (slot-dependent ones [XF→U9b]).
- **Battery:** `gate9a.json`: `replace` used for the slot; signature gains `inputs`. Build-killed.
- **Audit:** enables 9.1a and 9.1b (structure) and 9.10.
- **MERGED:** **`6e576b41`** («the lowering function and Gate 9's source fences, with D-11's render impossibilities»).
  `[RECON]`

#### U10a — `routeUtterance`, `ownerSet`, the R3.12.4 duty · Phase A · implementer  `[REC·pre]`
- **Depends:** U9a (merge after), U-TAB, P-25 (merge after, or test the AE branch with a `null` pairing).
- **Scope:** AREA-B §3.4 U10a: rewrite `deterministic-router.ts` (delete `SPEECH_ALIASES`, `resolveCapability`,
  `assertAliasesResolve` and `cancel → c9.no_action`); `owner-set.ts` exactly C11:4833-4844; export `ESCAPE_VERBS` and
  `normaliseUtterance`; the load assertion.
- **Exclusive files:** `src/widgets/routing/deterministic-router.ts` + spec, `routing/owner-set.ts` + spec,
  `routing/routing.architecture.spec.ts`, `routing/r3124-routing-duty.build.spec.ts`.
- **IR:** `widgets.module.ts` `onModuleInit` load assertion; `di-tokens.ts` delete `DETERMINISTIC_ROUTER` and
  `CAPABILITY_FACTS`; `gate-fixtures.spec-helper.spec.ts:14,92` drop `assertAliasesResolve`.
- **Exit tests:** [BUILD] B10-2, B10-3, B10-4, B10-10. [U] the owner-set table and the router matrix (AREA-B). R3124
  duty [XF→P-MT2a] (fails on zero production fixtures).
- **Battery:** `gate10a.json`: M10-7, M10-8, M10-14, M10-15, M10-24 (build-killed here; live-killed again in
  `gate10.json`).
- **Audit:** enables 10.2, 10.5 and 10.10.
- **MERGED:** **`fb5d29af`** («`routeUtterance`, `ownerSet` and the R3.12.4 duty, asserted at boot»). `[RECON]`

#### U11a — Gate 11 structure, applicability, types · Phase A · implementer  `[REC·pre]`
- **Depends:** I-CTX.
- **Scope:** AREA-C §2.1.4 U11a (delete `FreshRead`/`bodyHash`; views; the applicability table W/A1/N1/A0/N0/P;
  `Handle`/`Witness` brands; row W refuses `superseded/handle_stale` with 0 calls while unbound).
- **Exclusive files:** `gates/gate11.ts`, `gate11.spec.ts`;
  `src/widgets/noun-resolution/{noun-resolution,noun-handles,noun-resolution.ports,noun-resolution.type-assertions}.ts`;
  `noun-resolution/erasure-reachability.gate11.spec.ts`, `noun-resolution/gate11.architecture.spec.ts`;
  `test/widgets-live/gate11-nouns.live-spec.ts`; `mutations/gate11.json`;
  `scripts/widgets-http-proof/gate11.cases.ts`.
- **IR:** slot 11 adapter (views, no `ctx.record`, returns `facts.resolvedNouns`); a concrete `ResolvedNouns` type with
  `diverged`/`diff` (AMB-43b).
- **Exit tests:** [BUILD] G11-N5, G11-N15, G11-ARCH; [U] G11-N9, G11-N10; [GW G-SYNTH] G11-N4d [XF→U10b].
- **Battery:** MUT-1, 3, 9, 11, 12, 16, 19 (build-killed now).
- **Audit:** enables G11-R2 (types), G11-R5, G11-I1 and G11-I3.
- **MERGED:** **`0af80584`**, plus **`101040ec`** — «Gate 11 owed a canonical read on CONTROL and REFINE, and A0
  throws» (`gate11.ts`, `gate11.spec.ts`, `noun-resolution.ts`). `[RECON]`

#### U12a — Projector skeleton and fences · Phase A · implementer  `[REC·pre]`
- **Depends:** I-CTX; merges with or after P-K4K8.
- **Scope:** AREA-C U12a (empty registry, typed `canonical-read.port.ts`, `WidgetProjectorService` → `degraded` with
  0 reads, ARCH-12-1 and ARCH-12-3…-14).
- **Exclusive files:** `src/widgets/projection/{projector.registry,canonical-read.port,widget-projector.service}.ts`,
  `projection/*.architecture.spec.ts`, `test/widgets-live/gate12-data-fence.live-spec.ts` (takes over G12-L00),
  `mutations/gate12.json`, `scripts/widgets-http-proof/gate12.cases.ts`.
- **IR:** `WidgetProjectorService` provider.
- **Exit tests:** ARCH-12-1…-14 [BUILD]; G12-L00 [GW] and [HTTP] (after I-HAR), still labelled "holds by absence".
- **Battery:** MUT-12-J, K, M, O, T (build-killed).
- **Audit:** enables G12-R6 and G12-I10.
- **MERGED:** **`4f2703f1`** — «U12a + IR-K4K8-1..-4 — the projector skeleton, and the widget-layer PII path removed»
  (the last unit merge of Wave 1). `[RECON]`

#### Wave 1 review-fix commits not attributable to one card  `[RECON]`

| Commit | What it fixed | Touches |
|---|---|---|
| `3c5081ae` | «an unknown `--gate` id reported EMPTY and exited 0» — a mistyped or stale battery id read as a battery that had run green | `scripts/widgets-mutation-battery.mjs` (integrator) |
| `3da48069` | «one battery could not run and one killer could not be credited» | the runner, `gate-antecedents.inv30.spec.ts`, `gate8r.json`, `gateP-principal.json` |
| `6a1349fe` | «the proof-db guard admitted the shell workstream's database» — `maya_widget_gate_proof_local` is now refused **by name**, in either mode (D-19) | `support/proof-db-guard.ts`, `harness.live-spec.ts` |
| `5eb14456`, `df6c3a5a` | the D-1 transaction-scope source specs: D-1-TX-b «could not have caught the read it was written for»; D-1-TX-a «pinned the slot range it was supposed to derive» | `gate-context.source.spec.ts` |

---

### Wave 2 — Phase B-1 + prerequisites B · **NOT STARTED**

#### I-MIG2 — The migration-2 fold · integrator · first merge of Wave 2 (exclusive DB window)  `[REC·pre]`
- **Depends:** Wave 1 CKPT-W.
- **Scope (D-8):**
  - `WidgetIntentRecord.confirmationSubject String? // A` (CHECK `IN ('create','reschedule','cancel')`) and
    `approvalDecision String? // A` (CHECK `IN ('approve','reject')`).
  - `model WidgetIntentDivergenceAudit`, all `// A`, exactly as AREA-B §3.4 U10b request 1.
  - Drop NOT NULL on `WidgetRenderReceipt.composedEnvelopeJson`/`emittedEnvelopeJson` and `WidgetDraft.diffJson`.
  - Folded into `prisma/migrations/20260916120100_widget_layer_runtime/migration.sql`, with the embedded schema
    updated.
  - Regenerate `build-widget-checks.mjs`, `widget-schema-count.mjs` and the RT5 enumeration; mapping §5 amendment.
  - `IntentRecordRow` and `findRecord` select `confirmationSubject` and `approvalDecision`.
  - `[REC·rev]` **IR-MIG2-TD**: teardown deletes divergence rows before `WidgetIntentRecord` (the RESTRICT FK), plus
    MIG-7 (finding 31).
- **Commands (all live suites stopped first):**
  ```bash
  cd $BE && npx prisma format && npx prisma generate
  dropdb -h 127.0.0.1 -p 55611 -U maya --if-exists maya_widget_gate_proof_gates
  createdb -h 127.0.0.1 -p 55611 -U maya maya_widget_gate_proof_gates
  DATABASE_URL=$PDB npx prisma migrate deploy
  DATABASE_URL=$PDB npx prisma migrate diff --from-url "$PDB" --to-schema-datamodel prisma/schema.prisma --exit-code
  node ../docs/rebuild/evidence/maya-chat-first-ux/widget-schema-count.mjs ../docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md
  ```
  (The pre-review script named `maya_widget_gate_proof_local`; D-19 replaces it. `[RECON]`)
- **Exit tests:** MIG-1 frozen numbers; MIG-2 CHECKs present (including the
  `(resolvedIntentTokenHash IS NULL) = (resolvedEffect IS NULL)` biconditional and `refusalCode IN ('intent_divergence')`);
  MIG-3 RT5 classification total; `[REC·rev]` **MIG-4 "98 applied, exactly 2 (3) `*_widget_layer_*`"** (finding 30 —
  the pre-review "exactly 2 migrations applied" was wrong on a fresh DB); MIG-5 migrate diff empty; MIG-6 the three
  NOT NULL drops; MIG-7 teardown order; full CKPT-M.
- **Audit:** enables G7-BOOK1, 10.7, G13-I1 and 9.7 (RT6 nullability).

#### P-HANDLE — Owner-minted noun handles and the integrity-tag namespace · prerequisite · implementer  `[RECON]`
**New unit, added by review finding 29.** No card text survives; this is the finding's own description, expanded to
the card shape. **Verify before use.**
- **Depends:** U-OWN, I-CTX. **Merges in Wave 2, before P-MINT-CORE** (so before U11b and U12b).
- **Scope:** minting the owner handles that go into `frozenNounsJson`, and the `ActionIdentityService.hmac` tag
  namespace they are tagged with (AMB-33, F14 C11:216-218, R3.7.3 C11:4588-4591, BOOK.4 C11:3116). Before this unit,
  P-MINT-CORE only *wrote* handles and U11b only *dereferenced* them: nobody minted them or owned the namespace.
- **Audit:** no clause of its own. It is the precondition of G11-R1, G11-I2 and G11-I9.

#### U6-L3 — Gate 6 (d), C20 on the live principal · Phase B · implementer  `[REC·pre]`
- **Depends:** P-PRINCIPAL, U6-L1.
- **Scope:** AREA-A U6-L3 with D-2: `roleAdmits` reads `ctx.principal.role`, which came from the in-`T` Membership
  read (no second read); `aiToolPrincipal = buildPrincipal(tenantId, userId, principal.role, 'web')`.
- **Exclusive files:** U6's.
- **IR:** none new (R6-3/R6-4 were delivered by P-PRINCIPAL).
- **Exit tests:** [GW G-SYNTH] P-AE, P-C9-47, P-C9-47-DRAFT, P-C9-47-NODOMAIN, P-F78, N-D1, N-E, N-OWNER-THROW-E,
  N-C9-ROLE, N-C9-PROFILE, N-C9-FEATURE, N-C9-SURFACE, N-C9-CLASSC, N-NOAUTHORITY, N-STAFF-UNBOUND,
  N-TENANT-NOT-ACTIVE. [HTTP/BIN] SMOKE-G6-C9-47, SMOKE-G6-C9-47-DENY (REFINE catalogue subjects); SMOKE-G6-PASS and
  SMOKE-G6-LIVE-ROLE on AE subjects [XF→P-DISCHARGE].
- **Battery:** adds M6, M7, M8a, M9, M12, M14.
- **Audit:** enables G6-14 (REFINE subjects for E1); G6-8…G6-13 for E2.

#### U7b — Gate 7 absent-input lifts · Phase B · implementer  `[REC·pre]`
- **Depends:** U7a, P-25, U-TAB.
- **Scope:** C5b → C8b → C6a read the real P-25 rows; C9b reads `emittable`; FC/N COMMIT cases convert from XF to
  G-SYNTH after U6-L3.
- **Exit tests:** [GW G-SYNTH] N-C5b, N-C8b (a pairing row deleted in an RI registry), N-C6a, N-C9b
  (`PAYMENT_HANDOFF` refused); FC1–FC5 green (G-SYNTH).
- **Battery:** M(C5b), M(C8b), M(C6a), M(C9b).
- **Audit:** enables G7-FR6b, G7-FR6d and G7-5 for E2.

#### U9b — Slot 9 on the live path (DS-03 A) · Phase B · implementer  `[REC·pre]`
- **Depends:** U8a, U8R, U6-L1, U7a, U9a, P-PRINCIPAL (`T`).
- **Scope:** AREA-B §2.4 U9b: `lower(ctx, T)`; `TimelineStore.lowerToUserTurn` (per-conversation advisory lock,
  conditional record update, `turnIndex` under the lock, private `insertTurn`); the `appendTurn` refactor; the DS-03
  triggers → `{outcome:'superseded', code:'handle_stale'}` with no write; **only a construction defect throws**
  (D-11). Also exports `timelineLockKey(tenantId, conversationId)` for P-RT6.
- **Exclusive files:** `src/widgets/lowering/lowering.gate.ts` **(the I-CTX seam)**,
  `src/widgets/stores/timeline.store.ts`, `test/widgets-live/gate9-lowering.live-spec.ts`, `mutations/gate9.json`,
  `scripts/widgets-http-proof/gate9.cases.ts`.
- **IR:** slot 9 wiring; the facade delegate and `appendTurn` signature; fixtures and harness;
  `widget-stores.service.spec.ts`; order specs stop at `'9'`; `facts.architecture.spec.ts`; `schema.prisma` comment
  fixes.
- **Exit tests** [GW, HTTP; G-SYNTH until E1]: T9-POS-1, T9-POS-5; T9-NEG-1, -2, -3, -8; **T9-NEG-SHAPE** (re-pinned
  by finding 7); T9-DEF-1; T9-INV24-1…10; T9-CONC-1…3; T9-ATOM-1; T9-BYTE-1; T9-LOG-1; T9-HTTP-1…4. BIN
  `gate9.cases.ts`. With U10b: T9-TX-1 and T9-TX-2. With U8b: T9-POS-2/3/6/7, T9-NEG-4/5/6, T9-DEF-2/3. Deferred to
  E1: T9-LIVE-1, T9-RT6-1, T9-TYPED-1.
- **Battery:** G9 M1–M35 with AREA-B's edits (M35 = own transaction instead of `T`) and the DS-03 mutants; **M30 and
  M33 re-pinned** (finding 7).
- **Audit:** enables 9.1–9.5, 9.7–9.10 for E1. `[REC·rev]` **9.6 is `false` this cycle**: it needs TYPED-TURN
  (P-03/K5), which nothing in this plan builds (finding 4).

#### U13a — Router spine, claim, receipts, dismiss fix · Phase B · implementer  `[REC·pre]`
- **Depends:** P-PRINCIPAL, I-MIG2.
- **Scope:** AREA-C U13a·V11: the closed seven-literal switch, no `NONE`; destination lookup before the claim; claim
  CAS when `singleUse` (AMB-54); B-29 receipts and `reconcileAcceptedReceipt`; dismiss fix (principal predicate in the
  query; `LIVE → CANCELLED`, `delivery_state: 'cancelled'` only).
- **Exclusive files:** `src/widgets/routing/{effect-router.service,routing-input,effect-router.ports}.ts`,
  `routing/effect-router.architecture.spec.ts`; `gates/gate13.ts`, `gate13.spec.ts`;
  `src/widgets/control/control-registry.service.ts`; `src/widgets/stores/intent-audit.store.ts`;
  `noun-resolution/erasure-reachability.gate13.spec.ts`; `test/widgets-live/gate13-routing.live-spec.ts`;
  `mutations/gate13.json`; `scripts/widgets-http-proof/gate13.cases.ts`.
- **IR:** router provider and slot 13 wiring; controller response `next_envelope`, `resolved_widget`, `reason_text`,
  L8 literals (with P-RENDER, P-G15a).
- **Exit tests:** [BUILD] B14, B15, B19, B23, B24. [GW, HTTP; G-SYNTH until E1] G13-P01, N02, N03, N05 (fail-closed
  before U13b), N06, N10, N17, N20, N22. **Live exits are `[XF→U10b]`** (finding 28).
  `[REC·rev]` **finding 11 adds:** `B-R324` (the R3.2.4 source test, new key G13-R5b), `N-CTRL-FOREIGN-P` and
  `N-CTRL-FOREIGN-T` on neutraliser set `N34`, and the `M-R324` mutants.
- **Battery:** M1, M2, M2b, M3, M3b, M4, M10, M12, M14, M15, M18, M20, M22, M23, M25, plus `M-R324`.
- **Audit:** enables G13-R1, R4, R5 (dismiss), **R5b**, R10, I5 (non-actuating), I6; G1-d (claim).

#### P-MINT-CORE — One mint pipeline and record writer · prerequisite · implementer  `[REC·pre]`
- **Depends:** P-PRINCIPAL, P-F88, P-SEAL, P-LEDGER, P-25, U-TAB, U8b-c, I-MIG2, **P-HANDLE** (finding 29).
- **Scope:** AREA-C §2.4.2 P-MINT-CORE, **minimal cut**:
  - A minter that takes only `WidgetComposerInput` plus the principal. It runs the closed-shape validator,
    `allowedKinds`, K20, the fitter's CARRIER CEILING through `carrierAdmits` and the F60 escape branch, RT4, the F88
    walk, `stableActionJson` `body_hash`, and `SealService.seal`.
  - A record writer for every §3.7 AUDIT_RETAINED member: floor via `verificationFloor`; `requested_scope_hash`;
    `confirmation` without `readback_text`, with a server-minted `idempotency_key`;
    `confirmation_subject`/`approval_decision` (R3.7.5); `run_ref`; `frozen_nouns` from owner handles (minted by
    P-HANDLE); `produced_by`/`confirmation_of` (F74); `selection_domain` via U8b-c; `c9_domain` per R3.7.1;
    `input_schema_hash`.
  - One `WidgetRenderReceipt` per channel with `emittedEnvelopeJson`.
  - No token or record for `NONE` (INV-21).
  - The A2.2 backstop: while MG-P01 is present, an actuating intent → `LIMITATION` with `capability_gap_ref` (D-4).
  - B-15 slot-less templates for `client_identified`.
  - `[REC·rev]` **MINT-11, the slotted-template mint rule** (D-11): slotted templates only for one closed field with
    cardinality 1, so `handle_stale` cannot loop on refresh.
  - `SuccessorMinter.mint`: L7 pointers only from `LIVE`, predecessor channel (B-24), bound to the predecessor turn
    (D-12).
  - Recorded emission fixtures for 10.10.
- **Exclusive files:** `src/widgets/emission/**` except `seal*.ts`: `emitter.service.ts` rewrite, `record-writer.ts`,
  `envelope-validator.ts`, `successor-minter.service.ts`, `a2-backstop.ts`, `fixture-recorder.ts`, specs. Plus
  `test/widgets-live/mint.live-spec.ts`, `mutations/gateP-mint.json`.
- **IR:** `SUCCESSOR_MINTER` provider; H6 retirement of `contract-bindings.ts:111`; identity secrets in the
  widgets-live env (done in I-HAR).
- **Exit tests:** [GW] MINT-1 each non-actuating effect's record equals its derivation member by member; MINT-2 `NONE`
  → no record; **MINT-2c** (10.R5's U duty: no conformant mint produces a NAVIGATE(c) subject, finding 3); MINT-3 an
  actuating intent → LIMITATION + gap ref, no token (**A2.2 LIVE-grade test**); MINT-4 the seal verifies, and
  tampering fails it; MINT-5 no `readback_text`; MINT-6 `client_identified` → slot-less; MINT-7 F74/F75/R3.11.5
  refusals; MINT-8 supersession only from `LIVE`; MINT-9 T-MINT-NONCLOSED (a non-closed field with an unregistered key
  refuses to mint); MINT-11 the slotted-template rule. [BUILD] MINT-10 H6.
- **Battery:** one mutant per derivation; backstop removed (MINT-3); `NONE` tokened (MINT-2); `readback_text`
  persisted (MINT-5).
- **Audit:** the precondition of every E1 flip. It flips nothing by itself: a direct test call is never L. L needs a
  trigger (W4).

#### P-G15a — Gates 1 and 5 to V1.1, without the successor · prerequisite · implementer  `[REC·pre]`
- **Depends:** P-PRINCIPAL, P-F88, P-SEAL, P-RENDER.
- **Scope:**
  - **Gate 1** extracted to `gates/gate1.ts` **(the I-CTX seam)**: `SEAL_VERIFIER` first (fail → `EXPIRED`, code
    alone), the constant-time `widget_id` compare, expired, consumed-when-`single_use`, superseded;
    `EXPIRED`/`SUPERSEDED` as response outcomes (L8).
  - **Gate 5:** `superseded / policy_floor_changed` with a non-durable `widget_floor_divergence` counter (a process
    metric); the level from `ctx.principal.verificationLevel`; the shortfall branch unchanged; `maxLevel` fails closed
    on a non-rung term.
  - The successor hook returns "code alone" until P-G15b.
  - `EXPIRED` and `SUPERSEDED` leave `RefusalCode`.
- **Exclusive files:** `gates/gate1.ts`, `gate1.spec.ts`, `gates/gate5.ts`, `gate5.spec.ts`,
  `gates/gate15-ports.architecture.spec.ts`, `test/widgets-live/gate1-5.live-spec.ts`, `mutations/gate1-5.json`,
  `scripts/widgets-http-proof/gate1-5.cases.ts`.
- **IR:** slot 1 → `gate1`; `GateVerdict` outcome; `RefusalCode` pruning; `maxLevel` in `contract-bindings.ts`;
  controller outcome literals; `SEAL_VERIFIER` injection.
- **Exit tests:** [GW, HTTP; G-SYNTH until E1] G15-1 forged token → `EXPIRED`, code alone, 0 timeline reads; G15-2
  tampered stored `bodyHash` → `EXPIRED`; G15-3 `widget_id` mismatch → `EXPIRED`; **G15-4 floor-changed (an
  `[tamper:verificationFloor]` E-TAMPER with `recomputeFloor(row)` rewritten in the same statement — findings 5 and
  22 replaced the impossible "policy row change" E-DRIFT)** → `superseded/policy_floor_changed`, counter +1, NW; G15-5
  non-rung term → STEP_UP; **G15-6b** the G5-f U-proof (finding 10). [BUILD] G15-6 no projector or owner port
  reachable from slots 1 and 5.
- **Battery:** skip the seal; `===` compare; outcome `refuse` for `policy_floor_changed`; counter persisted.
- **Audit:** enables G1-a…G1-e, G1-f (code-alone half), G5-a…G5-e (code-alone half).

#### P-23 — AE commit allowlist, capability-gap ledger, start-up assertions · prerequisite · implementer  `[REC·pre]`
- **Depends:** P-25, P-LEDGER.
- **Scope:** `row XOR gap` over the 226 AE-CAP rows; the BOOKING/CONSENT/IDENTITY/MONEY vetoes; the pairing check;
  `family` derived rather than hard-coded (`contract-bindings.ts:213`, an integrator edit).
- **Exclusive files:** `src/widgets/authority/{ae-commit-allowlist.runtime,ae-capability-gap-ledger.runtime,allowlist-startup.assert}.ts`
  + specs, `mutations/gateP-allowlist.json`.
- **IR:** the `contract-bindings.ts:205-215` binding reads the runtime tables; start-up hook.
- **Exit tests:** [BUILD] AL-1 totality; AL-2 each veto (a start-up failure per injected violating row) [RI]; AL-3
  pairing; AL-4 family derived.
- **Battery:** drop the MONEY veto; family hard-coded; a row and a gap on the same key.
- **Audit:** enables G6-8, G7-6 and G7-FR6d; unblocks U6-L2.

---

### Wave 3 — Phase B-2 (the pipeline becomes fully built)  `[REC·pre]` + revision notes

#### U10b — Slot 10 on the live path · Phase B · implementer
- **Depends:** U9b, U10a, I-MIG2, P-PRINCIPAL (`T`).
- **Scope:** AREA-B §3.4 U10b: `gates/gate10.ts` **(the I-CTX seam)** implements 10.3–10.9 with the literal row-2 set;
  `DivergenceStore.liveCandidates(T, …)`, `recordDivergence(T, row)` (through `scoped()`) and the read-only
  `countDivergences`. No mode flag. None of the old predicates. No fact emitted.
- **Exclusive files:** `src/widgets/gates/gate10.ts`, `gate10.spec.ts`, `gate10.source.spec.ts`,
  `src/widgets/stores/divergence.store.ts`, `test/widgets-live/gate10-divergence.live-spec.ts`,
  `mutations/gate10.json`, `scripts/widgets-http-proof/gate10.cases.ts`.
- **IR:** AREA-B requests 3–9: facade delegates; slot 10 in `T` with `pending('10')` removed; the S-ROW allowlist for
  the candidate projection; `facts.architecture.spec.ts`; the T-ARCH-F15 allowlist entry; `pipeline-order` stop at
  `'10'`; a harness builder for sibling candidates.
- **Exit tests** [GW, HTTP; G-SYNTH until E1]: T10-R1, R1b [XF→U6-L3 for REFINE], R2, R2b, R3, R3b, **T10-R4
  redesigned as REFINE vs HANDOFF** (finding 3), R5, R6, R6b, R7. T10-DS02 (escalation cases [XF→U6-L3]); T10-ESC;
  T10-CAND; T10-ORDER; T10-MULTI-USE; T10-TX (= T9-TX-1/2); T10-SHAPE; T10-NOSUB; T10-CARRIER; T10-F15/LOG;
  T10-HTTP-1/2. BIN `gate10.cases.ts`. [BUILD] B10-5…B10-8.
- **Battery:** M10-1…M10-26; **M10-5 is RI-killed and recorded as equivalent on conformant input** (finding 3).
- **Audit:** enables 10.1–10.11 and 10.R1–10.R7 for E1, **except 10.R5, which becomes a U candidate** (class `c` is
  permitted on no kind, C11:2801), and **10.6–10.8 flip only after every row is decided**.

#### U8b — Gate 8 schema lane · Phase B · implementer
- **Depends:** U8a, U8b-c, P-MINT-CORE, U6-L3, U7a.
- **Scope:** AREA-A §2.3 U8b: the schema source is the render receipt's `emittedEnvelopeJson` projection, accepted
  only when `inputSchemaHash(schema) === record.inputSchemaHash`; erased or absent → `superseded/handle_stale`; a hash
  mismatch throws. Per-field domain (B-09); set semantics (B-11); the byte cap (AMB-19); undeclared keys refused; kind
  conformance (B-13). SCHEDULE targets checked per entry. `INPUT_BOUNDS_REGISTRY`/`INPUT_NORMALIZER_REGISTRY` bound
  **empty** (unregistered → `bound_violation` / `use_secure_surface`). text: `max_len` → `bound_violation`, then
  `c9SafeText` → normalizer → `c9SafeText`. Phone refuses. Labels are field-keyed → `selectedLabels` (null when
  unresolvable, DS-03 A). **No `mechanism_absent` left on slot 8.**
- **Exclusive files:** `input-validation/*` (schema lane),
  `input-validation/{input-schema-source,input-bounds.registry,input-normalizers.registry}.ts`.
- **IR:** R8-3 (empty frozen-map providers); R8-4 (k3 source checks S-H6, S-ROW, S-HELD, S-READS, S-DIFREE, S-C9ARGS);
  **remove `mechanism_absent` from `RefusalCode`** (P-RENDER REN-3 and REN-5 turn green in this merge); R8-5 (H6
  retirement of the second canonicalisers, with P-SEAL's list).
- **Exit tests:** [GW, HTTP; G-SYNTH until E1] G8 T1–T35 re-pinned; T-DUP, T-CROSS-FIELD, T-ERASED, T-HASH, T-MAXLEN
  [RI], T-BOUND-ECHO [RI], T-REG-EMPTY. Positive admits of bounds, normalizer, text and phone are [RI] only.
  [BUILD] T-MINT-NONCLOSED (with P-MINT-CORE).
- **Battery:** G8 M1–M31, M-DUP2, M-PER-TOKEN-DOMAIN, M-ERASED-REFUSE, M-HASH-SUPERSEDED, M-BOUND-ECHO,
  M-MAXLEN-IGNORED.
- **Audit:** `[REC·rev]` enables G8-1, G8-2, G8-6, G8-SCHEMA, G8-SHAPE and G8-LABELS for E1. **G8-5 splits into G8-5t
  (text) and G8-5p (phone). Only G8-5p is a U candidate (PKT:469). G8-3, G8-4, G8-5t and G8-DENY stay `false`,
  because AMB-21d is an unapproved engineering choice** (finding 9).

#### U7c — Gate 7 C11: BOOK.1 subject vs `confirmation_subject` · Phase B · implementer
- **Depends:** U7b, I-MIG2, P-MINT-CORE (writer).
- **Scope:** C11 compares the subject re-derived from `subjectCapability(record)` through the three booking rows with
  `record.confirmationSubject`. A null value or a mismatch → `booking_confirmation_required`. `bodyJson` is never read.
- **Exit tests:** [GW G-SYNTH] N-C11-NULL, N-C11-MISMATCH, P-C11; [BUILD] the F15 reachability test (M35).
- **Audit:** enables G7-BOOK1 for E2.

#### U6-L2 — Delete the TRANSITIONAL veto · Phase B · implementer
- **Depends:** P-23.
- **Scope:** remove the `CONSENT(cap) || IDENTITY(cap)` veto in the same commit as P-23's start-up assertions.
  T-TRANSITIONAL-VETO is replaced by AL-2, and M22 is retired.
- **Audit:** removes the recorded Gate 6 deviation (AREA-A §2.1 U6-L2 note).

#### U12b — Projector rows and port bindings · Phase B · implementer
- **Depends:** U12a, P-K4K8, P-PRINCIPAL, P-MINT-CORE, P-RENDER.
- **Scope:** AREA-C U12b·V11. The first row set: `catalog.services.read`, `catalog.staff.read` (output v1; S6-3),
  `booking.availability.read`, `company.business-hours.read`, and `c9.no_action` (orchestrator state); plus **one
  closed-domain selector row** (SCHEDULE `move_intent` REFINE on `appointments.own.reschedule`, owner-composed;
  SCHED.2; the successor is a `LIMITATION` before discharge).
- **Constraints:** denial passes through `limitation_codes`; L2 missing field → `degraded` → B-16 text turn;
  `composeNavigate` stays `degraded` (DEV-1); **not registered:** principal-narrowed reads (OD-5), F36a keys,
  scalar-argument rows.
- **Exclusive files:** `projection/projector.registry.ts` (rows), `projection/rows/*.ts`,
  `src/widgets/owner-ports/canonical-read.provider.ts`, live-spec additions.
- **IR:** owner-ports imports `AiToolsModule`, `MeasurementModule`, `C8Module`, `C9Module` (k3 check 9 in the same
  commit, plus a `test:widgets:http` boot); controller `next_envelope`.
- **Exit tests:** [HTTP; G-SYNTH until E1] G12-L01, L02, L03, L05, L06, L07, L09, L13 (owner edge; LIMITATION before
  discharge), L15–L20. L04 and L04-M are **not built** (OD-5). L10 is **not built** (DEV-1/OD-1).
- **Battery:** MUT-12-A, D, E (static), F, G, H, I, L, N, P, Q, R, S.
- **Audit:** enables G12-R1a, R2, R3, R5 (unnarrowed), I1–I9 for E1.

#### P-RT6 — Erasure job and ordering with Gate 9 · prerequisite · implementer
- **Depends:** U9b (`timelineLockKey`), I-MIG2.
- **Scope:** AREA-C §2.4.6. The erasure job is driven by the `ErasureClass` map. In one statement under
  `pg_advisory_xact_lock(timelineLockKey(...))` it sets `erasedAt` and nulls every C/X column, and writes a
  `WidgetErasureTombstone`.
- **Exclusive files:** `src/widgets/consent/erasure.job.ts` + spec, `test/widgets-live/erasure-ordering.live-spec.ts`,
  `mutations/gateP-rt6.json`.
- **IR:** job provider (dark; invoked by K12 scheduling, not by this plan).
- **Exit tests:** [GW] RT6-1 concurrent erasure vs lowering (either the turn exists and is then erased, or
  `superseded/handle_stale` with no turn); RT6-2 canonical booking, consent and loyalty reads byte-identical before
  and after; RT6-3 a Gate 1/5 successor after erasure → code alone [XF→P-G15b].
- **Audit:** enables 9.7 (with U9b) and G1-f (code-alone after erasure).

#### P-G15b — The R3.9.4 successor at Gates 1 and 5 · prerequisite · implementer
- **Depends:** P-G15a, P-MINT-CORE, U-TAB, P-RT6.
- **Scope:** AREA-C §2.4.4 successor, issued only when all of these hold: the constant-time proof-hash match;
  `assertTenantId`; `REFINE ∈ KIND_REGISTRY[kind].permitted_effects`; the owner-class clause; a readable, non-erased
  predecessor. It reads `textEquivalentJson` and `provenance.source_capability`, and asks `SUCCESSOR_MINTER` for one
  remedy `REFINE`. NW follows D-12. No projector or owner port.
- **Exit tests** [HTTP; G-SYNTH until E1]: G15-7 own expired → `EXPIRED` + one remedy whose tap passes 1–13; G15-8 own
  superseded → remedy; G15-9 foreign principal → code alone; G15-10 erased predecessor (P-RT6 job) or unreadable
  timeline (restricted role, B-21) → code alone; G15-11 a kind without REFINE → code alone; G15-12 floor changed →
  remedy; G15-13 projector and owner spies at 0 on every branch; G15-14 equal latency within the code-alone class.
- **Audit:** enables G1-f, G1-g and G5-e for E1.

---

### Wave 4 — Phase B-3: production triggers and the late gate units  `[REC·pre]` + revision notes

#### P-MT2a — Minter (2) on a registered C9 read (T-2b and T-2a) · prerequisite · implementer + owner-side
`[REC·rev]` **Rewritten by finding 16.** The pre-review card put the hook on `POST /api/ai/chat` and assumed a model
call. Under D-15 the hook sits at the completion of a registered C9 READ inside `AiToolRuntimeService.execute`, and
**T-2b** (`POST /api/ai/tools/:toolName/execute`, model-free) is the E1 producer. **The model transport is never
stubbed.**
- **Depends:** P-MINT-CORE, U12b. **First in Wave 4 after P-RESOLVE** (P-RESOLVE moved first for token retrieval,
  finding 16).
- **Scope:** when a registered C9 READ completes for a tenant holding `widgets.runtime`, the widget layer composes
  that read's projector row and mints REFINE, HANDOFF, escape-bearing and SCHEDULE-selector envelopes. SH-19 adds an
  additive `resolution` member. No route is added. The emission fixture recorder feeds 10.10.
- **Exclusive files:** `src/widgets/composition/chat-read.trigger.ts` + spec,
  `test/widgets-live/trigger-chat-read.live-spec.ts`, `mutations/gateP-mt2a.json`. **Owner-side:** the
  `src/ai-tools/ai-core.*` hook (owner-reviewed).
- **IR:** module wiring (cycle check, PLAN §6.1); the evidence trace id in `support/evidence.ts`.
- **Exit tests:** [HTTP, BIN] MT2-1 a read for an entitled proof tenant → a sealed envelope, and records equal to their
  derivations; MT2-2 a non-entitled tenant → 0 `Widget*` writes, response bytes unchanged; MT2-3 the existing
  `/ai/chat` suite unchanged apart from `resolution`; MT2-4 a trace id is recorded; MT2-5 a composition that would
  carry DRAFT/COMMIT yields a LIMITATION with `MG-P01` (A2.2, **L**); **MT2-6 each envelope class E1 needs is minted
  through T-2b with `AI_CORE_PROVIDER=safe`**; **MT2-7** (the second new test named by finding 16; its content is not
  recorded). `[RECON]`
- **Battery:** the entitlement check removed (MT2-2); the backstop bypassed (MT2-5).
- **Audit:** the producer for E1 on Gates 1, 3, 4, 5, 6, 7, 8, 8-R, 9, 10, 11, 12, 13. Also turns the R3124 duty
  (10.10) green on production fixtures. **If MT2-6 is not green, every dependent clause stays `false`.**

#### P-TYPED — Step 0 typed router and the typed user turn · prerequisite · implementer + owner-side
- **Depends:** U9b, U10a, P-MT2a (same owner file, merge after it).
- **Scope:** a typed sentence that equals a live candidate's rendering (`routeUtterance`, the same function as Gate 10)
  is submitted as that token through the gateway (carrier `pwa`), and it is not stored as a separate turn (AMB-26d
  corrected placement). An unmatched sentence takes the ordinary chat path unchanged.
- **Exclusive files:** `src/widgets/composition/typed-step0.ts` + spec, `test/widgets-live/typed-step0.live-spec.ts`.
  **Owner-side:** the `src/ai-tools/ai-core.*` hook.
- **Exit tests:** [HTTP] TYP-1 a match routes to the same token; TYP-2 the typed-origin turn row equals the tap-origin
  turn row (except id, index and time), with equal outcomes and rows after 9 (= T9-TYPED-1); TYP-3 a matched typed
  sentence writes exactly one user turn; TYP-4 no match → path unchanged. [BUILD] TYP-5 one router import.
- **Audit:** `[REC·rev]` **9.6 does NOT flip here.** Finding 4: TYP-2 compares two submissions of one token, which is a
  self-comparison; the byte-identity clause needs the typed chat ingress to persist user turns through the same writer
  (TYPED-TURN, P-03/K5), which is out of cycle. 9.6 stays `false`.

#### P-MT1 — Minter (1) on the C9 run (T-1) · prerequisite · implementer + owner-side
- **Depends:** P-MINT-CORE, U12b (`c9.no_action` row).
- **Scope:** `C9Orchestrator` composes `STRATEGY_OPTIONS`/`PROGRESS` from run state with `run_ref`
  (`runId`, `revisionId`), a non-null `c9_domain` on the run-bearing path (R3.7.1), and a `control.run.cancel` intent
  (`single_use`), dark behind `widgets.runtime`.
- **Exclusive files:** `src/widgets/composition/c9-compose.trigger.ts` + spec,
  `test/widgets-live/trigger-c9.live-spec.ts`, `mutations/gateP-mt1.json`. **Owner-side:** the
  `src/orchestration/c9.orchestrator.ts` hook.
- **Exit tests:** [HTTP] MT1-1 records carry `runId`/`revisionId` and a non-null `c9Domain`; MT1-2 non-entitled → no
  writes; MT1-3 run-less vs run-bearing `c9_domain`.
- **Audit:** the producer for G6-16, G11-R2 (witness), G13-R5 (`run.cancel`) and G1-d. **If it slips, G6-16 stays
  false** (§0.3).

#### P-MT3 — Minter (3) on a moment tick (T-3), restricted tiers · prerequisite · implementer + owner-side
- **Depends:** P-MINT-CORE, U-TAB.
- **Scope:** one K13 moment for an entitled proof tenant, fitted for `web-push` (and `sms`/`email` where the channel
  exists): `NAVIGATE`/`HANDOFF` plus the tokened escape (`control.widget.dismiss`, priority 0, `single_use`), with one
  `WidgetRenderReceipt` per channel.
- **Exclusive files:** `src/widgets/composition/moment.trigger.ts` + spec,
  `test/widgets-live/trigger-moment.live-spec.ts`. **Owner-side:** the K13 scheduler hook.
- **Exit tests:** [HTTP/GW-tick] MT3-1 web-push records with `deliveryChannel 'web-push'`; MT3-2 non-entitled → none.
- **Audit:** `[REC·rev]` the producer for G7-7 restricted-tier positives, G13-R5/P01 dismiss on non-RICH tiers, G1-d
  **and G3-e** (a web-push token minted for A and submitted by B is refused, NW — finding 13). **If K13 cannot host it
  this cycle, G7-7 and G3-e stay false** (§0.3).

#### P-RESOLVE — `/api/widgets/resolve` thread page · prerequisite (P-01 discharge only) · implementer
- **Depends:** P-MINT-CORE. **Merges first in Wave 4** (token retrieval for the trigger tests, finding 16).
- **Scope:** `{thread_page:{before?, limit≤50}}` → the principal's `HistorisedWidget[]` (SH-12). The
  `(widget_id, density)` detail request is dropped (A5/DEV-1).
- **Exclusive files:** `src/widgets/resolve/thread-page.service.ts` + spec, `test/widgets-live/resolve.live-spec.ts`.
- **IR:** controller wiring (k3 check 7: still two routes).
- **Exit tests:** [HTTP] RES-1 own widgets only; RES-2 a detail request → 400; RES-3 a foreign principal or tenant sees
  nothing; RES-4 k3 check 7.
- **Audit:** none; a P-01 component.

#### U11b — Owner ports, witness port, successor · Phase B · implementer
- **Depends:** U-OWN, U11a, U10b, P-PRINCIPAL, P-MINT-CORE, U12b, **P-HANDLE**.
- **Scope:** AREA-C U11b·V11: the five adapters, handle dereference with integrity tags, the B-18 mapping, the
  rendered diff (B-23), the successor through `SUCCESSOR_MINTER` (B-24), and the APPROVAL-decision divergence fact
  (AMB-43b).
- **Exclusive files:**
  `owner-ports/noun-{booking-create,booking-reschedule,booking-cancel,client-appointment-read}.adapter.ts`,
  `owner-ports/witness-c9-revision.adapter.ts`, `owner-ports/noun-resolution.owners.provider.ts`,
  `noun-resolution/rendered-diff.ts`, additions to `gate11-nouns.live-spec.ts`.
- **IR:** owner-ports imports `CrmModule` and `C9Module` (k3 check 9); `NOUN_RESOLUTION_PORTS`; controller
  `next_envelope`; `support/restricted-role.ts`.
- **Exit tests:** [HTTP; G-SYNTH until E1] G11-P1 (REFINE variant), N1, N2a/b, N3, N4a/b, N6, N7, N8, N11, N12, N16,
  N19, N20. The COMMIT variants of P1, DB1 and N23 [XF→P-DISCHARGE]. N13/N14 [RI] for the U proof.
- **Battery:** MUT-2, 4a/b, 5, 6, 8, 10, 13, 14, 15, 17, 18.
- **Audit:** enables G11-R1…R4, I2, I3, I7 for E1; I9 and the COMMIT subjects for E2; I4–I6 **and I10** as U.

#### U13b — Non-actuating edges · Phase B · implementer
- **Depends:** U13a, U12b, P-MINT-CORE, U10b, P-PRINCIPAL.
- **Scope:** AREA-C U13b·V11: REFINE → projector or owner edge; NAVIGATE → `degraded` (DEV-1); the CONTROL map:
  dismiss, `run.cancel` → `C9Store.cancel` with the AMB-58 key, `delivery.resolve` → `null` →
  `effect_not_admissible`; HANDOFF → `HandoffTarget` signer; successors with L7 from `LIVE` only.
- **Exclusive files:** `routing/edges/{refine-navigate,control,handoff}.edge.ts`, `routing/handoff-target.signer.ts`,
  `owner-ports/c9-cancel.adapter.ts`, live-spec and case additions.
- **IR:** `HANDOFF_SIGNER`, `SUCCESSOR_MINTER` bindings; `C9Module` import (shared with U11b).
- **Exit tests:** [HTTP; G-SYNTH until E1] G13-P02, P03, P04, N05 (re-written), N06, N21; `[REC·rev]`
  **N-CANCEL-FOREIGN** (the handler's own principal and tenant check, R3.2.4 — finding 11). A NAVIGATE case asserting
  `degraded` + 0 reads, labelled **"holds by absence (DEV-1)"**, counts toward nothing.
- **Battery:** M6, M7, M8, M24 (re-written), M17, M19.
- **Audit:** enables G13-R3, R5, I4 for E1. `[REC·rev]` **G13-R8 needs LANDING-VERIFY and stays `false` until it
  exists** (finding 12): this unit builds only the signer, not the `EP-FETCH` landing verification.

---

### Wave 5 — Phase B-4 and evidence batch E1 (before discharge)  `[REC·pre]` + revision notes

#### U13c — Actuating edges (build only) and the Gate 6/14 counter · Phase B · implementer + owner-side
- **Depends:** U13a, U13b, U11b, P-23, P-25, P-MINT-CORE.
- **Scope:** AREA-C U13c·V11: the draft-owner registry (B-31); the approval-request owner port (`preview()` →
  `createExecution`); COMMIT → the F38 surfaces inside `withActionInvocationReceipt`, with
  `callerIdempotency.key = record.confirmation.idempotency_key` and `sourceType 'authenticated_request'`;
  `getExecutionResult` classification and B-29 receipts plus reconciliation; APPROVAL decisions → `decideApproval`;
  F75 sibling consumption. **Plus AMB-G6-7:** at the COMMIT edge, a Gate 14 refusal whose reason is a (d)/(e)
  re-resolution (`role_denied`, `membership_*`, `user_inactive`, `actor_required`, `entitlement_denied`) after slot 6
  passed increments `widget_gate6_gate14_disagreement` (a metric). The outcome is Gate 14's. There is no new code.
- **Owner-side:** the marketing owner's approval-request surface for `communication.bulk-campaign.admit.v2` (K11); the
  K7 booking draft owner (P-08) is in P-MINT-BOOK. Until they exist the DRAFT and REQUEST_APPROVAL edges refuse under
  AMB-01a.
- **Exclusive files:** `routing/edges/{draft,request-approval,commit,approval-decision}.edge.ts`,
  `owner-ports/{commit-booking.adapter,draft-owner.registry,approval-request.adapter}.ts`,
  `routing/gate14-disagreement.metric.ts`.
- **IR:** `AppointmentsModule`/`CrmModule`/marketing imports, **never `ActionEngineModule`**; the P-27 build assertion
  (`controlledFixtureMode === false` outside harnesses).
- **Exit tests:** [GW G-SYNTH; L at E2] G13-P05…P09, N08, N09 (+ owner variant), N10, N11, N12, N12b (B-29), N13;
  G6-14C (counter: slot 6 passes, the entitlement is revoked between 13 and 14 by a spy-gated pause on real instances
  → Gate 14 REFUSED, counter +1, outcome not Gate 6's). [BUILD] P-27; no widget id in AE rows.
- **Battery:** M5, M9, M11, M13, M16, M21; the counter increment removed; Gate 6's verdict reused at 14.
- **Audit:** enables G6-13, G13-R6, R9, I3, I5 (actuating), I7 for E2; G13-R7, I1, I2 as U.

#### E1 — Evidence batch before discharge (13 tasks; each on its owner's live spec and cases file)

The records come only from the triggers (**T-2b**, T-2a, P-MT1, P-MT3) or from gateway successor edges. Each task
writes `[E-MINT]`, `[E-HOSTILE]`, `[E-DRIFT]`, `[E-TAMPER:<col>]`, `[E-INDEP]` or `[U-proof]` test variants, with
`WIDGETS_EVIDENCE=1` manifest lines, and each L claim needs an HTTP line and a BIN line verified against the captured
`WidgetMintProvenance` lines (D-17).

| Task | Owner unit | Clause keys targeted (§3.1) | Producer |
|---|---|---|---|
| E1-G1G5 | P-G15a/b | G1-a…g; G5-a…e (L, with G5-e as L-T by `[tamper:verificationFloor]`); **G5-f is a U-proof on every carrier** | T-2b/T-2a, T-1 (`single_use` `run.cancel`), T-3 |
| E1-G2G3 | P-PRINCIPAL | **G2-a via G2-EQ**, G2-b, G2-c; G3-a, G3-b, **G3-c1**, G3-d; **G3-e** (T-3 push replay); U-proofs **G3-c2**, **G3-f** | T-2b, T-3 |
| E1-G4 | U4 | G4-a (L positive; E-INDEP refusal on `N4`), G4-b | T-2b |
| E1-G6 | U6 | G6-1…7, G6-14 (REFINE), G6-15…20, FR14 (S-FR14 + FR14-VAR). **G6-6 waits on LANDING-VERIFY** | T-2b, T-1 (G6-16), T-3 |
| E1-G7 | U7 | G7-1, G7-2, G7-3, G7-7, G7-8 (`effect_not_admissible` half) | T-2b, T-3 |
| E1-G8 | U8 | G8-1, G8-2, G8-6, G8-7, G8-8, G8-SCHEMA (erasure by the P-RT6 job), G8-SHAPE, G8-LABELS; **U-proof G8-5p only**; G8-3, G8-4, G8-5t, G8-DENY stay `false` | T-2b SCHEDULE selector |
| E1-G8R | U8R | R-0, R-1, R-6 (**object acks**), R-7 (unrequired); U-proofs R-2…R-5 and the required half of R-7 | T-2b |
| E1-G9 | U9 | 9.1–9.5, 9.7–9.10. **9.6 is `false`** (TYPED-TURN out of cycle) | T-2b, P-TYPED |
| E1-G10 | U10 | 10.1–10.11, 10.R1–R4, R6, R7 on production collisions; **10.R5 is a U-proof** | T-2b, T-1, T-3 |
| E1-G11 | U11 | G11-R1…R5, I1, I2, I3, I7, I8; U-proofs I4, I5, I6, **I10** | T-2b (SCHED.2), T-1 (witness) |
| E1-G12 | U12 | G12-R1a, R2, R3, R4, R5, R6, I1–I10; NAVIGATE "holds by absence (DEV-1)" (not counted) | T-2b, T-1 |
| E1-G13 | U13 | G13-R1, R3, R4, R5 (dismiss and `run.cancel`; `delivery.resolve` `false` without P-17), **R5b**, R10, I4, I5 (non-actuating), I6, I8, I9 (P-27 half); U-proofs R7, I1, I2. **R8 waits on LANDING-VERIFY; R2 is DEV-1 `false`** | T-2b, T-1, T-3 |
| E1-G14 | integrator | **No E1 task.** Finding 1 removed it: G14-a…c stay BLOCKED-DISCHARGE until a live widget COMMIT reaches `prepare()` at E2 | — |

**Interim re-audit A-W5.** §3.3 procedure. Expected result if nothing slips:
`GATES LIVE CONTRACT-COMPLETE 3/15 · WITH U-CLASS 6/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES <counted>`.
Strict 3/15 = Gates 1, 2, 4. With U 6/15 adds Gates 3, 5, 10 — and Gate 3 only if P-MT3 delivers G3-e. The second
number stands only if OD-3 is accepted; otherwise it is printed "U not accepted". `[REC·rev]`

---

### Wave 6 — Phase C (owner-gated; nothing here starts before OD-1 and OD-2 are answered)  `[REC·pre]`

#### C-V12 — Contract version bump carrying the owner answers · integrator (docs) · owner-approved text
- **Scope:** OD-1 (Sheet 06 option A: an AUDIT_RETAINED source-capability member on the record of a `NAVIGATE` to
  `detail`, and A5 transferred whole; **plus the answer on DEV-1**); OD-2 (the recommended C: split P-01/P-30 rows);
  OD-4 and OD-5 if answered. Regenerate `src/widget-contract/*` (`node scripts/widget-contract/emit.mjs`), the
  decision record and the Annex.
- **Exit tests:** `run-all-checks.sh` green (`contract-version-record-check`, `widget-contract-check`,
  `mapping-vs-contract-check`); the line map V1.1→V1.2 produced as in `p4-v11/final/gen`.

#### I-MIG3 — Source-capability member column (conditional on OD-1 A) · integrator
- **Scope:** an additive `WidgetIntentRecord.sourceCapabilitySpace/Key // A`. `[REC·rev]` **It is migration 3 unless
  an owner-run read-only check confirms production still has 0 widget tables** (finding 30); the fold into migration 2
  is conditional on that check, not assumed. The proof DB is recreated.

#### U12c / U13d — The NAVIGATE half of Gate 12 and the NAVIGATE edge of Gate 13 · Phase C
- **Depends:** C-V12, I-MIG3, P-MINT-CORE (writer of the new member).
- **Scope:** A5 as transferred: Gate 13 evaluates the sealed source capability for the live principal; the projector
  re-projects `detail`/`w`; K16's `(widget_id, density)` only if V1.2 restores it. G12-L10 is built.
- **Exit tests:** G12-L10, G13 NAVIGATE positives and negatives; M28 re-scoped; MUT-12-E live.
- **Audit:** `[REC·rev]` G12-R1b, G12-I11 and G13-R2 leave **DEV-1** (not STOPPED) and can flip.

#### P-G15c — Gate 5 deep link for non-HANDOFF records (conditional on OD-4) · prerequisite
- **Scope and tests:** per the answer, with an L-T shortfall on each effect class. `[REC·rev]` **No `HandoffTarget` is
  reused at Gate 5** (finding 10); without OD-4 A plus P-12 there is no mechanism at all and G5-f stays U.

#### P-MINT-BOOK — The booking chain (RM-D) · prerequisite · implementer + owner-side (K7)
- **Depends:** U13c, P-MT2a, U7c, U11b.
- **Scope:** SERVICE_SELECTOR `DRAFT appointments.own.create` → the K7 booking draft owner (P-08, owner-side) →
  `BOOKING_CONFIRMATION` `COMMIT crm.appointment.create.v1` (draft ref, subject `create`). SCHEDULE
  `REFINE appointments.own.reschedule` → Gate 13 consumption → reschedule `COMMIT` (record ref, `produced_by`).
  Cancel likewise. Built and tested G-SYNTH first. Its HTTP tests are `[XF→P-DISCHARGE]`, because the backstop refuses
  actuating mints until then.
- **Exit tests:** BOOK-1…BOOK-6 (one per chain step, create/reschedule/cancel) [HTTP after discharge];
  `action-engine:appointment-proof` green.

#### P-DISCHARGE — A2.7 discharge commit · integrator + owner review
- **Depends:** every unit above, C-V12, CKPT-W green.
- **Scope:** in **one commit**: (a) each mechanism at its stated path; (b)
  `src/widgets/authority/discharge.build.spec.ts`, `EP-BUILD` tests that fail if a mechanism is removed; (c) withdraw
  exactly the gap keys whose rows are now whole: MG-P01 (or its V1.2 split rows), MG-P16, MG-P18, MG-P23, MG-P25,
  MG-P26, MG-P30 (or its split). This goes in the runtime ledger (P-LEDGER), `k1-mechanism-gap-ledger.json` and the
  contract's §A1 status, as a reviewable diff (RT8). Rows not whole stay (P-12, P-17, P-33, SPOKEN readback if split).
- **Exit tests:** DIS-1 a mutation removing each mechanism is build-killed; DIS-2 the A2.2 backstop admits actuating
  intents only for discharged rows; DIS-3 a non-discharged row still yields a LIMITATION (L, via T-2b); full CKPT-W.

#### E2 — Evidence batch after discharge

| Clause keys | Evidence |
|---|---|
| G6-8…G6-12 | E-MINT booking COMMIT passes; (a)–(c) E-INDEP; (d) **E-DRIFT role change on neutraliser `N3`** (finding 6 forbids `[tamper:principalProofHash]`, a seal term); (e) E-DRIFT (entitlement revoked) |
| G6-13 | G6-14C on E-MINT records |
| G6-14 | DRAFT subjects |
| G7-4, G7-5, G7-6, G7-BOOK1 | E-MINT + E-TAMPER per AREA-A §3.3 |
| G7-7 (DRAFT half) | **E-INDEP(mint)** (finding 6) |
| G7-FR6b | mutation plus E-MINT positive |
| G7-FR6d | E-INDEP |
| R-1a | `[tamper:confirmationJson.requires_readback]` on a COMMIT; **the SPOKEN half stays U** (finding 6) |
| 10.R2 | DRAFT/COMMIT variants |
| G11-I9 and COMMIT subjects | create, reschedule, cancel (N23), slot taken (DB1, internal-calendar tenant) |
| G13-R6, R9, I3, I5 (actuating), I7 | as listed |
| G12-R1b, G12-I11, G13-R2 | after U12c/U13d (DEV-1 answered) |
| G5-f | after P-G15c, only if OD-4 A |
| G14-a, G14-b, G14-c | the first live widget COMMIT reaching `prepare()` (finding 1) |

Then run the **FINAL re-audit** (§3.3).

---

## §2 Parallel work in one shared working tree  `[REC·pre]` + revision notes

### §2.1 Integrator-only files (one committer for the whole programme; units request edits, never make them)

**Widget runtime:**
- `src/widgets/intent-gateway.service.ts`, `src/widgets/gate.types.ts`
- `src/widgets/gates/{verdict,subject,facts,effect-sets}.ts`
- `src/widgets/widgets.module.ts`, `src/widgets/di-tokens.ts`,
  `src/widgets/owner-ports/widget-owner-ports.module.ts` (imports and providers arrays)
- `src/widgets/widgets.controller.ts`, `src/widgets/intent-submit-args.ts`
- `src/main.ts`, `src/bootstrap/configure-http-app.ts`, `src/app.module.ts`
- `src/widgets/authority/{contract-bindings,registry-binding,authority-resolver}.ts`
- `src/widgets/stores/widget-stores.service.ts` (facade)

**Schema and generated contract:**
- `prisma/schema.prisma`, `prisma/migrations/**`
- `scripts/widget-contract/{emit,extract,postprocess}.mjs` and every generated file under `src/widget-contract/`
  **except** `tables.ts` (U-TAB), `f88.generated.ts` (P-F88), the ledger runtimes (P-LEDGER) and
  `reason-table.ts`/`owner-classes.ts` (P-RENDER/U-TAB)

**Checks, harness, CI:**
- `scripts/k3-gateway-check.mjs`, `scripts/widgets-mutation-battery.mjs`, `scripts/widgets-intent-http-proof.ts`,
  `scripts/widgets-evidence-verify.mjs`
- `package.json`, `test/jest-widgets-live.json`, `test/tsconfig.widgets-live.json`, `test/widgets-live/support/**`
- `.github/workflows/**`
- `[REC·rev]` **the legacy exit gates** (finding 20): `k3-exit-gate.sh`, `k4-exit-gate.sh`, `k5-exit-gate.sh`,
  `k6-exit-gate.sh`, `run-all-checks.sh`. They grep for structures units delete ("fire independently",
  "SENSITIVE_DEST is total", the FOREIGN import check), and no unit owned them; every such pin moves in the same merge
  commit as the deletion, with its V1.1 reason.

**Pipeline-wide specs:**
- `src/widgets/intent-gateway.spec.ts`, `intent-gateway.order.spec.ts`
- `src/widgets/gates/{gate-antecedents.inv30,facts.architecture,r353-readers.source}.spec.ts`
- `src/widgets/gate-context.source.spec.ts`
- `test/widgets-live/{pipeline-order,harness}.live-spec.ts`

**Evidence and documents:**
- `docs/rebuild/evidence/maya-chat-first-ux/{gate-conformance-audit.json, gate-clause-inventory.json,
  gate-audit-check.mjs, gate-audit-build.mjs, run-all-checks.sh, widget-schema-count.mjs, build-widget-checks.mjs,
  f88-mutation-battery.sh}`
- `docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md`, the contract and its decision record (C-V12 only)

**Owner-side files are not integrator files.** They are edited by the named unit and merged only with an owner-side
reviewer's sign-off:
- `src/tenancy/memberships.service.ts`, `src/orchestration/c9.module.ts` (P-PRINCIPAL)
- `src/appointments/client-appointment-create.service.ts`, `src/crm/client-appointment-{reschedule,cancel}.service.ts`
  (U-OWN)
- `src/ai-tools/ai-core.*` and `AiToolRuntimeService` (P-MT2a, then P-TYPED)
- `src/orchestration/c9.orchestrator.ts` (P-MT1)
- the K13 scheduler hook (P-MT3), the K7 draft owner (P-MINT-BOOK), the marketing approval-request surface (U13c)

### §2.2 Rules for working in one tree (no git worktrees)

1. **Exclusive ownership.** A unit edits only its exclusive files and its owner-side files. A file in no list is
   assigned by the integrator before anyone touches it. Chained units of one gate (U6 L1→L3→L2; U7 a→b→c; U8 a, c→b;
   U9 a→b; U10 a→b; U11 a→b; U12 K4K8→a→b→c; U13 a→b→c→d; P-G15 a→b→c) pass the same files along in sequence and are
   never open at the same time. `[REC·rev]` **D-18 overrides the deletion half of this rule: implementers add;
   the integrator deletes.** No implementer removes a file or an export another file imports.
2. **Forbidden to implementers.**
   - Any git write: `add`, `commit`, `stash`, `checkout`, `reset`, `rebase`, `worktree`, `gc`, `prune`.
   - `npm run format` or `lint:fix`, because they rewrite other units' files.
   - `prisma generate`/`migrate` and `emit.mjs` (writes `node_modules/.prisma` and generated contract files).
   - `npm run build` and `test:widgets:http` (`dist/` is shared).
   - `createdb`/`dropdb`.
   - Any edit under `maya-chat-shell/**`: the shell workstream's uncommitted changes are in the same tree.
   - `[REC·rev]` any use of `maya_widget_gate_proof_local` (D-19). The guard refuses it by name since `6a1349fe`.
3. **Keep your own files compiling** after every edit burst. Code against the I-CTX types and against dependencies'
   declared signatures. Never add a local copy of a shared type, table or codec.
4. **Proof DB concurrency.** One cluster (55611). `[REC·rev]` **The programme's databases are its own (D-19); the
   shell workstream's `_local` is never opened.** Tests create unique tenants.
   - Concurrent `test:widgets:live -- <own file>` runs from different units are allowed.
   - Mutation batteries and BIN runs are serialized through the integrator's queue, because each battery runs the full
     live suite.
   - Exclusive windows (I-MIG2, I-MIG3, P-DISCHARGE, every CKPT-W): the integrator creates `$S/pg-live/EXCLUSIVE`, and
     implementers check `[ ! -e $S/pg-live/EXCLUSIVE ]` before a live run.
5. **Hand-off.** An implementer ends a unit by giving the integrator: the exact list of changed paths; the integrator
   requests by id (R6-1, IR4-1, …) with the precise edit; the commands run and their exit codes. **Exit codes are read
   directly, never through `| tail` or `| head`.**
6. **Staging.** The integrator stages by explicit path only: `git -c gc.auto=0 add -- <paths>` and
   `git -c gc.auto=0 commit`, never `-A` or `.`. `git status --porcelain` before and after must show the unrelated
   dirty paths (`maya-chat-shell/**`, `k15-bundle-census.mjs`, `k5-exit-gate.sh` and the untracked shell files)
   unchanged.

### §2.3 What runs concurrently and what must be sequential

| Wave | Concurrent (disjoint files) | Sequential inside the wave |
|---|---|---|
| 0 | U-TAB is implemented while I-HAR is being done | CKPT-M0 → I-AUD0 → I-CTX → I-HAR → U-TAB merge |
| 1 | all 18: U4, U6-L1, U7a, U8a, U8R, U8b-c, U9a, U10a, U11a, P-K4K8, U12a, P-PRINCIPAL, P-F88, P-SEAL, P-RENDER, P-LEDGER, P-25, U-OWN | merges: U10a after U9a and P-25; U12a with or after P-K4K8; P-PRINCIPAL first |
| 2 | U6-L3, U7b, U9b, U13a, **P-HANDLE**, P-MINT-CORE, P-G15a, P-23 (implementation may start before I-MIG2 merges; merges only after it) | I-MIG2 first (exclusive DB window); **P-HANDLE before P-MINT-CORE**; P-23 before U6-L2 (W3) |
| 3 | U10b, U8b, U7c, U6-L2, U12b, P-RT6, P-G15b | U10b → U8b (`mechanism_absent` removed once); P-RT6 → P-G15b; U7b → U7c |
| 4 | P-RESOLVE, P-MT2a, P-MT1, P-MT3, U11b, U13b | **P-RESOLVE first**; P-MT2a → P-TYPED (same owner file `ai-core.*`) |
| 5 | the 13 E1 tasks (distinct live specs and case files) | U13c merge first; mutation/BIN runs serialized; A-W5 last |
| 6 | U12c, U13d, P-G15c, P-MINT-BOOK | C-V12 → I-MIG3 → {those four} → P-DISCHARGE → E2 → FINAL |

(The P-HANDLE and P-RESOLVE placements are `[RECON]` from findings 29 and 16.)

### §2.4 The integrator's merge order

- **W0:** CKPT-M0 → I-AUD0 → I-CTX → I-HAR → U-TAB → **CKPT-W0**.
- **W1:** P-PRINCIPAL → P-25 → P-LEDGER → P-F88 → P-SEAL → P-RENDER → U-OWN → U4 → U6-L1 → U7a → U8a → U8R → U8b-c →
  U9a → U10a → U11a → P-K4K8 → U12a → **CKPT-W1**.
  - P-PRINCIPAL goes first because it rewrites the runner (`T`, slot 2) and the fixtures every live spec uses.
  - Pure-value prerequisites come before their importers.
  - U8a comes before U8R so that T-DIV-1 converts in U8R's own merge.
  - **Executed order at `df6c3a5a`:** P-PRINCIPAL `5a1c1377` → P-25 `080f32b3` → P-LEDGER `296aee36` → P-F88
    `97982a93` → P-SEAL `a8ec03b5` → P-RENDER `5bbce7a2` → P-K4K8 `d1598e20` → U-OWN `fff08b48` → U4 `87c9f4c3` →
    U6-L1 `8d6c162d` → U7a `d6238b4a` → U8a `305c715c` → U8R `13127393` → U8b-c `0a0620d4` → U9a `6e576b41` → U10a
    `fb5d29af` → U11a `0af80584` → U12a `4f2703f1`. P-K4K8 and U-OWN merged earlier than the plan's order; the
    deletions still landed at U12a. `[RECON]`
- **W2:** I-MIG2 → P-23 → **P-HANDLE** → U6-L3 → U7b → P-G15a → U9b → U13a → P-MINT-CORE → **CKPT-W2**.
- **W3:** U10b → U8b → U7c → U6-L2 → P-RT6 → P-G15b → U12b → **CKPT-W3**. After U8b, `pending()` is gone, so REN-3 and
  REN-5 turn green in U8b's merge.
- **W4:** P-RESOLVE → P-MT2a → P-TYPED → P-MT1 → P-MT3 → U11b → U13b → **CKPT-W4**.
- **W5:** U13c → E1 tasks (each merged as it lands) → A-W5 re-audit commit → **CKPT-W5**.
- **W6:** C-V12 → I-MIG3 → U12c → U13d → P-G15c → P-MINT-BOOK → P-DISCHARGE → E2 → FINAL re-audit commit →
  **CKPT-W6**.

### §2.5 Regression checkpoints

**CKPT-M — after every merge commit.** It runs on a clean export of that commit (D-13), never on the live tree.
`[REC·rev]` **The export has no pathspec: it is the whole commit** (about 240 MB of tracked files), because 22 backend
specs read `сайт и приложение/…` and 7 read `maya-os-site/…` at module load, and `k5-exit-gate.sh` builds
`maya-chat-shell/`. The previous export is deleted once the next CKPT-M is green.

```bash
REPO=<repo>
cd $REPO && SHA=$(git rev-parse HEAD) && X=$S/p6-gates/ckpt/$SHA
rm -rf "$X" && mkdir -p "$X" && git archive "$SHA" | tar -x -C "$X"     # whole commit, no pathspec (D-13)
ln -s $BE/node_modules "$X/maya-saas-backend/node_modules"
cd "$X/maya-saas-backend"
run(){ "$@" > "$X/$(echo "$*" | tr ' /:' '___').log" 2>&1; rc=$?; echo "rc=$rc  $*"; [ $rc -eq 0 ] || echo "CKPT-M RED at: $*"; }
run npm test
run npm run typecheck
run npm run typecheck:scripts
run npm run lint
run node scripts/k3-gateway-check.mjs
run npm run typecheck:widgets-live
DATABASE_URL=$PDB run npm run test:widgets:live
run npm run build
DATABASE_URL=$PDB run npm run test:widgets:http
DATABASE_URL=$PDB run node scripts/widgets-mutation-battery.mjs --gate <battery id of the merged unit> --out $S/p6-gates/mut/ckpt-$SHA.json
```

A red step blocks the next merge. The fix goes to the unit's owner, never into another unit's files.
**An unknown `--gate` id no longer reports EMPTY and exits 0** (`3c5081ae`): EMPTY stays exit 0 only when nothing is
declared. `[RECON]`

**CKPT-W — at the end of each wave** (the wave gate WG-n). The integrator holds `$S/pg-live/EXCLUSIVE` for the whole
run.
1. Every CKPT-M step, with the **full** battery:
   `node scripts/widgets-mutation-battery.mjs --out $S/p6-gates/mut/wave<n>-$SHA.json`. Every mutant must end at its
   declared status; `SURVIVED = UNEXPECTED = 0`.
2. `npm run test:e2e`, and `DATABASE_URL=<maya_gates_smoke_w<n>> npm run test:http` — the integrator creates, migrates
   **and seeds** that database (finding 27). `[REC·rev]`
3. `bash docs/rebuild/evidence/maya-chat-first-ux/run-all-checks.sh` from the export root. It covers: consolidated
   audits, `widget-schema-count`, `contract-version-record-check`, `widget-contract-check`, `k3-gateway-check`,
   `k3-exit-gate`, `k4-exit-gate`, `k5-exit-gate`, `k6-exit-gate`, `wave-3-final-gate`, `wave-4-final-gate`,
   `f88-mutation-battery`, and `gate-audit-check` (plus its self-test).
4. When owner-side files changed in the wave: `npm run action-engine:appointment-proof:ts` on
   `maya_c06_appointment_gates_w<n>` and `npm run action-engine:proof:ts` on `maya_c06_gates_w<n>`, only on the 55611
   cluster (finding 27). `[REC·rev]`
5. `DATABASE_URL=$PDB WIDGETS_EVIDENCE=1 npm run test:widgets:live`, then `node scripts/widgets-evidence-verify.mjs`,
   which must report 0 violations. From Wave 5 on it must also report the expected evidence lines.
6. `gate-conformance-audit.json` must be unchanged, except in I-AUD0, A-W5 and FINAL.
7. Push the branch (programme practice HEAD=origin) and record CI run ids for Platform CI, Widgets Live, Widgets
   Mutation and Widget Contract. `[REC·rev]` **The mutation workflow is dispatched per battery (a matrix shard per
   battery id) for the flipping commit, and every shard's run and artifact id is recorded** (finding 21).
8. `LANG=C pg_ctl -D $S/pg-live/data stop -m fast` — `[REC·rev]` **only when `pg_stat_activity` shows no foreign
   connection** (D-19). Confirm no stray `postgres` or `node` process from the run; delete `$S/pg-live/EXCLUSIVE`
   (PROCESS HYGIENE 0).

### §2.6 Merge constraints (checked before each merge; PLAN §3.5 superseded)

1. Wave 0 comes before every unit merge. I-CTX comes before any code that reads `ctx.principal`.
2. P-PRINCIPAL is the first merge of Wave 1.
3. U8R merges before or with U9b. U6-L1, U7a and U8a merge before U9b, so no first durable write follows a Gate 6/7
   decision known to be wrong.
4. U9b before U10b. U10b before U8b. U10b before any live claim of U11, U12 or U13.
5. Schema changes happen only in I-MIG2 or I-MIG3, with the proof DB recreated in the same exclusive window.
   `[REC·rev]` **The exit commands' own databases (`maya_c06_*_gates_w<n>`, `maya_gates_smoke_w<n>`) are created,
   migrated and seeded by the integrator; no other database is ever migrated** (finding 27).
6. Any of these lands in one commit with the ruling reference and the test pinning it: deleting a TRANSITIONAL veto,
   binding a non-null owner port, registering a projector row, or withdrawing a gap key.
7. An owner-module import into `WidgetOwnerPortsModule` lands with the k3 check 9 enumeration and a
   `test:widgets:http` boot of the built binary.
8. `widgets.runtime` is granted only by `test/widgets-live/support/fixtures.ts` (k3 check 8 extension, P-RENDER),
   `[REC·rev]` **including the call from the BIN runner `scripts/widgets-intent-http-proof.ts`** (finding 17).
9. Until P-DISCHARGE, MINT-3 and MT2-5 (the A2.2 backstop) must stay green on every commit (D-4).
10. Owner-side files carry an owner-side reviewer trailer in the commit message.
11. `[REC·rev]` **A deletion that a legacy exit gate pins moves that pin in the same commit**, with the V1.1 reason
    (finding 20): `k4-exit-gate.sh` "fire independently" → IR-K4K8-2; `k4-exit-gate.sh` "SENSITIVE_DEST is total" →
    R6-1b; `k3-exit-gate.sh` FOREIGN import check → IR-TAB-1's `contract-bindings.ts` re-export.
12. `[REC·rev]` **Every exclusive deletion or export removal is an IR applied by the integrator** (D-18, finding 18),
    and the `[GW]`/`[HTTP]`/`[BIN]` exits that depend on it are merge-step exits.

---

## §3 Live proof and re-audit

### §3.1 V1.1 clause inventory (the keys of `gate-clause-inventory.json`; `gate-audit-check.mjs` enforces equality)  `[DERIVED]`

**Provenance.** The lost §3.1 is recovered exactly, because `gate-clause-inventory.json` was machine-generated
from it: the generator (recovered chunk 001) parses `### §3.1 V1.1 clause inventory` line by line, expands the
single `10.R1 … through 10.R7` bullet into one key per row of «Gate 10 in full», and fails if any clause text
differs from the committed audit. The committed inventory says its source is **«GATES-PLAN-V11 §3.1 (plan lines
1388-1564)»**, so the revised §3.1 occupied 177 plan lines and carried **165 clause keys across 15 gates**.
The only text below that was not in the plan verbatim is the seven `10.Rn` one-liners, which the generator took
from the audit.

- **Gate 1** (C11:4720; H4 C11:2615-2623; R3.9.4 C11:4907-4935; L8 C11:5506)
  - G1-a HMAC valid: seal verified, keyed, before Gate 1 proceeds
  - G1-b `widget_id` matches
  - G1-c not expired
  - G1-d not consumed when `single_use`
  - G1-e not superseded
  - G1-f `EXPIRED`/`SUPERSEDED` are response outcomes, with the R3.9.4 successor or the code alone (including A4's three fail-closed conditions)
  - G1-g the successor reads nothing canonical (no projector or owner port; `EP-BUILD`)
- **Gate 2** (C11:4721)
  - G2-a session resolved exactly as for a typed message (JWT + Membership, or a verified ClientChannelLink): the same transport chain as `POST /api/ai/chat`, proven by G2-EQ (D-16). `C9Authority.current` in `T` is the K1/K3 principal of Gates 1, 3, 5 and 6, not this clause
  - G2-b no credential comes from the widget
  - G2-c `REFUSED/unauthenticated`
- **Gate 3** (C11:4722; K3/K4 C11:2544-2546; SH-13)
  - G3-a `principal_proof_hash === c9PrincipalHash(live)`, constant time
  - G3-b a token minted for A and replayed by B fails
  - G3-c1 membership re-create or role change invalidates outstanding envelopes (the membership branch of K4, C11:2546)
  - G3-c2 client-link unlink/relink invalidates outstanding envelopes (the CLIENT_CHANNEL branch; U candidate, K14-10)
  - G3-d `REFUSED/widget_principal_mismatch`
  - G3-e a shared push is inert: a web-push token minted for A and submitted by B is refused, NW (T-3)
  - G3-f a forwarded Telegram message is inert (U candidate: K14-10 PKT:485, R-03/P-33)
- **Gate 4** (C11:4723)
  - G4-a `TenantContextService.assertTenantId` over the record's tenant and the live principal's
  - G4-b `REFUSED/tenant_mismatch`
- **Gate 5** (C11:4724; R3.4.2 C11:4020-4030; R3.4.5 C11:4071-4087; F52 C11:1117-1124; K10 C11:2564; K1/K2 C11:2532-2542)
  - G5-a floor re-derived from the live registry and policy tables
  - G5-b compared with the server-derived level (K1/K2, in `T`)
  - G5-c capped by `profile.max_verification_level`
  - G5-d branch per effect class
  - G5-e any stored/recomputed difference → `SUPERSEDED/policy_floor_changed` + successor or the code alone, with the non-durable `widget_floor_divergence` counter
  - G5-f `NEEDS_SECOND_CHANNEL`/`HANDOFF_REQUIRED` + deep link (U candidate, K6/F53; mechanism blocked on OD-4 + P-12; never Gate 13's `HandoffTarget`)
- **Gate 6** (C11:4725, 4736-4798; AREA-A §2.1 table)
  - G6-1 dispatch on `subjectCapability(record)`, bound once
  - G6-2 `authority_hint` not read
  - G6-3 a never-rendered widget still cannot act
  - G6-4 `REFUSED/insufficient_authority`, AuthorityResolver
  - G6-5 null subject → proceeds with no owner call
  - G6-6 HANDOFF: destination fences only (registration, F48, `targetFloor('s')`, landing ingress)
  - G6-7 HANDOFF never resolves `assertCanExecute`, `c9Capability` or the allowlist
  - G6-8 (a) allowlist row
  - G6-9 (b) `policyDecision === 'ALLOW'`
  - G6-10 (c) `authenticated_request`
  - G6-11 (d) live principal role ∈ `allowedActorRoles`
  - G6-12 (e) entitlements grant `requiredFeatures`
  - G6-13 Gate 14 governs; a disagreement is refused and counted
  - G6-14 the 47: `assertCanExecute(principal, def)` with surface `'web'`
  - G6-15 non-catalogue: `WIDGET_CAPABILITY_POLICY` row (build totality + positive)
  - G6-16 `c9Capability` when `c9_domain !== null`, including BI non-READ
  - G6-17 run-less: `c9Capability` not applied
  - G6-18 CONTROL: `CONTROL_FLOOR[ref.key]` at Gate 5, Gate 3's principal binding, Gate 4's tenant assertion, then the one registered handler's own principal and tenant check (R3.2.4, C11:4771-4773); no execute-admission test
  - G6-19 TOOL unreachable/refused
  - G6-20 a raise is the refusal
  - G6-FR14 reads Membership/Staff/Client binding, never `presentation_mode`/`profile_id`/`a11y_env` (FR-14 C11:1798)
- **Gate 7** (C11:4726)
  - G7-1 effect within the kind's ceiling over `widget_kind`
  - G7-2 key space matches effect (R3.2.2)
  - G7-3 CONTROL keys in the control registry
  - G7-4 COMMIT carries a non-null `confirmation_of_ref`
  - G7-5 kind ≠ draft → non-null `produced_by_intent_token_hash` satisfying §3.10.2
  - G7-6 `requiredConfirmationKind(subject) === widget_kind`, re-read live (F72)
  - G7-7 the delivering tier was permitted this effect (§3.12)
  - G7-8 the two codes
  - G7-BOOK1 BOOK.1 subject = `confirmation_subject` (C11:3109)
  - G7-FR6b exactly one pairing (C11:1786)
  - G7-FR6d no MONEY actuation; `PAYMENT_HANDOFF` gap-blocked; F80 (C11:1788, 1524)
- **Gate 8** (C11:4727)
  - G8-1 closed-domain membership (per field)
  - G8-2 cardinality
  - G8-3 bounds re-read from `bounds_source`
  - G8-4 normalizers applied
  - G8-5t `c9SafeText` over **text** values
  - G8-5p `c9SafeText` over **phone** values (U candidate, PKT:469)
  - G8-6 `max_total_bytes` by refusal
  - G8-7 inputs on a null schema refused
  - G8-8 the four codes
  - G8-SCHEMA server-held and hash-bound; erased or absent → `SUPERSEDED/handle_stale`; hash failure is a fault (B-10)
  - G8-SHAPE undeclared keys and kind conformance
  - G8-LABELS labels from validated members; no write before 9 (R3.9.1/R3.9.2)
  - G8-DENY a `c9Deny` is a verdict (R3.9.3)
- **Gate 8-R** (C11:4728)
  - R-0 reachable on the live path
  - R-1 applies exactly when `confirmation?.requires_readback === true`
  - R-1a recomputed at ingress from effect and tier (B-17)
  - R-2 ack present (`readback_missing`)
  - R-3 `readback_ref` matches
  - R-4 `body_hash` matches (H4 integrity)
  - R-5 affirmation ∈ the closed vocabulary for the locale
  - R-6 an ack on a record that does not require one (including a null confirmation) is refused
  - R-7 refuses, never repairs; the affirmation is never logged or echoed
- **Gate 9** (C11:4729; AREA-B §2.1)
  - 9.1 render
  - 9.1a R3.9.2 labels only, no `inputs` parameter
  - 9.1b one slot
  - 9.2 appended to the conversation
  - 9.3 as a USER turn
  - 9.4 authority NONE (E10)
  - 9.5 first durable write (R3.9.1, E11)
  - 9.6 byte-identical to a typed message from here
  - 9.7 DS-03 A: superseded/handle_stale, no turn, no effect, no guessed label
  - 9.8 runs in chat ingress
  - 9.9 `rendered_utterance`/`selected_labels` persisted
  - 9.10 F15: lowered content read only by Gate 10
- **Gate 10** (C11:4730, 4800-4876; AREA-B §3.1)
  - 10.1 router over the lowering against live intents
  - 10.2 `routeUtterance` (pure, pre-LLM, escape first)
  - 10.3 `liveCandidates`
  - 10.4 `u`, `s`, `q`
  - 10.5 `ownerSet`/`sameOwner`, undefined fails closed
  - 10.6 the first row that holds decides
  - 10.7 exactly one audit record per non-AGREE, in `T`, with its members
  - 10.8 REFUSE → `intent_divergence`; NULL/AUDIT recorded, not refused
  - 10.9 widget-layer records only; never substitutes
  - 10.10 the R3.12.4 fixture duty at `EP-BUILD`
  - 10.11 intent router
  - 10.R1 row 1 of «Gate 10 in full»
  - 10.R2 row 2 of «Gate 10 in full»
  - 10.R3 row 3 of «Gate 10 in full»
  - 10.R4 row 4 of «Gate 10 in full»
  - 10.R5 row 5 of «Gate 10 in full» (null subject with a non-null match of the same effect)
  - 10.R6 row 6 of «Gate 10 in full»
  - 10.R7 row 7 of «Gate 10 in full»
- **Gate 11** (C11:4731; AREA-C §2.1.1)
  - G11-R1 fresh read from the canonical owner
  - G11-R2 witnesses compared, not re-read
  - G11-R3 value divergence → SUPERSEDED with a rendered diff
  - G11-R4 `handle_stale`
  - G11-R5 IntentGateway + owner
  - G11-I1 R3.7.3 nouns never travel to the client
  - G11-I2 R3.7.4 Handle/Witness types
  - G11-I3 F15 exactly seven inputs
  - G11-I4 R3.11.1 approval decision reads nouns from the decision record
  - G11-I5 R3.11.3 reject and re-mint
  - G11-I6 R3.11.4 both checks in order
  - G11-I7 RT3(b)/B-21
  - G11-I8 R3.9.3 rendering
  - G11-I9 BOOK.4 booking nouns
  - G11-I10 E13 re-enters approval
- **Gate 12** (C11:4732; AREA-C §2.2.1)
  - G12-R1a REFINE body by the projector
  - G12-R1b NAVIGATE body by the projector
  - G12-R2 the same projector
  - G12-R3 the same enforcement call sites (F95 remainder)
  - G12-R4 no widget PII path
  - G12-R5 masked body, never a leak
  - G12-R6 runs in the projector (pointer slot)
  - G12-I1 F7
  - G12-I2 L2
  - G12-I3 B-16
  - G12-I4 P9/P10
  - G12-I5 K18
  - G12-I6 `allowedKinds`/B-27
  - G12-I7 B-02/F18
  - G12-I8 B-03
  - G12-I9 RT4/RT4a
  - G12-I10 FR-14/R3.8.3
  - G12-I11 K16
- **Gate 13** (C11:4733; AREA-C §2.3.1)
  - G13-R1 NONE unreachable
  - G13-R2 NAVIGATE → projector → `next_envelope`
  - G13-R3 REFINE → projector → `next_envelope`
  - G13-R4 terminates; no business effect from a selector
  - G13-R5 CONTROL → the one registered control handler, which performs its own principal and tenant check; no Action Engine edge (row 13, C11:4733; R3.2.4). Sub-cases: dismiss, `run.cancel`, `delivery.resolve` (the last needs P-17)
  - G13-R5b the R3.2.4 source test: each handler module imports no Prisma model outside the widget layer's own except through its owner endpoint (`EP-BUILD`, C11:3852-3861)
  - G13-R6 DRAFT → draft owner
  - G13-R7 REQUEST_APPROVAL → approval object → PENDING
  - G13-R8 HANDOFF → one `HandoffTarget`, no capability invoked
  - G13-R9 COMMIT → Gate 14 with a server-minted key
  - G13-R10 closed per-class switch (FR-1/B-28)
  - G13-I1 `approval_decision` routing
  - G13-I2 R3.11.3
  - G13-I3 F74/F75 consumption
  - G13-I4 L7/L8/L10
  - G13-I5 FR2/B-29 receipts
  - G13-I6 F15 AUDIT_RETAINED only
  - G13-I7 F33/F76
  - G13-I8 FR-11/R3.9.3
  - G13-I9 R3.11.6 approver test / P-27
- **Gate 14** (C11:4734)
  - G14-a `prepare()` receives the key, normalized input, server-minted idempotency key and evidence refs (every G14 key is BLOCKED-DISCHARGE until a live widget COMMIT reaches `prepare()`, E2)
  - G14-b the policy resolver owns the decision (`assertNoCallerAuthority`, `assertResolverOwnsDecision`)
  - G14-c the Action Engine, never the widget, calls the provider owner

**Counts:** 15 gates, 165 clauses. At I-AUD0: 25 BLOCKED-DISCHARGE, 140 `false`, 25 `built: true`,
19 `u_candidate: true`, 3 DEV-1 clauses.

### §3.2 What "live proof" means, gate by gate  `[REC·pre]` + revision notes

**Common to every gate:**
- **Entry:** HTTP **and** BIN (§0.5 L).
- **Records:** minted by production triggers (`[REC·rev]` **T-2b `POST /api/ai/tools/:toolName/execute`** first, then
  T-2a `POST /api/ai/chat`, T-1 C9 run, T-3 moment tick) or by successor edges whose predecessor qualifies. The
  `WIDGETS_EVIDENCE` manifest records the provenance, `[REC·rev]` **and D-17's server-side `WidgetMintProvenance`
  lines are cross-checked against the manifest and the database before teardown** (finding 25).
- **Earlier slots:** all real. No provider override except the closed allowlist (the call-through recorder and submit
  wrapper, the YClients HTTP client, the link-verifier challenge). **Never the model transport** (D-15). No
  `controlledFixtureMode`.
- **Assertions:** `stopped_at_gate`, `gates_run`, the ruled outcome and code, NW for refusals at 1–8-R, and spies on
  real instances.
- **Mutants:** every mutant declared for the clause is live-killed in the CI `widgets-mutation` artifact of the
  flipping commit, `[REC·rev]` **by an `[HTTP]` killer** (finding 21), or build-killed only where the unit card says
  it cannot be killed through `submit`.
- **Never evidence:** GW runs, G-SYNTH, RI, stub owners, unit tests, hand fixtures, a green battery alone, k3
  presence, `liveGateCount`.

The table below is the pre-review one; the review's per-row changes are folded in and marked.

| Gate | L (tests) | L-T (defence-in-depth) | U (four proof duties, §0.5) | DEV-1 / BLOCKED-DISCHARGE / false |
|---|---|---|---|---|
| 1 | G1-b…g: forged, expired own + tapped remedy through 1–13, superseded own, foreign expired (code alone), erased predecessor via the RT6 job, kind without REFINE, `single_use` `run.cancel` tapped twice, `widget_id` mismatch (E-HOSTILE) | G1-a: `[tamper:WidgetEmission.bodyHash]` → `EXPIRED`, code alone (**the one sealed-column tamper the verifier admits**, finding 6) | — | — |
| 2 | G2-b: F88 400s (E-HOSTILE); G2-c: slot 2 in-array refusal | **G2-a flips only on G2-EQ** (D-16, finding 2), the cross-route principal matrix; **G2-IN** is E-INDEP on `N2` | — | a differing G2-EQ row keeps G2-a `false` |
| 3 | G3-a, G3-b, **G3-c1** (E-DRIFT membership re-create, role change), G3-d; **G3-e** (T-3 push replay by B) | — | **G3-c2** (client unlink/relink; PR-1 over a synthetic revocation verifier) and **G3-f** (forwarded Telegram) — K14-10, PKT:485 (finding 23, 13) | G3-e is `false` if P-MT3 slips |
| 4 | G4-a positive with the `assertTenantId` spy; G4-b | G4-a refusal via **E-INDEP on neutraliser set `N4`** (the `findRecord` tenant filter **and** slot 3's compare), with T4-INDEP-3 as the control (finding 24). **`[tamper:principalProofHash]` is rejected**, a seal term | — | — |
| 5 | G5-a/b/c/d | **G5-e** via `[tamper:verificationFloor]` with `recomputeFloor(row)` rewritten in the same statement + an L pass positive + the counter, NW (findings 5, 22 — the "policy row change" E-DRIFT was impossible: no Prisma under `src/widgets/authority`) | **G5-f on every carrier** (K6 C11:2550; F53 C11:1126). **No `HandoffTarget` at Gate 5** (finding 10) | — |
| 6 | G6-1…5, G6-7, G6-14 (REFINE, the `assertCanExecute` spy), G6-15 positive + build totality, G6-16/17 (T-1 vs T-2b), **G6-18 with the handler's own principal and tenant check (R3.2.4)** (finding 11), G6-20 (owner spied to reject → refusal, HTTP 200), **G6-FR14 via S-FR14 [BUILD] + FR14-VAR [E-INDEP on `NPM`]** (finding 14 — the pre-review F88 400 proved nothing about Gate 6) | G6-6 `[tamper:targetJson.class]` s→w; G6-16 `[tamper:c9Domain]`; G6-19 `[tamper:capabilitySpace=TOOL]` + E-INDEP | — | BLOCKED-DISCHARGE G6-8…G6-13 and G6-14 DRAFT → E2. **G6-6 is `false` until LANDING-VERIFY** (finding 12) |
| 7 | G7-1/2/3/7 positives per effect and tier (pwa, web-push, sms, telegram HANDOFF) | `[tamper:widgetKind]`, `[tamper:handoffSpace]`, `[tamper:capabilityKey=control.bogus]`, `[tamper:deliveryChannel]`. **G7-7's DRAFT half becomes E-INDEP(mint) at E2** (finding 6) | — | BLOCKED-DISCHARGE G7-4/5/6, BOOK1, FR6b, FR6d → E2; G7-7's restricted-tier positives `false` without P-MT3 |
| 8 | G8-1/2/6/7/8, SHAPE, LABELS via E-HOSTILE on T-2b selectors; G8-SCHEMA erased by the P-RT6 job | G8-SCHEMA hash: `[tamper:inputSchemaHash]` → fault (500, no verdict, no write) | **G8-5p only** (PKT:469): T-MINT-NONCLOSED + RI admit/refuse + HTTP RI fail-closed + quote | **G8-3, G8-4, G8-5t, G8-DENY are `false`** — AMB-21d is an unapproved engineering choice (finding 9). **Gate 8 reaches neither count** |
| 8-R | R-0, R-1, **R-6 with object acks on a null-confirmation record and on a non-readback record** (finding 15), R-7 (unrequired, marker affirmation never logged) | R-1 divergence: `[tamper:confirmationJson.requires_readback]` on a REFINE (T-DIV-1) | R-2…R-5 and **the required half of R-7** (PKT:471): no SPOKEN fit (mint-side L test) + T-BIND null port + RI comparisons | BLOCKED-DISCHARGE R-1a (T-DIV-2), **its SPOKEN half U** |
| 9 | 9.1–9.5, 9.7–9.10: T9-LIVE-1 (slot-less + slotted), T9-INV24 over production records refused at 1/3/5/6/7/8/8-R, T9-RT6-1 (production RT6 job; race variant), T-ARCH-F15 + slot-11/13 spies | **not admitted** | — | **9.6 is `false`**: TYPED-TURN (P-03/K5) is out of cycle, and TYP-2 is a self-comparison (finding 4). **Gate 9 reaches neither count** |
| 10 | 10.R1–R4, R6, R7 each on production collisions (R2 via CONTROL or the RT6 race); 10.6–10.8 after all rows; T10-SHAPE/TX LIVE; 10.10 over production-recorded fixtures | **not admitted** | **10.R5**: no kind permits class `c` (C11:2801), so no conformant record carries a NAVIGATE(c) subject — duties: TAB-10, MINT-2c, an HTTP RI fail-closed case, the quote; M10-5 is RI-killed and recorded equivalent (finding 3) | watch item: a row the production catalogue cannot produce stays `false` ("unreachable on the production catalogue, enumerated at build") |
| 11 | G11-R1…R5, I1, I2, I3, I7, I8 on SCHED.2 REFINE nouns (T-2b) and the T-1 witness; I7 restricted-role replay | G11-R2 `[tamper:revisionId]` → SUPERSEDED | G11-I4, I5, I6 **and I10** (C11:5073; SH-11) | BLOCKED-DISCHARGE G11-I9 + COMMIT subjects → E2 |
| 12 | G12-R1a, R2, R3, R4, R5 (unnarrowed; cross-principal, cross-tenant and unlinked → no foreign bytes), R6, I1–I10 | — | — | **DEV-1 `false`: G12-R1b, G12-I11** (finding 8, not STOPPED); G12-R5 conditional on OD-5 |
| 13 | G13-R1 (mint-side: no NONE record), R3, R4 (row counts, no AE/C9 writes), R5 (dismiss on web-push, `run.cancel`), **R5b** (the R3.2.4 `EP-BUILD` source test, finding 11), R10, I4 (REFINE L7/L10), I5 (non-actuating receipts), I6, I8, I9 (P-27 build half) | — | G13-R7, I1, I2, **the approver half of I9** (C11:5073) | **DEV-1 `false`: G13-R2**. BLOCKED-DISCHARGE R6, R9, I3, I5 (actuating), I7 → E2. **`false`: R8 until LANDING-VERIFY; the `delivery.resolve` sub-case of R5 until P-17** |
| 14 | — | — | — | **G14-a…c BLOCKED-DISCHARGE** until a live widget COMMIT reaches `prepare()` (finding 1). The existing AE proofs and the ingress anchors are `built: true`, never evidence |

### §3.3 Re-audit procedure (A-W5 interim and FINAL)  `[REC·pre]` + revision notes

The integrator runs it; an independent reviewer can only downgrade.

1. **Freeze.** HEAD equals origin, and the CKPT-W of the wave is green. Record the CI run ids and `[REC·rev]` **every
   mutation shard's artifact id** (finding 21).
2. **Fresh proof DB.** Stop the cluster, recreate `[REC·rev]` **`maya_widget_gate_proof_gates`** (D-19), run
   `npx prisma migrate deploy` — `[REC·rev]` **expect 98 migrations applied, of which exactly 2 (3 after I-MIG3) are
   `*_widget_layer_*`** (finding 30) — run no seed, and start the cluster.
3. **Evidence run on the clean export:**
   ```bash
   DATABASE_URL=$PDB WIDGETS_EVIDENCE=1 npm run test:widgets:live
   npm run build && DATABASE_URL=$PDB WIDGETS_EVIDENCE=1 npm run test:widgets:http
   ```
   This produces `evidence-manifest.jsonl`.
4. **Verify provenance.** Run
   `node scripts/widgets-evidence-verify.mjs --manifest <path> --inventory ../docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json`.
   It rejects any evidence line that has:
   - a record not traced to a trigger or successor edge — `[REC·rev]` **checked against the captured
     `WidgetMintProvenance` lines and against the database before teardown** (D-17, finding 25);
   - a `Fixtures.synthetic` or `Fixtures.widget` write, or a writer call in a labelled evidence test;
   - `overrideProvider` outside the closed adapter allowlist;
   - `controlledFixtureMode` set;
   - GW entry;
   - a `[synthetic record]` or `[RI]` label on an L claim;
   - an L-T claim without an L positive for the same key, or without its mutants live-killed **by an `[HTTP]`
     killer** in the artifact;
   - an L-T claim on a Gate 9/10 key, or `[E-TAMPER:<col>]` on a `SealVerifier` column other than for G1-a;
   - a U claim missing any of the four proof duties or the quoted basis.
5. **Build the audit.** Run `node ../docs/rebuild/evidence/maya-chat-first-ux/gate-audit-build.mjs` with the manifest,
   the mutation report and the inventory. It writes schema `/2`. For each clause it records the state, its evidence,
   mutant ids with the artifact id, and the ruling pins (DS-03 A, A3 rows, B-nn). `[REC·rev]` **DEV-1 and
   BLOCKED-DISCHARGE keys are copied from §0.4 and §3.2; the STOPPED set is empty.**
6. **Independent re-audit.** A reviewer who wrote none of the units reads every clause text in V1.1 against its
   evidence lines, and may only downgrade. Every downgrade is recorded with its reason.
7. **Check.** `node gate-audit-check.mjs` verifies: the SHA equals `606d7f99…` (or V1.2's after C-V12); the key set
   equals the inventory; every non-false key has manifest lines whose tests exist at HEAD and passed; the mutant ids
   exist, with matching statuses; `mechanism_absent` is absent from `RefusalCode`; the tally and headline are
   recomputed.
8. **Headline.**
   `GATES LIVE CONTRACT-COMPLETE <strict>/15 · WITH U-CLASS <u>/15 · STOPPED CLAUSES <k> · BLOCKED-DISCHARGE CLAUSES <d>`.
   The note records `[REC·rev]` **D-1…D-19, DEV-1**, the OD answers or their absence, and the contract status:
   NORMATIVE-PENDING rows are listed until P-DISCHARGE. **An audit COMPLETE is not a discharge.**
9. **Commit and close.** Commit the audit JSON and inventory with explicit paths, run `run-all-checks.sh`, push, stop
   the cluster (only with no foreign connection) and write the checkpoint line (`GATES n/15`).

---

## §4 Risks  `[REC·pre]` + revision notes

### §4.1 Production behaviour stays dark

- **The entitlement.**
  - `@RequiresFeature('widgets.runtime')` stays on the controller (k3 check 8).
  - No plan or trial grants it. P-RENDER extends check 8 to forbid any migration, seed or script grant.
  - The only grant is `Fixtures.grantFeature` in `support/fixtures.ts`, on the guarded proof DB (127.0.0.1:55611, name
    pattern, never 5432), `[REC·rev]` **called from `test/widgets-live/**` and from the BIN runner** (finding 17).
- **Owner-side hooks** (`[REC·rev]` **P-MT2a/P-TYPED in `AiToolRuntimeService`/`ai-core`**, P-MT1 in the C9
  orchestrator, P-MT3 in the scheduler):
  - each checks `widgets.runtime` first and writes nothing otherwise;
  - MT2-2/MT1-2/MT3-2 prove zero `Widget*` writes and byte-identical `/ai/chat` responses for non-entitled tenants;
  - **Risk:** a hook throwing before the check would change production chat. **Mitigation:** the hook is wrapped so a
    widget-layer failure never fails the chat turn (the existing `/ai/chat` suite is re-run in CKPT-W).
  - `[REC·rev]` **Risk (finding 16): evidence that stubs the model transport would prove nothing about production.**
    **Mitigation:** the transport is never stubbed; `AI_CORE_PROVIDER=safe` returns no decision, and every needed
    envelope class is minted through the model-free T-2b, proven by MT2-6.
- **P-PRINCIPAL changes the widget route only.**
  - `T` wraps only `IntentGatewayService.submit`; `C9Authority` is only exported.
  - `[REC·rev]` **`/api/ai/chat` is not made to resolve through `C9Authority`** (D-16, finding 2): that would change
    production chat for every tenant, outside the dark feature. Gate 2 is proven by cross-route equivalence instead.
  - **Risk:** lock contention on `Membership` rows held `FOR SHARE` until slot 10. **Mitigation:** PR-9a/PR-9b prove no
    lock is held once 11–13 run; the explicit transaction timeout; slots 1–10 make no network calls.
- **Deploys.**
  - No unit deploys. The VPS and Beget are untouched.
  - `deploy.sh` stays blocked by Sheet 05 S5-1 in any case.
  - I-MIG2 folds migration 2 before its first deploy, **which relies on that block holding** (D-8). `[REC·rev]`
    **I-MIG3 is migration 3 unless an owner-run read-only check re-confirms 0 widget tables** (finding 30).
  - **Risk:** a proof DB or CI database carries the old checksum. **Mitigation:** recreate it in the same window.
- **`mechanism_absent`** has no R3.9.3 rendering. It exists only while dark, leaves slot 10 at U10b and slot 8 and
  `RefusalCode` at U8b. The REN-3 interlock turns red if it returns.
- **Risk: overclaiming.** **Mitigation:** the §3.3 verifier and checker, the strict/U split, and the rule that DEV-1
  and BLOCKED-DISCHARGE clauses can never flip. The headline may not be quoted without its four numbers.

### §4.2 Action Engine

- `ActionEngineModule` is never imported into the widget layer (R6-2, U13c). Registries come in as values; AE runtime
  surfaces come through owner modules.
- Gate 14 governs. The Gate 6 verdict is never reused at 14 (U13c mutant). The disagreement counter is metric-only and
  adds no code.
- No AE schema or policy change. `action-engine:proof` and `action-engine:appointment-proof` are re-run at CKPT-W
  whenever owner files changed, on the `maya_c06_*_gates_w<n>` databases.
- **Risk: a widget COMMIT claims a caller authority or a non-widget source type.** **Mitigation:** F33/F76 in the owner
  adapters; `sourceType 'authenticated_request'` only; no widget field in the dto or invocation; P-27
  `controlledFixtureMode === false` build assertion.
- **Risk: UNKNOWN or EXECUTING rendered as failure.** **Mitigation:** B-29 receipts ACCEPTED plus reconciliation;
  FR-11 tests (G13-N12b).
- **Actuating paths are not reachable before P-DISCHARGE** (D-4; MINT-3 and MT2-5 are pinned on every commit).
- `[REC·rev]` **Gate 14 is not scored as enforced on the widget path until a live COMMIT reaches `prepare()`**
  (finding 1).

### §4.3 Booking

- **U-OWN** is behaviour-preserving (`forAccount` = extraction + execute), under the crm architecture scanners and
  `appointment-proof`. `already_cancelled` is surfaced by a read, and the owner's own cancel stays unchanged.
- **Risk: live tests reach YClients.** **Mitigation:** the provider HTTP client is stubbed at the adapter only;
  internal-calendar tenants are used for slot-taken (DB1); proof DB only.
- **Reschedule/cancel go through the non-destructive owner paths only** (the CLAUDE.md invariant). The widget never
  calls `AppointmentsService` directly (ARCH-12-1, B15).
- **Risk: a booking COMMIT before the confirmation subject is stored.** **Mitigation:** C11 refuses every
  `BOOKING_CONFIRMATION` COMMIT until I-MIG2 and the writer exist (U7c); nothing actuates before discharge in any
  case.
- **Idempotency.** The server-minted key is bound to the draft (AMB-54); the claim CAS happens at Gate 13; a double
  submit gets one execution (G13-N10).

### §4.4 Consent, identity, 152-FZ

- **Client PII never reaches an LLM through the widget layer:** B-15 slot-less templates for `client_identified`; F15
  value-flow tests; the widget-layer masking path is deleted (P-K4K8), and masking stays in the owners (F95); model
  reads on a degrade-to-text answer pass the anonymiser (B-16).
- **Consent and identity capabilities** stay `SENSITIVE_DEST` handoff-only (G6-6, R3.3.3). Personal-data REFINE stays
  handoff-only (S6-5 open). The TRANSITIONAL veto leaves only with P-23's start-up vetoes (U6-L2).
- **Erasure.** RT6 takes the same advisory lock as Gate 9 (P-RT6), so no turn's text survives an erasure. The remedy
  after erasure returns the code alone. Canonical consent and booking reads are byte-identical before and after
  (RT6-2).
- **Transcripts.** `spoken_transcript` is refused at the shape stage (P-F88); affirmations are never logged (R-7).
  **Risk: OD-3 option B would bring in a voice path whose Python bridge logs raw transcripts (V5).** It must not be
  chosen before that is fixed.
- **Principal binding.** `[REC·rev]` **Unlink/relink invalidation is NOT live evidence on the JWT widget route**
  (finding 23): `C9Authority` yields CLIENT_CHANNEL only with a channel proof, and `widgets.controller` passes none.
  PR-1 is a GW-RI **U-proof** for G3-c2; G3-c1 (membership re-create, role change) is the live half. There is no
  presentation-role read at Gate 6 (F88.1, PR-13, S-FR14, FR14-VAR).
- **Phone** values refuse; no phone field is minted (PKT:469). Any change is an owner decision under 152-FZ (OD-3
  option B).
- `[REC·rev]` **D-17's provenance lines carry no PII** (trigger id, route, request id, token hash, widget id only),
  and no schema column is added, because one would change §3.7's record shape and §4.4.3's classification.

### §4.5 Money

- **No MONEY actuation** in this contract version: F34 admits no MONEY row; `PAYMENT_HANDOFF` is gap-blocked through
  `emittable` (U-TAB TAB-6); G7-FR6d and the P-23 MONEY veto are pinned by mutants; no `shell.pay` route is built
  (P-14 stays open).
- **Gift certificates and tips** stay limitations (R3.3.1). IR-H1's gift-certificate key is a test literal only, to let
  `AppModule` boot; no gift-certificate capability is registered or exercised.
- **E-TAMPER** is never applied to a MONEY key or an expense amount, and no live test creates a financial transfer.
  Evidence for FR-6d is E-INDEP or mutation only.

### §4.6 Programme risks

- **One working tree with a parallel shell workstream.** Mitigation: explicit-path staging, clean whole-commit export
  checkpoints, the EXCLUSIVE lock (§2.2), `[REC·rev]` **and separate databases (D-19), now enforced by name in
  `proof-db-guard.ts`**.
- **A dependency slips** (K11 → P-MT1, K13 → P-MT3 and P-17, K7 → P-MINT-BOOK, the marketing approval surface,
  TYPED-TURN, LANDING-VERIFY). The clauses it feeds stay `false`, and the plan never moves them to U.
- **The production template catalogue produces no collision for a Gate 10 row.** That row stays `false` with the reason
  enumerated (AREA-B §4 watch item).
- **Mutation cost.** The full battery runs the full live suite per mutant. `[REC·rev]` **It runs per unit (`--gate`)
  at CKPT-M, and in CI as a per-battery matrix dispatched for the flipping commit, each shard inside the 180-minute
  timeout, with a stable jest cache directory** (finding 21). A mistyped `--gate` id no longer passes silently
  (`3c5081ae`).
- **Contract drift during Wave 6** (C-V12). Wave 6 units start only after C-V12's `run-all-checks.sh` is green and the
  V1.1→V1.2 line map is regenerated. Every `C11:n` cite in the audit is re-anchored.
- `[RECON]` **Scratchpad loss.** The plan, its AREA inputs and the unit reports lived in `/private/tmp` and were
  wiped. The durable home is now
  `…/work/.maya-program`. Nothing under `/private/tmp` may hold programme state again.

---

## Appendix A — Unit counts and blockers  `[RECON]` — verify before use

The pre-review table is recovered; the revised counts (46 / 53, with **P-HANDLE** added in Wave 2) come from the
REVIEW DISPOSITION's headline-effect table and finding 29. The placement of P-HANDLE inside Wave 2 is the finding's
("W2, before P-MINT-CORE and so before U11b and U12b").

| Wave | Phase | Units | Count |
|---|---|---|---|
| 0 | groundwork | I-AUD0, I-CTX, I-HAR (integrator); U-TAB | 4 |
| 1 | A (gates) + prerequisites A | U4, U6-L1, U7a, U8a, U8R, U8b-c, U9a, U10a, U11a, P-K4K8, U12a (11); P-PRINCIPAL, P-F88, P-SEAL, P-RENDER, P-LEDGER, P-25, U-OWN (7) | 18 |
| 2 | B-1 + prerequisites B | I-MIG2 (integrator); U6-L3, U7b, U9b, U13a; **P-HANDLE**, P-MINT-CORE, P-G15a, P-23 | 9 |
| 3 | B-2 | U10b, U8b, U7c, U6-L2, U12b; P-RT6, P-G15b | 7 |
| 4 | B-3 (P-MINT minimal triggers) | P-RESOLVE, P-MT2a, P-TYPED, P-MT1, P-MT3; U11b, U13b | 7 |
| 5 | B-4 + evidence | U13c; E1 (13 evidence tasks); A-W5 interim re-audit | 1 (+13 tasks) |
| **0–5** | **buildable now, no owner decision** | | **46** |
| 6 | C (owner-gated) | C-V12, I-MIG3 (cond.), U12c, U13d, P-G15c (cond.), P-MINT-BOOK, P-DISCHARGE; E2; FINAL | 7 (+E2, FINAL) |
| **total** | | | **53** |

(CKPT-M0 is a no-commit integrator step and is not counted as a unit.)

**Genuine owner blockers:**
- **OD-1** S6-4/A5 **and DEV-1** (hard).
- **OD-2** P-01/P-30 discharge scope (hard for any actuating clause; Sheet 07 carries it).
- **OD-3** U-class and "15/15".
- **OD-4** Gate 5 deep link.
- **OD-5** AMB-48(vi), conditional.
- **Not blocking gates:** S6-1, S6-2, S6-3, S6-5, S6-6, SH-17, SH-22, AMB-21h, AMB-51.

**Expected headlines** (revised):

| Checkpoint | Headline |
|---|---|
| I-AUD0 | `0/15 · WITH U-CLASS 0/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 25` (committed at `ad4fa3f1`) |
| A-W5 | strict **3/15** (1, 2, 4); with U **6/15** (+3, 5, 10) |
| FINAL with OD-1, OD-2 and OD-3 A | strict **up to 7/15** (+6, 7, 12, 14); with U **up to 12/15** (+3, 5, 8-R, 10, 11); **13/15** only with P-17 and LANDING-VERIFY |
| strict 15/15 | not reachable this cycle. **Gates 8 and 9 do not reach COMPLETE-U either** |


---

## REVIEW DISPOSITION

Review of 2026-09-17: 31 findings. Each was checked against the certified contract (SHA `606d7f99…`), the packet, Sheets 03/06, the AREA inputs and the repository at `d5ecca98`, then applied in place. None was rejected. Where a finding offered alternatives, the choice is named in the Applied column.

**Headline effect.**

| Checkpoint | Before review | After review |
|---|---|---|
| I-AUD0 | 2/15 | 0/15 |
| A-W5 strict / with U | 7/15 / 9/15 | 3/15 (1, 2, 4) / 6/15 (+3, 5, 10) |
| A-W5 STOPPED clauses | 3 | 0 (the three clauses are `false` under DEV-1) |
| FINAL strict / with U | 11/15 / 15/15 | up to 7/15 / up to 12/15 (13/15 with P-17 and LANDING-VERIFY) |
| Units buildable in Waves 0–5 / total | 45 / 52 | 46 / 53 (+P-HANDLE) |

| # | Finding (short) | Sev. | Verdict | Verified against | Applied (where; fix chosen) | Count effect |
|---|---|---|---|---|---|---|
| 1 | Gate 14 scored COMPLETE with no widget submission reaching it | high | CONFIRMED | Row 14 C11:4734; slot 14 is `terminate` (`intent-gateway.service.ts`); D-4 (no COMMIT mint before W6); §0.5 L needs widget-route entry | Bottom line 1; §0.2 Gate 14 row; OD-1 list; §0.5 row 14; I-AUD0; §3.1 G14-a; §3.2 row 14; E1 (Gate 14 task removed); E2 G14 row; §3.3 check. G14-a…c BLOCKED-DISCHARGE until a live COMMIT reaches `prepare()` | I-AUD0 −1; A-W5 strict −1 |
| 2 | Gate 2 kept COMPLETE; G2-a is not "exactly as for a typed message" | high | CONFIRMED | Plan "every clause starts false" vs "Gates 2 and 14 stay COMPLETE"; slot 2 `run: () => ({ outcome: 'pass' })`; `ai-core.controller.ts:34-40` uses `@CurrentUser()` + global guards; `C9Authority` referenced only in `src/orchestration`, `src/widgets`; `c9.authority.ts` denies staff roles without a Staff row | New D-16 (Gate 2 = the shared transport chain; a C9-denied principal is refused at slot 3; slot 2 in-array only without a transport session); **G2-EQ** live equivalence test (fix option 2; changing `/api/ai/chat` would alter production chat outside the dark feature); D-2; P-PRINCIPAL PR-4/PR-5, G2-IN; §3.1 G2-a; §3.2 row 2; I-AUD0; §4.1 | I-AUD0 −1 |
| 3 | Gate 10 row 5 unreachable by any conformant record | high | CONFIRMED | Rows C11:4846-4856; `subjectCapability` C11:4132-4139 (null only for NONE and w/i/s/detail NAVIGATE); F69 C11:1356ff; C11:2801 class `c` on no kind; AREA-B T10-R4/T10-R5 and 10.R5 use NAVIGATE(c) | 10.R5 a U candidate under OD-3 (TAB-10, MINT-2c, HTTP RI candidate, M10-5 RI-killed as equivalent on conformant input); T10-R4 redesigned as REFINE vs HANDOFF; 10.6–10.8 flip rule; §3.1; §3.2 row 10; ceilings | A-W5 strict −1 (Gate 10 COMPLETE-U only) |
| 4 | 9.6 flips on a self-comparison | high | CONFIRMED | C11:4729; P-TYPED TYP-2 compares two submissions of one token; AREA-B:525 condition dropped; `ai-core.service.ts` works over client-held `sanitized.messages`; `widgetTimelineTurn` written only in `src/widgets/stores`; `AiCoreChatDto` has no conversation identity | AREA-B's condition restored; 9.6 `false` this cycle; TYPED-TURN (P-03/K5) listed as a delivery dependency (fix fallback: out of cycle); P-TYPED and U9b audits; E1-G9; §3.2 row 9; ceiling row 9 | Gate 9 out of the strict and U counts |
| 5 | G5-e E-DRIFT "policy row change" impossible | medium | CONFIRMED (same as 22) | R3.4.2 C11:4022-4028; `gate5.ts` `recomputeFloor` → `verification-floor.runtime.ts` → `contract-bindings.ts`/`tables.ts` (code only); no Prisma under `src/widgets/authority`; K11 C11:2564 | G5-e is L-T via `[tamper:verificationFloor]` (not a seal term) + L pass positive; P-G15a G15-4; §3.2 row 5; E1-G1G5 | none (L-T counts) |
| 6 | E-TAMPER on seal-bound columns stops at Gate 1 | medium | CONFIRMED | H4 C11:2615-2620 terms; P-SEAL reads `principalProofHash` and the receipt `profileId` selected by `deliveryChannel`; T-2a envelopes carry only a pwa receipt; D-4 forbids a DRAFT mint before E2 | §0.5 L-T: no tamper on SealVerifier columns except G1-a; E-INDEP(mint) added; I-HAR HAR-10 verifier rule; §3.2 row 7; E1-G7; E2 rows G6-11(d) (E-DRIFT role change on neutraliser `N3`), G7-7 DRAFT half (E-INDEP(mint), at E2), R-1a (`requires_readback` tamper on a COMMIT; SPOKEN half U) | none |
| 7 | D-11 narrows DS-03 A (shape defects throw) | medium | CONFIRMED | Sheet 03:3-6 has no fault carve-out; R3.9.3 says "only a genuine **transport** fault" (C11:4902-4903), which AREA-B misquotes; AMB-23 unapproved (C11:7397); P-MINT-CORE had no slotted-template rule; AREA-A:462 mints multi-select | Fix option 1: every render impossibility (unknown slot, ≠1 labels included) → `superseded/handle_stale`, NW; only a missing Gate 8 fact throws. D-11 and quotation corrected; AMB-23 row; U9a; U9b (T9-NEG-SHAPE, M30/M33 re-pinned); P-MINT-CORE MINT-11 slotted-template rule | none |
| 8 | S6-4 STOP applied beyond its scope | medium | CONFIRMED | C.2 A5 "no clause changes" C11:7173; Sheet 06 S6-4 lines 94-103; C11:7373 | NAVIGATE interim recorded as plan deviation **DEV-1**, not STOPPED; OD-1 now asks explicitly (i) S6-4 A/B and (ii) accept DEV-1 or direct otherwise; P-01's blocker stated as DEV-1. OD-1 stays hard because a within-text `detail`/`w` re-projection needs the F15-failing read (C11:7373). Bottom line 4; AMB-47; §0.4; §0.5 rows 12/13; U12b; U13b; E1-G12; §3.2 rows 12/13; Wave 6 audit; §3.3 check | STOPPED 3 → 0; clauses stay `false` |
| 9 | U assigned where inputs are absent only by an engineering choice or a package | medium | CONFIRMED | Settled list PKT:462-493 (phone only, PKT:469); AMB-21d is an engineering choice (PKT:371; C11:7397); FORM is the one open-domain kind, ceiling DRAFT (C11:3455-3461); §0.3 slip rule; P-17 is K13 (C11:6648) | G8-5 split into G8-5t/G8-5p; G8-3, G8-4, G8-5t, G8-DENY BLOCKED-DISCHARGE then `false`; delivery.resolve sub-case `false` while P-17 is undelivered; U definition tightened; OD-3 table + "Not U"; AMB-21d row; U8b; §3.2 rows 8/13; §0.3 dependencies; ceilings | Gate 8 out of the U count; Gate 13 U needs P-17 |
| 10 | OD-4: `HandoffTarget` reused at Gate 5; no L positive for G5-f | medium | CONFIRMED | R3.8.5 C11:4676-4677 (Gate 13, admitted HANDOFF); R3.4.5 C11:4079 (landing after verification); P-12 no package C11:6635; AREA-C:164; §0.5 L-T rule | No handle at Gate 5; G5-f a U candidate on every carrier (K6/F53), mechanism blocked on OD-4 + P-12; "after OD-4 (L-T)" path dropped. OD-4; OD-3; P-G15a G15-6b; P-G15c; §3.1; §3.2 row 5; E1-G1G5; E2; ceiling row 5 | Gate 5 strict never this cycle; U count unchanged |
| 11 | G6-18 / G13-R5 drop the handler's own principal/tenant check and the R3.2.4 source test | medium | CONFIRMED | «Gate 6 in full» C11:4771-4773; row 13 C11:4733; R3.2.4 C11:3852-3861; no R3.2.4 reference in the plan | Full text restored in G6-18 and G13-R5; new key G13-R5b; U13a B-R324, N-CTRL-FOREIGN-P/-T on neutraliser `N34`, M-R324 mutants; U13b N-CANCEL-FOREIGN; U6-L1 tests; §3.2 rows 6/13; E1-G13 | none |
| 12 | Landing-route verification (G6-6, G13-R8) built or evidenced nowhere | medium | CONFIRMED | C11:4745; R3.8.5 C11:4694-4702 (`EP-FETCH`); AREA-C:144; U13b builds only the signer | Named as delivery dependency LANDING-VERIFY in §0.3 (fix option 2; its placement must respect P-01's route count C11:6618); G6-6 and G13-R8 `false` until it exists; AMB-60 row; U13b audit; §3.2 rows 6/13; E1; E2 row; ceilings | Gate 6 FINAL strict and Gate 13 U conditional |
| 13 | Gate 3 "forwarded Telegram message / shared push is inert" has no key | low | CONFIRMED | Row 3 C11:4722; plan keys G3-a…d; K14-10 PKT:485 | G3-e (T-3 web-push token of A submitted by B, P-MT3) and G3-f (U, K14-10) added; §3.1; §3.2 row 3; P-MT3 audit; E1-G2G3; OD-3 | with 23: Gate 3 out of strict |
| 14 | G6-FR14 evidenced by a pre-gate F88 400 | low | CONFIRMED | FR-14 C11:1798; D-2 puts `presentationMode` in `ctx.principal`; F88 pipe runs before the gateway | S-FR14 BUILD test + FR14-VAR (E-INDEP varying `presentationMode`, same verdict); D-2 note; U6-L1; §3.2 row 6; E1-G6 | none |
| 15 | 8-R R-6 live evidence uses a null ack that P-F88 turns into a 400 | low | CONFIRMED | Plan §3.2 8-R cell vs P-F88 F88-4 and AMB-02c; row 8-R C11:4728 | R-6 uses object acks on a null-confirmation record and on a non-readback record; null ack recorded as a shape-stage 400. AMB-02c row; U8R; §3.2 row 8-R; E1-G8R | none |
| 16 | T-2a cannot mint the needed envelopes without a model call | high | CONFIRMED | `ai-core-model.service.ts:1323` (`safe` → no candidates → `decide` null); `ai-core.service.ts:426` PRELOADABLE_TOOLS, `:656` expenses completion, `:874` no decision runs no tool; harness literals have no provider key; BIN `AI_CORE_PROVIDER: 'safe'`; `POST /api/ai/tools/:toolName/execute` exists (`ai-tools.controller.ts:28-36`); L1 (2) C11:5475 | Fix option (a), model-free: D-15 moves the hook to `AiToolRuntimeService.execute` on a completed registered C9 READ; T-2b is the E1 producer; model transport never stubbed; P-MT2a rewritten with MT2-6 (each needed envelope class via T-2b with `safe`) and MT2-7; P-RESOLVE first in W4 for token retrieval; §0.5 L; §3.2 common; E1 producers; §4.1; §4.6 | none if MT2-6 is green; otherwise the dependent clauses stay `false` |
| 17 | BIN half of L blocked (no fixtures, no manifest, grant would break check 8) | high | CONFIRMED | `HttpProofContext {apiBase, databaseUrl, request}`; `fixtures.ts` "the ONLY way `widgets.runtime` reaches a tenant"; mutation runner STEPS | I-HAR: BIN runner boots the guarded `FixtureContext` (no widget writers exposed), writes manifest lines through `support/evidence.ts`, HAR-7; P-RENDER REN-6 allowlists `Fixtures.grantFeature` from the BIN runner; §2.6 constraint 8; mutation kills counted from `[HTTP]` killers | none |
| 18 | File-disjoint units still break the shared compile and cannot run their own GW/HTTP exits | high | CONFIRMED | Gateway imports `gate6 {gate6, gateSensitiveDest}` and `gate12`; `principal.util` imported by `fixtures.ts` and `intent-submit-args.ts`; `jest-widgets-live.json` ts-jest | Both fix options: D-18 (implementers add only; deletions and export removals are merge IRs) and I-CTX slot seams for slots 1, 4, 8, 9, 10; merge-step exits in §1.0; §2.2 rule 1; §2.6 constraint 12; U6-L1 R6-1b; P-K4K8 IR-K4K8-1; P-PRINCIPAL IR-P-DEL; seam files in U4, U9b, U10b, P-G15a | none |
| 19 | CKPT-M export omits directories the checks read | high | CONFIRMED | 22 backend specs read `сайт и приложение/`, 7 read `maya-os-site/` (grep); `k5-exit-gate.sh:21` builds `maya-chat-shell`; `app.html` tracked; tracked tree about 240 MB | D-13 and the §2.5 script export the whole commit and delete the previous export; CKPT-M0 proves it on `d5ecca98` before Wave 0 | none |
| 20 | Legacy exit gates pin deleted structures; no owner updates them | medium | CONFIRMED | `k4-exit-gate.sh` greps "fire independently", "SENSITIVE_DEST is total"; `authority.spec.ts:71`; `k3-exit-gate.sh:55` FOREIGN import check; `run-all-checks.sh:33-39` | §2.1 integrator-only list; §2.6 constraint 11; P-K4K8 IR-K4K8-2; U6-L1 R6-1b; IR-TAB-1 via a `contract-bindings.ts` re-export; CKPT-W step 3 | none |
| 21 | Mutation evidence cannot run in CI as planned | medium | CONFIRMED | `widgets-mutation.yml` triggers (`workflow_dispatch`, `pull_request` paths only), `timeout-minutes: 180`; runner copies the backend per mutant and runs `jest --runInBand`; U0 unit run 490 suites in 156 s (parallel) | I-HAR: per-battery CI matrix dispatched for the flipping commit, `--steps` per killer, stable jest cache dir, entry-level kill tags (only `[HTTP]` kills count), multi-edit mutants and neutraliser sets; §1.0; §3.2 Mutants; §3.3; CKPT-W steps 1, 7; §4.6 | none |
| 22 | G5-e has no drift source (duplicate of 5) | medium | CONFIRMED | Same as 5 | Same as 5 | none |
| 23 | G3-c client-link half not exercisable on the JWT route | medium | CONFIRMED | `c9.authority.ts:25-45` (CLIENT_CHANNEL only with a channel proof; otherwise `membership/1` hash); `widgets.controller` passes no proof; `fixtures.ts` `verifyRevocation` rejects; link DELETE trigger; K14-10 | G3-c split: G3-c1 (membership re-create, role change: L) and G3-c2 (U candidate, K14-10); PR-1 becomes a GW RI U-proof; IR-P-REV; OD-3; R-03 row; §3.2 row 3; E1-G2G3; §4.4 | Gate 3 out of A-W5 strict |
| 24 | T4-INDEP stops at Gate 3, so M4-2/M4-3 cannot die | medium | CONFIRMED | `principal.util.ts` hash and `c9Hash('membership/1', [tenantId, …])` both include `tenantId`; slot 3 runs before slot 4 | T4-INDEP on neutraliser set `N4` (`findRecord` filter + slot 3), with T4-INDEP-3 as the control; killers re-declared; `[tamper:principalProofHash]` rejected (seal term, finding 6); §3.2 row 4; E1-G4; I-HAR neutraliser sets | none |
| 25 | Synthetic records can pass provenance; HTTP harness overrides are unlisted | medium | CONFIRMED | No trigger/trace column in the widget schema; `http-bootstrap.ts` `overrideProvider(PrismaService)` + `spyOn(gateway,'submit')`; `Fixtures.widget` calls `emitter.emit`; plan G6-20 "owner spied to reject" | D-17: server-side `WidgetMintProvenance` lines (BIN child stdout; HTTP sink), DB cross-check before teardown, BUILD ban on writer calls in evidence tests, HTTP+BIN pairing. No schema column, because one would change §3.7's shape and §4.4.3's classification (the finding's "e.g." left the choice open). Closed override allowlist (HAR-8, HAR-9); G6-20 via a real owner raise; §3.2 common; §3.3 step 4 | none |
| 26 | Proof DB shared with the shell workstream; plan pinned to a stale HEAD | medium | CONFIRMED | HEAD `d5ecca98`, `git status --porcelain` empty; `local-api-env.mjs` pins `maya_widget_gate_proof_local`:55611; `local-api-fixture.mjs` raw inserts; guard pattern `^maya_widget_gate_proof_[a-z0-9_]+$` | Re-pinned to `d5ecca98`; own DB `maya_widget_gate_proof_gates` (D-19); lock scoped to the programme's databases; cluster stopped only with no foreign connection; §1.0 commands; I-MIG2; §2.2 rules 2/4/6; CKPT-W step 8; §3.3 step 2; §4.6 | none |
| 27 | Exit commands fail on the named databases | medium | CONFIRMED | `action-engine-kernel-proof.ts` requires `maya_c06_*`; `appointment-action-engine-proof.ts` requires `maya_c06_appointment_*`; `http-smoke.ts:855` needs the seed; `platform-ci.yml:64-75` order | Named DBs in Pins; integrator creates, migrates and seeds them (CKPT-M0, CKPT-W steps 2/4, I-MIG2); U-OWN's `test:e2e` and appointment proof moved to the merge step; §2.6 constraint 5 | none |
| 28 | Some exits cannot pass at their unit's merge | medium | CONFIRMED | Gateway `pending('10')` until U10b (W3); U13a merges in W2; PR-9 needs a slot-11 spy; `createHash` in `token.util.ts`, `emitter.service.ts`, `consent/erasure.ts`, `proactive/provenance.ts`, `authority/contract-bindings.ts`, `analytics/projection.ts` | U13a live exits `[XF→U10b]`; PR-9 split into 9a and 9b `[XF→U10b]`; SEAL-4 is a shrinking ratchet with each site assigned (integrator, P-MINT-CORE, P-RT6, P-MT3, U12b) | none |
| 29 | No unit owns noun-handle minting or the tag namespace | low | CONFIRMED | AMB-33 row; P-MINT-CORE only writes; U11b only dereferences; U-OWN "no behaviour change"; AREA-C:100 | New unit **P-HANDLE** (W2, before P-MINT-CORE and so before U11b and U12b); AMB-33 row; P-MINT-CORE depends/scope; E1-G11; §2.3, §2.4; Appendix A | units 45 → 46 |
| 30 | MIG-4 count wrong on a fresh DB; I-MIG3's production re-check needs production access | low | CONFIRMED | `prisma/migrations`: 98 directories + lock file; `pre-cutover-reconciliation.json` ruling R1, Beget jump host, 2026-09-16T14:14Z | MIG-4 and §3.3 step 2 now say "98 applied, exactly 2 (3) `*_widget_layer_*`"; I-MIG3 is migration 3 unless an owner-run read-only check confirms 0 widget tables; D-8 note (the fold relies on deploys staying blocked, S5-1); §4.1 | none |
| 31 | `h6-hashing` spec ownership overlaps; teardown breaks on the divergence FK | low | CONFIRMED | Plan P-SEAL vs P-MINT-CORE file lists; `fixtures.ts` `teardown()` model list; AREA-B U10b request 1 (RESTRICT FK to `WidgetIntentRecord`) | Spec renamed `emission/seal-h6.architecture.spec.ts` (inside P-MINT-CORE's `seal*.ts` exclusion); I-MIG2 IR-MIG2-TD deletes divergence rows first, plus MIG-7 | none |

*(The REVIEW DISPOSITION above is `[REC·rev]`, appended verbatim from recovered chunk
`005_Bash_agent-a02e08299c97e7.txt`, which is the `cat >>` heredoc that wrote it into the original file. Its
"Applied" column is the single best index of what the review changed, and it drove most of the `[RECON]` rows in this
reconstruction.)*

---

## Appendix B — Reconstruction ledger (not part of the original plan)

### B.1 Where each section came from

| Section | Source | Class |
|---|---|---|
| Header, Pins, Bottom line | `recovered/GATES-PLAN-V11.md` §0 + chunk 003 PAIRS | `[REC·rev]` |
| §0.1 D-1…D-18 | §0 recovered + chunk 003 PAIRS (D-2, D-8, D-11, D-13, D-15 revised; D-16, D-17, D-18 new) | `[REC·pre]`/`[REC·rev]` |
| §0.1 D-19 | the committed audit note's D-19 summary + chunk 004's one-line citation | `[RECON]` |
| §0.2 | §0 recovered, verbatim | `[REC·pre]` |
| §0.2 revisions sub-table | REVIEW DISPOSITION "Applied" column | `[RECON]` |
| §0.3 OD-1…OD-5 | §0 recovered; revised questions and the 19-candidate OD-3 list quoted from the audit note | `[REC·pre]` + `[REC·rev]` quotes |
| §0.3 delivery dependencies | §0 recovered; TYPED-TURN, LANDING-VERIFY, P-17 from findings 4, 12, 9 | `[RECON]` |
| §0.4 | §0 recovered; DEV-1 quoted from the audit note (`note.planDeviation.DEV-1`) | `[REC·rev]` |
| §0.5 clause states | §0 recovered; revised definitions quoted from the audit's `clauseStates` | `[REC·pre]` + `[REC·rev]` |
| §0.5 per-gate ceilings | rebuilt from the audit note's `expected`, Sheet 07's ceilings table and findings 3, 4, 9, 10, 12, 13 | `[RECON]` |
| §1.0 conventions and commands | chunk 006 + chunk 004 PAIRS | `[REC·rev]` |
| Wave 0 cards | chunk 006 + chunk 004 PAIRS (CKPT-M0, I-AUD0, I-CTX seams, I-HAR, U-TAB) | `[REC·rev]` |
| Wave 1 cards | chunk 006; revisions for U4, U6-L1, U8R, U9a, P-K4K8, P-PRINCIPAL, P-SEAL, P-RENDER, U-OWN from chunk 004 | `[REC·pre]`/`[REC·rev]` |
| Wave 1 cards with no revision chunk (U7a, U8a, U8b-c, U10a, U11a, U12a, P-F88, P-LEDGER, P-25) | chunk 006 only | `[REC·pre]` |
| MERGED lines on every Wave 0/1 card | `git log a2f98a52..df6c3a5a` and the Wave 0 commits before it, with `git show --stat` attribution | `[RECON]` |
| Waves 2–6 | chunk 006 (W2), chunk 007 (W3–W6); revisions from the REVIEW DISPOSITION | `[REC·pre]` + `[RECON]` |
| P-HANDLE card | finding 29 only; no card text survives | `[RECON]` |
| §2.1–§2.6 | chunk 008; revisions from findings 17, 20, 21, 26, 27 and D-18/D-19 | `[REC·pre]` + `[RECON]` |
| §3.1 | regenerated from `gate-clause-inventory.json`, which was machine-generated from the revised §3.1 | `[DERIVED]` |
| §3.2, §3.3 | chunk 008; revisions from the REVIEW DISPOSITION | `[REC·pre]` + `[RECON]` |
| §4.1–§4.6 | chunk 008; revisions from findings 1, 2, 16, 17, 21, 23, 25, 30 | `[REC·pre]` + `[RECON]` |
| Appendix A | chunk 008; counts revised to 46/53 per the disposition's headline-effect row | `[RECON]` |
| REVIEW DISPOSITION | chunk 005, verbatim | `[REC·rev]` |

### B.2 What is still lost, and how to regenerate it

| Lost | Why it matters | How to regenerate |
|---|---|---|
| **AREA-A / AREA-B / AREA-C** (`scratchpad/p6-gates/AREA-*.md`) | dozens of unit cards say "AREA-x §n as stated" and never restate the content: the G6 M1–M28 mutant list, the G7 M1–M39 list, the G8 T1–T35 matrix, the G9 M1–M35 list, the G10 M10-1…M10-26 list, the G11 MUT-1…19 list, the G12 MUT-12-A…T list | the merged Wave 1 code is now the record: `test/widgets-live/mutations/gate*.json` carries every declared mutant with its killers and expected status; the live specs carry the test ids. Regenerate the lists from those files, not from memory. |
| **The revised §1 cards for U7a, U8a, U8b-c, U10a, U11a, U12a, P-F88, P-LEDGER, P-25** | only the pre-review wording survives; the review may have touched them | read the merged commit for each unit (`git show <hash>`) and reconcile against the REVIEW DISPOSITION's "Applied" column. |
| **The revised §2, §3.2, §3.3, §4 and Appendix A text** | only the substance is certain, not the wording | as above; the audit JSON's per-clause `rulings`, `u_basis`, `blocked` and `waits_on` fields carry much of §3.2 in machine form. |
| **`P-HANDLE`'s card** | a Wave 2 unit with no scope text | write it from AMB-33, F14 (C11:216-218), R3.7.3 (C11:4588-4591), BOOK.4 (C11:3116) and finding 29 before Wave 2 starts. |
| **MT2-7** | named by finding 16, content unrecorded | derive from D-15: the second duty beside MT2-6 is almost certainly the "model transport never stubbed" assertion; confirm against `ai-core-model.service.ts:1323` before writing it. |
| **IR-TAB-2, IR-K4K8-4** | landed in `c29ba762` and `4f2703f1`; the plan names only IR-TAB-1 and IR-K4K8-1..-3 | read the two commits. |
| **CKPT-W1 §1–§4** of `w1/CKPT-W1-REPORT.md` | the record of the seven Wave 1 review fixes | re-derive from the 14 fix commits listed in §1 Wave 1; **do not invent it** (the surviving §5 says so explicitly). |
| **G2-BACKLOG** | the programme's step-5 backlog | regenerate from repository evidence when step 5 starts (PROGRAM.md). |
| **`p1-gates` specs, `p1-shell`, `p1-k14`, `p4-v11` reports, `p5-shell` reports** | context for the plan's inputs | `INTEGRATION-PLAN.md`, `SHELL-PLAN-v2.md` and `K14-PLAN.md` are recovered under `recovered/`; the rest is gone. |

### B.3 Standing correction to every command in this file

The original plan's `S` pointed at `/private/tmp/claude-501/…/scratchpad`. **That directory was wiped and must never
hold programme state again.** The durable home is
`/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/.maya-program`.
Working directories the plan puts under `$S` (`pg-live/data`, `p6-gates/ckpt`, `p6-gates/mut`) must be re-pointed
there or to another durable path before Wave 2 starts, and the proof cluster's data directory must be located (or
recreated) before any CKPT-M runs.
