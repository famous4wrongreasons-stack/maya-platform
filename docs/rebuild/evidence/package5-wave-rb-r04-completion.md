# Wave R-B — R04 / B42 local acceptance

R04 local implementation and package proof: **PASS**. Production status: **coordinated wave pending**. Scope is exactly B42 from the closed master inventory; R02 current-principal dependency is production PASS. No inventory expansion or new business/schema decision.

| Contract | Result |
| --- | --- |
| Canonical owner | Existing A23 OperationalWorkItem; current canonical User/Membership; A29/A31 read boundary |
| Existing foundation sufficient | YES |
| Business decision / schema / migration / backfill required | NO / NO / NO / NO |
| New models / fields / action classes | 0 / 0 / 0 |
| Runtime-only / dependencies satisfied | YES / YES |

## Resulting behavior

Authenticated task HTTP entry delegates supported create/complete commands to the existing planner, ingress and Action Engine. Creation uses the exact active tenant assignee; completion resolves the existing actor-owned Inbox binding to the canonical work item. Numeric legacy task IDs, changed request under the same identity, foreign/revoked assignees and unsupported transitions fail closed. Reads expose only the current canonical assignee's work and never admit work or project delivery.

The Python panel is a fixed canonical HTTP initiator: it forwards the existing Maya session and explicit idempotency identity, without local task SQL, provider writes, queues or a generated retry key. Native/model autonomy, mutable journal commands, generic jobs and scheduled control assignment are retired. Command-center and briefing reads no longer evaluate or mutate the journal. Historical data is retained; it is not current work authority. Explicit analytical cache refresh behavior outside B42 is preserved.

PWA task controls use the existing authenticated canonical surface and exact current user. No raw canonical ID input, role-to-assignee guess or new authentication mechanism is introduced. Stable transport identities include API/namespace, canonical User, operation and logical identity, excluding the business body: concurrent tabs and reinitialization retain the same key, while changed intent reaches the canonical conflict check. Three historical aliases lacking canonical authentication remain fail closed; the task-free tenant-test alias is unchanged.

Actual PostgreSQL proof exposed a null `configJson` parsing defect in the existing A23 retry path. Parsing now occurs only for action branches that require configuration. A committed create/complete outcome also survives a later Inbox projection exception: its receipt remains confirmed with `projectionPending`, preventing a fabricated failed/recreated business outcome. B49/R06 delivery ownership is not claimed remediated.

## Permanent prevention and proof

The runtime guard scans the supplied runtime source set for journal writers without a blanket legacy directory exemption. It fences retired native/model/scheduler/panel branches and the pure refusal helper's call closure. Negative mutants include a new alternate writer, restored journal write, read-time evaluation, scheduled effect, missing authority, delegated provider effect and reintroduced model tool. The existing mandatory backend architecture suite runs this proof and the PWA identity proof.

| Proof | Result |
| --- | --- |
| Targeted backend, actual Nest auth/current-session/tenant/role gates, A23/R02/domain regressions | 9 suites / 113 tests PASS |
| Native actual-source contract and mutation guard | 10 tests PASS canonical; 10 PASS composed-v3 |
| Existing owner analytics regressions | 28 tests PASS |
| Retired model tools through existing authorization | 6 selected RBAC tests PASS; network blocked |
| Actual local PostgreSQL A23 controller/planner/engine/store/executor | 29 checks PASS |
| Six exact PWA aliases; identity races and all inline scripts | 26 checks PASS; 146 scripts parse |

The PostgreSQL proof uses only the explicitly authorized disposable `maya_rb_r04` database. Four concurrent identical requests converge to one execution/outcome; concurrent changed intent yields one acceptance and one rejection. It verifies tenant/assignee denials, exact completion, pure reads and post-commit projection errors. Its retry test reconstructs the controller/service/engine **within the same process** against durable rows; it does not claim a distinct OS-process restart. Inbox projection is synthetic and provider writes are zero.

Exact commands, tested source hashes, log hashes, known proof limitations and alias fingerprints are in `package5-wave-rb-r04-local-proof.json`. Full wave lint, both typechecks, build, schema preflight and mandatory backend aggregate remain the coordinated wave owner's checks; this report does not predeclare them PASS. Only the six selected R04 cases are claimed for the legacy RBAC module; an exploratory broader run had a missing dependency fixture and unrelated legacy role expectations.

## Publication and ownership

`package5-wave-rb-r04-overlay.py` and `package5-wave-rb-r04-pwa-overlay.cjs` apply bounded function/body changes to the exact R-A production captures. They preserve the active Python launcher, unrelated runtime and B36 exclusion. The parent composes the final R03/R04/R07 candidate and performs structural verification and cutover.

`package5-wave-rb-r04-file-manifest.json` is the exact commit ownership list. For `database.py` and `webhook_server.py`, stage the R04-only blobs listed in `package5-wave-rb-r04-hunk-ownership.json`; retain composed working files. The R07 renewal marker refusal and retention-job-specific refusal dispatch are separate R07 hunks. R03 schedule changes are already committed at `ab807264`; remaining Claude runtime/test changes are R04.

`R04 LOCAL ACCEPTANCE: PASS`

`R04 PRODUCTION: COORDINATED WAVE PENDING`

`RUNTIME/TEST SOURCE: FROZEN`

`PRODUCTION MUTATIONS/MESSAGES: 0`

`MAIN DIRTY ENTRIES TOUCHED: 0`

`OLD DATABASES TOUCHED: 0`

`PROCESS HYGIENE: 0`

`PACKAGE 5 COMPLETE: NO`

`CHAPTER 6 COMPLETE: NO`
