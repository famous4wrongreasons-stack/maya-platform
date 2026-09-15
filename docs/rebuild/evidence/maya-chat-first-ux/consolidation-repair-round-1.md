# Consolidation repair — round 1

`[EVIDENCE]` What the first certification of the consolidated body found, and what was changed
in the canonical body in response. **No new errata layer was created.** Every repair below is an
edit to the rule itself, at the one place the rule now lives.

## The finding, in one sentence

All four lenses returned `CERTIFIABLE: NO` for the same reason: **the fold did not finish.**
§§0, 1 and 4 were folded cleanly; **§2, §3.10.1 and Annex A were not.** Three corrections that
Annex B records as already VOID were never applied to the §2/§3 text that carried them, and
nineteen declarations remained duplicated — five of them already drifted apart.

The authority spine itself passed every check, on all four lenses independently:

| checked | result |
|---|---|
| floor reductions | exactly **2**, both in §0.17, no third clause creating one — 4/4 lenses |
| §2.6.7 `CLIENT.2` (`pii_ceiling: 'client_identified'`) | intact, unrenumbered — 4/4 |
| §2.6.22 `ARTIFACT.3` (`contains_pii`) | intact, unrenumbered — 4/4 |
| Gate 5 recomputes `verificationFloor` from an `IntentRecord` | yes — 4/4 |
| Gate 6 dispatches on `subjectCapability`, scoped by effect | yes — 4/4 |
| every §0 cardinality against the executed registries | 226 / 221 / 47 / 56 — exact, 4/4 |

Counts filed: **38 structural, 3 security-contract, 7 unproven** (overlapping across lenses).

## What was repaired

### A — three corrections the fold never applied

| # | Was | Now |
|---|---|---|
| R1 | §3.10.1 allowlisted `crm.appointment.{attendance,duration,services,fields}.v1` with `BOOKING_CONFIRMATION` | gap-ledgered under `GAP-APPOINTMENT-DETAIL-COMMIT`, matching §0.7 F34/F37. **This was also a security-contract violation** (FR-6b, FR-3): all four are registered `ALLOW` with `targetKind: 'appointment'`, carry the permissive twelve-role default, and three carry no `clientPrincipalTarget` — an allowlist row would have put a tenant-wide appointment mutation behind a client-role button. It was additionally an **unsatisfiable assertion set**: F35 requires `row XOR gap` and F31 requires every row to be the `ae` side of a pairing, and no propose key exists for these four, so the process could never have started. |
| R1b | "Seven of the thirteen are `ALLOW`" read as the allowlist's membership | seven carry `policyDecision: ALLOW`; **three are allowlisted**, which is F34's declared membership. A registry disposition and this contract's own fence are not the same set. |
| R2/R2b/R31 | §2.6.16's `draft_class` carried seven members including `'expense'` and `'loyalty_adjustment'`; §2.4 row 16 listed `expenses.create` and `loyalty.internal.adjust` as `SETTINGS_DRAFT` owner keys; SETTINGS.1 said an expense and a loyalty adjustment "converge here" | `DraftClass` is declared **once**, as a named type in §0.14 F79, with five members. §2.4 row 16 cites F79. SETTINGS.1 states plainly that an expense and a loyalty adjustment cannot converge here and why — `GAP-EXPENSE-COMMIT` and F82's `MONEY` routing. **Also a security-contract violation** (FR-6d): the drifted union admitted the two classes the finance fence exists to keep off every commit body. |
| R3 | §2.6.5 BOOK.2 stated `requiredConfirmationKind` as *financial ⟹ PAYMENT_HANDOFF, else `targetKind: 'appointment'` ⟹ BOOKING_CONFIRMATION, else SETTINGS_DRAFT* | BOOK.2 cites §0.13 F72's table lookup, which has **no default branch**. **This was the third security-contract violation, and the largest**: measured against the registry, the deleted chain routes **118 of 226 capabilities — 94 of the 105 widget-reachable — onto `SETTINGS_DRAFT`, a COMMIT-bearing kind, by falling off the end of a two-test chain.** The quantification is retained in BOOK.2 as non-normative, so the reason the fence has no default branch is legible where the fence is read. |
| R30/R30b | §2.4 row 13 and §2.6.13 gave `PROGRESS`'s owner as `orchestration.run.read` | F36 deletes that key (zero occurrences in the registry). Both now read: resolved at `EP-REGISTRY-LOAD` to the existence of the run, plus `owner_report.status`. |

