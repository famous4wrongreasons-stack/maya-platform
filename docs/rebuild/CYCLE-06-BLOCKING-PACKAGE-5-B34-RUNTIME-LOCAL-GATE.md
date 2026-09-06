# Package 5 B34 — approved Option A runtime retirement / local gate

Approved decision checkpoint: `7a2cc296`. B29–B33 remain accepted.
[Exact review contract](CYCLE-06-BLOCKING-PACKAGE-5-B34-REVIEW-AUTHORITY-CONTRACT-DECISION.md).

## Final implementation

Both published legacy review import/refresh endpoints return a fixed 410
`LEGACY_REVIEW_SOURCE_RETIRED` without reading credentials, payload or state.
Importer, public sync/fetch, snapshot refresh and SQLite writer are retired at
their module boundaries as well. The monitor has no loop/work and its startup
registration is removed. Review notification is retired, with no chat, Telegram,
push or canonical inbox fallback. Neither review content nor technical metadata
is updated. Historical SQLite rows are neither deleted nor read/promoted as
canonical evidence; lazy provisioning/ALTER of that retired table is removed.

The optional reputation projection explicitly returns unavailable, no rating,
no canonical authority. Owner summaries support absence of this optional source.
Pure parsers/analysis used by market observations remain intact. No mandatory
business consumer requiring a new authority contract was found. No maps-card
→ tenant heuristic, bridge secret expansion or replacement lineage is introduced.

Canonical Maya review controller, service, AC4 owner and Prisma schema are
unchanged. Existing tenant/provider/external-id acceptance and changed-evidence
conflict semantics remain. No new model, field, action class, schema migration or
historical backfill. AC4 does not fabricate ActionExecution/provider operations.

## Permanent ratchets and executable proof

The existing deployment guard now invokes the B34 active Python source guard:
route bindings, fixed retired function bodies, fallback/alias references,
review SQL, metadata writes, later jobs and nested source modules are scanned.
Production deployment archives are not active source roots; active imports,
path additions or execution of those archives fail the guard. Existing archived
files are untouched. Backend AST guard restricts review creation to AC4 `accept`
and rejects update/upsert, delegate escape/alias, nested writes and raw review SQL.

[Owned PostgreSQL proof](evidence/package5-b34-review-authority.proof.json) uses
actual controller/DTO/role guard/current membership/tenant context/AC4 owner and
real encrypted persistence. Principals are synthetic; it is a composed proof,
not a JWT network HTTP smoke. First acceptance, identical replay, changed
text/rating/time/branch/staff, invalid DTO metadata, wrong/revoked membership,
wrong role/context and foreign branch are checked. Twelve concurrent identical
requests produce one fact; divergent concurrent requests yield one accepted
fact and one conflict. Separate provider/tenant namespaces remain separate.
A new Node process retries the original identity. Every original persisted
field, including encrypted text and timestamps, stays unchanged.

Python tests execute actual retired handler/module/database function bodies,
with forbidden input/state access, unchanged owned historical SQLite fixture,
24 concurrent divergent attempts, two fresh processes and synthetic restoration
ratchets. Ten tests PASS and canonical PG facts remain identical before/after
these attempts. Legacy canonical mutations 0, ActionExecutions 0, provider calls
0, fake integration bindings 0. No old test DB was opened.

## Local gates

Targeted 3 suites / 18 tests PASS; review/booking 51 / 439 PASS; architecture
80 / 438 PASS. Lint, both typechecks, build, Prisma validation, clean replay of
81 existing migrations, status and schema diff PASS. No schema diff/migration.
Full mandatory backend **376 suites / 3078 tests PASS** on final source.
An intermediate repeated Node 24.19 process exited with SIGSEGV (-11), without
a Jest verdict; that run is not PASS and no production change followed it.
The full mandatory run was repeated after the guard's production-archive
boundary and exact scanner-file exemption were clarified; no failed mandatory check is waived.

Additional existing owner/market consumer regressions: 33 PASS. Initial runs
could not load local requests/config; a disposable venv plus explicit synthetic
config/storage fixture resolved setup. Outbound I/O and settings writes are
forbidden. Ten B34/pure-parser Python tests also PASS on the final guard.
[Local evidence](evidence/package5-b34-local-checks.json).

## Reviewed production cutover inputs

Fresh read-only active-source inspection matched repository baseline for
database, reputation and control-plane guard; launcher is production-specific.
Three target webhook functions match baseline. Its active review notifier is an
older direct chat/Telegram/push variant; it is reviewed and fully retired within
the same approved review-source scope. No unrelated notifier is changed.

Five Python artifacts are prepared. Webhook uses four narrow function overlays
and one removed monitor registration; production-only launcher code is preserved.
[Exact manifest](evidence/package5-b34-python-overlay-manifest.json),
[webhook overlay](evidence/package5-b34-webhook.patch). Candidate B34 guard on
the active root with these overrides PASS. Ten executable tests also pass on
the exact candidate file bodies, including fresh-process replay. The first
overlay-only harness lacked its test module in the child working directory;
copying that fixture locally resolved setup. Test files are not deployed. No runtime module was imported and
no review/business endpoint was invoked during that production inspection.

Commit/push → existing backend deployment → reviewed Python overlay/restart →
structural/read-only verification. Production review/provider/business proof
mutations must stay 0. Historical review fingerprint may be read without
returning row contents. After production PASS, restart the full Package 5 Final
Gate across all 13 families; a new B35+ means evidence/report/remainder and STOP.

```text
B34 LOCAL RETIREMENT / CANONICAL AC4 REGRESSION: PASS
B34 PRODUCTION DEPLOYMENT: NOT STARTED AT THIS CHECKPOINT
NEW MODELS / FIELDS / ACTION CLASSES: 0 / 0 / 0
MIGRATION / BACKFILL: 0 / 0
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B34 — production verification pending
PRODUCTION REVIEW / PROVIDER MUTATIONS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO — 24 recorded entries/hashes preserved
PRE-EXISTING DATABASES TOUCHED: 0 — 17 protected
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Owned proof PostgreSQL/venv remain only until this cycle's final verification;
they must be cleaned before the final report. This local gate is not Package 5
completion or a fresh all-family Final Gate PASS.
