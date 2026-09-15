# Narrow final verification — the last six repairs, and R3.11.5

`[EVIDENCE]` Two lenses, fixed scope, no re-certification and no discovery. The owner's decisive
question, and the answer.

## The decisive question

> **Does the repaired R3.11.5 now actually execute the refusal, or does it merely read correctly?**

**IT ACTUALLY EXECUTES.** Both lenses traced the chain independently, by execution, and neither
inherited the supplied proof script's answer — one of them corrected it.

```
an intent carrying an AE ref (§0.12 F69: REQUEST_APPROVAL / COMMIT may carry an AE ref and
                              nothing else)
  → its AE_WIDGET_COMMIT_ALLOWLIST row               F31: (row XOR gap) over all 226
  → exactly one AE_PROPOSE_PAIRING row with that     F31: asserted at EP-REGISTRY-LOAD, and
    key on the `ae` side                                  independently the only such row in F38
  → that row's `propose`                             F31: space === 'C9' ∧ key resolves in
                                                           C9_CAPABILITIES
  → b35.confirm                                      EXECUTED: present among the 56, mode
                                                     OWNER_HANDOFF, resourceClass SOURCE_HANDOFF
  → its WIDGET_CAPABILITY_POLICY row                 F28: total over C9-CAP's 56 rows
  → dispatch_is_synchronous                          readable; can be false
  → mintIntent() refuses                             and R3.11.5 now also refuses on a missing row
```

**Nothing returns `undefined`.** The live case is real, not schematic:
`communication.bulk-campaign.admit.v2` executes as `policyDecision: ALLOW`,
`approvalRequirement: REQUIRED`, `actionClass: deliver_bulk_campaign`,
`allowedSourceTypes: ['authenticated_request']` — the single allowlisted `MARKETING_FANOUT` row,
reachable as a `REQUEST_APPROVAL` from `CLIENT_LIST`.

And one lens went further than the contract and **read the owner's code**:

> `src/marketing/canonical-bulk.service.ts` `confirm()` calls
> `engine.decideApproval({decision:'APPROVED'})` and then `continue()` →
> `CommunicationBulkDeliveryService.resume()`, which is a leased, 25-second-deadline, resumable
> per-recipient loop with its own separate `resume()` re-entry point. **That IS "the owner queues
> dispatch after `APPROVED`"**, so `dispatch_is_synchronous: false` is the factually correct value
> for `b35.confirm`, and the refusal is the one this rule exists to make.

So the fence is not merely constructible in principle. It is correct for the one capability that
reaches it.

## The six repairs

**All six correct at their sites — 2/2 lenses.** Y2, Y2b, Y3 and Y4 also fully closed, each
premise re-derived by executing the registries rather than by reading the contract's prose:

- **Y4's collision claim**, checked by enumeration: TOOL-DEF ⊂ C9-CAP by spelling (47/47), AE ∩ C9
  = ∅ (0 of 226), the nine C9-only extras exactly as F24 lists them. The old wording named a
  collision that provably **cannot** occur; the new wording names the one that does.
- **Y3's disjunct**: `package5.wave3.record-client-consent.execute.v1` has
  `targetKind: 'client_consent'` *and* `actionClass: 'record_client_consent'`, and F32's predicate
  resolves to exactly the 3 of 226 rows it claims.
- **Y2b's premise**: `MAYA_AI_TOOL_CATALOG` is exactly 47 names, zero containing
  `consent`/`identity`/`privacy`.
- **Y2**: `capabilityRegistry` now has **0** occurrences document-wide.

## Independent load-bearing defects: 0

Both lenses said so plainly, unprompted, and one added why it mattered:

> "I FOUND NO INDEPENDENT LOAD-BEARING DEFECT, and I am saying that plainly rather than
> manufacturing one — the owner should not stop."

**No STOP condition.** What both filed instead were *closure errors of the six repairs* — the
category the owner's rule says to fix in place and re-check mechanically.

## The four closure errors, and their repairs

