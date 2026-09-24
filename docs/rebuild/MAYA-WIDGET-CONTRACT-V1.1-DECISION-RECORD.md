# Contract V1.1 — decision record

**Status: FINAL for step 1 of the owner's execution order («Contract V1.1 — только approved rulings/readings»). The integrator's decision on STOP-5 is applied. Four STOPs and two step-5 owner questions stay open; they are Decision Sheet 06.**

This record states what the owner decided at checkpoint `ffbd684a` on the published ruling packet `docs/rebuild/DECISION-SHEET-04-RULING-PACKET.md`, and how each decision reached `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md`, which now carries version 1.1. Part D.7 is byte-identical to that contract's Annex C, which is itself a record and states no rule. No host, server path, URL or secret is recorded here.

---

## D.0 Identity

| File | Version 1 | Version 1.1 |
|---|---|---|
| contract `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md` | commit `81bcc5ec`, SHA-256 `15c383f1d173ad7bc83b6b4df8138b06c96c4131452d5fe05549ed6d59aca4d3` (6364 lines) | SHA-256 `606d7f99da5fe1977d5efe737dca91a04f2b11faecddbd666120d34a03e94a8a` (7415 lines) |
| envelope `docs/rebuild/MAYA-CHAT-FIRST-IMPLEMENTATION-ENVELOPE.md` | SHA-256 `339aa10b554ef0139c628a7570bc54ed288a43e619e28a451a90c10fd7756f66` | SHA-256 `763516755d3d54b922dcea8fa84b04575f2e0f3e3c60710984608c85bc4a2cb9` |
| mapping `docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md` | SHA-256 `a1b1e1ef74627d65383257d1352cffe09b6289590ce285085019d3369a025cc6` | SHA-256 `2c89b140b8520c9ff6599bb61d65cb9d8634dff39e764a5347f07259a2fc73e6` |
| Annex C text (and Part D.7) | — | SHA-256 `a367fe9d0ce4a3b6f22d9d6499d52f3e292744a5e523107c34713320883b1369` |
| ruling packet | SHA-256 `ac0993e3943409ac16c936323fbd1f932addf577adbdf899fee6cf29251a3efd` | unchanged |

The contract keeps its path, because 21 consumers bind it; line 1 names v1.1 and line 3 names Version 1 by commit and SHA-256. The wire literals (`maya.widget.envelope/1` and the rest) are per shape and are not bumped.

**Verbatim guarantees.** `docs/rebuild/evidence/maya-chat-first-ux/contract-version-record-check.mjs` asserts each at every run (checks 3–5):

| Block | Source | SHA-256 | Assertion |
|---|---|---|---|
| Owner ruling text | checkpoint `ffbd684a`, «DECISION SHEET 04 — OWNER RULINGS» through Block B's last line | `9f8a9ac072b58b3a873185de3f52bf584af70fc9e0655ab5708d798c30254dff` | byte-identical in Annex C C.1 |
| Block A | packet lines 211–286 | `e13fca44c5aea9db97fafb0df0248e578ac576022bdd27b6a003cb0c9fa2b3e7` | **13** items, `A1`…`A13` in order, verbatim in C.2 |
| Block B | packet lines 290–355 | `1a4cb0cdaab500e0526684d569fb7fb90a54ad05463aff106aae3f783c463e0e` | **47** top-level bullets, IDs as published, verbatim in C.3 |

## D.1 Summary

