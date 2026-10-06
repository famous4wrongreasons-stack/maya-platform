# Fresh V1.4 development qualification preparation

This is a reproducible, **unqualified baseline**, not a release certificate.
The current contract is V1.4 SHA-256
`9bd33e79959c87d9e8f28ffbccc622ca9180aa7f179533499305ac892cc1d769`.
The exact hash is enforced by `prepare-audit.mjs`; use that constant as the
machine-readable pin. No historical receipt, green state or mutation kill is
promoted to current evidence.

## Scope and history

The historical 165 clause IDs and their order are preserved. Nine summaries
reflect the approved F32a/F74a changes; the normative contract is unchanged.
All 163 applicable duties are `false`, with empty evidence and mutant arrays.
`G6-6` and `G13-R8` keep the existing HANDOFF STOP. `FINAL` is the checker’s
historical phase name for retired temporary discharge categories; it does not
mean certification. Schedule editing remains unavailable to users.

`history/manifest.json` records the original paths, checkpoint and hashes of
the compressed V1.3 audit, inventory and contract. Both compressed and original
bytes are verified when loading. The historical programme checker reads this
archive against its own contract. Historical approved-release artifacts and
profile pins remain unchanged.

The seven former whole-approval U grounds are withdrawn: `G11-I4`, `G11-I5`,
`G11-I6`, `G11-I10`, `G13-I1`, `G13-I2`, `G13-I9`. F74a makes the exact price
approval path reachable. A marker saying generic approvals cannot be minted
does not prove that the F74a path is absent. Candidate maps contain 16 remaining
U scopes, of which 11 belong to E1; they still need fresh fulfillment of all four
U duties and mutation admission.

E1 no longer claims the six withdrawn U duties or whole-clause `G13-I9` L.
`AR-FR6D-NONMONEY` remains an observation with no clause claim: a successful
booking COMMIT does not prove admission of the new F32a price exception.
These are missing evidence, not new exclusions. Existing scripted price/model
fixtures remain explicitly synthetic diagnostics; no real-model acceptance is
claimed. All other offered claims still require substantive V1.4 review before
any audit promotion.

## Reproduction without services

From the repository root:

```sh
node docs/rebuild/widget-release-programme/development-v14/prepare-audit.mjs --check
node --test docs/rebuild/widget-release-programme/development-v14/prepare-audit.test.mjs
node docs/rebuild/evidence/maya-chat-first-ux/gate-audit-check.mjs
node docs/rebuild/evidence/maya-chat-first-ux/gate-audit-check.mjs --self-test
```

`--write` regenerates the unqualified current audit/inventory and two candidate
proof maps. It is not a promotion or certificate writer.

At clean candidate `3a93408f202006c3b8699b9ab043bfa61f00152b`, the
[11-file evidence archive](../../evidence/maya-development-integration-20261006/v14-preparation/manifest.json)
records four preparation tests, nine selected offline mutation-admission tests,
12 lineage tests, audit consistency/self-test and the full 545-anchor dry-run.
Every command exited as expected. Rechecking the historical manifest under the
current map produced the expected 12 `V-U-PROOF` violations for its six obsolete
approval U claims. The independent agent reviewed preparation only; findings
were corrected and the three historical gzip files are tracked in Git.

From `maya-saas-backend`, the unchanged full mutation declaration set is
47 batteries / 68 planned jobs / 545 mutants. Eight anchors in six batteries
were reconciled with current code without changing IDs, killers, expected
outcomes or equivalence declarations. Full suites and controls stay intact;
the runner uses one Jest worker with a 768 MB idle recycling threshold. Dry-run
only validates anchors and named killers, never a mutation kill.

```sh
node scripts/widgets-mutation-battery.mjs --dry-run
node scripts/widgets-mutation-ci.mjs plan
```

## Next execution boundary

Wait for parent’s heavy-slot coordination; then run fresh unrestricted baseline
checks on the owned disposable PG, followed by the complete serial mutation
plan. Wait for every child to exit before starting the next command. Preserve
each job’s exact candidate HEAD and complete controls; no suite filters, reduced
steps, historical part reuse or certification from synthetic receipts. Final
admission uses `widgets-mutation-ci.mjs release`, not subset assembly. Prior
full-suite timings imply tens of hours for the complete serial corpus; this is
an estimate, not measured duration for the new candidate.

No PG, HTTP, model or provider process was started for this preparation.
Fresh HTTP/BIN receipts, the full mutation qualification and a conformance audit
remain outstanding. Certificate stays `NOT_ISSUED`; production and C10 autonomy
are not authorized. Schema and migration files are unchanged pending the
separate [three-relation FK choice](../../MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md).
