# Platform bootstrap and personal-entry regression checkpoint

Tested source: `b747a90c9304b285e11d093e473be0dea983f2e2`.
Branch: `codex/maya-local-crm-setup-20261010`.
This evidence commit follows the tested source without changing its code.

| Executed check | Result |
| --- | --- |
| Entire unfiltered backend Jest suite | 9,912 PASS, 0 FAIL, 0 SKIP; 729 suites |
| New bootstrap unit tests | 20 PASS (also included above) |
| Bootstrap HTTP + PostgreSQL + compiled command | 7 PASS |
| Existing offline/compiled AR-1 operator checks | 39 PASS |
| Types, scoped lint, runtime artifact build | PASS |
| Fresh migration replay | PASS on owned disposable databases only |
| Owned test PostgreSQL shutdown + port check | PASS |

`RESULT.json` separates proved behavior, actual read-only server counts, remaining
release duties and zero live effects. `LOCAL-ARTIFACTS.json` preserves hashes,
sizes and paths of raw receipts, including failed/cancelled attempts. The archived
runner is the exact local command program used; its absolute workspace path is
historical provenance, not a portable public release runner.

The initial full regression found two issues: the new planning guidance exceeded
the existing request-size budget in two cases, and the R01 integration census
omitted six already-owned companion modules. Commits `8c7a047e` and `b747a90c`
correct those issues. The request ceiling, complete history and authority fields
remain mandatory; the exact artifact census now names the existing modules and
their source commits. No carrier/runtime product sources changed in this unit.

Earlier bootstrap proof attempts found errors in the tests themselves (an empty
Jest parameter row interpreted as a callback, and a nonexistent test status
`inactive` instead of canonical `suspended`). They are retained as failed
diagnostics; the final proof ran on a clean committed source. An early full-suite
attempt was explicitly cancelled to restore the complete CI fixture environment;
its owned cluster stopped. Neither is counted as a passed receipt.

Actual server inspection used `SET TRANSACTION READ ONLY`: no platform operator
rows of any status, no other global account and no prior initialization audit.
It emitted counts only. No account or session was inserted on that server.

This is **not** full release certification, GitHub CI, real-model acceptance or
phone acceptance. No certificate or production execution authorization was
issued. The test server still requires actual platform credentials, operator
trust/signature, qualified release/update/grant and bounded booking admission.
No Telegram rebinding is needed. See the
[first-operator procedure](../../MAYA-FIRST-PLATFORM-OPERATOR-20261015.md).
