# Native consent baseline remediation — foundation assessment STOP

2026-09-08. Accepted checkpoint `2728bf20`. Runtime/schema edits have not started.
The conditional requirement “if both foundations are sufficient, implement” does
not cover successful processing of the unchanged keyless installed-native request.

## Preflight and preservation

Fetched origin. Isolated worktree `/tmp/maya-b29-contour`, branch
`contour/b29-remediation`, started clean at `2728bf20`, equal to its remote, zero
unpushed commits. Canonical origin remains `b6c53ff9`. No rebase/reset/stash/clean,
new worktree, upstream rewrite or R-C runtime transfer occurred.

Main 24 entries and 22 recorded file hashes are unchanged; all 11 pinned R-C WIP
commit trees are unchanged. No old or temporary database was opened, no server,
watcher, browser or production mutation was started. Original dumps/proofs and
migrations remain in place. Only the assessment, proposal and evidence are added.

## Separate verdicts

**G1 EXISTING FOUNDATION SUFFICIENT: YES.** The exact `0ad0eef2` certified runtime
resolver and unchanged challenge/link services support the approved correction.
The memory-only proof executes that source without editing a runtime file: seven
negative cases create zero challenges and two verified-binding cases issue for
the exact Client, including a Client without Maya User through Telegram binding.
The fixtures supply a synthetic authenticated-channel/verified-binding precondition;
this is reusable-foundation evidence, not deployed G1 remediation or production
provenance certification. No User/Profile query supplies Client authority.

**G2 EXISTING FOUNDATION SUFFICIENT: NO for unchanged keyless compatibility;
YES for the existing canonical keyed command.** The ledger is not missing:

- `Package5Wave3CanonicalCutoverService.recordChannelConsent` hands a stable event
  reference to the existing execution owner; consent source identity includes
  exact tenant/Client. The actual adapter proof preserves three distinct caller
  events and each event's retry identity.
- `Package5Wave3ShadowService.build` finds the durable source execution, restores
  original timestamps, rejects changed material/actor and resumes the same input.
  New sources receive an exact-target generation.
- `ActionExecution` has durable sourceRef, caller-idempotency scope/key uniqueness,
  immutable normalized input and state. `ActionTargetMutation.targetGeneration`
  records committed ordering. `ClientConsentFact` records the append-only outcome.
- The old `AMayaConsent` submit handler sends only two booleans. Its real handler
  was executed in a VM with a captured transport and no network. The upstream
  compatibility method hashes tenant/link/desired states and still collapses
  first and post-revoke grant identity.

A late retry of G1 after R1 and a fresh explicit G2 after R1 have identical request
bytes and identical observable durable state. A current-generation key assigns
G2 to the old retry; an old-state key assigns G1 to the fresh grant. Locks, latest
fact ids and a new table alone cannot distinguish them. The necessary missing
input is the event identity retained by the initiator.

## Minimal decision, no speculative schema

[The minimal Contract/Schema Proposal](package5-native-consent-transition-compatibility-decision.md)
recommends **Option A: use the existing command identity/receipt; reject keyless
legacy requests before effects**. It needs **0 models, 0 fields, 0 action classes,
no migration/backfill**. The exact business loss is that old installed native
builds require an update or an existing supported surface to submit consent.

That retirement has not been assumed approved. It changes `b6c53ff9`'s existing
keyless success behavior, triggering the user's production-semantics STOP boundary.
It does not reopen the already approved A18 command or R-C decisions. No proposal
to add a generation table or silently auto-infer a new event is made.

## Evidence, limitations and deferred gates

[Executable proof](evidence/native-consent-foundation-assessment.cjs),
[observations and exact source SHA-256s](evidence/native-consent-foundation-assessment.json).

The proof rechecks exact snapshot source against Git. Certified G1 code is compiled
only in memory. Actual canonical adapter inputs, old native submit requests and
upstream tuple collision are observed. The two-history ambiguity is a contract
counterexample, not a claimed DB concurrency experiment. Two initial harness issues
(Git output buffer and actual button label) were fixed before the successful run.

No runtime fix, DB executor proof, grant/revoke race proof, mandatory suite,
production inspection/deployment, or restored R06/R08 acceptance is claimed.
Existing 125-test evidence remains attached to `2728bf20`, with its documented
limitations. Its rerun and all requested remediation ratchets/gates remain pending
actual implementation. Production release `b6c53ff9` is the last verified release
from the accepted checkpoint, not a newly polled production state this cycle.

```text
G1 EXISTING FOUNDATION SUFFICIENT: YES
G2 EXISTING FOUNDATION SUFFICIENT: NO — unchanged keyless native protocol
G2 CANONICAL KEYED FOUNDATION SUFFICIENT: YES
G1 A18 PROVENANCE: FAIL — production remediation not performed
G2 CONSENT IDEMPOTENCY: FAIL — production regression remains
NEW SCHEMA REQUIRED: NO — recommended Option A
NEW BUSINESS DECISION REQUIRED: YES — keyless compatibility retirement only
COMBINED BASELINE CERTIFIED: NO
R06/R08 PROOFS RESTORED: NO
WAVE R-C WIP: PRESERVED
WAVE R-C READY TO RESUME: NO
R-C BUSINESS DECISIONS STILL VALID: YES
R-C SCHEMA CHANGES STILL VALID: YES
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION MUTATIONS/MESSAGES: 0
PRODUCTION PROVIDER EFFECTS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
PROCESS HYGIENE: 0
```

Report/proposal/evidence are pushed only to the isolated contour branch. Its HEAD
equals `origin/contour/b29-remediation` after push; canonical upstream is preserved.
**STOP at the exact keyless compatibility contract boundary.**
