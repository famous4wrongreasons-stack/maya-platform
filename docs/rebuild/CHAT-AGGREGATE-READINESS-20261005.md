# Chat aggregate readiness — 2026-10-05

**Local checkpoint; NOT release ready.** Two new regression details were fixed without
changing any ratchet, allowlist or expected census. Remaining red assertions reproduce
on the stable base. No paid request, production write, deployment, push, merge or phone
operation occurred in this aggregate task.

- Code checkpoint: `15b88f52bf39a544ba2448970731f3c3b6d528fa`.
- Initial full-aggregate candidate: `d2168e737321a6c2708262e388ec6762483b3ea6`.
- Comparison base: `dcba8c8f4d230de31fb93f3d613f7524c3310df9`.
- Website frontend remains `d5b310e9a3dc13051eb7f5ccd1e23bf28e8884d6`.

## Executed evidence

Local Node `24.15.0`, existing pinned dependency installations, clean allowlisted
environment, no external credentials, 4 GiB Node heap ceiling, one Jest worker and
sequential heavy checks. Separate candidate/base worktrees protected the accepted
checkout from generator and mutation stages. No dependency install or shared Prisma
generation was run.

| Check | Observed result | Qualification |
|---|---|---|
| Documented `run-all-checks.sh` | 20/27 PASS on both candidate and base; exit 1 | 7 red/blocked stages listed below |
| Full unfiltered backend Jest | 5816 PASS, 17 FAIL; 599 suites, no skips | At initial candidate; all 11 failing suites replayed on base: the same 17 assertions fail |
| Full widgets HTTP/PostgreSQL | 487 PASS, 3 FAIL; 52 suites, no skips | At code checkpoint; baseline replay reproduces all three failure bodies exactly |
| Backend production/scripts types, Prisma validate, build | PASS | Production/scripts/widgets types also pass after fixes |
| Full backend lint | 22 errors, 9 warnings | Output identical to baseline after checkout path normalization |
| Headless shell check/build/typecheck/artwork | PASS | Reproducible committed manifest; K5/K6/K15 pass |
| Headless shell self-test and full suite | 428 PASS, 2 FAIL, 7 skipped | Same baseline failures; seven local-API tests explicitly say NOT a PASS |
| React carrier typecheck/build/full suite | PASS; 93/93 tests | No skips |
| Backend health e2e | PASS | Loopback HTTP |
| Event append transaction regression | PASS; 4/4 tests | Real local PostgreSQL transaction semantics, synthetic data |
| Fix validation | 9 timeline tests; 14 budget/replay/broker tests PASS | Targeted lint/types pass; wrong proof profile refuses before output creation |

The full backend and documented-runner numbers above are **not** represented as a
second full run on the final code SHA. After the two corrections, affected checks were
rerun and the full HTTP/PostgreSQL suite ran on the code checkpoint. Completed broad
checks were not repeated. The final documentation commit changes no executable code.

## New regressions corrected

1. `http-live-pilot.ts` directly granted fixture entitlements outside the certified
   proof-fixture boundary. It now delegates the unchanged tenant/Client/catalog/feature
   recipe to `Fixtures.clientConversationPilot()` in the existing fixture owner.
   Entrypoint, dedicated DB checks, no-env-files refusal, broker, budget, resume and
   closed-permit behavior remain unchanged. No production grant path was added.
2. The semantic-context byte bound introduced `JSON.stringify` in `TimelineStore`,
   which already uses a hashing helper. It now uses the existing `stableActionJson`.
   Tests admit absent context and exactly 16 KiB UTF-8 JSON, and reject one extra byte
   before any DB call. No H6 exemption was added.

Comparing only failed-test names would have missed both new details: 15/17 backend
failure messages were already identical, while grant and H6 messages included new
sites. After correction, both affected failure bodies equal baseline and K3 output
is byte-for-byte identical to baseline. Existing baseline failures remain visible.