| | |
|---|---|
| Rulings | R-01 **TRANSFERRED** (option B as limited by the ruling's words): fifteen read keys, registered as one unit; no existing key changes. R-02 **TRANSFERRED** through F36a fences 3 and 4. R-03 **TRANSFERRED** (option A): one internal ingress, declared outside the widget layer, forwarded by no public edge, with its own prerequisite row P-33. R-04 **TRANSFERRED** (class (a), integrator decision on STOP-5, D.2): the staff revoke-only door onto the existing consent owner, stated once in §3.5 R3.5.5, counted beside the programme's three routes, with the one Action Engine branch it needs as (j) and its own prerequisite row P-34. R-05 **DEFERRED** (`NATIVE/PWA: NOT PROVEN`). |
| Block A | A1–A3 **TRANSFERRED**. A4 **TRANSFERRED** with three fail-closed tightenings the certified text forces (the code alone for kinds without `REFINE`, with no matching owner capability, or with an unreadable predecessor), disclosed in C.2. A5 **STOPPED** as a whole (STOP-4). A6 and A8–A13 **RECORDED**. A7 **STOPPED** as a whole (STOP-1). |
| Block B | **47 of 47** recorded verbatim. 10 reach body text: AMB-03/04, AMB-06, AMB-09, Escape, AMB-17, AMB-46, AMB-52, AMB-56 through C.5 corrections or consistent edits, and K14-21 and G2-12 through consistent edits; AMB-03/04, AMB-06, AMB-52 and AMB-56 only in part (the other halves change no clause). G2-46 is inoperative under R-01. |
| R-01 read set | Fifteen keys (C.4, stated in §0.7 F36a). `catalog.staff.read:output/2` is not carried (STOP-3). |
| Corrections carried | 30 rows (C.5). Classes (a), (b) and (c) only. |
| STOP (owner decision) | STOP-1 A7; STOP-2 reads still to be built (CAP-47, SC-21, SC-22 summary, SC-24, A7's catalogue key); STOP-3 `catalog.staff.read:output/2`; STOP-4 A5 (D.4). STOP-5 is resolved (D.2) and is no longer a STOP. |
| Owner questions for step 5 | Q-1 A1's predicate split for client-data F36a keys; Q-2 §2.4 owner-class admission of F36a keys (D.4). They block the G2 rows named in C.6, not this version. |
| Not carried | 3 exclusions by the ruling, the packet's engineering choices, 8 errata-bundle bullets and AMB-21h's boolean half (C.6) |
| Edits | **140**: 109 in the contract (3 version-identity edits and the Annex C append among them), 14 in the envelope, 17 in the mapping |

## D.2 The integrator decision on STOP-5

**What the STOP was.** The challenged plan stopped on R-04's staff door: the preamble and §A1.1 P-01 counted «exactly three new routes» in the whole programme, and the envelope's G8 read «backend authority unchanged beyond the recorded R-01 read set … routes ≤ 3», so building the door would have made both false.

**The decision (applied).** R-04 is an explicit owner approval of a minimal staff revoke-only bridge to the existing canonical consent owner for confirmed phone and e-mail requests. The ruling's own words, byte for byte, are in C.1 of Part D.7; the next three sentences restate them in English and quote nothing. The staff bridge can only withdraw marketing consent. It cannot grant consent, change privacy consent, create a second consent owner, or write consent into chat history or provider state. Every successful revoke ends in a canonical consent receipt, and until an executable path exists no text promises a revoke already performed. The door's route and its staff authority are therefore the text consequence of an approved ruling (class (a)), not a new decision. V1.1 counts the door beside the programme's three routes and never places it outside the programme.

**Where it is stated.**
- **§3.5 R3.5.5**, once, next to the consent fence: exactly one further ingress, counted beside the three routes of P-01, not a widget route, with a closed request shape `StaffMarketingRevokeRequest` and ten clauses, each naming its mechanism and evaluation point. The ruling's words «к существующему canonical consent owner», «для подтверждённых phone/e-mail requests» and each limit are quoted in the clause that states them:
  - (a) staff authority only: an active membership in the client's tenant whose role is one of the ten tenant staff roles, platform roles, `client`, `customer`, `integration_service` and any later role refused; no widget, intent, Telegram-ingress or legacy bridge credential;
  - (b) marketing consent only, privacy consent never, refused by the owner and again by the engine;
  - (c) revoke only, a grant never, refused by the owner and again by the engine;
  - (d) only for a confirmed phone or e-mail request: the contact the request arrived from must match the contact the canonical record holds for that client in that channel, or the owner refuses before any write;
  - (e) provenance in the existing `ClientConsentFact` columns, with the staff source types `staff_phone_request` and `staff_email_request`, a `sourceIdentityHash` over the tenant, the client, the idempotency key, the channel and the contact's match key, one writer, no second consent owner, and no new column, capability or key;
  - (f) nothing written to chat history or provider state;
  - (g) every successful revoke ends in the canonical consent receipt (the fact and its Action Engine execution);
  - (h) reachable from neither the widget gateway nor the Telegram ingress; only the request shape is generated into the contract types; no widget kind confers consent, and the capability keeps the registration §A1.6.2 states;
  - (i) no fixed copy of the bot, the shell or the widget layer promises a revoke before the door is executable;
  - (j) the one Action Engine change the door needs: a staff-revoke branch in the policy resolver and the executable input contract of `package5.wave3.record-client-consent.execute.v1`, admissible only for a confirmed marketing revoke by one of the ten roles, adding no capability, registry field or actor-policy value.
  The clause is `NORMATIVE-PENDING` on **P-34**, so every evaluation point refuses until the door is built.
- **Preamble:** «Under owner ruling R-04 it adds one staff-revoke branch to the actor policy and the executable input contract of the existing consent capability, stated in §3.5 R3.5.5 (j); no other C6–C9 canonical business contract is modified.» «Exactly three new routes exist in the chat-first widget programme» (unchanged count), plus: «Owner ruling R-04 authorises exactly one further ingress, counted beside those three … Beyond the R-01 read set, that door's revoke-only staff authority is the only backend authority this contract adds.»
- **§0.16 FR-6a** and **§3.4 R3.4.4** name the engine exception of (j), which no widget path reaches, as `NORMATIVE-PENDING` on P-34; FR-6a's rule, that no widget kind confers consent, is unchanged.
- **§A1.1 P-01** counts the R-03 ingress (P-33) and the R-04 door (P-34). **§A1.3 P-34** is the door's own row, added the way P-33 was, and names the code that refuses a staff consent write today; F92, `MechanismGap`, §A1.7, P-29 and §A5 count thirty-four rows.
- **Envelope G8:** «backend authority unchanged beyond the recorded R-01 read set and the R-04 revoke-only staff authority | C6–C9 diff = exactly contract §0.7 F36a's enumerated read set … plus the one R-04 staff-revoke branch of contract §3.5 R3.5.5 (j) … routes: ≤ 3 widget-programme routes … plus exactly 1 R-04 consent door … staff consent authority other than that door's marketing withdrawal 0». The envelope's and the mapping's K14 rows name the door and its engine branch, and the mapping's K3 row and its one-contract section scope «two routes» to the two widget routes.
- **Checkers:** `mapping-vs-contract-check` (34 rows), `k1-dossier-check` (thirty-four), `build-ledgers` and the regenerated mechanism-gap ledger (34 rows, `MG-P-34`), `contract-version-record-check` check 14 (the door is counted beside the three routes and placed outside the programme nowhere in the contract, the envelope or the mapping; R3.5.5 carries all nine quoted limits, ten clauses with a mechanism and an evaluation point, the ten-role allowlist and the contact match; the preamble, FR-6a and G8 name (j)), and the final acceptance gate's G8 label.

**What it does not widen.** No grant, no privacy consent, no staff consent authority other than (j)'s marketing revoke, no reuse of a legacy bridge credential or of the Telegram ingress credential, no new Action Engine capability, registry field, actor-policy value, C9 key, control key, column or table, and no change to FR-6a's rule or to the registration §A1.6.2 states. STOP-1 to STOP-4 stay STOPs, and Q-1 and Q-2 stay open.

**Readings disclosed with it.**
- **«Staff»** is an active membership in the client's tenant whose role is one of the ten tenant staff roles of the governed staff role set (`tenant_owner`, `business_owner`, `tenant_admin`, `administrator`, `manager`, `branch_manager`, `accountant`, `provider`, `employee`, `staff`), pinned by a test. The platform roles, `client`, `customer`, `integration_service` and any role added later are refused. An implementation may narrow the set and may not widen it.
- **«Подтверждённых»** is read as the narrowest confirmation the canonical record can check: the phone number or e-mail address the request arrived from matches the contact the record holds for that client in that channel (`Client.phoneHash` for a phone; the linked account's e-mail for an e-mail). The contact is never stored or logged; only its match key enters `sourceIdentityHash`, so the confirmation is recorded as a digest and can be re-checked. A caller-set flag would not be a mechanism. Three limits are disclosed. The match ties the withdrawal to a contact on record; it does not prove who operated that phone or mailbox, and a staff member could enter a contact on record without a request. The harm is bounded, because the door can only withdraw marketing and every withdrawal names its staff actor; a stronger confirmation, such as a one-time code sent to that contact, would be a new security design and is not carried. A number shared by a family confirms a request for every client whose record holds it, because `Client.phoneHash` is a candidate index and not an identity; the door can still only withdraw marketing. A client whose record holds no contact in that channel cannot be the subject of a staff withdrawal, and uses the in-app revoke surface.
- **Model-composed text.** Clause (i) fences fixed copy: bot and shell strings, the server phrase catalogue and the narrative and moment templates, which are the only sources of widget prose. Maya's model-composed conversational text is reached by no evaluation point of this contract, and (i) does not claim to fence it.
- **P-34 is in K14 (wave 6), not K12.** The packet groups R-04 with K14, and every item R-04 unblocks is K14 copy (K14-02, K14-04, K14 rows #6 and #7). K12 (wave 5) is complete at the accepted checkpoint, and an unbuilt row assigned to it would falsify that figure.
- The in-app revoke surface (R-04 item 1) is owner decision D9-A's remediation lane, which that decision places outside this programme. It changes no clause and is not counted.

**What the build owes (K14, P-34).**
- In the Action Engine: the staff-revoke branch of (j) in `action-engine.policy-resolver.ts` and in `package5-wave3-executable.contract.ts`.
- In the consent owner: the staff-revoke branch of (a)–(d) in `Package5Wave3CanonicalCutoverService`, with the ten-role check and the contact match.
- In the executor `Package5Wave3ExecutableService`: `sourceType` taken from the normalized command, both where it writes the fact and where it looks one up by `(tenantId, sourceType, sourceIdentityHash)`, with the staff `sourceIdentityHash` derivation of (e). The A18 invalidation guard that matches `client_command` applies to the invalidation owner's own source file only (`consent-security-invalidation.architecture.ts`), so it is untouched.
- The door itself, the copy test of (i), and a test for each fence (a)–(j).
- If (j) cannot be built without a new capability, registry field or actor-policy value, or without changing the registration §A1.6.2 states, the build **STOPs** there for an owner decision.

## D.3 Item → Contract V1.1 edit ids

Edit ids are those of the amendment plan's §6 (challenge pass plus the integrator's STOP-5 resolution).

| Item | Disposition | Edit ids |
|---|---|---|
| R-01 | TRANSFERRED — fifteen read keys, registered as one unit; no existing key changes | V11-C03, V11-C04, V11-C07, V11-C08, V11-C09, V11-C11, V11-C12, V11-C13, V11-C14, V11-C15, V11-C16, V11-C17, V11-C19, V11-C21, V11-C22, V11-C24, V11-C25, V11-C39, V11-C57, V11-C58, V11-C68, V11-C70, V11-C83, V11-C84, V11-C88, V11-C92, V11-C93, V11-C95, V11-C116, V11-E04, V11-E07, V11-E09, V11-E10, V11-E11, V11-E12, V11-M13, V11-M14, V11-M15, V11-M16 |
| R-02 | TRANSFERRED — §0.7 F36a fences 3 and 4 | V11-C13 |
| R-03 | TRANSFERRED — one internal ingress, its own prerequisite row P-33 | V11-C03, V11-C51, V11-C66, V11-C86, V11-C87, V11-C106, V11-C107, V11-C108, V11-C109, V11-C110, V11-C111, V11-E01, V11-E02, V11-E07, V11-E13, V11-M01, V11-M02, V11-M03, V11-M04, V11-M05, V11-M06, V11-M07, V11-M08, V11-M09, V11-M11 |
| R-04 | TRANSFERRED (class (a), integrator decision on STOP-5) — the staff revoke-only door onto the existing consent owner, counted beside the programme's three routes; every limit of the ruling a fence of §3.5 R3.5.5, with the one Action Engine branch it needs as (j); its own prerequisite row P-34 (K14) | V11-C03, V11-C87, V11-C106, V11-C107, V11-C108, V11-C109, V11-C110, V11-C111, V11-C112, V11-C113, V11-C114, V11-C115, V11-E02, V11-E07, V11-E13, V11-E14, V11-M01, V11-M02, V11-M03, V11-M04, V11-M05, V11-M06, V11-M07, V11-M08, V11-M09, V11-M11 |
| R-05 | DEFERRED | — |
| A1 | TRANSFERRED | V11-C23, V11-C36, V11-C40, V11-C41, V11-C43, V11-C67 |
| A2 | TRANSFERRED | V11-C05, V11-C27, V11-C32, V11-C44, V11-C45, V11-C48, V11-C49, V11-C50, V11-C55, V11-C59, V11-C62, V11-C63, V11-C64, V11-C75, V11-C76, V11-C77, V11-C79, V11-C81, V11-C90, V11-C91 |
| A3 | TRANSFERRED | V11-C26, V11-C54, V11-C59, V11-C65, V11-C69, V11-C89, V11-C97, V11-E05, V11-E08, V11-M10, V11-M12 |
| A4 | TRANSFERRED — three fail-closed tightenings disclosed | V11-C18, V11-C28, V11-C38, V11-C52, V11-C53, V11-C60, V11-C71, V11-C72 |
| A5 | STOPPED (STOP-4) | — |
| A6 | RECORDED | — |
| A7 | STOPPED (STOP-1) | — |
| A8 | RECORDED | — |
| A9 | RECORDED | — |
| A10 | RECORDED | — |
| A11 | RECORDED | — |
| A12 | RECORDED | — |
| A13 | RECORDED | V11-E03, V11-C66, V11-M12, V11-M17 |
| B-01 AMB-01a | RECORDED | — |
| B-02 AMB-03, AMB-04 | TRANSFERRED in part through C.5 corrections (F18 modes; the `role` ban's scope); the Membership and `presentation_mode` bullets change no clause | V11-C06, V11-E06, V11-C98, V11-C99 |
| B-03 AMB-05 | RECORDED | — |
| B-04 AMB-06 | TRANSFERRED in part through a C.5 correction (FR-3); the `preview()` half changes no clause | V11-C100 |
| B-05 AMB-07 | RECORDED | — |
| B-06 AMB-09 | RECORDED; the listed edits state text consistent with it | V11-C89 |
| B-07 Escape (SH-05, AMB-11, AMB-62) | TRANSFERRED through C.5 corrections | V11-C101, V11-C102, V11-C103, V11-C104, V11-C105 |
| B-08 AMB-15 | RECORDED | — |
| B-09 AMB-17 | TRANSFERRED through a C.5 correction | V11-C46, V11-C47, V11-C78 |
| B-10 AMB-18 | RECORDED | — |
| B-11 AMB-20 | RECORDED | — |
| B-12 AMB-21a | RECORDED | — |
| B-13 AMB-21e | RECORDED | — |
| B-14 AMB-21f | RECORDED | — |
| B-15 AMB-24 | RECORDED | — |
| B-16 AMB-25 | RECORDED | — |
| B-17 AMB-27 | RECORDED | — |
| B-18 AMB-36 | RECORDED | — |
| B-19 AMB-37 | RECORDED | — |
| B-20 AMB-38 | RECORDED | — |
| B-21 AMB-39 | RECORDED | — |
| B-22 AMB-40 | RECORDED | — |
| B-23 AMB-41 | RECORDED | — |
| B-24 AMB-42 | RECORDED | — |
| B-25 AMB-44 | RECORDED | — |
| B-26 AMB-46 | TRANSFERRED through a C.5 correction | V11-C97 |
| B-27 AMB-52 | TRANSFERRED in part through a C.5 correction (`allowedKinds`); the second sentence changes no clause | V11-C29, V11-C30 |
| B-28 AMB-53 | RECORDED | — |
| B-29 AMB-56 | TRANSFERRED in part through a C.5 correction (L8); the UNKNOWN half changes no clause | V11-C96 |
| B-30 AMB-57 | RECORDED | — |
| B-31 AMB-59 | RECORDED | — |
| B-32 SH-04, G2-14 · sign-in | RECORDED | — |
| B-33 SH-06 | RECORDED | — |
| B-34 SH-07 | RECORDED | — |
| B-35 K14-02 | RECORDED | — |
| B-36 K14-20 | RECORDED | — |
| B-37 K14-21 | RECORDED; the listed edits state text consistent with it | V11-C66 |
| B-38 G2-12 | RECORDED; the listed edits state text consistent with it | V11-C13 |
| B-39 G2-18 | RECORDED | — |
| B-40 G2-19 | RECORDED | — |
| B-41 G2-24 | RECORDED | — |
| B-42 G2-27 | RECORDED | — |
| B-43 G2-37 | RECORDED | — |
| B-44 G2-41 | RECORDED | — |
| B-45 G2-42 | RECORDED; no waitlist key (STOP-2) | — |
| B-46 G2-44 | RECORDED | — |
| B-47 G2-46 | RECORDED; inoperative under R-01 | — |
| correction: AMB-03: F18's «four» modes becomes three | CARRIED (b) | V11-C06, V11-E06 |
| correction: AMB-10, K14-13: R3.2.2 and the F74 prose admit an AE destination in `handoff_capability_ref` | CARRIED (b) | V11-C20, V11-C34 |
| correction: AMB-12: PAY.4 derives `commit_allowed` from `permitted_effects` alone | CARRIED (b), certified F57/K11 | V11-C33 |
| correction: AMB-14: `lifecycle.delivery_channel` classified `AUDIT_RETAINED` | CARRIED (b) | V11-C82 |
| correction: AMB-17: the labels member `selection_domain_labels` | CARRIED (a) | V11-C46, V11-C47, V11-C78 |
| correction: AMB-21h: the `inputs[k]` rows (field kind `text`; no sensitivity clause); boolean half not carried | CARRIED (b), certified `InputField`/R3.6.5 | V11-C80 |
| correction: AMB-45: R3.10.5 points to R3.11.3 | CARRIED (b), certified R3.11.3 | V11-C61 |
| correction: AMB-52: declare `allowedKinds` | CARRIED (a) | V11-C29, V11-C30 |
| correction: AMB-55: FR2 reads the intent-audit store | CARRIED (b) | V11-C73 |
| correction: A4: L10's mechanism sentence | CARRIED (a) | V11-C72 |
| correction: AMB-43: the R3.11.3/R3.11.4 route names | CARRIED (a) | V11-C63, V11-C64 |
| correction: HYG-02: cite DS-02; P-20 reads `subjectCapability(record)` | CARRIED (b) | V11-C26, V11-C69, V11-C89, V11-E05, V11-E08 |
| correction: R3.4.4 agreement: nine `personal_data` rows carry `SESSION_VERIFIED` | CARRIED (b) | V11-C13 |
| correction: Counts and scope R-01 would otherwise make false (56 now, 71 once registered; hash sentences) | CARRIED (c) | V11-C07, V11-C08, V11-C09, V11-C14, V11-C15, V11-C16, V11-C17, V11-C19, V11-C24, V11-C25, V11-C39, V11-C57, V11-C58, V11-C68, V11-C70, V11-C83, V11-C84, V11-C88, V11-C92, V11-C93, V11-C95, V11-E04 |
| correction: F28: a key new to the table is an admission only for F36a | CARRIED (c) | V11-C11 |
| correction: F88.1/F88.2: the `role` ban covers the presentation role | CARRIED (a), Block B AMB-03/04 | V11-C98, V11-C99 |
| correction: FR-3: Gate 6 evaluates its five conditions directly | CARRIED (a), Block B AMB-06 | V11-C100 |
| correction: The escape on restricted tiers; tier cells are allowlists | CARRIED (a), Block B Escape | V11-C101, V11-C102, V11-C103, V11-C104, V11-C105 |
| correction: L8: `EXPIRED` is a response outcome | CARRIED (a), Block B AMB-56 | V11-C96 |
| correction: F15: value flow into Gate 11; Gate 10 as the one reader of the lowered utterance | CARRIED (a) AMB-46, (c) A3 | V11-C97, V11-C59 |
| correction: `resolved_widget` declared (`HandoffAnswer`) | CARRIED (c), A2 AMB-60 | V11-C50 |
| correction: P-33, the ingress's own prerequisite row | CARRIED (c), R-03 | V11-C87, V11-C106, V11-C107, V11-C108, V11-C109, V11-C110, V11-C111, V11-M01, V11-M02, V11-M03, V11-M04, V11-M05, V11-M06, V11-M07 |
| correction: The envelope's K14 parity proof reads `subjectCapability(record)` | CARRIED (b) | V11-E03 |
| correction: The R-04 door counted beside the programme's three routes; preamble, P-01, G8, K14 and the mapping name the one further ingress and its revoke-only staff authority | CARRIED (a), R-04 | V11-C03, V11-C87, V11-E02, V11-E07, V11-M01, V11-M07, V11-M08, V11-M09 |
| correction: P-34, the R-04 door's own prerequisite row, in K14 | CARRIED (c), R-04 | V11-C106, V11-C107, V11-C108, V11-C109, V11-C110, V11-C111, V11-C113, V11-M02, V11-M03, V11-M04, V11-M05, V11-M06, V11-M07 |
| correction: The Action Engine exception the R-04 door needs is named where the engine fence and the C6–C9 figure are stated | CARRIED (a), R-04 | V11-C03, V11-C112, V11-C113, V11-C114, V11-C115, V11-E07, V11-E14, V11-M07 |
| correction: The prerequisite-ledger range names P-33 and P-34 in the envelope and the mapping | CARRIED (c), R-03 and R-04 | V11-E13, V11-M11 |
| correction: §A1.6.2 names 71 once F36a registers; each package's «`C9_REGISTRY_HASH` unchanged» is scoped to F36a, whose registration no package owns | CARRIED (c), R-01 | V11-C116, V11-E09, V11-E10, V11-E11, V11-E12, V11-M13, V11-M14, V11-M15, V11-M16 |
| correction: The mapping's P-20 row and paragraph cite DS-02; its K14 exit reads `subjectCapability(record)` | CARRIED (b), A3 and A13 | V11-M10, V11-M12, V11-M17 |
| correction: R3.9.4 notes why its read of the predecessor's source capability meets §0.4 F15 | CARRIED (c), A4 | V11-C60 |
| version identity (K11 bump) | VERSION | V11-C01, V11-C02, V11-C85, V11-C94 |

Every one of the 140 edits is referenced by at least one row above, and no row names an edit that does not exist.

## D.4 Open owner decisions: STOP-1 to STOP-4, Q-1 and Q-2

Nothing of these is in the body. Each STOP holds one item only, and everything else proceeds without it. Decision Sheet 06 puts them to the owner.

| id | Item | What transfer would require | The exact question, and its options |
|---|---|---|---|
| STOP-1 | **A7 as a whole** | Published: «Build the tenant broadcast template catalogue … that only pre-fills `b35.preview`», «Build the S-352 release-notes card with a working seen-state write …», «Both READ keys go on R-01's list». Transfer would need a canonical release-notes owner, which does not exist (the only producer is a text constant in the legacy bot). It would need a persisted per-principal seen-state write, which R-01 «READS ONLY» cannot carry and `control.widget.dismiss` does not provide. And it would need a catalogue read that exists only in legacy Python (STOP-2). | For the card: (i) name a canonical owner for tenant release notes and authorise a persisted seen-state write; (ii) re-sign S-352 as an on-request card whose «seen» is only the per-emission dismiss; or (iii) record S-352 as withdrawn from chat parity. For the catalogue: STOP-2. Until then `/whats_new` stays NOT RETIRED. |
| STOP-2 | **Reads still to be built inside an existing owner:** CAP-47 waitlist read; SC-21, SC-22 (summary), SC-24; A7's template-catalogue key | Published: R-01 «может добавить … set read-only C9 keys для уже существующих canonical business owners» and excludes «новые capabilities только ради увеличения G2»; Block B G2-42 «The waitlist read is a method in ClientWantedSlotService». Transfer would need a read the owner does not have (`ClientWantedSlotService` has only a stub referral read, `add` and `matchAvailable`), new C7 measurement kinds rather than C9 keys, and a catalogue with no canonical model. Every transferred key reads an owner method that returns its data today. | Does R-01 admit a read still to be built inside an existing owner (and, for SC-21/22/24, a new C7 kind), or only reads that exist today? (a) Admit: the keys enter through a later version bump. (b) Only existing reads: the rows stay open or are re-dispositioned. |
| STOP-3 | **`catalog.staff.read:output/2`** (CAP-06, CAP-46) | Published: R-01 «добавить … set read-only C9 keys». Transfer would change an existing key: `catalog.staff.read` is an AI-tool catalogue entry whose output reaches the model, and version 2 would add `staff[].rating` (stripped today) and `salon.links`, which the handler does not read. | Does R-01 cover changing the output contract of an existing AI-tool catalogue key, so that staff rating and salon links become model-visible output? (a) Yes: an output version in a later version bump. (b) No: leave it to the Conversational CRM Control audit. |
| STOP-4 | **A5 as a whole** | Published: «A detail or i-class re-projection first evaluates the source capability's floor and Gate 6 authority for the live principal». Transfer would need Gate 13 to read a `detail` target's source capability while deciding that tap. A `NAVIGATE` to a `detail` target carries no capability on its record (§0.12 admits a `C9` ref only for class `c`), so the only record is the emitting envelope's `provenance.source_capability`, which is not `AUDIT_RETAINED`; its value would flow into the effect-routing gate deciding the same submission, and §0.4 F15's test fails that read. R3.9.4 reads the same field lawfully because it reads it at a refusal and seals the value at the minter into the remedy's own `AUDIT_RETAINED` `IntentRecord.capability`; A5 has no such member to seal into. A `detail` branch that only refused would disable the certified K16 detail route (FR-13), which A5 does not say. | (a) Approve an `AUDIT_RETAINED` source-capability member sealed at mint on the record of a `NAVIGATE` whose target class is `detail` (or that erasure class for `provenance.source_capability`); A5 then transfers whole. (b) Re-sign A5. |
| Q-1 | Step 5 G2 rows, not this version | A1 says the predicate split «comes back if R-01 registers a client-data refine». Nine F36a keys are `personal_data`, and R3.5.1 still forces a class-`s` `HANDOFF` for a `REFINE` on any of them. | Do `REFINE` and `DRAFT` on the client-data F36a keys get A1's treatment (the predicate split)? (a) Yes, for named keys; (b) no, they stay handoff-only. Blocks every successor that refines a client-data read in chat. |
| Q-2 | Step 5 G2 rows, not this version | No F36a key is a member of an owner class, so K20 lets them feed only `INHERITED` kinds (`CHOICE`, `FORM`) and `LIMITATION`. | Which F36a keys join which §2.4 owner classes? (a) Name the rows, carried by a later version bump; (b) none: `SCHEDULE`, `CLIENT_LIST`, `METRIC`, `REPORT` and `ARTIFACT` successors on these keys stay unbuilt. |

## D.5 Errata and engineering choices

- **Carried corrections:** 30 rows, each with its class, in C.5 (Part D.7). (a) is the text consequence of an approved item, (b) an agreement with a settled or certified citation, and (c) a correction strictly required to state an approved item under F1/F2.
- **Not carried:** the engineering choices of the packet that were not separately approved, 8 of the 18 errata-bundle bullets, AMB-21h's boolean half, and the three exclusions by the ruling itself. Each is in C.6 with where it stands.
- **Conformance flags carried forward:** SH-17 (certified ULID against built UUID) and R3.4.4 against the Version 1 row `owner_report.download`. Neither is fixed by this version.

## D.6 Tooling committed with the text

| id | File | Change |
|---|---|---|
| T-01 | `maya-saas-backend/scripts/widget-contract/emit-runtime-floor.mjs` | the section-0.8 marker is matched by pattern, so a moved contract line no longer throws |
| T-02 | `maya-saas-backend/scripts/widget-contract/derived-shapes.ts.tmpl` | synced to the hand-corrected `derived-shapes.ts`, so regeneration no longer reverts three shapes |
| T-04 | `maya-saas-backend/scripts/widget-contract/README.md` | the pipeline adds prettier and `emit-runtime-floor` with `--check` |
| T-05 | `maya-saas-backend/scripts/widget-contract/extract.mjs` | exits non-zero when a `ts` fence sits in an unmapped section |
| T-06 | `docs/rebuild/evidence/maya-chat-first-ux/contract-version-record-check.mjs` (new) | 14 assertions over Annex C and the body; check 14 for the R-04 door (counted beside the routes and never outside the programme, nine quoted limits, ten clauses, the ten-role allowlist, the contact match, (j) named in the preamble, FR-6a and G8); a failure ends in `FAIL` and exit 1 |
| T-07 | regenerated `maya-saas-backend/src/widget-contract/*.ts`, `src/widgets/authority/verification-floor.runtime.ts`, `k3-migrations-staged/*` | mechanical; the request shape `StaffMarketingRevokeRequest` joins `intent.ts`, as every `ts` declaration of the contract joins a generated module |
| T-08 | `maya-saas-backend/scripts/k3-gateway-check.mjs`; comments in `src/widgets/widgets.controller.ts` and `src/app.module.ts` | «the two widget routes», a figure the contract still states |
| T-09 | `docs/rebuild/evidence/maya-chat-first-ux/run-all-checks.sh` | every line's exit status decides, the gates and backend checks included; no checker is piped into `tail`; the version-record check is added |
| T-10 | `mapping-vs-contract-check.mjs`, `k1/k1-dossier-check.mjs`, `k1/build-ledgers.mjs`, `k1/k1-mechanism-gap-ledger.json` | the prerequisite pins become 34 (P-33 and P-34); the ledger is regenerated |
| T-11 | `docs/rebuild/evidence/maya-chat-first-ux/chat-first-final-acceptance-gate.sh` | the G8 label no longer says «Backend authority unchanged» without its two exceptions |

## D.7 The record itself (identical to Annex C of the contract)

# Annex C — Version record (v1 → v1.1)

`[NON-NORMATIVE]` **This annex is a record, not rule.** It lists the owner decisions this contract
version carries and, for each, the clauses of the body that now state it. It restates no rule: the
body is the only place a rule is stated, in its final form. A reader who wants to know what a rule
says reads the clause named here, never this annex.

**Version 1** is this file at commit `81bcc5ec`, SHA-256
`15c383f1d173ad7bc83b6b4df8138b06c96c4131452d5fe05549ed6d59aca4d3`.

**Source of the decisions.** The owner rulings recorded at checkpoint `ffbd684a` on the published
ruling packet `docs/rebuild/DECISION-SHEET-04-RULING-PACKET.md` (SHA-256 `ac0993e3943409ac16c936323fbd1f932addf577adbdf899fee6cf29251a3efd`).
Quoted text below is verbatim; the packet's `C:N` line citations refer to Version 1, not to this
version.

## C.1 Owner rulings

The owner's ruling text, verbatim:

DECISION SHEET 04 — OWNER RULINGS
R-01 — C9 capability registry
APPROVE: READS ONLY.
Contract V1.1 может добавить одним явно определённым set read-only C9 keys для уже существующих canonical business owners.
Не добавлять через R-01:

* CRM mutations;
* MONEY writes;
* новые business owners;
* generic CRM write;
* новые capabilities только ради увеличения G2.

Это решение не заменяет будущий Conversational CRM Control / YCLIENTS Full API Capability Audit.
R-02 — Master's appointment journal
APPROVE: OWN VISITS ONLY.
Обычный master видит только свои appointments/visits в пределах существующей authority.
Salon-wide journal/client names требуют отдельного права, которого роль master сама по себе не создаёт.
R-03 — Telegram command path
APPROVE: ONE INTERNAL BOT → BACKEND ROUTE.
Добавить в Contract V1.1 один typed internal ingress для Telegram command delivery.
Он:

* authenticated service-to-service;
* не является public widget route;
* не принимает direct business/provider commands;
* переводит command/message в тот же typed-intent/authority path Maya;
* не создаёт Telegram-specific business authority;
* не возрождает legacy bridge.

Telegram остаётся `DELIVERY / HANDOFF CHANNEL`.
R-04 — Marketing withdrawal
APPROVE recommended combined path:

1. ship canonical in-app marketing revoke surface;
2. добавить минимальный staff `REVOKE ONLY` bridge к существующему canonical consent owner для подтверждённых phone/e-mail requests.

Staff bridge может только отзывать marketing consent.
Он не может:

* выдавать consent;
* менять privacy consent;
* создавать второго consent owner;
* записывать consent в chat history/provider state.

Любой successful revoke должен закончиться canonical consent receipt.
До появления executable path текст не должен обещать уже выполненный revoke.
R-05
DEFER AS PROPOSED.
Android/TWA carrier определить непосредственно перед native cutover.
До этого:
`NATIVE/PWA: NOT PROVEN`.
BLOCK A
APPROVE ALL 13 READINGS AS PRESENTED IN DECISION-SHEET-04, при условии что они являются именно теми 13 readings, которые были challenge/refutation-checked и опубликованы в `DECISION-SHEET-04-RULING-PACKET.md`.
Зафиксировать их exact text/IDs в Contract V1.1 decision record.
В частности подтверждаю:

* booking remains in Maya chat; fullscreen не обязателен;
* Gate 10 получает необходимые durable audit fields;
* Gate 10 использует утверждённые router/same-owner/null-result semantics из packet;
* expired/stale tap получает утверждённый successor/handling;
* pre-sign-in browser refresh-token behavior исправляется согласно packet.

Если при переносе обнаружится, что какой-либо из 13 пунктов materially отличается от опубликованного packet — STOP только на этом пункте.
BLOCK B
APPROVE ALL 47 ONE-LINE READINGS AS PRESENTED IN DECISION-SHEET-04.
Не расширять их смысл при переносе в Contract V1.1.

| Ruling | Packet option it selects | Disposition in this version | Clauses that state it |
|---|---|---|---|
| R-01 | Option B «Reads only» (PACKET:71-75), limited by the ruling's own exclusions: existing canonical business owners only; no CRM mutation, money write, new business owner, generic CRM write or G2-only capability | TRANSFERRED — one enumerated set of fifteen read-only C9 keys, registered as one unit; every count of the registered set names 56 now and 71 once it registers. No existing key changes. The candidates that failed the ruling's limits, and the two owner questions its transfer raises for step 5, are listed in C.6 | preamble; §0.1 F3; §0.6 F19 (cardinality row), F21 (comment), F24; §0.7 F28 (totality and monotonicity sentences), F36 (register row), F36a; §0.8 F46, F51, F54; §0.16 FR-16; §0.17 F91 and its first row; §0.19 F95 item 27; §3.4 R3.4.3; §3.9 «Gate 6 in full» and its note; §3.15 INV-29; §3.16 item 7; §4.9.2 PR2; §A1.1 P-10; §A3 |
| R-02 | Option A «Actor-scoped» (PACKET:101-102) | TRANSFERRED — stated only in §0.7 F36a, which confines the one R-01 key that reads a master's appointments to the actor's own visits, within the role set the owner's own journal route admits; no clause creates a salon-wide journal or client-name right | §0.7 F36a fences 3 and 4 (`staff.journal.own.read`) |
| R-03 | Option A «One internal, read-only bot→Nest route … recorded as an amendment to P-01» (PACKET:126-129) | TRANSFERRED — one typed internal ingress, declared outside the widget layer and forwarded by no public edge, which hands a command or message to the typed-intent path; its build is its own prerequisite row, P-33; the widget routes and §3.8 are untouched | preamble; §0.7 (`MechanismGap` row range and count); §0.18 F92; §3.9 Step 0; §3.12 R3.12.7; §A1.1 heading, P-01 and P-33; §A1.7 (row count, P-29); §A5 |
| R-04 | The recommendation «(iii) as the permanent fix, with (i) as the bridge» (PACKET:172-173) | TRANSFERRED — the staff door, as the text consequence of the approved ruling (class (a)) and not as a new decision: «добавить минимальный staff `REVOKE ONLY` bridge к существующему canonical consent owner для подтверждённых phone/e-mail requests». It is counted as the one ingress beside the programme's three routes in the preamble, §A1.1 P-01 and the envelope's G8; it is not a widget route, and neither the widget gateway nor the Telegram ingress reaches it. Each limit of the ruling is one clause of §3.5 R3.5.5: marketing consent only and never privacy consent; revoke only, never a grant; only on a confirmed phone or e-mail request; provenance in the existing consent-fact columns and no second consent owner; nothing written to chat history or provider state; a canonical consent receipt for every successful revoke; and no fixed copy promising a revoke before the door is executable. The door needs one exception in the Action Engine, which today admits a consent write only from the client's own verified channel: a staff-revoke branch on the existing consent capability's actor policy and input contract, admissible only for a confirmed marketing revoke by a staff role. It is named in the preamble, FR-6a, R3.4.4 and the envelope's G8, and it adds no capability, registry field or actor-policy value. Two readings are disclosed: «staff» is the ten tenant staff roles of the governed staff role set, platform roles refused; and a request is «подтверждённый» when its phone number or e-mail address matches the contact the canonical record holds for that client in that channel, a contact that is never stored. The door's build is its own prerequisite row, P-34, in K14. Item 1, the in-app revoke surface, is owner decision D9-A's remediation lane: it changes no clause and stays bound by FR-6a, R3.4.4, CONSENT.1–CONSENT.6, §A1.6 (A1.6.2) and FR-12 | preamble; §0.7 (`MechanismGap` row range and count); §0.16 FR-6a; §0.18 F92; §3.4 R3.4.4; §3.5 R3.5.5; §A1.1 P-01; §A1.3 P-34; §A1.7 (row count, P-29); §A5 |
| R-05 | DEFER (PACKET:180-203; recommendation «do not ask now») | DEFERRED — `NATIVE/PWA: NOT PROVEN`; no clause changes | none |

## C.2 Block A — the thirteen readings as published

Packet lines 211–286, verbatim:

- **A1 [V1.1] Booking in chat (AMB-16, G2-02).** R3.5.1 and its copies (R3.3.3, INV-8′, the Gate 6 re-check) stop
  forcing a class-s HANDOFF for REFINE/DRAFT on BOOKING_OWNER's own keys `appointments.own.{create,reschedule,cancel}`.
  F48 SENSITIVE_DEST and FLOOR_EXEMPT are unchanged, so rule 5 stands and no floor moves. This restores ENV:133 K7,
  F78, SERVICE.1, SCHED.2 and BOOK.3. Whether clients.*/customers.*/loyalty.own.read refines get the same treatment
  (a predicate split) makes no difference this cycle; it comes back if R-01 registers a client-data refine.
- **A2 [V1.1] Amendment-packet members.** All are additive widget-layer columns under D12-B, folded into migration 2
  before first deploy (or ENV G8's migration count is amended):
  - AMB-13: an AUDIT_RETAINED `confirmation_subject` record member. Until it exists, every booking COMMIT refuses at
    Gate 7.
  - AMB-32: an all-AUDIT_RETAINED Gate 10 divergence audit member (tenant, widget, tapped/resolved token hash,
    resolved effect, code, time; no utterance).
  - AMB-43: an AUDIT_RETAINED approve|reject decision member, plus the R3.11.3/4 route-name errata. Unreachable
    this cycle.
  - AMB-49: C5 exempts PERMISSION masks: `next_intent_ref` null, `capability_gap_ref` null.
  - AMB-60: a HANDOFF «signed target» is a principal-bound `{route_key, opaque_handle}` signed with
    `ActionIdentityService.hmac` and returned in `resolved_widget`; the landing route re-validates authority.
  - AMB-63: `confirmation.idempotency_key` and `approval_policy` are AUDIT_RETAINED; `readback_text` is
    CONVERSATION_CONTENT and not stored in `confirmationJson`.
- **A3 Gate 10 under DS-02.**
  - (a) Router (AMB-29): one candidate matcher over the live intents that returns a token, escape aliases first,
    compared through `subjectCapability`. This is reading C, not the corpus in DS-02's retained build list.
  - (b) Canonical owner (AMB-30, K14-07): §2.4 OwnerClass membership through `ownerClassKeys`. An AE key takes its
    paired propose key's owner; a CONTROL key takes its F27 owner endpoint; unregistered or TOOL keys fail closed.
    Two keys have the same owner iff their owner sets intersect, so overlapping reads are audited and booking→settings
    is refused.
  - (c) Null (AMB-31, K14-08): null against an actuating record (CONTROL, DRAFT, REQUEST_APPROVAL, COMMIT) refuses;
    null against a pointer record is recorded and published as NULL; AGREE requires both sides non-null. A tap
    whose own lowered utterance does not resolve is a mint/build defect under R3.12.4, caught in CI.
- **A4 [V1.1 clarification] Expired or superseded tap (AMB-50).**
  - At Gate 1 EXPIRED/SUPERSEDED and Gate 5 `policy_floor_changed`, return a successor minted with no canonical
    read: the predecessor's frozen `text_equivalent` plus one REFINE remedy on the widget's own owner capability,
    with draft and flow position kept server-side.
  - It is issued only when the record binds the live principal and tenant; otherwise the code alone is returned.
  - The remedy tap passes Gates 1–13. L10's re-mint happens after Gate 6, and L10's mechanism sentence is
    clarified.
- **A5 Detail and NAVIGATE reads (AMB-47, SH-03).**
  - Detail is filled by a NAVIGATE(detail) submission through the gateway (Gate 13 → projector → `next_envelope`).
  - Class w returns the stored sealed envelope under FR4, with no re-projection.
  - A detail or i-class re-projection first evaluates the source capability's floor and Gate 6 authority for the
    live principal.
  - K16's `(widget_id, density)` describes that detail branch, not the `/widgets/resolve` request set.
- **A6 Credential at rest (SH-01).**
  - Before the G09 sign-in rows retire, only the refresh token (never the access token) is kept in `localStorage`.
    Only `net/session.ts` reads it, only to call `/auth/refresh`, and never to route before the server answers.
  - Memory-only stays the default during the dark window.
  - An httpOnly cookie is excluded by the topology: CORS runs with credentials false, the relay forwards no Cookie,
    and iOS runs on a `capacitor://` origin.
- **A7 Signed needed-but-absent static reads (G2-07, G2-29).**
  - Build the tenant broadcast template catalogue (S-419/420/421/516) as an authenticated, static, read-only
    catalogue that only pre-fills `b35.preview`.
  - Build the S-352 release-notes card with a working seen-state write and without the broken freed-slot promise.
  - Both READ keys go on R-01's list.
- **A8 S-241 owner brief (G2-06).** Amend the signed successor: drop the expandable list of client phones and keep
  alerts and summary. Reminders run only through `b35.preview` → APPROVAL → `b35.confirm`. C8 contracts forbid
  contacts, and S-499 keeps client phones out of conversation surfaces.
- **A9 Platform cost view S-044 (G2-05).** Measured AI and server cost stays on the legacy read-only GOD screen,
  an operator surface outside the tenant shell (B14 D2-A). No new platform owner; S-369 is not built. The screen is
  dormant behind the maintenance page today.
- **A10 Kept fullscreen surfaces (G2-03).**
  - No new route class.
  - A kept surface nests in a base route only where D2 or ENV Part 4 already put it: credentials and channels in
    connections, devices and mutes in notifications, consent in privacy.
  - Everything else stays NOT RETIRED outside the served shell: S-200, S-496's role grant, S-499, S-044, the
    editors and the inbox.
  - Accept that ENV G9 («rows without fullscreen_intent 0 of 76») stays red for the vetoed rows.
- **A11 K12 builds staff Telegram unbind and history erasure (G2-38, G2-39; corrects K14-12).**
  - This is approved K12 scope (SPG:68) and gate G4 («owner: NONE = 0 of 8»).
  - Erasure is a class-s HANDOFF to privacy-and-data at SESSION_VERIFIED.
  - Unbind is built in the canonical identity owner: self-service at connections, offboarding on the owner's
    staff-access surface, and each unbind rotates `principal_proof_hash`.
- **A12 Onboarding voice (G2-04).** No new transcription route. Pre-tenant onboarding voice stays on the existing
  relay as G07 signs it (K1DOS:355, :363), with the transcript fed into the typed path. Voice is off by default,
  refused during the contact step, and fenced until S-745 lands.
- **A13 K14 exit evidence (K14-06).** K14's parity proof is minted HANDOFF-only IntentRecords with receipts on the
  live path. The CI ledger and AuditLog are shadow evidence only, and no CONTROL or callback tokens are used.
  Waits on R-03.

| ID | Disposition in this version | Clauses that state it |
|---|---|---|
| A1 | TRANSFERRED | §0.17 first row (the Gate 6 re-check sentence); §3.3 R3.3.3; §3.5 `BOOKING_OWNER_KEYS`, `BOOKING_OWNER_PROPOSAL`, R3.5.1; §3.15 INV-8′ |
| A2 | TRANSFERRED — AMB-13, AMB-32, AMB-43 (with the R3.11.3/R3.11.4 route-name errata), AMB-49, AMB-60, AMB-63; the columns fold into migration 2 before its first deploy | §0.4 F16; §1.3 C5; §2.6.5 BOOK.1; §3.5 R3.5.3; §3.7 `IntentRecord`, R3.7.5; §3.8 R3.8.5; §3.9 Gate 13 row, «Gate 10 in full» (`DivergenceAuditRecord`); §3.11 R3.11.2, R3.11.3, R3.11.4; §4.4.1; §4.4.3; §A1.7 P-30; §A2 (A2.3) |
| A3 | TRANSFERRED — under owner decision DS-02 (Decision Sheet 02, answered 2026-09-16) | §0.4 F15 (Gate 10 as the one reader of the lowered utterance); §0.21 residual 7; §3.9 Gate 10 row and «Gate 10 in full»; §3.12 R3.12.4; §3.16 item 5; §A1.5 P-20 |
| A4 | TRANSFERRED — with three fail-closed conditions the certified text forces: the code alone is also returned when the tapped kind does not permit `REFINE` (`APPROVAL`, `LIMITATION`, `SOURCE_STATUS`, `CONSENT_STATE`, `IDENTITY_BINDING`, `ARTIFACT`), when no owner capability of the kind matches, and when the stored predecessor or its `text_equivalent` cannot be read | §0.8 F52; §1.8 K10; §3.4 R3.4.2; §3.9 Gate 1 and Gate 5 rows, R3.9.4; §4.1.2 L8; §4.1.3 L10 |
| A5 | STOPPED (C.6) — the item as a whole; stating its `detail` half needs a decision the published item does not carry, and no clause changes | none |
| A6 | RECORDED — the contract governs renderer modules only (P-19); credential storage in `net/session.ts` is shell-plan and K15 evaluator scope | none |
| A7 | STOPPED (C.6) — the item as a whole; no bullet is recorded as an approved build, and no clause changes | none |
| A8 | RECORDED — amends the signed S-241 successor; the contract names neither S-241 nor a call list | none |
| A9 | RECORDED — re-records S-044 and S-369; no route, key, owner class or shell destination is added | none |
| A10 | RECORDED — `IntentTarget` classes and `ShellRoute` are already closed; ENV G9 stays red for the vetoed rows by owner acceptance | none |
| A11 | RECORDED — approved K12 scope inside existing canonical owners; GAP-IDENTITY-STAFF-UNBIND/GAP-HISTORY-ERASE routing and the K3/K4 proof-hash mechanism already hold | none |
| A12 | RECORDED — §4.7 V1, V6 and V7 already hold; onboarding is pre-auth, outside the gateway | none |
| A13 | RECORDED — K14 exit evidence is envelope scope; the envelope's K14 parity proof now reads `subjectCapability(record)`, and R3.12.7 carries a non-normative pointer | §3.12 R3.12.7 (non-normative note) |

## C.3 Block B — the forty-seven readings as published

Packet lines 290–355, verbatim (forty-seven top-level bullets):

**Gates**
- **AMB-01a** · NORMATIVE-PENDING refuses clause by clause: an unbuilt clause refuses only the cases it governs, and built clauses evaluate.
- **AMB-03, AMB-04** · The live role comes from the Membership read inside the request transaction (FOR SHARE, `m.id === authority.membershipId`).
  - presentation_mode: client for CLIENT_CHANNEL, client or customer; owner for tenant_owner or business_owner; staff for any other role.
  - F88.1's ban on reading `role` covers the presentation role only.
- **AMB-05** · Every widget submission gives `assertCanExecute` the surface `'web'`. `staff.schedule.update`, which is native-only, is reached through a HANDOFF.
- **AMB-06** · Gate 6's Action Engine pre-screen evaluates §3.9's five conditions directly; `preview()` is used inside the approval owner at Gate 13.
- **AMB-07** · For approval decisions, Gate 6 (d) applies as written; R3.11.6's approver test at EP-CANONICAL governs.
- **AMB-09** · A reader of `handoff_capability_ref` means direct member access; `subjectCapability` is that reader.
- **Escape (SH-05, AMB-11, AMB-62)**
  - On pwa, a server-matched «отмена/стоп/хватит» returns a dismiss outcome `{widget_id}` with no model call, token or submission, and the shell dismisses locally.
  - On restricted tiers the tokened `control.widget.dismiss` is admitted, including ANNOUNCEMENT; tier cells are allowlists.
  - Dismiss changes delivery state only; a draft ends at its TTL.
- **AMB-15** · Gate 7's withdrawn-row sentence is a re-read duty; Gate 5 refuses first.
- **AMB-17** · Closed-domain membership is checked per field, and `selection_domain` is keyed by field. The labels member is `selectionDomainLabelsJson` (C).
- **AMB-18** · An erased or absent stored schema gives SUPERSEDED/handle_stale with no write; a hash failure is an integrity fault.
- **AMB-20** · Selections are sets: duplicates refuse, required governs presence, and min/max apply to a present value.
- **AMB-21a** · Gate 8 re-reads `bounds_source` and refuses with `bound_violation`; `bound_ref` is a display echo.
- **AMB-21e** · A boolean is a closed two-member domain, so Gate 8 checks its type only.
- **AMB-21f** · `text.max_len` is enforced with `bound_violation`; c9SafeText keeps its own default.
- **AMB-24** · Envelopes with `client_identified` get no label interpolation (slot-less templates).
- **AMB-25** · A degrade-to-text answer is the composer's deterministic text, stored as an assistant timeline turn; model reads pass the anonymiser.
- **AMB-27** · `requires_readback` is recomputed at ingress from `record.effect` and the delivery tier; body_hash integrity is the H4 seal.
- **AMB-36** · Gate 11 outcomes:
  - not_found, already_cancelled, slot taken or stale revision → SUPERSEDED.
  - Policy fences pass through to Gates 13/14.
  - Transport errors are faults, not verdicts.
- **AMB-37** · F15's «exactly seven» limits only the noun resolver's record-field inputs.
- **AMB-38** · Body `*_ref` members are envelope-scoped opaque refs, not record handles.
- **AMB-39** · RT3(b) scopes canonical owners' paths; the widget path fails closed when the timeline store cannot be read.
- **AMB-40** · There is no fourth holder of the seal key: «the gateway mints» means the gateway causes minter (2) to mint.
- **AMB-41** · The Gate 11 diff uses AUDIT_RETAINED facts plus fresh owner values. The successor is a same-kind confirmation if the nouns still resolve, otherwise the amend selector.
- **AMB-42** · A successor carries its predecessor's `delivery_channel`.
- **AMB-44** · The fresh noun read happens at Gate 11.
- **AMB-46** · In F15, «reaches» means value flow; the approval gate is Gate 11.
- **AMB-52** · `allowedKinds` is the inverse of `ownerClassKeys`; a REFINE successor keeps the tapped kind unless a kind clause names another.
- **AMB-53** · FR-1 is read together with row 13: canonical writes go through the Action Engine ingress, and other edges go only to row-13 owners, enumerated by the import test.
- **AMB-56** · The receipt CHECK is unchanged: EXPIRED/SUPERSEDED are response outcomes; an Action Engine UNKNOWN is receipted as ACCEPTED and its ref is set on reconciliation.
- **AMB-57** · The `control.run.cancel` handler delegates to the C9 owner endpoint's service.
- **AMB-59** · The FORM.2/SETTINGS.1 allowlist is indexed by the Action Engine key the draft owner names, via AE_PROPOSE_PAIRING.

**Shell**
- **SH-04, G2-14 · sign-in**
  - Sign-in is the signed-out state of the root screen: not a route, not in nav, not in shell.account, and no hand-off to a legacy login page.
  - Social sign-in uses the canonical Yandex/Telegram OAuth with PKCE.
  - VK is never added, and the legacy VK branch stays until G09's evidence is in.
  - No production login flag is flipped.
- **SH-06** · An `approval_required` reply shows the server's text plus a neutral «pending» notice kept outside history, with no control, link or route. Suggested copy: «Действие ждёт подтверждения; подтвердить его здесь пока нельзя.»
- **SH-07** · `stripIntentToken` removes only `intent_token`. body_hash is checked in a stage before drawing, and the drawing module gets a token-free view plus the verdict.

**K14**
- **K14-02** · Delete the `/unsubscribe` sentence in `privacy_policy.py:17` in a separate, undeployed commit; the exact bytes follow R-04.
- **K14-20** · `consent_gate` sits alone in the lowest handler group (for example −10) under a ratchet; `site_publication_bot` must register after it.
- **K14-21** · K14 covers every door: slash commands, reply-keyboard text, admin NLU, and every admin callback prefix including `bcast_*` and `broadcast_send`.

**G2**
- **G2-12** · The referral card shows counters and programme status only: no personal code or link, no copy/share.
- **G2-18** · AI onboarding is a pre-auth mount over the existing `@Public` draft routes, outside the widget gateway. Logo upload is a LIMITATION under GAP-TENANT-ADMIN.
- **G2-19** · The trial form honours SELF_SERVE_TRIAL_SIGNUP and shows its 403 legibly with a contact path. `/maya-start.html` stays until the release decision is recorded.
- **G2-24** · The owner-initiated A16 grant satisfies S-435; no two-party request/approve flow is built.
- **G2-27** · Client channel linking lands on connections; the in-chat status is a LIMITATION under GAP-IDENTITY-READ.
- **G2-37** · The live-demo CTA goes to the pre-auth Maya entry, carrying its origin; there is no anonymous demo conversation.
- **G2-41** · The loyalty-spend and repeat-booking offers are recorded as explicit drops, because the moment set is closed at 12.
- **G2-42** · The waitlist read is a method in ClientWantedSlotService. Its roles translate the legacy `permissions.analytics`; it is read-only and PII-fenced.
- **G2-44** · The privacy fence lives in `C9Authority.current` and `realtimeAuthority`. Blocking is on privacy only; marketing is an independent fact.
- **G2-46** · A feedback-request key, if R-01 admits it, is a catalogue PROPOSE_ONLY key confirmed per request.

| # | ID as published | Clauses that state it |
|---|---|---|
| B-01 | AMB-01a | none |
| B-02 | AMB-03, AMB-04 | §0.5 F18 (three presentation modes); §0.15 F88.1 and F88.2 (the `role` ban's presentation-role scope) |
| B-03 | AMB-05 | none |
| B-04 | AMB-06 | §0.16 FR-3 (Gate 6's evaluation point) |
| B-05 | AMB-07 | none |
| B-06 | AMB-09 | §A1.5 P-20 (`subjectCapability(record)`) |
| B-07 | Escape (SH-05, AMB-11, AMB-62) | §3.12 R3.12.1; §3.15 INV-26; §4.5.3 tier table, CH1, CH2 |
| B-08 | AMB-15 | none |
| B-09 | AMB-17 | §3.7 `IntentRecord.selection_domain_labels`; §4.4.3 |
| B-10 | AMB-18 | none |
| B-11 | AMB-20 | none |
| B-12 | AMB-21a | none |
| B-13 | AMB-21e | none |
| B-14 | AMB-21f | none |
| B-15 | AMB-24 | none |
| B-16 | AMB-25 | none |
| B-17 | AMB-27 | none |
| B-18 | AMB-36 | none |
| B-19 | AMB-37 | none |
| B-20 | AMB-38 | none |
| B-21 | AMB-39 | none |
| B-22 | AMB-40 | none |
| B-23 | AMB-41 | none |
| B-24 | AMB-42 | none |
| B-25 | AMB-44 | none |
| B-26 | AMB-46 | §0.4 F15 (its mechanism) |
| B-27 | AMB-52 | §2.4 `allowedKinds` (the first sentence; the second changes no clause) |
| B-28 | AMB-53 | none |
| B-29 | AMB-56 | §4.1.2 L8 (its mechanism) |
| B-30 | AMB-57 | none |
| B-31 | AMB-59 | none |
| B-32 | SH-04, G2-14 · sign-in | none |
| B-33 | SH-06 | none |
| B-34 | SH-07 | none |
| B-35 | K14-02 | none |
| B-36 | K14-20 | none |
| B-37 | K14-21 | §3.12 R3.12.7 (its `door` member) |
| B-38 | G2-12 | §0.7 F36a (`referrals.own.read`: counters only) |
| B-39 | G2-18 | none |
| B-40 | G2-19 | none |
| B-41 | G2-24 | none |
| B-42 | G2-27 | none |
| B-43 | G2-37 | none |
| B-44 | G2-41 | none |
| B-45 | G2-42 | none — no waitlist key is registered (C.6, the read still to be built) |
| B-46 | G2-44 | none |
| B-47 | G2-46 | none — inoperative: ruling R-01 admits read keys only, so no PROPOSE_ONLY key is admitted |

A reading whose last cell is «none» changes no clause of this version.

## C.4 The R-01 read set

Ruling R-01 is carried by exactly these keys, each over an owner that already exists. The keys, their
owners, reads, policy rows and baselines are stated in §0.7 F36a and nowhere else.

| key | packet candidate | owner |
|---|---|---|
| `billing.subscription.read` | CAP-07 | `BillingService` |
| `tenant.status.read` | CAP-08 | `AdminService` |
| `crm.providers.catalog.read` | CAP-16 | `crm-provider-catalog` |
| `staff.journal.own.read` | CAP-18 | `CrmService` |
| `team.feed.read` | CAP-19 (feed) | `TeamCommunicationsService` |
| `calendar.internal.setup.read` | CAP-20 | `InternalCalendarService` |
| `customers.list.read` | CAP-23 | `CustomersService` |
| `tenant.client-invite.read` | CAP-26 | `TenantPwaService` |
| `inbox.items.read` | CAP-28 (read) | `InboxService` |
| `native_feedback.management.read` | CAP-32 | `NativeFeedbackService` |
| `commerce.memberships.own.read` | CAP-43 | `ClientChannelRuntimeService` |
| `referrals.own.read` | CAP-44 | `ClientChannelRuntimeService` |
| `loyalty.own.transactions.read` | CAP-45 | `LoyaltyService` |
| `owner_report.list` | CAP-49 | `OwnerReportRun` |
| `owner_report.snapshot` | CAP-49 | `OwnerReportRun` |

## C.5 Text corrections carried because an approved item requires them

| Correction | Required by | Test it meets | Clauses |
|---|---|---|---|
| AMB-03: F18's «four» modes becomes three | Block B AMB-03/AMB-04 | (b) agreement with the certified `presentation_mode` union | §0.5 F18 |
| AMB-10, K14-13: R3.2.2 and the F74 prose admit an AE destination in `handoff_capability_ref` | settled AMB-10/K14-13 | (b) agreement with §0.12 F69 | §0.13 F74 prose; §3.2 R3.2.2 |
| AMB-12: PAY.4 derives `commit_allowed` from `permitted_effects` alone | certified §0.9 F57 and §2.4 K11 | (b) agreement with certified text of this contract | §2.6.20 PAY.4 |
| AMB-14: `lifecycle.delivery_channel` classified `AUDIT_RETAINED` | settled AMB-14; Block B AMB-42 | (b) agreement with the approved envelope and RT5 | §4.4.3 (timeline turn) |
| AMB-17: the labels member `selection_domain_labels` (column `selectionDomainLabelsJson`) | Block B AMB-17 | (a) text consequence | §3.7; §4.4.3 |
| AMB-21h: the `inputs[k]` rows name the field kind `text` and drop the sensitivity clause | certified `InputField` and §3.6 R3.6.5 | (b) agreement with certified text; the boolean half is not carried (C.6) | §4.4.3 |
| AMB-45: R3.10.5 points to R3.11.3 | certified §3.11 R3.11.3 | (b) a cross-reference made to agree with certified text | §3.10 R3.10.5 |
| AMB-52: declare `allowedKinds` | Block B AMB-52 (first sentence) | (a) and (c) — named at §1.1.1 and never declared (F2) | §2.4 |
| AMB-55: FR2 reads the intent-audit store | settled AMB-55 | (b) agreement with the approved envelope and RT1 | §4.2 FR2 |
| A4: L10's mechanism sentence | Block A A4 | (a) part of the approved reading | §4.1.3 L10 |
| AMB-43: the R3.11.3/R3.11.4 route names | Block A A2 | (a) part of the approved reading; agrees with §0.15 F85 | §3.11 R3.11.3, R3.11.4 |
| HYG-02: cite DS-02; P-20 reads `subjectCapability(record)` | Block A A3; DS-02 answered; Block B AMB-09 | (b) and (a) | §0.21 residual 7; §3.16 item 5; §A1.5 P-20 |
| R3.4.4 agreement: the nine `personal_data` rows of F36a carry `min_verification: SESSION_VERIFIED` | ruling R-01 | (b) agreement with certified §3.4 R3.4.4; effective floors unchanged | §0.7 F36a |
| Counts and scope that R-01 would otherwise make false: every count of the registered set names 56 now and 71 once F36a registers; the Gate 6 dispatch comment; §3.16 item 7; the hash sentences of PR2 and F95 item 27 | ruling R-01 | (c) statable without a false sentence | §0.6 F19, F21, F24; §0.7 F28; §0.8 F46, F51, F54; §0.19 F95 item 27; §3.4 R3.4.3; §3.9 «Gate 6 in full»; §3.15 INV-29; §3.16 item 7; §4.9.2 PR2; §A1.1 P-10; §A3 |
| A key new to the policy table is an admission, not a lowering, only when it is an F36a key | ruling R-01 | (c) the monotonicity test is otherwise undefined for the set | §0.7 F28 |
| F88.1's and F88.2's ban on reading `role` covers the presentation role on the widget layer's shapes | Block B AMB-03/AMB-04 | (a) text consequence | §0.15 F88.1, F88.2 |
| Gate 6's pre-screen evaluates its five conditions directly | Block B AMB-06 (first half) | (a) text consequence | §0.16 FR-3 |
| Restricted tiers, `ANNOUNCEMENT` included, admit the tokened escape; tier cells are allowlists | Block B Escape (SH-05, AMB-11, AMB-62) | (a) text consequence | §3.12 R3.12.1; §3.15 INV-26; §4.5.3 tier table, CH1, CH2 |
| `EXPIRED` is a response outcome, not a receipt outcome | Block B AMB-56 (first half) | (a) text consequence | §4.1.2 L8 |
| F15's test reads «reaches» as value flow into Gate 11, the effect-routing gate, canonical ingress and owner routes; Gate 10 is the one reader of the lowered utterance after Gate 9 | Block B AMB-46; Block A A3 | (a) for AMB-46; (c) for A3, whose Gate 10 reads the lowered utterance | §0.4 F15; §3.9 «Gate 10 in full» |
| `resolved_widget` is declared, as `HandoffAnswer`, closed at `HandoffTarget`'s two members | Block A A2 (AMB-60) | (c) named by the approved item and declared nowhere (F2) | §3.8 R3.8.5 |
| The Telegram ingress has its own prerequisite row, P-33 | ruling R-03 | (c) one build status per row (F92) | §0.7 (`MechanismGap`); §0.18 F92; §A1.1 P-01, P-33; §A1.7; §A5 |
| The R-04 door is counted: the programme keeps its three routes, and the preamble, §A1.1 P-01, the envelope's G8 and K14 rows and the mapping's P-01, K3 and K14 rows name the one further ingress, counted beside them, and its revoke-only staff authority | ruling R-04 | (a) text consequence of the approved door | preamble; §A1.1 P-01; envelope G8 and K14, mapping P-01, K3, K14 and its Web Interaction Contract section (not this contract) |
| The R-04 door has its own prerequisite row, P-34, in K14 | ruling R-04 | (c) one build status per row (F92); K14, because the packet groups R-04 with K14 and every item R-04 unblocks is K14 copy | §0.7 (`MechanismGap`); §0.18 F92; §A1.3 P-34; §A1.7; §A5 |
| The envelope's K14 parity proof reads `subjectCapability(record)` | Block A A13 | (b) a HANDOFF-only record has `capability: null` | envelope K14 (not this contract) |
| The Action Engine exception the R-04 door needs is named where the engine fence is stated: one staff-revoke branch on the consent capability's actor policy and input contract | ruling R-04 | (a) text consequence of the approved door: the capability admits no staff actor today | preamble; §0.16 FR-6a; §3.4 R3.4.4; §3.5 R3.5.5; envelope G8 and K14, mapping K14 (not this contract) |
| The prerequisite-ledger range names P-33 and P-34 outside the contract as well | rulings R-03 and R-04 | (c) one build status per row (F92) | envelope `WidgetMechanismGap`, mapping P-29 (not this contract) |
| The count of the registered set in §A1.6 (A1.6.2) names 71 once F36a registers, and each package's «`C9_REGISTRY_HASH` unchanged» figure is scoped to F36a, whose registration no package owns | ruling R-01 | (c) statable without a false sentence | §A1.6 (A1.6.2); envelope K2, K10, K11 and the C9 flow, mapping K3, K10, K11 and its prerequisite register (not this contract) |
| The mapping's P-20 row and paragraph cite DS-02, and its K14 exit reads `subjectCapability(record)` | Block A A3 and A13; DS-02 answered | (b) agreement with the contract's P-20 and with the envelope | mapping P-20 and K14 (not this contract) |
| R3.9.4 notes why its read of the predecessor's source capability meets F15: the value is sealed at the minter into the remedy's own `AUDIT_RETAINED` record | Block A A4 | (c) the approved successor stated without contradicting §0.4 F15 | §3.9 R3.9.4 (non-normative note) |

## C.6 Not carried by this version

**Stopped on transfer — an owner decision is needed, and nothing below is stated in the body.**

| Item | Why it is not in the body | The decision it needs |
|---|---|---|
| A7 (the whole item) | Its second bullet's release-notes key needs a canonical owner that does not exist, which R-01 excludes, and «a working seen-state write» is a persisted per-principal write, which R-01 (reads only) cannot carry and `control.widget.dismiss` (delivery state on one emission, Block B Escape) does not provide. Its first bullet's catalogue exists only in legacy Python, so its key is a read still to be built (next row). The owner stops a materially different item as a whole, so no bullet is recorded as an approved build. | Owner decision: for the release-notes card, (i) name a canonical owner for tenant release notes and authorise a persisted seen-state write, (ii) re-sign S-352 as an on-request card whose «seen» is only the per-emission dismiss, or (iii) record S-352 as withdrawn from chat parity; for the template catalogue, the question of the next row. |
| R-01 candidates CAP-47, SC-21, SC-22 (summary) and SC-24, and A7's template-catalogue key | The canonical business owner exists, but the read does not exist in it today: `ClientWantedSlotService` has no read method (Block B G2-42 fixes where one goes), the summaries would be new C7 kinds rather than C9 keys, and A7's catalogue lives only in legacy Python. Every key this version transfers reads an owner method that returns its data today; what F36a adds to those reads (a role assertion inside the owner read, the actor pinning R-02 orders) narrows an existing read and builds no new one. Whether R-01 also admits a read still to be built inside an existing owner is a reading of the ruling this version does not make. | Owner decision: does R-01 admit a read to be built inside an existing owner (and, for SC-21/22/24, a new C7 kind), or only reads that exist today? If admitted, the keys join a later version bump. |
| CAP-06 and CAP-46: an output version 2 of `catalog.staff.read` | R-01 admits adding a set of read-only C9 keys; this would change an existing key. `catalog.staff.read` is an AI-tool catalogue entry whose output reaches the model, and version 2 would add staff ratings and salon links its handler does not read today. | Owner decision: does R-01 cover changing the output contract of an existing AI-tool catalogue key, adding staff rating and salon links to model-visible output? |
| A5 (the whole item) | Its third bullet has Gate 13 evaluate a `detail` target's source capability for the live principal. A `NAVIGATE` to a `detail` target carries no capability on its `IntentRecord` (the key-space rule of §0.12 admits a `C9` ref only for class `c`), so the only record Gate 13 could read while deciding that tap is the emitting envelope's `provenance.source_capability` in the timeline store, which is not `AUDIT_RETAINED`; the read's value would flow into the effect-routing gate deciding that same submission, and §0.4 F15's test fails it. §3.9 R3.9.4 reads the same field without that defect: it reads it at a refusal, the refused submission reaches no later gate, and the value is sealed at the minter into the remedy's own `AUDIT_RETAINED` `IntentRecord.capability`, which is all the remedy's tap reads. A5 has no such member to seal into. Stating the bullet needs an `AUDIT_RETAINED` source-capability member on the record of a `NAVIGATE` whose target class is `detail`, which A2 does not enumerate, or that erasure class for the envelope field; a `detail` branch that only refused would disable the certified K16 detail route, which A5 does not say. | Owner decision: approve an `AUDIT_RETAINED` source-capability member, sealed at mint on the record of a `NAVIGATE` whose target class is `detail` (or that erasure class for the envelope's `provenance.source_capability`), or re-sign A5; A5 then transfers whole in a later version bump. |

**Owner questions this version's transfer raises for step 5.** Neither blocks this version; each blocks
the G2 rows named.

| Question | Why it arises | Rows it blocks |
|---|---|---|
| Do `REFINE` and `DRAFT` on the client-data keys of §0.7 F36a get A1's treatment (the predicate split)? | A1 says the split «comes back if R-01 registers a client-data refine». Nine F36a keys are `personal_data`, and §3.5 R3.5.1 still forces a class-`s` `HANDOFF` for a `REFINE` on any of them. | every successor that refines a client-data read in chat |
| Which F36a keys join which §2.4 owner classes? | No F36a key is a member of an owner class, so they feed only `INHERITED` kinds and `LIMITATION`. `SCHEDULE`, `CLIENT_LIST`, `METRIC`, `REPORT` and `ARTIFACT` successors on these keys need owner-class rows the ruling does not state. | the successors of those kinds on F36a keys |

**Excluded by the ruling itself.**

| Item | Why |
|---|---|
| SC-30 (master tips) | no owner exists; tips are F81 finance data under GAP-TIPS; R-01 forbids new business owners |
| G2-46 feedback-request key | a PROPOSE_ONLY key; R-01 is reads only |
| Write halves of CAP-19 (send, withdraw, attachments) and CAP-28 (`markRead`) | writes; R-01 is reads only |

**Engineering choices and errata of the packet that were not separately approved.** None is stated in
the body; each stays implementable only where the body already permits it.

| Item | Why it is not in the body | Where it stands |
|---|---|---|
| AMB-02a, AMB-02b | packet engineering choices; rows 7 and 8 already name the codes | implementable now |
| AMB-02c, AMB-19, AMB-21c, AMB-21d, AMB-21g, AMB-23, AMB-26c, AMB-26d, AMB-28, AMB-33, AMB-34, AMB-35, AMB-54, AMB-58, AMB-61 | packet engineering choices, not approved; none is needed to state an approved item | implementable where the certified text already permits |
| AMB-48 | packet engineering choice that names «the V1.1 text»; not approved and not needed by any approved item | not stated; the minter still never re-decides PII (F95) |
| A1 follow-up | code alignment of the live Gate 6 name-based `sensitiveDest`; certified «Gate 6 in full» already confines `SENSITIVE_DEST` to the HANDOFF branch | required for A1 to be observable on the live path; step 2 |
| A4 follow-up | equal-latency refusal is already binding at ENV K3 and G13 | implementation constraint on R3.9.4 |
| SH-08, SH-18 | the `/widgets/resolve` wire shape; no transferred item needs it, and SH-08's first bullet contradicts A5 bullet 4 | implementable without contract text; must drop the `(widget_id, density)` request bullet |
| SH-16 | EP-MINT collation rule; no approved item | locale pinning is deployment configuration |
| SH-17 | choice between two settled sources (certified ULID vs frozen D12 UUID) | CONFORMANCE FLAG: built K3 code uses UUID; certified text says ULID |
| SH-19 | `/ai/chat` resolution member; not a contract route | implementable |
| SH-20, SH-21 | shell sign-in and build-defect choices | shell plan |
| SH-22 | declaring `IntentReceipt` adds a declaration rather than agreeing with an existing clause, and no approved item needs it | pre-existing F2 residual: named at §4.2 and §4.4.3, declared nowhere |
| SH-23 | narrowing `DetailRouteKey` adds a restriction rather than agreeing with an existing clause, and no approved item needs it | the shell registry holds the nine keys |
| AMB-01c | a `//` comment choice between two options, not an agreement with an existing clause; F5 and §A2 already require the gap key | implementable now |
| AMB-51 | enumerating the five PII points adds content F95 downgraded; native scope under R-05 | not stated |
| K14-04, K14-14, K14-16 | K14 bot engineering | K14 plan |
| K14-17 | the variable name, «env-only» and the :8080 bind check; R3.12.7 (a) states the route's own credential and (b) the committed-edge test without them | engineering after R-03; the live bind check needs production permission |
| The ingress path (K14 plan K-g) | a path choice; R3.12.7 fences the route without naming it | K14 plan; the path must satisfy R3.12.7 (b) and (f) |
| AMB-21h, the boolean half | a retention class for a boolean answer: Block B AMB-21e concerns Gate 8's check only, and §0.4 F16 classifies a data subject's affirmation as `CONVERSATION_CONTENT` | not stated; booleans and scalars stay unclassified until an owner or privacy decision. The Wave-4 journal-date ruling below is the sole typed scalar exception and does not classify generic scalars. |

### Wave 4 owner ruling — retained journal local-business date

`operations.journal.read` may retain exactly one replayable query scalar:

```yaml
type: local_business_date
value: YYYY-MM-DD
provenance: server_validated
```

The value is parsed, calendar-validated and canonicalised by the server before mint. It is stored on
the exact journal `REFINE` intent record, erased with conversation/canonical-copy content, and is
usable only while that intent is live. It is not a noun, identity, authority, consent or business
fact. It cannot satisfy any such input. Every replay performs a fresh canonical owner read, and the
owner re-evaluates tenant, principal, current entitlements, capability availability and its own
business-timezone interpretation. Retaining the date retains no permission.

No generic retained-scalar input is introduced. A row other than
`C9:operations.journal.read`, or a record whose effect is not `REFINE`, must store `NULL` and is
rejected by the database if it attempts otherwise. The projector passes the validated value as the
owner's `date` argument and may neither reinterpret it nor calculate business facts from it.
| G2-15, G2-17 | pre-auth credential and trial forms | shell and G2 plan |
| G2-36 (SC-17) | master-scoped client list with a chat key «through R-01»; not in the ruling's set | not registered |
