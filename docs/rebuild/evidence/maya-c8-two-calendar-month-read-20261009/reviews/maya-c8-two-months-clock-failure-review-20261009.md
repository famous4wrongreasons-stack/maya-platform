# Independent R1 clock-failure diagnosis

**R1 remains FAIL/incomplete**, source `602c9e257504abded8767297151e615808959fbf`. Exact hashes of the original logs, manifest and eight relevant committed source files are bound in the adjacent JSON.

The failed PostgreSQL row contains UTC `admittedAt=19:01:53.470`, `startedAt=19:01:53.473`, and `settledAt=19:01:53.452`; PostgreSQL logged the error at `19:01:53.454`. The existing CHECK failed because settlement precedes admission by **18 ms**. Settlement also precedes start by **21 ms**.

C9 reserve, awaited claim and settlement each receive a fresh database `clock_timestamp()` from `C9Store.transaction`. The UTC wrapper changes session timezone only. Settlement uses that transaction clock, not the selection’s earlier `asOf`. The affected probe does not inject a clock. The C8 delta did not change these timestamp assignments.

The supported inference is a non-monotonic wall-clock observation in this run. **The particular host/NTP mechanism is not proven.** Later nondecreasing OS samples cannot establish the historical cause, and the failed run must not be relabeled as accepted behavior.

A single fresh isolated repeat of identical source is a reasonable additional observation. Preserve R1, its failed assertion and raw logs. If inversion repeats, stop and diagnose; do not clamp time, rewrite the constraint, add broad retries or reuse the failed receipt. R2 is separate and ungraded here.

The manifest reports unchanged source and stopped owned PG; the raw PG log records shutdown. Prepare recorded the two supplemental positives with replay and the day60 mismatch case before the failure. The complete prepare/restart/resume proof did not pass. No tests, services or network were run by this reviewer.