## Baseline blockers and limits

The seven runner failures are K1 human-dossier generation, widget-contract cardinality,
K3 structural/exit gates, K4 exit, Wave 3 and Wave 4. K1 hard-codes an output path in
another worktree; the sandbox refused that write and it was never escalated. Other
red gates expose existing encryption/store boundaries, hash discipline, registry and
schema/profile contract discrepancies, the existing dry-run grant site and lint.

The full backend additionally preserves the baseline denial-map, consent/proactive,
release-profile, migration-fold and projector-fence failures. Do not update counts or
allowlists merely to make these green; reconcile them with their canonical owners.
The three HTTP failures are TURN-ATOMIC, TURN-READ and TURN-BROKEN-BINDING in
`user-turn-identity.live-spec.ts`, with the same extra assistant-row observations on base.
The two shell failures are its self-test and session-not-active refresh path.

This is not the Node 22 CI matrix, a fresh CI migration/seed run, npm audit, seeded
platform `test:http`, or the entire legacy Python/frontend matrix. Seven shell local-API
smoke tests remain skipped. Local synthetic/scripted-model/internal-calendar tests
are not real model, external CRM, browser or scale acceptance. The owned proof
PostgreSQL cluster on 127.0.0.1:55631 is stopped. The expired remote paid proof was not
restarted and its prior ledger was not reset.

## Remaining Client chat path and next bounded live proposal

Real-model semantic follow-up acceptance remains open. Finite public-name forms do
not provide general nickname/fuzzy/full-name understanding; ambiguous catalog service
aliases still require disambiguation. The carrier admits one canonical service handle;
multi-service requests clarify instead of silently dropping a service. Vague dayparts
still ask for an exact time because this path has no owner-configured daypart bounds.
Wider C9/voice/inbound and real CRM acceptance remain in the completion map.

The frozen follow-up is **NOT RUN**: six cases, four existing families, twenty user
turns; SHA256 `48de10c63c0ffc8140d035c3f65f16d00ca97ab47b12e5b9bc63f56597d23c09`.
Next prepare its offline runner adapter and matching synthetic catalog, preserving
original cases and raw captures. Proposed paid envelope: at most 30 upstream calls
including retries/repairs, an additional $4 cap within the original $20 total ceiling,
15-minute TTL and existing qualified per-call token limits. A fresh scoped permit must
carry forward prior ledger/reservations; it must not reopen/reset the expired broker.
This document does not authorize or execute that batch.

## Blockers specific to the website release

1. Real Safari/HTTPS same-origin acceptance: Origin/Cookie/Set-Cookie, no-cache,
   reload/status/reset and actual ingress/site-to-tenant/branch/consent mapping.
2. The separately scoped one-record provider acceptance: qualified company/contact/
   staff/services/time and notification policy; exact create/readback correlation;
   controlled response loss with one dispatch/one record and UNKNOWN reconciliation.
   Synthetic adapter proofs do not satisfy this. Negative/manual resolution still
   needs source-qualified evidence; uncertainty remains UNKNOWN with no redispatch.
3. Actual target backend/migration/checksum/DB-role/backup inventory, concrete release
   and rollback approval. The old production API has not received this branch.

See [website release gates](WEBSITE-GUEST-BOOKING-RELEASE-GATES.md) and
[one-record acceptance](WEBSITE-GUEST-ONE-RECORD-ACCEPTANCE.md). Phone acceptance and
real-model chat acceptance are separate broader product blockers.

## Evidence location

Workspace sibling `pilot-evidence/aggregate/` contains command logs, Jest JSON,
`summary.json`, normalized baseline comparisons, exact command/environment metadata
and `evidence-files.sha256`. The handoff archive is
`pilot-evidence/chat-aggregate-20261005.tar.gz`; its checksum and final handoff SHA are
in `pilot-evidence/chat-aggregate-checkpoint.json`. No deployment artifact was changed.