### B — nineteen duplicate declarations collapsed to one each

Kept in the section §0.2's ownership map names; every other occurrence replaced by a one-hop
citation. Five had already drifted, and those are marked.

`Phrase` **(drifted — `params?` lost, which V4's `renderPhrase` reads)** · `Narrative` ·
`NarrativeTemplate` (×3) · `NARRATIVE_TEMPLATES` (×3) · `MintedIntent` ·
`requiredConfirmationKind` **(drifted — see R3)** · `refSet` · the `produced`/`reading_order`
derivation (×3) · the five floor tables `EFFECT_FLOOR`/`KIND_FLOOR`/`RISK_FLOOR`/
`CONSENT_CLASS_FLOOR`/`targetFloor` · `FLOOR_EXEMPT`'s build vetoes (×4) and its five-intent
census (×3) · the FR-1…FR-16 table **(drifted — FR-4, FR-6b, FR-6e, FR-7 key-space cells)** ·
`CONTROL_REGISTRY` **(drifted — status vocabulary)** · `max_commit_intents`'s pairing veto (×3) ·
the mint-class table **(drifted — reworded)** · the escape-verb rule (×3) · Gate 6's dispatch
block · `draft_class` **(drifted — see R2)** · the `SETTINGS_DRAFT` owner key set **(drifted)**.

**The worst two were under a sentence denying they existed.** §3.4 said *"the five floor tables
have one declaration in this contract"* and printed them, byte-identical, nine lines below;
§4.5.4 said *"`FLOOR_EXEMPT` is declared in §0.4 and is not restated here"* and then restated the
predicate, all three build vetoes and the census. Both pointers also named **§0.4** — *Mint
classes and erasure classes* — when the derivation is in **§0.8**.

### C — the precedence chain the preamble said did not exist

Annex A declared `Section 0 > Annex A > §§1–4` and exercised it: §A1.6.1 overrode §0.21
residual 4's count of the reserved consent/identity names. **A0.2 now declares no ordering at
all**, on the ground that the annex and the body speak about different subjects; the one
divergence is folded into §0.21 residual 4, which carries the corrected per-act figure — three
acts with no owner, one with an owner unreachable from the widget source type, four with a
reachable registered owner under a different name.

### D — «one place per rule» is now a checked property

It was a claim in the preamble with no mechanism, which is why it was false in nineteen places.
**§0.2 F6a** declares a build test that extracts every top-level declaration from every fenced
block and fails on any identifier declared in more than one section, or in a section other than
the one §0.2 names as its owner — plus a second pass that fails on any *"X is declared in §Y and
is not restated here"* sentence whose X is then declared in the same section as the sentence.
F6's own link test is widened from `§N` to `§N.M`, which is why ninety-odd subsection references
survived a renumbering pointing at the wrong rule.

### E — cross-references

**48 dangling `§0.N` references** (N > 21, against a §0 that ends at §0.21), of which 31 were in
normative text, plus a further set that resolved to the wrong subsection under the consolidated
numbering (`§0.13 subjectFloor` → §0.8 F45; `§0.14 totality` → §0.8 F45; `§0.15's fail-closed
default` → §0.8 F50, and so on). Every one is repaired against the consolidated map, and the
five surviving `E-n` errata citations in Annex A are replaced by the F-clauses that carry the
rule. **Normative text now cites zero errata and zero unresolvable sections.**

### F — the remaining structural repairs

| # | Was | Now |
|---|---|---|
| R33–R33c | §4.4.3's `IntentRecord` classification listed `selection_min` / `selection_max`, which §3.7 does not declare, and omitted `approval_of_intent_ref`, `confirmation_of_ref`, `produced_by_intent_token_hash`, `rendered_utterance`, `selected_labels`, `spoken_transcript` | the table is total over §3.7's declared members and over no others, with RT5's build test named as what keeps it total |
| R34/R35 | §4.4.2 claimed to be "the contract's **sole** per-kind retention authority" with five kinds missing, while MEDIA.4 stated a second window for `MEDIA_PREVIEW` | all twenty-two kinds carry a row; MEDIA.4 cites the table |
| R36/R37 | §3.7 declared `frozen_nouns` inside the block headed *conversation content: ERASED*, which R3.7.2 made normative — contradicting F14 and §4.4.3, and making F15's build-time reachability test unpassable by construction | `frozen_nouns` sits with the audit-retained members; R3.7.2 keys on §4.4.3's classification, and states that a code-block divider decides nothing |
| R38 | `authority_hint.disabled_because`'s equality with `intent.enabled.reason_code` existed only inside a code comment, and both members are inside `body_hash` | lifted into **R3.1.0**, a numbered rule with the emission validator as its mechanism and `EP-MINT` as its evaluation point |
| R32 | §0.11 F66 named `OptionItem.intent_token`, `slots[].intent_token`, `bulk_intents[].intent_token` | `intent_ref` — the member the leaf schema declares and F65 requires |
| R39 | §3.2 asserted "zero `capability: string` declarations in the widget layer", wider than F21 and condemning `AE_WIDGET_COMMIT_ALLOWLIST`'s own string-keyed rows | narrowed to the members F21 enumerates |
| R40/R41 | `CLIENT.2` cited "the display fence", which §0.19 item 3 records as defined nowhere | a `validateEnvelope` kind-level refusal, the same shape `MEDIA.2` carries; §0.19 item 3 records that the remainder now has a mechanism |
| R46 | §0.18 F92 declared **32** prerequisite rows and F93 named P-23 … P-32; §A1 carried **22**, so ten `NORMATIVE-PENDING on P-nn` statuses named rows that did not exist | **§A1.7** carries P-23 … P-32 — the contract's own enforcement machinery — each with its dependants and its package |
| R47 | §A1.2.1 adjudicated a contradiction between §0.40 and §0.18-2, neither of which exists | replaced by a reader's pointer to §2.7; the emittable set is derived at `EP-REGISTRY-LOAD` by K20 and follows P-13 automatically |
| R48 | §A1.6.2 (marked NORMATIVE) required a `WIDGET_CAPABILITY_POLICY` row for an **AE-CAP** key — which F28 forbids, that table being total over C9-CAP's 56 rows and those only — and built its premise on the derivation F72 deletes | restated over the fences that exist: F32's `CONSENT(cap)` holds for `targetKind: 'client_consent'`, F31's start-up veto bars the allowlist row, and F72's lookup then refuses at mint. This is FR-6a holding **fail-closed and non-vacuously** once the owner is named |
| R45 | §A5 transcribed "22 prerequisites: 18/2/2", a tally F92 requires to be printed from `MECHANISM_GAP_LEDGER` at build | the transcription is deleted and the reason stated |

## Result

6,217 → 6,121 lines. Every security-critical declaration unique; every normative cross-reference
resolves; no errata citation survives in normative text; no precedence chain anywhere.

**This is not a certification.** It is the repair. The dependency-closure verification of these
repairs is the next pass, and the exit bar is unchanged.

---

## Round 1b — four more found by the mechanical audit, after the repair

Writing the F6a check as an executable script rather than trusting the repair found four more
instances of the same pattern, three of them the *identical* failure: a sentence saying a rule is
not restated here, with the rule restated immediately below it.

| # | Was | Now |
|---|---|---|
| R52 | §2.5 K22 cited §0.11 F68 for the `reading_order` derivation — but F68 had itself become a pointer to §4.8 A-0 | K22 cites §4.8 A-0 directly. A citation chain is not a declaration site. |
| R53 | §3.4 R3.4.7's prose said the five-intent census is "not restated here" — and the census table stood six lines below it | the table is gone; §0.8 carries the only census |
| R54 | §2.4 K13 printed the `max_commit_intents` build veto a **third** time (after §0.13 F75 and §3.11 R3.11.2) | K13 states the per-kind value, which is a `KIND_REGISTRY` column and §2's to own, and cites F75 for the veto |
| R55 | §3.10.2 reprinted §0.13 F74's two-row `confirmation_of_ref` table | cites F74 |

`consolidated-mechanical-audit.mjs` is the script, and it is the evidence: **29/29 checks pass**,
including the two F6a passes, the `§N.M` link resolution, the prerequisite-row closure and the
clause-identifier uniqueness. It is committed so the next reader runs it rather than trusting
this record.
