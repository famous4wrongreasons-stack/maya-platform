# Independent static review — unified conversation batch

Disposition: **qualified no remaining material code blocker** for the reviewed candidate and separately authorized local dry qualification. This is not a paid-run grant, execution result, language acceptance, provider acceptance or release certification.

Reviewed worktree: `/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-conversation-batch`; original base `c6db033e02009bda523c393e65e45ba61c3bcefc`; implementation committed as `6453923b5b3ba4c6b6593518673f8fdac8cc7dd5`; final metadata-only correction `c503cdcb83f110283863f2b21854051fe3034331`. Review used source reads, diffs and local hash/JSON comparison only. Reviewer ran no tests, HTTP/PG/model processes, network, credential readers, permits or claims, and made no repository changes.

## Findings and closure

1. The overly broad exact-time diagnostic has been corrected. `core-conversation-assessment.mjs:191` now requires matching receipt/envelope widget IDs, TIME_SLOT_SELECTOR, own tenant, booking.availability.read provenance, exact review copy, one flat displayed slot, fixture-bound instant/window and timezone, and nonempty opaque slot/staff refs. The probe supplies the current fixture start/tenant. Negative controls cover unrelated kind, wrong instant/day/tenant/capability/timezone, generic selection copy, multiple slots and mismatched widget IDs. This verifies the returned projection; it does not independently verify a seal or decode staff/branch authority.
2. Preparation now truthfully declares one logical budget cap and two ledger files: broker provider cap plus runner mirror. It does not claim one physical ledger or two independent spending authorizations.
3. An unsuccessful or failed live `/finish` now overrides successful diagnostic status with failed-broker-cleanup. `liveBrokerCleanupRequiresBrokerReport` remains true: acknowledgement alone is not proof of termination. The union runner also rejects a remaining owned PG pidfile and source drift.
4. Final metadata explicitly says HTTP non-201/UNKNOWN stops the whole batch. It distinguishes no chat retry/resume from existing bounded internal model-stage retries charged within the same 36-attempt cap. The two-file final delta changes only these descriptions and the exact dataset hash; cases and runtime behavior are unchanged.

## Supported observations

- The dataset is exactly ordered unchanged A then B: 9 distinct dialogues, 18 user turns. Final raw SHA256 is `2832b5837a1b01a4d0fe6e58f8c8811f318a7402ab2e7052ebb8a8a6f7b9c4ca`; ordered JSON cases SHA256 remains `269fdb3331f2fa66b063a1e5c2be2922280f365101ca9cda1e0fa5056abce7e8`. Existing A/B pins and limits remain unchanged.
- The union uses the existing kernel: 36 attempts, USD6 retained reservations, 30 minutes, concurrency1, 6-second interval, 30-second request timeout, 98,304 request bytes and 2,048 output tokens. Fresh exact source/manifest/profile/limits/pricing admission and an exclusive claim remain required. Preparation flags remain false; old A/B permits do not match. Live custom clocks/waits remain forbidden.
- The broker usage witness recomputes the same immutable serialized request reservation without adding or refunding budget. `core-conversation-broker.mjs:423,503` validates complete actual usage before optional bookkeeping and before `candidate-broker-server.mjs:148` writes provider bytes to the app. Missing/inconsistent/over-reservation usage, unfinished or non-200 responses latch refusal and queue termination; callback failure cannot clear the latch. Transport uncertainty still stops through the existing gate/server path.
- `replay.mjs:113` records the actual valid reply before assessment. A safe semantic failure records finite failed check IDs, skips only remaining dependent turns in that case, closes it, then starts the next case with empty history and no prior conversation ID. Invalid assessment, transport/response uncertainty, journal failure and cleanup failure stop the batch. Returned replay results enumerate all nine cases and eighteen turn statuses, including unexecuted work after STOP. Preflight/initialization failure before replay is incomplete, not full traversal.
- B fixture handling is keyed by the exact six B case IDs, not the entire profile. Role, source, private-history and observed business-effect assertions remain hard failures. Dry failure injection requires dry union mode and is rejected for live/recorded modes before execution. No review metadata/gold reply is introduced into model input.
- `summarizeCoreUnionReport` binds the report to profile, manifest SHA and source commit and verifies finite coverage. Semantic failure remains exit2/completed-with-semantic-failures rather than passed-ungraded. General ADMIN zero-model or repeated owner clarification becomes a finite semantic failure when otherwise safe, not fabricated model coverage.

