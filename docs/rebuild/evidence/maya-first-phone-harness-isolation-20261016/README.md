# First-phone certification: test database isolation

Date: 2026-10-16. Parent candidate: `4846bdbac11309455fb775353da85e016eeb0b8a`.
Profile: `closed-input.no-handoff.no-price-goods@1`. Certification remains NOT ISSUED.

## Observed failure and cause

The complete mutation attempt stopped with 7/69 jobs passed and two mismatches:
`gate6#M17b` and `gate6#M18b`. Their unmutated baselines were green. Both pending
mutants failed the unrelated exact-slug search assertion in
`local-owner-telegram.live-spec.ts`. The pending declarations are unchanged;
these unrelated failures were never credited as mutation kills.

Read-only examination of the stopped synthetic clusters found 105 and 63 active
Telegram fixture tenants, plus 90 and 54 active Schedule conversation fixture
tenants. Neither suite retired its retained tenants. Public search currently
bounds its pre-filter candidate pool to 100. Thus repetition changed the input
population and eventually hid the current test tenant from the search.

The unchanged product/test on the parent candidate passed on a clean DB, failed
with an empty search result after 100 older synthetic candidates were inserted,
and passed after only those seeded candidates were retired. That is a causal
counterfactual, not a timeout increase or a waived assertion. The first diagnostic
collector stopped because its expected Jest text format was incorrect; its raw
failure remains under `reproduction/`. The corrected collector's three scenarios
are archived here under `reproduction-v2`.

A fast repetition also exposed the shared localhost password-login preflight
bucket: after 50 attempts it correctly returned 429. The initial fix-only run and
its six 429 failures remain in `fix-proof/`. The suite now uses the already existing,
proof-database-guarded loopback preflight reset **between independent cases**,
alongside its existing OAuth resets. It does not reset inside an attempt or
concurrency proof. Product rate limits are unchanged.

## Narrow repair

Only two live-test files change. They track their own synthetic tenant IDs and
retire them to `cancelled` on completion, retaining identity, booking, and audit
history. No global deletion, schema change, source policy change, search limit
change, broad data cleanup, timing increase, or assertion removal is made.
Independent rereads require all owned tenant rows to remain present and retired.
HTTP/database cleanup runs in `finally` even if assertions fail.

## Executed verification

- Live-test typecheck and scoped lint: PASS.
- Telegram suite alone: five successive runs, 105 passed tests, 105 retained
  cancelled fixture tenants, no active leak.
- Both suites on the same isolated DB using the mutation runner's Jest worker
  settings: five successive runs, 185 passed tests; 105 Telegram and 90 Schedule
  fixture tenants retained and cancelled. The unrelated active sentinel remained
  active and untouched.
- Removing Telegram retirement: the independent final reread refuses the suite.
- Removing Schedule retirement: the independent final reread refuses the suite.
- All traffic is synthetic/loopback; all owned diagnosis databases are stopped.

Exact receipt hashes and local raw-report paths are in `RECEIPTS.json`. Preparation
runs are repair evidence only. A new committed SHA must run the complete fresh
programme; no completed part from the failed 4846bdba attempt substitutes.

## Explicit limits

The observed certification failures are fixture-lifecycle failures. This repair
makes **no** claim that public search works beyond its existing first-100 candidate
bound. That product limit remains unchanged and must be assessed for multi-tenant
scale validation; these local first-phone proofs do not certify that scale.

No certificate, release authorization, deploy, real tenant grant, owner/production
migration, provider/model request, OTP, real booking, or iPhone installation occurs.
