# Qualified local gate evidence

Read `summary.json` for independent stage results, `source-binding.json` for final committed HEAD and changed tracked paths against 3febab17, and `previous-gates.json` for the preserved historical inventory. Raw metadata reports retain exact input bytes. Jest projections contain counts and per-suite/test status; test names are hashed and error/console payloads are absent. Raw logs/Jest/launchers are referenced only by SHA-256 and bytes. Private logs, receipts, environment files and PG data are not opened.

The exact targeted-source-change note qualifies the first fixes stage/Jest as DIAGNOSTIC_ONLY_SOURCE_CHANGED_DURING_RUN regardless of raw counts; original report bytes and reported status are retained.

There is no combined test total. An earlier PASS is qualified to its own source, not the final candidate. Missing stages remain NOT_RUN. Actual historical schema-diff FAIL remains unresolved. This bundle is neither release certification nor real-model/provider/language acceptance.

The copied builder defaults to describe-only. It reads exact /tmp inputs and uses read-only Git metadata. Rebuild after a clean source freeze into another new /tmp directory; input hashes and output checksums make differing executions detectable.
