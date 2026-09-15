# Consolidation freeze

```text
EC-1…EC-24: INPUT TO CONSOLIDATION
NEW BUSINESS DECISIONS: 0
NEW SECURITY SEMANTICS: 0
NEW WIDGET KINDS: 0
NEW AUTHORITY PATHS: 0
NEW FLOOR REDUCTIONS: 0
```

D1–D12 were approved before this step. Consolidation is a mechanical fold, not an
architecture cycle: 71 errata rows (E-1…E-31, EB-1…EB-15, EC-1…EC-24 + EC-3b) and 157
canonical rulings from sections 0, 0-B and 0-C were folded into one body.

## Before and after

| | layered | consolidated |
|---|---:|---:|
| lines | 6 926 | 6 217 |
| normative errata layers | 3 | **0** |
| precedence language in normative text | 7 | **0** (one reference survives inside Annex B, which is history) |
| amendments hidden in code comments | 4 | **0** |
| duplicate clause identifiers | 1 | **0** |
| `ReadonlyMap` bracket-indexed | 0 | 0 |

## Duplicate declarations found and collapsed during assembly

The fold produced the mirror of the old failure: three sections independently restated
machinery another section owned. Each was collapsed to a single declaration plus one hop.

- `verificationFloor`, `FLOOR_EXEMPT`, `SENSITIVE_DEST`, `c9Floor` and the five floor tables
  were declared in **§0.4 and again in §3** — a security-critical function stated twice is one
  that can drift in one copy, and a floor that drifts downward is a reduction nobody reviewed.
- `FLOOR_EXEMPT` and `SENSITIVE_DEST` again in **§4** step 1.
- The floor-reduction enumeration existed in **§0.17 and again as §3's R3.4.8**, each claiming
  to be where an auditor finds every reduction. A contract with two such places has none.

## Security invariants after consolidation

| | |
|---|---|
| `CLIENT.2` pii_ceiling fence | present, unrenumbered, in §2.6.7 |
| `ARTIFACT.3` contains_pii fence | present, unrenumbered, in §2.6.22 |
| `CLIENT.3` / `ARTIFACT.5` role clauses | present, distinct numbers, no collision |
| floor reductions | exactly 2, one table (§0.17) |
| third floor reduction | none — each folding agent reported carrying both verbatim |
| FR-1…FR-16 (FR-6 splitting 6a–6f) | 22 distinct rows |
