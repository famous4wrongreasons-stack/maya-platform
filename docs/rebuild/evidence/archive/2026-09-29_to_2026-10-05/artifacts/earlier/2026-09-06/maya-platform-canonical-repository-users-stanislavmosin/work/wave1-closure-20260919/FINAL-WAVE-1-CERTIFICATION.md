<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 18ff85f235262822c6d8c0283b6657a0c8130dfe404edc796bf1a1ff64dc1550 -->

# Gate-programme Wave 1 — final certification

Final verified HEAD: `a1cd3c50e6438508c4f950c032b979d0d1500b3b`. Only Gate-programme Wave 1 is certified; Gate Wave 2 is not started.

- Code merged: YES. Wave 1 certified: YES.
- Backend: 531 suites / 5037 tests PASS. Python: 613 PASS.
- Live: 12 suites / 245 tests PASS. Production binary: 10/10 PASS.
- Appointment PostgreSQL: 20/20; kernel: 26/26; actual HTTP smoke: PASS.
- Contract V1.1, architectural/static checks, counterfactuals, lint, typechecks, build, Prisma and clean replay: PASS.
- All 19 complete mutation batteries: 204 declarations, 114 build-killed + 87 live-killed + 3 previously declared pending; 0 unexpected survivors, mismatches, vacuous kills or process-crash diagnostics.
- Platform CI: https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35457936046
- Mutation CI: https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35457936333
- Node 24 Jest worker SIGSEGV remains a known compatibility defect, not claimed fixed. CI/these proofs use Node 22; existing Dockerfile still names Node 24.
- Contract/audit/Decision Sheets unchanged. Later-wave holds remain pending; no audit promotion.
- HEAD=origin, worktree clean, unpublished required code/report work 0, proof effects 0, owned processes/watchers/browsers/databases 0. All newly owned proof databases dumped/dropped; pre-existing databases untouched; protected main unchanged.

Exact receipts, mutant artifact identities/digests and hygiene checks: `FINAL-WAVE-1-CERTIFICATION.json` and adjacent preserved evidence. Repository remediation/report is already published; final-HEAD outputs were collected after that publication. STOP; Wave 2 requires a separate owner instruction.
