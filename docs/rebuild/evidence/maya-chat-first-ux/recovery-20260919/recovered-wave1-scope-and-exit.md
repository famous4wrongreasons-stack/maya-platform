# Recovered Gate-programme Wave 1 scope and exit duties

This is evidence recovered from the durable `.maya-program/GATES-PLAN-V11.md`
reconstruction, not a change to Widget Contract V1.1. Original pre-review payloads,
subsequent review revisions and reconstructed text are distinguished by the retained
tags. Duties are checked against executable repository evidence; historical claims
are not certification. Current recovery uses its OWN PostgreSQL 16 cluster on port
55619 and fresh named proof databases, leaving both pre-existing clusters untouched.
The literal old port/path and no-push status in the historical text are not current
execution instructions.

Source SHA-256: `0fdff2031549173ad13146ddec72d33e5ebe6ed7f27d6a1d32c7ffc1cfc19a71`.

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