## Limits

Known development cases are not held-out language evidence. Several turns remain semantically ungraded; passing the finite checks is not complete correctness. Private-refusal phrase matching and follow-up non-repetition are narrow observations, with separate hard source/privacy/effect guards.

No actual union HTTP/dry run was executed by this review. Source-bound execution, cleanup counters, ledger correspondence and observed usage require their own artifacts. No current React, restart, real CRM write or full business-write census is established here. Existing model-stage retries remain within the shared attempt ceiling; the batch does not retry chat or resume STOP.

## Hash binding

All **19** hashes/sizes in `/private/tmp/maya-union-agent-files-20261009.json` matched their exact Git blobs at implementation commit6453923b. Seventeen remain byte-identical in final candidatec503cdcb; the two intentional metadata changes were independently reviewed and match current Git blobs. Snapshot SHA256: `66a62359882b329d590c55de5ef60c100acc94c89a7c6ef2024cc83eecf2d156`.

Final metadata and additional root-owned reviewed file hashes:

- `maya-saas-backend/datasets/conversation-intelligence/core-union-20261009.json`: `2832b5837a1b01a4d0fe6e58f8c8811f318a7402ab2e7052ebb8a8a6f7b9c4ca`.
- `maya-saas-backend/scripts/conversation-qualification/core-conversation-admission.test.mjs`: `e2f02f9c33559dd4408036c7af22bdc4cd4f7c006dc424de03257ec481927df7`.
- `maya-saas-backend/scripts/conversation-qualification/core-conversation-broker-usage.test.mjs`: `69172ceb41ec29519e1c346aa7f4fabfa706cd9d3c9a44744243811903692a16`.
- `maya-saas-backend/scripts/conversation-qualification/core-conversation-broker.mjs`: `06432422e90e801da828fe5cc67eedff79909d07763815f1b5104bc9e2b4e21a`.
- `maya-saas-backend/scripts/conversation-qualification/core-conversation-profile.mjs`: `35b0b7c14a6f0e5ed583e9ac734e6c2aba8da1900c5aa7beb6e57bca43a51654`.
- `maya-saas-backend/scripts/conversation-qualification/core-local-prepare.mjs`: `d36566da848012cdb0ea9503be5969d4b99569ff8e20f1890540a5f267d74147`.

## Follow-up — finite Jest transformer correction (2026-10-09T08:28:37.009559+00:00)

Qualified no blocker in the one-line test-harness correction after c503cdcb. The closed anchored module-name alternative adds only `core-conversation-assessment.mjs` under the existing `scripts/conversation-qualification/` path. Existing rejection of unlisted modules and transpile options are unchanged. This enables loading the already-reviewed pure assessment helper; it adds no runtime, transport, permission or scoring authority.

Root reported that the first actual dry attempt failed during module loading before any tests (0 tests), with owned resources stopped and source unchanged. This follow-up did not independently inspect those complete attempt artifacts and does not relabel that failure or claim HTTP qualification. The locally read `transform-check.log` reports that the actual helper transforms and an unrelated module remains refused; the reviewer did not execute that check or any services/tests. A fresh source-bound dry result remains necessary.

Reviewed transformer SHA256: `761081db5d78d926ce2c5448a0e8dfc1d98d90f429cdc8eb4584457ca73b43ef`. Transform-check log SHA256: `1d39adfd05823e033da6a4f0eb177e9f6591691c667bb90528b311e7bb075bdb`. Original review prefix is preserved byte-for-byte with SHA256 `5d680397346ab9da7c08d10c7fb1bdb87a7065932bce37c0b036fe102d6c4d44`.

