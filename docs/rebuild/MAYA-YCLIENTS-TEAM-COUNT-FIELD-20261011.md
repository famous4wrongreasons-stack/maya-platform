# YCLIENTS exact management collection with matching `meta.count` — 2026-10-11

Base: `1a385e363fc450e5dfe8b31a203340c7f473c60d`, same existing local CRM branch and owner database.

## Exact real refusal

The closed witness from the explicit owner attempt proves: exact management request, v2 Accept, exact final URL, HTTP 200, no redirect or pagination header; outer keys are exactly success/data/meta; metadata contains **only count**; every row explicitly has company_id. The only team issue is `total_count_type`, encoding missing. No other metadata, ID, duplicate, size, company, page or count consistency check failed.

Because the executed diagnostic compares `meta.count !== data.length` without coercion, absence of count_mismatch proves that this observed count is the exact numeric array length. Raw count/rows/IDs remain unretained. Therefore the remaining refusing condition is the prior requirement that management-collection metadata be empty. Earlier numeric-string and empty-metadata compatibility did not fix this actual shape; those historical failures remain preserved.

Status-first read: original operation NOT_OBSERVED. Exact retained owner DB read-only query: **0 integrations / 0 A17 executions**. No activation/import. The exact owned launcher was stopped before edits; source/private-state/cleanup checks passed.

## Minimum correction

For the existing source-bound whole management collection only, allow either empty metadata or an object with exactly one own `count` key whose value is a safe integer equal to the received array length. This is a consistency witness on the already admitted unfiltered collection, **not** an independently supplied total. No count is synthesized and no count is renamed into total_count.

All other conditions remain: exact server-resolved company route and v2 Accept, HTTP 200 without redirect/final-URL substitution, bounded complete transport, exactly success/data/meta, success true, unique valid staff IDs, maximum 50, explicit exact company per row, no pagination headers or other metadata. Count with page (even 1), unknown keys, null/boolean/string/fraction/unsafe/mismatching count remains refused. Explicit total continues its prior independent validation. Standalone, legacy and bookable-subset paths gain no admission. Original bytes go unchanged to the canonical adapter; A17/current actor/confirmation/CAS/authority and database contracts are untouched.

The [prior primary-contract interpretation](MAYA-YCLIENTS-TEAM-COLLECTION-COMPATIBILITY-20261011.md) is unchanged: completeness relies on the unfiltered management list contract, not an observed independent total. The [closed witness](evidence/maya-team-count-field-20261011/summary.json) now proves the actual response shape without publishing provider PII.

## Executable evidence

**151 PASS / 0 FAIL.** All sizes 0–50 preserve original wire bytes with empty metadata or matching count. The actual native adapter passes setup methods for integer total, decimal-string total, empty metadata and matching count. Source/tenant/company/pagination/duplicate/oversize/mismatch/type refusals remain.

The fresh 48-test corpus runs against both the original pre-collection source and exact immediate predecessor. The immediate predecessor fails the count-only regression; corrected and restored source pass. **Eight mutations detected**, adding removal of count equality to the seven existing guards. Eighteen historical admission vectors, with normal and throwing observers, change only the intended matching-count variant. Diagnostics remain privacy-safe.

Run `node scripts/local-yclients-read-team-collection-proof.mjs` in the backend. [Receipts, hashes and exact results](evidence/maya-team-count-field-20261011/summary.json).

## Pending real acceptance

Fresh committed-source network-closed startup and then one explicit owner save are still required at this source checkpoint. Do not claim the real connection saved based on synthetic proofs. Preserve the original operation ID and status-first handling; no automatic resubmission/activation/import. No production, migration, new keys/business, real OTP, YCLIENTS writes, website, iPhone or push retry. Existing unrelated broader test failures are not waived.
