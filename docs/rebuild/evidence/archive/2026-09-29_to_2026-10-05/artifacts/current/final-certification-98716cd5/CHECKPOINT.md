<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: fb3953ed4c727eab52ea6444a3c051eef46501b126217d5009d3e8a590f3d94a -->

# Final certification checkpoint — STOP

Claude commit `98716cd5b9440d01e4272ea0778f93db26f065e6` is integrated unchanged in `codex/maya-controlled-integration-20260930`. NS-1 roundtrip passes. Certification stopped on a fresh, reproducible FBE2E L27 failure: COMMIT → Dismiss appends the same canonical receipt twice to conversation. Server state remains one receipt and one booking.

```yaml
FINAL CANDIDATE SHA: 98716cd5b9440d01e4272ea0778f93db26f065e6
PROFILE: closed-input.no-handoff@1
PROFILE-APPLICABLE FALSE: 0 # source/evidence disposition; not certification
GLOBAL FALSE: 2 # G6-6 / G13-R8 remain STOP
FULL MUTATIONS: NOT COMPLETE — STOP; no full certificate
CI-EQUIVALENT: NOT CERTIFIED
FBE2E: FAIL — L27
NS-1 ROUNDTRIP: PASS
PWA/CARRIER PARITY: PASS
CERTIFIED_FOR_PROFILE: NO
FULL-CONTRACT CERTIFIED: NO
READY FOR RELEASE AUTHORIZATION: NO
```

## Fresh passing checks on this candidate

- Backend: 5598 tests / 587 suites.
- Runtime on Node 22 and 24: 408 PASS, 7 explicitly disclosed skips, 0 FAIL each. Skips are not counted as passes.
- Carrier: 93 PASS. Widgets-live: 405 PASS / 36 suites. HTTP/BIN: 21/21. Python: 613 PASS.
- NS-1: 16/16; freshly executed old-base counterfactual fails 9 checks. Actual built-runtime/backend-binary parent return passes.
- BS-1 create/reschedule/cancel, canonical receipt → conversation → real chat history, 9.6 identity, all 12 required successor proofs plus 7 V2 proofs, profile isolation, expiry/revocation/old-token refusal pass.
- Build, typecheck, lint, contract checks, audit, CI helper checks, runtime hashes and PWA/Capacitor parity pass.
- Fresh evidence manifest covers all 163 profile-applicable duties; verifier reports zero provenance violations. This does not override the FBE2E failure or certify unfinished mutations.

## Mutation programme

The complete stock 502-declaration programme was scheduled as 65 canonical parts with no test/step filters. The first NS attempt had a red BS-SOURCE baseline and is retained as **unusable**. An unmutated full repeat passed 405/405; the full NS retry on a new proof database also had a green 405/405 baseline. All active runners were then stopped on the independently confirmed L27 defect. There are no valid completed final native parts and no aggregate receipt; partial observations are not a substitute.

## Exact remaining blockers

1. **L27 runtime receipt duplication** and its incorrect prior CLOSED disposition. This is separate from NS-1 and persisted USER-turn identity. Resolve it or obtain explicit named limitation acceptance.
2. Complete fresh mutation/CI/FBE2E certification on the resulting exact candidate after this boundary is resolved.
3. Retain AR-1's named limitation/prerequisite acceptance requirement. Remaining disclosed rows are L2, L5, L12, L16, L20, L23, L24, L25, L26 and L27; none is silently waived.

[Exact defect and repro](CERTIFICATION-DEFECT-L27.md) · [Detailed checkpoint](CHECKPOINT.json) · [Current FBE2E disposition](FBE2E-DISPOSITION.json) · [165-row evidence index](FRESH-CLAUSE-EVIDENCE.json) · [Commit/file provenance](FILES-TOUCHED.json)

Worktree clean. Backend/visual files edited in this pass: 0. Production deployment/migration/grant, real OTP/YCLIENTS, iPhone reinstall and Chapter 10: **0**. HANDOFF remains unavailable. No release certificate issued.