## Evidence follow-up — actual dry HTTP (2026-10-09T08:35:58.360581+00:00)

Disposition: **qualified evidence-consistency PASS for the labelled synthetic failure-continuation mechanism**. The actual terminal run status remains `completed-with-semantic-failures`, semanticStatus `fail`; it must not be advertised as language PASS or eighteen executed HTTP turns. Root reports process exit2, consistent with the inspected runner's exit mapping; the JSON report/launch capture records the terminal status rather than a numeric process-exit field.

Candidate: `e7703c77db47349e77291db616803a8ba6583262`. Raw root: `/private/tmp/maya-union-dry-20261009-r2`. Candidate-manifest SHA256: `989eef5ff1f95f1d7c48f02037f0ad73a41cf225640e61de3e3034795daf19dc`.

Observed and independently cross-checked:

- All nine cases have outcomes. There are **17 actual HTTP201 responses**, one labelled `synthetic_dry_assertion_failure` on first-client turn1, and exactly one skipped dependent first-client turn2. All18 planned turns are accounted for: unresolved0, unexecuted0, semanticPasses0, semanticFailures1, semanticUngraded16. The other eight cases continue. Each of nine cases has a distinct stable conversation hash; every continued request's prior assistant history equals that case's actual prior replies. No invented replacement reply was introduced.
- Jest reports **1 test/1 suite passed**: this is the harness assertion that the labelled failure-continuation scenario behaved as designed. It is not an independent seventeen-case semantic PASS. The preserved loader attempt remains failed with **0 tests/1 failed suite**, bound to c503cdcb.
- Seventeen canned serializer/broker outputs and seventeen exact application/broker request tuples match. Maximum serialized body is94,190 bytes, below98,304. Both ledgers end `closed` with identical counters: dialogs9, turns17, attempts17, reserved input1,450,298/output20,400 and1,995,177,360 nanoUSD. This is offline reservation bookkeeping, not actual usage or spend. The dry path explicitly does not validate real provider usage.
- Broker reports upstreamCalls0, credentialsLoadedfalse, paidAuthorizedfalse and no rejections. Provider qualification says finite synthetic/current local sources, realCrmNetworkCalls0. All17 per-turn business snapshots are unchanged and recorded businessWrites arrays empty; forbidden is empty. These observations do not imply no fixture/setup/history/audit writes or a complete business-write census.
- Both archived source maps were independently verified against exact Git blobs: **2471 at c503cdcb** and **2471 at e7703c77**. The latter2471 also match current source files. The two manifest byte hashes match source-bindings.json. **23 dry-http files** are byte-identical to same-name raw-root files. Additional launch captures are separately byte-identical to `/tmp/maya-conversation-batch-20261009/dry-r2-launch.log` and `dry-launch.log`; they are not falsely attributed to inside the run root.
- Final runner records all six owned groups closed/absent, brokerClosed, clusterStopped, postmasterPidAbsent and sourcesUnchanged; broker records stopped with SIGTERM and zero active requests/connections. Root's archived OS cleanup observation reports both attempts' broker PIDs and all groups absent. Read-only filesystem checks confirm both PG pidfiles absent. Reviewer did not rerun process inspection or start/stop any resource.

This execution proves local authenticated HTTP traversal, source-bound canned transport, real local PG fixture mechanics, actual reply carry and synthetic semantic-failure continuation. It does **not** exercise the skipped exact17:00 turn, prove real-model language/owner acceptance, run live usage/accounting, use credentials, grant a fresh paid permit, exercise current React or restart, or qualify real CRM writes.

Detailed independent verification: `/tmp/maya-conversation-batch-20261009/independent-dry-evidence.json`, SHA256 `319441871895abfd33ed2b1b14969fe74960846dcd90a3c9ebba998d80635295`. Existing review prefix remains byte-identical (prior SHA256 `ddb81699c4f1169ad621d64e3af89f3615eec0bbd24d914ab4c666acaad82340`). No repository files were changed by this review.
