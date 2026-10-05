# Readiness reconciliation — 2026-10-05 UTC

Development candidate, not a release approval. This supersedes the remaining-blocker
classification in CLIENT-READINESS-FIXES-20261005.md, while retaining its test evidence.
Base `0e1381a40d3f2f2340f1426ea81c24b1e878d0fb`; candidate code
`55a437bd14a4e31b63db81697029f48a2fa4f91e` on
`codex/maya-client-readiness-20261005`.

## Changes that do not require a new policy

MIG-4's baseline excluded only the SB-1 and NS-1 additions, so it miscounted the
four existing guest-owner migrations from
`b3fdbfe1a70ef1bb3232f1a3895a89c32e811f64`. Each current SQL file was compared
byte-for-byte with that checkpoint. MIG-4 now pins all four exact names and SHA256
values and still requires the original baseline of 99 other migrations. Adding,
removing or editing an extension fails; no prefix exclusion or relaxed count was
introduced. No SQL, Prisma schema or production runtime file changed.

Legacy lint was fixed in exactly three files. Two proof/test blocks received
formatting only. The YClients adapter test now types fetch argument tuples and
uses Response fixtures for those typed mocks, preserving payloads, outcomes and
all assertions. Its production adapter is unchanged. The two affected test suites
pass 76/76 assertions; the migration suite passes 5/5.

The frozen website frontend `d5b310e9a3dc13051eb7f5ccd1e23bf28e8884d6` and stable
guest backend artifacts are not rewritten. This candidate changes proof/test
compatibility only. It does not claim real provider acceptance or deployment.

## Exact contract conflicts: work stopped on these items

The current canonical document is MAYA-WIDGET-CONTRACT-V1.md, Version 1.2, last
changed at `ec350790b737c2a57e112ef72ca39500fed36df2`, SHA256
`d2a97b17c0e121d366939be4ff1142c4b9b09b06ff17b7eb8f05bafc4f61b271`.
Existing table, runtime-floor and F88 generators report their outputs current;
regenerating from this document cannot authorize the mismatched rows.

### A. Staff business guidance admission (seven backend assertions)

- F3 (lines 61–69): **“Any C9 change outside F36a is a version bump of this
  contract carrying a recorded owner decision”**.
- F28 (lines 435–445): the table is total over 56 keys (71 only after the whole
  F36a set); **“a key with no row there fails it”** outside that exception.
- Runtime has 57 C9 / 48 tool keys. `business.rules.read` was added by existing
  A22 integration, not by this reconciliation. It is absent from F36a and from the
  reviewed `closed-input.no-handoff@1` successor snapshot.
- Executed probe: removing only that row for comparison recreates pinned hash
  `4a6aaf7e7507af6f1ae9ed128cd6820fec2827596baa0cd2aabc66486a05ab63` exactly;
  current hash is `d88986622d4226015298ba8b2255994ec7684bcbb5bde79883fdd2dd13732918`.
- Existing row: ADMIN / READ / SOURCE_READ, USER principal, existing A22 tool
  owner, no AE mutation. Current derived policy is SESSION_VERIFIED / consent
  class none / synchronous; tool roles are staff/business, not Client/customer.
- This accounts for totality (3), proactive census (1), consent catalog-length
  census (1), release profile (1), and ARCH-12-11 registry fingerprint (1).

**Correction to the earlier handoff:** ARCH-12-11's first failed fingerprint is
`C9_REGISTRY_HASH`, not a Prisma/non-widget schema hash. Its subsequent checks
still protect AE contract fields and widget-only migration writes. There is no
remaining demonstrated Prisma schema fingerprint failure.

Minimal owner choice: approve a versioned admission of the existing staff-only
A22 read with the current floor/roles/data boundary, then regenerate/review the
certified policy and release snapshot; or keep this candidate uncertified until
that admission. Updating numbers or the profile without the versioned ruling
would contradict F3/F28. No rollback or removal of the existing read is proposed.

### B. Conversation/source-read denial census (three backend assertions)

P10 (line 2510) explicitly pins 118 denial codes and complete projection coverage.
Runtime has nine additional codes:

- `conversation_intent_hash`
- `conversation_read_only`
- `conversation_read_run_required`
- `conversation_turn_unavailable`
- `read_work_in_progress_or_unknown`
- `source_read_receipt`
- `source_read_replay_changed`
- `source_read_unconfirmed`
- `source_replay_owner_required`

