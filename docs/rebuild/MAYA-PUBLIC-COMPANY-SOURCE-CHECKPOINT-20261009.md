# Explicit branch public profile — development checkpoint

Code: `f8327626979e09696c8d93e8573d72667eb2ae85`, on isolated `codex/maya-offline48-semantics-20261009`, following `56a0777f56f99e01d11ea34be421f4f1911d6ed2`.

**An explicit branch name/address request now reads the public profile of the currently bound CRM company.** It no longer silently answers that request with tenant-wide branding. **838 tests / 11 suites, scoped and production TypeScript, final changed-file ESLint and independent source review PASS.** This is component qualification, not new HTTP/PG, provider or model acceptance. [Raw evidence and exact source hashes](evidence/maya-public-company-source-20261009/checkpoint.json).

Subsequent actual runtime qualification: [HTTP/auth/C9 + owned PostgreSQL restart](MAYA-PUBLIC-COMPANY-HTTP-CHECKPOINT-20261009.md), source `3bb2c17e057d882ff7ccc5e73a1663d3d6e2c4a6`. Historical component-only limits below describe this earlier checkpoint.

## Behavior and authority

- The existing validated `company.public_info` task, with one explicit branch and a supported name/address field, uses the existing `catalog.staff.read` through the single C9. No public tool argument, role, registry, orchestrator or schema was added.
- Existing tenant branch resolution and the configured company→branch binding determine the source. The server-only `company_profile` projection is part of the existing immutable source scope and cache hash. An old staff/branding result cannot satisfy the new scope.
- The handler reads only company ID, title and address for this projection. CRM checks the current tenant, provider, active integration, branch/timezone revision and captured adapter/config before and after the provider read. It copies the caller witness and observed profile before awaits. Wrong company, source drift, foreign authority and revoked access do not become public facts.
- Missing title is preserved for this scoped read in both native detail and bounded discovery fallback. A generated `Филиал <id>` is not claimed as a provider title; a genuine provider title with the same text remains intact. Legacy discovery labels and unscoped callers keep their prior behavior.
- Missing requested fields yield a truthful statement about the **read profile**, with evidence and the same C9 `COMPLETED` requirement as positive facts. Cached replies, including missing fields, carry a saved-result label. Malformed/stale/unqualified data remain unavailable; known source failure does not re-ask an already supplied branch.
- Output says CRM because the existing owner supports YCLIENTS and Altegio. It does not invent phone numbers, hours or provider-specific provenance. Compound/unsupported requests receive a bounded clarification; there is no follow-up model loop or business effect.

## Executed checks

The single final Jest run used one worker and a 1536 MB heap, with finite synthetic source/transport fixtures. No HTTP server, PostgreSQL, browser, live provider or model was started for this slice.

| Coverage | Tests |
| --- | ---: |
| Existing AiCore main, journal and schedule | 367 |
| New explicit public company, actual planner validation with synthetic owners | 19 |
| Handler and runtime, including source/cache/permission controls | 209 |
| Public presentation, including missing fields and replay | 29 |
| Existing CRM service + new current-source guard | 69 |
| Existing native adapter + new detail/discovery title provenance | 145 |
| **Total** | **838 / 11 suites** |

The actual parser, owner guards and native adapter functions execute locally; their I/O is synthetic. AiCore completion regressions use a synthetic C9 seam. They do not prove actual persisted public-company runs, replay after process restart or real-language interpretation.

The earlier public slice run was **296 / 5 PASS** before the review-driven native-title, missing-field and finalization corrections. It remains archived separately and is not added to the final count. Final TypeScript checks passed. Initial lint failed with exactly four Prettier errors in two files; the formatter-only correction and final lint PASS are retained. The final two files equal Prettier applied to their tested snapshots; the other eleven tested files are byte-identical. There was no additional logic edit after the 838-test run. [Independent review](evidence/maya-public-company-source-20261009/independent-review.json) binds the final seven production hashes.

## Prior runtime evidence and unchanged remaining work

The [final journal HTTP/restart checkpoint](MAYA-EMPLOYEE-JOURNAL-HTTP-CHECKPOINT-20261009.md) and [48-dialogue / 81-turn qualification](MAYA-OFFLINE48-AFTER-JOURNAL-20261009.md) remain bound to **`4f88e8178e337d9f4d4b6740acbce1685e97a92e`**. They are not transferred to this public-profile delta. Their committed archive manifests at `56a0777f56f99e01d11ea34be421f4f1911d6ed2` were verified again: 79 journal entries and 109 full48 entries match SHA256 and byte length.

- Exact full48 score remains **54 PASS / 0 FAIL / 14 unsupported / 13 insufficient**, **remaining27**, critical 0/0. No frozen corpus, expected label, evaluator, clock or public-case fixture was changed here.
- The two original public-information scenarios remain insufficient in that corpus because their fixtures do not establish the required company→branch source. Component progress does not turn either into PASS.
- Original journal product SHA: **`84eedcb65820ebe063ca14cd5a8217e53187dcb3`**. Earlier successful schedule HTTP proof source: **`23a01139574202d8d39e9baee89c5375fdf8a7ba`**; see [schedule runtime checkpoint](MAYA-EMPLOYEE-SCHEDULE-HTTP-CHECKPOINT-20261009.md).
- Next qualification is a separately scoped actual public-company HTTP/auth/C9/PG gate, including persistence/replay/revocation/source drift. It has not been run in this checkpoint. Actual A17 activation, real YCLIENTS data and model acceptance remain unverified.
- This uses the existing one-company binding only. The pending [multi-company schema decision](MAYA-YCLIENTS-MULTI-COMPANY-SCHEMA-DELTA-20261008.md) was not bypassed. No schema, retention or background-autonomy policy was introduced.

Working website, frozen9/handoff and pricing lane were untouched. No push, merge, deployment, provider mutation or outbound notification was performed. Overall MAYA/C10 acceptance remains **NOT_ISSUED**.
