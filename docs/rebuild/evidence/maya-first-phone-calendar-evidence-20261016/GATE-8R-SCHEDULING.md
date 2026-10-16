# Gate 8r scheduling correction

On parent `cde265b99439996fb9fa4de687aabae182fcb54c`, the unpartitioned 29-mutant Gate 8r job started at 2026-10-16T14:28:05.301Z and ended with SIGTERM at 17:32:17.475Z under the existing three-hour coordinator budget. It produced no complete battery receipt. This is an incomplete timed-out check, not evidence of a Maya product failure or a passing mutation result. FB had independently failed at 16:53:23.589Z. The coordinator was explicitly stopped at 17:32:58Z; three other jobs were interrupted then. None of these missing receipts is waived.

The existing mutation partitioner now schedules Gate 8r as four jobs of 8/7/7/7 mutants. Every job still executes full applicable test suites and unmutated/neutraliser controls. The declared 29 mutants, edits, killers and expectations are unchanged. Timeout budgets are unchanged. The strict collector requires all four exact-HEAD receipts and rejects every single-part omission.

Executed regression: the new partition/coverage assertion fails on the previous scheduler (expected four partitions, actual one). With the existing four-way scheduler applied to Gate 8r, the full collector suite passes 61/61. This proves scheduling, exact-once declaration coverage and missing-part refusal; it does not substitute for executing the four jobs. A new final-HEAD run remains mandatory.

The complete plan now has 48 batteries, 72 jobs and 559 declarations. No runtime, authority, deployment, database schema or UI source changed.
