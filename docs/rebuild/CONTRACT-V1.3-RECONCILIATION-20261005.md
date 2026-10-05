# Widget contract 1.3 reconciliation — 2026-10-05 UTC

Local development checkpoint, not release or real-provider acceptance. Based on
`2fa9180d79b82991656217bccf5c4c3a8557ba55`; code candidate
`d2369c45f3dafe83ab9c28d4837f204efd509df2`, branch
`codex/maya-client-readiness-20261005`.

## Approved change

The owner approved the two exact questions at 22:38 UTC. The complete wording,
message IDs and base are preserved in
[MAYA-WIDGET-CONTRACT-V1.3-DECISION-RECORD.md](MAYA-WIDGET-CONTRACT-V1.3-DECISION-RECORD.md).
This supersedes the decision wait recorded at the end of the completion map and
in READINESS-RECONCILIATION-20261005.md.

Contract 1.3 admits only the already implemented `business.rules.read` under F36b:
existing staff roles, active membership in the exact tenant, bounded internal rules,
SESSION_VERIFIED. Client/customer access remains refused. The release profile gains
that one successor; its digest changes and a prior-digest certificate is refused.
A release using this changed profile requires matching certification; no production
certificate, grant or trust change was issued. No new owner, tool, role, mutation,
tenant scope or data is added. F36a's separate fifteen-key set remains unregistered and its fences remain in force.

P10 explicitly registers the nine existing conversation/source-read denial codes
with their prior result: `UNAVAILABLE / PROVIDER_SILENT / limitation`, public text
«Источник пока не отвечает.». The seven earlier proposed changes in public reasons
or states were **not** admitted. Tests preserve all 118 older projections exactly,
and preserve the old C9 registry hash after filtering only the admitted staff read.

## Derived artifacts and checks

Counts are reconciled to the approved admission: 57 C9 / 48 tools / 226 AE,
127 explicit denial codes. The K4 shell gate's executable census and Gate 7's exact document SHA pin are updated
too; F69 itself is byte-identical to Version 1.2.
The canonical extractor now reads its own checkout; generation uses a temporary
output directory so the emitter cannot delete hand-maintained runtime files.
The regeneration README documents this safe workflow.

Compiler-printer comparison confirms comment-only changes in ten generated modules.
The separate P24 clause identifier changes only because its paragraph's census changes; its exact binding and sorted order
are synchronized. No gap status is promoted. Gate inventory/audit metadata pins
contract 1.3; every gate clause, status and evidence object is unchanged. Historical
Annexes B–D and their owner rulings remain records of their original decisions.

Fresh validation on `d2369c45f3dafe83ab9c28d4837f204efd509df2`:

| Check | Result |
|---|---|
| Full configured backend census | **5853 PASS / 0 FAIL / 0 skipped; all 601 suites** |
| Documented `run-all-checks.sh` | **27/27 PASS**, including widget-contract and K4 |
| Production/widget typechecks | PASS through the documented runner |
| `typecheck:scripts` | PASS |
| Full lint | **0 errors / 9 existing generated-file warnings** |
| Focused admission/profile/projection tests | 178/178 before checkpoint; included again in the full census |
| Authority / Gate 7 focused diagnostics | 103/103 and 32/32; included again in the full census |

The fresh backend run uses Node 24.15.0, a sanitized credential-free environment,
one worker and 32 completed process partitions. Every configured file has exactly
one completed report, no missing/extra/duplicate suites, no runtime-error suite,
and no skipped assertion. One native process failure is retained (`backend-part-08`,
exit -11/SIGSEGV). Both smaller replacement groups passed in fresh processes. The
incomplete attempt is excluded from the exact census and remains in the evidence.
The full separate HTTP/PostgreSQL, shell and React suites
were not restarted; their previous results are retained below.

The initial candidate `abd0485dc501bef4ef9a8c4e37af530636441c65` had 5812 PASS /
41 FAIL: 40 setup failures in four ephemeral loopback HTTP suites under sandbox,
and one stale Gate 7 Version 1.2 document pin. F69 was compared byte-for-byte with
the prior contract before updating that exact pin. Final checks rerun the complete
census on the final SHA with local loopback permission. No initial report is counted
as a fresh passing result; all attempts remain in the evidence archive. The earlier
precommit K4 census/sorted-binding failures are retained too.

Evidence on the owner's Mac: `task-3/pilot-evidence/contract-v13-final/summary.json`,
`backend-summary.json`, `backend-configured-census.json`, `backend-partitions.json`,
all per-process logs/JSON, `run-all-checks-final.stages.json`, source/AST/F69/audit-pin
delta records and the resource-limited sanitized runner. Diagnostic attempts remain
in `task-3/pilot-evidence/contract-v13/`. The companion
`task-3/pilot-evidence/contract-v13-checkpoint.json` names the exact handoff, verified
bundle, prerequisite and archive SHA256 values.

## Boundaries and next path

The C9 registry source, AI-tool catalog, Prisma/schema/migrations, frozen website,
React carrier and shell are unchanged from the input checkpoint. Frozen frontend
`d5b310e9a3dc13051eb7f5ccd1e23bf28e8884d6` and guest backend
`dcba8c8f4d230de31fb93f3d613f7524c3310df9` remain the previously identified pair.

This closes the contract/reason-map aggregate blockers, subject to the complete
results above. It does not accept natural-language behavior, YCLIENTS writes,
actual phone UI/login/CRM, production deployment, website browser/provider flow,
or a 1000-salon load envelope. The previous HTTP 490/490 (52 suites), shell 430 PASS
with 7 explicit local-API skips, and React 93/93 evidence is retained, **not rerun on
this contract candidate**. No local database or server was restarted.

Next: parent reviews this exact candidate and chooses the separate website
acceptance/release path or the previously frozen six-case/twenty-turn synthetic
real-model proposal under a fresh explicit authorization. No production release,
paid call, remote proof, schema migration, real notification/payment/CRM mutation,
phone operation, push or merge occurred. Telegram installation scope and inbound
retention/unlinked lifecycle remain owner decisions; no inbound schema was inferred.