`src/widget-contract/reason-table.ts` explicitly says its content is hand
transcribed from the certified prose and has **no emitter**. This is not a stale
generated file. All nine currently use the certified fallback:
UNAVAILABLE / PROVIDER_SILENT / limitation, never FAILED or error severity.

The following is a **review proposal only**, not an applied or certified mapping.
It uses existing reason/state vocabulary and the actual refusal predicates:

| Code | Proposed state / reason | Predicate evidence |
|---|---|---|
| conversation_intent_hash | UNAVAILABLE / OUT_OF_SCOPE | intent hash is not 64 lowercase hex characters; c9.store.ts:274 |
| conversation_read_only | UNAVAILABLE / PERMISSION | registered capability/receipt must be READ; c9.orchestrator.ts:95 and c9.store.ts:419 |
| conversation_read_run_required | UNAVAILABLE / OUT_OF_SCOPE | wrong objective/revision or an expired/cancelled conversation-read scope; c9.store.ts:406 and c9.work.ts:372 |
| conversation_turn_unavailable | UNAVAILABLE / SOURCE_UNLINKED | no active tenant/principal-bound USER turn; c9.store.ts:276 |
| read_work_in_progress_or_unknown | UNAVAILABLE / PROVIDER_SILENT | reserved/claimed state cannot establish a confirmed answer; includes HELD_UNKNOWN, so PENDING would overclaim; c9.orchestrator.ts:151 |
| source_read_receipt | UNAVAILABLE / SOURCE_UNLINKED | missing/mismatched exact source receipt or principal linkage; c9.store.ts:360–390 and c9.work.ts:383–392 |
| source_read_replay_changed | UNAVAILABLE / SUPERSEDED | replay completion/execution/stale identity differs; c9.orchestrator.ts:142–148 |
| source_read_unconfirmed | UNAVAILABLE / PROVIDER_SILENT | source result lacks completed status or execution identity; c9.orchestrator.ts:158–162 |
| source_replay_owner_required | NOT_MEASURED / NO_OWNER | replay owner callback absent; c9.orchestrator.ts:91–92 |

Every proposed row has severity `limitation`. No UNKNOWN case is changed to FAILED,
KNOWN, or automatically retryable. No blanket fallback family was added to make
the coverage test green.

Minimal owner choice: approve this explicit nine-row projection review together
with P10's 127-code census in the versioned contract, or keep certification blocked
and revise the table before admission. The current fallback remains unchanged
until that decision; generators are not authorized to make it.

## Verified result

| Fresh check on candidate | Observed result |
|---|---|
| Complete configured backend census | 5830 PASS / 10 FAIL / zero skips; 600 suites, 26 completed partitions; all final reports Node 24.15.0 |
| Documented runner | 25/27 PASS; only widget-contract-check and K4 remain red |
| Full lint | PASS, 0 errors / 9 existing generated-code warnings |
| Scripts types | PASS |
| Changed legacy suites | 76/76 PASS |
| Exact migration baseline suite | 5/5 PASS |

The initial full backend process exited on SIGSEGV (-11), without its final JSON;
it is retained as a failed execution attempt. The replacement run enumerates the
complete configured Jest census in bounded fresh processes, initially 15 groups
of 40 suites. The sixth group also exited on SIGSEGV under Node 24.15.0; completed
reports are retained and only groups lacking complete reports are resumed. The
already-installed application runtime Node 24.21.0 could not resolve ts-jest at
startup; those attempts ran no tests and contribute no results. Recovery uses
the original Node 24.15.0 in groups of 20, splitting only a signal-terminated
group if necessary. Startup/configuration errors now stop the recovery harness.
No software is installed and no assertion-name, integration or source-path class
is excluded. The final census contains all 600 configured suites exactly once, with zero runtime-error suites in completed reports. All 10 assertion failures have the same identities as the prior baseline; MIG-4 is the one eliminated failure. The earlier crash/startup attempts remain evidence, not passing tests. Evidence lives at
`pilot-evidence/readiness-reconciliation/` in the parent workspace. The previous
52-suite HTTP census (490/490), shell (430 PASS / 7 explicit skips) and React
(93/93) remain applicable: no runtime/carrier source changed in this slice.
They are retained evidence, not represented as fresh runs on this candidate.

No paid calls, database/server restart, migration application, production writes,
real notifications/payments, phone operation, push, merge or publication occurred.
