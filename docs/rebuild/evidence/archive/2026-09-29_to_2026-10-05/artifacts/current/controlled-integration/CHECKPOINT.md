<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 32b9e2e4fa1eb9b7e61515c5330c55bd3714621982db478ee39a701f50b3ebad -->

# Controlled integration checkpoint

**STOP: current AR-1 cannot isolate HANDOFF from the release scope.** The combined candidate is saved. No runtime implementation was changed after this boundary was confirmed; the stale backend artifact test census was corrected from 37 to 38 in an atomic test-only commit; the existing diagnostic suites below ran to completion. The requested complete certification programme was not represented as passed.

```yaml
COMBINED CANDIDATE SHA: 4f479dce32e6e3595516447a5a6bf8cc6278528a
BRANCH: codex/maya-controlled-integration-20260930
9.6: FAIL # still open; implementation held at the explicit scope STOP
FALSE CLAUSES BEFORE: 10
FALSE CLAUSES AFTER: 10
EVIDENCE_MISSING: 7
INTEGRATION_OWNED: 1
HANDOFF_STOP: 2
FULL TESTS:
  backend: PASS (581 suites, 5516 tests, 0 skipped)
  carrier: PASS (93 tests)
  runtime: 354 passed, 7 local-API tests skipped, 0 failed
  widget_live: PASS (30 suites, 380 tests)
  binary_HTTP: PASS (18 cases)
  AR1_two_process: PASS (1 test)
MUTATIONS: NOT RUN — scope STOP (458 declarations, 39 batteries, 60 CI jobs)
CARRIER PARITY: PASS
CI-EQUIVALENT: INCOMPLETE
AR-1 THRESHOLD SATISFIED: NO
READY FOR SYNTHETIC RELEASE CERTIFICATION: NO
```

Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration`.

## What was proved

- Before merge: 256 backend-delta files and 30 presentation-delta files; overlap 0; conflicts 0. The eight Claude commits are recorded in `PRE-MERGE-PROOF.json`.
- Both checkpoint commits remain direct parents of merge e17b4acf, followed only by the artifact census test correction. Backend runtime bytes still equal `f9e703e3`; presentation/iOS bytes equal `36fc31d7`. Both source branches and worktrees retain their original state. Integration checkout is clean.
- The initial merge run had 5515 passing tests and one stale artifact-census assertion (37 expected, 38 actual). Its receipt is preserved separately. After the narrow test correction, the previously integration-only built-shell check now passes in the ordinary full backend suite. No carrier artifact was copied from Claude: it was built in this checkout.
- Backend build/preflight, backend/live/scripts typechecks and lint for the changed test passed. Runtime hash/reproducibility check passed. Carrier web/Capacitor parity passed, with only the prescribed endpoint/CSP/address differences. Artifact hashes are saved.
- Carrier ratchets: 50 refusing / 42 admitting fixtures. Runtime ratchets: 68/68 refusing, 24/24 admitting, coverage 31/31; write guard 2/2, PWA checks 51/51, bypass probes 8/8. K3: 10/10. Mutation CI integrity tests: 35/35. These controls do not replace execution of the 458-mutant programme.
- Scope-boundary proof: 11/11 assertions, including real certificate-parser refusal with only the two HANDOFF rows failing. Synthetic positive input is explicitly not an actual certificate.
- All live/binary writes used a new local guarded proof database, `maya_widget_gate_proof_integration_4f479dce`, on 127.0.0.1:55729. Only already-committed migrations were applied there. No new migration was authored. The proof PostgreSQL server was stopped afterward.

## Exact remaining blockers

1. **Scope-isolation contract:** AR-1 V1 requires full165 and cannot certify accepted HANDOFF STOP. `SCOPE-ISOLATION-DECISION.md` specifies the proposed versioned certificate, finite server profile, all-ingress admission fences, dependency threshold, revocation and required negative/mutation proofs. It is not implemented or approved by inference.
2. **9.6:** complete the canonical persisted typed/widget user-turn identity and same-writer retry/error proof. The existing matched-intent shared gateway is preserved. No mirror writer was added. See `INTEGRATION-FINDINGS.md`.
3. **G7-5 / G7-BOOK1 / G11-I9 / G13-I3:** an authorized production source for appointment-specific initial cancel/reschedule actions, then paired production-source HTTP/BIN evidence. Registry rows and direct emitter fixtures are insufficient.
4. **G12-R1b / G12-I11 / G13-R2:** authorized production-minted NAVIGATE detail/w with source capability, current authority, erasure/revocation and HTTP/BIN provenance. The new React detail renderer does not supply mint authority.
5. **Fresh complete certification:** after the contract and implementation boundary is settled, execute and assemble the full declared mutation programme plus all applicable integration/CI checks. No old mutation receipts were counted as fresh. Remote CI was not run. Runtime's seven local-API acceptance tests were skipped by their own prerequisite guard, not passed.
6. **FBE2E:** retained progress is 13 CLOSED / 6 PARTIAL / 9 OPEN; no new whole-limitation closure. Existing synthetic backend booking and binary paths passed, but actual React-carrier-to-backend acceptance and the disclosed provider/date-window/policy boundaries are not thereby certified. No production/provider evidence was manufactured.

Global progress remains 129 L / 4 L-T / 22 U / 10 false across 165 clauses. Historical accepted evidence is identified as inherited progress in `MATRIX-REVIEW.json`; it is not relabelled as a fresh full-release certificate.

Production activation/deploy, real OTP, real YCLIENTS effects, iPhone reinstall and Chapter 10: **0**. No HANDOFF endpoint was implemented.
