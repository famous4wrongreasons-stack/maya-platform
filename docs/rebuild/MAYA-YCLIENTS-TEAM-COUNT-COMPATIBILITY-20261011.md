# YCLIENTS staff total-count compatibility — 2026-10-11

Subsequent real attempt at `2f55da13` proved **missing**, not a numeric-string total. This historical checkpoint is retained; the exact management collection exception is documented in [the next compatibility unit](MAYA-YCLIENTS-TEAM-COLLECTION-COMPATIBILITY-20261011.md).

Base: `cce0cb46f0592ce87e8a49208aac99e21196b08b`, same local CRM branch and retained owner database. This is not real connection acceptance or certification.

## Established failure and uncertainty

The explicit owner retry returned successful company/service/category/company-profile reads, then management staff HTTP 200 refused with exactly `teamIssues: [total_count_type]`. Other finite team checks passed. Connect returned `crm_connection_failed`; status read was `NOT_OBSERVED`. The exact retained database contains zero integrations and zero A17 executions. The stopped session and keys are preserved; trace did not reach its limit.

This proves that `meta.total_count` was not a JavaScript safe integer. It does **not** distinguish an absent field from a string, null or another value. Raw values were deliberately not retained. The old attempt is not retroactively claimed to contain a numeric string.

## Minimum compatibility change

The local read guard accepts an integer or its exact nonnegative decimal string representation. This addresses the proven synthetic compatibility defect: a complete team with `total_count: "2"` was rejected while the identical team with `total_count: 2` passed. The provider's actual encoding remains to be observed in the next explicit attempt.

No trimming, signs, leading zeros, exponent/hex/fraction notation, booleans, null, arrays, objects, unsafe integers or inferred count. Total must still equal the received team length, at most 50. Pagination, contradictory count/page, unknown metadata, duplicate/invalid staff IDs and foreign company remain refused. No fallback to `book_staff`, widening query, new endpoint, authority or persistence change. Original response bytes are returned unchanged to the existing adapter.

The same closed trace also records only a finite count-encoding label: number, decimal_string, missing, null, invalid_number, invalid_string or other. This applies on success or refusal, so the next observation distinguishes format compatibility from missing completeness evidence without exposing any count value or provider/customer data. Unknown fields/labels are refused by the IPC projector.

## Executed proof

Local read/launcher/transport/HTTP-code/IPC/resume: **79 PASS / 0 FAIL**. The six new regression tests run against the original committed implementation produce **4 FAIL / 2 PASS**. The direct decimal-string acceptance regression fails before and passes after. Both unchanged negative tests remain green.

All sizes 0–50 are checked as number and decimal string; response bytes are preserved. The actual native adapter's company/service/staff/team setup methods pass through the guarded synthetic transport for both representations. Refusal matrices cover wrong totals, malformed encodings, unsafe integers, missing/null count including empty data, pagination, mismatching optional fields, duplicates, foreign company and oversize. Closed encoding survives launcher receipt serialization.

[Sanitized evidence and private receipt hashes](evidence/maya-team-count-compatibility-20261011/summary.json).

## Next step and limits

Commit source, verify a fresh same-database network-closed startup, then prepare the existing hidden-input launcher. Owner explicitly supplies partner token in Terminal and user token in the existing operation's form. Do not auto-resubmit or activate/import. If total count is absent or contradictory, this change still refuses; do not infer completeness merely to obtain success.

Real connection/save is unproven. No source changes while the owner session runs. No production, migrations, OTP, YCLIENTS business writes or customer/appointment reads. Prior publication rejection remains respected; no push attempt. Earlier unrelated broader backend/runtime test failures remain open and are not waived by this narrow proof.
