<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 46c8e5a3efd0d71ffc0cfb9cabf2d711f8fdb4ea326b7aa37956835ad1fd9595 -->

# Certification harness diagnosis

**Harness defects proven. No product defect established.**

Current clean candidate: `2141e24544b5157c6341b649661d0cd3a2c21c48`, based on the requested `fed5f7dfa0a5611dba24b40a8143b354c22151e5`. Ten changed files are test/harness files only. Product, presentation and timeout changes: zero.

The investigation reproduced Darwin IPv6-wildcard/IPv4-loopback port shadowing under the unchanged stock eight-worker runner. Captured requests reached an unrelated listener, not the intended backend, producing both timeout and socket-reset failure classes. The repair explicitly owns an IPv4 listener. The historical requested SV2/F88 sockets were not captured, so the individual causes of those three past incidents cannot be asserted from a trace. The proven diagnosis is the reproduced harness defect and its before/after regression, together with fresh SV2/F88 controls on the repaired candidate. See `ROOT-CAUSE-BAB750D8.md` and retained process/port/socket evidence for the causal limits and full receipts.

Subsequent fresh full-corpus runs exposed two additional test defects: an incomplete booking admission double could mask a removed guard (`m13-followup/DIAGNOSIS.json`); fixed-date billing fixtures depended on the real date (below). These repairs change tests only. Previous partial runs are diagnostic, not final certificates.

## UTC date-boundary defect

At 2026-10-01 00:00 UTC, two billing negatives failed in unrelated native mutation workers. The exact unmutated bab750d8 spec reproduced 2 PASS / 2 FAIL independently. It declared an active/not-yet-due window ending at that exact timestamp while product code correctly compared the window with `new Date()`.

Controlled clock on unchanged source:

| Clock | Result |
| --- | --- |
| Existing fixture NOW: September 2 | 4 PASS / 0 FAIL |
| One millisecond before deadline | 4 PASS / 0 FAIL |
| Exact deadline | 2 PASS / 2 FAIL |
| One millisecond after deadline | 2 PASS / 2 FAIL |

The fixtures use mocked persistence and provider execution. No real billing or provider call occurred. This proves an expired test premise, not a backend latency/deadlock or billing defect. Receipt: `clock-followup/CLOCK-BOUNDARY-REPRODUCTION.json`.

Repair: this describe alone uses its existing NOW as Jest's clock and restores real timers after each test. A load-bearing clock regression fails before the repair and when the clock pin is removed. The fixed five-test suite passes with each of the four controlled ambient times. No timeout was changed. Receipts: `clock-followup/REPAIR-REGRESSION.json`, `PRECOMMIT-FORMATTED-CHECKS.json`, `canonical-formatted-clock-spec.json`.

Commit `2141e24544b5157c6341b649661d0cd3a2c21c48` adds this narrowly scoped repair, H-P408-CLOCK-1 and the exact 507-declaration inventory. The previous bab750d8 native corpus was interrupted; all eight owned process groups were stopped and post-stop inspection found no remaining group members. Unrelated services were untouched.

## Fresh certification admission

A complete new programme starts in `../final-certification-2141e245/`, with new synthetic databases and fresh receipts. The canonical inventory is 507 declarations: 342 build, 162 live, two existing HANDOFF pending, one existing equivalent. This is a declaration count, not a claim of successful kills. Whole-corpus certification remains pending until all native shards and the canonical assembler complete.

HANDOFF remains globally STOP; `closed-input.no-handoff@1` is unchanged. Full-contract certification remains false. No production migration, deploy, entitlement grant, real OTP/YCLIENTS effect, iPhone reinstall or Chapter 10 work is authorized or performed.
