# Chapter 7 — Wave 2: P02 finance and P05 reputation

Status: local executable proof complete; combined release gate/cutover pending. P01 remains production PASS at `20260908-c7-p01-7623cac4`. This report is not Chapter 7 completion.

## Approved scope and shared architecture

The approved P02 Q05/Q06/Q07/Q11 and P05 Q10 mapping reuse the single deployed MeasurementRevision foundation. There are no new models, physical fields, migrations, business action classes, AC6 classes or backfills. The applied P01 migration is unchanged. No new public route, launcher, provider integration or delivery effect is introduced; consumer routing remains the approved P06 scope. [Implementation manifest](evidence/chapter7-wave2/implementation-manifest.json).

Financial observations use the existing CRM read contract, P407 expenses and Package 4 value facts. Remote reads happen before publication transactions; the same claim then checks current tenant/integration/Client authority and exact prepared evidence under source locks. The shared publisher is the only derived writer. Source owners are never modified by measurement. Reputation reads run in the existing publication transaction; the accepted source-owner correction semantics remain intact.

P02 preserves currency, source/basis, raw expense category evidence, completeness and actual observation times. It does not synthesize fiscal cash, refunds, profit, salary from revenue or value from points. Period comparisons require comparable complete facts. P05 separates stored source-labelled reviews from exact canonical native feedback, retaining source, scale, denominator and deterministic rounding. Later correction/withdrawal changes the new current result; immutable historical snapshots remain unchanged. Known source capacity failures close unavailable rather than publish truncated facts or leave endless pending retries.

## Executable proof

- [P01 shared regression](evidence/chapter7-wave2/p01-regression.txt): 41 checks PASS.
- [Real source-owner correction/concurrency regression](evidence/chapter7-wave2/source-owner-regression.txt): 18 checks PASS.
- [P02 PostgreSQL proof](evidence/chapter7-wave2/p02-finance-proof.log): 9 checks PASS, including exact Client without User, changed binding during remote read, lease expiry/restart on the same revision, separate currency/raw expenses and no source effects.
- [P05 final PostgreSQL proof](evidence/chapter7-wave2/p05-reputation-proof.final.log): 9 checks PASS, including real R08 response/correction/withdrawal, 1,005 source reviews with bounded receipts, local calendar boundaries, source correction and published unavailable overflow. The earlier eight-check receipt is retained as history.
- Shared permanent owner/remote-publication/source-correction ratchets remain part of the standard mandatory Jest command. [Combined targeted tests](evidence/chapter7-wave2/combined-targeted.txt): **9 suites / 122 tests PASS**. Package details: [P02](CYCLE-07-P02-FINANCIAL-TRUTH.md), [P05](CYCLE-07-P05-REPUTATION.md).

All fixtures live in a new isolated owned PostgreSQL cluster on loopback port 55517. The 17 protected databases are untouched. Production proof business/provider/messages are zero.

## Release plan and completion boundary

Run the unchanged documented backend deployment process with the already verified local Node 22.23.2 gate runtime. It requires committed backend files and runs Prisma validation, lint, both typechecks, full mandatory regression and build before upload. Production schema is expected to have no pending migrations and no drift; Wave 2 adds zero migrations. After activation, compare compiled artifacts and all P01 constraint/index/trigger definitions, then health/readiness, using only read-only structural verification.

After both production packages PASS, progress becomes 10/22 Q requirements, 3/6 packages and 2/4 waves; P03/P04 then proceed in parallel. P06 and the one final 22/22 + 32/32 Chapter 7 gate remain outstanding. Chapter 8 is not started. No completion credit is assigned before the production receipt below.