| # | filed by | was | is |
|---|---|---|---|
| **Z1** | **both** | **§A1.1 P-10** still commissioned `WIDGET_CAPABILITY_POLICY` as *"total over `C9_CAPABILITIES` ∪ the reachable Action Engine keys"* — **the exact AE-inclusive domain whose falsity is the whole premise of Y1**, and which Annex B EB-2 already records as VOID as to the AE half | total over `C9_CAPABILITIES`'s 56 keys **and over those only** (§0.7 F28), all three columns named; AE-CAP totality attributed to `AE_WIDGET_COMMIT_ALLOWLIST` ∪ `AE_CAPABILITY_GAP_LEDGER` under F31 |
| **Z2** | closure | **§0.7 F31** asserted `propose.key resolves in C9_CAPABILITIES` — constraining the **spelling** and not the **space**. Because TOOL-DEF ⊂ C9-CAP by spelling, a ref written `{space:'TOOL', key:<a C9 spelling>}` satisfies a key-only assertion and then resolves against the wrong table's independently-set fields | F31 asserts `propose.space === 'C9'` **and** `ae.space === 'AE'` alongside the spellings, with the reason stated in the block |
| **Z3** | constructibility | **R3.11.5** relied on totality alone, where the contract's only two other readers of that table (§0.8 F46 `c9Floor`, §0.8 F48 `SENSITIVE_DEST`) each carry an explicit fail-closed default | R3.11.5 carries `if (row === undefined) refuseMint('policy_row_missing')` — *"a fence that depends on a totality proof to avoid failing open is a fence one edit away from failing open"* |
| **Z4** | constructibility | **the proof script's step 6** claimed `AeCommitRow.propose` being non-null is what makes the lookup total. **It is not** — non-nullness yields a value, not a C9-resolving one | step 6 checks only that the member is a ref; **F31** carries totality, at step 13, which now asserts both the space and the membership |

Z4 is a correction to *evidence I wrote*, filed by a lens told to check the script rather than
inherit it. The script reached the right answer through a wrong step, and its own step 13 rescued
the conclusion. It is corrected at both copies, and its printed conclusion now credits F31 rather
than non-nullness.

Two further closures, neither filed as a defect: **Z5** — the K1–K16 draft had copied P-10's
AE-inclusive domain forward and now states F28's; **Z6** — the round-4 memo said the file was
6,209 lines when it was 6,208.

## After the repairs

All five committed checkers, plus the constructibility proof:

```
consolidated-mechanical-audit.mjs        29/29
citation-target-check.mjs                 0 problems
per-kind-totality-check.mjs              22/22 on both tables
f6a-one-declaration-check.mjs             1 admitted exception (subjectCapability sig + body)
predicate-restatement-check.mjs           0 restatements
r3115-constructibility-proof.mjs         13/13 links
```

The specific closure of Z1–Z3, checked directly:

```
AE-inclusive domain claim, document-wide   0
F31 asserts propose.space === 'C9'          1
F31 asserts ae.space === 'AE'               1
R3.11.5 fails closed on a missing row       1
```

And the eight invariants, re-derived:

```
FLOOR REDUCTIONS: EXACTLY 2      CLIENT.2 PII FENCE: INTACT      ARTIFACT.3 PII FENCE: INTACT
GATE 5: RECOMPUTABLE             GATE 6: EXECUTABLE              GATE 7: RE-READS ALLOWLIST
REGISTRIES: 226/221/47/56        SECURITY VIOLATIONS: 0
```

## On the lenses' own `certifiable: false`

Both returned `false`, and **both said in terms that it was conditioned on exactly the edits now
made**:

> "Delete those six words and the closure is complete. That does not warrant another full round;
> it warrants the edit, and then certification."
> "Fix P-10's one line (and, if the owner wants the premise as tight as the fence it now carries,
> F31's), and this certifies."

Z1, Z2 and Z3 are those edits. The owner's exit rule for this case is explicit — a direct error in
one of the last six repairs is fixed in place and re-checked mechanically, without a new
full-document round — and that is what was done. **This record exists so the reader can see the
`false` and the condition attached to it, rather than a pass asserted over them.**
